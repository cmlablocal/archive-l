/* ===========================================================
   archive L — 메인 스크립트
   - Firestore 'items' 컬렉션이 있으면 아카이브 그리드를 동적으로 채운다.
   - 비어있거나 실패하면 index.html의 샘플 카드를 그대로 둔다.
   =========================================================== */
(function () {
  function escHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function cardHTML(d) {
    const loc = escHTML(d.locationName || '');
    const title = escHTML(d.title || '(제목 없음)');
    const thumb = d.thumb
      ? `<img src="${escHTML(d.thumb)}" alt="${title}" loading="lazy" />`
      : `<div class="thumb-empty">archive</div>`;
    const href = d.id ? `/item.html?id=${encodeURIComponent(d.id)}` : '#';
    return `
      <a class="card" href="${href}">
        <div class="card-thumb">${thumb}</div>
        <div class="card-loc">${loc}</div>
        <h3 class="card-title">${title}</h3>
      </a>`;
  }

  function renderItems(items) {
    const grid = document.getElementById('archiveGrid');
    if (!grid || !items.length) return; // 데이터 없으면 샘플 유지
    grid.innerHTML = items.map(cardHTML).join('');
  }

  function loadArchive() {
    if (!window.fb || !window.fb.db) return;
    window.fb.db.collection('items')
      .orderBy('createdAt', 'desc')
      .limit(60)
      .get()
      .then(snap => {
        const items = snap.docs.map(doc => Object.assign({ id: doc.id }, doc.data()));
        renderItems(items);
      })
      .catch(err => {
        // 색인/권한 문제 등 — 샘플 카드 유지하고 콘솔에만 기록
        console.warn('[archive] items 로드 실패(샘플 유지):', err && err.message);
      });
  }

  document.addEventListener('DOMContentLoaded', loadArchive);
})();
