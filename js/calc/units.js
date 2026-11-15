// 単位変換・年月演算・端数処理ヘルパー（純粋関数。DOM 等には依存しない）
// 内部単位: 金額＝円の整数、金利＝ミリ%（年率% × 1000 の整数）、年月＝"YYYY-MM"

/** 万円 → 円（円未満四捨五入） */
export function manToYen(man) {
  return Math.round(man * 10000);
}

/** 円 → 万円（表示用。丸めない） */
export function yenToMan(yen) {
  return yen / 10000;
}

/** 年率% → ミリ%（1.2% → 1200） */
export function percentToMilli(pct) {
  return Math.round(pct * 1000);
}

/** ミリ% → 年率% */
export function milliToPercent(m) {
  return m / 1000;
}

/** 公式（べき乗を含む）の結果用の切り捨て。2916.9999999 のような誤差を吸収する */
export function floorYen(x) {
  return Math.floor(x + 1e-7);
}

/** unit 未満を切り捨てる（控除額の 100 円未満切り捨てなど） */
export function floorTo(yen, unit) {
  return Math.floor(yen / unit) * unit;
}

/** "YYYY-MM" → { year, month }。不正なら例外 */
export function parseYm(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym));
  if (!m) throw new Error('年月の形式が不正です（YYYY-MM）');
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error('年月の月が不正です');
  return { year, month };
}

/** "YYYY-MM" → 通し月（年 × 12 + 月 − 1） */
export function ymToIndex(ym) {
  const { year, month } = parseYm(ym);
  return year * 12 + (month - 1);
}

/** 通し月 → "YYYY-MM" */
export function indexToYm(idx) {
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** k か月後の年月 */
export function addMonths(ym, k) {
  return indexToYm(ymToIndex(ym) + k);
}

/** 毎月分の 1 回の利息（円未満切り捨て）。整数演算のみ */
export function monthlyInterest(bal, rateMilli) {
  return Math.floor((bal * rateMilli) / 1_200_000);
}

/** ボーナス分の半年あたりの利息（円未満切り捨て） */
export function halfYearInterest(bal, rateMilli) {
  return Math.floor((bal * rateMilli) / 200_000);
}
