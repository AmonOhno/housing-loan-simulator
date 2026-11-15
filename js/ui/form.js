// 入力フォーム（共通・控除・ケースタブ・ケース入力・繰上返済行）。
// 構造が変わるとき（タブ切替・ケース追加／削除・マイ設定反映）だけ再生成し、通常の入力では再生成しない。
import { el, setChildren, nextId } from './dom.js';
import { caseName } from './state.js';
import { MAX_CASES, MAX_PREPAYMENTS } from '../data/defaults.js';
import { resolveDeductionDefaults } from '../calc/tax-credit.js';
import { DEFAULT_RATE_MILLI } from '../data/deduction-table.js';
import { num } from './format.js';

const HOUSE_KINDS = [['new', '新築・買取再販'], ['existing', '既存住宅']];
const PERFS = [
  ['certified', '認定長期優良・認定低炭素'],
  ['zeh', 'ZEH 水準省エネ住宅'],
  ['energy', '省エネ基準適合住宅'],
  ['other', 'その他の住宅'],
];
const METHODS = [['equalPayment', '元利均等'], ['equalPrincipal', '元金均等']];
const GUARANTEES = [['inRate', '金利内包型（金利に上乗せ）'], ['lump', '一括前払型'], ['none', 'なし']];

const manText = (yenValue) => String(Math.round(yenValue) / 10000);

export function buildForms(store, roots) {
  const { state } = store;
  /** key → { input, errEl, noteEl } */
  let refs = new Map();
  let conditionals = [];
  let tabButtons = [];
  let caseActionButtons = {};

  function changed() {
    applyVisibility();
    store.invalidate();
  }

  // ---- 部品 ----
  function shell(key, label, unit, hint, control) {
    const id = control.id;
    const errEl = el('p', { class: 'error', id: `${id}-err` });
    const noteEl = el('p', { class: 'notice', id: `${id}-note` });
    const describedBy = [hint ? `${id}-hint` : null, `${id}-err`, `${id}-note`].filter(Boolean).join(' ');
    control.setAttribute('aria-describedby', describedBy);
    const wrap = el('div', { class: 'field' }, [
      el('label', { for: id, text: label }),
      el('div', { class: 'input-row' }, [control, unit ? el('span', { class: 'unit', text: unit }) : null]),
      hint ? el('p', { class: 'hint', id: `${id}-hint`, text: hint }) : null,
      errEl,
      noteEl,
    ]);
    refs.set(key, { input: control, errEl, noteEl });
    return wrap;
  }

  function textField({ key, label, unit, hint, inputmode = 'decimal', get, set, placeholder }) {
    const id = nextId('in');
    const input = el('input', {
      id, type: 'text', inputmode, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      enterkeyhint: 'next', placeholder: placeholder || false, value: get(),
    });
    input.addEventListener('input', () => { set(input.value); changed(); });
    return shell(key, label, unit, hint, input);
  }

  function monthField({ key, label, hint, get, set }) {
    const id = nextId('in');
    const input = el('input', { id, type: 'month', autocomplete: 'off', value: get() });
    input.addEventListener('input', () => { set(input.value); changed(); });
    return shell(key, label, '', hint, input);
  }

  function selectField({ key, label, hint, options, get, set, onChange }) {
    const id = nextId('in');
    const input = el('select', { id }, options.map(([v, t]) => el('option', { value: v, text: t })));
    input.value = String(get());
    input.addEventListener('change', () => { set(input.value); if (onChange) onChange(); changed(); });
    return shell(key, label, '', hint, input);
  }

  function checkField({ key, label, hint, get, set }) {
    const id = nextId('in');
    const input = el('input', { id, type: 'checkbox', checked: !!get() });
    input.addEventListener('change', () => { set(input.checked); changed(); });
    const errEl = el('p', { class: 'error', id: `${id}-err` });
    const wrap = el('div', { class: 'field field-check' }, [
      el('label', { class: 'check-label', for: id }, [input, el('span', { text: label })]),
      hint ? el('p', { class: 'hint', text: hint }) : null,
      errEl,
    ]);
    refs.set(key, { input, errEl, noteEl: el('p') });
    return wrap;
  }

  function when(test, node) {
    conditionals.push({ node, test });
    return node;
  }

  function applyVisibility() {
    const rc = state.raw.cases[state.activeCaseIndex];
    conditionals.forEach(({ node, test }) => { node.hidden = !test(rc); });
    const ownAuto = rc && rc.ownFundsMode === 'auto';
    const lumpAuto = rc && rc.guaranteeLumpMode !== 'manual';
    const own = refs.get('case.ownFunds');
    if (own) own.input.readOnly = ownAuto;
    const lump = refs.get('case.guaranteeLump');
    if (lump) lump.input.readOnly = lumpAuto;
    const dedOn = state.raw.deduction.enabled;
    deductionDetails.forEach((n) => { n.hidden = !dedOn; });
  }

  let deductionDetails = [];

  // ---- 共通 ----
  function buildCommon() {
    const c = state.raw.common;
    const f = (k) => ({ get: () => c[k], set: (v) => { c[k] = v; } });
    setChildren(roots.common, [
      textField({ key: 'common.price', label: '物件価格（売買契約金額）', unit: '万円', ...f('price') }),
      textField({ key: 'common.expenses', label: '諸経費（一括保証料を除く）', unit: '万円', hint: '一括前払型の保証料は下の「借入条件」で別に入力します（二重計上を防ぐため、ここには含めません）。', ...f('expenses') }),
      textField({ key: 'common.deposit', label: '手付金（支払済み）', unit: '万円', hint: '自己資金の内訳として扱います（物件価格からは差し引きません）。', ...f('deposit') }),
      textField({ key: 'common.income', label: '税込年収', unit: '万円', hint: '夫婦合算で検討する場合は合算額を入れてください（審査上の扱いは金融機関によります）。空欄なら返済負担率は表示しません。', ...f('income') }),
      monthField({ key: 'common.startYm', label: '返済開始年月', hint: '年次表の暦年区切りと住宅ローン控除の年末残高に使います。', ...f('startYm') }),
    ]);
  }

  // ---- 控除 ----
  function buildDeduction() {
    const d = state.raw.deduction;
    const f = (k) => ({ get: () => d[k], set: (v) => { d[k] = v; } });
    deductionDetails = [];
    const hidable = (n) => { deductionDetails.push(n); return n; };
    const years = [2026, 2027, 2028, 2029, 2030].map((y) => [String(y), `${y} 年`]);
    setChildren(roots.deduction, [
      checkField({ key: 'deduction.enabled', label: '住宅ローン控除を試算する', ...f('enabled') }),
      hidable(selectField({ key: 'deduction.moveInYear', label: '入居年', options: years, ...f('moveInYear') })),
      hidable(selectField({ key: 'deduction.houseKind', label: '取得の種類', options: HOUSE_KINDS, ...f('houseKind') })),
      hidable(selectField({ key: 'deduction.perf', label: '住宅の性能区分', options: PERFS, hint: '省エネ性能は売主・施工会社の証明書類で確認してください。', ...f('perf') })),
      hidable(checkField({ key: 'deduction.childcare', label: '子育て世帯・若者夫婦世帯に該当する', hint: '入居した年の 12 月 31 日時点の判定です。上乗せを使う場合は床面積 50㎡以上が必要です。', ...f('childcare') })),
      hidable(textField({ key: 'deduction.incomeTax', label: '所得税額（年額・任意）', unit: '万円', hint: '空欄なら所得税での頭打ちをかけません。', ...f('incomeTax') })),
      hidable(el('details', { class: 'sub-details' }, [
        el('summary', { text: '制度値を手入力で上書きする' }),
        el('div', { class: 'fields' }, [
          textField({ key: 'deduction.limitOverride', label: '借入限度額', unit: '万円', ...f('limitOverride') }),
          textField({ key: 'deduction.rateOverride', label: '控除率', unit: '%', ...f('rateOverride') }),
          textField({ key: 'deduction.yearsOverride', label: '控除期間', unit: '年', inputmode: 'numeric', ...f('yearsOverride') }),
          textField({ key: 'deduction.residentCap', label: '住民税からの控除上限（年額）', unit: '万円', hint: '所得税の課税総所得金額等の 5%（最高 9.75 万円）。該当額が小さい場合は上書きしてください。', ...f('residentCap') }),
        ]),
      ])),
    ]);
  }

  // ---- ケース ----
  function buildTabs() {
    tabButtons = state.raw.cases.map((rc, i) => {
      const b = el('button', {
        type: 'button', role: 'tab', class: 'tab', id: `tab-${i}`,
        'aria-selected': i === state.activeCaseIndex ? 'true' : 'false',
        'aria-controls': 'case-form', tabindex: i === state.activeCaseIndex ? '0' : '-1',
        text: caseName(rc, i),
      });
      b.addEventListener('click', () => store.setActive(i));
      b.addEventListener('keydown', (e) => {
        const n = state.raw.cases.length;
        if (e.key === 'ArrowRight') { store.setActive((i + 1) % n); document.getElementById(`tab-${(i + 1) % n}`)?.focus(); }
        if (e.key === 'ArrowLeft') { store.setActive((i + n - 1) % n); document.getElementById(`tab-${(i + n - 1) % n}`)?.focus(); }
      });
      return b;
    });
    setChildren(roots.tabs, tabButtons);
    const n = state.raw.cases.length;
    const mk = (text, cls, fn) => el('button', { type: 'button', class: `btn ${cls}`, text, onClick: fn });
    caseActionButtons = {
      add: mk('ケースを追加', 'btn-secondary', () => store.addCase(null)),
      dup: mk('このケースを複製', 'btn-secondary', () => store.addCase(state.activeCaseIndex)),
      del: mk('このケースを削除', 'btn-danger', () => store.removeCase(state.activeCaseIndex)),
    };
    caseActionButtons.add.disabled = n >= MAX_CASES;
    caseActionButtons.dup.disabled = n >= MAX_CASES;
    caseActionButtons.del.disabled = n <= 1;
    setChildren(roots.actions, Object.values(caseActionButtons));
  }

  function buildCaseForm() {
    const i = state.activeCaseIndex;
    const rc = state.raw.cases[i];
    const f = (k) => ({ get: () => rc[k], set: (v) => { rc[k] = v; } });
    const children = [
      textField({
        key: 'case.label', label: 'ケース名', inputmode: 'text', hint: '20 文字以内', get: () => rc.label,
        set: (v) => { rc.label = v; if (tabButtons[i]) tabButtons[i].textContent = caseName(rc, i); },
      }),
      textField({ key: 'case.loan', label: '借入額', unit: '万円', ...f('loan') }),
      selectField({
        key: 'case.ownFundsMode', label: '自己資金の決め方', options: [['auto', '自動（必要資金 − 借入額）'], ['manual', '手入力']], ...f('ownFundsMode'),
        onChange: () => {
          const ref = refs.get('case.ownFunds');
          if (rc.ownFundsMode === 'manual' && String(rc.ownFunds).trim() === '') {
            const r = state.results[i];
            if (r) rc.ownFunds = manText(r.funding.ownFunds);
          }
          if (ref) ref.input.value = rc.ownFunds;
        },
      }),
      textField({ key: 'case.ownFunds', label: '自己資金（手付金を含む総額）', unit: '万円', ...f('ownFunds') }),
      textField({ key: 'case.rate', label: '適用金利（年率）', unit: '%', hint: '全期間一定として計算します。', ...f('rate') }),
      textField({ key: 'case.years', label: '借入期間', unit: '年', inputmode: 'numeric', ...f('years') }),
      selectField({ key: 'case.method', label: '返済方式', options: METHODS, ...f('method') }),
      textField({ key: 'case.bonusPrincipal', label: 'ボーナス返済分の借入額', unit: '万円', hint: '借入額の 50% 以内。年 2 回（6 か月ごと）の加算として計算します。', ...f('bonusPrincipal') }),
      selectField({ key: 'case.guaranteeType', label: '保証料方式', options: GUARANTEES, ...f('guaranteeType') }),
      when((c) => c.guaranteeType === 'inRate', textField({
        key: 'case.guaranteeRateAdd', label: '金利上乗せ幅（目安・要確認）', unit: '%',
        hint: '一般的な目安（0.2% 前後）です。金融機関の提示内容に置き換えてください。', ...f('guaranteeRateAdd'),
      })),
      when((c) => c.guaranteeType === 'inRate', selectField({
        key: 'case.rateIncludesGuarantee', label: '入力した金利は上乗せ済みか', options: [['false', '上乗せ前（上乗せ幅を加算する）'], ['true', '上乗せ済み（そのまま使う）']],
        get: () => String(!!rc.rateIncludesGuarantee), set: (v) => { rc.rateIncludesGuarantee = v === 'true'; },
      })),
      when((c) => c.guaranteeType === 'lump', selectField({
        key: 'case.guaranteeLumpMode', label: '一括保証料の決め方', options: [['auto', '目安から自動'], ['manual', '手入力']], ...f('guaranteeLumpMode'),
        onChange: () => {
          const ref = refs.get('case.guaranteeLump');
          if (rc.guaranteeLumpMode === 'manual' && String(rc.guaranteeLump).trim() === '') {
            const r = state.results[i];
            if (r) rc.guaranteeLump = manText(r.guarantee.lumpYen);
          }
          if (ref) ref.input.value = rc.guaranteeLump;
        },
      })),
      when((c) => c.guaranteeType === 'lump', textField({
        key: 'case.guaranteeLump', label: '一括保証料（目安・要確認）', unit: '万円',
        hint: '自動の値は一般的な目安です。金融機関・保証会社の提示額に置き換えてください。諸経費・必要資金に自動で加算されます。', ...f('guaranteeLump'),
      })),
    ];
    // 繰上返済
    const prepayBlock = el('div', { class: 'prepay-block' }, [
      el('h3', { text: '繰上返済（最大 3 件）' }),
      ...rc.prepayments.map((p, j) => {
        const pf = (k) => ({ get: () => p[k], set: (v) => { p[k] = v; } });
        return el('fieldset', { class: 'prepay-row' }, [
          el('legend', { text: `繰上返済 ${j + 1}` }),
          textField({ key: `case.prepayments.${j}.afterYears`, label: '実行時期（返済開始から）', unit: '年', inputmode: 'numeric', ...pf('afterYears') }),
          textField({ key: `case.prepayments.${j}.afterMonths`, label: '同（か月）', unit: 'か月', inputmode: 'numeric', ...pf('afterMonths') }),
          textField({ key: `case.prepayments.${j}.amount`, label: '繰上返済額', unit: '万円', ...pf('amount') }),
          selectField({ key: `case.prepayments.${j}.type`, label: '型', options: [['shorten', '期間短縮型'], ['reduce', '返済額軽減型']], ...pf('type') }),
          el('button', { type: 'button', class: 'btn btn-danger', text: 'この行を削除', onClick: () => store.removePrepay(i, j) }),
        ]);
      }),
      el('button', {
        type: 'button', class: 'btn btn-secondary', text: '繰上返済を追加',
        disabled: rc.prepayments.length >= MAX_PREPAYMENTS, onClick: () => store.addPrepay(i),
      }),
    ]);
    children.push(prepayBlock);
    roots.caseForm.setAttribute('aria-labelledby', `tab-${i}`);
    setChildren(roots.caseForm, children);
  }

  function rebuild() {
    refs = new Map();
    conditionals = [];
    buildCommon();
    buildDeduction();
    buildTabs();
    buildCaseForm();
    applyVisibility();
    showDerived(state);
  }

  /** 結果が出たあとの表示更新（自動値・エラー・注記） */
  function showDerived(st) {
    const i = st.activeCaseIndex;
    const r = st.results[i];
    // 自動値の表示
    const own = refs.get('case.ownFunds');
    if (own && st.raw.cases[i].ownFundsMode === 'auto') own.input.value = r ? manText(r.funding.ownFunds) : '';
    const lump = refs.get('case.guaranteeLump');
    if (lump && st.raw.cases[i].guaranteeLumpMode !== 'manual') lump.input.value = r ? manText(r.guarantee.lumpYen) : '';
    // 控除の自動値をプレースホルダーに
    const d = st.raw.deduction;
    const def = resolveDeductionDefaults({
      houseKind: d.houseKind, perf: d.perf, moveInYear: Number(d.moveInYear), childcare: !!d.childcare,
    });
    const setPh = (key, text) => { const ref = refs.get(key); if (ref) ref.input.placeholder = text; };
    setPh('deduction.limitOverride', `自動: ${num(def.limitYen / 10000)}`);
    setPh('deduction.rateOverride', `自動: ${DEFAULT_RATE_MILLI / 1000}`);
    setPh('deduction.yearsOverride', `自動: ${def.years}`);

    // エラーと注記
    let count = 0;
    const lookup = (key) => {
      if (key.startsWith('common.')) return [st.errors.common[key.slice(7)], null];
      if (key.startsWith('deduction.')) return [st.errors.deduction[key.slice(10)], null];
      const k = key.slice(5);
      return [st.errors.cases[i]?.[k], st.notices.cases[i]?.[k]];
    };
    refs.forEach((ref, key) => {
      const [msg, note] = lookup(key);
      ref.errEl.textContent = msg ? `⚠ ${msg}` : '';
      ref.noteEl.textContent = note ? `ℹ ${note}` : '';
      if (msg) { ref.input.setAttribute('aria-invalid', 'true'); count += 1; } else ref.input.removeAttribute('aria-invalid');
    });
    // 画面に出ていない入力欄のエラー（他ケース）も数える
    const other = st.errors.cases.reduce((n, e, idx) => (idx === i ? n : n + Object.keys(e || {}).length), 0);
    const hiddenErr = Object.keys(st.errors.common).length + Object.keys(st.errors.deduction).length
      + Object.keys(st.errors.cases[i] || {}).length - count;
    const total = count + other + Math.max(0, hiddenErr);
    roots.errorSummary.textContent = total > 0
      ? `⚠ 入力エラーが ${total} 件あります。赤字の項目を直してください（直るまで前回の有効な結果を表示します）。`
      : '';
    // ケース操作ボタンの状態・タブ表示
    st.raw.cases.forEach((rc, idx) => {
      if (!tabButtons[idx]) return;
      const err = Object.keys(st.errors.cases[idx] || {}).length > 0;
      tabButtons[idx].classList.toggle('tab-error', err);
      tabButtons[idx].setAttribute('aria-label', err ? `${caseName(rc, idx)}（入力エラーあり）` : caseName(rc, idx));
    });
  }

  store.onStructure(rebuild);
  store.onResult(showDerived);

  /** 入力欄の値を raw から書き戻す（「差額を自己資金に反映」など） */
  function syncValues() {
    const i = state.activeCaseIndex;
    const rc = state.raw.cases[i];
    const own = refs.get('case.ownFunds');
    if (own) own.input.value = rc.ownFunds;
  }

  return { rebuild, syncValues };
}
