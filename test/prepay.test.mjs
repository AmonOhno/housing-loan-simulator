import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrepayments, splitPrepayment, prepayEffect } from '../js/calc/prepay.js';
import { buildSchedule } from '../js/calc/schedule.js';

const base = { loanYen: 35_000_000, bonusYen: 0, rateMilli: 800, years: 35, method: 'equalPayment', startYm: '2027-02' };
const item = (atNo, amountYen, type, inputIndex = 0) => ({ atNo, amountYen, type, inputIndex });

test('normalizePrepayments: 並べ替え（同時期は入力順）', () => {
  const r = normalizePrepayments([
    { afterYears: 10, afterMonths: 0, amountYen: 1, type: 'shorten' },
    { afterYears: 5, afterMonths: 6, amountYen: 2, type: 'reduce' },
    { afterYears: 10, afterMonths: 0, amountYen: 3, type: 'reduce' },
  ], 420);
  assert.deepEqual(r.items.map((x) => [x.atNo, x.amountYen, x.inputIndex]), [[66, 2, 1], [120, 1, 0], [120, 3, 2]]);
  assert.equal(r.warnings.length, 0);
});

test('normalizePrepayments: atNo=0 と atNo>=総回数は除外して警告', () => {
  const r = normalizePrepayments([
    { afterYears: 0, afterMonths: 0, amountYen: 1_000_000, type: 'shorten' },
    { afterYears: 35, afterMonths: 0, amountYen: 1_000_000, type: 'shorten' },
    { afterYears: 34, afterMonths: 11, amountYen: 1_000_000, type: 'shorten' },
  ], 420);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].atNo, 419);
  assert.deepEqual(r.warnings.map((w) => w.inputIndex), [0, 1]);
  assert.ok(r.warnings[0].message.includes('1 か月以上'));
});

test('splitPrepayment: 按分は合計一致で各口の残高を超えない', () => {
  const s = splitPrepayment(1_000_001, 30_000_000, 5_000_000);
  assert.equal(s.toMonthly + s.toBonus, 1_000_001);
  assert.equal(s.full, false);
  assert.ok(s.toMonthly <= 30_000_000 && s.toBonus <= 5_000_000);
  assert.equal(s.toMonthly, Math.floor((1_000_001 * 30_000_000) / 35_000_000));
  const edge = splitPrepayment(9, 1, 100);
  assert.equal(edge.toMonthly + edge.toBonus, 9);
  assert.ok(edge.toMonthly <= 1);
});

test('splitPrepayment: 残高以上は全額繰上返済', () => {
  assert.deepEqual(splitPrepayment(35_000_000, 30_000_000, 5_000_000), { toMonthly: 30_000_000, toBonus: 5_000_000, full: true });
  assert.equal(splitPrepayment(99_000_000, 30_000_000, 5_000_000).full, true);
});

test('C11: 期間短縮型 — 毎月返済額は変わらず、完済が早まり、総利息が減る', () => {
  const without = buildSchedule(base);
  const s = buildSchedule({ ...base, prepayments: [item(120, 1_000_000, 'shorten')] });
  assert.ok(s.lastNo < 420);
  assert.ok(s.totalInterest < without.totalInterest);
  for (const r of s.rows.slice(0, s.lastNo - 1)) assert.equal(r.monthlyPayment, 95571);
  assert.equal(s.rows[119].prepay, 1_000_000);
  const e = prepayEffect(s, without);
  assert.ok(e.monthsShortened > 0);
  assert.equal(e.monthsShortened, 420 - s.lastNo);
  assert.equal(e.interestSaved, without.totalInterest - s.totalInterest);
  assert.equal(e.reducedPayment, null);
  assert.equal(s.prepayLog[0].full, false);
  assert.equal(s.prepayLog[0].amountYen, 1_000_000);
});

test('C12: 返済額軽減型 — 完済時期は変わらず、以後の毎月返済額が減る', () => {
  const without = buildSchedule(base);
  const s = buildSchedule({ ...base, prepayments: [item(120, 1_000_000, 'reduce')] });
  assert.equal(s.lastNo, 420);
  assert.ok(s.rows[120].monthlyPayment < 95571);
  assert.equal(s.rows[119].monthlyPayment, 95571);
  assert.ok(s.totalInterest < without.totalInterest);
  const e = prepayEffect(s, without);
  assert.equal(e.monthsShortened, 0);
  assert.equal(e.reducedPayment, s.rows[120].monthlyPayment);
  assert.ok(e.reducedPayment < 95571);
});

test('全額繰上返済: その回で終了、full=true、最終残高0、充当額=その時点の残高', () => {
  const without = buildSchedule(base);
  const s = buildSchedule({ ...base, prepayments: [item(120, 99_000_000, 'shorten')] });
  assert.equal(s.lastNo, 120);
  assert.equal(s.rows.at(-1).balance, 0);
  assert.equal(s.prepayLog[0].full, true);
  const balBefore = without.rows[119].balance;
  assert.equal(s.prepayLog[0].amountYen, balBefore);
  assert.equal(s.rows.at(-1).prepay, balBefore);
});

test('完済後の繰上返済は ignored', () => {
  const s = buildSchedule({ ...base, prepayments: [item(60, 99_000_000, 'shorten'), item(100, 1_000_000, 'shorten', 1)] });
  assert.equal(s.lastNo, 60);
  assert.equal(s.prepayLog.length, 2);
  assert.equal(s.prepayLog[1].ignored, '完済後のため適用しません');
  assert.equal(s.prepayLog[1].amountYen, 0);
});

test('期間短縮で完済した後の予定回の繰上返済も ignored', () => {
  // 大きな短縮型の後、新しい最終回より後に指定した繰上返済は適用されない
  const s = buildSchedule({
    ...base, years: 10, loanYen: 10_000_000,
    prepayments: [item(12, 9_000_000, 'shorten'), item(110, 100_000, 'shorten', 1)],
  });
  assert.ok(s.lastNo < 110);
  assert.equal(s.prepayLog.at(-1).ignored, '完済後のため適用しません');
});

test('複数件（短縮→軽減）でも元金合計・最終残高が整合する', () => {
  const s = buildSchedule({
    ...base, bonusYen: 5_000_000,
    prepayments: [item(36, 2_000_000, 'shorten'), item(84, 3_000_000, 'reduce', 1), item(150, 1_500_000, 'shorten', 2)],
  });
  const prin = s.rows.reduce((a, r) => a + r.principal + r.prepay, 0);
  assert.equal(prin, base.loanYen);
  assert.equal(s.rows.at(-1).balance, 0);
  assert.equal(s.prepayLog.filter((l) => !l.ignored).length, 3);
  assert.ok(s.monthlyAfterReduce !== null);
  assert.ok(s.bonusAfterReduce !== null);
});

test('ボーナス併用の按分: 繰上返済額が毎月分とボーナス分の残高に分かれて減る', () => {
  const s = buildSchedule({ ...base, bonusYen: 5_000_000, prepayments: [item(121, 3_500_000, 'shorten')] });
  const before = s.rows[119];
  const after = s.rows[120];
  assert.ok(after.monthlyBalance < before.monthlyBalance);
  assert.ok(after.bonusBalance < before.bonusBalance);
  assert.equal(s.rows[120].prepay, 3_500_000);
});

test('元金均等の返済額軽減型: 毎月の元金が残り回数で再計算される', () => {
  const s = buildSchedule({ ...base, method: 'equalPrincipal', prepayments: [item(120, 3_000_000, 'reduce')] });
  assert.equal(s.lastNo, 420);
  const unitBefore = s.rows[119].principal;
  const unitAfter = s.rows[120].principal;
  assert.ok(unitAfter < unitBefore);
  assert.equal(unitAfter, Math.floor(s.rows[119].balance / 300));
});
