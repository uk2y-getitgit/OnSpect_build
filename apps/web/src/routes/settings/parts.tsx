/**
 * 설정 화면 3컬럼의 공통 부품 — S3 스펙 §2-5-b.
 *
 * ui-quality:
 *   · 모든 조작 요소에 default / hover / active / focus / selected / disabled
 *   · **hover 와 selected 는 서로 다른 표현**이다 (`.set-row:hover` ≠ `.set-row[data-selected]`)
 *   · 아이콘 전용 버튼에는 `aria-label`
 *   · 드래그로만 되는 조작은 키보드 사용자에게 없는 기능이므로 `⋯` 메뉴에 `위로/아래로` 를 함께 둔다
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ITEM_NAME_MAX } from '@onspect/project-core';

/** 실패했을 때 화면에 그대로 나가는 문구. 성공이면 null */
export type CommitResult = string | null;

// ── 컬럼 껍데기 ────────────────────────────────────────────────────────────
export function ColumnShell({
  title,
  subject,
  count,
  favorite,
  children,
  addForm,
}: {
  title: string;
  /** `{부재}의 결함유형` 처럼 **지금 무엇을 보고 있는지**. 3컬럼이 서로 구분되는 근거다 */
  subject?: string | null;
  count: number | null;
  favorite?: number | null;
  children: ReactNode;
  addForm?: ReactNode;
}) {
  return (
    <section className="set-col" aria-label={subject ? `${subject}의 ${title}` : title}>
      <header className="set-col__head">
        <h3 className="set-col__title">
          {subject && <span className="set-col__subject">{subject}의&nbsp;</span>}
          {title}
        </h3>
        {count !== null && (
          <span className="set-col__count">
            항목 <b className="num">{count}</b>
            {favorite !== null && favorite !== undefined && (
              <>
                {' · '}
                <span className="set-col__star" aria-hidden="true">
                  ★
                </span>{' '}
                <b className="num">{favorite}</b>
                <span className="visually-hidden">개가 즐겨찾기입니다</span>
              </>
            )}
          </span>
        )}
      </header>
      {addForm}
      <div className="set-col__body">{children}</div>
    </section>
  );
}

// ── 추가 입력 ──────────────────────────────────────────────────────────────
export function AddForm({
  placeholder,
  label,
  disabled = false,
  onAdd,
}: {
  placeholder: string;
  label: string;
  disabled?: boolean;
  /** 실패 문구를 돌려주면 흔들림 + 오류 표시 (§2-5-c) */
  onAdd: (name: string) => CommitResult;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = () => {
    const err = onAdd(value);
    if (err === null) {
      setValue('');
      setError(null);
      inputRef.current?.focus();
      return;
    }
    setError(err);
    setShake(true);
    window.setTimeout(() => setShake(false), 320);
  };

  return (
    <div className="set-add" data-shake={shake || undefined}>
      <div className="set-add__row">
        <input
          ref={inputRef}
          className="input input--small"
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={label}
          maxLength={ITEM_NAME_MAX}
          aria-invalid={error !== null || undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          className="btn btn--small btn--primary"
          disabled={disabled || value.trim() === ''}
          title={disabled ? '먼저 위 목록에서 항목을 선택하세요' : label}
          onClick={submit}
        >
          추가
        </button>
      </div>
      {error && (
        <p className="set-add__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ── 이름 인라인 편집 ───────────────────────────────────────────────────────
export function InlineName({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (next: string) => CommitResult;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    const err = onCommit(draft);
    if (err !== null) setError(err);
  };

  return (
    <span className="set-inline">
      <input
        ref={ref}
        className="input input--small"
        type="text"
        value={draft}
        aria-label="이름 수정"
        maxLength={ITEM_NAME_MAX}
        aria-invalid={error !== null || undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <button type="button" className="btn btn--small btn--primary" onClick={commit}>
        확인
      </button>
      <button type="button" className="btn btn--small" onClick={onCancel}>
        취소
      </button>
      {error && (
        <span className="set-inline__error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

// ── ★ 즐겨찾기 ─────────────────────────────────────────────────────────────
export function StarButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="set-star-btn"
      aria-pressed={on}
      aria-label={on ? '즐겨찾기 해제' : '즐겨찾기로 지정'}
      title={
        on
          ? '즐겨찾기 — 결함 입력 창 첫 화면에 나옵니다. 누르면 해제됩니다'
          : '즐겨찾기가 아닙니다 — 결함 입력 창의 [더보기] 안에 있습니다'
      }
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

// ── 드래그 정렬 목록 ───────────────────────────────────────────────────────
/**
 * 표시 순서가 진실이고 `sortOrder` 가 그 뒤를 따라간다.
 * 드롭 시 그 목록 전체를 STEP=10 격자로 다시 매긴다 (`reorderItems`).
 */
export function RowList<T extends { id: string }>({
  items,
  onMove,
  renderRow,
  ariaLabel,
}: {
  items: readonly T[];
  onMove: (id: string, toIndex: number) => void;
  renderRow: (item: T, index: number) => ReactNode;
  ariaLabel: string;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <ul className="set-list" aria-label={ariaLabel}>
      {items.map((item, i) => (
        <li
          key={item.id}
          className="set-row"
          data-dragging={dragId === item.id || undefined}
          data-dropover={
            overIndex === i && dragId !== null && dragId !== item.id ? 'true' : undefined
          }
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOverIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragId && dragId !== item.id) onMove(dragId, i);
            setDragId(null);
            setOverIndex(null);
          }}
        >
          <span
            className="set-row__handle"
            draggable
            aria-hidden="true"
            title="끌어서 순서 변경"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.id);
              setDragId(item.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverIndex(null);
            }}
          >
            ⠿
          </span>
          {renderRow(item, i)}
        </li>
      ))}
    </ul>
  );
}

// ── 빈 상태 ────────────────────────────────────────────────────────────────
export function ColumnEmpty({
  text,
  action,
}: {
  text: string;
  action?: { label: string; run: () => void };
}) {
  return (
    <div className="set-empty">
      <p className="set-empty__text">{text}</p>
      {action && (
        <button type="button" className="btn btn--small" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/** `①②③` — 발생원인 코드번호 배지 (§2-5-f). 21 이상은 괄호 숫자로 떨어뜨린다 */
export function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
  return `(${n})`;
}
