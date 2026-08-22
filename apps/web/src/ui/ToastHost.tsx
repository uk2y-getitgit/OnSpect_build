/**
 * 전역 토스트 — P1~P4 가 쓴다 (P5 캔버스는 자기 Undo 스택과 묶인 토스트를 따로 쓴다).
 *
 * ui-quality §4: **모든 조작에는 즉시 보이는 반응이 있어야 한다.**
 * 삭제는 확인 팝업 대신 **되돌리기 토스트**를 권장한다 — 현장에서 확인 팝업은
 * 조작을 느리게 만들고 결국 습관적으로 확인을 누르게 된다.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toasts, type ToastItem } from './Overlays';

export type ShowToast = (
  text: string,
  opts?: { kind?: 'info' | 'warn'; action?: { label: string; run: () => void }; ttl?: number },
) => void;

const Ctx = createContext<ShowToast | null>(null);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seedRef = useRef(1);

  const show = useCallback<ShowToast>((text, opts) => {
    const id = seedRef.current;
    seedRef.current += 1;
    setToasts((cur) => {
      // ⚠️ 되돌리기는 **가장 최근 토스트에만** 남긴다 (C10).
      //    옛 토스트의 버튼이 마지막 조작을 취소해 사용자를 속이는 것을 막는다
      const kept = cur.filter((t) => t.text !== text).map((t) => ({ ...t, action: undefined }));
      return [
        ...kept,
        { id, kind: opts?.kind ?? 'info', text, undoable: false, action: opts?.action, ttl: opts?.ttl },
      ].slice(-3);
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </Ctx.Provider>
  );
}

export function useToast(): ShowToast {
  const v = useContext(Ctx);
  if (!v) throw new Error('ToastHost 안에서만 쓸 수 있습니다');
  return v;
}
