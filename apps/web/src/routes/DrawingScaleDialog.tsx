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
  onApply,
  onClose,
}: {
  drawing: Drawing;
  /** 이 도면에 이미 찍힌 결함 수 — 경고 문구에 쓴다 */
  defectCount: number;
  busy: boolean;
  onApply: (scale: number) => void;
  onClose: () => void;
}) {
  const current = clampScale(drawing.imgScale ?? 1);
  const [scale, setScale] = useState(current);
  const changed = Math.abs(scale - current) > 1e-9;

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
            onClick={() => onApply(scale)}
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
            onChange={(e) => setScale(clampScale(Number(e.target.value)))}
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
              onClick={() => setScale(v)}
            >
              {pct(v)}
            </button>
          ))}
        </div>

        <p className="dscale__note">
          현재 {pct(current)} · 조절 범위 {pct(MIN_SCALE)} ~ {pct(MAX_SCALE)}.
          {scale > 1 && ' 100%를 넘으면 지면 밖으로 넘치는 부분은 잘립니다.'}
        </p>

        {defectCount > 0 && (
          <p className="dscale__warn" role="status">
            이 도면에는 결함 <b className="num">{defectCount}</b>건이 있습니다.{' '}
            <b>결함 표기 위치는 지면 기준으로 그대로 유지되고 그림만 움직입니다.</b> 표기가 도면
            그림과 어긋나 보이면 배율을 되돌리세요 (되돌리면 원래대로 보입니다).
          </p>
        )}
      </div>
    </Modal>
  );
}
