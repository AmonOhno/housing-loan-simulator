// 要素生成ヘルパー。利用者入力・復号結果は textContent / 属性値としてだけ扱い、innerHTML は使わない。

/**
 * @param {string} tag
 * @param {object} [attrs] class, text, on{Event}（関数）、その他は属性。値が false/null/undefined の属性は付けない
 * @param {Array<Node|string>} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = !!v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

/** 子要素をすべて置き換える */
export function setChildren(node, children) {
  node.replaceChildren(...[].concat(children).filter((c) => c !== null && c !== undefined && c !== false)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c)));
}

let uid = 0;
export function nextId(prefix = 'f') {
  uid += 1;
  return `${prefix}-${uid}`;
}
