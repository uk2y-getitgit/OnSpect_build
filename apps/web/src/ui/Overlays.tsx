/**
 * 토스트 · 확인 다이얼로그 · 컨텍스트 메뉴.
 *
 * ui-quality §4: 모든 조작에는 즉시 보이는 반응이 있어야 한다.
 * 삭제는 되돌리기 가능한 토스트를 함께 띄운다.
 */
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * 토스트 1건. `undoable` 은 캔버스 Undo 스택과 연결되고(`onUndo`),
 * `action` 은 그 조작 하나만 취소하는 별도 되돌리기다(용역 삭제 등, §2-11).
 * **둘은 다른 것이므로 섞지 않는다.**
 */
export type ToastItem = {
  id: number;
  kind: 'info' | 'warn';
  text: string;
  undoable: boolean;
  action?: { label: string; run: () => void };
  /** ms. 기본값: 되돌릴 수 있으면 길게 */
  ttl?: number;
};

export function Toasts({
  toasts,
  onDismiss,
  onUndo,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
  onUndo?: () => void;
}) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      window.setTimeout(() => onDismiss(t.id), t.ttl ?? (t.undoable || t.action ? 5000 : 2600)),
    );
    return () => timers.forEach((h) => window.clearTimeout(h));
  }, [toasts, onDismiss]);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind}>
          <span className="toast__text">{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.action!.run();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          {t.undoable && !t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                onUndo?.();
                onDismiss(t.id);
              }}
            >
              되돌리기
            </button>
          )}
          <button type="button" className="toast__close" aria-label="닫기" onClick={() => onDismiss(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div className="modal-scrim" onPointerDown={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 className="modal__title" id="confirm-title">
          {title}
        </h2>
        <div className="modal__body">{body}</div>
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            ref={ref}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContextMenu({
  x,
  y,
  locked,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  locked: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  return (
    <div
      className="menu"
      style={{ left: `${x}px`, top: `${y}px` }}
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="menu__item menu__item--danger"
        disabled={locked}
        title={locked ? '전회차 표기는 삭제할 수 없습니다' : undefined}
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        삭제
      </button>
    </div>
  );
}
