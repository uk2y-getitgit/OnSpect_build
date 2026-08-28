/**
 * 사진 미리보기 — S5 스펙 §2-5 · T8 · PhotoPolish §2-5.
 *
 * 큰 이미지(렌더본 2048) + 좌우 이동 + 썸네일 메뉴와 **같은 액션**.
 *
 * ⭐ **여기가 합성본을 보는 유일한 화면이다** (R1 · §2-2). 썸네일 그리드는 합성하지 않고
 *    `✎` 배지만 띄운다 — 320px 썸네일 수십 장을 매번 캔버스로 돌리면 우측 패널이 무거워진다.
 *
 * ⭐ **캡션 저장 시점은 blur · Enter · 닫기(사진 전환 포함) 뿐이다** (§2-5).
 *    타이핑마다 IndexedDB 를 때리지 않는다.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { displaySize, type Photo } from '@onspect/project-core';
import { usePhotoComposite } from '../../data/usePhotoComposite';

/** 캡션 상한 (§2-5) */
export const PHOTO_CAPTION_MAX = 80;

/** `CanvasView` 가 window 에서 가로채는 키 — 이 다이얼로그가 떠 있는 동안 막는다 */
const CANVAS_SHORTCUT_KEYS = new Set(['Delete', 'Backspace', '0', '+', '=', '-', '_']);

/** keydown·keyup 이 **같은 판정**을 쓴다 — 한쪽만 막으면 구멍이 남는다 (버그 B1) */
function isCanvasShortcut(e: KeyboardEvent): boolean {
  return CANVAS_SHORTCUT_KEYS.has(e.key) || ((e.ctrlKey || e.metaKey) && 'zZyY'.includes(e.key));
}

/**
 * ⚠️ 캡션 입력이 생기면서 필요해졌다. `CANVAS_SHORTCUT_KEYS` 에 `0`·`-`·`+` 가 들어 있어
 * 그대로 두면 **캡션에 숫자와 하이픈을 못 친다**(capture 단계 `preventDefault`).
 */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

export type PhotoPreviewDialogProps = {
  photo: Photo;
  /** 0-based. 좌우 이동 버튼의 활성 판정에 쓴다 */
  index: number;
  total: number;
  url: string | null;
  ensureUrls: (blobKeys: readonly string[]) => void;
  disabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSetPrimary: () => void;
  onRotate: (deltaDeg: number) => void;
  onReplace: () => void;
  onRemove: () => void;
  /** 빈 값이면 `null` 이 온다 — 파생 캡션으로 되돌아간다 (§2-5) */
  onCaptionChange: (photoId: string, caption: string | null) => void;
  onClose: () => void;
};

export function PhotoPreviewDialog(props: PhotoPreviewDialogProps) {
  const {
    photo,
    index,
    total,
    url,
    ensureUrls,
    disabled,
    onPrev,
    onNext,
    onSetPrimary,
    onRotate,
    onReplace,
    onRemove,
    onCaptionChange,
    onClose,
  } = props;

  const closeRef = useRef<HTMLButtonElement | null>(null);
  const captionId = useId();

  // 큰 이미지는 **열 때 비로소** 로드한다 — 목록에서 미리 열면 objectURL 이 수백 개가 된다
  useEffect(() => {
    ensureUrls([photo.renderBlobKey, photo.thumbBlobKey]);
  }, [photo.renderBlobKey, photo.thumbBlobKey, ensureUrls]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // ── 캡션 ────────────────────────────────────────────────────────────────
  const [caption, setCaption] = useState<string>(photo.caption ?? '');
  const captionRef = useRef(caption);
  captionRef.current = caption;
  const commitRef = useRef(onCaptionChange);
  commitRef.current = onCaptionChange;

  const commitCaption = useCallback((photoId: string, value: string) => {
    const t = value.trim();
    commitRef.current(photoId, t === '' ? null : t);
  }, []);

  /**
   * 사진이 바뀌거나 창이 닫힐 때 **정리 함수가 저장한다.**
   * 정리는 새 effect 본문보다 먼저 도므로 `captionRef` 에는 아직 **직전 사진의 값**이 들어 있다.
   * ⚠️ 의존성에 `onCaptionChange` 를 넣지 않는다 — 부모가 다시 그릴 때마다 저장이 나간다.
   */
  useEffect(() => {
    const id = photo.id;
    setCaption(photo.caption ?? '');
    return () => {
      commitCaption(id, captionRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id]);

  // ── 키보드 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      // 캡션을 치는 중에는 좌우 키가 **커서 이동**이어야 한다
      if (!typing && e.key === 'ArrowLeft') {
        e.stopPropagation();
        onPrev();
        return;
      }
      if (!typing && e.key === 'ArrowRight') {
        e.stopPropagation();
        onNext();
        return;
      }
      // ⚠️ 다이얼로그가 떠 있는 동안 **캔버스 단축키가 뒤에서 도는 것을 막는다.**
      //    `CanvasView` 는 window 에 keydown 을 걸고 Delete·Backspace·Ctrl+Z·0·+·- 를 처리하는데,
      //    차단 조건이 `isTypingTarget` 하나뿐이라 이 화면의 포커스(닫기 버튼)는 통과한다.
      //    특히 **Delete — 사진이 아니라 캔버스에서 선택된 결함이 지워진다.**
      if (isCanvasShortcut(e)) {
        e.stopPropagation();
        // ⭐ 입력 중에는 **막지 않는다.** 막으면 캡션에 `0`·`-` 를 못 치고 Ctrl+Z 도 안 먹는다
        if (!typing) e.preventDefault();
      }
    };
    // ⭐ **keyup 도 같이 막는다** (버그 B1). keydown 만 막으면 `CanvasView` 의 window keyup 이
    //    그대로 통과해 캔버스 리듀서를 돌리고, 그 리렌더가 이 화면의 포커스를 흔든다.
    //    ⚠️ 스페이스는 막지 않는다 — 스페이스 keyup 을 삼키면 캔버스 팬 상태가 눌린 채 굳는다.
    const onKeyUp = (e: KeyboardEvent) => {
      if (isCanvasShortcut(e)) {
        e.stopPropagation();
        if (!isTypingTarget(e.target)) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [onClose, onPrev, onNext]);

  // ── 합성본 ──────────────────────────────────────────────────────────────
  // 자르기·주석이 없으면 원본 URL 이 그대로 온다(`baked === false`) → 회전은 CSS 가 한다.
  const composite = usePhotoComposite(photo, url);
  const size =
    composite.baked && composite.width !== null && composite.height !== null
      ? { width: composite.width, height: composite.height }
      : displaySize(photo);
  const shot = shotInfo(photo);

  return (
    <div className="photoScrim" role="dialog" aria-modal="true" aria-label="사진 미리보기">
      <div className="photoScrim__hit" onClick={onClose} aria-hidden="true" />
      <div className="photoView">
        <header className="photoView__head">
          <div className="photoView__titles">
            <b className="photoView__name">{photo.fileName}</b>
            <span className="photoView__meta num">
              {index + 1} / {total} · {size.width}×{size.height}
              {photo.isPrimary ? ' · 대표' : ''}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn btn--small"
            onClick={onClose}
            aria-label="닫기"
          >
            닫기
          </button>
        </header>

        <div className="photoView__stage">
          <button
            type="button"
            className="photoView__nav photoView__nav--prev"
            onClick={onPrev}
            disabled={index <= 0}
            aria-label="이전 사진"
          >
            ‹
          </button>
          {composite.url ? (
            <img
              className="photoView__img"
              src={composite.url}
              alt={photo.fileName}
              // ⭐ 합성본은 회전까지 이미 구워져 있다 — CSS 로 또 돌리면 두 번 돈다
              style={
                composite.baked ? undefined : { transform: `rotate(${photo.edits.rotate}deg)` }
              }
            />
          ) : (
            <p className="photoView__loading">사진을 불러오는 중…</p>
          )}
          {composite.pending && <span className="photoView__busy">편집 내용 적용 중…</span>}
          <button
            type="button"
            className="photoView__nav photoView__nav--next"
            onClick={onNext}
            disabled={index >= total - 1}
            aria-label="다음 사진"
          >
            ›
          </button>
        </div>

        <div className="photoView__caption">
          <label className="photoView__capLabel" htmlFor={captionId}>
            캡션
          </label>
          <input
            id={captionId}
            className="photoView__capInput"
            type="text"
            value={caption}
            maxLength={PHOTO_CAPTION_MAX}
            disabled={disabled}
            placeholder="비워 두면 결함 정보로 자동 생성됩니다"
            title="사진첩 캡션 3행을 덮어씁니다. 1행(사진 번호)·2행(위치·부재)은 그대로입니다"
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => commitCaption(photo.id, captionRef.current)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              commitCaption(photo.id, captionRef.current);
            }}
          />
          {shot !== null && (
            <span className="photoView__shot" title="사진 파일에서 읽은 촬영 정보입니다">
              {shot}
            </span>
          )}
        </div>

        <footer className="photoView__actions">
          <button
            type="button"
            className="btn btn--small"
            onClick={onSetPrimary}
            disabled={disabled || photo.isPrimary}
            title={photo.isPrimary ? '이미 대표사진입니다' : '사진첩·사진번호가 이 사진을 씁니다'}
          >
            대표로 지정
          </button>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => onRotate(-90)}
            disabled={disabled}
          >
            ⟲ 왼쪽 90°
          </button>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => onRotate(90)}
            disabled={disabled}
          >
            ⟳ 오른쪽 90°
          </button>
          <button type="button" className="btn btn--small" onClick={onReplace} disabled={disabled}>
            교체…
          </button>

          {/* R-5 · R-6 에서 편집 모드로 열린다 */}
          <button type="button" className="btn btn--small" disabled title="준비 중입니다">
            자르기 <span className="tag tag--soon">준비 중</span>
          </button>
          <button type="button" className="btn btn--small" disabled title="준비 중입니다">
            주석 <span className="tag tag--soon">준비 중</span>
          </button>

          <span className="photoView__spacer" />
          <button
            type="button"
            className="btn btn--small btn--danger"
            onClick={onRemove}
            disabled={disabled}
          >
            삭제
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── 촬영 정보 (§2-5) ───────────────────────────────────────────────────────
/**
 * `2026-08-24 14:32 · SM-S918N` — **EXIF 가 실제로 들어왔는지 눈으로 확인하는 유일한 지점이다.**
 * 값이 없는 조각은 생략하고, 둘 다 없으면 `null`(줄 자체를 안 그린다).
 */
export function shotInfo(p: Pick<Photo, 'takenAt' | 'device'>): string | null {
  const parts: string[] = [];
  const at = formatTakenAt(p.takenAt);
  if (at !== null) parts.push(at);
  const dev = (p.device ?? '').trim();
  if (dev !== '') parts.push(dev);
  return parts.length === 0 ? null : parts.join(' · ');
}

function formatTakenAt(at: number | null): string | null {
  if (at === null || !Number.isFinite(at)) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
