// 入力文字列の正規化・数値化・範囲チェック（要件 4 章）。純粋関数。
// 範囲外の値は丸めずエラーにする。出力 values は円・ミリ%に換算済み。
import { manToYen, percentToMilli } from '../calc/units.js';
import { MAX_PREPAYMENTS } from '../data/defaults.js';
import { DEFAULT_RESIDENT_CAP_MAN } from '../data/deduction-table.js';

/** 全角→半角、カンマ・空白の除去、全角マイナス／ピリオドの対応 */
export function normalizeNumberText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[−‐-―－]/g, '-')
    .replace(/[,\s　]/g, '');
}

/** 数値として解釈する。空文字は { ok:false, empty:true } */
export function parseNumber(s) {
  const t = normalizeNumberText(s);
  if (t === '') return { ok: false, empty: true };
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return { ok: false, empty: false };
  return { ok: true, value: Number(t) };
}

const fmt = (n) => n.toLocaleString('ja-JP');

/** 数値欄を検証。成功: { value }（空欄を許す場合は null）。失敗: エラー文言を errors[key] に入れて undefined */
function readNumber(raw, spec, errors, key) {
  const { label, unit = '', min, max, integer = false, decimals = null, required = true } = spec;
  const p = parseNumber(raw);
  if (!p.ok) {
    if (p.empty) {
      if (required) { errors[key] = `${label}を入力してください`; return undefined; }
      return { value: null };
    }
    errors[key] = `${label}は数値で入力してください（例: 3,500）`;
    return undefined;
  }
  const v = p.value;
  if (integer && !Number.isInteger(v)) {
    errors[key] = `${label}は整数で入力してください`;
    return undefined;
  }
  if (decimals !== null && !integer) {
    const frac = (normalizeNumberText(raw).split('.')[1] ?? '').replace(/0+$/, '');
    if (frac.length > decimals) {
      errors[key] = `${label}は小数第 ${decimals} 位までで入力してください`;
      return undefined;
    }
  }
  if (v < min || v > max) {
    errors[key] = `${label}は ${fmt(min)}〜${fmt(max)}${unit}の範囲で入力してください`;
    return undefined;
  }
  return { value: v };
}

function readEnum(raw, allowed, label, errors, key) {
  if (allowed.includes(raw)) return raw;
  errors[key] = `${label}の選択が不正です`;
  return undefined;
}

function toBool(v) {
  return v === true || v === 'true' || v === '1' || v === 'on';
}

/** 共通項目（物件価格・諸経費・手付金・年収・返済開始年月）を検証する */
export function validateCommon(raw) {
  const errors = {};
  const price = readNumber(raw.price, { label: '物件価格', unit: ' 万円', min: 0, max: 100000 }, errors, 'price');
  const expenses = readNumber(raw.expenses, { label: '諸経費', unit: ' 万円', min: 0, max: 10000 }, errors, 'expenses');
  const deposit = readNumber(raw.deposit, { label: '手付金', unit: ' 万円', min: 0, max: 100000 }, errors, 'deposit');
  const income = readNumber(raw.income, { label: '税込年収', unit: ' 万円', min: 0, max: 100000, required: false }, errors, 'income');
  if (price && deposit && deposit.value > price.value) {
    errors.deposit = '手付金は物件価格以下で入力してください';
  }

  let startYm;
  const ymText = normalizeNumberText(raw.startYm).replace(/\//g, '-');
  const m = /^(\d{4})-(\d{1,2})$/.exec(ymText);
  if (!ymText) errors.startYm = '返済開始年月を入力してください';
  else if (!m) errors.startYm = '返済開始年月は YYYY-MM の形式で入力してください（例: 2027-02）';
  else {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year < 2020 || year > 2060 || month < 1 || month > 12) {
      errors.startYm = '返済開始年月は 2020-01〜2060-12 の範囲で入力してください';
    } else {
      startYm = `${m[1]}-${String(month).padStart(2, '0')}`;
    }
  }

  if (Object.keys(errors).length > 0) return { values: null, errors };
  return {
    values: {
      priceYen: manToYen(price.value),
      expensesYen: manToYen(expenses.value),
      depositYen: manToYen(deposit.value),
      incomeYen: income.value === null ? null : manToYen(income.value),
      startYm,
    },
    errors,
  };
}

/** 住宅ローン控除の項目を検証する。無効（enabled=false）のときは上書き欄を検証しない */
export function validateDeduction(raw) {
  const errors = {};
  const enabled = toBool(raw.enabled);
  const moveIn = readNumber(raw.moveInYear, { label: '入居年', unit: ' 年', min: 2026, max: 2030, integer: true }, errors, 'moveInYear');
  const houseKind = readEnum(raw.houseKind, ['new', 'existing'], '取得の種類', errors, 'houseKind');
  const perf = readEnum(raw.perf, ['certified', 'zeh', 'energy', 'other'], '住宅の性能区分', errors, 'perf');

  let limitOverride = null, rateOverride = null, yearsOverride = null, incomeTax = null;
  let residentCap = { value: DEFAULT_RESIDENT_CAP_MAN };
  if (enabled) {
    limitOverride = readNumber(raw.limitOverride, { label: '借入限度額', unit: ' 万円', min: 0, max: 10000, required: false }, errors, 'limitOverride');
    rateOverride = readNumber(raw.rateOverride, { label: '控除率', unit: ' %', min: 0, max: 2, decimals: 3, required: false }, errors, 'rateOverride');
    yearsOverride = readNumber(raw.yearsOverride, { label: '控除期間', unit: ' 年', min: 0, max: 20, integer: true, required: false }, errors, 'yearsOverride');
    incomeTax = readNumber(raw.incomeTax, { label: '所得税額', unit: ' 万円', min: 0, max: 100000, required: false }, errors, 'incomeTax');
    const cap = readNumber(raw.residentCap, { label: '住民税からの控除上限', unit: ' 万円', min: 0, max: 20, required: false }, errors, 'residentCap');
    if (cap && cap.value !== null) residentCap = cap; // 空欄は初期値（9.75 万円）
    else if (!cap) residentCap = undefined;
  }

  if (Object.keys(errors).length > 0) return { values: null, errors };
  return {
    values: {
      enabled,
      moveInYear: moveIn.value,
      houseKind,
      perf,
      childcare: toBool(raw.childcare),
      limitOverrideYen: limitOverride && limitOverride.value !== null ? manToYen(limitOverride.value) : null,
      rateOverrideMilli: rateOverride && rateOverride.value !== null ? percentToMilli(rateOverride.value) : null,
      yearsOverride: yearsOverride && yearsOverride.value !== null ? yearsOverride.value : null,
      incomeTaxYen: incomeTax && incomeTax.value !== null ? manToYen(incomeTax.value) : null,
      residentCapYen: manToYen(residentCap.value),
    },
    errors,
  };
}

/**
 * ケース 1 件を検証する。
 * エラーのキーは入力欄の ID と同じ（label, loan, ownFunds, rate, years, bonusPrincipal,
 * guaranteeRateAdd, guaranteeLump）。繰上返済は `prepayments.0.amount` の形。
 * 実行時期の組み合わせ（1 か月以上・最終回より前）のエラーは `prepayments.N.afterYears` に出す。
 * @param {object} raw
 * @param {object|null} _commonValues 共通項目の検証済み値（現状は未使用。将来の相互チェック用）
 */
export function validateCase(raw, _commonValues = null) {
  const errors = {};
  const notices = {};

  const label = String(raw.label ?? '').trim();
  if ([...label].length > 20) errors.label = 'ケース名は 20 文字以内にしてください';

  const loan = readNumber(raw.loan, { label: '借入額', unit: ' 万円', min: 1, max: 100000 }, errors, 'loan');
  if (loan && Math.abs(loan.value / 10 - Math.round(loan.value / 10)) > 1e-9) {
    notices.loan = '借入額は通常 10 万円単位です。申込書の金額を確認してください';
  }

  const ownFundsMode = readEnum(raw.ownFundsMode, ['auto', 'manual'], '自己資金の決め方', errors, 'ownFundsMode');
  let ownFunds = null;
  if (ownFundsMode === 'manual') {
    ownFunds = readNumber(raw.ownFunds, { label: '自己資金', unit: ' 万円', min: 0, max: 100000 }, errors, 'ownFunds');
  }

  const rate = readNumber(raw.rate, { label: '適用金利', unit: ' %', min: 0, max: 15, decimals: 3 }, errors, 'rate');
  const years = readNumber(raw.years, { label: '借入期間', unit: ' 年', min: 1, max: 50, integer: true }, errors, 'years');
  const method = readEnum(raw.method, ['equalPayment', 'equalPrincipal'], '返済方式', errors, 'method');

  // ボーナス返済分（借入額の 50% 以内）
  const bonus = readNumber(raw.bonusPrincipal, { label: 'ボーナス返済分の借入額', unit: ' 万円', min: 0, max: 100000, required: false }, errors, 'bonusPrincipal');
  const bonusValue = bonus && bonus.value !== null ? bonus.value : 0;
  if (bonus && loan && bonusValue * 2 > loan.value + 1e-9) {
    errors.bonusPrincipal = 'ボーナス返済分は借入額の 50% 以内にしてください';
  }

  // 保証料
  const guaranteeType = readEnum(raw.guaranteeType, ['inRate', 'lump', 'none'], '保証料方式', errors, 'guaranteeType');
  let add = { value: 0 };
  let lump = null;
  let lumpMode = raw.guaranteeLumpMode === 'manual' ? 'manual' : 'auto';
  if (guaranteeType === 'inRate') {
    add = readNumber(raw.guaranteeRateAdd, { label: '金利上乗せ幅', unit: ' %', min: 0, max: 2, decimals: 3 }, errors, 'guaranteeRateAdd');
  } else if (guaranteeType === 'lump') {
    lumpMode = readEnum(raw.guaranteeLumpMode, ['auto', 'manual'], '一括保証料の決め方', errors, 'guaranteeLumpMode');
    if (lumpMode === 'manual') {
      lump = readNumber(raw.guaranteeLump, { label: '一括保証料', unit: ' 万円', min: 0, max: 1000 }, errors, 'guaranteeLump');
    }
  }

  // 繰上返済
  const prepayRaw = Array.isArray(raw.prepayments) ? raw.prepayments : [];
  if (prepayRaw.length > MAX_PREPAYMENTS) errors.prepayments = `繰上返済は最大 ${MAX_PREPAYMENTS} 件までです`;
  const yearsMax = years ? years.value : 50;
  const prepayments = [];
  prepayRaw.slice(0, MAX_PREPAYMENTS).forEach((p, i) => {
    const k = `prepayments.${i}`;
    const ay = readNumber(p.afterYears, { label: '繰上返済の実行時期（年）', unit: ' 年', min: 0, max: yearsMax, integer: true }, errors, `${k}.afterYears`);
    const am = readNumber(p.afterMonths, { label: '繰上返済の実行時期（か月）', unit: ' か月', min: 0, max: 11, integer: true }, errors, `${k}.afterMonths`);
    const amount = readNumber(p.amount, { label: '繰上返済額', unit: ' 万円', min: 1, max: 100000 }, errors, `${k}.amount`);
    const type = readEnum(p.type, ['shorten', 'reduce'], '繰上返済の型', errors, `${k}.type`);
    if (ay && am && years) {
      const at = ay.value * 12 + am.value;
      if (at < 1 || at >= years.value * 12) {
        errors[`${k}.afterYears`] = '繰上返済の実行時期は 1 か月以上、最終回より前にしてください';
      }
    }
    if (ay && am && amount && type) {
      prepayments.push({ afterYears: ay.value, afterMonths: am.value, amountYen: manToYen(amount.value), type });
    }
  });

  if (Object.keys(errors).length > 0) return { values: null, errors, notices };
  return {
    values: {
      label,
      loanYen: manToYen(loan.value),
      ownFundsMode,
      ownFundsYen: ownFunds ? manToYen(ownFunds.value) : null,
      rateMilli: percentToMilli(rate.value),
      years: years.value,
      method,
      bonusYen: manToYen(bonusValue),
      guaranteeType,
      addMilli: percentToMilli(add.value),
      rateIncludesGuarantee: toBool(raw.rateIncludesGuarantee),
      lumpMode,
      lumpYen: lump ? manToYen(lump.value) : null,
      prepayments,
    },
    errors,
    notices,
  };
}
