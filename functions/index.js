/*
 * articleSSR — 아티클 공유(OG) 서버 사이드 렌더링
 *
 * 카카오톡/페이스북/네이버/트위터 등 소셜 스크레이퍼는 JS를 실행하지 않으므로,
 * /articles/** 요청을 이 함수로 라우팅하여 article.html <head>의
 * SEO 블록(<!-- SEO:START --> ~ <!-- SEO:END -->)을 글별 메타로 치환한다.
 *
 * - 템플릿: 호스팅의 원본 /article.html 을 fetch 후 메모리 캐시.
 * - 메타 우선순위: 글 OG필드(ogTitle/ogDesc/ogImage) → 글 본문필드(title/sub/lead/thumb)
 *                  → site/seo 기본값 → 하드코딩 기본값.
 * - PUBLISHED 상태가 아닌 글은 기본 메타로만 응답(초안 제목 유출 방지).
 * - 오류 시 원본 템플릿을 그대로 응답(폴백) → 사용자 경험 보존.
 * - CDN s-maxage 캐시로 함수 호출/비용 최소화.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();

setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 });

const BASE = 'https://archive-l.web.app';
const DEFAULT_IMG = BASE + '/assets/img/anothermovement_logo.png';
const TEMPLATE_URL = BASE + '/article.html';
const SITE_DESC_DEFAULT =
  '퍼스펙티브는 디자인을 보는 새로운 관점을 제안하는 디자인 콘텐츠 플랫폼입니다. 디자인 경영, 브랜드, 로컬, AI, 인터뷰까지 깊이 있는 이야기를 만나보세요.';
const SITE_NAME_DEFAULT = 'Perspective';
const SITE_TITLE_DEFAULT = '퍼스펙티브 — 디자인을 보는 새로운 관점';

const SEO_RE = /<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/;
const TEMPLATE_TTL = 10 * 60 * 1000; // 10분
let _templateCache = null;
let _templateCacheAt = 0;

async function getTemplate() {
  const now = Date.now();
  if (_templateCache && now - _templateCacheAt < TEMPLATE_TTL) return _templateCache;
  const res = await fetch(TEMPLATE_URL, { headers: { 'User-Agent': 'PerspectiveSSR/1.0' } });
  if (!res.ok) throw new Error('template fetch failed: ' + res.status);
  _templateCache = await res.text();
  _templateCacheAt = now;
  return _templateCache;
}

// Firestore 문서 ID 제약: 비어있지 않음, '.'/'..' 불가, '/' 불가,
// __.*__ 예약 패턴 불가, 1500바이트 이하.
function isValidDocId(id) {
  if (!id || id === '.' || id === '..') return false;
  if (id.indexOf('/') !== -1) return false;
  if (/^__.*__$/.test(id)) return false;
  if (Buffer.byteLength(id, 'utf8') > 1500) return false;
  return true;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clip(s, n) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
}

function buildSeoBlock(m) {
  const L = [];
  L.push('<!-- SEO:START -->');
  L.push('<title>' + esc(m.title) + '</title>');
  L.push('<meta name="description" content="' + esc(m.desc) + '" />');
  L.push('<link rel="canonical" href="' + esc(m.url) + '" />');
  L.push('<meta name="robots" content="' + esc(m.robots) + '" />');
  L.push('<meta property="og:type" content="article" />');
  L.push('<meta property="og:site_name" content="' + esc(m.siteName) + '" />');
  L.push('<meta property="og:locale" content="ko_KR" />');
  L.push('<meta property="og:title" content="' + esc(m.ogTitle) + '" />');
  L.push('<meta property="og:description" content="' + esc(m.desc) + '" />');
  L.push('<meta property="og:url" content="' + esc(m.url) + '" />');
  L.push('<meta property="og:image" content="' + esc(m.ogImage) + '" />');
  L.push('<meta name="twitter:card" content="summary_large_image" />');
  L.push('<meta name="twitter:title" content="' + esc(m.ogTitle) + '" />');
  L.push('<meta name="twitter:description" content="' + esc(m.desc) + '" />');
  L.push('<meta name="twitter:image" content="' + esc(m.ogImage) + '" />');
  L.push('<!-- SEO:END -->');
  return L.join('\n');
}

exports.articleSSR = onRequest({ memory: '256MiB', concurrency: 40 }, async (req, res) => {
  let template = null;
  try {
    template = await getTemplate();
  } catch (e) {
    console.error('[articleSSR] template load failed', e);
    // 템플릿조차 못 받으면 클라 라우팅에 맡김(원본 파일로 리다이렉트)
    res.set('Cache-Control', 'no-cache');
    res.redirect(302, '/article.html');
    return;
  }

  try {
    // slug = 경로 마지막 세그먼트
    const rawPath = (req.path || '').replace(/\/+$/, '');
    const segs = rawPath.split('/').filter(Boolean);
    let slug = '';
    try {
      slug = decodeURIComponent(segs[segs.length - 1] || '');
    } catch (_) {
      slug = segs[segs.length - 1] || '';
    }

    let pg = {};
    let site = {};
    if (slug && slug !== 'articles' && isValidDocId(slug)) {
      const db = admin.firestore();
      const [artSnap, siteSnap] = await Promise.all([
        db.collection('articles').doc(slug).get(),
        db.collection('site').doc('seo').get(),
      ]);
      if (siteSnap.exists) site = siteSnap.data() || {};
      if (artSnap.exists) {
        const d = artSnap.data() || {};
        // 발행된 글만 글별 메타 사용 (초안/예약/프리릴리즈 제목 유출 방지)
        if (d.status === 'PUBLISHED') pg = d;
      }
    }

    const siteName = site.siteName || SITE_NAME_DEFAULT;
    const hasArticle = !!(pg && (pg.title || pg.ogTitle));
    const url = BASE + '/articles/' + encodeURIComponent(slug);

    let title, ogTitle, desc, ogImage, robots;
    if (hasArticle) {
      const baseTitle = pg.ogTitle || pg.title || '';
      title = baseTitle ? baseTitle + ' | 퍼스펙티브' : site.defaultTitle || '아티클 | 퍼스펙티브';
      ogTitle = baseTitle || site.defaultTitle || SITE_TITLE_DEFAULT;
      desc = clip(pg.ogDesc || pg.sub || pg.lead || site.defaultDesc || SITE_DESC_DEFAULT, 200);
      ogImage = pg.ogImage || pg.thumb || site.defaultOgImage || DEFAULT_IMG;
      robots = 'index, follow';
    } else {
      // 글을 못 찾음(또는 미발행): 사이트 기본 메타
      title = site.defaultTitle || '아티클 | 퍼스펙티브';
      ogTitle = site.defaultTitle || SITE_TITLE_DEFAULT;
      desc = clip(site.defaultDesc || SITE_DESC_DEFAULT, 200);
      ogImage = site.defaultOgImage || DEFAULT_IMG;
      robots = 'index, follow';
    }

    let html = template;
    if (SEO_RE.test(html)) {
      html = html.replace(SEO_RE, buildSeoBlock({ title, ogTitle, desc, ogImage, url, siteName, robots }));
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
    res.status(200).send(html);
  } catch (e) {
    console.error('[articleSSR] render failed, serving raw template', e);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    res.status(200).send(template);
  }
});

/*
 * publishScheduled — 예약 발행 자동화
 *
 * new-article.html에서 예약 발행을 켜면 글이 status='SCHEDULED' + publishedAt(미래 Timestamp)로 저장된다.
 * 이 함수는 10분마다 실행되어, publishedAt이 현재 시각을 지난 SCHEDULED 글을 PUBLISHED로 전환한다.
 *
 * - 쿼리는 status=='SCHEDULED' 단일 조건만 사용(자동 단일 필드 색인) → 복합 색인 불필요.
 *   publishedAt <= now 판정은 코드에서 처리(예약 글 수는 적음).
 * - 배치 업데이트로 한 번에 반영. 멱등(이미 PUBLISHED면 다음 실행에서 대상 아님).
 */
exports.publishScheduled = onSchedule(
  { schedule: 'every 10 minutes', timeZone: 'Asia/Seoul', memory: '256MiB' },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const snap = await db.collection('articles').where('status', '==', 'SCHEDULED').get();
    if (snap.empty) {
      console.log('[publishScheduled] no scheduled articles');
      return;
    }

    const due = snap.docs.filter((doc) => {
      const at = doc.get('publishedAt');
      // publishedAt이 없거나(방어) 이미 도래한 경우 발행
      return !at || (at.toMillis ? at.toMillis() <= now.toMillis() : true);
    });

    if (due.length === 0) {
      console.log('[publishScheduled] ' + snap.size + ' scheduled, none due yet');
      return;
    }

    const batch = db.batch();
    due.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'PUBLISHED',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // 공개되면 업커밍 티저 미러 문서 제거(메인 UPCOMING에서 자연히 사라짐).
      batch.delete(db.collection('upcomingTeasers').doc(doc.id));
    });
    await batch.commit();
    console.log('[publishScheduled] published ' + due.length + ' article(s): ' +
      due.map((d) => d.id).join(', '));
  }
);
