/**
 * 규모 — 폭×길이 ↔ 면적 전환 (S4 스펙 §3-5-a · §4-2).
 *
 * 세 번째 모드를 만들지 않는다. 손상결함표 열이 `폭·길이·면적·개소` 4개로 고정돼 있어
 * 실을 자리가 없다. "넓이×높이" 는 AREA 안의 **가로×세로 보조 계산기**로 흡수한다.
 *
 * 모드를 전환해도 반대편 값을 지우지 않는다(F15). 이 컴포넌트는 값을 지우지 않고
 * `sizeMode` 만 바꾸는 요청(`onModeChange`)과, 필드 값 자체를 바꾸는 요청(`onFieldsChange`)을
 * 분리해서 올린다 — 연동 규칙(모드 전환 시 무엇을 지우는가)은 `apply.ts`/이 컴포넌트가 정하고
 * 결함유형이 바뀔 때의 연동은 `project-core/items/apply.ts` 가 정한다(§3-6).
 */
import { useState } from 'react';
import {
  AREA_PRESETS,
  AREA_STEP,
  areaFromMm,
  COUNT_PRESETS,
  COUNT_STEP,
  effectiveAreaM2,
  LENGTH_PRESETS,
  LENGTH_STEP,
  RECT_SIDE_PRESETS,
  RECT_SIDE_STEP,
  SIZE_MODE_LABEL,
  WIDTH_OVER_INITIAL,
  WIDTH_PRESETS,
  WIDTH_STEP,
  type SizeMode,
} from '@onspect/project-core';
import { NumberField } from './NumberField';

export type SizeFields = {
  sizeMode: SizeMode;
  widthMm: number | null;
  lengthMm: number | null;
  areaM2: number | null;
  areaWMm: number | null;
  areaHMm: number | null;
  countEa: number | null;
};

const MODES: readonly SizeMode[] = ['WL', 'AREA'];

export function SizeBlock({
  value,
  onModeChange,
  onFieldsChange,
  disabled = false,
}: {
  value: SizeFields;
  onModeChange: (mode: SizeMode) => void;
  onFieldsChange: (patch: Partial<SizeFields>) => void;
  disabled?: boolean;
}) {
  // 이미 가로·세로가 저장돼 있으면(재편집) 펼친 채로 보여준다 — 접으면 값이 안 보여 잃은 줄 안다
  const [rectOpen, setRectOpen] = useState(value.areaWMm !== null || value.areaHMm !== null);

  const setRectSide = (patch: { areaWMm?: number; areaHMm?: number }) => {
    const w = patch.areaWMm ?? value.areaWMm ?? 0;
    const h = patch.areaHMm ?? value.areaHMm ?? 0;
    onFieldsChange({ ...patch, areaM2: w > 0 && h > 0 ? areaFromMm(w, h) : value.areaM2 });
  };

  return (
    <div className="idf-field idf-size">
      <div className="idf-field__head">
        <span className="idf-field__label">규모</span>
        <div className="segmented" role="group" aria-label="규모 모드">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className="segmented__item"
              data-selected={value.sizeMode === m}
              disabled={disabled}
              onClick={() => onModeChange(m)}
            >
              {SIZE_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {value.sizeMode === 'WL' ? (
        <div className="idf-size__body">
          <NumberField
            label="폭"
            unit="mm"
            value={value.widthMm}
            presets={WIDTH_PRESETS}
            step={WIDTH_STEP}
            disabled={disabled}
            overButton={{ label: '0.5 초과 → 직접입력', initial: WIDTH_OVER_INITIAL }}
            onChange={(v) => onFieldsChange({ widthMm: v })}
          />
          <NumberField
            label="길이"
            unit="mm"
            value={value.lengthMm}
            presets={LENGTH_PRESETS}
            step={LENGTH_STEP}
            disabled={disabled}
            onChange={(v) => onFieldsChange({ lengthMm: v })}
          />
          <NumberField
            label="개소"
            unit="개"
            value={value.countEa}
            presets={COUNT_PRESETS}
            step={COUNT_STEP}
            min={1}
            disabled={disabled}
            onChange={(v) => onFieldsChange({ countEa: v })}
          />
          <NumberField
            label="면적"
            unit="㎡"
            value={effectiveAreaM2(value)}
            presets={[]}
            step={0}
            readOnly
            readOnlyHint="폭×길이로 자동 계산됩니다"
            onChange={() => {}}
          />
        </div>
      ) : (
        <div className="idf-size__body">
          <NumberField
            label="면적"
            unit="㎡"
            value={value.areaM2}
            presets={AREA_PRESETS}
            step={AREA_STEP}
            disabled={disabled}
            // 직접 입력하면 가로×세로 보조값과의 연결을 끊는다(§3-5-b "AREA(직접)")
            onChange={(v) => onFieldsChange({ areaM2: v, areaWMm: null, areaHMm: null })}
          />
          <NumberField
            label="개소"
            unit="개"
            value={value.countEa}
            presets={COUNT_PRESETS}
            step={COUNT_STEP}
            min={1}
            disabled={disabled}
            onChange={(v) => onFieldsChange({ countEa: v })}
          />

          <button
            type="button"
            className="btn btn--small btn--ghost idf-rect-toggle"
            disabled={disabled}
            aria-expanded={rectOpen}
            onClick={() => setRectOpen((v) => !v)}
          >
            가로 × 세로로 계산 {rectOpen ? '▴' : '▾'}
          </button>

          {rectOpen && (
            <div className="idf-rect">
              <NumberField
                label="가로"
                unit="mm"
                value={value.areaWMm}
                presets={RECT_SIDE_PRESETS}
                step={RECT_SIDE_STEP}
                disabled={disabled}
                onChange={(v) => setRectSide({ areaWMm: v })}
              />
              <NumberField
                label="세로"
                unit="mm"
                value={value.areaHMm}
                presets={RECT_SIDE_PRESETS}
                step={RECT_SIDE_STEP}
                disabled={disabled}
                onChange={(v) => setRectSide({ areaHMm: v })}
              />
              <p className="idf-rect__hint">
                {value.areaWMm && value.areaHMm
                  ? `→ 면적 ${areaFromMm(value.areaWMm, value.areaHMm)} ㎡ 로 계산되어 위 칸에 들어갑니다`
                  : '가로·세로를 모두 입력하면 면적이 자동으로 계산됩니다'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
