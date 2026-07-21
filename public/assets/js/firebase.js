/* ===========================================================
   LOCALLAYERS — Firebase 초기화 & 헬퍼
   - Firebase Auth (이메일/비번)
   - Firestore (사용자별 데이터, 글 카탈로그)
   compat SDK 사용 (기존 비-모듈 app.js와 호환)
   =========================================================== */
(function() {
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

  // 중복 init 방지
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = typeof firebase.storage === 'function' ? firebase.storage() : null;

  // 어드민 이메일 화이트리스트 (Custom Claims로 옮기기 전 임시)
  const ADMIN_EMAILS = [
    'cmlab.local@gmail.com'
  ];

  // ===== 인증 헬퍼 =====
  // 가입 직후 Firestore 토큰 레이스로 인한 일시적 permission-denied를
  // 토큰 강제 갱신 + 재시도로 흡수한다. 끝내 실패해도 계정 생성은 이미 완료된 상태이므로
  // throw하지 않고(가입 성공 처리) 다음 로그인 때 보정한다.
  async function writeUserProfileWithRetry(user, profile, attempts) {
    attempts = attempts || 3;
    for (let i = 0; i < attempts; i++) {
      try {
        try { await user.getIdToken(true); } catch (e) {}
        await db.collection('users').doc(user.uid).set(profile, { merge: true });
        return true;
      } catch (e) {
        console.warn('[signUp] 프로필 저장 시도 ' + (i + 1) + ' 실패:', e && e.code, e && e.message);
        if (i < attempts - 1) await new Promise(r => setTimeout(r, 400 * (i + 1)));
      }
    }
    console.warn('[signUp] 프로필 문서 생성에 실패했지만 계정 생성·로그인은 완료됨(다음 로그인 시 보정).');
    return false;
  }

  async function signUp(email, password, displayName) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    if (displayName) {
      try { await cred.user.updateProfile({ displayName }); }
      catch (e) { console.warn('[signUp] updateProfile 실패:', e && e.message); }
    }
    // Firestore에 사용자 프로필 생성 (토큰 전파 레이스 방지: 재시도)
    await writeUserProfileWithRetry(cred.user, {
      email,
      displayName: displayName || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      role: ADMIN_EMAILS.includes(email) ? 'admin' : 'reader'
    });
    return cred.user;
  }

  async function signIn(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    // 관리자가 비활성화(disabled)한 계정이면 즉시 로그아웃 처리
    try {
      const snap = await db.collection('users').doc(cred.user.uid).get();
      if (snap.exists && snap.data().disabled === true) {
        await auth.signOut();
        const err = new Error('비활성화된 계정입니다. 관리자에게 문의하세요.');
        err.code = 'auth/account-disabled';
        throw err;
      }
      // 마지막 로그인 시각 기록 + 프로필 누락 시 보정 (가입 때 프로필 쓰기가 실패한 경우 자동 복구)
      const heal = { lastLoginAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (!snap.exists) {
        // 프로필 문서 자체가 없으면 생성(create) — role 지정 가능
        heal.email = cred.user.email || '';
        heal.displayName = cred.user.displayName || '';
        heal.role = ADMIN_EMAILS.includes(cred.user.email) ? 'admin' : 'reader';
        heal.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      } else if (!snap.data().email) {
        // 문서는 있으나 이메일 누락 — update 경로(본인은 role/disabled 변경 불가)이므로 role은 건드리지 않음
        heal.email = cred.user.email || '';
        if (!snap.data().displayName) heal.displayName = cred.user.displayName || '';
      }
      await db.collection('users').doc(cred.user.uid).set(heal, { merge: true });
    } catch (e) {
      if (e && e.code === 'auth/account-disabled') throw e;
      console.warn('[signIn] 로그인 후처리 실패:', e.message);
    }
    return cred.user;
  }

  async function signOutUser() {
    await auth.signOut();
  }

  function currentUser() {
    return auth.currentUser;
  }

  function isAdmin() {
    const u = auth.currentUser;
    return !!u && ADMIN_EMAILS.includes(u.email);
  }

  // ===== 역할(role) 캐시 — users/{uid}.role 기반 (reader/editor/admin) =====
  let _roleCache = null;       // 마지막으로 조회한 역할
  let _rolePromise = null;     // 진행 중인 조회 (중복 방지)
  async function loadRole(uid) {
    uid = uid || (auth.currentUser && auth.currentUser.uid);
    if (!uid) { _roleCache = null; return null; }
    try {
      const snap = await db.collection('users').doc(uid).get();
      _roleCache = snap.exists ? (snap.data().role || 'reader') : 'reader';
    } catch (e) {
      console.warn('[firebase.js] role 조회 실패:', e.message);
      _roleCache = null;
    }
    return _roleCache;
  }
  // 캐시가 있으면 즉시, 없으면 조회 후 반환
  function roleReady() {
    const u = auth.currentUser;
    if (!u) return Promise.resolve(null);
    if (_roleCache != null) return Promise.resolve(_roleCache);
    if (!_rolePromise) _rolePromise = loadRole(u.uid).finally(() => { _rolePromise = null; });
    return _rolePromise;
  }
  function role() { return _roleCache; }
  // 관리자 이메일이면 항상 admin 취급. 그 외엔 캐시된 role 사용.
  function isEditorRole() { return isAdmin() ? false : _roleCache === 'editor'; }
  function isStaff() { return isAdmin() || _roleCache === 'editor'; }
  // 인증 상태가 바뀌면 역할 캐시 갱신
  auth.onAuthStateChanged(u => {
    _roleCache = null;
    if (u) loadRole(u.uid);
  });
  // 현재 에디터의 배정 문서 조회 (editorAssignments/{uid})
  async function getEditorAssignment(uid) {
    uid = uid || (auth.currentUser && auth.currentUser.uid);
    if (!uid) return null;
    try {
      const snap = await db.collection('editorAssignments').doc(uid).get();
      return snap.exists ? snap.data() : null;
    } catch (e) {
      console.warn('[firebase.js] 에디터 배정 조회 실패:', e.message);
      return null;
    }
  }

  // 인증 상태가 결정될 때 resolve되는 Promise (한 번)
  const authReady = new Promise(resolve => {
    const off = auth.onAuthStateChanged(() => {
      off();
      resolve(auth.currentUser);
    });
  });

  // 인증 상태 구독 (해제 함수 반환)
  function onAuthChange(callback) {
    return auth.onAuthStateChanged(callback);
  }

  // ===== Firestore 헬퍼 =====
  function userRef(uid) {
    return db.collection('users').doc(uid || (auth.currentUser && auth.currentUser.uid));
  }

  function subRef(name, uid) {
    const u = uid || (auth.currentUser && auth.currentUser.uid);
    if (!u) return null;
    return db.collection('users').doc(u).collection(name);
  }

  // ===== 글 ID 생성 =====
  // 단발: article{YYYYMMDD}{a-z}, 시리즈: {series}{YYYYMMDD}{a-z}
  // 예) article20260529a, ai20260529a, unfair20260530b
  async function generateArticleId(date, series) {
    const d = date instanceof Date ? date : new Date(String(date || '').replace(/\./g, '-'));
    if (isNaN(d.getTime())) {
      throw new Error('잘못된 날짜 형식');
    }
    const ymd = d.getFullYear().toString()
      + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0');
    const prefix = (series && String(series).trim()) || 'article';
    const base = `${prefix}${ymd}`;
    // Firestore에서 같은 prefix+ymd로 시작하는 글들 조회 → 다음 알파벳 부여
    try {
      const snap = await db.collection('articles')
        .where(firebase.firestore.FieldPath.documentId(), '>=', base + 'a')
        .where(firebase.firestore.FieldPath.documentId(), '<', base + '{')
        .get();
      const usedLetters = new Set(snap.docs.map(d => d.id.substring(base.length)));
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      for (const L of letters) {
        if (!usedLetters.has(L)) return base + L;
      }
      throw new Error('같은 날 글이 26편을 넘었습니다.');
    } catch (e) {
      // 조회 실패 시 첫 글자로 폴백
      console.warn('[generateArticleId] 조회 실패:', e.message);
      return base + 'a';
    }
  }

  // ===== Storage 헬퍼 =====
  async function uploadImage(file, folder) {
    if (!storage) throw new Error('Firebase Storage가 로드되지 않았습니다.');
    folder = folder || 'misc';
    const ext = (file.name || 'image.jpg').split('.').pop();
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `articles/${folder}/${filename}`;
    const ref = storage.ref(path);
    const snap = await ref.put(file);
    return await snap.ref.getDownloadURL();
  }

  // ===== 글로벌 노출 =====
  window.fb = {
    auth,
    db,
    storage,
    signUp,
    signIn,
    signOut: signOutUser,
    currentUser,
    isAdmin,
    loadRole,
    roleReady,
    role,
    isEditorRole,
    isStaff,
    getEditorAssignment,
    onAuthChange,
    authReady,
    userRef,
    subRef,
    generateArticleId,
    uploadImage,
    FieldValue: firebase.firestore.FieldValue,
    Timestamp: firebase.firestore.Timestamp
  };

  console.log('[firebase.js] 초기화 완료 — project:', firebaseConfig.projectId);
})();
