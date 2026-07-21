  function _applyView(view, beforeShow) {
    document.body.setAttribute('data-view', view);
    if (typeof beforeShow === 'function') beforeShow();
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelectorAll('.header-nav .nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.view === view);
    });
    if (view === 'saved' || view === 'mypage') renderMyPage();
    if (view === 'list') renderList();
    if (view === 'article') {
      syncReactionsState();
      syncBookmarkState();
      updateProgress();
    }
  }
  // ===== Multi-page navigation =====
  // SPA showView/showArticle/showHome are repurposed to navigate to real pages.
  // Internal callbacks (beforeShow, options) are ignored — each page loads fresh.
  const _PAGE_URLS = {
    home: '/',
    about: '/about.html',
    series: '/series.html',
    notes: '/notes.html',
    list: '/list.html',
    mypage: '/mypage.html',
    saved: '/mypage.html'
  };
  function showView(view, beforeShow, options) {
    options = options || {};
    // Gate: mypage requires login
    if (view === 'mypage' && !isLoggedIn()) {
      showToast('로그인 후 이용할 수 있어요.');
      setTimeout(() => openLogin(), 500);
      return;
    }
    // Multi-page: navigate to the real URL (full page reload).
    // If we're already on this page, just re-render the current view in-place.
    const targetUrl = _PAGE_URLS[view];
    if (targetUrl) {
      const currentView = document.body.getAttribute('data-view');
      if (currentView === view || (currentView === 'mypage' && view === 'saved')) {
        // already on this page — just rerun the view's render (back-compat with old SPA calls)
        return _applyView(view, beforeShow);
      }
      window.location.href = targetUrl;
      return;
    }
    // Unknown view (e.g. 'article') — let _applyView handle it on the article page itself.
    _applyView(view, beforeShow);
  }

  /* ===== Mobile Drawer ===== */
  function openDrawer() {
    document.getElementById('drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ===== Theme ===== */
  function applyTheme(t) {
    document.body.classList.toggle('dark', t === 'dark');
    document.documentElement.classList.toggle('dark', t === 'dark');
    localStorage.setItem('persp_theme', t);
    const label = document.querySelector('.theme-label');
    if (label) label.textContent = (t === 'dark' ? 'Light mode' : 'Dark mode');
  }
  function toggleTheme() {
    const cur = localStorage.getItem('persp_theme') || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }
  /* ===== Browser back/forward (History API) ===== */
  function _restoreFromState(state) {
    if (!state || !state.view) {
      _applyView('home');
      return;
    }
    if (state.view === 'article' && state.id) {
      _applyView('article');
      document.querySelectorAll('.article-content').forEach(el => el.style.display = 'none');
      const target = document.getElementById('article-' + state.id);
      if (target) {
        target.style.display = 'block';
        target.querySelectorAll('.random-pick').forEach(el => fillRandomPick(el, state.id));
        _currentArticleId = state.id;
        applyCollectedHighlights(state.id);
        injectBottomBack(target);
        if (target.dataset.prerelease === 'true') syncCheerState();
        document.querySelectorAll('.article-content').forEach(el => {
          if (el !== target) el.querySelectorAll('iframe.interview-iframe').forEach(f => f.removeAttribute('src'));
        });
        target.querySelectorAll('iframe.interview-iframe').forEach(f => {
          if (f.dataset.src && !f.getAttribute('src')) f.src = f.dataset.src;
        });
      }
      syncReactionsState();
      syncBookmarkState();
    } else {
      _applyView(state.view);
      if (state.view === 'saved' || state.view === 'mypage') renderMyPage();
      if (state.view === 'list') renderList();
    }
  }
  // Multi-page: popstate is naturally handled by browser navigation (full page load).
  // No SPA history routing needed.

  // Initial render based on the page's <body data-view="..."> attribute.
  (function initMultiPage() {
    const run = () => {
      const view = document.body.getAttribute('data-view') || 'home';
      // Update active nav link
      document.querySelectorAll('.header-nav .nav-link').forEach(l => {
        l.classList.toggle('active', l.dataset.view === view);
      });
      // View-specific initial renders
      if (view === 'saved' || view === 'mypage') {
        if (typeof renderMyPage === 'function') renderMyPage();
        if (typeof initMyPageData === 'function') initMyPageData(); // 라이브 인덱스 로드 후 차감 반영
      }
      if (view === 'home') {
        if (typeof initHomeData === 'function') initHomeData();   // Firestore 카테고리 → 홈 탭
      }
      if (view === 'list') {
        if (typeof renderList === 'function') renderList();       // 정적 글 즉시 표시
        if (typeof initListData === 'function') initListData();   // Firestore 카테고리·발행 글 병합
      }
      if (view === 'article') {
        if (typeof syncReactionsState === 'function') syncReactionsState();
        if (typeof syncBookmarkState === 'function') syncBookmarkState();
        if (typeof updateProgress === 'function') updateProgress();
        // 랜덤 추천 채우기 + 비어 있으면 섹션 자체 숨김
        if (typeof fillRandomPick === 'function') {
          document.querySelectorAll('.article-content .random-pick').forEach(el => {
            // 현재 글 ID는 body data-article-id 또는 article id에서 추출
            const articleEl = document.querySelector('.article-content');
            const currentId = (document.body.getAttribute('data-article-id')) ||
                              (articleEl && articleEl.id ? articleEl.id.replace(/^article-/, '') : '');
            fillRandomPick(el, currentId);
          });
        }
        // 하단 BACK 버튼 주입
        if (typeof injectBottomBack === 'function') {
          document.querySelectorAll('.article-content').forEach(el => injectBottomBack(el));
        }
      }
      // 비주얼 관리(어드민)에서 저장한 텍스트를 페이지에 반영
      if (view === 'home') applySiteText('main');
      if (view === 'about') applySiteText('about');
      if (view === 'notice') applySiteText('notice');

      // 오피니언 — 홈 카드 데이터 / 의견 페이지 초기화
      if (view === 'home') {
        if (typeof loadHomeOpinion === 'function') loadHomeOpinion();
        if (typeof loadHomePoll === 'function') loadHomePoll();
        if (typeof loadHeroArticles === 'function') loadHeroArticles();
        if (typeof initHomeLatestControls === 'function') initHomeLatestControls();
      }
      if (view === 'opinion') {
        if (typeof initOpinionPage === 'function') initOpinionPage();
      }
      if (view === 'library') {
        if (typeof renderPublicLibrary === 'function') renderPublicLibrary();
      }
      if (view === 'author') {
        if (typeof renderEditorProfile === 'function') renderEditorProfile();
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  })();

  /* ===== LOCALLAYERS 브랜드 스토리 모달 (푸터 locallayers.kr 클릭) ===== */

  // initial theme
  (function() {
    const saved = localStorage.getItem('persp_theme');
    const sys = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved || sys);
  })();

  /* ===== Login state — Firebase Auth ===== */
  function isLoggedIn() {
    return !!(window.fb && fb.currentUser());
  }
  function getUserName() {
    const u = window.fb && fb.currentUser();
    if (!u) return '독자';
    return u.displayName || (u.email ? u.email.split('@')[0] : '독자');
  }
  let _authResolved = false;
  function applyLoginState() {
    // Firebase 인증이 아직 복원되지 않은 동안에는 캐시된(pre-paint) 로그인 상태를 신뢰해
    // '로그인→비로그인→로그인' 깜빡임을 방지한다. 실제 상태는 onAuthChange가 확정한다.
    let logged;
    if (_authResolved) {
      logged = isLoggedIn();
      try { localStorage.setItem('pv:auth', logged ? '1' : '0'); } catch (e) {}
    } else {
      try { logged = localStorage.getItem('pv:auth') === '1'; } catch (e) { logged = false; }
    }
    document.body.classList.toggle('logged-in', logged);
    const btn = document.getElementById('loginBtn');
    if (btn) btn.setAttribute('aria-label', logged ? 'Account · ' + getUserName() : 'Login');
    // 마이페이지 인사말 동기화 — 인증 확정 후에만 갱신(초기 캐시 단계에서 잘못된 이름 노출 방지)
    if (_authResolved) {
      const greet = document.querySelector('[data-greet]');
      if (greet) greet.textContent = logged ? getUserName() + ' 님' : '';
    }
    // 관리자: 아바타 옆에 어드민(톱니) 버튼 표시 — 인증 확정 후에만
    if (_authResolved) applyAdminButton();
  }
  // 관리자 진입은 아바타(계정) 메뉴의 '관리자 모드' 항목으로 통합됨.
  // 과거 헤더 톱니 버튼이 남아 있으면 제거한다(중복 진입점 정리).
  function applyAdminButton() {
    const gear = document.getElementById('adminBtn');
    if (gear) gear.remove();
  }
  // Firebase 인증 상태 변경 구독 → UI 갱신
  if (window.fb) {
    fb.onAuthChange((user) => {
      _authResolved = true;
      applyLoginState();
      // 로그인 시 실시간 클라우드 동기화 구독(기기 간 공유), 로그아웃 시 구독 해제
      if (user) {
        if (typeof _cloudSubscribe === 'function') _cloudSubscribe();
      } else {
        if (typeof _cloudUnsubscribe === 'function') _cloudUnsubscribe();
      }
      // 로그인 직후 마이페이지·아티클 등 뷰별 재렌더 트리거
      const view = document.body.getAttribute('data-view');
      if (view === 'mypage' && typeof renderMyPage === 'function') renderMyPage();
      if (view === 'article' && typeof syncReactionsState === 'function') {
        syncReactionsState();
        if (typeof syncBookmarkState === 'function') syncBookmarkState();
        // 인증 복원이 스크롤보다 늦게 끝난 경우, 이미 30% 이상 읽었어도
        // 기록되지 않았으므로 로그인 직후 진행도를 다시 계산해 읽음 기록을 보충한다.
        if (user && typeof updateProgress === 'function') updateProgress();
      }
      // 에디터 프로필: 최초 렌더는 인증 복원 전이라 본인(소유자) 판별이 안 돼
      // 설정(⚙️) 버튼이 안 보인다. 인증 확정 후 다시 렌더해 소유자 UI를 노출.
      if (view === 'author' && typeof renderEditorProfile === 'function') renderEditorProfile();
    });
  }

  // 로그인 모달 — login / signup / reset 모드 토글
  let _authMode = 'login';
  // 회원가입 모드에서만 노출되는 약관 동의 행을 폼에 1회 주입
  function _ensureAgreeRow() {
    let row = document.getElementById('loginAgreeRow');
    if (row) return row;
    const form = document.querySelector('.login-form');
    if (!form) return null;
    const submit = document.getElementById('loginSubmitBtn');
    row = document.createElement('label');
    row.className = 'login-agree';
    row.id = 'loginAgreeRow';
    row.style.display = 'none';
    row.innerHTML =
      '<input type="checkbox" id="loginAgree" />' +
      '<span><a href="/terms.html" target="_blank" rel="noopener">이용약관</a>' +
      ' 및 <a href="/privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>에 동의합니다.' +
      ' <span class="login-agree-req">(필수)</span></span>';
    if (submit && submit.parentNode === form) form.insertBefore(row, submit);
    else form.appendChild(row);
    return row;
  }
  function _setAgreeVisible(show) {
    const row = _ensureAgreeRow();
    if (!row) return;
    row.style.display = show ? 'flex' : 'none';
    if (!show) { const c = document.getElementById('loginAgree'); if (c) c.checked = false; }
  }
  // 비밀번호 규칙: 10자 이상 + 영문 + 숫자 + 특수기호
  function _pwChecks(pw) {
    pw = pw || '';
    return {
      len: pw.length >= 10,
      alpha: /[a-zA-Z]/.test(pw),
      num: /[0-9]/.test(pw),
      special: /[^a-zA-Z0-9]/.test(pw)
    };
  }
  function _pwValid(pw) {
    const c = _pwChecks(pw);
    return c.len && c.alpha && c.num && c.special;
  }
  // 회원가입 모드 전용 UI(규칙 안내 + 비밀번호 재입력 + 일치 여부)를 폼에 1회 주입
  function _ensureSignupPwUI() {
    const pw = document.getElementById('loginPassword');
    if (!pw) return null;
    if (document.getElementById('loginPwHint')) return document.getElementById('loginPwHint');
    const hint = document.createElement('ul');
    hint.id = 'loginPwHint';
    hint.className = 'login-pw-hint';
    hint.style.display = 'none';
    hint.innerHTML =
      '<li data-rule="len"><span class="pw-dot"></span>10자 이상</li>' +
      '<li data-rule="alpha"><span class="pw-dot"></span>영문 포함</li>' +
      '<li data-rule="num"><span class="pw-dot"></span>숫자 포함</li>' +
      '<li data-rule="special"><span class="pw-dot"></span>특수기호 포함</li>';
    const confirm = document.createElement('input');
    confirm.type = 'password';
    confirm.id = 'loginPasswordConfirm';
    confirm.placeholder = '비밀번호 다시 입력';
    confirm.setAttribute('autocomplete', 'new-password');
    confirm.style.display = 'none';
    const match = document.createElement('div');
    match.id = 'loginPwMatch';
    match.className = 'login-pw-match';
    match.style.display = 'none';
    pw.insertAdjacentElement('afterend', hint);
    hint.insertAdjacentElement('afterend', confirm);
    confirm.insertAdjacentElement('afterend', match);
    pw.addEventListener('input', _updatePwUI);
    confirm.addEventListener('input', _updatePwUI);
    return hint;
  }
  function _updatePwUI() {
    if (_authMode !== 'signup') return;
    const pw = document.getElementById('loginPassword');
    const confirm = document.getElementById('loginPasswordConfirm');
    const hint = document.getElementById('loginPwHint');
    const match = document.getElementById('loginPwMatch');
    if (!pw) return;
    const checks = _pwChecks(pw.value);
    if (hint) {
      hint.querySelectorAll('li').forEach(function(li) {
        li.classList.toggle('ok', !!checks[li.getAttribute('data-rule')]);
      });
    }
    if (match && confirm) {
      if (!confirm.value) {
        match.style.display = 'none'; match.textContent = ''; match.className = 'login-pw-match';
      } else if (confirm.value === pw.value) {
        match.style.display = ''; match.textContent = '비밀번호가 일치합니다.';
        match.className = 'login-pw-match ok';
      } else {
        match.style.display = ''; match.textContent = '비밀번호가 일치하지 않습니다.';
        match.className = 'login-pw-match err';
      }
    }
  }
  function _setSignupPwVisible(show) {
    _ensureSignupPwUI();
    const hint = document.getElementById('loginPwHint');
    const confirm = document.getElementById('loginPasswordConfirm');
    const match = document.getElementById('loginPwMatch');
    if (hint) hint.style.display = show ? 'flex' : 'none';
    if (confirm) {
      confirm.style.display = show ? '' : 'none';
      if (show) confirm.setAttribute('required', '');
      else { confirm.removeAttribute('required'); confirm.value = ''; }
    }
    if (match) { match.style.display = 'none'; match.textContent = ''; match.className = 'login-pw-match'; }
    if (show) _updatePwUI();
  }

  // ===== 이메일 중복확인 (회원가입 모드 전용) =====
  let _emailCheckedOk = false;   // 마지막 중복확인 통과 여부(이메일 변경 시 리셋)
  function _resetEmailStatus() {
    _emailCheckedOk = false;
    const s = document.getElementById('loginEmailStatus');
    if (s) { s.style.display = 'none'; s.textContent = ''; s.className = 'login-email-status'; }
  }
  // 사전 중복확인 버튼은 제거됨.
  // Firebase 이메일 열거 보호로 fetchSignInMethodsForEmail이 항상 빈 배열을 반환해
  // 클라이언트 단독 사전 확인이 신뢰 불가하므로, 실제 가입 시
  // auth/email-already-in-use 에러('이미 가입된 이메일입니다.')로 중복을 차단한다.
  function _ensureEmailCheckUI() { return null; }
  function _setEmailCheckVisible(_show) { _resetEmailStatus(); }
  async function _checkEmailDup() {
    const emailEl = document.getElementById('loginEmail');
    const status = document.getElementById('loginEmailStatus');
    const email = (emailEl && emailEl.value || '').trim();
    function setStatus(text, cls) {
      if (!status) return;
      status.style.display = ''; status.textContent = text;
      status.className = 'login-email-status' + (cls ? ' ' + cls : '');
    }
    if (!email) { showToast('이메일을 입력해주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus('올바른 이메일 형식이 아닙니다.', 'err'); return; }
    if (!window.fb || !fb.auth) { showToast('Firebase가 로드되지 않았습니다.'); return; }
    const btn = document.getElementById('loginEmailCheckBtn');
    if (btn) { btn.disabled = true; btn.textContent = '확인중'; }
    try {
      const methods = await fb.auth.fetchSignInMethodsForEmail(email);
      if (methods && methods.length > 0) {
        _emailCheckedOk = false;
        setStatus('이미 가입된 이메일입니다.', 'err');
      } else {
        _emailCheckedOk = true;
        setStatus('사용 가능한 이메일입니다.', 'ok');
      }
    } catch (e) {
      if (e && e.code === 'auth/invalid-email') setStatus('올바른 이메일 형식이 아닙니다.', 'err');
      else { console.warn('[checkEmailDup]', e); showToast('확인 중 오류가 발생했습니다.'); }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '중복확인'; }
    }
  }

  // ===== 아이디(이메일) 저장 (로그인 모드 전용) — 자동로그인 아님 =====
  const REMEMBER_KEY = 'pv:savedEmail';
  function _ensureRememberRow() {
    const form = document.querySelector('.login-form');
    if (!form) return null;
    if (document.getElementById('loginRememberRow')) return document.getElementById('loginRememberRow');
    const submit = document.getElementById('loginSubmitBtn');
    const row = document.createElement('label');
    row.id = 'loginRememberRow';
    row.className = 'login-remember';
    row.style.display = 'none';
    row.innerHTML = '<input type="checkbox" id="loginRemember" /><span>아이디 저장</span>';
    if (submit && submit.parentNode === form) form.insertBefore(row, submit);
    else form.appendChild(row);
    return row;
  }
  function _setRememberVisible(show) {
    const row = _ensureRememberRow();
    if (!row) return;
    row.style.display = show ? 'flex' : 'none';
    if (show) {
      let saved = ''; try { saved = localStorage.getItem(REMEMBER_KEY) || ''; } catch (e) {}
      const emailEl = document.getElementById('loginEmail');
      const remember = document.getElementById('loginRemember');
      if (saved && emailEl && !emailEl.value) emailEl.value = saved;
      if (remember) remember.checked = !!saved;
    }
  }
  function setAuthMode(mode) {
    _authMode = mode;
    const nameInput = document.getElementById('loginName');
    const pwInput = document.getElementById('loginPassword');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const toggleLink = document.getElementById('loginModeToggle');
    const title = document.querySelector('.login-title');
    const sub = document.querySelector('.login-sub');
    if (mode === 'signup') {
      if (nameInput) { nameInput.style.display = ''; nameInput.setAttribute('required', ''); }
      if (pwInput) { pwInput.style.display = ''; pwInput.setAttribute('required', ''); }
      if (submitBtn) submitBtn.textContent = '회원가입';
      if (toggleLink) { toggleLink.textContent = '← 로그인'; toggleLink.setAttribute('onclick', 'toggleLoginMode(); return false;'); }
      if (title) title.textContent = '회원가입';
      if (sub) sub.innerHTML = '이메일·비밀번호·이름으로 가입하세요.<br/>독자가 되면 LOCALLAYERS 콘텐츠를 모두 이용하실 수 있습니다.';
      _setAgreeVisible(true);
      _setSignupPwVisible(true);
      _setEmailCheckVisible(true);
      _setRememberVisible(false);
      if (pwInput) pwInput.setAttribute('autocomplete', 'new-password');
    } else if (mode === 'reset') {
      if (nameInput) { nameInput.style.display = 'none'; nameInput.removeAttribute('required'); nameInput.value = ''; }
      if (pwInput) { pwInput.style.display = 'none'; pwInput.removeAttribute('required'); pwInput.value = ''; }
      if (submitBtn) submitBtn.textContent = '재설정 메일 보내기';
      if (toggleLink) { toggleLink.textContent = '← 로그인'; toggleLink.setAttribute('onclick', "setAuthMode('login'); return false;"); }
      if (title) title.textContent = '비밀번호 재설정';
      if (sub) sub.innerHTML = '가입하신 이메일로 재설정 링크를 보내드립니다.';
      _setAgreeVisible(false);
      _setSignupPwVisible(false);
      _setEmailCheckVisible(false);
      _setRememberVisible(false);
    } else {
      if (nameInput) { nameInput.style.display = 'none'; nameInput.removeAttribute('required'); nameInput.value = ''; }
      if (pwInput) { pwInput.style.display = ''; pwInput.setAttribute('required', ''); }
      if (submitBtn) submitBtn.textContent = '로그인';
      if (toggleLink) { toggleLink.textContent = '회원가입 →'; toggleLink.setAttribute('onclick', 'toggleLoginMode(); return false;'); }
      if (title) title.textContent = '로그인';
      if (sub) sub.innerHTML = 'LOCALLAYERS 독자가 되면<br/>모든 아티클을 끝까지 읽을 수 있어요.';
      _setAgreeVisible(false);
      _setSignupPwVisible(false);
      _setEmailCheckVisible(false);
      _setRememberVisible(true);
      if (pwInput) pwInput.setAttribute('autocomplete', 'current-password');
    }
  }
  function toggleLoginMode() {
    setAuthMode(_authMode === 'login' ? 'signup' : 'login');
  }
  // 비밀번호 재설정 모드로 전환
  window.openPasswordReset = function() {
    setAuthMode('reset');
  };
  window.setAuthMode = setAuthMode;

  function openLogin() {
    if (isLoggedIn()) {
      // 로그인 상태 → 계정 메뉴(나의 서재 / 로그아웃) 토글
      toggleAccountMenu();
      return;
    }
    const m = document.getElementById('loginModal');
    if (m) {
      setAuthMode('login'); // 항상 로그인 모드로 시작
      m.classList.add('open');
      document.body.style.overflow = 'hidden';
      setTimeout(() => document.getElementById('loginEmail')?.focus(), 60);
    }
  }

  // ===== 계정 메뉴 (로그인 후 아바타 클릭) =====
  function _logout() {
    openConfirm({
      title: '로그아웃',
      msg: '정말 로그아웃하시겠어요?',
      confirmText: '로그아웃',
      onConfirm: async () => {
        try { await fb.signOut(); } catch(e) {}
        showToast('로그아웃되었습니다.');
      }
    });
  }
  function closeAccountMenu() {
    const menu = document.getElementById('accountMenu');
    if (menu) menu.classList.remove('open');
    document.removeEventListener('click', _accountMenuOutside, true);
    document.removeEventListener('keydown', _accountMenuEsc, true);
  }
  function _accountMenuOutside(e) {
    const menu = document.getElementById('accountMenu');
    const btn = document.getElementById('loginBtn');
    if (!menu) return;
    if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
    closeAccountMenu();
  }
  function _accountMenuEsc(e) {
    if (e.key === 'Escape') closeAccountMenu();
  }
  function toggleAccountMenu() {
    const btn = document.getElementById('loginBtn');
    if (!btn) return;
    let menu = document.getElementById('accountMenu');
    if (menu && menu.classList.contains('open')) { closeAccountMenu(); return; }
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'accountMenu';
      menu.className = 'account-menu';
      menu.setAttribute('role', 'menu');
      menu.innerHTML =
        '<div class="account-menu-name"></div>' +
        '<button type="button" class="account-menu-item account-menu-inbox" role="menuitem">' +
          '<i class="fa-regular fa-envelope"></i> 메시지함</button>' +
        '<button type="button" class="account-menu-item account-menu-profile" role="menuitem">' +
          '<i class="fa-solid fa-user-pen"></i> 개인정보 수정</button>' +
        // 어드민은 새 탭으로 — 보고 있던 공개 페이지를 잃지 않게 한다.
        '<a class="account-menu-item account-menu-admin" href="/admin/index.html" target="_blank" rel="noopener" role="menuitem" style="display:none;">' +
          '<i class="fa-solid fa-gear"></i> 관리자 모드</a>' +
        '<button type="button" class="account-menu-item account-menu-logout" role="menuitem">' +
          '<i class="fa-solid fa-arrow-right-from-bracket"></i> 로그아웃</button>';
      const parent = btn.closest('.header-right') || btn.parentNode;
      parent.appendChild(menu);
      menu.querySelector('.account-menu-logout').addEventListener('click', function() {
        closeAccountMenu();
        _logout();
      });
      menu.querySelector('.account-menu-profile').addEventListener('click', function() {
        closeAccountMenu();
        openProfileModal();
      });
      menu.querySelector('.account-menu-inbox').addEventListener('click', function() {
        closeAccountMenu();
        openInboxModal();
      });
    }
    const nameEl = menu.querySelector('.account-menu-name');
    if (nameEl) nameEl.textContent = getUserName() + ' 님';
    // 관리자에게만 '관리자 모드' 메뉴 노출
    const adItem = menu.querySelector('.account-menu-admin');
    if (adItem && window.fb) {
      const showAd = () => { adItem.style.display = (fb.isAdmin && fb.isAdmin()) ? '' : 'none'; };
      showAd();
      if (fb.roleReady) fb.roleReady().then(showAd).catch(() => {});
    }
    menu.classList.add('open');
    setTimeout(function() {
      document.addEventListener('click', _accountMenuOutside, true);
      document.addEventListener('keydown', _accountMenuEsc, true);
    }, 0);
  }
  /* 메시지함 — 내가 보낸 문의와 관리자 답변 */
  function openInboxModal() {
    if (!window.fb || !fb.auth) return;
    const user = fb.auth.currentUser;
    if (!user) { if (typeof openLogin === 'function') openLogin(); return; }

    let m = document.getElementById('inboxModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'inboxModal';
      m.className = 'inbox-modal';
      m.innerHTML =
        '<div class="inbox-modal-inner">' +
          '<button class="inbox-close" type="button" aria-label="닫기">&times;</button>' +
          '<h2 class="inbox-title">메시지함</h2>' +
          '<p class="inbox-sub">보내신 문의와 답변을 확인할 수 있습니다.</p>' +
          '<div class="inbox-list" id="inboxList"></div>' +
        '</div>';
      document.body.appendChild(m);
      m.querySelector('.inbox-close').addEventListener('click', function() { m.classList.remove('open'); });
      m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('open'); });
    }
    m.classList.add('open');
    _loadInbox();
  }

  function _inboxDate(ts) {
    if (!ts || !ts.toDate) return '';
    const t = ts.toDate();
    const p = (n) => String(n).padStart(2, '0');
    return t.getFullYear() + '.' + p(t.getMonth() + 1) + '.' + p(t.getDate());
  }

  function _inboxItemHTML(d) {
    const answered = !!(d.reply && String(d.reply).trim());
    const when = _inboxDate(d.createdAt);
    const rwhen = _inboxDate(d.repliedAt);
    let body = '';
    if (d.fields && typeof d.fields === 'object') {
      body = Object.keys(d.fields).map(function(k) {
        const v = d.fields[k];
        if (v == null || String(v).trim() === '') return '';
        return '<div class="inbox-f"><span>' + escHTML(k) + '</span>' + escHTML(String(v)) + '</div>';
      }).join('');
    }
    return '<article class="inbox-item">' +
      '<div class="inbox-item-top">' +
        '<span class="inbox-type">' + escHTML(d.typeLabel || d.type || '문의') +
          (d.category ? ' · ' + escHTML(d.category) : '') + '</span>' +
        '<span class="inbox-badge ' + (answered ? 'done' : 'wait') + '">' +
          (answered ? '답변 완료' : '답변 대기') + '</span>' +
      '</div>' +
      (when ? '<div class="inbox-date">' + when + '</div>' : '') +
      (body ? '<div class="inbox-body">' + body + '</div>' : '') +
      (answered
        ? '<div class="inbox-reply"><div class="inbox-reply-h">답변' + (rwhen ? ' · ' + rwhen : '') + '</div>' +
            _nlToBr(escHTML(String(d.reply))) + '</div>'
        : '') +
      '</article>';
  }

  async function _loadInbox() {
    const list = document.getElementById('inboxList');
    if (!list || !window.fb || !fb.db || !fb.auth) return;
    const user = fb.auth.currentUser;
    if (!user) return;
    list.innerHTML = '<div class="inbox-empty">불러오는 중…</div>';
    try {
      const snap = await fb.db.collection('inquiries').where('userId', '==', user.uid).get();
      const items = snap.docs
        .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
        .filter(function(d) { return d.hiddenForUser !== true; })
        .sort(function(a, b) {
          const ta = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : 0;
          const tb = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : 0;
          return tb - ta;
        });
      if (!items.length) {
        list.innerHTML = '<div class="inbox-empty">보내신 문의가 없습니다.</div>';
        return;
      }
      list.innerHTML = items.map(_inboxItemHTML).join('');
    } catch (e) {
      list.innerHTML = '<div class="inbox-empty">불러오지 못했습니다.<br/>' + escHTML((e && e.message) || '') + '</div>';
    }
  }

  /* 개인정보 수정 (이름 / 비밀번호) */
  function openProfileModal() {
    if (!window.fb || !fb.auth) return;
    const user = fb.auth.currentUser;
    if (!user) { if (typeof openLogin === 'function') openLogin(); return; }

    let m = document.getElementById('profileModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'profileModal';
      m.className = 'profile-modal';
      m.innerHTML =
        '<div class="profile-modal-inner">' +
          '<button class="profile-close" type="button" aria-label="닫기">&times;</button>' +
          '<h2 class="profile-title">개인정보 수정</h2>' +
          '<p class="profile-sub">이름과 비밀번호를 변경할 수 있습니다.</p>' +
          '<label class="profile-label" for="pfName">이름</label>' +
          '<input type="text" id="pfName" class="profile-input" placeholder="이름" autocomplete="name" />' +
          '<div class="profile-div"></div>' +
          '<label class="profile-label" for="pfNew">비밀번호 변경 <span>(변경할 때만 입력)</span></label>' +
          '<input type="password" id="pfCur" class="profile-input" placeholder="현재 비밀번호" autocomplete="current-password" />' +
          '<input type="password" id="pfNew" class="profile-input" placeholder="새 비밀번호 (6자 이상)" autocomplete="new-password" />' +
          '<input type="password" id="pfNew2" class="profile-input" placeholder="새 비밀번호 확인" autocomplete="new-password" />' +
          '<div class="profile-msg" id="pfMsg"></div>' +
          '<button type="button" class="profile-save" id="pfSave">저장</button>' +
        '</div>';
      document.body.appendChild(m);
      m.querySelector('.profile-close').addEventListener('click', function() { m.classList.remove('open'); });
      m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('open'); });
      m.querySelector('#pfSave').addEventListener('click', _saveProfile);
    }
    m.querySelector('#pfName').value = user.displayName || '';
    m.querySelector('#pfCur').value = '';
    m.querySelector('#pfNew').value = '';
    m.querySelector('#pfNew2').value = '';
    m.querySelector('#pfMsg').textContent = '';
    m.querySelector('#pfMsg').className = 'profile-msg';
    m.classList.add('open');
  }

  async function _saveProfile() {
    const m = document.getElementById('profileModal');
    if (!m || !window.fb || !fb.auth) return;
    const user = fb.auth.currentUser;
    if (!user) return;
    const msg = m.querySelector('#pfMsg');
    const btn = m.querySelector('#pfSave');
    const name = m.querySelector('#pfName').value.trim();
    const cur = m.querySelector('#pfCur').value;
    const np = m.querySelector('#pfNew').value;
    const np2 = m.querySelector('#pfNew2').value;

    msg.className = 'profile-msg';
    msg.textContent = '';
    const fail = (t) => { msg.textContent = t; msg.className = 'profile-msg err'; };

    if (!name) return fail('이름을 입력해 주세요.');
    if (np || np2 || cur) {
      if (np.length < 6) return fail('새 비밀번호는 6자 이상이어야 합니다.');
      if (np !== np2) return fail('새 비밀번호가 서로 다릅니다.');
      if (!cur) return fail('현재 비밀번호를 입력해 주세요.');
    }

    btn.disabled = true;
    btn.textContent = '저장 중...';
    try {
      if (name !== (user.displayName || '')) {
        await user.updateProfile({ displayName: name });
        try { await fb.db.collection('users').doc(user.uid).set({ displayName: name }, { merge: true }); } catch (e) {}
      }
      if (np) {
        const cred = firebase.auth.EmailAuthProvider.credential(user.email, cur);
        await user.reauthenticateWithCredential(cred);
        await user.updatePassword(np);
      }
      m.classList.remove('open');
      if (typeof showToast === 'function') showToast('개인정보가 저장되었습니다.');
      const nameEl = document.querySelector('.account-menu-name');
      if (nameEl) nameEl.textContent = name + ' 님';
    } catch (e) {
      const code = (e && e.code) || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') fail('현재 비밀번호가 올바르지 않습니다.');
      else if (code === 'auth/weak-password') fail('비밀번호가 너무 약합니다.');
      else if (code === 'auth/requires-recent-login') fail('보안을 위해 다시 로그인한 뒤 시도해 주세요.');
      else fail('저장 실패: ' + ((e && e.message) || ''));
    } finally {
      btn.disabled = false;
      btn.textContent = '저장';
    }
  }

  /* Generic confirm modal */
  function openConfirm({ title, msg, confirmText = '확인', cancelText = '취소', onConfirm, onCancel }) {
    const cm = document.getElementById('confirmModal');
    if (!cm) return;
    cm.querySelector('.confirm-title').textContent = title;
    cm.querySelector('.confirm-msg').innerHTML = msg;
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    okBtn.textContent = confirmText;
    // cancelText === '' (또는 falsy) 이면 취소 버튼 숨김 — 알림(sysAlert) 모드
    if (cancelText === '' || cancelText == null) {
      cancelBtn.style.display = 'none';
    } else {
      cancelBtn.style.display = '';
      cancelBtn.textContent = cancelText;
    }
    okBtn.onclick = () => {
      closeConfirm();
      if (typeof onConfirm === 'function') onConfirm();
    };
    cancelBtn.onclick = () => {
      closeConfirm();
      if (typeof onCancel === 'function') onCancel();
    };
    cm.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeConfirm() {
    const cm = document.getElementById('confirmModal');
    if (cm) cm.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ============================================================
  // 시스템 알림 대체 — Promise 기반 sysAlert / sysConfirm
  // 공개 페이지(app.js) 에서 사용 가능
  // ============================================================
  window.sysConfirm = function(msg, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      openConfirm({
        title: opts.title || '확인',
        msg: String(msg || '').replace(/\n/g, '<br/>'),
        confirmText: opts.okLabel || '확인',
        cancelText: opts.cancelLabel || '취소',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  };
  window.sysAlert = function(msg, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      openConfirm({
        title: opts.title || '알림',
        msg: String(msg || '').replace(/\n/g, '<br/>'),
        confirmText: opts.okLabel || '확인',
        cancelText: '', // 취소 버튼 숨김
        onConfirm: () => resolve(true)
      });
    });
  };
  // 시스템 prompt 대체 — confirmModal 안에 입력란을 띄워 텍스트를 받는다.
  // 취소 시 null, 확인 시 입력값(string) 반환. window.prompt를 대체.
  window.sysPrompt = function(msg, opts) {
    opts = opts || {};
    const ph = String(opts.placeholder || '').replace(/"/g, '&quot;');
    const init = String(opts.value || '').replace(/</g, '&lt;');
    const max = opts.maxlength || 300;
    const inputId = 'sysPromptInput';
    const body = String(msg || '').replace(/\n/g, '<br/>')
      + '<textarea id="' + inputId + '" class="sys-prompt-input" rows="' + (opts.rows || 3)
      + '" maxlength="' + max + '" placeholder="' + ph + '">' + init + '</textarea>';
    return new Promise(resolve => {
      openConfirm({
        title: opts.title || '입력',
        msg: body,
        confirmText: opts.okLabel || '확인',
        cancelText: opts.cancelLabel || '취소',
        onConfirm: () => {
          const el = document.getElementById(inputId);
          resolve(el ? el.value : '');
        },
        onCancel: () => resolve(null)
      });
      // 모달이 열린 직후 입력란에 포커스
      setTimeout(() => { const el = document.getElementById(inputId); if (el) el.focus(); }, 30);
    });
  };
  function closeLogin() {
    const m = document.getElementById('loginModal');
    if (m) m.classList.remove('open');
    document.body.style.overflow = '';
  }
  // Firebase Auth — 로그인/회원가입/재설정 통합
  async function doAuth() {
    const email = (document.getElementById('loginEmail')?.value || '').trim();
    const password = document.getElementById('loginPassword')?.value || '';
    const name = (document.getElementById('loginName')?.value || '').trim();
    if (!window.fb) { showToast('Firebase가 로드되지 않았습니다.'); return; }
    // 재설정 모드는 이메일만 필요
    if (_authMode === 'reset') {
      if (!email) { showToast('이메일을 입력해주세요.'); return; }
    } else {
      if (!email) { showToast('이메일을 입력해주세요.'); return; }
      if (!password) { showToast('비밀번호를 입력해주세요.'); return; }
    }
    const submitBtn = document.getElementById('loginSubmitBtn');
    const origText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '...'; }
    try {
      if (_authMode === 'reset') {
        await fb.auth.sendPasswordResetEmail(email);
        showToast('재설정 메일을 보냈습니다.<br/>메일함을 확인하세요.');
        setAuthMode('login');
        return;
      }
      if (_authMode === 'signup') {
        if (!name) { showToast('이름을 입력해주세요.'); return; }
        if (!_pwValid(password)) { showToast('비밀번호는 10자 이상이며 영문·숫자·특수기호를 모두 포함해야 합니다.'); return; }
        const confirmVal = document.getElementById('loginPasswordConfirm')?.value || '';
        if (password !== confirmVal) { showToast('비밀번호가 일치하지 않습니다.<br/>다시 한번 확인해주세요.'); return; }
        const agree = document.getElementById('loginAgree');
        if (!agree || !agree.checked) { showToast('이용약관과 개인정보처리방침에 동의해주세요.'); return; }
        await fb.signUp(email, password, name);
        closeLogin();
        showToast('환영합니다, ' + name + '님.');
      } else {
        const user = await fb.signIn(email, password);
        // 아이디 저장(자동로그인 아님) — 체크 시 이메일만 보관, 해제 시 삭제
        try {
          const r = document.getElementById('loginRemember');
          if (r && r.checked) localStorage.setItem(REMEMBER_KEY, email);
          else localStorage.removeItem(REMEMBER_KEY);
        } catch (e) {}
        closeLogin();
        showToast('환영합니다, ' + (user.displayName || email.split('@')[0]) + '님.');
      }
    } catch (err) {
      console.error('[doAuth]', err);
      const code = err.code || '';
      let msg = '오류가 발생했습니다.';
      if (code === 'auth/email-already-in-use') msg = '이미 가입된 이메일입니다.';
      else if (code === 'auth/invalid-email') msg = '올바른 이메일 형식이 아닙니다.';
      else if (code === 'auth/weak-password') msg = '비밀번호는 10자 이상이며 영문·숫자·특수기호를 모두 포함해야 합니다.';
      else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') msg = '이메일 또는 비밀번호가 일치하지 않습니다.';
      else if (code === 'auth/user-not-found') msg = '가입되지 않은 이메일입니다.';
      else if (code === 'auth/too-many-requests') msg = '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.';
      else if (code === 'auth/network-request-failed') msg = '네트워크 오류 — 인터넷 연결을 확인하세요.';
      showToast(msg);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
    }
  }
  // 하위 호환: doLogin이 어딘가 남아있을 경우
  window.doLogin = doAuth;
  // initial UI sync (Firebase가 실제 상태 알려주면 onAuthChange가 다시 호출)
  applyLoginState();

  /* ===== Search Modal (stub) ===== */
  async function openSearch() {
    const m = document.getElementById('searchModal');
    if (!m) return;
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    const _si = m.querySelector('input');
    if (_si) _si.placeholder = '제목·본문·태그로 검색';
    if (typeof renderSearchEmpty === 'function') renderSearchEmpty();
    setTimeout(() => m.querySelector('input')?.focus(), 60);
    // 검색 카탈로그(발행 글)가 아직 없으면 로드 후, 입력값이 있으면 재실행
    if ((!_fsListArticles || _fsListArticles.length === 0) && window.fb) {
      try {
        await Promise.all([
          (typeof loadPublishedArticles === 'function' ? loadPublishedArticles() : null),
          ((!listCategories || listCategories.length === 0) && typeof loadListCategories === 'function' ? loadListCategories() : null)
        ]);
      } catch (_) {}
      if (typeof renderSearchEmpty === 'function') renderSearchEmpty();
      const inp = document.getElementById('searchInput');
      if (inp && inp.value.trim()) doSearch();
    }
  }
  function closeSearch() {
    const m = document.getElementById('searchModal');
    if (m) m.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ===== Article data (loaded from data.js) ===== */
  const ARTICLES = window.ARTICLES || {};

  /* ===== List view (all articles) with pagination ===== */
  const LIST_PER_PAGE = 20;
  let listCurrentPage = 1;

  let _fsListArticles = [];      // Firestore PUBLISHED 글 (목록 병합용)
  let _fsArticlesLoaded = false; // 라이브 발행 글 인덱스 로드 완료 여부(아카이브 차감 가드)
  let listCategories = [];       // [{name, order}] — Firestore categories
  let listActiveCategory = '';   // '' = 전체
  let listPageCategory = '';     // ?cat= 로 진입한 1차 카테고리 랜딩 모드 (빈값 = 전체보기)

  // 최신순 정렬 키: 실제 발행 시각(publishedAt) → 생성(createdAt) → 날짜 문자열 순으로 폴백.
  // (날짜 문자열만 쓰면 같은 날 글끼리 동점이 되어 순서가 뒤섞임)
  function _pubMs(a) {
    if (!a) return 0;
    const t = a.publishedAt || a.createdAt;
    if (t) {
      if (typeof t.toMillis === 'function') return t.toMillis();
      if (typeof t.toDate === 'function') return t.toDate().getTime();
      if (typeof t.seconds === 'number') return t.seconds * 1000;
      if (t instanceof Date) return t.getTime();
    }
    if (a.date) { const ms = Date.parse(String(a.date).replace(/\./g, '-')); if (!isNaN(ms)) return ms; }
    return 0;
  }

  function getListItems() {
    // 정적(data.js) + Firestore 글 병합 (id 중복 시 Firestore 우선)
    const map = {};
    Object.entries(ARTICLES).forEach(([id, a]) => { map[id] = { id, ...a }; });
    _fsListArticles.forEach(a => { map[a.id] = a; });
    let all = Object.values(map);
    if (listActiveCategory) {
      // 1차 선택 시 그 하위 2차 카테고리 글도 함께 매칭
      const children = listCategories
        .filter(c => (c.parent || '').trim() === listActiveCategory)
        .map(c => c.name);
      const match = new Set([listActiveCategory, ...children]);
      // 카테고리 필터 적용 시 placeholder 제외
      return all.filter(a => match.has(a.category) || match.has(a.cat))
                .sort((a, b) => _pubMs(b) - _pubMs(a));
    }
    // 하드코딩 더미 목록 제거 — 실제 발행(PUBLISHED) 글만 최신순으로 노출
    return all.sort((a, b) => _pubMs(b) - _pubMs(a));
  }

  // 발행 글 목록이 바뀌었을 때 다시 그려야 하는 화면들.
  // 해당 요소가 없는 페이지에서는 자동으로 건너뛴다.
  function _rerenderArticleSurfaces() {
    if (typeof renderHomeLatest === 'function' && document.getElementById('latestGrid')) renderHomeLatest();
    if (typeof renderHomePopular === 'function' && document.getElementById('popularGrid')) renderHomePopular();
    if (typeof renderList === 'function' && document.getElementById('listRows')) renderList();
  }

  // Firestore 발행 글을 실시간 구독해 목록에 병합.
  // 어드민에서 발행·수정·삭제하면 방문자가 새로고침하지 않아도 반영된다.
  // 첫 스냅샷에서 resolve하므로 기존 await 호출부는 그대로 동작한다.
  let _articlesUnsub = null;
  function loadPublishedArticles() {
    if (!window.fb) return Promise.resolve();
    return new Promise(resolve => {
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };
      try {
        if (_articlesUnsub) _articlesUnsub();
        _articlesUnsub = fb.db.collection('articles').where('status', '==', 'PUBLISHED')
          .onSnapshot(snap => {
            _fsListArticles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            _fsArticlesLoaded = true; // 라이브 인덱스 확보 → 아카이브 차감 활성화
            done();
            _rerenderArticleSurfaces();
          }, err => {
            console.warn('[list] 발행 글 구독 실패:', err.message);
            done();
          });
      } catch (err) {
        console.warn('[list] 발행 글 구독 실패:', err.message);
        done();
      }
    });
  }

  // 현재 노출 가능한(발행된) 글 id 집합 — 정적 + Firestore PUBLISHED
  function _availableArticleIds() {
    const ids = new Set();
    Object.keys(ARTICLES).forEach(id => ids.add(id));
    _fsListArticles.forEach(a => a && a.id && ids.add(a.id));
    return ids;
  }
  // 글 메타 조회 — 정적 카탈로그 우선, 없으면 Firestore 발행 글
  function _lookupArticle(id) {
    if (ARTICLES[id]) return ARTICLES[id];
    return _fsListArticles.find(a => a && a.id === id) || null;
  }

  // Firestore에서 카테고리를 실시간 구독 (어드민에서 추가/수정 시 즉시 반영)
  let _categoriesUnsub = null;
  async function loadListCategories() {
    if (!window.fb) return;
    return new Promise(resolve => {
      let resolved = false;
      try {
        if (_categoriesUnsub) _categoriesUnsub();
        _categoriesUnsub = fb.db.collection('categories').onSnapshot(snap => {
          listCategories = snap.docs.map(d => d.data()).filter(c => c && c.name);
          listCategories.sort((a, b) => {
            const oa = a.order != null ? a.order : 0, ob = b.order != null ? b.order : 0;
            if (oa !== ob) return oa - ob;
            return (a.name || '').localeCompare(b.name || '', 'ko');
          });
          // 첫 응답에서 resolve, 이후엔 UI 자동 갱신
          if (!resolved) { resolved = true; resolve(); }
          if (typeof applyCategoryHero === 'function') applyCategoryHero(); // 카테고리 랜딩 히어로 갱신
          renderCategoryFilter();   // list 페이지 칩 갱신 (있으면)
          renderHomeTabs();         // 홈 탭 갱신 (있으면)
          if (typeof renderHomeLatest === 'function') renderHomeLatest(); // 홈 카드 라벨 갱신 (있으면)
          if (typeof renderHomePopular === 'function') renderHomePopular(); // 인기 섹션 라벨 갱신 (있으면)
        }, err => {
          console.warn('[list] 카테고리 구독 실패:', err.message);
          if (!resolved) { resolved = true; resolve(); }
        });
      } catch (err) {
        console.warn('[list] 카테고리 구독 실패:', err.message);
        if (!resolved) { resolved = true; resolve(); }
      }
    });
  }

  // 카테고리 라벨: 2차 카테고리는 "1차 · 2차" 형태로 표기
  function _catLabel(name) {
    if (!name) return '';
    const c = listCategories.find(x => (x.name || '') === name);
    const parent = c && (c.parent || '').trim();
    return parent ? parent + ' · ' + name : name;
  }

  // 카드(썸네일) 카테고리 라벨(HTML): 시리즈 글이면 [Series] 시리즈명 n/n, 아니면 일반 카테고리 라벨
  function _cardCatHTML(a) {
    if (a && a.seriesName && a.seriesNo != null) {
      const no = String(a.seriesNo).padStart(2, '0');
      const total = a.seriesTotal != null ? String(a.seriesTotal).padStart(2, '0') : '';
      const nn = total ? `${no}/${total}` : no;
      return `<span class="card-cat-series">Series</span>${escHTML(a.seriesName)} ${nn}`;
    }
    const cat = (a && (a.category || a.cat)) || '';
    return escHTML(_catLabel(cat) || (a && a.cat) || '');
  }

  // 카테고리 랜딩 모드(?cat=1차)에서만: 2차 카테고리 메뉴바를 메인 메뉴바 스타일로 노출.
  // 전체보기(listPageCategory 없음) 모드에서는 비워 두어 CSS가 필터바를 자동 숨김.
  function renderCategoryFilter() {
    const bar = document.getElementById('catFilter');
    if (!bar) return;
    if (!listPageCategory) { bar.innerHTML = ''; return; }
    const children = listCategories.filter(c => (c.parent || '').trim() === listPageCategory);
    const tab = (val, label) =>
      `<button class="tab${listActiveCategory === val ? ' active' : ''}" data-cat="${escHTML(val)}">${escHTML(label)}</button>`;
    // '전체'(=1차 자기 자신, 하위 2차 글까지 매칭) + 2차 카테고리들
    let html = tab(listPageCategory, '전체');
    children.forEach(c => { html += tab(c.name, c.name); });
    bar.innerHTML = html;
    bar.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        listActiveCategory = btn.dataset.cat || listPageCategory;
        listCurrentPage = 1;
        renderCategoryFilter();
        renderList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // 카테고리 랜딩 모드: 히어로 제목=1차 카테고리명, 서브=카테고리 설명
  function applyCategoryHero() {
    const titleEl = document.getElementById('listHeroTitle');
    const leadEl = document.getElementById('listHeroLead');
    const labelEl = document.getElementById('listHeroLabel');
    if (!listPageCategory) return;
    const c = listCategories.find(x => (x.name || '') === listPageCategory);
    if (labelEl) labelEl.textContent = 'ARTICLES CATEGORY';
    if (titleEl) titleEl.textContent = listPageCategory;
    // 서브타이틀: 카테고리 생성 시 입력한 '설명'을 노출 (설명이 없으면 숨김)
    if (leadEl) {
      const desc = ((c && c.description) || '').trim();
      if (desc) { leadEl.textContent = desc; leadEl.style.display = ''; }
      else { leadEl.textContent = ''; leadEl.style.display = 'none'; }
    }
    document.title = listPageCategory + ' · LOCALLAYERS';
  }

  // 목록 페이지 진입 시: 카테고리 + 발행 글을 불러와 필터/목록 갱신
  async function initListData() {
    await Promise.all([loadListCategories(), loadPublishedArticles()]);
    // 홈 메뉴에서 넘어온 ?cat= 파라미터로 1차 카테고리 랜딩 모드 진입
    const _catParam = new URLSearchParams(location.search).get('cat');
    if (_catParam && listCategories.some(c => (c.name || '') === _catParam)) {
      // 2차로 들어와도 최상위 1차를 페이지 카테고리로 삼는다
      listPageCategory = _topCat(_catParam);
      listActiveCategory = _catParam;
      listCurrentPage = 1;
      applyCategoryHero();
    }
    renderCategoryFilter();
    renderHomeTabs();   // 홈 탭도 같은 데이터로 갱신
    renderList();
  }

  // 홈 페이지의 #tabs를 Firestore 카테고리로 동적 렌더
  // listCategories를 공유 (별도 fetch 없음)
  let homeActiveCategory = '';
  function renderHomeTabs() {
    const tabsEl = document.getElementById('tabs');
    if (!tabsEl) return;
    const make = (val, label) =>
      `<button class="tab${homeActiveCategory === val ? ' active' : ''}" data-cat="${escHTML(val)}">${escHTML(label)}</button>`;
    // 메인 메뉴바: '아티클 전체' + 1차 카테고리만 노출 (2차는 숨김)
    let html = make('', '아티클 전체');
    listCategories.filter(c => !(c.parent || '').trim()).forEach(c => { html += make(c.name, c.name); });
    tabsEl.innerHTML = html;
    // 메인 메뉴바에서 카테고리를 누르면 해당 카테고리의 아티클 목록 페이지로 이동
    tabsEl.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat || '';
        window.location.href = '/list.html' + (cat ? ('?cat=' + encodeURIComponent(cat)) : '');
      });
    });
  }

  // 카테고리의 최상위(1차) 이름 — 2차면 상위, 1차면 자기 자신
  function _topCat(name) {
    if (!name) return '';
    const c = listCategories.find(x => (x.name || '') === name);
    const parent = c && (c.parent || '').trim();
    return parent || name;
  }

  // 본문 HTML로 예상 읽기 시간/깊이를 산출. 한국어 콘텐츠 기준 ~500자/분.
  function _readMetaFromHtml(html) {
    const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const chars = (text.match(/[^\s]/g) || []).length;
    const minutes = Math.max(1, Math.round(chars / 500));
    let depth = '가볍게 읽는 글';
    if (minutes >= 10) depth = '깊게 읽는 글';
    else if (minutes >= 5) depth = '찬찬히 읽는 글';
    return { minutes: minutes, depth: depth };
  }
  // 카드용 읽기 시간 배지. 영상/팟캐스트 등 본문이 없는 글은 빈 문자열.
  // 지도가 붙은 글임을 카드 우측 상단에 작은 핀으로 알린다.
  // 좌표가 없으면 아티클에서도 지도가 안 나오므로 배지도 달지 않는다.
  function _cardPlaceBadge(a) {
    const p = a && a.place;
    if (!p) return '';
    if (!isFinite(parseFloat(p.lat)) || !isFinite(parseFloat(p.lng))) return '';
    return '<div class="card-place-badge" aria-label="지도 있음" title="지도 있음"><i class="fa-solid fa-location-dot"></i></div>';
  }

  /* 작성자명 표기.
     브랜드 명의로 발행한 글은 로고와 같은 결로 읽히도록 LAYERS를 굵게 쓴다.
     예전 글에는 'LOCALLAYER'(S 없음)로 저장돼 있으므로 표시할 때 함께 흡수한다 —
     Firestore 값은 건드리지 않는다. */
  function _authorHTML(name) {
    const n = String(name || '').trim();
    if (/^LOCALLAYERS?$/i.test(n)) return 'LOCAL<strong>LAYERS</strong>';
    return escHTML(n);
  }

  // 카드 메타 우측에 붙는 작성자명. 값이 없으면 아무것도 그리지 않아
  // 날짜만 있는 카드의 레이아웃이 흔들리지 않는다.
  function _cardAuthor(a) {
    const name = (a && a.author ? String(a.author) : '').trim();
    if (!name) return '';
    return '<span class="card-author">' + _authorHTML(name) + '</span>';
  }

  // 홈 탭 선택에 따라 카드 표시/숨김. 선택된 1차 카테고리에 속한 카드만 노출.
  // (동적 카드만 data-cat을 가지므로, 특정 카테고리 선택 시 정적/오피니언 카드는 숨김)
  function applyHomeFilter() {
    const grid = document.getElementById('latestGrid');
    if (!grid) return;
    const sel = homeActiveCategory;
    const recruitOpen = !!(_siteSettings && _siteSettings.editorRecruitOpen === true);
    grid.querySelectorAll('.card').forEach(card => {
      // 에디터 모집 카드: 모집 ON이고 '전체' 보기일 때만 노출 (OFF면 항상 숨김).
      // 카테고리 필터가 걸리면 모집 카드는 기사 카드가 아니므로 숨긴다.
      if (card.classList.contains('recruit-card')) {
        card.style.display = (recruitOpen && !sel) ? '' : 'none';
        return;
      }
      if (!sel) { card.style.display = ''; return; }
      card.style.display = (card.dataset.cat === sel) ? '' : 'none';
    });
  }

  // 홈 최신글 모바일 페이지네이션 상태 (현재까지 노출 중인 글 수)
  let _homeMobileShown = 0;
  let _homeLatestControlsInit = false;
  function _isHomeMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  }
  // '더보기' 버튼 + 화면 크기 변화 시 그리드 재계산 (1회만 바인딩)
  function initHomeLatestControls() {
    if (_homeLatestControlsInit) return;
    _homeLatestControlsInit = true;
    const btn = document.getElementById('homeLoadMoreBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        const S = _siteSettings || {};
        const per = Math.max(1, parseInt(S.homeLatestMobilePerPage, 10) || SITE_DEFAULTS.homeLatestMobilePerPage);
        if (_homeMobileShown <= 0) {
          _homeMobileShown = Math.max(1, parseInt(S.homeLatestMobileCount, 10) || SITE_DEFAULTS.homeLatestMobileCount);
        }
        _homeMobileShown += per;
        renderHomeLatest();
      });
    }
    // PC ↔ 모바일 전환 시 노출 개수 재계산
    if (window.matchMedia) {
      const mq = window.matchMedia('(max-width: 900px)');
      const onChange = () => { _homeMobileShown = 0; renderHomeLatest(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  // 홈 LATEST 그리드에 Firestore 발행 글을 카드로 주입 (정적 카드 앞에 prepend)
  function renderHomeLatest() {
    const grid = document.getElementById('latestGrid');
    if (!grid) return;
    grid.querySelectorAll('.dyn-card').forEach(el => el.remove());
    let arts = [..._fsListArticles].sort((a, b) => _pubMs(b) - _pubMs(a));

    // ===== 노출 개수 제한 (비주얼 관리 설정 반영) =====
    const S = _siteSettings || {};
    const rowsPC = Math.max(1, parseInt(S.homeLatestRowsPC, 10) || SITE_DEFAULTS.homeLatestRowsPC);
    const mobileCount = Math.max(1, parseInt(S.homeLatestMobileCount, 10) || SITE_DEFAULTS.homeLatestMobileCount);
    const mobilePaginate = !!S.homeLatestMobilePaginate;
    const mobilePerPage = Math.max(1, parseInt(S.homeLatestMobilePerPage, 10) || SITE_DEFAULTS.homeLatestMobilePerPage);
    const isMobile = _isHomeMobile();
    const total = arts.length;
    let limit;
    if (isMobile) {
      if (mobilePaginate) {
        if (_homeMobileShown <= 0) _homeMobileShown = mobileCount;
        limit = Math.min(_homeMobileShown, total);
      } else {
        limit = Math.min(mobileCount, total);
      }
    } else {
      // PC: 한 줄 3개 × 설정 줄 수
      limit = Math.min(rowsPC * 3, total);
    }
    arts = arts.slice(0, limit);

    // 모바일 '더보기' 버튼 상태 갱신
    const moreWrap = document.getElementById('homeLoadMoreWrap');
    if (moreWrap) {
      const showMore = isMobile && mobilePaginate && limit < total;
      moreWrap.hidden = !showMore;
    }

    if (!arts.length) { applyHomeFilter(); return; }
    const html = arts.map(a => {
      const cat = a.category || a.cat || '';
      const top = _topCat(cat);
      const catHTML = _cardCatHTML(a);
      const freeMark = a.free ? '' : '<span class="card-lock" aria-label="독자 전용" title="로그인한 독자만 볼 수 있어요"><i class="fa-solid fa-lock"></i></span>';
      const videoBadge = a.videoMode ? '<div class="card-video-badge"><i class="fa-solid fa-play"></i></div>' : (a.podcastMode ? '<div class="card-audio-badge"><i class="fa-solid fa-microphone"></i></div>' : '');
      return `
        <article class="card dyn-card" data-cat="${escHTML(top)}" onclick="openCardVideo('${escHTML(a.id)}')">
          <div class="card-thumb"><img src="${escHTML(a.thumb || '')}" alt="${escHTML(a.title || '')}" loading="lazy" /></div>
          <div class="card-overlay"></div>
          <div class="card-top"><span class="card-cat">${catHTML}</span><span class="card-marks">${freeMark}${videoBadge}${_cardPlaceBadge(a)}</span></div>
          <div class="card-bottom">
            <h3 class="card-title">${escHTML(a.title || '')}</h3>
            <p class="card-sub">${escHTML(a.sub || '')}</p>
            <div class="card-meta">${escHTML(a.date || '')}${_cardAuthor(a)}</div>
          </div>
        </article>`;
    }).join('');
    grid.insertAdjacentHTML('afterbegin', html);
    pinOpinionCard();
    pinPollCard();
    pinRecruitCard();
    applyHomeFilter();
  }

  // 홈 POPULAR: 조회수 기반 인기 글. 조회 데이터가 충분할 때만 노출.
  function renderHomePopular() {
    const section = document.getElementById('popularSection');
    const grid = document.getElementById('popularGrid');
    if (!section || !grid) return;
    const candidates = _fsListArticles
      .filter(a => a && (a.viewCount || 0) > 0)
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    // 인기 판별이 의미 있으려면 조회 데이터가 쌓인 글이 최소 3개는 있어야 함
    if (candidates.length < 3) { section.hidden = true; grid.innerHTML = ''; return; }
    const top = candidates.slice(0, 6);
    grid.innerHTML = top.map((a, idx) => {
      const catHTML = _cardCatHTML(a);
      const freeMark = a.free ? '' : '<span class="card-lock" aria-label="독자 전용" title="로그인한 독자만 볼 수 있어요"><i class="fa-solid fa-lock"></i></span>';
      const videoBadge = a.videoMode ? '<div class="card-video-badge"><i class="fa-solid fa-play"></i></div>' : (a.podcastMode ? '<div class="card-audio-badge"><i class="fa-solid fa-microphone"></i></div>' : '');
      const views = (a.viewCount || 0).toLocaleString('ko-KR');
      return `
        <article class="card" onclick="openCardVideo('${escHTML(a.id)}')">
          <div class="card-thumb">
            <img src="${escHTML(a.thumb || '')}" alt="${escHTML(a.title || '')}" loading="lazy" />
            <span class="card-hot-badge" aria-label="인기 콘텐츠"><i class="fa-solid fa-fire"></i></span>
          </div>
          <div class="card-overlay"></div>
          <div class="card-top"><span class="card-cat">${catHTML}</span><span class="card-marks">${freeMark}${videoBadge}${_cardPlaceBadge(a)}</span></div>
          <div class="card-bottom">
            <h3 class="card-title">${escHTML(a.title || '')}</h3>
            <p class="card-sub">${escHTML(a.sub || '')}</p>
            <div class="card-meta">조회 ${views}${_cardAuthor(a)}</div>
          </div>
        </article>`;
    }).join('');
    section.hidden = false;
  }

  // 오피니언 카드를 항상 첫 줄 3번째(인덱스 2)에 고정
  function pinOpinionCard() {
    const grid = document.getElementById('latestGrid');
    if (!grid) return;
    const opinion = grid.querySelector('.opinion-card');
    if (!opinion) return;
    opinion.remove();
    // 동적/정적 카드 중 3번째 슬롯(인덱스 2) 앞에 삽입. 카드가 2개 이하면 맨 뒤.
    const ref = grid.children[2] || null;
    grid.insertBefore(opinion, ref);
  }

  // 설문 카드를 두 번째 줄 세번째 자리(PC 3열 기준 인덱스 5)에 고정
  function pinPollCard() {
    const grid = document.getElementById('latestGrid');
    if (!grid) return;
    const poll = grid.querySelector('.poll-card');
    if (!poll) return;
    poll.remove();
    // 6번째 슬롯(인덱스 5) 앞에 삽입. 카드가 5개 이하면 맨 뒤.
    const ref = grid.children[5] || null;
    grid.insertBefore(poll, ref);
  }

  // 에디터 모집 카드를 세 번째 줄 세번째 자리(PC 3열 기준 인덱스 8)에 고정.
  // 모집 ON(site/settings.editorRecruitOpen)일 때만 노출.
  function pinRecruitCard() {
    const grid = document.getElementById('latestGrid');
    if (!grid) return;
    const card = grid.querySelector('.recruit-card');
    if (!card) return;
    const open = (_siteSettings && _siteSettings.editorRecruitOpen === true);
    if (!open) { card.style.display = 'none'; return; }
    card.style.display = '';
    // 어드민에서 설정한 카드 문구 반영 (없으면 기본 문구 유지)
    const tEl = card.querySelector('#homeRecruitTitle');
    const dEl = card.querySelector('#homeRecruitDesc');
    if (tEl && _siteSettings.editorRecruitTitle) tEl.textContent = _siteSettings.editorRecruitTitle;
    if (dEl && _siteSettings.editorRecruitDesc) dEl.textContent = _siteSettings.editorRecruitDesc;
    card.remove();
    // 9번째 슬롯(인덱스 8) 앞에 삽입. 카드가 8개 이하면 맨 뒤.
    const ref = grid.children[8] || null;
    grid.insertBefore(card, ref);
  }
  // 모집 토글 변경 시 카드 노출 갱신 (renderHomeLatest 미호출 상황 대비)
  function applyRecruitFeatureFlag() {
    if (typeof pinRecruitCard === 'function' && document.getElementById('latestGrid')) {
      pinRecruitCard();
    }
  }

  // 홈 UPCOMING: Firestore의 발행 예정(PRERELEASE) 글을 동적으로 렌더. 없으면 섹션 숨김.
  async function loadHomeUpcoming() {
    const section = document.getElementById('upcomingSection');
    const grid = document.getElementById('upcomingGrid');
    if (!section || !grid || !window.fb) return;
    const now0 = Date.now();
    let docs = [];
    try {
      const snap = await fb.db.collection('articles').where('status', '==', 'PRERELEASE').get();
      docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('[home] 발행 예정 글 로드 실패:', err.message);
      section.hidden = true;
      return;
    }
    // 예약 발행(SCHEDULED) 글의 안전한 미러(upcomingTeasers)도 합친다.
    // SCHEDULED 본문은 공개 열람이 막혀 있으므로, 제목/썸네일/카운트다운만 담긴
    // 이 미러 문서로만 노출한다(본문 절대 비노출). 항상 잠금(클릭 불가) 처리.
    try {
      const tsnap = await fb.db.collection('upcomingTeasers').get();
      const seen = new Set(docs.map(d => d.id));
      tsnap.docs.forEach(d => {
        if (seen.has(d.id)) return; // 같은 글이 PRERELEASE에도 있으면 중복 방지
        const t = d.data() || {};
        const obj = { id: d.id, ...t, _teaser: true };
        const rel = _upcomingReleaseMs(obj);
        // 공개 시각이 이미 지난 미러는 표시하지 않음(곧 자동 발행되어 본 피드로 이동).
        if (rel && rel > now0) docs.push(obj);
      });
    } catch (err) {
      console.warn('[home] 예약 발행 미러 로드 실패(무시):', err.message);
    }
    // 공개 예정 시각(ms) 산출: scheduledAt(정확) > date 문자열(해당일) 순
    docs.forEach(a => { a._releaseMs = _upcomingReleaseMs(a); });
    // 임박한 예정 글이 먼저
    docs.sort((x, y) => (x._releaseMs || Infinity) - (y._releaseMs || Infinity)
      || String(x.date || '').localeCompare(String(y.date || '')));
    if (!docs.length) { section.hidden = true; grid.innerHTML = ''; return; }
    const now = Date.now();
    grid.innerHTML = docs.map(a => {
      const cat = a.category || a.cat || '';
      const label = _catLabel(cat) || a.seriesName || cat || '';
      let releaseDateStr = '';
      if (a._releaseMs) {
        const dt = new Date(a._releaseMs);
        releaseDateStr = dt.getFullYear() + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + String(dt.getDate()).padStart(2, '0');
      }
      // 공개 예정 시각(_releaseMs)이 있으면 그 날짜를 우선 사용(저장된 publishDateLabel은 생성일 기준이라 부정확할 수 있음).
      const baseDate = releaseDateStr || a.publishDateLabel || a.date || '';
      const meta = baseDate ? (/발행 예정$/.test(baseDate) ? baseDate : baseDate + ' 발행 예정') : '발행 예정';
      const isTeaser = !!a._teaser;
      const isFuture = !!(a._releaseMs && a._releaseMs > now);
      // 예약 발행 미러(_teaser)는 본문이 비공개 → 잠금(클릭 불가).
      // 프리릴리즈는 응원·자료 받는 페이지라 공개 예정이라도 항상 클릭 가능.
      const isLocked = isTeaser;
      // 썸네일 우측 상단 뱃지: 예약 발행(_teaser)은 '예약', 프리릴리즈는 '프리릴리즈'.
      const prBadge = isTeaser
        ? '<span class="upcoming-badge">예약</span>'
        : '<span class="upcoming-badge">프리릴리즈</span>';
      const thumb = a.thumb
        ? `<div class="card-thumb"><img src="${escHTML(a.thumb)}" alt="${escHTML(a.title || '')}" loading="lazy" />${prBadge}</div><div class="card-overlay"></div>`
        : '';
      // 공개 예정 시각이 미래이면 카운트다운 노출(예약·프리릴리즈 공통).
      const countdown = isFuture
        ? `<div class="upcoming-countdown" data-release="${a._releaseMs}">${_fmtCountdown(a._releaseMs - now)}</div>`
        : '';
      const openAttr = isLocked ? '' : ` onclick="showArticle('${escHTML(a.id)}')"`;
      // 예약 발행 미러(_teaser)는 '곧 공개되는 일반 콘텐츠'라 썸네일 색을 빼서 옅게,
      // 프리릴리즈(독자와 함께 만드는 콘텐츠)는 썸네일을 선명하게 + 뱃지.
      // 썸네일이 없는 프리릴리즈는 기존 회색 텍스트 박스 유지(흰 글씨 방지).
      const teaserCls = isTeaser ? ' is-teaser' : (a.thumb ? ' is-prerelease' : '');
      return `
        <article class="card upcoming-card${isLocked ? ' is-locked' : ''}${teaserCls}"${openAttr}>
          ${thumb}
          <div class="card-top"><span class="card-cat">${escHTML(label)}</span></div>
          <div class="card-bottom">
            <h3 class="card-title">${escHTML(a.title || '')}</h3>
            <p class="card-sub">${escHTML(a.sub || '')}</p>
            <div class="card-meta">${escHTML(meta)}</div>
            ${countdown}
          </div>
        </article>`;
    }).join('');
    section.hidden = false;
    _startUpcomingCountdown();
  }

  // PRERELEASE 글의 공개 예정 시각(ms) 계산
  function _upcomingReleaseMs(a) {
    if (a.scheduledAt && typeof a.scheduledAt.toDate === 'function') {
      return a.scheduledAt.toDate().getTime();
    }
    if (a.scheduledAt && a.scheduledAt.seconds != null) {
      return a.scheduledAt.seconds * 1000;
    }
    // 레거시 프리릴리즈(scheduledAt 없이 저장됨): '발행 예정일 표시 텍스트'에서 날짜 추출.
    // 작성일(date)보다 사용자가 지정한 공개 예정일에 더 가깝다.
    if (a.publishDateLabel) {
      const m = String(a.publishDateLabel).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (m) {
        const ms = Date.parse(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T23:59:59`);
        if (!isNaN(ms)) return ms;
      }
    }
    if (a.date) {
      const ms = Date.parse(String(a.date).replace(/\./g, '-'));
      if (!isNaN(ms)) return ms; // 해당 날짜 00:00 기준
    }
    return 0;
  }

  // 남은 시간을 "D-7 · 03:12:45" 형태로 포맷
  function _fmtCountdown(ms) {
    if (ms <= 0) return '곧 공개';
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    const dPart = days > 0 ? `D-${days} · ` : '';
    return `${dPart}${pad(h)}:${pad(m)}:${pad(s)} 후 공개`;
  }

  let _upcomingTimer = null;
  function _startUpcomingCountdown() {
    if (_upcomingTimer) { clearInterval(_upcomingTimer); _upcomingTimer = null; }
    const els = document.querySelectorAll('.upcoming-countdown[data-release]');
    if (!els.length) return;
    const tick = () => {
      const now = Date.now();
      let anyLive = false;
      els.forEach(el => {
        const release = Number(el.getAttribute('data-release')) || 0;
        const diff = release - now;
        if (diff > 0) { anyLive = true; el.textContent = _fmtCountdown(diff); }
        else { el.textContent = '곧 공개'; }
      });
      if (!anyLive && _upcomingTimer) { clearInterval(_upcomingTimer); _upcomingTimer = null; }
    };
    tick();
    _upcomingTimer = setInterval(tick, 1000);
  }

  // 홈 페이지 진입 시: 카테고리 + 발행 글을 불러와 탭·LATEST 갱신
  async function initHomeData() {
    if (!window.fb) return;
    await Promise.all([loadListCategories(), loadPublishedArticles()]);
    renderHomeTabs();
    renderHomeResume();
    renderHomeResurface();
    renderHomeLatest();
    renderHomePopular();
    loadHomeUpcoming().catch(() => {});
    // 응원한 글이 새로 발행됐으면 중앙 팝업으로 알림 (로그인 상태에서만)
    setTimeout(() => { try { maybeShowCheerPublishedPopup(); } catch (e) {} }, 600);
  }

  // 홈 '이어보기': history 중 진행률 100% 미만 글을 최근순으로 노출. 기록 없으면 섹션 숨김.
  function renderHomeResume() {
    const section = document.getElementById('resumeSection');
    const row = document.getElementById('resumeRow');
    if (!section || !row) return;
    const _avail = _availableArticleIds();
    const _prune = _fsArticlesLoaded;
    const items = getHistory()
      .filter(h => h && h.id && (h.progress || 0) > 0 && (h.progress || 0) < 100)
      .filter(h => !_prune || _avail.has(h.id))
      .slice(0, 6);
    if (!items.length) { section.hidden = true; row.innerHTML = ''; return; }
    row.innerHTML = items.map(h => {
      const a = _lookupArticle(h.id) || (h.title ? h : null);
      if (!a) return '';
      const progress = Math.min(100, Math.max(0, h.progress || 0));
      const thumb = a.thumb || (a.videoId ? ('https://img.youtube.com/vi/' + a.videoId + '/mqdefault.jpg') : '');
      const thumbHTML = thumb
        ? `<img src="${escHTML(thumb)}" alt="" loading="lazy" />`
        : `<div class="resume-thumb--empty"></div>`;
      const cat = _catLabel(a.cat || a.category || '') || '';
      return `
        <article class="resume-card" onclick="openCardVideo('${escHTML(h.id)}')">
          <div class="resume-thumb">${thumbHTML}<span class="resume-pct">${progress}%</span></div>
          <div class="resume-body">
            ${cat ? `<div class="resume-cat">${escHTML(cat)}</div>` : ''}
            <h3 class="resume-title">${escHTML(a.title || '')}</h3>
            <div class="resume-track"><div class="resume-bar" style="width:${progress}%"></div></div>
            <div class="resume-action">이어보기 →</div>
          </div>
        </article>`;
    }).join('');
    section.hidden = false;
  }

  // '읽은 지 얼마나 됐는지' 상대 시간 라벨 (다시 만나기 칩에 사용)
  function _agoLabel(ts) {
    const diff = Date.now() - (ts || 0);
    const day = 86400000;
    const d = Math.floor(diff / day);
    if (d >= 365) return Math.floor(d / 365) + '년 전';
    if (d >= 30) return Math.floor(d / 30) + '개월 전';
    if (d >= 7) return Math.floor(d / 7) + '주 전';
    if (d >= 1) return d + '일 전';
    return '오늘';
  }

  // 홈 '다시 만나기(RESURFACE)': 예전에 읽은 글(기본 21일 이상 경과)을 오래된 순으로
  // 다시 노출 → 잊고 지낸 글을 재발견. 이어보기(진행중·최근)와 겹치지 않게 분리.
  function renderHomeResurface() {
    const section = document.getElementById('resurfaceSection');
    const row = document.getElementById('resurfaceRow');
    if (!section || !row) return;
    const _avail = _availableArticleIds();
    const _prune = _fsArticlesLoaded;
    const NOW = Date.now();
    const MIN_AGE = 21 * 86400000; // 21일 이상 지난 읽음 기록만
    // 이어보기에 이미 노출되는 글(진행중·최근)은 제외
    const resumeIds = new Set(
      getHistory().filter(h => h && h.id && (h.progress || 0) > 0 && (h.progress || 0) < 100).map(h => h.id)
    );
    const items = getHistory()
      .filter(h => h && h.id && (NOW - (h.ts || 0)) >= MIN_AGE)
      .filter(h => !resumeIds.has(h.id))
      .filter(h => !_prune || _avail.has(h.id))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0)) // 가장 오래 안 본 글 먼저
      .slice(0, 6);
    if (!items.length) { section.hidden = true; row.innerHTML = ''; return; }
    row.innerHTML = items.map(h => {
      const a = _lookupArticle(h.id) || (h.title ? h : null);
      if (!a) return '';
      const thumb = a.thumb || (a.videoId ? ('https://img.youtube.com/vi/' + a.videoId + '/mqdefault.jpg') : '');
      const thumbHTML = thumb
        ? `<img src="${escHTML(thumb)}" alt="" loading="lazy" />`
        : `<div class="resume-thumb--empty"></div>`;
      const cat = _catLabel(a.cat || a.category || '') || '';
      const ago = _agoLabel(h.ts);
      return `
        <article class="resume-card" onclick="openCardVideo('${escHTML(h.id)}')">
          <div class="resume-thumb">${thumbHTML}<span class="resume-pct">${escHTML(ago)}</span></div>
          <div class="resume-body">
            ${cat ? `<div class="resume-cat">${escHTML(cat)}</div>` : ''}
            <h3 class="resume-title">${escHTML(a.title || '')}</h3>
            <div class="resume-action">다시 만나기 →</div>
          </div>
        </article>`;
    }).join('');
    section.hidden = false;
  }

  // 마이페이지 진입 시: 라이브 발행 글 인덱스를 불러와 아카이브를 다시 렌더
  // (삭제/숨김된 콘텐츠는 _availableArticleIds에서 빠져 자동 차감됨)
  async function initMyPageData() {
    if (!window.fb) return;
    try { await loadPublishedArticles(); } catch (e) {}
    const view = document.body.getAttribute('data-view');
    if (view === 'mypage' || view === 'saved') {
      if (typeof renderMyPage === 'function') renderMyPage();
      // 보낸 응원 중 삭제/철회된 글을 정리하고 카운트·인사이트를 갱신.
      if (_cheeredArticleIds().length) {
        _resolveCheerStatuses().then(() => {
          if (typeof renderMyInsights === 'function') renderMyInsights();
        }).catch(() => {});
      }
    }
  }

  function renderList() {
    const items = getListItems();
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / LIST_PER_PAGE));
    if (listCurrentPage > pages) listCurrentPage = pages;
    const start = (listCurrentPage - 1) * LIST_PER_PAGE;
    const pageItems = items.slice(start, start + LIST_PER_PAGE);

    document.getElementById('listTotal').textContent = total;
    document.getElementById('listPageInfo').textContent = listCurrentPage + ' / ' + pages;

    const rows = pageItems.map(a => {
      const dim = a.placeholder ? ' dim' : '';
      const click = a.placeholder
        ? `showToast('곧 공개될 글입니다.')`
        : `showArticle('${escHTML(a.id)}')`;
      const cat = a.category || a.cat || '';
      const top = _topCat(cat);
      const catHTML = _cardCatHTML(a);
      const freeMark = a.free ? '' : '<span class="card-lock" aria-label="독자 전용" title="로그인한 독자만 볼 수 있어요"><i class="fa-solid fa-lock"></i></span>';
      const videoBadge = a.videoMode ? '<div class="card-video-badge"><i class="fa-solid fa-play"></i></div>' : (a.podcastMode ? '<div class="card-audio-badge"><i class="fa-solid fa-microphone"></i></div>' : '');
      return `
        <article class="card${dim}" data-cat="${escHTML(top)}" onclick="${click}">
          <div class="card-thumb"><img src="${escHTML(a.thumb || '')}" alt="${escHTML(a.title || '')}" loading="lazy" /></div>
          <div class="card-overlay"></div>
          <div class="card-top"><span class="card-cat">${catHTML}</span><span class="card-marks">${freeMark}${videoBadge}${_cardPlaceBadge(a)}</span></div>
          <div class="card-bottom">
            <h3 class="card-title">${escHTML(a.title || '')}</h3>
            <p class="card-sub">${escHTML(a.sub || '')}</p>
            <div class="card-meta">${escHTML(a.date || '')}${_cardAuthor(a)}</div>
          </div>
        </article>`;
    }).join('');
    const listRowsEl = document.getElementById('listRows');
    listRowsEl.classList.add('article-grid');
    listRowsEl.innerHTML = rows;

    // pagination
    const pagEl = document.getElementById('pagination');
    if (pages <= 1) { pagEl.innerHTML = ''; return; }
    let html = '';
    html += `<button class="page-btn arrow" ${listCurrentPage === 1 ? 'disabled' : ''} onclick="goListPage(${listCurrentPage - 1})" aria-label="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>`;
    for (let i = 1; i <= pages; i++) {
      html += `<button class="page-btn${i === listCurrentPage ? ' active' : ''}" onclick="goListPage(${i})">${i}</button>`;
    }
    html += `<button class="page-btn arrow" ${listCurrentPage === pages ? 'disabled' : ''} onclick="goListPage(${listCurrentPage + 1})" aria-label="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>`;
    pagEl.innerHTML = html;
  }
  function goListPage(n) {
    listCurrentPage = n;
    renderList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ===== My Page (saved / sentences / history) ===== */
  function getSentences() {
    try { return JSON.parse(localStorage.getItem('persp_sentences') || '[]'); }
    catch(e) { return []; }
  }
  function saveSentences(arr) {
    localStorage.setItem('persp_sentences', JSON.stringify(arr));
    _cloudPushArchive();
  }
  // 삭제 묘비(tombstone): 삭제한 문장의 키를 기록해 클라우드 동기화가 되살리지 못하게 한다.
  function _sentenceKey(s) {
    return (s && s.text) ? ((s.ts || '') + '|' + (s.articleId || '') + '|' + s.text) : '';
  }
  function getSentenceTombs() {
    try { return JSON.parse(localStorage.getItem('persp_sentences_del') || '[]'); }
    catch(e) { return []; }
  }
  function addSentenceTomb(s) {
    const k = _sentenceKey(s);
    if (!k) return;
    const t = getSentenceTombs();
    if (t.indexOf(k) === -1) {
      t.push(k);
      // 무한 증가 방지: 최근 500개만 유지
      localStorage.setItem('persp_sentences_del', JSON.stringify(t.slice(-500)));
    }
  }

  // ===== 나의 문장집: 전체 / 월별 / 주제별 보기 =====
  let _sentenceView = 'all';
  function setSentenceView(view) {
    _sentenceView = (view === 'month' || view === 'topic') ? view : 'all';
    document.querySelectorAll('#sentenceViewToggle .sv-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.sv === _sentenceView);
    });
    renderMySentences();
  }
  function _sentenceItemHTML(s, i) {
    const a = _lookupArticle(s.articleId);
    const source = a ? `<a href="#" onclick="event.stopPropagation(); showArticle('${escHTML(s.articleId)}'); return false;">${escHTML(a.title || '')}</a>` : (s.title ? escHTML(s.title) : '—');
    return `
      <div class="sentence-item">
        <div>
          <div class="sentence-text">${escHTML(s.text)}</div>
        </div>
        <div class="sentence-meta">
          ${source}<br/>${escHTML(s.date || '')}
          <br/><button class="sentence-share" onclick="shareSentenceCard(${i})"><i class="fa-solid fa-arrow-up-right-from-square"></i> 공유 카드</button><button class="sentence-delete" onclick="deleteSentence(${i})">삭제</button>
        </div>
      </div>`;
  }
  function renderMySentences() {
    const sentGrid = document.getElementById('mpSentencesItems');
    const sentEmpty = document.getElementById('mpSentencesEmpty');
    const toggle = document.getElementById('sentenceViewToggle');
    if (!sentGrid) return;
    const _prune = _fsArticlesLoaded;
    const _avail = _availableArticleIds();

    // 원본 인덱스 유지(공유/삭제가 배열 인덱스를 사용) — 차감 대상은 제외
    const all = getSentences();
    const entries = all
      .map((s, i) => ({ s, i }))
      .filter(e => !_prune || _avail.has(e.s.articleId));

    const countEl = document.getElementById('mpCountSentences');
    if (countEl) countEl.textContent = entries.length;

    if (entries.length === 0) {
      sentGrid.innerHTML = '';
      if (sentEmpty) sentEmpty.style.display = 'block';
      if (toggle) toggle.hidden = true;
      return;
    }
    if (sentEmpty) sentEmpty.style.display = 'none';
    if (toggle) toggle.hidden = false;

    if (_sentenceView === 'all') {
      sentGrid.innerHTML = entries.map(e => _sentenceItemHTML(e.s, e.i)).join('');
      return;
    }

    // 그룹핑
    const groups = []; // [{ key, label, items: [entry] }]
    const map = {};
    const pushTo = (key, label, e) => {
      if (!map[key]) { map[key] = { key, label, items: [] }; groups.push(map[key]); }
      map[key].items.push(e);
    };
    entries.forEach(e => {
      if (_sentenceView === 'month') {
        const ts = e.s.ts || Date.parse((e.s.date || '').replace(/\./g, '-')) || 0;
        const d = new Date(ts);
        if (isNaN(d) || !ts) { pushTo('unknown', '날짜 미상', e); return; }
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        pushTo(key, d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월', e);
      } else { // topic
        const a = _lookupArticle(e.s.articleId);
        const label = (a && (_catLabel(a.cat || a.category || '') || a.cat || a.category)) || '주제 미분류';
        pushTo('cat:' + label, label, e);
      }
    });
    // 월별은 최신 그룹 먼저
    if (_sentenceView === 'month') groups.sort((a, b) => (a.key < b.key ? 1 : -1));

    sentGrid.innerHTML = groups.map(g =>
      '<div class="sentence-group">' +
        '<div class="sentence-group-head"><span>' + escHTML(g.label) + '</span><span class="sentence-group-n">' + g.items.length + '</span></div>' +
        g.items.map(e => _sentenceItemHTML(e.s, e.i)).join('') +
      '</div>'
    ).join('');
  }

  /* ===== 문장 공유 카드 (Canvas → 이미지) ===== */
  function _wrapCanvasText(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const ch of Array.from(String(text))) {
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = ch; }
      else { line = test; }
    }
    if (line) lines.push(line);
    return lines;
  }
  function _truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  async function _renderSentenceCard(text, source, dateStr) {
    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const dark = document.body.classList.contains('dark');
    const bg = dark ? '#111111' : '#ffffff';
    const fg = dark ? '#f5f5f5' : '#111111';
    const muted = dark ? '#9a9a9a' : '#8a8a8a';

    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    try {
      await document.fonts.load('700 60px Pretendard');
      await document.fonts.load('400 26px Pretendard');
      await document.fonts.ready;
    } catch (e) {}

    const padX = 110;
    const maxW = W - padX * 2;

    // 따옴표 마크
    ctx.fillStyle = fg;
    ctx.font = '700 150px Georgia, serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('“', padX - 8, 300);

    // 본문: 길이에 따라 폰트 크기 자동 조절
    const textTop = 380;
    const textBottom = H - 280;
    const avail = textBottom - textTop;
    let chosen = null;
    for (const size of [64, 58, 52, 46, 40, 34]) {
      ctx.font = '700 ' + size + 'px Pretendard, sans-serif';
      const lh = Math.round(size * 1.52);
      const lines = _wrapCanvasText(ctx, text, maxW);
      if (lines.length * lh <= avail || size === 34) { chosen = { size, lh, lines }; break; }
    }
    ctx.fillStyle = fg;
    ctx.font = '700 ' + chosen.size + 'px Pretendard, sans-serif';
    chosen.lines.forEach((ln, idx) => ctx.fillText(ln, padX, textTop + idx * chosen.lh + chosen.size));

    // 출처 + 날짜
    ctx.font = '400 27px Pretendard, sans-serif';
    ctx.fillStyle = muted;
    const srcLine = (source ? '— ' + _truncate(source, 28) : '') + (dateStr ? '   ·   ' + dateStr : '');
    if (srcLine) ctx.fillText(srcLine, padX, H - 190);

    // 구분선
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padX, H - 150); ctx.lineTo(W - padX, H - 150); ctx.stroke();

    // 브랜드 푸터
    ctx.fillStyle = fg;
    ctx.font = '700 30px Pretendard, sans-serif';
    ctx.fillText('LOCALLAYERS', padX, H - 96);
    ctx.fillStyle = muted;
    ctx.font = '400 24px Pretendard, sans-serif';
    ctx.fillText('LOCALLAYERS · locallayers.kr', padX, H - 60);

    return await new Promise(res => canvas.toBlob(b => res(b), 'image/png'));
  }
  async function shareSentenceCard(i) {
    const sentences = getSentences();
    const s = sentences[i];
    if (!s) return;
    const a = _lookupArticle(s.articleId);
    const source = (a && a.title) ? a.title : (s.title || '');
    try {
      const blob = await _renderSentenceCard(s.text, source, s.date);
      if (!blob) throw new Error('blob 생성 실패');
      const file = new File([blob], 'perspective-sentence.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'LOCALLAYERS 문장' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'perspective-sentence.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      if (typeof showToast === 'function') showToast('문장 카드를 이미지로 저장했어요.');
    } catch (err) {
      if (err && err.name === 'AbortError') return; // 사용자가 공유 취소
      console.warn('[share] 문장 카드 실패:', err);
      if (typeof showToast === 'function') showToast('카드를 만들지 못했어요.');
    }
  }
  window.shareSentenceCard = shareSentenceCard;
  function getHistory() {
    try { return JSON.parse(localStorage.getItem('persp_history') || '[]'); }
    catch(e) { return []; }
  }
  function saveHistory(arr) {
    localStorage.setItem('persp_history', JSON.stringify(arr));
    _cloudPushArchive();
  }
  // 글 메타데이터 확보: 현재 글(article.html이 노출) → 정적 카탈로그 순으로
  function _articleMeta(id) {
    const cur = window.__currentArticle;
    if (cur && cur.id === id) {
      return { title: cur.title || '', cat: cur.cat || '', date: cur.date || '', thumb: cur.thumb || '' };
    }
    const a = ARTICLES[id];
    if (a) return { title: a.title || '', cat: a.cat || '', date: a.date || '', thumb: a.thumb || '' };
    return null;
  }
  function trackArticleRead(id, progress) {
    // 읽음 기록은 로그인 여부와 무관하게 localStorage에 저장 (북마크·문장과 동일).
    // 메타를 아직 못 얻었으면(인증/Firestore 복원 중) 잠시 후 재시도하도록 false 반환.
    const meta = _articleMeta(id);
    if (!meta || !meta.title) return false;
    const history = getHistory();
    const existing = history.find(h => h.id === id);
    const prevProgress = existing?.progress || 0;
    const newProgress = Math.max(prevProgress, Math.floor(progress || 30));
    const filtered = history.filter(h => h.id !== id);
    filtered.unshift({ id, ts: Date.now(), progress: newProgress, title: meta.title, cat: meta.cat, date: meta.date, thumb: meta.thumb });
    saveHistory(filtered.slice(0, 30)); // saveHistory가 로그인 시 클라우드로 동기화
    return true;
  }
  function updateArticleProgress(id, progress) {
    const history = getHistory();
    const item = history.find(h => h.id === id);
    if (!item) return;
    const newProgress = Math.floor(progress);
    if (newProgress > (item.progress || 0)) {
      item.progress = newProgress;
      saveHistory(history);
    }
  }

  function escHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderMyPage() {
    const greet = document.getElementById('mpGreeting');
    if (greet) greet.textContent = isLoggedIn() ? getUserName() + ' 님' : '';

    // 삭제/숨김된 콘텐츠는 아카이브에서 차감(마이너스 처리).
    // _fsArticlesLoaded(라이브 인덱스 확보) 전에는 차감하지 않아 데이터가 잘못 비워지지 않게 가드.
    const _prune = _fsArticlesLoaded;
    const _avail = _availableArticleIds();

    // Saved
    const bookmarks = getBookmarks();
    const visBookmarks = _prune ? bookmarks.filter(id => _avail.has(id)) : bookmarks;
    document.getElementById('mpCountSaved').textContent = visBookmarks.length;
    const savedGrid = document.getElementById('mpSavedItems');
    const savedEmpty = document.getElementById('mpSavedEmpty');
    if (visBookmarks.length === 0) {
      savedGrid.innerHTML = '';
      savedEmpty.style.display = 'block';
    } else {
      savedEmpty.style.display = 'none';
      savedGrid.innerHTML = visBookmarks.map(id => {
        const a = _lookupArticle(id);
        if (!a) return '';
        return `
          <article class="card" onclick="openCardVideo('${id}')">
            <div class="card-thumb"><img src="${escHTML(a.thumb || '')}" alt="${escHTML(a.title || '')}" /></div>
            <div class="card-overlay"></div>
            ${a.videoMode ? '<div class="card-video-badge"><i class="fa-solid fa-play"></i></div>' : (a.podcastMode ? '<div class="card-audio-badge"><i class="fa-solid fa-microphone"></i></div>' : '')}
            <div class="card-top"><span class="card-cat">${escHTML(_catLabel(a.cat || a.category || ''))}</span></div>
            <div class="card-bottom">
              <h3 class="card-title">${escHTML(a.title || '')}</h3>
              <p class="card-sub">${escHTML(a.sub || '')}</p>
              <div class="card-meta">${escHTML(a.date || '')}</div>
            </div>
          </article>`;
      }).join('');
    }

    // Sentences (전체/월별/주제별 뷰 — renderMySentences로 위임)
    renderMySentences();

    // Reactions
    renderMyReactions();

    // My Opinions (오피니언 라운지 참여 내역) — 비동기
    renderMyOpinions();

    // 팔로우한 에디터 — 비동기
    renderMyFollowing();

    // History
    const history = getHistory();
    const visHistory = _prune ? history.filter(h => _avail.has(h.id)) : history;
    document.getElementById('mpCountHistory').textContent = visHistory.length;
    const histList = document.getElementById('mpHistoryItems');
    const histEmpty = document.getElementById('mpHistoryEmpty');
    if (visHistory.length === 0) {
      histList.innerHTML = '';
      histEmpty.style.display = 'block';
    } else {
      histEmpty.style.display = 'none';
      histList.innerHTML = visHistory.map(h => {
        // 라이브 글 우선, 없으면 기록 시 저장해 둔 메타 사용 (Firestore 글 지원)
        const a = _lookupArticle(h.id) || (h.title ? h : null);
        if (!a) return '';
        const d = new Date(h.ts);
        const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
        const progress = Math.min(100, Math.max(0, h.progress || 0));
        const histThumb = a.thumb || (a.videoId ? ('https://img.youtube.com/vi/' + a.videoId + '/mqdefault.jpg') : '');
        const thumbHTML = histThumb
          ? `<img class="history-thumb" src="${escHTML(histThumb)}" alt="" loading="lazy" />`
          : `<div class="history-thumb history-thumb--empty"></div>`;
        const memo = getArticleMemo(h.id);
        const memoHTML = (memo && memo.text)
          ? `<div class="history-memo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><span>${escHTML(memo.text)}</span></div>`
          : '';
        const catStr = (a.cat || a.category || '').trim();
        const metaHTML = `<div class="history-meta">${catStr ? `<span class="history-cat">${escHTML(catStr)}</span><span class="history-meta-sep">·</span>` : ''}<span class="history-date">${dateStr}</span></div>`;
        return `
          <div class="history-item" onclick="openCardVideo('${h.id}')">
            ${thumbHTML}
            <div class="history-text">
              ${metaHTML}
              <div class="history-title">${escHTML(a.title || '')}</div>
              <div class="history-progress">
                <div class="history-progress-track">
                  <div class="history-progress-bar" style="width:${progress}%"></div>
                </div>
                <span class="history-progress-pct">${progress}%</span>
              </div>
              ${memoHTML}
            </div>
            <div class="history-arrow">→</div>
          </div>`;
      }).join('');
    }

    // 읽기 습관 인사이트(홈 대시보드 + 뱃지)
    renderMyInsights();

    // MY NOTE (아티클을 읽고 정리한 생각)
    renderMyNotes();

    // 연간 결산
    renderMyRecap();

    // 결산 탭 노출 여부를 현재 사이트 설정에 맞춰 다시 반영(렌더가 탭 상태를 덮어쓰는 경우 대비)
    if (typeof applyRecapFeatureFlag === 'function') applyRecapFeatureFlag();

    // 탭 가로 스크롤 힌트 초기화
    _bindMyPageTabsHint();
    _updateMyPageTabsHint();
  }
  function switchMyPageTab(tab) {
    let activeBtn = null;
    document.querySelectorAll('.mp-tab').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      if (on) activeBtn = b;
    });
    document.querySelectorAll('.mp-panel').forEach(p => p.style.display = p.dataset.panel === tab ? 'block' : 'none');
    // 선택된 탭을 가로 스크롤 영역 중앙으로 노출
    if (activeBtn && activeBtn.scrollIntoView) {
      try { activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch(e) {}
    }
    _updateMyPageTabsHint();
  }
  // 가로 스크롤 힌트(페이드+화살표) — 메인 메뉴 바와 동일한 방식
  function _updateMyPageTabsHint() {
    const wrap = document.getElementById('mypageTabsWrap');
    const tabs = document.getElementById('mypageTabs');
    if (!wrap || !tabs) return;
    const scrollable = tabs.scrollWidth > tabs.clientWidth + 2;
    if (!scrollable) {
      wrap.classList.add('at-end');
      wrap.classList.remove('scrolled');
      return;
    }
    const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 4;
    wrap.classList.toggle('at-end', atEnd);
    wrap.classList.toggle('scrolled', tabs.scrollLeft > 4);
  }
  function _bindMyPageTabsHint() {
    const tabs = document.getElementById('mypageTabs');
    if (!tabs || tabs.dataset.hintBound) return;
    tabs.dataset.hintBound = '1';
    tabs.addEventListener('scroll', _updateMyPageTabsHint, { passive: true });
    window.addEventListener('resize', _updateMyPageTabsHint);
  }

  // ===== 연간 결산 (My Archive Recap) =====
  function renderMyRecap() {
    const wrap = document.getElementById('mpRecap');
    if (!wrap) return;
    const YEAR = new Date().getFullYear();
    const inYear = (ts) => { const d = new Date(ts); return !isNaN(d) && d.getFullYear() === YEAR; };

    // 삭제/숨김된 콘텐츠 차감 (라이브 인덱스 확보 후에만 적용)
    const _prune = _fsArticlesLoaded;
    const _avail = _availableArticleIds();
    const _keep = (id) => !_prune || _avail.has(id);

    const history = getHistory().filter(h => _keep(h.id));
    const sentences = getSentences().filter(s => _keep(s.articleId));
    const bookmarks = getBookmarks().filter(id => _keep(id));
    const reactions = getReactions();

    const readThisYear = history.filter(h => inYear(h.ts));
    const sentThisYear = sentences.filter(s => inYear(s.ts || s.date));
    const reactionKeys = Object.keys(reactions).filter(key => {
      const m = key.match(/^(.+)-(new|deep|pass)$/);
      return m && _keep(m[1]);
    });

    const readCount = readThisYear.length;
    const sentCount = sentThisYear.length;
    const savedCount = bookmarks.length;
    const reactCount = reactionKeys.length;

    // 가장 많이 읽은 카테고리
    const catCount = {};
    readThisYear.forEach(h => {
      const a = _lookupArticle(h.id) || h; // Firestore 글은 기록 시 저장한 메타 사용
      const label = a && (a.cat || a.category);
      if (label) catCount[label] = (catCount[label] || 0) + 1;
    });
    let topCat = '', topCatN = 0;
    Object.entries(catCount).forEach(([c, n]) => { if (n > topCatN) { topCat = c; topCatN = n; } });

    // 끝까지 읽은 글 (progress >= 90)
    const finishedCount = readThisYear.filter(h => (h.progress || 0) >= 90).length;

    // 가장 인상 깊었던 문장 (가장 최근 수집한 문장)
    let pickSentence = null;
    if (sentThisYear.length) {
      pickSentence = sentThisYear.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    }

    const hasData = readCount || sentCount || savedCount || reactCount;
    if (!hasData) {
      wrap.innerHTML =
        '<div class="mp-empty" style="display:block">' +
        '<div class="empty-mark"><i class="fa-regular fa-calendar-check"></i></div>' +
        '<p>아직 결산할 기록이 없어요.</p>' +
        '<p class="mp-empty-sub">글을 읽고 문장을 모으면 ' + YEAR + '년 나의 독서 여정을 한눈에 정리해 드려요.</p>' +
        '<button class="mp-empty-btn" onclick="showHome()">홈에서 글 둘러보기</button>' +
        '</div>';
      return;
    }

    const userName = isLoggedIn() ? getUserName() : '';
    const statCard = (n, label) =>
      '<div class="recap-stat"><b>' + n + '</b><span>' + label + '</span></div>';

    let html = '';
    html += '<div class="recap-card" id="recapCard">';
    html += '  <div class="recap-head">';
    html += '    <span class="recap-kicker">' + YEAR + ' LOCALLAYERS</span>';
    html += '    <h2 class="recap-title">' + (userName ? escHTML(userName) + ' 님의<br/>' : '') + '올해의 생각 정리</h2>';
    html += '  </div>';
    html += '  <div class="recap-stats">';
    html += statCard(readCount, '읽은 글');
    html += statCard(sentCount, '모은 문장');
    html += statCard(savedCount, '저장한 글');
    html += statCard(reactCount, '남긴 반응');
    html += '  </div>';
    if (topCat) {
      html += '  <div class="recap-row"><span class="recap-row-label">가장 즐겨 읽은 주제</span>' +
              '<span class="recap-row-value">' + escHTML(topCat) + '</span></div>';
    }
    if (finishedCount) {
      html += '  <div class="recap-row"><span class="recap-row-label">끝까지 정독한 글</span>' +
              '<span class="recap-row-value">' + finishedCount + '편</span></div>';
    }
    if (pickSentence) {
      const a = _lookupArticle(pickSentence.articleId);
      html += '  <div class="recap-quote">';
      html += '    <div class="recap-quote-mark">&ldquo;</div>';
      html += '    <p class="recap-quote-text">' + escHTML(_truncate(pickSentence.text, 90)) + '</p>';
      if (a) html += '    <p class="recap-quote-src">— ' + escHTML(a.title || '') + '</p>';
      html += '  </div>';
    }
    html += '  <div class="recap-foot">LOCALLAYERS · locallayers.kr</div>';
    html += '</div>';
    html += '<p class="recap-note">올해 ' + YEAR + '년 동안 쌓아온 나의 기록을 모았어요.</p>';

    wrap.innerHTML = html;
  }

  // ===== 읽기 습관 인사이트 (My Reading Insights) =====
  function renderMyInsights() {
    const wrap = document.getElementById('mpInsights');
    if (!wrap) return;

    const _prune = _fsArticlesLoaded;
    const _avail = _availableArticleIds();
    const _keep = (id) => !_prune || _avail.has(id);

    const history = getHistory().filter(h => h && _keep(h.id));
    const sentences = getSentences().filter(s => _keep(s.articleId));
    const reactions = getReactions();

    const readCount = history.length;
    const sentCount = sentences.length;
    const reactionKeys = Object.keys(reactions).filter(key => {
      const m = key.match(/^(.+)-(new|deep|pass)$/);
      return m && reactions[key] && _keep(m[1]);
    });
    const reactCount = reactionKeys.length;

    if (!readCount && !sentCount && !reactCount) {
      wrap.innerHTML =
        '<div class="mp-empty" style="display:block">' +
        '<div class="empty-mark"><i class="fa-regular fa-chart-bar"></i></div>' +
        '<p>아직 분석할 읽기 기록이 없어요.</p>' +
        '<p class="mp-empty-sub">글을 읽고 문장을 모으면 나의 읽기 습관을 한눈에 보여드려요.</p>' +
        '<button class="mp-empty-btn" onclick="showHome()">홈에서 글 둘러보기</button>' +
        '</div>';
      return;
    }

    // 정독률(progress>=90)
    const finished = history.filter(h => (h.progress || 0) >= 90).length;
    const finishRate = readCount ? Math.round((finished / readCount) * 100) : 0;

    // 즐겨 읽는 주제 Top 3
    const catCount = {};
    history.forEach(h => {
      const a = _lookupArticle(h.id) || h;
      const label = a && (a.cat || a.category);
      if (label) catCount[label] = (catCount[label] || 0) + 1;
    });
    const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const catMax = topCats.length ? topCats[0][1] : 1;

    // 반응 분포
    const reactDist = { new: 0, deep: 0, pass: 0 };
    reactionKeys.forEach(key => {
      const m = key.match(/-(new|deep|pass)$/);
      if (m) reactDist[m[1]]++;
    });
    const reactLabel = { new: '새로운 관점', deep: '깊이 공감', pass: '그냥 지나치기 아쉬움' };

    // 주 활동 시간대 (history.ts 기준)
    const slots = { '아침': 0, '낮': 0, '저녁': 0, '심야': 0 };
    history.forEach(h => {
      const d = new Date(h.ts);
      if (isNaN(d)) return;
      const hr = d.getHours();
      if (hr >= 6 && hr < 12) slots['아침']++;
      else if (hr >= 12 && hr < 18) slots['낮']++;
      else if (hr >= 18 && hr < 24) slots['저녁']++;
      else slots['심야']++;
    });
    let topSlot = '', topSlotN = 0;
    Object.entries(slots).forEach(([s, n]) => { if (n > topSlotN) { topSlot = s; topSlotN = n; } });

    // 주 활동 요일
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    const dowCount = {};
    history.forEach(h => { const d = new Date(h.ts); if (!isNaN(d)) { const k = DOW[d.getDay()]; dowCount[k] = (dowCount[k] || 0) + 1; } });
    let topDow = '', topDowN = 0;
    Object.entries(dowCount).forEach(([s, n]) => { if (n > topDowN) { topDow = s; topDowN = n; } });

    const statCard = (n, label) => '<div class="insight-stat"><b>' + n + '</b><span>' + label + '</span></div>';

    let html = '';
    html += '<div class="insight-wrap">';

    // 핵심 수치
    html += '<div class="insight-stats">';
    html += statCard(readCount, '읽은 글');
    html += statCard(sentCount, '모은 문장');
    html += statCard(reactCount, '남긴 반응');
    html += statCard(finishRate + '%', '정독률');
    html += '</div>';

    // 즐겨 읽는 주제
    if (topCats.length) {
      html += '<div class="insight-block"><h3 class="insight-h">즐겨 읽는 주제</h3>';
      topCats.forEach(([cat, n]) => {
        const pct = Math.round((n / catMax) * 100);
        html += '<div class="insight-bar-row">' +
          '<span class="insight-bar-label">' + escHTML(cat) + '</span>' +
          '<span class="insight-bar-track"><span class="insight-bar-fill" style="width:' + pct + '%"></span></span>' +
          '<span class="insight-bar-num">' + n + '편</span></div>';
      });
      html += '</div>';
    }

    // 반응 패턴
    if (reactCount) {
      html += '<div class="insight-block"><h3 class="insight-h">나의 반응 패턴</h3>';
      ['new', 'deep', 'pass'].forEach(k => {
        if (!reactDist[k]) return;
        const pct = reactCount ? Math.round((reactDist[k] / reactCount) * 100) : 0;
        html += '<div class="insight-bar-row">' +
          '<span class="insight-bar-label">' + reactLabel[k] + '</span>' +
          '<span class="insight-bar-track"><span class="insight-bar-fill" style="width:' + pct + '%"></span></span>' +
          '<span class="insight-bar-num">' + reactDist[k] + '회</span></div>';
      });
      html += '</div>';
    }

    // 읽기 리듬
    if (topSlot || topDow) {
      html += '<div class="insight-block"><h3 class="insight-h">나의 읽기 리듬</h3><div class="insight-rhythm">';
      if (topSlot) html += '<div class="insight-rhythm-item"><span class="insight-rhythm-label">주로 읽는 시간</span><span class="insight-rhythm-value">' + topSlot + '</span></div>';
      if (topDow) html += '<div class="insight-rhythm-item"><span class="insight-rhythm-label">주로 읽는 요일</span><span class="insight-rhythm-value">' + topDow + '요일</span></div>';
      html += '</div></div>';
    }

    // 획득한 뱃지 (게이밍 점수/등급 없이 활동 뱃지만 표시)
    try {
      const rw = computeReaderRewards();
      const gotN = rw.BADGES.filter(b => b.got).length;
      html += '<div class="insight-block"><div class="reward-badges-head"><h3 class="insight-h">획득한 뱃지</h3><span class="reward-badge-count">' + gotN + ' / ' + rw.BADGES.length + '</span></div>';
      html += '<div class="reward-badges">';
      rw.BADGES.forEach(b => {
        html += '<button type="button" class="reward-badge' + (b.got ? ' got' : '') + '" title="' + escHTML(b.hint) + '"' +
          ' data-badge="' + escHTML(b.id) + '"' +
          ' data-label="' + escHTML(b.label) + '"' +
          ' data-ic="' + escHTML(b.ic) + '"' +
          ' data-hint="' + escHTML(b.hint) + '"' +
          ' data-desc="' + escHTML(b.desc || '') + '"' +
          ' data-cur="' + (b.cur || 0) + '"' +
          ' data-target="' + (b.target || 0) + '"' +
          ' data-unit="' + escHTML(b.unit || '') + '"' +
          ' data-got="' + (b.got ? '1' : '0') + '"' +
          ' onclick="openBadgeDetail(this)">' +
          '<span class="reward-badge-ic"><i class="fa-solid ' + b.ic + '"></i></span>' +
          '<span class="reward-badge-label">' + escHTML(b.label) + '</span>' +
          '<span class="reward-badge-hint">' + escHTML(b.got ? '획득' : b.hint) + '</span>' +
          '</button>';
      });
      html += '</div></div>';
    } catch (e) { /* 뱃지 표시는 선택적 */ }

    // 보낸 응원 — 발행 예정/발행됨 글을 카드 리스트로 인라인 노출(모달 없음), 5개씩 페이지네이션
    try {
      const cheerIds = _cheeredArticleIds();
      const seriesWaitCount = (function () { try { return Object.keys(getSeriesWaits()).length; } catch (e) { return 0; } })();
      if (cheerIds.length || seriesWaitCount) {
        html += _renderCheerSection(cheerIds.length + seriesWaitCount);
        // 아직 상태 미해결이면 백그라운드로 Firestore 조회 후 재렌더
        if (_cheerResolved === null && !_cheerResolving && window.fb && fb.db) {
          _cheerResolving = true;
          _resolveCheerStatuses()
            .then(() => { _cheerResolving = false; if (typeof renderMyInsights === 'function') renderMyInsights(); })
            .catch(() => { _cheerResolving = false; });
        }
        // 시리즈 알림 라벨을 코드(slug)가 아닌 시리즈명으로 표시하기 위해 레지스트리 로드 후 재렌더
        if (seriesWaitCount && _seriesNames === null && !_seriesNamesLoading) {
          _loadSeriesNames(function () { if (typeof renderMyInsights === 'function') renderMyInsights(); });
        }
      }
    } catch (e) { /* 보낸 응원 섹션은 선택적 */ }

    html += '</div>';
    wrap.innerHTML = html;
  }

  // 응원 보상 — 독자 활동(읽기·문장·반응·응원)을 누적해 등급/뱃지로 보여주는 보상 시스템(#18).
  // 모든 데이터는 로컬 아카이브 기반(서버 규칙 변경 없음). 공개 서재 프로필(#12)에서 재사용.
  function _myCheerCount() {
    try {
      const cheers = getCheers();
      return Object.keys(cheers).filter(k => cheers[k]).length;
    } catch (e) { return 0; }
  }
  // 다른 모듈(공개 프로필 등)에서 재사용할 수 있도록 활동 점수/등급을 한 곳에서 산출.
  function computeReaderRewards() {
    const _prune = _fsArticlesLoaded;
    const _avail = _availableArticleIds();
    const _keep = (id) => !_prune || _avail.has(id);

    const history = getHistory().filter(h => h && _keep(h.id));
    const sentences = getSentences().filter(s => _keep(s.articleId));
    const reactions = getReactions();
    const reactKeys = Object.keys(reactions).filter(key => {
      const m = key.match(/^(.+)-(new|deep|pass)$/);
      return m && reactions[key] && _keep(m[1]);
    });

    const memos = getMemos();
    const memoCount = Object.keys(memos).filter(id => _keep(id) && memos[id] && memos[id].text).length;

    const readCount = history.length;
    const sentCount = sentences.length;
    const reactCount = reactKeys.length;
    const cheerCount = _myCheerCount();
    const finished = history.filter(h => (h.progress || 0) >= 90).length;

    // 능동적 참여(응원)에 가중치를 두어 점수 산출
    const score = readCount * 1 + sentCount * 2 + reactCount * 2 + cheerCount * 3;

    const TIERS = [
      { name: '씨앗 독자', min: 0,   ic: 'fa-seedling',          desc: '여정을 막 시작했어요' },
      { name: '새싹 독자', min: 12,  ic: 'fa-leaf',              desc: '읽는 습관이 자라나는 중' },
      { name: '나무 독자', min: 36,  ic: 'fa-tree',              desc: '깊이 뿌리내린 독자' },
      { name: '숲 독자',   min: 80,  ic: 'fa-mountain-sun',      desc: '관점의 숲을 이룬 독자' },
      { name: '등대 독자', min: 160, ic: 'fa-tower-observation', desc: '다른 이에게 길을 비추는 독자' }
    ];
    let ti = 0;
    for (let i = 0; i < TIERS.length; i++) { if (score >= TIERS[i].min) ti = i; }
    const cur = TIERS[ti];
    const next = TIERS[ti + 1] || null;
    const span = next ? (next.min - cur.min) : 1;
    const into = score - cur.min;
    const pct = next ? Math.min(100, Math.max(0, Math.round((into / span) * 100))) : 100;

    // 각 뱃지: cur(현재 진행)·target(달성 기준)·unit(단위)·desc(의미)를 함께 담아
    // 클릭 시 '조건 + 내가 어떻게 달성했는지'를 보여줄 수 있게 한다.
    const _b = (id, label, ic, cur, target, unit, hint, desc) =>
      ({ id, label, ic, cur, target, unit, hint, desc, got: cur >= target });
    const BADGES = [
      // 읽기
      _b('firstRead', '첫 발걸음',   'fa-shoe-prints',      readCount, 1,  '편', '글 1편 읽기',  '여정의 시작. 첫 아티클을 읽으면 얻어요.'),
      _b('reader',    '꾸준한 독자', 'fa-book-open-reader', readCount, 30, '편', '글 30편 읽기', '읽는 습관이 자리잡은 독자에게 주어져요.'),
      _b('explorer',  '관점 탐험가', 'fa-compass',          readCount, 60, '편', '글 60편 읽기', '폭넓게 관점을 탐험한 독자의 증표예요.'),
      _b('finisher',  '정독러',      'fa-flag-checkered',   finished,  5,  '편', '끝까지 읽은 글 5편',  '글을 끝까지 정독한 횟수로 달성해요.'),
      _b('master',    '완독 마스터', 'fa-award',            finished,  20, '편', '끝까지 읽은 글 20편', '깊게 몰입해 완독을 거듭한 독자예요.'),
      // 문장·기록
      _b('firstSentence', '첫 문장',     'fa-quote-left',          sentCount, 1,  '개', '문장 1개 수집',  '마음에 닿은 첫 문장을 수집하면 얻어요.'),
      _b('collector',     '문장 수집가', 'fa-feather-pointed',     sentCount, 20, '개', '문장 20개 수집', '문장을 꾸준히 모은 수집가의 뱃지예요.'),
      _b('firstNote',     '기록하는 독자', 'fa-pen-nib',           memoCount, 1,  '개', '마이노트 1개 작성',  '읽고 떠오른 생각을 처음 기록하면 얻어요.'),
      _b('thinker',       '깊은 사색가',   'fa-book-journal-whills', memoCount, 10, '개', '마이노트 10개 작성', '생각을 글로 정리하길 즐기는 사색가예요.'),
      // 반응·응원
      _b('reactor', '반응 요정',     'fa-wand-magic-sparkles', reactCount, 15, '회', '반응 15회', '글에 자주 반응을 남긴 독자에게 주어져요.'),
      _b('cheer1',  '응원단',        'fa-hands-clapping',      cheerCount, 1,  '회', '응원 1회',  '발행 예정 글을 처음 응원하면 얻어요.'),
      _b('cheer10', '든든한 응원단', 'fa-heart-circle-check',  cheerCount, 10, '회', '응원 10회', '꾸준히 응원을 보낸 든든한 독자예요.')
    ];

    return { readCount, sentCount, reactCount, cheerCount, memoCount, finished, score, TIERS, ti, cur, next, pct, BADGES };
  }
  // 뱃지 클릭 → 달성 조건 + 내 진행도(어떻게 달성했는지)를 보여주는 상세 모달.
  function openBadgeDetail(el) {
    if (!el) return;
    const got = el.getAttribute('data-got') === '1';
    const label = el.getAttribute('data-label') || '';
    const ic = el.getAttribute('data-ic') || 'fa-medal';
    const hint = el.getAttribute('data-hint') || '';
    const desc = el.getAttribute('data-desc') || '';
    const cur = parseInt(el.getAttribute('data-cur'), 10) || 0;
    const target = parseInt(el.getAttribute('data-target'), 10) || 0;
    const unit = el.getAttribute('data-unit') || '';
    const pct = target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : (got ? 100 : 0);
    const shown = Math.min(cur, target);
    const remain = Math.max(0, target - cur);

    let backdrop = document.getElementById('badgeDetailBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'badgeDetailBackdrop';
      backdrop.className = 'badge-detail-backdrop';
      backdrop.innerHTML =
        '<div class="badge-detail-card" role="dialog" aria-modal="true">' +
          '<button type="button" class="badge-detail-close" aria-label="닫기" onclick="closeBadgeDetail()">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
          '</button>' +
          '<div class="badge-detail-body"></div>' +
        '</div>';
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeBadgeDetail(); });
    }
    const footTxt = got
      ? ('지금까지 ' + cur + unit + ' 달성했어요. 멋져요!')
      : ('조금만 더! ' + remain + unit + ' 남았어요.');
    backdrop.querySelector('.badge-detail-body').innerHTML =
      '<div class="badge-detail-ic' + (got ? ' got' : '') + '"><i class="fa-solid ' + escHTML(ic) + '"></i></div>' +
      '<h3 class="badge-detail-title">' + escHTML(label) + '</h3>' +
      '<span class="badge-detail-status' + (got ? ' got' : '') + '">' + (got ? '획득 완료' : '미획득') + '</span>' +
      (desc ? '<p class="badge-detail-desc">' + escHTML(desc) + '</p>' : '') +
      '<div class="badge-detail-cond"><span class="badge-detail-cond-label">달성 조건</span><span>' + escHTML(hint) + '</span></div>' +
      '<div class="badge-detail-progress">' +
        '<div class="badge-detail-bar"><span style="width:' + pct + '%"></span></div>' +
        '<div class="badge-detail-progress-meta"><span>' + shown + ' / ' + target + unit + '</span><span>' + pct + '%</span></div>' +
      '</div>' +
      '<p class="badge-detail-foot">' + escHTML(footTxt) + '</p>';
    requestAnimationFrame(function () { backdrop.classList.add('open'); });
  }
  function closeBadgeDetail() {
    const backdrop = document.getElementById('badgeDetailBackdrop');
    if (backdrop) backdrop.classList.remove('open');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const bd = document.getElementById('badgeDetailBackdrop');
      if (bd && bd.classList.contains('open')) closeBadgeDetail();
    }
  });
  // MY NOTE — 아티클을 읽고 정리한 생각(persp_memos)을 나의 서재에서 모아 보여준다.
  function renderMyNotes() {
    const list = document.getElementById('mpNotesItems');
    const empty = document.getElementById('mpNotesEmpty');
    const countEl = document.getElementById('mpCountNotes');
    if (!list || !empty) return;
    const _prune = _fsArticlesLoaded;
    const _avail = _availableArticleIds();
    const memos = getMemos();
    const items = Object.keys(memos)
      .map(id => Object.assign({ id: id }, memos[id] || {}))
      .filter(m => m.text && (!_prune || _avail.has(m.id)))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (countEl) countEl.textContent = items.length;
    if (!items.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.innerHTML = items.map(m => {
      const a = _lookupArticle(m.id) || null;
      const title = a ? (a.title || '') : '';
      const d = new Date(m.ts || 0);
      const dateStr = m.ts ? (d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0')) : '';
      const titleLabel = title ? escHTML(title) : '아티클 보기';
      const href = '/article.html?id=' + encodeURIComponent(m.id);
      return '<article class="mynote-item">' +
        '<div class="mynote-head">' +
          '<a class="mynote-title" href="' + href + '">' + titleLabel + '</a>' +
          '<span class="mynote-date">' + dateStr + '</span>' +
        '</div>' +
        '<p class="mynote-text">' + escHTML(m.text) + '</p>' +
        '</article>';
    }).join('');
  }
  window.renderMyNotes = renderMyNotes;

  // 공개 서재 모달 — 나의 서재 헤더 책갈피 아이콘에서 열기.
  window.openLibraryShare = function() {
    const m = document.getElementById('mpLibModal');
    if (!m) return;
    m.hidden = false;
    document.body.classList.add('mp-lib-open');
    renderMyLibraryShare();
  };
  window.closeLibraryShare = function() {
    const m = document.getElementById('mpLibModal');
    if (!m) return;
    m.hidden = true;
    document.body.classList.remove('mp-lib-open');
  };
  window.computeReaderRewards = computeReaderRewards;

  /* ===========================================================
     #12 공개 서재 프로필 — 회원이 옵트인해 만든 공개 서재 스냅샷.
     publicProfiles/{uid}: { uid, handle, bio, public, tier{name,ic}, score,
       stats{reads,sentences,reactions,cheers}, topCats[[cat,n]], sharedSentences[{text,title,articleId}], updatedAt }
     - 마이페이지(응원 보상 탭) 상단에서 공개/업데이트/중지 제어.
     - 공개 페이지: /library.html?u={uid}
     비공개 메모(persp_memos)는 절대 포함하지 않는다.
     =========================================================== */
  function _libraryUrlFor(uid, slug) {
    if (slug) return location.origin + '/library.html?s=' + encodeURIComponent(slug);
    return location.origin + '/library.html?u=' + encodeURIComponent(uid);
  }

  /* ── 독자 아이디(슬러그) 헬퍼 ───────────────────────────────────── */
  function _isValidSlug(s) {
    return typeof s === 'string' && /^[a-z0-9_]{3,20}$/.test(s);
  }
  async function _loadMySlug(uid) {
    try {
      var snap = await fb.db.collection('users').doc(uid).get();
      if (snap.exists) { var d = snap.data(); if (d && d.slug) return d.slug; }
    } catch (e) {}
    return null;
  }
  async function _slugToUid(slug) {
    try {
      var snap = await fb.db.collection('handles').doc(slug).get();
      if (snap.exists) return snap.data().uid || null;
    } catch (e) {}
    return null;
  }
  async function _saveMySlugData(uid, slug) {
    await fb.db.collection('handles').doc(slug).set({ uid: uid });
    await fb.db.collection('users').doc(uid).set({ slug: slug }, { merge: true });
  }

  function _buildLibrarySnapshot(uid, name, slug) {
    const _prune = _fsArticlesLoaded;
    const _avail = _availableArticleIds();
    const _keep = (id) => !_prune || _avail.has(id);

    // 즐겨 읽는 주제 Top 5
    const history = getHistory().filter(h => h && _keep(h.id));
    const catCount = {};
    history.forEach(h => {
      const a = _lookupArticle(h.id) || h;
      const label = a && (a.cat || a.category);
      if (label) catCount[label] = (catCount[label] || 0) + 1;
    });
    const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([cat, n]) => ({ cat: String(cat), n: n }));

    // 공유 문장 (최신 30개, 비공개 메모 제외 — 문장 텍스트/출처만)
    const sentences = getSentences().filter(s => s && _keep(s.articleId)).slice(0, 30)
      .map(s => ({
        text: String(s.text || '').slice(0, 600),
        title: String(s.title || ''),
        articleId: String(s.articleId || '')
      }));

    // 저장한 콘텐츠 (북마크) — 라이브러리에서 랜덤 3개 썸네일 노출용 (최대 12개 보관)
    const savedThumbs = getBookmarks().filter(_keep).map(id => {
      const a = _lookupArticle(id);
      if (!a) return null;
      return {
        id: String(id),
        title: String(a.title || ''),
        thumb: String(a.thumb || a.cover || ''),
        videoId: String(a.videoId || '')
      };
    }).filter(Boolean).slice(0, 12);

    // 통계 — 게이밍 점수/등급 없이 활동 개수만
    const reads = history.length;
    const sentTotal = getSentences().filter(s => s && _keep(s.articleId)).length;
    const reactions = getReactions();
    const reactTotal = Object.keys(reactions).filter(key => {
      const m = key.match(/^(.+)-(new|deep|pass)$/);
      return m && reactions[key] && _keep(m[1]);
    }).length;

    return {
      uid: uid,
      handle: String(name || '독자').slice(0, 40),
      slug: slug || '',
      bio: '',
      public: true,
      stats: { reads: reads, sentences: sentTotal, reactions: reactTotal },
      topCats: topCats,
      sharedSentences: sentences,
      savedThumbs: savedThumbs,
      updatedAt: fb.FieldValue.serverTimestamp()
    };
  }
  async function renderMyLibraryShare() {
    const box = document.getElementById('mpLibraryShare');
    if (!box) return;
    const user = (window.fb && fb.currentUser) ? fb.currentUser() : null;
    if (!user) {
      box.innerHTML = '<div class="libshare libshare--off"><div class="libshare-txt"><b>공개 서재</b><span>로그인하면 내 서재를 공개 프로필로 공유할 수 있어요.</span></div></div>';
      return;
    }
    let pub = null;
    try {
      const snap = await fb.db.collection('publicProfiles').doc(user.uid).get();
      if (snap.exists) pub = snap.data();
    } catch (e) { /* 무시 */ }

    if (pub && pub.public) {
      const slug = pub.slug || await _loadMySlug(user.uid);
      const url = _libraryUrlFor(user.uid, slug);
      box.innerHTML =
        '<div class="libshare libshare--on">' +
          '<div class="libshare-head"><span class="libshare-dot"></span><b>공개 서재가 켜져 있어요</b></div>' +
          '<div class="libshare-link"><input type="text" id="libShareUrl" readonly value="' + escHTML(url) + '" onclick="this.select()" />' +
            '<button type="button" class="libshare-copy" onclick="copyLibraryLink()"><i class="fa-regular fa-copy"></i> 복사</button></div>' +
          '<div class="libshare-actions">' +
            '<a class="libshare-btn ghost" href="' + escHTML(url) + '" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> 내 서재 보기</a>' +
            '<button type="button" class="libshare-btn danger" onclick="unpublishMyLibrary()"><i class="fa-solid fa-eye-slash"></i> 공개 중지</button>' +
          '</div>' +
        '</div>';
      // 마이페이지를 열 때마다 자동으로 최신 활동을 조용히 동기화 (토스트 없음)
      (function() {
        try {
          var name = (typeof getUserName === 'function' && getUserName()) || user.displayName || '독자';
          fb.db.collection('publicProfiles').doc(user.uid).set(
            _buildLibrarySnapshot(user.uid, name, slug), { merge: true }
          );
        } catch (e) { /* silent */ }
      })();
    } else {
      box.innerHTML =
        '<div class="libshare libshare--off">' +
          '<div class="libshare-txt"><b>내 서재를 공개해볼까요?</b>' +
            '<span>읽은 글과 모은 문장을 공개 프로필로 만들어 링크로 공유할 수 있어요. 비공개 메모(MY NOTE)는 절대 포함되지 않아요.</span></div>' +
          '<button type="button" class="libshare-btn primary" onclick="publishMyLibrary(false)"><i class="fa-solid fa-share-nodes"></i> 공개 서재 만들기</button>' +
        '</div>';
    }
  }
  window.publishMyLibrary = async function(isUpdate) {
    if (!window.fb || !fb.currentUser) return;
    const user = fb.currentUser();
    if (!user) { if (typeof openLogin === 'function') openLogin(); return; }
    // 독자 아이디 게이트 — 슬러그 없으면 설정 먼저
    const slug = await _loadMySlug(user.uid);
    if (!slug) {
      if (typeof showToast === 'function') showToast('공개 서재를 만들려면 먼저 독자 아이디를 설정해주세요.');
      if (typeof window.openSlugSetting === 'function') window.openSlugSetting();
      return;
    }
    try {
      const name = (typeof getUserName === 'function' && getUserName()) || (user.displayName) || '독자';
      const snap = _buildLibrarySnapshot(user.uid, name, slug);
      await fb.db.collection('publicProfiles').doc(user.uid).set(snap, { merge: true });
      if (typeof showToast === 'function') showToast(isUpdate ? '공개 서재를 최신 활동으로 업데이트했어요.' : '공개 서재를 만들었어요!');
      renderMyLibraryShare();
    } catch (err) {
      if (typeof showToast === 'function') showToast('공개 서재 저장에 실패했어요.');
      console.warn('[library publish]', err.message);
    }
  };
  window.unpublishMyLibrary = async function() {
    if (!window.fb || !fb.currentUser) return;
    const user = fb.currentUser();
    if (!user) return;
    const doIt = async () => {
      try {
        await fb.db.collection('publicProfiles').doc(user.uid).delete();
        if (typeof showToast === 'function') showToast('공개 서재를 중지했어요.');
        renderMyLibraryShare();
      } catch (err) {
        if (typeof showToast === 'function') showToast('처리에 실패했어요.');
        console.warn('[library unpublish]', err.message);
      }
    };
    if (typeof openConfirm === 'function') {
      openConfirm({ title: '공개 서재 중지', msg: '공개 서재를 끄면 공유 링크로 더 이상 볼 수 없어요. 계속할까요?', confirmText: '공개 중지', onConfirm: doIt });
    } else {
      doIt();
    }
  };
  window.copyLibraryLink = function() {
    const el = document.getElementById('libShareUrl');
    if (!el) return;
    el.select();
    const done = () => { if (typeof showToast === 'function') showToast('링크를 복사했어요.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value).then(done).catch(() => { try { document.execCommand('copy'); done(); } catch (e) {} });
    } else {
      try { document.execCommand('copy'); done(); } catch (e) {}
    }
  };

  /* ── 독자 아이디 설정 모달 ─────────────────────────────────────── */
  window.openSlugSetting = async function() {
    if (document.getElementById('slugModalOverlay')) return; // 이미 열려있음
    if (!window.fb || !fb.currentUser) return;
    var user = fb.currentUser();
    if (!user) { if (typeof openLogin === 'function') openLogin(); return; }
    var existing = await _loadMySlug(user.uid);
    var overlay = document.createElement('div');
    overlay.className = 'slug-modal-overlay';
    overlay.id = 'slugModalOverlay';
    // 이미 아이디가 설정돼 있으면 읽기 전용 화면만 표시
    if (existing) {
      overlay.innerHTML =
        '<div class="slug-modal" role="dialog" aria-modal="true">' +
          '<button class="slug-modal-close" type="button" onclick="closeSlugSetting()" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>' +
          '<h2 class="slug-modal-title"><i class="fa-solid fa-at"></i> 독자 아이디</h2>' +
          '<div class="slug-locked">' +
            '<span class="slug-locked-id">@' + escHTML(existing) + '</span>' +
            '<span class="slug-locked-badge"><i class="fa-solid fa-lock"></i> 변경 불가</span>' +
          '</div>' +
          '<p class="slug-modal-desc" style="margin-top:14px;">한 번 설정한 아이디는 변경할 수 없어요.<br>공개 서재·에디터 페이지 URL에 사용됩니다.</p>' +
        '</div>';
    } else {
      overlay.innerHTML =
        '<div class="slug-modal" role="dialog" aria-modal="true">' +
          '<button class="slug-modal-close" type="button" onclick="closeSlugSetting()" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>' +
          '<h2 class="slug-modal-title"><i class="fa-solid fa-at"></i> 독자 아이디 설정</h2>' +
          '<p class="slug-modal-desc">공개 서재·에디터 페이지 URL에 사용돼요.<br>영문 소문자·숫자·_(언더스코어) 3~20자.<br><b>한 번 설정하면 변경할 수 없으니 신중하게 입력해주세요.</b></p>' +
          '<div class="slug-modal-row">' +
            '<span class="slug-at">@</span>' +
            '<input type="text" id="slugInput" class="slug-input" maxlength="20" placeholder="my_id"' +
              ' oninput="onSlugInput()" autocomplete="off" spellcheck="false" />' +
            '<button type="button" class="slug-check-btn" id="slugCheckBtn" onclick="checkSlugAvail()" disabled>중복 확인</button>' +
          '</div>' +
          '<p class="slug-hint" id="slugHint"></p>' +
          '<button type="button" class="slug-save-btn" id="slugSaveBtn" onclick="saveMySlug()" disabled>저장하기</button>' +
        '</div>';
    }
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    if (!existing) setTimeout(function() { var inp = document.getElementById('slugInput'); if (inp) inp.focus(); }, 80);
  };

  window.closeSlugSetting = function() {
    var overlay = document.getElementById('slugModalOverlay');
    if (overlay) overlay.remove();
    document.body.classList.remove('modal-open');
  };

  window.onSlugInput = function() {
    var inp = document.getElementById('slugInput');
    var checkBtn = document.getElementById('slugCheckBtn');
    var saveBtn = document.getElementById('slugSaveBtn');
    var hint = document.getElementById('slugHint');
    if (!inp || !checkBtn) return;
    var val = (inp.value || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (inp.value !== val) inp.value = val; // 자동 교정
    checkBtn.disabled = !_isValidSlug(val);
    if (saveBtn) saveBtn.disabled = true;
    if (hint) { hint.textContent = ''; hint.className = 'slug-hint'; }
  };

  window.checkSlugAvail = async function() {
    var inp = document.getElementById('slugInput');
    var hint = document.getElementById('slugHint');
    var saveBtn = document.getElementById('slugSaveBtn');
    var checkBtn = document.getElementById('slugCheckBtn');
    if (!inp) return;
    var val = (inp.value || '').toLowerCase().trim();
    if (!_isValidSlug(val)) return;
    if (!window.fb || !fb.currentUser) return;
    var user = fb.currentUser();
    if (!user) return;
    if (checkBtn) checkBtn.disabled = true;
    if (hint) { hint.textContent = '확인 중...'; hint.className = 'slug-hint'; }
    try {
      var existing = await _loadMySlug(user.uid);
      // 이미 아이디가 설정돼 있으면 변경 불가
      if (existing) {
        if (hint) { hint.textContent = '이미 아이디가 설정되어 있어요. 변경할 수 없어요.'; hint.className = 'slug-hint slug-hint--err'; }
        if (saveBtn) saveBtn.disabled = true;
        if (checkBtn) checkBtn.disabled = false;
        return;
      }
      var takenUid = await _slugToUid(val);
      if (takenUid) {
        if (hint) { hint.textContent = '이미 사용 중인 아이디예요.'; hint.className = 'slug-hint slug-hint--err'; }
        if (saveBtn) saveBtn.disabled = true;
      } else {
        if (hint) { hint.textContent = '사용할 수 있는 아이디예요!'; hint.className = 'slug-hint slug-hint--ok'; }
        if (saveBtn) saveBtn.disabled = false;
      }
    } catch (e) {
      if (hint) { hint.textContent = '확인에 실패했어요. 다시 시도해주세요.'; hint.className = 'slug-hint slug-hint--err'; }
    }
    if (checkBtn) checkBtn.disabled = false;
  };

  window.saveMySlug = async function() {
    var inp = document.getElementById('slugInput');
    var saveBtn = document.getElementById('slugSaveBtn');
    var hint = document.getElementById('slugHint');
    if (!inp) return;
    var val = (inp.value || '').toLowerCase().trim();
    if (!_isValidSlug(val)) return;
    if (!window.fb || !fb.currentUser) return;
    var user = fb.currentUser();
    if (!user) return;
    if (saveBtn) saveBtn.disabled = true;
    if (hint) { hint.textContent = '저장 중...'; hint.className = 'slug-hint'; }
    try {
      // 이미 아이디가 설정된 경우 변경 차단 (서버 측 이중 검증)
      var oldSlug = await _loadMySlug(user.uid);
      if (oldSlug) {
        if (hint) { hint.textContent = '이미 아이디가 설정되어 있어요. 변경할 수 없어요.'; hint.className = 'slug-hint slug-hint--err'; }
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
      await _saveMySlugData(user.uid, val);
      // editorProfiles에도 slug 저장 (공개 읽기 가능 — author.html URL 정규화에 사용)
      try {
        await fb.db.collection('editorProfiles').doc(user.uid).set({ slug: val }, { merge: true });
      } catch (e) { /* silent — editorProfile이 없을 수도 있음 */ }
      // 공개 서재가 켜져 있으면 스냅샷에도 slug 갱신
      try {
        var pubSnap = await fb.db.collection('publicProfiles').doc(user.uid).get();
        if (pubSnap.exists && pubSnap.data().public) {
          var name = (typeof getUserName === 'function' && getUserName()) || user.displayName || '독자';
          await fb.db.collection('publicProfiles').doc(user.uid).set(
            _buildLibrarySnapshot(user.uid, name, val), { merge: true }
          );
        }
      } catch (e) { /* silent */ }
      if (typeof showToast === 'function') showToast('@' + val + ' 아이디가 저장됐어요!');
      window.closeSlugSetting();
    } catch (err) {
      if (hint) { hint.textContent = '저장에 실패했어요. 다시 시도해주세요.'; hint.className = 'slug-hint slug-hint--err'; }
      if (saveBtn) saveBtn.disabled = false;
      console.warn('[slug save]', err.message);
    }
  };

  // 공개 서재 페이지(library.html) 렌더
  async function renderPublicLibrary() {
    const root = document.getElementById('libraryRoot');
    if (!root) return;
    const params = new URLSearchParams(location.search);
    let uid = params.get('u') || params.get('id') || '';
    const slugParam = params.get('s') || '';
    const showEmpty = (msg) => {
      root.innerHTML = '<div class="library-loading"><i class="fa-regular fa-face-frown"></i><p>' + escHTML(msg) + '</p>' +
        '<a class="mp-empty-btn" href="/">홈으로</a></div>';
    };
    // 슬러그 파라미터가 있으면 uid로 변환
    if (!uid && slugParam) {
      if (!window.fb || !fb.db) { showEmpty('서재를 불러올 수 없어요.'); return; }
      uid = await _slugToUid(slugParam) || '';
    }
    if (!uid) { showEmpty('잘못된 주소예요. 서재를 찾을 수 없습니다.'); return; }
    if (!window.fb || !fb.db) { showEmpty('서재를 불러올 수 없어요.'); return; }

    let p = null;
    try {
      const snap = await fb.db.collection('publicProfiles').doc(uid).get();
      if (snap.exists) p = snap.data();
    } catch (e) { /* 무시 */ }

    if (!p || !p.public) { showEmpty('아직 공개되지 않았거나 비공개로 전환된 서재예요.'); return; }

    const me = (window.fb && fb.currentUser) ? fb.currentUser() : null;
    const isMine = me && me.uid === uid;
    const stats = p.stats || {};
    const topCats = Array.isArray(p.topCats) ? p.topCats : [];
    const sentences = Array.isArray(p.sharedSentences) ? p.sharedSentences : [];
    const savedThumbs = Array.isArray(p.savedThumbs) ? p.savedThumbs.filter(s => s && (s.thumb || s.videoId)) : [];
    const initial = (String(p.handle || '독자').trim().charAt(0)) || '독';

    let html = '<div class="library-card">';

    // 헤더 — LOCALLAYERS 에디토리얼 스타일 (박스/그라데이션 제거, 타이포 중심)
    html += '<header class="library-head">';
    html += '<div class="library-eyebrow">LOCALLAYERS · READER LIBRARY</div>';
    html += '<h1 class="library-name">' + escHTML(p.handle || '독자') + '</h1>';
    if (p.bio) html += '<p class="library-bio">' + escHTML(p.bio) + '</p>';
    // 통계 — 인라인 스트립(구분선)
    html += '<div class="library-stats">';
    html += '<div class="library-stat"><b>' + (stats.reads || 0) + '</b><span>읽은 글</span></div>';
    html += '<div class="library-stat"><b>' + (stats.sentences || 0) + '</b><span>모은 문장</span></div>';
    html += '<div class="library-stat"><b>' + (stats.reactions || 0) + '</b><span>남긴 반응</span></div>';
    html += '</div>';
    html += '</header>';

    // 저장한 콘텐츠 — 랜덤 3개 썸네일 (북마크가 있을 때만)
    if (savedThumbs.length) {
      const pool = savedThumbs.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      const picks = pool.slice(0, 3);
      html += '<section class="library-block"><h2 class="library-h">저장한 콘텐츠</h2><div class="library-saved">';
      picks.forEach(s => {
        const thumb = s.thumb || (s.videoId ? ('https://img.youtube.com/vi/' + s.videoId + '/mqdefault.jpg') : '');
        const href = '/article.html?id=' + encodeURIComponent(s.id);
        html += '<a class="library-saved-item" href="' + href + '">' +
          (thumb
            ? '<span class="library-saved-thumb"><img src="' + escHTML(thumb) + '" alt="" loading="lazy" /></span>'
            : '<span class="library-saved-thumb library-saved-thumb--empty"><span>perspective</span></span>') +
          '<span class="library-saved-title">' + escHTML(s.title || '') + '</span></a>';
      });
      html += '</div></section>';
    }

    // 즐겨 읽는 주제 — 텍스트형 (뱃지 제거)
    if (topCats.length) {
      html += '<section class="library-block"><h2 class="library-h">즐겨 읽는 주제</h2><p class="library-cats-text">';
      const parts = [];
      topCats.forEach(c => {
        const label = (c && c.cat) ? c.cat : '';
        if (!label) return;
        const safe = (typeof _catLabel === 'function') ? _catLabel(label) : label;
        parts.push('<span class="library-cat-text">' + escHTML(safe) + '</span>');
      });
      html += parts.join('<span class="library-cat-dot">·</span>');
      html += '</p></section>';
    }

    // 공유 문장
    html += '<section class="library-block"><div class="library-h-row"><h2 class="library-h">서재에 모은 문장</h2>' +
      '<span class="library-h-count">' + sentences.length + '</span></div>';
    if (sentences.length) {
      html += '<div class="library-sentences">';
      sentences.forEach(s => {
        const text = (s && s.text) ? s.text : '';
        const title = (s && s.title) ? s.title : '';
        const aid = (s && s.articleId) ? s.articleId : '';
        if (!text) return;
        const src = title
          ? (aid
              ? '<a class="library-sentence-src" href="/article.html?id=' + encodeURIComponent(aid) + '">' + escHTML(title) + '</a>'
              : '<span class="library-sentence-src">' + escHTML(title) + '</span>')
          : '';
        html += '<figure class="library-sentence"><blockquote>' + escHTML(text) + '</blockquote>' +
          (src ? '<figcaption>' + src + '</figcaption>' : '') + '</figure>';
      });
      html += '</div>';
    } else {
      html += '<p class="library-empty-line">아직 공유된 문장이 없어요.</p>';
    }
    html += '</section>';

    // 본인이면 관리 안내
    if (isMine) {
      html += '<div class="library-owner-note"><i class="fa-solid fa-circle-info"></i> 내 서재예요. ' +
        '<a href="/mypage.html">나의 서재</a> 상단의 책갈피 아이콘에서 업데이트하거나 공개를 중지할 수 있어요.</div>';
    }

    html += '<div class="library-foot"><a class="library-cta" href="/">LOCALLAYERS에서 더 많은 글 만나기 →</a></div>';
    html += '</div>';
    root.innerHTML = html;

    // 페이지 제목 갱신
    try { document.title = (p.handle || '독자') + '님의 공개 서재 | LOCALLAYERS'; } catch (e) {}
  }
  window.renderPublicLibrary = renderPublicLibrary;

  /* ===========================================================
     #29 에디터 프로필 + 팔로우
     editorProfiles/{uid}: { uid, name, bio, public }
     editorProfiles/{uid}/followers/{followerUid}: { followerUid, createdAt }
     - 팔로우 상태 미러: users/{uid}.following (배열) — 마이페이지 '팔로잉' 목록용.
     - 공개 페이지: /author.html?id={editorUid}
     - 진입점: 아티클 작성자명 링크.
     =========================================================== */
  let _epState = { uid: '', following: false, count: 0, isOwner: false, name: '', bio: '', interests: [], seriesList: [], standalone: [] };
  let _epSeriesPage = 1, _epArtPage = 1;

  function _epArticleCard(a) {
    const cat = _catLabel(a.cat || a.category || '');
    const badge = a.videoMode ? '<div class="card-video-badge"><i class="fa-solid fa-play"></i></div>'
      : (a.podcastMode ? '<div class="card-audio-badge"><i class="fa-solid fa-microphone"></i></div>' : '');
    return `
      <article class="card" onclick="openCardVideo('${a.id}')">
        <div class="card-thumb"><img src="${escHTML(a.thumb || '')}" alt="${escHTML(a.title || '')}" loading="lazy" /></div>
        <div class="card-overlay"></div>
        ${badge}
        <div class="card-top"><span class="card-cat">${escHTML(cat)}</span></div>
        <div class="card-bottom">
          <h3 class="card-title">${escHTML(a.title || '')}</h3>
          <p class="card-sub">${escHTML(a.sub || '')}</p>
          <div class="card-meta">${escHTML(a.date || '')}</div>
        </div>
      </article>`;
  }

  async function renderEditorProfile() {
    const root = document.getElementById('editorProfileRoot');
    if (!root) return;
    const params = new URLSearchParams(location.search);
    let uid = params.get('id') || params.get('u') || '';
    const slugParam = params.get('s') || '';
    const showEmpty = (msg) => {
      root.innerHTML = '<div class="library-loading"><i class="fa-regular fa-face-frown"></i><p>' + escHTML(msg) + '</p>' +
        '<a class="mp-empty-btn" href="/">홈으로</a></div>';
    };
    if (!window.fb || !fb.db) { showEmpty('프로필을 불러올 수 없어요.'); return; }
    // 슬러그 파라미터가 있으면 uid로 변환
    if (!uid && slugParam) {
      uid = await _slugToUid(slugParam) || '';
    }
    if (!uid) { showEmpty('잘못된 주소예요. 에디터를 찾을 수 없습니다.'); return; }
    _epState.uid = uid;

    // 병렬 로드: 작성 글(authorId) / 프로필 문서 / 팔로워 / 내 팔로우 여부
    const me = (window.fb && fb.currentUser) ? fb.currentUser() : null;
    let arts = [], profile = null, followerCount = 0, iFollow = false;
    try {
      const [artSnap, profSnap, folSnap, myFolSnap] = await Promise.all([
        // status 필터를 쿼리에 포함 — 일반 독자도 PUBLISHED 쿼리는 허용됨(규칙 보장)
        fb.db.collection('articles').where('authorId', '==', uid).where('status', '==', 'PUBLISHED').get(),
        fb.db.collection('editorProfiles').doc(uid).get(),
        fb.db.collection('editorProfiles').doc(uid).collection('followers').get(),
        me ? fb.db.collection('editorProfiles').doc(uid).collection('followers').doc(me.uid).get() : Promise.resolve(null)
      ]);
      arts = artSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => _pubMs(b) - _pubMs(a));
      if (profSnap.exists) profile = profSnap.data();
      followerCount = folSnap.size;
      iFollow = !!(myFolSnap && myFolSnap.exists);
    } catch (e) {
      console.warn('[editor-profile]', e.message);
    }

    // publicProfiles 한 번 fetch → URL 정규화 + 이름 폴백 둘 다 활용
    let _pubData = null;
    try {
      const pubSnap2 = await fb.db.collection('publicProfiles').doc(uid).get();
      if (pubSnap2.exists) _pubData = pubSnap2.data();
    } catch (e) { /* silent */ }

    // uid로 접근했을 때 slug가 있으면 URL을 ?s= 형식으로 정규화
    if (!slugParam) {
      const resolvedSlug = (profile && profile.slug) || (_pubData && _pubData.slug) || '';
      if (resolvedSlug) {
        try { history.replaceState(null, '', '?s=' + encodeURIComponent(resolvedSlug)); } catch (e) {}
      }
    }

    // 이름: editorProfiles.name → 아티클 author → publicProfiles.handle → '에디터'
    const name = (profile && profile.name) || (arts[0] && arts[0].author) || (_pubData && _pubData.handle) || '에디터';
    const bio = (profile && profile.bio) || '';
    const interests = Array.isArray(profile && profile.interests)
      ? profile.interests.filter(t => t && String(t).trim()).map(t => String(t).trim())
      : ((profile && typeof profile.interests === 'string')
          ? profile.interests.split(',').map(s => s.trim()).filter(Boolean) : []);
    const isOwner = !!(me && me.uid === uid);
    _epState.following = iFollow;
    _epState.count = followerCount;
    _epState.isOwner = isOwner;
    _epState.name = name;
    _epState.bio = bio;
    _epState.interests = interests;

    // 시리즈 / 단독 아티클 분류
    const seriesMap = {}; const seriesOrder = []; const standalone = [];
    arts.forEach(a => {
      const sn = (a.seriesName || '').trim();
      if (sn) {
        if (!seriesMap[sn]) { seriesMap[sn] = []; seriesOrder.push(sn); }
        seriesMap[sn].push(a);
      } else {
        standalone.push(a);
      }
    });
    const seriesList = seriesOrder.map(sn => {
      const items = seriesMap[sn].slice().sort((x, y) => {
        const nx = x.seriesNo != null ? x.seriesNo : 9999;
        const ny = y.seriesNo != null ? y.seriesNo : 9999;
        return nx !== ny ? nx - ny : _pubMs(x) - _pubMs(y);
      });
      const cover = items[0] || {};
      return { name: sn, items: items, thumb: cover.thumb || cover.cover || '', cat: cover.cat || cover.category || '' };
    });
    _epState.seriesList = seriesList;
    _epState.standalone = standalone;
    _epSeriesPage = 1; _epArtPage = 1;

    const initial = (name || '?').trim().charAt(0) || '?';
    let html = '<div class="editor-card">';

    // 헤더 — 타이포 중심 에디토리얼 (설정 버튼 제거 — 내용 영역 클릭으로 편집)
    html += '<header class="editor-head">';
    html += '<div class="editor-eyebrow">LOCALLAYERS EDITOR</div>';
    html += '<div class="editor-name-row">';
    html += '<h1 class="editor-name">' + escHTML(name) + '</h1>';
    html += '</div>';
    if (bio) {
      if (isOwner) {
        html += '<p class="editor-bio editor-bio--editable" onclick="openEditorProfileEdit()" title="클릭해서 수정">' +
          escHTML(bio) + '<span class="editor-edit-icon"><i class="fa-solid fa-pen"></i></span></p>';
      } else {
        html += '<p class="editor-bio">' + escHTML(bio) + '</p>';
      }
    } else if (isOwner) {
      html += '<p class="editor-bio editor-bio--ph" onclick="openEditorProfileEdit()">한 줄 소개를 입력해보세요.</p>';
    }
    if (interests.length) {
      if (isOwner) {
        html += '<div class="editor-interests editor-interests--editable" onclick="openEditorProfileEdit()" title="클릭해서 수정">' +
          interests.map((t, i) => (i ? '<span class="editor-interest-dot">·</span>' : '') + '<span class="editor-interest">' + escHTML(t) + '</span>').join('') +
          '<span class="editor-edit-icon"><i class="fa-solid fa-pen"></i></span></div>';
      } else {
        html += '<div class="editor-interests">' +
          interests.map((t, i) => (i ? '<span class="editor-interest-dot">·</span>' : '') + '<span class="editor-interest">' + escHTML(t) + '</span>').join('') +
          '</div>';
      }
    } else if (isOwner) {
      html += '<div class="editor-interests editor-interests--ph" onclick="openEditorProfileEdit()">관심사 태그를 추가해보세요.</div>';
    }
    html += '<div class="editor-meta">';
    if (seriesList.length) {
      html += '<span class="editor-meta-item"><b>' + seriesList.length + '</b>개 시리즈</span>';
      html += '<span class="editor-meta-sep">·</span>';
    }
    html += '<span class="editor-meta-item"><b>' + arts.length + '</b>편의 아티클</span>';
    html += '<span class="editor-meta-sep">·</span>';
    html += '<span class="editor-meta-item"><b id="epFollowerCount">' + followerCount + '</b> 팔로워</span>';
    html += '</div>';
    if (!isOwner) {
      html += '<button type="button" id="epFollowBtn" class="editor-follow-btn' + (iFollow ? ' following' : '') + '" onclick="toggleFollowEditor()">' +
        (iFollow ? '<i class="fa-solid fa-check"></i> 팔로잉' : '<i class="fa-solid fa-plus"></i> 팔로우') + '</button>';
    }
    html += '</header>';
    html += '<div class="editor-divider"></div>';

    // 발행한 시리즈 / 발행한 아티클 — 섹션 컨테이너
    html += '<div id="epSections"></div>';

    html += '</div>';
    root.innerHTML = html;

    _epRenderSections();

    try { document.title = name + ' · 에디터 | LOCALLAYERS'; } catch (e) {}
  }
  window.renderEditorProfile = renderEditorProfile;

  const _EP_PER_PAGE = 6;

  function _epPagedGrid(items, page, kind, cardFn) {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / _EP_PER_PAGE));
    const cur = Math.min(Math.max(1, page), pages);
    const start = (cur - 1) * _EP_PER_PAGE;
    const slice = items.slice(start, start + _EP_PER_PAGE);
    let h = '<div class="article-grid ep-grid">' + slice.map(cardFn).join('') + '</div>';
    if (pages > 1) {
      const gotoFn = kind === 'series' ? 'epSeriesGoto' : 'epArtGoto';
      h += '<div class="ep-pager">';
      h += '<button type="button" class="ep-pg-btn" ' + (cur <= 1 ? 'disabled' : '') + ' onclick="' + gotoFn + '(' + (cur - 1) + ')"><i class="fa-solid fa-chevron-left"></i></button>';
      h += '<span class="ep-pg-info">' + cur + ' / ' + pages + '</span>';
      h += '<button type="button" class="ep-pg-btn" ' + (cur >= pages ? 'disabled' : '') + ' onclick="' + gotoFn + '(' + (cur + 1) + ')"><i class="fa-solid fa-chevron-right"></i></button>';
      h += '</div>';
    }
    return h;
  }

  function _epSeriesCard(s) {
    const cat = _catLabel(s.cat || '');
    return `
      <article class="ep-series-box" onclick="openEpSeries('${encodeURIComponent(s.name)}')">
        <div class="ep-series-box-top">
          <span class="ep-series-eyebrow">SERIES</span>
          ${cat ? `<span class="ep-series-box-cat">${escHTML(cat)}</span>` : ''}
        </div>
        <h3 class="ep-series-box-title">${escHTML(s.name || '')}</h3>
        <div class="ep-series-box-foot">
          <span class="ep-series-box-count"><b>${s.items.length}</b>편의 아티클</span>
          <span class="ep-series-box-go">모아보기 <i class="fa-solid fa-arrow-right"></i></span>
        </div>
      </article>`;
  }

  function _epRenderSections() {
    const wrap = document.getElementById('epSections');
    if (!wrap) return;
    const seriesList = _epState.seriesList || [];
    const standalone = _epState.standalone || [];
    let h = '';
    if (seriesList.length) {
      h += '<div class="editor-block"><h2 class="library-h">발행한 시리즈 <span class="library-h-count">' + seriesList.length + '</span></h2>';
      h += _epPagedGrid(seriesList, _epSeriesPage, 'series', _epSeriesCard);
      h += '</div>';
    }
    if (standalone.length) {
      h += '<div class="editor-block"><h2 class="library-h">발행한 아티클 <span class="library-h-count">' + standalone.length + '</span></h2>';
      h += _epPagedGrid(standalone, _epArtPage, 'art', _epArticleCard);
      h += '</div>';
    }
    if (!seriesList.length && !standalone.length) {
      h += '<p class="library-empty-line">아직 발행한 글이 없어요.</p>';
    }
    wrap.innerHTML = h;
  }

  window.epSeriesGoto = function(n) {
    _epSeriesPage = n;
    _epRenderSections();
    const el = document.getElementById('epSections');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  window.epArtGoto = function(n) {
    _epArtPage = n;
    _epRenderSections();
    const el = document.getElementById('epSections');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 시리즈 모달 — 후속 아티클 리스트
  window.openEpSeries = function(enc) {
    let name = '';
    try { name = decodeURIComponent(enc); } catch (e) { name = enc || ''; }
    const series = (_epState.seriesList || []).find(s => s.name === name);
    if (!series) return;
    const old = document.querySelector('.ep-series-modal');
    if (old) old.remove();

    const items = series.items || [];
    let body = '';
    items.forEach(a => {
      const no = (a.seriesNo != null) ? a.seriesNo : '';
      body += '<a class="ep-sm-item" href="/article.html?id=' + encodeURIComponent(a.id) + '">';
      body += '<span class="ep-sm-no">' + (no !== '' ? ('#' + no) : '·') + '</span>';
      body += '<span class="ep-sm-thumb"><img src="' + escHTML(a.thumb || a.cover || '') + '" alt="" loading="lazy" /></span>';
      body += '<span class="ep-sm-body">';
      body += '<span class="ep-sm-title">' + escHTML(a.title || '') + '</span>';
      body += '<span class="ep-sm-date">' + escHTML(a.date || '') + '</span>';
      body += '</span>';
      body += '<span class="ep-sm-go"><i class="fa-solid fa-arrow-right"></i></span>';
      body += '</a>';
    });

    const overlay = document.createElement('div');
    overlay.className = 'ep-series-modal';
    overlay.innerHTML =
      '<div class="ep-sm-inner" role="dialog" aria-modal="true">' +
        '<button type="button" class="ep-sm-close" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>' +
        '<div class="ep-sm-tag">SERIES</div>' +
        '<h3 class="ep-sm-h">' + escHTML(name) + '</h3>' +
        '<p class="ep-sm-sub"><b>' + items.length + '</b>편의 아티클</p>' +
        '<div class="ep-sm-list">' + body + '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    const close = () => { overlay.remove(); document.body.style.overflow = ''; };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const cbtn = overlay.querySelector('.ep-sm-close');
    if (cbtn) cbtn.addEventListener('click', close);
    requestAnimationFrame(() => overlay.classList.add('show'));
  };

  // 팔로우 토글 — 로그인 회원만. 팔로워 문서 생성/삭제 + 내 users.following 미러.
  window.toggleFollowEditor = async function() {
    const uid = _epState.uid;
    if (!uid || !window.fb) return;
    const me = fb.currentUser();
    if (!me) {
      if (typeof showToast === 'function') showToast('팔로우는 로그인 후 가능해요.');
      if (typeof openLogin === 'function') openLogin();
      return;
    }
    if (me.uid === uid) { if (typeof showToast === 'function') showToast('자기 자신은 팔로우할 수 없어요.'); return; }

    const wasFollowing = _epState.following;
    // 낙관적 UI
    _epState.following = !wasFollowing;
    _epState.count = Math.max(0, _epState.count + (wasFollowing ? -1 : 1));
    const btn = document.getElementById('epFollowBtn');
    const cntEl = document.getElementById('epFollowerCount');
    if (btn) {
      btn.classList.toggle('following', _epState.following);
      btn.innerHTML = _epState.following ? '<i class="fa-solid fa-check"></i> 팔로잉' : '<i class="fa-solid fa-plus"></i> 팔로우';
    }
    if (cntEl) cntEl.textContent = String(_epState.count);

    const folRef = fb.db.collection('editorProfiles').doc(uid).collection('followers').doc(me.uid);
    try {
      if (wasFollowing) {
        await folRef.delete();
        await fb.userRef(me.uid).set({ following: fb.FieldValue.arrayRemove(uid) }, { merge: true });
      } else {
        await folRef.set({ followerUid: me.uid, createdAt: fb.FieldValue.serverTimestamp() });
        await fb.userRef(me.uid).set({ following: fb.FieldValue.arrayUnion(uid) }, { merge: true });
        if (typeof showToast === 'function') showToast('팔로우했어요. 나의 서재에서 모아볼 수 있어요.');
      }
    } catch (err) {
      // 롤백
      _epState.following = wasFollowing;
      _epState.count = Math.max(0, _epState.count + (wasFollowing ? 1 : -1));
      if (btn) {
        btn.classList.toggle('following', _epState.following);
        btn.innerHTML = _epState.following ? '<i class="fa-solid fa-check"></i> 팔로잉' : '<i class="fa-solid fa-plus"></i> 팔로우';
      }
      if (cntEl) cntEl.textContent = String(_epState.count);
      if (typeof showToast === 'function') showToast('처리에 실패했어요.');
      console.warn('[follow-editor]', err.message);
    }
  };

  // 에디터 본인 프로필 편집 — 한 줄 소개(bio) + 관심사 태그(interests). 본인만 호출 가능.
  window.openEditorProfileEdit = function() {
    const uid = _epState.uid;
    const me = (window.fb && fb.currentUser) ? fb.currentUser() : null;
    if (!me || me.uid !== uid) return;
    const curBio = _epState.bio || '';
    const curInterests = (_epState.interests || []).join(', ');
    const body =
      '<div class="ep-edit-field">' +
        '<label class="ep-edit-label" for="epEditBio">한 줄 소개 <span class="ep-edit-hint">엔터로 줄바꿈(최대 2줄)</span></label>' +
        '<textarea id="epEditBio" class="sys-prompt-input ep-edit-input ep-edit-textarea" maxlength="80" rows="2" ' +
          'placeholder="예: 일상의 작은 관점을 수집합니다." ' +
          'onkeydown="_epBioKey(event, this)" oninput="_epBioLimit(this)">' + escHTML(curBio) + '</textarea>' +
      '</div>' +
      '<div class="ep-edit-field">' +
        '<label class="ep-edit-label" for="epEditInterests">관심사 태그 <span class="ep-edit-hint">쉼표(,)로 구분</span></label>' +
        '<input type="text" id="epEditInterests" class="sys-prompt-input ep-edit-input" maxlength="120" ' +
          'placeholder="예: 공간, 카페, 여행, 로컬" value="' + escHTML(curInterests) + '" />' +
      '</div>';
    openConfirm({
      title: '프로필 편집',
      msg: body,
      confirmText: '저장',
      cancelText: '취소',
      onConfirm: () => { _saveEditorProfile(); }
    });
    setTimeout(() => { const el = document.getElementById('epEditBio'); if (el) { el.focus(); el.select(); } }, 30);
  };

  // 한 줄 소개 입력 — 엔터 줄바꿈 허용하되 최대 2줄까지만.
  window._epBioKey = function(e, el) {
    if (e && e.key === 'Enter' && el) {
      const lines = (el.value || '').split('\n');
      if (lines.length >= 2) e.preventDefault();   // 이미 2줄이면 새 줄 차단
    }
  };
  window._epBioLimit = function(el) {
    if (!el) return;
    const lines = (el.value || '').split('\n');
    if (lines.length > 2) el.value = lines.slice(0, 2).join('\n');
  };

  async function _saveEditorProfile() {
    const uid = _epState.uid;
    const me = (window.fb && fb.currentUser) ? fb.currentUser() : null;
    if (!me || me.uid !== uid || !fb.db) return;
    const bioEl = document.getElementById('epEditBio');
    const intEl = document.getElementById('epEditInterests');
    const bio = bioEl ? bioEl.value.trim() : (_epState.bio || '');
    const interests = (intEl ? intEl.value : (_epState.interests || []).join(','))
      .split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
    // 낙관적 UI
    _epState.bio = bio;
    _epState.interests = interests;
    try {
      await fb.db.collection('editorProfiles').doc(uid).set({
        uid: uid,
        name: _epState.name || (me.displayName || '에디터'),
        bio: bio,
        interests: interests,
        public: true,
        updatedAt: fb.FieldValue.serverTimestamp()
      }, { merge: true });
      if (typeof showToast === 'function') showToast('프로필을 저장했어요.');
      if (typeof renderEditorProfile === 'function') renderEditorProfile();
    } catch (err) {
      if (typeof showToast === 'function') showToast('저장에 실패했어요.');
      console.warn('[editor-profile-save]', err.message);
    }
  }

  // 마이페이지 '팔로잉' — 내가 팔로우한 에디터 목록(users.following) + 각 에디터 최신 글.
  async function renderMyFollowing() {
    const grid = document.getElementById('mpFollowingItems');
    const empty = document.getElementById('mpFollowingEmpty');
    const countEl = document.getElementById('mpCountFollowing');
    if (!grid || !empty) return;
    const me = (window.fb && fb.currentUser) ? fb.currentUser() : null;
    if (!me) {
      grid.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      empty.style.display = 'block';
      empty.innerHTML =
        '<div class="empty-mark"><i class="fa-regular fa-user"></i></div>' +
        '<p>로그인 후 팔로우한 에디터를 볼 수 있어요.</p>' +
        '<button class="mp-empty-btn" onclick="openLogin()">로그인</button>';
      return;
    }
    let following = [];
    try {
      const snap = await fb.userRef(me.uid).get();
      const arr = snap.exists && snap.data().following;
      if (Array.isArray(arr)) following = arr;
    } catch (e) { /* 무시 */ }

    if (!following.length) {
      grid.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      empty.style.display = 'block';
      empty.innerHTML =
        '<div class="empty-mark"><i class="fa-regular fa-user"></i></div>' +
        '<p>아직 팔로우한 에디터가 없어요.</p>' +
        '<p class="mp-empty-sub">아티클의 작성자 이름을 눌러 에디터 프로필에서 팔로우해보세요.</p>' +
        '<button class="mp-empty-btn" onclick="showHome()">홈에서 글 둘러보기</button>';
      return;
    }
    if (countEl) countEl.textContent = String(following.length);
    empty.style.display = 'none';

    // 각 에디터: 프로필 카드 (이름 + 팔로워 수 + 소개 + 아티클 수 + 팔로잉 뱃지)
    const cards = await Promise.all(following.map(async (uid) => {
      let name = '', bio = '', artCount = 0, followerCount = 0, edSlug = '';
      try {
        const [profSnap, artSnap, pubSnap, folSnap] = await Promise.all([
          fb.db.collection('editorProfiles').doc(uid).get(),
          fb.db.collection('articles').where('authorId', '==', uid).where('status', '==', 'PUBLISHED').get(),
          fb.db.collection('publicProfiles').doc(uid).get(),
          fb.db.collection('editorProfiles').doc(uid).collection('followers').get()
        ]);
        const profData = profSnap.exists ? profSnap.data() : null;
        const pubData  = pubSnap.exists  ? pubSnap.data()  : null;
        const arts = artSnap.docs.map(d => d.data());
        name          = (profData && profData.name) || (arts[0] && arts[0].author) || (pubData && pubData.handle) || '';
        bio           = (profData && profData.bio)  || '';
        artCount      = arts.length;
        followerCount = folSnap.size;
        edSlug        = (profData && profData.slug) || (pubData && pubData.slug) || '';
      } catch (e) { /* 무시 */ }
      if (!name) name = '에디터';
      const authorUrl = '/author.html?' + (edSlug ? 's=' + encodeURIComponent(edSlug) : 'id=' + encodeURIComponent(uid));
      const safeUid = uid.replace(/'/g, "\\'");
      return `
        <div class="mp-follow-card" data-uid="${escHTML(uid)}" onclick="location.href='${authorUrl}'" role="link" tabindex="0">
          <div class="mp-fc-name-row">
            <span class="mp-fc-name">${escHTML(name)}</span>
            <button class="mp-fc-badge" type="button"
              onclick="event.stopPropagation(); unfollowEditorFromList('${safeUid}', this)">팔로잉</button>
          </div>
          <div class="mp-fc-followers">${followerCount}명이 팔로잉</div>
          ${bio ? `<div class="mp-fc-bio">${escHTML(bio)}</div>` : ''}
          <div class="mp-fc-foot">
            <span class="mp-fc-count"><b>${artCount}</b>편의 아티클</span>
            <span class="mp-fc-go"><i class="fa-solid fa-arrow-right"></i></span>
          </div>
        </div>`;
    }));
    grid.innerHTML = cards.join('');
  }
  window.renderMyFollowing = renderMyFollowing;

  // 팔로잉 카드에서 언팔로우
  window.unfollowEditorFromList = async function(uid, btn) {
    if (!window.fb || !fb.currentUser) return;
    const me = fb.currentUser();
    if (!me) return;

    // 확인 모달
    const confirmed = await new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'mp-unfollow-ov';
      ov.innerHTML =
        '<div class="mp-unfollow-box">' +
          '<p class="mp-unfollow-msg">팔로잉을 취소할까요?</p>' +
          '<div class="mp-unfollow-btns">' +
            '<button class="mp-unfollow-cancel" type="button">취소</button>' +
            '<button class="mp-unfollow-ok" type="button">팔로잉 취소</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.querySelector('.mp-unfollow-cancel').onclick = () => { ov.remove(); resolve(false); };
      ov.querySelector('.mp-unfollow-ok').onclick     = () => { ov.remove(); resolve(true); };
      ov.onclick = e => { if (e.target === ov) { ov.remove(); resolve(false); } };
    });
    if (!confirmed) return;

    btn.disabled = true;
    try {
      await fb.db.collection('editorProfiles').doc(uid).collection('followers').doc(me.uid).delete();
      await fb.userRef(me.uid).set({ following: fb.FieldValue.arrayRemove(uid) }, { merge: true });
      // 카드 페이드아웃 후 제거
      const card = btn.closest('.mp-follow-card');
      if (card) {
        card.style.transition = 'opacity .2s, transform .2s';
        card.style.opacity = '0'; card.style.transform = 'scale(.96)';
        setTimeout(() => {
          card.remove();
          const countEl = document.getElementById('mpCountFollowing');
          if (countEl) countEl.textContent = String(Math.max(0, parseInt(countEl.textContent || '0') - 1));
          const grid2 = document.getElementById('mpFollowingItems');
          const empty2 = document.getElementById('mpFollowingEmpty');
          if (grid2 && empty2 && grid2.children.length === 0) {
            empty2.style.display = 'block';
            empty2.innerHTML =
              '<div class="empty-mark"><i class="fa-regular fa-user"></i></div>' +
              '<p>아직 팔로우한 에디터가 없어요.</p>' +
              '<p class="mp-empty-sub">아티클의 작성자 이름을 눌러 에디터 프로필에서 팔로우해보세요.</p>' +
              '<button class="mp-empty-btn" onclick="showHome()">홈에서 글 둘러보기</button>';
          }
        }, 220);
      }
    } catch (e) {
      btn.disabled = false;
      if (typeof showToast === 'function') showToast('처리에 실패했어요. 다시 시도해주세요.');
    }
  };

  // 나의 오피니언 — 내가 댓글을 남긴 오피니언 토픽 모음
  let _myOpinionsLoading = false;
  let _myOpinionsData = [];        // 로드된 토픽 목록(토글/페이지네이션 재렌더용)
  let _myOpState = {};             // topicId -> { open: bool, page: number }
  const _MYOP_PER_PAGE = 5;        // 토픽별 내 의견 5개씩
  async function renderMyOpinions() {
    const grid = document.getElementById('mpOpinionsItems');
    const empty = document.getElementById('mpOpinionsEmpty');
    const countEl = document.getElementById('mpCountOpinions');
    if (!grid || !empty) return; // 마이페이지가 아니면 스킵

    const user = window.fb && fb.currentUser();
    if (!user) {
      grid.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      empty.style.display = 'block';
      empty.innerHTML =
        '<div class="empty-mark"><i class="fa-regular fa-comments"></i></div>' +
        '<p>로그인 후 참여한 오피니언을 볼 수 있어요.</p>' +
        '<p class="mp-empty-sub">오피니언 라운지에서 의견을 남겨보세요.</p>' +
        '<button class="mp-empty-btn" onclick="openLogin()">로그인</button>';
      return;
    }
    if (_myOpinionsLoading) return;
    _myOpinionsLoading = true;
    try {
      const snap = await fb.db.collection('opinions').get();
      const now = Date.now();
      const mine = [];
      await Promise.all(snap.docs.map(async d => {
        try {
          const cs = await d.ref.collection('comments').where('userId', '==', user.uid).get();
          if (cs.empty) return;
          let lastMs = 0;
          const myComments = [];
          cs.docs.forEach(cd => {
            const cdata = cd.data();
            const ts = cdata.createdAt;
            const ms = (ts && ts.toDate) ? ts.toDate().getTime() : 0;
            if (ms > lastMs) lastMs = ms;
            myComments.push({
              text: cdata.text || '',
              ms,
              featured: !!cdata.featured,
              insightNote: cdata.insightNote || '',
              likeCount: (typeof cdata.likeCount === 'number' && cdata.likeCount > 0) ? cdata.likeCount : 0
            });
          });
          myComments.sort((a, b) => b.ms - a.ms); // 최신 댓글 먼저
          const data = d.data();
          const st = _omStatusOf(data, now);
          mine.push({
            id: d.id,
            title: data.title || '(제목 없음)',
            description: data.description || '',
            myCount: cs.size,
            comments: myComments,
            lastMs,
            status: st.status,
            endDate: (data.endAt && data.endAt.toDate) ? data.endAt.toDate() : null
          });
        } catch (e) { /* 개별 토픽 실패는 무시 */ }
      }));

      if (countEl) countEl.textContent = String(mine.length);

      if (mine.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        empty.innerHTML =
          '<div class="empty-mark"><i class="fa-regular fa-comments"></i></div>' +
          '<p>아직 참여한 오피니언이 없습니다.</p>' +
          '<p class="mp-empty-sub">오피니언 라운지에서 의견을 남기면<br/>여기에 모아 보여드립니다.</p>' +
          '<button class="mp-empty-btn" onclick="location.href=\'/opinion-lounge.html\'">오피니언 라운지 가기</button>';
        return;
      }

      // 정렬: 진행 중 → 예정 → 종료, 같은 상태면 최근 참여 순
      const rank = { active: 0, pending: 1, expired: 2, inactive: 2 };
      mine.sort((a, b) => {
        const r = (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
        return r !== 0 ? r : (b.lastMs - a.lastMs);
      });

      empty.style.display = 'none';
      _myOpinionsData = mine;
      _renderMyOpinionsList();
    } catch (err) {
      console.warn('[mypage] renderMyOpinions:', err.message);
    } finally {
      _myOpinionsLoading = false;
    }
  }
  window.renderMyOpinions = renderMyOpinions;

  function _myOpinionCommentHTML(c) {
    const when = c.ms ? _fmtOpinionDateShort(new Date(c.ms)) : '';
    const insightBadge = c.featured
      ? '<span class="mp-op-insight-badge"><i class="fa-solid fa-star"></i>에디터 인사이트</span>'
      : '';
    const insightNote = (c.featured && c.insightNote)
      ? `<div class="mp-op-insight-note"><i class="fa-solid fa-quote-left"></i>${escHTML(c.insightNote)}</div>`
      : '';
    const likeChip = c.likeCount > 0
      ? `<span class="mp-oplist-comment-like"><i class="fa-solid fa-thumbs-up"></i>${c.likeCount}</span>`
      : '';
    return `
      <div class="mp-oplist-comment${c.featured ? ' is-insight' : ''}">
        ${insightBadge}
        <p class="mp-oplist-comment-text">${escHTML(c.text)}</p>
        ${insightNote}
        <div class="mp-oplist-comment-foot">
          ${when ? `<span class="mp-oplist-comment-date"><i class="fa-regular fa-clock"></i>${escHTML(when)}</span>` : '<span></span>'}
          ${likeChip}
        </div>
      </div>`;
  }

  function _renderMyOpinionsList() {
    const grid = document.getElementById('mpOpinionsItems');
    if (!grid) return;
    grid.innerHTML = (_myOpinionsData || []).map(t => {
      let badgeCls = 'mp-op-expired', badgeTxt = '종료';
      if (t.status === 'active') { badgeCls = 'mp-op-active'; badgeTxt = '진행 중'; }
      else if (t.status === 'pending') { badgeCls = 'mp-op-pending'; badgeTxt = '예정'; }
      const st = _myOpState[t.id] || { open: false, page: 1 };
      const comments = t.comments || [];
      const total = comments.length;
      const pages = Math.max(1, Math.ceil(total / _MYOP_PER_PAGE));
      const cur = Math.min(Math.max(1, st.page || 1), pages);
      const hasInsight = comments.some(c => c.featured);
      const insightTag = hasInsight
        ? '<span class="mp-op-insight-tag"><i class="fa-solid fa-star"></i>인사이트</span>'
        : '';

      let body = '';
      if (st.open) {
        const slice = comments.slice((cur - 1) * _MYOP_PER_PAGE, cur * _MYOP_PER_PAGE);
        let pager = '';
        if (pages > 1) {
          pager = '<div class="mp-op-pager">'
            + `<button type="button" class="mp-op-pg-btn" ${cur <= 1 ? 'disabled' : ''} onclick="myOpinionGoto('${t.id}', ${cur - 1})"><i class="fa-solid fa-chevron-left"></i></button>`
            + `<span class="mp-op-pg-info">${cur} / ${pages}</span>`
            + `<button type="button" class="mp-op-pg-btn" ${cur >= pages ? 'disabled' : ''} onclick="myOpinionGoto('${t.id}', ${cur + 1})"><i class="fa-solid fa-chevron-right"></i></button>`
            + '</div>';
        }
        body = `<div class="mp-oplist-comments">${slice.map(_myOpinionCommentHTML).join('')}${pager}`
          + `<a class="mp-oplist-visit" href="/opinion.html?id=${encodeURIComponent(t.id)}">오피니언에서 보기 <i class="fa-solid fa-arrow-right"></i></a>`
          + '</div>';
      }

      return `
        <div class="mp-oplist-item${st.open ? ' is-open' : ''}">
          <button type="button" class="mp-oplist-head" onclick="toggleMyOpinion('${t.id}')" aria-expanded="${st.open ? 'true' : 'false'}">
            <span class="mp-op-badge ${badgeCls}">${badgeTxt}</span>
            <span class="mp-oplist-title">${escHTML(t.title)}</span>
            ${insightTag}
            <span class="mp-oplist-count"><i class="fa-regular fa-comment-dots"></i>${t.myCount}</span>
            <span class="mp-oplist-toggle"><i class="fa-solid fa-chevron-down"></i></span>
          </button>
          ${body}
        </div>`;
    }).join('');
  }

  window.toggleMyOpinion = function(id) {
    const st = _myOpState[id] || { open: false, page: 1 };
    st.open = !st.open;
    if (!st.page) st.page = 1;
    _myOpState[id] = st;
    _renderMyOpinionsList();
  };
  window.myOpinionGoto = function(id, n) {
    const st = _myOpState[id] || { open: true, page: 1 };
    st.open = true;
    st.page = n;
    _myOpState[id] = st;
    _renderMyOpinionsList();
  };

  const REACTION_LABELS = {
    'new':  { label: '이 관점이 새로웠어요', desc: '새로운 시선을 발견했을 때' },
    'deep': { label: '더 깊이 알고 싶어요', desc: '다음을 궁금하게 한 글' },
    'pass': { label: '친구에게 보내고 싶어요', desc: '누군가에게 공유한 글' }
  };
  let _reactionGroups = { new: [], deep: [], pass: [] };
  let _reactionSel = 'new';
  function renderMyReactions() {
    const r = getReactions();
    const keys = Object.keys(r);
    const grid = document.getElementById('mpReactionsItems');
    const empty = document.getElementById('mpReactionsEmpty');
    const _prune = _fsArticlesLoaded;
    const _avail = _availableArticleIds();

    // Group by reaction type — 삭제/숨김된 글은 차감
    const groups = { new: [], deep: [], pass: [] };
    keys.forEach(key => {
      const m = key.match(/^(.+)-(new|deep|pass)$/);
      if (!m) return;
      const articleId = m[1];
      const type = m[2];
      if (!groups[type]) return;
      if (_prune ? _avail.has(articleId) : !!_lookupArticle(articleId)) {
        groups[type].push(articleId);
      }
    });
    const totalReactions = groups.new.length + groups.deep.length + groups.pass.length;
    document.getElementById('mpCountReactions').textContent = totalReactions;
    if (totalReactions === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    _reactionGroups = groups;
    // 선택 유지하되, 비어 있으면 항목이 있는 첫 그룹으로 이동
    if (!groups[_reactionSel] || groups[_reactionSel].length === 0) {
      _reactionSel = ['new', 'deep', 'pass'].find(t => groups[t].length > 0) || 'new';
    }

    // 상단: 반응 3종 카드 [ ][ ][ ]
    const cardsHTML = ['new', 'deep', 'pass'].map(type => {
      const meta = REACTION_LABELS[type];
      const n = groups[type].length;
      return `
        <button type="button" class="mp-react-card${type === _reactionSel ? ' active' : ''}${n === 0 ? ' is-empty' : ''}" data-rtype="${type}" onclick="selectReactionType('${type}')">
          <span class="mp-react-card-count">${n}<span class="mp-react-card-unit">회</span></span>
          <span class="mp-react-card-label">${meta.label}</span>
          <span class="mp-react-card-desc">${meta.desc}</span>
        </button>`;
    }).join('');

    grid.innerHTML = `<div class="mp-react-cards">${cardsHTML}</div><div class="mp-react-list" id="mpReactList"></div>`;
    _renderReactionList();
  }
  // 선택된 반응 유형의 글 목록을 하단 리스트로 렌더
  function _renderReactionList() {
    const list = document.getElementById('mpReactList');
    if (!list) return;
    const ids = _reactionGroups[_reactionSel] || [];
    if (ids.length === 0) {
      list.innerHTML = `<div class="rg-empty">아직 이 반응을 남긴 글이 없어요.</div>`;
      return;
    }
    list.innerHTML = ids.map(id => {
      const a = _lookupArticle(id);
      if (!a) return '';
      return `
        <div class="rg-item" onclick="openCardVideo('${id}')">
          <span class="rg-item-date">${escHTML(a.date || '')}</span>
          <span class="rg-item-title">${escHTML(a.title || '')}</span>
          <span class="rg-item-arrow">→</span>
        </div>`;
    }).join('');
  }
  function selectReactionType(type) {
    if (!_reactionGroups[type]) return;
    _reactionSel = type;
    document.querySelectorAll('.mp-react-card').forEach(c => {
      c.classList.toggle('active', c.dataset.rtype === type);
    });
    _renderReactionList();
  }
  window.selectReactionType = selectReactionType;
  function deleteSentence(idx) {
    const arr = getSentences();
    const item = arr[idx];
    if (!item) return;
    const preview = item.text.length > 50 ? item.text.substring(0, 50) + '…' : item.text;
    openConfirm({
      title: '문장 삭제',
      msg: `<em style="color:var(--muted);font-style:normal;">"${escHTML(preview)}"</em><br/><br/>이 문장을 정말 삭제할까요?`,
      confirmText: '삭제',
      onConfirm: () => {
        const updated = getSentences();
        const removed = updated.splice(idx, 1)[0];
        if (removed) addSentenceTomb(removed); // 삭제 묘비 기록(동기화 부활 방지)
        saveSentences(updated);
        renderMyPage();
        if (removed?.articleId) applyCollectedHighlights(removed.articleId);
        showToast('수집한 문장을 삭제했어요.');
      }
    });
  }
  // Alias for existing showView('saved') etc — renderSaved is now renderMyPage
  function renderSaved() { renderMyPage(); }

  /* ===== Bottom BACK button (injected on article view) ===== */
  function injectBottomBack(articleEl) {
    if (!articleEl) return;
    if (articleEl.querySelector('.article-back-bottom')) return;
    const section = document.createElement('section');
    section.className = 'article-back-bottom';
    section.innerHTML = `
      <div class="container">
        <a href="#" class="back-btn back-btn-bottom" onclick="showHome(); return false;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          BACK
        </a>
      </div>`;
    articleEl.appendChild(section);
  }

  /* ===== Collected sentence highlights ===== */
  function clearHighlights(articleEl) {
    if (!articleEl) return;
    articleEl.querySelectorAll('mark.collected-mark').forEach(m => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
  }
  function highlightTextIn(root, searchText) {
    const clean = (searchText || '').trim();
    if (!clean || clean.length < 4) return;
    // Build flexible regex — collapse any whitespace in needle to \s+ so HTML
    // indentation/newlines don't break the match.
    const escaped = clean.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const pattern = escaped.replace(/\s+/g, '\\s+');
    let regex;
    try { regex = new RegExp(pattern, 'g'); } catch(e) { return; }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        if (n.parentElement?.closest('mark.collected-mark')) return NodeFilter.FILTER_REJECT;
        if (n.parentElement?.closest('script, style')) return NodeFilter.FILTER_REJECT;
        regex.lastIndex = 0;
        return regex.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const targets = [];
    let n; while ((n = walker.nextNode())) targets.push(n);

    targets.forEach(node => {
      const text = node.nodeValue;
      regex.lastIndex = 0;
      const fragments = [];
      let lastIdx = 0;
      let m;
      while ((m = regex.exec(text)) !== null) {
        if (m.index > lastIdx) {
          fragments.push(document.createTextNode(text.substring(lastIdx, m.index)));
        }
        const mark = document.createElement('mark');
        mark.className = 'collected-mark';
        mark.textContent = m[0];
        fragments.push(mark);
        lastIdx = m.index + m[0].length;
        if (regex.lastIndex === m.index) regex.lastIndex++;
      }
      if (fragments.length === 0) return;
      if (lastIdx < text.length) {
        fragments.push(document.createTextNode(text.substring(lastIdx)));
      }
      const parent = node.parentNode;
      fragments.forEach(f => parent.insertBefore(f, node));
      parent.removeChild(node);
    });
  }
  function applyCollectedHighlights(articleId) {
    if (!isLoggedIn()) return;
    const articleEl = document.getElementById('article-' + articleId);
    if (!articleEl) return;
    const body = articleEl.querySelector('.article-body');
    if (!body) return;
    clearHighlights(body);
    const sentences = getSentences().filter(s => s.articleId === articleId);
    sentences.forEach(s => highlightTextIn(body, s.text));
  }


  /* ===== Search (본문 검색 · 하이라이트 · 최근/추천 · 키보드 내비) ===== */
  const SEARCH_RECENT_KEY = 'persp_recent_search';
  let _searchActiveIdx = -1;   // 키보드 내비 선택 인덱스

  function _searchGetRecent() {
    try {
      const arr = JSON.parse(localStorage.getItem(SEARCH_RECENT_KEY) || '[]');
      return Array.isArray(arr) ? arr.filter(s => typeof s === 'string') : [];
    } catch (_) { return []; }
  }
  function _searchSaveRecent(q) {
    q = (q || '').trim();
    if (!q || q.length < 2) return;
    let arr = _searchGetRecent().filter(x => x.toLowerCase() !== q.toLowerCase());
    arr.unshift(q);
    arr = arr.slice(0, 8);
    try { localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(arr)); } catch (_) {}
  }
  function _searchClearRecent() {
    try { localStorage.removeItem(SEARCH_RECENT_KEY); } catch (_) {}
    renderSearchEmpty();
  }

  // 추천 키워드: 1차 카테고리 + 자주 쓰인 태그 (데이터 없으면 정적 폴백)
  function _searchSuggestions() {
    const out = [];
    (listCategories || []).filter(c => !(c.parent || '').trim()).forEach(c => { if (c.name) out.push(c.name); });
    const tagCount = {};
    (_fsListArticles || []).forEach(a => {
      (a.tags || []).forEach(t => { t = (t || '').trim(); if (t) tagCount[t] = (tagCount[t] || 0) + 1; });
    });
    Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a]).slice(0, 6).forEach(t => {
      if (out.indexOf(t) === -1) out.push(t);
    });
    return out.length ? out.slice(0, 10) : ['AI', '저작권', '기록', '관점'];
  }

  // 빈 상태(최근 검색어 + 추천 키워드) 렌더
  function renderSearchEmpty() {
    const empty = document.getElementById('searchEmpty');
    if (!empty) return;
    const recent = _searchGetRecent();
    const sugg = _searchSuggestions();
    let html = '';
    if (recent.length) {
      html += '<div class="search-sec"><div class="search-sec-head">' +
        '<span class="meta-label">RECENT</span>' +
        '<button type="button" class="search-recent-clear" data-clear="1">지우기</button></div>' +
        '<div class="search-suggestions">' +
        recent.map(q => '<button type="button" class="suggest" data-q="' + escHTML(q) + '"><i class="fa-regular fa-clock"></i> ' + escHTML(q) + '</button>').join('') +
        '</div></div>';
    }
    html += '<div class="search-sec"><div class="search-sec-head"><span class="meta-label">SUGGESTED</span></div>' +
      '<div class="search-suggestions">' +
      sugg.map(q => '<button type="button" class="suggest" data-q="' + escHTML(q) + '">' + escHTML(q) + '</button>').join('') +
      '</div></div>';
    empty.innerHTML = html;
    empty.querySelectorAll('.suggest[data-q]').forEach(b => {
      b.addEventListener('click', () => {
        const input = document.getElementById('searchInput');
        if (!input) return;
        input.value = b.getAttribute('data-q');
        doSearch();
        input.focus();
      });
    });
    const clr = empty.querySelector('[data-clear]');
    if (clr) clr.addEventListener('click', _searchClearRecent);
  }

  function _stripHtml(html) {
    return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  // 일치 부분을 <mark>로 강조 (q는 소문자, 대소문자 무시)
  function _hl(text, q) {
    const s = String(text || '');
    if (!q) return escHTML(s);
    const lower = s.toLowerCase();
    let out = '', i = 0, idx;
    while ((idx = lower.indexOf(q, i)) !== -1) {
      out += escHTML(s.slice(i, idx)) + '<mark>' + escHTML(s.slice(idx, idx + q.length)) + '</mark>';
      i = idx + q.length;
    }
    return out + escHTML(s.slice(i));
  }
  // 본문 매칭 위치 주변을 잘라 스니펫 + 강조
  function _snippet(text, q, ctx) {
    const s = String(text || '');
    const idx = s.toLowerCase().indexOf(q);
    if (idx === -1) return '';
    ctx = ctx || 42;
    const start = Math.max(0, idx - ctx);
    const end = Math.min(s.length, idx + q.length + ctx);
    const snip = (start > 0 ? '… ' : '') + s.slice(start, end) + (end < s.length ? ' …' : '');
    return _hl(snip, q);
  }

  function doSearch() {
    const input = document.getElementById('searchInput');
    const q = (input ? input.value : '').trim().toLowerCase();
    const empty = document.getElementById('searchEmpty');
    const results = document.getElementById('searchResults');
    _searchActiveIdx = -1;
    if (!q) {
      if (empty) { empty.style.display = ''; renderSearchEmpty(); }
      if (results) results.innerHTML = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    const scored = [];
    (_fsListArticles || []).forEach(a => {
      const title = a.title || '';
      const sub = a.sub || '';
      const cat = (a.category || a.cat || '');
      const tags = (a.tags || []).join(' ');
      const bodyText = _stripHtml(a.bodyHtml || '');
      const inTitle = title.toLowerCase().indexOf(q) !== -1;
      const inSub = sub.toLowerCase().indexOf(q) !== -1;
      const inMeta = (cat + ' ' + tags + ' ' + ((a.seriesName) || '')).toLowerCase().indexOf(q) !== -1;
      const inBody = bodyText.toLowerCase().indexOf(q) !== -1;
      if (!inTitle && !inSub && !inMeta && !inBody) return;
      let score = 0;
      if (inTitle) score += 100;
      if (inSub) score += 40;
      if (inMeta) score += 30;
      if (inBody) score += 10;
      scored.push({ a, score, inTitle, inSub, inBody, bodyText });
    });
    scored.sort((x, y) => (y.score - x.score) || (_pubMs(y.a) - _pubMs(x.a)));

    if (!results) return;
    if (scored.length === 0) {
      results.innerHTML = '<div class="search-no-results">‘' + escHTML((input ? input.value : '').trim()) + '’ 검색 결과가 없습니다.</div>';
      return;
    }
    results.innerHTML = scored.map((s, i) => {
      const a = s.a;
      const thumb = a.thumb || a.thumbnailUrl || (a.videoId ? ('https://img.youtube.com/vi/' + a.videoId + '/mqdefault.jpg') : '');
      const href = '/article.html?id=' + encodeURIComponent(a.id);
      let subLine;
      if (!s.inTitle && !s.inSub && s.inBody) {
        subLine = '<div class="search-result-snippet">' + _snippet(s.bodyText, q, 42) + '</div>';
      } else {
        subLine = '<div class="search-result-sub">' + _hl(a.sub || '', q) + '</div>';
      }
      const thumbHtml = thumb
        ? '<div class="search-result-thumb"><img src="' + escHTML(thumb) + '" alt="" loading="lazy" /></div>'
        : '<div class="search-result-thumb search-result-thumb-empty"></div>';
      return '<a class="search-result" href="' + href + '" data-idx="' + i + '">' +
        thumbHtml +
        '<div class="search-result-meta">' +
          '<div class="search-result-cat">' + _cardCatHTML(a) + '</div>' +
          '<div class="search-result-title">' + _hl(a.title || '', q) + '</div>' +
          subLine +
        '</div></a>';
    }).join('');

    results.querySelectorAll('.search-result').forEach(el => {
      el.addEventListener('click', () => { _searchSaveRecent(input ? input.value : ''); });
    });
  }
  document.getElementById('searchInput')?.addEventListener('input', doSearch);

  // 검색 결과 키보드 내비게이션 (↑/↓ 이동, Enter 진입)
  document.addEventListener('keydown', e => {
    const m = document.getElementById('searchModal');
    if (!m || !m.classList.contains('open')) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    const items = document.querySelectorAll('#searchResults .search-result');
    if (!items.length) return;
    if (e.key === 'Enter') {
      if (_searchActiveIdx >= 0 && items[_searchActiveIdx]) {
        e.preventDefault();
        _searchSaveRecent((document.getElementById('searchInput') || {}).value);
        window.location.href = items[_searchActiveIdx].getAttribute('href');
      }
      return;
    }
    e.preventDefault();
    if (e.key === 'ArrowDown') _searchActiveIdx = Math.min(items.length - 1, _searchActiveIdx + 1);
    else _searchActiveIdx = Math.max(0, _searchActiveIdx - 1);
    items.forEach((it, i) => it.classList.toggle('active', i === _searchActiveIdx));
    const act = items[_searchActiveIdx];
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  });

  /* ===== Keyboard shortcuts ===== */
  document.addEventListener('keydown', e => {
    const isTyping = ['INPUT','TEXTAREA'].includes(e.target.tagName);
    // Search trigger
    if (e.key === '/' && !isTyping) {
      e.preventDefault();
      openSearch();
    }
    // Esc closes modals
    if (e.key === 'Escape') {
      const sm = document.getElementById('searchModal');
      const vm = document.getElementById('videoModal');
      const lm = document.getElementById('loginModal');
      const cm = document.getElementById('confirmModal');
      const dr = document.getElementById('drawer');
      if (sm?.classList.contains('open')) closeSearch();
      if (vm?.classList.contains('open')) window.closeVideo?.();
      if (lm?.classList.contains('open')) closeLogin();
      if (cm?.classList.contains('open')) closeConfirm();
      const ctm = document.getElementById('contributeModal');
      if (ctm?.classList.contains('open')) closeContributeModal();
      if (dr?.classList.contains('open')) closeDrawer();
    }
  });

  /* ===== Login modal close handlers ===== */
  (function() {
    const m = document.getElementById('loginModal');
    if (m) {
      const closeBtn = document.getElementById('loginCloseBtn');
      if (closeBtn) closeBtn.addEventListener('click', closeLogin);
      m.addEventListener('click', e => {
        if (e.target === m) closeLogin();
      });
    }
    const cm = document.getElementById('confirmModal');
    if (cm) {
      cm.addEventListener('click', e => {
        if (e.target === cm) closeConfirm();
      });
    }
  })();

  /* ===== Random article pick =====
     - data-exclude-series="ai" → 같은 시리즈 제외 (시리즈 완결 글)
     - data-exclude(article id) → 단편: 자기 자신만 제외
     - 둘 다 없으면 자기 자신만 제외 */
  function fillRandomPick(el, currentId) {
    if (typeof ARTICLES === 'undefined') return;
    const excludeSeries = el.dataset.excludeSeries;
    const excludeId = el.dataset.exclude || currentId;
    let keys = Object.keys(ARTICLES);
    if (excludeSeries) {
      keys = keys.filter(k => ARTICLES[k].series !== excludeSeries);
    } else {
      keys = keys.filter(k => k !== excludeId);
    }
    if (keys.length === 0) {
      // 추천할 글 없음 — 다음 콘텐츠 섹션 자체 숨김
      const section = el.closest('.next-article');
      if (section) section.style.display = 'none';
      return;
    }
    const pickId = keys[Math.floor(Math.random() * keys.length)];
    const a = ARTICLES[pickId];
    el.dataset.articleId = pickId;
    const img = el.querySelector('.next-part-thumb img');
    if (img) { img.src = a.thumb; img.alt = a.title; }
    const cat = el.querySelector('.rp-cat');
    if (cat) cat.textContent = _catLabel(a.cat);
    const title = el.querySelector('.next-part-title');
    if (title) title.textContent = a.title;
    const sub = el.querySelector('.next-part-sub');
    if (sub) sub.textContent = a.sub;
  }
  function onRandomPickClick(el) {
    const id = el.dataset.articleId;
    if (id) showArticle(id);
  }

  /* ===== Pre-release: cheers + contributions ===== */
  function getCheers() {
    try { return JSON.parse(localStorage.getItem('persp_cheers') || '{}'); }
    catch(e) { return {}; }
  }
  // 응원 취소 묘비: {key: ts} — 기기 간 동기화에서 '취소한 응원'이 되살아나지 않도록 추적
  function getCheerTombs() {
    try { return JSON.parse(localStorage.getItem('persp_cheers_del') || '{}'); }
    catch(e) { return {}; }
  }
  function saveCheerTombs(t) {
    try { localStorage.setItem('persp_cheers_del', JSON.stringify(t || {})); } catch(e) {}
  }
  function getContributions() {
    try { return JSON.parse(localStorage.getItem('persp_contribs') || '[]'); }
    catch(e) { return []; }
  }
  // 보낸 응원 글 ID 목록 — 응원 키는 `(persp_user||guestId):articleId` 형식.
  function _cheeredArticleIds() {
    try {
      const cheers = getCheers();
      const ids = [];
      Object.keys(cheers).forEach(k => {
        if (!cheers[k]) return;
        const idx = k.indexOf(':');
        const id = idx >= 0 ? k.slice(idx + 1) : k;
        if (id && ids.indexOf(id) === -1) ids.push(id);
      });
      return ids;
    } catch (e) { return []; }
  }
  // 응원한 글이 발행됐을 때 알림 Dot 표시용 — 사용자가 확인한 글 ID 목록.
  function getCheerSeen() {
    try { const a = JSON.parse(localStorage.getItem('persp_cheer_seen') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function setCheerSeen(arr) {
    try { localStorage.setItem('persp_cheer_seen', JSON.stringify(arr || [])); } catch (e) {}
  }
  // 발행됐지만 아직 확인하지 않은 응원 글 ID — Dot 표시 여부 판단.
  function _newlyPublishedCheers() {
    const avail = _availableArticleIds();
    const seen = getCheerSeen();
    return _cheeredArticleIds().filter(id => avail.has(id) && seen.indexOf(id) === -1);
  }
  // 특정 글 ID에 해당하는 모든 응원 키를 persp_cheers에서 제거(삭제/철회된 글 정리).
  function _removeCheerKeys(id) {
    try {
      const cheers = getCheers();
      let changed = false;
      Object.keys(cheers).forEach(k => {
        const idx = k.indexOf(':');
        const kid = idx >= 0 ? k.slice(idx + 1) : k;
        if (kid === id) { delete cheers[k]; changed = true; }
      });
      if (changed) localStorage.setItem('persp_cheers', JSON.stringify(cheers));
      return changed;
    } catch (e) { return false; }
  }
  /* ===== 시리즈 후속편 알림 신청 (persp_series_waits) =====
     아직 발행되지 않은 다음 편을 구독 → '기다리는 콘텐츠'에 노출.
     키: `시리즈명||다음편번호`, 값: { series, no, ts } */
  function getSeriesWaits() {
    try { const o = JSON.parse(localStorage.getItem('persp_series_waits') || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch (e) { return {}; }
  }
  function saveSeriesWaits(o) {
    try { localStorage.setItem('persp_series_waits', JSON.stringify(o || {})); } catch (e) {}
  }
  // 알림 해제 묘비({key: ts}) — 취소가 기기 간 전파·유지되어 되살아나지 않게 한다.
  function getSeriesWaitTombs() {
    try { const o = JSON.parse(localStorage.getItem('persp_series_waits_del') || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch (e) { return {}; }
  }
  function saveSeriesWaitTombs(t) {
    try { localStorage.setItem('persp_series_waits_del', JSON.stringify(t || {})); } catch (e) {}
  }
  function _seriesWaitKey(series, no) { return String(series || '') + '||' + String(no == null ? '' : no); }
  window.isSeriesWaiting = function(series, no) {
    return !!getSeriesWaits()[_seriesWaitKey(series, no)];
  };
  window.toggleSeriesWait = function(series, no, btnEl, seriesName) {
    if (!series) return false;
    const o = getSeriesWaits();
    const tomb = getSeriesWaitTombs();
    const k = _seriesWaitKey(series, no);
    const on = !o[k];
    if (on) { o[k] = { series: String(series), seriesName: (seriesName ? String(seriesName) : ''), no: (no == null ? null : Number(no)), ts: Date.now() }; delete tomb[k]; }
    else { delete o[k]; tomb[k] = Date.now(); }
    saveSeriesWaitTombs(tomb);
    saveSeriesWaits(o);
    if (btnEl) {
      btnEl.classList.toggle('is-on', on);
      btnEl.innerHTML = on
        ? '<i class="fa-solid fa-check"></i> 알림 신청됨'
        : '<i class="fa-regular fa-bell"></i> 다음 편 알림 받기';
    }
    if (window.showToast) showToast(on ? '다음 편이 공개되면 알려드릴게요.' : '알림 신청을 취소했어요.');
    try { if (typeof _cloudPushArchive === 'function') _cloudPushArchive(); } catch (e) {}
    return on;
  };
  // '기다리는 콘텐츠'에서 시리즈 알림 항목을 직접 삭제(특히 발행되어 알림을 끌 수 없는 경우).
  // 삭제는 복구 불가 — 확인 모달 후 진행. 묘비를 남겨 기기 간 되살아나지 않게 한다.
  function _deleteSeriesWait(key) {
    if (!key) return;
    const o = getSeriesWaits();
    const tomb = getSeriesWaitTombs();
    delete o[key];
    tomb[key] = Date.now();
    saveSeriesWaitTombs(tomb);
    saveSeriesWaits(o);
    try { if (typeof _cloudPushArchive === 'function') _cloudPushArchive(); } catch (e) {}
    if (typeof renderMyInsights === 'function') renderMyInsights();
    if (window.showToast) showToast('기다리는 콘텐츠에서 삭제했어요.');
  }
  window.removeSeriesWait = function(key) {
    if (!key) return;
    if (typeof openConfirm === 'function') {
      openConfirm({
        title: '기다리는 콘텐츠에서 삭제할까요?',
        msg: '삭제하면 이 항목은 목록에서 사라지며, <strong>다시 복구할 수 없어요.</strong>',
        confirmText: '삭제',
        cancelText: '취소',
        onConfirm: function() { _deleteSeriesWait(key); }
      });
    } else if (window.confirm('삭제하면 복구할 수 없어요. 삭제할까요?')) {
      _deleteSeriesWait(key);
    }
  };
  // 시리즈 레지스트리(slug → 시리즈명) — Firestore 'series' 컬렉션(공개 읽기)에서 1회 로드.
  let _seriesNames = null;        // null=미로드, {}=로드됨
  let _seriesNamesLoading = false;
  function _loadSeriesNames(cb) {
    if (_seriesNames !== null) { if (cb) cb(); return; }
    if (_seriesNamesLoading) return;
    if (!window.fb || !fb.db) { _seriesNames = {}; if (cb) cb(); return; }
    _seriesNamesLoading = true;
    fb.db.collection('series').get().then(function (snap) {
      const m = {};
      snap.forEach(function (doc) {
        const d = doc.data() || {};
        const nm = d.name || doc.id;
        m[doc.id] = nm;
        if (d.code) m[d.code] = nm;
      });
      _seriesNames = m;
    }).catch(function () { _seriesNames = {}; }).then(function () {
      _seriesNamesLoading = false; if (cb) cb();
    });
  }
  // 시리즈 슬러그(series)로 표시용 시리즈명을 찾는다.
  // 레지스트리 우선 → 저장된 알림의 seriesName → 슬러그 그대로.
  function _seriesDisplayName(slug) {
    if (_seriesNames && _seriesNames[slug]) return _seriesNames[slug];
    try {
      const keys = Object.keys(ARTICLES);
      for (const id of keys) {
        const a = ARTICLES[id];
        if (!a) continue;
        if ((a.series || '') === slug && a.seriesName) return a.seriesName;
      }
    } catch (e) {}
    return slug;
  }
  // 시리즈명+편번호로 발행된 아티클을 찾는다(발행되면 '기다리는 콘텐츠'에서 링크로 전환).
  // 정적 카탈로그(ARTICLES)와 Firestore 발행 글(_fsListArticles)을 모두 확인한다.
  function _findSeriesArticle(series, no) {
    const want = Number(no);
    const _match = (a) => {
      if (!a || Number(a.seriesNo) !== want) return false;
      // 신청 키는 슬러그(series) 기준이지만, 발행 글에 슬러그가 비고 사람이름(seriesName)만
      // 채워진 경우도 안전하게 매칭되도록 두 필드 중 하나라도 일치하면 동일 시리즈로 본다.
      return a.series === series || a.seriesName === series;
    };
    try {
      const keys = Object.keys(ARTICLES);
      for (const id of keys) {
        const a = ARTICLES[id];
        if (_match(a)) return Object.assign({ id: id }, a);
      }
    } catch (e) {}
    try {
      const list = _fsListArticles || [];
      for (const a of list) {
        if (a && a.id && _match(a)) return Object.assign({}, a, { id: a.id });
      }
    } catch (e) {}
    return null;
  }
  // 시리즈 알림 신청 목록을 '기다리는 콘텐츠' 아이템 형태로 변환.
  function _seriesWaitItems() {
    const o = getSeriesWaits();
    const out = [];
    Object.keys(o).forEach(k => {
      const w = o[k];
      if (!w || !w.series) return;
      const found = _findSeriesArticle(w.series, w.no);
      const dispName = w.seriesName || _seriesDisplayName(w.series);
      const waitLabel = '"' + dispName + '" Part.' + (w.no || '');
      if (found) {
        out.push({ id: found.id, status: 'PUBLISHED', kind: 'series', waitKey: k,
          a: { id: found.id, title: found.title || waitLabel, thumb: found.thumb || found.cover || '' },
          dateLabel: found.date || '', dateMs: _pubMs(found) });
      } else {
        out.push({ id: k, status: 'PRERELEASE', kind: 'series', waitKey: k,
          a: { title: waitLabel },
          seriesLabel: w.series, dateMs: w.ts || 0 });
      }
    });
    return out;
  }

  // 응원한 글들의 실제 상태를 Firestore에서 확인한다.
  // - PUBLISHED/PRERELEASE → 목록에 포함(발행됨/발행 예정)
  // - 문서 없음(삭제) 또는 읽기 거부(철회·비공개) → persp_cheers에서 제거(prune)
  // - 기타 오류(네트워크 등) → 보수적으로 로컬 캐시 기준 유지
  async function _resolveCheerStatuses() {
    const ids = _cheeredArticleIds();
    const out = [];
    if (!ids.length) { _cheerResolved = out; return out; }
    const db = (window.fb && fb.db) ? fb.db : null;
    for (const id of ids) {
      if (!db) {
        const a = _lookupArticle(id);
        if (a) out.push({ id, a, status: 'PUBLISHED', dateLabel: a.date || '', dateMs: _pubMs(a) });
        continue;
      }
      try {
        const snap = await db.collection('articles').doc(id).get();
        if (!snap.exists) { _removeCheerKeys(id); continue; } // 삭제됨
        const d = snap.data() || {};
        const st = d.status;
        if (st === 'PUBLISHED' || st === 'PRERELEASE') {
          out.push({
            id, status: st,
            a: { id, title: d.title || '', thumb: d.thumb || d.cover || '', videoId: d.videoId || '' },
            dateLabel: d.date || '',
            dateMs: _pubMs(d)
          });
        } else {
          _removeCheerKeys(id); // 비공개/철회 → 제거
        }
      } catch (e) {
        if (e && e.code === 'permission-denied') { _removeCheerKeys(id); continue; } // 읽기 거부 = 철회/비공개
        const a = _lookupArticle(id); // 기타 오류는 유지
        if (a) out.push({ id, a, status: 'PUBLISHED', dateLabel: a.date || '', dateMs: _pubMs(a) });
      }
    }
    _cheerResolved = out;
    return out;
  }
  // 보낸 응원 인라인 카드 리스트 상태(모달 제거 후 마이페이지 인사이트 탭에 직접 노출)
  let _cheerResolved = null;   // null=미해결, []=정리됨/없음, [...]=해결됨
  let _cheerResolving = false;
  let _cheerPage = 1;
  // 보낸 응원 섹션 마크업 — 발행 예정(얇은 박스)과 발행됨(검정 카드 + N뱃지 + 발행일) 5개씩 페이지네이션.
  function _renderCheerSection(totalCount) {
    let h = '<div class="insight-block cheer-section">';
    h += '<div class="cheer-sec-head"><h3 class="insight-h">기다리는 콘텐츠</h3><span class="cheer-sec-count">' + totalCount + '개</span></div>';
    const waitItems = _seriesWaitItems();
    const hasCheerIds = _cheeredArticleIds().length > 0;
    if (_cheerResolved === null && hasCheerIds) { h += '<p class="cheer-sec-note">불러오는 중…</p></div>'; return h; }
    const items = (_cheerResolved || []).concat(waitItems);
    if (!items.length) { h += '<p class="cheer-sec-note">응원한 글이 모두 정리됐어요.</p></div>'; return h; }
    // 발행됨(최신 발행순) → 발행 예정 순
    const sorted = items.slice().sort((x, y) => {
      const px = x.status === 'PUBLISHED' ? 1 : 0, py = y.status === 'PUBLISHED' ? 1 : 0;
      if (px !== py) return py - px;
      return (y.dateMs || 0) - (x.dateMs || 0);
    });
    const PER = 5;
    const pages = Math.ceil(sorted.length / PER);
    if (_cheerPage > pages) _cheerPage = 1;
    const start = (_cheerPage - 1) * PER;
    const slice = sorted.slice(start, start + PER);
    h += '<div class="cheer-list">';
    slice.forEach(it => {
      const title = escHTML((it.a && it.a.title) || '응원한 글');
      // 시리즈 알림 항목은 직접 삭제 가능(특히 발행되어 알림을 끌 수 없는 경우) → X 버튼
      const isSeriesWait = (it.kind === 'series' && it.waitKey);
      let itemHTML;
      if (it.status === 'PUBLISHED') {
        itemHTML = '<a class="cheer-item is-pub" href="/article.html?id=' + encodeURIComponent(it.id) + '">' +
          '<span class="cheer-item-badge">N</span>' +
          '<span class="cheer-item-body"><span class="cheer-item-title">' + title + '</span>' +
          (it.dateLabel ? '<span class="cheer-item-date">' + escHTML(it.dateLabel) + ' 발행</span>' : '') +
          '</span><i class="fa-solid fa-arrow-right cheer-item-go"></i></a>';
      } else {
        itemHTML = '<span class="cheer-item is-wait">' +
          '<span class="cheer-item-status">발행 예정</span>' +
          '<span class="cheer-item-body"><span class="cheer-item-title">' + title + '</span></span></span>';
      }
      if (isSeriesWait && it.status === 'PUBLISHED') {
        // 발행된 시리즈 항목만 삭제 가능 (발행 예정은 X 버튼 미노출)
        const keyEnc = encodeURIComponent(it.waitKey);
        h += '<div class="cheer-item-row">' + itemHTML +
          '<button type="button" class="cheer-item-del" title="기다리는 콘텐츠에서 삭제" aria-label="삭제" ' +
          'onclick="removeSeriesWait(decodeURIComponent(\'' + keyEnc + '\'))"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>';
      } else {
        h += itemHTML;
      }
    });
    h += '</div>';
    if (pages > 1) {
      h += '<div class="cheer-pager">' +
        '<button type="button" class="cheer-pg-btn"' + (_cheerPage <= 1 ? ' disabled' : '') + ' onclick="cheerGotoPage(' + (_cheerPage - 1) + ')" aria-label="이전"><i class="fa-solid fa-chevron-left"></i></button>' +
        '<span class="cheer-pg-info">' + _cheerPage + ' / ' + pages + '</span>' +
        '<button type="button" class="cheer-pg-btn"' + (_cheerPage >= pages ? ' disabled' : '') + ' onclick="cheerGotoPage(' + (_cheerPage + 1) + ')" aria-label="다음"><i class="fa-solid fa-chevron-right"></i></button>' +
        '</div>';
    }
    h += '</div>';
    // 발행된 응원 글을 확인함으로 표시(인라인 노출 = 확인) → 홈 알림 Dot/팝업 정리
    try {
      const seen = getCheerSeen();
      let changed = false;
      items.forEach(it => { if (it.status === 'PUBLISHED' && seen.indexOf(it.id) === -1) { seen.push(it.id); changed = true; } });
      if (changed) setCheerSeen(seen);
    } catch (e) {}
    return h;
  }
  window.cheerGotoPage = function(n) {
    _cheerPage = Math.max(1, n);
    if (typeof renderMyInsights === 'function') renderMyInsights();
  };
  // 보낸 응원 알림 모달 — 응원한 글의 발행 여부를 보여주고, 발행된 글은 '확인함' 처리.
  // 삭제/철회된 글은 자동으로 정리(prune)되어 목록·카운트에서 빠진다.
  window.openCheerNotice = async function() {
    const ids = _cheeredArticleIds();
    if (!ids.length) { if (window.sysAlert) sysAlert('아직 보낸 응원이 없어요.', { title: '보낸 응원' }); return; }
    const items = await _resolveCheerStatuses();
    if (!items.length) {
      if (window.sysAlert) sysAlert('보낸 응원이 모두 정리됐어요.', { title: '보낸 응원' });
      if (typeof renderMyInsights === 'function') setTimeout(renderMyInsights, 60);
      return;
    }
    // 발행된 글을 먼저 정렬
    items.sort((x, y) => (y.status === 'PUBLISHED' ? 1 : 0) - (x.status === 'PUBLISHED' ? 1 : 0));
    let body = '<span class="cheer-notice-list">';
    items.forEach(it => {
      const title = escHTML((it.a && it.a.title) || '응원한 글');
      if (it.status === 'PUBLISHED') {
        body += '<a class="cheer-notice-item is-pub" href="/article.html?id=' + encodeURIComponent(it.id) + '">'
          + '<span class="cheer-notice-badge">발행됨</span>'
          + '<span class="cheer-notice-title">' + title + '</span>'
          + '<i class="fa-solid fa-arrow-right"></i></a>';
      } else {
        body += '<span class="cheer-notice-item">'
          + '<span class="cheer-notice-badge wait">발행 예정</span>'
          + '<span class="cheer-notice-title">' + title + '</span></span>';
      }
    });
    body += '</span>';
    openConfirm({ title: '내가 보낸 응원', msg: body, confirmText: '확인', cancelText: '', onConfirm: function() {} });
    // 발행된 응원 글을 확인함으로 표시 → Dot 제거 후 대시보드 갱신
    const pubIds = items.filter(i => i.status === 'PUBLISHED').map(i => i.id);
    if (pubIds.length) {
      const seen = getCheerSeen();
      pubIds.forEach(id => { if (seen.indexOf(id) === -1) seen.push(id); });
      setCheerSeen(seen);
    }
    if (typeof renderMyInsights === 'function') setTimeout(renderMyInsights, 60);
  };
  // 로그인 상태로 접속 시, 응원한 글이 새로 발행됐으면 중앙 모달 팝업으로 알린다.
  let _cheerPopupShown = false;
  function maybeShowCheerPublishedPopup() {
    try {
      if (_cheerPopupShown) return;
      if (!isLoggedIn()) return;
      const newIds = _newlyPublishedCheers();
      if (!newIds.length) return;
      const items = newIds.map(id => ({ id, a: _lookupArticle(id) })).filter(x => x.a && x.a.title);
      if (!items.length) return;
      _cheerPopupShown = true;
      const main = items[0];
      const a = main.a;
      const thumb = a.thumb || (a.videoId ? ('https://img.youtube.com/vi/' + a.videoId + '/mqdefault.jpg') : '');
      const more = items.length - 1;
      const ov = document.createElement('div');
      ov.className = 'cheer-pop-overlay';
      ov.innerHTML =
        '<div class="cheer-pop" role="dialog" aria-modal="true">' +
          '<button class="cheer-pop-close" type="button" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>' +
          '<div class="cheer-pop-eyebrow"><i class="fa-solid fa-hands-clapping"></i> 응원한 글이 발행됐어요</div>' +
          (thumb ? '<div class="cheer-pop-thumb"><img src="' + escHTML(thumb) + '" alt="" /></div>' : '') +
          '<h3 class="cheer-pop-title">' + escHTML(a.title || '새 글') + '</h3>' +
          '<p class="cheer-pop-sub">회원님이 응원해주신 글이 공개됐어요.' +
            (more > 0 ? '<br/>외 ' + more + '편도 함께 발행됐어요.' : '') + '</p>' +
          '<div class="cheer-pop-actions">' +
            '<a class="cheer-pop-go" href="/article.html?id=' + encodeURIComponent(main.id) + '">지금 읽어보기</a>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => ov.classList.add('show'));
      const markSeen = () => {
        const seen = getCheerSeen();
        newIds.forEach(id => { if (seen.indexOf(id) === -1) seen.push(id); });
        setCheerSeen(seen);
      };
      const close = () => {
        markSeen();
        ov.classList.remove('show');
        setTimeout(() => { ov.remove(); document.body.style.overflow = ''; }, 250);
      };
      ov.querySelector('.cheer-pop-close').onclick = close;
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      const go = ov.querySelector('.cheer-pop-go');
      if (go) go.addEventListener('click', markSeen); // 이동 전 확인함 처리
    } catch (e) { /* 팝업은 선택적 */ }
  }
  window.maybeShowCheerPublishedPopup = maybeShowCheerPublishedPopup;
  // 응원 식별자 — 로그인 시 계정(uid) 기준으로 1인 1응원이 보장되도록 한다(브라우저 캐시를
  // 지워도 같은 계정이면 같은 키 → 중복 카운트 방지). 비로그인은 게스트 ID(브라우저 단위).
  function _cheerIdentity() {
    try {
      if (window.fb && fb.currentUser && fb.currentUser()) return fb.currentUser().uid;
    } catch (e) {}
    let guestId = localStorage.getItem('persp_guest_id');
    if (!guestId) {
      guestId = 'g_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('persp_guest_id', guestId);
    }
    return guestId;
  }
  async function cheerPrerelease(id, btnEl) {
    // 1계정 1응원: 서버에 articles/{id}/cheers/{uid} 문서를 두어 중복을 강제(캐시 삭제로
    // 부풀리기 불가). 카운트는 articles/{id}.cheerCount(어드민 '총 응원'과 동기화).
    if (!isLoggedIn()) {
      showToast('로그인 후 응원할 수 있어요.');
      setTimeout(() => { if (typeof openLogin === 'function') openLogin(); }, 500);
      return;
    }
    if (!window.fb || !fb.db) return;
    const uid = fb.currentUser().uid;
    const artRef = fb.db.collection('articles').doc(id);
    const voteRef = artRef.collection('cheers').doc(uid);
    const countEl = document.getElementById('prCheerCount-' + id);
    const cur = countEl ? (parseInt(countEl.textContent, 10) || 0) : 0;
    const userKey = uid + ':' + id;
    if (btnEl && btnEl.dataset.cheerBusy === '1') return; // 연타 방지
    if (btnEl) btnEl.dataset.cheerBusy = '1';
    try {
      const snap = await voteRef.get();
      const cheers = getCheers();
      if (snap.exists) {
        // 이미 응원함 → 취소
        await voteRef.delete();
        await artRef.update({ cheerCount: fb.FieldValue.increment(-1) });
        delete cheers[userKey];
        const _ct = getCheerTombs(); _ct[userKey] = Date.now(); saveCheerTombs(_ct);
        btnEl?.classList.remove('cheered');
        if (countEl) countEl.textContent = Math.max(0, cur - 1);
        showToast('응원을 취소했어요.');
      } else {
        await voteRef.set({ uid: uid, at: Date.now() });
        await artRef.update({ cheerCount: fb.FieldValue.increment(1) });
        cheers[userKey] = Date.now();
        const _ct = getCheerTombs(); delete _ct[userKey]; saveCheerTombs(_ct);
        btnEl?.classList.add('cheered');
        if (countEl) countEl.textContent = cur + 1;
        showToast('응원을 보냈어요. 글이 더 깊어집니다.');
      }
      localStorage.setItem('persp_cheers', JSON.stringify(cheers));
      if (typeof _cloudPushArchive === 'function') _cloudPushArchive();
    } catch (e) {
      console.warn('[cheer] 실패:', e && e.message);
      showToast('잠시 후 다시 시도해 주세요.');
    } finally {
      if (btnEl) btnEl.dataset.cheerBusy = '';
    }
  }
  function syncCheerState() {
    // 카운트는 Firestore(d.cheerCount)로 이미 렌더됨. 여기선 '이 계정이 응원했는지'만
    // 표시. 로그인 시 서버 voter 문서(articles/{id}/cheers/{uid})를 권위로 사용해
    // 로컬 캐시(persp_cheers)까지 동기화 → 캐시 삭제 후에도 정확히 복원된다.
    const cheers = getCheers();
    const loggedIn = !!(window.fb && fb.db && fb.currentUser && fb.currentUser());
    const uid = loggedIn ? fb.currentUser().uid : '';
    document.querySelectorAll('[id^="prCheerCount-"]').forEach(countEl => {
      const id = countEl.id.replace('prCheerCount-', '');
      const btn = countEl.closest('.pr-cheer-reaction') || countEl.closest('.pr-cheer-btn');
      if (!btn) return;
      const localKey = _cheerIdentity() + ':' + id;
      btn.classList.toggle('cheered', !!cheers[localKey]);
      if (loggedIn) {
        fb.db.collection('articles').doc(id).collection('cheers').doc(uid).get()
          .then(s => {
            btn.classList.toggle('cheered', s.exists);
            const c = getCheers(); const k = uid + ':' + id;
            const ct = getCheerTombs();
            if (s.exists) { c[k] = c[k] || Date.now(); delete ct[k]; }
            else { delete c[k]; ct[k] = Date.now(); }
            localStorage.setItem('persp_cheers', JSON.stringify(c));
            saveCheerTombs(ct);
          }).catch(() => {});
      }
    });
  }

  let _contributeTargetId = null;
  function openContributeModal(id) {
    if (!isLoggedIn()) {
      showToast('로그인 후 자료를 보낼 수 있어요.');
      setTimeout(() => openLogin(), 500);
      return;
    }
    _contributeTargetId = id;
    const m = document.getElementById('contributeModal');
    if (m) {
      m.classList.add('open');
      document.body.style.overflow = 'hidden';
      setTimeout(() => document.getElementById('cTitle')?.focus(), 60);
    }
  }
  function closeContributeModal() {
    const m = document.getElementById('contributeModal');
    if (m) m.classList.remove('open');
    document.body.style.overflow = '';
    _contributeTargetId = null;
  }
  async function submitContribution(e) {
    e?.preventDefault();
    const title = document.getElementById('cTitle')?.value.trim();
    if (!title) return;
    if (!isLoggedIn()) {
      showToast('로그인 후 자료를 보낼 수 있어요.');
      setTimeout(() => openLogin(), 500);
      return;
    }
    const user = (window.fb && fb.currentUser) ? fb.currentUser() : null;
    if (!user || !_contributeTargetId || !fb.db) {
      showToast('잠시 후 다시 시도해 주세요.');
      return;
    }
    const type = document.querySelector('input[name="cType"]:checked')?.value || 'etc';
    const url = document.getElementById('cUrl')?.value.trim() || '';
    const note = document.getElementById('cNote')?.value.trim() || '';
    const anonymous = !!document.getElementById('cAnonymous')?.checked;
    const submitter = anonymous ? '익명' : (user.displayName || user.email || '독자');
    // 어드민 '받은 자료 보기'는 message/url을 표시 → 제목+메모를 message로 합쳐 저장
    const message = title + (note ? '\n' + note : '');
    const artRef = fb.db.collection('articles').doc(_contributeTargetId);
    const submitBtn = document.querySelector('.contribute-submit');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await artRef.collection('contributions').add({
        by: user.uid,
        type, title, url, note, message, submitter, anonymous,
        createdAt: fb.FieldValue.serverTimestamp()
      });
      // 받은 자료 수 집계(+1) — 실패해도 제출 자체는 성공 처리
      artRef.update({ contributionCount: fb.FieldValue.increment(1) }).catch(() => {});
      document.getElementById('contributeForm')?.reset();
      closeContributeModal();
      showToast('자료를 보내주셔서 고맙습니다.<br/>편집실에서 살펴볼게요.');
    } catch (err) {
      showToast('전송 실패: ' + err.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // contribute modal close
  (function() {
    const m = document.getElementById('contributeModal');
    if (!m) return;
    const closeBtn = document.getElementById('contributeCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeContributeModal);
    m.addEventListener('click', e => {
      if (e.target === m) closeContributeModal();
    });
  })();

  /* ===== Series accordion ===== */
  function toggleSeries(headEl) {
    const card = headEl.closest('.series-card');
    if (!card || card.classList.contains('upcoming')) return;
    card.classList.toggle('open');
  }

  /* ===== Footer notice ticker — slide up =====
     기본은 정적 마크업의 .ticker-item을 회전시키지만, applyNotices()가
     Firestore 데이터로 #footerTicker innerHTML을 교체한 뒤 startTicker()를
     다시 호출해 회전 타이머를 재설정한다. */
  function startTicker() {
    const track = document.getElementById('footerTicker');
    const items = document.querySelectorAll('#footerTicker .ticker-item');
    // 노티스가 없으면(더미 제거됨, Firestore 비어있음) NOTICE 영역 자체를 숨김
    const wrap = track ? track.closest('.notice-ticker') : null;
    if (wrap) wrap.style.display = items.length === 0 ? 'none' : '';
    if (window._tickerInterval) {
      clearInterval(window._tickerInterval);
      window._tickerInterval = null;
    }
    if (items.length < 2) return;
    // 첫 항목만 활성, 나머지는 비활성으로 초기화
    items.forEach((el, i) => {
      el.classList.toggle('active', i === 0);
      el.classList.remove('leaving');
    });
    let idx = 0;
    window._tickerInterval = setInterval(() => {
      const current = items[idx];
      const nextIdx = (idx + 1) % items.length;
      const next = items[nextIdx];
      current.classList.remove('active');
      current.classList.add('leaving');
      next.classList.add('active');
      setTimeout(() => current.classList.remove('leaving'), 650);
      idx = nextIdx;
    }, 4500);
  }
  // 정적 마크업 기반 초기 회전 시작 (Firestore 응답이 오기 전 fallback)
  startTicker();

  // Firestore 노티스 실시간 구독 — 활성 노티스만 티커에 렌더
  function applyNotices() {
    if (!window.fb || !fb.db) return;
    const track = document.getElementById('footerTicker');
    if (!track) return;
    try {
      fb.db.collection('notices').where('active', '==', true).onSnapshot(snap => {
        const wrap = track.closest('.notice-ticker');
        if (snap.empty) {
          // 활성 노티스가 없으면 티커를 숨김 (정적 더미 표시 방지)
          track.innerHTML = '';
          if (wrap) wrap.style.display = 'none';
          return;
        }
        if (wrap) wrap.style.display = '';
        const items = snap.docs.map(d => { const o = d.data() || {}; o.id = d.id; return o; })
          .sort((a, b) => {
            const oa = a.order != null ? a.order : 0;
            const ob = b.order != null ? b.order : 0;
            if (oa !== ob) return oa - ob;
            return (b.date || '').localeCompare(a.date || '');
          });
        track.innerHTML = items.map((n, i) => `
          <div class="ticker-item${i === 0 ? ' active' : ''}" data-id="${escHTML(n.id || '')}">
            <span class="t-date">${escHTML(n.date || '')}</span>
            <span class="t-text">${escHTML(n.text || '')}</span>
          </div>
        `).join('');
        // 티커 클릭 → 공지사항 페이지로 이동, 현재 보이는 공지를 펼친 상태로
        if (wrap && !wrap._noticeClickBound) {
          wrap._noticeClickBound = true;
          wrap.style.cursor = 'pointer';
          wrap.setAttribute('role', 'link');
          wrap.setAttribute('aria-label', '공지사항 보기');
          wrap.addEventListener('click', () => {
            const activeItem = track.querySelector('.ticker-item.active') || track.querySelector('.ticker-item');
            const id = activeItem ? activeItem.getAttribute('data-id') : '';
            window.location.href = '/notices.html' + (id ? ('?open=' + encodeURIComponent(id)) : '');
          });
        }
        startTicker();
      }, err => console.warn('[notices] 구독 실패:', err.message));
    } catch (err) {
      console.warn('[notices] 예외:', err.message);
    }
  }
  // 모든 공개 페이지에서 #footerTicker가 존재하면 구독 시작
  if (document.getElementById('footerTicker')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyNotices);
    } else {
      applyNotices();
    }
  }

  /* ===== SEO / OG 메타 런타임 적용 (어드민 site/seo 설정 반영) =====
   * 고정 페이지의 title/description/OG/twitter 메타를 어드민 설정값으로 갱신.
   * 브라우저 탭·구글(JS 렌더) 즉시 반영. 아티클 페이지는 서버(Cloud Function)에서
   * 별도 주입하므로 여기서는 건너뜀. */
  function _seoPageKey() {
    if (/^\/articles\//.test(location.pathname)) return null; // 아티클은 글 자체 메타 사용
    const p = location.pathname.replace(/\/+$/, '') || '/';
    const map = {
      '/': 'home', '/index.html': 'home',
      '/list': 'list', '/list.html': 'list',
      '/about': 'about', '/about.html': 'about',
      '/notices': 'notices', '/notices.html': 'notices',
      '/terms': 'terms', '/terms.html': 'terms',
      '/privacy': 'privacy', '/privacy.html': 'privacy'
    };
    return map[p] || null;
  }
  function _upsertMeta(key, attr, content) {
    if (content == null || content === '') return;
    let tag = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attr, key); document.head.appendChild(tag); }
    tag.setAttribute('content', content);
  }
  // site/seo 를 실시간 구독 — 어드민 SEO·메타에서 저장하면 즉시 반영된다.
  let _seoUnsub = null;
  function applySeoMeta() {
    if (!window.fb || !fb.db) return;
    const key = _seoPageKey();
    if (!key) return;
    if (_seoUnsub) _seoUnsub();
    _seoUnsub = fb.db.collection('site').doc('seo').onSnapshot(snap => {
      if (!snap.exists) return;
      _applySeoData(snap.data() || {}, key);
    }, err => { console.warn('[seo] 구독 실패:', err.message); });
  }

  function _applySeoData(data, key) {
    const pg = (data.pages || {})[key] || {};
    const title = pg.title || data.defaultTitle || '';
    const desc = pg.desc || data.defaultDesc || '';
    const ogTitle = pg.ogTitle || pg.title || data.defaultTitle || '';
    const ogImage = pg.ogImage || data.defaultOgImage || '';
    if (title) document.title = title;
    _upsertMeta('description', 'name', desc);
    if (data.siteName) _upsertMeta('og:site_name', 'property', data.siteName);
    _upsertMeta('og:title', 'property', ogTitle);
    _upsertMeta('og:description', 'property', desc);
    _upsertMeta('og:image', 'property', ogImage);
    _upsertMeta('twitter:title', 'name', ogTitle);
    _upsertMeta('twitter:description', 'name', desc);
    _upsertMeta('twitter:image', 'name', ogImage);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySeoMeta);
  } else {
    applySeoMeta();
  }

  /* ===== Carousel mouse parallax ===== */
  (function() {
    const carousel = document.getElementById('carousel');
    if (!carousel) return;
    carousel.addEventListener('mousemove', e => {
      const rect = carousel.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      carousel.querySelectorAll('.carousel-slide .featured-thumb img').forEach(img => {
        img.style.transform = `translate(${x * -8}px, ${y * -4}px) scale(1.03)`;
      });
    });
    carousel.addEventListener('mouseleave', () => {
      carousel.querySelectorAll('.carousel-slide .featured-thumb img').forEach(img => {
        img.style.transform = '';
      });
    });
  })();
  // Multi-page: each article is a separate HTML at /articles/{id}.html
  function showArticle(id, options) {
    if (!id) return;
    window.location.href = '/articles/' + id + '.html';
  }
  function showHome() {
    window.location.href = '/';
  }
  let _currentVideoArticleId = '';
  let _videoCurrentTime = 0; // 모달 영상의 현재 재생 위치(초) — "아티클 같이 보기" 이어재생용
  function openInterviewArticle() {
    const target = _currentVideoArticleId || 'interview-1';
    const t = Math.floor(_videoCurrentTime || 0);
    if (typeof closeVideo === 'function') closeVideo();
    // 아티클 페이지로 이동하면서, 보던 지점부터 자동 이어재생되도록 해시(#t=초)로 전달
    const hash = '#t=' + (t > 0 ? t : 0);
    setTimeout(() => { window.location.href = '/articles/' + target + '.html' + hash; }, 120);
  }

  /* ===== Toast ===== */
  let toastTimer;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.innerHTML = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2100);
  }

  /* ===== Share / Copy link ===== */
  function shareTo(platform, articleId) {
    const url = window.location.href.split('#')[0] + '#' + articleId;
    const text = 'LOCALLAYERS — ' + (document.querySelector('#article-' + articleId + ' .article-title')?.textContent || '');
    if (platform === 'x') {
      window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank');
    } else if (platform === 'instagram') {
      navigator.clipboard?.writeText(url);
      showToast('링크가 복사되었어요. Instagram에 붙여넣으세요.');
    }
  }
  function copyLink(articleId) {
    const url = window.location.href.split('#')[0] + '#' + articleId;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast('링크가 복사되었어요.'));
    } else {
      showToast('링크가 복사되었어요.');
    }
  }

  /* ===== Article reading progress bar ===== */
  let _currentArticleId = null;
  let _readTrackedThisSession = false;
  let _lastSavedProgress = 0;
  const READ_THRESHOLD = 30; // percent

  function updateProgress() {
    const bar = document.getElementById('articleProgress');
    if (!bar || document.body.getAttribute('data-view') !== 'article') return;
    // 멀티페이지 글 화면에서는 _currentArticleId가 설정되지 않으므로 body에서 보충
    if (!_currentArticleId) {
      const bodyId = document.body.getAttribute('data-article-id');
      if (bodyId) {
        _currentArticleId = bodyId;
      } else {
        const articleEl = document.querySelector('.article-content');
        if (articleEl && articleEl.id) _currentArticleId = articleEl.id.replace(/^article-/, '');
      }
    }
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    bar.style.width = pct + '%';

    // Track as read once we've passed the threshold.
    // 인증 복원 전(isLoggedIn=false)에는 trackArticleRead가 false를 반환하므로
    // 플래그를 세우지 않고, 로그인 완료 후 재호출 시 정상 기록되도록 한다.
    if (!_readTrackedThisSession && _currentArticleId && pct >= READ_THRESHOLD) {
      if (trackArticleRead(_currentArticleId, pct)) {
        _readTrackedThisSession = true;
        _lastSavedProgress = pct;
      }
    } else if (_readTrackedThisSession && _currentArticleId && pct - _lastSavedProgress >= 5) {
      _lastSavedProgress = pct;
      updateArticleProgress(_currentArticleId, pct);
    }
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  /* ===== Reactions (localStorage) ===== */
  function getReactions() {
    try { return JSON.parse(localStorage.getItem('persp_reactions') || '{}'); }
    catch(e) { return {}; }
  }
  // 반응 취소 묘비: {key: ts} — 기기 간 동기화에서 '취소'가 되살아나지 않도록 추적
  function getReactionTombs() {
    try { return JSON.parse(localStorage.getItem('persp_reactions_del') || '{}'); }
    catch(e) { return {}; }
  }
  function saveReactionTombs(t) {
    try { localStorage.setItem('persp_reactions_del', JSON.stringify(t || {})); } catch(e) {}
  }
  function saveReactions(r) {
    localStorage.setItem('persp_reactions', JSON.stringify(r));
    _cloudPushArchive();
  }
  function syncReactionsState() {
    const r = getReactions();
    document.querySelectorAll('.reaction[data-key]').forEach(btn => {
      const key = btn.dataset.key;
      const isActive = !!r[key];
      btn.classList.toggle('active', isActive);
      const countEl = btn.querySelector('.r-count');
      // 서버 집계(rcNew/rcDeep/rcPass)가 이미 본인 반응을 포함하므로 +1을 더하지 않는다.
      // 최초 렌더된 서버 카운트를 baseCount로 캡처하고, 토글 시 click 핸들러가 ±1 갱신한다.
      if (countEl && btn.dataset.baseCount === undefined) {
        btn.dataset.baseCount = countEl.textContent;
      }
      if (countEl) {
        let base = parseInt(btn.dataset.baseCount, 10) || 0;
        // 서버 집계가 음수로 어긋난 과거 데이터 보정 — 표시는 항상 0 이상.
        if (base < 0) base = 0;
        // 본인이 반응한 상태라면 표시 카운트는 최소 1(본인 반응 1건은 항상 포함).
        // 과거 데이터/기기 간 동기화로 서버 집계가 0으로 어긋난 경우의 시각적 보정.
        if (isActive && base < 1) base = 1;
        countEl.textContent = String(base);
      }
    });
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('.reaction');
    if (!btn) return;
    // skip pre-release buttons — they have their own onclick handlers
    if (!btn.dataset.key) return;
    if (!isLoggedIn()) {
      showToast('로그인 후 좋아요를 남길 수 있어요.');
      setTimeout(() => openLogin(), 500);
      return;
    }
    const key = btn.dataset.key;
    const r = getReactions();
    const tomb = getReactionTombs();
    const wasActive = !!r[key];
    if (wasActive) { delete r[key]; tomb[key] = Date.now(); }
    else { r[key] = Date.now(); delete tomb[key]; }
    saveReactionTombs(tomb);
    saveReactions(r);

    // 서버 집계 낙관적 갱신: baseCount(서버 카운트)를 ±1 반영 후 표시
    const _ce = btn.querySelector('.r-count');
    if (_ce) {
      const _b = parseInt(btn.dataset.baseCount, 10);
      const _base = isNaN(_b) ? (parseInt(_ce.textContent, 10) || 0) : _b;
      btn.dataset.baseCount = String(Math.max(0, _base + (wasActive ? -1 : 1)));
    }
    syncReactionsState();

    // 서버 반응 카운트 증감 (rcNew/rcDeep/rcPass) — PUBLISHED 글, 로그인 사용자
    const _rm = key.match(/^(.*)-(new|deep|pass)$/);
    if (_rm && window.fb && fb.db && fb.FieldValue) {
      const _fld = { new: 'rcNew', deep: 'rcDeep', pass: 'rcPass' }[_rm[2]];
      fb.db.collection('articles').doc(_rm[1])
        .update({ [_fld]: fb.FieldValue.increment(wasActive ? -1 : 1) })
        .catch((err) => { console.warn('[reaction-count]', err && err.message); });
    }

    // "보내고 싶어요" — copy link + toast on activate
    if (!wasActive && key.endsWith('-pass')) {
      const articleId = key.replace(/-pass$/, '');
      const url = window.location.href.split('#')[0] + '#' + articleId;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(
          () => showToast('링크가 복사되었어요.<br/>친구에게 보내보세요.'),
          () => showToast('이 글의 링크: ' + url)
        );
      } else {
        showToast('이 글의 링크: ' + url);
      }
    }
  });

  /* ===== Bookmark (localStorage) ===== */
  function getBookmarks() {
    try { return JSON.parse(localStorage.getItem('persp_bookmarks') || '[]'); }
    catch(e) { return []; }
  }
  function saveBookmarks(b) {
    localStorage.setItem('persp_bookmarks', JSON.stringify(b));
    _cloudPushArchive();
  }
  // 책갈피 추가 시각({id: ts}) + 해제 묘비({id: ts}) — 반응/메모와 동일하게
  // 추가는 기기 간 전파되고, 더 최근의 '책갈피 해제'는 되살아나지 않게 한다.
  function getBookmarkTs() {
    try { const o = JSON.parse(localStorage.getItem('persp_bookmarks_ts') || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch(e) { return {}; }
  }
  function saveBookmarkTs(o) {
    try { localStorage.setItem('persp_bookmarks_ts', JSON.stringify(o || {})); } catch(e) {}
  }
  function getBookmarkTombs() {
    try { const o = JSON.parse(localStorage.getItem('persp_bookmarks_del') || '{}'); return (o && typeof o === 'object') ? o : {}; }
    catch(e) { return {}; }
  }
  function saveBookmarkTombs(o) {
    try { localStorage.setItem('persp_bookmarks_del', JSON.stringify(o || {})); } catch(e) {}
  }

  // ===== After Reading: 비공개 한 줄 메모 (articleId → {text, ts}) =====
  function getMemos() {
    try { return JSON.parse(localStorage.getItem('persp_memos') || '{}'); }
    catch(e) { return {}; }
  }
  function saveMemos(obj) {
    localStorage.setItem('persp_memos', JSON.stringify(obj || {}));
    _cloudPushArchive();
  }
  // 메모 삭제 묘비: {id: ts} — 기기 간 동기화에서 '삭제한 메모'가 되살아나지 않도록 추적
  function getMemoTombs() {
    try { return JSON.parse(localStorage.getItem('persp_memos_del') || '{}'); }
    catch(e) { return {}; }
  }
  function saveMemoTombs(t) {
    try { localStorage.setItem('persp_memos_del', JSON.stringify(t || {})); } catch(e) {}
  }
  function getArticleMemo(id) {
    const m = getMemos();
    return (m && m[id]) || null;
  }
  function setArticleMemo(id, text) {
    if (!id) return;
    const m = getMemos();
    const tomb = getMemoTombs();
    const t = String(text || '').trim();
    if (!t) { delete m[id]; tomb[id] = Date.now(); }
    else { m[id] = { text: t.slice(0, 1000), ts: Date.now() }; delete tomb[id]; }
    saveMemoTombs(tomb);
    saveMemos(m);
  }

  /* ============================================================
     나의 서재 클라우드 동기화 (로그인 계정 기준)
     - 로컬(localStorage)을 그대로 유지하면서, 로그인 시 Firestore
       users/{uid}.archive 와 양방향 병합 → 기기 간 공유
     ============================================================ */
  let _archiveSyncTimer = null;
  let _archivePulling = false;       // pull/apply 중 push 방지
  let _archivePulledForUid = null;   // 세션 내 중복 구독 방지
  let _archiveUnsub = null;          // onSnapshot 해제 함수 (실시간 동기화)

  function _archiveOwner() {
    try { return localStorage.getItem('persp_owner_uid') || ''; } catch(e) { return ''; }
  }
  function _setArchiveOwner(uid) {
    try { localStorage.setItem('persp_owner_uid', uid || ''); } catch(e) {}
  }
  function _mergeBookmarks(a, b) {
    const out = []; const seen = new Set();
    [...(a || []), ...(b || [])].forEach(id => {
      if (id == null || seen.has(id)) return;
      seen.add(id); out.push(id);
    });
    return out;
  }
  function _mergeSentences(a, b, tombs) {
    const dead = new Set(tombs || getSentenceTombs());
    const map = new Map();
    [...(a || []), ...(b || [])].forEach(s => {
      if (!s || !s.text) return;
      const key = _sentenceKey(s);
      if (dead.has(key)) return; // 삭제된 문장은 부활시키지 않음
      if (!map.has(key)) map.set(key, s);
    });
    return Array.from(map.values()).sort((x, y) => (y.ts || 0) - (x.ts || 0));
  }
  function _mergeHistory(a, b) {
    const map = new Map();
    [...(a || []), ...(b || [])].forEach(h => {
      if (!h || !h.id) return;
      const ex = map.get(h.id);
      if (!ex) map.set(h.id, Object.assign({}, h));
      else {
        ex.progress = Math.max(ex.progress || 0, h.progress || 0);
        ex.ts = Math.max(ex.ts || 0, h.ts || 0);
      }
    });
    return Array.from(map.values()).sort((x, y) => (y.ts || 0) - (x.ts || 0)).slice(0, 30);
  }
  // 묘비(ts)들의 합집합 — 같은 키는 최신 ts 사용
  function _mergeTombs(a, b) {
    const out = {};
    [a || {}, b || {}].forEach(src => {
      Object.keys(src || {}).forEach(k => {
        const t = +src[k] || 0;
        if (t > (out[k] || 0)) out[k] = t;
      });
    });
    return out;
  }
  // 존재맵({key: ts}) + 묘비 LWW 병합 — 추가는 합치고, 더 최근의 취소는 제거 유지.
  // 반환: { vals, tomb } (둘 다 localStorage/클라우드에 다시 저장)
  function _mergeTsMap(aVals, bVals, aTomb, bTomb) {
    const addTs = {};
    [aVals || {}, bVals || {}].forEach(src => {
      Object.keys(src || {}).forEach(k => {
        const t = +src[k] || 1; // 과거 값(1/truthy)은 가장 오래된 것으로 취급
        if (t > (addTs[k] || 0)) addTs[k] = t;
      });
    });
    const delTs = _mergeTombs(aTomb, bTomb);
    const vals = {}, tomb = {};
    Object.keys(addTs).forEach(k => {
      if (addTs[k] >= (delTs[k] || 0)) vals[k] = addTs[k]; // 추가가 취소보다 최신 → 존재
    });
    Object.keys(delTs).forEach(k => {
      if (delTs[k] > (addTs[k] || 0)) tomb[k] = delTs[k];  // 취소가 더 최신 → 묘비 유지
    });
    return { vals: vals, tomb: tomb };
  }
  // 메모 LWW 병합(+ 묘비) — 추가/수정은 최신 ts 우선, 더 최근 삭제는 제외.
  function _mergeMemos(a, b, aTomb, bTomb) {
    const out = {};
    [b || {}, a || {}].forEach(src => {
      Object.keys(src || {}).forEach(id => {
        const cur = out[id], v = src[id];
        if (!v) return;
        if (!cur || (v.ts || 0) >= (cur.ts || 0)) out[id] = v; // 최신 ts 우선
      });
    });
    const delTs = _mergeTombs(aTomb, bTomb);
    Object.keys(delTs).forEach(id => {
      if (out[id] && delTs[id] > (out[id].ts || 0)) delete out[id]; // 더 최근 삭제 → 제외
    });
    return out;
  }
  function _cloudPushArchive() {
    if (_archivePulling) return;
    if (!window.fb || !fb.currentUser || !fb.currentUser()) return;
    clearTimeout(_archiveSyncTimer);
    _archiveSyncTimer = setTimeout(function() {
      const ref = fb.userRef && fb.userRef();
      if (!ref) return;
      const payload = {
        bookmarks: getBookmarks(),
        bookmarksTs: getBookmarkTs(),
        bookmarksDel: getBookmarkTombs(),
        sentences: getSentences(),
        sentencesDel: getSentenceTombs(),
        history: getHistory(),
        reactions: getReactions(),
        reactionsDel: getReactionTombs(),
        memos: getMemos(),
        memosDel: getMemoTombs(),
        seriesWaits: getSeriesWaits(),
        seriesWaitsDel: getSeriesWaitTombs(),
        cheers: getCheers(),
        cheersDel: getCheerTombs(),
        updatedAt: Date.now()
      };
      // archive 필드를 통째로 교체(update)한다. set(merge:true)는 중첩 맵을
      // 깊은 병합하기 때문에 reactions/memos 등을 {}로 비워도 클라우드의 옛 키가
      // 남아 캐시 삭제 후 되살아난다. update는 해당 필드를 통째로 덮어써 삭제가 유지된다.
      ref.update({ archive: payload }).catch(function(e){
        // 문서가 아직 없으면(최초) update가 실패 → set으로 생성
        ref.set({ archive: payload }, { merge: true }).catch(function(e2){
          console.warn('[sync] 아카이브 저장 실패:', e2 && e2.message);
        });
      });
    }, 800);
  }
  // 클라우드 archive를 로컬에 반영 (소유자에 따라 병합 또는 교체)
  function _applyCloudArchive(cloud, uid) {
    cloud = cloud || {};
    const owner = _archiveOwner();
    const mergeLocal = (!owner) || (owner === uid); // 익명 데이터 이관 또는 동일 계정 → 병합
    // 문장 삭제 묘비: 로컬+클라우드 합집합으로 누적(삭제는 모든 기기에 전파·유지)
    const cloudTombs = Array.isArray(cloud.sentencesDel) ? cloud.sentencesDel : [];
    const tombs = mergeLocal
      ? Array.from(new Set([...(getSentenceTombs()), ...cloudTombs]))
      : cloudTombs.slice();
    let b, bTs, bTomb, s, h, r, rTomb, mm, mmTomb;
    if (mergeLocal) {
      // 책갈피: ts LWW + 묘비 병합 — 추가는 기기 간 전파되고, 더 최근의 '해제'는 유지(되살아나지 않음).
      const _laTs = getBookmarkTs(); getBookmarks().forEach(id => { if (id != null && _laTs[id] == null) _laTs[id] = 1; });
      const _lbTs = (cloud.bookmarksTs && typeof cloud.bookmarksTs === 'object') ? Object.assign({}, cloud.bookmarksTs) : {};
      (Array.isArray(cloud.bookmarks) ? cloud.bookmarks : []).forEach(id => { if (id != null && _lbTs[id] == null) _lbTs[id] = 1; });
      const _bmix = _mergeTsMap(_laTs, _lbTs, getBookmarkTombs(), cloud.bookmarksDel);
      bTs = _bmix.vals; bTomb = _bmix.tomb;
      b = Object.keys(bTs).sort((x, y) => (bTs[x] || 0) - (bTs[y] || 0));
      s = _mergeSentences(getSentences(), cloud.sentences, tombs);
      h = _mergeHistory(getHistory(), cloud.history);
      // 반응: 타임스탬프 LWW + 묘비 병합 — 추가는 기기 간 합쳐지고, 더 최근의 취소는 유지.
      const _rmix = _mergeTsMap(getReactions(), cloud.reactions, getReactionTombs(), cloud.reactionsDel);
      r = _rmix.vals; rTomb = _rmix.tomb;
      // 메모: 타임스탬프 LWW + 묘비 — 추가/수정은 최신 ts 우선, 더 최근 삭제는 제외.
      mm = _mergeMemos(getMemos(), cloud.memos, getMemoTombs(), cloud.memosDel);
      mmTomb = _mergeTombs(getMemoTombs(), cloud.memosDel);
    } else {
      // 다른 계정의 로컬 데이터 → 섞지 않고 클라우드로 교체 (계정 간 유출 방지)
      b = cloud.bookmarks || [];
      bTs = (cloud.bookmarksTs && typeof cloud.bookmarksTs === 'object') ? cloud.bookmarksTs : {};
      bTomb = (cloud.bookmarksDel && typeof cloud.bookmarksDel === 'object') ? cloud.bookmarksDel : {};
      const _dead = new Set(tombs);
      s = (cloud.sentences || []).filter(x => x && !_dead.has(_sentenceKey(x)));
      h = cloud.history || [];
      r = cloud.reactions || {};
      rTomb = cloud.reactionsDel || {};
      mm = cloud.memos || {};
      mmTomb = cloud.memosDel || {};
    }
    localStorage.setItem('persp_bookmarks', JSON.stringify(b));
    saveBookmarkTs(bTs || {});
    saveBookmarkTombs(bTomb || {});
    localStorage.setItem('persp_sentences', JSON.stringify(s));
    localStorage.setItem('persp_sentences_del', JSON.stringify(tombs.slice(-500)));
    localStorage.setItem('persp_history', JSON.stringify(h));
    localStorage.setItem('persp_reactions', JSON.stringify(r));
    localStorage.setItem('persp_reactions_del', JSON.stringify(rTomb));
    localStorage.setItem('persp_memos', JSON.stringify(mm));
    localStorage.setItem('persp_memos_del', JSON.stringify(mmTomb));
    // 시리즈 알림 신청: 메모와 동일하게 ts LWW + 묘비 병합 — 신청은 기기 간 전파되고,
    // 더 최근의 '알림 해제'는 다른 기기/새로고침에서도 유지되어 되살아나지 않는다.
    try {
      const cloudWaits = (cloud.seriesWaits && typeof cloud.seriesWaits === 'object') ? cloud.seriesWaits : {};
      const cloudWaitsDel = (cloud.seriesWaitsDel && typeof cloud.seriesWaitsDel === 'object') ? cloud.seriesWaitsDel : {};
      if (mergeLocal) {
        const sw = _mergeMemos(getSeriesWaits(), cloudWaits, getSeriesWaitTombs(), cloudWaitsDel);
        localStorage.setItem('persp_series_waits', JSON.stringify(sw));
        saveSeriesWaitTombs(_mergeTombs(getSeriesWaitTombs(), cloudWaitsDel));
      } else {
        localStorage.setItem('persp_series_waits', JSON.stringify(cloudWaits));
        saveSeriesWaitTombs(cloudWaitsDel);
      }
    } catch (e) {}
    // 응원(기대돼요): 반응과 동일하게 타임스탬프 LWW + 묘비 병합 → '기다리는 콘텐츠'
    // 가 기기 간 추가는 전파되고, 취소는 되살아나지 않음. 다른 계정은 클라우드로 교체.
    try {
      if (mergeLocal) {
        const _cmix = _mergeTsMap(getCheers(), cloud.cheers, getCheerTombs(), cloud.cheersDel);
        localStorage.setItem('persp_cheers', JSON.stringify(_cmix.vals));
        saveCheerTombs(_cmix.tomb);
      } else {
        localStorage.setItem('persp_cheers', JSON.stringify((cloud.cheers && typeof cloud.cheers === 'object') ? cloud.cheers : {}));
        saveCheerTombs((cloud.cheersDel && typeof cloud.cheersDel === 'object') ? cloud.cheersDel : {});
      }
    } catch (e) {}
    _setArchiveOwner(uid);
    // 현재 화면 갱신
    const view = document.body.getAttribute('data-view');
    if (view === 'mypage' && typeof renderMyPage === 'function') renderMyPage();
    if (view === 'article') {
      if (typeof syncReactionsState === 'function') syncReactionsState();
      if (typeof syncBookmarkState === 'function') syncBookmarkState();
    }
  }
  // 실시간 동기화: users/{uid} 문서를 구독하여 다른 기기 변경을 즉시 반영
  function _cloudSubscribe() {
    if (!window.fb || !fb.currentUser) return;
    const user = fb.currentUser();
    if (!user) return;
    // 이미 같은 계정으로 구독 중이면 재구독하지 않음
    if (_archivePulledForUid === user.uid && _archiveUnsub) return;
    if (_archiveUnsub) { try { _archiveUnsub(); } catch(e){} _archiveUnsub = null; }
    const ref = fb.userRef && fb.userRef();
    if (!ref) return;
    _archivePulledForUid = user.uid;
    let first = true;
    _archiveUnsub = ref.onSnapshot(function(doc) {
      // 자신이 방금 쓴(서버 미확정) 스냅샷은 건너뛰어 에코 루프 방지
      if (doc.metadata && doc.metadata.hasPendingWrites) return;
      const cloud = (doc.exists && doc.data() && doc.data().archive) || {};
      _archivePulling = true;
      _applyCloudArchive(cloud, user.uid);
      _archivePulling = false;
      if (first) {
        first = false;
        _cloudPushArchive(); // 최초: 로컬+클라우드 병합 결과 업로드(익명 데이터 이관 포함)
      }
    }, function(err) {
      console.warn('[sync] 실시간 동기화 실패:', err && err.message);
      _archivePulling = false;
    });
  }
  function _cloudUnsubscribe() {
    if (_archiveUnsub) { try { _archiveUnsub(); } catch(e){} _archiveUnsub = null; }
    _archivePulledForUid = null;
  }
  function syncBookmarkState() {
    const b = getBookmarks();
    document.querySelectorAll('.bookmark-btn').forEach(btn => {
      const id = btn.dataset.articleId;
      btn.classList.toggle('active', b.indexOf(id) !== -1);
    });
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('.bookmark-btn');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.articleId;
    const b = getBookmarks();
    const isRemoving = b.indexOf(id) !== -1;
    if (isRemoving) {
      const title = ARTICLES[id]?.title || '이 글';
      openConfirm({
        title: '책갈피 해제',
        msg: `<strong>${escHTML(title)}</strong>을(를)<br/>책갈피에서 제외할까요?`,
        confirmText: '제외',
        onConfirm: () => {
          const updated = getBookmarks().filter(x => x !== id);
          const _ts = getBookmarkTs(); delete _ts[id]; saveBookmarkTs(_ts);
          const _tomb = getBookmarkTombs(); _tomb[id] = Date.now(); saveBookmarkTombs(_tomb);
          saveBookmarks(updated);
          syncBookmarkState();
          if (document.body.getAttribute('data-view') === 'mypage') renderMyPage();
          showToast('책갈피에서 제외했어요.');
        }
      });
    } else {
      b.push(id);
      const _ts = getBookmarkTs(); _ts[id] = Date.now(); saveBookmarkTs(_ts);
      const _tomb = getBookmarkTombs(); delete _tomb[id]; saveBookmarkTombs(_tomb);
      saveBookmarks(b);
      syncBookmarkState();
      showToast('책갈피에 저장했어요.');
    }
  });

  // 장소 카드 → 카카오맵 열기.
  // 현재 에디터가 삽입하는 카드는 <a href="map.kakao.com/...">라서 이 핸들러가 필요 없다.
  // 여기서는 링크가 없던 구버전 카드(<div class="map-box">)만 보조로 처리한다.
  document.addEventListener('click', e => {
    const box = e.target.closest('.map-box');
    if (!box) return;
    if (box.closest('a') || box.tagName === 'A') return;   // 링크형 카드는 브라우저에 맡긴다
    const addrEl = box.querySelector('.map-box-addr');
    const nameEl = box.querySelector('.map-box-name');
    const query = ((addrEl && addrEl.textContent) || (nameEl && nameEl.textContent) || '').trim();
    if (!query) return;
    window.open('https://map.kakao.com/link/search/' + encodeURIComponent(query), '_blank', 'noopener');
  });

  // initial sync
  syncReactionsState();
  syncBookmarkState();
  /* Filterbar scroll hint — toggle classes based on scroll position */
  (function() {
    const filterbar = document.getElementById('filterbar');
    const tabs = document.getElementById('tabs');
    if (!filterbar || !tabs) return;
    function updateHint() {
      const scrollable = tabs.scrollWidth > tabs.clientWidth + 2;
      if (!scrollable) {
        filterbar.classList.add('at-end');
        filterbar.classList.remove('scrolled');
        return;
      }
      const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 4;
      filterbar.classList.toggle('at-end', atEnd);
      filterbar.classList.toggle('scrolled', tabs.scrollLeft > 4);
    }
    tabs.addEventListener('scroll', updateHint, { passive: true });
    window.addEventListener('resize', updateHint);
    updateHint();
  })();

  document.querySelectorAll('.tab').forEach(c => {
    c.addEventListener('click', e => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      c.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });

  /* ===== Carousel ===== */
  // 이전에 등록된 carousel(타이머/리스너) 정리용 핸들
  let _carouselTeardown = null;
  // 영상 모달이 캐러셀 자동재생을 일시정지/재개할 수 있도록 노출하는 훅
  // (캐러셀이 없는 페이지 — article.html 등 — 에서는 null로 남아 안전하게 무시된다)
  let _pauseCarousel = null;
  let _playCarousel = null;
  function initCarousel() {
    // 재초기화 시 기존 타이머/이벤트 정리
    if (typeof _carouselTeardown === 'function') {
      try { _carouselTeardown(); } catch(e) {}
      _carouselTeardown = null;
    }
    const carousel = document.getElementById('carousel');
    if (!carousel) return;
    const track = document.getElementById('carouselTrack');
    const slides = track.querySelectorAll('.carousel-slide');
    const numEl = document.getElementById('carouselNum');
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');
    const bar = document.getElementById('carouselProgress');
    const ppBtn = document.getElementById('carouselPlayPause');
    const icoPause = ppBtn.querySelector('.ico-pause');
    const icoPlay = ppBtn.querySelector('.ico-play');
    const total = slides.length;
    // 카운터 total 표시 동기화
    const totalEl = carousel.querySelector('.carousel-counter .total');
    if (totalEl) totalEl.textContent = String(total);
    const controls = carousel.querySelector('.carousel-controls');
    // 슬라이드가 없으면(hero 미설정) 숨기는 대신 아주 연한 회색 플레이스홀더로 영역 유지
    if (total === 0) {
      if (!track.querySelector('.carousel-placeholder')) {
        track.innerHTML = '<div class="carousel-placeholder" aria-hidden="true"></div>';
      }
      carousel.classList.add('carousel-empty');
      carousel.style.display = '';
      if (controls) controls.style.display = 'none';
      return;
    }
    carousel.classList.remove('carousel-empty');
    if (controls) controls.style.display = '';
    carousel.style.display = '';
    const DURATION = 7000;
    let current = 0;
    let timer;
    let playing = true;

    function setBarPlaying() {
      bar.classList.remove('run');
      bar.style.removeProperty('width');
      // force reflow so the next class change re-triggers the transition
      void bar.offsetWidth;
      bar.classList.add('run');
    }
    function freezeBar() {
      const w = getComputedStyle(bar).width;
      bar.style.width = w;
      bar.classList.remove('run');
    }
    function resetBar() {
      bar.classList.remove('run');
      bar.style.width = '0%';
    }

    function go(i) {
      current = (i + total) % total;
      track.style.transform = 'translateX(-' + (current * 100) + '%)';
      numEl.textContent = String(current + 1);
      if (playing) setBarPlaying();
    }
    function next() { go(current + 1); }
    function prev() { go(current - 1); }

    function play() {
      stopTimer();
      playing = true;
      icoPause.style.display = '';
      icoPlay.style.display = 'none';
      ppBtn.setAttribute('aria-label', 'Pause');
      setBarPlaying();
      timer = setInterval(next, DURATION);
    }
    function pause() {
      stopTimer();
      playing = false;
      icoPause.style.display = 'none';
      icoPlay.style.display = '';
      ppBtn.setAttribute('aria-label', 'Play');
      freezeBar();
    }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    // 영상 모달이 호출할 수 있도록 캐러셀 일시정지/재개를 모듈 스코프에 노출
    _pauseCarousel = pause;
    _playCarousel = play;

    // AbortController로 모든 이벤트 리스너 정리 가능하게 함
    const ac = new AbortController();
    const sig = { signal: ac.signal };

    nextBtn.addEventListener('click', e => { e.stopPropagation(); next(); if (playing) play(); }, sig);
    prevBtn.addEventListener('click', e => { e.stopPropagation(); prev(); if (playing) play(); }, sig);
    ppBtn.addEventListener('click', e => { e.stopPropagation(); playing ? pause() : play(); }, sig);

    // touch swipe
    let touchStartX = 0;
    track.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true, signal: ac.signal });
    track.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) {
        dx < 0 ? next() : prev();
        if (playing) play();
      }
    }, sig);

    _carouselTeardown = function() {
      stopTimer();
      _pauseCarousel = null;
      _playCarousel = null;
      try { ac.abort(); } catch(e) {}
    };

    play();
  }
  // 초기 1회 실행 — 정적 슬라이드 기준
  initCarousel();

  /* ===== Video modal (캐러셀과 분리 — article.html 등 캐러셀 없는 페이지에서도 동작) ===== */
  // 페이지당 한 번만 바인딩. #videoModal이 있는 모든 페이지에서 window.openVideo/closeVideo 정의.
  function bindVideoModal() {
    const modal = document.getElementById('videoModal');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';
    // YouTube IFrame API(infoDelivery)로 현재 재생 위치를 추적 → 아티클 이어재생에 사용
    window.addEventListener('message', function(e) {
      if (typeof e.data !== 'string') return;
      if (String(e.origin).indexOf('youtube') === -1) return;
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      if (d && d.event === 'infoDelivery' && d.info && typeof d.info.currentTime === 'number') {
        _videoCurrentTime = d.info.currentTime;
      }
    });
    window.openVideo = function(opts) {
      opts = opts || {};
      // 독자 전용(무료 공개가 아닌) 영상 — 비로그인 시 전체화면 진입 대신
      // 아티클 페이지(독자 전용 안내)로 이동. 로그인창을 띄우지 않는다(거절감 완화).
      if (opts.free !== true && !_isLoggedIn()) {
        if (opts.contentId && typeof showArticle === 'function') showArticle(opts.contentId);
        return;
      }
      _videoCurrentTime = 0;
      if (_pauseCarousel) _pauseCarousel();
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      const iframe = document.getElementById('videoIframe');
      let base = '';
      if (opts.videoId) base = 'https://www.youtube-nocookie.com/embed/' + opts.videoId;
      else if (iframe && iframe.dataset.src) base = iframe.dataset.src;
      if (iframe && base) {
        // 모바일 브라우저(iOS/Android)는 소리 있는 자동재생을 차단한다.
        // → 모바일에서는 mute=1로 자동재생을 보장하고, 사용자가 플레이어에서 음소거 해제할 수 있게 한다.
        const _isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        iframe.src = base + '?autoplay=1&rel=0&playsinline=1&enablejsapi=1' + (_isMobile ? '&mute=1' : '') + '&origin=' + encodeURIComponent(location.origin);
        // 재생 위치 수신을 위한 listening 핸드셰이크 (로드 후 몇 번 재전송)
        iframe.onload = function() {
          let tries = 0;
          const ping = setInterval(function() {
            try { iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'persp-video', channel: 'widget' }), '*'); } catch (_) {}
            if (++tries >= 6) clearInterval(ping);
          }, 400);
        };
      }
      // 메타 텍스트 업데이트 (옵션이 주어졌을 때만)
      const titleEl = modal.querySelector('.video-modal-title');
      const subEl = modal.querySelector('.video-modal-sub');
      if (titleEl && opts.title != null) titleEl.textContent = opts.title;
      if (subEl && opts.sub != null) subEl.textContent = opts.sub;
      // "아티클 같이 보기" CTA — 연결할 본문이 있을 때만 노출
      _currentVideoArticleId = opts.articleId || '';
      const cta = modal.querySelector('.video-modal-cta');
      if (cta) cta.style.display = _currentVideoArticleId ? '' : 'none';
      // YouTube 폴백 링크
      const fbLink = modal.querySelector('.video-fallback-link');
      if (fbLink && opts.videoId) fbLink.href = 'https://youtu.be/' + opts.videoId;
    };
    window.closeVideo = function() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      const iframe = document.getElementById('videoIframe');
      if (iframe) iframe.removeAttribute('src');
      if (_playCarousel) _playCarousel();
    };
    const closeBtn = document.getElementById('videoClose');
    if (closeBtn) closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      window.closeVideo();
    });
    modal.addEventListener('click', e => {
      if (e.target === modal) window.closeVideo();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('open')) window.closeVideo();
    });
  }
  bindVideoModal();

  /* ===========================================================
     비주얼 관리 — site/{page} 문서를 페이지에 적용
     - main → 홈 헤로 텍스트 오버라이드
     - about → about.html 섹션 텍스트 오버라이드
     - notice → notice.html 섹션 텍스트 오버라이드
     =========================================================== */

  // 어드민 비주얼 에디터가 저장한 값에 HTML 서식(볼드/폰트크기)이 포함됐는지 판별
  function _hasRichMarkup(str) {
    return /<(strong|b|em|i|u|span|p|br)\b[^>]*>/i.test(String(str || ''));
  }
  // 신뢰 가능한 어드민 입력이지만 방어적으로 화이트리스트 새니타이즈한다.
  // 허용 태그: strong/b, em/i, u, br, p, span(인라인 font-size 스타일만).
  // 그 외 태그·속성(onclick/href/script 등)은 모두 제거 → XSS 차단.
  function _sanitizeRich(html, mode) {
    const ALLOWED = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', SPAN: 'span', P: 'p', BR: 'br' };
    const src = document.createElement('div');
    src.innerHTML = String(html || '');
    function walk(node) {
      const frag = document.createElement('div');
      node.childNodes.forEach(child => {
        if (child.nodeType === 3) {
          frag.appendChild(document.createTextNode(child.nodeValue));
        } else if (child.nodeType === 1) {
          const map = ALLOWED[child.tagName];
          if (map === 'br') { frag.appendChild(document.createElement('br')); return; }
          if (map) {
            const el = document.createElement(map);
            if (child.tagName === 'SPAN') {
              const fs = child.style && child.style.fontSize;
              if (fs && /^[0-9.]+(px|em|rem|%)$/.test(fs)) el.style.fontSize = fs;
            }
            const inner = walk(child);
            while (inner.firstChild) el.appendChild(inner.firstChild);
            frag.appendChild(el);
          } else {
            // 허용되지 않은 태그는 벗겨내되 내부 텍스트/서식은 유지
            const inner = walk(child);
            while (inner.firstChild) frag.appendChild(inner.firstChild);
          }
        }
      });
      return frag;
    }
    // 단락(<p>)을 전부 줄바꿈(<br/>)으로 평탄화 → 에디터에서 본 그대로, 행간 폭증 방지
    const inline = walk(src).innerHTML
      .replace(/<p>(\s|<br\s*\/?>)*<\/p>/gi, '<br/>') // 빈 단락 → 한 줄 띄움
      .replace(/<\/p>\s*<p>/gi, '<br/>')
      .replace(/<\/?p>/gi, '')
      .replace(/^(\s*<br\s*\/?>)+/i, '')              // 선행 빈 줄 제거
      .replace(/(<br\s*\/?>\s*)+$/i, '')              // 후행 빈 줄 제거
      .replace(/(<br\s*\/?>\s*){3,}/gi, '<br/><br/>'); // 과도한 연속 줄바꿈 정리
    // 본문 영역(.about-text 등)은 폰트/행간/색이 p 셀렉터에 걸려 있으므로 단일 <p>로 감싼다
    if (mode === 'p') return inline ? '<p>' + inline + '</p>' : '';
    return inline;
  }

  function _nlToBr(str) {
    // 서식 HTML이면 새니타이즈해서 그대로(인라인) 렌더, 아니면 \n→<br/>
    if (_hasRichMarkup(str)) return _sanitizeRich(str, 'br');
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML.replace(/\n/g, '<br/>');
  }
  function _nlToP(str) {
    // 서식 HTML이면 새니타이즈(단일 <p>로 감싸 행간 정상화), 아니면 빈 줄(\n\n)→단락(<p>)
    if (_hasRichMarkup(str)) return _sanitizeRich(str, 'p');
    // 단락 내부의 단일 \n은 사용자가 입력한 그대로 <br/>로 유지(WYSIWYG)
    return String(str || '')
      .split(/\n\s*\n+/)
      .filter(p => p.trim() !== '')
      .map(p => {
        const div = document.createElement('div');
        div.textContent = p.trim();
        return '<p>' + div.innerHTML.replace(/\n/g, '<br/>') + '</p>';
      })
      .join('');
  }

  async function loadSiteText(page) {
    if (!window.fb || !fb.db) return null;
    try {
      const snap = await fb.db.collection('site').doc(page).get();
      return snap.exists ? snap.data() : null;
    } catch (err) {
      console.warn('[loadSiteText] ' + page + ' 로드 실패:', err.message);
      return null;
    }
  }

  function _renderSiteText(page, data) {
    if (!data) return;
    try {
      if (page === 'main') {
        const h1 = document.querySelector('.home-view .page-head h1');
        const p = document.querySelector('.home-view .page-head p');
        if (h1 && data.heroTitle != null) h1.innerHTML = _nlToBr(data.heroTitle);
        if (p && data.heroSub != null) p.innerHTML = _nlToBr(data.heroSub);
      } else if (page === 'about') {
        applyAboutText(data);
      } else if (page === 'notice') {
        applyNoticeText(data);
      }
    } catch (err) {
      console.warn('[applySiteText] ' + page + ' 적용 실패:', err);
    }
  }

  // 사이트 텍스트(main/about/notice)를 실시간 구독한다.
  // 어드민 비주얼에서 저장하면 새로고침 없이 즉시 반영된다.
  const _siteTextUnsub = {};
  function applySiteText(page) {
    if (!window.fb || !fb.db) return;
    if (_siteTextUnsub[page]) return; // 중복 구독 방지
    try {
      _siteTextUnsub[page] = fb.db.collection('site').doc(page).onSnapshot(
        snap => { if (snap.exists) _renderSiteText(page, snap.data()); },
        err => { console.warn('[applySiteText] ' + page + ' 구독 실패:', err.message); }
      );
    } catch (err) {
      console.warn('[applySiteText] ' + page + ' 구독 오류:', err);
    }
  }

  function applyAboutText(d) {
    if (!d) return;
    // Hero
    if (d.hero) {
      const heroSec = document.querySelector('.about-hero .container');
      if (heroSec) {
        const h1 = heroSec.querySelector('.about-title');
        if (h1 && d.hero.title != null) h1.innerHTML = _nlToBr(d.hero.title);
        // about-lead (두 개) · about-quote-inline 순서로 들어 있음
        const leads = heroSec.querySelectorAll('.about-lead');
        if (leads[0] && d.hero.lead != null) leads[0].innerHTML = _nlToP(d.hero.lead);
        if (leads[1] && d.hero.outro != null) leads[1].innerHTML = _nlToP(d.hero.outro);
        const quote = heroSec.querySelector('.about-quote-inline');
        if (quote && d.hero.quote != null) quote.innerHTML = _nlToBr(d.hero.quote);
      }
    }
    // section1~3 — .about-section 순서대로 매핑
    const sections = document.querySelectorAll('main.about-view > .about-section');
    const mapKeys = ['section1', 'section2', 'section3'];
    sections.forEach((sec, idx) => {
      const key = mapKeys[idx];
      const block = d[key];
      if (!block) return;
      const h2 = sec.querySelector('.about-h');
      const text = sec.querySelector('.about-text');
      if (h2 && block.title != null) h2.innerHTML = _nlToBr(block.title);
      if (text && block.body != null) text.innerHTML = _nlToP(block.body);
    });
    // Steps
    if (d.steps) {
      const stepsSec = document.querySelector('.about-steps');
      if (stepsSec) {
        const h2 = stepsSec.querySelector('.about-section-head h2');
        const intro = stepsSec.querySelector('.steps-intro');
        if (h2 && d.steps.title != null) h2.innerHTML = _nlToBr(d.steps.title);
        if (intro && d.steps.intro != null) intro.innerHTML = _nlToP(d.steps.intro);
        if (Array.isArray(d.steps.items)) {
          const timeline = stepsSec.querySelector('.step-timeline');
          if (timeline) {
            timeline.innerHTML = d.steps.items.map((it, i) => {
              const div = document.createElement('div');
              div.textContent = it.kr || '';
              const kr = div.innerHTML;
              div.textContent = it.en || '';
              const en = div.innerHTML;
              div.textContent = it.desc || '';
              const desc = div.innerHTML;
              return `<div class="step-row">
                <span class="step-no">${String(i + 1).padStart(2, '0')}</span>
                <div class="step-body">
                  <h3 class="step-kr">${kr} <span class="step-en">${en}</span></h3>
                  <p class="step-desc">${desc}</p>
                </div>
              </div>`;
            }).join('');
          }
        }
      }
    }
    // Quote
    if (d.quote) {
      const qSec = document.querySelector('.about-quote-block');
      if (qSec) {
        const qText = qSec.querySelector('.aq-quote');
        const qAttr = qSec.querySelector('.aq-attr');
        if (qText && d.quote.text != null) qText.innerHTML = _nlToBr(d.quote.text);
        if (qAttr && d.quote.cite != null) qAttr.textContent = d.quote.cite;
      }
    }
    // Services — 하드코딩 카드의 텍스트(제목/부제)만 교체.
    // href·data-inquiry·data-about-movement·data-view 등 인터랙션 속성은
    // 절대 건드리지 않는다(문의 모달·공지 링크 연결 보존).
    if (d.services && Array.isArray(d.services.items)) {
      const cards = document.querySelectorAll('.about-services .service-card');
      d.services.items.forEach((it, i) => {
        const card = cards[i];
        if (!card) return;
        const nameEl = card.querySelector('.service-name');
        const subEl = card.querySelector('.service-sub');
        if (nameEl && it.title != null) nameEl.textContent = it.title;
        if (subEl && it.desc != null) subEl.textContent = it.desc;
      });
    }
    // Editor / Contact
    if (d.editor) {
      const editor = document.querySelector('.about-editor .container');
      if (editor) {
        const note = editor.querySelector('.editor-note');
        const meta = editor.querySelector('.editor-meta');
        if (note && d.editor.note != null) note.innerHTML = _nlToBr(d.editor.note);
        if (meta && d.editor.meta != null) {
          meta.innerHTML = _nlToBr(d.editor.meta);
        }
      }
    }
  }

  function applyNoticeText(d) {
    if (!d) return;
    // 헤로
    const hero = document.querySelector('.notice-view .page-hero .container');
    if (hero) {
      const h1 = hero.querySelector('.page-title');
      if (h1) {
        const div = document.createElement('div');
        div.textContent = d.titleKo != null ? d.titleKo : '';
        const ko = div.innerHTML.replace(/\n/g, '<br/>');
        div.textContent = d.titleEn != null ? d.titleEn : '';
        const en = div.innerHTML;
        h1.innerHTML = `${ko}<br/><span class="page-title-en">${en}</span>`;
      }
      const lead = hero.querySelector('.page-lead');
      if (lead && d.lead != null) lead.innerHTML = _nlToBr(d.lead);
    }
    // notice-lead 인트로
    const body = document.querySelector('.notice-body .container');
    if (!body) return;
    const intro = body.querySelector('.notice-lead');
    if (intro && d.intro != null) intro.innerHTML = _nlToBr(d.intro);

    // 섹션 — 기존 .notice-section을 모두 제거 후 sections 배열로 재생성
    if (Array.isArray(d.sections)) {
      const oldSections = body.querySelectorAll('.notice-section');
      const afterEl = oldSections.length ? oldSections[oldSections.length - 1] : null;
      // 모든 기존 섹션 제거
      oldSections.forEach(el => el.remove());
      // 인트로 다음 위치에 삽입
      const insertAfter = intro || body.firstChild;
      const html = d.sections.map((sec, i) => {
        const div = document.createElement('div');
        div.textContent = sec.title || '';
        const title = div.innerHTML;
        return `<div class="notice-section">
          <h2 class="notice-h">${i + 1}. ${title}</h2>
          ${_nlToP(sec.body)}
        </div>`;
      }).join('');
      if (insertAfter && insertAfter.insertAdjacentHTML) {
        insertAfter.insertAdjacentHTML('afterend', html);
      } else {
        body.insertAdjacentHTML('afterbegin', html);
      }
    }

    // 일자
    const dateEl = body.querySelector('.notice-date');
    if (dateEl && d.date != null) dateEl.textContent = d.date;

    // 문의하기 링크
    const cta = body.querySelector('.notice-cta');
    if (cta && d.contactEmail) cta.setAttribute('href', 'mailto:' + d.contactEmail);
  }

  // 외부 노출
  window.loadSiteText = loadSiteText;
  window.applySiteText = applySiteText;

  /* ===========================================================
     HERO — site/hero 문서에서 carousel 슬라이드를 동적으로 구성
     site/hero: { items: [articleId, ...], updatedAt }
     비어 있거나 실패하면 정적 슬라이드(index.html)에 그대로 둠.
     =========================================================== */
  function _heroLabelFor(a) {
    if (a.seriesName && a.seriesNo != null) {
      const no = String(a.seriesNo).padStart(2, '0');
      const total = a.seriesTotal != null ? String(a.seriesTotal).padStart(2, '0') : '';
      return total
        ? `${a.seriesName} · ${no} / ${total}`
        : `${a.seriesName} · ${no}`;
    }
    return a.cat || '';
  }
  // 히어로 우측 상단 라벨: 콘텐츠 포맷을 영문으로 표시 (상세는 타이틀 위에 있음)
  function _heroFormatLabel(a) {
    if (a.videoMode) return 'Movie';
    if (a.podcastMode) return 'Podcast';
    if (a.seriesName) return 'Series';
    return 'Article';
  }
  // 영상 콘텐츠 슬라이드 클릭 → 전체화면 비디오 모달
  // 로그인 여부 — body.logged-in 클래스를 1차 신호로, fb.currentUser()를 보조로 사용
  function _isLoggedIn() {
    if (document.body && document.body.classList.contains('logged-in')) return true;
    try { return !!(window.fb && typeof fb.currentUser === 'function' && fb.currentUser()); } catch (_) { return false; }
  }
  let _heroVideoMap = {};
  function openHeroVideo(id) {
    const o = _heroVideoMap[id];
    if (!o) return;
    // 독자 전용 영상 + 비회원 → 전체화면 진입 대신 아티클 페이지(독자 전용 안내)로 이동
    if (o.free !== true && !_isLoggedIn()) {
      if (typeof showArticle === 'function') showArticle(id);
      return;
    }
    if (typeof window.openVideo === 'function') window.openVideo(o);
  }
  window.openHeroVideo = openHeroVideo;
  // 카드(최신글 등) 클릭 → 영상 콘텐츠면 전체화면 모달, 아니면 아티클로 이동
  function openCardVideo(id) {
    const a = (typeof _lookupArticle === 'function' ? _lookupArticle(id) : null) || (window.ARTICLES || {})[id];
    const vid = a ? (a.videoId || _parseYouTubeId(a.videoUrl || '')) : '';
    // 영상 콘텐츠
    if (a && a.videoMode && vid) {
      // 독자 전용 영상 + 비회원 → 전체화면 진입 대신 아티클 페이지(독자 전용 안내)로 이동
      if (a.free !== true && !_isLoggedIn()) {
        if (typeof showArticle === 'function') showArticle(id);
        return;
      }
      // 비회원도 볼 수 있거나(무료) 로그인 회원 → 전체화면 모달 재생
      if (typeof window.openVideo === 'function') {
        window.openVideo({
          videoId: vid,
          title: a.title || '',
          sub: (a.cat || a.category || '') + (a.date ? ' · ' + a.date : ''),
          articleId: id,
          contentId: id,
          free: !!a.free
        });
        return;
      }
    }
    if (typeof showArticle === 'function') showArticle(id);
  }
  window.openCardVideo = openCardVideo;
  function _parseYouTubeId(url) {
    if (!url) return '';
    const patterns = [/youtu\.be\/([\w-]{6,})/, /youtube\.com\/watch\?v=([\w-]{6,})/, /youtube\.com\/embed\/([\w-]{6,})/, /youtube\.com\/shorts\/([\w-]{6,})/];
    for (const p of patterns) { const m = String(url).match(p); if (m) return m[1]; }
    return '';
  }
  function _hasBodyContent(html) {
    if (!html) return false;
    const stripped = String(html).replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, '').replace(/<[^>]*>/g, '').trim();
    return stripped.length > 0;
  }
  // 히어로 썸네일 마크업 — 모바일(≤900px)에선 thumbMobile(세로 4:5) 우선, 없으면 thumb 폴백
  function _heroThumbHtml(thumb, mobileThumb, alt) {
    const t = escHTML(thumb || '');
    const altA = escHTML(alt || '');
    if (mobileThumb) {
      const m = escHTML(mobileThumb);
      return `<picture>
        <source media="(max-width: 900px)" srcset="${m}" />
        <img src="${t}" alt="${altA}" />
      </picture>`;
    }
    return `<img src="${t}" alt="${altA}" />`;
  }
  function _buildHeroSlide(a) {
    const seriesLabel = _heroLabelFor(a);
    // 카드와 동일한 규칙: 우측에 픽토그램만 나란히 (모두에게 공개 · 지도 있음)
    const heroFree = a.free
      ? ''
      : '<span class="featured-lock" aria-label="독자 전용" title="로그인한 독자만 볼 수 있어요"><i class="fa-solid fa-lock"></i></span>';
    const _hp = a.place;
    const heroPlace = (_hp && isFinite(parseFloat(_hp.lat)) && isFinite(parseFloat(_hp.lng)))
      ? '<span class="featured-place" aria-label="지도 있음" title="지도 있음"><i class="fa-solid fa-location-dot"></i></span>'
      : '';
    const heroMarks = '<span class="featured-marks"><span class="featured-format">'
      + escHTML(_heroFormatLabel(a)) + '</span>' + heroFree + heroPlace + '</span>';
    // 영상 콘텐츠 — 전체화면 비디오 모달로 재생
    if (a.videoMode && a.videoId) {
      _heroVideoMap[a.id] = {
        videoId: a.videoId,
        title: a.title || '',
        sub: (seriesLabel || '인터뷰') + (a.date ? ' · ' + a.date : ''),
        articleId: a.id,
        contentId: a.id,
        free: !!a.free
      };
      const safeVid = String(a.id || '').replace(/'/g, "\\'");
      const thumb = a.thumb || ('https://img.youtube.com/vi/' + a.videoId + '/maxresdefault.jpg');
      return `
      <article class="featured carousel-slide" onclick="openHeroVideo('${safeVid}')">
        <div class="featured-thumb">${_heroThumbHtml(thumb, a.thumbMobile, a.title)}</div>
        <div class="featured-overlay"></div>
        <div class="video-play-btn"><i class="fa-solid fa-play"></i></div>
        <div class="featured-top">
          <span class="badge">VIDEO</span>
          ${heroMarks}
        </div>
        <div class="featured-bottom">
          <div class="featured-meta">
            <span>${escHTML(a.cat || '')}</span>
            <span class="divider"></span>
            <span>${escHTML(a.date || '')}</span>
          </div>
          <h2 class="featured-title">${escHTML(a.title || '')}</h2>
          <p class="featured-excerpt">${escHTML(a.sub || '')}</p>
          <span class="featured-cta">
            Watch
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </span>
        </div>
      </article>`;
    }
    const safeId = String(a.id || '').replace(/'/g, "\\'");
    return `
      <article class="featured carousel-slide" onclick="showArticle('${safeId}')">
        <div class="featured-thumb">${_heroThumbHtml(a.thumb, a.thumbMobile, a.title)}</div>
        <div class="featured-overlay"></div>
        <div class="featured-top">
          <span class="badge">FEATURED</span>
          ${heroMarks}
        </div>
        <div class="featured-bottom">
          <div class="featured-meta">
            <span>${escHTML(a.cat || '')}</span>
            <span class="divider"></span>
            <span>${escHTML(a.date || '')}</span>
          </div>
          <h2 class="featured-title">${escHTML(a.title || '')}</h2>
          <p class="featured-excerpt">${escHTML(a.sub || '')}</p>
          <span class="featured-cta">
            Read more
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </span>
        </div>
      </article>`;
  }

  // site/hero 를 실시간 구독한다.
  // 어드민 '히어로 관리'에서 저장하면 방문자 화면이 새로고침 없이 바뀐다.
  let _heroUnsub = null;
  function loadHeroArticles() {
    const track = document.getElementById('carouselTrack');
    if (!track) return; // 홈이 아니면 스킵
    if (!window.fb || !fb.db) return;
    if (_heroUnsub) _heroUnsub();
    _heroUnsub = fb.db.collection('site').doc('hero').onSnapshot(doc => {
      if (!doc || !doc.exists) return;
      const data = doc.data() || {};
      const ids = Array.isArray(data.items) ? data.items.filter(x => typeof x === 'string') : [];
      if (ids.length === 0) return;
      _renderHeroFromIds(ids);
    }, err => {
      console.warn('[hero] site/hero 구독 실패:', err.message);
    });
  }

  async function _renderHeroFromIds(ids) {
    const track = document.getElementById('carouselTrack');
    if (!track) return;

    // Firestore에서 PUBLISHED 글을 일괄 조회 (개별 fetch)
    const promises = ids.map(id => fb.db.collection('articles').doc(id).get()
      .then(snap => ({ id, src: 'firestore', data: snap.exists ? snap.data() : null }))
      .catch(() => ({ id, src: 'firestore', data: null }))
    );
    const results = await Promise.all(promises);

    const articles = ids.map((id, i) => {
      const r = results[i];
      if (r.data && r.data.status === 'PUBLISHED') {
        const d = r.data;
        return {
          id,
          title: d.title || '',
          sub: d.sub || '',
          cat: d.cat || d.category || '',
          date: d.date || '',
          thumb: d.thumb || d.thumbnail || '',
          thumbMobile: d.thumbMobile || '',
          free: !!d.free,
          seriesName: d.seriesName || '',
          seriesNo: d.seriesNo != null ? d.seriesNo : null,
          seriesTotal: d.seriesTotal != null ? d.seriesTotal : null,
          videoMode: !!d.videoMode,
          podcastMode: !!d.podcastMode,
          videoId: d.videoId || _parseYouTubeId(d.videoUrl || ''),
          place: d.place || null,
          hasBody: _hasBodyContent(d.bodyHtml)
        };
      }
      // 정적 카탈로그에서 폴백
      const a = (window.ARTICLES || {})[id];
      if (a) {
        return {
          id,
          title: a.title || '',
          sub: a.sub || '',
          cat: a.cat || '',
          date: a.date || '',
          thumb: a.thumb || '',
          free: !!a.free,
          seriesName: '', seriesNo: null, seriesTotal: null,
          videoMode: !!a.videoMode,
          podcastMode: !!a.podcastMode,
          videoId: a.videoId || _parseYouTubeId(a.videoUrl || ''),
          place: a.place || null,
          hasBody: _hasBodyContent(a.bodyHtml)
        };
      }
      return null;
    }).filter(Boolean);

    if (articles.length === 0) return;

    // 슬라이드 교체 + 카운터 reset + 카루셀 재초기화
    _heroVideoMap = {};
    track.innerHTML = articles.map(_buildHeroSlide).join('');
    const numEl = document.getElementById('carouselNum');
    if (numEl) numEl.textContent = '1';
    if (typeof initCarousel === 'function') initCarousel();
  }
  window.loadHeroArticles = loadHeroArticles;

  /* ===========================================================
     OPINION — 홈 카드 + 의견 스레드 페이지
     opinions/{id}: { title, description, active, order, commentCount, createdAt, updatedAt }
     opinions/{id}/comments/{cid}: { userId, userName, text, createdAt }
     =========================================================== */
  let _activeOpinionId = null;     // 홈 카드가 가리키는 활성 토픽 id
  let _currentOpinionId = null;    // opinion.html에서 보고 있는 토픽 id
  let _opinionCommentsUnsub = null;
  let _opinionCommentSnap = null;  // 최근 댓글 스냅샷(로그인/공감 상태 변화 시 재렌더용)
  let _likedCommentsSet = new Set(); // 현재 사용자가 공감한 댓글 id 집합

  // 현재 사용자가 공감(좋아요)한 댓글 목록을 user 문서에서 로드
  async function _loadLikedComments() {
    _likedCommentsSet = new Set();
    if (!window.fb || !fb.currentUser) return;
    const u = fb.currentUser();
    if (!u) return;
    try {
      const snap = await fb.userRef(u.uid).get();
      const arr = snap.exists && snap.data().likedComments;
      if (Array.isArray(arr)) arr.forEach(id => _likedCommentsSet.add(id));
    } catch (e) { /* 무시 */ }
  }

  // 저장된 스냅샷(_opinionCommentSnap)으로 댓글 목록 DOM을 렌더
  function _renderOpinionCommentList() {
    const list = document.getElementById('opinionComments');
    const snap = _opinionCommentSnap;
    if (!list || !snap) return;
    if (snap.empty) {
      list.innerHTML = '<li class="opinion-empty">아직 의견이 없습니다. 첫 의견을 남겨보세요.</li>';
      return;
    }
    const user = (window.fb && fb.currentUser) ? fb.currentUser() : null;
    const isAdmin = !!(window.fb && fb.isAdmin && fb.isAdmin());
    // 종료된 오피니언: 일반 사용자의 삭제 버튼 숨김 (관리자는 가능 — rules에서 허용)
    const hideUserDelete = _opinionPeriodState.isExpired;
    // #16 의견→인사이트: 에디터가 '인사이트'로 지정한 의견을 상단에 고정 노출.
    // 동순위 내에서는 기존 정렬(createdAt desc)을 유지하도록 안정 정렬.
    const ordered = snap.docs
      .map((d, i) => ({ d, i }))
      .sort((a, b) => {
        const fa = a.d.data().featured ? 1 : 0;
        const fb_ = b.d.data().featured ? 1 : 0;
        return (fb_ - fa) || (a.i - b.i);
      })
      .map(x => x.d);
    list.innerHTML = ordered.map(d => {
      const c = d.data();
      const isOwner = user && c.userId === user.uid;
      const date = (c.createdAt && c.createdAt.toDate) ? c.createdAt.toDate() : new Date();
      const timeStr = _formatRelativeTime(date);
      const canDelete = isAdmin || (isOwner && !hideUserDelete);
      const delBtn = canDelete
        ? `<button class="opinion-comment-delete" onclick="deleteOpinionComment('${d.id}')">삭제</button>`
        : '';
      const liked = _likedCommentsSet.has(d.id);
      const likeCnt = (typeof c.likeCount === 'number' && c.likeCount > 0) ? c.likeCount : 0;
      const likeBtn = `<button class="opinion-comment-like${liked ? ' liked' : ''}" type="button" onclick="toggleOpinionCommentLike('${d.id}')" aria-pressed="${liked ? 'true' : 'false'}" aria-label="공감">`
        + `<i class="${liked ? 'fa-solid' : 'fa-regular'} fa-thumbs-up"></i>`
        + `<span class="oc-like-count">${likeCnt}</span>`
        + `</button>`;
      const isFeatured = !!c.featured;
      const insightBadge = isFeatured
        ? `<span class="oc-insight-badge"><i class="fa-solid fa-star"></i>에디터 인사이트</span>`
        : '';
      const insightNote = (isFeatured && c.insightNote)
        ? `<div class="oc-insight-note"><i class="fa-solid fa-quote-left"></i>${escHTML(c.insightNote)}</div>`
        : '';
      // 관리자 전용: 인사이트 지정/해제 토글 (본문 아래 별도 행)
      const insightToggle = isAdmin
        ? `<div class="oc-admin-row"><button class="oc-insight-toggle${isFeatured ? ' on' : ''}" type="button" onclick="toggleOpinionCommentInsight('${d.id}', ${isFeatured ? 'true' : 'false'})">`
          + `<i class="fa-${isFeatured ? 'solid' : 'regular'} fa-star"></i>${isFeatured ? '인사이트 해제' : '인사이트 지정'}</button></div>`
        : '';
      return `
        <li class="opinion-comment${isFeatured ? ' is-insight' : ''}" data-id="${d.id}">
          ${insightBadge}
          <div class="opinion-comment-head">
            <span class="opinion-comment-author">${escHTML(c.userName || '독자')}</span>
            <span>
              <span class="opinion-comment-time">${timeStr}</span>
              ${delBtn}
            </span>
          </div>
          <div class="opinion-comment-body">
            <div class="opinion-comment-text">${escHTML(c.text || '')}</div>
            <div class="opinion-comment-foot">${likeBtn}</div>
          </div>
          ${insightNote}
          ${insightToggle}
        </li>
      `;
    }).join('');
  }

  // #16 인사이트 지정/해제 — 관리자만. 에디터가 주목한 의견을 상단 고정 + 뱃지 노출.
  // 해제 시 featured=false, insightNote=''로 비운다(필드 유지).
  window.toggleOpinionCommentInsight = async function(commentId, isFeatured) {
    if (!_currentOpinionId || !window.fb) return;
    if (!(fb.isAdmin && fb.isAdmin())) { if (typeof showToast === 'function') showToast('인사이트 지정은 관리자만 가능합니다.'); return; }
    const ref = fb.db.collection('opinions').doc(_currentOpinionId).collection('comments').doc(commentId);
    try {
      if (isFeatured) {
        await ref.update({ featured: false, insightNote: '' });
        if (typeof showToast === 'function') showToast('인사이트 지정을 해제했어요.');
      } else {
        const r = await window.sysPrompt('이 의견을 인사이트로 지정합니다.\n(선택) 에디터 코멘트를 입력하면 의견 아래에 함께 노출됩니다.', {
          title: '인사이트 지정',
          placeholder: '에디터 코멘트 (선택)',
          okLabel: '인사이트 지정',
          maxlength: 300
        });
        if (r === null) return; // 취소
        const note = (r || '').trim().slice(0, 300);
        await ref.update({ featured: true, insightNote: note, insightAt: fb.FieldValue.serverTimestamp() });
        if (typeof showToast === 'function') showToast('인사이트로 지정했어요.');
      }
      // onSnapshot 구독이 자동 재렌더하지만, 즉시성을 위해 한 번 더 그린다.
      if (_opinionCommentSnap) _renderOpinionCommentList();
    } catch (err) {
      if (typeof showToast === 'function') showToast('처리에 실패했어요.');
      console.warn('[opinion-comment-insight]', err.message);
    }
  };

  // 댓글 공감(좋아요) 토글 — 로그인 회원만, likeCount ±1 + user.likedComments 동기화
  window.toggleOpinionCommentLike = async function(commentId) {
    if (!_currentOpinionId || !window.fb) return;
    const user = fb.currentUser();
    if (!user) {
      if (typeof showToast === 'function') showToast('공감은 로그인 후 누를 수 있어요.');
      if (typeof openLogin === 'function') openLogin();
      return;
    }
    const liked = _likedCommentsSet.has(commentId);
    // 낙관적 UI: 집합 갱신 후 즉시 재렌더
    if (liked) _likedCommentsSet.delete(commentId); else _likedCommentsSet.add(commentId);
    _renderOpinionCommentList();
    const ref = fb.db.collection('opinions').doc(_currentOpinionId).collection('comments').doc(commentId);
    const uref = fb.userRef(user.uid);
    try {
      // 트랜잭션으로 서버의 실제 좋아요 여부를 확인한 뒤에만 카운트를 ±1.
      // (다른 기기/스냅샷 지연으로 _likedCommentsSet이 오래되어 있어도 likeCount 중복 증감 방지)
      await fb.db.runTransaction(async (tx) => {
        const usnap = await tx.get(uref);
        const arr = (usnap.exists && Array.isArray(usnap.data().likedComments)) ? usnap.data().likedComments : [];
        const already = arr.indexOf(commentId) !== -1;
        if (liked) {
          // 좋아요 취소: 서버에 실제로 눌러져 있을 때만 -1
          if (!already) return;
          tx.update(ref, { likeCount: fb.FieldValue.increment(-1) });
          tx.set(uref, { likedComments: fb.FieldValue.arrayRemove(commentId) }, { merge: true });
        } else {
          // 좋아요: 서버에 아직 없을 때만 +1
          if (already) return;
          tx.update(ref, { likeCount: fb.FieldValue.increment(1) });
          tx.set(uref, { likedComments: fb.FieldValue.arrayUnion(commentId) }, { merge: true });
        }
      });
    } catch (err) {
      // 롤백
      if (liked) _likedCommentsSet.add(commentId); else _likedCommentsSet.delete(commentId);
      _renderOpinionCommentList();
      if (typeof showToast === 'function') showToast('공감 처리에 실패했어요.');
      console.warn('[opinion-comment-like]', err.message);
    }
  };

  // 홈 카드 클릭 핸들러 — 기능 OFF면 모달 안내, 아니면 opinion.html로 이동
  window.openOpinion = function(id) {
    // 준비중(OFF 또는 진행 중 주제 없음) 상태에서는 클릭해도 아무 동작 안 함(헛걸음 방지)
    if (_siteSettings.opinionsEnabled === false) return;
    const card = document.querySelector('.opinion-card');
    if (card && card.classList.contains('is-disabled')) return;
    const target = id || _activeOpinionId || '';
    if (!target) return;
    window.location.href = '/opinion.html?id=' + encodeURIComponent(target);
  };

  // 진행 중(날짜 기준 active)인 토픽들을 order 오름차순으로 반환
  async function _fetchActiveOpinions() {
    if (!window.fb) return [];
    try {
      const snap = await fb.db.collection('opinions').where('active', '==', true).get();
      if (snap.empty) return [];
      const now = Date.now();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // 시작 전(pending)·종료(expired) 제외하고 실제 진행 중인 것만.
      // 진행 중이 하나도 없으면 빈 배열 → 홈/오피니언 페이지가 '준비중'으로 처리.
      const ongoing = list.filter(x => _omStatusOf(x, now).status === 'active');
      ongoing.sort((a, b) => (a.order || 0) - (b.order || 0));
      return ongoing;
    } catch (err) {
      console.warn('[opinion] _fetchActiveOpinions:', err.message);
      return [];
    }
  }

  // 사이트 설정 (오피니언·결산·문의 ON/OFF 등) 실시간 구독
  // 모든 ON/OFF 플래그는 기본 true(미설정=켜짐). 메시지는 비어 있으면 코드의 기본 문구 사용.
  const SITE_DEFAULTS = {
    opinionsEnabled: true,
    pollsEnabled: true,
    recapEnabled: true,
    inqGeneralEnabled: true,
    homeLatestRowsPC: 4,
    homeLatestMobileCount: 6,
    homeLatestMobilePaginate: false,
    homeLatestMobilePerPage: 6
  };
  let _siteSettings = Object.assign({}, SITE_DEFAULTS);
  window.getSiteSettings = function () { return _siteSettings; };
  function subscribeSiteSettings() {
    if (!window.fb) return;
    try {
      fb.db.collection('site').doc('settings').onSnapshot(snap => {
        if (snap.exists) {
          _siteSettings = Object.assign({}, SITE_DEFAULTS, snap.data());
        }
        applyOpinionFeatureFlag();
        applyPollFeatureFlag();
        applyRecapFeatureFlag();
        applyRecruitFeatureFlag();
        // 최신글 그리드 설정이 바뀌면 홈 그리드 다시 렌더
        if (typeof renderHomeLatest === 'function' && document.getElementById('latestGrid')) {
          renderHomeLatest();
        }
      }, err => console.warn('[siteSettings]', err.message));
    } catch (e) {}
  }
  // 나의 서재 '결산' 탭 노출/숨김
  function applyRecapFeatureFlag() {
    const enabled = _siteSettings.recapEnabled !== false;
    const tab = document.querySelector('.mp-tab[data-tab="recap"]');
    const panel = document.querySelector('.mp-panel[data-panel="recap"]');
    if (!tab && !panel) return; // 마이페이지가 아님
    if (tab) tab.style.display = enabled ? '' : 'none';
    if (!enabled) {
      // 결산 탭이 활성 상태였다면 기본 탭(저장한 글)으로 전환
      if (tab && tab.classList.contains('active') && typeof switchMyPageTab === 'function') {
        switchMyPageTab('saved');
      } else if (panel) {
        panel.style.display = 'none';
      }
    }
    if (typeof _updateMyPageTabsHint === 'function') _updateMyPageTabsHint();
  }
  // 홈 오피니언 카드를 '준비중' 상태로 렌더 (OFF 또는 진행 중 주제 없음 공용)
  // useCustom=true면 관리자 OFF 안내메시지 사용, 아니면 기본 문구.
  function _setOpinionPreparing(useCustom) {
    const card = document.querySelector('.opinion-card');
    if (!card) return;
    card.classList.add('is-disabled');
    card.style.display = '';
    const titleEl = card.querySelector('#homeOpinionTitle');
    const descEl = card.querySelector('#homeOpinionDesc');
    const metaEl = card.querySelector('.card-meta');
    const dotsEl = card.querySelector('#homeOpinionDots');
    const customMsg = useCustom ? (_siteSettings.opinionsDisabledMsg || '').trim() : '';
    if (titleEl) titleEl.textContent = '오피니언 라운지 준비중';
    if (descEl) descEl.textContent = customMsg || '곧 새로운 의견 주제로 찾아뵙겠습니다.';
    if (metaEl) metaEl.style.display = 'none';
    if (dotsEl) { dotsEl.hidden = true; dotsEl.innerHTML = ''; }
    if (_homeOpinionTimer) { clearInterval(_homeOpinionTimer); _homeOpinionTimer = null; }
  }
  function applyOpinionFeatureFlag() {
    const enabled = _siteSettings.opinionsEnabled !== false;
    // 홈 카드 — OFF여도 숨기지 않고 '라운지 준비중' 안내 상태로 노출
    const card = document.querySelector('.opinion-card');
    if (card) {
      card.style.display = '';
      const metaEl = card.querySelector('.card-meta');
      if (!enabled) {
        _setOpinionPreparing(true);
      } else {
        // 진행 중 주제가 있는지는 loadHomeOpinion이 판단해 is-disabled를 토글
        if (metaEl) metaEl.style.display = '';
      }
    }
    // 오피니언 스레드/라운지에서도 안내 처리 (해당 페이지에 진입했을 때)
    const view = document.body.getAttribute('data-view');
    if (!enabled && (view === 'opinion' || view === 'opinion-lounge')) {
      const main = document.querySelector('main');
      if (main && !document.getElementById('opinionDisabledNotice')) {
        const notice = document.createElement('div');
        notice.id = 'opinionDisabledNotice';
        notice.style.cssText = 'max-width:720px;margin:80px auto;padding:40px 24px;text-align:center;border:1px solid var(--line);border-radius:12px;color:var(--muted);';
        const customMsg = (_siteSettings.opinionsDisabledMsg || '').trim();
        const bodyHtml = customMsg
          ? escHTML(customMsg).replace(/\n/g, '<br>')
          : '오피니언 기능이 현재 비활성화되어 있습니다.<br>잠시 후 다시 방문해주세요.';
        notice.innerHTML = '<strong style="color:var(--fg);display:block;margin-bottom:10px;font-size:18px;">오피니언</strong>' + bodyHtml;
        main.prepend(notice);
        // 기존 콘텐츠는 숨김
        main.querySelectorAll('section, .opinion-hero, .opinion-thread, .lounge-grid').forEach(el => el.style.display = 'none');
      }
    }
  }
  // 홈 설문 카드를 '준비중' 상태로 렌더 (OFF 또는 진행 중 설문 없음 공용)
  function _setPollPreparing(useCustom) {
    const card = document.getElementById('homePollCard') || document.querySelector('.poll-card');
    if (!card) return;
    card.classList.add('is-disabled');
    card.style.display = '';
    const qEl = card.querySelector('#homePollQuestion');
    const dEl = card.querySelector('#homePollDesc');
    const metaEl = card.querySelector('.card-meta');
    const customMsg = useCustom ? (_siteSettings.pollsDisabledMsg || '').trim() : '';
    if (qEl) qEl.textContent = '설문조사 준비중';
    if (dEl) dEl.textContent = customMsg || '곧 새로운 설문으로 찾아뵙겠습니다.';
    if (metaEl) metaEl.style.display = 'none';
  }
  function applyPollFeatureFlag() {
    const enabled = _siteSettings.pollsEnabled !== false;
    const card = document.getElementById('homePollCard') || document.querySelector('.poll-card');
    if (card && !enabled) {
      // OFF여도 숨기지 않고 '설문조사 준비중' 상태로 노출
      _setPollPreparing(true);
      return;
    }
    if (card) {
      card.classList.remove('is-disabled');
      const metaEl = card.querySelector('.card-meta');
      if (metaEl) metaEl.style.display = '';
    }
    if (enabled && typeof loadHomePoll === 'function') loadHomePoll();
  }
  // 모든 페이지에서 한 번 구독 (홈 카드 자동 숨김 + 진입 시 안내)
  subscribeSiteSettings();

  // 홈 OPINION 카드 회전 상태
  let _homeOpinionList = [];
  let _homeOpinionIdx = 0;
  let _homeOpinionTimer = null;
  const HOME_OPINION_INTERVAL = 5000; // 카드 전환 주기(ms)
  const HOME_OPINION_FADE = 450;      // CSS .card-bottom 트랜지션과 동일

  function _renderHomeOpinion(op) {
    const titleEl = document.getElementById('homeOpinionTitle');
    if (!titleEl || !op) return;
    _activeOpinionId = op.id;
    const descEl = document.getElementById('homeOpinionDesc');
    const countEl = document.getElementById('homeOpinionCount');
    if (op.title) titleEl.textContent = op.title;
    if (descEl) descEl.textContent = op.description || '';
    if (countEl) countEl.textContent = String(op.commentCount || 0);
  }
  function _renderHomeOpinionDots() {
    const dots = document.getElementById('homeOpinionDots');
    if (!dots) return;
    if (_homeOpinionList.length <= 1) { dots.hidden = true; dots.innerHTML = ''; return; }
    dots.hidden = false;
    dots.innerHTML = _homeOpinionList
      .map((_, i) => '<span class="ord' + (i === _homeOpinionIdx ? ' on' : '') + '"></span>')
      .join('');
  }

  // 홈 그리드에 노출되는 OPINION 카드 데이터 로드 (진행중 여러 개면 페이드 회전)
  async function loadHomeOpinion() {
    const titleEl = document.getElementById('homeOpinionTitle');
    if (!titleEl) return; // 홈 페이지에 카드가 없으면 스킵
    // 기능 OFF면 '준비중' 상태는 applyOpinionFeatureFlag가 그리므로 데이터 로드만 생략
    if (_siteSettings.opinionsEnabled === false) {
      applyOpinionFeatureFlag();
      return;
    }
    if (_homeOpinionTimer) { clearInterval(_homeOpinionTimer); _homeOpinionTimer = null; }

    const list = await _fetchActiveOpinions();
    // await 사이에 OFF로 전환됐다면 준비중 유지
    if (_siteSettings.opinionsEnabled === false) { applyOpinionFeatureFlag(); return; }
    if (!list.length) { _setOpinionPreparing(false); return; }
    // 진행 중 주제 있음 → 준비중 해제하고 정상 노출
    const oCard = document.querySelector('.opinion-card');
    if (oCard) {
      oCard.classList.remove('is-disabled');
      const m = oCard.querySelector('.card-meta');
      if (m) m.style.display = '';
    }
    _homeOpinionList = list;
    _homeOpinionIdx = 0;
    _renderHomeOpinion(list[0]);
    _renderHomeOpinionDots();
    if (list.length <= 1) return; // 하나면 회전 불필요

    const card = document.querySelector('.opinion-card');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    _homeOpinionTimer = setInterval(() => {
      _homeOpinionIdx = (_homeOpinionIdx + 1) % _homeOpinionList.length;
      const next = _homeOpinionList[_homeOpinionIdx];
      if (reduce || !card) {
        _renderHomeOpinion(next);
        _renderHomeOpinionDots();
        return;
      }
      card.classList.add('is-fading');
      setTimeout(() => {
        _renderHomeOpinion(next);
        _renderHomeOpinionDots();
        card.classList.remove('is-fading');
      }, HOME_OPINION_FADE);
    }, HOME_OPINION_INTERVAL);
  }
  window.loadHomeOpinion = loadHomeOpinion;

  /* ===========================================================
     POLL — 홈 설문 카드 + 투표 모달 (로그인 회원 1인 1표)
     polls/{id}: { question, options[], tally{idx:count}, totalVotes, active, order, startAt, endAt }
     polls/{id}/votes/{uid}: { optionIndex, createdAt }
     =========================================================== */
  let _activePollId = null;     // 홈 카드가 가리키는 활성 설문 id
  let _homePollData = null;     // 현재 홈 카드에 보이는 설문 데이터

  // 진행 중(active)인 설문들을 order 오름차순으로 반환
  async function _fetchActivePolls() {
    if (!window.fb) return [];
    try {
      const snap = await fb.db.collection('polls').where('active', '==', true).get();
      if (snap.empty) return [];
      const now = Date.now();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const ongoing = list.filter(x => _omStatusOf(x, now).status === 'active');
      const pool = ongoing.length ? ongoing : [];
      pool.sort((a, b) => (a.order || 0) - (b.order || 0));
      return pool;
    } catch (err) {
      console.warn('[poll] _fetchActivePolls:', err.message);
      return [];
    }
  }

  // 홈 그리드 설문 카드 데이터 로드 — 진행 중 첫 번째 설문 표시 (없으면 카드 숨김)
  async function loadHomePoll() {
    const card = document.getElementById('homePollCard');
    if (!card) return; // 홈이 아님
    // OFF면 '준비중'은 applyPollFeatureFlag가 처리 — 여기서는 아무것도 건드리지 않음
    if (_siteSettings.pollsEnabled === false) return;
    const list = await _fetchActivePolls();
    // await 사이에 OFF로 전환됐다면 준비중 유지
    if (_siteSettings.pollsEnabled === false) return;
    // 진행 중 설문이 없으면 카드에 '준비중' 직접 노출 (숨기지 않음)
    if (!list.length) { _setPollPreparing(false); return; }
    const p = list[0];
    _activePollId = p.id;
    _homePollData = p;
    // 진행 중 설문 있음 → 준비중 해제하고 정상 노출
    card.classList.remove('is-disabled');
    const qEl = document.getElementById('homePollQuestion');
    const dEl = document.getElementById('homePollDesc');
    const cEl = document.getElementById('homePollCount');
    const metaEl = card.querySelector('.card-meta');
    if (metaEl) metaEl.style.display = '';
    if (qEl) qEl.textContent = p.question || '설문에 참여해보세요';
    if (dEl) {
      // 선택 항목 대신 어드민이 입력한 서브메시지를 노출
      const sub = (p.subMessage || '').trim();
      dEl.textContent = sub || '한 번의 선택으로 의견을 더해주세요.';
    }
    if (cEl) cEl.textContent = String(p.totalVotes || 0);
    card.style.display = '';
  }
  window.loadHomePoll = loadHomePoll;

  // 공용 안내 모달 (오피니언/설문 OFF 등) — poll-modal 스타일 재사용
  function _ensureSiteNoticeModal() {
    let modal = document.getElementById('siteNoticeModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'siteNoticeModal';
    modal.className = 'poll-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="poll-modal-inner">
        <button type="button" class="poll-modal-close" id="siteNoticeClose" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
        <div class="poll-modal-tag" id="siteNoticeTag"></div>
        <h3 class="poll-modal-q" id="siteNoticeTitle"></h3>
        <div class="poll-modal-body"><p class="poll-notice" id="siteNoticeMsg"></p></div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => { modal.classList.remove('open'); document.body.style.overflow = ''; };
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('#siteNoticeClose').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });
    return modal;
  }
  function _showSiteNotice(tag, title, html) {
    const modal = _ensureSiteNoticeModal();
    modal.querySelector('#siteNoticeTag').textContent = tag || '';
    modal.querySelector('#siteNoticeTitle').textContent = title || '';
    modal.querySelector('#siteNoticeMsg').innerHTML = html || '';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // 투표 모달 DOM 보장
  function _ensurePollModal() {
    let modal = document.getElementById('pollModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pollModal';
    modal.className = 'poll-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="poll-modal-inner">
        <button type="button" class="poll-modal-close" id="pollModalClose" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
        <div class="poll-modal-tag">설문조사</div>
        <h3 class="poll-modal-q" id="pollModalQ"></h3>
        <div class="poll-modal-body" id="pollModalBody"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) _closePollModal(); });
    modal.querySelector('#pollModalClose').addEventListener('click', _closePollModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('open')) _closePollModal();
    });
    return modal;
  }
  function _closePollModal() {
    const modal = document.getElementById('pollModal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // 설문 OFF 안내
  function _showPollNotice() {
    const custom = (_siteSettings.pollsDisabledMsg || '').trim();
    const body = custom
      ? escHTML(custom).replace(/\n/g, '<br>')
      : '설문을 준비 중입니다.<br>곧 새로운 설문으로 찾아뵙겠습니다.';
    _showSiteNotice('설문조사', '설문조사 준비중', body);
  }

  const _POLL_MARKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  // 결과 화면 렌더 (myIndex: 내가 투표한 선택지 인덱스, 없으면 -1)
  function _renderPollResults(poll, myIndex) {
    const opts = Array.isArray(poll.options) ? poll.options : [];
    const tally = poll.tally || {};
    const total = poll.totalVotes || 0;
    let maxCnt = 0;
    opts.forEach((_, i) => { const c = tally[i] || tally[String(i)] || 0; if (c > maxCnt) maxCnt = c; });
    const rows = opts.map((opt, i) => {
      const cnt = tally[i] || tally[String(i)] || 0;
      const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
      const mine = (i === myIndex) ? ' is-mine' : '';
      const lead = (cnt > 0 && cnt === maxCnt) ? ' is-lead' : '';
      return `
        <div class="poll-res-row${mine}${lead}">
          <div class="poll-res-head">
            <span class="poll-res-label"><span class="poll-res-mark">${_POLL_MARKS[i] || (i + 1)}</span><span class="poll-res-name">${escHTML(opt)}</span>${mine ? '<span class="poll-res-mine">내 선택</span>' : ''}</span>
            <span class="poll-res-pct">${pct}<span class="poll-res-unit">%</span></span>
          </div>
          <div class="poll-res-bar"><div class="poll-res-fill" style="width:${pct}%;"></div></div>
        </div>`;
    }).join('');
    return `<div class="poll-res">${rows}</div><p class="poll-res-total"><i class="fa-solid fa-user-group"></i> 총 ${total.toLocaleString('ko-KR')}명 참여</p>`;
  }

  // 투표 화면 렌더 (선택지 버튼)
  function _renderPollVote(poll) {
    const opts = Array.isArray(poll.options) ? poll.options : [];
    const btns = opts.map((opt, i) =>
      `<button type="button" class="poll-opt-btn" data-idx="${i}">` +
        `<span class="poll-opt-mark">${_POLL_MARKS[i] || (i + 1)}</span>` +
        `<span class="poll-opt-text">${escHTML(opt)}</span>` +
        `<span class="poll-opt-pick" aria-hidden="true"><i class="fa-solid fa-circle-check"></i></span>` +
      `</button>`
    ).join('');
    return `<div class="poll-opts">${btns}</div><p class="poll-hint"><i class="fa-solid fa-circle-info"></i> 로그인 회원 1인 1표 · 투표 후에는 변경할 수 없습니다.</p>`;
  }

  // 홈 카드 클릭 → 투표 모달
  window.openPoll = async function(id) {
    // 준비중(OFF 또는 진행 중 설문 없음) 상태에서는 클릭해도 아무 동작 안 함(헛걸음 방지)
    if (_siteSettings.pollsEnabled === false) return;
    const pollCard = document.getElementById('homePollCard') || document.querySelector('.poll-card');
    if (pollCard && pollCard.classList.contains('is-disabled')) return;
    const pollId = id || _activePollId;
    if (!pollId || !window.fb) return;

    // 로그인 게이트
    if (!isLoggedIn()) {
      if (typeof showToast === 'function') showToast('투표하려면 로그인이 필요합니다.');
      if (typeof openLogin === 'function') setTimeout(() => openLogin(), 300);
      return;
    }

    const modal = _ensurePollModal();
    const qEl = modal.querySelector('#pollModalQ');
    const bodyEl = modal.querySelector('#pollModalBody');
    bodyEl.innerHTML = '<p class="poll-notice">불러오는 중...</p>';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    try {
      const docSnap = await fb.db.collection('polls').doc(pollId).get();
      if (!docSnap.exists) { bodyEl.innerHTML = '<p class="poll-notice">설문을 찾을 수 없습니다.</p>'; return; }
      const poll = docSnap.data();
      qEl.textContent = poll.question || '설문조사';

      // 기간 종료 여부
      const now = Date.now();
      const st = _omStatusOf(poll, now);
      const uid = fb.currentUser().uid;

      // 이미 투표했는지 확인
      let myIndex = -1;
      try {
        const voteSnap = await fb.db.collection('polls').doc(pollId).collection('votes').doc(uid).get();
        if (voteSnap.exists) myIndex = (voteSnap.data().optionIndex != null) ? voteSnap.data().optionIndex : -1;
      } catch (_) {}

      if (myIndex >= 0 || st.status === 'expired') {
        // 이미 투표함 or 종료 → 결과만
        bodyEl.innerHTML = _renderPollResults(poll, myIndex);
        return;
      }

      // 투표 화면
      bodyEl.innerHTML = _renderPollVote(poll);
      bodyEl.querySelectorAll('.poll-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => _castVote(pollId, parseInt(btn.dataset.idx, 10), poll));
      });
    } catch (err) {
      bodyEl.innerHTML = `<p class="poll-notice">불러오기 실패: ${escHTML(err.message)}</p>`;
    }
  };

  // 투표 실행
  async function _castVote(pollId, optionIndex, poll) {
    if (!window.fb || !isLoggedIn()) return;
    const modal = document.getElementById('pollModal');
    const bodyEl = modal && modal.querySelector('#pollModalBody');
    if (bodyEl) bodyEl.querySelectorAll('.poll-opt-btn').forEach(b => b.disabled = true);
    const uid = fb.currentUser().uid;
    try {
      const pollRef = fb.db.collection('polls').doc(pollId);
      const voteRef = pollRef.collection('votes').doc(uid);
      const batch = fb.db.batch();
      batch.set(voteRef, {
        optionIndex,
        createdAt: fb.FieldValue.serverTimestamp()
      });
      const tallyKey = 'tally.' + optionIndex;
      batch.update(pollRef, {
        [tallyKey]: fb.FieldValue.increment(1),
        totalVotes: fb.FieldValue.increment(1),
        updatedAt: fb.FieldValue.serverTimestamp()
      });
      await batch.commit();

      // 로컬 집계 갱신 후 결과 표시
      const tally = Object.assign({}, poll.tally || {});
      tally[optionIndex] = (tally[optionIndex] || tally[String(optionIndex)] || 0) + 1;
      const updated = Object.assign({}, poll, { tally, totalVotes: (poll.totalVotes || 0) + 1 });
      if (bodyEl) bodyEl.innerHTML = _renderPollResults(updated, optionIndex);
      if (typeof showToast === 'function') showToast('투표가 완료되었습니다.');
      // 홈 카드 참여수 갱신
      loadHomePoll();
    } catch (err) {
      if (typeof showToast === 'function') showToast('투표 실패: ' + err.message);
      if (bodyEl) bodyEl.querySelectorAll('.poll-opt-btn').forEach(b => b.disabled = false);
    }
  }

  // 상대 시간 포맷
  function _formatRelativeTime(date) {
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return '방금 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + '일 전';
    const pad = n => String(n).padStart(2, '0');
    return date.getFullYear() + '.' + pad(date.getMonth() + 1) + '.' + pad(date.getDate());
  }

  // opinion.html 진입 시 호출
  // 현재 토픽의 기간 상태(공유)
  let _opinionPeriodState = { isPending: false, isExpired: false, isActive: true };
  function _fmtOpinionDate(date) {
    if (!date) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}.${pad(date.getMonth()+1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function _fmtOpinionDateShort(date) {
    if (!date) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}.${pad(date.getMonth()+1)}.${pad(date.getDate())}`;
  }
  async function initOpinionPage() {
    if (!window.fb) return;
    const titleEl = document.getElementById('opinionTitle');
    const descEl = document.getElementById('opinionDesc');
    const countEl = document.getElementById('opinionCount');
    const periodEl = document.getElementById('opinionPeriod');
    const bannerEl = document.getElementById('opinionBanner');

    // ?id= 우선, 없으면 활성 토픽 중 첫 번째
    const params = new URLSearchParams(location.search);
    let id = params.get('id');
    if (!id) {
      const _tops = await _fetchActiveOpinions();
      const top = (_tops && _tops.length) ? _tops[0] : null;
      if (!top) {
        if (titleEl) titleEl.textContent = '등록된 주제가 없습니다';
        if (descEl) descEl.textContent = '관리자가 곧 새로운 의견 주제를 열어드릴 거예요.';
        return;
      }
      id = top.id;
    }
    _currentOpinionId = id;

    // 토픽 본문 로드
    let op = null;
    try {
      const docSnap = await fb.db.collection('opinions').doc(id).get();
      if (!docSnap.exists) {
        if (titleEl) titleEl.textContent = '주제를 찾을 수 없습니다';
        if (descEl) descEl.textContent = '';
        return;
      }
      op = docSnap.data();
      if (titleEl) titleEl.textContent = op.title || '주제';
      if (descEl) descEl.textContent = op.description || '';
    } catch (err) {
      if (titleEl) titleEl.textContent = '주제를 불러올 수 없습니다';
      console.warn('[opinion] 토픽 로드 실패:', err.message);
      return;
    }

    // 기간 게이트 계산
    const now = Date.now();
    const startDate = (op.startAt && op.startAt.toDate) ? op.startAt.toDate() : null;
    const endDate = (op.endAt && op.endAt.toDate) ? op.endAt.toDate() : null;
    const startMs = startDate ? startDate.getTime() : 0;
    const endMs = endDate ? endDate.getTime() : Infinity;
    const isPending = now < startMs;
    const isExpired = now >= endMs;
    const isActive = !isPending && !isExpired;
    _opinionPeriodState = { isPending, isExpired, isActive };

    // 기간 표시
    if (periodEl) {
      if (isPending && startDate) {
        periodEl.textContent = `시작 예정 · ${_fmtOpinionDate(startDate)}`;
      } else if (isExpired && endDate) {
        periodEl.textContent = `종료 · ${_fmtOpinionDateShort(endDate)}`;
      } else if (endDate) {
        periodEl.textContent = `진행 중 · ${_fmtOpinionDateShort(endDate)} 까지`;
      } else {
        periodEl.textContent = '';
      }
    }

    // 배너 + 입력 카드 가시성
    const inputCard = document.getElementById('opinionInputCard');
    const loginPrompt = document.getElementById('opinionLoginPrompt');
    if (bannerEl) {
      if (isPending && startDate) {
        bannerEl.hidden = false;
        bannerEl.innerHTML = `이 오피니언은 <strong>${escHTML(_fmtOpinionDate(startDate))}</strong>에 시작됩니다.`;
      } else if (isExpired && endDate) {
        bannerEl.hidden = false;
        bannerEl.innerHTML = `<i class="fa-solid fa-thumbtack" style="margin-right:6px;"></i> 이 오피니언은 종료되었습니다. (${escHTML(_fmtOpinionDate(endDate))})`;
      } else {
        bannerEl.hidden = true;
        bannerEl.innerHTML = '';
      }
    }
    if (!isActive) {
      // 입력 카드와 로그인 프롬프트 둘 다 숨김
      if (inputCard) inputCard.style.display = 'none';
      if (loginPrompt) loginPrompt.hidden = true;
    }

    // 댓글 실시간 구독
    // 현재 사용자가 공감한 댓글 목록 선로딩 → 스냅샷이 오면 공감 상태가 바로 반영됨
    _loadLikedComments().then(() => { if (_opinionCommentSnap) _renderOpinionCommentList(); });
    if (_opinionCommentsUnsub) { try { _opinionCommentsUnsub(); } catch(e){} }
    try {
      _opinionCommentsUnsub = fb.db.collection('opinions').doc(id).collection('comments')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
          const list = document.getElementById('opinionComments');
          if (!list) return;
          _opinionCommentSnap = snap;
          if (countEl) countEl.textContent = String(snap.size);

          // 종료된 오피니언: 결과 요약 박제 카드 채우기
          const resultEl = document.getElementById('opinionResult');
          if (resultEl && _opinionPeriodState.isExpired) {
            const uids = new Set();
            snap.docs.forEach(d => { const u = d.data().userId; if (u) uids.add(u); });
            const pEl = document.getElementById('orParticipants');
            const cEl = document.getElementById('orComments');
            const perEl = document.getElementById('orPeriod');
            if (pEl) pEl.textContent = String(uids.size);
            if (cEl) cEl.textContent = String(snap.size);
            if (perEl) {
              if (startDate && endDate) perEl.textContent = `${_fmtOpinionDateShort(startDate)}–${_fmtOpinionDateShort(endDate)}`;
              else if (endDate) perEl.textContent = `~${_fmtOpinionDateShort(endDate)}`;
              else perEl.textContent = '—';
            }
            resultEl.hidden = false;
          }

          _renderOpinionCommentList();
        }, err => {
          console.warn('[opinion] comments subscribe:', err.message);
        });
    } catch (err) {
      console.warn('[opinion] comments subscribe 예외:', err.message);
    }

    // 입력/로그인 상태 UI
    updateOpinionInputState();
    if (fb.onAuthChange) fb.onAuthChange(() => {
      updateOpinionInputState();
      // 로그인/로그아웃 시 공감 상태 다시 로드 후 목록 재렌더
      _loadLikedComments().then(() => { if (_opinionCommentSnap) _renderOpinionCommentList(); });
    });

    // 글자수·전송 이벤트
    const input = document.getElementById('opinionInput');
    const submitBtn = document.getElementById('opinionSubmitBtn');
    const charCount = document.getElementById('opinionInputCharCount');
    if (input && charCount) {
      input.addEventListener('input', () => {
        charCount.textContent = String((input.value || '').length);
      });
    }
    if (submitBtn) submitBtn.addEventListener('click', submitOpinionComment);

    // 하단: 다른 오피니언(진행 중 / 지난) 둘러보기
    loadMoreOpinions(id).catch(() => {});
  }
  window.initOpinionPage = initOpinionPage;

  // opinion.html 하단 — 진행 중/지난 오피니언 카드 목록
  function _omStatusOf(x, now) {
    const startMs = (x.startAt && x.startAt.toDate) ? x.startAt.toDate().getTime() : 0;
    const endMs = (x.endAt && x.endAt.toDate) ? x.endAt.toDate().getTime() : Infinity;
    if (x.active === false) return { status: 'inactive', startMs, endMs };
    if (now < startMs) return { status: 'pending', startMs, endMs };
    if (now >= endMs) return { status: 'expired', startMs, endMs };
    return { status: 'active', startMs, endMs };
  }
  function _omCard(t) {
    let badge = '', meta = '';
    if (t.status === 'active') {
      badge = '<span class="om-badge om-active">진행 중</span>';
      if (t.endMs !== Infinity) {
        const days = Math.ceil((t.endMs - Date.now()) / 86400000);
        meta = `<span class="om-remain">${days <= 0 ? '오늘 마감' : days + '일 남음'}</span>`;
      }
    } else if (t.status === 'pending') {
      badge = '<span class="om-badge om-pending">예정</span>';
    } else {
      badge = '<span class="om-badge om-expired">종료</span>';
      if (t.endDate) meta = `<span class="om-period">${escHTML(_fmtOpinionDateShort(t.endDate))} 종료</span>`;
    }
    const href = '/opinion.html?id=' + encodeURIComponent(t.id);
    return `
      <a class="om-card om-card--${t.status}" href="${escHTML(href)}">
        <div class="om-card-head">${badge}${meta}</div>
        <h3 class="om-card-title">${escHTML(t.title)}</h3>
        <p class="om-card-desc">${escHTML(t.description)}</p>
        <div class="om-card-foot">
          <span><i class="fa-regular fa-comments"></i>${escHTML(String(t.commentCount))}개의 의견</span>
          <span class="om-go">보기 →</span>
        </div>
      </a>`;
  }
  async function loadMoreOpinions(currentId) {
    const section = document.getElementById('opinionMore');
    if (!section || !window.fb || !fb.db) return;
    let docs = [];
    try {
      const snap = await fb.db.collection('opinions').get();
      docs = snap.docs;
    } catch (err) {
      console.warn('[opinion] 다른 오피니언 로드 실패:', err.message);
      return;
    }
    const now = Date.now();
    const items = docs.map(d => {
      const x = d.data();
      const s = _omStatusOf(x, now);
      return {
        id: d.id,
        title: x.title || '(제목 없음)',
        description: x.description || '',
        commentCount: x.commentCount || 0,
        order: x.order != null ? x.order : 0,
        endDate: (x.endAt && x.endAt.toDate) ? x.endAt.toDate() : null,
        status: s.status, startMs: s.startMs, endMs: s.endMs
      };
    }).filter(t => t.id !== currentId && t.status !== 'inactive');

    const endKey = ms => (ms === Infinity ? Number.MAX_SAFE_INTEGER : ms);
    const active = items.filter(t => t.status === 'active' || t.status === 'pending')
      .sort((a, b) => endKey(b.endMs) - endKey(a.endMs) || (a.order - b.order));
    const past = items.filter(t => t.status === 'expired')
      .sort((a, b) => b.endMs - a.endMs);

    const activeGrid = document.getElementById('opinionMoreActive');
    const pastGrid = document.getElementById('opinionMorePast');
    const activeBlock = document.getElementById('opinionMoreActiveBlock');
    const pastBlock = document.getElementById('opinionMorePastBlock');
    const acCount = document.getElementById('omActiveCount');
    const pCount = document.getElementById('omPastCount');

    if (active.length && activeGrid && activeBlock) {
      activeGrid.innerHTML = active.map(_omCard).join('');
      if (acCount) acCount.textContent = active.length;
      activeBlock.hidden = false;
    }
    if (past.length && pastGrid && pastBlock) {
      pastGrid.innerHTML = past.map(_omCard).join('');
      if (pCount) pCount.textContent = past.length;
      pastBlock.hidden = false;
    }
    if (active.length || past.length) section.hidden = false;
  }

  function updateOpinionInputState() {
    const card = document.getElementById('opinionInputCard');
    const prompt = document.getElementById('opinionLoginPrompt');
    if (!card || !prompt) return;
    // 기간이 끝났거나 아직 시작 전이면 입력/로그인 프롬프트 모두 숨김
    if (!_opinionPeriodState.isActive) {
      card.style.display = 'none';
      prompt.hidden = true;
      return;
    }
    const logged = !!(window.fb && fb.currentUser());
    card.style.display = logged ? '' : 'none';
    prompt.hidden = !!logged;
  }

  async function submitOpinionComment() {
    if (!_currentOpinionId) return;
    if (!window.fb) { showToast('Firebase가 로드되지 않았습니다.'); return; }
    if (_opinionPeriodState.isExpired) { showToast('종료된 오피니언입니다.'); return; }
    if (_opinionPeriodState.isPending) { showToast('아직 시작 전인 오피니언입니다.'); return; }
    const user = fb.currentUser();
    if (!user) { showToast('로그인 후 의견을 남길 수 있어요.'); return; }
    const input = document.getElementById('opinionInput');
    const text = ((input && input.value) || '').trim();
    if (!text) { showToast('의견을 입력해주세요.'); return; }
    if (text.length > 500) { showToast('500자 이하로 입력해주세요.'); return; }
    const submitBtn = document.getElementById('opinionSubmitBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '등록 중...'; }
    try {
      const userName = user.displayName || (user.email ? user.email.split('@')[0] : '독자');
      await fb.db.collection('opinions').doc(_currentOpinionId).collection('comments').add({
        userId: user.uid,
        userName,
        text,
        createdAt: fb.FieldValue.serverTimestamp()
      });
      // commentCount 비정규화 증가 — 실패해도 무시(권한·미생성 토픽 등)
      try {
        await fb.db.collection('opinions').doc(_currentOpinionId).update({
          commentCount: fb.FieldValue.increment(1),
          updatedAt: fb.FieldValue.serverTimestamp()
        });
      } catch (_) {}
      if (input) input.value = '';
      const charCount = document.getElementById('opinionInputCharCount');
      if (charCount) charCount.textContent = '0';
    } catch (err) {
      showToast('등록 실패: ' + err.message);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '의견 남기기'; }
    }
  }

  window.deleteOpinionComment = async function(commentId) {
    if (!_currentOpinionId || !window.fb) return;
    // 종료된 오피니언이면 관리자만 삭제 가능
    const isAdmin = !!(fb.isAdmin && fb.isAdmin());
    if (_opinionPeriodState.isExpired && !isAdmin) {
      showToast('종료된 오피니언은 수정/삭제할 수 없습니다.');
      return;
    }
    if (!(await sysConfirm('이 의견을 삭제할까요?', { title: '의견 삭제', okLabel: '삭제' }))) return;
    try {
      await fb.db.collection('opinions').doc(_currentOpinionId)
        .collection('comments').doc(commentId).delete();
      try {
        await fb.db.collection('opinions').doc(_currentOpinionId).update({
          commentCount: fb.FieldValue.increment(-1)
        });
      } catch (_) {}
    } catch (err) {
      showToast('삭제 실패: ' + err.message);
    }
  };

  /* ===========================================================
     문의(컨택) 폼 — 4종
     - 로그인 사용자만 접수 가능 → inquiries 컬렉션에 저장 → 어드민 수신
     - 트리거: [data-inquiry="general"],
              푸터 'Contact' 링크(전체 페이지), [data-about-movement],
              푸터 'locallayers.kr' 주소
     =========================================================== */
  (function setupInquiry() {
    // ---- 폼 구성 정의 ----
    const INQUIRY_FORMS = {
      general: {
        title: 'LOCALLAYERS 콘텐츠 이용 문의',
        intro: 'LOCALLAYERS를 이용해 주셔서 감사합니다. 아래 양식으로 문의를 남겨주시면 휴일을 제외하고 2~3일 내 확인 후 답변드립니다. 답변은 메시지함에서 확인하실 수 있으며, 내용에 따라 남겨주신 이메일이나 휴대전화로 직접 연락드릴 수 있습니다. 이름과 이메일은 가입 정보로 자동 입력되며 수정할 수 없습니다.',
        submit: '문의 보내기',
        fields: [
          { id: 'category', label: '문의 유형', type: 'select', required: true,
            options: ['저작권 침해 신고', '콘텐츠 활용 문의', '콘텐츠 제작 협업 문의', '기타 저작권 문의', '오류 리포트 (오타·잘못된 정보 등)', '콘텐츠 제안', '서비스 개선 아이디어'] },
          { id: 'name', label: '이름', type: 'text', required: true, isName: true },
          { id: 'email', label: '이메일', type: 'email', required: true, isEmail: true },
          { id: 'phone', label: '연락 받으실 휴대전화', type: 'text', required: false, placeholder: '010-0000-0000', format: 'phone' },
          { id: 'contentTitle', label: '관련 콘텐츠 제목', type: 'text', required: false, placeholder: '특정 아티클 관련 문의라면 제목을 적어주세요 (선택)' },
          { id: 'message', label: '문의 내용', type: 'textarea', required: true }
        ]
      },
      editor: {
        title: 'LOCALLAYERS 에디터 지원',
        intro: '당신의 관점을 LOCALLAYERS에서 직접 발행해보세요. 아래 양식을 남겨주시면 검토 후 결과를 메시지함에서 안내드립니다. 이름·이메일은 가입 정보로 자동 입력되며 수정할 수 없습니다.',
        submit: '에디터 지원하기',
        collection: 'editorApplications',
        successMsg: '에디터 지원이 접수되었어요.<br/>검토 후 결과는 메시지함에서 확인하실 수 있어요.',
        fields: [
          { id: 'name', label: '이름', type: 'text', required: true, isName: true },
          { id: 'email', label: '이메일', type: 'email', required: true, isEmail: true },
          { id: 'phone', label: '전화번호', type: 'text', required: true, placeholder: '010-0000-0000', format: 'phone' },
          { id: 'formats', label: '발행하고 싶은 콘텐츠 포맷', type: 'checkboxes', required: true, options: ['아티클', '영상'] },
          { id: 'topic', label: '발행하고 싶은 주제 및 내용', type: 'textarea', required: true, placeholder: '어떤 지역과 공간을, 어떤 관점으로 기록하고 싶은지 자유롭게 적어주세요.' },
          { id: 'contentPlan', label: '발행하고 싶은 콘텐츠 수', type: 'text', required: true, placeholder: '예) 아티클 3건, 영상 1건' },
          { id: 'cycle', label: '발행 주기', type: 'text', required: true, placeholder: '예) 주 1회 · 격주 1회 · 월 2회 등' }
        ]
      }
    };

    // 문의별 ON/OFF 플래그 키 + 안내메시지 키 (site/settings 문서)
    const INQ_FLAGS = {
      general:  { flag: 'inqGeneralEnabled',  msg: 'inqGeneralMsg' },
    };
    const INQ_DEFAULT_MSG = '현재 이 문의는 일시적으로 받지 않고 있습니다.\n잠시 후 다시 시도해 주세요.';

    let _inqAttachments = [];   // [{name,size,url,file}]
    let _inqCurrentKey = null;
    let _inqPendingKey = null;  // 로그인 게이트 통과 후 다시 열 문의 종류

    function fmtSize(b) {
      b = Number(b) || 0;
      if (b < 1024) return b + ' B';
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1024 / 1024).toFixed(1) + ' MB';
    }

    // ---- 모달 DOM 주입 (페이지당 1회) ----
    function ensureModal() {
      if (document.getElementById('inquiryModal')) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="inq-modal" id="inquiryModal" aria-hidden="true">
          <div class="inq-modal-inner" role="dialog" aria-modal="true" aria-labelledby="inqTitle">
            <button type="button" class="inq-close" id="inqCloseBtn" aria-label="닫기">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <h2 class="inq-title" id="inqTitle"></h2>
            <p class="inq-intro" id="inqIntro"></p>
            <form class="inq-form" id="inqForm" novalidate>
              <div class="inq-fields" id="inqFields"></div>
              <label class="inq-file">
                <span class="inq-label">기타 첨부 <em class="inq-opt">(선택)</em></span>
                <span class="inq-file-btn"><i class="fa-solid fa-arrow-up-from-bracket"></i> 파일 올리기</span>
                <input type="file" id="inqFileInput" multiple hidden />
              </label>
              <div class="inq-file-list" id="inqFileList"></div>
              <label class="inq-consent">
                <input type="checkbox" id="inqAgree" />
                <span>문의 답변을 위해 이름·이메일·휴대전화를 수집·이용하는 데 동의합니다. <a href="/privacy.html" target="_blank" rel="noopener">전문 보기</a> <em class="inq-req">*</em></span>
              </label>
              <div class="inq-err" id="inqErr"></div>
              <button type="submit" class="inq-submit" id="inqSubmit"></button>
            </form>
          </div>
        </div>
        <div class="inq-modal" id="inqNoticeModal" aria-hidden="true">
          <div class="inq-modal-inner inq-notice" role="dialog" aria-modal="true" aria-labelledby="inqNoticeTitle">
            <button type="button" class="inq-close" id="inqNoticeCloseBtn" aria-label="닫기">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <h2 class="inq-title" id="inqNoticeTitle"></h2>
            <p class="inq-notice-msg" id="inqNoticeMsg"></p>
            <button type="button" class="inq-submit" id="inqNoticeOk">확인</button>
          </div>
        </div>`;
      while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);

      // 닫기 바인딩
      const inqM = document.getElementById('inquiryModal');
      const notM = document.getElementById('inqNoticeModal');
      document.getElementById('inqCloseBtn').addEventListener('click', closeInquiry);
      document.getElementById('inqNoticeCloseBtn').addEventListener('click', () => toggleModal(notM, false));
      document.getElementById('inqNoticeOk').addEventListener('click', () => toggleModal(notM, false));
      inqM.addEventListener('click', e => { if (e.target === inqM) closeInquiry(); });
      notM.addEventListener('click', e => { if (e.target === notM) toggleModal(notM, false); });
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (inqM.classList.contains('open')) closeInquiry();
        if (notM.classList.contains('open')) toggleModal(notM, false);
      });

      // 첨부 처리
      const fileInput = document.getElementById('inqFileInput');
      fileInput.addEventListener('change', () => {
        Array.from(fileInput.files || []).forEach(f => {
          if (f.size > 20 * 1024 * 1024) { showToast('20MB 이하 파일만 첨부할 수 있어요.'); return; }
          _inqAttachments.push({ name: f.name, size: f.size, file: f });
        });
        fileInput.value = '';
        renderInqFiles();
      });

      // 폼 제출
      document.getElementById('inqForm').addEventListener('submit', submitInquiry);
    }

    function toggleModal(m, open) {
      if (!m) return;
      if (open) {
        // 한 번에 하나의 모달만 열리도록: 다른 열린 문의/어바웃 모달은 닫는다
        document.querySelectorAll('.inq-modal.open').forEach(other => {
          if (other !== m) {
            other.classList.remove('open');
            other.setAttribute('aria-hidden', 'true');
          }
        });
      }
      m.classList.toggle('open', open);
      m.setAttribute('aria-hidden', open ? 'false' : 'true');
      document.body.style.overflow = open ? 'hidden' : '';
    }

    function renderInqFiles() {
      const list = document.getElementById('inqFileList');
      if (!list) return;
      list.innerHTML = _inqAttachments.map((a, i) => `
        <div class="inq-file-item">
          <i class="fa-regular fa-file"></i>
          <span class="inq-file-name">${escHTML(a.name)}</span>
          <span class="inq-file-size">${fmtSize(a.size)}</span>
          <button type="button" class="inq-file-del" data-i="${i}" aria-label="삭제"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');
      list.querySelectorAll('.inq-file-del').forEach(btn => {
        btn.addEventListener('click', () => {
          _inqAttachments.splice(Number(btn.dataset.i), 1);
          renderInqFiles();
        });
      });
    }

    function buildFields(cfg) {
      return cfg.fields.map(f => {
        const req = f.required ? '<em class="inq-req">*</em>' : '<em class="inq-opt">(선택)</em>';
        const lab = `<span class="inq-label">${escHTML(f.label)} ${req}</span>`;
        let control = '';
        if (f.type === 'select') {
          control = `<select id="inq_${f.id}" data-fid="${f.id}">
            <option value="">선택해주세요</option>
            ${f.options.map(o => `<option value="${escHTML(o)}">${escHTML(o)}</option>`).join('')}
          </select>`;
        } else if (f.type === 'textarea') {
          control = `<textarea id="inq_${f.id}" data-fid="${f.id}" rows="3" placeholder="${escHTML(f.placeholder || '')}"></textarea>`;
        } else if (f.type === 'checkboxes') {
          control = `<div class="inq-checks" data-fid="${f.id}">${f.options.map(o => `<label class="inq-check"><input type="checkbox" value="${escHTML(o)}" /><span>${escHTML(o)}</span></label>`).join('')}</div>`;
        } else {
          // 이름·이메일은 로그인 정보로 자동 채워지며 수정 불가(readonly)
          const locked = (f.isName || f.isEmail);
          const ro = locked ? ' readonly' : '';
          const cls = ((locked ? 'inq-locked ' : '') + (f.format === 'phone' ? 'inq-phone' : '')).trim();
          const extra = f.format === 'phone' ? ' inputmode="numeric" maxlength="13"' : '';
          control = `<input type="${f.type === 'email' ? 'email' : 'text'}" id="inq_${f.id}" data-fid="${f.id}" class="${cls}" placeholder="${escHTML(f.placeholder || '')}" autocomplete="off"${ro}${extra} />`;
        }
        return `<label class="inq-field">${lab}${control}</label>`;
      }).join('');
    }

    function showInquiryNotice(title, msg) {
      ensureModal();
      document.getElementById('inqNoticeTitle').textContent = title || '안내';
      document.getElementById('inqNoticeMsg').innerHTML = escHTML(msg || '').replace(/\n/g, '<br>');
      toggleModal(document.getElementById('inqNoticeModal'), true);
    }

    function openInquiry(key) {
      const cfg = INQUIRY_FORMS[key];
      if (!cfg) return;
      ensureModal();
      // 기능 OFF면 폼 대신 안내메시지 모달 (로그인 게이트보다 먼저)
      const ss = (window.getSiteSettings && window.getSiteSettings()) || {};
      const flagCfg = INQ_FLAGS[key];
      if (flagCfg && ss[flagCfg.flag] === false) {
        const msg = (ss[flagCfg.msg] || '').trim() || INQ_DEFAULT_MSG;
        showInquiryNotice(cfg.title, msg);
        return;
      }
      // 로그인 게이트 — 로그인 후 자동으로 이 문의 모달을 다시 연다
      if (!isLoggedIn()) {
        _inqPendingKey = key;
        showToast('문의는 로그인 후 작성할 수 있어요.');
        if (typeof openLogin === 'function') openLogin();
        return;
      }
      _inqCurrentKey = key;
      _inqAttachments = [];
      document.getElementById('inqTitle').textContent = cfg.title;
      document.getElementById('inqIntro').textContent = cfg.intro;
      document.getElementById('inqFields').innerHTML = buildFields(cfg);
      // 전화번호 입력 자동 하이픈 (000-0000-0000)
      document.querySelectorAll('#inqFields input.inq-phone').forEach(inp => {
        const fmtPhone = v => {
          const d = String(v || '').replace(/\D/g, '').slice(0, 11);
          if (d.length < 4) return d;
          if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
          return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
        };
        inp.addEventListener('input', () => { inp.value = fmtPhone(inp.value); });
      });
      document.getElementById('inqSubmit').textContent = cfg.submit;
      document.getElementById('inqAgree').checked = false;
      document.getElementById('inqErr').textContent = '';
      // 첨부 라벨: 에디터 지원은 '포트폴리오 등 지원 콘텐츠', 그 외는 '기타 첨부'
      const fileLabel = document.querySelector('#inquiryModal .inq-file .inq-label');
      if (fileLabel) {
        fileLabel.innerHTML = (key === 'editor')
          ? '포트폴리오 등 지원 콘텐츠 첨부 <em class="inq-opt">(선택)</em>'
          : '기타 첨부 <em class="inq-opt">(선택)</em>';
      }
      renderInqFiles();
      // 로그인 정보로 이름/이메일 선채움
      const u = window.fb && fb.currentUser();
      if (u) {
        const nameF = cfg.fields.find(f => f.isName);
        const emailF = cfg.fields.find(f => f.isEmail);
        if (nameF && u.displayName) { const el = document.getElementById('inq_' + nameF.id); if (el && !el.value) el.value = u.displayName; }
        if (emailF && u.email) { const el = document.getElementById('inq_' + emailF.id); if (el && !el.value) el.value = u.email; }
      }
      toggleModal(document.getElementById('inquiryModal'), true);
      setTimeout(() => document.querySelector('#inqFields [data-fid]')?.focus(), 60);
    }

    function closeInquiry() {
      toggleModal(document.getElementById('inquiryModal'), false);
    }

    async function submitInquiry(e) {
      e.preventDefault();
      const cfg = INQUIRY_FORMS[_inqCurrentKey];
      if (!cfg) return;
      const errEl = document.getElementById('inqErr');
      errEl.textContent = '';
      const user = window.fb && fb.currentUser();
      if (!user) { showToast('로그인이 필요합니다.'); closeInquiry(); openLogin(); return; }

      // 값 수집 + 검증
      const fieldsMap = {};
      const structured = {};   // f.id -> value (editorApplications 등 구조화 저장용)
      let name = '', email = '', category = '';
      for (const f of cfg.fields) {
        if (f.type === 'checkboxes') {
          const wrap = document.querySelector(`.inq-checks[data-fid="${f.id}"]`);
          const vals = wrap ? Array.from(wrap.querySelectorAll('input:checked')).map(i => i.value) : [];
          if (f.required && !vals.length) { errEl.textContent = `‘${f.label}’ 항목을 선택해주세요.`; wrap?.scrollIntoView({ block: 'center' }); return; }
          if (vals.length) fieldsMap[f.label] = vals.join(', ');
          structured[f.id] = vals;
          continue;
        }
        const el = document.getElementById('inq_' + f.id);
        const val = (el && el.value || '').trim();
        if (f.required && !val) { errEl.textContent = `‘${f.label}’ 항목을 입력해주세요.`; el?.focus(); return; }
        if (f.isEmail && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { errEl.textContent = '이메일 형식을 확인해주세요.'; el?.focus(); return; }
        if (f.format === 'phone' && val && !/^01[016789]-\d{3,4}-\d{4}$/.test(val)) { errEl.textContent = '휴대전화 번호를 확인해주세요. (예: 010-0000-0000)'; el?.focus(); return; }
        if (val) fieldsMap[f.label] = val;
        structured[f.id] = val;
        if (f.isName) name = val;
        if (f.isEmail) email = val;
        if (f.id === 'category') category = val;
      }
      if (!document.getElementById('inqAgree').checked) {
        errEl.textContent = '개인정보 수집 및 이용에 동의해주세요.';
        return;
      }

      const submitBtn = document.getElementById('inqSubmit');
      submitBtn.disabled = true;
      const origLabel = submitBtn.textContent;
      submitBtn.textContent = '보내는 중…';
      try {
        // 첨부 업로드 (있으면)
        const attachments = [];
        for (const a of _inqAttachments) {
          if (a.file && fb.uploadImage) {
            try {
              const url = await fb.uploadImage(a.file, 'inquiries');
              attachments.push({ name: a.name, size: a.size || 0, url });
            } catch (upErr) {
              console.warn('[inquiry] 첨부 업로드 실패:', upErr.message);
            }
          }
        }
        if (cfg.collection === 'editorApplications') {
          // 에디터 지원 — 구조화 저장 (어드민 콘솔에서 심사)
          const appRef = await fb.db.collection('editorApplications').add({
            userId: user.uid,
            name: name || (user.displayName || ''),
            email: email || (user.email || ''),
            phone: structured.phone || '',
            formats: structured.formats || [],
            topic: structured.topic || '',
            contentPlan: structured.contentPlan || '',
            cycle: structured.cycle || '',
            fields: fieldsMap,
            attachments,
            agree: true,
            status: 'PENDING',
            createdAt: fb.FieldValue.serverTimestamp()
          });
          // 나의 서재(내 문의/답변)에 지원 기록을 남긴다. 심사 결과(선정/거절)는
          // 어드민이 이 문의 문서에 답변(reply)으로 달아 같은 카드에서 확인되게 한다.
          try {
            const mirrorRef = await fb.db.collection('inquiries').add({
              type: 'editor',
              typeLabel: '에디터 지원',
              category: 'editor-apply',
              name: name || (user.displayName || ''),
              email: email || (user.email || ''),
              fields: fieldsMap,
              attachments,
              agree: true,
              status: 'new',
              userId: user.uid,
              userEmail: user.email || '',
              applicationId: appRef.id,
              createdAt: fb.FieldValue.serverTimestamp()
            });
            await appRef.update({ inquiryId: mirrorRef.id });
          } catch (mirrErr) {
            console.warn('[inquiry] 에디터 지원 미러 생성 실패:', mirrErr && mirrErr.message);
          }
        } else {
          await fb.db.collection('inquiries').add({
            type: _inqCurrentKey,
            typeLabel: cfg.title,
            category: category || '',
            name: name || (user.displayName || ''),
            email: email || (user.email || ''),
            fields: fieldsMap,
            attachments,
            agree: true,
            status: 'new',
            userId: user.uid,
            userEmail: user.email || '',
            createdAt: fb.FieldValue.serverTimestamp()
          });
        }
        closeInquiry();
        showToast(cfg.successMsg || '문의가 접수되었어요.<br/>답변은 메시지함에서 확인하실 수 있어요.');
      } catch (err) {
        errEl.textContent = '전송 실패: ' + err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = origLabel;
      }
    }

    // ---- 트리거 바인딩 ----
    // data-inquiry / data-about-movement 는 문서 전역 위임으로 처리 (바인딩 누락·동적 요소에도 항상 동작)
    let _inqDelegated = false;
    function bindDelegation() {
      if (_inqDelegated) return; _inqDelegated = true;
      document.addEventListener('click', e => {
        const inqEl = e.target.closest('[data-inquiry]');
        if (inqEl) { e.preventDefault(); openInquiry(inqEl.getAttribute('data-inquiry')); return; }
      });
    }

    function bindTriggers() {
      ensureModal();
      bindDelegation();
      // 커서 표시만 보정 (클릭 동작은 위임이 담당)
      document.querySelectorAll('[data-inquiry],[data-about-movement]').forEach(el => {
        el.style.cursor = 'pointer';
        if (el.tagName === 'A' && !el.getAttribute('href')) el.setAttribute('href', '#');
      });
      // 푸터 'Contact' 링크(전 페이지) → 일반 문의
      document.querySelectorAll('.footer-links a').forEach(a => {
        if (a._inqBound) return;
        if ((a.textContent || '').trim() === 'Contact') {
          a._inqBound = true;
          a.addEventListener('click', e => { e.preventDefault(); openInquiry('general'); });
        }
      });
      // 푸터 하단 주소(locallayers.kr) 클릭 → LOCALLAYERS 브랜드 스토리 모달
      // (openBrandModal 캐러셀 하나만 사용 — aboutMovementModal 중복 트리거 제거)
    }

    window.openInquiry = openInquiry;
    window.openEditorApply = async function () {
      // 독자 아이디 게이트
      if (window.fb && fb.currentUser) {
        var _u = fb.currentUser();
        if (_u) {
          var _sl = await _loadMySlug(_u.uid);
          if (!_sl) {
            if (typeof showToast === 'function') showToast('에디터 지원을 하려면 먼저 독자 아이디를 설정해주세요.');
            if (typeof window.openSlugSetting === 'function') window.openSlugSetting();
            return;
          }
        }
      }
      openInquiry('editor');
    };
    // 로그인 게이트로 막혔던 문의는 로그인 성공 직후 자동으로 다시 연다
    if (window.fb && fb.onAuthChange) {
      fb.onAuthChange(user => {
        if (user && _inqPendingKey) {
          const k = _inqPendingKey;
          _inqPendingKey = null;
          setTimeout(() => openInquiry(k), 250);
        }
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindTriggers);
    } else {
      bindTriggers();
    }
  })();

  /* =====================================================================
   * 인라인 주석 호버 카드 (용어사전 / 인용 / 각주)
   *   본문 .anno 스팬에 점선 밑줄 + 마우스오버/클릭 시 툴팁 카드.
   *   데이터는 bodyHtml 안 data-* 속성에 인라인 저장 (별도 컬렉션 없음).
   *   - mouseover/focus → 카드 표시
   *   - mouseout/blur   → (고정 안 됐으면) 숨김
   *   - click           → 카드 고정(pin) → 인용 출처 링크 클릭 가능
   *   - Esc / 바깥 클릭  → 고정 해제
   *   - scroll / resize  → 위치 재계산
   * ===================================================================== */
  var _annoTipEl = null;     // 싱글톤 카드 엘리먼트
  var _annoCur = null;       // 현재 카드를 띄운 .anno
  var _annoPinned = false;   // 클릭으로 고정됐는지
  var _annoSetupDone = false;
  var _ANNO_LABELS = { term: '용어', cite: '인용', note: '각주' };

  function _annoEnsureTip() {
    if (_annoTipEl) return _annoTipEl;
    var tip = document.createElement('div');
    tip.className = 'anno-tip';
    tip.setAttribute('role', 'tooltip');
    tip.innerHTML =
      '<span class="anno-tip-label"></span>' +
      '<span class="anno-tip-text"></span>' +
      '<a class="anno-tip-src" target="_blank" rel="noopener noreferrer"></a>' +
      '<span class="anno-tip-arrow"></span>';
    document.body.appendChild(tip);
    // 카드 위에 마우스가 들어오면(고정 상태에서) 유지
    tip.addEventListener('mouseenter', function () {
      if (_annoHideTimer) { clearTimeout(_annoHideTimer); _annoHideTimer = null; }
    });
    tip.addEventListener('mouseleave', function () {
      if (!_annoPinned) _annoScheduleHide();
    });
    _annoTipEl = tip;
    return tip;
  }

  var _annoHideTimer = null;
  function _annoScheduleHide() {
    if (_annoHideTimer) clearTimeout(_annoHideTimer);
    _annoHideTimer = setTimeout(_annoHide, 140);
  }

  function _annoFill(el) {
    var tip = _annoEnsureTip();
    var type = el.getAttribute('data-anno') || 'note';
    var text = el.getAttribute('data-text') || '';
    var src = el.getAttribute('data-source') || '';
    var url = el.getAttribute('data-url') || '';
    tip.querySelector('.anno-tip-label').textContent = _ANNO_LABELS[type] || '주석';
    tip.querySelector('.anno-tip-text').textContent = text;
    var a = tip.querySelector('.anno-tip-src');
    var label = src || url;
    if (label) {
      a.textContent = src ? (url ? src + ' ↗' : src) : (url + ' ↗');
      if (url) { a.setAttribute('href', url); a.style.display = ''; a.classList.add('has-link'); }
      else { a.removeAttribute('href'); a.style.display = ''; a.classList.remove('has-link'); }
    } else {
      a.textContent = ''; a.removeAttribute('href'); a.style.display = 'none';
    }
    tip.className = 'anno-tip anno-tip-' + type;
  }

  function _annoPosition(el) {
    var tip = _annoTipEl; if (!tip) return;
    var r = el.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var margin = 10, gap = 10;
    // 가로: 단어 중앙에 정렬하되 화면 밖으로 안 나가게
    var cx = r.left + r.width / 2;
    var left = cx - tw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));
    // 세로: 기본은 위쪽, 공간 없으면 아래쪽
    var top = r.top - th - gap;
    var below = false;
    if (top < margin) { top = r.bottom + gap; below = true; }
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tip.classList.toggle('below', below);
    // 화살표 x 위치 (카드 기준 단어 중앙)
    var ax = cx - left;
    ax = Math.max(14, Math.min(ax, tw - 14));
    tip.style.setProperty('--ax', Math.round(ax) + 'px');
  }

  function _annoShow(el) {
    if (_annoHideTimer) { clearTimeout(_annoHideTimer); _annoHideTimer = null; }
    _annoCur = el;
    _annoFill(el);
    var tip = _annoTipEl;
    tip.classList.add('show');
    _annoPosition(el);
  }

  function _annoHide() {
    if (_annoPinned) return;
    if (_annoTipEl) _annoTipEl.classList.remove('show', 'pinned');
    _annoCur = null;
  }

  function _annoForceHide() {
    _annoPinned = false;
    if (_annoTipEl) _annoTipEl.classList.remove('show', 'pinned');
    _annoCur = null;
  }

  function _annoSetup() {
    if (_annoSetupDone) return;
    _annoSetupDone = true;
    _annoEnsureTip();
    // 이벤트 위임 — 본문이 나중에 렌더돼도 동작
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest && e.target.closest('.anno');
      if (!el || _annoPinned) return;
      _annoShow(el);
    });
    document.addEventListener('mouseout', function (e) {
      var el = e.target.closest && e.target.closest('.anno');
      if (!el || _annoPinned) return;
      // 카드 쪽으로 빠지는 경우는 카드의 mouseenter가 잡음
      _annoScheduleHide();
    });
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('.anno');
      if (el) {
        e.preventDefault();
        if (_annoPinned && _annoCur === el) { _annoForceHide(); return; }
        _annoPinned = false;       // 우선 해제 후 새로 고정
        _annoShow(el);
        _annoPinned = true;
        _annoTipEl.classList.add('pinned');
        return;
      }
      // 카드 내부 클릭(링크 등)은 유지
      if (_annoTipEl && _annoTipEl.contains(e.target)) return;
      if (_annoPinned) _annoForceHide();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _annoPinned) _annoForceHide();
    });
    var reflow = function () {
      if ((_annoPinned || (_annoTipEl && _annoTipEl.classList.contains('show'))) && _annoCur) {
        if (document.body.contains(_annoCur)) _annoPosition(_annoCur);
        else _annoForceHide();
      }
    };
    window.addEventListener('scroll', reflow, { passive: true });
    window.addEventListener('resize', reflow);
  }

  // 공개 진입점 — 아티클 렌더 직후 호출
  function initArticleAnnotations() {
    _annoForceHide();
    _annoSetup();
  }
  window.initArticleAnnotations = initArticleAnnotations;

  /* =====================================================================
   * GlobalAudio — #27 팟캐스트 글로벌 이어듣기 (A안)
   *   팟캐스트 페이지를 벗어날 때 "계속 들으시겠습니까?" → 계속이면
   *   하단 지속 재생바가 모든 페이지에서 이어 재생.
   *   MPA 특성상 무중단(gapless) 재생은 불가 → 저장 위치에서 재개(resume).
   *   상태: localStorage 'persp_ga'
   *     { id, title, cat, thumb, ytId, audioSrc, pos, dur, rate, resume }
   * ===================================================================== */
  (function () {
    var KEY = 'persp_ga';
    var RATES = [1, 1.25, 1.5, 2, 0.75];

    function read() {
      try { return JSON.parse(localStorage.getItem(KEY) || 'null') || null; } catch (e) { return null; }
    }
    function write(s) {
      try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {}
    }
    function esc(s) { return (typeof escHTML === 'function') ? escHTML(s) : String(s == null ? '' : s); }
    function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var m = Math.floor(s / 60), x = s % 60; return m + ':' + String(x).padStart(2, '0'); }

    // ---- 미디어 팩토리 (pod-player.js와 동일 전략: YT 음원 또는 HTML5 오디오) ----
    function createAudioMedia(src, on) {
      var a = new Audio(); a.preload = 'metadata'; a.src = src;
      a.addEventListener('play', on.play);
      a.addEventListener('pause', on.pause);
      a.addEventListener('ended', on.ended);
      a.addEventListener('timeupdate', on.time);
      a.addEventListener('loadedmetadata', on.ready);
      a.addEventListener('durationchange', on.ready);
      return {
        play: function () { return a.play(); }, pause: function () { a.pause(); },
        destroy: function () { try { a.pause(); a.src = ''; } catch (e) {} },
        get paused() { return a.paused; },
        get currentTime() { return a.currentTime || 0; },
        set currentTime(v) { try { a.currentTime = v; } catch (e) {} },
        get duration() { return a.duration || 0; },
        setRate: function (r) { a.playbackRate = r; }
      };
    }
    function createYouTubeMedia(id, on) {
      var player = null, ready = false, poll = null, host = null;
      host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      var inner = document.createElement('div'); host.appendChild(inner); document.body.appendChild(host);
      function startPoll() { stopPoll(); poll = setInterval(on.time, 250); }
      function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }
      function boot() {
        player = new YT.Player(inner, {
          videoId: id, width: '1', height: '1',
          playerVars: { controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3 },
          events: {
            onReady: function () { ready = true; on.ready(); },
            onStateChange: function (e) {
              if (e.data === YT.PlayerState.PLAYING) { on.play(); startPoll(); }
              else if (e.data === YT.PlayerState.PAUSED) { on.pause(); stopPoll(); }
              else if (e.data === YT.PlayerState.ENDED) { on.ended(); stopPoll(); }
            }
          }
        });
      }
      if (window.YT && window.YT.Player) { boot(); }
      else {
        var prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function () { if (typeof prev === 'function') prev(); boot(); };
        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
          var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
        }
      }
      var PS = function () { return (window.YT && YT.PlayerState) ? YT.PlayerState : { PLAYING: 1 }; };
      return {
        play: function () { if (player && player.playVideo) player.playVideo(); return Promise.resolve(); },
        pause: function () { if (player && player.pauseVideo) player.pauseVideo(); },
        destroy: function () { stopPoll(); try { if (player && player.destroy) player.destroy(); } catch (e) {} try { if (host) host.remove(); } catch (e) {} },
        get paused() { return !(player && ready && player.getPlayerState && player.getPlayerState() === PS().PLAYING); },
        get currentTime() { return (player && player.getCurrentTime) ? (player.getCurrentTime() || 0) : 0; },
        set currentTime(v) { if (player && player.seekTo) player.seekTo(v, true); },
        get duration() { return (player && player.getDuration) ? (player.getDuration() || 0) : 0; },
        setRate: function (r) { if (player && player.setPlaybackRate) player.setPlaybackRate(r); }
      };
    }

    // ---- 런타임 상태 ----
    var media = null;       // 글로벌 바가 직접 구동하는 미디어 (이 페이지에 팟캐스트 자체 플레이어가 없을 때만)
    var bar = null;         // 하단 바 DOM
    var seeded = false;     // startAt 1회 시드 완료
    var pageOwned = false;  // 이 페이지가 팟캐스트 자체 플레이어를 보유 → 글로벌 바 미구동
    var curRate = 1;
    var ri = 0;
    var st = read();        // 최신 스냅샷

    function persist(patch) {
      st = st || {};
      if (patch) for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) st[k] = patch[k];
      write(st);
    }

    // ---- 바 DOM ----
    function buildBar() {
      if (bar) return bar;
      bar = document.createElement('div');
      bar.id = 'globalAudioBar';
      bar.className = 'ga-bar';
      bar.innerHTML =
        '<div class="ga-inner">' +
          '<a class="ga-thumb" id="gaThumb" aria-label="에피소드로 이동"></a>' +
          '<button class="ga-play" id="gaPlay" aria-label="재생/일시정지"><i class="fa-solid fa-play"></i><i class="fa-solid fa-pause"></i></button>' +
          '<button class="ga-skip" id="gaBack" aria-label="15초 뒤로"><i class="fa-solid fa-rotate-left"></i></button>' +
          '<button class="ga-skip" id="gaFwd" aria-label="15초 앞으로"><i class="fa-solid fa-rotate-right"></i></button>' +
          '<div class="ga-main">' +
            '<a class="ga-title" id="gaTitle"></a>' +
            '<div class="ga-track">' +
              '<span class="ga-time" id="gaCur">0:00</span>' +
              '<div class="ga-prog" id="gaProg" aria-label="진행 바"><div class="ga-prog-fill" id="gaFill"></div></div>' +
              '<span class="ga-time" id="gaDur">--:--</span>' +
            '</div>' +
          '</div>' +
          '<button class="ga-rate" id="gaRate">1.0×</button>' +
          '<button class="ga-resume" id="gaResume" hidden>이어듣기</button>' +
          '<button class="ga-close" id="gaClose" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>';
      document.body.appendChild(bar);
      document.body.classList.add('has-ga');
      bindBar();
      return bar;
    }
    function $(id) { return document.getElementById(id); }
    function bindBar() {
      var play = $('gaPlay'), back = $('gaBack'), fwd = $('gaFwd'), prog = $('gaProg'),
          rate = $('gaRate'), close = $('gaClose'), resume = $('gaResume');
      if (play) play.addEventListener('click', function () { toggle(); });
      if (resume) resume.addEventListener('click', function () { resume.setAttribute('hidden', ''); attemptPlay(true); });
      if (back) back.addEventListener('click', function () { if (media) { media.currentTime = Math.max(0, media.currentTime - 15); paint(); } });
      if (fwd) fwd.addEventListener('click', function () { if (media) { media.currentTime = Math.min(media.duration || 0, media.currentTime + 15); paint(); } });
      if (prog) prog.addEventListener('click', function (e) {
        if (!media || !media.duration) return;
        var r = prog.getBoundingClientRect();
        var frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        media.currentTime = frac * media.duration; paint();
      });
      if (rate) rate.addEventListener('click', function () {
        ri = (ri + 1) % RATES.length; curRate = RATES[ri];
        if (media) media.setRate(curRate);
        rate.textContent = String(curRate).replace(/\.0+$/, '.0') + '×';
        persist({ rate: curRate });
      });
      if (close) close.addEventListener('click', function () { stop(); });
    }

    function fillMeta() {
      if (!bar || !st) return;
      var t = $('gaTitle'), th = $('gaThumb');
      var href = '/articles/' + encodeURIComponent(st.id || '');
      if (t) { t.textContent = st.title || '에피소드'; t.setAttribute('href', href); }
      if (th) {
        th.setAttribute('href', href);
        th.style.backgroundImage = st.thumb ? ('url("' + st.thumb + '")') : '';
        if (!st.thumb) th.innerHTML = '<i class="fa-solid fa-podcast"></i>';
        else th.innerHTML = '';
      }
    }

    function paint() {
      if (!bar || !media) return;
      var dur = media.duration || 0, cur = media.currentTime || 0;
      var frac = dur ? (cur / dur) : 0;
      if ($('gaCur')) $('gaCur').textContent = fmt(cur);
      if ($('gaDur')) $('gaDur').textContent = dur ? fmt(dur) : '--:--';
      if ($('gaFill')) $('gaFill').style.width = (frac * 100).toFixed(2) + '%';
      persist({ pos: cur, dur: dur });
    }

    function setPlayingUI(on) {
      if (bar) bar.classList.toggle('ga-playing', on);
      persist({ resume: true });
      if (st) { st.playing = on; }
    }

    function mediaCallbacks() {
      return {
        play: function () { setPlayingUI(true); },
        pause: function () { setPlayingUI(false); },
        ended: function () { setPlayingUI(false); },
        time: function () { paint(); },
        ready: function () {
          if (!seeded && st && (media.duration || 0) > 0) {
            seeded = true;
            var p = Number(st.pos) || 0;
            if (p > 0) { try { media.currentTime = Math.min(p, media.duration || p); } catch (e) {} }
            if (st.rate) { curRate = st.rate; ri = Math.max(0, RATES.indexOf(st.rate)); media.setRate(curRate); var rb = $('gaRate'); if (rb) rb.textContent = String(curRate).replace(/\.0+$/, '.0') + '×'; }
          }
          paint();
        }
      };
    }

    function ensureMedia() {
      if (media || !st) return;
      var cb = mediaCallbacks();
      media = st.ytId ? createYouTubeMedia(st.ytId, cb) : (st.audioSrc ? createAudioMedia(st.audioSrc, cb) : null);
    }

    function toggle() {
      if (!media) return;
      if (media.paused) attemptPlay(true); else media.pause();
    }

    // 자동재생 시도 → 실패(브라우저 차단) 시 '이어듣기' 탭 버튼 노출
    function attemptPlay(userGesture) {
      if (!media) return;
      var p;
      try { p = media.play(); } catch (e) { p = null; }
      if (p && typeof p.then === 'function') {
        p.then(function () {
          var rb = $('gaResume'); if (rb) rb.setAttribute('hidden', '');
        }).catch(function () {
          if (!userGesture) { var rb = $('gaResume'); if (rb) rb.removeAttribute('hidden'); }
        });
      }
    }

    function stop() {
      if (media) { try { media.pause(); } catch (e) {} try { if (media.destroy) media.destroy(); } catch (e) {} }
      media = null;
      if (bar) { try { bar.remove(); } catch (e) {} bar = null; }
      document.body.classList.remove('has-ga');
      persist({ resume: false, playing: false });
    }

    // ===== 외부 API =====
    var GA = {
      // pod-player onTick → 스냅샷 갱신 (자체 페이지에서 위치를 계속 저장)
      note: function (meta, state) {
        meta = meta || {}; state = state || {};
        st = st || {};
        if (meta.id) st.id = meta.id;
        if (meta.title != null) st.title = meta.title;
        if (meta.cat != null) st.cat = meta.cat;
        if (meta.thumb != null) st.thumb = meta.thumb;
        if (meta.ytId != null) st.ytId = meta.ytId || '';
        if (meta.audioSrc != null) st.audioSrc = meta.audioSrc || '';
        if (typeof state.pos === 'number') st.pos = state.pos;
        if (typeof state.dur === 'number') st.dur = state.dur;
        if (typeof state.rate === 'number') st.rate = state.rate;
        st.playing = !!state.playing;
        write(st);
      },
      // 자체 페이지가 위치를 시드할 때 사용 (같은 에피소드면 저장 위치 반환)
      savedPosFor: function (id) {
        var s = read();
        return (s && s.id === id && Number(s.pos) > 0) ? Number(s.pos) : 0;
      },
      // "계속 들으시겠습니까?" 모달
      requestContinue: function (cb) {
        showModal(cb);
      },
      startResume: function () { persist({ resume: true, playing: true }); },
      // 팟캐스트 페이지의 자체 플레이어가 에피소드를 점유 → 글로벌 바 중단(중복 재생 방지)
      claimPage: function (id) {
        pageOwned = true;
        if (media) { try { media.pause(); } catch (e) {} try { if (media.destroy) media.destroy(); } catch (e) {} media = null; }
        if (bar) { try { bar.remove(); } catch (e) {} bar = null; document.body.classList.remove('has-ga'); }
        // 자체 플레이어가 이어받았으므로 글로벌 재개 플래그 해제 (이 페이지가 주도)
        persist({ resume: false });
      },
      stop: stop,
      // 페이지 로드 시 재개
      init: function () {
        st = read();
        if (!st || !st.resume) return;
        if (!st.ytId && !st.audioSrc) return;
        var start = function () {
          if (pageOwned) return; // 자체 플레이어가 점유했으면 글로벌 바 미노출
          buildBar();
          fillMeta();
          ensureMedia();
          if (st.playing) attemptPlay(false); // 자동재생 시도(제스처 없음) → 차단 시 '이어듣기'
        };
        // 아티클 페이지는 비동기 렌더 후 claimPage()가 호출될 수 있으므로
        // 잠시 대기하여 (팟캐스트면) 글로벌 바가 깜빡이지 않게 한다.
        if (document.getElementById('articleMain')) {
          setTimeout(start, 1400);
        } else {
          start();
        }
      }
    };

    // ---- 모달 ----
    function showModal(cb) {
      var done = false;
      function finish(v) { if (done) return; done = true; try { ov.remove(); } catch (e) {} cb && cb(v); }
      var ov = document.createElement('div');
      ov.className = 'ga-modal-ov';
      ov.innerHTML =
        '<div class="ga-modal" role="dialog" aria-modal="true">' +
          '<div class="ga-modal-h">계속 들으시겠습니까?</div>' +
          '<p class="ga-modal-p">페이지를 이동해도 하단 재생바에서 이어서 들을 수 있어요.</p>' +
          '<div class="ga-modal-btns">' +
            '<button class="ga-modal-no" id="gaModalNo">그만 듣기</button>' +
            '<button class="ga-modal-yes" id="gaModalYes">계속 듣기</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) finish('stop'); });
      var yes = ov.querySelector('#gaModalYes'), no = ov.querySelector('#gaModalNo');
      if (yes) yes.addEventListener('click', function () { finish('continue'); });
      if (no) no.addEventListener('click', function () { finish('stop'); });
    }

    window.GlobalAudio = GA;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { GA.init(); });
    } else {
      GA.init();
    }
  })();
