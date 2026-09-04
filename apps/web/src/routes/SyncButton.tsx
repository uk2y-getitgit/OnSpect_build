/**
 * 프로젝트별 `[동기화]` 버튼 — Phase 5 트랙1 L5 (스펙 §3-7 · 스코프 L5).
 *
 * ⭐ **네트워크는 이 버튼을 누른 순간에만 열린다**(규칙 0). 마운트 시 자동 pull 도,
 *    주기 동기화도 없다. `useEffect` 가 하는 일은 **로컬 `meta` KV 를 읽어 마지막 결과를
 *    보여주는 것**뿐이다 — 네트워크를 타지 않는다.
 * ⭐ 실패해도 **자동 재시도하지 않는다**(지수 백오프 금지 — 현장에서 배터리를 태우지 않는다).
 *    `실패 · 다시 시도` 버튼 하나로 끝낸다.
 * ⭐ 충돌은 **조용히 덮지 않는다** — `충돌 {n}건 · 상대 값으로 덮였습니다 [보기]`.
 */
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime, formatRelative } from '@onspect/project-core';
import { useSession } from '../data/session';
import {
  clearConflicts,
  describe,
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
  const [state, setState] = useState<SyncState | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [viewing, setViewing] = useState<SyncConflict[] | null>(null);

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
    }
  }, [busy, projectId]);

  const openConflicts = useCallback(async () => {
    setViewing(await readConflicts(projectId));
  }, [projectId]);

  // 서버 설정이 없거나(=`.env.local` 없음) 로그인 전이면 버튼 자체를 감춘다
  if (status !== 'SIGNED_IN') return null;

  const failed = state?.lastResult === 'ERROR';
  const partial = state?.lastResult === 'PARTIAL';
  const conflictCount = state?.lastConflictCount ?? 0;

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
        <span className="syncbox__note" data-tone={failed ? 'error' : partial ? 'warn' : 'ok'}>
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
