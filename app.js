import { configured, ready, getProfile, getProfileByUsername, claimUsernameAndCreateProfile, updateMyProfile, usernameError, normalizeUsername, isUsernameAvailable } from './database.js';
import { watchAuth, registerAccount, loginAccount, logoutAccount, sendResetEmail, emailError, passwordError, mapAuthError } from './auth.js';
import { el, clear, loading, emptyState, errorState, btn, field, note, svg, ICONS } from './ui.js';
import { avatar } from './avatars.js';

const view = document.getElementById('view');
const tabsEl = document.getElementById('tabs');
const errbox = document.getElementById('errbox');
const headerAction = document.getElementById('headerAction');

let currentUser = null; // مستخدم المصادقة الحالي
let myProfile = null;   // بيانات users/{uid}
let renderSeq = 0;

// التفاصيل التقنية تُسجَّل في console فقط، والمستخدم يرى رسالة عامة.
function showRuntimeErr() {
  errbox.textContent = 'حدث خطأ غير متوقع. حدّث الصفحة وحاول مجدداً.';
  errbox.setAttribute('data-kind', 'runtime');
  errbox.hidden = false;
}
window.addEventListener('error', function (e) {
  console.error('[أحچيلي]', e.error || e.message);
  if (!e.filename || e.filename.indexOf(location.origin) === 0) showRuntimeErr();
});
window.addEventListener('unhandledrejection', function (e) {
  console.error('[أحچيلي]', e.reason);
  showRuntimeErr();
});

// ---------- شاشات ----------

function setupScreen() {
  return el('div', {}, [
    el('h1', { text: 'أحچيلي' }),
    el('div', { class: 'card' }, [
      el('p', { text: 'التطبيق يحتاج خطوة إعداد واحدة قبل أن يعمل: تعبئة إعدادات Firebase في الملف firebase-config.js.' }),
      el('p', { class: 'note', text: 'أرسل كائن firebaseConfig (من Firebase Console ← إعدادات المشروع ← تطبيقاتك) عبر المحادثة إلى المساعد ليضعها، ثم تختفي هذه الشاشة تلقائياً.' })
    ]),
    btn('إعادة المحاولة بعد التحديث', function () { location.reload(); })
  ]);
}

function promptLogin() {
  return el('div', { class: 'card' }, [
    el('h1', { text: 'يلزم تسجيل الدخول' }),
    el('p', { text: 'هذه الشاشة تحتاج حساباً. أنشئ حساباً جديداً أو سجّل الدخول للمتابعة.' }),
    el('div', { class: 'row' }, [
      el('a', { class: 'btn', text: 'إنشاء حساب', attrs: { href: '#/register' } }),
      el('a', { class: 'btn ghost', text: 'تسجيل الدخول', attrs: { href: '#/login' } })
    ])
  ]);
}

function homeScreen() {
  if (!currentUser) {
    return el('div', {}, [
      el('h1', { text: 'أحچيلي' }),
      el('div', { class: 'card hero' }, [
        el('p', { text: 'منصة أسئلة وأجوبة اجتماعية عربية: اسأل أصدقاءك بصراحة، أجب بمجهولية آمنة، واكتشف آراء الناس.' }),
        el('div', { class: 'row' }, [
          el('a', { class: 'btn', text: 'إنشاء حساب', attrs: { href: '#/register' } }),
          el('a', { class: 'btn ghost', text: 'تسجيل الدخول', attrs: { href: '#/login' } })
        ])
      ]),
      el('div', { class: 'card' }, [
        el('strong', { text: 'حالة البناء بصدق:' }),
        el('ul', {}, [
          el('li', { text: 'المنجز: الحسابات والتسجيل والدخول والملفات الشخصية.' }),
          el('li', { text: 'المرحلة 2 القادمة: الأسئلة والمجهولية وصندوق الوارد والإجابات.' }),
          el('li', { text: 'المراحل 3 وما بعدها: Feed والمتابعة والإعجابات والصور والإشعارات.' })
        ])
      ])
    ]);
  }
  const name = (myProfile && myProfile.displayName) || 'صديقنا';
  return el('div', {}, [
    el('h1', { text: 'أهلاً، ' + name }),
    el('div', { class: 'card' }, [
      el('p', { text: 'حسابك جاهز. العمل جارٍ على مرحلة الأسئلة والإجابات وستظهر هنا تباعاً.' }),
      el('div', { class: 'row' }, [
        el('a', { class: 'btn', text: 'ملفي الشخصي', attrs: { href: '#/profile' } }),
        el('a', { class: 'btn ghost', text: 'الإعدادات', attrs: { href: '#/settings' } })
      ])
    ])
  ]);
}

function stageScreen(title, text) {
  return el('div', {}, [
    el('h1', { text: title }),
    el('div', { class: 'card state' }, [el('p', { text: text })]),
    el('a', { class: 'btn ghost', text: 'العودة إلى الرئيسية', attrs: { href: '#/' } })
  ]);
}
function discoverScreen() {
  return stageScreen('اكتشف', 'البحث عن المستخدمين والحسابات المقترحة والإجابات الرائجة يُبنى في المرحلة 3 (الشبكة الاجتماعية). لا تعرض هذه الشاشة أي بيانات وهمية.');
}
function askScreen() {
  return stageScreen('اسأل', 'إرسال الأسئلة (بالهوية أو مجهولاً) وصندوق الوارد والإجابات يُبنى في المرحلة 2، وهي أولوية العمل القادمة.');
}
function notificationsScreen() {
  return stageScreen('الإشعارات', 'الإشعارات داخل التطبيق وإشعارات Push تُبنى في المرحلة 5.');
}

function profileCard(profile, own) {
  const cover = el('div', { class: 'cover' });
  const av = avatar(profile.displayName || '؟', 72);
  av.classList.add('cover-av');
  cover.appendChild(av);
  const chips = el('div', { class: 'row chips' });
  if (profile.location) chips.appendChild(el('span', { class: 'chip', text: '📍 ' + profile.location }));
  for (const it of (profile.interests || [])) {
    chips.appendChild(el('span', { class: 'chip', text: it }));
  }
  let created = null;
  if (profile.createdAt && typeof profile.createdAt.toDate === 'function') {
    created = profile.createdAt.toDate();
  }
  return el('div', { class: 'card profile' }, [
    cover,
    el('h1', { class: 'pname', text: profile.displayName || '' }),
    el('p', { class: 'puser', text: '@' + (profile.username || '') }),
    profile.bio ? el('p', { class: 'pbio', text: profile.bio }) : null,
    chips.firstChild ? chips : null,
    created ? el('p', { class: 'note', text: 'عضو منذ ' + created.toLocaleDateString('ar') }) : null
  ]);
}

function shareBtn(username) {
  return btn('مشاركة رابط الملف', async function () {
    const url = location.origin + location.pathname + '#/u/' + encodeURIComponent(username);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'أحچيلي', url: url });
        return;
      }
      await navigator.clipboard.writeText(url);
      window.alert('تم نسخ الرابط.');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // ألغى المستخدم المشاركة
      window.alert('انسخ الرابط يدوياً: ' + url);
    }
  });
}

async function myProfileScreen() {
  if (!currentUser) return promptLogin();
  if (!myProfile) return loading('جارٍ تحميل ملفك...');
  const wrap = el('div', {}, [
    el('h1', { class: 'sr-only', text: 'الملف الشخصي' }),
    profileCard(myProfile, true)
  ]);
  wrap.appendChild(el('div', { class: 'row' }, [
    el('a', { class: 'btn', text: 'تعديل الملف', attrs: { href: '#/edit-profile' } }),
    shareBtn(myProfile.username),
    el('a', { class: 'btn ghost', text: 'الإعدادات', attrs: { href: '#/settings' } })
  ]));
  return wrap;
}

async function editProfileScreen() {
  if (!currentUser) return promptLogin();
  if (!myProfile) return loading('جارٍ تحميل ملفك...');
  const f1 = field('الاسم المعروض *', { value: myProfile.displayName || '', maxlength: '40', autocomplete: 'nickname' });
  const f2 = field('نبذة عنك (حتى 280 محرفاً)', { rows: '3', maxlength: '280' }, 'textarea');
  f2.input.value = myProfile.bio || '';
  const f3 = field('الموقع (اختياري)', { value: myProfile.location || '', maxlength: '60' });
  const f4 = field('الاهتمامات (اختياري، كلمات تفصلها فاصلة، حتى 5)', { value: (myProfile.interests || []).join('، '), maxlength: '120' });
  const status = note('');
  status.hidden = true;
  const save = btn('حفظ التغييرات', async function () {
    status.hidden = true;
    status.classList.remove('err');
    try {
      await updateMyProfile(currentUser.uid, {
        displayName: f1.input.value,
        bio: f2.input.value,
        location: f3.input.value,
        interests: f4.input.value
      });
      myProfile = await getProfile(currentUser.uid);
      updateHeader();
      location.hash = '#/profile';
    } catch (e) {
      status.textContent = mapAuthError(e);
      status.classList.add('err');
      status.hidden = false;
      throw e;
    }
  });
  return el('div', {}, [
    el('h1', { text: 'تعديل الملف' }),
    el('div', { class: 'card' }, [f1, f2, f3, f4, save, status]),
    el('p', { class: 'note' }, [el('a', { text: 'إلغاء والعودة', attrs: { href: '#/profile' } })])
  ]);
}

async function userScreen(username) {
  if (!username) return notFound('/u/');
  const data = await getProfileByUsername(username);
  if (!data) {
    return emptyState('لا يوجد مستخدم بهذا الاسم.', el('a', { class: 'btn ghost', text: 'العودة إلى الرئيسية', attrs: { href: '#/' } }));
  }
  const wrap = el('div', {}, [profileCard(data.profile, false)]);
  const row = el('div', { class: 'row' });
  if (currentUser && data.uid === currentUser.uid) {
    row.appendChild(el('a', { class: 'btn', text: 'تعديل ملفي', attrs: { href: '#/edit-profile' } }));
  }
  row.appendChild(shareBtn(data.profile.username));
  wrap.appendChild(row);
  return wrap;
}

async function loginScreen() {
  const f1 = field('البريد الإلكتروني', { type: 'email', autocomplete: 'email', inputmode: 'email' });
  const f2 = field('كلمة المرور', { type: 'password', autocomplete: 'current-password' });
  const status = note('');
  status.hidden = true;
  const submit = btn('تسجيل الدخول', async function () {
    status.hidden = true;
    status.classList.remove('err');
    const ee = emailError(f1.input.value);
    if (ee) { fail(ee); return; }
    try {
      const u = await loginAccount(f1.input.value, f2.input.value);
      currentUser = u;
      myProfile = await getProfile(u.uid);
      updateHeader();
      location.hash = myProfile ? '#/profile' : '#/complete';
    } catch (e) { fail(mapAuthError(e)); throw e; }
    function fail(t) {
      status.textContent = t;
      status.classList.add('err');
      status.hidden = false;
    }
  });
  return el('div', {}, [
    el('h1', { text: 'تسجيل الدخول' }),
    el('div', { class: 'card' }, [f1, f2, submit, status]),
    el('p', { class: 'note' }, ['ليس لديك حساب؟ ', el('a', { text: 'إنشاء حساب جديد', attrs: { href: '#/register' } })]),
    el('p', { class: 'note' }, [el('a', { text: 'نسيت كلمة المرور؟', attrs: { href: '#/reset' } })])
  ]);
}

async function registerScreen() {
  const f0 = field('الاسم المعروض *', { maxlength: '40', autocomplete: 'name' });
  const f1 = field('اسم المستخدم * (حروف وأرقام وشرطة سفلية، 3–20)', { maxlength: '20', autocomplete: 'username' });
  const unameNote = note('');
  unameNote.hidden = true;
  let checkTimer = null;
  f1.input.addEventListener('input', function () {
    clearTimeout(checkTimer);
    const v = normalizeUsername(f1.input.value);
    const err = usernameError(v);
    if (err) {
      unameNote.textContent = err;
      unameNote.classList.add('err');
      unameNote.hidden = false;
      return;
    }
    unameNote.textContent = 'جارٍ التحقق من الاسم...';
    unameNote.classList.remove('err');
    unameNote.hidden = false;
    checkTimer = setTimeout(async function () {
      try {
        const free = await isUsernameAvailable(v);
        unameNote.textContent = free ? 'الاسم متاح ✓' : 'الاسم محجوز، اختر غيره.';
        if (!free) unameNote.classList.add('err');
      } catch (e) { unameNote.hidden = true; }
    }, 400);
  });
  const f2 = field('البريد الإلكتروني *', { type: 'email', autocomplete: 'email', inputmode: 'email' });
  const f3 = field('كلمة المرور * (8 محارف على الأقل)', { type: 'password', autocomplete: 'new-password' });
  const f4 = field('تأكيد كلمة المرور *', { type: 'password', autocomplete: 'new-password' });
  const status = note('');
  status.hidden = true;
  const submit = btn('إنشاء الحساب', async function () {
    status.hidden = true;
    status.classList.remove('err');
    function fail(t) {
      status.textContent = t;
      status.classList.add('err');
      status.hidden = false;
    }
    if (!String(f0.input.value).trim()) { fail('الاسم المعروض مطلوب.'); return; }
    const ue = usernameError(f1.input.value);
    if (ue) { fail(ue); return; }
    const ee = emailError(f2.input.value);
    if (ee) { fail(ee); return; }
    const pe = passwordError(f3.input.value);
    if (pe) { fail(pe); return; }
    if (f3.input.value !== f4.input.value) { fail('كلمتا المرور غير متطابقتين.'); return; }
    try {
      const u = await registerAccount({
        email: f2.input.value,
        password: f3.input.value,
        username: f1.input.value,
        displayName: f0.input.value
      });
      currentUser = u;
      myProfile = await getProfile(u.uid);
      updateHeader();
      location.hash = '#/profile';
    } catch (e) { fail(mapAuthError(e)); throw e; }
  });
  return el('div', {}, [
    el('h1', { text: 'إنشاء حساب' }),
    el('div', { class: 'card' }, [f0, f1, unameNote, f2, f3, f4, submit, status]),
    el('p', { class: 'note' }, ['لديك حساب؟ ', el('a', { text: 'تسجيل الدخول', attrs: { href: '#/login' } })])
  ]);
}

async function resetScreen() {
  const f1 = field('البريد الإلكتروني', { type: 'email', inputmode: 'email', autocomplete: 'email' });
  const status = note('');
  status.hidden = true;
  const submit = btn('إرسال رابط الاستعادة', async function () {
    status.hidden = true;
    status.classList.remove('err');
    const ee = emailError(f1.input.value);
    if (ee) {
      status.textContent = ee;
      status.classList.add('err');
      status.hidden = false;
      return;
    }
    try {
      await sendResetEmail(f1.input.value);
      status.textContent = 'أرسلنا بريداً لإعادة تعيين كلمة المرور. افحص صندوق الوارد ومجلد الرسائل غير المرغوبة.';
    } catch (e) {
      status.textContent = mapAuthError(e);
      status.classList.add('err');
    }
    status.hidden = false;
  });
  return el('div', {}, [
    el('h1', { text: 'استعادة كلمة المرور' }),
    el('div', { class: 'card' }, [f1, submit, status]),
    el('p', { class: 'note' }, [el('a', { text: 'العودة إلى تسجيل الدخول', attrs: { href: '#/login' } })])
  ]);
}

async function settingsScreen() {
  if (!currentUser) return promptLogin();
  const status = note('');
  status.hidden = true;
  return el('div', {}, [
    el('h1', { text: 'الإعدادات' }),
    el('div', { class: 'card' }, [
      el('h2', { text: 'الحساب' }),
      el('p', { text: 'البريد: ' + (currentUser.email || '') }),
      el('p', { text: 'اسم المستخدم: ' + (myProfile ? '@' + myProfile.username : 'غير مكتمل بعد') }),
      el('div', { class: 'row' }, [
        el('a', { class: 'btn ghost', text: 'تعديل الملف', attrs: { href: '#/edit-profile' } }),
        btn('تغيير كلمة المرور', async function () {
          status.hidden = true;
          status.classList.remove('err');
          try {
            await sendResetEmail(currentUser.email);
            status.textContent = 'أرسلنا بريداً لتغيير كلمة المرور إلى ' + currentUser.email + '.';
          } catch (e) {
            status.textContent = mapAuthError(e);
            status.classList.add('err');
          }
          status.hidden = false;
        }),
        btn('تسجيل الخروج', async function () {
          await logoutAccount();
          location.hash = '#/';
        }, { ghost: true })
      ]),
      status
    ]),
    el('p', { class: 'note', text: 'تعطيل الحساب وحذفه يُتاحان في مرحلة لاحقة بعد بناء مسار حذف آمن.' })
  ]);
}

async function completeScreen() {
  if (!currentUser) return promptLogin();
  if (myProfile) { location.hash = '#/profile'; return loading(); }
  const f0 = field('الاسم المعروض *', { maxlength: '40' });
  const f1 = field('اسم المستخدم * (حروف وأرقام وشرطة سفلية، 3–20)', { maxlength: '20' });
  const status = note('');
  status.hidden = true;
  const submit = btn('إنشاء ملفي الشخصي', async function () {
    status.hidden = true;
    status.classList.remove('err');
    function fail(t) {
      status.textContent = t;
      status.classList.add('err');
      status.hidden = false;
    }
    if (!String(f0.input.value).trim()) { fail('الاسم المعروض مطلوب.'); return; }
    const ue = usernameError(f1.input.value);
    if (ue) { fail(ue); return; }
    try {
      await claimUsernameAndCreateProfile({
        uid: currentUser.uid,
        username: f1.input.value,
        displayName: f0.input.value
      });
      myProfile = await getProfile(currentUser.uid);
      updateHeader();
      location.hash = '#/profile';
    } catch (e) { fail(mapAuthError(e)); throw e; }
  });
  return el('div', {}, [
    el('h1', { text: 'أكمل إنشاء حسابك' }),
    el('div', { class: 'card' }, [
      el('p', { text: 'حسابك موجود لكن ملفه الشخصي غير مكتمل. اختر اسم مستخدم فريداً لإكمال التسجيل.' }),
      f0, f1, submit, status
    ])
  ]);
}

function notFound(p) {
  return el('div', { class: 'card' }, [
    el('h1', { text: 'الصفحة غير موجودة' }),
    el('p', { text: 'المسار: ' + p.slice(0, 60) }),
    el('a', { class: 'btn', text: 'العودة إلى الرئيسية', attrs: { href: '#/' } })
  ]);
}

// ---------- التوجيه ----------

const routes = {
  '/': homeScreen,
  '/discover': discoverScreen,
  '/ask': askScreen,
  '/notifications': notificationsScreen,
  '/profile': myProfileScreen,
  '/edit-profile': editProfileScreen,
  '/settings': settingsScreen,
  '/login': loginScreen,
  '/register': registerScreen,
  '/reset': resetScreen,
  '/complete': completeScreen
};
const titles = {
  '/': 'الرئيسية', '/discover': 'اكتشف', '/ask': 'اسأل', '/notifications': 'الإشعارات',
  '/profile': 'الملف الشخصي', '/edit-profile': 'تعديل الملف', '/settings': 'الإعدادات',
  '/login': 'تسجيل الدخول', '/register': 'إنشاء حساب', '/reset': 'استعادة كلمة المرور',
  '/complete': 'إكمال التسجيل'
};

const TABS = [
  ['/', 'الرئيسية', 'home'],
  ['/discover', 'اكتشف', 'compass'],
  ['/ask', 'اسأل', 'ask'],
  ['/notifications', 'الإشعارات', 'bell'],
  ['/profile', 'الملف', 'person']
];
for (const t of TABS) {
  tabsEl.appendChild(el('a', { class: 'tab', attrs: { href: '#' + t[0], 'data-path': t[0], 'aria-label': t[1] } }, [
    svg(ICONS[t[2]], 22),
    el('span', { text: t[1] })
  ]));
}

function currentPath() {
  const h = location.hash.slice(1).split('?')[0];
  if (!h) return '/';
  return h.charAt(0) === '/' ? h : '/' + h;
}

async function buildScreen(p) {
  if (!configured || !ready()) return setupScreen();
  if (p.indexOf('/u/') === 0) {
    return userScreen(decodeURIComponent(p.slice(3)));
  }
  const fn = routes[p];
  return fn ? fn() : notFound(p);
}

function updateTabs(p) {
  let active = p;
  if (p.indexOf('/u/') === 0 || p === '/edit-profile') active = '/profile';
  if (!Object.prototype.hasOwnProperty.call(routes, active)) active = '';
  for (const a of tabsEl.children) {
    if (active && a.getAttribute('data-path') === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function updateHeader() {
  clear(headerAction);
  if (currentUser && myProfile) {
    headerAction.appendChild(el('a', { class: 'me', attrs: { href: '#/profile', title: 'ملفي الشخصي' } }, [avatar(myProfile.displayName || '؟', 30)]));
  } else if (currentUser) {
    headerAction.appendChild(el('a', { class: 'me', text: 'إكمال الحساب', attrs: { href: '#/complete' } }));
  } else {
    headerAction.appendChild(el('a', { class: 'me', text: 'دخول', attrs: { href: '#/login' } }));
  }
}

async function render() {
  const my = ++renderSeq;
  const p = currentPath();
  clear(view);
  view.appendChild(loading());
  let node;
  try {
    node = await buildScreen(p);
  } catch (e) {
    console.error('[أحچيلي] render', e);
    node = errorState('تعذّر عرض هذه الشاشة. تحقق من اتصالك وحاول مجدداً.');
  }
  if (my !== renderSeq) return; // وصلت شاشة أحدث — تجاهل هذه النتيجة
  clear(view);
  view.appendChild(node);
  updateTabs(p);
  document.title = (titles[p] || 'صفحة') + ' — أحچيلي';
  window.scrollTo(0, 0);
  view.focus();
}

// مراقبة المصادقة: تحديث الحالة وإعادة العرض. يبقى مفعّلاً طوال عمر التطبيق
// (ليس اشتراك شاشة) ولذلك لا يُلغى.
watchAuth(async function (user) {
  currentUser = user || null;
  myProfile = null;
  if (user) {
    try {
      myProfile = await getProfile(user.uid);
      const p = currentPath();
      if (!myProfile) {
        if (['/complete', '/login', '/register', '/reset'].indexOf(p) === -1) {
          location.hash = '#/complete';
          return;
        }
      } else if (p === '/complete' || p === '/login' || p === '/register') {
        location.hash = '#/profile';
        return;
      }
    } catch (e) {
      console.error('[أحچيلي] getProfile', e);
    }
  }
  updateHeader();
  render();
});

window.addEventListener('hashchange', render);
updateHeader();
render();

// التهيئة الفعلية: اكتمل تنفيذ هذا الملف وأول عرض للشاشة.
window.__ahcheelyBooted = true;
if (errbox.getAttribute('data-kind') === 'boot') errbox.hidden = true;
