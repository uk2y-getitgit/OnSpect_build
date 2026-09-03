/**
 * 규모 — 폭×길이 ↔ 면적 전환 (S4 스펙 §3-5-a · §4-2).
 *
 * 세 번째 모드를 만들지 않는다. 손상결함표 열이 `폭·길이·면적·개소` 4개로 고정돼 있어
 * 실을 자리가 없다. "넓이×높이" 는 AREA 안의 **가로×세로 보조 계산기**로 흡수한다.
 *
 * **C-3 (D31)** — AREA 모드의 *면적 직접입력* 은 없앴다. 가로×세로가 기본 입력이고
 * 면적 칸은 계산 결과를 보여주는 **읽기전용**이다. 다만 예전에 직접 입력해 둔
 * `areaM2`(가로·세로가 `null`)는 손상결함표에 그대로 인쇄되는 값이라 **지우지 않고**
 * 읽기전용으로 그대로 보여준다. 출처 판정은 `project-core` 의 `areaSource` 가 한다.
 *
 * 모드를 전환해도 반대편 값을 지우지 않는다(F15). 이 컴포넌트는 값을 지우지 않고
 * `sizeMode` 만 바꾸는 요청(`onModeChange`)과, 필드 값 자체를 바꾸는 요청(`onFieldsChange`)을
 * 분리해서 올린다 — 연동 규칙(모드 전환 시 무엇을 지우는가)은 `apply.ts`/이 컴포넌트가 정하고
 * 결함유형이 바뀔 때의 연동은 `project-core/items/apply.ts` 가 정한다(§3-6).
 */
import {
  areaSource,
  COUNT_PRESETS,
  COUNT_STEP,
  displayAreaM2,
  effectiveAreaM2,
  LENGTH_PRESETS,
  LENGTH_STEP,
  RECT_SIDE_PRESETS,
  RECT_SIDE_STEP,
  resolveAreaM2OnRectEdit,
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
  const setRectSide = (patch: { areaWMm?: number | null; areaHMm?: number | null }) => {
    const w = 'areaWMm' in patch ? (patch.areaWMm ?? null) : value.areaWMm;
    const h = 'areaHMm' in patch ? (patch.areaHMm ?? null) : value.areaHMm;
    onFieldsChange({ ...patch, areaM2: resolveAreaM2OnRectEdit(value.areaM2, w, h) });
  };

  // 면적 칸 아래 문구는 값의 **출처**에 따라 다르다 — 옛 직접입력값은 그렇게 밝혀야
  // "왜 이건 못 고치지" 가 안 생긴다
  const areaHint = {
    RECT: '가로 × 세로로 자동 계산됩니다',
    LEGACY_DIRECT: '예전에 직접 입력된 값입니다. 가로 · 세로를 모두 채우면 대체됩니다',
    EMPTY: '가로 · 세로를 모두 입력하면 계산됩니다',
  }[areaSource(value)];

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
          {/* C-3 — 가로 × 세로가 기본 입력이다. 직접입력 칸과 접기 토글은 없앴다 */}
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
          <NumberField
            label="면적"
            unit="㎡"
            value={displayAreaM2(value)}
            presets={[]}
            step={0}
            readOnly
            readOnlyHint={areaHint}
            onChange={() => {}}
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
        </div>
      )}
    </div>
  );
}
