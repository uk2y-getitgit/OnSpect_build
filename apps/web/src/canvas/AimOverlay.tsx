/**
 * D22(Q55 안 A) 조준 크로스헤어 — 화면 부품.
 *
 * 배치가 이 기능의 전부다. **손가락이 목표를 가리지 않는 것**이 채택 이유이므로:
 *   · 십자선은 화면(도면 아님) 정중앙에 고정 — 확대·이동과 무관하게 늘 같은 자리
 *   · `[여기]` 확정 버튼은 오른손 엄지가 닿는 **우하단**에 둔다. 중앙과 겹치지 않는다
 *   · 안내 띠는 상단 — 중앙과 엄지 자리를 둘 다 피한다
 *
 * ⚠️ DOM 위치 규칙 (`pointerAdapter.ts` B-1 과 같은 이유):
 *   · `AimCrosshair` 는 **캔버스 호스트 안**에 그린다 → `left:50%/top:50%` 가 곧 호스트 중앙이라
 *     합성 탭 좌표(`aimCenterOf`)와 눈에 보이는 십자선이 어긋날 수가 없다.
 *     `pointer-events:none` 이라 입력에는 전혀 관여하지 않는다.
 *   · `AimControls` 는 **호스트 밖**(stage 형제)에 둔다. 호스트 안에 두면 `[여기]` 를 누른
 *     엄지가 `touchesIn()` 에 캔버스 접점으로 세어져 핀치로 오인식된다(B-1 과 같은 사고).
 *   · 둘 다 `data-floating` 을 **붙이지 않는다.** 붙이면 안전영역(§2-10-a)이 줄어
 *     조준을 켜고 끌 때마다 도면이 움찔 움직인다.
 */

/** 화면 정중앙 십자선 — 캔버스 호스트의 children 으로 넣는다 */
export function AimCrosshair() {
  return (
    <div className="aim-cross" aria-hidden="true">
      <div className="aim-cross__v" />
      <div className="aim-cross__h" />
      <div className="aim-cross__dot" />
    </div>
  );
}

export type AimControlsProps = {
  /** 도면이 없거나 바쁠 때 — 십자선 자리에 찍을 것이 없다 */
  disabled: boolean;
  /** 화면 중앙 좌표로 `POINTER_DOWN`+`POINTER_UP` 합성 */
  onConfirm: () => void;
};

/** 안내 띠 + `[여기]` 확정 버튼 — stage 에 둔다 (호스트 밖) */
export function AimControls({ disabled, onConfirm }: AimControlsProps) {
  return (
    <>
      <div className="aim-hint" role="status">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" strokeWidth="2" />
          <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
          <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="2" />
          <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
        </svg>
        조준 모드 · 도면을 밀어 십자에 맞추세요
      </div>

      <button
        type="button"
        className="aim-confirm"
        disabled={disabled}
        aria-label="십자선 자리에 표기"
        title={disabled ? '도면을 먼저 올려주세요' : '십자선 자리에 표기'}
        onClick={onConfirm}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <polyline
            points="20 6 9 17 4 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="aim-confirm__label">여기</span>
      </button>
    </>
  );
}
