// أدوات بناء الواجهة عبر DOM فقط (textContent)، دون إدراج نصوص كشيفرة.
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
  for (const c of [].concat(kids)) if (c) n.appendChild(c);
  return n;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function loading() {
  return el('div', { class: 'state', text: 'جارٍ التحميل...', attrs: { role: 'status' } });
}

export function errorState(msg) {
  return el('div', { class: 'card' }, [
    el('h1', { text: 'حدث خطأ' }),
    el('p', { text: msg }),
    el('a', { text: 'العودة إلى الرئيسية', attrs: { href: '#/' } })
  ]);
}

export function mockBanner() {
  return el('div', { class: 'mock', text: 'شاشة شكلية: لا توجد وظائف خلفية بعد، ولا تُحفظ أو تُرسل أي بيانات.' });
}
