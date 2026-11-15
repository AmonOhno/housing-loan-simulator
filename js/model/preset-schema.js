// 平文の設定セット（暗号文の内側）のスキーマ。要件 10.4。
// DOM 非依存の純粋関数。画面の入力項目（共通・控除・ケース配列）をそのまま表現する。
//
// 方針:
//  - 未知フィールドは無視、欠けたフィールドは既定値で補う（将来の項目追加に備える）。
//  - 警告・エラー文言にはフィールド名だけを含め、設定の値そのものは含めない。
//  - 範囲チェックは行わない（反映時に js/model/validate.js が行う）。型・列挙値だけを正す。
//
// 画面側の生入力（RawState）の形:
//   { common: {price, expenses, deposit, income, startYm},          // すべて文字列
//     deduction: {enabled, moveInYear, houseKind, perf, childcare,   // enabled/childcare は真偽、他は文字列
//                 limitOverride, rateOverride, yearsOverride, incomeTax, residentCap},
//     cases: [{label, loan, ownFundsMode, ownFunds, rate, years, method, bonusPrincipal,
//              guaranteeType, guaranteeRateAdd, rateIncludesGuarantee(真偽), guaranteeLumpMode,
//              guaranteeLump, prepayments: [{afterYears, afterMonths, amount, type}]}],
//     baseCaseIndex }
// setFromRawState は { raw: {common, deduction, cases}, baseCaseIndex } 形式も受け付ける。

import {
  MAX_CASES, MAX_PREPAYMENTS, DEFAULT_COMMON as D_COMMON, DEFAULT_DEDUCTION as D_DEDUCTION,
  DEFAULT_CASE as D_CASE, DEFAULT_PREPAY as D_PREPAY,
} from '../data/defaults.js';

export const SCHEMA_VERSION = 1;
export { MAX_CASES, MAX_PREPAYMENTS };
const MAX_NAME_LENGTH = 60;
const MAX_NOTE_LENGTH = 500;

// 既定値（公開ページの一般例）は js/data/defaults.js に一本化している。

const ENUMS = {
  ownFundsMode: ['auto', 'manual'],
  guaranteeLumpMode: ['auto', 'manual'],
  method: ['equalPayment', 'equalPrincipal'],
  guaranteeType: ['inRate', 'lump', 'none'],
  houseKind: ['new', 'existing'],
  perf: ['certified', 'zeh', 'energy', 'other'],
  type: ['shorten', 'reduce'],
};

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** 数値（または数値文字列）→ number。解釈できなければ NaN */
function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    const s = v.normalize('NFKC').replace(/[,\s]/g, '');
    if (s === '' || !/^-?\d*\.?\d+$/.test(s)) return NaN;
    return Number(s);
  }
  return NaN;
}

/** 必須数値: 解釈できなければ既定値＋警告（フィールド名のみ） */
function numField(obj, key, def, path, warnings) {
  const v = obj[key];
  if (v === undefined) return def;
  const n = toNum(v);
  if (Number.isNaN(n)) {
    warnings.push(`${path}.${key} が数値でないため既定値を使います`);
    return def;
  }
  return n;
}

/** null 可の数値: undefined / null / '' → null */
function nullableNum(obj, key, path, warnings, def = null) {
  const v = obj[key];
  if (v === undefined) return def;
  if (v === null || v === '') return null;
  const n = toNum(v);
  if (Number.isNaN(n)) {
    warnings.push(`${path}.${key} が数値でないため未入力として扱います`);
    return null;
  }
  return n;
}

function enumField(obj, key, def, path, warnings, list = ENUMS[key]) {
  const v = obj[key];
  if (v === undefined) return def;
  if (!list.includes(v)) {
    warnings.push(`${path}.${key} が不正な選択値のため既定値を使います`);
    return def;
  }
  return v;
}

function boolField(obj, key, def, path, warnings) {
  const v = obj[key];
  if (v === undefined) return def;
  if (typeof v !== 'boolean') {
    warnings.push(`${path}.${key} が真偽値でないため既定値を使います`);
    return def;
  }
  return v;
}

function strField(obj, key, def, max, path, warnings) {
  const v = obj[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== 'string') {
    warnings.push(`${path}.${key} が文字列でないため既定値を使います`);
    return def;
  }
  return v.length > max ? v.slice(0, max) : v;
}

function validYm(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

function normalizePrepay(p, path, warnings) {
  const src = isObj(p) ? p : {};
  return {
    afterYears: numField(src, 'afterYears', D_PREPAY.afterYears, path, warnings),
    afterMonths: numField(src, 'afterMonths', D_PREPAY.afterMonths, path, warnings),
    amount: numField(src, 'amount', D_PREPAY.amount, path, warnings),
    type: enumField(src, 'type', D_PREPAY.type, path, warnings),
  };
}

function normalizeCase(c, i, warnings) {
  const path = `cases[${i}]`;
  const src = isObj(c) ? c : {};
  if (!isObj(c)) warnings.push(`${path} がオブジェクトでないため既定値を使います`);
  const out = {
    label: strField(src, 'label', D_CASE.label, 40, path, warnings),
    loan: numField(src, 'loan', D_CASE.loan, path, warnings),
    ownFundsMode: enumField(src, 'ownFundsMode', D_CASE.ownFundsMode, path, warnings),
    ownFunds: nullableNum(src, 'ownFunds', path, warnings),
    rate: numField(src, 'rate', D_CASE.rate, path, warnings),
    years: numField(src, 'years', D_CASE.years, path, warnings),
    method: enumField(src, 'method', D_CASE.method, path, warnings),
    bonusPrincipal: numField(src, 'bonusPrincipal', D_CASE.bonusPrincipal, path, warnings),
    guaranteeType: enumField(src, 'guaranteeType', D_CASE.guaranteeType, path, warnings),
    guaranteeRateAdd: numField(src, 'guaranteeRateAdd', D_CASE.guaranteeRateAdd, path, warnings),
    rateIncludesGuarantee: boolField(src, 'rateIncludesGuarantee', D_CASE.rateIncludesGuarantee, path, warnings),
    guaranteeLumpMode: enumField(src, 'guaranteeLumpMode', D_CASE.guaranteeLumpMode, path, warnings),
    guaranteeLump: nullableNum(src, 'guaranteeLump', path, warnings),
    prepayments: [],
  };
  let pre = src.prepayments;
  if (pre !== undefined && !Array.isArray(pre)) {
    warnings.push(`${path}.prepayments が配列でないため空として扱います`);
    pre = [];
  }
  pre = pre || [];
  if (pre.length > MAX_PREPAYMENTS) warnings.push(`${path}.prepayments は ${MAX_PREPAYMENTS} 件までのため超過分を無視します`);
  out.prepayments = pre.slice(0, MAX_PREPAYMENTS).map((p, j) => normalizePrepay(p, `${path}.prepayments[${j}]`, warnings));
  return out;
}

function defaultCaseOf(i) {
  return { ...D_CASE, label: `ケース ${String.fromCharCode(65 + i)}`, prepayments: [] };
}

/** 設定セット 1 件を正規化する。例外は投げない */
export function normalizeSet(set) {
  const warnings = [];
  const src = isObj(set) ? set : {};
  if (!isObj(set)) warnings.push('set がオブジェクトでないため既定値を使います');
  const cm = isObj(src.common) ? src.common : {};
  const common = {
    price: numField(cm, 'price', D_COMMON.price, 'common', warnings),
    expenses: numField(cm, 'expenses', D_COMMON.expenses, 'common', warnings),
    deposit: numField(cm, 'deposit', D_COMMON.deposit, 'common', warnings),
    income: nullableNum(cm, 'income', 'common', warnings, D_COMMON.income),
    startYm: D_COMMON.startYm,
  };
  if (cm.startYm !== undefined) {
    if (validYm(cm.startYm)) common.startYm = cm.startYm;
    else warnings.push('common.startYm が不正なため既定値を使います');
  }
  const dd = isObj(src.deduction) ? src.deduction : {};
  const deduction = {
    enabled: boolField(dd, 'enabled', D_DEDUCTION.enabled, 'deduction', warnings),
    moveInYear: numField(dd, 'moveInYear', D_DEDUCTION.moveInYear, 'deduction', warnings),
    houseKind: enumField(dd, 'houseKind', D_DEDUCTION.houseKind, 'deduction', warnings),
    perf: enumField(dd, 'perf', D_DEDUCTION.perf, 'deduction', warnings),
    childcare: boolField(dd, 'childcare', D_DEDUCTION.childcare, 'deduction', warnings),
    limitOverride: nullableNum(dd, 'limitOverride', 'deduction', warnings),
    rateOverride: nullableNum(dd, 'rateOverride', 'deduction', warnings),
    yearsOverride: nullableNum(dd, 'yearsOverride', 'deduction', warnings),
    incomeTax: nullableNum(dd, 'incomeTax', 'deduction', warnings),
    residentCap: numField(dd, 'residentCap', D_DEDUCTION.residentCap, 'deduction', warnings),
  };
  let cases = src.cases;
  if (!Array.isArray(cases) || cases.length === 0) {
    warnings.push('cases が無いため既定のケースを 1 件使います');
    cases = [undefined];
  } else if (cases.length > MAX_CASES) {
    warnings.push(`cases は ${MAX_CASES} 件までのため超過分を無視します`);
    cases = cases.slice(0, MAX_CASES);
  }
  const normCases = cases.map((c, i) => {
    const n = normalizeCase(c, i, warnings);
    if (c === undefined || !isObj(c) || c.label === undefined) n.label = n.label || defaultCaseOf(i).label;
    return n;
  });
  let baseCaseIndex = 0;
  if (src.baseCaseIndex !== undefined) {
    const b = src.baseCaseIndex;
    if (Number.isInteger(b) && b >= 0 && b < normCases.length) baseCaseIndex = b;
    else warnings.push('baseCaseIndex が範囲外のため 0 を使います');
  }
  const name = strField(src, 'name', '設定セット', MAX_NAME_LENGTH, 'set', warnings) || '設定セット';
  const note = strField(src, 'note', '', MAX_NOTE_LENGTH, 'set', warnings);
  return { set: { name, note, common, deduction, baseCaseIndex, cases: normCases }, warnings };
}

/** 平文ペイロードを正規化する。例外を投げず、読める範囲で読む */
export function normalizePayload(obj) {
  const warnings = [];
  const src = isObj(obj) ? obj : {};
  if (!isObj(obj)) warnings.push('payload がオブジェクトでないため空として扱います');
  let schemaVersion = SCHEMA_VERSION;
  if (src.schemaVersion !== undefined) {
    if (Number.isInteger(src.schemaVersion) && src.schemaVersion > SCHEMA_VERSION) {
      warnings.push('schemaVersion が新しい形式です。読める範囲で反映します');
    } else if (!Number.isInteger(src.schemaVersion)) {
      warnings.push('schemaVersion が不正です');
    }
  }
  let updatedAt = new Date(0).toISOString();
  if (typeof src.updatedAt === 'string' && !Number.isNaN(Date.parse(src.updatedAt))) {
    updatedAt = new Date(src.updatedAt).toISOString();
  } else if (src.updatedAt !== undefined) {
    warnings.push('updatedAt が不正です');
  }
  let rawSets = src.sets;
  if (!Array.isArray(rawSets)) {
    if (rawSets !== undefined) warnings.push('sets が配列でないため空として扱います');
    rawSets = [];
  }
  const sets = rawSets.map((s, i) => {
    const r = normalizeSet(s);
    r.warnings.forEach((w) => warnings.push(`sets[${i}]: ${w}`));
    return r.set;
  });
  return { payload: { schemaVersion, updatedAt, sets }, warnings };
}

/** ペイロードを新規生成（sets は正規化済みを想定）。now は更新日時 */
export function createPayload(sets, now = new Date()) {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: now.toISOString(), sets };
}

/**
 * CLI 用の厳格検査。致命的な問題のパス一覧を返す（空なら OK）。
 * 値は出力に含めない。欠けたフィールドは許容（正規化で補う）が、型や列挙値の誤りは致命的とする。
 */
export function validatePayloadStrict(obj) {
  const errs = [];
  if (!isObj(obj)) return ['payload はオブジェクトである必要があります'];
  if (!Array.isArray(obj.sets) || obj.sets.length === 0) return ['sets は 1 件以上の配列である必要があります'];
  const checkNum = (o, key, path, nullable) => {
    const v = o[key];
    if (v === undefined) return;
    if (v === null || v === '') {
      if (!nullable) errs.push(`${path}.${key} は数値である必要があります`);
      return;
    }
    if (Number.isNaN(toNum(v))) errs.push(`${path}.${key} は数値である必要があります`);
  };
  const checkEnum = (o, key, path) => {
    if (o[key] !== undefined && !ENUMS[key].includes(o[key])) errs.push(`${path}.${key} は選択肢のいずれかである必要があります`);
  };
  const checkBool = (o, key, path) => {
    if (o[key] !== undefined && typeof o[key] !== 'boolean') errs.push(`${path}.${key} は真偽値である必要があります`);
  };
  obj.sets.forEach((s, i) => {
    const p = `sets[${i}]`;
    if (!isObj(s)) { errs.push(`${p} はオブジェクトである必要があります`); return; }
    if (s.name !== undefined && typeof s.name !== 'string') errs.push(`${p}.name は文字列である必要があります`);
    if (s.note !== undefined && typeof s.note !== 'string') errs.push(`${p}.note は文字列である必要があります`);
    if (s.common !== undefined) {
      if (!isObj(s.common)) errs.push(`${p}.common はオブジェクトである必要があります`);
      else {
        ['price', 'expenses', 'deposit'].forEach((k) => checkNum(s.common, k, `${p}.common`, false));
        checkNum(s.common, 'income', `${p}.common`, true);
        if (s.common.startYm !== undefined && !validYm(s.common.startYm)) errs.push(`${p}.common.startYm は YYYY-MM 形式である必要があります`);
      }
    }
    if (s.deduction !== undefined) {
      if (!isObj(s.deduction)) errs.push(`${p}.deduction はオブジェクトである必要があります`);
      else {
        const d = s.deduction;
        const dp = `${p}.deduction`;
        checkBool(d, 'enabled', dp); checkBool(d, 'childcare', dp);
        checkEnum(d, 'houseKind', dp); checkEnum(d, 'perf', dp);
        checkNum(d, 'moveInYear', dp, false); checkNum(d, 'residentCap', dp, false);
        ['limitOverride', 'rateOverride', 'yearsOverride', 'incomeTax'].forEach((k) => checkNum(d, k, dp, true));
      }
    }
    if (s.baseCaseIndex !== undefined && !Number.isInteger(s.baseCaseIndex)) errs.push(`${p}.baseCaseIndex は整数である必要があります`);
    if (!Array.isArray(s.cases) || s.cases.length < 1 || s.cases.length > MAX_CASES) {
      errs.push(`${p}.cases は 1〜${MAX_CASES} 件の配列である必要があります`);
      return;
    }
    s.cases.forEach((c, j) => {
      const cp = `${p}.cases[${j}]`;
      if (!isObj(c)) { errs.push(`${cp} はオブジェクトである必要があります`); return; }
      if (c.label !== undefined && typeof c.label !== 'string') errs.push(`${cp}.label は文字列である必要があります`);
      ['loan', 'rate', 'years', 'bonusPrincipal', 'guaranteeRateAdd'].forEach((k) => checkNum(c, k, cp, false));
      ['ownFunds', 'guaranteeLump'].forEach((k) => checkNum(c, k, cp, true));
      ['ownFundsMode', 'method', 'guaranteeType', 'guaranteeLumpMode'].forEach((k) => checkEnum(c, k, cp));
      checkBool(c, 'rateIncludesGuarantee', cp);
      if (c.prepayments !== undefined) {
        if (!Array.isArray(c.prepayments) || c.prepayments.length > MAX_PREPAYMENTS) {
          errs.push(`${cp}.prepayments は ${MAX_PREPAYMENTS} 件以下の配列である必要があります`);
        } else {
          c.prepayments.forEach((pp, k) => {
            const pth = `${cp}.prepayments[${k}]`;
            if (!isObj(pp)) { errs.push(`${pth} はオブジェクトである必要があります`); return; }
            ['afterYears', 'afterMonths', 'amount'].forEach((key) => checkNum(pp, key, pth, false));
            checkEnum(pp, 'type', pth);
          });
        }
      }
    });
  });
  return errs;
}

// ---- 画面の生入力との相互変換 ----

const numToStr = (v) => (v === null || v === undefined ? '' : String(v));
const strToNullable = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = toNum(v);
  return Number.isNaN(n) ? null : n;
};
const strToNum = (v, def) => {
  const n = toNum(v);
  return Number.isNaN(n) ? def : n;
};

/** 画面の生入力 → 平文スキーマの設定セット（数値化済み）。meta: {name, note} */
export function setFromRawState(state, meta = {}) {
  const raw = isObj(state.raw) ? state.raw : state;
  const cm = raw.common || {};
  const dd = raw.deduction || {};
  const set = {
    name: meta.name || '設定セット',
    note: meta.note || '',
    common: {
      price: strToNum(cm.price, D_COMMON.price),
      expenses: strToNum(cm.expenses, D_COMMON.expenses),
      deposit: strToNum(cm.deposit, D_COMMON.deposit),
      income: strToNullable(cm.income),
      startYm: validYm(cm.startYm) ? cm.startYm : D_COMMON.startYm,
    },
    deduction: {
      enabled: dd.enabled !== false,
      moveInYear: strToNum(dd.moveInYear, D_DEDUCTION.moveInYear),
      houseKind: dd.houseKind,
      perf: dd.perf,
      childcare: !!dd.childcare,
      limitOverride: strToNullable(dd.limitOverride),
      rateOverride: strToNullable(dd.rateOverride),
      yearsOverride: strToNullable(dd.yearsOverride),
      incomeTax: strToNullable(dd.incomeTax),
      residentCap: strToNum(dd.residentCap, D_DEDUCTION.residentCap),
    },
    baseCaseIndex: Number.isInteger(state.baseCaseIndex) ? state.baseCaseIndex : 0,
    cases: (raw.cases || []).map((c) => ({
      label: c.label || '',
      loan: strToNum(c.loan, D_CASE.loan),
      ownFundsMode: c.ownFundsMode,
      ownFunds: strToNullable(c.ownFunds),
      rate: strToNum(c.rate, D_CASE.rate),
      years: strToNum(c.years, D_CASE.years),
      method: c.method,
      bonusPrincipal: strToNum(c.bonusPrincipal, 0),
      guaranteeType: c.guaranteeType,
      guaranteeRateAdd: strToNum(c.guaranteeRateAdd, D_CASE.guaranteeRateAdd),
      rateIncludesGuarantee: !!c.rateIncludesGuarantee,
      guaranteeLumpMode: c.guaranteeLumpMode,
      guaranteeLump: strToNullable(c.guaranteeLump),
      prepayments: (c.prepayments || []).map((p) => ({
        afterYears: strToNum(p.afterYears, D_PREPAY.afterYears),
        afterMonths: strToNum(p.afterMonths, 0),
        amount: strToNum(p.amount, D_PREPAY.amount),
        type: p.type,
      })),
    })),
  };
  // 列挙値の欠けなどを正規化で補う
  return normalizeSet(set).set;
}

/** 平文スキーマの設定セット → 画面の生入力（文字列化）。正規化してから変換する */
export function rawStateFromSet(set) {
  const s = normalizeSet(set).set;
  return {
    common: {
      price: numToStr(s.common.price),
      expenses: numToStr(s.common.expenses),
      deposit: numToStr(s.common.deposit),
      income: numToStr(s.common.income),
      startYm: s.common.startYm,
    },
    deduction: {
      enabled: s.deduction.enabled,
      moveInYear: numToStr(s.deduction.moveInYear),
      houseKind: s.deduction.houseKind,
      perf: s.deduction.perf,
      childcare: s.deduction.childcare,
      limitOverride: numToStr(s.deduction.limitOverride),
      rateOverride: numToStr(s.deduction.rateOverride),
      yearsOverride: numToStr(s.deduction.yearsOverride),
      incomeTax: numToStr(s.deduction.incomeTax),
      residentCap: numToStr(s.deduction.residentCap),
    },
    baseCaseIndex: s.baseCaseIndex,
    cases: s.cases.map((c) => ({
      label: c.label,
      loan: numToStr(c.loan),
      ownFundsMode: c.ownFundsMode,
      ownFunds: numToStr(c.ownFunds),
      rate: numToStr(c.rate),
      years: numToStr(c.years),
      method: c.method,
      bonusPrincipal: numToStr(c.bonusPrincipal),
      guaranteeType: c.guaranteeType,
      guaranteeRateAdd: numToStr(c.guaranteeRateAdd),
      rateIncludesGuarantee: c.rateIncludesGuarantee,
      guaranteeLumpMode: c.guaranteeLumpMode,
      guaranteeLump: numToStr(c.guaranteeLump),
      prepayments: c.prepayments.map((p) => ({
        afterYears: numToStr(p.afterYears),
        afterMonths: numToStr(p.afterMonths),
        amount: numToStr(p.amount),
        type: p.type,
      })),
    })),
  };
}
