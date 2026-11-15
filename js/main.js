// 起動処理: 状態の初期化、各ビューの結線、再計算ループ。
import { createStore } from './ui/state.js';
import { buildForms } from './ui/form.js';
import { renderSummary } from './ui/results.js';
import { renderFunding } from './ui/funding-view.js';
import { renderCompare } from './ui/compare.js';
import { renderTaxCredit } from './ui/tax-credit-view.js';
import { renderSchedule } from './ui/schedule-table.js';
import { createPresetsView } from './ui/presets-view.js';
import { renderBalanceChart, observeWidth } from './chart.js';
import { caseName } from './ui/state.js';
import { rawStateFromSet } from './model/preset-schema.js';
import { DEFAULT_COMMON, DEFAULT_DEDUCTION, DEFAULT_CASES } from './data/defaults.js';

const $ = (id) => document.getElementById(id);

function showFatal() {
  const box = $('fatal-error');
  box.textContent = '計算中にエラーが発生しました。ページを再読み込みしてください。';
  box.hidden = false;
}
// ResizeObserver の「ループ完了」通知は無害なブラウザ通知なので、致命的エラー扱いにしない
const isBenignResizeMessage = (m) => typeof m === 'string' && m.includes('ResizeObserver');
window.addEventListener('error', (e) => {
  if (isBenignResizeMessage(e && e.message)) { if (e.stopImmediatePropagation) e.stopImmediatePropagation(); return; }
  showFatal();
});
window.addEventListener('unhandledrejection', showFatal);

const initial = rawStateFromSet({ common: DEFAULT_COMMON, deduction: DEFAULT_DEDUCTION, cases: DEFAULT_CASES, baseCaseIndex: 0 });
const baseIdx = initial.baseCaseIndex;
delete initial.baseCaseIndex;
const store = createStore(initial, baseIdx);

const forms = buildForms(store, {
  common: $('common-form'),
  deduction: $('deduction-form'),
  tabs: $('case-tabs'),
  actions: $('case-actions'),
  caseForm: $('case-form'),
  errorSummary: $('error-summary'),
});

const handlers = {
  setActive: (i) => store.setActive(i),
  setBase: (i) => { store.state.baseCaseIndex = i; renderAll(store.state); },
  fillOwnFunds: (yen) => {
    const rc = store.state.raw.cases[store.state.activeCaseIndex];
    rc.ownFunds = String(Math.round(yen) / 10000);
    forms.syncValues();
    store.recomputeNow();
  },
};

const chartBox = $('chart');
let lastState = null;

function renderChart(st) {
  const series = [];
  st.results.forEach((r, i) => {
    if (!r) return;
    const startYear = Number(st.lastValid.common.startYm.slice(0, 4));
    const points = [{ year: startYear - 1, balanceYen: r.loanYen }, ...r.annual.map((a) => ({ year: a.year, balanceYen: a.endBalance }))];
    series.push({ label: caseName(st.raw.cases[i], i), points, styleIndex: i });
  });
  const ref = st.results[st.activeCaseIndex] || st.results.find(Boolean);
  const limitYen = ref && ref.taxCredit.enabled && ref.taxCredit.limitYen > 0 ? ref.taxCredit.limitYen : null;
  renderBalanceChart(chartBox, { series, limitYen });
}

function renderAll(st) {
  lastState = st;
  renderSummary($('summary'), st);
  renderFunding($('funding'), st, handlers);
  renderCompare($('compare'), st, handlers);
  renderChart(st);
  renderTaxCredit($('tax-result'), st);
  renderSchedule($('schedule'), st);
}

store.onResult(renderAll);
observeWidth(chartBox, () => { if (lastState) renderChart(lastState); });

// 印刷時は閉じている折りたたみも開く（Chromium・Safari では CSS だけでは中身が印刷されない）
let reopened = [];
window.addEventListener('beforeprint', () => {
  reopened = [...document.querySelectorAll('details:not([open])')];
  reopened.forEach((d) => { d.open = true; });
});
window.addEventListener('afterprint', () => {
  reopened.forEach((d) => { d.open = false; });
  reopened = [];
});

const presets = createPresetsView($('presets-dialog'), $('presets-root'), {
  getState: () => store.state,
  apply: (raw, base) => store.replaceRaw(raw, base),
});
$('open-presets').addEventListener('click', () => presets.open());

forms.rebuild();
store.recomputeNow();
