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
};

export function usePhotoComposite(photo: Photo | null, srcUrl: string | null): PhotoComposite {
  const want = photo !== null && srcUrl !== null && needsCompose(photo);
  const signature = photo && want ? composeSignature(photo) : null;

  const [made, setMade] = useState<{ signature: string; url: string } | null>(null);
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
      setMade({ signature, url: created });
    })();

    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
      setMade(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, srcUrl]);

  if (signature !== null && made !== null && made.signature === signature) {
    return { url: made.url, baked: true, pending: false };
  }
  return { url: srcUrl, baked: false, pending: signature !== null && pending };
}
