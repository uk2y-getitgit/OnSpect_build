/**
 * 파일명에서 동·층 추출 — 리더 확정 추가 범위 (테스트 편의).
 *
 * 사용자 샘플이 `강당-지상1층.png` 형식이라 **동과 층이 파일명에 들어 있다.**
 * 도면 여러 장을 한 번에 올릴 때 파싱해 **제안값으로 채운다.**
 *
 * ⚠️ 규칙 세 가지 — 어기면 조용한 오류가 된다.
 *   1. **제안이지 확정이 아니다.** 결과를 표로 보여주고 사용자가 고칠 수 있어야 한다
 *   2. **파싱 실패는 빈 칸으로 둔다.** 조용히 틀린 값을 넣지 않는다
 *   3. 층 표기 해석은 `floorOrder.parseFloorName()` 을 **재사용**한다. 규칙을 두 벌 쓰지 않는다
 *
 * 순수 함수다. `File` 객체를 모르고 파일명 문자열만 받는다 (경계 규칙 9).
 */
import { parseFloorName } from './floorOrder.js';

export type FileNameGuess = {
  /** 확장자·중복표시를 뗀 원본 */
  stem: string;
  /** 제안 동 이름. null = 파싱 실패 → 사용자가 지정한다 */
  buildingName: string | null;
  /** 제안 층 이름. null = 파싱 실패 → 사용자가 지정한다 */
  floorName: string | null;
};

/** 지원 구분자 — `{동}-{층}` `{동}_{층}` `{동} {층}` */
const SEPARATORS = ['-', '_', ' '];

function stripExtension(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** `강당-지상1층 (1).png` 처럼 브라우저가 붙인 중복 표시를 뗀다 */
function stripDuplicateSuffix(stem: string): string {
  return stem.replace(/\s*\(\d+\)\s*$/, '').replace(/\s*-\s*복사본\s*$/, '').trim();
}

/**
 * `강당-지상1층.png` → `{ buildingName: '강당', floorName: '지상1층' }`
 * `지하1층.png`      → `{ buildingName: null,  floorName: '지하1층' }`
 * `scan_0001.png`    → `{ buildingName: null,  floorName: null }`  ← 빈 칸으로 둔다
 */
export function parseDrawingFileName(fileName: string): FileNameGuess {
  const stem = stripDuplicateSuffix(stripExtension(fileName));
  if (stem === '') return { stem, buildingName: null, floorName: null };

  // 오른쪽 구분자부터 시도한다. 층 토큰은 대개 맨 뒤에 있고 구분자를 포함하지 않는다
  const cuts: number[] = [];
  for (let i = 0; i < stem.length; i += 1) {
    if (SEPARATORS.includes(stem[i]!)) cuts.push(i);
  }
  for (let i = cuts.length - 1; i >= 0; i -= 1) {
    const at = cuts[i]!;
    const left = stem.slice(0, at).trim();
    const right = stem.slice(at + 1).trim();
    if (left === '' || right === '') continue;
    if (parseFloorName(right).kind !== 'UNKNOWN') {
      return { stem, buildingName: left, floorName: right };
    }
  }

  // 구분자 없음 — 전체가 층 이름인 경우 (`{층}.png`, 동이 1개일 때)
  if (parseFloorName(stem).kind !== 'UNKNOWN') {
    return { stem, buildingName: null, floorName: stem };
  }

  return { stem, buildingName: null, floorName: null };
}

export type NamedRecord = { id: string; name: string };

function squashName(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/**
 * 층 이름으로 기존 층을 찾는다.
 * 1) 공백·대소문자를 무시한 완전 일치
 * 2) 둘 다 파싱에 성공하고 sortOrder 가 같으면 같은 층 (`1층` ↔ `지상1층` ↔ `1F`)
 */
export function matchFloorByName<T extends NamedRecord>(
  floors: readonly T[],
  name: string,
): T | null {
  const q = squashName(name);
  const exact = floors.find((f) => squashName(f.name) === q);
  if (exact) return exact;

  const p = parseFloorName(name);
  if (p.kind === 'UNKNOWN') return null;
  return (
    floors.find((f) => {
      const fp = parseFloorName(f.name);
      return fp.kind !== 'UNKNOWN' && fp.sortOrder === p.sortOrder;
    }) ?? null
  );
}

/**
 * 동 이름으로 기존 동을 찾는다 — **완전 일치만.**
 * 동 이름은 정렬 어휘가 아니라 고유명사라 느슨하게 맞추면 엉뚱한 동에 붙는다.
 */
export function matchBuildingByName<T extends NamedRecord>(
  buildings: readonly T[],
  name: string,
): T | null {
  const q = squashName(name);
  return buildings.find((b) => squashName(b.name) === q) ?? null;
}
