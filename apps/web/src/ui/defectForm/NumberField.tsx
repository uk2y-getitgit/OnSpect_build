/**
 * −/+ 스테퍼 + 프리셋 버튼 그리드 + 직접입력 — 폭·길이·개소·면적·가로·세로가 공유한다
 * (S4 스펙 §4-2). "입력 3원칙 #1: 키보드를 열지 않고 끝난다" — 프리셋이 우선이고
 * 직접입력은 마지막 수단이다.
 */
import { useEffect, useRef } from 'react';

export type NumberFieldProps = {
  label: string;
  value: number | null;
  unit: string;
  presets: readonly number[];
  step: number;
  min?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** D7 전용 — `폭` 필드의 `0.5 초과 → 직접입력` 처럼 프리셋을 벗어나는 값을 여는 버튼 */
  overButton?: { label: string; initial: number };
  /** 값을 계산으로만 얻는 필드(WL 의 면적)는 스테퍼·프리셋 없이 숫자만 보여준다 */
  readOnly?: boolean;
  readOnlyHint?: string;
};

export function NumberField({
  label,
  value,
  unit,
  presets,
  step,
  min = 0,
  onChange,
  disabled = false,
  overButton,
  readOnly = false,
  readOnlyHint,
}: NumberFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusOverPending = useRef(false);

  useEffect(() => {
    if (focusOverPending.current) {
      focusOverPending.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [value]);

  if (readOnly) {
    return (
      <div className="idf-field">
        <div className="idf-field__head">
          <span className="idf-field__label">{label}</span>
        </div>
        <p className="idf-readout num">
          {value === null ? '—' : `${value} ${unit}`}
          {readOnlyHint && <span className="idf-field__hint">{readOnlyHint}</span>}
        </p>
      </div>
    );
  }

  // 0.1 단위 스텝에서 3×0.1=0.30000000000000004 같은 부동소수 잡음이 생긴다.
  // step 격자에 맞춘 뒤 6자리로 한 번 더 정리한다
  const round = (v: number) => Math.round((Math.round(v / step) * step) * 1e6) / 1e6;
  const dec = () => onChange(Math.max(min, round((value ?? min) - step)));
  const inc = () => onChange(round((value ?? min) + step));
  const isPresetValue = value !== null && presets.includes(value);

  return (
    <div className="idf-field">
      <div className="idf-field__head">
        <span className="idf-field__label">{label}</span>
      </div>
      <div className="idf-stepper">
        <button
          type="button"
          className="iconbtn iconbtn--small"
          aria-label={`${label} 감소`}
          disabled={disabled}
          onClick={dec}
        >
          −
        </button>
        <input
          ref={inputRef}
          className="input input--small input--num num"
          type="number"
          inputMode="decimal"
          step={step}
          aria-label={label}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== '' && !Number.isNaN(n)) onChange(n);
          }}
        />
        <span className="idf-unit">{unit}</span>
        <button
          type="button"
          className="iconbtn iconbtn--small"
          aria-label={`${label} 증가`}
          disabled={disabled}
          onClick={inc}
        >
          +
        </button>
      </div>
      <div className="idf-presetgrid" role="group" aria-label={`${label} 프리셋`}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className="idf-preset num"
            aria-pressed={value === p}
            disabled={disabled}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
        {overButton && (
          <button
            type="button"
            className="idf-preset idf-preset--over"
            aria-pressed={value !== null && !isPresetValue}
            disabled={disabled}
            onClick={() => {
              focusOverPending.current = true;
              onChange(overButton.initial);
            }}
          >
            {overButton.label}
          </button>
        )}
      </div>
    </div>
  );
}
