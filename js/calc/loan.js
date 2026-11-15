// 返済額の公式（要件 6.2〜6.4）。純粋関数。
import { floorYen } from './units.js';

/**
 * 元利均等の 1 回あたり返済額（円未満切り捨て）。
 * @param {number} principal 元本（円）
 * @param {number} rateMilli 年利（ミリ%）
 * @param {number} count 返済回数
 * @param {12|2} periodsPerYear 12（毎月）または 2（ボーナス・半年ごと）
 * @returns {number}
 */
export function levelPayment(principal, rateMilli, count, periodsPerYear) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('返済回数は 1 以上の整数にしてください');
  }
  if (principal === 0) return 0;
  const i = rateMilli / 100000 / periodsPerYear;
  if (i === 0) return floorYen(principal / count); // 金利 0%: ゼロ除算を避ける
  const pow = (1 + i) ** count;
  return floorYen((principal * i * pow) / (pow - 1));
}

/**
 * 元金均等の 1 回あたり元金（円未満切り捨て。端数は最終回で調整）。
 * @param {number} principal 元本（円）
 * @param {number} count 返済回数
 * @returns {number}
 */
export function equalPrincipalUnit(principal, count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('返済回数は 1 以上の整数にしてください');
  }
  return Math.floor(principal / count);
}
