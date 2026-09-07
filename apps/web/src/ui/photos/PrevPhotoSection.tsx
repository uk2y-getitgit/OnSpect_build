/**
 * 전차 사진 조회 — D47(Q81) · UserFeedback0907 #6.
 *
 * 전차(`PREV_PENDING`) 결함을 보고 있을 때, `defect.prevDefectId` 가 가리키는
 * **전회차 결함의 사진**을 읽기 전용으로 보여준다.
 *
 * ⭐ **Blob 을 복제하지 않는다** (D47 B안). 새 회차 프로젝트에 사진 레코드를 만들지 않고,
 *    그때그때 원본 프로젝트에서 찾아 보여주기만 한다 — 저장 공간이 늘지 않고, 원본이
 *    이 기기에 남아 있는 한 항상 최신을 보여준다.
 *
 * ⭐ **원본이 없으면 조용히 사라진다.** 다른 기기에서 승계됐거나 전회차 용역을 지웠으면
 *    사진 조회 결과가 0장이고, 그때는 섹션 자체를 그리지 않는다 — 에러도 경고도 없다.
 *    "참조 공유" 의 당연한 트레이드오프라 사용자에게 사고처럼 보이면 안 된다.
 *
 * ⭐ **편집 경로가 하나도 없다.** 삭제·회전·자르기·대표지정·캡션·순서변경 어느 것도
 *    붙이지 않는다. 여기서 고칠 수 있게 만드는 순간 **다른 용역의 데이터**를 이 화면에서
 *    건드리게 된다. 크게 보기(읽기 전용)까지가 전부다.
 *
 * `prevDefectId` 로 찾는 조회는 `photos` 스토어의 **기존 `by_defect` 인덱스**를 그대로 쓴다
 * (`repo.listPhotosOfDefect`). 새 인덱스도, `DB_VERSION` 인상도 없다.
 */
import { useCallback, useEffect, useState } from 'react';
import { hasPhotoEdits, type Photo } from '@onspect/project-core';
import { useRepo } from '../../data/appData';
import { usePhotoComposite } from '../../data/usePhotoComposite';

/** 빈 목록은 **같은 참조**로 — 매번 새 `[]` 를 만들면 우측 패널이 계속 다시 그려진다 */
const NO_PHOTOS: Photo[] = [];

export type PrevPhotoSectionProps = {
  /** 지금 보고 있는(금차) 결함 id. 바뀌면 열려 있던 크게보기를 닫는다 */
  defectId: string | null;
  /** 전회차 결함 id. `null` 이면 이 섹션은 존재하지 않는다 */
  prevDefectId: string | null;
  urls: ReadonlyMap<string, string>;
  ensureUrls: (blobKeys: readonly string[]) => void;
};

export function PrevPhotoSection({
  defectId,
  prevDefectId,
  urls,
  ensureUrls,
}: PrevPhotoSectionProps) {
  const repo = useRepo();
  const [photos, setPhotos] = useState<Photo[]>(NO_PHOTOS);
  const [viewId, setViewId] = useState<string | null>(null);

  useEffect(() => {
    setPhotos(NO_PHOTOS);
    setViewId(null);
    if (!prevDefectId || !repo) return;
    let alive = true;
    void repo
      .listPhotosOfDefect(prevDefectId)
      .then((rows) => {
        if (alive) setPhotos(rows.length === 0 ? NO_PHOTOS : rows);
      })
      // 원본이 이 기기에 없다 — 사고가 아니라 정상 상태다. 조용히 빈 채로 둔다
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [prevDefectId, repo]);

  // 결함을 옮기면 앞 결함의 사진이 큰 창에 남아 있으면 안 된다
  useEffect(() => {
    setViewId(null);
  }, [defectId]);

  // 썸네일은 **보이는 것만** 연다. 큰 이미지는 크게보기를 열 때 비로소 연다
  useEffect(() => {
    if (photos.length > 0) ensureUrls(photos.map((p) => p.thumbBlobKey));
  }, [photos, ensureUrls]);

  const close = useCallback(() => setViewId(null), []);

  if (!prevDefectId || photos.length === 0) return null;

  const viewing = viewId ? (photos.find((p) => p.id === viewId) ?? null) : null;
  const viewIndex = viewing ? photos.findIndex((p) => p.id === viewing.id) : -1;

  return (
    <section className="photos photos--prev" aria-label="전차 사진">
      <header className="photos__head">
        <h3 className="photos__title">
          전차 사진 <span className="photos__count num">{photos.length}장</span>
          <span className="photos__ro">보기 전용</span>
        </h3>
      </header>

      <ul className="photos__grid">
        {photos.map((p) => {
          const url = urls.get(p.thumbBlobKey) ?? null;
          return (
            <li key={p.id} className="photoTile" data-primary={p.isPrimary ? '1' : undefined}>
              <button
                type="button"
                className="photoTile__btn"
                onClick={() => setViewId(p.id)}
                title={`${p.fileName} — 클릭하면 크게 봅니다 (전회차 사진, 수정 불가)`}
              >
                {url ? (
                  <img
                    className="photoTile__img"
                    src={url}
                    alt={p.fileName}
                    style={{ transform: `rotate(${p.edits.rotate}deg)` }}
                    draggable={false}
                  />
                ) : (
                  <span className="photoTile__ph" aria-hidden="true" />
                )}
              </button>
              {p.isPrimary && <span className="photoTile__badge">대표</span>}
              {/* R1 과 같은 규율 — 썸네일은 합성하지 않고 배지만 띄운다. 합성본은 큰 창에서 본다 */}
              {hasPhotoEdits(p) && (
                <span className="photoTile__edited" title="자르기·주석이 적용된 사진입니다">
                  ✎
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="photos__hint">
        전회차 용역의 사진입니다. 여기서는 <b>보기만</b> 됩니다 — 전회차 용역을 이 기기에서
        지우면 함께 보이지 않습니다.
      </p>

      {viewing && (
        <PrevPhotoViewer
          photo={viewing}
          index={viewIndex}
          total={photos.length}
          url={urls.get(viewing.renderBlobKey) ?? urls.get(viewing.thumbBlobKey) ?? null}
          ensureUrls={ensureUrls}
          onPrev={() => {
            const i = viewIndex - 1;
            if (i >= 0) setViewId(photos[i]!.id);
          }}
          onNext={() => {
            const i = viewIndex + 1;
            if (i < photos.length) setViewId(photos[i]!.id);
          }}
          onClose={close}
        />
      )}
    </section>
  );
}

/**
 * 전차 사진 크게보기 — **읽기 전용 전용 창**이다.
 *
 * `PhotoPreviewDialog` 를 재사용하지 않는다: 그 창은 캡션 입력·자르기·주석 편집을
 * 품고 있어서, 여기 붙이면 **다른 용역의 사진을 이 화면에서 고칠 수 있는 길**이 생긴다.
 * 잠금 prop 하나로 막는 것보다 편집 코드가 아예 없는 편이 안전하다.
 */
function PrevPhotoViewer({
  photo,
  index,
  total,
  url,
  ensureUrls,
  onPrev,
  onNext,
  onClose,
}: {
  photo: Photo;
  index: number;
  total: number;
  url: string | null;
  ensureUrls: (blobKeys: readonly string[]) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  // 큰 이미지는 **열 때 비로소** 로드한다 — 목록에서 미리 열면 objectURL 이 수백 개가 된다
  useEffect(() => {
    ensureUrls([photo.renderBlobKey, photo.thumbBlobKey]);
  }, [photo.renderBlobKey, photo.thumbBlobKey, ensureUrls]);

  // 전회차에서 지정한 자르기·주석까지 그대로 보여준다 — 읽기 전용 훅이라 아무것도 저장하지 않는다.
  // `baked` 면 회전이 이미 구워져 있으므로 CSS rotate 를 또 걸면 두 번 돈다
  const composite = usePhotoComposite(photo, url);

  // 캔버스가 window 에서 가로채는 방향키·Esc 를 이 창이 떠 있는 동안 먼저 먹는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.stopPropagation();
        onPrev();
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onPrev, onNext]);

  return (
    // 스크림 클릭으로 닫는다 — 여기엔 잃을 입력이 하나도 없다(U32 의 옵트인 조건 충족)
    <div className="modal-scrim" onPointerDown={onClose}>
      <div
        className="modal modal--wide prevphoto"
        role="dialog"
        aria-modal="true"
        aria-label={`전차 사진 ${index + 1} / ${total}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2 className="modal__title">
            전차 사진 <span className="num">{index + 1} / {total}</span>
          </h2>
          <div className="modal__subtitle">{photo.fileName}</div>
          <button type="button" className="iconbtn modal__x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="prevphoto__stage">
          {composite.url ? (
            <img
              className="prevphoto__img"
              src={composite.url}
              alt={photo.fileName}
              style={
                composite.baked ? undefined : { transform: `rotate(${photo.edits.rotate}deg)` }
              }
              draggable={false}
            />
          ) : (
            <p className="prevphoto__ph">사진을 불러오는 중…</p>
          )}
        </div>
        <div className="modal__actions">
          <button type="button" className="btn" disabled={index <= 0} onClick={onPrev}>
            ← 이전
          </button>
          <button type="button" className="btn" disabled={index >= total - 1} onClick={onNext}>
            다음 →
          </button>
          <span className="modal__status">전회차 사진입니다 — 여기서는 수정할 수 없습니다</span>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
