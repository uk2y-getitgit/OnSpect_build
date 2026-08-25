/**
 * 조사위치도 — Phase 4 스펙 §3-7. **층 1개 = 페이지 1장.**
 *
 * ⭐ **캔버스 코어를 그대로 재사용한다.** 화면이 쓰는 `buildBackground` · `buildScreens` ·
 *    `buildOverlay` 를 오프스크린 캔버스에 그대로 흘린다 — 화면과 출력이 어긋날 수 없다.
 *    출력 전용 렌더러를 따로 만들면 스타일이 갈라지고, 그건 **조용히 틀린다**.
 *
 * ⭐ **번호는 `ExportRun` 의 `no` 를 주입한다.** `seq` 가 아니다(B1 주입 지점 · 불변식 #2).
 *
 * ⭐ **선택 하이라이트가 출력물에 새면 안 된다.** `selection`·`hover`·`guides`·`preview`·
 *    `ghost`·`pending` 을 전부 비운다.
 *
 * 여백 (K11):
 *   · 도곽이 **켜져** 있으면 여백을 추가하지 않는다 — A4 지면이 곧 페이지라 밖에 흰 띠가 생긴다.
 *     도면 밖으로 나간 라벨은 잘리고 **경고 목록**으로 알린다.
 *   · 도곽이 **꺼져** 있으면 바운딩 박스를 재서 나간 만큼 자동 여백을 준다.
 *     상한은 도면 장변의 10%. 그래도 넘치면 클램프 + 경고.
 */
import {
  buildBackground,
  buildOverlay,
  buildScreens,
  memoScreens,
  DEFAULT_GLOBAL_STYLE,
  type Defect,
  type DefectScreen,
  type GlobalStyle,
  type Memo,
  type RenderInput,
} from '@onspect/canvas-core';
import type { Drawing, ExportParams, Project } from '@onspect/project-core';
import { cachedCompositeUrl, compositeUrl, needsCompose } from '../canvas/drawingComposite';
import { loadDrawing, type LoadedDrawing } from '../canvas/imageLoader';
import { legendConfigFor, titleBlockConfigFor } from '../canvas/pageDecor';
import { prepare, renderOps } from '../canvas/renderCanvas2d';

/** 도곽이 꺼져 있을 때 자동 여백의 상한 — 도면 장변 대비 비율 (K11) */
const MAX_PAD_RATIO = 0.1;

/** 출력 캔버스 한 변의 상한(px). 넘으면 배율을 낮춘다 — 브라우저가 캔버스를 못 만들면 빈 PNG 가 나온다 */
const MAX_CANVAS_EDGE = 8192;

export type LocationMapPage = {
  floorId: string;
  floorName: string;
  drawingId: string;
  blob: Blob;
  /** objectURL — 인쇄 뷰의 `<img>` 가 쓴다. 다 쓰면 `releaseLocationMaps()` 로 해제한다 */
  url: string;
  width: number;
  height: number;
  /** 지면 밖으로 나가 잘린 번호(결함 id). 화면에 경고로 띄운다 (K11) */
  clipped: string[];
};

export type LocationMapWarning = {
  floorId: string;
  floorName: string;
  kind: 'NO_DRAWING' | 'IMAGE_FAILED' | 'CLIPPED';
  detail: string;
};

export type LocationMapResult = {
  pages: LocationMapPage[];
  warnings: LocationMapWarning[];
};

export type LocationMapInput = {
  project: Project;
  drawings: readonly Drawing[];
  defects: readonly Defect[];
  memos: readonly Memo[];
  floors: readonly { id: string; name: string }[];
  /** 출력 순서 그대로의 층 목록 (`params.floorIds`) */
  floorIds: readonly string[];
  /** 결함 id → 출력 결함번호. `ExportRun.mapping` 에서 만든다 */
  displayNumbers: Record<string, string>;
  /** 이 출력에 포함된 결함 id (필터·층 선택을 통과한 것) */
  includedDefectIds: ReadonlySet<string>;
  params: ExportParams;
  /** Blob → objectURL. `repo.objectUrl` 을 그대로 넘긴다 */
  objectUrl: (blobKey: string) => Promise<string | null>;
  /** 원본 Blob 읽기 — `needsCompose` 도면의 재합성에 쓴다 */
  readBlob: (blobKey: string) => Promise<Blob | null>;
};

export async function renderLocationMaps(input: LocationMapInput): Promise<LocationMapResult> {
  const pages: LocationMapPage[] = [];
  const warnings: LocationMapWarning[] = [];
  const floorName = new Map(input.floors.map((f) => [f.id, f.name]));
  const byFloor = groupDrawingsByFloor(input.drawings);

  for (const floorId of input.floorIds) {
    const name = floorName.get(floorId) ?? '';
    const drawing = byFloor.get(floorId);
    if (!drawing) {
      warnings.push({
        floorId,
        floorName: name,
        kind: 'NO_DRAWING',
        detail: `${name} — 도면이 없어 조사위치도를 만들 수 없습니다`,
      });
      continue;
    }

    let image: LoadedDrawing;
    try {
      image = await loadDrawingFor(drawing, input);
    } catch (e) {
      warnings.push({
        floorId,
        floorName: name,
        kind: 'IMAGE_FAILED',
        detail: `${name} — 도면 이미지를 불러오지 못했습니다 (${e instanceof Error ? e.message : String(e)})`,
      });
      continue;
    }

    const page = await renderOne({ input, drawing, image, floorId, floorName: name });
    if (!page) continue;
    pages.push(page);
    if (page.clipped.length > 0) {
      warnings.push({
        floorId,
        floorName: name,
        kind: 'CLIPPED',
        detail: `${name} — 번호 ${page.clipped.length}개가 도면 밖에 있습니다. 위치를 옮겨 주세요`,
      });
    }
  }

  return { pages, warnings };
}

/** 인쇄·다운로드가 끝나면 objectURL 을 해제한다. 안 하면 페이지당 수 MB 가 샌다 */
export function releaseLocationMaps(pages: readonly LocationMapPage[]): void {
  for (const p of pages) URL.revokeObjectURL(p.url);
}

// ── 한 장 ──────────────────────────────────────────────────────────────────
async function renderOne(a: {
  input: LocationMapInput;
  drawing: Drawing;
  image: LoadedDrawing;
  floorId: string;
  floorName: string;
}): Promise<LocationMapPage | null> {
  const { input, drawing, image, floorId, floorName } = a;
  const render = input.params.render;

  // 2. 출력용 결함 사본 — **문서는 건드리지 않는다** (K12)
  const defects: Defect[] = input.defects
    .filter((d) => d.drawingId === drawing.id && input.includedDefectIds.has(d.id))
    .map((d) => (render.sketch ? d : { ...d, sketch: [] }));

  const globalStyle = globalStyleFor(drawing);
  const ref = { id: drawing.id, imageWidth: drawing.imageWidth, imageHeight: drawing.imageHeight };

  // 4. 배율 — 캔버스 상한을 넘지 않게 낮춘다
  const longEdge = Math.max(drawing.imageWidth, drawing.imageHeight);
  const zoom = Math.max(0.1, Math.min(input.params.render.mapScale, MAX_CANVAS_EDGE / longEdge));

  // 여백 — 도곽이 켜져 있으면 0 (K11)
  const titleBlock = render.titleBlock ? titleBlockConfigFor(drawing, input.project) : null;
  const probe = buildScreens({
    drawing: ref,
    viewport: { zoom, tx: 0, ty: 0 },
    defects,
    globalStyle,
    preview: null,
  });
  const box = screensBounds(probe);
  const maxPad = Math.round(longEdge * zoom * MAX_PAD_RATIO);

  const pad =
    titleBlock !== null || box === null
      ? { l: 0, t: 0, r: 0, b: 0 }
      : {
          l: clampPad(-box.minX, maxPad),
          t: clampPad(-box.minY, maxPad),
          r: clampPad(box.maxX - drawing.imageWidth * zoom, maxPad),
          b: clampPad(box.maxY - drawing.imageHeight * zoom, maxPad),
        };

  const canvasSize = {
    w: Math.round(drawing.imageWidth * zoom + pad.l + pad.r),
    h: Math.round(drawing.imageHeight * zoom + pad.t + pad.b),
  };
  const viewport = { zoom, tx: pad.l, ty: pad.t };

  const renderInput: RenderInput = {
    drawing: ref,
    viewport,
    canvas: canvasSize,
    defects,
    // 3. ⭐ `seq` 가 아니라 출력 결함번호를 주입한다
    displayNumbers: input.displayNumbers,
    globalStyle,
    // 5. 선택 하이라이트가 출력에 새면 안 된다 — 전부 비운다
    selection: {
      defectId: null,
      part: null,
      markId: null,
      pathId: null,
      memoId: null,
      handle: null,
    },
    hover: null,
    guides: [],
    preview: null,
    dragDefectId: null,
    memos: render.memo
      ? memoScreens(
          input.memos.filter((m) => m.drawingId === drawing.id),
          viewport,
          drawing.imageWidth,
          drawing.imageHeight,
          null,
        )
      : undefined,
    ghost: null,
    pending: null,
    titleBlock,
    legend: render.legend ? legendConfigFor(drawing, defects) : null,
  };

  // 6. 오프스크린 캔버스. **dpr = 1** — 여기서는 CSS px 과 출력 px 이 같다
  const canvas = document.createElement('canvas');
  const ctx = prepare(canvas, canvasSize.w, canvasSize.h, 1);
  if (!ctx) return null;
  // 인쇄물 배경은 흰색이다. 투명 PNG 를 엑셀·워드에 붙이면 검게 나오는 뷰어가 있다
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

  renderOps(ctx, buildBackground(renderInput), image);
  const screens = buildScreens({
    drawing: ref,
    viewport,
    defects,
    globalStyle,
    preview: null,
  });
  renderOps(ctx, buildOverlay(renderInput, screens), image);

  const blob = await canvasToPng(canvas);
  return {
    floorId,
    floorName,
    drawingId: drawing.id,
    blob,
    url: URL.createObjectURL(blob),
    width: canvasSize.w,
    height: canvasSize.h,
    clipped: clippedDefects(screens, canvasSize),
  };
}

// ── 보조 ───────────────────────────────────────────────────────────────────
/** 층당 도면 1장이 원칙(§2-8)이지만, 여러 장이면 `sortOrder` 가 가장 앞선 것을 쓴다 */
function groupDrawingsByFloor(drawings: readonly Drawing[]): Map<string, Drawing> {
  const out = new Map<string, Drawing>();
  for (const d of [...drawings].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!out.has(d.floorId)) out.set(d.floorId, d);
  }
  return out;
}

/**
 * 화면과 **같은 경로**로 이미지를 얻는다 (§3-7 1단계).
 * `needsCompose` 면 원본을 다시 합성하고, 아니면 저장된 렌더 래스터를 쓴다.
 */
async function loadDrawingFor(d: Drawing, input: LocationMapInput): Promise<LoadedDrawing> {
  let url: string | null = null;
  if (needsCompose(d)) {
    const scale = d.imgScale ?? 1;
    url = cachedCompositeUrl(d.id, scale);
    if (!url) {
      const source = await input.readBlob(d.sourceBlobKey);
      if (source) url = await compositeUrl(d.id, source, scale);
    }
  }
  if (!url) url = await input.objectUrl(d.renderBlobKey);
  if (!url) throw new Error('도면 Blob 을 찾지 못했습니다');
  return loadDrawing(d.id, url, d.imageWidth, d.imageHeight);
}

/** F6 — 번호 풍선 크기는 도면 단위 설정이다. 화면과 같은 계산을 쓴다 */
export function globalStyleFor(d: Drawing): GlobalStyle {
  const s = d.labelScale ?? 1;
  if (s === 1) return DEFAULT_GLOBAL_STYLE;
  return { ...DEFAULT_GLOBAL_STYLE, balloonRadius: DEFAULT_GLOBAL_STYLE.balloonRadius * s };
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** 결함 표기 전체를 감싸는 스크린 바운딩 박스. 결함이 없으면 null */
function screensBounds(screens: readonly DefectScreen[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const put = (x: number, y: number, r = 0) => {
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  };
  for (const s of screens) {
    put(s.label.x, s.label.y, s.balloonR);
    for (const m of s.marks) {
      put(m.center.x, m.center.y, s.markR);
      if (m.rect) {
        put(m.rect.x, m.rect.y);
        put(m.rect.x + m.rect.w, m.rect.y + m.rect.h);
      }
      for (const p of m.points ?? []) put(p.x, p.y);
    }
    for (const sk of s.sketch) for (const p of sk.points) put(p.x, p.y, sk.width / 2);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function clampPad(v: number, max: number): number {
  return Math.max(0, Math.min(max, Math.ceil(v)));
}

/** 지면 밖으로 나가 잘린 번호 풍선 (K11 경고 목록) */
function clippedDefects(
  screens: readonly DefectScreen[],
  canvas: { w: number; h: number },
): string[] {
  const out: string[] = [];
  for (const s of screens) {
    const r = s.balloonR;
    if (
      s.label.x - r < 0 ||
      s.label.y - r < 0 ||
      s.label.x + r > canvas.w ||
      s.label.y + r > canvas.h
    ) {
      out.push(s.defectId);
    }
  }
  return out;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('PNG 로 변환하지 못했습니다'));
    }, 'image/png');
  });
}
