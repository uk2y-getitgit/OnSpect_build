/**
 * 기타 — 구조유형 기본값 · 기본 항목 세트 다시 불러오기 · 기본값으로 저장 (S3-T8).
 *
 * `[이 설정을 기본값으로 저장]` 은 **이후 만드는 용역에만** 반영된다 (D6 · F2).
 * 이미 만들어진 용역은 자기 스냅샷을 그대로 유지한다 — 작년 보고서를 다시 뽑으면 옛 이름이 나와야 한다.
 */
import { STRUCTURE_TYPE_TABS, type Project, type StructureType } from '@onspect/project-core';
import type { PersistenceState } from '../../data/idb/db';

export function MiscTab({
  project,
  onDefaultStructureType,
  onReloadSeed,
  onPromote,
  promotedAt,
  persistence,
}: {
  project: Project;
  onDefaultStructureType: (v: StructureType | null) => void;
  onReloadSeed: () => void;
  onPromote: () => void;
  /** 이 용역 설정이 뜬 원본 ORG 의 시각. null 이면 알 수 없음 */
  promotedAt: number | null;
  /** 저장소 영속 요청 결과 (P3 · D11). 앱 시작 시 1회 요청한 값 */
  persistence: PersistenceState;
}) {
  const current = project.defaultStructureType;

  return (
    <div className="set-misc">
      <PersistenceCard state={persistence} />
      <section className="set-card">
        <h3 className="set-card__title">구조유형 기본값</h3>
        <p className="set-card__desc">
          이 용역에서 결함을 새로 만들 때 미리 선택되는 구조유형입니다. 결함마다 바꿀 수 있습니다.
        </p>
        <div className="segmented" role="radiogroup" aria-label="구조유형 기본값">
          <button
            type="button"
            role="radio"
            aria-checked={current === null}
            className="segmented__item"
            data-selected={current === null}
            onClick={() => onDefaultStructureType(null)}
          >
            지정 안 함
          </button>
          {STRUCTURE_TYPE_TABS.map((st) => (
            <button
              key={st}
              type="button"
              role="radio"
              aria-checked={current === st}
              className="segmented__item"
              data-selected={current === st}
              onClick={() => onDefaultStructureType(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </section>

      <section className="set-card">
        <h3 className="set-card__title">기본 항목 세트 다시 불러오기</h3>
        <p className="set-card__desc">
          기본 목록에 있는데 이 용역에 없는 항목만 추가합니다. <b>덮어쓰지 않습니다</b> — 고친
          이름·순서·기본값·규모모드는 그대로 남습니다.
        </p>
        <button type="button" className="btn" onClick={onReloadSeed}>
          기본 항목 세트 다시 불러오기
        </button>
      </section>

      <section className="set-card">
        <h3 className="set-card__title">이 설정을 기본값으로 저장</h3>
        <p className="set-card__desc">
          지금 이 용역의 항목 구성을 <b>새로 만드는 용역의 초기값</b>으로 삼습니다.
          <br />
          이미 만들어진 다른 용역의 설정은 <b>바뀌지 않습니다.</b>
        </p>
        {promotedAt !== null && (
          <p className="set-card__meta">
            이 용역 설정은 {new Date(promotedAt).toLocaleString('ko-KR')} 시점의 기본값에서
            복사되었습니다.
          </p>
        )}
        <button type="button" className="btn" onClick={onPromote}>
          이 설정을 기본값으로 저장
        </button>
      </section>
    </div>
  );
}

// ── 저장소 영속 (P3 · D11) ────────────────────────────────────────────────
/**
 * 앱 시작 시 1회 요청한 `navigator.storage.persist()` 의 결과를 그대로 보여준다.
 *
 * **거절돼도 앱은 정상 동작한다.** 다만 브라우저가 용량 압박 때 이 앱의 데이터를
 * 말없이 지울 수 있다는 뜻이라, 현장에 나가기 전에 알고는 있어야 한다.
 * 여기에 [다시 요청] 버튼을 두지 않는 이유: 브라우저가 이미 판정한 것을 다시 물어도
 * 같은 답이 온다 — 누르면 아무 일도 없는 버튼이 된다.
 */
function PersistenceCard({ state }: { state: PersistenceState }) {
  const view: Record<PersistenceState, { badge: string; tone: string; desc: string }> = {
    UNKNOWN: {
      badge: '확인 중…',
      tone: 'unknown',
      desc: '앱을 시작할 때 브라우저에 영속 저장을 요청합니다.',
    },
    GRANTED: {
      badge: '허용됨',
      tone: 'ok',
      desc: '브라우저가 용량이 부족해도 이 앱의 데이터를 임의로 지우지 않습니다.',
    },
    DENIED: {
      badge: '거절됨',
      tone: 'warn',
      desc:
        '브라우저가 영속 저장을 허락하지 않았습니다. 앱은 그대로 동작하지만, 기기 용량이 크게 부족해지면 ' +
        '이 앱의 데이터가 지워질 수 있습니다. 홈 화면에 설치하면 허용될 가능성이 높아집니다.',
    },
    UNSUPPORTED: {
      badge: '지원 안 함',
      tone: 'warn',
      desc: '이 브라우저는 영속 저장을 지원하지 않습니다. 중요한 작업은 자주 백업해 주세요.',
    },
  };
  const v = view[state];

  return (
    <section className="set-card">
      <h3 className="set-card__title">
        저장소 영속 <span className={`set-badge set-badge--${v.tone}`}>{v.badge}</span>
      </h3>
      <p className="set-card__desc">{v.desc}</p>
    </section>
  );
}
