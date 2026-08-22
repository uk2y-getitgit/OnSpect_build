/**
 * 메모 텍스트 편집기 — 캔버스 위에 뜨는 작은 textarea.
 *
 * `canvas-core` 는 DOM 을 모른다(경계 규칙 1). 코어는 `EDIT_MEMO` 이펙트만 내고,
 * 실제 입력은 여기서 받는다.
 *
 * ⚠️ **메모는 결함이 아니다.** 결함 상태색(빨강·보라·회색)을 쓰지 않고
 * 포스트잇 계열 노랑을 그대로 이어받는다 (§S2a-6).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MEMO_BG, MEMO_BORDER, MEMO_TEXT, type MemoScreen } from '@onspect/canvas-core';

export type MemoEditorProps = {
  /** 편집 중인 메모의 스크린 기하. 없으면 아무것도 그리지 않는다 */
  box: MemoScreen | null;
  initialText: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
};

export function MemoEditor({ box, initialText, onCommit, onCancel }: MemoEditorProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState(initialText);

  // 다른 메모로 옮겨 가면 값을 새로 받는다
  useEffect(() => setText(initialText), [initialText, box?.memoId]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // 커서를 끝에 둔다. 기존 글을 고칠 때 전체 선택이면 실수로 날아간다
    el.setSelectionRange(el.value.length, el.value.length);
  }, [box?.memoId]);

  if (!box) return null;

  const b = box.box;
  // 줌아웃 상태에서도 글은 읽고 쓸 수 있어야 한다 — 편집기는 최소 크기를 보장한다
  const w = Math.max(180, b.w);
  const h = Math.max(84, b.h);

  return (
    <div
      className="memo-editor"
      style={{ left: `${b.x}px`, top: `${b.y}px`, width: `${w}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        className="memo-editor__input"
        style={{
          height: `${h}px`,
          background: MEMO_BG,
          borderColor: MEMO_BORDER,
          color: MEMO_TEXT,
        }}
        value={text}
        aria-label="메모 내용"
        placeholder="메모를 입력하세요"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation(); // 캔버스 단축키(Delete·0·+)가 글자를 먹지 않게
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onCommit(text);
          }
        }}
        onBlur={() => onCommit(text)}
      />
      <div className="memo-editor__hint">
        <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 저장 · <kbd>Esc</kbd> 취소 · 비우면 삭제
      </div>
    </div>
  );
}
