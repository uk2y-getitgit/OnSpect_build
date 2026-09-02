/**
 * **마지막 뷰포트 영속** — Phase 5 스펙 §6-2 T2-5.
 *
 * 도면을 보던 자리(줌 배율 · 팬 위치)를 용역마다 하나 기억했다가, 그 용역을 다시 열 때
 * 되돌린다. 현장에서 같은 구역을 반복해 들여다보는데 열 때마다 전체 맞춤으로 돌아가면
 * 매번 다시 찾아 들어가야 한다.
 *
 * ⭐ **새 오브젝트 스토어를 만들지 않는다. `meta` 스토어를 KV 로 재사용한다.**
 *    `DB_VERSION` 은 **1 그대로**이며 `onupgradeneeded` 가 돌지 않는다 —
 *    레코드 추가는 데이터 추가이지 스키마 변경이 아니다. `exportRuns.ts`(`exportRun:` 접두)가
 *    이미 같은 방식을 쓴다. 여기서 스토어를 하나 더 만들면 그 용역 하나 편하자고
 *    모든 기기의 사용자 데이터를 마이그레이션 대상으로 만든다.
 *
 * ⭐ **동기화 대상이 아니다** (스펙 §205 표) — 기기 로컬 값이다. 이 기기에서 보던 자리를
 *    다른 사람 태블릿에 밀어 넣을 이유가 없다.
 *
 * 저장 형태는 **화면 중앙의 정규화 좌표 + 배율**(`ViewCenter`)이다. `tx`·`ty` 스크린 px 을
 * 그대로 저장하면 창 크기·화면 방향이 바뀐 뒤 엉뚱한 자리가 나온다 — 근거는
 * `canvas-core/viewport.ts` 의 `ViewCenter` 주석.
 */
import type { ViewCenter } from '@onspect/canvas-core';
import { reqAsPromise, STORE, txDone } from './db.js';

export const LAST_VIEW_KEY_PREFIX = 'lastView:';

export function lastViewKey(projectId: string): string {
  return `${LAST_VIEW_KEY_PREFIX}${projectId}`;
}

/**
 * 용역 하나당 한 건. **도면 id 를 함께 들고 있다** — 어느 도면을 보던 자리인지 모르면
 * 다른 층을 열었을 때 엉뚱한 도면에 남의 좌표를 씌우게 된다.
 */
export type LastView = ViewCenter & {
  projectId: string;
  drawingId: string;
  updatedAt: number;
};

type MetaRow = { key: string; value: unknown };

/**
 * 저장된 값은 **믿지 않는다.** 옛 버전이 쓴 형식이거나 다른 탭이 망가뜨린 값이 들어오면
 * NaN 뷰포트가 되어 그 용역이 열릴 때마다 화면이 비는데, 사용자는 원인을 알 수 없다.
 */
function isLastView(v: unknown): v is LastView {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<LastView>;
  return (
    typeof r.projectId === 'string' &&
    typeof r.drawingId === 'string' &&
    r.drawingId !== '' &&
    typeof r.zoom === 'number' &&
    Number.isFinite(r.zoom) &&
    r.zoom > 0 &&
    typeof r.cx === 'number' &&
    Number.isFinite(r.cx) &&
    typeof r.cy === 'number' &&
    Number.isFinite(r.cy) &&
    typeof r.updatedAt === 'number'
  );
}

export async function getLastView(db: IDBDatabase, projectId: string): Promise<LastView | null> {
  const tx = db.transaction(STORE.meta, 'readonly');
  const row = await reqAsPromise<MetaRow | undefined>(
    tx.objectStore(STORE.meta).get(lastViewKey(projectId)),
  );
  if (!row || !isLastView(row.value)) return null;
  // 키와 레코드가 어긋난 값은 버린다 (수동으로 손댔거나 옛 버그의 잔재)
  return row.value.projectId === projectId ? row.value : null;
}

export async function putLastView(db: IDBDatabase, view: LastView): Promise<void> {
  // 성하지 않은 값은 **저장 자체를 하지 않는다.** 한 번 들어가면 그 용역을 열 때마다 되살아난다
  if (!isLastView(view)) return;
  const tx = db.transaction(STORE.meta, 'readwrite');
  tx.objectStore(STORE.meta).put({
    key: lastViewKey(view.projectId),
    value: view,
  } satisfies MetaRow);
  await txDone(tx);
}
