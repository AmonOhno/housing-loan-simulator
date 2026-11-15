import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGuarantee, guaranteeUnitPerMillion } from '../js/calc/guarantee.js';

const base = {
  inputRateMilli: 1000, addMilli: 200, rateIncludesGuarantee: false,
  loanYen: 35_000_000, years: 35, lumpMode: 'auto', lumpYen: null,
};

test('C9: 金利内包型 入力1.0%・上乗せ0.2% → 計算金利1.2%', () => {
  const r = resolveGuarantee({ ...base, type: 'inRate' });
  assert.equal(r.effectiveRateMilli, 1200);
  assert.equal(r.lumpYen, 0);
});

test('金利内包型で上乗せ済みを選ぶと入力金利のまま', () => {
  const r = resolveGuarantee({ ...base, type: 'inRate', rateIncludesGuarantee: true });
  assert.equal(r.effectiveRateMilli, 1000);
});

test('一括前払型（自動）: 35年・3,500万円 → 721,000円、金利は入力のまま', () => {
  const r = resolveGuarantee({ ...base, type: 'lump' });
  assert.equal(r.effectiveRateMilli, 1000);
  assert.equal(r.lumpYen, 721000);
  assert.equal(r.lumpUnitPerMillion, 20600);
});

test('一括前払型（手入力）はそのまま使う', () => {
  const r = resolveGuarantee({ ...base, type: 'lump', lumpMode: 'manual', lumpYen: 650000 });
  assert.equal(r.lumpYen, 650000);
});

test('なし → 保証料0・金利そのまま', () => {
  const r = resolveGuarantee({ ...base, type: 'none' });
  assert.equal(r.lumpYen, 0);
  assert.equal(r.effectiveRateMilli, 1000);
});

test('単価: 表の点・線形補間・10年未満の按分・35年超', () => {
  assert.deepEqual(guaranteeUnitPerMillion(20), { unit: 14800, outOfRange: false });
  assert.equal(guaranteeUnitPerMillion(12).unit, 8500 + ((12000 - 8500) * 2) / 5);
  assert.equal(guaranteeUnitPerMillion(5).unit, 4250);
  assert.deepEqual(guaranteeUnitPerMillion(40), { unit: 20600, outOfRange: true });
});

test('35年超の一括保証料は範囲外の注記つき', () => {
  const r = resolveGuarantee({ ...base, type: 'lump', years: 40 });
  assert.equal(r.notes.length, 1);
  assert.equal(r.lumpYen, 721000);
});

test('一括保証料は1,000円未満四捨五入', () => {
  // 12年: 単価9,900円/100万円 × 3,333万円 = 329,967 円 → 330,000
  const r = resolveGuarantee({ ...base, type: 'lump', years: 12, loanYen: 33_330_000 });
  assert.equal(r.lumpYen, 330000);
});
