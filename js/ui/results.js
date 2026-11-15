// 結果サマリー（選択中ケース）と繰上返済の効果。
import { el, setChildren } from './dom.js';
import { caseName } from './state.js';
import {
  yenWithMan, yen, percent, ymLabel, METHOD_LABEL, monthsLabel, BURDEN_LABEL, man,
} from './format.js';

function item(label, valueNodes, cls = '') {
  return el('div', { class: `kv ${cls}` }, [el('dt', { text: label }), el('dd', {}, valueNodes)]);
}

export function renderSummary(root, st) {
  const i = st.activeCaseIndex;
  const r = st.results[i];
  const name = caseName(st.raw.cases[i], i);
  if (!r) {
    setChildren(root, el('p', { class: 'error', text: `⚠ ${name}: 入力エラーのため結果を表示できません。入力欄のエラーを直してください。` }));
    return;
  }
  const s = r.summary;
  const out = [];
  out.push(el('h3', { class: 'result-title', text: name }));
  if (st.caseHasError[i]) {
    out.push(el('p', { class: 'notice stale', text: '⚠ 入力エラーのため、前回の有効な入力での結果を表示しています。' }));
  }
  const dl = [];
  const isEP = r.method === 'equalPrincipal';
  dl.push(item('毎月返済額', isEP
    ? [yen(s.initialMonthly), el('span', { class: 'sub', text: `（初回。最終回 ${yen(s.lastMonthly)}）` })]
    : [yen(s.initialMonthly)], 'kv-main'));
  if (s.initialBonus > 0) {
    dl.push(item('ボーナス月の加算額（年 2 回）', isEP
      ? [yen(s.initialBonus), el('span', { class: 'sub', text: `（初回。最終回 ${yen(s.lastBonus)}）` })]
      : [yen(s.initialBonus)]));
    dl.push(item('ボーナス月の返済額', [yen(s.initialMonthly + s.initialBonus)]));
  }
  dl.push(item('年間返済額（初年度 12 か月）', [yenWithMan(s.firstYearPayment)]));
  dl.push(item('総返済額', [yenWithMan(s.totalPayment)]));
  dl.push(item('総利息', [yenWithMan(s.totalInterest)], 'kv-main'));
  if (s.lumpYen > 0) {
    dl.push(item('一括保証料', [yenWithMan(s.lumpYen)]));
    dl.push(item('総支払額（総返済額＋一括保証料）', [yenWithMan(s.totalPaid)]));
  }
  dl.push(item('計算に使った金利', [percent(r.effectiveRateMilli / 1000)]));
  if (s.burdenRatio === null) {
    dl.push(item('返済負担率', ['—', el('span', { class: 'sub', text: '（年収が未入力または 0 のため表示しません）' })]));
  } else {
    const [label, icon] = BURDEN_LABEL[s.burdenLevel];
    dl.push(item('返済負担率', [`${Number(s.burdenRatio).toFixed(1)}%`, el('span', { class: `badge badge-${s.burdenLevel}`, text: `${icon} ${label}` })]));
  }
  dl.push(item('完済時期', [ymLabel(s.lastYm), s.monthsShortened > 0 ? el('span', { class: 'sub', text: `（繰上返済で ${monthsLabel(s.monthsShortened)} 短縮）` }) : null]));
  if (r.taxCredit.enabled) {
    dl.push(item('住宅ローン控除の合計（概算）', [yenWithMan(r.taxCredit.total)]));
    dl.push(item('実質負担（総支払額 − 控除合計）', [yenWithMan(s.realBurden)]));
  }
  out.push(el('dl', { class: 'kv-list' }, dl));
  out.push(el('p', { class: 'hint', text: '返済負担率は初年度の年間返済額 ÷ 税込年収です。審査上の返済負担率（審査金利・他の借入を含む）とは一致しません。目安: 25% 以下は目安内、35% 超は警告（審査基準ではありません）。' }));

  // 繰上返済の効果
  const eff = r.prepay.effect;
  if (eff) {
    const lines = [`利息の軽減額: ${yenWithMan(eff.interestSaved)}`];
    if (eff.monthsShortened > 0) lines.push(`完済時期が ${monthsLabel(eff.monthsShortened)} 早まります`);
    if (eff.reducedPayment !== null) lines.push(`返済額軽減後の毎月返済額: ${yen(eff.reducedPayment)}`);
    if (eff.reducedBonus) lines.push(`返済額軽減後のボーナス加算額: ${yen(eff.reducedBonus)}`);
    out.push(el('div', { class: 'info-box' }, [
      el('h3', { text: '繰上返済の効果（繰上返済なしとの比較）' }),
      el('ul', {}, lines.map((t) => el('li', { text: t }))),
    ]));
  }
  // 警告
  const msgs = [];
  r.prepay.warnings.forEach((w) => msgs.push(`繰上返済 ${w.inputIndex + 1}: ${w.message}`));
  (r.prepay.log || []).forEach((l) => {
    if (l.ignored) msgs.push(l.ignored);
    else if (l.full) msgs.push('繰上返済額が残高以上のため、全額繰上返済として扱いました。');
  });
  (r.guarantee.notes || []).forEach((n) => msgs.push(n));
  if (r.guarantee.lumpUnitPerMillion) {
    msgs.push(`一括保証料の目安: 借入 100 万円あたり約 ${Math.round(r.guarantee.lumpUnitPerMillion).toLocaleString('ja-JP')} 円で計算（一般的な目安・要確認）。`);
  }
  const notice = st.notices.cases[i];
  if (notice) Object.values(notice).forEach((n) => msgs.push(n));
  if (msgs.length) out.push(el('ul', { class: 'notice-list' }, msgs.map((t) => el('li', { text: `ℹ ${t}` }))));
  void man;
  setChildren(root, out);
}
export { METHOD_LABEL };
