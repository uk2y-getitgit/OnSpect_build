/**
 * 사진 편집기 공용 스테이지 — PhotoPolish 스펙 §2-3 · §2-4.
 *
 * ⭐ **`canvas-core` 를 import 하지 않는다** (절대규칙 6). 포인터 처리는 전부 로컬 구현이다.
 *
 * ⭐ **스테이지 좌표계 = 표시 프레임 0~1 정규화**
 *    오버레이를 **이미지 요소와 정확히 같은 박스**에 절대배치한다.
 *    `position:relative; display:inline-block` 래퍼가 이미지에 딱 붙으므로
 *    **래퍼 = 이미지 실제 표시 박스**가 되어 레터박스 계산이 통째로 사라진다.
 *    정규화 좌표 = `(clientX - rect.left) / rect.width`.
 *
 * ⚠️ 이미지 상한은 **CSS `max-height:100%` 로 주지 않는다.** 부모(래퍼)의 높이가 `auto` 라
 *    퍼센트가 해소되지 않아 **세로로 긴 사진이 스테이지를 넘친다.** 그래서 `.photoEdit__fit`
 *    (절대배치 = 확정 픽셀 크기)을 재서 `maxWidth/maxHeight` 를 px 로 넣는다.
 *
 * ⚠️ **표시 프레임은 `edits.rotate` 가 적용된 프레임이다** (§2-1).
 *    CSS `transform: rotate()` 는 **래퍼 박스를 바꾸지 않으므로** 90/270 에서
 *    "래퍼 = 표시 박스" 규약이 깨진다. 그래서 회전만 구운 래스터를 한 장 만들어서 쓴다
 *    (`useRotatedFrame`). 굽는 함수는 출력과 **같은 `composePhoto` 경로**다 — 두 벌이 아니다.
 */
import { useEffect, useState } from 'react';
import type { PhotoRotate, Pt } from '@onspect/project-core';
import { composePhotoFromUrl } from '../../data/photoCompose';

export type StageSize = { w: number; h: number };

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** 화면 좌표 → 표시 프레임 0~1 정규화. 박스 밖으로 나가면 클램프한다 */
export function normPoint(box: HTMLElement | null, clientX: number, clientY: number): Pt {
  if (!box) return { x: 0, y: 0 };
  const r = box.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return { x: 0, y: 0 };
  return { x: clamp01((clientX - r.left) / r.width), y: clamp01((clientY - r.top) / r.height) };
}

/**
 * 요소의 실제 표시 크기(px). 이미지 로드·창 크기 변경에 따라 늦게 정해지므로
 * `ResizeObserver` 로 따라간다. **콜백 ref 로 받은 element** 를 넘겨야
 * 마운트 시점에 확실히 다시 잰다.
 */
export function useBoxSize(el: HTMLElement | null): StageSize {
  const [size, setSize] = useState<StageSize>({ w: 0, h: 0 });

  useEffect(() => {
    if (!el) {
      setSize({ w: 0, h: 0 });
      return;
    }
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((cur) =>
        Math.abs(cur.w - r.width) < 0.5 && Math.abs(cur.h - r.height) < 0.5
          ? cur
          : { w: r.width, h: r.height },
      );
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return size;
}

export type RotatedFrame = {
  /** 표시할 이미지 URL. 준비되기 전에는 `null` */
  url: string | null;
  /** 좌표를 얹어도 되는가 — `false` 면 오버레이를 그리지 않는다 */
  ready: boolean;
  /** 굽기에 실패했다 — 편집을 열지 않고 안내한다 */
  failed: boolean;
};

/**
 * **회전만** 구운 표시 프레임 이미지.
 *
 * 자르기·주석은 굽지 않는다 — 편집기는 **자르기 전 · 주석 없는 전체 프레임** 위에서 조작하고,
 * 기존 자르기 사각형·주석은 오버레이로 겹쳐 그린다. 그래야
 *   · 자른 사진에서 자르기를 다시 열면 **바깥 영역까지 보이면서** 직전 사각형이 그대로 뜬다
 *   · 주석 좌표가 항상 자르기 전 프레임 기준이라 **자른 뒤에도 안 움직인다** (§2-1)
 *
 * `rotate === 0` 이면 굽지 않고 원본 URL 을 그대로 쓴다(빠른 경로).
 * 우리가 만든 objectURL 은 **우리가 해제한다**.
 */
export function useRotatedFrame(srcUrl: string | null, rotate: PhotoRotate): RotatedFrame {
  const key = srcUrl === null || rotate === 0 ? null : `${srcUrl}#${rotate}`;
  const [made, setMade] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (key === null || srcUrl === null) {
      setMade(null);
      return;
    }
    let alive = true;
    let created: string | null = null;
    void (async () => {
      const r = await composePhotoFromUrl(srcUrl, {
        edits: { crop: null, rotate },
        annotations: [],
      });
      if (!alive) return;
      if (!r) {
        // 폴백으로 안 돌린 회전 이미지를 보여주면 **좌표가 90° 어긋난다** — 차라리 안내한다
        setFailed(true);
        return;
      }
      created = URL.createObjectURL(r.blob);
      setMade({ key, url: created });
    })();

    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
      setMade(null);
    };
  }, [key, srcUrl, rotate]);

  if (key === null) return { url: srcUrl, ready: srcUrl !== null, failed: false };
  if (made !== null && made.key === key) return { url: made.url, ready: true, failed: false };
  return { url: null, ready: false, failed };
}

// ── 스테이지 ───────────────────────────────────────────────────────────────
/**
 * 자르기·주석 편집기가 **같은 스테이지 규약**을 쓰게 하는 공용 껍데기 (§2-3 · §2-4).
 * 두 벌로 만들면 한쪽만 고쳐져 좌표가 갈린다.
 *
 * `children(box, boxEl)` 로 **이미지 표시 박스의 픽셀 크기와 DOM 요소**를 넘긴다.
 * 오버레이는 그 안에 `position:absolute; inset:0` 으로 깔린다.
 */
export function EditStage({
  frame,
  alt,
  children,
}: {
  frame: RotatedFrame;
  alt: string;
  children: (box: StageSize, boxEl: HTMLDivElement | null) => React.ReactNode;
}) {
  const [fitEl, setFitEl] = useState<HTMLDivElement | null>(null);
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const fit = useBoxSize(fitEl);
  const box = useBoxSize(boxEl);

  return (
    <div className="photoEdit__stage">
      <div className="photoEdit__fit" ref={setFitEl}>
        {frame.failed && (
          <p className="photoEdit__status">
            이미지를 준비하지 못했습니다 — <b>[취소]</b> 후 다시 시도해 주세요
          </p>
        )}
        {!frame.failed && !frame.ready && <p className="photoEdit__status">편집 준비 중…</p>}
        {frame.ready && frame.url && (
          <div className="photoEdit__box" ref={setBoxEl}>
            <img
              className="photoEdit__img"
              src={frame.url}
              alt={alt}
              draggable={false}
              // ⚠️ px 상한. 퍼센트로 주면 세로 사진이 스테이지를 넘친다(위 주석 참고)
              style={
                fit.w > 0 && fit.h > 0 ? { maxWidth: fit.w, maxHeight: fit.h } : { visibility: 'hidden' }
              }
            />
            {box.w > 0 && box.h > 0 && children(box, boxEl)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 거리 계산 (지우개) ─────────────────────────────────────────────────────
/** 점 → 선분 최단거리. 등방 좌표계(px)에서 부른다 */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
