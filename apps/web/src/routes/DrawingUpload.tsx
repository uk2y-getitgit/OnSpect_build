/**
 * P4 도면 업로드 — S1 스펙 §2-8 (T8).
 *
 *   파일 선택/드롭 → 검증 · 디코드 · 래스터화 → 후보 목록 → 층 배정 → [등록]
 *
 * 리더 확정 추가 범위: **파일명에서 동·층을 뽑아 제안값으로 채운다.**
 *   · 제안이지 확정이 아니다. 표로 보여주고 사용자가 고칠 수 있다
 *   · 파싱 실패한 파일은 **빈 칸**으로 둔다. 조용히 틀린 값을 넣지 않는다
 *   · 수동 배정 경로는 그대로 남아 있다 (파싱은 그 위에 얹는 편의 기능)
 *
 * ⚠️ 도면 교체는 **결함을 지우지 않는다** (§2-8-d · 함정 #2).
 *    정규화 좌표라 해상도가 달라도 표기 위치가 유지된다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Defect } from '@onspect/canvas-core';
import {
  defaultDrawingName,
  matchBuildingByName,
  matchFloorByName,
  sortByOrder,
  type Building,
  type Drawing,
  type Floor,
} from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { makeBuilding, makeDrawing, makeFloor } from '../data/factory';
import { newBlobKey } from '../data/idb/blobs';
import { estimateStorage, requestPersistence } from '../data/idb/db';
import type { DrawingUpload as Upload } from '../data/idb/repo';
import {
  ACCEPT_ATTR,
  estimatedBytes,
  ingestFiles,
  MAX_FILES_PER_UPLOAD,
  type PageCandidate,
  type ReadyCandidate,
} from '../data/imageIngest';
import { navigate } from '../router';
import { BusyButton, Modal } from '../ui/Form';
import { useToast } from '../ui/ToastHost';

/** 아직 존재하지 않는 층. `등록` 시점에 만들어진다 */
const NEW_PREFIX = 'new:';

type Row = {
  cand: PageCandidate;
  /** 기존 층 id 또는 `new:{동}|{층}`. 빈 문자열 = 미배정 */
  target: string;
  /** 사용자가 도면 이름을 한 번이라도 고쳤는가 */
  nameTouched: boolean;
  name: string;
  /** 파일명에서 자동으로 채웠는가 (배지 표시용) */
  fromFileName: boolean;
  thumbUrl: string | null;
};

type PendingFloor = { key: string; buildingName: string | null; floorName: string };

export function DrawingUpload({ projectId, floorId }: { projectId: string; floorId: string | null }) {
  const { storage, guard, reload } = useAppData();
  const toast = useToast();

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState<PendingFloor[]>([]);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const urlsRef = useRef<string[]>([]);

  // ── 로드 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (storage.phase !== 'READY') return;
    let alive = true;
    void storage.repo.loadBundle(projectId).then((b) => {
      if (!alive || !b) return;
      setBuildings(b.buildings);
      setFloors(b.floors);
      setDrawings(b.drawings);
      setDefects(b.defects);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [storage, projectId]);

  // 미리보기 objectURL 정리 — 이 모달에서만 쓰는 것이라 닫힐 때 전부 해제한다
  useEffect(
    () => () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u);
      urlsRef.current = [];
    },
    [],
  );

  const close = useCallback(() => navigate({ name: 'SETUP', projectId }), [projectId]);

  // ── 파생 ────────────────────────────────────────────────────────────────
  const orderedBuildings = useMemo(() => sortByOrder(buildings), [buildings]);
  const buildingById = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);
  const floorById = useMemo(() => new Map(floors.map((f) => [f.id, f])), [floors]);
  const drawingByFloor = useMemo(() => {
    const m = new Map<string, Drawing>();
    for (const d of drawings) m.set(d.floorId, d);
    return m;
  }, [drawings]);
  const defectCountByFloor = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of defects) m.set(d.floorId, (m.get(d.floorId) ?? 0) + 1);
    return m;
  }, [defects]);
  const pendingByKey = useMemo(() => new Map(pending.map((p) => [p.key, p])), [pending]);

  const targetLabel = useCallback(
    (target: string): string => {
      if (target === '') return '';
      if (target.startsWith(NEW_PREFIX)) {
        const p = pendingByKey.get(target);
        return p ? p.floorName : '';
      }
      return floorById.get(target)?.name ?? '';
    },
    [pendingByKey, floorById],
  );

  const readyRows = rows.filter((r) => r.cand.status === 'READY');
  const unassigned = readyRows.filter((r) => r.target === '').length;
  const newFloorCount = new Set(
    readyRows.filter((r) => r.target.startsWith(NEW_PREFIX)).map((r) => r.target),
  ).size;
  const newBuildingNames = new Set(
    readyRows
      .filter((r) => r.target.startsWith(NEW_PREFIX))
      .map((r) => pendingByKey.get(r.target)?.buildingName)
      .filter((n): n is string => Boolean(n) && !matchBuildingByName(buildings, n!)),
  );
  const autoFilled = readyRows.filter((r) => r.fromFileName).length;
  // 같은 층에 두 장을 배정하면 어느 쪽이 남는지 알 수 없다
  const dupTargets = new Set(
    readyRows
      .map((r) => r.target)
      .filter((t, i, arr) => t !== '' && arr.indexOf(t) !== i),
  );

  const canRegister =
    readyRows.length > 0 && unassigned === 0 && dupTargets.size === 0 && !saving && !busy;

  // ── 파일 인입 ───────────────────────────────────────────────────────────
  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setBusy({ done: 0, total: files.length });
      const { candidates, droppedCount } = await ingestFiles(files, (p) =>
        setBusy({ done: p.done, total: p.total }),
      );
      setBusy(null);
      if (droppedCount > 0) {
        toast(`한 번에 ${MAX_FILES_PER_UPLOAD}장까지 올릴 수 있어 ${droppedCount}장은 제외했습니다`, {
          kind: 'warn',
        });
      }

      // 파일명 파싱 → 층 제안. **없는 층은 만들 후보로 세워 두고 화면에 보여준다**
      const nextPending: PendingFloor[] = [...pending];
      const newRows: Row[] = candidates.map((c) => {
        if (c.status !== 'READY') {
          return { cand: c, target: '', nameTouched: false, name: '', fromFileName: false, thumbUrl: null };
        }
        const url = URL.createObjectURL(c.thumbBlob);
        urlsRef.current.push(url);

        let target = '';
        let fromFileName = false;

        // 특정 층으로 들어온 경우(층 행의 [도면 올리기]) 그 층을 기본값으로 쓴다
        if (floorId && floorById.has(floorId) && candidates.length === 1) {
          target = floorId;
        } else if (c.guess.floorName) {
          const scope = c.guess.buildingName
            ? floors.filter((f) => {
                const b = buildingById.get(f.buildingId);
                return b ? matchBuildingByName([b], c.guess.buildingName!) !== null : false;
              })
            : floors;
          const hit = matchFloorByName(scope, c.guess.floorName);
          if (hit) {
            target = hit.id;
            fromFileName = true;
          } else {
            const key = `${NEW_PREFIX}${c.guess.buildingName ?? ''}|${c.guess.floorName}`;
            if (!nextPending.some((p) => p.key === key)) {
              nextPending.push({ key, buildingName: c.guess.buildingName, floorName: c.guess.floorName });
            }
            target = key;
            fromFileName = true;
          }
        } else if (floorId && floorById.has(floorId)) {
          target = floorId;
        }

        const floorName =
          target === ''
            ? ''
            : target.startsWith(NEW_PREFIX)
              ? (nextPending.find((p) => p.key === target)?.floorName ?? '')
              : (floorById.get(target)?.name ?? '');

        return {
          cand: c,
          target,
          nameTouched: false,
          name: floorName ? defaultDrawingName(floorName) : '',
          fromFileName,
          thumbUrl: url,
        };
      });

      setPending(nextPending);
      setRows((cur) => [...cur, ...newRows]);
    },
    [pending, floorId, floorById, floors, buildingById, toast],
  );

  const onPick = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      void handleFiles([...list]);
    },
    [handleFiles],
  );

  const setTarget = useCallback(
    (index: number, target: string) => {
      setRows((cur) =>
        cur.map((r, i) => {
          if (i !== index) return r;
          const label =
            target === ''
              ? ''
              : target.startsWith(NEW_PREFIX)
                ? (pendingByKey.get(target)?.floorName ?? '')
                : (floorById.get(target)?.name ?? '');
          return {
            ...r,
            target,
            fromFileName: false,
            // **사용자가 손대기 전까지는** 층을 바꾸면 도면 이름이 따라 바뀐다 (§2-8-b)
            name: r.nameTouched ? r.name : label ? defaultDrawingName(label) : '',
          };
        }),
      );
    },
    [pendingByKey, floorById],
  );

  // ── 등록 ────────────────────────────────────────────────────────────────
  const register = useCallback(async () => {
    if (storage.phase !== 'READY' || !canRegister) return;
    setSaving(true);
    setError(null);

    // 저장 여유를 **업로드 전에** 확인한다. 처리 다 하고 마지막에 실패하는 것이 최악이다 (§2-9-d)
    const need = readyRows.reduce((n, r) => n + estimatedBytes(r.cand), 0);
    const est = await estimateStorage();
    if (est && est.quota > 0 && est.quota - est.usage < need * 1.2) {
      setSaving(false);
      setError(
        `저장 공간이 부족합니다. 필요한 용량 약 ${Math.ceil(need / 1024 / 1024)}MB, 남은 용량 약 ${Math.max(
          0,
          Math.floor((est.quota - est.usage) / 1024 / 1024),
        )}MB. 다른 용역을 지우고 다시 시도해 주세요.`,
      );
      return;
    }
    // 브라우저가 용량 압박 때 데이터를 축출하는 것을 막는다. 거절돼도 앱은 그대로 동작한다
    void requestPersistence();

    const now = Date.now();
    const newBuildings: Building[] = [];
    const newFloors: Floor[] = [];
    const resolved = new Map<string, string>(); // pending key → 실제 floorId

    const workingBuildings = [...buildings];
    const workingFloors = [...floors];

    for (const p of pending) {
      if (!readyRows.some((r) => r.target === p.key)) continue;
      let building = p.buildingName ? matchBuildingByName(workingBuildings, p.buildingName) : null;
      if (!building) {
        building =
          p.buildingName === null
            ? (sortByOrder(workingBuildings)[0] ?? null)
            : null;
      }
      if (!building) {
        building = makeBuilding(
          storage.deviceId,
          projectId,
          p.buildingName ?? '본관',
          workingBuildings,
          now,
        );
        workingBuildings.push(building);
        newBuildings.push(building);
      }
      const siblings = workingFloors.filter((f) => f.buildingId === building!.id);
      const floor = makeFloor(storage.deviceId, projectId, building.id, p.floorName, siblings, now);
      workingFloors.push(floor);
      newFloors.push(floor);
      resolved.set(p.key, floor.id);
    }

    const uploads: Upload[] = [];
    for (const r of readyRows) {
      const c = r.cand as ReadyCandidate;
      const realFloorId = r.target.startsWith(NEW_PREFIX) ? resolved.get(r.target) : r.target;
      if (!realFloorId) continue;
      const floorName =
        workingFloors.find((f) => f.id === realFloorId)?.name ?? targetLabel(r.target);
      const sameBlob = c.sourceBlob === c.renderBlob;
      const renderKey = newBlobKey();
      uploads.push({
        drawing: makeDrawing(
          storage.deviceId,
          {
            projectId,
            floorId: realFloorId,
            floorName,
            name: r.name,
            source: { kind: 'IMAGE', fileName: c.fileName, mime: c.mime, byteSize: c.byteSize },
            imageWidth: c.imageWidth,
            imageHeight: c.imageHeight,
            renderBlobKey: renderKey,
            sourceBlobKey: sameBlob ? renderKey : newBlobKey(),
            thumbBlobKey: newBlobKey(),
            imgLayout: c.imgLayout,
          },
          now,
        ),
        renderBlob: c.renderBlob,
        sourceBlob: c.sourceBlob,
        thumbBlob: c.thumbBlob,
      });
    }

    const ok = await guard(async () => {
      if (newBuildings.length > 0) await storage.repo.putBuildings(newBuildings);
      if (newFloors.length > 0) await storage.repo.putFloors(newFloors);
      await storage.repo.registerDrawings(uploads);
      return true;
    });
    setSaving(false);
    if (ok !== true) {
      setError('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    reload();
    const extra =
      newFloors.length > 0
        ? ` · 층 ${newFloors.length}개를 새로 만들었습니다`
        : '';
    toast(`도면 ${uploads.length}장을 등록했습니다${extra}`);
    close();
  }, [
    storage,
    canRegister,
    readyRows,
    pending,
    buildings,
    floors,
    projectId,
    guard,
    reload,
    toast,
    close,
    targetLabel,
  ]);

  // ── 렌더 ────────────────────────────────────────────────────────────────
  const hasFloors = floors.length > 0;

  return (
    <Modal
      title="도면 올리기"
      wide
      subtitle={
        <span className="modal__hint">
          PNG · JPG · WEBP · SVG · 한 번에 {MAX_FILES_PER_UPLOAD}장까지 · 1장당 40MB
        </span>
      }
      onClose={close}
      footer={
        <>
          <span className="modal__status">
            {busy ? (
              <span role="status">
                <span className="num">{busy.total}</span>장 중{' '}
                <span className="num">{Math.min(busy.done + 1, busy.total)}</span>장 처리 중…
              </span>
            ) : unassigned > 0 ? (
              <span className="modal__warn">층을 배정해 주세요 ({unassigned}장)</span>
            ) : dupTargets.size > 0 ? (
              <span className="modal__warn">한 층에 두 장을 배정했습니다. 하나만 남겨 주세요</span>
            ) : readyRows.length > 0 ? (
              <span>
                등록할 도면 <span className="num">{readyRows.length}</span>장
                {newFloorCount > 0 && (
                  <>
                    {' '}
                    · 새로 만들 층 <span className="num">{newFloorCount}</span>개
                  </>
                )}
              </span>
            ) : null}
          </span>
          <button type="button" className="btn" onClick={close}>
            취소
          </button>
          <BusyButton busy={saving} disabled={!canRegister} onClick={() => void register()}>
            등록
          </BusyButton>
        </>
      }
    >
      {!loaded ? (
        <p className="muted">불러오는 중…</p>
      ) : (
        <>
          {!hasFloors && (
            <p className="notice notice--info">
              이 용역에는 아직 층이 없습니다. 파일명이 <b>강당-지상1층.png</b> 형식이면 동과 층을
              자동으로 만들어 배정합니다. 그렇지 않으면 먼저 용역 구성 화면에서 층을 추가해 주세요.
            </p>
          )}

          <div
            className="dropzone"
            data-active={dropActive || undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropActive(false);
              void handleFiles([...e.dataTransfer.files]);
            }}
          >
            <p className="dropzone__title">여기로 파일을 끌어다 놓으세요</p>
            <p className="dropzone__body">또는</p>
            <button type="button" className="btn btn--primary" onClick={() => inputRef.current?.click()}>
              파일 선택
            </button>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {busy && (
            <div className="progress" role="status" aria-live="polite">
              <div
                className="progress__bar"
                style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }}
              />
            </div>
          )}

          {autoFilled > 0 && (
            <p className="notice notice--ok">
              파일명에서 동 · 층을 <b className="num">{autoFilled}</b>건 채웠습니다.{' '}
              <b>확정 전에 확인해 주세요.</b>
              {newFloorCount > 0 && (
                <>
                  {' '}
                  등록하면 층 <b className="num">{newFloorCount}</b>개
                  {newBuildingNames.size > 0 && (
                    <>
                      {' '}
                      · 동 <b className="num">{newBuildingNames.size}</b>개
                    </>
                  )}
                  가 새로 만들어집니다.
                </>
              )}
            </p>
          )}

          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}

          {rows.length > 0 && (
            <ul className="candlist">
              {rows.map((r, i) => {
                if (r.cand.status === 'REJECTED') {
                  return (
                    <li key={r.cand.key} className="cand cand--rejected">
                      <span className="thumb thumb--empty" aria-hidden="true" />
                      <div className="cand__body">
                        <span className="cand__file" title={r.cand.fileName}>
                          {r.cand.fileName}
                        </span>
                        <span className="cand__reason">{r.cand.reason}</span>
                      </div>
                      <span className="badge badge--error">{r.cand.badge}</span>
                      <button
                        type="button"
                        className="iconbtn"
                        aria-label={`${r.cand.fileName} 목록에서 빼기`}
                        title="목록에서 빼기"
                        onClick={() => setRows((cur) => cur.filter((_, k) => k !== i))}
                      >
                        ✕
                      </button>
                    </li>
                  );
                }

                const c = r.cand;
                const isNew = r.target.startsWith(NEW_PREFIX);
                const existingDrawing = !isNew && r.target ? drawingByFloor.get(r.target) : undefined;
                const defectCount = !isNew && r.target ? (defectCountByFloor.get(r.target) ?? 0) : 0;

                return (
                  <li key={c.key} className="cand" data-invalid={r.target === '' || undefined}>
                    <span className="thumb">
                      {r.thumbUrl && <img src={r.thumbUrl} alt="" loading="lazy" />}
                    </span>

                    <div className="cand__body">
                      <span className="cand__file" title={c.fileName}>
                        {c.fileName}
                      </span>
                      <span className="cand__spec num">{c.sourceLabel}</span>
                    </div>

                    <div className="cand__assign">
                      <label className="cand__label" htmlFor={`floor-${c.key}`}>
                        층
                      </label>
                      <select
                        id={`floor-${c.key}`}
                        className="input input--small"
                        value={r.target}
                        aria-invalid={r.target === ''}
                        onChange={(e) => setTarget(i, e.target.value)}
                      >
                        <option value="">층 선택</option>
                        {pending
                          .filter((p) => rows.some((x) => x.target === p.key))
                          .map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.buildingName ? `${p.buildingName} · ` : ''}
                              {p.floorName} (새로 만들기)
                            </option>
                          ))}
                        {orderedBuildings.map((b) => (
                          <optgroup key={b.id} label={b.name}>
                            {sortByOrder(floors.filter((f) => f.buildingId === b.id)).map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                                {drawingByFloor.has(f.id) ? ' — 도면 있음' : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>

                      <label className="cand__label" htmlFor={`name-${c.key}`}>
                        도면 이름
                      </label>
                      <input
                        id={`name-${c.key}`}
                        className="input input--small cand__name"
                        value={r.name}
                        placeholder="층을 고르면 자동으로 채워집니다"
                        onChange={(e) =>
                          setRows((cur) =>
                            cur.map((x, k) =>
                              k === i ? { ...x, name: e.target.value, nameTouched: true } : x,
                            ),
                          )
                        }
                      />
                    </div>

                    <div className="cand__tags">
                      {r.fromFileName && (
                        <span className="badge badge--ok" title="파일명에서 자동으로 채운 값입니다">
                          파일명에서 추출
                        </span>
                      )}
                      {isNew && (
                        <span className="badge" title="등록할 때 이 층이 새로 만들어집니다">
                          새 층
                        </span>
                      )}
                      {existingDrawing && (
                        <span
                          className="badge badge--warn"
                          title={`이 층에는 이미 도면이 있습니다. 교체되며 결함 ${defectCount}건의 표기 위치는 그대로 유지됩니다`}
                        >
                          교체됨
                        </span>
                      )}
                      {dupTargets.has(r.target) && r.target !== '' && (
                        <span className="badge badge--error" title="같은 층에 두 장이 배정되었습니다">
                          중복 배정
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`${c.fileName} 목록에서 빼기`}
                      title="목록에서 빼기"
                      onClick={() => setRows((cur) => cur.filter((_, k) => k !== i))}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {readyRows.some((r) => {
            const d = !r.target.startsWith(NEW_PREFIX) && r.target ? drawingByFloor.get(r.target) : undefined;
            return Boolean(d);
          }) && (
            <p className="notice notice--warn">
              이미 도면이 있는 층은 <b>교체</b>됩니다. 결함의 표기 위치는 그대로 유지됩니다 — 도면
              해상도가 달라도 어긋나지 않습니다.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
