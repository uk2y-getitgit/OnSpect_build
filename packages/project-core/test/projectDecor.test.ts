/**
 * D16 §5-3 — 도곽·범례 프로젝트 스코프 승격 + 읽기 정규화.
 *
 * 이 파일이 지키는 것:
 *   1. **이미 설정해 둔 도곽 값을 승격에서 잃지 않는다**
 *   2. 대표 도면 선택이 **결정론적**이다 (층 sortOrder → 도면 sortOrder → id)
 *   3. 옛 레코드(`undefined`)를 읽어도 기본값이 나온다 — 마이그레이션 0건의 근거
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_LEGEND,
  DEFAULT_PROJECT_TITLE_BLOCK,
  promoteProjectDecor,
  projectLegendOf,
  projectTitleBlockOf,
  type Drawing,
  type DrawingTitleBlock,
  type Floor,
  type Project,
} from '../src/index.js';

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    orgId: null,
    year: 2026,
    half: 'H1',
    kind: 'REGULAR',
    name: '○○아파트 3차',
    prevProjectId: null,
    clientName: null,
    periodFrom: null,
    periodTo: null,
    defaultStructureType: null,
    lastOpenedAt: 0,
    deletedAt: null,
    schemaVersion: 1,
    titleBlock: null,
    legend: null,
    createdAt: 0,
    updatedAt: 0,
    deviceId: 'dev',
    createdBy: null,
    ...over,
  };
}

function floor(id: string, sortOrder: number): Floor {
  return {
    id,
    projectId: 'p1',
    buildingId: 'b1',
    name: id,
    sortOrder,
    code: null,
    createdAt: 0,
    updatedAt: 0,
    deviceId: 'dev',
    createdBy: null,
  };
}

function drawing(id: string, floorId: string, over: Partial<Drawing> = {}): Drawing {
  return {
    id,
    projectId: 'p1',
    floorId,
    name: `${id} 위치도`,
    source: { kind: 'IMAGE', fileName: 'a.png', mime: 'image/png', byteSize: 1 },
    imageWidth: 1754,
    imageHeight: 1240,
    renderBlobKey: 'r',
    sourceBlobKey: 's',
    thumbBlobKey: 't',
    sortOrder: 0,
    imgLayout: null,
    imgScale: null,
    labelScale: null,
    titleBlock: null,
    legend: null,
    renormalizedAt: null,
    createdAt: 0,
    updatedAt: 0,
    deviceId: 'dev',
    createdBy: null,
    ...over,
  };
}

function tb(over: Partial<DrawingTitleBlock> = {}): DrawingTitleBlock {
  return {
    enabled: true,
    projectTitle: null,
    drawingName: null,
    scale: 'NONE',
    tbScale: 1,
    col0: 0.42,
    col1: 0.46,
    labelFontSz: 10,
    valueFontSz: 14,
    ...over,
  };
}

describe('promoteProjectDecor — 승격', () => {
  it('도면에 설정이 하나도 없으면 기본값으로 승격한다', () => {
    const r = promoteProjectDecor(project(), [drawing('d1', 'f1')], [floor('f1', 10)], 999)!;
    expect(r.titleBlock).toEqual(DEFAULT_PROJECT_TITLE_BLOCK);
    expect(r.legend).toEqual(DEFAULT_PROJECT_LEGEND);
    expect(r.updatedAt).toBe(999);
  });

  it('이미 승격된 용역은 건드리지 않는다 (null 을 돌려준다)', () => {
    const p = project({ titleBlock: DEFAULT_PROJECT_TITLE_BLOCK, legend: DEFAULT_PROJECT_LEGEND });
    expect(promoteProjectDecor(p, [drawing('d1', 'f1')], [floor('f1', 10)])).toBeNull();
  });

  it('설정해 둔 도곽 값을 그대로 가져오되 drawingName 은 뺀다', () => {
    const d = drawing('d1', 'f1', {
      titleBlock: tb({ tbScale: 1.4, scale: 'A=1:100', drawingName: '이 도면만의 이름' }),
      legend: { enabled: false, lgScale: 1.6 },
    });
    const r = promoteProjectDecor(project(), [d], [floor('f1', 10)])!;
    expect(r.titleBlock).toEqual({
      ...DEFAULT_PROJECT_TITLE_BLOCK,
      tbScale: 1.4,
      scale: 'A=1:100',
    });
    expect('drawingName' in (r.titleBlock as object)).toBe(false);
    expect(r.legend).toEqual({ ...DEFAULT_PROJECT_LEGEND, enabled: false, lgScale: 1.6 });
  });

  it('D15 상태 3종은 승격에서 켜지지 않는다 — 기존 출력물 무변경', () => {
    const d = drawing('d1', 'f1', { legend: { enabled: true, lgScale: 1 } });
    const r = promoteProjectDecor(project(), [d], [floor('f1', 10)])!;
    expect(r.legend).toMatchObject({
      showTypes: true,
      statusNew: false,
      statusPending: false,
      statusRepaired: false,
    });
  });

  /** ⭐ 결정론 — 입력 배열 순서가 결과를 바꾸면 안 된다 */
  it('대표 도면 = 층 sortOrder 가 가장 작은 것 (지하 음수가 먼저)', () => {
    const floors = [floor('fB1', -10), floor('f1', 10), floor('f2', 20)];
    const drawings = [
      drawing('dTop', 'f2', { titleBlock: tb({ tbScale: 2 }) }),
      drawing('dBase', 'fB1', { titleBlock: tb({ tbScale: 0.6 }) }),
      drawing('dMid', 'f1', { titleBlock: tb({ tbScale: 1.5 }) }),
    ];
    const a = promoteProjectDecor(project(), drawings, floors)!;
    const b = promoteProjectDecor(project(), [...drawings].reverse(), [...floors].reverse())!;
    expect(a.titleBlock?.tbScale).toBe(0.6);
    expect(b.titleBlock).toEqual(a.titleBlock);
  });

  it('설정이 없는 도면은 대표가 되지 않는다', () => {
    const floors = [floor('fB1', -10), floor('f1', 10)];
    const drawings = [
      drawing('dBase', 'fB1'), // titleBlock === null
      drawing('dMid', 'f1', { titleBlock: tb({ tbScale: 1.5 }) }),
    ];
    expect(promoteProjectDecor(project(), drawings, floors)!.titleBlock?.tbScale).toBe(1.5);
  });

  it('같은 층·같은 sortOrder 면 도면 id 사전순', () => {
    const drawings = [
      drawing('zz', 'f1', { titleBlock: tb({ tbScale: 2 }) }),
      drawing('aa', 'f1', { titleBlock: tb({ tbScale: 0.8 }) }),
    ];
    expect(promoteProjectDecor(project(), drawings, [floor('f1', 10)])!.titleBlock?.tbScale).toBe(
      0.8,
    );
  });

  it('도면이 하나도 없어도 터지지 않는다', () => {
    const r = promoteProjectDecor(project(), [], [])!;
    expect(r.titleBlock).toEqual(DEFAULT_PROJECT_TITLE_BLOCK);
  });

  /** 옛 레코드는 필드 자체가 없다 — `=== null` 로 보면 영영 승격이 안 된다 */
  it('undefined(옛 레코드)도 승격 대상이다', () => {
    const old = { ...project(), titleBlock: undefined, legend: undefined } as unknown as Project;
    expect(promoteProjectDecor(old, [], [])).not.toBeNull();
  });

  it('한쪽만 승격돼 있으면 나머지만 채운다', () => {
    const p = project({ titleBlock: { ...DEFAULT_PROJECT_TITLE_BLOCK, tbScale: 1.9 } });
    const r = promoteProjectDecor(p, [], [])!;
    expect(r.titleBlock?.tbScale).toBe(1.9);
    expect(r.legend).toEqual(DEFAULT_PROJECT_LEGEND);
  });

  it('입력 배열을 변형하지 않는다', () => {
    const drawings = [drawing('d1', 'f1'), drawing('d2', 'f2')];
    const copy = drawings.map((d) => d.id);
    promoteProjectDecor(project(), drawings, [floor('f1', 20), floor('f2', 10)]);
    expect(drawings.map((d) => d.id)).toEqual(copy);
  });
});

describe('읽기 정규화 — 마이그레이션 0건의 근거', () => {
  it('null·undefined 는 기본값', () => {
    expect(projectTitleBlockOf(null)).toEqual(DEFAULT_PROJECT_TITLE_BLOCK);
    expect(projectTitleBlockOf(undefined)).toEqual(DEFAULT_PROJECT_TITLE_BLOCK);
    expect(projectLegendOf(null)).toEqual(DEFAULT_PROJECT_LEGEND);
  });

  it('필드가 빠져 있어도 그 필드만 기본값으로 채운다', () => {
    expect(projectTitleBlockOf({ tbScale: 1.5 })).toEqual({
      ...DEFAULT_PROJECT_TITLE_BLOCK,
      tbScale: 1.5,
    });
    // D15 필드가 없는 옛 범례 → showTypes 만 true, 상태 3종은 false
    expect(projectLegendOf({ enabled: true, lgScale: 2 })).toEqual({
      ...DEFAULT_PROJECT_LEGEND,
      lgScale: 2,
    });
  });

  it('false 를 기본값으로 덮어쓰지 않는다 (`??` 이지 `||` 가 아니다)', () => {
    expect(projectTitleBlockOf({ enabled: false }).enabled).toBe(false);
    expect(projectLegendOf({ showTypes: false }).showTypes).toBe(false);
    expect(projectTitleBlockOf({ tbScale: 0 }).tbScale).toBe(0);
  });
});
