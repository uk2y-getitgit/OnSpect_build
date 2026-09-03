/**
 * 기기 간 프로젝트 이동 (D38, Q74) — id 그래프 재접합.
 *
 * 못박는 것:
 *   1. 번들 안의 모든 id가 새 id로 바뀐다(project·building·floor·drawing·defect·mark·memo·photo·itemSettings)
 *   2. 다른 필드는 스프레드로 원본 그대로 보존된다(속성·상태 등 한 글자도 안 바뀜)
 *   3. prevDefectId/prevProjectId — 번들 안이면 remap, 밖이면 원래 값 그대로(끊길 수 있음, 허용)
 *   4. blob 키(도면·사진)는 절대 안 바뀐다 — 이미 uuid라 충돌 없음(S6)
 *   5. itemSettings 내부 마스터(members 등)의 id는 절대 안 바뀐다 — 중첩 문서라 전역 유일성 불필요
 *   6. 번들 밖 id를 "필수" 참조로 쓰면(구성이 깨졌으면) 조용히 넘어가지 않고 던진다
 */
import { describe, expect, it } from 'vitest';
import { collectTransferBlobKeys, collectTransferIds, remapTransferBundle } from '../src/projectTransfer.js';

type Project = { id: string; prevProjectId: string | null; name: string };
type Building = { id: string; projectId: string; name: string };
type Floor = { id: string; projectId: string; buildingId: string; name: string };
type Drawing = {
  id: string;
  projectId: string;
  floorId: string;
  renderBlobKey: string;
  sourceBlobKey: string;
  thumbBlobKey: string;
};
type Mark = { id: string; defectId: string; type: string };
type Label = { defectId: string; anchorMarkId: string | null; x: number };
type Defect = {
  id: string;
  projectId: string;
  drawingId: string;
  floorId: string;
  prevDefectId: string | null;
  marks: Mark[];
  label: Label;
  status: string;
  memberId: string | null;
};
type Memo = { id: string; projectId: string; drawingId: string; floorId: string; text: string };
type Photo = {
  id: string;
  projectId: string;
  defectId: string;
  renderBlobKey: string;
  sourceBlobKey: string;
  thumbBlobKey: string;
};
type ItemSettings = {
  id: string;
  projectId: string | null;
  members: { id: string; name: string }[];
};

/**
 * `TransferBundle`(배열이 readonly)을 그대로 쓰지 않는다 — 테스트가 배열에 push 해서
 * 시나리오를 만드는 경우가 있다. 필드 타입은 위 타입 그대로라 `null` 도 `string | null` 로
 * 정확히 좁혀진다. 호출부에는 `readonly` 파라미터로 자연히 맞는다.
 */
type Bundle = {
  project: Project;
  buildings: Building[];
  floors: Floor[];
  drawings: Drawing[];
  defects: Defect[];
  memos: Memo[];
  photos: Photo[];
  itemSettings: ItemSettings | null;
};

function bundle(): Bundle {
  return {
    project: { id: 'p1', prevProjectId: null, name: '○○아파트' },
    buildings: [{ id: 'b1', projectId: 'p1', name: '본관' }],
    floors: [{ id: 'f1', projectId: 'p1', buildingId: 'b1', name: '1층' }],
    drawings: [
      {
        id: 'd1',
        projectId: 'p1',
        floorId: 'f1',
        renderBlobKey: 'blob-render-1',
        sourceBlobKey: 'blob-source-1',
        thumbBlobKey: 'blob-thumb-1',
      },
    ],
    defects: [
      {
        id: 'e1',
        projectId: 'p1',
        drawingId: 'd1',
        floorId: 'f1',
        prevDefectId: null,
        marks: [{ id: 'm1', defectId: 'e1', type: 'POINT' }],
        label: { defectId: 'e1', anchorMarkId: 'm1', x: 0.5 },
        status: 'CURRENT',
        memberId: 'member-1',
      },
    ],
    memos: [{ id: 'me1', projectId: 'p1', drawingId: 'd1', floorId: 'f1', text: '메모' }],
    photos: [
      {
        id: 'ph1',
        projectId: 'p1',
        defectId: 'e1',
        renderBlobKey: 'blob-photo-render-1',
        sourceBlobKey: 'blob-photo-source-1',
        thumbBlobKey: 'blob-photo-thumb-1',
      },
    ],
    itemSettings: { id: 'is1', projectId: 'p1', members: [{ id: 'member-1', name: '슬래브' }] },
  };
}

function idMapFor(ids: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const id of ids) m.set(id, `new-${id}`);
  return m;
}

describe('collectTransferIds', () => {
  it('번들 안의 모든 id를 중복 없이 모은다(마크 포함)', () => {
    const ids = collectTransferIds(bundle());
    expect(new Set(ids)).toEqual(new Set(['p1', 'b1', 'f1', 'd1', 'e1', 'm1', 'me1', 'ph1', 'is1']));
  });

  it('prevDefectId·prevProjectId는 넣지 않는다', () => {
    const b = bundle();
    b.project.prevProjectId = 'outside-project';
    b.defects[0]!.prevDefectId = 'outside-defect';
    const ids = collectTransferIds(b);
    expect(ids).not.toContain('outside-project');
    expect(ids).not.toContain('outside-defect');
  });

  it('itemSettings가 null이면 무시한다', () => {
    const b = bundle();
    b.itemSettings = null;
    const ids = collectTransferIds(b);
    expect(ids).not.toContain('is1');
  });
});

describe('remapTransferBundle', () => {
  it('모든 id·FK를 새 id로 잇는다', () => {
    const b = bundle();
    const idMap = idMapFor(collectTransferIds(b));
    const out = remapTransferBundle(b, idMap);

    expect(out.project.id).toBe('new-p1');
    expect(out.buildings[0]!.id).toBe('new-b1');
    expect(out.buildings[0]!.projectId).toBe('new-p1');
    expect(out.floors[0]!.id).toBe('new-f1');
    expect(out.floors[0]!.projectId).toBe('new-p1');
    expect(out.floors[0]!.buildingId).toBe('new-b1');
    expect(out.drawings[0]!.id).toBe('new-d1');
    expect(out.drawings[0]!.projectId).toBe('new-p1');
    expect(out.drawings[0]!.floorId).toBe('new-f1');
    expect(out.defects[0]!.id).toBe('new-e1');
    expect(out.defects[0]!.projectId).toBe('new-p1');
    expect(out.defects[0]!.drawingId).toBe('new-d1');
    expect(out.defects[0]!.floorId).toBe('new-f1');
    expect(out.defects[0]!.marks[0]!.id).toBe('new-m1');
    expect(out.defects[0]!.marks[0]!.defectId).toBe('new-e1');
    expect(out.defects[0]!.label.defectId).toBe('new-e1');
    expect(out.defects[0]!.label.anchorMarkId).toBe('new-m1');
    expect(out.memos[0]!.id).toBe('new-me1');
    expect(out.memos[0]!.projectId).toBe('new-p1');
    expect(out.memos[0]!.drawingId).toBe('new-d1');
    expect(out.memos[0]!.floorId).toBe('new-f1');
    expect(out.photos[0]!.id).toBe('new-ph1');
    expect(out.photos[0]!.projectId).toBe('new-p1');
    expect(out.photos[0]!.defectId).toBe('new-e1');
    expect(out.itemSettings!.id).toBe('new-is1');
    expect(out.itemSettings!.projectId).toBe('new-p1');
  });

  it('다른 필드는 원본 그대로 보존한다(속성·상태 등)', () => {
    const b = bundle();
    const idMap = idMapFor(collectTransferIds(b));
    const out = remapTransferBundle(b, idMap);

    expect(out.project.name).toBe('○○아파트');
    expect(out.defects[0]!.status).toBe('CURRENT');
    expect(out.defects[0]!.memberId).toBe('member-1'); // 항목설정 내부 참조 — 아래에서 검증
    expect(out.memos[0]!.text).toBe('메모');
    expect(out.floors[0]!.name).toBe('1층');
  });

  it('blob 키(도면·사진)는 절대 안 바뀐다', () => {
    const b = bundle();
    const idMap = idMapFor(collectTransferIds(b));
    const out = remapTransferBundle(b, idMap);

    expect(out.drawings[0]!.renderBlobKey).toBe('blob-render-1');
    expect(out.drawings[0]!.sourceBlobKey).toBe('blob-source-1');
    expect(out.drawings[0]!.thumbBlobKey).toBe('blob-thumb-1');
    expect(out.photos[0]!.renderBlobKey).toBe('blob-photo-render-1');
    expect(out.photos[0]!.sourceBlobKey).toBe('blob-photo-source-1');
    expect(out.photos[0]!.thumbBlobKey).toBe('blob-photo-thumb-1');
  });

  it('itemSettings 내부 마스터 id는 안 바뀐다 — defect.memberId가 계속 그 안의 id를 가리킨다', () => {
    const b = bundle();
    const idMap = idMapFor(collectTransferIds(b));
    const out = remapTransferBundle(b, idMap);

    expect(out.itemSettings!.members[0]!.id).toBe('member-1'); // 안 바뀜
    expect(out.defects[0]!.memberId).toBe('member-1'); // 여전히 같은 값 — 참조가 안 끊긴다
  });

  it('prevDefectId — 번들 안이면 remap, 밖이면 원래 값 그대로 둔다', () => {
    const inside = bundle();
    inside.defects[0]!.prevDefectId = null;
    // 번들 안의 다른 결함을 가리키는 케이스를 만든다
    inside.defects.push({
      id: 'e2',
      projectId: 'p1',
      drawingId: 'd1',
      floorId: 'f1',
      prevDefectId: 'e1',
      marks: [],
      label: { defectId: 'e2', anchorMarkId: null, x: 0.1 },
      status: 'PREV_PENDING',
      memberId: null,
    });
    const idMap = idMapFor(collectTransferIds(inside));
    const out = remapTransferBundle(inside, idMap);
    expect(out.defects.find((d) => d.id === 'new-e2')!.prevDefectId).toBe('new-e1');

    const outside = bundle();
    outside.defects[0]!.prevDefectId = 'defect-from-another-project-not-exported';
    const idMap2 = idMapFor(collectTransferIds(outside));
    const out2 = remapTransferBundle(outside, idMap2);
    expect(out2.defects[0]!.prevDefectId).toBe('defect-from-another-project-not-exported');
  });

  it('project.prevProjectId — 번들 밖이면 원래 값 그대로 둔다', () => {
    const b = bundle();
    b.project.prevProjectId = 'prev-round-project-not-exported';
    const idMap = idMapFor(collectTransferIds(b));
    const out = remapTransferBundle(b, idMap);
    expect(out.project.prevProjectId).toBe('prev-round-project-not-exported');
  });

  it('itemSettings가 null이면 그대로 null이다', () => {
    const b = bundle();
    b.itemSettings = null;
    const idMap = idMapFor(collectTransferIds(b));
    const out = remapTransferBundle(b, idMap);
    expect(out.itemSettings).toBeNull();
  });

  it('itemSettings.projectId가 null(ORG 스코프)이면 remap하지 않고 null 그대로 둔다', () => {
    const b = bundle();
    b.itemSettings = { id: 'is-org', projectId: null, members: [] };
    const idMap = idMapFor(collectTransferIds(b));
    const out = remapTransferBundle(b, idMap);
    expect(out.itemSettings!.id).toBe('new-is-org');
    expect(out.itemSettings!.projectId).toBeNull();
  });

  it('번들 구성이 깨졌으면(필수 참조가 idMap에 없으면) 조용히 넘어가지 않고 던진다', () => {
    const b = bundle();
    const idMap = idMapFor(collectTransferIds(b));
    (idMap as Map<string, string>).delete('m1'); // 마크가 idMap에서 빠진 상태를 흉내
    expect(() => remapTransferBundle(b, idMap)).toThrow();
  });
});

describe('collectTransferBlobKeys', () => {
  it('도면·사진의 blob 키를 전부 모은다(중복 없음)', () => {
    const b = bundle();
    // 같은 키를 재사용하는 흔한 경우(원본이 작아 렌더본과 같은 키) — 중복 제거 확인
    b.photos[0]!.thumbBlobKey = b.photos[0]!.renderBlobKey;
    const keys = collectTransferBlobKeys(b);
    expect(new Set(keys)).toEqual(
      new Set(['blob-render-1', 'blob-source-1', 'blob-thumb-1', 'blob-photo-render-1', 'blob-photo-source-1']),
    );
  });
});
