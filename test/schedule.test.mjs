import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, annualize, yearEndBalanceMap } from '../js/calc/schedule.js';
import { levelPayment } from '../js/calc/loan.js';

const base = { loanYen: 35_000_000, bonusYen: 0, rateMilli: 800, years: 35, method: 'equalPayment', startYm: '2027-02' };

test('C2: 3,500万円・0.8%・35年・元利均等', () => {
  const s = buildSchedule(base);
  assert.equal(s.initialMonthly, 95571);
  assert.equal(s.totalPayment, 40139745);
  assert.equal(s.totalInterest, 5139745);
  assert.equal(s.lastNo, 420);
  assert.equal(s.lastYm, '2062-01');
  assert.equal(s.rows.at(-1).balance, 0);
  assert.equal(s.initialBonus, 0);
});

test('C3: 3,600万円', () => {
  const s = buildSchedule({ ...base, loanYen: 36_000_000 });
  assert.equal(s.initialMonthly, 98301);
  assert.equal(s.totalPayment, 41286634);
});

test('C5: 元金均等 3,500万円・0.8% 1回目 元金83,333・利息23,333', () => {
  const s = buildSchedule({ ...base, method: 'equalPrincipal' });
  assert.equal(s.rows[0].principal, 83333);
  assert.equal(s.rows[0].interest, 23333);
  assert.equal(s.rows[0].payment, 83333 + 23333);
  assert.equal(s.initialMonthly, 106666);
  // 最終回は端数調整
  assert.equal(s.rows.at(-1).balance, 0);
});

test('ボーナス500万円: 6・12回目に82,036円、それ以外の回は0、毎月分は3,000万円での返済額', () => {
  const s = buildSchedule({ ...base, bonusYen: 5_000_000 });
  assert.equal(s.rows[5].bonusPayment, 82036);
  assert.equal(s.rows[11].bonusPayment, 82036);
  assert.equal(s.rows[0].bonusPayment, 0);
  assert.equal(s.rows[6].bonusPayment, 0);
  assert.equal(s.rows[0].monthlyPayment, levelPayment(30_000_000, 800, 420, 12));
  assert.equal(s.initialBonus, 82036);
  assert.equal(s.rows[5].payment, s.rows[5].monthlyPayment + 82036);
  assert.equal(s.rows.at(-1).no, 420);
  assert.ok(Math.abs(s.lastBonus - 82036) < 100); // 最終回は残高全額（端数調整）
});

test('金利0%: 毎回2,380円・最終回2,780円・利息0', () => {
  const s = buildSchedule({ ...base, loanYen: 1_000_000, rateMilli: 0 });
  assert.equal(s.rows[0].payment, 2380);
  assert.equal(s.rows[418].payment, 2380);
  assert.equal(s.rows.at(-1).payment, 2780);
  assert.equal(s.totalInterest, 0);
  assert.equal(s.totalPayment, 1_000_000);
});

test('firstYearPayment は1〜12回の合計（ボーナス込み）', () => {
  const s = buildSchedule({ ...base, bonusYen: 5_000_000 });
  const m = levelPayment(30_000_000, 800, 420, 12);
  assert.equal(s.firstYearPayment, m * 12 + 82036 * 2);
});

// ---- C7 不変条件 ----
function checkInvariants(label, s, loanYen, method, hasPrepay) {
  const sumPrin = s.rows.reduce((a, r) => a + r.principal, 0);
  const sumPrepay = s.rows.reduce((a, r) => a + r.prepay, 0);
  assert.equal(sumPrin + sumPrepay, loanYen, `${label}: 元金合計=借入額`);
  assert.equal(s.rows.at(-1).balance, 0, `${label}: 最終残高0`);
  assert.equal(s.totalInterest, s.totalPayment - loanYen, `${label}: 総利息=総返済額-借入額`);
  let prev = loanYen;
  for (const r of s.rows) {
    assert.ok(r.balance >= 0, `${label}: 残高は0以上`);
    assert.ok(r.balance <= prev, `${label}: 残高は単調非増加`);
    assert.equal(r.payment, r.principal + r.interest, `${label}: 返済額=元金+利息`);
    assert.ok(r.principal >= 0 && r.interest >= 0, `${label}: 元金・利息は非負`);
    prev = r.balance;
  }
  if (method === 'equalPayment' && !hasPrepay) {
    const normal = s.rows.slice(0, -1).filter((r) => r.monthlyPayment > 0).map((r) => r.monthlyPayment);
    assert.ok(normal.every((x) => x === normal[0]), `${label}: 最終回以外の毎月返済額は一定`);
  }
}

test('C7: 方式×ボーナス×繰上返済×金利の全組合せで不変条件が成り立つ', () => {
  const prepaySets = {
    none: [],
    shorten: [{ atNo: 120, amountYen: 1_000_000, type: 'shorten', inputIndex: 0 }],
    reduce: [{ atNo: 120, amountYen: 1_000_000, type: 'reduce', inputIndex: 0 }],
    full: [{ atNo: 120, amountYen: 99_000_000, type: 'shorten', inputIndex: 0 }],
    mixed: [
      { atNo: 60, amountYen: 3_000_000, type: 'shorten', inputIndex: 0 },
      { atNo: 61, amountYen: 2_000_000, type: 'reduce', inputIndex: 1 },
      { atNo: 200, amountYen: 4_000_000, type: 'shorten', inputIndex: 2 },
    ],
  };
  let count = 0;
  for (const method of ['equalPayment', 'equalPrincipal']) {
    for (const bonusYen of [0, 8_000_000]) {
      for (const [pname, prepayments] of Object.entries(prepaySets)) {
        for (const rateMilli of [0, 800, 3000]) {
          const s = buildSchedule({ ...base, method, bonusYen, rateMilli, prepayments });
          checkInvariants(`${method}/bonus${bonusYen}/${pname}/${rateMilli}`, s, base.loanYen, method, prepayments.length > 0);
          count++;
        }
      }
    }
  }
  assert.equal(count, 60);
});

test('短い期間・端数のある借入でも不変条件が成り立つ', () => {
  for (const years of [1, 2, 5]) {
    for (const method of ['equalPayment', 'equalPrincipal']) {
      const s = buildSchedule({ loanYen: 1_234_567, bonusYen: 300_001, rateMilli: 1234, years, method, startYm: '2027-07' });
      checkInvariants(`${years}y/${method}`, s, 1_234_567, method, false);
      assert.equal(s.lastNo, years * 12);
    }
  }
});

test('annualize: 開始2027-02 → 初年11か月、年末残高は該当年の最後の行、合計は全行の合計', () => {
  const s = buildSchedule({ ...base, bonusYen: 5_000_000 });
  const a = annualize(s);
  assert.equal(a[0].year, 2027);
  assert.equal(a[0].months, 11);
  assert.equal(a[0].elapsed, 1);
  assert.equal(a[1].months, 12);
  assert.equal(a[1].elapsed, 2);
  assert.equal(a.at(-1).year, 2062);
  assert.equal(a.at(-1).months, 1);
  assert.equal(a.at(-1).endBalance, 0);
  const lastOf2027 = s.rows.filter((r) => r.year === 2027).at(-1);
  assert.equal(a[0].endBalance, lastOf2027.balance);
  assert.equal(a[0].endBalance, s.rows.find((r) => r.ym === '2027-12').balance);
  assert.equal(a.reduce((x, y) => x + y.payment, 0), s.totalPayment);
  assert.equal(a.reduce((x, y) => x + y.interest, 0), s.totalInterest);
  assert.equal(a.reduce((x, y) => x + y.months, 0), s.rows.length);
});

test('yearEndBalanceMap: 開始前年=借入額、完済後=0', () => {
  const s = buildSchedule(base);
  const f = yearEndBalanceMap(s, base.loanYen);
  assert.equal(f(2026), 35_000_000);
  assert.equal(f(2027), s.rows.find((r) => r.ym === '2027-12').balance);
  assert.equal(f(2062), 0);
  assert.equal(f(2070), 0);
});

test('年の途中で完済した場合、その年の行で終わる（以後の年は出さない）', () => {
  const s = buildSchedule({ ...base, years: 3, startYm: '2027-07' });
  const a = annualize(s);
  assert.equal(a.at(-1).year, 2030);
  assert.equal(a.at(-1).months, 6);
});

test('性能: 3ケース×50年×繰上返済3件を3回計算しても十分速い', async () => {
  const { computeCase } = await import('../js/calc/scenario.js');
  const common = { priceYen: 38_000_000, expensesYen: 1_500_000, depositYen: 1_000_000, incomeYen: 6_000_000, startYm: '2027-02' };
  const ded = { enabled: true, moveInYear: 2027, houseKind: 'new', perf: 'zeh', childcare: true, limitOverrideYen: null, rateOverrideMilli: null, yearsOverride: null, incomeTaxYen: null, residentCapYen: 97500 };
  const c = {
    label: 'x', loanYen: 35_000_000, ownFundsMode: 'auto', ownFundsYen: null, rateMilli: 1000, years: 50, method: 'equalPayment',
    bonusYen: 10_000_000, guaranteeType: 'inRate', addMilli: 200, rateIncludesGuarantee: false, lumpMode: 'auto', lumpYen: null,
    prepayments: [
      { afterYears: 5, afterMonths: 0, amountYen: 1_000_000, type: 'shorten' },
      { afterYears: 10, afterMonths: 0, amountYen: 1_000_000, type: 'reduce' },
      { afterYears: 15, afterMonths: 0, amountYen: 1_000_000, type: 'shorten' },
    ],
  };
  const t0 = performance.now();
  for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) computeCase(common, ded, c);
  const ms = performance.now() - t0;
  console.log(`# computeCase 3ケース×3回: ${ms.toFixed(1)}ms`);
  assert.ok(ms < 1000, `計算が遅すぎます: ${ms}ms`);
});
