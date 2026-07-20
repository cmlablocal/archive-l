/* ===========================================================
   Local Layers Admin — Firebase Auth 게이트 + 헬퍼
   =========================================================== */

// ============================================================
// 시스템 알림(window.alert/confirm) 대체 — 브랜드 모달
// ============================================================

// 1회만 DOM 삽입
function _ensureSysModal() {
  if (document.getElementById('sysModal')) return;
  const html = `
    <div class="sys-modal" id="sysModal" role="dialog" aria-modal="true">
      <div class="sys-modal-inner">
        <div class="sys-modal-icon" id="sysModalIcon"></div>
        <p class="sys-modal-msg" id="sysModalMsg"></p>
        <div class="sys-modal-actions" id="sysModalActions"></div>
      </div>
    </div>`;
  const tpl = document.createElement('div');
  tpl.innerHTML = html;
  document.body.appendChild(tpl.firstElementChild);

  if (document.getElementById('sysModalStyle')) return;
  const style = document.createElement('style');
  style.id = 'sysModalStyle';
  style.textContent = `
    .sys-modal {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.45);
      display: none; align-items: center; justify-content: center;
      padding: 20px;
    }
    .sys-modal.open { display: flex; }
    .sys-modal-inner {
      background: var(--bg, #fff);
      width: 100%; max-width: 360px;
      padding: 30px 28px 22px;
      border-radius: 14px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.18);
      text-align: center;
    }
    body.dark .sys-modal-inner { background: #1a1a1a; }
    .sys-modal-icon {
      font-size: 24px; color: var(--muted, #888);
      margin-bottom: 12px; line-height: 1;
    }
    .sys-modal-icon.danger { color: #dc2626; }
    .sys-modal-icon.success { color: #2d8a3e; }
    .sys-modal-msg {
      font-size: 14px; line-height: 1.7; color: var(--fg, #111);
      margin: 0 0 22px;
      white-space: pre-wrap; word-break: keep-all;
    }
    .sys-modal-actions {
      display: flex; gap: 8px; justify-content: center;
    }
    .sys-modal-btn {
      flex: 1; padding: 11px 18px; font-size: 13px;
      border-radius: 8px; cursor: pointer; border: none;
      font-family: inherit; font-weight: 500;
    }
    .sys-modal-btn.ghost {
      background: transparent; color: var(--fg);
      border: 1px solid rgba(0,0,0,0.12);
    }
    body.dark .sys-modal-btn.ghost { border-color: rgba(255,255,255,0.15); }
    .sys-modal-btn.primary { background: var(--fg, #111); color: var(--bg, #fff); }
    .sys-modal-btn.danger { background: #dc2626; color: #fff; }
  `;
  document.head.appendChild(style);
}

function _showSysModal({ msg, icon, buttons }) {
  _ensureSysModal();
  return new Promise(resolve => {
    const modal = document.getElementById('sysModal');
    const iconEl = document.getElementById('sysModalIcon');
    const msgEl = document.getElementById('sysModalMsg');
    const actEl = document.getElementById('sysModalActions');
    msgEl.textContent = msg || '';
    if (icon) {
      iconEl.className = 'sys-modal-icon' + (icon.kind ? ' ' + icon.kind : '');
      iconEl.innerHTML = icon.html || '';
      iconEl.style.display = '';
    } else {
      iconEl.style.display = 'none';
    }
    actEl.innerHTML = '';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'sys-modal-btn ' + (b.kind || 'ghost');
      btn.textContent = b.label;
      btn.onclick = () => { modal.classList.remove('open'); resolve(b.value); };
      actEl.appendChild(btn);
    });
    modal.classList.add('open');
  });
}

// 공개 API
window.sysAlert = function(msg, opts) {
  opts = opts || {};
  return _showSysModal({
    msg,
    icon: opts.icon ? { kind: opts.icon, html: '<i class="fa-solid fa-' + (opts.icon === 'danger' ? 'circle-exclamation' : opts.icon === 'success' ? 'circle-check' : 'circle-info') + '"></i>' } : null,
    buttons: [{ label: opts.okLabel || '확인', kind: 'primary', value: true }]
  });
};

window.sysConfirm = function(msg, opts) {
  opts = opts || {};
  return _showSysModal({
    msg,
    icon: { kind: opts.danger ? 'danger' : '', html: '<i class="fa-regular fa-circle-question"></i>' },
    buttons: [
      { label: opts.cancelLabel || '취소', kind: 'ghost', value: false },
      { label: opts.okLabel || '확인', kind: opts.danger ? 'danger' : 'primary', value: true }
    ]
  });
};

// Apply saved theme to admin pages (mirrors public site)
(function applyAdminTheme() {
  const saved = localStorage.getItem('persp_theme');
  const sys = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const dark = (saved || sys) === 'dark';
  document.body.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('dark', dark);
})();

// ===== Auth gate =====
// Firebase Auth 상태 확인 → admin이 아니면 로그인 페이지로
// 페이지에 `window.__ADMIN_PUBLIC = true` 설정 시 게이트 우회 (login.html에서 사용)
(function adminAuthGate() {
  if (window.__ADMIN_PUBLIC) return;
  if (!window.fb) {
    console.warn('[admin.js] Firebase가 로드되지 않았습니다. login.html에서 직접 호출되었거나 SDK 누락.');
    return;
  }
  // 인증 상태 결정될 때까지 body를 숨김
  document.documentElement.style.visibility = 'hidden';
  const bounceLogin = () => { window.location.href = '/admin/login.html'; };
  const revealAdmin = (user) => {
    document.documentElement.style.visibility = '';
    // 인증 정보를 #adminWho에 자동 표시
    const who = document.getElementById('adminWho');
    if (who) who.textContent = user.displayName || user.email;
  };
  fb.authReady.then(async user => {
    if (!user) { bounceLogin(); return; }
    if (fb.isAdmin()) { revealAdmin(user); return; }
    // 일부 페이지(예: 콘텐츠 작성)는 에디터 권한자에게도 허용 — window.__ADMIN_EDITOR_OK = true
    // _roleCache 레이스(onAuthStateChanged가 캐시를 null로 리셋)를 피하기 위해
    // loadRole의 반환값을 직접 확인한다(isStaff()/캐시 의존 제거).
    if (window.__ADMIN_EDITOR_OK === true) {
      let r = null;
      try {
        if (fb.loadRole) r = await fb.loadRole(user.uid);
        else if (fb.roleReady) r = await fb.roleReady();
      } catch (e) {}
      if (r === 'editor' || r === 'admin') {
        document.documentElement.classList.add('admin-editor-mode');
        revealAdmin(user);
        return;
      }
    }
    bounceLogin();
  });
})();

// ===== Public API =====
window.adminLogout = async function() {
  if (!(await sysConfirm('관리자 페이지에서 로그아웃하시겠어요?'))) return;
  if (window.fb) {
    fb.signOut().finally(() => {
      window.location.href = '/admin/login.html';
    });
  } else {
    window.location.href = '/admin/login.html';
  }
};

window.adminEmail = function() {
  const u = window.fb && fb.currentUser();
  return (u && u.email) || '관리자';
};

window.adminName = function() {
  const u = window.fb && fb.currentUser();
  return (u && u.displayName) || (u && u.email) || '관리자';
};

// Highlight active nav link + persist sidebar group open/close across pages
(function highlightAdminNav() {
  const LS_KEY = 'adminNavGroups';

  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function saveState(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
  }
  // 그룹 식별키: summary 텍스트(콘텐츠/소통/사이트/독자) — 페이지가 달라도 안정적
  function groupKey(group) {
    const s = group.querySelector('summary');
    return (s ? s.textContent : '').trim();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const state = loadState();

    // 1) 저장된 열림/닫힘 상태 복원
    document.querySelectorAll('details.admin-nav-group').forEach(group => {
      const key = groupKey(group);
      if (!key) return;
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        if (state[key]) group.setAttribute('open', '');
        else group.removeAttribute('open');
      }
      // 사용자가 펼치거나 접을 때 상태 저장
      group.addEventListener('toggle', () => {
        const st = loadState();
        st[groupKey(group)] = group.hasAttribute('open');
        saveState(st);
      });
    });

    // 2) 현재 페이지의 링크 활성화 + 그 그룹은 항상 열어 둠
    document.querySelectorAll('.admin-nav a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      if (path.endsWith(href) || (href.endsWith('/index.html') && path.endsWith('/admin/'))) {
        a.classList.add('active');
        const group = a.closest('details.admin-nav-group');
        if (group && !group.hasAttribute('open')) group.setAttribute('open', '');
      }
    });
  });
})();

// Number formatter
window.fmtNum = function(n) {
  return Number(n || 0).toLocaleString('ko-KR');
};

// Escape HTML
window.adminEscHTML = function(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
};

// ===== Global row-menu (⋯) close handlers =====
// Outside click closes any open <details.row-menu>.
// ESC closes them too. Idempotent — safe even if no row-menu on page.
(function setupRowMenuClose() {
  document.addEventListener('click', e => {
    document.querySelectorAll('details.row-menu[open]').forEach(d => {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    let closed = false;
    document.querySelectorAll('details.row-menu[open]').forEach(d => {
      d.removeAttribute('open');
      closed = true;
    });
    // Prevent ESC from also closing modal if we closed a menu
    if (closed) e.stopPropagation();
  }, true); // capture so we run before modal handlers
})();

// ============================================================
// 독자/에디터에게 메시지 보내기 — 공용 모달 (어드민 전용)
//   window.openAdminMsgModal(uid, { name, email, kind:'reader'|'editor' })
//   · 메시지 작성: inquiries 컬렉션에 category:'admin-message'로 저장 → 수신자의
//     마이 아카이브 '메시지' 탭에 노출.
//   · 발송 이력: 해당 사용자에게 운영팀이 보낸 모든 메시지/답변 기록.
//   · 배정 이력(에디터): editorAssignmentLogs 컬렉션의 배정 스냅샷 기록.
// ============================================================
(function setupAdminMsgModal() {
  let _ctx = null; // { uid, name, email, kind }

  function _ensure() {
    if (document.getElementById('adminMsgModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="amsg-modal" id="adminMsgModal" role="dialog" aria-modal="true">
        <div class="amsg-inner">
          <button type="button" class="amsg-close" id="amsgClose" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
          <div class="amsg-head">
            <h3 class="amsg-title" id="amsgTitle">메시지 보내기</h3>
            <div class="amsg-meta" id="amsgMeta"></div>
          </div>
          <div class="amsg-tabs" id="amsgTabs">
            <button type="button" class="amsg-tab is-active" data-tab="compose">메시지 작성</button>
            <button type="button" class="amsg-tab" data-tab="sent">발송 이력</button>
            <button type="button" class="amsg-tab amsg-tab-editor" data-tab="assign" hidden>배정 이력</button>
          </div>
          <div class="amsg-body">
            <div class="amsg-pane" data-pane="compose">
              <label class="amsg-label">제목 <span class="amsg-opt">(선택)</span></label>
              <input type="text" id="amsgSubject" class="amsg-input" placeholder="예) 활동 안내 · 일정 변경 안내" maxlength="80" />
              <label class="amsg-label">내용</label>
              <textarea id="amsgBody" class="amsg-textarea" rows="7" placeholder="회원에게 전달할 메시지를 입력하세요. 작성한 메시지는 회원의 ‘마이 아카이브 › 메시지’에 도착합니다."></textarea>
              <div class="amsg-actions">
                <button type="button" class="amsg-send" id="amsgSendBtn"><i class="fa-regular fa-paper-plane"></i> 메시지 보내기</button>
              </div>
            </div>
            <div class="amsg-pane" data-pane="sent" hidden>
              <div class="amsg-list" id="amsgSentList"><div class="amsg-empty">불러오는 중...</div></div>
            </div>
            <div class="amsg-pane" data-pane="assign" hidden>
              <div class="amsg-list" id="amsgAssignList"><div class="amsg-empty">불러오는 중...</div></div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);

    const style = document.createElement('style');
    style.id = 'adminMsgModalStyle';
    style.textContent = `
      .amsg-modal { position: fixed; inset: 0; z-index: 9998; background: rgba(0,0,0,0.45);
        display: none; align-items: center; justify-content: center; padding: 20px; }
      .amsg-modal.open { display: flex; }
      .amsg-inner { position: relative; background: var(--bg,#fff); width: 100%; max-width: 520px;
        max-height: 86vh; display: flex; flex-direction: column; border-radius: 14px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.2); overflow: hidden; }
      body.dark .amsg-inner { background: #1a1a1a; }
      .amsg-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px;
        border: none; background: transparent; color: var(--muted,#888); cursor: pointer;
        font-size: 16px; border-radius: 8px; }
      .amsg-close:hover { background: rgba(0,0,0,0.06); }
      body.dark .amsg-close:hover { background: rgba(255,255,255,0.08); }
      .amsg-head { padding: 22px 24px 0; }
      .amsg-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--fg,#111); }
      .amsg-meta { margin-top: 4px; font-size: 12px; color: var(--muted,#888); }
      .amsg-tabs { display: flex; gap: 4px; padding: 14px 24px 0; border-bottom: 1px solid var(--admin-border,rgba(0,0,0,0.08)); }
      .amsg-tab { border: none; background: transparent; padding: 9px 12px; font-size: 13px;
        font-family: inherit; color: var(--muted,#888); cursor: pointer; border-bottom: 2px solid transparent;
        margin-bottom: -1px; font-weight: 500; }
      .amsg-tab.is-active { color: var(--fg,#111); border-bottom-color: var(--fg,#111); font-weight: 700; }
      .amsg-body { padding: 18px 24px 22px; overflow-y: auto; }
      .amsg-label { display: block; font-size: 12px; font-weight: 600; color: var(--fg,#111); margin: 0 0 6px; }
      .amsg-label + .amsg-textarea, .amsg-input + .amsg-label { margin-top: 14px; }
      .amsg-opt { color: var(--muted,#888); font-weight: 400; }
      .amsg-input, .amsg-textarea { width: 100%; box-sizing: border-box; padding: 10px 12px;
        font-family: inherit; font-size: 14px; color: var(--fg,#111); background: var(--bg,#fff);
        border: 1px solid var(--admin-border,rgba(0,0,0,0.14)); border-radius: 8px; }
      body.dark .amsg-input, body.dark .amsg-textarea { background: #222; border-color: rgba(255,255,255,0.14); }
      .amsg-textarea { resize: vertical; line-height: 1.65; }
      .amsg-actions { margin-top: 16px; display: flex; justify-content: flex-end; }
      .amsg-send { border: none; background: var(--fg,#111); color: var(--bg,#fff); padding: 11px 20px;
        font-size: 13px; font-weight: 600; font-family: inherit; border-radius: 8px; cursor: pointer; }
      .amsg-send:disabled { opacity: .5; cursor: default; }
      .amsg-list { display: flex; flex-direction: column; gap: 10px; }
      .amsg-empty { padding: 28px 8px; text-align: center; color: var(--muted,#888); font-size: 13px; }
      .amsg-card { border: 1px solid var(--admin-border,rgba(0,0,0,0.1)); border-radius: 10px; padding: 12px 14px; }
      .amsg-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
      .amsg-card-tag { font-size: 11px; font-weight: 700; color: var(--fg,#111); background: rgba(0,0,0,0.06);
        padding: 2px 8px; border-radius: 999px; }
      body.dark .amsg-card-tag { background: rgba(255,255,255,0.1); }
      .amsg-card-date { font-size: 11px; color: var(--muted,#888); white-space: nowrap; }
      .amsg-card-body { font-size: 13px; line-height: 1.6; color: var(--fg,#111); white-space: pre-wrap; word-break: break-word; }
      .amsg-card-rows { font-size: 12.5px; line-height: 1.7; color: var(--fg,#111); }
      .amsg-card-rows b { font-weight: 600; }
    `;
    document.head.appendChild(style);

    // wiring
    document.getElementById('amsgClose').addEventListener('click', _close);
    document.getElementById('adminMsgModal').addEventListener('click', e => {
      if (e.target.id === 'adminMsgModal') _close();
    });
    document.querySelectorAll('#amsgTabs .amsg-tab').forEach(t => {
      t.addEventListener('click', () => _switchTab(t.dataset.tab));
    });
    document.getElementById('amsgSendBtn').addEventListener('click', _send);
  }

  function _close() {
    const m = document.getElementById('adminMsgModal');
    if (m) m.classList.remove('open');
    document.body.style.overflow = '';
  }

  function _switchTab(tab) {
    document.querySelectorAll('#amsgTabs .amsg-tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === tab));
    document.querySelectorAll('.amsg-pane').forEach(p => { p.hidden = (p.dataset.pane !== tab); });
    if (tab === 'sent') _loadSent();
    else if (tab === 'assign') _loadAssign();
  }

  function _fmtDate(ts) {
    try {
      const d = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
      if (!d || isNaN(d)) return '';
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch (_) { return ''; }
  }
  function _tsMillis(ts) {
    try { return ts && ts.toDate ? ts.toDate().getTime() : (ts ? new Date(ts).getTime() : 0); }
    catch (_) { return 0; }
  }

  async function _send() {
    if (!_ctx || !window.fb) return;
    const subjectEl = document.getElementById('amsgSubject');
    const bodyEl = document.getElementById('amsgBody');
    const body = (bodyEl.value || '').trim();
    const subject = (subjectEl.value || '').trim();
    if (!body) { sysAlert('메시지 내용을 입력하세요.', { icon: 'danger' }); return; }
    if (!(await sysConfirm(`${_ctx.name || '이 회원'}님에게 메시지를 보낼까요?\n\n회원의 ‘마이 아카이브 › 메시지’에 도착합니다.`, { okLabel: '메시지 보내기' }))) return;
    const btn = document.getElementById('amsgSendBtn');
    btn.disabled = true;
    try {
      const ts = fb.FieldValue.serverTimestamp();
      await fb.db.collection('inquiries').add({
        userId: _ctx.uid,
        name: _ctx.name || '',
        email: _ctx.email || '',
        typeLabel: subject || '운영팀 메시지',
        category: 'admin-message',
        fields: { '제목': subject || '운영팀 메시지' },
        reply: body,
        repliedAt: ts,
        repliedBy: (window.adminEmail ? adminEmail() : ''),
        status: 'ANSWERED',
        agree: true,
        createdAt: ts
      });
      subjectEl.value = '';
      bodyEl.value = '';
      await sysAlert('메시지를 보냈습니다.', { icon: 'success' });
      _close();
    } catch (err) {
      sysAlert('전송 실패: ' + (err && err.message || err), { icon: 'danger' });
    } finally { btn.disabled = false; }
  }

  const _CAT_LABEL = {
    'admin-message': '운영팀 메시지',
    'editor-selected': '에디터 선정',
    'editor-assigned': '에디터 배정 완료',
    'editor-rejected': '에디터 지원 결과'
  };

  async function _loadSent() {
    const list = document.getElementById('amsgSentList');
    list.innerHTML = `<div class="amsg-empty">불러오는 중...</div>`;
    try {
      const snap = await fb.db.collection('inquiries').where('userId', '==', _ctx.uid).get();
      // 운영팀이 보낸 것: 답변(reply)이 달린 모든 카드 = 보낸 메시지 + 문의 답변 기록
      const items = snap.docs.map(d => ({ id: d.id, data: d.data() }))
        .filter(it => it.data.reply)
        .sort((a, b) => _tsMillis(b.data.repliedAt || b.data.createdAt) - _tsMillis(a.data.repliedAt || a.data.createdAt));
      if (!items.length) { list.innerHTML = `<div class="amsg-empty">아직 보낸 메시지가 없습니다.</div>`; return; }
      list.innerHTML = items.map(it => {
        const d = it.data;
        const tag = _CAT_LABEL[d.category] || d.typeLabel || '답변';
        const date = _fmtDate(d.repliedAt || d.createdAt);
        return `<div class="amsg-card">
          <div class="amsg-card-top"><span class="amsg-card-tag">${adminEscHTML(tag)}</span><span class="amsg-card-date">${adminEscHTML(date)}</span></div>
          <div class="amsg-card-body">${adminEscHTML(d.reply)}</div>
        </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<div class="amsg-empty">이력 로딩 실패: ${adminEscHTML(err && err.message || String(err))}</div>`;
    }
  }

  async function _loadAssign() {
    const list = document.getElementById('amsgAssignList');
    list.innerHTML = `<div class="amsg-empty">불러오는 중...</div>`;
    try {
      const snap = await fb.db.collection('editorAssignmentLogs').where('uid', '==', _ctx.uid).get();
      const items = snap.docs.map(d => ({ id: d.id, data: d.data() }))
        .sort((a, b) => _tsMillis(b.data.at) - _tsMillis(a.data.at));
      if (!items.length) { list.innerHTML = `<div class="amsg-empty">아직 배정 이력이 없습니다.</div>`; return; }
      list.innerHTML = items.map(it => {
        const d = it.data;
        const rows = [];
        const fmts = Array.isArray(d.formats) ? d.formats : [];
        if (fmts.length) rows.push(`<b>포맷</b> · ${adminEscHTML(fmts.join(', '))}`);
        if (Number(d.seriesCount) > 0) rows.push(`<b>시리즈</b> · ${Number(d.seriesCount)}개${Number(d.episodeCount) > 0 ? ` (총 ${Number(d.episodeCount)}편)` : ''}`);
        if (Number(d.standaloneQuota) > 0) rows.push(`<b>단독 아티클</b> · ${Number(d.standaloneQuota)}건`);
        if (d.cycle) rows.push(`<b>발행 주기</b> · ${adminEscHTML(d.cycle)}`);
        const period = (d.activityStart || d.activityEnd)
          ? `${(d.activityStart || '').replace(/-/g, '. ')} ~ ${(d.activityEnd || '').replace(/-/g, '. ')}` : '';
        if (period) rows.push(`<b>활동 기간</b> · ${adminEscHTML(period)}`);
        if (!rows.length) rows.push('배정 내용 없음');
        const by = d.by ? ` · ${adminEscHTML(d.by)}` : '';
        return `<div class="amsg-card">
          <div class="amsg-card-top"><span class="amsg-card-tag">배정 저장</span><span class="amsg-card-date">${adminEscHTML(_fmtDate(d.at))}${by}</span></div>
          <div class="amsg-card-rows">${rows.join('<br>')}</div>
        </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<div class="amsg-empty">이력 로딩 실패: ${adminEscHTML(err && err.message || String(err))}</div>`;
    }
  }

  window.openAdminMsgModal = function(uid, opts) {
    opts = opts || {};
    if (!uid) { sysAlert('대상 사용자를 찾을 수 없습니다.', { icon: 'danger' }); return; }
    _ensure();
    _ctx = { uid, name: opts.name || '', email: opts.email || '', kind: opts.kind || 'reader' };
    document.getElementById('amsgTitle').textContent = (_ctx.name || '회원') + '님에게 메시지';
    document.getElementById('amsgMeta').textContent = [_ctx.email, _ctx.kind === 'editor' ? '에디터' : '독자'].filter(Boolean).join(' · ');
    document.getElementById('amsgSubject').value = '';
    document.getElementById('amsgBody').value = '';
    // 에디터일 때만 배정 이력 탭 노출
    const edTab = document.querySelector('#amsgTabs .amsg-tab-editor');
    if (edTab) edTab.hidden = (_ctx.kind !== 'editor');
    _switchTab('compose');
    document.getElementById('adminMsgModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  };
})();
