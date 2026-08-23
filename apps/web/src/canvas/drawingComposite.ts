/**
 * F5-3 — 도면 크기 조절 합성 결과 **런타임 캐시**. 웹 어댑터 전용.
 *
 * 스펙(§F5-3): *"합성 결과는 페이지 객체가 아니라 별도 캐시에 둔다 (`pageId → {scale, src}`).
 * 저장 용량이 늘지 않게 하기 위함이다."*
 *
 * 저장소에 남는 것은 `Drawing.imgScale`(숫자 하나)과 `imgLayout` 뿐이다.
 * 배율이 1 이면 아무것도 합성하지 않고 저장된 렌더 Blob 을 그대로 쓴다.
 *
 * ⚠️ **좌표는 절대 건드리지 않는다.** Numdraw 는 배율이 바뀌면 넘버링 좌표를 같은
 * 비율로 옮겼지만, 우리 좌표는 A4 지면 기준 0~1 정규화(불변식 #1)라 옮기면 두 번
 * 변환되어 어긋난다. 이 모듈은 **이미지만** 다시 그린다.
 */
import { clampScale, DEFAULT_SCALE } from '@onspect/project-core';
import { composeA4 } from '../data/imageIngest';

type Entry = { scale: number; url: string };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string>>();

/** 배율이 기본(1)인가 — 그러면 합성이 필요 없다 */
export function isDefaultScale(scale: number | null | undefined): boolean {
  return clampScale(scale ?? DEFAULT_SCALE) === DEFAULT_SCALE;
}

export function cachedCompositeUrl(drawingId: string, scale: number): string | null {
  const hit = cache.get(drawingId);
  return hit && hit.scale === clampScale(scale) ? hit.url : null;
}

/**
 * 원본 Blob 을 배율 `scale` 로 A4 에 다시 합성하고 objectURL 을 돌려준다.
 * 같은 도면·같은 배율이면 캐시를 그대로 쓴다. 배율이 바뀌면 이전 URL 을 해제한다.
 */
export async function compositeUrl(
  drawingId: string,
  source: Blob,
  rawScale: number,
): Promise<string> {
  const scale = clampScale(rawScale);
  const hit = cache.get(drawingId);
  if (hit && hit.scale === scale) return hit.url;

  const key = `${drawingId}@${scale}`;
  const running = inflight.get(key);
  if (running) return running;

  const p = composeA4(source, scale)
    .then(({ renderBlob }) => {
      const url = URL.createObjectURL(renderBlob);
      const prev = cache.get(drawingId);
      if (prev) URL.revokeObjectURL(prev.url);
      cache.set(drawingId, { scale, url });
      inflight.delete(key);
      return url;
    })
    .catch((e: unknown) => {
      inflight.delete(key);
      throw e;
    });

  inflight.set(key, p);
  return p;
}

/** 도면 1장의 합성 캐시를 버린다 (배율 변경·도면 교체·도면 삭제) */
export function releaseComposite(drawingId: string): void {
  const hit = cache.get(drawingId);
  if (hit) URL.revokeObjectURL(hit.url);
  cache.delete(drawingId);
  for (const k of [...inflight.keys()]) {
    if (k.startsWith(`${drawingId}@`)) inflight.delete(k);
  }
}

/** 용역을 벗어날 때 전부 해제한다 (imageLoader.revokeAll 과 같은 정신) */
export function clearCompositeCache(): void {
  for (const e of cache.values()) URL.revokeObjectURL(e.url);
  cache.clear();
  inflight.clear();
}

/** 진단용 */
export function compositeCacheSize(): number {
  return cache.size;
}
