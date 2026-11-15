import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/crypto/preset-store.js';
import * as C from '../js/crypto/presets-crypto.js';
import * as K from '../js/crypto/container.js';
import { normalizeSet } from '../js/model/preset-schema.js';

const PW = 'dummy-Passw0rd-for-tests';
const ITER = C.MIN_ITERATIONS;
const setOf = (name) => normalizeSet({ name }).set;
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), raw: m };
};

test('localStorage の保存・読み込み（暗号文のみ）と、使えない環境', async () => {
  const { entry } = await P.createEntry([setOf('ダミーA')], PW, { iterations: ITER });
  const st = memStorage();
  assert.equal(P.saveLocalContainer(st, K.upsertEntry(K.emptyContainer(), entry)).ok, true);
  const stored = st.raw.get(P.LOCAL_KEY);
  assert.ok(!stored.includes('ダミーA') && !stored.includes(PW));
  const r = P.loadLocalContainer(st);
  assert.equal(r.available, true);
  assert.equal(r.container.entries.length, 1);
  // 空・壊れ
  assert.equal(P.loadLocalContainer(memStorage()).container.entries.length, 0);
  st.raw.set(P.LOCAL_KEY, '{broken');
  assert.equal(P.loadLocalContainer(st).container.entries.length, 0);
  // 使えない
  const dead = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(P.loadLocalContainer(dead).available, false);
  assert.equal(P.saveLocalContainer(dead, K.emptyContainer()).ok, false);
});

test('P8 セットの追加・削除・名前変更 → 同じ id で再暗号化 → 同じパスワードで復号できる', async () => {
  const { entry, payload } = await P.createEntry([setOf('S1')], PW, { iterations: ITER });
  let p = P.addSet(payload, setOf('S2'));
  p = P.renameSet(p, 0, 'S1改');
  p = P.removeSet(p, 1);
  p = P.addSet(p, setOf('S3'));
  const re = await P.reencrypt(entry.id, p, PW, { iterations: ITER });
  assert.equal(re.id, entry.id);
  assert.notEqual(re.salt, entry.salt);
  const back = await C.decryptEntry(re, PW);
  assert.deepEqual(back.sets.map((s) => s.name), ['S1改', 'S3']);
  assert.throws(() => P.removeSet(p, 5), RangeError);
});

test('パスワード変更（再暗号化）: 新パスワードで開け、古いパスワードでは開けない', async () => {
  const { entry, payload } = await P.createEntry([setOf('S1')], PW, { iterations: ITER });
  const re = await P.reencrypt(entry.id, payload, 'dummy-NewPass456', { iterations: ITER });
  assert.equal((await C.decryptEntry(re, 'dummy-NewPass456')).sets.length, 1);
  await assert.rejects(C.decryptEntry(re, PW), { code: 'DECRYPT_FAILED' });
});

test('openAll: 同じ id は updatedAt が新しい方を採用、エクスポート形式', async () => {
  const old = await P.createEntry([setOf('旧')], PW, { iterations: ITER, now: new Date('2026-01-01T00:00:00Z') });
  const np = P.addSet(old.payload, setOf('新'), new Date('2026-06-01T00:00:00Z'));
  const localEntry = await P.reencrypt(old.entry.id, np, PW, { iterations: ITER });
  const repo = K.upsertEntry(K.emptyContainer(), old.entry);
  const local = K.upsertEntry(K.emptyContainer(), localEntry);
  const r = await P.openAll(repo, local, PW);
  assert.equal(r.opened.length, 1);
  assert.equal(r.opened[0].source, 'local');
  assert.equal(r.opened[0].payload.sets.length, 2);

  const full = K.parseContainer(P.exportContainer(repo, local, 'full')).container;
  assert.equal(full.entries.length, 1);
  assert.equal(full.entries[0].ciphertext, localEntry.ciphertext);
  const add = K.parseContainer(P.exportContainer(repo, local, 'additions')).container;
  assert.equal(add.entries.length, 1);
  // 誤パスワードは 0 件
  assert.equal((await P.openAll(repo, local, 'dummy-wrong-pass1')).opened.length, 0);
});

test('passwordWarnings', () => {
  assert.equal(P.passwordWarnings('dummy-Passw0rd-for-tests').length, 0);
  assert.ok(P.passwordWarnings('1234').length >= 2);
  assert.equal(P.passwordWarnings('abcdefghijk').length, 1);
});
