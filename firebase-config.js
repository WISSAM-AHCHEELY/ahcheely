// إعدادات Firebase — معرّفات عامة للويب وليست أسراراً (لا تضع هنا أي مفتاح خدمة).
// تُستكمل هذه القيم من Firebase Console: Project settings ← Your apps ← إعدادات الويب.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(function (v) {
  return typeof v === 'string' && v.length > 0;
});
