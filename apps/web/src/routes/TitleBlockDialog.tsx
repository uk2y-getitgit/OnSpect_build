/**
 * F5-1 · F5-2 — 도곽 · 범례 설정 다이얼로그.
 *
 * ⭐ **D16 — 스코프가 둘로 갈린다.**
 *    `DRAWING NAME` 하나만 이 도면 것이고, **나머지는 전부 용역 전체**가 공유한다
 *    (`Project.titleBlock` · `Project.legend`). 도면마다 도곽을 다시 켜야 했던 것이
 *    "도곽 출력안됨"(버그 B2)의 원인이었다.
 *
 * ⭐ **실시간 미리보기.** 슬라이더를 끄는 동안 `onPreview` 로 값을 부모에 흘려보내
 *    저장 전에도 캔버스가 반응한다. `[취소]` 하면 부모가 오버라이드를 버린다 —
 *    **저장소를 때리지 않는다.**
 *
 * 범례 **행은 저장하지 않는다** — 그 도면에 실제로 쓰인 결함유형에서 매번 파생한다(D8).
 */
import { useEffect, useRef, useState } from 'react';
import { normalizeCols, TB_SCALE_NONE } from '@onspect/canvas-core';
import {
  projectLegendOf,
  projectTitleBlockOf,
  type Drawing,
  type Project,
  type ProjectLegend,
  type ProjectTitleBlock,
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
  onPreview,
  onClose,
}: {
  drawing: Drawing;
  project: Project | null;
  /** 이 도면에 실제로 쓰인 결함유형 이름 — 범례에 나갈 행 미리보기 */
  legendTypes: readonly string[];
  busy: boolean;
  /** 용역 설정 2건 + 이 도면의 도면명. 저장은 `Project` 1건 + `Drawing` 1건 */
  onApply: (tb: ProjectTitleBlock, lg: ProjectLegend, drawingName: string | null) => void;
  /**
   * 저장 **전** 임시 반영. 없으면(미리보기할 캔버스가 없는 화면) 안 부른다.
   * `null` 을 넘기면 오버라이드를 버리라는 뜻이다.
   */
  onPreview?: (tb: ProjectTitleBlock | null, lg: ProjectLegend | null) => void;
  onClose: () => void;
}) {
  const [tb, setTb] = useState<ProjectTitleBlock>(() => projectTitleBlockOf(project?.titleBlock));
  const [lg, setLg] = useState<ProjectLegend>(() => projectLegendOf(project?.legend));
  const [drawingName, setDrawingName] = useState<string>(drawing.titleBlock?.drawingName ?? '');

  const set = <K extends keyof ProjectTitleBlock>(k: K, v: ProjectTitleBlock[K]) =>
    setTb((cur) => ({ ...cur, [k]: v }));
  const setLeg = <K extends keyof ProjectLegend>(k: K, v: ProjectLegend[K]) =>
    setLg((cur) => ({ ...cur, [k]: v }));

  // ⚠️ `onPreview` 는 호출부에서 대개 **인라인 화살표 함수**다. 이펙트 의존에 그대로 두면
  //    부모가 리렌더될 때마다 `버리기 → 다시 넣기` 가 반복돼 캔버스가 깜빡인다.
  //    `Modal` 이 `onClose` 에 쓴 것과 같은 수법으로 ref 에 받아 의존에서 뺀다.
  const previewRef = useRef(onPreview);
  useEffect(() => {
    previewRef.current = onPreview;
  });

  // 값이 바뀔 때마다 부모에 흘려보낸다. 언마운트(저장이든 취소든)에서 오버라이드를 버린다 —
  // 저장 경로에서는 그 사이 진짜 값이 저장돼 있으므로 화면이 되돌아가지 않는다
  useEffect(() => {
    previewRef.current?.(tb, lg);
  }, [tb, lg]);
  useEffect(
    () => () => {
      previewRef.current?.(null, null);
    },
    [],
  );

  const cols = normalizeCols(tb.col0, tb.col1);
  const corrected = Math.abs(cols.c1 - tb.col1) > 1e-6 || Math.abs(cols.c0 - tb.col0) > 1e-6;

  return (
    <Modal
      title="도곽 · 범례 설정"
      dock="right"
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
            onClick={() => onApply(tb, lg, drawingName.trim() === '' ? null : drawingName)}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div className="tbset">
        {/* ── 이 도면 ─────────────────────────────────────────────── */}
        <h3 className="tbset__section">이 도면</h3>

        <Field label="DRAWING NAME" hint="비우면 도면 이름을 씁니다">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              type="text"
              value={drawingName}
              placeholder={drawing.name}
              aria-describedby={describedBy}
              onChange={(e) => setDrawingName(e.target.value)}
            />
          )}
        </Field>

        {/* ── 용역 전체 ───────────────────────────────────────────── */}
        <h3 className="tbset__section">
          용역 전체
          <span className="tbset__scope">이 용역의 모든 도면에 함께 적용됩니다</span>
        </h3>

        <label className="tbset__toggle">
          <input
            type="checkbox"
            checked={tb.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          <span>도곽 표시</span>
        </label>
        {/*
          B2-c — 예전 문구("출력물에 넣을지는 출력 단계에서 따로 고릅니다")는 사실이 아니었다.
          출력에는 **이 스위치와 출력 옵션이 둘 다** 켜져야 나간다.
        */}
        <p className="tbset__note">
          화면과 출력물 <b>양쪽</b>의 표시 여부입니다. 출력 화면에서 한 번 더 끌 수 있습니다.
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
            onChange={(e) => setLeg('enabled', e.target.checked)}
          />
          <span>범례 표시</span>
        </label>
        <p className="tbset__note">
          지면 우측 상단에 <b>기호 | 설명</b> 2열 표로 그립니다. 결함유형 행은 색을 쓰지 않고,
          상태 행은 <b>도면 위 마커와 같은 색</b>(현회차 빨강 · 전회차 보라 · 보수완료 회색)으로
          채운 원을 그립니다.
        </p>

        {/*
          D15 — 상태 범례. **켜도 그 도면에 그 상태가 없으면 안 그린다** —
          범례는 "이 도면의 이 색이 무슨 뜻인가"를 설명하는 표라, 없는 색을 설명하면 거짓말이 된다.
        */}
        <div className="tbset__checks">
          <label className="tbset__check">
            <input
              type="checkbox"
              checked={lg.showTypes}
              disabled={!lg.enabled}
              onChange={(e) => setLeg('showTypes', e.target.checked)}
            />
            <span>결함유형</span>
          </label>
          <label className="tbset__check">
            <input
              type="checkbox"
              checked={lg.statusNew}
              disabled={!lg.enabled}
              onChange={(e) => setLeg('statusNew', e.target.checked)}
            />
            <span className="tbset__dot" data-status="CURRENT" aria-hidden="true" />
            <span>신규(현회차)</span>
          </label>
          <label className="tbset__check">
            <input
              type="checkbox"
              checked={lg.statusPending}
              disabled={!lg.enabled}
              onChange={(e) => setLeg('statusPending', e.target.checked)}
            />
            <span className="tbset__dot" data-status="PREV_PENDING" aria-hidden="true" />
            <span>미보수(전회차)</span>
          </label>
          <label className="tbset__check">
            <input
              type="checkbox"
              checked={lg.statusRepaired}
              disabled={!lg.enabled}
              onChange={(e) => setLeg('statusRepaired', e.target.checked)}
            />
            <span className="tbset__dot" data-status="REPAIRED" aria-hidden="true" />
            <span>보수완료</span>
          </label>
        </div>
        <p className="tbset__note">
          상태 행은 <b>이 도면에 실제로 있는 상태만</b> 나갑니다 — 켜 두어도 해당 결함이 없으면
          그리지 않습니다.
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
            onChange={(e) => setLeg('lgScale', Number(e.target.value))}
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
