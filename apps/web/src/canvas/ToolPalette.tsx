/**
 * 우측 세로 툴 팔레트 — 스펙 §2-5 + S2a.
 *
 * `선택 / 점 / 방향 / 영역 / 그리기 / 메모`.
 * S2a 에서 방향·영역·그리기·메모가 실제로 동작한다.
 *
 * 영역은 **사각 / 타원** 두 가지다 (§S2a-1). 버튼을 하나 더 늘리는 대신
 * 영역이 선택됐을 때만 모양 선택 줄이 펼쳐진다 — 팔레트가 세로로 길어지면
 * 도면 가장자리를 잡아먹는다.
 */
import type { Tool } from '@onspect/canvas-core';

export type ToolPaletteProps = {
  tool: Tool;
  disabled: boolean;
  onChange: (tool: Tool) => void;
  /**
   * D22 조준 모드 토글. **도구가 아니다** — 도구(`Tool`)는 무엇을 그리는가이고,
   * 조준은 그것을 어떻게 찍는가다. 그래서 `tool` 과 따로 산다.
   *
   * 터치 전용 기기에서만 보인다(`styles.css` — `(hover:none) and (pointer:coarse)`).
   * PC 에는 정확한 마우스가 있어 조준이 필요 없다.
   */
  aimOn?: boolean;
  onToggleAim?: () => void;
};

type Item = {
  id: string;
  label: string;
  hint: string;
  tool: Tool;
  icon: JSX.Element;
};

const ITEMS: Item[] = [
  {
    id: 'select',
    label: '선택',
    hint: '선택 · 이동 (V)',
    tool: 'SELECT',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 2.5 15 10l-4.6.9L13 17l-2.3 1-2.6-6.1L4 15.4z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'point',
    label: '점',
    hint: '점 표기 — 도면을 클릭하면 결함 1건이 추가됩니다',
    tool: 'POINT',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="4.5" fill="currentColor" />
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
      </svg>
    ),
  },
  {
    id: 'arrow',
    label: '방향',
    // S2a-2 3차 재개정(2026-08-24) — 마우스가 지나간 대로 그린다. 첫 구간은 45도(8방향),
    // 옆으로 벗어나면 직전 구간 기준 90도로 최대 2번까지 꺾인다. 뗀 자리가 번호 위치
    hint: '방향 표기 — 화살촉에서 끌어 그립니다(첫 방향 45도, 이후 90도로 최대 2번 꺾임)',
    tool: 'ARROW',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 17 15 5" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <path d="M16.5 3.5 17 9l-5.5-.5z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'area',
    label: '영역',
    hint: '영역 표기 — 대각으로 끌어 그립니다. Shift 를 누르면 정사각·정원',
    tool: 'AREA_RECT',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3.5" y="5" width="13" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: 'draw',
    label: '그리기',
    hint: '자유그리기 — 그린 뒤 붙일 결함을 고릅니다. 결함 상태색 실선으로 그려집니다',
    tool: 'SKETCH',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 16c3-1 3-9 6-9s3 7 5.5 7c1.4 0 2-1.2 2.5-2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    id: 'memo',
    label: '필기메모',
    hint: '필기 메모 — 끌어서 손으로 씁니다. 결함과 무관하며 결함 목록에 나오지 않습니다',
    tool: 'MEMO',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 15.5l1-3L13 3.6a1.6 1.6 0 0 1 2.3 0l1.1 1.1a1.6 1.6 0 0 1 0 2.3L7.5 16l-3 1z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M12 5l3 3" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    id: 'eraser',
    label: '지우개',
    // D14 — **필기 메모의 획만** 지운다. 결함 표기는 절대 안 지운다는 것을 문구로 못박는다
    hint: '지우개 — 필기 메모의 획만 지웁니다. 점 · 화살표 · 영역 · 그리기 · 번호는 지워지지 않습니다',
    tool: 'ERASER',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M8.6 16.5 3.9 11.8a1.4 1.4 0 0 1 0-2l6.2-6.2a1.4 1.4 0 0 1 2 0l3.9 3.9a1.4 1.4 0 0 1 0 2l-7 7z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M7 16.5h9.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7.2 8.5l4.7 4.7" stroke="currentColor" strokeWidth="1.2" opacity=".55" />
      </svg>
    ),
  },
];

const AREA_TOOLS: { tool: Tool; label: string; icon: JSX.Element }[] = [
  {
    tool: 'AREA_RECT',
    label: '사각',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="4" y="6" width="12" height="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    tool: 'AREA_ELLIPSE',
    label: '타원',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <ellipse cx="10" cy="10" rx="6" ry="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
];

const AREA_SET: Tool[] = ['AREA_RECT', 'AREA_ELLIPSE'];

export function ToolPalette({ tool, disabled, onChange, aimOn = false, onToggleAim }: ToolPaletteProps) {
  const areaActive = AREA_SET.includes(tool);

  return (
    <div className="palette" role="toolbar" aria-label="표기 도구" aria-orientation="vertical">
      {ITEMS.map((item, i) => {
        // `영역` 버튼은 사각·타원 어느 쪽이 켜져 있어도 선택 상태다
        const isSelected = item.id === 'area' ? areaActive : item.tool === tool;
        return (
          <div key={item.id} className="palette__slot">
            {i === 2 && <div className="palette__divider" aria-hidden="true" />}
            {i === 5 && <div className="palette__divider" aria-hidden="true" />}
            <button
              type="button"
              className="palette__btn"
              aria-pressed={isSelected}
              aria-label={item.label}
              disabled={disabled}
              title={disabled ? `${item.label} · 도면을 먼저 올려주세요` : item.hint}
              onClick={() => onChange(item.id === 'area' && areaActive ? tool : item.tool)}
            >
              <span className="palette__icon">{item.icon}</span>
              <span className="palette__label">{item.label}</span>
            </button>

            {item.id === 'area' && areaActive && (
              <div className="palette__sub" role="group" aria-label="영역 모양">
                {AREA_TOOLS.map((a) => (
                  <button
                    key={a.tool}
                    type="button"
                    className="palette__subbtn"
                    aria-pressed={tool === a.tool}
                    aria-label={`영역 ${a.label}`}
                    title={`영역 — ${a.label}`}
                    disabled={disabled}
                    onClick={() => onChange(a.tool)}
                  >
                    {a.icon}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* D22 조준 — 목업 M-05a 처럼 구분선 아래 따로 선다. 도구가 아니라 **입력 방식**이다.
          `palette__slot--aim` 은 기본이 숨김이고 터치 전용 기기에서만 켜진다 */}
      {onToggleAim && (
        <div className="palette__slot palette__slot--aim">
          <div className="palette__divider" aria-hidden="true" />
          <button
            type="button"
            className="palette__btn"
            aria-pressed={aimOn}
            aria-label="조준 모드"
            disabled={disabled}
            title={
              disabled
                ? '조준 · 도면을 먼저 올려주세요'
                : '조준 — 화면 중앙 십자선에 맞추고 [여기]로 찍는다'
            }
            onClick={onToggleAim}
          >
            <span className="palette__icon">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <line x1="10" y1="1.5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.6" />
                <line x1="10" y1="15" x2="10" y2="18.5" stroke="currentColor" strokeWidth="1.6" />
                <line x1="1.5" y1="10" x2="5" y2="10" stroke="currentColor" strokeWidth="1.6" />
                <line x1="15" y1="10" x2="18.5" y2="10" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
            <span className="palette__label">조준</span>
          </button>
        </div>
      )}
    </div>
  );
}
