/**
 * 기기 간 프로젝트 이동 — 파일로 내보내기/가져오기 (D38 · Q74).
 *
 * Track 1(로그인+동기화 서버)을 뒤로 미루고, "현장 촬영 → PC 정리" 를 지금 당장 되게
 * 하려고 만든 별개 경로다. 서버·로그인 전혀 안 쓴다.
 *
 * 파일 = zip 하나(`manifest.json` + `blobs/{key}` 원본 바이트). id 그래프 재접합은
 * `@onspect/project-core` 의 `remapTransferBundle` 이 순수 계산으로 한다 — 여기는
 * IndexedDB·zip 압축·다운로드 같은 어댑터 몫만 한다.
 */
import {
  collectTransferBlobKeys,
  collectTransferIds,
  remapTransferBundle,
  type Building,
  type Drawing,
  type Floor,
  type ItemSettings,
  type Photo,
  type Project,
} from '@onspect/project-core';
import type { Defect, Memo } from '@onspect/canvas-core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { newId } from './idb/db.js';
import type { IdbProjectRepo } from './idb/repo.js';

const FORMAT_VERSION = 1;

/** 파일에 그대로 실리는 것 — 옛 id 그대로다(가져오기 시점에만 새 id를 발급한다) */
export type TransferManifest = {
  formatVersion: number;
  exportedAt: number;
  project: Project;
  buildings: Building[];
  floors: Floor[];
  drawings: Drawing[];
  defects: Defect[];
  memos: Memo[];
  photos: Photo[];
  itemSettings: ItemSettings | null;
  /** 이 배치가 참조하는 blob 키 전부. 가져오기가 zip 안 blobs/{key} 를 찾을 때 쓴다 */
  blobKeys: string[];
  /** blob 키 → mime. 없으면(옛 파일) 가져오기가 빈 문자열로 만든다 — `Blob.type` 만 못 살릴 뿐 바이트는 그대로다 */
  blobMimes: Record<string, string>;
};

export type ExportProjectResult = { blob: Blob; fileName: string };

function sanitizeFileName(raw: string): string {
  const s = raw.replace(/[\\/:*?"<>|]/g, '_').trim();
  return s === '' ? '프로젝트' : s.slice(0, 60);
}

function dateStamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * 프로젝트 하나를 zip 파일(Blob)로 묶는다. 다운로드는 호출부(UI)가 한다 —
 * 여기는 파일 바이트만 만든다.
 */
export async function exportProjectToZip(
  repo: IdbProjectRepo,
  projectId: string,
): Promise<ExportProjectResult> {
  const bundle = await repo.loadBundle(projectId);
  if (!bundle) throw new Error('프로젝트를 찾을 수 없습니다');
  const itemSettings = await repo.ensureProjectSettings(projectId);

  const blobKeys = collectTransferBlobKeys({ ...bundle, itemSettings });

  const files: Record<string, Uint8Array> = {};
  const blobMimes: Record<string, string> = {};
  for (const key of blobKeys) {
    const blob = await repo.readBlob(key);
    if (!blob) continue; // 방어적 — 정상 데이터라면 전부 있어야 하지만, 하나 없다고 내보내기 전체를 막지 않는다
    blobMimes[key] = blob.type;
    files[`blobs/${key}`] = new Uint8Array(await blob.arrayBuffer());
  }

  const manifest: TransferManifest = {
    formatVersion: FORMAT_VERSION,
    exportedAt: Date.now(),
    project: bundle.project,
    buildings: bundle.buildings,
    floors: bundle.floors,
    drawings: bundle.drawings,
    defects: bundle.defects,
    memos: bundle.memos,
    photos: bundle.photos,
    itemSettings,
    blobKeys,
    blobMimes,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest));

  const zipped = zipSync(files, { level: 6 });
  const fileName = `${sanitizeFileName(bundle.project.name)}_${dateStamp(manifest.exportedAt)}.onspect.zip`;
  return { blob: new Blob([zipped], { type: 'application/zip' }), fileName };
}

export type ImportProjectResult = { projectId: string; projectName: string };

/**
 * 읽기만 끝낸 백업 파일 (D46).
 *
 * 가져오기를 **두 단계**로 쪼갠 이유: 파일 안 용역이 이미 로컬에 있는지 먼저 보고
 * "새로 만들기 / 덮어쓰기" 를 물어야 하는데, 그 판정을 하려면 zip 을 이미 열어 둔
 * 상태여야 한다. 파일을 두 번 읽지 않으려고 열어 둔 결과를 그대로 들고 다닌다.
 */
export type ParsedProjectZip = {
  /** 파일 안 용역 — **옛 id 그대로**다. 이름·연도·반기·종류 중복 판정에만 쓴다 */
  project: Project;
  manifest: TransferManifest;
  files: ReturnType<typeof unzipSync>;
};

/**
 * 가져오기 방식 (D46).
 * - `NEW` — 지금까지의 동작. id 를 **전부** 새로 발급한다(D38)
 * - `OVERWRITE` — 기존 용역 하위를 전부 지우고 그 자리에 심는다.
 *   **`project.id` 만은 기존 것을 그대로 쓴다** — 서버 동기화가 붙어 있으면 같은 용역으로 이어진다
 */
export type ImportMode = { kind: 'NEW' } | { kind: 'OVERWRITE'; projectId: string };

/** zip 을 열고 매니페스트만 검증한다. **아무것도 저장하지 않는다** */
export async function readProjectZip(file: Blob): Promise<ParsedProjectZip> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('올바른 OnSpect 백업 파일이 아닙니다(zip을 열 수 없음)');
  }

  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new Error('올바른 OnSpect 백업 파일이 아닙니다(manifest.json 없음)');

  let manifest: TransferManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as TransferManifest;
  } catch {
    throw new Error('백업 파일 내용을 읽을 수 없습니다');
  }
  if (manifest.formatVersion !== FORMAT_VERSION) {
    throw new Error(`지원하지 않는 백업 파일 버전입니다(${manifest.formatVersion})`);
  }
  if (!manifest.project || typeof manifest.project.id !== 'string') {
    throw new Error('백업 파일에 용역 정보가 없습니다');
  }
  return { project: manifest.project, manifest, files };
}

/**
 * 읽어 둔 백업 파일을 실제로 심는다.
 *
 * `NEW` 는 id 를 전부 새로 발급한다(D38 그대로 — 같은 파일을 두 번 가져와도 안 부딪힌다).
 * `OVERWRITE` 는 **project.id 하나만 기존 값으로 고정**하고 나머지(동·층·도면·결함·메모·
 * 사진·항목설정)는 새 id 를 받는다. 기존 하위 레코드 삭제와 새 레코드 삽입은
 * `repo.importBundle` 이 **한 트랜잭션**에서 처리한다(반쪽 상태 없음).
 */
export async function importParsedProject(
  repo: IdbProjectRepo,
  parsed: ParsedProjectZip,
  mode: ImportMode,
): Promise<ImportProjectResult> {
  const { manifest, files } = parsed;
  const bundle = {
    project: manifest.project,
    buildings: manifest.buildings,
    floors: manifest.floors,
    drawings: manifest.drawings,
    defects: manifest.defects,
    memos: manifest.memos,
    photos: manifest.photos,
    itemSettings: manifest.itemSettings,
  };

  const idMap = new Map<string, string>();
  for (const oldId of collectTransferIds(bundle)) idMap.set(oldId, newId());
  if (mode.kind === 'OVERWRITE') {
    // ⭐ 용역 id 만 기존 것으로 되돌린다. 항목설정 스냅샷 id 는 `projectId` 와 같은 값이라
    //    (`ensureProjectSettings` 가 projectId 를 키로 쓴다) 같은 map 항목을 함께 타고 들어간다
    idMap.set(bundle.project.id, mode.projectId);
  }
  const remapped = remapTransferBundle(bundle, idMap);

  // 소프트삭제·최근접속은 "지금 막 들여온 것"에 맞게 덮어쓴다. 나머지(updatedAt·deviceId 등)는
  // repo.importBundle 이 원본 그대로 쓴다 — 이유는 그 함수의 docstring 참고(D23)
  const now = Date.now();
  const project: Project = { ...remapped.project, deletedAt: null, lastOpenedAt: now };

  const blobs = new Map<string, Blob>();
  for (const key of manifest.blobKeys) {
    const raw = files[`blobs/${key}`];
    if (!raw) continue; // 매니페스트엔 있는데 zip 안엔 없는 경우 — 그 도면·사진만 비어 보일 수 있다(방어적)
    blobs.set(key, new Blob([raw], { type: manifest.blobMimes[key] || undefined }));
  }

  await repo.importBundle({
    project,
    buildings: remapped.buildings,
    floors: remapped.floors,
    drawings: remapped.drawings,
    defects: remapped.defects,
    memos: remapped.memos,
    photos: remapped.photos,
    itemSettings: remapped.itemSettings,
    blobs,
    ...(mode.kind === 'OVERWRITE' ? { replaceProjectId: mode.projectId } : {}),
  });

  return { projectId: project.id, projectName: project.name };
}

/**
 * zip 파일을 읽어 **항상 새 프로젝트로** 심는다(D38) — 한 번에 하는 편의 함수다.
 * 중복 확인창(D46)을 거치는 화면은 `readProjectZip` + `importParsedProject` 를 따로 부른다.
 */
export async function importProjectFromZip(
  repo: IdbProjectRepo,
  file: Blob,
): Promise<ImportProjectResult> {
  return importParsedProject(repo, await readProjectZip(file), { kind: 'NEW' });
}
