#!/usr/bin/env node
// マイ設定の暗号化 CLI（オーナー用）。ブラウザと同じ js/crypto・js/model のコードを使う。
// パスワードは環境変数 PRESET_PASSWORD か標準入力の 1 行目で受け取る（引数では受け取らない）。
// 平文 JSON は標準入力から。平文はディスクにも標準出力にも書かない。

import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import {
  encryptPayload, decryptEntry, tryDecryptEntries, PresetCryptoError, messageForCode,
  DEFAULT_ITERATIONS, MIN_ITERATIONS, MAX_ITERATIONS,
} from '../js/crypto/presets-crypto.js';
import {
  emptyContainer, parseContainer, serializeContainer, upsertEntry,
} from '../js/crypto/container.js';
import { normalizePayload, validatePayloadStrict } from '../js/model/preset-schema.js';

const USAGE = `使い方: node scripts/encrypt-preset.mjs [オプション]

  （オプションなし）       平文 JSON を暗号化し、エントリ 1 件のコンテナを標準出力に出す
  --merge <path>           既存コンテナ <path> にエントリを追加して上書き保存（標準出力には概要のみ）
  --replace-id <id>        --merge と併用。指定 id のエントリを新しい暗号文で置き換える（id は維持）
  --iterations <n>         反復回数（既定 ${DEFAULT_ITERATIONS}。${MIN_ITERATIONS} 未満・${MAX_ITERATIONS} 超はエラー）
  --entry-only             標準出力にエントリ 1 件の JSON だけを出す（コンテナで包まない）
  --rekey <path>           コンテナ <path> の、旧パスワードで復号できるエントリを新パスワードで再暗号化して上書き保存
                           （id は維持。平文ファイル不要）。旧・新パスワードは PRESET_PASSWORD / PRESET_NEW_PASSWORD、
                           無ければ標準入力の 1 行目（旧）・2 行目（新）
  --check <path>           パスワードで復号できるエントリの id とセット数だけを表示（平文は表示しない）
  -h, --help               使い方

パスワード: 環境変数 PRESET_PASSWORD、無ければ標準入力の 1 行目。引数では渡せません。
平文 JSON: 標準入力（PRESET_PASSWORD 使用時は全体、そうでなければ 2 行目以降）。
終了コード: 0 成功 / 1 入力・検証・復号エラー / 2 使い方の誤り
`;

class UsageError extends Error {}
class InputError extends Error {}

function parseArgs(argv) {
  const o = { merge: null, replaceId: null, iterations: DEFAULT_ITERATIONS, entryOnly: false, check: null, rekey: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new UsageError(`${a} には値が必要です`);
      return argv[++i];
    };
    if (/^-{1,2}(p|pw|pass|passwd|password|pwd)(=|$)/i.test(a)) {
      throw new UsageError('パスワードは環境変数 PRESET_PASSWORD か標準入力で渡してください');
    }
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--merge') o.merge = next();
    else if (a === '--replace-id') o.replaceId = next();
    else if (a === '--iterations') {
      const v = next();
      if (!/^\d+$/.test(v)) throw new UsageError('--iterations は整数で指定してください');
      o.iterations = Number(v);
    } else if (a === '--entry-only') o.entryOnly = true;
    else if (a === '--check') o.check = next();
    else if (a === '--rekey') o.rekey = next();
    else throw new UsageError('未知のオプションまたは引数です（-h で使い方）');
  }
  if (o.rekey && (o.merge || o.replaceId || o.entryOnly || o.check)) throw new UsageError('--rekey は他のオプションと併用できません');
  if (o.check && (o.merge || o.replaceId || o.entryOnly)) throw new UsageError('--check は他のオプションと併用できません');
  if (o.replaceId && !o.merge) throw new UsageError('--replace-id は --merge と併用してください');
  if (o.merge && o.entryOnly) throw new UsageError('--merge と --entry-only は併用できません');
  return o;
}

async function readStdin(guide = '標準入力から読み取ります。平文 JSON を貼り付けて Ctrl-D で終了してください') {
  if (process.stdin.isTTY) process.stderr.write(`${guide}\n`);
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function splitFirstLine(text) {
  const m = /^(.*?)(\r?\n|$)/s.exec(text);
  return { first: m[1], rest: text.slice(m[0].length) };
}

function warnPassword(pw) {
  const weak = pw.length < 8 || !(/[A-Za-z]/.test(pw) && /[0-9]/.test(pw));
  if (weak) process.stderr.write('警告: パスワードは 8 文字以上で英字と数字を混ぜることを推奨します（短いパスワードは総当たりで破られます）\n');
}

async function readContainerFile(path, mustExist) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT' && !mustExist) return emptyContainer();
    throw new InputError('コンテナファイルを読めません');
  }
  const { container, warnings } = parseContainer(text);
  if (warnings.length) process.stderr.write(`警告: 形式が不正なエントリを ${warnings.length} 件無視しました\n`);
  return container;
}

/** 旧パスワードで復号できるエントリを新パスワードで再暗号化（メモリ上のみ。平文は書かない） */
async function rekey(path, iterations) {
  let oldPw = process.env.PRESET_PASSWORD;
  let newPw = process.env.PRESET_NEW_PASSWORD;
  if (!oldPw || !newPw) {
    const lines = (await readStdin('1 行目に旧パスワード、2 行目に新パスワードを入力して Ctrl-D で終了してください'))
      .split(/\r?\n/);
    oldPw = oldPw || lines[0];
    newPw = newPw || lines[1];
  }
  if (!oldPw || !newPw) throw new PresetCryptoError('EMPTY_PASSWORD', messageForCode('EMPTY_PASSWORD'));
  if (oldPw === newPw) throw new InputError('新しいパスワードが旧パスワードと同じです');
  warnPassword(newPw);
  const container = await readContainerFile(path, true);
  const items = container.entries.map((entry) => ({ entry, source: 'repo' }));
  const { opened } = await tryDecryptEntries(items, oldPw);
  if (opened.length === 0) {
    process.stdout.write('旧パスワードで復号できるエントリがありません\n');
    return 1;
  }
  let next = container;
  for (const o of opened) {
    const entry = await encryptPayload(o.payload, newPw, { iterations, id: o.entry.id });
    const back = await decryptEntry(entry, newPw);
    if (JSON.stringify(back) !== JSON.stringify(o.payload)) throw new InputError('往復検証に失敗しました');
    next = upsertEntry(next, entry);
  }
  await writeContainerAtomic(path, serializeContainer(next));
  process.stdout.write(`再暗号化しました: ${opened.map((o) => `id=${o.entry.id}`).join('、')}（${opened.length} 件）\n`);
  return 0;
}

async function writeContainerAtomic(path, text) {
  const dir = dirname(path);
  const tmp = join(dir, `.${basename(path)}.tmp-${Math.random().toString(36).slice(2)}`);
  try {
    await writeFile(tmp, text, 'utf8'); // 暗号文のコンテナのみ
    await rename(tmp, path);
  } catch {
    try { await unlink(tmp); } catch { /* 無視 */ }
    throw new InputError('コンテナファイルを書き込めません');
  }
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (opts.rekey) return rekey(opts.rekey, opts.iterations);

  // パスワードと平文の取得
  const envPw = process.env.PRESET_PASSWORD;
  let password;
  let plainText = '';
  if (envPw !== undefined && envPw !== '') {
    password = envPw;
    if (!opts.check) plainText = await readStdin();
  } else {
    const all = await readStdin(opts.check
      ? 'パスワードを 1 行入力して Enter、続けて Ctrl-D で終了してください'
      : '1 行目にパスワード、2 行目以降に平文 JSON を貼り付けて Ctrl-D で終了してください');
    const { first, rest } = splitFirstLine(all);
    password = first;
    plainText = rest;
  }
  if (!password) throw new PresetCryptoError('EMPTY_PASSWORD', messageForCode('EMPTY_PASSWORD'));

  if (opts.check) {
    const container = await readContainerFile(opts.check, true);
    const items = container.entries.map((entry) => ({ entry, source: 'repo' }));
    const { opened, skipped } = await tryDecryptEntries(items, password);
    for (const o of opened) {
      const n = Array.isArray(o.payload.sets) ? o.payload.sets.length : 0;
      process.stdout.write(`復号できたエントリ: id=${o.entry.id}（設定セット ${n} 件）\n`);
    }
    const unreadable = skipped.filter((s) => s.code !== 'DECRYPT_FAILED').length;
    if (unreadable) process.stderr.write(`警告: 読み込めないエントリが ${unreadable} 件あります（形式が不正）\n`);
    if (opened.length === 0) {
      process.stdout.write('該当するエントリがありません\n');
      return 1;
    }
    return 0;
  }

  warnPassword(password);

  // 平文 JSON の解析と検査（値は表示しない）
  if (plainText.trim() === '') throw new InputError('平文 JSON が空です');
  let parsed;
  try {
    parsed = JSON.parse(plainText);
  } catch {
    throw new InputError('平文 JSON を解析できません（形式が不正）');
  }
  plainText = '';
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !Array.isArray(parsed.sets)) {
    parsed = { sets: [parsed] }; // 単一の設定セットも受け付ける
  }
  const problems = validatePayloadStrict(parsed);
  if (problems.length) {
    process.stderr.write('入力の検査に失敗しました:\n');
    for (const p of problems.slice(0, 20)) process.stderr.write(`  - ${p}\n`);
    return 1;
  }
  const { payload } = normalizePayload(parsed);
  payload.updatedAt = new Date().toISOString();

  let container = null;
  let id;
  if (opts.merge) {
    container = await readContainerFile(opts.merge, false);
    if (opts.replaceId) {
      if (!container.entries.some((e) => e.id === opts.replaceId)) throw new InputError('指定した id のエントリがありません');
      id = opts.replaceId;
    }
  }

  const entry = await encryptPayload(payload, password, { iterations: opts.iterations, id });

  // メモリ上で復号して往復を検証
  const back = await decryptEntry(entry, password);
  if (JSON.stringify(back) !== JSON.stringify(payload)) throw new InputError('往復検証に失敗しました');

  if (opts.merge) {
    const next = upsertEntry(container, entry);
    await writeContainerAtomic(opts.merge, serializeContainer(next));
    const verb = opts.replaceId ? '置き換えました' : '追加しました';
    process.stdout.write(`エントリを${verb}: id=${entry.id}（設定セット ${payload.sets.length} 件、反復 ${entry.iterations} 回）\n`);
  } else if (opts.entryOnly) {
    process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
  } else {
    process.stdout.write(serializeContainer(upsertEntry(emptyContainer(), entry)));
  }
  return 0;
}

try {
  process.exitCode = await run();
} catch (e) {
  // スタックトレースや元のメッセージ（入力の断片を含みうる）は出さない
  if (e instanceof UsageError) {
    process.stderr.write(`使い方の誤り: ${e.message}\n`);
    process.exitCode = 2;
  } else if (e instanceof InputError) {
    process.stderr.write(`エラー: ${e.message}\n`);
    process.exitCode = 1;
  } else if (e instanceof PresetCryptoError) {
    process.stderr.write(`エラー: ${e.code} ${messageForCode(e.code)}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write('エラー: 予期しないエラーが発生しました\n');
    process.exitCode = 1;
  }
}
