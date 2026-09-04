/**
 * 사진첩 인쇄 뷰 (A4 세로 · 2열 × 3행) — Phase 4 스펙 §3-6 · §4-9 · PhotoPolish §2-8.
 * 2026-09-04 양식 개정(사용자 제공 참고 PDF 재현) — 표 틀 + 좌측 결함번호 칸 + 한 줄 캡션.
 *
 * · 순서는 `buildPhotoBook()` 이 정한 그대로다 — **사진번호 오름차순이 이미 보장돼 있다**.
 * · 마지막 페이지가 6 으로 안 나눠떨어져도 **칸 크기를 유지한다**
 *   (사진만 커지면 보고서가 들쭉날쭉해진다) — 빈 칸은 내용 없이 테두리만 그린다.
 *
 * ⭐ React key 는 `cell.key`(= `defectId:photoId`) 다. `defectId` 를 쓰면
 *    `대표 외 사진 포함` 을 켜는 순간 한 결함에 칸이 여러 개가 되어 **키가 중복된다**(§2-8).
 *
 * ⭐ **자르기·주석은 어댑터(`photoBookImages.ts`)가 미리 구워서 준다.** 여기서 다시 그리지 않는다 —
 *    화면(미리보기)과 출력이 `composePhoto` 한 함수를 공유하게 하려는 것이 그 구조의 목적이다.
 *    구워진 이미지(`baked`)는 **회전까지 포함**돼 있으므로 CSS `rotate` 를 또 걸면 두 번 돈다.
 *
 * 2026-09-04 3차 수정 — 사진 칸에 여백을 줬다(`.pv-pb-frame` 의 `margin`). 프레임 최대 크기가
 * 그만큼 줄어드므로 `FRAME_W_MM`/`FRAME_H_MM` 도 같이 줄였다 — `print.css` 의 주석과 반드시
 * 같이 맞춰야 한다(안 그러면 사진이 다시 여백을 뚫고 넘친다, 지난 라운드와 같은 사고).
 */
import type { PhotoBookCell, PhotoBookPage } from '@onspect/project-core';
import type { PhotoBookImage } from '../photoBookImages';

/** `print.css` 의 `.pv-pb-frame` 과 같은 값 — 회전 시 가로/세로를 맞바꾼다 */
const FRAME_W_MM = 74;
const FRAME_H_MM = 52;

export function PrintPhotoBook({
  pages,
  images,
  headerText,
}: {
  pages: readonly PhotoBookPage[];
  /** `cell.key` → 이미지. 어댑터가 만든다 (코어는 URL 을 모른다) */
  images: Readonly<Record<string, PhotoBookImage>>;
  /** 머리말 한 줄 — `{용역명}` 또는 `{용역명} - {동이름}` (2026-09-04, `photoBookHeaderText`) */
  headerText: string;
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
          <table className="pv-pb">
            {/*
              ⚠️ 열 너비를 여기서 못박는다 — 헤더 행이 colspan=4라 `table-layout:fixed`가
              행만 보고는 열 너비를 못 정해서, 이게 없으면 브라우저가 임의로 배분해 사진이
              자기 칸보다 커져 옆 칸을 침범한다(2026-09-04 사용자 신고). 값은 print.css의
              `.pv-pb-no`/`.pv-pb-cell` 주석과 반드시 같아야 한다(186mm 인쇄폭 ÷ 2쌍 기준
              번호 15mm(8%) · 사진 78mm(42%) = 93mm/쌍) — `FRAME_W_MM` 도 78mm로 맞춘다.
            */}
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '42%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '42%' }} />
            </colgroup>
            <tbody>
              <tr>
                <td className="pv-pb-head" colSpan={4}>
                  {headerText}
                </td>
              </tr>
              {rowsOf(p.cells).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    cell ? (
                      <PhotoCells key={cell.key} cell={cell} image={images[cell.key] ?? null} />
                    ) : (
                      <EmptyCells key={j} />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

/** 6칸을 2열×3행으로 짝짓는다. 마지막 행이 홀수로 남으면 빈 칸(null)으로 채운다 */
function rowsOf(cells: readonly PhotoBookCell[]): (PhotoBookCell | null)[][] {
  const rows: (PhotoBookCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push([cells[i] ?? null, cells[i + 1] ?? null]);
  }
  return rows;
}

/** 번호 칸 + 사진 칸 한 쌍(`<td>` 두 개) */
function PhotoCells({ cell, image }: { cell: PhotoBookCell; image: PhotoBookImage | null }) {
  return (
    <>
      <td className="pv-pb-no">{cell.defectNo}</td>
      <td className="pv-pb-cell">
        {/* 세로 가운데 정렬용 flex 컨테이너는 <td> 가 아니라 이 안쪽 div 에 건다 —
            <td> 자체에 display:flex 를 걸면 표-셀 레이아웃과 상호작용이 브라우저마다
            달라 행 높이가 의도한 68mm 보다 줄어들고 사진이 잘렸다(2026-09-04 사용자 신고) */}
        <div className="pv-pb-inner">
          <div className="pv-pb-frame">
            {image ? (
              // 인쇄 전에 `decode()` 를 기다린다 — 안 기다리면 빈 칸이 인쇄된다 (§4-9)
              <img src={image.url} alt={cell.caption} style={frameStyle(cell, image)} />
            ) : (
              <span className="pv-status">사진을 불러오지 못했습니다</span>
            )}
          </div>
          <div className="pv-pb-cap">{cell.caption}</div>
        </div>
      </td>
    </>
  );
}

/** 마지막 페이지가 6칸을 못 채워도 표 틀은 유지한다 — 참고 양식의 빈 칸과 같은 모양 */
function EmptyCells() {
  return (
    <>
      <td className="pv-pb-no" />
      <td className="pv-pb-cell">
        <div className="pv-pb-inner">
          <div className="pv-pb-frame" />
          <div className="pv-pb-cap" />
        </div>
      </td>
    </>
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
