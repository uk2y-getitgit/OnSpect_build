/**
 * 프로젝트별 `[동기화]` 버튼 — Phase 5 트랙1 L5 (스펙 §3-7 · 스코프 L5).
 *
 * ⭐ **반영(push/pull)은 이 버튼을 누른 순간에만 일어난다**(규칙 0). 자동 pull 도,
 *    주기 동기화도, 자동 반영도 없다.
 * ⭐ D51(Q89=B) — 예외 하나: 마운트 시 `hasRemoteChanges` 로 **읽기 전용 조회 1건**만 날려
 *    "서버에 새 변경 있음" 배지를 켠다. **로컬 데이터를 하나도 건드리지 않고, 반영도 하지
 *    않는다** — 규칙 0 이 막는 것은 "몰래 반영"이지 "몰래 확인"이 아니다. 그 외 `useEffect`
 *    (마지막 결과 표시)는 여전히 로컬 `meta` KV 만 읽는다 — 네트워크를 타지 않는다.
 * ⭐ 실패해도 **자동 재시도하지 않는다**(지수 백오프 금지 — 현장에서 배터리를 태우지 않는다).
 *    `실패 · 다시 시도` 버튼 하나로 끝낸다.
 * ⭐ 충돌은 **조용히 덮지 않는다** — `충돌 {n}건 · 상대 값으로 덮였습니다 [보기]`.
 */
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, formatRelative, isStaleSync } from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { useSession } from '../data/session';
import {
  clearConflicts,
  describe,
  hasRemoteChanges,
  readConflicts,
  readSyncState,
  recordSyncFailure,
  syncProject,
  type SyncConflict,
  type SyncState,
} from '../data/sync';
import { BusyButton, Modal } from '../ui/Form';

export function SyncButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { status } = useSession();
  const { reload } = useAppData();
  const [state, setState] = useState<SyncState | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [viewing, setViewing] = useState<SyncConflict[] | null>(null);
  /** D51(Q89=B) — "서버에 새 변경 있음" 배지. 읽기 전용, 반영은 여전히 버튼을 눌러야 한다 */
  const [remoteChanged, setRemoteChanged] = useState(false);

  // 로컬 KV 읽기만 한다. **네트워크 없음**
  useEffect(() => {
    let alive = true;
    void readSyncState(projectId).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // D51 — 마운트 시 딱 한 번, 읽기 전용 조회로 배지만 켠다(위 top 주석 참조)
  useEffect(() => {
    let alive = true;
    void hasRemoteChanges(projectId).then((v) => {
      if (alive) setRemoteChanged(v);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setStage('시작하는 중…');
    try {
      await syncProject(projectId, setStage);
    } catch (e) {
      await recordSyncFailure(projectId, describe(e));
    } finally {
      setBusy(false);
      setStage('');
      setState(await readSyncState(projectId));
      setRemoteChanged(await hasRemoteChanges(projectId)); // 방금 동기화했으니 보통 꺼진다
      // `sync.ts` 는 `repo`/`appData` 를 거치지 않고 IndexedDB 에 직접 쓴다. 이걸 부르지 않으면
      // `50건 반영` 이라고 표시되는데 목록의 `도면 n장 · 결함 n건` 은 그대로라
      // 사용자는 동기화가 실패했다고 오해한다(검수 보통4).
      reload();
    }
  }, [busy, projectId, reload]);

  const openConflicts = useCallback(async () => {
    setViewing(await readConflicts(projectId));
  }, [projectId]);

  // 서버 설정이 없거나(=`.env.local` 없음) 로그인 전이면 버튼 자체를 감춘다
  if (status !== 'SIGNED_IN') return null;

  const failed = state?.lastResult === 'ERROR';
  const partial = state?.lastResult === 'PARTIAL';
  const conflictCount = state?.lastConflictCount ?? 0;
  // D51(Q89=B) — 마지막 동기화가 1시간 넘으면 색으로만 강조한다(새 문구를 더하지 않는다).
  // 성공/실패 색(`error`)이 이미 있으면 그게 우선이다 — 오래됨은 그보다 급하지 않다
  const stale = state ? isStaleSync(Date.now(), state.lastSyncedAt) : false;

  return (
    <div className="syncbox">
      <BusyButton
        busy={busy}
        className={`btn btn--small ${failed ? 'btn--danger' : ''}`}
        title={`'${projectName}' 을(를) 서버와 맞춥니다. 이 버튼을 누를 때만 통신합니다`}
        onClick={() => void run()}
      >
        {busy ? stage || '동기화 중…' : failed ? '실패 · 다시 시도' : '동기화'}
      </BusyButton>

      {!busy && state && state.lastResult !== null && (
        <span
          className="syncbox__note"
          data-tone={failed ? 'error' : partial || stale ? 'warn' : 'ok'}
        >
          <span
            className="syncbox__msg"
            title={state.lastSyncedAt > 0 ? formatDateTime(state.lastSyncedAt) : undefined}
          >
            {state.lastMessage}
          </span>
          {state.lastSyncedAt > 0 && (
            <span className="muted"> · {formatRelative(Date.now(), state.lastSyncedAt)}</span>
          )}
        </span>
      )}

      {/* D51(Q89=B) — 다른 기기가 마지막 동기화 이후 뭔가 올렸다는 신호. 반영은 버튼을 눌러야 한다 */}
      {!busy && remoteChanged && (
        <span className="chip syncbox__remote" title="다른 기기가 이 용역을 서버에 올렸습니다. 눌러서 받아오세요">
          서버에 새 변경 있음
        </span>
      )}

      {!busy && conflictCount > 0 && (
        <span className="syncbox__conflict">
          충돌 <span className="num">{conflictCount}</span>건 · 상대 값으로 덮였습니다{' '}
          <button type="button" className="linkbtn" onClick={() => void openConflicts()}>
            보기
          </button>
        </span>
      )}

      {viewing && (
        <Modal
          title="동기화 충돌"
          subtitle="아래 값은 상대 기기의 값으로 덮였습니다. 원래 이 기기에 있던 내용을 그대로 보관해 둡니다."
          wide
          onClose={() => setViewing(null)}
          footer={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void clearConflicts(projectId).then(async () => {
                    setState(await readSyncState(projectId));
                  });
                  setViewing(null);
                }}
              >
                확인했습니다 (기록 지우기)
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setViewing(null)}>
                닫기
              </button>
            </>
          }
        >
          {viewing.length === 0 ? (
            <p className="muted">보관된 충돌 기록이 없습니다.</p>
          ) : (
            <ul className="conflicts">
              {viewing.map((c) => (
                <li key={`${c.kind}:${c.id}:${c.at}`} className="conflicts__row">
                  <div className="conflicts__head">
                    <b>{KIND_LABEL[c.kind] ?? c.kind}</b>
                    <span className="muted"> · {c.id.slice(0, 8)}</span>
                    <span className="muted">
                      {' '}
                      · 내 값 {c.localUpdatedAt ? formatDateTime(c.localUpdatedAt) : '시각 없음'} ↔
                      상대 값 {formatDateTime(c.serverUpdatedAt)}
                    </span>
                  </div>
                  <pre className="conflicts__json">{safeJson(c.local)}</pre>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  PROJECT: '용역',
  BUILDING: '동',
  FLOOR: '층',
  DRAWING: '도면',
  DEFECT: '결함',
  PHOTO: '사진',
  MEMO: '메모',
};

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? '';
  } catch {
    return String(v);
  }
}
