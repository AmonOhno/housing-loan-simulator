import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/crypto/presets-crypto.js';

const PW = 'dummy-Passw0rd-for-tests';
const ITER = C.MIN_ITERATIONS; // テスト時間のため下限ちょうど
const payload = { schemaVersion: 1, updatedAt: '2026-01-01T00:00:00.000Z', sets: [{ name: 'ダミー', value: 123 }] };

// 鍵導出を共有するため、暗号化済みエントリを 1 度だけ作る
const entry1 = await C.encryptPayload(payload, PW, { iterations: ITER });
const entry2 = await C.encryptPayload(payload, PW, { iterations: ITER });

test('P1 往復で元の JSON と一致する', async () => {
  assert.deepStrictEqual(await C.decryptEntry(entry1, PW), payload);
});

test('エントリは 8 個のキーだけ（平文メタデータなし）', () => {
  assert.deepStrictEqual(Object.keys(entry1), ['id', 'kdf', 'hash', 'iterations', 'salt', 'cipher', 'iv', 'ciphertext']);
  assert.equal(entry1.iterations, ITER);
  assert.equal(C.base64ToBytes(entry1.salt).length, 16);
  assert.equal(C.base64ToBytes(entry1.iv).length, 12);
  assert.ok(!JSON.stringify(entry1).includes('ダミー'));
  assert.ok(!JSON.stringify(entry1).includes(PW));
});

test('P2 誤パスワードは DECRYPT_FAILED', async () => {
  await assert.rejects(C.decryptEntry(entry1, PW + 'x'), { code: 'DECRYPT_FAILED' });
});

test('P3 同じ内容を 2 回暗号化すると salt・iv・ciphertext・id が異なる', () => {
  for (const k of ['id', 'salt', 'iv', 'ciphertext']) assert.notEqual(entry1[k], entry2[k], k);
});

test('P4 ciphertext・iv・salt の改変は DECRYPT_FAILED', async () => {
  const flip = (b64) => {
    const u = C.base64ToBytes(b64);
    u[0] ^= 1;
    return C.bytesToBase64(u);
  };
  for (const k of ['ciphertext', 'iv', 'salt']) {
    await assert.rejects(C.decryptEntry({ ...entry1, [k]: flip(entry1[k]) }, PW), { code: 'DECRYPT_FAILED' }, k);
  }
});

test('P4 AAD 不一致は DECRYPT_FAILED', async () => {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await C.deriveKey(PW, salt, ITER);
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('other-aad'), tagLength: 128 },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const forged = {
    id: 'x', kdf: 'PBKDF2', hash: 'SHA-256', iterations: ITER, salt: C.bytesToBase64(salt),
    cipher: 'AES-GCM', iv: C.bytesToBase64(iv), ciphertext: C.bytesToBase64(new Uint8Array(ct)),
  };
  await assert.rejects(C.decryptEntry(forged, PW), { code: 'DECRYPT_FAILED' });
});

test('P5 反復回数の下限・上限（validateEntry）', () => {
  assert.deepEqual(C.validateEntry({ ...entry1, iterations: 599_999 }), { ok: false, code: 'WEAK_PARAMS', reason: 'iterations' });
  assert.equal(C.validateEntry({ ...entry1, iterations: 10_000_001 }).code, 'BAD_PARAMS');
  assert.equal(C.validateEntry({ ...entry1, iterations: 600000.5 }).code, 'BAD_PARAMS');
  assert.equal(C.validateEntry({ ...entry1, iterations: '600000' }).code, 'BAD_PARAMS');
  assert.equal(C.validateEntry({ ...entry1, iterations: ITER }).ok, true);
});

test('P5 弱いエントリは鍵導出を呼ばずに拒否する', async () => {
  const subtle = globalThis.crypto.subtle;
  let called = 0;
  const orig = subtle.importKey;
  subtle.importKey = (...a) => { called++; return orig.apply(subtle, a); };
  try {
    await assert.rejects(C.decryptEntry({ ...entry1, iterations: 1000 }, PW), { code: 'WEAK_PARAMS' });
    assert.equal(called, 0);
  } finally {
    subtle.importKey = orig;
  }
});

test('暗号化側でも反復回数の下限・上限を強制する', async () => {
  await assert.rejects(C.encryptPayload(payload, PW, { iterations: 1000 }), { code: 'WEAK_PARAMS' });
  await assert.rejects(C.encryptPayload(payload, PW, { iterations: 10_000_001 }), { code: 'BAD_PARAMS' });
  await assert.rejects(C.encryptPayload(payload, PW, { iterations: 600000.5 }), { code: 'BAD_PARAMS' });
});

test('kdf・hash・cipher・base64・長さの不正は BAD_FORMAT', async () => {
  for (const patch of [
    { kdf: 'scrypt' }, { hash: 'SHA-1' }, { cipher: 'AES-CBC' }, { id: '' },
    { salt: '!!!!' }, { salt: C.bytesToBase64(new Uint8Array(8)) },
    { iv: C.bytesToBase64(new Uint8Array(16)) }, { ciphertext: C.bytesToBase64(new Uint8Array(16)) },
    { ciphertext: 'abc' },
  ]) {
    assert.equal(C.validateEntry({ ...entry1, ...patch }).code, 'BAD_FORMAT', JSON.stringify(Object.keys(patch)));
    await assert.rejects(C.decryptEntry({ ...entry1, ...patch }, PW), { code: 'BAD_FORMAT' });
  }
  assert.equal(C.validateEntry(null).code, 'BAD_FORMAT');
});

test('空パスワードは EMPTY_PASSWORD', async () => {
  await assert.rejects(C.encryptPayload(payload, '', { iterations: ITER }), { code: 'EMPTY_PASSWORD' });
  assert.throws(() => C.encodePassword(''), { code: 'EMPTY_PASSWORD' });
});

test('NFKC: 全角英数字のパスワードで暗号化し半角で復号できる、空白は除去しない', async () => {
  const e = await C.encryptPayload(payload, 'ｄｕｍｍｙ１２３ＡＢＣ', { iterations: ITER });
  assert.deepStrictEqual(await C.decryptEntry(e, 'dummy123ABC'), payload);
  assert.notDeepEqual(C.encodePassword(' a'), C.encodePassword('a'));
});

test('id 指定で再暗号化すると id は維持され salt・iv は変わる', async () => {
  const e = await C.encryptPayload(payload, PW, { iterations: ITER, id: entry1.id });
  assert.equal(e.id, entry1.id);
  assert.notEqual(e.salt, entry1.salt);
  assert.notEqual(e.iv, entry1.iv);
});

test('復号結果が JSON でなければ BAD_PLAINTEXT（平文断片を含まない）', async () => {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await C.deriveKey(PW, salt, ITER);
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(C.AAD_TEXT), tagLength: 128 },
    key, new TextEncoder().encode('dummy-marker-123 not json'));
  const e = { id: 'y', kdf: 'PBKDF2', hash: 'SHA-256', iterations: ITER, salt: C.bytesToBase64(salt),
    cipher: 'AES-GCM', iv: C.bytesToBase64(iv), ciphertext: C.bytesToBase64(new Uint8Array(ct)) };
  await assert.rejects(C.decryptEntry(e, PW), (err) => err.code === 'BAD_PLAINTEXT' && !err.message.includes('dummy-marker'));
});

test('base64 往復と randomId', () => {
  const u = new Uint8Array(70000).map((_, i) => i % 256);
  assert.deepStrictEqual(C.base64ToBytes(C.bytesToBase64(u)), u);
  assert.match(C.randomId(), /^[A-Za-z0-9_-]{16}$/);
});

test('tryDecryptEntries: 同じパスワードの複数エントリを開き、進捗を通知する', async () => {
  const other = await C.encryptPayload({ ...payload, sets: [] }, 'dummy-Other-pass9', { iterations: ITER });
  const weak = { ...entry1, id: 'weak', iterations: 1000 };
  const progress = [];
  const r = await C.tryDecryptEntries(
    [{ entry: entry1, source: 'repo' }, { entry: other, source: 'repo' }, { entry: entry2, source: 'local' }, { entry: weak, source: 'local' }],
    PW, { onProgress: (d, t) => progress.push([d, t]) });
  assert.deepEqual(r.opened.map((o) => o.entry.id), [entry1.id, entry2.id]);
  assert.deepEqual(r.skipped.map((s) => s.code), ['DECRYPT_FAILED', 'WEAK_PARAMS']);
  assert.deepEqual(progress, [[0, 4], [1, 4], [2, 4], [3, 4]]);
});

test('tryDecryptEntries: AbortSignal で途中停止する', async () => {
  const ac = new AbortController();
  const r = await C.tryDecryptEntries(
    [{ entry: entry1, source: 'repo' }, { entry: entry2, source: 'repo' }], PW,
    { signal: ac.signal, onProgress: (d) => { if (d === 1) ac.abort(); } });
  assert.equal(r.opened.length, 1);
});

test('js/crypto は globalThis.crypto 以外を import しない', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  for (const f of await readdir(new URL('../js/crypto/', import.meta.url))) {
    const src = await readFile(new URL(`../js/crypto/${f}`, import.meta.url), 'utf8');
    assert.ok(!/from\s+['"]node:|require\(/.test(src), f);
  }
});
