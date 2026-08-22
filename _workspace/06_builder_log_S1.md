# 구현 로그 — S1 용역 등록 · 도면 업로드

> ⚠️ builder 에이전트가 **사용한도 초과로 로그 작성 직전에 중단**되었다.
> 코드는 완결된 상태였고, 이 로그는 리더가 산출물을 실측해 복원한 것이다.
> 따라서 `## 검증한 것` 은 **리더가 직접 확인한 것만** 적혀 있다.

## 완료

| 영역 | 산출물 |
|---|---|
| 신규 패키지 | `packages/project-core` — `types` `repo` `validate` `displayName` `floorOrder` `fileNameParse` `relativeTime` |
| 저장 계층 | `apps/web/src/data/idb/` — `db` `repo` `blobs` |
| 화면 | `routes/` — `ProjectList` `ProjectForm` `ProjectSetup` `DrawingUpload` `CanvasRoute` |
| 공용 UI | `ui/` — `Form` `Sidebar` `Inspector` `Menu` `Overlays` `ToastHost` `DrawingThumb` |
| 앱 셸 | `App.tsx` `router.ts` `store.ts` `main.tsx` |
| 인입 | `data/imageIngest.ts` `data/factory.ts` `data/sampleProject.ts` |
| canvas-core 변경 | `visibility.ts` 신규 (+ `Defect.projectId`) — 스펙대로 최소 침습 |

## 검증한 것 (리더 실측)

| 항목 | 결과 |
|---|---|
| 타입 검사 3개 패키지 | ✅ 통과 (`canvas-core` / `project-core` / `web`) |
| 단위 테스트 | ✅ **129개 통과** — canvas-core 79 (6파일) + project-core 50 (4파일) |
| 프로덕션 빌드 | ✅ 78 모듈, `index.js` 278.85 kB (gzip 86.85 kB) |
| 부팅 스모크 | ✅ 흰 화면 없음, **콘솔 에러·경고 0건** |
| IndexedDB 영속 | ✅ builder 세션에서 만든 용역 2건이 **재부팅 후에도 남아 있음** |
| 도면 업로드 | ✅ `강당-지상1~5층.png` 5장이 등록된 용역이 실재 (`도면 5장 · 약 2.5MB`) |
| 표시명 파생 | ✅ `2026 하반기 한국대학교 강당 2차 정밀안전진단` |
| 회귀 픽스처 | ✅ `샘플 용역 만들기` 버튼 존재, 결함 8건 용역 실재 |

**"빌드 통과"가 아니라 실제로 뜨고 데이터가 살아있는 것까지 확인했다.**

## 미검증

- 클릭해보며 하는 사용법 검증 전반 → **사용자 몫** (검증 분담 규칙, `CLAUDE.md`)
- 파일명 자동 추출의 실패 케이스(패턴 불일치 파일)
- 도면 교체 시 결함 좌표 유지
- 알려진 버그 3건(패널 가림·줌 배율 빈칸·문구 중복)이 실제로 고쳐졌는지 — 코드에 `visibility.ts` 는 존재하나 화면 확인 안 함
- 전차 등록(T12) 동작
- 접근성·반응형 실측

## 실행 방법

```
cd C:\Users\samsung\Desktop\OnSpect
npm install
npm run dev      →  http://localhost:5173/
```

### 끝까지 만들어보는 시나리오
1. `[용역 만들기]` → 점검연도 `2026` / 시기 `상반기` / 구분 `정밀안전점검` / 용역명 입력
2. 동 추가 → 층 구성
3. 도면 업로드에서 `샘플도면\강당-지상1층.png` ~ `5층.png` **5장을 한 번에** 선택
4. 파일명에서 동(`강당`)·층(`지상1층`)이 자동으로 채워지는지 확인 → 틀린 건 고침
5. 캔버스 진입 → 도면 위 결함 표기
6. **새로고침** → 용역·도면·결함이 그대로 남아있는지

## 알려진 한계

- PDF 미지원 (Q13 — 미루기 확정. `Drawing.source` 정의만 선반영)
- 전차 등록은 동·층·도면 구조 복사까지만 (결함 승계는 Phase 2-D)
- 서버 동기화·병합·큐 없음 (D5 범위 밖)
- S2a~S5(마커 4종·설정·결함정보 필드·사진) 미구현
