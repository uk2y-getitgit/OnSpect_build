/**
 * `⋯` 추가 작업 메뉴 — 목록 행에서 재사용한다.
 *
 * 드래그로만 되는 조작은 키보드 사용자에게 존재하지 않는 기능이다 (ui-quality §7-2).
 * 그래서 순서 변경도 **여기에 `위로`/`아래로` 항목으로 함께 둔다.**
 */
import { useEffect, useId, useRef, useState } from 'react';

export type MenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  /** 앞에 구분선을 넣는다 */
  separatorBefore?: boolean;
};

export function MoreMenu({
  label,
  items,
  className = 'iconbtn',
}: {
  label: string;
  items: MenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="rowmenu" ref={ref}>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⋯
      </button>
      {open && (
        <div className="menu menu--anchored" role="menu" id={id}>
          {items.map((it, i) => (
            <div key={it.label} className="menu__group">
              {it.separatorBefore && i > 0 && <div className="menu__sep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={it.danger ? 'menu__item menu__item--danger' : 'menu__item'}
                disabled={it.disabled}
                title={it.title}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
