/**
 * 결함 사진 섹션 — S5 스펙 §2-5. 우측 결함정보 패널의 `DefectInfoForm` **아래**에 붙는다.
 *
 * 경계(**K15**): `ui/defectForm/*` 은 store·repo·캔버스를 import 하지 않는다는 규칙이 있다.
 * 사진은 Blob·objectURL 을 다뤄야 하므로 그 순수 폼 경계 안에 들어갈 수 없다.
 * 그래서 **`ui/photos/` 에 자리를 분리했다** — RN 재사용 경계를 깨지 않는다.
 *
 * PC 웹이므로 **촬영은 없다**(D1). `<input type=file multiple>` 폴더·파일 선택뿐이고,
 * 롱프레스 대신 **우클릭**을 쓴다(기획서 §2-C 가 명시적으로 허용).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasPhotoEdits, type Photo } from '@onspect/project-core';
import type { RejectedPhoto } from '../../data/photoIngest';
import { MAX_PHOTOS_PER_PICK, PHOTO_ACCEPT_ATTR } from '../../data/photoIngest';
import { PhotoPreviewDialog } from './PhotoPreviewDialog';

export type PhotoSectionProps = {
  defectId: string | null;
  photos: Photo[];
  urls: ReadonlyMap<string, string>;
  ensureUrls: (blobKeys: readonly string[]) => void;
  /** 전회차 표기 등 잠금 상태 */
  disabled: boolean;
  busy: boolean;
  /** 인입에서 거절된 파일 — 토스트가 아니라 **섹션 안 인라인 경고**로 남긴다 (§2-4) */
  rejected: readonly RejectedPhoto[];
  onClearRejected: () => void;
  onAdd: (files: File[]) => void;
  onSetPrimary: (photoId: string) => void;
  onRotate: (photoId: string, deltaDeg: number) => void;
  onReplace: (photoId: string, file: File) => void;
  onRemove: (photoId: string) => void;
  onReorder: (ids: string[]) => void;
  /** 사진첩 캡션 수동 덮어쓰기 (§2-5). 빈 값이면 `null` 이 온다 */
  onCaptionChange: (photoId: string, caption: string | null) => void;
};

type MenuState = { photoId: string; x: number; y: number } | null;

export function PhotoSection(props: PhotoSectionProps) {
  const {
    defectId,
    photos,
    urls,
    ensureUrls,
    disabled,
    busy,
    rejected,
    onClearRejected,
    onAdd,
    onSetPrimary,
    onRotate,
    onReplace,
    onRemove,
    onReorder,
    onCaptionChange,
  } = props;

  const addInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const [menu, setMenu] = useState<MenuState>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // 썸네일 URL 은 **보이는 사진만** 요청한다. 용역 전체를 미리 열면 objectURL 이 수백 개가 된다
  const thumbKeys = useMemo(() => photos.map((p) => p.thumbBlobKey), [photos]);
  useEffect(() => {
    if (thumbKeys.length > 0) ensureUrls(thumbKeys);
  }, [thumbKeys, ensureUrls]);

  // 결함이 바뀌면 열려 있던 메뉴·미리보기를 닫는다 (앞 결함의 사진을 조작하는 사고 방지)
  useEffect(() => {
    setMenu(null);
    setPreviewId(null);
  }, [defectId]);

  useEffect(() => {
    if (previewId !== null && !photos.some((p) => p.id === previewId)) setPreviewId(null);
  }, [photos, previewId]);

  const pickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일을 다시 골라도 change 가 뜨게 한다
    if (files.length > 0) onAdd(files);
  }, [onAdd]);

  const pickReplacement = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      e.target.value = '';
      const id = replaceTargetRef.current;
      replaceTargetRef.current = null;
      if (file && id) onReplace(id, file);
    },
    [onReplace],
  );

  const startReplace = useCallback((photoId: string) => {
    replaceTargetRef.current = photoId;
    replaceInputRef.current?.click();
  }, []);

  const dropOn = useCallback(
    (targetId: string) => {
      const from = dragId;
      setDragId(null);
      setOverId(null);
      if (!from || from === targetId) return;
      const ids = photos.map((p) => p.id).filter((id) => id !== from);
      const at = ids.indexOf(targetId);
      if (at < 0) return;
      ids.splice(at, 0, from);
      onReorder(ids);
    },
    [dragId, photos, onReorder],
  );

  if (!defectId) return null;

  const menuPhoto = menu ? (photos.find((p) => p.id === menu.photoId) ?? null) : null;
  const preview = previewId ? (photos.find((p) => p.id === previewId) ?? null) : null;
  const previewIndex = preview ? photos.findIndex((p) => p.id === preview.id) : -1;

  return (
    <section className="photos" aria-label="사진">
      <header className="photos__head">
        <h3 className="photos__title">
          사진 <span className="photos__count num">{photos.length}장</span>
        </h3>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => addInputRef.current?.click()}
          disabled={disabled || busy}
          title={
            disabled
              ? '전회차 표기에는 사진을 추가할 수 없습니다'
              : `파일을 골라 추가합니다 (한 번에 최대 ${MAX_PHOTOS_PER_PICK}장)`
          }
        >
          {busy ? '처리 중…' : '+ 사진 추가'}
        </button>
      </header>

      <input
        ref={addInputRef}
        type="file"
        accept={PHOTO_ACCEPT_ATTR}
        multiple
        hidden
        onChange={pickFiles}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={PHOTO_ACCEPT_ATTR}
        hidden
        onChange={pickReplacement}
      />

      {photos.length === 0 ? (
        <p className="photos__empty">
          아직 사진이 없습니다. <b>+ 사진 추가</b> 로 여러 장을 한 번에 고를 수 있습니다.
        </p>
      ) : (
        <>
          <ul className="photos__grid">
            {photos.map((p) => {
              const url = urls.get(p.thumbBlobKey) ?? null;
              return (
                <li
                  key={p.id}
                  className="photoTile"
                  data-primary={p.isPrimary ? '1' : undefined}
                  data-over={overId === p.id ? '1' : undefined}
                  data-dragging={dragId === p.id ? '1' : undefined}
                  draggable={!disabled}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    // ⚠️ `setData` 가 없으면 **Firefox 는 드래그를 시작조차 하지 않는다.**
                    //    같은 저장소의 기존 드래그 정렬(ProjectSetup · settings/parts)과 같은 모양
                    e.dataTransfer.setData('text/plain', p.id);
                    setDragId(p.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setOverId(p.id);
                  }}
                  onDragLeave={() => setOverId((cur) => (cur === p.id ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOn(p.id);
                  }}
                  onContextMenu={(e) => {
                    if (disabled) return;
                    e.preventDefault();
                    setMenu({ photoId: p.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  <button
                    type="button"
                    className="photoTile__btn"
                    onClick={() => setPreviewId(p.id)}
                    title={`${p.fileName} — 클릭하면 크게 봅니다`}
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
                  {/* R1 — 썸네일은 합성하지 않는다. 편집 여부만 알리고 합성본은 큰 창에서 본다 */}
                  {hasPhotoEdits(p) && (
                    <span className="photoTile__edited" title="자르기·주석이 적용된 사진입니다">
                      ✎
                    </span>
                  )}
                  <button
                    type="button"
                    className="photoTile__more"
                    aria-label={`${p.fileName} 메뉴`}
                    disabled={disabled}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenu({ photoId: p.id, x: r.left, y: r.bottom + 4 });
                    }}
                  >
                    ⋯
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="photos__hint">
            드래그로 순서 변경 · 우클릭(또는 <b>⋯</b>)으로 메뉴 · 클릭하면 크게 보기
          </p>
        </>
      )}

      {rejected.length > 0 && (
        <div className="photos__rejects" role="status">
          <div className="photos__rejectsHead">
            <b>{rejected.length}개 파일을 등록하지 못했습니다</b>
            <button type="button" className="btn btn--ghost btn--small" onClick={onClearRejected}>
              닫기
            </button>
          </div>
          <ul>
            {rejected.map((r) => (
              <li key={r.key}>
                <span className="photos__rejectBadge">{r.badge}</span> {r.fileName} — {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {menu && menuPhoto && (
        <PhotoMenu
          x={menu.x}
          y={menu.y}
          isPrimary={menuPhoto.isPrimary}
          onClose={() => setMenu(null)}
          onSetPrimary={() => onSetPrimary(menuPhoto.id)}
          onRotateLeft={() => onRotate(menuPhoto.id, -90)}
          onRotateRight={() => onRotate(menuPhoto.id, 90)}
          onReplace={() => startReplace(menuPhoto.id)}
          onRemove={() => onRemove(menuPhoto.id)}
        />
      )}

      {preview && (
        <PhotoPreviewDialog
          photo={preview}
          index={previewIndex}
          total={photos.length}
          url={urls.get(preview.renderBlobKey) ?? urls.get(preview.thumbBlobKey) ?? null}
          ensureUrls={ensureUrls}
          disabled={disabled}
          onPrev={() => {
            const i = previewIndex - 1;
            if (i >= 0) setPreviewId(photos[i]!.id);
          }}
          onNext={() => {
            const i = previewIndex + 1;
            if (i < photos.length) setPreviewId(photos[i]!.id);
          }}
          onSetPrimary={() => onSetPrimary(preview.id)}
          onRotate={(delta) => onRotate(preview.id, delta)}
          onReplace={() => startReplace(preview.id)}
          onRemove={() => {
            onRemove(preview.id);
            setPreviewId(null);
          }}
          onCaptionChange={onCaptionChange}
          onClose={() => setPreviewId(null)}
        />
      )}
    </section>
  );
}

// ── 썸네일 메뉴 ────────────────────────────────────────────────────────────

function PhotoMenu({
  x,
  y,
  isPrimary,
  onClose,
  onSetPrimary,
  onRotateLeft,
  onRotateRight,
  onReplace,
  onRemove,
}: {
  x: number;
  y: number;
  isPrimary: boolean;
  onClose: () => void;
  onSetPrimary: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 다음 틱부터 듣는다 — 메뉴를 연 그 클릭이 곧바로 닫아 버리는 것을 막는다
    const h = window.setTimeout(() => {
      window.addEventListener('pointerdown', close);
      window.addEventListener('blur', close);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(h);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      className="menu photoMenu"
      style={{
        position: 'fixed',
        left: Math.max(8, Math.min(x, window.innerWidth - 180)),
        top: Math.max(8, Math.min(y, window.innerHeight - 200)),
      }}
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="menu__item"
        onClick={run(onSetPrimary)}
        disabled={isPrimary}
      >
        대표로 지정
      </button>
      <button type="button" role="menuitem" className="menu__item" onClick={run(onRotateLeft)}>
        왼쪽 90° 회전
      </button>
      <button type="button" role="menuitem" className="menu__item" onClick={run(onRotateRight)}>
        오른쪽 90° 회전
      </button>
      <button type="button" role="menuitem" className="menu__item" onClick={run(onReplace)}>
        교체…
      </button>
      <div className="menu__sep" />
      <button
        type="button"
        role="menuitem"
        className="menu__item menu__item--danger"
        onClick={run(onRemove)}
      >
        삭제
      </button>
    </div>
  );
}
