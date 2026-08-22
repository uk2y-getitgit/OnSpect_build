/**
 * 선택 시 뜨는 컨텍스트 플로팅 툴바 — 스펙 T12 + §S2a-5.
 *
 * 선택한 표기 종류에 따라 도구가 달라진다:
 *   점    `[점 ▾]   색상 · 복제 · 추가 · 삭제`
 *   방향  `[방향 ▾] 색상 · 복제 · 추가 · 삭제`
 *   영역  `[영역 ▾] 색상 · 실선 · 채움 · 복제 · 추가 · 삭제`
 *
 * `복제 · 추가`(= 마크 그룹 편집)는 이번 범위 밖이라 여전히 비활성이다.
 *
 * ⚠️ 여기서 바꾸는 것은 **스타일**뿐이다. 위치·크기는 `geometry` 이고
 * 절대 `style` 로 새어 들어가지 않는다 (§2-1-c, 함정 #5).
 * 개별 스타일을 한 번이라도 건드리면 전역 상속에서 분리되므로 `[초기화]` 를 함께 둔다.
 */
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_GLOBAL_STYLE,
  resolveStyle,
  type AreaFill,
  type AreaShape,
  type Defect,
  type MarkType,
} from '@onspect/canvas-core';

export type ContextToolbarProps = {
  defect: Defect;
  /** 선택된 마크. 없으면 marks[0] 기준으로 종류를 정한다 */
  markId: string | null;
  at: { x: number; y: number };
  locked: boolean;
  onDelete: () => void;
  onResetLabel: () => void;
  onSetColor: (color: string | null) => void;
  onSetAreaShape: (shape: AreaShape) => void;
  onSetAreaFill: (fill: AreaFill) => void;
  onResetStyle: () => void;
};

const KIND_LABEL: Record<MarkType, string> = {
  POINT: '점',
  ARROW: '방향',
  AREA_RECT: '영역',
  AREA_ELLIPSE: '영역',
};

/**
 * 사용자 커스텀 색.
 * ⚠️ 디자인시스템 §3 예약색(현회차 빨강 · 전회차 보라 · 보수완료 회색)과
 * 가이드 시안(`--guide`)·선택 파랑(`--selection`)은 **넣지 않는다.**
 * 상태색을 손으로 고를 수 있으면 "빨강인데 전회차" 같은 거짓 표기가 생긴다.
 */
const COLORS: { value: string; label: string }[] = [
  { value: '#e07b00', label: '주황' },
  { value: '#1a7f37', label: '초록' },
  { value: '#0b6a8f', label: '청록' },
  { value: '#8a5a00', label: '갈색' },
  { value: '#c2185b', label: '자홍' },
  { value: '#1f2734', label: '먹색' },
];

const SHAPES: { value: AreaShape; label: string; hint: string }[] = [
  { value: 'SOLID', label: '실선', hint: '테두리 — 직선' },
  { value: 'DASH', label: '점선', hint: '테두리 — 점선' },
  { value: 'CLOUD', label: '구름', hint: '테두리 — 구름(revision cloud)' },
];

export function ContextToolbar({
  defect,
  markId,
  at,
  locked,
  onDelete,
  onResetLabel,
  onSetColor,
  onSetAreaShape,
  onSetAreaFill,
  onResetStyle,
}: ContextToolbarProps) {
  const [open, setOpen] = useState<'color' | 'shape' | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  const mark = defect.marks.find((m) => m.id === markId) ?? defect.marks[0] ?? null;
  const type: MarkType = mark?.type ?? 'POINT';
  const isArea = type === 'AREA_RECT' || type === 'AREA_ELLIPSE';
  const style = resolveStyle(defect, DEFAULT_GLOBAL_STYLE);
  const custom = defect.style !== null;

  // 툴바 밖을 누르면 펼친 메뉴를 닫는다
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => setOpen(null), [defect.id, markId]);

  return (
    <div
      ref={ref}
      className="ctx-toolbar"
      style={{ left: `${at.x}px`, top: `${at.y}px` }}
      role="toolbar"
      aria-label={`${defect.seq}번 ${KIND_LABEL[type]} 표기 도구`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="ctx-toolbar__btn ctx-toolbar__btn--kind"
        disabled
        title="표기 종류 변경 · 준비 중"
      >
        <span className="ctx-toolbar__kind">{KIND_LABEL[type]}</span>
        <span className="ctx-toolbar__caret" aria-hidden="true">▾</span>
      </button>
      <span className="ctx-toolbar__sep" aria-hidden="true" />

      {/* 색상 */}
      <div className="ctx-toolbar__wrap">
        <button
          type="button"
          className="ctx-toolbar__btn"
          disabled={locked}
          aria-expanded={open === 'color'}
          aria-haspopup="true"
          title={locked ? '전회차 표기는 변경할 수 없습니다' : '표기 색을 바꿉니다'}
          onClick={() => setOpen((v) => (v === 'color' ? null : 'color'))}
        >
          <span className="ctx-toolbar__swatch" style={{ background: style.color }} aria-hidden="true" />
          색상
        </button>
        {open === 'color' && (
          <div className="ctx-pop" role="menu" aria-label="표기 색">
            <div className="ctx-pop__grid">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={defect.style?.color === c.value}
                  className="ctx-pop__swatch"
                  style={{ background: c.value }}
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => {
                    onSetColor(c.value);
                    setOpen(null);
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              role="menuitem"
              className="ctx-pop__item"
              disabled={defect.style?.color === undefined}
              title="결함 상태가 정하는 기본색으로 되돌립니다"
              onClick={() => {
                onSetColor(null);
                setOpen(null);
              }}
            >
              상태 기본색으로
            </button>
          </div>
        )}
      </div>

      {/* 영역 전용 — 테두리 모양 · 채우기 */}
      {isArea && (
        <>
          <div className="ctx-toolbar__wrap">
            <button
              type="button"
              className="ctx-toolbar__btn"
              disabled={locked}
              aria-expanded={open === 'shape'}
              aria-haspopup="true"
              title="테두리 모양 — 실선 · 점선 · 구름"
              onClick={() => setOpen((v) => (v === 'shape' ? null : 'shape'))}
            >
              {SHAPES.find((s) => s.value === style.areaShape)?.label ?? '실선'}
              <span className="ctx-toolbar__caret" aria-hidden="true">▾</span>
            </button>
            {open === 'shape' && (
              <div className="ctx-pop" role="menu" aria-label="테두리 모양">
                {SHAPES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={style.areaShape === s.value}
                    className="ctx-pop__item"
                    title={s.hint}
                    onClick={() => {
                      onSetAreaShape(s.value);
                      setOpen(null);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="ctx-toolbar__btn"
            disabled={locked}
            aria-pressed={style.areaFill === 'HATCH'}
            title="45° 해치로 속을 채웁니다"
            onClick={() => onSetAreaFill(style.areaFill === 'HATCH' ? 'NONE' : 'HATCH')}
          >
            채움
          </button>
        </>
      )}

      <button type="button" className="ctx-toolbar__btn" disabled title="복제 · 준비 중">
        복제
      </button>
      <button type="button" className="ctx-toolbar__btn" disabled title="마크 추가 · 준비 중">
        추가
      </button>
      <span className="ctx-toolbar__sep" aria-hidden="true" />

      {/*
        개별 스타일을 건드리면 전역 상속에서 분리된다.
        되돌릴 방법이 없으면 사용자는 "왜 전체 설정이 안 먹지" 를 영원히 겪는다 (§S2a-5)
      */}
      <button
        type="button"
        className="ctx-toolbar__btn"
        onClick={onResetStyle}
        disabled={locked || !custom}
        title={
          custom
            ? '이 표기만의 스타일을 버리고 전체 설정을 따릅니다'
            : '이미 전체 설정을 따르고 있습니다'
        }
      >
        스타일 초기화
      </button>
      <button
        type="button"
        className="ctx-toolbar__btn"
        onClick={onResetLabel}
        disabled={locked || !defect.label.placed}
        title={
          locked
            ? '전회차 표기는 변경할 수 없습니다'
            : defect.label.placed
              ? '번호 풍선을 자동 배치 위치로 되돌립니다'
              : '이미 자동 배치 상태입니다'
        }
      >
        번호 초기화
      </button>
      <button
        type="button"
        className="ctx-toolbar__btn ctx-toolbar__btn--danger"
        onClick={onDelete}
        disabled={locked}
        title={locked ? '전회차 표기는 삭제할 수 없습니다' : '삭제 (Delete)'}
      >
        삭제
      </button>
    </div>
  );
}
