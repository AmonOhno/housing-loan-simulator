// マイ設定の保存先: 同梱 JSON の取得、localStorage、ダウンロード、クリップボード。
import { emptyContainer, parseContainer } from '../crypto/container.js';
import { loadLocalContainer as loadLocal, saveLocalContainer as saveLocal } from '../crypto/preset-store.js';

/** 同梱 data/presets.enc.json を取得。失敗しても空コンテナで動き続ける */
export async function loadRepoContainer() {
  try {
    const res = await fetch('./data/presets.enc.json', { cache: 'no-cache' });
    if (!res.ok) return { container: emptyContainer(), warnings: [], error: '同梱の設定ファイルを取得できませんでした（この端末の保存分だけで動作します）' };
    const { container, warnings } = parseContainer(await res.text());
    return { container, warnings };
  } catch {
    return { container: emptyContainer(), warnings: [], error: '同梱の設定ファイルを取得できませんでした（この端末の保存分だけで動作します）' };
  }
}

function getStorage() {
  try { return window.localStorage; } catch { return null; }
}

export function loadLocalContainer() {
  const st = getStorage();
  if (!st) return { container: emptyContainer(), available: false, warnings: [] };
  return loadLocal(st);
}

export function saveLocalContainer(c) {
  const st = getStorage();
  if (!st) return { ok: false, message: 'この端末には保存できません。エクスポートを使ってください' };
  return saveLocal(st, c);
}

export function downloadJson(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
