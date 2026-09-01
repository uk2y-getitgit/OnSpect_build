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
 * 초기 포커스 후보 — **헤더의 ✕ 닫기 버튼은 제외한다.**
 * `querySelector` 는 문서 순서 첫 매치를 주므로, 제외하지 않으면 헤더의 ✕ 가 항상 이긴다 (B1-b).
 */
const MODAL_FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not(.modal__x)';

/**
 * 모달 셸 — Esc·✕·취소로 닫히고, 열릴 때 첫 필드로 포커스가 간다.
 * Tab 이 모달 밖으로 새지 않게 가둔다 (ui-quality §7-2).
 *
 * ⚠️ **포커스 이펙트는 마운트 1회다** (버그 B1). 부모 리렌더마다 다시 돌면
 *    타이핑할 때마다 포커스가 첫 요소로 튀어 입력 자체가 불가능해진다.
 *
 * ⚠️ **스크림(배경) 클릭으로는 기본적으로 닫히지 않는다** (T-6, 2026-09-01).
 *    태블릿에서 스크롤하다 배경을 스치면 입력 중이던 폼이 통째로 날아갔다.
 *    닫는 길은 Esc · 헤더 ✕ · 푸터의 취소/닫기 셋이면 충분하다.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  footer,
  children,
  wide = false,
  dock,
  autoFocusFirst = true,
  closeOnScrimClick = false,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  wide?: boolean;
  /**
   * 화면 오른쪽에 붙이고 **스크림을 투명하게** 한다.
   * 뒤 화면이 실시간 미리보기 대상일 때만 쓴다(도곽·범례 설정 — D16).
   * 가리면 미리보기가 안 보인다.
   */
  dock?: 'right';
  /**
   * T-3 — 본문 첫 입력으로 자동 포커스(B1-b)를 끈다.
   * **검색창이 본문 첫 요소인 모달만** 끈다 — 태블릿에서 열자마자 소프트 키보드가
   * 올라와 목록을 절반 가린다. PC 폼 모달의 자동 포커스는 그대로 둔다.
   */
  autoFocusFirst?: boolean;
  /**
   * T-6 — 스크림 클릭으로 닫는 옵트인. **기본은 꺼져 있다.**
   * 켜려면 "잘못 닫혀도 잃을 입력이 없다" 가 참이어야 한다.
   */
  closeOnScrimClick?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  // B1-c — `onClose` 는 호출부에서 대개 **인라인 화살표 함수**다. 이걸 이펙트 의존에 두면
  // 부모가 리렌더될 때마다 이펙트가 다시 돌아 포커스를 빼앗는다. ref 로 받아 의존에서 뺀다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // B1-b — 초기 포커스는 **딱 1회**다. 그리고 문서 순서 첫 요소(헤더의 ✕)가 아니라
  // **본문(.modal__scroll)의 첫 입력**을 잡는다. 둘 중 하나라도 어기면 타이핑 중 포커스가 튄다.
  //
  // ⭐ "1회"를 **의존성 배열이 아니라 ref 로** 보장한다. 본문을 비동기로 불러오는 모달
  //    (`ProjectForm`·`DrawingUpload` — 마운트 시 본문이 `불러오는 중…` 뿐이다)은 마운트 시점에
  //    잡을 입력칸이 없다. 의존 `[]` 로 두면 그때 한 번 실패하고 끝나 영영 포커스가 안 간다.
  //    매 렌더 확인하되 실제 포커스는 성공한 그 한 번뿐이므로 B1(포커스 뺏김)은 재발하지 않는다.
  const focusedRef = useRef(false);
  useEffect(() => {
    if (focusedRef.current) return;
    const el = ref.current;
    if (!el) return;
    // T-3 — 옵트아웃한 모달은 **첫 입력칸 대신 모달 컨테이너**(tabIndex=-1)를 잡는다.
    // 포커스를 아예 끄면 포커스가 스크림 뒤 트리거 버튼에 남아 Tab 트랩이 개입할 수
    // 없다(검수 보통2). `div` 는 텍스트 입력이 아니라 소프트 키보드가 올라오지 않으므로
    // T-3 의 목적(태블릿 키보드 억제)은 그대로 달성된다.
    if (!autoFocusFirst) {
      focusedRef.current = true;
      el.focus();
      return;
    }
    const scope = el.querySelector<HTMLElement>('.modal__scroll') ?? el;
    const first = scope.querySelector<HTMLElement>(MODAL_FOCUSABLE);
    // 본문에 입력칸이 아직 없다 — **아무 데도 포커스하지 않고** 다음 렌더에 다시 본다.
    // (footer 의 `취소` 로 폴백하느니 안 잡는 편이 낫다)
    if (!first) return;
    focusedRef.current = true;
    first.focus();
  });

  useEffect(() => {
    const el = ref.current;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
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
      const active = document.activeElement;
      // 포커스가 모달 **밖**이거나 컨테이너 자신(tabIndex=-1, items 에 안 들어온다)에
      // 있으면 첫/마지막 비교가 둘 다 거짓이라 브라우저 기본 Tab 이 배경으로 새어 나간다.
      // 이때는 진행 방향에 맞춰 모달 안으로 끌어온다.
      if (!(active instanceof HTMLElement) || active === el || !el.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? lastEl : firstEl).focus();
        return;
      }
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
  }, []);

  return (
    <div
      className={dock === 'right' ? 'modal-scrim modal-scrim--dock' : 'modal-scrim'}
      // T-6 — 기본은 스크림 클릭으로 닫지 않는다. 켠 모달만 닫는다
      onPointerDown={closeOnScrimClick ? onClose : undefined}
    >
      <div
        ref={ref}
        className={[
          'modal',
          wide ? 'modal--wide' : '',
          dock === 'right' ? 'modal--dockRight' : '',
        ]
          .filter((c) => c !== '')
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // 자동포커스를 끈 모달(T-3)이 잡을 자리. 탭 순서에는 들어가지 않는다
        tabIndex={-1}
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
