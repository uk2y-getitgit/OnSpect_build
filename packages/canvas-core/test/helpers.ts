import type { Defect, GlobalStyle, Mark, NPoint } from '../src/types.js';
import { DEFAULT_GLOBAL_STYLE } from '../src/style.js';

export const GS: GlobalStyle = DEFAULT_GLOBAL_STYLE;

export function mark(id: string, defectId: string, x: number, y: number, sortOrder = 0): Mark {
  return { id, defectId, type: 'POINT', geometry: { k: 'POINT', x, y }, sortOrder };
}

export function defect(
  id: string,
  seq: number,
  markAt: NPoint,
  labelAt: NPoint,
  over: Partial<Defect> = {},
): Defect {
  const m = mark(`${id}-m0`, id, markAt.x, markAt.y);
  return {
    id,
    projectId: 'p-test',
    drawingId: 'dw',
    floorId: 'f',
    seq,
    status: 'CURRENT',
    marks: [m],
    label: { defectId: id, x: labelAt.x, y: labelAt.y, anchorMarkId: m.id, placed: true },
    sketch: [],
    style: null,
    memberName: '슬래브',
    defectTypeName: '균열',
    widthMm: 0.2,
    lengthMm: 2500,
    areaM2: 0.0005,
    countEa: 1,
    memo: null,
    ...over,
  };
}
