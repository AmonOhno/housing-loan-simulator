// 1 ケースの全計算（computeCase）と比較表（compareCases）（要件 5・8 章）。純粋関数。
//
// 入力は js/model/validate.js が返す「検証済み・円／ミリ%換算済み」の値。
//   CommonValues    : { priceYen, expensesYen, depositYen, incomeYen|null, startYm }
//   DeductionValues : { enabled, moveInYear, houseKind, perf, childcare, limitOverrideYen|null,
//                       rateOverrideMilli|null, yearsOverride|null, incomeTaxYen|null, residentCapYen }
//   CaseValues      : { label, loanYen, ownFundsMode, ownFundsYen|null, rateMilli, years, method, bonusYen,
//                       guaranteeType, addMilli, rateIncludesGuarantee, lumpMode, lumpYen|null,
//                       prepayments: [{ afterYears, afterMonths, amountYen, type }] }
import { resolveGuarantee } from './guarantee.js';
import { normalizePrepayments, prepayEffect } from './prepay.js';
import { buildSchedule, annualize, yearEndBalanceMap } from './schedule.js';
import { computeFunding } from './funding.js';
import { resolveDeductionDefaults, computeTaxCredit } from './tax-credit.js';
import { DEFAULT_RATE_MILLI } from '../data/deduction-table.js';

/**
 * 返済負担率（%）。年収が null または 0 なら null。小数第 1 位（第 2 位四捨五入）。
 */
export function burdenRatio(firstYearPaymentYen, incomeYen) {
  if (incomeYen === null || incomeYen === undefined || incomeYen === 0) return null;
  return Math.round((firstYearPaymentYen / incomeYen) * 1000) / 10;
}

/** 返済負担率の目安: ≤25 normal、≤35 caution、>35 warning */
function burdenLevelOf(ratio) {
  if (ratio === null) return null;
  if (ratio <= 25) return 'normal';
  if (ratio <= 35) return 'caution';
  return 'warning';
}

/**
 * 1 ケースの全計算。
 * @returns {object} CaseResult（effectiveRateMilli, schedule, annual, funding, guarantee, prepay, taxCredit, summary）
 */
export function computeCase(common, deduction, c) {
  // 1. 保証料
  const guarantee = resolveGuarantee({
    type: c.guaranteeType,
    inputRateMilli: c.rateMilli,
    addMilli: c.addMilli,
    rateIncludesGuarantee: c.rateIncludesGuarantee,
    loanYen: c.loanYen,
    years: c.years,
    lumpMode: c.lumpMode,
    lumpYen: c.lumpYen,
  });
  const effectiveRateMilli = guarantee.effectiveRateMilli;

  // 2. 繰上返済の正規化
  const norm = normalizePrepayments(c.prepayments, c.years * 12);

  // 3. 返済予定（繰上返済あり）と、比較用の繰上返済なし
  const base = {
    loanYen: c.loanYen, bonusYen: c.bonusYen, rateMilli: effectiveRateMilli,
    years: c.years, method: c.method, startYm: common.startYm,
  };
  const schedule = buildSchedule({ ...base, prepayments: norm.items });
  const effect = norm.items.length > 0 ? prepayEffect(schedule, buildSchedule(base)) : null;

  // 4. 年次集計
  const annualRaw = annualize(schedule);

  // 5. 資金計画
  const funding = computeFunding({
    priceYen: common.priceYen,
    expensesYen: common.expensesYen,
    depositYen: common.depositYen,
    loanYen: c.loanYen,
    guaranteeLumpYen: guarantee.lumpYen,
    ownFundsMode: c.ownFundsMode,
    ownFundsYen: c.ownFundsYen,
  });

  // 6. 住宅ローン控除（上書き値があれば優先）
  const defaults = resolveDeductionDefaults({
    houseKind: deduction.houseKind, perf: deduction.perf, moveInYear: deduction.moveInYear, childcare: deduction.childcare,
  });
  const limitYen = deduction.limitOverrideYen ?? defaults.limitYen;
  const rateMilli = deduction.rateOverrideMilli ?? DEFAULT_RATE_MILLI;
  const dedYears = deduction.yearsOverride ?? defaults.years;
  const overridden = deduction.limitOverrideYen != null || deduction.rateOverrideMilli != null || deduction.yearsOverride != null;
  let credit = { rows: [], total: 0 };
  if (deduction.enabled) {
    credit = computeTaxCredit({
      balanceAt: yearEndBalanceMap(schedule, c.loanYen),
      moveInYear: deduction.moveInYear,
      limitYen,
      rateMilli,
      years: dedYears,
      incomeTaxYen: deduction.incomeTaxYen,
      residentCapYen: deduction.residentCapYen,
    });
  }
  const creditByYear = new Map(credit.rows.map((r) => [r.year, r.credit]));
  const annual = annualRaw.map((a) => ({ ...a, taxCredit: creditByYear.get(a.year) ?? 0 }));
  const taxCredit = {
    enabled: deduction.enabled,
    rows: credit.rows,
    total: credit.total,
    limitYen,
    rateMilli,
    years: dedYears,
    eligible: limitYen > 0 && dedYears > 0,
    notes: defaults.notes,
    needsCheck: defaults.needsCheck,
    overridden,
  };

  // 7〜8. サマリー
  const ratio = burdenRatio(schedule.firstYearPayment, common.incomeYen);
  const totalPaid = schedule.totalPayment + guarantee.lumpYen;
  const summary = {
    initialMonthly: schedule.initialMonthly,
    lastMonthly: schedule.lastMonthly,
    initialBonus: schedule.initialBonus,
    lastBonus: schedule.lastBonus,
    firstYearPayment: schedule.firstYearPayment,
    totalPayment: schedule.totalPayment,
    totalInterest: schedule.totalInterest,
    lumpYen: guarantee.lumpYen,
    totalPaid,
    burdenRatio: ratio,
    burdenLevel: burdenLevelOf(ratio),
    lastYm: schedule.lastYm,
    monthsShortened: effect ? effect.monthsShortened : 0,
    realBurden: totalPaid - credit.total,
  };

  return {
    label: c.label,
    loanYen: c.loanYen,
    years: c.years,
    method: c.method,
    effectiveRateMilli,
    schedule,
    annual,
    funding,
    guarantee,
    prepay: { items: norm.items, warnings: norm.warnings, log: schedule.prepayLog, effect },
    taxCredit,
    summary,
  };
}

/**
 * 比較表。各セルは { value, diff, diffDirection }。基準ケース・エラーのケース（null）は diff なし。
 * 行の unit: 'yen' | 'percent' | 'ratio' | 'years' | 'method' | 'ym'
 * @param {Array<object|null>} results
 * @param {number} baseIndex
 */
export function compareCases(results, baseIndex) {
  const base = results[baseIndex] ?? null;
  const defs = [
    ['loan', '借入額', 'yen', (r) => r.loanYen, true],
    ['ownFunds', '自己資金', 'yen', (r) => r.funding.ownFunds, true],
    ['cashAtSettlement', '決済時必要現金', 'yen', (r) => r.funding.cashAtSettlement, true],
    ['effectiveRate', '適用金利（計算に使った金利）', 'percent', (r) => r.effectiveRateMilli / 1000, false],
    ['years', '借入期間', 'years', (r) => r.years, false],
    ['method', '返済方式', 'method', (r) => r.method, false],
    ['monthly', '毎月返済額', 'yen', (r) => r.summary.initialMonthly, true],
    ['bonus', 'ボーナス月加算額', 'yen', (r) => r.summary.initialBonus, true],
    ['totalPayment', '総返済額', 'yen', (r) => r.summary.totalPayment, true],
    ['totalInterest', '総利息', 'yen', (r) => r.summary.totalInterest, true],
    ['lump', '一括保証料', 'yen', (r) => r.summary.lumpYen, true],
    ['totalPaid', '総支払額（総返済額＋一括保証料）', 'yen', (r) => r.summary.totalPaid, true],
    ['burden', '返済負担率', 'ratio', (r) => r.summary.burdenRatio, true],
    ['taxCredit', '住宅ローン控除の合計（概算）', 'yen', (r) => r.taxCredit.total, true],
    ['realBurden', '実質負担（総支払額 − 控除合計）', 'yen', (r) => r.summary.realBurden, true],
    ['lastYm', '完済時期', 'ym', (r) => r.summary.lastYm, false],
  ];
  const rows = defs.map(([key, label, unit, pick, withDiff]) => {
    const baseValue = base ? pick(base) : null;
    const cells = results.map((r, i) => {
      if (!r) return { value: null, diff: null, diffDirection: null };
      const value = pick(r);
      if (!withDiff || !base || i === baseIndex || value === null || baseValue === null) {
        return { value, diff: null, diffDirection: null };
      }
      let diff = value - baseValue;
      if (unit === 'ratio') diff = Math.round(diff * 10) / 10; // ポイント差（小数第 1 位）
      return { value, diff, diffDirection: diff > 0 ? 'more' : diff < 0 ? 'less' : 'same' };
    });
    return { key, label, unit, cells };
  });
  return { baseIndex, rows };
}
