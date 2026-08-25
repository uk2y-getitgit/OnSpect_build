/**
 * 사진첩 인쇄 뷰 (A4 세로 · 2열 × 3행) — Phase 4 스펙 §3-6 · §4-9.
 *
 * · 순서는 `buildPhotoBook()` 이 정한 그대로다 — **사진번호 오름차순이 이미 보장돼 있다**.
 * · 마지막 페이지가 6 으로 안 나눠떨어져도 **칸 크기를 유지한다**
 *   (사진만 커지면 보고서가 들쭉날쭉해진다).
 * · 회전(`edits.rotate`)은 여기서 CSS 로 적용한다. 90·270 도면 프레임의 가로/세로를
 *   맞바꿔야 이미지가 프레임을 넘지 않는다.
 */
import type { PhotoBookCell, PhotoBookPage } from '@onspect/project-core';

/** `print.css` 의 `.pv-cell__frame` 과 같은 값 — 회전 시 가로/세로를 맞바꾼다 */
const FRAME_W_MM = 90;
const FRAME_H_MM = 68;

export function PrintPhotoBook({
  pages,
  urls,
}: {
  pages: readonly PhotoBookPage[];
  /** 렌더 Blob 키 → objectURL. 어댑터가 만든다 (코어는 URL 을 모른다) */
  urls: Readonly<Record<string, string>>;
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
              <PhotoCell key={c.defectId} cell={c} url={urls[c.renderBlobKey] ?? null} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function PhotoCell({ cell, url }: { cell: PhotoBookCell; url: string | null }) {
  const rotate = cell.edits.rotate ?? 0;
  const quarter = rotate === 90 || rotate === 270;
  const style: React.CSSProperties = quarter
    ? {
        transform: `rotate(${rotate}deg)`,
        maxWidth: `${FRAME_H_MM}mm`,
        maxHeight: `${FRAME_W_MM}mm`,
      }
    : {
        transform: rotate === 180 ? 'rotate(180deg)' : undefined,
        maxWidth: `${FRAME_W_MM}mm`,
        maxHeight: `${FRAME_H_MM}mm`,
      };

  return (
    <figure className="pv-cell">
      <div className="pv-cell__frame">
        {url ? (
          // 인쇄 전에 `decode()` 를 기다린다 — 안 기다리면 빈 칸이 인쇄된다 (§4-9)
          <img src={url} alt={cell.lines[0] ?? ''} style={style} />
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
