// 資金計画チェック（申込書の記入イメージ）。左: 必要資金、右: 調達資金。
import { el, setChildren } from './dom.js';
import { caseName } from './state.js';
import { man, fundingWarning } from './format.js';

export function renderFunding(root, st, handlers) {
  const i = st.activeCaseIndex;
  const r = st.results[i];
  const sel = el('select', { id: 'funding-case', 'aria-label': '資金計画を表示するケース' },
    st.raw.cases.map((c, k) => el('option', { value: String(k), text: caseName(c, k) })));
  sel.value = String(i);
  sel.addEventListener('change', () => handlers.setActive(Number(sel.value)));
  const head = el('div', { class: 'field inline-field' }, [
    el('label', { for: 'funding-case', text: '表示するケース' }), sel,
  ]);
  if (!r) {
    setChildren(root, [head, el('p', { class: 'error', text: '⚠ 入力エラーのため表示できません。' })]);
    return;
  }
  const f = r.funding;
  const cell = (text, cls = '') => el('td', { class: cls, text });
  const hd = (text, cls = '') => el('th', { scope: 'row', class: cls, text });
  const rows = [];
  rows.push(el('tr', {}, [hd('売買契約金額'), cell(man(st.lastValid.common.priceYen), 'num'), hd('借入額'), cell(man(r.loanYen), 'num')]));
  rows.push(el('tr', {}, [hd(r.guarantee.lumpYen > 0 ? '諸経費（一括保証料を含む）' : '諸経費'), cell(man(f.expensesTotal), 'num'), hd('自己資金'), cell(man(f.ownFunds), 'num')]));
  rows.push(el('tr', { class: 'sub-row' }, [cell(''), cell(''), hd('（うち手付金 支払済み）', 'sub-head'), cell(`（${man(f.deposit)}）`, 'num sub-cell')]));
  rows.push(el('tr', { class: 'sub-row' }, [cell(''), cell(''), hd('（うち決済時必要現金）', 'sub-head'), cell(`（${man(f.cashAtSettlement)}）`, 'num sub-cell')]));
  rows.push(el('tr', { class: 'total-row' }, [hd('必要資金 合計'), cell(man(f.required), 'num'), hd('調達資金 合計'), cell(man(f.raised), 'num')]));
  const table = el('div', { class: 'table-scroll' }, [
    el('table', { class: 'form-image' }, [
      el('caption', { text: '申込書 資金計画欄のイメージ（金額は概算）' }),
      el('thead', {}, [el('tr', {}, [el('th', { colspan: '2', scope: 'colgroup', text: '必要資金' }), el('th', { colspan: '2', scope: 'colgroup', text: '調達資金' })])]),
      el('tbody', {}, rows),
    ]),
  ]);

  let status;
  if (f.status === 'match') status = el('p', { class: 'status status-ok', role: 'status', text: '✓ 一致（必要資金 ＝ 調達資金）' });
  else if (f.status === 'short') status = el('p', { class: 'status status-ng', role: 'status', text: `⚠ 調達資金が ${man(Math.abs(f.diff))} 不足しています` });
  else status = el('p', { class: 'status status-ng', role: 'status', text: `⚠ 調達資金が ${man(f.diff)} 超過しています` });

  const out = [head, table, status];
  if (f.status !== 'match' && st.raw.cases[i].ownFundsMode === 'manual') {
    out.push(el('button', {
      type: 'button', class: 'btn btn-secondary', text: '差額を自己資金に反映',
      onClick: () => handlers.fillOwnFunds(f.fillOwnFunds),
    }));
  }
  if (f.cashAtSettlement < 0 && r.loanYen > f.required - f.deposit) {
    out.push(el('p', { class: 'notice', text: `ℹ 手付金のうち ${man(f.depositReturned)} が手元に戻る計算です（借入額が『必要資金 − 手付金』を超えています）。` }));
  } else if (f.cashAtSettlement < 0) {
    out.push(el('p', { class: 'notice', text: `ℹ 自己資金（手付金を含む総額）が手付金より ${man(f.depositReturned)} 少なくなっています。手付金は自己資金の内訳なので、自己資金の入力を確認してください。` }));
  } else {
    out.push(el('p', { class: 'hint', text: `決済時までに追加で用意する現金: ${man(f.cashAtSettlement)}（自己資金 − 手付金）` }));
  }
  f.warnings.forEach((w) => out.push(el('p', { class: 'error', text: `⚠ ${fundingWarning(w)}` })));
  out.push(el('p', { class: 'hint', text: '実際の申込書の項目名・内訳は金融機関の様式に従ってください。手付金は売買契約時に自己資金から支払済みで、決済時に売買代金へ充当される前提です。' }));
  setChildren(root, out);
}
