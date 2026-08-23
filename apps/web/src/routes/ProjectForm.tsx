/**
 * P2 용역 만들기 / 이름·정보 수정 — S1 스펙 §2-5 (T5) + 이전 회차 연결 (T12).
 *
 * 표시명은 **저장하지 않는다.** 4필드에서 매번 파생한다 (ASSUMPTIONS S1·D6).
 * 그래서 폼 위의 미리보기와 목록의 표기가 어긋날 수 없다 — 같은 함수 하나를 쓴다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_BUILDING_NAME,
  defaultHalf,
  findDuplicate,
  formatDisplayName,
  HALF_LABEL,
  HALF_OPTIONS,
  KIND_LABEL,
  KIND_OPTIONS,
  normalizeName,
  projectDisplayName,
  PROJECT_NAME_MAX,
  validateProjectName,
  validateYear,
  wouldCycle,
  type CopyStructureResult,
  type InspectionHalf,
  type InspectionKind,
  type Project,
} from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { makeBuilding, makeProject } from '../data/factory';
import { navigate } from '../router';
import { BusyButton, Field, Modal } from '../ui/Form';
import { ConfirmDialog } from '../ui/Overlays';
import { useToast } from '../ui/ToastHost';

type Draft = {
  year: string;
  half: InspectionHalf;
  kind: InspectionKind;
  name: string;
  prevProjectId: string;
  copyStructure: boolean;
  /** F7 — S1 의 결정을 뒤집는다. 결함까지 가져오면 status=PREV_PENDING(보라)으로 들어간다 */
  copyDefects: boolean;
};

export function ProjectForm({ projectId }: { projectId: string | null }) {
  const { storage, guard, reload } = useAppData();
  const toast = useToast();
  const editing = projectId !== null;

  const [draft, setDraft] = useState<Draft>(() => ({
    year: String(new Date().getFullYear()),
    half: defaultHalf(new Date()),
    kind: 'REGULAR',
    name: '',
    prevProjectId: '',
    copyStructure: false,
    copyDefects: false,
  }));
  const [others, setOthers] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [loaded, setLoaded] = useState(!editing);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<{ year: boolean; name: boolean }>({ year: false, name: false });
  const [dupConfirm, setDupConfirm] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ── 로드 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (storage.phase !== 'READY') return;
    let alive = true;
    void (async () => {
      const list = await storage.repo.listProjects();
      if (!alive) return;
      setOthers(list.filter((p) => p.id !== projectId));
      if (!editing) {
        setLoaded(true);
        return;
      }
      const p = await storage.repo.getProject(projectId!);
      if (!alive) return;
      if (!p || p.deletedAt !== null) {
        setNotFound(true);
        return;
      }
      setCurrent(p);
      setDraft({
        year: String(p.year),
        half: p.half,
        kind: p.kind,
        name: p.name,
        prevProjectId: p.prevProjectId ?? '',
        copyStructure: false,
        copyDefects: false,
      });
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [storage, projectId, editing]);

  // 없는 id → 목록으로 튕기고 토스트 (§2-2)
  useEffect(() => {
    if (!notFound) return;
    toast('해당 용역을 찾을 수 없습니다', { kind: 'warn' });
    navigate({ name: 'LIST' });
  }, [notFound, toast]);

  // ── 검증 ────────────────────────────────────────────────────────────────
  const yearCheck = validateYear(draft.year);
  const nameCheck = validateProjectName(draft.name);
  const yearError = touched.year && !yearCheck.ok ? yearCheck.message : null;
  const nameError = touched.name && !nameCheck.ok ? nameCheck.message : null;
  const canSave = yearCheck.ok && nameCheck.ok && !saving;

  const preview = useMemo(
    () => formatDisplayName(Number(draft.year) || new Date().getFullYear(), draft.half, draft.name, draft.kind),
    [draft.year, draft.half, draft.name, draft.kind],
  );

  /** 같은 용역명을 가진 용역을 위로 올려 추천한다 (§2-13) */
  const prevOptions = useMemo(() => {
    const key = normalizeName(draft.name);
    const prevOf = (id: string) => others.find((p) => p.id === id)?.prevProjectId ?? null;
    const usable = others.filter((p) => !editing || !wouldCycle(projectId!, p.id, prevOf));
    return [...usable].sort((a, b) => {
      const am = normalizeName(a.name) === key ? 0 : 1;
      const bm = normalizeName(b.name) === key ? 0 : 1;
      return am !== bm ? am - bm : b.year - a.year;
    });
  }, [others, draft.name, editing, projectId]);

  const close = useCallback(() => {
    if (editing && projectId) navigate({ name: 'SETUP', projectId });
    else navigate({ name: 'LIST' });
  }, [editing, projectId]);

  // ── 저장 ────────────────────────────────────────────────────────────────
  const doSave = useCallback(async () => {
    if (storage.phase !== 'READY' || !canSave) return;
    setSaving(true);
    const year = Number(draft.year);
    const name = normalizeName(draft.name);
    const prevId = draft.prevProjectId === '' ? null : draft.prevProjectId;

    if (editing && current) {
      const next: Project = { ...current, year, half: draft.half, kind: draft.kind, name, prevProjectId: prevId };
      const r = await guard(() => storage.repo.putProject(next));
      setSaving(false);
      if (r === null) return;
      reload();
      toast('용역 정보를 저장했습니다');
      navigate({ name: 'SETUP', projectId: current.id });
      return;
    }

    const p = makeProject(storage.deviceId, {
      year,
      half: draft.half,
      kind: draft.kind,
      name,
      prevProjectId: prevId,
    });
    let copied: CopyStructureResult | null = null;
    const committed = await guard(async () => {
      await storage.repo.putProject(p);
      // 항목설정 스냅샷 (불변식 #7) — **생성 시점의 기본값**을 이 용역에 고정한다.
      // 이후 기본값이 바뀌어도 이 용역의 보고서 용어는 흔들리지 않는다 (D6)
      await storage.repo.ensureProjectSettings(p.id);
      if (prevId && draft.copyStructure) {
        copied = await storage.repo.copyStructure(prevId, p.id, {
          includeDefects: draft.copyDefects,
        });
      } else {
        // **동 1개만 있는 건물이 대다수다.** 빈 화면 장벽을 없앤다 (§2-6)
        await storage.repo.putBuildings([
          makeBuilding(storage.deviceId, p.id, DEFAULT_BUILDING_NAME, []),
        ]);
      }
      return true;
    });
    setSaving(false);
    if (committed !== true) return;
    reload();
    if (copied) {
      const c: CopyStructureResult = copied;
      const base = `동 ${c.buildings}개 · 층 ${c.floors}개 · 도면 ${c.drawings}장을 복사했습니다.`;
      // F7 — 결함까지 가져왔으면 전회차(보라)로 들어갔다는 것을 알린다
      const tail =
        draft.copyDefects && c.defects > 0
          ? ` 결함 ${c.defects}건을 전회차로 가져왔습니다.`
          : ' 결함은 복사되지 않았습니다.';
      toast(base + tail, { ttl: 6000 });
    }
    // 저장 직후는 P3 다. 목록으로 되돌아가지 않는다 — 다음 할 일이 동 구성이다 (§2-3)
    navigate({ name: 'SETUP', projectId: p.id });
  }, [storage, canSave, draft, editing, current, guard, reload, toast]);

  const onSubmit = useCallback(() => {
    setTouched({ year: true, name: true });
    if (!yearCheck.ok || !nameCheck.ok) return;
    if (storage.phase !== 'READY') return;
    // 중복은 **막지 않는다.** 실무에 재작성·분할 계약이 있다 (§2-5)
    const dup = findDuplicate(
      others,
      { year: Number(draft.year), half: draft.half, kind: draft.kind, name: draft.name },
      projectId ?? undefined,
    );
    if (dup) {
      setDupConfirm(dup);
      return;
    }
    void doSave();
  }, [yearCheck, nameCheck, storage, others, draft, projectId, doSave]);

  return (
    <>
      <Modal
        title={editing ? '용역 정보 수정' : '용역 만들기'}
        subtitle={
          <>
            <span className="modal__previewLabel">표시명 미리보기</span>
            <strong className="modal__preview" title={preview}>
              {preview}
            </strong>
          </>
        }
        onClose={close}
        footer={
          <>
            <button type="button" className="btn" onClick={close}>
              취소
            </button>
            <BusyButton busy={saving} disabled={!canSave} onClick={onSubmit}>
              {editing ? '저장' : '만들기'}
            </BusyButton>
          </>
        }
      >
        {!loaded ? (
          <p className="muted">불러오는 중…</p>
        ) : (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <div className="form__row">
              <Field label="점검연도" required error={yearError} hint="2000 ~ 2100">
                {({ id, invalid, describedBy }) => (
                  <input
                    id={id}
                    className="input input--num num"
                    type="number"
                    inputMode="numeric"
                    min={2000}
                    max={2100}
                    step={1}
                    value={draft.year}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))}
                    onBlur={() => setTouched((t) => ({ ...t, year: true }))}
                  />
                )}
              </Field>

              <Field label="점검시기" required>
                {({ id }) => (
                  <div className="segmented" role="radiogroup" aria-label="점검시기" id={id}>
                    {HALF_OPTIONS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        role="radio"
                        aria-checked={draft.half === h}
                        className="segmented__item"
                        data-selected={draft.half === h}
                        onClick={() => setDraft((d) => ({ ...d, half: h }))}
                      >
                        {HALF_LABEL[h]}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            </div>

            <Field label="점검구분" required>
              {({ id }) => (
                <div className="segmented segmented--wide" role="radiogroup" aria-label="점검구분" id={id}>
                  {KIND_OPTIONS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={draft.kind === k}
                      className="segmented__item"
                      data-selected={draft.kind === k}
                      onClick={() => setDraft((d) => ({ ...d, kind: k }))}
                    >
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field
              label="용역명"
              required
              error={nameError}
              hint={`현장명과 회차를 함께 씁니다. 예: ○○아파트 3차 (${normalizeName(draft.name).length}/${PROJECT_NAME_MAX})`}
            >
              {({ id, invalid, describedBy }) => (
                <input
                  id={id}
                  className="input"
                  type="text"
                  autoComplete="off"
                  maxLength={PROJECT_NAME_MAX + 20}
                  placeholder="○○아파트 3차"
                  value={draft.name}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                />
              )}
            </Field>

            <Field
              label="이전 회차 연결 (선택)"
              hint="같은 현장의 지난 용역을 이으면 다음 회차에서 구조를 그대로 가져올 수 있습니다."
            >
              {({ id }) => (
                <select
                  id={id}
                  className="input"
                  value={draft.prevProjectId}
                  disabled={prevOptions.length === 0}
                  onChange={(e) => setDraft((d) => ({ ...d, prevProjectId: e.target.value }))}
                >
                  <option value="">연결하지 않음</option>
                  {prevOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {projectDisplayName(p)}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {!editing && draft.prevProjectId !== '' && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.copyStructure}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      copyStructure: e.target.checked,
                      // 동·층·도면 복사를 끄면 결함 승계도 의미가 없다 — 함께 끈다
                      copyDefects: e.target.checked ? d.copyDefects : false,
                    }))
                  }
                />
                <span>
                  이전 용역의 동 · 층 · 도면 복사
                  <em className="check__note">
                    {draft.copyDefects
                      ? '결함도 함께 가져옵니다 (전회차로 표시).'
                      : '결함은 복사되지 않습니다.'}
                  </em>
                </span>
              </label>
            )}

            {/* F7 — S1 의 결정을 뒤집는다. 결함까지 가져오면 status=PREV_PENDING(보라)으로 들어간다 */}
            {!editing && draft.prevProjectId !== '' && draft.copyStructure && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.copyDefects}
                  onChange={(e) => setDraft((d) => ({ ...d, copyDefects: e.target.checked }))}
                />
                <span>
                  이전 용역의 결함도 함께 가져오기
                  <em className="check__note">
                    전회차(보라색)로 표시됩니다. 현장에서 다시 확인해 처리해 주세요.
                  </em>
                </span>
              </label>
            )}
          </form>
        )}
      </Modal>

      {dupConfirm && (
        <ConfirmDialog
          title="같은 이름의 용역이 이미 있습니다"
          danger={false}
          body={
            <>
              <p>
                <b className="quote">{projectDisplayName(dupConfirm)}</b> 이(가) 이미 등록되어 있습니다.
              </p>
              <p className="muted">재작성이나 분할 계약이라면 그대로 진행해도 됩니다.</p>
            </>
          }
          confirmLabel="계속"
          onConfirm={() => {
            setDupConfirm(null);
            void doSave();
          }}
          onCancel={() => setDupConfirm(null)}
        />
      )}
    </>
  );
}
