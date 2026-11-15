// 月次返済予定の生成（ボーナス・繰上返済込み）と暦年集計（要件 6.2〜6.8、6.7）。純粋関数。
// 毎月分とボーナス分を別々の「口」として並行に進め、合算して行を作る。
import { monthlyInterest, halfYearInterest, ymToIndex, indexToYm } from './units.js';
import { levelPayment, equalPrincipalUnit } from './loan.js';
import { splitPrepayment } from './prepay.js';

/**
 * 口（毎月分／ボーナス分）の初期化。
 * @param {number} principal 元本
 * @param {number} rateMilli
 * @param {number} count 返済回数
 * @param {12|2} perYear
 * @param {string} method
 * @param {number} endNo 予定最終回（通し回数）
 */
function makeAccount(principal, rateMilli, count, perYear, method, endNo) {
  const acc = { bal: principal, perYear, method, endNo, pay: 0, unit: 0 };
  if (principal > 0) setAmounts(acc, rateMilli, count);
  return acc;
}

/** 現在の残高と残り回数から、返済額（元利均等）または元金（元金均等）を決め直す */
function setAmounts(acc, rateMilli, count) {
  if (acc.method === 'equalPayment') acc.pay = levelPayment(acc.bal, rateMilli, count, acc.perYear);
  else acc.unit = equalPrincipalUnit(acc.bal, count);
}

function interestOf(acc, rateMilli, bal) {
  return acc.perYear === 12 ? monthlyInterest(bal, rateMilli) : halfYearInterest(bal, rateMilli);
}

/** 通常回の元金（最終回は残高全額。端数はここで調整） */
function principalOf(acc, interest, no) {
  let principal = acc.method === 'equalPayment' ? acc.pay - interest : acc.unit;
  if (principal < 0) principal = 0; // 理論上起きない安全策
  if (no >= acc.endNo || principal >= acc.bal) principal = acc.bal;
  return principal;
}

/** 現在の返済額のまま進めたとき、残高が尽きる回を前方シミュレーションで求める（期間短縮型） */
function findEndNo(acc, rateMilli, fromNo) {
  const isBonus = acc.perYear === 2;
  const stepNo = isBonus ? 6 : 1;
  let bal = acc.bal;
  let k = isBonus ? (Math.floor(fromNo / 6) + 1) * 6 : fromNo + 1;
  for (; k < acc.endNo; k += stepNo) {
    const interest = interestOf(acc, rateMilli, bal);
    let principal = acc.method === 'equalPayment' ? acc.pay - interest : acc.unit;
    if (principal < 0) principal = 0;
    if (principal >= bal) return k;
    bal -= principal;
  }
  return acc.endNo;
}

/**
 * 月次返済予定を作る。
 * @param {object} p
 * @param {number} p.loanYen 借入額 P
 * @param {number} p.bonusYen ボーナス返済分 Pb（0 可）
 * @param {number} p.rateMilli 計算に使う年利 R（保証料上乗せ後。ミリ%）
 * @param {number} p.years 借入年数
 * @param {'equalPayment'|'equalPrincipal'} p.method
 * @param {string} p.startYm 1 回目の返済年月 "YYYY-MM"
 * @param {Array} [p.prepayments] normalizePrepayments().items
 */
export function buildSchedule({ loanYen, bonusYen = 0, rateMilli, years, method, startYm, prepayments = [] }) {
  const n = years * 12;
  const nb = years * 2;
  const M = makeAccount(loanYen - bonusYen, rateMilli, n, 12, method, n);
  const B = makeAccount(bonusYen, rateMilli, nb, 2, method, n);
  const startIdx = ymToIndex(startYm);
  const rows = [];
  const prepayLog = [];
  const queue = prepayments.slice();
  let monthlyAfterReduce = null;
  let bonusAfterReduce = null;

  for (let no = 1; M.bal > 0 || B.bal > 0; no++) {
    if (no > n + 1) throw new Error('返済予定の生成が収束しませんでした（内部エラー）');

    let mInt = 0, mPrin = 0, bInt = 0, bPrin = 0;
    if (M.bal > 0) {
      mInt = interestOf(M, rateMilli, M.bal);
      mPrin = principalOf(M, mInt, no);
      M.bal -= mPrin;
    }
    if (B.bal > 0 && no % 6 === 0) {
      bInt = interestOf(B, rateMilli, B.bal);
      bPrin = principalOf(B, bInt, no);
      B.bal -= bPrin;
    }

    // この回の直後の繰上返済
    let prepayTotal = 0;
    while (queue.length > 0 && queue[0].atNo === no) {
      const item = queue.shift();
      if (M.bal + B.bal === 0) {
        prepayLog.push({ atNo: item.atNo, amountYen: 0, type: item.type, full: false, ignored: '完済後のため適用しません' });
        continue;
      }
      const { toMonthly, toBonus, full } = splitPrepayment(item.amountYen, M.bal, B.bal);
      M.bal -= toMonthly;
      B.bal -= toBonus;
      prepayTotal += toMonthly + toBonus;
      prepayLog.push({ atNo: item.atNo, amountYen: toMonthly + toBonus, type: item.type, full });
      if (full || (M.bal === 0 && B.bal === 0)) continue;

      if (item.type === 'shorten') {
        // 返済額は変えず、残高が尽きる回を求め直す
        if (M.bal > 0) M.endNo = findEndNo(M, rateMilli, no);
        if (B.bal > 0) B.endNo = findEndNo(B, rateMilli, no);
      } else {
        // 返済額軽減型: 完済時期を変えず、残り回数で返済額を再計算
        if (B.bal > 0) {
          const remB = Math.floor(B.endNo / 6) - Math.floor(no / 6);
          if (remB >= 1) {
            setAmounts(B, rateMilli, remB);
            bonusAfterReduce = B.method === 'equalPayment' ? B.pay : B.unit;
          } else {
            // ボーナスの残り回数が 0 なのに残高がある（まれ）: 毎月分に移して再計算
            if (M.bal === 0) M.endNo = Math.max(B.endNo, no + 1);
            M.bal += B.bal;
            B.bal = 0;
          }
        }
        if (M.bal > 0) {
          const remM = Math.max(1, M.endNo - no);
          if (M.endNo - no < 1) M.endNo = no + 1;
          setAmounts(M, rateMilli, remM);
          monthlyAfterReduce = M.method === 'equalPayment' ? M.pay : M.unit + interestOf(M, rateMilli, M.bal);
        }
      }
    }

    const idx = startIdx + no - 1;
    rows.push({
      no,
      ym: indexToYm(idx),
      year: Math.floor(idx / 12),
      month: (idx % 12) + 1,
      monthlyPayment: mPrin + mInt,
      monthlyPrincipal: mPrin,
      monthlyInterest: mInt,
      bonusPayment: bPrin + bInt,
      bonusPrincipal: bPrin,
      bonusInterest: bInt,
      payment: mPrin + mInt + bPrin + bInt,
      principal: mPrin + bPrin,
      interest: mInt + bInt,
      prepay: prepayTotal,
      monthlyBalance: M.bal,
      bonusBalance: B.bal,
      balance: M.bal + B.bal,
    });
  }

  // 最後まで残った繰上返済（完済後のもの）
  for (const item of queue) {
    prepayLog.push({ atNo: item.atNo, amountYen: 0, type: item.type, full: false, ignored: '完済後のため適用しません' });
  }

  let totalPaymentSum = 0, totalInterest = 0, totalPrepay = 0, firstYearPayment = 0;
  for (const r of rows) {
    totalPaymentSum += r.payment;
    totalInterest += r.interest;
    totalPrepay += r.prepay;
    if (r.no <= 12) firstYearPayment += r.payment;
  }
  const firstBonusRow = rows.find((r) => r.bonusPayment > 0);
  const lastBonusRow = [...rows].reverse().find((r) => r.bonusPayment > 0);
  const lastMonthlyRow = [...rows].reverse().find((r) => r.monthlyPayment > 0);
  const lastRow = rows[rows.length - 1];

  return {
    rows,
    lastNo: lastRow ? lastRow.no : 0,
    lastYm: lastRow ? lastRow.ym : startYm,
    initialMonthly: rows.length ? rows[0].monthlyPayment : 0,
    lastMonthly: lastMonthlyRow ? lastMonthlyRow.monthlyPayment : 0,
    initialBonus: firstBonusRow ? firstBonusRow.bonusPayment : 0,
    lastBonus: lastBonusRow ? lastBonusRow.bonusPayment : 0,
    monthlyAfterReduce,
    bonusAfterReduce,
    firstYearPayment,
    totalPayment: totalPaymentSum + totalPrepay,
    totalInterest,
    totalPrepay,
    prepayLog,
  };
}

/**
 * 暦年（1〜12 月）で集計する。年末残高はその年の最後の行の残高。
 * @param {ReturnType<typeof buildSchedule>} result
 */
export function annualize(result) {
  const out = [];
  const startYear = result.rows.length ? result.rows[0].year : 0;
  let cur = null;
  for (const r of result.rows) {
    if (!cur || cur.year !== r.year) {
      cur = { year: r.year, elapsed: r.year - startYear + 1, months: 0, payment: 0, principal: 0, interest: 0, prepay: 0, endBalance: 0 };
      out.push(cur);
    }
    cur.months += 1;
    cur.payment += r.payment;
    cur.principal += r.principal;
    cur.interest += r.interest;
    cur.prepay += r.prepay;
    cur.endBalance = r.balance;
  }
  return out;
}

/**
 * 暦年末残高を引く関数を返す。開始年より前は借入額、完済後は 0。
 * @returns {(year:number)=>number}
 */
export function yearEndBalanceMap(result, loanYen) {
  const byYear = new Map();
  for (const r of result.rows) byYear.set(r.year, r.balance);
  const first = result.rows.length ? result.rows[0].year : Infinity;
  const last = result.rows.length ? result.rows[result.rows.length - 1].year : -Infinity;
  return (year) => {
    if (year < first) return loanYen;
    if (year > last) return 0;
    return byYear.get(year) ?? 0;
  };
}
