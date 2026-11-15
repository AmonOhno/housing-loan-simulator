// 表示用の整形。

const nf = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

export const num = (n) => nf.format(Math.round(n));

/** 3,500,000 円 */
export function yen(n) {
  if (n === null || n === undefined) return '—';
  return `${nf.format(Math.round(n))} 円`;
}

/** 万円表示（小数第 1 位まで、末尾の .0 は省略）。引数は円 */
export function man(n) {
  if (n === null || n === undefined) return '—';
  return `${nf1.format(n / 10000)} 万円`;
}

/** 3,500,000 円（約 350 万円）。1 万円未満は円のみ */
export function yenWithMan(n) {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) < 10000) return yen(n);
  return `${yen(n)}（約 ${nf1.format(n / 10000)} 万円）`;
}

export function percent(p, digits = 3) {
  if (p === null || p === undefined) return '—';
  return `${Number(p.toFixed(digits))}%`;
}

/** 2027-02 → 2027年2月 */
export function ymLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  return m ? `${m[1]}年${Number(m[2])}月` : '—';
}

export const METHOD_LABEL = { equalPayment: '元利均等', equalPrincipal: '元金均等' };

/** 月数 → ○年○か月 */
export function monthsLabel(m) {
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (y > 0 && r > 0) return `${y} 年 ${r} か月`;
  if (y > 0) return `${y} 年`;
  return `${r} か月`;
}

export const BURDEN_LABEL = {
  normal: ['目安内', '✓'],
  caution: ['注意', '⚠'],
  warning: ['警告', '⚠'],
};

/** 差額の文言。unit: yen / ratio。direction: more / less / same */
export function diffText(diff, unit, direction) {
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
  const abs = Math.abs(diff);
  const body = unit === 'ratio' ? `${sign}${nf1.format(abs)} ポイント` : `${sign}${nf.format(Math.round(abs))} 円`;
  const word = direction === 'more' ? '基準より多い' : direction === 'less' ? '基準より少ない' : '同じ';
  return `${body}（${word}）`;
}

/** 資金計画の警告コード → 日本語 */
export function fundingWarning(code) {
  if (code === 'loanExceedsRequired') return '借入額が必要資金を超えています（自己資金がマイナスになるため、申込書として成立しません）。';
  if (code === 'notTenThousandUnit') return '借入額は通常 10 万円単位です。申込書の金額を確認してください。';
  return code;
}
