/**
 * 사진첩 인쇄 뷰 (A4 세로 · 2열 × 3행) — Phase 4 스펙 §3-6 · §4-9 · PhotoPolish §2-8.
 *
 * · 순서는 `buildPhotoBook()` 이 정한 그대로다 — **사진번호 오름차순이 이미 보장돼 있다**.
 * · 마지막 페이지가 6 으로 안 나눠떨어져도 **칸 크기를 유지한다**
 *   (사진만 커지면 보고서가 들쭉날쭉해진다).
 *
 * ⭐ **React key 는 `cell.key`(= `defectId:photoId`) 다.** `defectId` 를 쓰면
 *    `대표 외 사진 포함` 을 켜는 순간 한 결함에 칸이 여러 개가 되어 **키가 중복된다**(§2-8).
 *
 * ⭐ **자르기·주석은 어댑터(`photoBookImages.ts`)가 미리 구워서 준다.** 여기서 다시 그리지 않는다 —
 *    화면(미리보기)과 출력이 `composePhoto` 한 함수를 공유하게 하려는 것이 그 구조의 목적이다.
 *    구워진 이미지(`baked`)는 **회전까지 포함**돼 있으므로 CSS `rotate` 를 또 걸면 두 번 돈다.
 */
import type { PhotoBookCell, PhotoBookPage } from '@onspect/project-core';
import type { PhotoBookImage } from '../photoBookImages';

/** `print.css` 의 `.pv-cell__frame` 과 같은 값 — 회전 시 가로/세로를 맞바꾼다 */
const FRAME_W_MM = 90;
const FRAME_H_MM = 68;

export function PrintPhotoBook({
  pages,
  images,
}: {
  pages: readonly PhotoBookPage[];
  /** `cell.key` → 이미지. 어댑터가 만든다 (코어는 URL 을 모른다) */
  images: Readonly<Record<string, PhotoBookImage>>;
}) {
  if (pages.length === 0) {
    return (
      <div className="pv-page">
        <p className="pv-status">대표사진이 있는 결함이 없어 사진첩이 비어 있습니다.</p>
      </div>
    );
  }
  return (
    <>
      {pages.map((p) => (
        <div className="pv-page" key={p.index}>
          <div className="pv-photos">
            {p.cells.map((c) => (
              <PhotoCell key={c.key} cell={c} image={images[c.key] ?? null} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function PhotoCell({ cell, image }: { cell: PhotoBookCell; image: PhotoBookImage | null }) {
  return (
    <figure className="pv-cell">
      <div className="pv-cell__frame">
        {image ? (
          // 인쇄 전에 `decode()` 를 기다린다 — 안 기다리면 빈 칸이 인쇄된다 (§4-9)
          <img src={image.url} alt={cell.lines[0] ?? ''} style={frameStyle(cell, image)} />
        ) : (
          <span className="pv-status">사진을 불러오지 못했습니다</span>
        )}
      </div>
      <figcaption className="pv-cell__caption">
        {cell.lines.map((line, i) => (
          <div key={i}>{i === 0 ? <b>{line}</b> : line}</div>
        ))}
      </figcaption>
    </figure>
  );
}

/**
 * 합성본은 **최종 방향의 래스터**라 프레임을 그대로 쓰면 된다.
 * 원본 폴백일 때만 지금까지처럼 CSS 로 돌리고, 90·270 이면 프레임 가로/세로를 맞바꾼다.
 */
export function frameStyle(
  cell: Pick<PhotoBookCell, 'edits'>,
  image: PhotoBookImage,
): React.CSSProperties {
  if (image.baked) {
    return { maxWidth: `${FRAME_W_MM}mm`, maxHeight: `${FRAME_H_MM}mm` };
  }
  const rotate = cell.edits.rotate ?? 0;
  if (rotate === 90 || rotate === 270) {
    return {
      transform: `rotate(${rotate}deg)`,
      maxWidth: `${FRAME_H_MM}mm`,
      maxHeight: `${FRAME_W_MM}mm`,
    };
  }
  return {
    transform: rotate === 180 ? 'rotate(180deg)' : undefined,
    maxWidth: `${FRAME_W_MM}mm`,
    maxHeight: `${FRAME_H_MM}mm`,
  };
}
