// تهيئة Firebase وطبقة الوصول إلى بيانات Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

export const configured = isFirebaseConfigured;
export let app = null;
export let db = null;
export let auth = null;

if (configured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch(function (e) {
      console.warn('[أحچيلي] persistence', e);
    });
  } catch (e) {
    console.error('[أحچيلي] تعذّر تهيئة Firebase', e);
    app = null; db = null; auth = null;
  }
}

export function ready() {
  return !!(app && db && auth);
}

const USERNAME_RE = /^[\p{L}\p{N}_]{3,20}$/u;

// تطبيع اسم المستخدم: إزالة الفراغات، توحيد الأحرف اللاتينية صغيرة، توحيد يونيكود.
export function normalizeUsername(raw) {
  return String(raw || '').trim().normalize('NFC').toLowerCase();
}

export function usernameError(raw) {
  const u = normalizeUsername(raw);
  if (!u) return 'اسم المستخدم مطلوب.';
  if (!USERNAME_RE.test(u)) return 'اسم المستخدم من 3 إلى 20 محرفاً: حروف وأرقام وشرطة سفلية فقط.';
  return null;
}

export async function isUsernameAvailable(username) {
  const snap = await getDoc(doc(db, 'usernames', username));
  return !snap.exists();
}

// مطالبة ذرّية: حجز اسم المستخدم + إنشاء الملف الشخصي معاً، أو لا شيء.
// يمنع التكرار حتى مع الطلبات المتزامنة، ويمنع وجود حساب بلا ملف شخصي مكتمل.
export async function claimUsernameAndCreateProfile(params) {
  const uid = params.uid;
  const uname = normalizeUsername(params.username);
  const err = usernameError(uname);
  if (err) throw new Error(err);
  const name = String(params.displayName || '').trim();
  if (!name || name.length > 40) throw new Error('الاسم المعروض مطلوب وبحد أقصى 40 محرفاً.');
  await runTransaction(db, async function (tx) {
    const nameRef = doc(db, 'usernames', uname);
    const snap = await tx.get(nameRef);
    if (snap.exists()) throw new Error('username-taken');
    tx.set(nameRef, { uid: uid });
    tx.set(doc(db, 'users', uid), {
      username: uname,
      displayName: name,
      bio: '',
      location: '',
      interests: [],
      allowAnonQuestions: true,
      createdAt: serverTimestamp()
    });
  });
}

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function getProfileByUsername(username) {
  const uname = normalizeUsername(username);
  if (!uname) return null;
  const nameSnap = await getDoc(doc(db, 'usernames', uname));
  if (!nameSnap.exists()) return null;
  const uid = nameSnap.data().uid;
  const profile = await getProfile(uid);
  if (!profile || normalizeUsername(profile.username) !== uname) return null;
  return { uid: uid, profile: profile };
}

// تعديل الملف الشخصي بحقول مسموح بها فقط، مطابقة لقواعد Firestore.
export async function updateMyProfile(uid, fields) {
  const name = String(fields.displayName || '').trim();
  if (!name || name.length > 40) throw new Error('الاسم المعروض مطلوب وبحد أقصى 40 محرفاً.');
  const bio = String(fields.bio || '').trim();
  if (bio.length > 280) throw new Error('النبذة يجب ألا تتجاوز 280 محرفاً.');
  const location = String(fields.location || '').trim();
  if (location.length > 60) throw new Error('الموقع يجب ألا يتجاوز 60 محرفاً.');
  const parts = String(fields.interests || '')
    .split(/[,،]/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean)
    .slice(0, 5);
  await updateDoc(doc(db, 'users', uid), {
    displayName: name,
    bio: bio,
    location: location,
    interests: parts
  });
}
