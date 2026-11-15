import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/model/preset-schema.js';

const sample = () => ({
  name: 'ダミー設定', note: 'メモ',
  common: { price: 3800, expenses: 150, deposit: 100, income: 600, startYm: '2027-02' },
  deduction: { enabled: true, moveInYear: 2027, houseKind: 'new', perf: 'zeh', childcare: true,
    limitOverride: null, rateOverride: null, yearsOverride: null, incomeTax: null, residentCap: 9.75 },
  baseCaseIndex: 1,
  cases: [
    { label: 'A', loan: 3500, ownFundsMode: 'auto', ownFunds: null, rate: 1.0, years: 35, method: 'equalPayment',
      bonusPrincipal: 0, guaranteeType: 'inRate', guaranteeRateAdd: 0.2, rateIncludesGuarantee: false,
      guaranteeLumpMode: 'auto', guaranteeLump: null,
      prepayments: [{ afterYears: 10, afterMonths: 0, amount: 100, type: 'shorten' }] },
    { label: 'B', loan: 3600, ownFundsMode: 'manual', ownFunds: 350, rate: 1.2, years: 30, method: 'equalPrincipal',
      bonusPrincipal: 500, guaranteeType: 'lump', guaranteeRateAdd: 0.2, rateIncludesGuarantee: true,
      guaranteeLumpMode: 'manual', guaranteeLump: 72.1, prepayments: [] },
  ],
});

test('正規化は正しい設定を変更しない', () => {
  const r = S.normalizeSet(sample());
  assert.deepStrictEqual(r.set, sample());
  assert.deepEqual(r.warnings, []);
});

test('setFromRawState ↔ rawStateFromSet の往復で値が保たれる', () => {
  const raw = S.rawStateFromSet(sample());
  assert.equal(raw.common.price, '3800');
  assert.equal(raw.cases[0].ownFunds, '');
  assert.equal(raw.cases[1].guaranteeLump, '72.1');
  assert.equal(raw.baseCaseIndex, 1);
  assert.deepStrictEqual(S.setFromRawState(raw, { name: 'ダミー設定', note: 'メモ' }), sample());
  // { raw, baseCaseIndex } 形式も受け付ける
  const { baseCaseIndex, ...rest } = raw;
  assert.deepStrictEqual(S.setFromRawState({ raw: rest, baseCaseIndex }, { name: 'ダミー設定', note: 'メモ' }), sample());
});

test('未知フィールドは無視、欠落フィールドは既定値で補う', () => {
  const r = S.normalizeSet({ unknownX: 1, common: { price: 5000, zzz: 1 }, cases: [{ loan: 2000, foo: 'bar' }] });
  assert.equal(r.set.unknownX, undefined);
  assert.equal(r.set.common.zzz, undefined);
  assert.equal(r.set.common.price, 5000);
  assert.equal(r.set.common.expenses, 150);
  assert.equal(r.set.cases[0].loan, 2000);
  assert.equal(r.set.cases[0].rate, 1.0);
  assert.equal(r.set.cases[0].foo, undefined);
  assert.equal(r.set.deduction.perf, 'zeh');
  assert.equal(r.set.name, '設定セット');
});

test('cases が 0 件なら既定 1 件、4 件なら先頭 3 件＋警告', () => {
  const none = S.normalizeSet({ cases: [] });
  assert.equal(none.set.cases.length, 1);
  assert.ok(none.warnings.length > 0);
  const four = S.normalizeSet({ cases: [{}, {}, {}, {}] });
  assert.equal(four.set.cases.length, 3);
  assert.ok(four.warnings.some((w) => w.includes('cases')));
});

test('不正な列挙値は既定値＋警告、警告に値そのものを含まない', () => {
  const s = sample();
  s.cases[0].method = 'dummy-marker-123';
  s.common.price = 'dummy-marker-456';
  s.baseCaseIndex = 9;
  const r = S.normalizeSet(s);
  assert.equal(r.set.cases[0].method, 'equalPayment');
  assert.equal(r.set.common.price, 3800);
  assert.equal(r.set.baseCaseIndex, 0);
  assert.equal(r.warnings.length, 3);
  assert.ok(!r.warnings.join('').includes('dummy-marker'));
});

test('schemaVersion が大きいと警告して読める範囲で反映', () => {
  const r = S.normalizePayload({ schemaVersion: 2, updatedAt: '2026-01-01T00:00:00Z', sets: [sample()] });
  assert.ok(r.warnings.some((w) => w.includes('schemaVersion')));
  assert.equal(r.payload.sets.length, 1);
  assert.equal(r.payload.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('normalizePayload は例外を投げない', () => {
  for (const v of [null, 1, 'x', [], { sets: 5 }, { sets: [null, 3] }]) {
    assert.doesNotThrow(() => S.normalizePayload(v));
  }
});

test('createPayload', () => {
  const p = S.createPayload([sample()], new Date('2026-11-15T00:00:00Z'));
  assert.deepEqual(Object.keys(p), ['schemaVersion', 'updatedAt', 'sets']);
  assert.equal(p.updatedAt, '2026-11-15T00:00:00.000Z');
});

test('validatePayloadStrict: 正常は空、致命的な問題はパスだけ（値を含まない）', () => {
  assert.deepEqual(S.validatePayloadStrict({ sets: [sample()] }), []);
  assert.ok(S.validatePayloadStrict(null).length > 0);
  assert.ok(S.validatePayloadStrict({ sets: [] }).length > 0);
  const bad = sample();
  bad.cases[0].loan = 'dummy-marker-123';
  bad.cases[1].method = 'dummy-marker-456';
  bad.common.startYm = 'dummy-marker-789';
  const errs = S.validatePayloadStrict({ sets: [bad] });
  assert.equal(errs.length, 3);
  assert.ok(!errs.join('').includes('dummy-marker'));
});
