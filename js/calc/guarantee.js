// 保証料方式 → 計算に使う金利・一括保証料（要件 6.5）。純粋関数。
import { LUMP_UNIT_TABLE } from '../data/guarantee-table.js';

/**
 * 借入 100 万円あたりの一括保証料の目安（円）。
 * 10〜35 年は線形補間、10 年未満は 10 年の単価を期間比で按分、35 年超は 35 年の単価（範囲外）。
 * @param {number} years
 * @returns {{ unit: number, outOfRange: boolean }}
 */
export function guaranteeUnitPerMillion(years) {
  const first = LUMP_UNIT_TABLE[0];
  const last = LUMP_UNIT_TABLE[LUMP_UNIT_TABLE.length - 1];
  if (years < first[0]) return { unit: (first[1] * years) / first[0], outOfRange: false };
  if (years > last[0]) return { unit: last[1], outOfRange: true };
  for (let i = 0; i < LUMP_UNIT_TABLE.length - 1; i++) {
    const [y0, u0] = LUMP_UNIT_TABLE[i];
    const [y1, u1] = LUMP_UNIT_TABLE[i + 1];
    if (years >= y0 && years <= y1) {
      return { unit: u0 + ((u1 - u0) * (years - y0)) / (y1 - y0), outOfRange: false };
    }
  }
  return { unit: last[1], outOfRange: false };
}

/**
 * 保証料方式から、計算に使う金利と一括保証料を決める。
 * @param {object} p
 * @param {'inRate'|'lump'|'none'} p.type
 * @param {number} p.inputRateMilli 入力した金利（ミリ%）
 * @param {number} p.addMilli 上乗せ幅（金利内包型。ミリ%）
 * @param {boolean} p.rateIncludesGuarantee 入力金利が上乗せ済みか
 * @param {number} p.loanYen
 * @param {number} p.years
 * @param {'auto'|'manual'} p.lumpMode
 * @param {number|null} p.lumpYen 手入力時のみ
 */
export function resolveGuarantee({
  type, inputRateMilli, addMilli, rateIncludesGuarantee, loanYen, years, lumpMode, lumpYen,
}) {
  const notes = [];
  if (type === 'inRate') {
    return {
      effectiveRateMilli: rateIncludesGuarantee ? inputRateMilli : inputRateMilli + addMilli,
      lumpYen: 0,
      lumpUnitPerMillion: null,
      notes,
    };
  }
  if (type === 'lump') {
    if (lumpMode === 'manual') {
      return { effectiveRateMilli: inputRateMilli, lumpYen: lumpYen ?? 0, lumpUnitPerMillion: null, notes };
    }
    const { unit, outOfRange } = guaranteeUnitPerMillion(years);
    if (outOfRange) notes.push('目安の範囲外（35 年超）。35 年の単価を使っています');
    // 1,000 円未満を四捨五入
    const lump = Math.round((loanYen * unit) / 1_000_000 / 1000) * 1000;
    return { effectiveRateMilli: inputRateMilli, lumpYen: lump, lumpUnitPerMillion: unit, notes };
  }
  return { effectiveRateMilli: inputRateMilli, lumpYen: 0, lumpUnitPerMillion: null, notes };
}
