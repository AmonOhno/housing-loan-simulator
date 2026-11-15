// マイ設定の暗号化・復号（ブラウザと Node で共通）。
// 使うのは globalThis.crypto（Web Crypto）だけ。node:crypto など他の暗号実装は import しない。
// 方式: PBKDF2-HMAC-SHA-256 で鍵導出 → AES-GCM-256 で暗号化。
// 照合は復号（GCM 認証）の成否のみで行い、パスワードのハッシュ等は一切保存しない。
// パスワードや平文の値はエラーメッセージ・ログに出さない。

export const FORMAT = 'housing-loan-simulator/presets';
export const CONTAINER_VERSION = 1;
export const AAD_TEXT = 'housing-loan-simulator/presets/v1';
export const DEFAULT_ITERATIONS = 600_000;
export const MIN_ITERATIONS = 600_000;
export const MAX_ITERATIONS = 10_000_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const ID_BYTES = 12;

/**
 * 暗号処理のエラー。message は固定文言で、入力値の断片を含めない。
 * code: 'BAD_FORMAT' | 'BAD_PARAMS' | 'WEAK_PARAMS' | 'DECRYPT_FAILED'
 *     | 'BAD_PLAINTEXT' | 'NO_CRYPTO' | 'EMPTY_PASSWORD'
 */
export class PresetCryptoError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'PresetCryptoError';
    this.code = code;
  }
}

const MESSAGES = {
  BAD_FORMAT: '暗号化データの形式が正しくありません',
  BAD_PARAMS: '暗号化パラメータが正しくありません',
  WEAK_PARAMS: '反復回数が下限未満のため拒否しました',
  DECRYPT_FAILED: '復号できませんでした',
  BAD_PLAINTEXT: '復号結果の形式が正しくありません',
  NO_CRYPTO: 'この環境では暗号機能が使えません（HTTPS で開いてください）',
  EMPTY_PASSWORD: 'パスワードが空です',
};

function fail(code) {
  return new PresetCryptoError(code, MESSAGES[code]);
}

/** エラーコードに対応する固定文言（CLI・UI 用） */
export function messageForCode(code) {
  return MESSAGES[code] || '予期しないエラーが発生しました';
}

/** SubtleCrypto を返す。無ければ NO_CRYPTO（HTTP 配信時など） */
export function getSubtle() {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw fail('NO_CRYPTO');
  return subtle;
}

function getRandomBytes(n) {
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw fail('NO_CRYPTO');
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** 標準 base64（パディングあり） */
export function bytesToBase64(u8) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** 標準 base64 → バイト列。不正は BAD_FORMAT */
export function base64ToBytes(s) {
  if (typeof s !== 'string' || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
    throw fail('BAD_FORMAT');
  }
  let bin;
  try {
    bin = atob(s);
  } catch {
    throw fail('BAD_FORMAT');
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(u8) {
  return bytesToBase64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** エントリ id（内容やパスワードから導出しない乱数） */
export function randomId() {
  return bytesToBase64Url(getRandomBytes(ID_BYTES));
}

/** パスワードを NFKC 正規化して UTF-8 に。空は EMPTY_PASSWORD。trim しない */
export function encodePassword(pw) {
  if (typeof pw !== 'string' || pw.length === 0) throw fail('EMPTY_PASSWORD');
  return new TextEncoder().encode(pw.normalize('NFKC'));
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/**
 * エントリの形式検査。鍵導出は行わない。
 * @returns {{ok: true} | {ok: false, code: string, reason: string}}
 */
export function validateEntry(entry) {
  const bad = (code, reason) => ({ ok: false, code, reason });
  if (!isPlainObject(entry)) return bad('BAD_FORMAT', 'entry');
  if (typeof entry.id !== 'string' || entry.id.length === 0) return bad('BAD_FORMAT', 'id');
  if (entry.kdf !== 'PBKDF2') return bad('BAD_FORMAT', 'kdf');
  if (entry.hash !== 'SHA-256') return bad('BAD_FORMAT', 'hash');
  if (entry.cipher !== 'AES-GCM') return bad('BAD_FORMAT', 'cipher');
  const it = entry.iterations;
  if (!Number.isInteger(it)) return bad('BAD_PARAMS', 'iterations');
  if (it < MIN_ITERATIONS) return bad('WEAK_PARAMS', 'iterations');
  if (it > MAX_ITERATIONS) return bad('BAD_PARAMS', 'iterations');
  try {
    if (base64ToBytes(entry.salt).length !== SALT_BYTES) return bad('BAD_FORMAT', 'salt');
    if (base64ToBytes(entry.iv).length !== IV_BYTES) return bad('BAD_FORMAT', 'iv');
    if (base64ToBytes(entry.ciphertext).length <= TAG_BYTES) return bad('BAD_FORMAT', 'ciphertext');
  } catch {
    return bad('BAD_FORMAT', 'base64');
  }
  return { ok: true };
}

/** パスワードと salt から AES-GCM-256 鍵（抽出不可）を導出する */
export async function deriveKey(password, salt, iterations) {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey('raw', encodePassword(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function aadBytes() {
  return new TextEncoder().encode(AAD_TEXT);
}

/**
 * payload（JSON 化できるオブジェクト）を暗号化してエントリを返す。
 * salt・iv は毎回新規生成。opts.id を指定すると既存エントリの再暗号化として id を維持する。
 */
export async function encryptPayload(payload, password, opts = {}) {
  const iterations = opts.iterations === undefined ? DEFAULT_ITERATIONS : opts.iterations;
  if (!Number.isInteger(iterations)) throw fail('BAD_PARAMS');
  if (iterations < MIN_ITERATIONS) throw fail('WEAK_PARAMS');
  if (iterations > MAX_ITERATIONS) throw fail('BAD_PARAMS');
  if (!isPlainObject(payload)) throw fail('BAD_PLAINTEXT');
  const subtle = getSubtle();
  const salt = getRandomBytes(SALT_BYTES);
  const iv = getRandomBytes(IV_BYTES);
  const id = opts.id === undefined ? randomId() : opts.id;
  if (typeof id !== 'string' || id.length === 0) throw fail('BAD_PARAMS');
  const key = await deriveKey(password, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadBytes(), tagLength: TAG_BYTES * 8 },
    key,
    plain,
  );
  return {
    id,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    salt: bytesToBase64(salt),
    cipher: 'AES-GCM',
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  };
}

/**
 * エントリを復号して payload オブジェクトを返す。
 * パスワード誤り・改ざん・AAD 不一致はすべて DECRYPT_FAILED（区別しない）。
 */
export async function decryptEntry(entry, password) {
  const v = validateEntry(entry);
  if (!v.ok) throw fail(v.code); // 弱いパラメータは鍵導出の前に拒否
  const subtle = getSubtle();
  const salt = base64ToBytes(entry.salt);
  const iv = base64ToBytes(entry.iv);
  const data = base64ToBytes(entry.ciphertext);
  const key = await deriveKey(password, salt, entry.iterations);
  let plain;
  try {
    plain = await subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aadBytes(), tagLength: TAG_BYTES * 8 },
      key,
      data,
    );
  } catch {
    throw fail('DECRYPT_FAILED');
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(plain);
    const obj = JSON.parse(text);
    if (!isPlainObject(obj)) throw new Error('x');
    return obj;
  } catch {
    // 元のメッセージは平文の断片を含みうるので捨てる
    throw fail('BAD_PLAINTEXT');
  }
}

/**
 * 全エントリを順に復号してみる（パスワードのハッシュ照合は使わない）。
 * 1 つ成功しても残りを試す。逐次実行。
 * @param {Array<{entry: object, source: string}>} items
 * @param {string} password
 * @param {{onProgress?: (done: number, total: number) => void, signal?: AbortSignal}} [opts]
 */
export async function tryDecryptEntries(items, password, opts = {}) {
  const opened = [];
  const skipped = [];
  const total = items.length;
  for (let i = 0; i < total; i++) {
    if (opts.signal && opts.signal.aborted) break;
    if (opts.onProgress) opts.onProgress(i, total);
    await new Promise((r) => setTimeout(r, 0)); // 描画の機会を与える
    if (opts.signal && opts.signal.aborted) break;
    const { entry, source } = items[i];
    const id = entry && typeof entry.id === 'string' ? entry.id : '';
    const v = validateEntry(entry);
    if (!v.ok) {
      skipped.push({ id, source, code: v.code });
      continue;
    }
    try {
      const payload = await decryptEntry(entry, password);
      opened.push({ entry, source, payload });
    } catch (e) {
      skipped.push({ id, source, code: e instanceof PresetCryptoError ? e.code : 'DECRYPT_FAILED' });
    }
  }
  return { opened, skipped };
}
