// طبقة بيانات الأسئلة والإجابات — المرحلة 2.
import { db, auth } from './database.js';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, runTransaction, serverTimestamp, query, where, orderBy, limit, startAfter, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const Q_MIN = 5;
export const Q_MAX = 300;
export const A_MAX = 1000;

export function questionError(text) {
  const t = String(text || '').trim();
  if (t.length < Q_MIN) return 'السؤال قصير جداً (' + Q_MIN + ' محارف على الأقل).';
  if (t.length > Q_MAX) return 'السؤال طويل (الحد الأقصى ' + Q_MAX + ' محرفاً).';
  return null;
}

export function answerError(text) {
  const t = String(text || '').trim();
  if (!t) return 'الإجابة مطلوبة.';
  if (t.length > A_MAX) return 'الإجابة طويلة (الحد الأقصى ' + A_MAX + ' محرفاً).';
  return null;
}

// ---- حماية بسيطة من الإغراق والتكرار (من جانب العميل فقط) ----
// ملاحظة صادقة: الحد الخادمي الحقيقي يتطلب Cloud Functions (غير متاحة في خطة Spark).
const COOLDOWN_MS = 10000;
const DUP_WINDOW_MS = 120000;

export function rateLimitError() {
  const last = Number(localStorage.getItem('ahcheely_lastAsk') || 0);
  if (Date.now() - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
    return 'انتظر ' + wait + ' ثانية قبل إرسال سؤال جديد.';
  }
  return null;
}

function getRecent() {
  try { return JSON.parse(localStorage.getItem('ahcheely_recent') || '[]'); } catch (e) { return []; }
}

export function duplicateError(toUid, content) {
  const now = Date.now();
  const recent = getRecent().filter(function (r) { return now - r.at < DUP_WINDOW_MS; });
  const c = String(content || '').trim();
  for (const r of recent) {
    if (r.toUid === toUid && r.content === c) return 'أرسلت هذا السؤال نفسه خلال آخر دقيقتين.';
  }
  return null;
}

function rememberQuestion(toUid, content) {
  const now = Date.now();
  const recent = getRecent().filter(function (r) { return now - r.at < DUP_WINDOW_MS; });
  recent.push({ toUid: toUid, content: String(content || '').trim(), at: now });
  localStorage.setItem('ahcheely_recent', JSON.stringify(recent.slice(-10)));
  localStorage.setItem('ahcheely_lastAsk', String(now));
}

// ---- الأسئلة الواردة ----

// إرسال سؤال: يُكتب مباشرة في صندوق المستلم. المجهول لا يحمل أي هوية إطلاقاً.
export async function sendQuestion(toUid, content, isAnon, fromUsername) {
  const user = auth.currentUser;
  if (!user) throw new Error('يلزم تسجيل الدخول.');
  const clean = String(content || '').trim();
  const err = questionError(clean);
  if (err) throw new Error(err);
  const data = {
    content: clean,
    isAnon: !!isAnon,
    status: 'pending',
    createdAt: serverTimestamp()
  };
  if (!isAnon) {
    data.fromUid = user.uid;
    data.fromUsername = fromUsername;
  }
  const qid = doc(collection(db, 'users', toUid, 'inbox')).id;
  await setDoc(doc(db, 'users', toUid, 'inbox', qid), data);
  rememberQuestion(toUid, clean);
  return qid;
}

export async function listInbox(uid, cursorDoc, pageSize) {
  const size = pageSize || 15;
  let q = query(collection(db, 'users', uid, 'inbox'), orderBy('createdAt', 'desc'), limit(size));
  if (cursorDoc) q = query(q, startAfter(cursorDoc));
  const snap = await getDocs(q);
  return {
    items: snap.docs,
    cursor: snap.docs.length === size ? snap.docs[snap.docs.length - 1] : null
  };
}

// عدّ الأسئلة غير المقروءة (حد 30 تقريبياً لأغراض العرض).
export async function countUnread(uid) {
  const q = query(collection(db, 'users', uid, 'inbox'), where('status', '==', 'pending'), limit(30));
  const snap = await getDocs(q);
  let n = 0;
  snap.forEach(function (d) { if (!d.data().readAt) n += 1; });
  return n;
}

// وسم المقروء دفعة واحدة عند فتح الصندوق.
export async function markInboxRead(uid, items) {
  const unread = items.filter(function (d) {
    const v = d.data();
    return !v.readAt && v.status === 'pending';
  });
  if (!unread.length) return;
  const batch = writeBatch(db);
  for (const d of unread) {
    batch.update(doc(db, 'users', uid, 'inbox', d.id), { readAt: serverTimestamp() });
  }
  await batch.commit();
}

export async function setQuestionStatus(uid, qid, status) {
  await updateDoc(doc(db, 'users', uid, 'inbox', qid), { status: status });
}

export async function deleteQuestion(uid, qid) {
  await deleteDoc(doc(db, 'users', uid, 'inbox', qid));
}

// ---- الإجابات ----

// الإجابة: مطالبة واحدة تتحقق من الحالة وتنشر وتحدّث الصندوق معاً — لا إجابات مزدوجة ولا نشر جزئي.
export async function answerQuestion(uid, myUsername, qid, text) {
  const clean = String(text || '').trim();
  const err = answerError(clean);
  if (err) throw new Error(err);
  return await runTransaction(db, async function (tx) {
    const ref = doc(db, 'users', uid, 'inbox', qid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('السؤال غير موجود.');
    const d = snap.data();
    if (d.status === 'answered' || d.answerId) throw new Error('تمت الإجابة عن هذا السؤال مسبقاً.');
    const aid = doc(collection(db, 'answers')).id;
    const answer = {
      qid: qid,
      questionText: d.content,
      isAnon: d.isAnon,
      authorUid: uid,
      authorUsername: myUsername,
      text: clean,
      status: 'published',
      createdAt: serverTimestamp()
    };
    if (!d.isAnon) {
      answer.fromUid = d.fromUid;
      answer.fromUsername = d.fromUsername;
    }
    tx.set(doc(db, 'answers', aid), answer);
    tx.update(ref, { status: 'answered', answeredAt: serverTimestamp(), answerId: aid });
    return aid;
  });
}

// يحتاج فهرساً مركباً (authorUid, status, createdAt) — راجع README لخطوات إنشائه.
export async function listProfileAnswers(uid, cursorDoc, pageSize) {
  const size = pageSize || 5;
  let q = query(collection(db, 'answers'), where('authorUid', '==', uid), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(size));
  if (cursorDoc) q = query(q, startAfter(cursorDoc));
  const snap = await getDocs(q);
  return {
    items: snap.docs,
    cursor: snap.docs.length === size ? snap.docs[snap.docs.length - 1] : null
  };
}

export async function getAnswer(aid) {
  const snap = await getDoc(doc(db, 'answers', aid));
  return snap.exists() ? { id: snap.id, data: snap.data() } : null;
}

export async function deleteAnswer(aid) {
  await deleteDoc(doc(db, 'answers', aid));
}

// ---- البلاغات ----

export async function reportContent(type, targetId, reason) {
  const user = auth.currentUser;
  if (!user) throw new Error('يلزم تسجيل الدخول.');
  const r = String(reason || '').trim();
  if (!r) throw new Error('اختر سبب البلاغ.');
  if (r.length > 500) throw new Error('نص البلاغ طويل.');
  await setDoc(doc(collection(db, 'reports')), {
    type: type,
    targetId: targetId,
    reason: r,
    byUid: user.uid,
    createdAt: serverTimestamp()
  });
}
