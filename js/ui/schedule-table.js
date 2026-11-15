// 年次返済予定表（折りたたみ）。
import { el, setChildren } from './dom.js';
import { caseName } from './state.js';
import { yen } from './format.js';

let openState = false;

export function renderSchedule(root, st) {
  const i = st.activeCaseIndex;
  const r = st.results[i];
  if (!r) {
    setChildren(root, el('p', { class: 'error', text: '⚠ 入力エラーのため表示できません。' }));
    return;
  }
  const showCredit = r.taxCredit.enabled;
  const heads = ['年', '経過年数', '年間返済額', 'うち元金', 'うち利息', '繰上返済額', '年末残高'];
  if (showCredit) heads.push('控除額（概算）');
  const tot = { payment: 0, principal: 0, interest: 0, prepay: 0, credit: 0 };
  const rows = r.annual.map((a) => {
    tot.payment += a.payment; tot.principal += a.principal; tot.interest += a.interest; tot.prepay += a.prepay; tot.credit += a.taxCredit;
    const cells = [
      el('th', { scope: 'row', text: `${a.year}（${a.months}回）` }),
      el('td', { class: 'num', text: String(a.elapsed) }),
      el('td', { class: 'num', text: yen(a.payment) }),
      el('td', { class: 'num', text: yen(a.principal) }),
      el('td', { class: 'num', text: yen(a.interest) }),
      el('td', { class: 'num', text: a.prepay ? yen(a.prepay) : '—' }),
      el('td', { class: 'num', text: yen(a.endBalance) }),
    ];
    if (showCredit) cells.push(el('td', { class: 'num', text: a.taxCredit ? yen(a.taxCredit) : '—' }));
    return el('tr', {}, cells);
  });
  const foot = [
    el('th', { scope: 'row', text: '合計' }), el('td'),
    el('td', { class: 'num', text: yen(tot.payment) }), el('td', { class: 'num', text: yen(tot.principal) }),
    el('td', { class: 'num', text: yen(tot.interest) }), el('td', { class: 'num', text: yen(tot.prepay) }), el('td'),
  ];
  if (showCredit) foot.push(el('td', { class: 'num', text: yen(tot.credit) }));
  const details = el('details', { id: 'schedule-details' }, [
    el('summary', { text: `${caseName(st.raw.cases[i], i)} の年次返済予定表を開く` }),
    el('div', { class: 'table-scroll' }, [el('table', { class: 'data-table' }, [
      el('caption', { text: '年次返済予定表（暦年集計。年末残高は返済・繰上返済後）' }),
      el('thead', {}, [el('tr', {}, heads.map((h) => el('th', { scope: 'col', text: h })))]),
      el('tbody', {}, rows),
      el('tfoot', {}, [el('tr', {}, foot)]),
    ])]),
    el('p', { class: 'hint', text: '年次の年間返済額には繰上返済額を含みません（繰上返済額は別列）。残高推移グラフと同じ値です。' }),
    showCredit ? el('p', { class: 'hint', text: '控除額の列は返済のある年だけに表示します。返済開始前の入居年の控除は含まれないことがあるため、控除の合計は「住宅ローン控除」セクションを参照してください。' }) : null,
  ]);
  if (openState) details.open = true;
  details.addEventListener('toggle', () => { openState = details.open; });
  setChildren(root, details);
}
