import { el, clear, loading, errorState, mockBanner } from './ui.js';
import { avatar } from './avatars.js';

const view = document.getElementById('view');
const tabsEl = document.getElementById('tabs');
const errbox = document.getElementById('errbox');

// التفاصيل التقنية تُسجَّل في console فقط، والمستخدم يرى رسالة عامة.
function showErr() {
  errbox.textContent = 'حدث خطأ غير متوقع. حدّث الصفحة وحاول مجدداً.';
  errbox.setAttribute('data-kind', 'runtime');
  errbox.hidden = false;
}
window.addEventListener('error', (e) => {
  console.error('[أحچيلي]', e.error || e.message);
  if (!e.filename || e.filename.indexOf(location.origin) === 0) showErr();
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[أحچيلي]', e.reason);
  showErr();
});

const NAMES = ['مستخدم تجريبي', 'Sara', 'علي', 'Omar', 'نور'];

function home() {
  return el('div', {}, [
    el('h1', { text: 'أحچيلي' }),
    el('div', { class: 'card' }, [
      el('p', { text: 'نسخة تأسيسية للواجهة والتوجيه فقط، وليست تطبيقاً مكتملاً أو إنتاجياً.' }),
      el('strong', { text: 'يعمل الآن:' }),
      el('ul', {}, [
        el('li', { text: 'واجهة عربية RTL والتنقل بين الشاشات' }),
        el('li', { text: 'صور رمزية مولّدة من الحروف' })
      ]),
      el('strong', { text: 'غير منفّذ بعد:' }),
      el('ul', {}, [
        el('li', { text: 'التسجيل والدخول' }),
        el('li', { text: 'قاعدة البيانات والأسئلة والأجوبة' }),
        el('li', { text: 'رفع الصور' })
      ])
    ]),
    el('div', { class: 'card' }, [
      el('strong', { text: 'سطر اختبار الاتجاه (يُحذف لاحقاً):' }),
      el('p', { text: 'مرحباً بك في Ahcheely 2026 — أحچيلي: 123' })
    ])
  ]);
}

function login() {
  const note = el('p', { class: 'note', attrs: { role: 'status' } });
  return el('div', {}, [
    el('h1', { text: 'تسجيل الدخول' }),
    mockBanner(),
    el('div', { class: 'card' }, [
      el('label', { class: 'field' }, [
        el('span', { text: 'البريد الإلكتروني' }),
        el('input', { attrs: { type: 'email', disabled: '', placeholder: 'معطّل: معاينة شكلية' } })
      ]),
      el('label', { class: 'field' }, [
        el('span', { text: 'كلمة المرور' }),
        el('input', { attrs: { type: 'password', disabled: '', placeholder: 'معطّل: معاينة شكلية' } })
      ]),
      el('button', {
        class: 'btn',
        text: 'دخول',
        attrs: { type: 'button' },
        on: { click: () => { note.textContent = 'تسجيل الدخول غير مفعّل بعد، وسيُنفَّذ في المرحلة 2. لم يُرسل أي شيء.'; } }
      }),
      note
    ])
  ]);
}

function profile() {
  let i = 0;
  const holder = el('span');
  const nameEl = el('strong');
  function paint() {
    clear(holder);
    holder.appendChild(avatar(NAMES[i], 56));
    nameEl.textContent = NAMES[i];
  }
  paint();
  return el('div', {}, [
    el('h1', { text: 'الملف الشخصي' }),
    mockBanner(),
    el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [holder, nameEl]),
      el('p', { class: 'note', text: 'بيانات توضيحية وليست حساباً حقيقياً.' }),
      el('button', {
        class: 'btn',
        text: 'تبديل الاسم التجريبي',
        attrs: { type: 'button' },
        on: { click: () => { i = (i + 1) % NAMES.length; paint(); } }
      })
    ])
  ]);
}

function questions() {
  return el('div', {}, [
    el('h1', { text: 'الأسئلة' }),
    mockBanner(),
    el('div', { class: 'card state', text: 'لا توجد أسئلة بعد.' })
  ]);
}

function notFound(p) {
  return el('div', { class: 'card' }, [
    el('h1', { text: 'الصفحة غير موجودة' }),
    el('p', { text: 'المسار: ' + p.slice(0, 60) }),
    el('a', { text: 'العودة إلى الرئيسية', attrs: { href: '#/' } })
  ]);
}

const routes = { '/': home, '/login': login, '/profile': profile, '/questions': questions };
const titles = { '/': 'الرئيسية', '/login': 'الدخول', '/profile': 'الملف الشخصي', '/questions': 'الأسئلة' };
const tabs = [['/', 'الرئيسية'], ['/questions', 'الأسئلة'], ['/profile', 'الملف'], ['/login', 'الدخول']];

for (const t of tabs) {
  tabsEl.appendChild(el('a', { text: t[1], attrs: { href: '#' + t[0], 'data-path': t[0] } }));
}

function currentPath() {
  const h = location.hash.slice(1).split('?')[0];
  if (!h) return '/';
  return h.charAt(0) === '/' ? h : '/' + h;
}

function render() {
  const p = currentPath();
  const known = Object.prototype.hasOwnProperty.call(routes, p);
  clear(view);
  view.appendChild(loading());
  try {
    const node = known ? routes[p]() : notFound(p);
    clear(view);
    view.appendChild(node);
    document.title = (titles[p] || 'غير موجود') + ' — أحچيلي';
  } catch (e) {
    console.error('[أحچيلي] render', e);
    clear(view);
    view.appendChild(errorState('تعذّر عرض هذه الشاشة. حاول مرة أخرى لاحقاً.'));
  }
  for (const a of tabsEl.children) {
    if (a.getAttribute('data-path') === p) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  view.focus();
}

window.addEventListener('hashchange', render);
render();
// التهيئة الفعلية: اكتمل تنفيذ هذا الملف وأول عرض للشاشة.
window.__ahcheelyBooted = true;
if (errbox.getAttribute('data-kind') === 'boot') errbox.hidden = true;
