/* =========================================================
   카카오 지도 · 주소 검색 공통 로더
   ---------------------------------------------------------
   여기에 두는 키는 반드시 'JavaScript 키' 하나뿐이다.
   JS 키는 브라우저에 노출되는 것이 정상이며, 카카오 개발자 콘솔의
   [앱 설정 > 플랫폼 > Web > 사이트 도메인] 화이트리스트로 보호된다.
   ※ REST API 키와 네이티브 앱 키는 서버/앱 전용 비밀값이므로
     절대 이 파일(또는 클라이언트 코드)에 넣지 말 것.

   SDK는 필요한 페이지에서만 동적으로 불러온다.
   지도가 없는 아티클에서 카카오 스크립트를 받지 않게 하기 위함.
   ========================================================= */
(function () {
  // 카카오 개발자 콘솔 > 플랫폼 키 > JavaScript 키 > 'locallayers' (LOCALLAYER 전용 키)
  var KAKAO_JS_KEY = '298bab0b7890837479a8c582e2252d31';

  var mapsPromise = null;
  var postcodePromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('스크립트를 불러오지 못했습니다: ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* 카카오 지도 SDK. libraries=services 를 붙여야 주소→좌표 변환(Geocoder)을 쓸 수 있다.
     autoload=false + kakao.maps.load() 조합이라야 로드 완료 시점을 보장할 수 있다. */
  window.loadKakaoMaps = function () {
    if (mapsPromise) return mapsPromise;
    mapsPromise = loadScript(
      'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + KAKAO_JS_KEY + '&libraries=services&autoload=false'
    ).then(function () {
      return new Promise(function (resolve) {
        window.kakao.maps.load(function () { resolve(window.kakao); });
      });
    }).catch(function (err) {
      mapsPromise = null;   // 실패 시 다음 호출에서 재시도할 수 있도록 캐시를 비운다
      throw err;
    });
    return mapsPromise;
  };

  /* 다음 우편번호 서비스(주소 검색 팝업) — 별도 키가 필요 없다. */
  window.loadPostcode = function () {
    if (postcodePromise) return postcodePromise;
    postcodePromise = loadScript(
      'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    ).catch(function (err) {
      postcodePromise = null;
      throw err;
    });
    return postcodePromise;
  };
})();
