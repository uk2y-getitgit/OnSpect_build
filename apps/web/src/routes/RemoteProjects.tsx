/**
 * `[서버에서 받기]` — 서버에만 있는 용역을 이 기기로 처음 심는다 (D42).
 *
 * ⭐ **왜 필요한가.** `[동기화]` 는 프로젝트별 버튼이라 **로컬에 이미 있는 용역**에서만 시작한다.
 *    새 기기에는 누를 버튼 자체가 없었다. `[파일에서 가져오기]`(D38)는 id 를 전부 새로 발급하므로
 *    서버와 무관한 별개 용역이 생길 뿐이다 — 그래서 "같은 용역을 두 기기에서 고치고 병합"이
 *    원리적으로 성립하지 않았다(검수 심각1). 이 버튼은 **서버 id 그대로** 받아온다.
 *
 * ⭐ **네트워크는 버튼을 누른 순간에만 열린다**(§3-7 규칙 0). 마운트 시 자동 조회가 없다 —
 *    로그인만 했을 뿐인데 목록이 서버를 긁으면 현장에서 앱 시작이 느려진다.
 * ⭐ 실패해도 **자동 재시도하지 않는다.**
 */
import { useCallback, useState } from 'react';
import { formatDateTime, projectDisplayName } from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { useSession } from '../data/session';
import {
  adoptRemoteProject,
  describe,
  listRemoteProjects,
  recordSyncFailure,
  type RemoteProject,
} from '../data/sync';
import { BusyButton, Modal } from '../ui/Form';
import { useToast } from '../ui/ToastHost';

export function RemoteProjectsButton({ className = 'btn' }: { className?: string }) {
  const { status } = useSession();
  const { reload } = useAppData();
  const toast = useToast();
  const [looking, setLooking] = useState(false);
  /** `null` = 모달이 닫혀 있다 */
  const [rows, setRows] = useState<RemoteProject[] | null>(null);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);
  const [stage, setStage] = useState('');

  const open = useCallback(async () => {
    if (looking) return;
    setLooking(true);
    try {
      setRows(await listRemoteProjects());
    } catch (e) {
      // 로그인 만료·팀 미소속·오프라인이 전부 여기로 온다. 문구가 이미 사람이 읽을 말이다
      toast(describe(e), { kind: 'warn' });
    } finally {
      setLooking(false);
    }
  }, [looking, toast]);

  const adopt = useCallback(
    async (r: RemoteProject) => {
      if (adoptingId) return;
      const name = projectDisplayName(r.project);
      setAdoptingId(r.id);
      setStage('시작하는 중…');
      try {
        const out = await adoptRemoteProject(r.id, setStage);
        setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
        toast(`'${name}'을(를) 서버에서 받았습니다 — ${out.message}`);
      } catch (e) {
        // 용역 행만 심고 끊겼을 수 있다 — 그러면 목록에 나타나고 그 행의 `[동기화]` 로 이어서 받는다
        await recordSyncFailure(r.id, describe(e));
        toast(`'${name}'을(를) 받지 못했습니다 — ${describe(e)}`, { kind: 'warn' });
      } finally {
        setAdoptingId(null);
        setStage('');
        reload(); // 받은 만큼 목록 숫자가 바로 바뀌어야 한다
      }
    },
    [adoptingId, reload, toast],
  );

  // 서버 설정이 없거나(=`.env.local` 없음) 로그인 전이면 버튼 자체를 감춘다
  if (status !== 'SIGNED_IN') return null;

  return (
    <>
      <BusyButton
        busy={looking}
        className={className}
        title="서버에 있는 용역 중 이 기기에 없는 것을 가져옵니다. 이 버튼을 누를 때만 통신합니다"
        onClick={() => void open()}
      >
        서버에서 받기
      </BusyButton>

      {rows && (
        <Modal
          title="서버에서 받기"
          subtitle="서버에 있고 이 기기에는 없는 용역입니다. 받으면 같은 용역으로 이어져 이후 [동기화]로 서로 오갑니다."
          wide
          onClose={() => setRows(null)}
          footer={
            <button type="button" className="btn btn--primary" onClick={() => setRows(null)}>
              닫기
            </button>
          }
        >
          {rows.length === 0 ? (
            <p className="muted">
              받을 용역이 없습니다. 서버에 있는 용역은 모두 이 기기에도 있습니다.
            </p>
          ) : (
            <ul className="rlist">
              {rows.map((r) => (
                <li key={r.id} className="rlist__row">
                  <span className="rlist__name">{projectDisplayName(r.project)}</span>
                  <span className="muted rlist__time">최근 변경 {formatDateTime(r.updatedAt)}</span>
                  <BusyButton
                    busy={adoptingId === r.id}
                    disabled={adoptingId !== null}
                    className="btn btn--small btn--primary"
                    onClick={() => void adopt(r)}
                  >
                    {adoptingId === r.id ? stage || '받는 중…' : '받기'}
                  </BusyButton>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
