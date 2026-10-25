// أدوات بناء الواجهة عبر DOM فقط (textContent)، دون إدراج نصوص غير موثوقة كشيفرة.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, opts = {}, kids = []) {
  const n = document.createElement(tag);
  if (opts.class) n.className = opts.class;
  if (opts.text != null) n.textContent = opts.text;
  if (opts.attrs) {
    for (const k of Object.keys(opts.attrs)) {
      if (/^on/i.test(k)) continue; // لا خصائص أحداث مضمّنة
      n.setAttribute(k, opts.attrs[k]);
    }
  }
  if (opts.on) {
    for (const k of Object.keys(opts.on)) n.addEventListener(k, opts.on[k]);
  }
  for (const c of [].concat(kids)) {
    if (c == null || c === false) continue;
    if (typeof c === 'string') n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  }
  return n;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function loading(text) {
  return el('div', { class: 'state', text: text || 'جارٍ التحميل...', attrs: { role: 'status' } });
}

export function emptyState(text, ctaNode) {
  return el('div', { class: 'state' }, [el('p', { text: text }), ctaNode || null]);
}

export function errorState(text) {
  return el('div', { class: 'card' }, [
    el('h1', { text: 'حدث خطأ' }),
    el('p', { text: text }),
    el('a', { text: 'العودة إلى الرئيسية', attrs: { href: '#/' } })
  ]);
}

// زر آمن: يعطّل نفسه أثناء تنفيذ المعالج ويمنع الطلبات المزدوجة.
export function btn(text, handler, opts = {}) {
  const b = el('button', { class: 'btn' + (opts.ghost ? ' ghost' : ''), text: text, attrs: { type: 'button' } });
  b.addEventListener('click', async function () {
    if (b.disabled) return;
    b.disabled = true;
    b.classList.add('busy');
    try {
      await handler(b);
    } catch (e) {
      console.error('[أحچيلي]', e);
      if (opts.onError) opts.onError(String(e && e.message || e));
    } finally {
      b.disabled = false;
      b.classList.remove('busy');
    }
  });
  return b;
}

let fieldSeq = 0;
export function field(labelText, inputAttrs, tag) {
  fieldSeq += 1;
  const id = 'ahf' + fieldSeq;
  const input = el(tag || 'input', { attrs: Object.assign({}, inputAttrs, { id: id }) });
  const wrap = el('label', { class: 'field', attrs: { for: id } }, [
    el('span', { text: labelText }),
    input
  ]);
  wrap.input = input;
  return wrap;
}

export function note(text) {
  return el('p', { class: 'note', text: text || '', attrs: { role: 'status' } });
}

export function svg(paths, size = 24) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  for (const d of [].concat(paths)) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
  }
  return s;
}

export const ICONS = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.7V21h4.6v-5.6h4.8V21H19V9.7'],
  compass: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M15.6 8.4 13 13l-4.6 2.6L11 11z'],
  ask: ['M21 11.6a8.4 8.4 0 0 1-8.4 8.4c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.4A8.4 8.4 0 1 1 21 11.6z', 'M12 8.2a2.4 2.4 0 0 0-2.4 2.2', 'M12 14.4v.2'],
  bell: ['M18 8.4a6 6 0 1 0-12 0c0 6.6-2.8 7.6-2.8 7.6h17.6S18 15 18 8.4', 'M13.8 20.4a2.2 2.2 0 0 1-3.6 0'],
  person: ['M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4.5 20.6c.7-3.7 3.9-5.6 7.5-5.6s6.8 1.9 7.5 5.6']
};
