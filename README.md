# archive L

로컬 인스퍼레이션 아카이빙 — *시선이 머문 공간, 그리고 그 너머의 경험.*

## 스택
- 정적 HTML/CSS/JS (빌드 없음)
- Firebase Hosting + Firestore + Auth (project: `archive-l`)
- 폰트: Pretendard / 컬러: 올 화이트 배경 · 블랙 텍스트

## 구조
```
public/            # 호스팅 루트
  index.html       # 메인 (아카이브 3열 그리드)
  about.html
  404.html
  assets/
    css/style.css
    js/firebase.js  # Firebase 초기화 (window.fb)
    js/app.js       # items 컬렉션 → 그리드 렌더
firebase.json
firestore.rules     # items: 공개 읽기, 관리자 쓰기 (관리자 이메일 TODO)
.firebaserc
```

## 로컬 미리보기
```
python -m http.server 8080 --directory public
# → http://localhost:8080/
```

## 배포
```
firebase deploy --only hosting
# → https://archive-l.web.app
```
