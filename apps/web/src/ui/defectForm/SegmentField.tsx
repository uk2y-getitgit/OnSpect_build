/**
 * 2택 세그먼트 — 구조체 여부 · 진행 여부 · 누수 여부가 공유한다 (S4 스펙 §4-2).
 * 기존 `.segmented` 토큰(설정 화면 구조유형 탭과 같은 부품)을 그대로 재사용한다.
 */
export type SegmentOption<V extends string> = { value: V; label: string };

export function SegmentField<V extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  /** 값 옆에 붙는 보조 문구 — 예: "부재 기본값" / "직접 지정" (§4-4) */
  hint?: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <div className="idf-field">
      <div className="idf-field__head">
        <span className="idf-field__label">{label}</span>
        {hint && <span className="idf-field__hint">{hint}</span>}
      </div>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="segmented__item"
            data-selected={o.value === value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
