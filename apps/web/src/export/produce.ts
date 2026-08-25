/**
 * 산출물 생성 — Phase 4 스펙 §3-4 ~ §3-7 · §4-2 · §4-3.
 *
 * ⭐ **한 번의 `[생성]` 은 하나의 `ExportRun` 을 공유한다** (K20).
 *    이 함수에 `plan` 을 한 번만 넘기므로, 손상결함표·결함리스트·조사위치도의 번호가
 *    서로 어긋날 수 없다. 재다운로드도 같은 함수를 `planFromRun()` 결과로 부른다.
 *
 * ⭐ **PDF 는 여기서 만들지 않는다** (K1 · Q32). 인쇄 뷰가 맡는다.
 *    파일로 나가는 것은 **엑셀 2종 + PNG(조사위치도)** 뿐이다 (M3).
 */
import {
  ARTIFACT_LABEL,
  type ExportArtifact,
  type ExportArtifactKind,
  type ExportParams,
} from '@onspect/project-core';
import { damageTableSheet } from './damageTableFile';
import { buildFileName, type DownloadItem } from './download';
import { damageTableModel, defectListModel, type ExportPlan, type ExportSource } from './exportModel';
import {
  releaseLocationMaps,
  renderLocationMaps,
  type LocationMapWarning,
} from './locationMap';
import { writeWorkbook } from './xlsx';

/** `[생성]` 이 실제로 **파일**을 내는 산출물. 사진첩은 인쇄 뷰 전용이다 (M3) */
export const FILE_ARTIFACTS: readonly ExportArtifactKind[] = [
  'DAMAGE_TABLE',
  'DEFECT_LIST',
  'LOCATION_MAP',
];

export type ProduceInput = {
  source: ExportSource;
  plan: ExportPlan;
  params: ExportParams;
  kinds: ReadonlySet<ExportArtifactKind>;
  /** 파일명 앞머리 — `projectDisplayName()` 결과 (D6) */
  displayName: string;
  at: number;
  repo: {
    objectUrl: (blobKey: string, projectId: string) => Promise<string | null>;
    readBlob: (blobKey: string) => Promise<Blob | null>;
  };
  projectId: string;
};

export type ProduceResult = {
  items: DownloadItem[];
  artifacts: ExportArtifact[];
  /** 조사위치도의 도면 없음 · 이미지 실패 · 잘린 번호 (K11) */
  mapWarnings: LocationMapWarning[];
  /** 엑셀 라이브러리가 막혀 CSV 로 나간 산출물 */
  csvFallback: ExportArtifactKind[];
};

export async function produceArtifacts(input: ProduceInput): Promise<ProduceResult> {
  const items: DownloadItem[] = [];
  const artifacts: ExportArtifact[] = [];
  const csvFallback: ExportArtifactKind[] = [];
  let mapWarnings: LocationMapWarning[] = [];

  const push = (kind: ExportArtifactKind, blob: Blob, fileName: string) => {
    items.push({ blob, fileName });
    artifacts.push({ kind, fileName, at: input.at });
  };

  // ── 손상결함표 (엑셀 13열) ──────────────────────────────────────────────
  if (input.kinds.has('DAMAGE_TABLE')) {
    const model = damageTableModel(input.source, input.plan, input.params);
    const wb = await writeWorkbook([damageTableSheet(model, ARTIFACT_LABEL.DAMAGE_TABLE)]);
    if (wb.fellBack) csvFallback.push('DAMAGE_TABLE');
    push(
      'DAMAGE_TABLE',
      wb.blob,
      buildFileName({
        displayName: input.displayName,
        kind: 'DAMAGE_TABLE',
        ext: wb.ext,
        at: input.at,
      }),
    );
  }

  // ── 결함 리스트 (엑셀 9열 축약. PDF 는 인쇄 뷰) ────────────────────────
  if (input.kinds.has('DEFECT_LIST')) {
    const model = defectListModel(input.source, input.plan, input.params);
    const wb = await writeWorkbook([damageTableSheet(model, ARTIFACT_LABEL.DEFECT_LIST)]);
    if (wb.fellBack) csvFallback.push('DEFECT_LIST');
    push(
      'DEFECT_LIST',
      wb.blob,
      buildFileName({
        displayName: input.displayName,
        kind: 'DEFECT_LIST',
        ext: wb.ext,
        at: input.at,
      }),
    );
  }

  // ── 조사위치도 (층당 PNG 1장) ──────────────────────────────────────────
  if (input.kinds.has('LOCATION_MAP')) {
    const bundle = input.source.bundle;
    const r = await renderLocationMaps({
      project: bundle.project,
      drawings: bundle.drawings,
      defects: bundle.defects,
      memos: bundle.memos,
      floors: bundle.floors,
      floorIds: input.params.floorIds,
      displayNumbers: displayNumbersOf(input.plan),
      includedDefectIds: new Set(input.plan.rows.map((x) => x.defectId)),
      params: input.params,
      objectUrl: (key) => input.repo.objectUrl(key, input.projectId),
      readBlob: (key) => input.repo.readBlob(key),
    });
    mapWarnings = r.warnings;
    for (const page of r.pages) {
      push(
        'LOCATION_MAP',
        page.blob,
        buildFileName({
          displayName: input.displayName,
          kind: 'LOCATION_MAP',
          ext: 'png',
          at: input.at,
          suffix: page.floorName,
        }),
      );
    }
    // Blob 은 `items` 가 들고 있다. objectURL 만 해제한다 — 안 하면 층마다 수 MB 가 샌다
    releaseLocationMaps(r.pages);
  }

  return { items, artifacts, mapWarnings, csvFallback };
}

/** 결함 id → 출력 결함번호 문자열. 조사위치도가 `seq` 대신 이것을 그린다 (B1 주입 지점) */
export function displayNumbersOf(plan: ExportPlan): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of plan.rows) out[r.defectId] = String(r.no);
  return out;
}
