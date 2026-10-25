// المصادقة: إنشاء الحساب والدخول والخروج واستعادة كلمة المرور عبر Firebase Authentication.
import { auth, isUsernameAvailable, claimUsernameAndCreateProfile } from './database.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, onAuthStateChanged, updateProfile, deleteUser } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailError(v) {
  const s = String(v || '').trim();
  return EMAIL_RE.test(s) ? null : 'أدخل بريداً إلكترونياً صحيحاً.';
}

export function passwordError(v) {
  return String(v || '').length >= 8 ? null : 'كلمة المرور يجب ألا تقل عن 8 محارف.';
}

// تحويل أخطاء Firebase إلى رسائل عربية مفهومة.
export function mapAuthError(e) {
  if (!e) return 'خطأ غير معروف.';
  const code = String(e.code || '') + ' ' + String(e.message || '');
  if (code.indexOf('username-taken') !== -1) return 'اسم المستخدم محجوز مسبقاً. اختر غيره.';
  if (code.indexOf('email-already-in-use') !== -1) return 'هذا البريد مسجل مسبقاً. سجّل الدخول أو استخدم بريداً آخر.';
  if (code.indexOf('invalid-email') !== -1) return 'البريد الإلكتروني غير صالح.';
  if (code.indexOf('weak-password') !== -1) return 'كلمة المرور ضعيفة.';
  if (code.indexOf('operation-not-allowed') !== -1) return 'تسجيل الدخول بالبريد غير مفعّل. فعّله من Firebase Console ← Authentication ← Email/Password.';
  if (code.indexOf('invalid-api-key') !== -1 || code.indexOf('app-not-authorized') !== -1) return 'إعدادات Firebase غير صحيحة. أعد التحقق من firebase-config.js.';
  if (code.indexOf('wrong-password') !== -1 || code.indexOf('invalid-credential') !== -1 || code.indexOf('user-not-found') !== -1) return 'البريد أو كلمة المرور غير صحيحة.';
  if (code.indexOf('too-many-requests') !== -1) return 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.';
  if (code.indexOf('network-request-failed') !== -1 || code.indexOf('offline') !== -1) return 'تحقق من اتصالك بالإنترنت ثم أعد المحاولة.';
  if (!e.code && e.message) return e.message; // أخطاء التحقق من هذا التطبيق
  return 'تعذّر إتمام العملية. حاول مجدداً.';
}

// إنشاء حساب: حساب مصادقة + ملف شخصي في مطالبة واحدة، مع تراجع كامل عند فشل أي خطوة.
export async function registerAccount(p) {
  const ee = emailError(p.email);
  if (ee) throw new Error(ee);
  const pe = passwordError(p.password);
  if (pe) throw new Error(pe);
  const uname = String(p.username || '').trim();
  const err = String(); // (يتحقق claimUsernameAndCreateProfile داخلياً أيضاً)
  const available = await isUsernameAvailable(uname.toLowerCase().normalize('NFC'));
  if (!available) throw new Error('username-taken');
  const cred = await createUserWithEmailAndPassword(auth, String(p.email || '').trim(), p.password);
  try {
    await updateProfile(cred.user, { displayName: String(p.displayName || '').trim() });
    await claimUsernameAndCreateProfile({
      uid: cred.user.uid,
      username: uname,
      displayName: p.displayName
    });
    return cred.user;
  } catch (e) {
    // فشل إنشاء الملف: احذف حساب المصادقة حتى لا يبقى حساب بلا ملف شخصي.
    try { await deleteUser(cred.user); } catch (e2) { console.error('[أحچيلي] cleanup', e2); }
    throw e;
  }
}

export async function loginAccount(email, password) {
  return (await signInWithEmailAndPassword(auth, String(email || '').trim(), password)).user;
}

export async function logoutAccount() {
  await signOut(auth);
}

export async function sendResetEmail(email) {
  await sendPasswordResetEmail(auth, String(email || '').trim());
}

// مراقبة حالة المصادقة — يبقى مفعّلاً طوال عمر التطبيق.
export function watchAuth(cb) {
  if (!auth) return function () {};
  return onAuthStateChanged(auth, cb);
}
