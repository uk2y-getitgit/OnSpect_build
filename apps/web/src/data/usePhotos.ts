/**
 * 사진 상태 · 조작 — S5 스펙 §2-5. 화면(`ui/photos/*`)과 저장소를 잇는 한 곳.
 *
 * 규칙:
 *   · **로컬 우선**(불변식 #3). 조작은 곧바로 메모리 상태에 반영되고 저장은 뒤따라간다.
 *     UI 가 저장 완료를 기다리지 않는다
 *   · **불변식 #8 은 읽기 정규화로 강제한다**(K16). `photosOf()` 가 항상
 *     `normalizePhotos` 를 통과한 목록을 준다 — 대표 정확히 1장
 *   · **삭제는 되돌리기 토스트 10초**(D10 과 같은 규칙). Blob 실삭제는 창이 닫힌 뒤에 한다.
 *     그래서 되돌리기가 저장소를 다시 쓰지 않는다 — 레코드가 아직 그대로 있다
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  groupPhotosByDefect,
  normalizePhotos,
  removePhoto as removeFromList,
  reorderPhotos as reorderList,
  rotatePhoto,
  setPhotoAnnotations,
  setPhotoCaption,
  setPhotoCrop,
  setPrimary as setPrimaryInList,
  type Photo,
  type PhotoAnnotation,
  type PhotoEdits,
} from '@onspect/project-core';
import { useAppData } from './appData.js';
import {
  ingestPhotos,
  toPhotoUploads,
  type RejectedPhoto,
} from './photoIngest.js';

/** 되돌리기 창. 이 시간이 지나야 Blob 이 실제로 지워진다 */
export const PHOTO_UNDO_MS = 10_000;

const NO_PHOTOS: Photo[] = [];

export type PhotoToast = (
  text: string,
  opts?: { kind?: 'info' | 'warn'; action?: { label: string; run: () => void }; ttl?: number },
) => void;

export type PhotoOps = {
  /** 이 결함의 사진 — **정규화된 목록**(대표 정확히 1장) */
  photosOf: (defectId: string | null) => Photo[];
  /** 대표사진이 있는 결함 id 집합 — `assignNumbers(…, { hasPhoto })` 에 그대로 넣는다 */
  defectsWithPhoto: ReadonlySet<string>;
  /** 사진 총 장수 */
  count: number;
  urls: ReadonlyMap<string, string>;
  ensureUrls: (blobKeys: readonly string[]) => void;
  busy: boolean;
  /** 인입에서 거절된 파일 — 토스트가 아니라 섹션 안 인라인 경고로 보여준다 (§2-4) */
  rejected: RejectedPhoto[];
  clearRejected: () => void;

  /**
   * 고른 파일을 이 결함에 붙인다.
   *
   * **실제로 등록된 장수를 돌려준다** (0 이면 아무것도 안 붙었다 — 전부 거절됐거나
   * 저장소를 못 썼거나). G-8(T-7) 이 이 값을 보고 `PREV_PENDING → CURRENT` 전이를
   * 결정한다 — "성공했을 때만" 이라는 조건을 호출자가 알 방법이 이것뿐이다.
   */
  addFiles: (defectId: string, files: readonly File[]) => Promise<number>;
  replaceFile: (photoId: string, file: File) => Promise<void>;
  setPrimary: (defectId: string, photoId: string) => void;
  rotate: (photoId: string, deltaDeg: number) => void;
  remove: (photoId: string) => void;
  reorder: (defectId: string, ids: readonly string[]) => void;

  // ── 비파괴 보정 (PhotoPolish §2-3 · §2-4 · §2-5) ─────────────────────────
  // 셋 다 `project-core` 의 순수 setter 를 그대로 통과시킨다. 좌표 규약(렌더 프레임 정규화)은
  // **편집기가 저장 직전에 이미 되돌려 놓고** 넘긴다 — 여기서 변환하지 않는다.
  /** 사진첩 캡션 수동 덮어쓰기. 빈 문자열은 setter 가 `null` 로 정규화한다 */
  setCaption: (photoId: string, caption: string | null) => void;
  /** 자르기 지정·해제 (렌더 프레임 0~1 정규화) */
  setCrop: (photoId: string, crop: PhotoEdits['crop']) => void;
  /** 주석 통째 교체 (렌더 프레임 0~1 정규화) */
  setAnnotations: (photoId: string, annotations: readonly PhotoAnnotation[]) => void;
};

export function usePhotos(
  projectId: string,
  initial: readonly Photo[],
  toast: PhotoToast,
): PhotoOps {
  const { storage, guard } = useAppData();
  const [photos, setPhotos] = useState<Photo[]>(() => [...initial]);
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<RejectedPhoto[]>([]);

  useEffect(() => {
    setPhotos([...initial]);
  }, [initial]);

  /** 콜백이 최신 목록을 보게 한다 (토스트의 `[되돌리기]` 는 한참 뒤에 눌린다) */
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // ── 되돌리기 대기 중인 삭제 ─────────────────────────────────────────────
  // 창이 닫힐 때 비로소 저장소에서 지운다. 화면을 벗어나면 즉시 확정한다 —
  // 안 그러면 새로고침 뒤에 지운 사진이 되살아난다
  const pendingRef = useRef(new Map<string, number>());
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const guardRef = useRef(guard);
  guardRef.current = guard;

  const commitDelete = useCallback((ids: readonly string[]) => {
    if (ids.length === 0) return;
    const s = storageRef.current;
    if (s.phase !== 'READY') return;
    void guardRef.current(() => s.repo.deletePhotos(ids));
  }, []);

  /** 대기 중인 삭제를 지금 확정한다 (화면 이탈 · 탭 닫기) */
  const flushPendingDeletes = useCallback(() => {
    const pending = pendingRef.current;
    if (pending.size === 0) return;
    for (const h of pending.values()) window.clearTimeout(h);
    const ids = [...pending.keys()];
    pending.clear();
    commitDelete(ids);
  }, [commitDelete]);

  useEffect(() => {
    // 10초를 못 기다리고 탭을 닫아도 지운 사진이 되살아나지 않게 한다
    window.addEventListener('beforeunload', flushPendingDeletes);
    return () => {
      window.removeEventListener('beforeunload', flushPendingDeletes);
      flushPendingDeletes();
    };
  }, [flushPendingDeletes]);

  // ── 파생 ────────────────────────────────────────────────────────────────
  const byDefect = useMemo(() => groupPhotosByDefect(photos), [photos]);

  const photosOf = useCallback(
    // 빈 배열도 **같은 참조**를 준다 — 매번 새 `[]` 를 주면 사진이 없는 결함에서
    // 우측 패널이 무한히 다시 그려진다
    (defectId: string | null): Photo[] =>
      (defectId ? (byDefect.get(defectId) ?? NO_PHOTOS) : NO_PHOTOS),
    [byDefect],
  );

  const defectsWithPhoto = useMemo(() => {
    const s = new Set<string>();
    for (const [defectId, list] of byDefect) if (list.length > 0) s.add(defectId);
    return s;
  }, [byDefect]);

  // ── objectURL ───────────────────────────────────────────────────────────
  const pendingUrlRef = useRef(new Set<string>());

  const ensureUrls = useCallback(
    (blobKeys: readonly string[]) => {
      const s = storageRef.current;
      if (s.phase !== 'READY') return;
      const want = blobKeys.filter((k) => k && !pendingUrlRef.current.has(k));
      if (want.length === 0) return;
      for (const k of want) pendingUrlRef.current.add(k);
      void (async () => {
        const found: [string, string][] = [];
        for (const k of want) {
          const u = await s.repo.objectUrl(k, projectId);
          if (u) found.push([k, u]);
          else pendingUrlRef.current.delete(k); // 다음에 다시 시도할 수 있게
        }
        if (found.length === 0) return;
        setUrls((cur) => {
          const next = new Map(cur);
          for (const [k, u] of found) next.set(k, u);
          return next;
        });
      })();
    },
    [projectId],
  );

  // ── 쓰기 헬퍼 ───────────────────────────────────────────────────────────
  /** 메모리 먼저, 저장은 뒤따라간다 */
  const persist = useCallback((changed: readonly Photo[]) => {
    if (changed.length === 0) return;
    const s = storageRef.current;
    if (s.phase !== 'READY') return;
    void guardRef.current(() => s.repo.upsertPhotos(changed));
  }, []);

  /**
   * 한 결함의 목록을 통째로 갈아끼우고 **실제로 바뀐 레코드만** 저장한다.
   * ⚠️ 저장(부수효과)을 `setPhotos` 업데이터 **안에서** 하지 않는다 —
   *    StrictMode 가 업데이터를 두 번 부르면 같은 쓰기가 두 번 나간다.
   */
  const applyList = useCallback(
    (defectId: string, next: readonly Photo[]) => {
      const prevById = new Map(
        photosRef.current.filter((p) => p.defectId === defectId).map((p) => [p.id, p]),
      );
      persist(next.filter((p) => prevById.get(p.id) !== p));
      setPhotos((cur) => [...cur.filter((p) => p.defectId !== defectId), ...next]);
    },
    [persist],
  );

  // ── 조작 ────────────────────────────────────────────────────────────────
  const addFiles = useCallback(
    async (defectId: string, files: readonly File[]): Promise<number> => {
      const s = storageRef.current;
      if (files.length === 0) return 0;
      if (s.phase !== 'READY') {
        toast('저장소를 쓸 수 없어 사진을 추가하지 못했습니다', { kind: 'warn' });
        return 0;
      }
      setBusy(true);
      setRejected([]);
      try {
        const result = await ingestPhotos(files);
        if (result.droppedCount > 0) {
          toast(`한 번에 최대 50장까지 올릴 수 있어 ${result.droppedCount}장을 제외했습니다`, {
            kind: 'warn',
          });
        }
        setRejected(result.rejected);
        if (result.ready.length === 0) return 0;

        const existing = photosOf(defectId);
        const uploads = toPhotoUploads(result.ready, {
          projectId,
          defectId,
          deviceId: s.deviceId,
          existing,
        });
        const ok = await guardRef.current(() => s.repo.registerPhotos(uploads));
        if (ok === null) return 0; // 실패는 지속 배너가 알린다
        const added = uploads.map((u) => u.photo);
        setPhotos((cur) => [...cur, ...added]);
        toast(`사진 ${added.length}장을 추가했습니다`);
        return added.length;
      } finally {
        setBusy(false);
      }
    },
    [projectId, photosOf, toast],
  );

  const replaceFile = useCallback(
    async (photoId: string, file: File) => {
      const s = storageRef.current;
      if (s.phase !== 'READY') return;
      const old = photosRef.current.find((p) => p.id === photoId);
      if (!old) return;
      setBusy(true);
      setRejected([]);
      try {
        const result = await ingestPhotos([file]);
        setRejected(result.rejected);
        const ready = result.ready[0];
        if (!ready) return;

        // 새 레코드가 옛 자리(순서·대표)를 그대로 물려받는다 — 목록이 튀지 않는다
        const [upload] = toPhotoUploads([ready], {
          projectId,
          defectId: old.defectId,
          deviceId: s.deviceId,
          existing: [],
        });
        if (!upload) return;
        const next = {
          ...upload.photo,
          sortOrder: old.sortOrder,
          isPrimary: old.isPrimary,
          caption: old.caption,
        };
        const ok = await guardRef.current(async () => {
          await s.repo.registerPhotos([{ ...upload, photo: next }]);
          // 교체는 되돌리기를 두지 않는다 — 새 파일을 고른 것 자체가 확정 의사다
          await s.repo.deletePhotos([photoId]);
          return true;
        });
        if (ok === null) return;
        setPhotos((cur) => [...cur.filter((p) => p.id !== photoId), next]);
        toast('사진을 교체했습니다');
      } finally {
        setBusy(false);
      }
    },
    [projectId, toast],
  );

  const setPrimary = useCallback(
    (defectId: string, photoId: string) => {
      applyList(defectId, setPrimaryInList(photosOf(defectId), photoId));
    },
    [applyList, photosOf],
  );

  /**
   * 사진 1장을 순수 setter 로 갈아끼운다. **바뀐 것이 없으면 아무 일도 하지 않는다** —
   * `project-core` 의 setter 가 같은 객체를 돌려주므로 불필요한 저장·리렌더가 생기지 않는다.
   */
  const editOne = useCallback(
    (photoId: string, fn: (p: Photo) => Photo) => {
      const target = photosRef.current.find((p) => p.id === photoId);
      if (!target) return;
      const next = fn(target);
      if (next === target) return;
      persist([next]);
      setPhotos((cur) => cur.map((p) => (p.id === photoId ? next : p)));
    },
    [persist],
  );

  const rotate = useCallback(
    (photoId: string, deltaDeg: number) => {
      editOne(photoId, (p) => rotatePhoto(p, deltaDeg));
    },
    [editOne],
  );

  const setCaption = useCallback(
    (photoId: string, caption: string | null) => {
      editOne(photoId, (p) => setPhotoCaption(p, caption));
    },
    [editOne],
  );

  const setCrop = useCallback(
    (photoId: string, crop: PhotoEdits['crop']) => {
      editOne(photoId, (p) => setPhotoCrop(p, crop));
    },
    [editOne],
  );

  const setAnnotations = useCallback(
    (photoId: string, annotations: readonly PhotoAnnotation[]) => {
      editOne(photoId, (p) => setPhotoAnnotations(p, annotations));
    },
    [editOne],
  );

  const reorder = useCallback(
    (defectId: string, ids: readonly string[]) => {
      applyList(defectId, reorderList(photosOf(defectId), ids));
    },
    [applyList, photosOf],
  );

  const remove = useCallback(
    (photoId: string) => {
      const target = photosRef.current.find((p) => p.id === photoId);
      if (!target) return;
      const defectId = target.defectId;

      // 화면에서 먼저 지운다. **대표를 지우면 다음 장이 자동 승계된다**(normalizePhotos)
      const before = normalizePhotos(photosRef.current.filter((p) => p.defectId === defectId));
      applyList(defectId, removeFromList(before, photoId));

      // ⭐ Blob 실삭제는 **되돌리기 창이 닫힌 뒤**에 한다.
      //    그래서 되돌리기가 저장소를 다시 쓸 필요가 없다 — 레코드가 아직 그대로다
      const timer = window.setTimeout(() => {
        pendingRef.current.delete(photoId);
        commitDelete([photoId]);
      }, PHOTO_UNDO_MS);
      pendingRef.current.set(photoId, timer);

      toast('사진 1장을 삭제했습니다', {
        ttl: PHOTO_UNDO_MS,
        action: {
          label: '되돌리기',
          run: () => {
            const h = pendingRef.current.get(photoId);
            if (h === undefined) return; // 이미 확정됐다 — 되살릴 것이 없다
            window.clearTimeout(h);
            pendingRef.current.delete(photoId);
            const now = photosRef.current.filter((p) => p.defectId === defectId);
            if (now.some((p) => p.id === photoId)) return;
            applyList(defectId, normalizePhotos([...now, target]));
          },
        },
      });
    },
    [applyList, commitDelete, toast],
  );

  return {
    photosOf,
    defectsWithPhoto,
    count: photos.length,
    urls,
    ensureUrls,
    busy,
    rejected,
    clearRejected: useCallback(() => setRejected([]), []),
    addFiles,
    replaceFile,
    setPrimary,
    rotate,
    remove,
    reorder,
    setCaption,
    setCrop,
    setAnnotations,
  };
}
