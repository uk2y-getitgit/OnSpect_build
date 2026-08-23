/**
 * S3 항목 계층 단위테스트 — 스펙 §5 "완료 확인" 과 code-reviewer 경계 조건을 그대로 옮겼다.
 */
import { describe, expect, it } from 'vitest';
import {
  addCause,
  addDefectType,
  addMember,
  addRepair,
  causesOf,
  countOf,
  createOrgSettings,
  defaultCauseOf,
  defaultRepairOf,
  defectTypesOf,
  deleteMaster,
  describeMergeResult,
  ITEM_STEP,
  masterUsage,
  membersOf,
  mergeSeedInto,
  nextCauseCode,
  promoteToOrg,
  renameMaster,
  reorderCauses,
  reorderMembers,
  repairsOf,
  SEED_CAUSES,
  SEED_DEFECT_TYPES,
  SEED_MEMBERS,
  SEED_REPAIRS,
  setCauseCode,
  setDefaultCause,
  setLinkSizeMode,
  sizeModeOf,
  snapshotForProject,
  toggleMemberFavorite,
  unlinkCause,
  unlinkDefectType,
  type ItemSettings,
} from '../src/index.js';

const NOW = 1_700_000_000_000;

function org(): ItemSettings {
  return createOrgSettings('dev-1', NOW);
}

/** 결정적 id 생성기 — 테스트가 읽히도록 */
function gen(prefix = 'new'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

// ── 씨앗 (S3-T2 완료 확인) ─────────────────────────────────────────────────
describe('씨앗', () => {
  it('부재 17 · 결함유형 13 · 원인 4 · 보수방안 5 를 만든다', () => {
    const s = org();
    expect(s.members).toHaveLength(17);
    expect(s.defectTypes).toHaveLength(13);
    expect(s.causes).toHaveLength(4);
    expect(s.repairs).toHaveLength(5);
    expect(SEED_MEMBERS).toHaveLength(17);
    expect(SEED_DEFECT_TYPES).toHaveLength(13);
    expect(SEED_CAUSES).toHaveLength(4);
    expect(SEED_REPAIRS).toHaveLength(5);
  });

  it('부재 × 결함유형 링크가 221건이다', () => {
    expect(org().linkMemberDefectType).toHaveLength(17 * 13);
  });

  it('구조유형 3탭 모두에 부재 17종이 깔린다', () => {
    const s = org();
    expect(membersOf(s, 'RC')).toHaveLength(17);
    expect(membersOf(s, 'SS')).toHaveLength(17);
    expect(membersOf(s, 'SRC')).toHaveLength(17);
    expect(s.linkStructureMember).toHaveLength(51);
  });

  it('membersOf 는 sortOrder 순이고 씨앗 표 순서와 같다', () => {
    const names = membersOf(org(), 'RC').map((m) => m.name);
    expect(names[0]).toBe('벽(구조체)');
    expect(names[8]).toBe('계단참 슬래브');
    expect(names[16]).toBe('경계석');
  });

  it('즐겨찾기는 정렬을 바꾸지 않는다 (F19)', () => {
    let s = org();
    const first = membersOf(s, 'RC')[0]!;
    s = toggleMemberFavorite(s, 'RC', first.id, NOW + 1);
    const after = membersOf(s, 'RC');
    expect(after[0]!.id).toBe(first.id);
    expect(after[0]!.favorite).toBe(false);
    // 다른 탭은 그대로다 — 링크는 (구조유형, 부재) 단위다
    expect(membersOf(s, 'SS')[0]!.favorite).toBe(true);
  });

  it('규모모드 기본값이 실측표와 같다', () => {
    const s = org();
    const wall = membersOf(s, 'RC')[0]!;
    const types = defectTypesOf(s, wall.id);
    expect(types.find((t) => t.name === '수직균열')!.sizeMode).toBe('WL');
    expect(types.find((t) => t.name === '망상균열')!.sizeMode).toBe('AREA');
    expect(types.find((t) => t.name === '접합부 이격')!.sizeMode).toBe('WL');
    expect(types.find((t) => t.name === '철근노출')!.sizeMode).toBe('AREA');
  });

  it('결함유형마다 원인 4 · 보수방안 5 가 붙고 기본값이 정확히 1개다', () => {
    const s = org();
    for (const d of s.defectTypes) {
      const cs = causesOf(s, d.id);
      const rs = repairsOf(s, d.id);
      expect(cs).toHaveLength(4);
      expect(rs).toHaveLength(5);
      expect(cs.filter((c) => c.isDefault)).toHaveLength(1);
      expect(rs.filter((r) => r.isDefault)).toHaveLength(1);
      expect(defaultCauseOf(s, d.id)!.name).toBe('건조수축');
      expect(defaultRepairOf(s, d.id)!.name).toBe('표면처리공법');
    }
  });

  it('발생원인 코드번호는 문서 안에서 유일하다', () => {
    const codes = org().causes.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(nextCauseCode(org())).toBe(5);
  });

  it('없는 부재의 결함유형은 빈 배열이다', () => {
    expect(defectTypesOf(org(), 'nope')).toEqual([]);
    expect(causesOf(org(), 'nope')).toEqual([]);
    expect(defaultCauseOf(org(), 'nope')).toBeNull();
  });

  it('countOf 는 전체와 ★ 를 나눠 센다 (F20)', () => {
    let s = org();
    const rc = membersOf(s, 'RC');
    expect(countOf(rc)).toEqual({ total: 17, favorite: 17 });
    s = toggleMemberFavorite(s, 'RC', rc[0]!.id, NOW + 1);
    expect(countOf(membersOf(s, 'RC'))).toEqual({ total: 17, favorite: 16 });
  });
});

// ── 함정 #4 (§2-5-c) ──────────────────────────────────────────────────────
describe('추가 — 마스터를 두 번 만들지 않는다 (함정 #4)', () => {
  it('결함유형 13개에 같은 이름을 추가해도 마스터는 1건, 코드번호도 1개다', () => {
    let s = org();
    // 먼저 씨앗 원인을 전부 지워 빈 목록에서 시작한다
    for (const c of [...s.causes]) s = deleteMaster(s, 'CAUSE', c.id, NOW);
    expect(s.causes).toHaveLength(0);

    const id = gen('cause');
    for (const d of s.defectTypes) {
      const r = addCause(s, { defectTypeId: d.id, name: '건조수축', now: NOW, newId: id });
      expect(r.ok).toBe(true);
      if (r.ok) s = r.settings;
    }
    expect(s.causes).toHaveLength(1);
    expect(s.causes[0]!.code).toBe(1);
    expect(s.linkDefectTypeCause).toHaveLength(13);
    // 두 번째부터는 "기존 항목을 연결했다"고 알려야 한다
    const again = addCause(s, {
      defectTypeId: s.defectTypes[0]!.id,
      name: ' 건조수축 ',
      now: NOW,
      newId: id,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('DUPLICATE_IN_LIST');
  });

  it('마스터에 있고 이 목록에 없으면 링크만 만든다', () => {
    let s = org();
    const wall = membersOf(s, 'RC')[0]!;
    s = unlinkDefectType(s, wall.id, defectTypesOf(s, wall.id)[0]!.id, NOW);
    expect(defectTypesOf(s, wall.id)).toHaveLength(12);

    const before = s.defectTypes.length;
    const r = addDefectType(s, { memberId: wall.id, name: '수직균열', now: NOW, newId: gen() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linkedExisting).toBe(true);
    expect(r.settings.defectTypes).toHaveLength(before);
    expect(defectTypesOf(r.settings, wall.id)).toHaveLength(13);
  });

  it('이름이 다르면 마스터를 새로 만들고 목록 끝에 붙인다', () => {
    const s = org();
    const r = addMember(s, { structureType: 'RC', name: '옹벽', now: NOW, newId: gen('m') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linkedExisting).toBe(false);
    expect(r.settings.members).toHaveLength(18);
    const list = membersOf(r.settings, 'RC');
    expect(list).toHaveLength(18);
    expect(list[17]!.name).toBe('옹벽');
    // 다른 탭에는 안 붙는다
    expect(membersOf(r.settings, 'SS')).toHaveLength(17);
  });

  it('빈 이름 · 40자 초과는 거부한다', () => {
    const s = org();
    expect(addMember(s, { structureType: 'RC', name: '   ', now: NOW, newId: gen() }).ok).toBe(false);
    const long = 'ㄱ'.repeat(41);
    const r = addMember(s, { structureType: 'RC', name: long, now: NOW, newId: gen() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('TOO_LONG');
  });

  it('새 원인의 코드번호는 max+1 이다', () => {
    const s = org();
    const r = addCause(s, {
      defectTypeId: s.defectTypes[0]!.id,
      name: '동결융해',
      now: NOW,
      newId: gen('c'),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.settings.causes.find((c) => c.name === '동결융해')!.code).toBe(5);
  });

  it('빈 목록에 처음 추가한 원인·보수방안은 자동으로 기본값이 된다', () => {
    let s = org();
    const d = s.defectTypes[0]!;
    for (const c of causesOf(s, d.id)) s = unlinkCause(s, d.id, c.id, NOW);
    expect(causesOf(s, d.id)).toHaveLength(0);
    expect(defaultCauseOf(s, d.id)).toBeNull();

    const r = addCause(s, { defectTypeId: d.id, name: '동결융해', now: NOW, newId: gen('c') });
    expect(r.ok).toBe(true);
    if (r.ok) expect(defaultCauseOf(r.settings, d.id)!.name).toBe('동결융해');

    const rr = addRepair(s, { defectTypeId: d.id, name: '주입공법', now: NOW, newId: gen('r') });
    expect(rr.ok).toBe(true);
  });
});

// ── 삭제 (§2-5-d) ─────────────────────────────────────────────────────────
describe('삭제', () => {
  it('마스터 삭제가 그 마스터를 가리키는 링크를 전부 지운다', () => {
    const s = org();
    const wall = membersOf(s, 'RC')[0]!;
    const usage = masterUsage(s, 'MEMBER', wall.id);
    expect(usage.links).toBe(3); // RC · SS · SRC
    expect(usage.owners).toBe(3);

    const after = deleteMaster(s, 'MEMBER', wall.id, NOW);
    expect(after.members).toHaveLength(16);
    expect(after.linkStructureMember.some((l) => l.memberId === wall.id)).toBe(false);
    expect(after.linkMemberDefectType.some((l) => l.memberId === wall.id)).toBe(false);
    expect(membersOf(after, 'SS')).toHaveLength(16);
  });

  it('원인 마스터 삭제는 결함유형 13개 목록에서 함께 사라진다', () => {
    const s = org();
    const cause = s.causes[0]!;
    expect(masterUsage(s, 'CAUSE', cause.id).owners).toBe(13);
    const after = deleteMaster(s, 'CAUSE', cause.id, NOW);
    for (const d of after.defectTypes) {
      expect(causesOf(after, d.id).some((c) => c.id === cause.id)).toBe(false);
      // 기본값이던 건조수축이 사라지면 남은 첫 항목이 기본값이 된다
      expect(causesOf(after, d.id).filter((c) => c.isDefault)).toHaveLength(1);
      expect(defaultCauseOf(after, d.id)!.name).toBe('하중변화');
    }
  });

  it('링크만 빼면 마스터와 다른 연결은 그대로다', () => {
    const s = org();
    const wall = membersOf(s, 'RC')[0]!;
    const after = unlinkDefectType(s, wall.id, defectTypesOf(s, wall.id)[3]!.id, NOW);
    expect(after.defectTypes).toHaveLength(13);
    expect(defectTypesOf(after, wall.id)).toHaveLength(12);
    const other = membersOf(after, 'RC')[1]!;
    expect(defectTypesOf(after, other.id)).toHaveLength(13);
  });

  it('기본값을 빼면 남은 첫 항목이 기본값이 된다. 다 빼면 기본값이 없다', () => {
    let s = org();
    const d = s.defectTypes[0]!;
    const list = causesOf(s, d.id);
    expect(list[0]!.isDefault).toBe(true);
    s = unlinkCause(s, d.id, list[0]!.id, NOW);
    expect(defaultCauseOf(s, d.id)!.id).toBe(list[1]!.id);
    for (const c of causesOf(s, d.id)) s = unlinkCause(s, d.id, c.id, NOW);
    expect(defaultCauseOf(s, d.id)).toBeNull();
  });

  it('결함유형 마스터를 지우면 그 원인·보수방안 링크도 사라진다', () => {
    const s = org();
    const d = s.defectTypes[0]!;
    const after = deleteMaster(s, 'DEFECT_TYPE', d.id, NOW);
    expect(after.linkDefectTypeCause.some((l) => l.defectTypeId === d.id)).toBe(false);
    expect(after.linkDefectTypeRepair.some((l) => l.defectTypeId === d.id)).toBe(false);
    expect(after.linkMemberDefectType.some((l) => l.defectTypeId === d.id)).toBe(false);
    expect(after.causes).toHaveLength(4); // 마스터는 남는다
  });
});

// ── 규모모드 · 코드번호 · 이름 ────────────────────────────────────────────
describe('링크 속성', () => {
  it('규모모드는 그 (부재, 결함유형) 조합에서만 바뀐다', () => {
    const s = org();
    const a = membersOf(s, 'RC')[0]!;
    const b = membersOf(s, 'RC')[1]!;
    const mesh = defectTypesOf(s, a.id).find((t) => t.name === '망상균열')!;
    const after = setLinkSizeMode(s, a.id, mesh.id, 'WL', NOW);
    expect(sizeModeOf(after, a.id, mesh.id)).toBe('WL');
    expect(sizeModeOf(after, b.id, mesh.id)).toBe('AREA');
    // 마스터 기본값은 손대지 않는다
    expect(after.defectTypes.find((d) => d.id === mesh.id)!.defaultSizeMode).toBe('AREA');
  });

  it('코드번호 중복은 거부한다', () => {
    const s = org();
    const dup = setCauseCode(s, s.causes[1]!.id, s.causes[0]!.code, NOW);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe('DUPLICATE_CODE');
    const ok = setCauseCode(s, s.causes[1]!.id, 9, NOW);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.settings.causes[1]!.code).toBe(9);
    expect(setCauseCode(s, s.causes[1]!.id, 0, NOW).ok).toBe(false);
    expect(setCauseCode(s, s.causes[1]!.id, 1.5, NOW).ok).toBe(false);
  });

  it('이름을 다른 마스터와 같게 바꾸는 것은 거부한다', () => {
    const s = org();
    const r = renameMaster(s, 'MEMBER', s.members[0]!.id, '기둥', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('DUPLICATE_NAME');
    const ok = renameMaster(s, 'MEMBER', s.members[0]!.id, '벽체', NOW);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(membersOf(ok.settings, 'RC')[0]!.name).toBe('벽체');
  });

  it('기본값 지정은 그 결함유형 안에서만 옮겨 간다', () => {
    const s = org();
    const d0 = s.defectTypes[0]!;
    const d1 = s.defectTypes[1]!;
    const target = causesOf(s, d0.id)[2]!;
    const after = setDefaultCause(s, d0.id, target.id, NOW);
    expect(defaultCauseOf(after, d0.id)!.id).toBe(target.id);
    expect(causesOf(after, d0.id).filter((c) => c.isDefault)).toHaveLength(1);
    expect(defaultCauseOf(after, d1.id)!.name).toBe('건조수축');
  });
});

// ── 정렬 ──────────────────────────────────────────────────────────────────
describe('드래그 정렬', () => {
  it('맨 아래 항목을 맨 위로 옮기면 표시 순서가 그대로 반영된다', () => {
    const s = org();
    const before = membersOf(s, 'RC').map((m) => m.name);
    const after = reorderMembers(s, 'RC', membersOf(s, 'RC')[16]!.id, 0, NOW);
    const names = membersOf(after, 'RC').map((m) => m.name);
    expect(names[0]).toBe(before[16]);
    expect(names[1]).toBe(before[0]);
    expect(names).toHaveLength(17);
  });

  it('재배치 후 sortOrder 가 10 격자로 다시 매겨진다', () => {
    const after = reorderMembers(org(), 'RC', membersOf(org(), 'RC')[5]!.id, 0, NOW);
    const orders = after.linkStructureMember
      .filter((l) => l.structureType === 'RC')
      .map((l) => l.sortOrder)
      .sort((a, b) => a - b);
    expect(orders[0]).toBe(ITEM_STEP);
    expect(orders[16]).toBe(17 * ITEM_STEP);
  });

  it('한 탭을 정렬해도 다른 탭 순서는 그대로다', () => {
    const s = org();
    const after = reorderMembers(s, 'RC', membersOf(s, 'RC')[16]!.id, 0, NOW);
    expect(membersOf(after, 'SS').map((m) => m.name)).toEqual(
      membersOf(s, 'SS').map((m) => m.name),
    );
  });

  it('원인 정렬은 기본값 표시를 흔들지 않는다', () => {
    const s = org();
    const d = s.defectTypes[0]!;
    const after = reorderCauses(s, d.id, causesOf(s, d.id)[3]!.id, 0, NOW);
    expect(causesOf(after, d.id).filter((c) => c.isDefault)).toHaveLength(1);
    expect(defaultCauseOf(after, d.id)!.name).toBe('건조수축');
  });
});

// ── 스냅샷 격리 (불변식 #7) ───────────────────────────────────────────────
describe('스냅샷', () => {
  it('용역 A 에서 지운 항목이 용역 B 에는 남아 있다', () => {
    const base = org();
    const a = snapshotForProject(base, { projectId: 'p-a', deviceId: 'dev-1', now: NOW + 1 });
    const b = snapshotForProject(base, { projectId: 'p-b', deviceId: 'dev-1', now: NOW + 2 });
    const dt = a.defectTypes.find((d) => d.name === '수직균열')!;
    const a2 = deleteMaster(a, 'DEFECT_TYPE', dt.id, NOW + 3);

    expect(a2.defectTypes.some((d) => d.name === '수직균열')).toBe(false);
    expect(b.defectTypes.some((d) => d.name === '수직균열')).toBe(true);
    expect(base.defectTypes.some((d) => d.name === '수직균열')).toBe(true);
  });

  it('용역 A 의 이름 변경이 용역 B 와 ORG 에 번지지 않는다', () => {
    const base = org();
    const a = snapshotForProject(base, { projectId: 'p-a', deviceId: 'dev-1', now: NOW + 1 });
    const b = snapshotForProject(base, { projectId: 'p-b', deviceId: 'dev-1', now: NOW + 2 });
    const r = renameMaster(a, 'MEMBER', a.members[0]!.id, '벽체', NOW + 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(membersOf(r.settings, 'RC')[0]!.name).toBe('벽체');
    expect(membersOf(b, 'RC')[0]!.name).toBe('벽(구조체)');
    expect(membersOf(base, 'RC')[0]!.name).toBe('벽(구조체)');
  });

  it('스냅샷은 원본과 객체를 공유하지 않는다', () => {
    const base = org();
    const a = snapshotForProject(base, { projectId: 'p-a', deviceId: 'dev-1', now: NOW + 1 });
    expect(a.members[0]).not.toBe(base.members[0]);
    expect(a.linkMemberDefectType[0]).not.toBe(base.linkMemberDefectType[0]);
    expect(a.snapshotFrom).toBe(base.updatedAt);
    expect(a.scope).toBe('PROJECT');
    expect(a.projectId).toBe('p-a');
    expect(a.id).toBe('p-a');
  });

  it('기본값으로 승격해도 이미 스냅샷을 가진 용역은 바뀌지 않는다 (F2)', () => {
    const base = org();
    const a = snapshotForProject(base, { projectId: 'p-a', deviceId: 'dev-1', now: NOW + 1 });
    const b = snapshotForProject(base, { projectId: 'p-b', deviceId: 'dev-1', now: NOW + 2 });
    const r = renameMaster(a, 'MEMBER', a.members[0]!.id, '벽체', NOW + 3);
    if (!r.ok) throw new Error('rename failed');
    const newOrg = promoteToOrg(r.settings, base, { deviceId: 'dev-1', now: NOW + 4 });

    expect(newOrg.id).toBe('ORG');
    expect(newOrg.scope).toBe('ORG');
    expect(newOrg.projectId).toBeNull();
    expect(newOrg.snapshotFrom).toBeNull();
    expect(newOrg.createdAt).toBe(base.createdAt);
    expect(membersOf(newOrg, 'RC')[0]!.name).toBe('벽체');
    // 이미 만들어진 용역 B 는 그대로
    expect(membersOf(b, 'RC')[0]!.name).toBe('벽(구조체)');
    // 이후 만드는 용역은 새 이름을 받는다
    const c = snapshotForProject(newOrg, { projectId: 'p-c', deviceId: 'dev-1', now: NOW + 5 });
    expect(membersOf(c, 'RC')[0]!.name).toBe('벽체');
  });
});

// ── 다시 불러오기 (§2-7-e) ────────────────────────────────────────────────
describe('기본 항목 세트 다시 불러오기', () => {
  it('아무것도 지우지 않았으면 추가되는 것이 없다 (멱등)', () => {
    const s = org();
    const r = mergeSeedInto(s, NOW + 1);
    expect(r.added).toEqual({ members: 0, defectTypes: 0, causes: 0, repairs: 0, links: 0 });
    expect(r.settings.members).toHaveLength(17);
    expect(describeMergeResult(r.added)).toContain('추가한 항목이 없습니다');
  });

  it('지운 부재만 되살아나고 사용자가 고친 이름은 그대로다', () => {
    let s = org();
    const wall = s.members[0]!;
    s = deleteMaster(s, 'MEMBER', s.members[2]!.id, NOW); // 기둥 삭제
    const r0 = renameMaster(s, 'MEMBER', wall.id, '벽체', NOW);
    if (!r0.ok) throw new Error('rename failed');
    s = r0.settings;

    const r = mergeSeedInto(s, NOW + 1);
    expect(r.added.members).toBe(1);
    expect(describeMergeResult(r.added)).toBe('부재 1개를 추가했습니다.');
    expect(r.settings.members).toHaveLength(17);
    // 이름을 고친 항목은 되돌아가지 않는다
    expect(r.settings.members.find((m) => m.id === wall.id)!.name).toBe('벽체');
    // 되살아난 부재는 3개 탭 전부와 결함유형 13종에 연결된다
    const revived = r.settings.members.find((m) => m.name === '기둥')!;
    expect(defectTypesOf(r.settings, revived.id)).toHaveLength(13);
    expect(membersOf(r.settings, 'RC').some((m) => m.id === revived.id)).toBe(true);
    expect(membersOf(r.settings, 'SRC').some((m) => m.id === revived.id)).toBe(true);
  });

  it('사용자가 정리한 링크는 되살리지 않는다', () => {
    let s = org();
    const wall = membersOf(s, 'RC')[0]!;
    s = unlinkDefectType(s, wall.id, defectTypesOf(s, wall.id)[0]!.id, NOW);
    const r = mergeSeedInto(s, NOW + 1);
    expect(defectTypesOf(r.settings, wall.id)).toHaveLength(12);
    expect(r.added.links).toBe(0);
  });

  it('결함유형을 되살리면 원인·보수방안 목록과 기본값이 함께 붙는다', () => {
    let s = org();
    const dt = s.defectTypes[0]!;
    s = deleteMaster(s, 'DEFECT_TYPE', dt.id, NOW);
    const r = mergeSeedInto(s, NOW + 1);
    const revived = r.settings.defectTypes.find((d) => d.name === '수직균열')!;
    expect(causesOf(r.settings, revived.id)).toHaveLength(4);
    expect(repairsOf(r.settings, revived.id)).toHaveLength(5);
    expect(defaultCauseOf(r.settings, revived.id)).not.toBeNull();
    expect(defectTypesOf(r.settings, membersOf(r.settings, 'RC')[0]!.id)).toHaveLength(13);
  });

  it('같은 이름의 항목을 사용자가 직접 만들었으면 중복 생성하지 않는다', () => {
    let s = org();
    s = deleteMaster(s, 'CAUSE', s.causes[0]!.id, NOW);
    const add = addCause(s, {
      defectTypeId: s.defectTypes[0]!.id,
      name: '건조수축',
      now: NOW,
      newId: gen('c'),
    });
    if (!add.ok) throw new Error('add failed');
    const r = mergeSeedInto(add.settings, NOW + 1);
    expect(r.added.causes).toBe(0);
    expect(r.settings.causes.filter((c) => c.name === '건조수축')).toHaveLength(1);
  });
});
