import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as K from '../js/crypto/container.js';
import * as C from '../js/crypto/presets-crypto.js';

const mk = (id, extra = {}) => ({
  id, kdf: 'PBKDF2', hash: 'SHA-256', iterations: 600000,
  salt: C.bytesToBase64(new Uint8Array(16)), cipher: 'AES-GCM',
  iv: C.bytesToBase64(new Uint8Array(12)), ciphertext: C.bytesToBase64(new Uint8Array(20)), ...extra,
});
const wrap = (entries) => ({ format: C.FORMAT, version: 1, entries });

test('emptyContainer の形', () => {
  assert.deepStrictEqual(K.emptyContainer(), { format: 'housing-loan-simulator/presets', version: 1, entries: [] });
});

test('parseContainer: format・version 違い・JSON 不正は BAD_FORMAT', () => {
  assert.throws(() => K.parseContainer('{'), { code: 'BAD_FORMAT' });
  assert.throws(() => K.parseContainer(JSON.stringify({ ...wrap([]), format: 'x' })), { code: 'BAD_FORMAT' });
  assert.throws(() => K.parseContainer(JSON.stringify({ ...wrap([]), version: 2 })), { code: 'BAD_FORMAT' });
  assert.throws(() => K.parseContainer('[]'), { code: 'BAD_FORMAT' });
});

test('parseContainer: 不正・重複エントリは除外して警告', () => {
  const text = JSON.stringify(wrap([mk('a'), mk('b', { kdf: 'x' }), mk('a')]));
  const { container, warnings } = K.parseContainer(text);
  assert.deepEqual(container.entries.map((e) => e.id), ['a']);
  assert.equal(warnings.length, 2);
});

test('serialize → parse の往復', () => {
  const c = wrap([mk('a')]);
  assert.deepStrictEqual(K.parseContainer(K.serializeContainer(c)).container, c);
  assert.ok(K.serializeContainer(c).endsWith('\n'));
});

test('upsertEntry: 置換・追加（元を変更しない）', () => {
  const c = wrap([mk('a')]);
  const added = K.upsertEntry(c, mk('b'));
  assert.deepEqual(added.entries.map((e) => e.id), ['a', 'b']);
  assert.equal(c.entries.length, 1);
  const rep = K.upsertEntry(added, mk('a', { ciphertext: C.bytesToBase64(new Uint8Array(30)) }));
  assert.deepEqual(rep.entries.map((e) => e.id), ['a', 'b']);
  assert.notEqual(rep.entries[0].ciphertext, added.entries[0].ciphertext);
});

test('removeEntry', () => {
  assert.deepEqual(K.removeEntry(wrap([mk('a'), mk('b')]), 'a').entries.map((e) => e.id), ['b']);
});

test('mergeContainers: 重複排除と overlay 優先、順序は base → overlay の新規', () => {
  const o = mk('b', { ciphertext: C.bytesToBase64(new Uint8Array(30)) });
  const m = K.mergeContainers(wrap([mk('a'), mk('b')]), wrap([o, mk('c')]));
  assert.deepEqual(m.entries.map((e) => e.id), ['a', 'b', 'c']);
  assert.equal(m.entries[1].ciphertext, o.ciphertext);
});

test('data/presets.enc.json は妥当なコンテナ（全エントリが検証を通り、平文メタデータを持たない）', async () => {
  const text = await readFile(new URL('../data/presets.enc.json', import.meta.url), 'utf8');
  const { container, warnings } = K.parseContainer(text);
  assert.equal(warnings.length, 0);
  const raw = JSON.parse(text);
  assert.equal(raw.format, C.FORMAT);
  assert.equal(raw.entries.length, container.entries.length);
  const allowed = new Set(['id', 'kdf', 'hash', 'iterations', 'salt', 'cipher', 'iv', 'ciphertext', 'updatedAt', 'createdAt']);
  for (const e of raw.entries) {
    assert.ok(e.iterations >= 600000);
    for (const k of Object.keys(e)) assert.ok(allowed.has(k), `想定外のキー: ${k}`);
  }
});
