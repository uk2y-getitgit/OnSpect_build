/**
 * 사진 미리보기 — S5 스펙 §2-5 · T8.
 *
 * 큰 이미지(렌더본 2048) + 좌우 이동 + 썸네일 메뉴와 **같은 액션**.
 *
 * ⚠️ `[자르기]` · `[주석]` 은 **버튼만 `준비 중` 으로 자리를 잡고 구현하지 않는다** (K3 · Q33).
 *    반쪽으로 내면 잘못 자른 사진을 사용자가 복구하지 못한다.
 *    `edits.crop` · `annotations` 필드는 이미 예약돼 있어 나중 추가 비용이 0 이다.
 */
import { useEffect, useRef } from 'react';
import { displaySize, type Photo } from '@onspect/project-core';

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
    onClose,
  } = props;

  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 큰 이미지는 **열 때 비로소** 로드한다 — 목록에서 미리 열면 objectURL 이 수백 개가 된다
  useEffect(() => {
    ensureUrls([photo.renderBlobKey, photo.thumbBlobKey]);
  }, [photo.renderBlobKey, photo.thumbBlobKey, ensureUrls]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onPrev, onNext]);

  const size = displaySize(photo);

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
          {url ? (
            <img
              className="photoView__img"
              src={url}
              alt={photo.fileName}
              style={{ transform: `rotate(${photo.edits.rotate}deg)` }}
            />
          ) : (
            <p className="photoView__loading">사진을 불러오는 중…</p>
          )}
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

          {/* Q33 · K3 — 1차 범위 밖. 자리만 잡아 둔다(나중에 레이아웃이 흔들리지 않게) */}
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
