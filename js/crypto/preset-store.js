// マイ設定のデータ層（UI 非依存のロジック）。
// localStorage の読み書き（storage は注入）、エントリの新規作成・セット編集・再暗号化・
// パスワード変更、同梱＋端末のエントリの統合、エクスポート。
// パスワードと平文は呼び出し側がメモリ上でだけ保持する。ここでは保存・ログ出力をしない。

import { encryptPayload, tryDecryptEntries, decryptEntry } from './presets-crypto.js';
import {
  emptyContainer, normalizeContainer, serializeContainer, upsertEntry, removeEntry, mergeContainers,
} from './container.js';
import { createPayload, normalizePayload } from '../model/preset-schema.js';

export const LOCAL_KEY = 'hls.presets.v1';

/** localStorage（または同じインターフェースの物）からコンテナを読む。使えない・壊れている場合も例外を投げない */
export function loadLocalContainer(storage) {
  try {
    const text = storage.getItem(LOCAL_KEY);
    if (text === null || text === undefined) return { container: emptyContainer(), available: true, warnings: [] };
    const obj = JSON.parse(text);
    const r = normalizeContainer(obj);
    return { container: r.container, available: true, warnings: r.warnings };
  } catch {
    let available = true;
    try { storage.getItem(LOCAL_KEY); } catch { available = false; }
    return {
      container: emptyContainer(),
      available,
      warnings: available ? ['この端末に保存された設定の形式が不正なため読み込めませんでした'] : [],
    };
  }
}

/** コンテナを localStorage に保存する */
export function saveLocalContainer(storage, container) {
  try {
    storage.setItem(LOCAL_KEY, serializeContainer(container));
    return { ok: true };
  } catch {
    return { ok: false, message: 'この端末には保存できません。エクスポートを使ってください' };
  }
}

/** 弱いパスワードの警告文（空配列なら問題なし）。作成自体は妨げない */
export function passwordWarnings(pw) {
  const w = [];
  if (typeof pw !== 'string' || pw.length < 8) w.push('8 文字以上にしてください');
  const hasLetter = /[A-Za-z]/.test(pw || '');
  const hasDigit = /[0-9]/.test(pw || '');
  if (!(hasLetter && hasDigit)) w.push('英字と数字を混ぜてください');
  return w;
}

/** 新しいパスワードで新規エントリを作る。{ entry, payload } */
export async function createEntry(sets, password, opts = {}) {
  const payload = createPayload(sets, opts.now);
  const entry = await encryptPayload(payload, password, { iterations: opts.iterations });
  return { entry, payload };
}

/** 平文ペイロードのセット編集（新しい payload を返す。updatedAt は更新） */
export function addSet(payload, set, now = new Date()) {
  return createPayload([...payload.sets, set], now);
}
export function replaceSet(payload, index, set, now = new Date()) {
  const sets = payload.sets.slice();
  if (index < 0 || index >= sets.length) throw new RangeError('index');
  sets[index] = set;
  return createPayload(sets, now);
}
export function renameSet(payload, index, name, note, now = new Date()) {
  const sets = payload.sets.slice();
  if (index < 0 || index >= sets.length) throw new RangeError('index');
  sets[index] = { ...sets[index], name, ...(note === undefined ? {} : { note }) };
  return createPayload(sets, now);
}
export function removeSet(payload, index, now = new Date()) {
  if (index < 0 || index >= payload.sets.length) throw new RangeError('index');
  return createPayload(payload.sets.filter((_, i) => i !== index), now);
}

/**
 * 編集後の payload を同じ id・同じ（または新しい）パスワードで再暗号化する。
 * salt・iv は毎回新規。パスワード変更は newPassword を渡す。
 */
export async function reencrypt(entryId, payload, password, opts = {}) {
  return encryptPayload(payload, password, { id: entryId, iterations: opts.iterations });
}

/**
 * 同梱＋端末のエントリを復号して統合する。
 * 同じ id が両方で開けた場合は updatedAt が新しい方を採用（同時刻は端末側）。
 * @returns {{opened: Array<{entry, source, payload}>, skipped: Array}}
 */
export async function openAll(repoContainer, localContainer, password, opts = {}) {
  const items = [
    ...repoContainer.entries.map((entry) => ({ entry, source: 'repo' })),
    ...localContainer.entries.map((entry) => ({ entry, source: 'local' })),
  ];
  const { opened, skipped } = await tryDecryptEntries(items, password, opts);
  const byId = new Map();
  for (const o of opened) {
    const norm = normalizePayload(o.payload).payload;
    const cur = byId.get(o.entry.id);
    if (!cur || Date.parse(norm.updatedAt) >= Date.parse(cur.payload.updatedAt)) {
      byId.set(o.entry.id, { entry: o.entry, source: o.source, payload: norm });
    }
  }
  return { opened: [...byId.values()], skipped };
}

/**
 * エクスポート用 JSON 文字列。
 * mode 'full': 同梱＋端末を id で重複排除（同じ id は端末側を優先）。'additions': 端末のエントリのみ。
 */
export function exportContainer(repoContainer, localContainer, mode = 'full') {
  const c = mode === 'additions' ? localContainer : mergeContainers(repoContainer, localContainer);
  return serializeContainer(c);
}

export { decryptEntry, upsertEntry, removeEntry };
