// シナリオ比較表。基準ケースとの差額を符号と文言の両方で示す。
import { el, setChildren } from './dom.js';
import { caseName } from './state.js';
import { compareCases } from '../calc/scenario.js';
import { yen, percent, ymLabel, METHOD_LABEL, diffText } from './format.js';

function valueText(unit, v) {
  if (v === null || v === undefined) return '—';
  switch (unit) {
    case 'yen': return yen(v);
    case 'percent': return percent(v);
    case 'ratio': return `${Number(v).toFixed(1)}%`;
    case 'years': return `${v} 年`;
    case 'method': return METHOD_LABEL[v] || v;
    case 'ym': return ymLabel(v);
    default: return String(v);
  }
}

export function renderCompare(root, st, handlers) {
  const n = st.raw.cases.length;
  // エラーがあるケースは「—」（要件 4.5）
  const results = st.results.map((r, i) => (st.caseHasError[i] ? null : r));
  const table = compareCases(results, st.baseCaseIndex);

  const sel = el('select', { id: 'base-case', 'aria-label': '比較の基準ケース' },
    st.raw.cases.map((c, k) => el('option', { value: String(k), text: caseName(c, k) })));
  sel.value = String(st.baseCaseIndex);
  sel.addEventListener('change', () => handlers.setBase(Number(sel.value)));
  const head = el('div', { class: 'field inline-field' }, [el('label', { for: 'base-case', text: '基準ケース' }), sel]);

  const thead = el('thead', {}, [el('tr', {}, [
    el('th', { scope: 'col', class: 'sticky-col', text: '項目' }),
    ...st.raw.cases.map((c, k) => el('th', { scope: 'col', text: `${caseName(c, k)}${k === st.baseCaseIndex ? '（基準）' : ''}` })),
  ])]);
  const tbody = el('tbody', {}, table.rows.map((row) => el('tr', {}, [
    el('th', { scope: 'row', class: 'sticky-col', text: row.label }),
    ...row.cells.map((cell) => {
      const td = el('td', { class: 'num' });
      td.append(valueText(row.unit, cell.value));
      if (cell.diff !== null && cell.diff !== undefined) {
        td.append(el('span', { class: `diff diff-${cell.diffDirection}`, text: diffText(cell.diff, row.unit, cell.diffDirection) }));
      }
      return td;
    }),
  ])));
  const out = [head, el('div', { class: 'table-scroll' }, [el('table', { class: 'compare-table' }, [thead, tbody])])];

  // 主な差額の要約文
  const monthly = table.rows.find((r) => r.key === 'monthly');
  const interest = table.rows.find((r) => r.key === 'totalInterest');
  const lines = [];
  results.forEach((r, k) => {
    if (k === st.baseCaseIndex || !r) return;
    const m = monthly.cells[k];
    const t = interest.cells[k];
    if (m.diff === null || t.diff === null) return;
    lines.push(`${caseName(st.raw.cases[k], k)}は基準より 毎月返済額が ${diffText(m.diff, 'yen', m.diffDirection)}、総利息が ${diffText(t.diff, 'yen', t.diffDirection)}`);
  });
  if (lines.length) out.push(el('ul', { class: 'diff-summary' }, lines.map((t) => el('li', { text: t }))));
  if (n < 2) out.push(el('p', { class: 'hint', text: 'ケースを追加すると、基準ケースとの差額が表示されます。' }));
  setChildren(root, out);
}
