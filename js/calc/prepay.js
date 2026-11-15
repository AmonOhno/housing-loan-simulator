// 繰上返済の正規化・按分・効果の算出（要件 6.8）。純粋関数。

/**
 * 画面の繰上返済入力を、回数換算・並べ替えした形にする。
 * @param {Array<{afterYears:number, afterMonths:number, amountYen:number, type:'shorten'|'reduce'}>} list
 * @param {number} totalCount 当初の返済回数
 */
export function normalizePrepayments(list, totalCount) {
  const items = [];
  const warnings = [];
  (list || []).forEach((p, inputIndex) => {
    const atNo = p.afterYears * 12 + p.afterMonths;
    if (atNo < 1 || atNo >= totalCount) {
      warnings.push({ inputIndex, message: '実行時期は 1 か月以上・最終回より前にしてください' });
      return;
    }
    if (!(p.amountYen > 0)) {
      warnings.push({ inputIndex, message: '繰上返済額は 1 円以上にしてください' });
      return;
    }
    items.push({ atNo, amountYen: p.amountYen, type: p.type, inputIndex });
  });
  // 実行時期の早い順。同じ時期は入力順（安定ソート）
  items.sort((a, b) => a.atNo - b.atNo || a.inputIndex - b.inputIndex);
  return { items, warnings };
}

/**
 * 繰上返済額を、毎月分とボーナス分に残高比で按分する。
 * @returns {{ toMonthly:number, toBonus:number, full:boolean }}
 */
export function splitPrepayment(amountYen, monthlyBal, bonusBal) {
  const total = monthlyBal + bonusBal;
  if (amountYen >= total) return { toMonthly: monthlyBal, toBonus: bonusBal, full: true };
  let toMonthly = Math.floor((amountYen * monthlyBal) / total);
  let toBonus = amountYen - toMonthly;
  if (toBonus > bonusBal) {
    toBonus = bonusBal;
    toMonthly = amountYen - bonusBal;
  } else if (toMonthly > monthlyBal) {
    toMonthly = monthlyBal;
    toBonus = amountYen - monthlyBal;
  }
  return { toMonthly, toBonus, full: false };
}

/**
 * 繰上返済ありとなしの返済予定を比べる。
 * @returns {{ interestSaved:number, monthsShortened:number, reducedPayment:number|null, reducedBonus:number|null }}
 */
export function prepayEffect(withPrepay, without) {
  return {
    interestSaved: without.totalInterest - withPrepay.totalInterest,
    monthsShortened: without.lastNo - withPrepay.lastNo,
    reducedPayment: withPrepay.monthlyAfterReduce ?? null,
    reducedBonus: withPrepay.bonusAfterReduce ?? null,
  };
}
