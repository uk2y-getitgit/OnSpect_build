/**
 * ★+[더보기] 버튼 그리드 — 부재·결함유형·발생원인·보수방안이 공유한다 (S4 스펙 §4-2).
 *
 * 씨앗은 전부 ★ 라서(부재 17·결함유형 13 전부 즐겨찾기) 펼쳐두면 패널이 몇 줄이나 차지한다.
 * 그래서 **기본은 접힘** — `선택값 + [변경]` 으로 시작하고, 눌러야 그리드가 펼쳐진다(§4-4).
 * 펼친 상태에서도 ★ 만 1단에 나오고 나머지는 `[더보기 N]` 안에 있다.
 */
import { useEffect, useState } from 'react';

/**
 * `favorite` 는 부재·결함유형에만 있다(원인·보수방안은 목록이 짧아 즐겨찾기 개념이 없다).
 * 없으면(`undefined`) 전부 즐겨찾기로 취급한다 — 더보기로 숨길 필요가 없다는 뜻이다.
 */
export type ChoiceOption = { id: string; name: string; favorite?: boolean };

export type ChoiceGridProps = {
  label: string;
  /** 목록이 비었거나 아직 선택 전일 때 보여줄 안내문 */
  emptyPlaceholder: string;
  options: readonly ChoiceOption[];
  valueId: string | null;
  /** 스냅샷 이름 — id 가 지금 목록에 없어도(삭제된 항목) 그대로 보여준다 */
  valueName: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
};

export function ChoiceGrid({
  label,
  emptyPlaceholder,
  options,
  valueId,
  valueName,
  onSelect,
  disabled = false,
}: ChoiceGridProps) {
  const [expanded, setExpanded] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // 목록 자체가 바뀌면(구조유형·부재를 바꿔 선택지가 갈렸을 때) 더보기 상태를 접는다 —
  // 이전 목록 기준으로 펼쳐 둔 상태가 새 목록에서 의미 없이 남는 것을 막는다
  useEffect(() => {
    setShowMore(false);
  }, [options]);

  const favorites = options.filter((o) => o.favorite ?? true);
  const rest = options.filter((o) => !(o.favorite ?? true));
  const shown = showMore ? options : favorites;

  return (
    <div className="idf-field">
      <div className="idf-field__head">
        <span className="idf-field__label">{label}</span>
        <span className="idf-field__value" data-empty={valueId === null || undefined}>
          {valueName ?? emptyPlaceholder}
        </span>
      </div>

      {!expanded ? (
        <button
          type="button"
          className="btn btn--small"
          disabled={disabled}
          onClick={() => setExpanded(true)}
        >
          {valueId ? '변경' : '선택'}
        </button>
      ) : options.length === 0 ? (
        <p className="idf-empty">{emptyPlaceholder}</p>
      ) : (
        <>
          <div className="idf-grid" role="group" aria-label={label}>
            {shown.map((o) => (
              <button
                key={o.id}
                type="button"
                className="idf-choice"
                aria-pressed={o.id === valueId}
                disabled={disabled}
                onClick={() => {
                  onSelect(o.id);
                  setExpanded(false);
                }}
              >
                {o.name}
              </button>
            ))}
          </div>
          {rest.length > 0 && (
            <button
              type="button"
              className="btn btn--tiny btn--ghost"
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? '접기' : `더보기 ${rest.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
