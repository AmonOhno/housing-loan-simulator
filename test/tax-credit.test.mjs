import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeductionDefaults, computeTaxCredit } from '../js/calc/tax-credit.js';

const man = (n) => n * 10000;

test('D1: 新築・ZEH水準・子育て世帯等・2027年入居 → 4,500万円・13年', () => {
  const r = resolveDeductionDefaults({ houseKind: 'new', perf: 'zeh', moveInYear: 2027, childcare: true });
  assert.equal(r.limitYen, man(4500));
  assert.equal(r.years, 13);
  assert.equal(r.eligible, true);
  assert.equal(r.needsCheck, false);
});

test('新築・ZEH水準・一般 → 3,500万円／認定 → 4,500万円・5,000万円', () => {
  assert.equal(resolveDeductionDefaults({ houseKind: 'new', perf: 'zeh', moveInYear: 2027, childcare: false }).limitYen, man(3500));
  assert.equal(resolveDeductionDefaults({ houseKind: 'new', perf: 'certified', moveInYear: 2027, childcare: false }).limitYen, man(4500));
  assert.equal(resolveDeductionDefaults({ houseKind: 'new', perf: 'certified', moveInYear: 2027, childcare: true }).limitYen, man(5000));
});

test('D2: 新築・省エネ基準適合・一般・2027年入居 → 2,000万円・13年', () => {
  const r = resolveDeductionDefaults({ houseKind: 'new', perf: 'energy', moveInYear: 2027, childcare: false });
  assert.equal(r.limitYen, man(2000));
  assert.equal(r.years, 13);
  assert.equal(resolveDeductionDefaults({ houseKind: 'new', perf: 'energy', moveInYear: 2027, childcare: true }).limitYen, man(3000));
});

test('D3: 新築・省エネ基準適合・2028年入居 → 2,000万円・10年・要確認・注記', () => {
  const r = resolveDeductionDefaults({ houseKind: 'new', perf: 'energy', moveInYear: 2028, childcare: true });
  assert.equal(r.limitYen, man(2000));
  assert.equal(r.years, 10);
  assert.equal(r.needsCheck, true);
  assert.ok(r.notes.length > 0 && r.notes[0].includes('原則対象外'));
});

test('D4: 新築・その他 → 対象外（0）', () => {
  const r = resolveDeductionDefaults({ houseKind: 'new', perf: 'other', moveInYear: 2027, childcare: true });
  assert.equal(r.eligible, false);
  assert.equal(r.limitYen, 0);
  assert.equal(r.years, 0);
  assert.ok(r.notes[0].includes('原則対象外'));
});

test('既存住宅の4区分', () => {
  const f = (perf, childcare) => resolveDeductionDefaults({ houseKind: 'existing', perf, moveInYear: 2027, childcare });
  assert.deepEqual([f('certified', false).limitYen, f('certified', true).limitYen, f('certified', false).years], [man(3500), man(4500), 13]);
  assert.deepEqual([f('zeh', false).limitYen, f('zeh', true).limitYen, f('zeh', false).needsCheck], [man(3500), man(4500), true]);
  assert.deepEqual([f('energy', false).limitYen, f('energy', true).limitYen, f('energy', false).years], [man(2000), man(3000), 13]);
  assert.deepEqual([f('other', true).limitYen, f('other', false).years, f('other', false).eligible], [man(2000), 10, true]);
});

test('範囲外の入居年は対象外・要確認', () => {
  const r = resolveDeductionDefaults({ houseKind: 'new', perf: 'zeh', moveInYear: 2031, childcare: false });
  assert.equal(r.eligible, false);
  assert.equal(r.needsCheck, true);
});

const flat = (bal) => () => bal;

test('D5: 年末残高 > 限度額 → 限度額×控除率で頭打ち', () => {
  const r = computeTaxCredit({
    balanceAt: flat(man(5000)), moveInYear: 2027, limitYen: man(4500), rateMilli: 700, years: 2,
    incomeTaxYen: null, residentCapYen: 97500,
  });
  assert.equal(r.rows[0].target, man(4500));
  assert.equal(r.rows[0].credit, 315000);
  assert.equal(r.rows[0].cappedByLimit, true);
  assert.equal(r.rows[0].cappedByTax, false);
  assert.equal(r.total, 630000);
});

test('D6: 控除可能額245,000円・所得税10万円・住民税上限97,500円 → 197,500円', () => {
  const r = computeTaxCredit({
    balanceAt: flat(man(3500)), moveInYear: 2027, limitYen: man(4500), rateMilli: 700, years: 1,
    incomeTaxYen: 100000, residentCapYen: 97500,
  });
  const row = r.rows[0];
  assert.equal(row.capable, 245000);
  assert.equal(row.fromIncomeTax, 100000);
  assert.equal(row.fromResident, 97500);
  assert.equal(row.credit, 197500);
  assert.equal(row.cappedByTax, true);
  assert.equal(row.cappedByLimit, false);
});

test('100円未満切り捨て（12,345,678円 × 0.7% = 86,419 → 86,400）', () => {
  const r = computeTaxCredit({
    balanceAt: flat(12_345_678), moveInYear: 2027, limitYen: man(4500), rateMilli: 700, years: 1,
    incomeTaxYen: null, residentCapYen: 97500,
  });
  assert.equal(r.rows[0].capable, 86400);
  assert.equal(r.rows[0].credit, 86400);
});

test('所得税額が空欄（null）なら頭打ちなし、0円なら住民税上限のみ', () => {
  const args = { balanceAt: flat(man(3500)), moveInYear: 2027, limitYen: man(4500), rateMilli: 700, years: 1, residentCapYen: 97500 };
  assert.equal(computeTaxCredit({ ...args, incomeTaxYen: null }).total, 245000);
  assert.equal(computeTaxCredit({ ...args, incomeTaxYen: 0 }).total, 97500);
});

test('入居年 < 返済開始年なら入居年の残高は借入額（yearEndBalanceMap 経由）', async () => {
  const { buildSchedule, yearEndBalanceMap } = await import('../js/calc/schedule.js');
  const s = buildSchedule({ loanYen: 35_000_000, bonusYen: 0, rateMilli: 1000, years: 35, method: 'equalPayment', startYm: '2028-02' });
  const balanceAt = yearEndBalanceMap(s, 35_000_000);
  const r = computeTaxCredit({ balanceAt, moveInYear: 2027, limitYen: man(4500), rateMilli: 700, years: 3, incomeTaxYen: null, residentCapYen: 97500 });
  assert.equal(r.rows[0].balance, 35_000_000);
  assert.ok(r.rows[1].balance < 35_000_000);
});

test('完済後の年は控除0、期間0・限度額0なら空', async () => {
  const { buildSchedule, yearEndBalanceMap } = await import('../js/calc/schedule.js');
  const s = buildSchedule({ loanYen: 1_000_000, bonusYen: 0, rateMilli: 1000, years: 1, method: 'equalPayment', startYm: '2027-01' });
  const r = computeTaxCredit({ balanceAt: yearEndBalanceMap(s, 1_000_000), moveInYear: 2027, limitYen: man(4500), rateMilli: 700, years: 3, incomeTaxYen: null, residentCapYen: 97500 });
  assert.equal(r.rows[1].balance, 0);
  assert.equal(r.rows[1].credit, 0);
  assert.deepEqual(computeTaxCredit({ balanceAt: flat(1), moveInYear: 2027, limitYen: 0, rateMilli: 700, years: 13, incomeTaxYen: null, residentCapYen: 1 }), { rows: [], total: 0 });
  assert.deepEqual(computeTaxCredit({ balanceAt: flat(1), moveInYear: 2027, limitYen: 1, rateMilli: 700, years: 0, incomeTaxYen: null, residentCapYen: 1 }), { rows: [], total: 0 });
});

import { COMMON_NOTES as __NOTES } from '../js/data/deduction-table.js';
test('注記に取得対価超過の扱いを含む（要件 9.1）', () => {
  assert.ok(__NOTES.some((n) => n.includes('取得対価')));
});
