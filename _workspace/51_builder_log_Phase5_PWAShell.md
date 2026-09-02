# 구현 로그 — Phase 5 트랙2 · PWA 껍데기 (스펙 §6-0 · P1~P6)

작성: builder · 2026-09-02
스펙: `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §4-1 · §4-2 · §5 · §6-0
브랜치: `feat/photo-polish` (main 아님)
커밋: `5750688` — *PWA 껍데기 P1~P6 — 매니페스트·서비스워커·영속저장·새버전배너·용량표시·촬영*

**손대지 않은 것 (지시대로):** 트랙1(팀동기화) 전부 · T2-2(태블릿 캔버스 정밀표기) ·
`packages/canvas-core` **한 줄도** · `DB_VERSION`(1 유지, 스토어·인덱스 변경 0건).

---

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| **P1** 매니페스트 | `apps/web/public/manifest.webmanifest` (신규) | ✅ `display:standalone` · `orientation:any`(D10) · `start_url:'/'` · `scope:'/'` · `theme_color` = `--accent-ink` |
| **P1** 아이콘 3종 | `apps/web/public/icons/icon-192.png` · `icon-512.png` · `icon-maskable-512.png` (신규) | ✅ 파랑 바탕 + 흰 도면 + 빨간 결함점. 마스커블은 안전영역 62% |
| **P1** 아이콘 생성기 | `apps/web/scripts/make-icons.mjs` (신규) | ✅ 의존성 0(`node:zlib` PNG 인코더 직접 작성). `node scripts/make-icons.mjs` 로 재생성 |
| **P1** `<link rel=manifest>` | `apps/web/index.html` | ✅ + `apple-touch-icon` · `apple-mobile-web-app-*` (가정 V15) · `theme-color` |
| **P2** 서비스워커 | `apps/web/src/sw/sw.js` (신규) | ✅ 앱 셸 프리캐시만. **workbox 안 씀**(가정 V2). 손으로 작성 |
| **P2** 빌드 파일목록 주입 | `apps/web/vite.config.ts` — `swPrecachePlugin()` | ✅ 42줄. 번들에서 `.js`/`.css` 를 뽑아 `dist/sw.js` 로 emit |
| **P2** SW 등록 | `apps/web/src/pwa/useServiceWorker.ts` (신규) · `App.tsx` | ✅ 프로덕션에서만 등록. dev 에서는 오히려 `unregister()`(가정 V13) |
| **P3** `requestPersistence()` 앱 시작 1회 | `apps/web/src/data/appData.tsx` · `data/idb/db.ts` | ✅ `openDb()` 성공 **직후** 1회. `DrawingUpload` 호출은 그대로 둠(약속 1개 공유라 중복 안전) |
| **P3** 결과를 설정 화면에 표시 | `routes/settings/MiscTab.tsx` · `routes/Settings.tsx` · `styles.css` | ✅ 설정 → 기타 맨 위 `저장소 영속 [허용됨]` 카드 |
| **P4** 새 버전 배너 | `App.tsx` · `pwa/useServiceWorker.ts` · `styles.css` | ✅ install 에서 `skipWaiting()` **안 부름**. 사용자가 누를 때만 교대(가정 V9) |
| **P5** 저장 용량 경고 | `routes/ProjectList.tsx` · `styles.css` | ✅ 목록 하단 `기기 여유 4.2GB · 이 앱이 쓰는 중 812MB`. 500MB 미만이면 경고색 |
| **P6** 사진 촬영 진입점 | `ui/photos/PhotoSection.tsx` · `styles.css` | ✅ `[촬영]` 버튼 + `accept="image/*" capture="environment"`. **`onAdd` 로 기존 `photoIngest` 그대로 재사용** |

### 판단 근거 — 왜 이렇게 만들었는가

**P2 — 서비스워커를 손으로 쓴 이유 (가정 V2 그대로 이행)**
캐시 대상이 앱 셸(index.html + 해시 js/css + 매니페스트 + 아이콘) 8개뿐이고 데이터는 전부
IndexedDB 라 workbox 의 전략 엔진이 할 일이 없다. 대신 **해시 파일명을 SW 에 박는 vite 플러그인**이
필요했다(`swPrecachePlugin`). 부수효과 하나가 P4 를 공짜로 만든다 — **자산이 하나라도 바뀌면
`sw.js` 의 바이트가 바뀌므로** 브라우저가 새 버전을 발견한다.

플러그인은 자리표시자(`__BUILD_VERSION__`·`__PRECACHE_MANIFEST__`)가 **정확히 1개가 아니면
빌드를 세운다.** 치환에 실패한 채 배포되면 오프라인 부팅이 조용히 죽기 때문이다.
(실제로 첫 작성 때 주석에 토큰을 적어 2개가 됐고, 이 검사가 그 상황을 잡도록 남겼다.)

**P2 — 라우팅이 URL 기반이 아니라는 점을 반영했다**
react-router 를 안 쓰므로, SW 는 **모든 네비게이션을 `/index.html` 하나로** 돌려주면 된다.
리라이트 규칙도, 경로별 캐시 전략도 필요 없다. `vercel.json` 은 손대지 않았다.

**P2 — 캐시 범위를 일부러 좁혔다**
`PRECACHE` 에 없는 경로는 fetch 핸들러가 **손대지 않고 브라우저에 넘긴다.** 런타임 캐싱을 하지 않는다.
`public/fixtures`(개발용 표본)도 일부러 뺐다. 다른 오리진(나중에 붙을 Supabase)과 비-GET 은
가로채지 않는다 — 동기화 요청을 SW 가 먹으면 원인 못 찾는 사고가 난다.

**P3 — 이게 이번 배치에서 실질적으로 가장 중요한 한 줄이다**
`requestPersistence()` 의 유일한 호출처가 `DrawingUpload.tsx` 285행이었다. **도면을 올리지 않고
pull 만 하는 태블릿에서는 한 번도 안 돌았다** — D11 이 "필수"라고 못 박은 축출 방어가 실제로는
비어 있었다. `openDb()` 성공 직후로 옮겼다(저장된 데이터가 있는 오리진일수록 브라우저가 잘 허락한다).
기존 `DrawingUpload` 호출은 지시대로 그대로 뒀다.

곁들여 반환형을 `Promise<boolean>` → `Promise<PersistenceState>` 로 바꿨다(가정 V14).
설정 화면이 "거절됨"과 "지원 안 함"을 구분해 말해야 하고, **기존 구현은 요청이 진행 중인데
두 번째 호출이 무조건 `true` 를 받아갔다** — 화면이 거짓말을 하게 된다.

**P4 — `[지금 새로고침]` 이 먹통 버튼이 되지 않게 (가정 V9)**
install 에서 `skipWaiting()` 을 부르지 않는 것까지는 스펙 그대로다. 다만 **버튼이 `location.reload()`
만 하면 아무 일도 일어나지 않는다** — 대기 워커는 그 페이지가 완전히 닫힐 때까지 활성화되지 않아
새로고침해도 옛 버전이 다시 뜨고 배너가 또 뜬다. 그래서 버튼이 대기 워커에
`postMessage({type:'SKIP_WAITING'})` 를 보내고 `controllerchange` 를 받아 **1회만** 리로드한다.
가정 V3 의 목적(*현장 작업 중 저절로 리로드되지 않는 것*)은 그대로 지켜진다.

**최초 설치 때는 배너를 띄우지 않는다** — `navigator.serviceWorker.controller` 가 있을 때만
"갱신"으로 친다. 첫 설치의 `clients.claim()` 으로 오는 `controllerchange` 로는 리로드하지 않는다
(사용자가 누른 교대일 때만 리로드).

**주기적 갱신 확인(폴링)을 넣지 않았다.** 등록 자체가 브라우저의 확인을 1회 트리거한다.
현장에서 배터리·네트워크를 태우지 않는다(§3-7 규칙 0 의 정신).

**P6 — 파이프라인을 새로 만들지 않았다**
촬영 `<input>` 의 `onChange` 는 기존 `pickFiles` 를 그대로 부르고, 그게 기존 `onAdd` → `photoIngest`
로 간다. **EXIF 파싱·리사이즈·용량 사전검사·부분성공 처리가 전부 한 경로에 남는다.**
`multiple` 은 주지 않았다(카메라는 한 장씩 돌아온다).

---

## 미완료 / 막힌 것

없다. P1~P6 전부 구현했다. **차단 질문은 새로 생기지 않았다.**

| 손대지 않은 것 | 이유 |
|---|---|
| T2-2 정밀 표기 | ⛔ Q55 답변 대기 (지시) |
| 트랙1 전부 | ⛔ Q56~Q59 답변 대기 (지시) |
| `beforeinstallprompt` 자체 설치 버튼 | 스펙 P1~P6 에 없다. 브라우저 기본 경로(`공유 → 홈 화면에 추가`)를 쓴다 |
| `viewport-fit=cover` | `env(safe-area-inset-*)` 처리가 CSS 에 0곳이라 지금 켜면 노치 아래로 들어간다. T2-1 에서 함께 (가정 V16) |

---

## 검증한 것

| 검증 | 결과 |
|---|---|
| `npm run typecheck` (canvas-core · project-core · web) | ✅ 통과 (오류 0) |
| `npm test` | ✅ **307개 전부 통과** (15파일). 회귀 0 |
| `npm run build` (프로덕션) | ✅ 통과. `dist/sw.js` 4.75kB 생성 |
| `dist/sw.js` 토큰 치환 | ✅ `VERSION = "…"` · `PRECACHE = [8개 경로]` 로 실제 해시 파일명이 박힌 것을 눈으로 확인 |
| `node --check dist/sw.js` | ✅ 문법 정상 |
| `dist/index.html` 의 링크 | ✅ `/manifest.webmanifest` · `/icons/icon-192.png` 가 들어간 것 확인 |
| 아이콘 PNG 3종 | ✅ 실제로 열어 렌더 확인(도안이 맞게 그려짐). 192/512/512-maskable |
| 자산 변경 → SW 버전 변경 | ✅ 2회 빌드 결과 CSS 해시가 바뀌자 `VERSION` 도 바뀌는 것 확인(P4 의 전제) |
| `DB_VERSION` 불변 | ✅ `db.ts` 의 `DB_VERSION`·스토어·인덱스 **변경 0건** |
| `canvas-core` 불변 | ✅ `git status` 에 `packages/` 없음 |

**미검증 (코드로 확인 불가 — 실기기 전용):** 아래 체크리스트 ⭐ 항목 전부.
서비스워커·설치·오프라인 부팅은 **HTTPS 실제 배포본 + 실기기**에서만 검증된다.
`localhost` 로도 SW 는 돌지만, 설치 배너와 iPadOS 홈화면 동작은 재현되지 않는다.

---

## 직접 확인해주실 것

> ⚠️ **1~4는 배포본(HTTPS)에서만 확인된다.** 개발 서버에서는 서비스워커를 일부러 등록하지 않는다
> (가정 V13 — `vite preview` 와 `vite dev` 가 같은 포트라 SW 가 남으면 개발이 조용히 깨진다).
> → 확인하려면 **Vercel 에 배포한 뒤** 그 주소에서 봐 주세요.

### A. 실기기(태블릿) 전용 ⭐ — 이번 배치의 핵심

1. **설치** — 태블릿 Safari/Chrome 에서 배포 주소를 열고 `공유 → 홈 화면에 추가`
   → 아이콘이 **파랑 바탕에 흰 도면 + 빨간 점**으로 뜨고 이름이 `OnSpect` 여야 정상.
   (스크린샷이 아이콘으로 잡히면 실패 → 알려주세요)
2. **전체화면** — 홈 아이콘으로 열기 → **주소창 없이** 전체화면으로 떠야 정상
3. ⭐ **오프라인 부팅** — 한 번 연 뒤 **비행기 모드**로 바꾸고 홈 아이콘으로 다시 열기
   → **앱이 그대로 떠야 정상.** (흰 화면·공룡 화면이면 실패. 이게 "설치형"의 정의다)
   · 만약 *"오프라인이고 앱 셸이 아직 저장되지 않았습니다"* 문구가 뜨면 → 프리캐시가 실패한 것
4. ⭐ **촬영** — 결함을 하나 고르고 사진 섹션의 `[촬영]` 누르기
   → **카메라(후면)가 바로 떠야 정상.** 찍으면 기존과 똑같이 썸네일로 붙는다
   · `[촬영]` 버튼이 **안 보이면** 그 기기가 마우스 겸용으로 판정된 것 → 알려주세요(가정 V10)

### B. PC 브라우저에서 확인 가능

5. **설정 → 기타** 맨 위에 `저장소 영속 [허용됨]` 카드가 보이는가
   · `[거절됨]`·`[지원 안 함]` 이어도 **앱은 정상 동작해야 한다.** 카드 문구만 달라진다
   · `[확인 중…]` 에서 멈춰 있으면 알려주세요
6. **용역 목록 맨 아래**에 `기기 여유 4.2GB · 이 앱이 쓰는 중 812MB` 한 줄이 보이는가
   · 용역을 삭제하면 숫자가 갱신되는가
   · 브라우저가 추정치를 안 주면 **줄 자체가 안 뜬다**(0GB 라고 거짓말하지 않는다)
7. ⭐ **새 버전 배너** — 배포를 한 번 더 한 뒤, 앱을 **띄워 둔 채로** 잠시 기다렸다 새로고침
   → 상단에 파란 `새 버전이 있습니다 [지금 새로고침]` 배너가 떠야 정상
   · ⭐ **작업 중에 화면이 저절로 새로고침되면 안 된다** — 그러면 즉시 알려주세요(가정 V3 위반)
   · `[지금 새로고침]` 을 눌렀는데 **배너가 또 뜨면** 교대가 실패한 것(가정 V9 확인 지점)
8. **PC 에는 `[촬영]` 버튼이 없어야 정상** (D1). 보이면 알려주세요

### C. 회귀 확인 (건드린 화면)

9. 사진 섹션 — `+ 사진 추가` · 드래그 순서변경 · 우클릭 메뉴 · 크게보기가 **예전 그대로**인가
10. 설정 화면 — 항목 편집 · 미리보기 · 기타 탭이 예전 그대로인가
11. 도면 업로드 — 예전 그대로인가 (`requestPersistence` 호출 위치만 바뀌었고 기존 호출은 남겼다)

---

## 알려진 한계

| # | 한계 | 영향 |
|---|---|---|
| 1 | **첫 방문에는 오프라인 부팅이 안 된다.** 온라인에서 한 번 열어 SW 가 셸을 받아야 한다 | 정상 동작. 현장 나가기 전 1회 접속 필요 |
| 2 | **`vercel.json` 에 `/sw.js` 캐시 헤더를 넣지 않았다** | 브라우저 기본값(`updateViaCache:'imports'`)이 SW 스크립트를 HTTP 캐시 우회로 받으므로 현재는 문제없다. 갱신이 늦게 잡히는 현상이 보이면 헤더를 명시하면 된다 |
| 3 | **번들이 530kB 한 덩어리**라 첫 로드가 무겁다(빌드 경고) | 이번 범위 밖. 코드 스플리팅은 별도 작업 |
| 4 | **아이콘이 손으로 그린 도형**이다 | 디자인 확정 시 `scripts/make-icons.mjs` 를 고치거나 PNG 를 갈아끼우면 된다 |
| 5 | **SW 가 dev 에서 안 돈다** | 의도적(가정 V13). 오프라인 동작 확인은 배포본에서만 |
| 6 | 촬영 버튼 노출 판정이 **미디어쿼리 기반**이다 | 마우스+터치 겸용 투인원(`hover:hover`)에는 안 뜬다. 기존 터치 규칙(T-5)과 같은 판정이라 일관되지만, 특정 기기에서 안 뜨면 알려주세요 |

---

## 변경 파일 (13개 수정 · 7개 신규)

**신규**
```
apps/web/public/manifest.webmanifest
apps/web/public/icons/icon-192.png
apps/web/public/icons/icon-512.png
apps/web/public/icons/icon-maskable-512.png
apps/web/scripts/make-icons.mjs
apps/web/src/sw/sw.js
apps/web/src/pwa/useServiceWorker.ts
```

**수정**
```
apps/web/index.html                      P1  manifest·apple-touch-icon·theme-color
apps/web/vite.config.ts                  P2  swPrecachePlugin
apps/web/src/App.tsx                     P2·P4  SW 등록 + 새 버전 배너
apps/web/src/data/appData.tsx            P3  앱 시작 시 requestPersistence + persistence 컨텍스트
apps/web/src/data/idb/db.ts              P3  PersistenceState 반환 + 약속 메모이즈
apps/web/src/routes/Settings.tsx         P3  persistence 를 MiscTab 으로
apps/web/src/routes/settings/MiscTab.tsx P3  저장소 영속 카드
apps/web/src/routes/ProjectList.tsx      P5  기기 여유 표시
apps/web/src/ui/photos/PhotoSection.tsx  P6  촬영 진입점
apps/web/src/styles.css                  P4·P5·P6  배너·여유·촬영·뱃지 스타일
_workspace/ASSUMPTIONS.md                V9~V16
```

가정은 `ASSUMPTIONS.md` **V9~V16** 에 기록했다. 새 질문(QUESTIONS.md) 은 없다.
