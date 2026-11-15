// 資金計画（必要資金・調達資金・差額・決済時必要現金）（要件 7 章）。純粋関数。
// 警告はコード文字列で返し、日本語文言への変換は UI 側（format.js）で行う。
//   'loanExceedsRequired' : 借入額 > 必要資金（自己資金がマイナスになる）
//   'notTenThousandUnit'  : 借入額が 10 万円単位でない

/**
 * @param {object} p
 * @param {number} p.priceYen 物件価格（売買契約金額）
 * @param {number} p.expensesYen 諸経費（一括保証料を除く）
 * @param {number} p.depositYen 手付金（支払済み。自己資金の内訳）
 * @param {number} p.loanYen
 * @param {number} p.guaranteeLumpYen 一括保証料（一括前払型のみ。それ以外は 0）
 * @param {'auto'|'manual'} p.ownFundsMode
 * @param {number|null} p.ownFundsYen 手入力時のみ
 */
export function computeFunding({ priceYen, expensesYen, depositYen, loanYen, guaranteeLumpYen, ownFundsMode, ownFundsYen }) {
  const expensesTotal = expensesYen + guaranteeLumpYen;
  const required = priceYen + expensesTotal;
  const ownFunds = ownFundsMode === 'manual' ? (ownFundsYen ?? 0) : required - loanYen;
  const raised = loanYen + ownFunds;
  const diff = raised - required;
  const status = diff === 0 ? 'match' : diff < 0 ? 'short' : 'over';
  const cashAtSettlement = ownFunds - depositYen;
  const warnings = [];
  if (loanYen > required) warnings.push('loanExceedsRequired');
  if (loanYen % 100000 !== 0) warnings.push('notTenThousandUnit');
  return {
    expensesTotal,
    required,
    ownFunds,
    raised,
    diff,
    status,
    deposit: depositYen,
    cashAtSettlement,
    depositReturned: cashAtSettlement < 0 ? -cashAtSettlement : 0,
    warnings,
    fillOwnFunds: required - loanYen,
  };
}
