import { configured, ready, getProfile, getProfileByUsername, claimUsernameAndCreateProfile, updateMyProfile, updateAnonSetting, usernameError, normalizeUsername, isUsernameAvailable } from './database.js';
import { watchAuth, registerAccount, loginAccount, logoutAccount, sendResetEmail, emailError, passwordError, mapAuthError } from './auth.js';
import { sendQuestion, questionError, rateLimitError, duplicateError, listInbox, markInboxRead, setQuestionStatus, deleteQuestion, answerQuestion, listProfileAnswers, getAnswer, deleteAnswer, reportContent, countUnread } from './questions.js';
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

// ---------- أدوات مساعدة ----------

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'قبل لحظات';
  const m = Math.floor(s / 60);
  if (m < 60) return 'قبل ' + m + ' دقيقة';
  const h = Math.floor(m / 60);
  if (h < 24) return 'قبل ' + h + ' ساعة';
  const d = Math.floor(h / 24);
  if (d < 30) return 'قبل ' + d + ' يوم';
  return date.toLocaleDateString('ar');
}

function timeText(ts) {
  return ts && typeof ts.toDate === 'function' ? timeAgo(ts.toDate()) : '';
}

function profileUrl(username) {
  return location.origin + location.pathname + '#/u/' + encodeURIComponent(username);
}
function answerUrl(aid) {
  return location.origin + location.pathname + '#/a/' + aid;
}

function shareNode(label, url) {
  return btn(label, async function () {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'أحچيلي', url: url });
        return;
      }
      await navigator.clipboard.writeText(url);
      window.alert('تم نسخ الرابط.');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // ألغى المستخدم
      window.alert('انسخ الرابط يدوياً: ' + url);
    }
  });
}

function indexErrorCard(e) {
  const msg = String(e && e.message || e);
  if (msg.indexOf('index') !== -1 || msg.indexOf('precondition') !== -1) {
    return el('div', { class: 'card' }, [
      el('h2', { text: 'يلزم إنشاء فهرس مرة واحدة' }),
      el('p', { text: 'قاعدة البيانات تطلب فهرساً لعرض الإجابات. أنشئه من: Firebase Console ← Firestore Database ← Indexes ← Add index، على مجموعة answers بالحقول: authorUid تصاعدي، status تصاعدي، createdAt تنازلي. ثم أعد المحاولة.' })
    ]);
  }
  return errorState('تعذّر تحميل المحتوى. تحقق من اتصالك وحاول مجدداً.');
}

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
          el('li', { text: 'المنجز: الحسابات والملفات الشخصية والأسئلة والإجابات وصندوق الوارد.' }),
          el('li', { text: 'المرحلة 3 القادمة: Feed والمتابعة والإعجابات والبحث والحظر.' }),
          el('li', { text: 'المراحل 4 وما بعدها: الصور والإشعارات والاستطلاعات والمحادثات والإشراف.' })
        ])
      ])
    ]);
  }
  const name = (myProfile && myProfile.displayName) || 'صديقنا';
  const inboxCard = el('div', { class: 'card' }, [loading('جارٍ فحص صندوق الوارد...')]);
  countUnread(currentUser.uid).then(function (n) {
    inboxCard.textContent = '';
    inboxCard.appendChild(el('h2', { text: 'صندوق الوارد' }));
    inboxCard.appendChild(el('p', { text: n > 0
      ? 'لديك ' + n + (n === 1 ? ' سؤال جديد' : ' أسئلة جديدة') + ' بانتظار إجابتك.'
      : 'لا أسئلة جديدة حالياً.' }));
    inboxCard.appendChild(el('a', { class: 'btn', text: 'افتح صندوق الوارد', attrs: { href: '#/inbox' } }));
  }).catch(function (e) { console.warn('[أحچيلي] countUnread', e); });
  return el('div', {}, [
    el('h1', { text: 'أهلاً، ' + name }),
    inboxCard,
    el('div', { class: 'card' }, [
      el('p', { text: 'المرحلة القادمة تضيف Feed والمتابعة والإعجابات والبحث.' }),
      el('div', { class: 'row' }, [
        el('a', { class: 'btn ghost', text: 'ملفي الشخصي', attrs: { href: '#/profile' } }),
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
  return stageScreen('اكتشف', 'البحث عن المستخدمين والحسابات المقترحة والإجابات الرائجة يُبنى في المرحلة 3 (الشبكة الاجتماعية).');
}
function notificationsScreen() {
  return stageScreen('الإشعارات', 'الإشعارات داخل التطبيق وإشعارات Push تُبنى في المرحلة 5.');
}

// ---------- الملفات الشخصية ----------

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
  return el('div', { class: 'card profile' }, [
    cover,
    el('h1', { class: 'pname', text: profile.displayName || '' }),
    el('p', { class: 'puser', text: '@' + (profile.username || '') }),
    profile.bio ? el('p', { class: 'pbio', text: profile.bio }) : null,
    chips.firstChild ? chips : null,
    profile.createdAt ? el('p', { class: 'note', text: 'عضو منذ ' + profile.createdAt.toDate().toLocaleDateString('ar') }) : null
  ]);
}

function answerCard(ad, own) {
  const d = ad.data();
  const askedBy = d.isAnon ? 'مجهول' : '@' + (d.fromUsername || 'مستخدم');
  const t = timeText(d.createdAt);
  const card = el('div', { class: 'card answer' }, [
    el('p', { class: 'qtext', text: d.questionText }),
    el('p', { class: 'qmeta', text: 'سأل: ' + askedBy + (t ? ' · ' + t : '') }),
    el('p', { class: 'atext', text: d.text })
  ]);
  const row = el('div', { class: 'row' });
  row.appendChild(el('a', { class: 'btn ghost', text: 'الإجابة الكاملة', attrs: { href: '#/a/' + ad.id } }));
  row.appendChild(shareNode('مشاركة', answerUrl(ad.id)));
  if (own) {
    row.appendChild(btn('حذف', async function () {
      if (!window.confirm('حذف الإجابة نهائياً؟')) return;
      await deleteAnswer(ad.id);
      card.remove();
    }, { ghost: true }));
  }
  card.appendChild(row);
  return card;
}

async function answersSection(uid, own) {
  const holder = el('div');
  holder.appendChild(loading('جارٍ تحميل الإجابات...'));
  let cursor = null;
  let done = false;
  async function loadMore() {
    if (done) return;
    try {
      const r = await listProfileAnswers(uid, cursor, 5);
      cursor = r.cursor;
      if (!cursor) done = true;
      const first = !holder.querySelector('.answer') && !holder.querySelector('.state');
      if (r.items.length === 0 && !holder.querySelector('.answer')) {
        clear(holder);
        holder.appendChild(emptyState(own ? 'لم تنشر إجابات بعد. ابدأ من صندوق الوارد.' : 'لا إجابات منشورة بعد.', null));
        done = true;
        return;
      }
      for (const n of Array.from(holder.querySelectorAll('.state, .more-row'))) n.remove();
      for (const doc of r.items) holder.appendChild(answerCard(doc, own));
      if (cursor) {
        holder.appendChild(el('div', { class: 'row more-row' }, [btn('تحميل المزيد', function () { loadMore(); }, { ghost: true })]));
      }
    } catch (e) {
      console.error('[أحچيلي] answers', e);
      clear(holder);
      holder.appendChild(indexErrorCard(e));
      done = true;
    }
  }
  await loadMore();
  return holder;
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
    shareNode('مشاركة رابط الملف', profileUrl(myProfile.username)),
    el('a', { class: 'btn ghost', text: 'الإعدادات', attrs: { href: '#/settings' } })
  ]));
  wrap.appendChild(el('h2', { text: 'أحدث إجاباتي' }));
  wrap.appendChild(await answersSection(currentUser.uid, true));
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
  const isSelf = !!(currentUser && data.uid === currentUser.uid);
  const wrap = el('div');
  wrap.appendChild(profileCard(data.profile, isSelf));
  const row = el('div', { class: 'row' });
  if (isSelf) {
    row.appendChild(el('a', { class: 'btn', text: 'تعديل الملف', attrs: { href: '#/edit-profile' } }));
  } else {
    row.appendChild(el('a', { class: 'btn', text: 'اسأل', attrs: { href: '#/ask/' + encodeURIComponent(data.profile.username) } }));
  }
  row.appendChild(shareNode('مشاركة رابط الملف', profileUrl(data.profile.username)));
  wrap.appendChild(row);
  wrap.appendChild(el('p', { class: 'note', text: data.profile.allowAnonQuestions !== false
    ? 'يقبل هذا المستخدم الأسئلة المجهولة.'
    : 'هذا المستخدم لا يقبل الأسئلة المجهولة.' }));
  wrap.appendChild(el('h2', { text: 'أحدث الإجابات' }));
  wrap.appendChild(await answersSection(data.uid, isSelf));
  return wrap;
}

// ---------- الأسئلة ----------

async function askScreen() {
  if (!currentUser) return promptLogin();
  const wrap = el('div');
  wrap.appendChild(el('h1', { text: 'اسأل' }));
  let unread = 0;
  try { unread = await countUnread(currentUser.uid); } catch (e) { console.warn('[أحچيلي] countUnread', e); }
  wrap.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'أسئلة وصلتك' }),
    el('p', { text: unread > 0
      ? 'لديك ' + unread + (unread === 1 ? ' سؤال جديد' : ' أسئلة جديدة') + ' بانتظار الإجابة.'
      : 'لا أسئلة جديدة حالياً.' }),
    el('a', { class: 'btn', text: 'افتح صندوق الوارد', attrs: { href: '#/inbox' } })
  ]));
  const f = field('اسأل مستخدماً — اكتب اسم المستخدم (بدون @)', { maxlength: '20', autocomplete: 'off', placeholder: 'مثال: sara' });
  const status = note('');
  status.hidden = true;
  const go = btn('متابعة', function () {
    const u = normalizeUsername(f.input.value);
    const err = usernameError(u);
    if (err) {
      status.textContent = err;
      status.classList.add('err');
      status.hidden = false;
      return;
    }
    location.hash = '#/ask/' + encodeURIComponent(u);
  });
  wrap.appendChild(el('div', { class: 'card' }, [el('h2', { text: 'اسأل مستخدماً' }), f, go, status]));
  return wrap;
}

async function askFormScreen(username) {
  if (!currentUser) return promptLogin();
  if (!myProfile) return loading('جارٍ التحميل...');
  const target = await getProfileByUsername(username);
  if (!target) return emptyState('لا يوجد مستخدم بهذا الاسم.', el('a', { class: 'btn ghost', text: 'رجوع', attrs: { href: '#/ask' } }));
  const allowsAnon = target.profile.allowAnonQuestions !== false;
  const isSelf = currentUser.uid === target.uid;
  const ta = el('textarea', { class: 'ask-ta', attrs: { rows: '3', maxlength: '300', placeholder: 'اكتب سؤالك...' } });
  const status = note('');
  status.hidden = true;
  let anonCb = null;
  const head = el('div', { class: 'row' }, [
    avatar(target.profile.displayName || '؟', 44),
    el('div', {}, [
      el('strong', { text: target.profile.displayName || '' }),
      el('span', { class: 'note', text: ' @' + target.profile.username + (allowsAnon ? '' : ' · لا يقبل الأسئلة المجهولة') })
    ])
  ]);
  function fail(t) {
    status.textContent = t;
    status.classList.add('err');
    status.hidden = false;
  }
  const send = btn('إرسال السؤال', async function () {
    status.hidden = true;
    status.classList.remove('err');
    const qerr = questionError(ta.value);
    if (qerr) { fail(qerr); return; }
    const rl = rateLimitError();
    if (rl) { fail(rl); return; }
    const dup = duplicateError(target.uid, ta.value);
    if (dup) { fail(dup); return; }
    const isAnon = !!(anonCb && anonCb.checked);
    if (isAnon && !allowsAnon) { fail('هذا المستخدم عطّل الأسئلة المجهولة.'); return; }
    try {
      await sendQuestion(target.uid, ta.value, isAnon, myProfile.username);
      ta.value = '';
      status.classList.remove('err');
      status.textContent = isSelf
        ? 'وصل السؤال إلى صندوقك. افتح صندوق الوارد للإجابة عنه.'
        : 'تم إرسال سؤالك' + (isAnon ? ' باسم مجهول — هويتك غير مخزنة إطلاقاً' : '') + '. سيراه المستلم في صندوقه، ولن يظهر للعامة قبل الإجابة عنه.';
      status.hidden = false;
    } catch (e) {
      fail(mapAuthError(e));
      throw e;
    }
  });
  const card = el('div', { class: 'card' }, [head, ta]);
  if (allowsAnon) {
    anonCb = el('input', { attrs: { type: 'checkbox' } });
    card.appendChild(el('label', { class: 'check' }, [anonCb, ' إرسال باسم مجهول — لن تُخزّن هويتك إطلاقاً']));
  }
  card.appendChild(send);
  card.appendChild(status);
  return el('div', {}, [
    el('h1', { text: 'اسأل' }),
    card,
    el('p', { class: 'note' }, [el('a', { text: 'عودة إلى ملف ' + target.profile.username, attrs: { href: '#/u/' + encodeURIComponent(target.profile.username) } })])
  ]);
}

// ---------- صندوق الوارد ----------

function openAnswerEditor(card, qid) {
  if (card.querySelector('.editor-wrap')) return;
  const ta = el('textarea', { class: 'ans-ta', attrs: { rows: '3', maxlength: '1000', placeholder: 'اكتب إجابتك...' } });
  const status = note('');
  status.hidden = true;
  const wrap = el('div', { class: 'card editor-wrap' }, [
    ta,
    el('div', { class: 'row' }, [
      btn('نشر الإجابة', async function () {
        status.hidden = true;
        status.classList.remove('err');
        try {
          await answerQuestion(currentUser.uid, myProfile.username, qid, ta.value);
          render(); // إعادة عرض الصندوق بالحالة الجديدة
        } catch (e) {
          status.textContent = mapAuthError(e);
          status.classList.add('err');
          status.hidden = false;
          throw e;
        }
      }),
      btn('إلغاء', function () { wrap.remove(); }, { ghost: true })
    ]),
    status
  ]);
  card.appendChild(wrap);
  ta.focus();
}

function openReportDialog(card, qid) {
  if (card.querySelector('.report-wrap')) return;
  const sel = el('select', { class: 'rep-sel', attrs: { 'aria-label': 'سبب البلاغ' } });
  for (const r of ['سبام أو تكرار', 'إساءة أو تنمر', 'محتوى غير لائق', 'انتحال أو تضليل', 'أخرى']) {
    sel.appendChild(el('option', { text: r, attrs: { value: r } }));
  }
  const status = note('');
  status.hidden = true;
  const wrap = el('div', { class: 'card report-wrap' }, [
    sel,
    el('div', { class: 'row' }, [
      btn('إرسال البلاغ', async function () {
        status.hidden = true;
        status.classList.remove('err');
        try {
          await reportContent('question', qid, sel.value);
          status.textContent = 'تم استلام بلاغك. ستُراجع البلاغات في مرحلة الإشراف القادمة.';
        } catch (e) {
          status.textContent = mapAuthError(e);
          status.classList.add('err');
        }
        status.hidden = false;
      }),
      btn('إلغاء', function () { wrap.remove(); }, { ghost: true })
    ]),
    status
  ]);
  card.appendChild(wrap);
}

function inboxCard(qid, d) {
  const sender = d.isAnon ? 'مجهول' : '@' + (d.fromUsername || 'مستخدم');
  const t = timeText(d.createdAt);
  const card = el('div', { class: 'card' }, [
    el('p', { class: 'qtext', text: d.content }),
    el('p', { class: 'qmeta', text: 'من: ' + sender + (t ? ' · ' + t : '') })
  ]);
  const row = el('div', { class: 'row' });
  if (d.status !== 'answered') {
    row.appendChild(btn('إجابة', function () { openAnswerEditor(card, qid); }, { ghost: true }));
    row.appendChild(btn(d.status === 'ignored' ? 'إلغاء التجاهل' : 'تجاهل', async function () {
      await setQuestionStatus(currentUser.uid, qid, d.status === 'ignored' ? 'pending' : 'ignored');
      render();
    }, { ghost: true }));
  } else if (d.answerId) {
    row.appendChild(el('a', { class: 'btn ghost', text: 'عرض الإجابة', attrs: { href: '#/a/' + d.answerId } }));
  }
  row.appendChild(btn('حذف', async function () {
    if (!window.confirm('حذف السؤال نهائياً؟' + (d.status === 'answered' ? ' (لن تتأثر الإجابة المنشورة)' : ''))) return;
    await deleteQuestion(currentUser.uid, qid);
    render();
  }, { ghost: true }));
  row.appendChild(btn('إبلاغ', function () { openReportDialog(card, qid); }, { ghost: true }));
  card.appendChild(row);
  return card;
}

async function inboxScreen() {
  if (!currentUser) return promptLogin();
  if (!myProfile) return loading('جارٍ التحميل...');
  const wrap = el('div');
  wrap.appendChild(el('h1', { text: 'صندوق الوارد' }));
  let filter = 'all';
  const chips = el('div', { class: 'row chips' });
  const defs = [['all', 'الكل'], ['pending', 'الجديد'], ['answered', 'المجاب'], ['ignored', 'المتجاهل']];
  for (const def of defs) {
    const c = el('button', { class: 'chip', text: def[1], attrs: { type: 'button', 'data-f': def[0] } });
    c.addEventListener('click', function () {
      filter = def[0];
      drawChips();
      loadList(true);
    });
    chips.appendChild(c);
  }
  function drawChips() {
    for (const c of chips.children) {
      c.classList.toggle('on', c.getAttribute('data-f') === filter);
    }
  }
  wrap.appendChild(chips);
  const list = el('div');
  wrap.appendChild(list);
  let allItems = [];
  let cursor = null;
  let done = false;
  function visible() {
    return allItems.filter(function (d) { return filter === 'all' || d.data().status === filter; });
  }
  async function loadList(reset) {
    if (reset) {
      allItems = [];
      cursor = null;
      done = false;
      clear(list);
      list.appendChild(loading('جارٍ تحميل الأسئلة...'));
    }
    if (done) return;
    try {
      const r = await listInbox(currentUser.uid, cursor, 15);
      allItems = allItems.concat(r.items);
      cursor = r.cursor;
      if (!cursor) done = true;
      markInboxRead(currentUser.uid, r.items).catch(function (e) { console.warn('[أحچيلي] markRead', e); });
      redraw();
    } catch (e) {
      console.error('[أحچيلي] inbox', e);
      clear(list);
      list.appendChild(errorState('تعذّر تحميل صندوق الوارد. تحقق من اتصالك وحاول مجدداً.'));
    }
  }
  function redraw() {
    clear(list);
    const vis = visible();
    if (!vis.length) {
      list.appendChild(emptyState('لا توجد أسئلة في هذا التصنيف بعد.', null));
      return;
    }
    for (const d of vis) list.appendChild(inboxCard(d.id, d.data()));
    if (cursor) {
      list.appendChild(el('div', { class: 'row' }, [btn('تحميل المزيد', function () { loadList(false); }, { ghost: true })]));
    }
  }
  drawChips();
  await loadList(true);
  return wrap;
}

// ---------- صفحة إجابة عامة ----------

async function answerViewScreen(aid) {
  if (!aid) return notFound('/a/');
  const a = await getAnswer(aid);
  if (!a) {
    return emptyState('هذه الإجابة غير موجودة أو حُذفت.', el('a', { class: 'btn ghost', text: 'العودة إلى الرئيسية', attrs: { href: '#/' } }));
  }
  const d = a.data;
  let author = null;
  try { author = await getProfile(d.authorUid); } catch (e) { console.warn('[أحچيلي] author', e); }
  const head = el('div', { class: 'row' }, [
    avatar((author && author.displayName) || '؟', 44),
    el('div', {}, [
      el('a', { text: (author && author.displayName) || '@' + (d.authorUsername || ''), attrs: { href: '#/u/' + encodeURIComponent(d.authorUsername || '') } }),
      el('p', { class: 'note', text: timeText(d.createdAt) })
    ])
  ]);
  return el('div', {}, [
    el('h1', { text: 'إجابة' }),
    el('div', { class: 'card' }, [
      head,
      el('p', { class: 'qtext', text: d.questionText }),
      el('p', { class: 'qmeta', text: 'سأل: ' + (d.isAnon ? 'مجهول' : '@' + (d.fromUsername || '')) }),
      el('p', { class: 'atext', text: d.text })
    ]),
    el('div', { class: 'row' }, [shareNode('مشاركة الإجابة', answerUrl(aid))])
  ]);
}

// ---------- الحساب ----------

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
  const anonStatus = note('');
  anonStatus.hidden = true;
  const anonCb = el('input', { attrs: { type: 'checkbox' } });
  if (myProfile && myProfile.allowAnonQuestions !== false) anonCb.checked = true;
  anonCb.addEventListener('change', async function () {
    anonStatus.hidden = true;
    anonStatus.classList.remove('err');
    try {
      await updateAnonSetting(currentUser.uid, anonCb.checked);
      myProfile = await getProfile(currentUser.uid);
      anonStatus.textContent = 'تم حفظ التفضيل.';
    } catch (e) {
      anonCb.checked = !anonCb.checked;
      anonStatus.textContent = mapAuthError(e);
      anonStatus.classList.add('err');
    }
    anonStatus.hidden = false;
  });
  return el('div', {}, [
    el('h1', { text: 'الإعدادات' }),
    el('div', { class: 'card' }, [
      el('h2', { text: 'الحساب' }),
      el('p', { text: 'البريد: ' + (currentUser.email || '') }),
      el('p', { text: 'اسم المستخدم: ' + (myProfile ? '@' + myProfile.username : 'غير مكتمل بعد') }),
      el('h2', { text: 'الخصوصية' }),
      el('label', { class: 'check' }, [anonCb, ' السماح باستقبال أسئلة مجهولة']),
      anonStatus,
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
  '/complete': completeScreen,
  '/inbox': inboxScreen
};
const titles = {
  '/': 'الرئيسية', '/discover': 'اكتشف', '/ask': 'اسأل', '/notifications': 'الإشعارات',
  '/profile': 'الملف الشخصي', '/edit-profile': 'تعديل الملف', '/settings': 'الإعدادات',
  '/login': 'تسجيل الدخول', '/register': 'إنشاء حساب', '/reset': 'استعادة كلمة المرور',
  '/complete': 'إكمال التسجيل', '/inbox': 'صندوق الوارد'
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
  if (p.indexOf('/u/') === 0) return userScreen(decodeURIComponent(p.slice(3)));
  if (p.indexOf('/ask/') === 0) return askFormScreen(decodeURIComponent(p.slice(5)));
  if (p.indexOf('/a/') === 0) return answerViewScreen(decodeURIComponent(p.slice(3)));
  const fn = routes[p];
  return fn ? fn() : notFound(p);
}

function updateTabs(p) {
  let active = '';
  if (p === '/' || p === '/discover' || p === '/ask' || p === '/notifications' || p === '/profile') active = p;
  else if (p.indexOf('/u/') === 0 || p === '/edit-profile') active = '/profile';
  else if (p === '/inbox' || p.indexOf('/ask/') === 0) active = '/ask';
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

// مراقبة المصادقة: تحديث الحالة وإعادة العرض. يبقى مفعّلاً طوال عمر التطبيق.
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

// اكتمل تنفيذ هذا الملف وأول عرض للشاشة.
window.__ahcheelyBooted = true;
if (errbox.getAttribute('data-kind') === 'boot') errbox.hidden = true;
