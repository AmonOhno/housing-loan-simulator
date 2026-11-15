import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCase, compareCases, burdenRatio } from '../js/calc/scenario.js';
import { levelPayment } from '../js/calc/loan.js';
import { validateCommon, validateDeduction, validateCase } from '../js/model/validate.js';
import { DEFAULT_COMMON, DEFAULT_DEDUCTION, DEFAULT_CASES } from '../js/data/defaults.js';

// 既定値（一般例）を画面の生入力（文字列）に直し、検証モジュールを通して計算に渡す
const str = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? '' : typeof v === 'boolean' ? v : String(v)]));
const common = validateCommon(str(DEFAULT_COMMON)).values;
const deduction = validateDeduction({ ...str(DEFAULT_DEDUCTION), moveInYear: '2027' }).values;
const caseRaw = (c, over = {}) => ({ ...str(c), prepayments: [], ...over });
const caseVals = (i, over) => validateCase(caseRaw(DEFAULT_CASES[i], over)).values;

test('既定値はすべて検証を通る', () => {
  assert.ok(common);
  assert.ok(deduction);
  assert.ok(caseVals(0));
  assert.ok(caseVals(1));
});

test('A/B: 初期値の計算結果（金利1.0%+上乗せ0.2%=1.2%）', () => {
  const a = computeCase(common, deduction, caseVals(0));
  assert.equal(a.effectiveRateMilli, 1200);
  assert.equal(a.summary.initialMonthly, levelPayment(35_000_000, 1200, 420, 12));
  assert.equal(a.summary.totalInterest, a.summary.totalPayment - 35_000_000);
  assert.equal(a.summary.lumpYen, 0);
  assert.equal(a.funding.status, 'match');
  assert.equal(a.funding.ownFunds, 4_500_000);
  assert.equal(a.schedule.rows.at(-1).balance, 0);
  assert.equal(a.prepay.effect, null);
  assert.equal(a.annual[0].year, 2027);
  assert.equal(a.annual.length, 36);
});

test('A/B 比較: 月額差・総利息差の符号と diffDirection、基準ケースには diff なし', () => {
  const ra = computeCase(common, deduction, caseVals(0));
  const rb = computeCase(common, deduction, caseVals(1));
  const t = compareCases([ra, rb], 0);
  const row = (k) => t.rows.find((r) => r.key === k);
  assert.equal(row('monthly').cells[0].diff, null);
  assert.equal(row('monthly').cells[0].diffDirection, null);
  assert.equal(row('monthly').cells[1].diff, rb.summary.initialMonthly - ra.summary.initialMonthly);
  assert.ok(row('monthly').cells[1].diff > 0);
  assert.equal(row('monthly').cells[1].diffDirection, 'more');
  assert.equal(row('totalInterest').cells[1].diffDirection, 'more');
  assert.equal(row('loan').cells[1].diff, 1_000_000);
  assert.equal(row('ownFunds').cells[1].diff, -1_000_000);
  assert.equal(row('ownFunds').cells[1].diffDirection, 'less');
  assert.equal(row('cashAtSettlement').cells[1].diff, -1_000_000);
  assert.equal(row('taxCredit').cells[1].diffDirection, 'more'); // 限度額内なので借入が多い方が控除も多い
  assert.equal(row('years').cells[1].diff, null);
  assert.equal(row('lastYm').cells[1].diff, null);
  // 基準を B にすると符号が逆になる
  const t2 = compareCases([ra, rb], 1);
  assert.equal(t2.rows.find((r) => r.key === 'monthly').cells[0].diffDirection, 'less');
  // 同値は same
  const t3 = compareCases([ra, ra], 0);
  assert.equal(t3.rows.find((r) => r.key === 'monthly').cells[1].diffDirection, 'same');
  assert.equal(t3.rows.find((r) => r.key === 'monthly').cells[1].diff, 0);
});

test('比較表: エラーのケース（null）の列は値も diff も null、基準が null なら diff なし', () => {
  const ra = computeCase(common, deduction, caseVals(0));
  const rb = computeCase(common, deduction, caseVals(1));
  const t = compareCases([ra, null, rb], 0);
  for (const row of t.rows) {
    assert.deepEqual(row.cells[1], { value: null, diff: null, diffDirection: null });
  }
  assert.equal(t.rows.find((r) => r.key === 'monthly').cells[2].diffDirection, 'more');
  const t2 = compareCases([null, rb], 0);
  assert.ok(t2.rows.every((r) => r.cells.every((c) => c.diff === null)));
});

test('C3 相当: 年0.8%（保証料なし）で月額差2,730円', () => {
  const none = { guaranteeType: 'none', rate: '0.8' };
  const ra = computeCase(common, deduction, caseVals(0, none));
  const rb = computeCase(common, deduction, caseVals(1, none));
  assert.equal(ra.summary.initialMonthly, 95571);
  assert.equal(rb.summary.initialMonthly, 98301);
  assert.equal(ra.summary.totalPayment, 40139745);
  assert.equal(compareCases([ra, rb], 0).rows.find((r) => r.key === 'monthly').cells[1].diff, 2730);
});

test('C13: burdenRatio — 年収null・0 → null、小数第1位に丸める', () => {
  assert.equal(burdenRatio(1_200_000, null), null);
  assert.equal(burdenRatio(1_200_000, 0), null);
  assert.equal(burdenRatio(1_200_000, 6_000_000), 20);
  assert.equal(burdenRatio(1_279_000, 6_000_000), 21.3);
  assert.equal(burdenRatio(1_276_000, 6_000_000), 21.3);
  assert.equal(burdenRatio(1_273_000, 6_000_000), 21.2);
});

test('サマリーの返済負担率と目安レベル', () => {
  const a = computeCase(common, deduction, caseVals(0));
  assert.equal(a.summary.burdenRatio, burdenRatio(a.summary.firstYearPayment, 6_000_000));
  assert.equal(a.summary.burdenLevel, 'normal');
  const high = computeCase({ ...common, incomeYen: 3_000_000 }, deduction, caseVals(0));
  assert.equal(high.summary.burdenLevel, 'warning');
  const mid = computeCase({ ...common, incomeYen: 4_500_000 }, deduction, caseVals(0));
  assert.equal(mid.summary.burdenLevel, 'caution');
  const none = computeCase({ ...common, incomeYen: null }, deduction, caseVals(0));
  assert.equal(none.summary.burdenRatio, null);
  assert.equal(none.summary.burdenLevel, null);
});

test('C10: 一括前払型は一括保証料が必要資金・総支払額に加わる。totalPaid・realBurden の定義', () => {
  const r = computeCase(common, deduction, caseVals(0, { guaranteeType: 'lump' }));
  assert.equal(r.guarantee.lumpYen, 721_000);
  assert.equal(r.effectiveRateMilli, 1000);
  assert.equal(r.funding.expensesTotal, 1_500_000 + 721_000);
  assert.equal(r.funding.required, 38_000_000 + 1_500_000 + 721_000);
  assert.equal(r.funding.status, 'match');
  assert.equal(r.summary.totalPaid, r.summary.totalPayment + 721_000);
  assert.equal(r.summary.realBurden, r.summary.totalPaid - r.taxCredit.total);
});

test('C9: 金利内包型の上乗せ済み選択', () => {
  const r = computeCase(common, deduction, caseVals(0, { rateIncludesGuarantee: true }));
  assert.equal(r.effectiveRateMilli, 1000);
});

test('住宅ローン控除: 初期値（ZEH・子育て・13年・限度額4,500万円）、年次表にも控除額が付く', () => {
  const r = computeCase(common, deduction, caseVals(0));
  assert.equal(r.taxCredit.limitYen, 45_000_000);
  assert.equal(r.taxCredit.years, 13);
  assert.equal(r.taxCredit.rateMilli, 700);
  assert.equal(r.taxCredit.rows.length, 13);
  assert.equal(r.taxCredit.rows[0].year, 2027);
  assert.equal(r.taxCredit.eligible, true);
  assert.equal(r.taxCredit.overridden, false);
  assert.equal(r.taxCredit.total, r.taxCredit.rows.reduce((x, y) => x + y.credit, 0));
  assert.equal(r.annual.find((a) => a.year === 2027).taxCredit, r.taxCredit.rows[0].credit);
  assert.equal(r.annual.find((a) => a.year === 2050).taxCredit, 0);
});

test('住宅ローン控除: 上書き値・無効・対象外', () => {
  const ov = validateDeduction({ ...str(DEFAULT_DEDUCTION), limitOverride: '2000', yearsOverride: '10', incomeTax: '2' }).values;
  const r = computeCase(common, ov, caseVals(0));
  assert.equal(r.taxCredit.limitYen, 20_000_000);
  assert.equal(r.taxCredit.years, 10);
  assert.equal(r.taxCredit.overridden, true);
  assert.ok(r.taxCredit.rows[0].cappedByLimit);
  assert.ok(r.taxCredit.rows[0].cappedByTax);

  const off = validateDeduction({ ...str(DEFAULT_DEDUCTION), enabled: false }).values;
  const r2 = computeCase(common, off, caseVals(0));
  assert.equal(r2.taxCredit.total, 0);
  assert.equal(r2.taxCredit.rows.length, 0);

  const other = validateDeduction({ ...str(DEFAULT_DEDUCTION), perf: 'other' }).values;
  const r3 = computeCase(common, other, caseVals(0));
  assert.equal(r3.taxCredit.eligible, false);
  assert.equal(r3.taxCredit.total, 0);
  assert.ok(r3.taxCredit.notes.length > 0);
  // D4: 手入力で上書きすると計算される
  const other2 = validateDeduction({ ...str(DEFAULT_DEDUCTION), perf: 'other', limitOverride: '2000', yearsOverride: '10' }).values;
  const r4 = computeCase(common, other2, caseVals(0));
  assert.equal(r4.taxCredit.eligible, true);
  assert.ok(r4.taxCredit.total > 0);
});

test('繰上返済つきケース: 効果・警告・サマリーに反映される', () => {
  const pre = [{ afterYears: '10', afterMonths: '0', amount: '100', type: 'shorten' }];
  const r = computeCase(common, deduction, caseVals(0, { prepayments: pre }));
  assert.ok(r.prepay.effect.interestSaved > 0);
  assert.ok(r.prepay.effect.monthsShortened > 0);
  assert.equal(r.summary.monthsShortened, r.prepay.effect.monthsShortened);
  assert.equal(r.prepay.log.length, 1);
  assert.equal(r.annual.reduce((x, y) => x + y.prepay, 0), 1_000_000);
  // 実行時期が当初の最終回より後（検証は通るが正規化で除外）にならないことの確認用に直接渡す
  const direct = { ...caseVals(0), prepayments: [{ afterYears: 40, afterMonths: 0, amountYen: 1_000_000, type: 'shorten' }] };
  const r2 = computeCase(common, deduction, direct);
  assert.equal(r2.prepay.warnings.length, 1);
  assert.equal(r2.prepay.effect, null);
});

test('ボーナス返済ケース: サマリーにボーナス加算額が入る', () => {
  const r = computeCase(common, deduction, caseVals(0, { bonusPrincipal: '500', rate: '0.8', guaranteeType: 'none' }));
  assert.equal(r.summary.initialBonus, 82036);
  assert.equal(r.summary.firstYearPayment, r.schedule.rows.slice(0, 12).reduce((a, x) => a + x.payment, 0));
});
