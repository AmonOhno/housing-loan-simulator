import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNumberText, parseNumber, validateCommon, validateDeduction, validateCase } from '../js/model/validate.js';

const commonRaw = { price: '3800', expenses: '150', deposit: '100', income: '600', startYm: '2027-02' };
const dedRaw = {
  enabled: true, moveInYear: '2027', houseKind: 'new', perf: 'zeh', childcare: true,
  limitOverride: '', rateOverride: '', yearsOverride: '', incomeTax: '', residentCap: '9.75',
};
const caseRaw = {
  label: 'A', loan: '3500', ownFundsMode: 'auto', ownFunds: '', rate: '1.0', years: '35', method: 'equalPayment',
  bonusPrincipal: '0', guaranteeType: 'inRate', guaranteeRateAdd: '0.2', rateIncludesGuarantee: false,
  guaranteeLumpMode: 'auto', guaranteeLump: '', prepayments: [],
};

test('全角数字・カンマ・空白を正規化する', () => {
  assert.equal(normalizeNumberText(' ３，５００ '), '3500');
  assert.equal(normalizeNumberText('3,500'), '3500');
  assert.equal(normalizeNumberText('１．２'), '1.2');
  assert.equal(normalizeNumberText('−５'), '-5');
  assert.deepEqual(parseNumber('３，５００'), { ok: true, value: 3500 });
  assert.deepEqual(parseNumber(''), { ok: false, empty: true });
  assert.deepEqual(parseNumber('  '), { ok: false, empty: true });
  assert.deepEqual(parseNumber('abc'), { ok: false, empty: false });
  assert.deepEqual(parseNumber('1.2.3'), { ok: false, empty: false });
});

test('共通項目: 初期値は有効で、円に換算される', () => {
  const r = validateCommon(commonRaw);
  assert.deepEqual(r.errors, {});
  assert.deepEqual(r.values, { priceYen: 38_000_000, expensesYen: 1_500_000, depositYen: 1_000_000, incomeYen: 6_000_000, startYm: '2027-02' });
});

test('共通項目: 全角入力・年収空欄（null）・小数入力', () => {
  const r = validateCommon({ ...commonRaw, price: '３，８００', income: '', expenses: '150.5' });
  assert.deepEqual(r.errors, {});
  assert.equal(r.values.priceYen, 38_000_000);
  assert.equal(r.values.incomeYen, null);
  assert.equal(r.values.expensesYen, 1_505_000);
});

test('共通項目: 数値でない・範囲外・手付金>物件価格・年月不正はエラー（丸めない）', () => {
  assert.ok(validateCommon({ ...commonRaw, price: 'abc' }).errors.price);
  assert.ok(validateCommon({ ...commonRaw, price: '' }).errors.price);
  assert.ok(validateCommon({ ...commonRaw, price: '-1' }).errors.price);
  assert.ok(validateCommon({ ...commonRaw, price: '100001' }).errors.price);
  assert.ok(validateCommon({ ...commonRaw, expenses: '10001' }).errors.expenses);
  assert.ok(validateCommon({ ...commonRaw, deposit: '3801' }).errors.deposit);
  assert.ok(validateCommon({ ...commonRaw, startYm: '2027-13' }).errors.startYm);
  assert.ok(validateCommon({ ...commonRaw, startYm: '2061-01' }).errors.startYm);
  assert.ok(validateCommon({ ...commonRaw, startYm: '' }).errors.startYm);
  assert.equal(validateCommon({ ...commonRaw, price: 'abc' }).values, null);
  assert.equal(validateCommon({ ...commonRaw, startYm: '2027/2' }).values.startYm, '2027-02');
});

test('控除: 初期値は有効。上書き値は換算される', () => {
  const r = validateDeduction(dedRaw);
  assert.deepEqual(r.errors, {});
  assert.equal(r.values.limitOverrideYen, null);
  assert.equal(r.values.residentCapYen, 97500);
  assert.equal(r.values.incomeTaxYen, null);
  const o = validateDeduction({ ...dedRaw, limitOverride: '2,000', rateOverride: '0.7', yearsOverride: '10', incomeTax: '10' });
  assert.equal(o.values.limitOverrideYen, 20_000_000);
  assert.equal(o.values.rateOverrideMilli, 700);
  assert.equal(o.values.yearsOverride, 10);
  assert.equal(o.values.incomeTaxYen, 100000);
});

test('控除: 範囲外・不正な選択はエラー、無効時は上書き欄を検証しない', () => {
  assert.ok(validateDeduction({ ...dedRaw, moveInYear: '2025' }).errors.moveInYear);
  assert.ok(validateDeduction({ ...dedRaw, houseKind: 'x' }).errors.houseKind);
  assert.ok(validateDeduction({ ...dedRaw, rateOverride: '2.5' }).errors.rateOverride);
  assert.ok(validateDeduction({ ...dedRaw, yearsOverride: '21' }).errors.yearsOverride);
  assert.ok(validateDeduction({ ...dedRaw, residentCap: '21' }).errors.residentCap);
  assert.equal(validateDeduction({ ...dedRaw, enabled: false, rateOverride: 'zzz' }).values.enabled, false);
  assert.equal(validateDeduction({ ...dedRaw, residentCap: '' }).values.residentCapYen, 97500);
});

test('ケース: 初期値は有効で円・ミリ%に換算される', () => {
  const r = validateCase(caseRaw);
  assert.deepEqual(r.errors, {});
  assert.equal(r.values.loanYen, 35_000_000);
  assert.equal(r.values.rateMilli, 1000);
  assert.equal(r.values.addMilli, 200);
  assert.equal(r.values.years, 35);
  assert.equal(r.values.bonusYen, 0);
  assert.equal(r.values.ownFundsYen, null);
  assert.deepEqual(r.notices, {});
});

test('金利の小数第4位はエラー、第3位まではOK、末尾ゼロは許容', () => {
  assert.ok(validateCase({ ...caseRaw, rate: '0.8001' }).errors.rate);
  assert.equal(validateCase({ ...caseRaw, rate: '0.801' }).values.rateMilli, 801);
  assert.equal(validateCase({ ...caseRaw, rate: '0.8000' }).values.rateMilli, 800);
  assert.equal(validateCase({ ...caseRaw, rate: '0' }).values.rateMilli, 0);
  assert.ok(validateCase({ ...caseRaw, rate: '15.1' }).errors.rate);
  assert.ok(validateCase({ ...caseRaw, rate: '-0.1' }).errors.rate);
});

test('借入額・期間の範囲と整数', () => {
  assert.ok(validateCase({ ...caseRaw, loan: '0' }).errors.loan);
  assert.ok(validateCase({ ...caseRaw, loan: '' }).errors.loan);
  assert.ok(validateCase({ ...caseRaw, loan: '100001' }).errors.loan);
  assert.ok(validateCase({ ...caseRaw, years: '35.5' }).errors.years);
  assert.ok(validateCase({ ...caseRaw, years: '0' }).errors.years);
  assert.ok(validateCase({ ...caseRaw, years: '51' }).errors.years);
  assert.equal(validateCase({ ...caseRaw, years: '50' }).values.years, 50);
});

test('C8: ボーナス返済分は借入額の50%以内（ちょうど50%は可）', () => {
  assert.ok(validateCase({ ...caseRaw, bonusPrincipal: '1750.1' }).errors.bonusPrincipal);
  assert.equal(validateCase({ ...caseRaw, bonusPrincipal: '1750' }).values.bonusYen, 17_500_000);
  assert.deepEqual(validateCase({ ...caseRaw, bonusPrincipal: '1750' }).errors, {});
  assert.ok(validateCase({ ...caseRaw, bonusPrincipal: '1750.1' }).errors.bonusPrincipal.includes('50%'));
  assert.equal(validateCase({ ...caseRaw, bonusPrincipal: '' }).values.bonusYen, 0);
});

test('借入額が10万円単位でないと notice（エラーにしない）', () => {
  const r = validateCase({ ...caseRaw, loan: '3500.5' });
  assert.deepEqual(r.errors, {});
  assert.ok(r.notices.loan);
  assert.equal(r.values.loanYen, 35_005_000);
  assert.equal(validateCase({ ...caseRaw, loan: '3,510' }).notices.loan, undefined);
});

test('自己資金の手入力・一括保証料の手入力', () => {
  const m = validateCase({ ...caseRaw, ownFundsMode: 'manual', ownFunds: '400' });
  assert.equal(m.values.ownFundsYen, 4_000_000);
  assert.ok(validateCase({ ...caseRaw, ownFundsMode: 'manual', ownFunds: '' }).errors.ownFunds);
  const l = validateCase({ ...caseRaw, guaranteeType: 'lump', guaranteeLumpMode: 'manual', guaranteeLump: '70' });
  assert.equal(l.values.lumpYen, 700_000);
  assert.equal(l.values.lumpMode, 'manual');
  assert.ok(validateCase({ ...caseRaw, guaranteeType: 'lump', guaranteeLumpMode: 'manual', guaranteeLump: '1001' }).errors.guaranteeLump);
  assert.ok(validateCase({ ...caseRaw, guaranteeRateAdd: '2.5' }).errors.guaranteeRateAdd);
  // 内包型でないとき上乗せ幅は検証しない
  assert.deepEqual(validateCase({ ...caseRaw, guaranteeType: 'none', guaranteeRateAdd: 'zzz' }).errors, {});
});

test('ケース名は20文字以内', () => {
  assert.ok(validateCase({ ...caseRaw, label: 'あ'.repeat(21) }).errors.label);
  assert.equal(validateCase({ ...caseRaw, label: 'あ'.repeat(20) }).values.label.length, 20);
});

test('繰上返済: 正常・時期エラー・金額エラー・件数上限', () => {
  const ok = validateCase({ ...caseRaw, prepayments: [{ afterYears: '10', afterMonths: '0', amount: '100', type: 'shorten' }] });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.values.prepayments, [{ afterYears: 10, afterMonths: 0, amountYen: 1_000_000, type: 'shorten' }]);

  const p = (o) => validateCase({ ...caseRaw, prepayments: [{ afterYears: '10', afterMonths: '0', amount: '100', type: 'shorten', ...o }] }).errors;
  assert.ok(p({ afterYears: '0', afterMonths: '0' })['prepayments.0.afterYears']);
  assert.ok(p({ afterYears: '35', afterMonths: '0' })['prepayments.0.afterYears']);
  assert.ok(p({ afterYears: '36' })['prepayments.0.afterYears']);
  assert.ok(p({ afterMonths: '12' })['prepayments.0.afterMonths']);
  assert.ok(p({ amount: '0' })['prepayments.0.amount']);
  assert.ok(p({ amount: 'x' })['prepayments.0.amount']);
  assert.ok(p({ type: 'foo' })['prepayments.0.type']);
  assert.equal(p({ afterYears: '34', afterMonths: '11' })['prepayments.0.afterYears'], undefined);

  const four = Array.from({ length: 4 }, () => ({ afterYears: '10', afterMonths: '0', amount: '100', type: 'shorten' }));
  assert.ok(validateCase({ ...caseRaw, prepayments: four }).errors.prepayments);
});

test('エラーがあれば values は null', () => {
  assert.equal(validateCase({ ...caseRaw, rate: 'x' }).values, null);
});
