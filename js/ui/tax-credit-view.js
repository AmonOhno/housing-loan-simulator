// 住宅ローン控除の結果・注記・出典。
import { el, setChildren } from './dom.js';
import { caseName } from './state.js';
import { yen, man, num } from './format.js';
import { SOURCES, DISPLAY_SOURCE_IDS, CONFIRMED_AT, COMMON_NOTES } from '../data/deduction-table.js';

function sourcesBlock() {
  const items = SOURCES.filter((s) => DISPLAY_SOURCE_IDS.includes(s.id)).map((s) => el('li', {}, [
    `[${s.id}] ${s.title}: `,
    el('a', { href: s.url, rel: 'noopener noreferrer', target: '_blank', text: s.url }),
  ]));
  return el('div', { class: 'info-box sources' }, [
    el('h3', { text: '制度の出典と確認日' }),
    el('p', { text: `令和 8 年度税制改正後（2026〜2030 年入居）の値。確認日: ${CONFIRMED_AT}。公開資料の本文を機械的に読み取って突き合わせたもので、原本の目視確認ではありません。` }),
    el('ul', {}, items),
    el('p', { class: 'hint', text: '最新の制度は国土交通省・国税庁の情報で確認してください。' }),
  ]);
}

export function renderTaxCredit(root, st) {
  const i = st.activeCaseIndex;
  const r = st.results[i];
  const out = [];
  if (!st.raw.deduction.enabled) {
    out.push(el('p', { class: 'hint', text: '「住宅ローン控除を試算する」がオフです。' }));
    out.push(sourcesBlock());
    setChildren(root, out);
    return;
  }
  if (!r) {
    out.push(el('p', { class: 'error', text: '⚠ 入力エラーのため表示できません。' }));
    out.push(sourcesBlock());
    setChildren(root, out);
    return;
  }
  const t = r.taxCredit;
  out.push(el('h3', { class: 'result-title', text: `${caseName(st.raw.cases[i], i)} の控除` }));
  const facts = [
    `借入限度額 ${num(t.limitYen / 10000)} 万円`,
    `控除率 ${t.rateMilli / 1000}%`,
    `控除期間 ${t.years} 年`,
  ].join(' ／ ');
  out.push(el('p', { class: 'fact-line', text: facts }));
  const lvDed = st.lastValid.deduction;
  if (lvDed && lvDed.incomeTaxYen === null) {
    out.push(el('p', { class: 'notice', text: 'ℹ 所得税額が未入力のため、所得税額による頭打ちをかけていません（実際の控除額は少なくなることがあります）。' }));
  }
  if (t.overridden) out.push(el('p', { class: 'notice', text: 'ℹ 手入力の値で計算中です（上書き欄に値があります）。' }));
  if (t.needsCheck) out.push(el('p', { class: 'warn-badge', text: '⚠ 要確認: この区分の値は確定できていません。必ず最新の制度で確認してください。' }));
  t.notes.forEach((n) => out.push(el('p', { class: 'notice', text: `ℹ ${n}` })));
  if (!t.eligible) {
    out.push(el('p', { class: 'error', text: '⚠ この区分・入居年の組み合わせでは控除額 0 として計算しています（原則対象外、または制度値なし）。例外に該当する場合は「制度値を手入力で上書きする」に限度額・期間を入力してください。' }));
  } else {
    const rows = t.rows.map((x) => {
      const flags = [];
      if (x.cappedByLimit) flags.push('借入限度額で頭打ち');
      if (x.cappedByTax) flags.push('税額で頭打ち');
      return el('tr', {}, [
        el('td', { text: `${x.year}（${x.nth}年目）` }),
        el('td', { class: 'num', text: yen(x.balance) }),
        el('td', { class: 'num', text: yen(x.target) }),
        el('td', { class: 'num', text: yen(x.credit) }),
        el('td', { text: flags.join('・') || '—' }),
      ]);
    });
    out.push(el('div', { class: 'table-scroll' }, [el('table', { class: 'data-table' }, [
      el('caption', { text: '年別の控除額（概算）' }),
      el('thead', {}, [el('tr', {}, ['年', '年末残高', '対象残高', '控除額', '頭打ち'].map((h) => el('th', { scope: 'col', text: h })))]),
      el('tbody', {}, rows),
      el('tfoot', {}, [el('tr', {}, [el('th', { scope: 'row', text: '合計' }), el('td', {}), el('td', {}), el('td', { class: 'num', text: yen(t.total) }), el('td', { text: man(t.total) })])]),
    ])]));
    out.push(el('p', { class: 'hint', text: '控除額は 100 円未満切り捨て。所得税額（任意入力）と住民税の控除上限による頭打ちを簡易に反映しています。' }));
  }
  COMMON_NOTES.forEach((n) => out.push(el('p', { class: 'hint', text: n })));
  out.push(sourcesBlock());
  setChildren(root, out);
}
