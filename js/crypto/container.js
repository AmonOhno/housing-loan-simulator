// 暗号化コンテナ（data/presets.enc.json、localStorage 共通形式）の生成・解析・マージ。
// DOM・Node 固有 API に依存しない。entries 以外の平文メタデータは置かない。

import { FORMAT, CONTAINER_VERSION, PresetCryptoError, validateEntry } from './presets-crypto.js';

export function emptyContainer() {
  return { format: FORMAT, version: CONTAINER_VERSION, entries: [] };
}

/**
 * 解析済みオブジェクトをコンテナとして検査する。
 * format・version 違いは例外（BAD_FORMAT）。不正なエントリは除外して警告。
 */
export function normalizeContainer(obj) {
  const warnings = [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new PresetCryptoError('BAD_FORMAT', '暗号化データの形式が正しくありません');
  }
  if (obj.format !== FORMAT || obj.version !== CONTAINER_VERSION || !Array.isArray(obj.entries)) {
    throw new PresetCryptoError('BAD_FORMAT', '暗号化データの形式が正しくありません');
  }
  const entries = [];
  const seen = new Set();
  obj.entries.forEach((e, i) => {
    const v = validateEntry(e);
    if (!v.ok) {
      warnings.push(`entries[${i}] は形式が不正のため除外しました（${v.reason}）`);
      return;
    }
    if (seen.has(e.id)) {
      warnings.push(`entries[${i}] は id が重複しているため除外しました`);
      return;
    }
    seen.add(e.id);
    entries.push(e);
  });
  return { container: { format: FORMAT, version: CONTAINER_VERSION, entries }, warnings };
}

/** JSON 文字列 → コンテナ。JSON 不正は BAD_FORMAT（元の例外メッセージは出さない） */
export function parseContainer(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new PresetCryptoError('BAD_FORMAT', '暗号化データの形式が正しくありません');
  }
  return normalizeContainer(obj);
}

export function serializeContainer(c) {
  return JSON.stringify(c, null, 2) + '\n';
}

/** 同じ id があれば置換、無ければ末尾に追加。新しいオブジェクトを返す */
export function upsertEntry(c, entry) {
  const entries = c.entries.slice();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  return { ...c, entries };
}

export function removeEntry(c, id) {
  return { ...c, entries: c.entries.filter((e) => e.id !== id) };
}

/** id で重複排除。同じ id は overlay を優先。順序は base の順 → overlay の新規 */
export function mergeContainers(base, overlay) {
  const entries = base.entries.slice();
  const index = new Map(entries.map((e, i) => [e.id, i]));
  for (const e of overlay.entries) {
    if (index.has(e.id)) entries[index.get(e.id)] = e;
    else {
      index.set(e.id, entries.length);
      entries.push(e);
    }
  }
  return { format: FORMAT, version: CONTAINER_VERSION, entries };
}
