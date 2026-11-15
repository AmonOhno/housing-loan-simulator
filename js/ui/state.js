// アプリ状態。生の入力文字列・検証結果・直近の有効値と結果を持ち、再計算を 1 フレームにまとめる。
import { validateCommon, validateDeduction, validateCase } from '../model/validate.js';
import { computeCase } from '../calc/scenario.js';
import { MAX_CASES, MAX_PREPAYMENTS, DEFAULT_CASE, DEFAULT_PREPAY } from '../data/defaults.js';
import { rawStateFromSet } from '../model/preset-schema.js';

/** 新規ケースの生入力ひな形 */
export function newRawCase() {
  return rawStateFromSet({ cases: [{ ...DEFAULT_CASE, label: '' }] }).cases[0];
}
export function newRawPrepay() {
  return rawStateFromSet({ cases: [{ ...DEFAULT_CASE, prepayments: [DEFAULT_PREPAY] }] }).cases[0].prepayments[0];
}

export function createStore(initialRaw, baseCaseIndex = 0) {
  const state = {
    raw: initialRaw,
    baseCaseIndex,
    activeCaseIndex: 0,
    errors: { common: {}, deduction: {}, cases: [] },
    notices: { cases: [] },
    lastValid: { common: null, deduction: null, cases: [] },
    results: [],
    caseHasError: [],
  };
  const resultListeners = new Set();
  const structureListeners = new Set();
  let scheduled = false;

  function recomputeNow() {
    scheduled = false;
    const c = validateCommon(state.raw.common);
    state.errors.common = c.errors;
    if (c.values) state.lastValid.common = c.values;
    const d = validateDeduction(state.raw.deduction);
    state.errors.deduction = d.errors;
    if (d.values) state.lastValid.deduction = d.values;

    state.errors.cases = [];
    state.notices.cases = [];
    state.caseHasError = [];
    const nCases = state.raw.cases.length;
    state.lastValid.cases.length = nCases;
    state.results.length = nCases;
    state.raw.cases.forEach((rc, i) => {
      const v = validateCase(rc, state.lastValid.common);
      state.errors.cases[i] = v.errors;
      state.notices.cases[i] = v.notices;
      if (v.values) state.lastValid.cases[i] = v.values;
      state.caseHasError[i] = Object.keys(v.errors).length > 0
        || Object.keys(state.errors.common).length > 0 || Object.keys(state.errors.deduction).length > 0;
      const lv = state.lastValid.cases[i];
      if (state.lastValid.common && state.lastValid.deduction && lv) {
        try {
          state.results[i] = computeCase(state.lastValid.common, state.lastValid.deduction, lv);
        } catch {
          state.results[i] = null; // 値は出さない
        }
      } else {
        state.results[i] = null;
      }
    });
    if (state.baseCaseIndex >= nCases) state.baseCaseIndex = 0;
    if (state.activeCaseIndex >= nCases) state.activeCaseIndex = nCases - 1;
    resultListeners.forEach((fn) => fn(state));
  }

  return {
    state,
    /** 入力変更後に呼ぶ。1 フレームに 1 回だけ再計算 */
    invalidate() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(recomputeNow);
    },
    recomputeNow,
    onResult(fn) { resultListeners.add(fn); },
    onStructure(fn) { structureListeners.add(fn); },
    emitStructure() { structureListeners.forEach((fn) => fn(state)); },
    setActive(i) {
      state.activeCaseIndex = i;
      structureListeners.forEach((fn) => fn(state));
      recomputeNow();
    },
    /** 生入力を丸ごと置き換える（マイ設定の反映・ケース操作） */
    replaceRaw(raw, baseIdx = 0) {
      state.raw = raw;
      state.baseCaseIndex = baseIdx;
      state.activeCaseIndex = 0;
      state.lastValid = { common: null, deduction: null, cases: [] };
      structureListeners.forEach((fn) => fn(state));
      recomputeNow();
    },
    addCase(copyFrom = null) {
      if (state.raw.cases.length >= MAX_CASES) return false;
      const c = copyFrom === null ? newRawCase() : JSON.parse(JSON.stringify(state.raw.cases[copyFrom]));
      if (copyFrom !== null && c.label) c.label = [...`${c.label}（複製）`].slice(0, 20).join('');
      state.raw.cases.push(c);
      state.activeCaseIndex = state.raw.cases.length - 1;
      structureListeners.forEach((fn) => fn(state));
      recomputeNow();
      return true;
    },
    removeCase(i) {
      if (state.raw.cases.length <= 1) return false;
      state.raw.cases.splice(i, 1);
      state.lastValid.cases.splice(i, 1);
      if (state.baseCaseIndex === i) state.baseCaseIndex = 0;
      else if (state.baseCaseIndex > i) state.baseCaseIndex -= 1;
      state.activeCaseIndex = Math.min(state.activeCaseIndex, state.raw.cases.length - 1);
      structureListeners.forEach((fn) => fn(state));
      recomputeNow();
      return true;
    },
    addPrepay(i) {
      const list = state.raw.cases[i].prepayments;
      if (list.length >= MAX_PREPAYMENTS) return false;
      list.push(newRawPrepay());
      structureListeners.forEach((fn) => fn(state));
      recomputeNow();
      return true;
    },
    removePrepay(i, j) {
      state.raw.cases[i].prepayments.splice(j, 1);
      structureListeners.forEach((fn) => fn(state));
      recomputeNow();
    },
  };
}

export function caseName(raw, i) {
  const t = String(raw.label ?? '').trim();
  return t || `ケース ${String.fromCharCode(65 + i)}`;
}
