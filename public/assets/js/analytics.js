/* =========================================================
   Google Analytics 4
   ---------------------------------------------------------
   측정 ID만 넣으면 동작한다. 비워두면 아무 요청도 보내지 않으므로
   ID를 발급받기 전에도 사이트에 그대로 두어도 된다.

   ID 발급 위치:
     analytics.google.com > 관리 > 데이터 스트림 > 웹 > 측정 ID (G-로 시작)

   어드민(/admin/**)에는 넣지 않는다. 운영자가 콘텐츠를 관리하며 만드는
   조회가 방문자 통계에 섞이면 수치를 신뢰할 수 없다.
   ========================================================= */
(function () {
  var MEASUREMENT_ID = 'G-C4EKZJWD2D';   // LOCALLAYERS (locallayers.kr)

  if (!MEASUREMENT_ID) return;
  // 어드민 경로에서는 수집하지 않는다 (직접 열었을 때 대비한 이중 안전장치)
  if (/^\/admin(\/|$)/.test(location.pathname)) return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, {
    // 아티클은 /articles/{id} 로 URL이 나뉘므로 기본 page_view 로 글별 조회가 잡힌다.
    anonymize_ip: true
  });
})();
