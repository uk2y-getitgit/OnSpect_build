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
    // F2 — 점과 동일한 클릭 생성. 기본 방향으로 생기고, 화살촉을 끌어 나중에 조정한다
    hint: '방향 표기 — 도면을 클릭하면 결함 1건이 추가됩니다. 화살촉을 끌어 방향을 조정하세요',
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

export function ToolPalette({ tool, disabled, onChange }: ToolPaletteProps) {
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
    </div>
  );
}
