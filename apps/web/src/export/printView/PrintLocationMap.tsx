/**
 * 조사위치도 인쇄 뷰 — Phase 4 스펙 §3-7 · §4-9. **층 1개 = 페이지 1장, A4 가로.**
 *
 * 렌더는 이미 `export/locationMap.ts` 가 오프스크린 캔버스에서 끝냈다.
 * 여기는 그 PNG 를 지면에 앉히기만 한다 — 화면과 출력이 어긋날 여지가 없다.
 */
import { locationMapLabel, type LocationMapPage } from '../locationMap';

export function PrintLocationMap({ pages }: { pages: readonly LocationMapPage[] }) {
  if (pages.length === 0) {
    return (
      <div className="pv-page">
        <p className="pv-status">도면이 있는 층이 없어 조사위치도를 만들지 못했습니다.</p>
      </div>
    );
  }
  return (
    <>
      {pages.map((p) => (
        <div className="pv-page" key={p.floorId}>
          <div className="pv-map">
            {/* D45 B-3 — 동이 2개 이상이면 `A동 1층 조사위치도`. 1개면 예전 문구 그대로다 */}
            <img
              src={p.url}
              alt={`${locationMapLabel(p.floorName, p.buildingName)} 조사위치도`}
              width={p.width}
              height={p.height}
            />
          </div>
        </div>
      ))}
    </>
  );
}
