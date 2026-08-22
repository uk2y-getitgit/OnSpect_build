/**
 * 폼 · 모달 · 빈 상태 공통 부품 — `references/ui-quality.md`.
 *
 * 이번 범위는 **폼과 목록이 중심**이라 아래 항목이 전부 기능 요건이다:
 *   · 모든 입력에 `<label>` · 필수 표시 · 에러 상태 (§1)
 *   · 저장 중 `loading` — 멈춘 줄 알고 다시 누르는 것을 막는다 (§1)
 *   · 빈 상태 · 검색 결과 없음 (§5)
 *   · 한국어 줄바꿈 `keep-all` — 용역명이 길 수 있다 (§2)
 */
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';

export function Field({
  label,
  required = false,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: ReactNode;
  children: (props: { id: string; invalid: boolean; describedBy: string | undefined }) => ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  const invalid = Boolean(error);
  return (
    <div className="field" data-invalid={invalid || undefined}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-label="필수 입력">
            *
          </span>
        )}
      </label>
      {children({ id, invalid, describedBy: error || hint ? msgId : undefined })}
      {error ? (
        <p className="field__error" id={msgId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={msgId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** 저장 중에는 스피너를 보여주고 다시 눌리지 않게 한다 */
export function BusyButton({
  busy,
  children,
  className = 'btn btn--primary',
  disabled,
  ...rest
}: {
  busy: boolean;
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={className} disabled={busy || disabled} data-busy={busy || undefined} {...rest}>
      {busy && <span className="spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

/**
 * 모달 셸 — 스크림 클릭·Esc 로 닫히고, 열릴 때 첫 필드로 포커스가 간다.
 * Tab 이 모달 밖으로 새지 않게 가둔다 (ui-quality §7-2).
 */
export function Modal({
  title,
  subtitle,
  onClose,
  footer,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
    );
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = [
        ...el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((n) => n.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      } else if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="modal-scrim" onPointerDown={onClose}>
      <div
        ref={ref}
        className={wide ? 'modal modal--wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2 className="modal__title" id={titleId}>
            {title}
          </h2>
          {subtitle && <div className="modal__subtitle">{subtitle}</div>}
          <button type="button" className="iconbtn modal__x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal__scroll">{children}</div>
        <div className="modal__actions">{footer}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {body && <p className="empty__body">{body}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
