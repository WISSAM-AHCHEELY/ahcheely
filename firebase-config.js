// إعدادات Firebase — معرّفات عامة للويب وليست أسراراً (لا تضع هنا أي مفتاح خدمة).
// المشروع: ahcheely-e87ab
export const firebaseConfig = {
  apiKey: "AIzaSyA-wu5IwBAw8bhTa5lJE6c29PRELWksuZQ",
  authDomain: "ahcheely-e87ab.firebaseapp.com",
  projectId: "ahcheely-e87ab",
  storageBucket: "ahcheely-e87ab.firebasestorage.app",
  messagingSenderId: "1031089909940",
  appId: "1:1031089909940:web:1fa63f413c2e260989a7e1"
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(function (v) {
  return typeof v === 'string' && v.length > 0;
});
