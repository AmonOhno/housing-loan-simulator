// マイ設定ダイアログ。パスワードで解錠 → 一覧 → 反映・編集・保存・エクスポート。
// パスワードと復号結果はこのモジュールの変数にだけ保持し、localStorage・URL・ログには書かない。
import { el, setChildren, nextId } from './dom.js';
import { messageForCode } from '../crypto/presets-crypto.js';
import {
  createEntry, addSet, replaceSet, renameSet, removeSet, reencrypt, openAll, exportContainer,
  passwordWarnings, upsertEntry, removeEntry,
} from '../crypto/preset-store.js';
import { setFromRawState, rawStateFromSet, normalizeSet } from '../model/preset-schema.js';
import { loadRepoContainer, loadLocalContainer, saveLocalContainer, downloadJson, copyText } from './presets-storage.js';

/**
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement} root
 * @param {{ getState: () => object, apply: (raw: object, baseCaseIndex: number) => void }} api
 */
export function createPresetsView(dialog, root, api) {
  let repo = { container: { entries: [] }, warnings: [] };
  let local = { container: { entries: [] }, available: true, warnings: [] };
  /** 解錠済みエントリ: { id, source, password, payload, dirty } */
  let unlocked = [];
  let tab = 'open'; // 'open' | 'create'
  let busy = false;
  let progress = null; // { done, total }
  let abort = null;
  const msg = { open: '', create: '', global: '', warnings: [], exportText: '', exportInfo: '' };
  let applyNote = '';
  let openPasswordKept = ''; // 入力途中の値を再描画で失わないため（解錠成功で消す）
  let repoLoading = false;
  let repoPromise = null; // 同梱 JSON の取得は 1 回だけ。成功するまで解錠は待たせる
  const createDraft = { name: '', note: '' }; // 作成フォームの再描画で失わないため（パスワードは保持しない）

  const hasCrypto = () => !!(globalThis.crypto && globalThis.crypto.subtle);

  function lock() {
    unlocked = [];
    openPasswordKept = '';
    msg.open = '';
    applyNote = '';
    render();
  }

  function ensureRepo() {
    if (!repoPromise) {
      repoLoading = true;
      repoPromise = loadRepoContainer().then((r) => {
        repo = r;
        repoLoading = false;
        if (r.error) repoPromise = null; // 失敗時は次回また取りに行く
        return r;
      });
    }
    return repoPromise;
  }

  function refreshWarnings() {
    msg.warnings = [...(repo.warnings || []), ...(local.warnings || [])];
    if (repo.error) msg.warnings.push(repo.error);
    if (!local.available) msg.warnings.push('この端末のブラウザ保存（localStorage）が使えません。作成した設定はエクスポートで保存してください。');
  }

  async function open() {
    tab = 'open';
    msg.global = '';
    local = loadLocalContainer();
    const p = ensureRepo();
    render();
    if (!dialog.open) dialog.showModal();
    await p;
    local = loadLocalContainer();
    refreshWarnings();
    render();
  }

  function close() {
    if (unlocked.some((u) => u.dirty) && !window.confirm('保存していない変更があります。破棄して閉じますか？')) return;
    lock();
    if (dialog.open) dialog.close();
  }

  function setBusy(v) { busy = v; render(); }

  // ---- 解錠 ----
  async function doUnlock(password) {
    if (!password) { msg.open = 'パスワードを入力してください。'; render(); return; }
    if (!hasCrypto()) { msg.open = 'この環境では暗号機能が使えません（HTTPS で開いてください）。'; render(); return; }
    if (repoLoading) { openPasswordKept = password; render(); await ensureRepo(); } // 同梱分を取得してから試す
    abort = new AbortController();
    progress = { done: 0, total: repo.container.entries.length + local.container.entries.length };
    msg.open = '';
    setBusy(true);
    try {
      const { opened, skipped } = await openAll(repo.container, local.container, password, {
        signal: abort.signal,
        onProgress: (done, total) => { progress = { done, total }; render(); },
      });
      if (opened.length === 0) {
        msg.open = abort.signal.aborted ? '中止しました。' : '該当する設定が見つかりません。';
      } else {
        for (const o of opened) {
          unlocked = unlocked.filter((u) => u.id !== o.entry.id);
          unlocked.push({ id: o.entry.id, source: o.source, password, payload: o.payload, dirty: false });
        }
        openPasswordKept = '';
        msg.open = '';
      }
      const broken = skipped.filter((s) => s.code !== 'DECRYPT_FAILED').length;
      msg.global = broken > 0 ? `読み込めないエントリが ${broken} 件あります（形式が不正です）。` : '';
    } catch (e) {
      msg.open = messageForCode(e && e.code);
    } finally {
      progress = null;
      abort = null;
      setBusy(false);
    }
  }

  // ---- 保存（この端末） ----
  async function saveEntry(u, newPassword = null) {
    if (u.source === 'repo' && local.container.entries.some((e) => e.id === u.id)
      && !window.confirm('この端末には、同じ設定の保存済みの版（別のパスワードや新しい内容の可能性があります）があります。今開いている同梱の版で上書きしますか？')) return;
    setBusy(true);
    try {
      const password = newPassword ?? u.password;
      if (u.payload.sets.length === 0) {
        if (!window.confirm('設定セットが 0 件です。このエントリを削除しますか？')) return;
        if (u.source === 'repo' && !local.container.entries.some((e) => e.id === u.id)) {
          msg.global = '同梱のエントリはブラウザからは削除できません。リポジトリ側で削除してください。';
          return;
        }
        local = { ...local, container: removeEntry(local.container, u.id) };
        const r = saveLocalContainer(local.container);
        if (!r.ok) { msg.global = r.message; return; }
        unlocked = unlocked.filter((x) => x.id !== u.id);
        msg.global = '削除しました。';
        return;
      }
      const payload = { ...u.payload, updatedAt: new Date().toISOString() };
      const entry = await reencrypt(u.id, payload, password);
      const next = upsertEntry(local.container, entry);
      const r = saveLocalContainer(next);
      if (!r.ok) { msg.global = r.message; return; }
      local = { ...local, container: next };
      u.payload = payload;
      u.password = password;
      u.dirty = false;
      u.source = 'local';
      msg.global = newPassword ? 'パスワードを変更して、この端末に保存しました。' : 'この端末に保存しました。';
    } catch (e) {
      msg.global = messageForCode(e && e.code);
    } finally {
      setBusy(false);
    }
  }

  async function createNew(name, note, pw1, pw2) {
    msg.create = '';
    if (!hasCrypto()) { msg.create = 'この環境では暗号機能が使えません（HTTPS で開いてください）。'; render(); return; }
    const st = api.getState();
    createDraft.name = name; createDraft.note = note;
    if (inputHasError()) { msg.create = '入力欄にエラーがあるため作成できません。先に入力を直してください。'; render(); return; }
    if (!name.trim()) { msg.create = '設定セットの名前を入力してください。'; render(); return; }
    if (!pw1) { msg.create = 'パスワードを入力してください。'; render(); return; }
    if (pw1 !== pw2) { msg.create = '確認用パスワードが一致しません。'; render(); return; }
    setBusy(true);
    try {
      const set = setFromRawState({ raw: st.raw, baseCaseIndex: st.baseCaseIndex }, { name: name.trim(), note: note.trim() });
      const { entry, payload } = await createEntry([set], pw1);
      const next = upsertEntry(local.container, entry);
      const r = saveLocalContainer(next);
      if (r.ok) {
        local = { ...local, container: next };
        msg.create = 'この端末に保存しました。「開く」タブに追加されています。';
      } else {
        msg.create = `${r.message}（メモリ上には読み込み済みです。エクスポートで保存してください）`;
        local = { ...local, container: next }; // エクスポート対象に含める
      }
      unlocked.push({ id: entry.id, source: 'local', password: pw1, payload, dirty: !r.ok });
      createDraft.name = ''; createDraft.note = '';
      tab = 'open';
      msg.global = r.ok ? 'この端末に保存しました。' : msg.create;
    } catch (e) {
      msg.create = messageForCode(e && e.code);
    } finally {
      setBusy(false);
    }
  }

  function applySet(set) {
    const { set: norm, warnings } = normalizeSet(set);
    const raw = rawStateFromSet(norm);
    const base = raw.baseCaseIndex;
    delete raw.baseCaseIndex;
    api.apply(raw, base);
    applyNote = `「${norm.name}」を入力欄に反映しました（ケース ${norm.cases.length} 件）。${warnings.length ? `読み込み時の補正が ${warnings.length} 件ありました。` : ''}`;
    render();
  }

  function inputHasError() {
    const st = api.getState();
    return st.caseHasError.some(Boolean)
      || Object.keys(st.errors.common).length > 0 || Object.keys(st.errors.deduction).length > 0;
  }

  /** 入力エラーがあれば null（理由を表示済み）。エラーのある値を既定値で補って保存しない */
  function currentSet(meta) {
    if (inputHasError()) {
      msg.open = '入力欄にエラーがあるため、現在の入力を保存できません。先に入力を直してください。';
      render();
      return null;
    }
    const st = api.getState();
    return setFromRawState({ raw: st.raw, baseCaseIndex: st.baseCaseIndex }, meta);
  }

  async function doExport(mode, how) {
    const text = exportContainer(repo.container, local.container, mode);
    msg.exportText = text;
    const label = mode === 'full' ? '全体形式' : '追加分のみ';
    if (how === 'download') {
      downloadJson(mode === 'full' ? 'presets.enc.json' : 'presets-additions.enc.json', text);
      msg.exportInfo = `${label}をダウンロードしました。`;
    } else {
      const ok = await copyText(text);
      msg.exportInfo = ok ? `${label}をコピーしました。` : `${label}: 自動コピーできませんでした。下の欄から手動でコピーしてください。`;
    }
    render();
  }

  // ---- 描画 ----
  function pwInput(id, label, value, autocomplete = 'off') {
    return el('div', { class: 'field' }, [
      el('label', { for: id, text: label }),
      el('input', { id, type: 'password', autocomplete, autocapitalize: 'off', spellcheck: 'false', value: value || '' }),
    ]);
  }
  const val = (id) => (document.getElementById(id) ? document.getElementById(id).value : '');

  function renderOpenTab() {
    const nodes = [];
    nodes.push(el('p', { class: 'hint', text: 'パスワードを入力すると、そのパスワードで復号できる設定が読み込まれます（同梱分と、この端末に保存した分）。パスワードの正否は復号できるかどうかだけで判定します。' }));
    const pwId = 'pw-open';
    const form = el('form', { class: 'pw-form', autocomplete: 'off' }, [
      pwInput(pwId, 'パスワード', openPasswordKept, 'off'),
      el('button', { type: 'submit', class: 'btn btn-primary', text: repoLoading ? '読み込み中…' : '開く', disabled: busy || repoLoading }),
    ]);
    form.querySelector('input').addEventListener('input', (e) => { openPasswordKept = e.target.value; });
    form.addEventListener('submit', (e) => { e.preventDefault(); openPasswordKept = val(pwId); doUnlock(val(pwId)); });
    if (repoLoading) nodes.push(el('p', { class: 'hint', role: 'status', text: '同梱の設定ファイルを読み込み中です…（読み込み後に「開く」を押すと、同梱分も試します）' }));
    nodes.push(form);
    if (busy && progress) {
      nodes.push(el('div', { class: 'busy', role: 'status' }, [
        el('p', { text: `設定を確認しています（${Math.min(progress.done + 1, progress.total)} / ${progress.total} 件目）… この処理には数秒かかることがあります` }),
        el('progress', { max: String(progress.total || 1), value: String(progress.done) }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: '中止', onClick: () => abort && abort.abort() }),
      ]));
    } else if (busy) {
      nodes.push(el('p', { class: 'busy', role: 'status', text: '処理中です… この処理には数秒かかることがあります' }));
    }
    if (msg.open) nodes.push(el('p', { class: 'error', role: 'alert', text: `⚠ ${msg.open}` }));
    if (applyNote) nodes.push(el('p', { class: 'notice', role: 'status', text: `✓ ${applyNote}` }));
    unlocked.forEach((u) => nodes.push(renderEntry(u)));
    if (unlocked.length > 0) {
      nodes.push(el('button', { type: 'button', class: 'btn btn-secondary', text: 'ロック（パスワードと復号結果を破棄）', onClick: () => lock() }));
    }
    return nodes;
  }

  function renderEntry(u) {
    const sets = u.payload.sets.map((s, idx) => el('li', { class: 'preset-set' }, [
      el('div', { class: 'preset-head' }, [
        el('strong', { text: s.name }),
        el('span', { class: 'sub', text: ` ケース ${s.cases.length} 件` }),
      ]),
      s.note ? el('p', { class: 'hint', text: s.note }) : null,
      el('div', { class: 'btn-row' }, [
        el('button', { type: 'button', class: 'btn btn-primary', text: '反映', disabled: busy, onClick: () => applySet(s) }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: '現在の入力で上書き', disabled: busy, onClick: () => {
          if (!window.confirm(`「${s.name}」を現在の入力内容で上書きしますか？`)) return;
          const ns = currentSet({ name: s.name, note: s.note });
          if (!ns) return;
          u.payload = replaceSet(u.payload, idx, ns); u.dirty = true; msg.open = ''; render();
        } }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: '名前変更', disabled: busy, onClick: () => {
          const n = window.prompt('新しい名前', s.name);
          if (n && n.trim()) { u.payload = renameSet(u.payload, idx, n.trim()); u.dirty = true; render(); }
        } }),
        el('button', { type: 'button', class: 'btn btn-danger', text: '削除', disabled: busy, onClick: () => {
          if (!window.confirm(`「${s.name}」を削除しますか？`)) return;
          u.payload = removeSet(u.payload, idx); u.dirty = true; render();
        } }),
      ]),
    ]));
    const nameId = nextId('pn');
    const newPw1 = nextId('pw');
    const newPw2 = nextId('pw');
    const pwMsgId = nextId('pm');
    return el('section', { class: 'preset-entry' }, [
      el('h3', { text: `設定（${u.source === 'repo' ? '同梱' : 'この端末'}）${u.dirty ? ' ※未保存の変更あり' : ''}` }),
      sets.length ? el('ul', { class: 'preset-list' }, sets) : el('p', { class: 'hint', text: '設定セットはありません。' }),
      el('div', { class: 'field' }, [
        el('label', { for: nameId, text: '現在の入力を新しいセットとして追加（名前）' }),
        el('input', { id: nameId, type: 'text', autocomplete: 'off', maxlength: '60' }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: '追加', disabled: busy, onClick: () => {
          const n = val(nameId).trim();
          if (!n) { window.alert('名前を入力してください。'); return; }
          const ns = currentSet({ name: n, note: '' });
          if (!ns) return;
          u.payload = addSet(u.payload, ns); u.dirty = true; msg.open = ''; render();
        } }),
      ]),
      el('div', { class: 'btn-row' }, [
        el('button', { type: 'button', class: 'btn btn-primary', text: '保存（この端末）', disabled: busy || !u.dirty, onClick: () => saveEntry(u) }),
        u.source === 'local' ? el('button', { type: 'button', class: 'btn btn-danger', text: 'この端末から削除', disabled: busy, onClick: () => {
          if (!window.confirm('この端末に保存された暗号化データを削除しますか？')) return;
          local = { ...local, container: removeEntry(local.container, u.id) };
          const r = saveLocalContainer(local.container);
          msg.global = r.ok ? '削除しました。' : r.message;
          unlocked = unlocked.filter((x) => x.id !== u.id);
          render();
        } }) : el('p', { class: 'hint', text: '同梱のエントリはブラウザからは削除できません。リポジトリ側で削除してください。' }),
      ]),
      el('details', { class: 'sub-details' }, [
        el('summary', { text: 'パスワード変更（再暗号化）' }),
        el('div', { class: 'fields' }, [
          pwInput(newPw1, '新しいパスワード', '', 'new-password'),
          pwInput(newPw2, '新しいパスワード（確認）', '', 'new-password'),
          el('p', { class: 'error', id: pwMsgId }),
          el('button', { type: 'button', class: 'btn btn-secondary', text: 'パスワードを変更して保存', disabled: busy, onClick: () => {
            const a = val(newPw1);
            const b = val(newPw2);
            const out = document.getElementById(pwMsgId);
            if (!a) { out.textContent = '⚠ 新しいパスワードを入力してください。'; return; }
            if (a !== b) { out.textContent = '⚠ 確認用パスワードが一致しません。'; return; }
            const w = passwordWarnings(a);
            if (w.length && !window.confirm(`弱いパスワードです（${w.join('、')}）。このまま変更しますか？`)) return;
            saveEntry(u, a);
          } }),
          el('p', { class: 'hint', text: '同梱のエントリの場合、全端末に反映するにはエクスポートして data/presets.enc.json を更新してください。古い暗号文は git 履歴に残り、古いパスワードで復号できます。' }),
        ]),
      ]),
    ]);
  }

  function renderCreateTab() {
    const ids = { name: 'cr-name', note: 'cr-note', p1: 'cr-p1', p2: 'cr-p2' };
    const warnId = 'cr-warn';
    const warnNode = el('p', { class: 'notice', id: warnId, 'aria-live': 'polite' });
    const p1 = pwInput(ids.p1, '新しいパスワード', '', 'new-password');
    p1.querySelector('input').addEventListener('input', (e) => {
      const v = e.target.value;
      warnNode.textContent = v ? (passwordWarnings(v).length ? `⚠ 弱いパスワードです: ${passwordWarnings(v).join('、')}。4 桁の数字などは総当たりで容易に破られます。` : '') : '';
    });
    const form = el('form', { class: 'pw-form', autocomplete: 'off' }, [
      el('p', { class: 'hint', text: '現在の入力内容（共通項目と全ケース）を、新しいパスワードで暗号化して保存します。' }),
      el('div', { class: 'field' }, [el('label', { for: ids.name, text: '設定セットの名前' }), el('input', { id: ids.name, type: 'text', autocomplete: 'off', maxlength: '60', value: createDraft.name })]),
      el('div', { class: 'field' }, [el('label', { for: ids.note, text: 'メモ（任意）' }), el('input', { id: ids.note, type: 'text', autocomplete: 'off', maxlength: '200', value: createDraft.note })]),
      p1, warnNode,
      pwInput(ids.p2, '新しいパスワード（確認）', '', 'new-password'),
      el('button', { type: 'submit', class: 'btn btn-primary', text: '暗号化してこの端末に保存', disabled: busy }),
    ]);
    form.addEventListener('submit', (e) => { e.preventDefault(); createNew(val(ids.name), val(ids.note), val(ids.p1), val(ids.p2)); });
    const nodes = [form];
    if (busy) nodes.push(el('p', { class: 'busy', role: 'status', text: '暗号化しています… この処理には数秒かかることがあります' }));
    if (msg.create) nodes.push(el('p', { class: msg.create.startsWith('この端末に保存しました') ? 'notice' : 'error', role: 'status', text: msg.create }));
    return nodes;
  }

  function renderExport() {
    const total = repo.container.entries.length + local.container.entries.length;
    const nodes = [
      el('h3', { text: 'エクスポート（暗号化したまま）' }),
      el('p', { class: 'hint', text: `全体形式は、同梱 ${repo.container.entries.length} 件とこの端末の ${local.container.entries.length} 件を統合した data/presets.enc.json の置き換え用です。リポジトリにコミットすると全端末で使えます。` }),
      el('div', { class: 'btn-row' }, [
        el('button', { type: 'button', class: 'btn btn-secondary', text: '全体形式をダウンロード', disabled: total === 0, onClick: () => doExport('full', 'download') }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: '全体形式をコピー', disabled: total === 0, onClick: () => doExport('full', 'copy') }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: '追加分のみダウンロード', disabled: local.container.entries.length === 0, onClick: () => doExport('additions', 'download') }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: '追加分のみコピー', disabled: local.container.entries.length === 0, onClick: () => doExport('additions', 'copy') }),
      ]),
    ];
    if (msg.exportInfo) nodes.push(el('p', { class: 'notice', role: 'status', text: `✓ ${msg.exportInfo}` }));
    if (msg.exportText) nodes.push(el('textarea', { id: 'export-text', readonly: true, rows: '6', 'aria-label': 'エクスポートした暗号化 JSON', value: msg.exportText }));
    return nodes;
  }

  function render() {
    const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'マイ設定' }, [
      el('button', { type: 'button', role: 'tab', class: 'tab', id: 'ptab-open', 'aria-selected': String(tab === 'open'), text: '開く', onClick: () => { tab = 'open'; render(); } }),
      el('button', { type: 'button', role: 'tab', class: 'tab', id: 'ptab-create', 'aria-selected': String(tab === 'create'), text: '新規作成', onClick: () => { tab = 'create'; render(); } }),
    ]);
    const nodes = [
      el('div', { class: 'dialog-head' }, [
        el('h2', { id: 'presets-title', text: 'マイ設定' }),
        el('button', { type: 'button', class: 'btn btn-secondary', text: '閉じる', onClick: close }),
      ]),
      el('div', { class: 'info-box security' }, [
        el('p', { text: '設定はパスワードで暗号化されます。公開リポジトリの暗号文は誰でも入手でき、オフラインで総当たりを試せます。4 桁の数字など短いパスワードは容易に破られます。8 文字以上の英数字混在（できれば長いパスフレーズ）を推奨します。パスワードを忘れても復元できません。' }),
      ]),
    ];
    if (!hasCrypto()) nodes.push(el('p', { class: 'error', text: '⚠ この環境では暗号機能が使えません（HTTPS で開いてください）。' }));
    msg.warnings.forEach((w) => nodes.push(el('p', { class: 'notice', text: `ℹ ${w}` })));
    if (msg.global) nodes.push(el('p', { class: 'notice', role: 'status', text: `ℹ ${msg.global}` }));
    nodes.push(tabs);
    nodes.push(el('div', { class: 'tab-body', role: 'tabpanel' }, tab === 'open' ? renderOpenTab() : renderCreateTab()));
    nodes.push(el('div', { class: 'tab-body' }, renderExport()));
    setChildren(root, nodes);
  }

  dialog.addEventListener('cancel', (e) => {
    if (unlocked.some((u) => u.dirty) && !window.confirm('保存していない変更があります。破棄して閉じますか？')) e.preventDefault();
    else lock();
  });
  // bfcache への退避・復帰で復号済みの内容やパスワード欄を残さない
  const lockAndClose = () => {
    unlocked = [];
    openPasswordKept = '';
    msg.open = '';
    applyNote = '';
    createDraft.name = ''; createDraft.note = '';
    render();
    if (dialog.open) dialog.close();
  };
  window.addEventListener('pagehide', lockAndClose);
  window.addEventListener('pageshow', (e) => { if (e.persisted) lockAndClose(); });

  return { open, close };
}
