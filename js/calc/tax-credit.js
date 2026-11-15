// 住宅ローン控除の初期値解決と年別控除額（要件 9 章）。純粋関数。
import { RULES } from '../data/deduction-table.js';
import { manToYen, floorTo } from './units.js';

/**
 * 取得の種類・性能区分・入居年・子育て世帯から、借入限度額と控除期間の初期値を引く。
 * @returns {{ limitYen:number, years:number, eligible:boolean, notes:string[], needsCheck:boolean }}
 */
export function resolveDeductionDefaults({ houseKind, perf, moveInYear, childcare }) {
  const rule = RULES.find(
    (r) => r.houseKind === houseKind && r.perf === perf && moveInYear >= r.fromYear && moveInYear <= r.toYear,
  );
  if (!rule) {
    return { limitYen: 0, years: 0, eligible: false, notes: ['この入居年・区分の制度値がありません。限度額・期間を手入力してください'], needsCheck: true };
  }
  const limitMan = childcare ? rule.limitMan.childcare : rule.limitMan.general;
  const eligible = limitMan > 0 && rule.years > 0;
  return {
    limitYen: manToYen(limitMan),
    years: rule.years,
    eligible,
    notes: rule.note ? [rule.note] : [],
    needsCheck: rule.needsCheck,
  };
}

/**
 * 年別の控除額を計算する。
 * @param {object} p
 * @param {(year:number)=>number} p.balanceAt 暦年末残高（yearEndBalanceMap の戻り値）
 * @param {number} p.moveInYear 入居年（1 年目）
 * @param {number} p.limitYen 借入限度額
 * @param {number} p.rateMilli 控除率（0.7% → 700）
 * @param {number} p.years 控除期間
 * @param {number|null} p.incomeTaxYen 所得税額（年額）。null なら所得税での頭打ちなし
 * @param {number} p.residentCapYen 住民税からの控除上限（年額）
 */
export function computeTaxCredit({ balanceAt, moveInYear, limitYen, rateMilli, years, incomeTaxYen, residentCapYen }) {
  if (years === 0 || limitYen === 0) return { rows: [], total: 0 };
  const rows = [];
  let total = 0;
  for (let nth = 1; nth <= years; nth++) {
    const year = moveInYear + nth - 1;
    const balance = balanceAt(year);
    const target = Math.min(balance, limitYen);
    const capable = floorTo(Math.floor((target * rateMilli) / 100000), 100);
    const fromIncomeTax = incomeTaxYen === null ? capable : Math.min(capable, incomeTaxYen);
    const fromResident = Math.min(capable - fromIncomeTax, residentCapYen);
    const credit = fromIncomeTax + fromResident;
    rows.push({
      year, nth, balance, target, capable, fromIncomeTax, fromResident, credit,
      cappedByLimit: balance > limitYen,
      cappedByTax: credit < capable,
    });
    total += credit;
  }
  return { rows, total };
}
