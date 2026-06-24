/* ===========================================================
   Archive L — Firebase 초기화 & 헬퍼
   compat SDK 사용 (비-모듈 app.js와 호환)
   =========================================================== */
(function () {
  if (typeof firebase === 'undefined') {
    console.warn('[firebase.js] Firebase SDK가 로드되지 않았습니다. <script> 태그 순서를 확인하세요.');
    return;
  }

  const firebaseConfig = {
    apiKey: "AIzaSyBRKnvbBPLqwi_eyiy8--VQceklsek0C4o",
    authDomain: "archive-l.firebaseapp.com",
    projectId: "archive-l",
    storageBucket: "archive-l.firebasestorage.app",
    messagingSenderId: "973624167395",
    appId: "1:973624167395:web:58c500909591fdaed4eed6"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  window.fb = {
    app: firebase.app(),
    db: typeof firebase.firestore === 'function' ? firebase.firestore() : null,
    auth: typeof firebase.auth === 'function' ? firebase.auth() : null,
    FieldValue: firebase.firestore ? firebase.firestore.FieldValue : null
  };

  console.log('[firebase.js] Archive L 초기화 완료 — project:', firebaseConfig.projectId);
})();
