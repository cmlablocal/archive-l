/* =====================================================================
 * pod-player.js — Local Layers 팟캐스트 플레이어 (재사용 모듈)
 *
 * 사용법:
 *   window.initPodcastPlayer({
 *     ytId: 'Nk77dIscxZA',      // 유튜브 영상 ID (소리만 재생). 없으면 audioSrc 사용
 *     audioSrc: 'https://.../ep01.mp3', // 웹 오디오 URL (유튜브가 아닐 때)
 *     downloadName: 'perspective-audio.mp3' // 다운로드 파일명(선택)
 *   });
 *
 * 전제: 페이지에 podcast.html 과 동일한 플레이어 마크업(아래 ID/클래스)이 존재해야 함.
 *   #stage #playBtn  / .pod-player
 *   #dock #dockPlay #back15 #fwd15 #rateBtn
 *   #prog #progFill #progThumb #dCur #dDur
 *   #chapBtn #chapPanel  / .pod-chap[data-t]
 *   #dlBtn (선택)
 * ===================================================================== */
(function () {
  function initPodcastPlayer(opts) {
    opts = opts || {};
    var $ = function (id) { return document.getElementById(id); };
    function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var m = Math.floor(s / 60), x = s % 60; return m + ':' + String(x).padStart(2, '0'); }
    function setPlayingUI(on) { document.body.classList.toggle('pod-playing', on); }

    function parseYouTubeId(u) {
      if (!u) return null;
      if (/^[\w-]{11}$/.test(u)) return u;
      var m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
      return m ? m[1] : null;
    }

    var ytId = parseYouTubeId(opts.ytId) || null;
    var audioSrc = (!ytId && opts.audioSrc) ? opts.audioSrc : '';

    // 필수 마크업 없으면 조용히 종료
    if (!$('playBtn') || !$('stage')) return;

    var cb = {
      play: function () { setPlayingUI(true); },
      pause: function () { setPlayingUI(false); },
      time: function () { paint(); },
      ready: function () { setDur(); paint(); }
    };

    function createAudioMedia(src) {
      var a = new Audio(); a.preload = 'metadata'; a.src = src;
      a.addEventListener('play', cb.play);
      a.addEventListener('pause', cb.pause);
      a.addEventListener('ended', cb.pause);
      a.addEventListener('timeupdate', cb.time);
      a.addEventListener('loadedmetadata', cb.ready);
      a.addEventListener('durationchange', function () { setDur(); });
      return {
        play: function () { a.play(); }, pause: function () { a.pause(); },
        get paused() { return a.paused; },
        get currentTime() { return a.currentTime || 0; },
        set currentTime(v) { a.currentTime = v; },
        get duration() { return a.duration || 0; },
        setRate: function (r) { a.playbackRate = r; }
      };
    }

    function createYouTubeMedia(id) {
      var player = null, ready = false, poll = null;
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      var inner = document.createElement('div'); host.appendChild(inner); document.body.appendChild(host);
      function startPoll() { stopPoll(); poll = setInterval(cb.time, 250); }
      function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }
      function boot() {
        player = new YT.Player(inner, {
          videoId: id, width: '1', height: '1',
          playerVars: { controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3 },
          events: {
            onReady: function () { ready = true; cb.ready(); },
            onStateChange: function (e) {
              if (e.data === YT.PlayerState.PLAYING) { cb.play(); startPoll(); }
              else if (e.data === YT.PlayerState.PAUSED) { cb.pause(); stopPoll(); }
              else if (e.data === YT.PlayerState.ENDED) { cb.pause(); stopPoll(); }
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
      var YTS = function () { return (window.YT && YT.PlayerState) ? YT.PlayerState : { PLAYING: 1 }; };
      return {
        play: function () { if (player && player.playVideo) player.playVideo(); },
        pause: function () { if (player && player.pauseVideo) player.pauseVideo(); },
        get paused() { return !(player && ready && player.getPlayerState && player.getPlayerState() === YTS().PLAYING); },
        get currentTime() { return (player && player.getCurrentTime) ? (player.getCurrentTime() || 0) : 0; },
        set currentTime(v) { if (player && player.seekTo) player.seekTo(v, true); },
        get duration() { return (player && player.getDuration) ? (player.getDuration() || 0) : 0; },
        setRate: function (r) { if (player && player.setPlaybackRate) player.setPlaybackRate(r); }
      };
    }

    var media = ytId ? createYouTubeMedia(ytId) : (audioSrc ? createAudioMedia(audioSrc) : null);
    if (!media) {
      // 소스가 없으면 재생 버튼 비활성
      var pb = $('playBtn'); if (pb) { pb.disabled = true; pb.style.opacity = '.4'; pb.style.cursor = 'not-allowed'; }
      return;
    }

    var chaps = [].slice.call(document.querySelectorAll('.pod-chap'));
    function paint() {
      var dur = media.duration || 0;
      var cur = media.currentTime || 0;
      var frac = dur ? (cur / dur) : 0;
      if ($('dCur')) $('dCur').textContent = fmt(cur);
      if ($('progFill')) $('progFill').style.width = (frac * 100).toFixed(2) + '%';
      if ($('progThumb')) $('progThumb').style.left = (frac * 100).toFixed(2) + '%';
      var active = -1;
      chaps.forEach(function (c, idx) { if (cur >= parseFloat(c.dataset.t)) active = idx; });
      chaps.forEach(function (c, idx) { c.classList.toggle('active', idx === active); });
    }
    function setDur() { if ($('dDur')) $('dDur').textContent = fmt(media.duration); }

    function toggle() { if (media.paused) media.play(); else media.pause(); }
    if ($('playBtn')) $('playBtn').addEventListener('click', toggle);
    if ($('dockPlay')) $('dockPlay').addEventListener('click', toggle);
    if ($('back15')) $('back15').addEventListener('click', function () { media.currentTime = Math.max(0, media.currentTime - 15); paint(); });
    if ($('fwd15')) $('fwd15').addEventListener('click', function () { media.currentTime = Math.min(media.duration || 0, media.currentTime + 15); paint(); });

    var RATES = [1, 1.25, 1.5, 2, 0.75];
    var ri = 0;
    if ($('rateBtn')) $('rateBtn').addEventListener('click', function () {
      ri = (ri + 1) % RATES.length; media.setRate(RATES[ri]);
      $('rateBtn').textContent = RATES[ri].toFixed(2).replace(/0$/, '').replace(/\.$/, '') + '×';
    });

    function seekFrom(el, clientX) {
      var r = el.getBoundingClientRect();
      var frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      if (media.duration) { media.currentTime = frac * media.duration; paint(); }
    }
    if ($('prog')) $('prog').addEventListener('click', function (e) { seekFrom($('prog'), e.clientX); });

    chaps.forEach(function (c) {
      c.addEventListener('click', function () {
        media.currentTime = parseFloat(c.dataset.t) || 0;
        if (media.paused) media.play();
        paint();
      });
    });

    var chapBtn = $('chapBtn'), chapPanel = $('chapPanel');
    if (chapBtn && chapPanel) {
      var setChapPanel = function (open) { chapPanel.classList.toggle('open', open); chapBtn.classList.toggle('active', open); };
      chapBtn.addEventListener('click', function () { setChapPanel(!chapPanel.classList.contains('open')); });
      chapPanel.querySelectorAll('.pod-chap').forEach(function (c) { c.addEventListener('click', function () { setChapPanel(false); }); });
    }

    // 다운로드: 웹 오디오 URL일 때만 활성. 유튜브 음원은 직접 다운로드 불가.
    var dlBtn = $('dlBtn');
    if (dlBtn) {
      if (audioSrc) {
        dlBtn.setAttribute('href', audioSrc);
        dlBtn.setAttribute('download', opts.downloadName || 'perspective-audio.mp3');
      } else {
        // 유튜브 음원: 다운로드 박스 숨김
        var dlWrap = dlBtn.closest('.pod-download') || dlBtn.closest('section');
        if (dlWrap) dlWrap.style.display = 'none';
      }
    }

    var dock = $('dock');
    var player = document.querySelector('.pod-player');
    if (dock && player) {
      var onScroll = function () { dock.classList.toggle('show', player.getBoundingClientRect().bottom < 8); };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      onScroll();
    }

    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !/input|textarea/i.test((e.target.tagName || ''))) { e.preventDefault(); toggle(); }
    });
  }

  window.initPodcastPlayer = initPodcastPlayer;
})();
