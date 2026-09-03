/**
 * F5-3 — 도면 크기 조절.
 *
 * A4 지면 안에서 도면 그림이 차지하는 배율만 바꾼다.
 * **결함 표기 좌표는 옮기지 않는다** (Numdraw 는 옮겼지만 우리 좌표는 0~1 정규화라
 * 함께 옮기면 두 번 변환되어 어긋난다 — F5-3 원문 · 불변식 #1).
 * 그래서 결함이 이미 있는 도면에서는 "그림만 움직인다"를 분명히 알린다.
 */
import { useState } from 'react';
import { clampScale, MAX_SCALE, MIN_SCALE, type Drawing } from '@onspect/project-core';
import { Modal } from '../ui/Form';

const STEP = 0.05;

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function DrawingScaleDialog({
  drawing,
  defectCount,
  busy,
  otherDrawingCount = 0,
  onPreview,
  onApply,
  onClose,
}: {
  drawing: Drawing;
  /** 이 도면에 이미 찍힌 결함 수 — 안내 문구에 쓴다 */
  defectCount: number;
  busy: boolean;
  /** 이 도면 말고 배율을 적용할 수 있는 도면 수. 0 이면 [모든 도면] 선택지를 안 그린다 */
  otherDrawingCount?: number;
  /**
   * 2026-09-03 — **실시간 미리보기.** 슬라이더를 움직일 때마다 캔버스가 바로 바뀐다.
   * 저장은 안 한다. 안 주면 미리보기 없이 [적용] 때만 반영된다.
   */
  onPreview?: (scale: number, allDrawings: boolean) => void;
  onApply: (scale: number, allDrawings: boolean) => void;
  onClose: () => void;
}) {
  /**
   * ⚠️ **열 때 한 번만 잡는다.** 실시간 미리보기가 `drawing.imgScale` 을 바꾸므로
   * prop 에서 매 렌더 다시 읽으면 기준값이 슬라이더를 따라와 `changed` 가 언제나 false 가 되고
   * **[적용]이 영영 비활성**이 된다 (사용자 신고 2026-09-03 — "모든 도면 적용을 체크하지 않으면
   * 적용 불가"). `|| allDrawings` 가 있어서 체크했을 때만 눌리던 것이 그 증상이었다.
   */
  const [current] = useState(() => clampScale(drawing.imgScale ?? 1));
  const [scale, setScale] = useState(current);
  const [allDrawings, setAllDrawings] = useState(false);
  // 배율이 그대로여도 `모든 도면` 은 다른 도면들을 바꾸므로 적용할 것이 있다
  const changed = Math.abs(scale - current) > 1e-9 || allDrawings;

  /**
   * 슬라이더를 움직이는 **모든 프레임**에 미리보기를 태운다.
   * 디바운스를 걸면 손을 멈춘 뒤에야 그림이 따라와 "지금 몇 %인지" 를 눈으로 못 고른다 —
   * 미리보기가 존재하는 이유가 그거라 여기서는 늦추지 않는다.
   * 합성은 런타임 캐시라 저장소를 안 건드린다.
   */
  const preview = (next: number, all = allDrawings) => {
    setScale(next);
    onPreview?.(next, all);
  };

  return (
    <Modal
      title="도면 크기 조절"
      subtitle={
        <>
          <b className="quote">{drawing.name}</b> · A4 지면 안에서 그림이 차지하는 비율
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !changed}
            onClick={() => onApply(scale, allDrawings)}
          >
            {busy ? '적용 중…' : '적용'}
          </button>
        </>
      }
    >
      <div className="dscale">
        <div className="dscale__row">
          <input
            type="range"
            className="dscale__range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={STEP}
            value={scale}
            aria-label="도면 배율"
            onChange={(e) => preview(clampScale(Number(e.target.value)))}
          />
          <output className="dscale__value num">{pct(scale)}</output>
        </div>

        <div className="dscale__presets">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => (
            <button
              key={v}
              type="button"
              className={
                Math.abs(scale - v) < 1e-9 ? 'btn btn--small dscale__preset--on' : 'btn btn--small'
              }
              aria-pressed={Math.abs(scale - v) < 1e-9}
              onClick={() => preview(v)}
            >
              {pct(v)}
            </button>
          ))}
        </div>

        {otherDrawingCount > 0 && (
          <label className="dscale__scope">
            <input
              type="checkbox"
              checked={allDrawings}
              disabled={busy}
              onChange={(e) => {
                setAllDrawings(e.target.checked);
                onPreview?.(scale, e.target.checked);
              }}
            />
            <span>
              <b>모든 도면</b>에 같은 배율 적용{' '}
              <span className="num">(이 도면 외 {otherDrawingCount}장)</span>
            </span>
          </label>
        )}

        <p className="dscale__note">
          현재 {pct(current)} · 조절 범위 {pct(MIN_SCALE)} ~ {pct(MAX_SCALE)}.
          {scale > 1 && ' 100%를 넘으면 지면 밖으로 넘치는 부분은 잘립니다.'}
        </p>

        {defectCount > 0 && (
          <p className="dscale__warn" role="status">
            이 도면에는 결함 <b className="num">{defectCount}</b>건이 있습니다.{' '}
            <b>결함 표기도 도면 그림을 따라 함께 움직입니다</b> — 가리키던 자리를 그대로 지킵니다.
            취소하면 배율과 표기 위치가 모두 원래대로 돌아갑니다.
          </p>
        )}
      </div>
    </Modal>
  );
}
