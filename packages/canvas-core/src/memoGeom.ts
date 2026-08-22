/**
 * 메모의 기하 · 줄바꿈 — §S2a-1 / §S2a-6.
 *
 * ⚠️ **메모는 결함이 아니다.** 결함 리스트에 나타나지 않고, 결함 상태색을 쓰지 않는다.
 *
 * 코어는 텍스트 폭을 실측할 수 없다(`document` 금지 — 경계 규칙 1).
 * 그래서 글자 수 기준으로 줄을 나누고, **렌더와 히트가 같은 근사값을 쓴다.**
 * 근사가 틀려도 두 곳이 같이 틀리므로 "클릭은 잡히는데 그림은 딴 데" 가 생기지 않는다.
 */
import {
  MEMO_BG,
  MEMO_BORDER,
  MEMO_CHARS_PER_LINE,
  MEMO_FONT,
  MEMO_LINE_FACTOR,
  MEMO_MAX_LINES,
  MEMO_MIN_H_PX,
  MEMO_MIN_W_PX,
  MEMO_PAD,
  MEMO_TEXT,
  MEMO_W,
} from './constants.js';
import { toScreen } from './geometry.js';
import type { SRect } from './shapes.js';
import type { Memo, MemoStyle, SPoint, Viewport } from './types.js';

export type ResolvedMemoStyle = {
  color: string;
  background: string;
  border: string;
  fontScale: number;
};

export function resolveMemoStyle(s: MemoStyle | null | undefined): ResolvedMemoStyle {
  return {
    color: s?.color ?? MEMO_TEXT,
    background: s?.background ?? MEMO_BG,
    border: s?.border ?? MEMO_BORDER,
    fontScale: s?.fontScale ?? 1,
  };
}

/**
 * 글자 수 기준 줄바꿈.
 * 한국어는 `word-break: keep-all` 과 같은 정신으로 **어절 단위**를 먼저 시도하고,
 * 한 어절이 줄 폭보다 길 때만 강제로 자른다 (`break-all` 로 항상 자르지 않는다).
 */
export function wrapMemoText(text: string, charsPerLine = MEMO_CHARS_PER_LINE): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of rawLine.split(/(\s+)/)) {
      if (word === '') continue;
      if (line === '' && /^\s+$/.test(word)) continue;
      if (line.length + word.length <= charsPerLine) {
        line += word;
        continue;
      }
      if (line !== '') {
        out.push(line.trimEnd());
        line = '';
      }
      let rest = word.trimStart();
      while (rest.length > charsPerLine) {
        out.push(rest.slice(0, charsPerLine));
        rest = rest.slice(charsPerLine);
      }
      line = rest;
    }
    if (line !== '') out.push(line.trimEnd());
  }
  return out.length > 0 ? out : [''];
}

/** 표시용 줄. 최대 줄 수를 넘으면 마지막 줄에 말줄임을 붙인다 */
export function memoLines(text: string): string[] {
  const all = wrapMemoText(text);
  if (all.length <= MEMO_MAX_LINES) return all;
  const kept = all.slice(0, MEMO_MAX_LINES);
  const last = kept[MEMO_MAX_LINES - 1] ?? '';
  kept[MEMO_MAX_LINES - 1] = `${last.slice(0, Math.max(0, MEMO_CHARS_PER_LINE - 1))}…`;
  return kept;
}

export type MemoScreen = {
  memoId: string;
  /** 상자 (스크린 px) */
  box: SRect;
  lines: string[];
  /** 글자 크기 (스크린 px) */
  fontSize: number;
  lineHeight: number;
  pad: number;
  style: ResolvedMemoStyle;
};

/**
 * 메모 1건의 스크린 기하.
 * 상자 크기는 **이미지 px 기준으로 잡고 줌을 곱한다** — 도면과 함께 커지고 작아진다(A3 WYSIWYG).
 * 다만 너무 작아지면 집을 수 없으므로 스크린 최소 크기를 보장한다.
 */
export function memoScreen(memo: Memo, vp: Viewport, iw: number, ih: number): MemoScreen {
  const style = resolveMemoStyle(memo.style);
  const lines = memoLines(memo.text);
  const font = MEMO_FONT * style.fontScale;
  const lineH = font * MEMO_LINE_FACTOR;
  const imgW = MEMO_W * style.fontScale;
  const imgH = MEMO_PAD * 2 + lineH * Math.max(1, lines.length);

  const at = toScreen(memo.pos, vp, iw, ih);
  const w = Math.max(MEMO_MIN_W_PX, imgW * vp.zoom);
  const h = Math.max(MEMO_MIN_H_PX, imgH * vp.zoom);

  return {
    memoId: memo.id,
    box: { x: at.x, y: at.y, w, h },
    lines,
    fontSize: Math.max(6, font * vp.zoom),
    lineHeight: Math.max(7, lineH * vp.zoom),
    pad: MEMO_PAD * vp.zoom,
    style,
  };
}

export function memoScreens(
  memos: readonly Memo[],
  vp: Viewport,
  iw: number,
  ih: number,
  preview: { memoId: string; pos: SPoint } | null,
): MemoScreen[] {
  return memos.map((m) => {
    const s = memoScreen(m, vp, iw, ih);
    if (preview && preview.memoId === m.id) {
      return { ...s, box: { ...s.box, x: preview.pos.x, y: preview.pos.y } };
    }
    return s;
  });
}
