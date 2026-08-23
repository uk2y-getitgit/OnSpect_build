/**
 * F5-1 · F5-2 — 도곽 · 범례 설정 다이얼로그.
 *
 * 저장하는 값은 `Drawing.titleBlock` · `Drawing.legend`(project-core 저장 형태)뿐이다.
 * 실제 그리기는 `canvas-core` 의 `titleBlock.ts` · `legend.ts` 가 한다.
 *
 * 범례 **행은 저장하지 않는다** — 그 도면에 실제로 쓰인 결함유형에서 매번 파생한다(D8).
 *
 * **출력 ON/OFF 는 Phase 4** 다. 여기 `표시` 는 화면(캔버스) 표시 여부다.
 */
import { useState } from 'react';
import { normalizeCols, TB_SCALE_NONE } from '@onspect/canvas-core';
import {
  DEFAULT_DRAWING_LEGEND,
  DEFAULT_DRAWING_TITLE_BLOCK,
  type Drawing,
  type DrawingLegend,
  type DrawingTitleBlock,
  type Project,
} from '@onspect/project-core';
import { Field, Modal } from '../ui/Form';

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function TitleBlockDialog({
  drawing,
  project,
  legendTypes,
  busy,
  onApply,
  onClose,
}: {
  drawing: Drawing;
  project: Project | null;
  /** 이 도면에 실제로 쓰인 결함유형 이름 — 범례에 나갈 행 미리보기 */
  legendTypes: readonly string[];
  busy: boolean;
  onApply: (tb: DrawingTitleBlock, lg: DrawingLegend) => void;
  onClose: () => void;
}) {
  const [tb, setTb] = useState<DrawingTitleBlock>(
    drawing.titleBlock ?? DEFAULT_DRAWING_TITLE_BLOCK,
  );
  const [lg, setLg] = useState<DrawingLegend>(drawing.legend ?? DEFAULT_DRAWING_LEGEND);
  const set = <K extends keyof DrawingTitleBlock>(k: K, v: DrawingTitleBlock[K]) =>
    setTb((cur) => ({ ...cur, [k]: v }));

  const cols = normalizeCols(tb.col0, tb.col1);
  const corrected = Math.abs(cols.c1 - tb.col1) > 1e-6 || Math.abs(cols.c0 - tb.col0) > 1e-6;

  return (
    <Modal
      title="도곽 · 범례 설정"
      subtitle={
        <>
          <b className="quote">{drawing.name}</b> · A4 지면의 테두리 · 표제란 · 범례
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
            disabled={busy}
            onClick={() => onApply(tb, lg)}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div className="tbset">
        <label className="tbset__toggle">
          <input
            type="checkbox"
            checked={tb.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          <span>도곽 표시</span>
        </label>
        <p className="tbset__note">
          화면(캔버스) 표시 여부입니다. 출력물에 넣을지는 <b>출력 단계에서 따로</b> 고릅니다.
        </p>

        <Field label="PROJECT TITLE" hint={`비우면 용역명(${project?.name ?? '—'})을 씁니다`}>
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              type="text"
              value={tb.projectTitle ?? ''}
              placeholder={project?.name ?? ''}
              aria-describedby={describedBy}
              onChange={(e) => set('projectTitle', e.target.value || null)}
            />
          )}
        </Field>

        <Field label="DRAWING NAME" hint="비우면 도면 이름을 씁니다">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              type="text"
              value={tb.drawingName ?? ''}
              placeholder={drawing.name}
              aria-describedby={describedBy}
              onChange={(e) => set('drawingName', e.target.value || null)}
            />
          )}
        </Field>

        <Field label="SCALE" hint={`축척 문자열. 기본 ${TB_SCALE_NONE}`}>
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              type="text"
              value={tb.scale}
              placeholder={TB_SCALE_NONE}
              aria-describedby={describedBy}
              onChange={(e) => set('scale', e.target.value)}
            />
          )}
        </Field>

        <div className="tbset__row">
          <span className="tbset__key">도곽 크기</span>
          <input
            type="range"
            className="dscale__range"
            min={0.5}
            max={2}
            step={0.05}
            value={tb.tbScale}
            aria-label="도곽 크기"
            onChange={(e) => set('tbScale', Number(e.target.value))}
          />
          <output className="dscale__value num">{pct(tb.tbScale)}</output>
        </div>

        <div className="tbset__row">
          <span className="tbset__key">PROJECT TITLE 열</span>
          <input
            type="range"
            className="dscale__range"
            min={0.1}
            max={0.8}
            step={0.01}
            value={tb.col0}
            aria-label="PROJECT TITLE 열 비율"
            onChange={(e) => set('col0', Number(e.target.value))}
          />
          <output className="dscale__value num">{pct(cols.c0)}</output>
        </div>

        <div className="tbset__row">
          <span className="tbset__key">DRAWING NAME 열</span>
          <input
            type="range"
            className="dscale__range"
            min={0.05}
            max={0.8}
            step={0.01}
            value={tb.col1}
            aria-label="DRAWING NAME 열 비율"
            onChange={(e) => set('col1', Number(e.target.value))}
          />
          <output className="dscale__value num">{pct(cols.c1)}</output>
        </div>

        <p className="tbset__note">
          SCALE 열 <b className="num">{pct(cols.c2)}</b>
          {corrected && ' · 두 열의 합이 90%를 넘어 자동으로 줄였습니다'}
        </p>

        <hr className="tbset__sep" />

        <label className="tbset__toggle">
          <input
            type="checkbox"
            checked={lg.enabled}
            onChange={(e) => setLg((c) => ({ ...c, enabled: e.target.checked }))}
          />
          <span>범례 표시</span>
        </label>
        <p className="tbset__note">
          지면 우측 상단에 <b>기호 | 설명</b> 2열 표로 그립니다. 결함유형별 색은 쓰지 않습니다 —
          도면 위 마커 색은 <b>결함 상태</b>(현회차 · 전회차 · 보수완료)를 그대로 유지합니다.
        </p>

        <div className="tbset__row">
          <span className="tbset__key">범례 크기</span>
          <input
            type="range"
            className="dscale__range"
            min={0.5}
            max={2}
            step={0.05}
            value={lg.lgScale}
            aria-label="범례 크기"
            disabled={!lg.enabled}
            onChange={(e) => setLg((c) => ({ ...c, lgScale: Number(e.target.value) }))}
          />
          <output className="dscale__value num">{pct(lg.lgScale)}</output>
        </div>

        <p className="tbset__note">
          {legendTypes.length === 0 ? (
            <>
              이 도면에는 아직 결함유형이 입력된 결함이 없습니다. 범례를 켜도{' '}
              <b>표시할 행이 생길 때까지</b> 아무것도 그리지 않습니다.
            </>
          ) : (
            <>
              지금 표시될 행 <b className="num">{legendTypes.length}</b>개:{' '}
              {legendTypes.join(' · ')}
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
