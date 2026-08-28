/**
 * 합성본 objectURL 훅 — 미리보기 다이얼로그가 쓴다 (PhotoPolish §2-2).
 *
 * ⭐ **썸네일 그리드는 이것을 쓰지 않는다** (R1). 320px 썸네일 수십 장을 매번 캔버스로
 *    돌리면 우측 패널이 무거워진다. 그리드는 `✎` 배지만 띄우고, 합성본은 큰 창에서 본다.
 *
 * 규칙:
 *   · 자르기·주석이 **없으면 합성하지 않는다** — 원본 URL 을 그대로 쓰고 회전은 CSS 가 한다
 *   · 합성했으면 회전까지 이미 구워져 있으므로 **CSS `rotate` 를 또 걸면 두 번 돈다**.
 *     그것을 `baked` 로 알린다
 *   · 우리가 만든 objectURL 은 **우리가 해제한다** (서명이 바뀌거나 언마운트될 때)
 *   · 칸 크기는 `baked` 면 반환된 `width`/`height`, 아니면 `displaySize()` — `PhotoComposite` 주석 참고
 */
import { useEffect, useState } from 'react';
import type { Photo } from '@onspect/project-core';
import { composePhotoFromUrl, composeSignature, needsCompose } from './photoCompose.js';

export type PhotoComposite = {
  /** 화면에 걸 URL. 합성 전·실패 시에는 원본 URL 이다 (폴백) */
  url: string | null;
  /** true = 회전·자르기·주석이 이미 이미지에 구워져 있다 → CSS 변환을 걸지 않는다 */
  baked: boolean;
  /** 합성 중 — 원본을 먼저 보여주고 끝나면 바뀐다 */
  pending: boolean;
  /**
   * 합성 결과의 실제 픽셀 크기. 합성하지 않았으면 `null`.
   *
   * ⭐ **소비자 규약:** 칸 크기·종횡비를 잡을 때
   *   · `baked === true`  → **이 `width`/`height` 를 쓴다**
   *   · `baked === false` → 기존 `displaySize(photo)` (`@onspect/project-core`) 를 쓴다
   *
   *   `displaySize()` 는 rotate 만 스왑하고 **crop 을 모른다.** 자른 사진에서 그 값을 쓰면
   *   종횡비가 어긋나 늘어나거나 레터박스가 생긴다.
   */
  width: number | null;
  height: number | null;
};

export function usePhotoComposite(photo: Photo | null, srcUrl: string | null): PhotoComposite {
  const want = photo !== null && srcUrl !== null && needsCompose(photo);
  const signature = photo && want ? composeSignature(photo) : null;

  const [made, setMade] = useState<{
    signature: string;
    url: string;
    w: number;
    h: number;
  } | null>(null);
  const [pending, setPending] = useState(false);

  // `photo` 전체가 아니라 **서명**에 반응한다 — 참조만 바뀌었을 때 다시 굽지 않는다.
  // 한 effect 가 만들기·해제를 모두 책임진다: 정리 함수가 이번 실행이 만든 URL 만 해제한다
  const target = photo;
  useEffect(() => {
    if (signature === null || srcUrl === null || target === null) {
      setPending(false);
      setMade(null);
      return;
    }
    let alive = true;
    let created: string | null = null;
    setPending(true);
    void (async () => {
      const r = await composePhotoFromUrl(srcUrl, target);
      if (!alive) return;
      setPending(false);
      if (!r) return; // 실패 = 원본 URL 폴백. 조용히 원본이 보인다
      created = URL.createObjectURL(r.blob);
      // crop 이 적용된 래스터라 원본 크기와 다르다. 소비자가 칸을 잡을 때 필요하다
      setMade({ signature, url: created, w: r.width, h: r.height });
    })();

    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
      setMade(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, srcUrl]);

  if (signature !== null && made !== null && made.signature === signature) {
    return { url: made.url, baked: true, pending: false, width: made.w, height: made.h };
  }
  // 폴백(원본 URL) 경로에서는 크기를 모른다 — 소비자는 `displaySize(photo)` 를 쓴다
  return {
    url: srcUrl,
    baked: false,
    pending: signature !== null && pending,
    width: null,
    height: null,
  };
}
