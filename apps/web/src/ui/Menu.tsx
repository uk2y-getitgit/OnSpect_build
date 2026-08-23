/**
 * `⋯` 추가 작업 메뉴 — 목록 행에서 재사용한다.
 *
 * 드래그로만 되는 조작은 키보드 사용자에게 존재하지 않는 기능이다 (ui-quality §7-2).
 * 그래서 순서 변경도 **여기에 `위로`/`아래로` 항목으로 함께 둔다.**
 *
 * F6 — body 포털 + 뷰포트 경계 뒤집기.
 * `.rowmenu` 안에 `position: absolute` 로 띄우면 조상의 `overflow: hidden` 이나
 * 컨테이너 바닥에서 메뉴가 잘린다. `document.body` 에 포털로 그리고,
 * 버튼 기준 실측 좌표로 배치한 뒤 뷰포트를 넘으면 위/왼쪽으로 뒤집는다.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  /** 앞에 구분선을 넣는다 */
  separatorBefore?: boolean;
};

const VIEWPORT_MARGIN = 8;

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  // 실측 배치 — 메뉴가 열린 프레임에 버튼·메뉴 크기를 재고 뒤집기를 결정한다.
  // useLayoutEffect 라 페인트 전에 끝나 깜빡임이 없다.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;

    const btnRect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    // 기본: 버튼 아래, 버튼 오른쪽 끝에 메뉴 오른쪽 끝을 맞춘다 (기존 `right:0` 과 동일한 자리)
    let top = btnRect.bottom + 2;
    let left = btnRect.right - menuRect.width;

    // 아래로 나가면 위로 뒤집는다
    if (top + menuRect.height > window.innerHeight - VIEWPORT_MARGIN) {
      const flippedTop = btnRect.top - menuRect.height - 2;
      top = flippedTop >= VIEWPORT_MARGIN ? flippedTop : VIEWPORT_MARGIN;
    }

    // 왼쪽으로 나가면 버튼 왼쪽 끝에 맞춘다
    if (left < VIEWPORT_MARGIN) {
      left = btnRect.left;
    }
    // 그래도 오른쪽으로 나가면 뷰포트 안으로 밀어 넣는다
    if (left + menuRect.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - VIEWPORT_MARGIN - menuRect.width;
    }
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    setPos({ top, left });
    // menuRect.width/height 는 open 이 바뀔 때만 다시 잴 이유가 있다 — items 가 바뀌면 메뉴가 닫혔다 열린다
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const isOutside = (target: EventTarget | null) => {
      const node = target as Node | null;
      if (btnRef.current?.contains(node)) return false;
      if (menuRef.current?.contains(node)) return false;
      return true;
    };
    const close = (e: Event) => {
      if (isOutside(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // 스크롤·리사이즈로 버튼이 움직이면 실측 좌표가 낡는다 — 닫는 편이 어긋난 메뉴보다 낫다
    const onViewportChange = () => setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  return (
    <div className="rowmenu">
      <button
        ref={btnRef}
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
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="menu"
            role="menu"
            id={id}
            style={{
              position: 'fixed',
              top: pos ? pos.top : 0,
              left: pos ? pos.left : 0,
              // 실측 전(첫 프레임)에는 안 보이게 — useLayoutEffect 가 페인트 전에 pos 를 채운다
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
