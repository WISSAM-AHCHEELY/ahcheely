import { el } from './ui.js';

const COLORS = ['#c8102e', '#1565c0', '#2e7d32', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457', '#455a64'];

// صورة رمزية: أول حرف من الاسم + لون ثابت مشتق من الاسم. لا صور ولا رفع.
export function avatar(name, size = 48) {
  const s = String(name || '').trim();
  const ch = s ? Array.from(s)[0] : '؟';
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const a = el('span', { class: 'avatar', text: ch.toUpperCase(), attrs: { 'aria-hidden': 'true' } });
  a.style.width = size + 'px';
  a.style.height = size + 'px';
  a.style.fontSize = Math.round(size * 0.5) + 'px';
  a.style.background = COLORS[h % COLORS.length];
  return a;
}
