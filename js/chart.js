// 残高推移グラフ（SVG 自前描画）。色＋線種＋マーカーで系列を区別し、タップ／ホバーで値を表示する。
// 配色は CSS クラス（.series-0〜2、.chart-grid など）で与え、ダークモードに追従する。
import { el } from './ui/dom.js';

const NS = 'http://www.w3.org/2000/svg';
const DASH = ['', '6 4', '2 3'];
const nf = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

function s(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, String(v));
  children.forEach((c) => n.append(c));
  return n;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

function marker(kind, x, y, cls) {
  if (kind === 0) return s('circle', { cx: x, cy: y, r: 3.5, class: `marker ${cls}` });
  if (kind === 1) return s('rect', { x: x - 3.5, y: y - 3.5, width: 7, height: 7, class: `marker ${cls}` });
  return s('path', { d: `M${x} ${y - 4.5} L${x + 4.5} ${y + 3.5} L${x - 4.5} ${y + 3.5} Z`, class: `marker ${cls}` });
}

/** points: [{year, balanceYen}] を year 昇順で。年が範囲外なら先頭は借入額・末尾以降は 0 */
function valueAt(points, year) {
  if (year < points[0].year) return points[0].balanceYen;
  let v = points[0].balanceYen;
  for (const p of points) { if (p.year <= year) v = p.balanceYen; else break; }
  if (year > points[points.length - 1].year) return 0;
  return v;
}

/**
 * @param {HTMLElement} container
 * @param {{series: Array<{label:string, points:Array<{year:number,balanceYen:number}>, styleIndex:number}>, limitYen:number|null}} data
 */
export function renderBalanceChart(container, data) {
  container.replaceChildren();
  const series = data.series.filter((x) => x.points.length > 0);
  if (series.length === 0) {
    container.append(el('p', { class: 'hint', text: '表示できるデータがありません。' }));
    return;
  }
  const width = Math.max(300, Math.floor(container.clientWidth || 320));
  const height = width < 480 ? 240 : 320;
  const m = { l: 52, r: 14, t: 14, b: 30 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const years = series.flatMap((x) => x.points.map((p) => p.year));
  const x0 = Math.min(...years);
  const x1 = Math.max(...years, x0 + 1);
  const maxVal = Math.max(...series.flatMap((x) => x.points.map((p) => p.balanceYen)), data.limitYen || 0);
  const yMax = niceMax(maxVal / 10000); // 万円
  const sx = (yr) => m.l + ((yr - x0) / (x1 - x0)) * iw;
  const sy = (man) => m.t + ih - (man / yMax) * ih;

  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img', 'aria-label': '残高推移グラフ（年末残高、万円）。同じ内容は年次返済予定表で確認できます。', class: 'chart-svg' });
  // グリッドと縦軸
  const ticks = 4;
  for (let k = 0; k <= ticks; k++) {
    const v = (yMax / ticks) * k;
    const y = sy(v);
    svg.append(s('line', { x1: m.l, x2: width - m.r, y1: y, y2: y, class: 'chart-grid' }));
    const t = s('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', class: 'chart-text' });
    t.textContent = nf.format(v);
    svg.append(t);
  }
  const unit = s('text', { x: 4, y: 10, class: 'chart-text' });
  unit.textContent = '万円';
  svg.append(unit);
  // 横軸（年）
  const span = x1 - x0;
  const step = span > 30 ? 10 : span > 14 ? 5 : span > 6 ? 2 : 1;
  for (let yr = Math.ceil(x0 / step) * step; yr <= x1; yr += step) {
    const x = sx(yr);
    svg.append(s('line', { x1: x, x2: x, y1: m.t + ih, y2: m.t + ih + 4, class: 'chart-grid' }));
    const t = s('text', { x, y: height - 8, 'text-anchor': 'middle', class: 'chart-text' });
    t.textContent = String(yr);
    svg.append(t);
  }
  svg.append(s('line', { x1: m.l, x2: m.l, y1: m.t, y2: m.t + ih, class: 'chart-axis' }));
  svg.append(s('line', { x1: m.l, x2: width - m.r, y1: m.t + ih, y2: m.t + ih, class: 'chart-axis' }));
  // 控除の借入限度額
  if (data.limitYen && data.limitYen > 0) {
    const y = sy(data.limitYen / 10000);
    svg.append(s('line', { x1: m.l, x2: width - m.r, y1: y, y2: y, class: 'chart-limit' }));
    const t = s('text', { x: width - m.r - 2, y: y - 4, 'text-anchor': 'end', class: 'chart-text chart-limit-text' });
    t.textContent = `控除の借入限度額 ${nf.format(data.limitYen / 10000)} 万円`;
    svg.append(t);
  }
  // 系列
  series.forEach((ser) => {
    const idx = ser.styleIndex % 3;
    const cls = `series-${idx}`;
    const d = ser.points.map((p, k) => `${k ? 'L' : 'M'}${sx(p.year).toFixed(1)} ${sy(p.balanceYen / 10000).toFixed(1)}`).join(' ');
    svg.append(s('path', { d, class: `line ${cls}`, fill: 'none', 'stroke-dasharray': DASH[idx] || null }));
    if (ser.points.length <= 40) ser.points.forEach((p) => svg.append(marker(idx, sx(p.year), sy(p.balanceYen / 10000), cls)));
  });
  // 操作
  const cursor = s('line', { y1: m.t, y2: m.t + ih, class: 'chart-cursor', visibility: 'hidden' });
  svg.append(cursor);
  const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', class: 'chart-hit' });
  svg.append(hit);
  const tip = el('div', { class: 'chart-tip', 'aria-live': 'polite', text: 'グラフをタップすると、その年末の残高が表示されます。' });

  function show(evt) {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * width;
    const yr = Math.max(x0, Math.min(x1, Math.round(x0 + ((px - m.l) / iw) * (x1 - x0))));
    cursor.setAttribute('x1', sx(yr));
    cursor.setAttribute('x2', sx(yr));
    cursor.setAttribute('visibility', 'visible');
    tip.textContent = `${yr} 年末: ${series.map((ser) => `${ser.label} ${nf.format(valueAt(ser.points, yr) / 10000)} 万円`).join(' ／ ')}`;
  }
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);

  const legend = el('ul', { class: 'legend' }, series.map((ser) => {
    const idx = ser.styleIndex % 3;
    const mini = s('svg', { width: 36, height: 14, viewBox: '0 0 36 14', 'aria-hidden': 'true' }, [
      s('line', { x1: 2, x2: 34, y1: 7, y2: 7, class: `line series-${idx}`, 'stroke-dasharray': DASH[idx] || null }),
      marker(idx, 18, 7, `series-${idx}`),
    ]);
    return el('li', {}, [mini, el('span', { text: ser.label })]);
  }));
  container.append(legend, svg, tip);
}

/** 幅の変化で再描画する。render は () => void */
export function observeWidth(container, render) {
  let last = container.clientWidth;
  if (typeof ResizeObserver === 'undefined') return;
  let scheduled = false;
  new ResizeObserver(() => {
    const w = container.clientWidth;
    if (Math.abs(w - last) < 1 || scheduled) return;
    last = w;
    // 通知の処理中に描画してレイアウトを変えると「ResizeObserver ループ」通知が出るため、次フレームに回す
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  }).observe(container);
}
