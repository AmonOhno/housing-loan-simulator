import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as C from '../js/crypto/presets-crypto.js';
import * as K from '../js/crypto/container.js';

const CLI = new URL('../scripts/encrypt-preset.mjs', import.meta.url).pathname;
const PW = 'dummy-Passw0rd-for-tests';
const MARKER = 'dummy-marker-123';

const plain = (name = 'ダミー設定', loan = 3500) => JSON.stringify({
  sets: [{ name: `${name}-${MARKER}`, note: MARKER, common: { price: 3800 }, cases: [{ label: 'A', loan }] }],
});

function run(args, { env = {}, input = '', pw = PW } = {}) {
  return new Promise((resolve) => {
    const e = { ...process.env, ...env };
    if (pw === null) delete e.PRESET_PASSWORD; else if (pw !== undefined && env.PRESET_PASSWORD === undefined) e.PRESET_PASSWORD = pw;
    const p = spawn(process.execPath, [CLI, ...args], { env: e });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, out, err }));
    p.stdin.end(input);
  });
}

const dir = await mkdtemp(join(tmpdir(), 'hls-cli-'));
test.after(() => rm(dir, { recursive: true, force: true }));

test('P10 環境変数のパスワードで暗号化し、標準出力のコンテナを復号できる', async () => {
  const r = await run([], { input: plain() });
  assert.equal(r.code, 0, r.err);
  const { container } = K.parseContainer(r.out);
  assert.equal(container.entries.length, 1);
  assert.equal(container.entries[0].iterations, C.DEFAULT_ITERATIONS);
  const back = await C.decryptEntry(container.entries[0], PW);
  assert.equal(back.sets[0].name, `ダミー設定-${MARKER}`);
  assert.equal(back.sets[0].cases[0].rate, 1); // 欠落項目は既定値で補完
  assert.ok(!r.out.includes(MARKER) && !r.err.includes(MARKER) && !r.out.includes(PW) && !r.err.includes(PW));
});

test('標準入力 1 行目のパスワードでも動く（CRLF 可）、--entry-only', async () => {
  const r = await run(['--entry-only'], { pw: null, input: `${PW}\r\n${plain()}` });
  assert.equal(r.code, 0, r.err);
  const entry = JSON.parse(r.out);
  assert.equal(entry.format, undefined);
  assert.equal((await C.decryptEntry(entry, PW)).sets.length, 1);
});

test('単一の設定セット（sets なし）も受け付ける', async () => {
  const r = await run([], { input: JSON.stringify({ name: 'x', cases: [{ loan: 3000 }] }) });
  assert.equal(r.code, 0, r.err);
});

test('--merge: 既存エントリを保持して追加、--replace-id で id 維持・暗号文が変わる、平文が残らない', async () => {
  const file = join(dir, 'presets.enc.json');
  await writeFile(file, JSON.stringify(K.emptyContainer()));
  const r1 = await run(['--merge', file], { input: plain('一') });
  assert.equal(r1.code, 0, r1.err);
  assert.ok(!r1.out.includes(MARKER) && !r1.out.includes(PW));
  const r2 = await run(['--merge', file], { pw: 'dummy-Second-pass7', input: plain('二') });
  assert.equal(r2.code, 0, r2.err);
  let c = K.parseContainer(await readFile(file, 'utf8')).container;
  assert.equal(c.entries.length, 2);
  const [e1, e2] = c.entries;
  assert.equal((await C.decryptEntry(e1, PW)).sets[0].name, `一-${MARKER}`);
  assert.equal((await C.decryptEntry(e2, 'dummy-Second-pass7')).sets[0].name, `二-${MARKER}`);

  const r3 = await run(['--merge', file, '--replace-id', e1.id], { input: plain('一改') });
  assert.equal(r3.code, 0, r3.err);
  c = K.parseContainer(await readFile(file, 'utf8')).container;
  assert.equal(c.entries.length, 2);
  assert.equal(c.entries[0].id, e1.id);
  assert.notEqual(c.entries[0].ciphertext, e1.ciphertext);
  assert.equal((await C.decryptEntry(c.entries[0], PW)).sets[0].name, `一改-${MARKER}`);
  assert.deepStrictEqual(c.entries[1], e2);

  const r4 = await run(['--merge', file, '--replace-id', 'no-such-id'], { input: plain() });
  assert.equal(r4.code, 1);

  // ディレクトリに平文・一時ファイルが残らない
  const files = await readdir(dir);
  assert.deepEqual(files, ['presets.enc.json']);
  assert.ok(!(await readFile(file, 'utf8')).includes(MARKER));
});

test('--merge: ファイルが無ければ新規作成', async () => {
  const file = join(dir, 'new.enc.json');
  const r = await run(['--merge', file], { input: plain() });
  assert.equal(r.code, 0, r.err);
  assert.equal(K.parseContainer(await readFile(file, 'utf8')).container.entries.length, 1);
});

test('--check は id とセット数だけを表示する', async () => {
  const file = join(dir, 'presets.enc.json');
  const r = await run(['--check', file]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /id=\S+（設定セット 1 件）/);
  assert.ok(!r.out.includes(MARKER) && !r.err.includes(MARKER));
  const bad = await run(['--check', file], { pw: 'dummy-wrong-pass1' });
  assert.equal(bad.code, 1);
});

test('パスワードを引数で渡すと終了コード 2', async () => {
  for (const args of [['--password', 'x'], ['--password=x'], ['-p', 'x'], ['--pass', 'x']]) {
    const r = await run(args, { input: plain() });
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, /PRESET_PASSWORD/);
  }
});

test('未知のオプション・不正な使い方は終了コード 2、--help は 0', async () => {
  assert.equal((await run(['--bogus'])).code, 2);
  assert.equal((await run(['stray-arg'])).code, 2);
  assert.equal((await run(['--replace-id', 'x'], { input: plain() })).code, 2);
  assert.equal((await run(['--iterations', 'abc'], { input: plain() })).code, 2);
  const h = await run(['-h']);
  assert.equal(h.code, 0);
  assert.match(h.out, /PRESET_PASSWORD/);
});

test('不正な JSON・検査エラーは終了コード 1 で平文の断片を出力しない', async () => {
  const r = await run([], { input: `{"name":"${MARKER}", broken` });
  assert.equal(r.code, 1);
  assert.ok(!(r.out + r.err).includes(MARKER));
  const r2 = await run([], { input: JSON.stringify({ sets: [{ name: MARKER, cases: [{ loan: MARKER }] }] }) });
  assert.equal(r2.code, 1);
  assert.ok(!(r2.out + r2.err).includes(MARKER));
  assert.match(r2.err, /loan/);
  assert.equal((await run([], { input: '' })).code, 1);
});

test('反復回数の下限未満は拒否、下限ちょうどは受理', async () => {
  const r = await run(['--iterations', '599999'], { input: plain() });
  assert.equal(r.code, 1);
  assert.match(r.err, /WEAK_PARAMS/);
  assert.ok(!(r.out + r.err).includes(MARKER));
  const ok = await run(['--iterations', '600000', '--entry-only'], { input: plain() });
  assert.equal(ok.code, 0, ok.err);
});

test('パスワード未指定（空）は終了コード 1、弱いパスワードは警告のみ', async () => {
  assert.equal((await run([], { pw: null, input: `\n${plain()}` })).code, 1);
  const weak = await run(['--entry-only'], { pw: '1234', input: plain() });
  assert.equal(weak.code, 0);
  assert.match(weak.err, /警告/);
  assert.ok(!(weak.out + weak.err).includes('1234'));
});

test('--rekey: 標準入力の旧・新パスワードで再暗号化（id 維持・旧パスワードは無効・平文が出ない）', async () => {
  const NEWPW = 'dummy-NewPassw0rd-9';
  const file = join(dir, 'rekey.enc.json');
  const made = await run(['--merge', file], { input: plain('A') });
  assert.equal(made.code, 0, made.err);
  const before = K.parseContainer(await readFile(file, 'utf8')).container.entries[0];

  const r = await run(['--rekey', file], { pw: null, input: `${PW}\n${NEWPW}\n` });
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes(MARKER) && !r.err.includes(MARKER) && !r.out.includes(NEWPW) && !r.err.includes(NEWPW));
  const after = K.parseContainer(await readFile(file, 'utf8')).container.entries[0];
  assert.equal(after.id, before.id);
  assert.notEqual(after.ciphertext, before.ciphertext);
  assert.equal((await C.decryptEntry(after, NEWPW)).sets[0].name, `A-${MARKER}`);
  await assert.rejects(() => C.decryptEntry(after, PW));
  const names = await readdir(dir);
  assert.ok(!names.some((n) => n.includes('.tmp-')));
});

test('--rekey: 旧パスワードが違うと変更せず終了コード 1、他オプションとの併用は 2', async () => {
  const file = join(dir, 'rekey2.enc.json');
  await run(['--merge', file], { input: plain('B') });
  const text = await readFile(file, 'utf8');
  const r = await run(['--rekey', file], { pw: null, input: 'wrong-dummy-pw\nanother-dummy-pw1\n' });
  assert.equal(r.code, 1);
  assert.equal(await readFile(file, 'utf8'), text);
  const u = await run(['--rekey', file, '--check', file], { pw: null, input: '' });
  assert.equal(u.code, 2);
});
