/**
 * 도면 이미지 로드 · 캐시 — 웹 어댑터 전용.
 *
 * 코어는 이미지 객체를 모른다. 여기서 디코딩해서 `imageWidth`/`imageHeight` 숫자만 넘긴다.
 *
 * 이번 범위의 도면 원본은 벡터(SVG)지만, 실제 파이프라인은 PDF→래스터 렌더이미지다(B18).
 * 그 조건을 그대로 재현하기 위해 **로드 즉시 한 번 래스터화**해서 비트맵으로 쓴다.
 * (브라우저마다 SVG를 drawImage 목적지 해상도로 다시 래스터화하는지가 달라
 *  같은 코드가 어떤 브라우저에서는 흐리게 보이는 문제를 막는다)
 */

export type LoadedDrawing = {
  id: string;
  source: CanvasImageSource;
  naturalWidth: number;
  naturalHeight: number;
};

/**
 * 래스터 장변 상한. 이보다 큰 도면은 이 값에 맞춰 줄인다.
 *
 * ⚠️ **확대는 하지 않는다.** S1 부터 도면은 `imageIngest.ts` 가 이미
 * 이 규칙으로 래스터화한 PNG Blob 이라, 여기서 또 키우면 메모리만 4배가 되고
 * 디테일은 늘지 않는다. (벡터 확대는 인입 시점에 끝난다)
 */
const MAX_RASTER_EDGE = 4096;

const cache = new Map<string, LoadedDrawing>();
const inflight = new Map<string, Promise<LoadedDrawing>>();

export function cachedDrawing(id: string): LoadedDrawing | null {
  return cache.get(id) ?? null;
}

export function loadDrawing(
  id: string,
  url: string,
  naturalWidth: number,
  naturalHeight: number,
): Promise<LoadedDrawing> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(id);
  if (running) return running;

  const p = new Promise<LoadedDrawing>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        resolve(rasterize(id, img, naturalWidth, naturalHeight));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error(`도면 이미지를 불러오지 못했습니다: ${url}`));
    img.src = url;
  })
    .then((d) => {
      cache.set(id, d);
      inflight.delete(id);
      return d;
    })
    .catch((e: unknown) => {
      inflight.delete(id);
      throw e;
    });

  inflight.set(id, p);
  return p;
}

function rasterize(
  id: string,
  img: HTMLImageElement,
  naturalWidth: number,
  naturalHeight: number,
): LoadedDrawing {
  const long = Math.max(naturalWidth, naturalHeight);
  const scale = Math.min(1, MAX_RASTER_EDGE / long);
  const w = Math.round(naturalWidth * scale);
  const h = Math.round(naturalHeight * scale);

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('캔버스 컨텍스트를 만들 수 없습니다');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  return { id, source: c, naturalWidth, naturalHeight };
}

/** 테스트·개발용 캐시 비우기 */
export function clearDrawingCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * 용역을 벗어날 때 그 용역의 래스터를 버린다 (§2-8-c).
 * 해제하지 않으면 여러 용역을 오갈 때마다 수십 MB 씩 쌓인다.
 * objectURL 해제는 `data/idb/blobs.ts` 의 `revokeProjectUrls()` 가 맡는다.
 */
export function revokeAll(drawingIds?: readonly string[]): void {
  if (!drawingIds) {
    clearDrawingCache();
    return;
  }
  for (const id of drawingIds) {
    cache.delete(id);
    inflight.delete(id);
  }
}

/** 진단용 — 층을 여러 번 오간 뒤 늘지 않아야 한다 */
export function cachedDrawingCount(): number {
  return cache.size;
}
