/**
 * `[유사결함 불러오기]` 다이얼로그 — D18 (파일2-③).
 *
 * 이 용역의 결함 목록을 띄우고, 고른 결함의 **분류·판정 14필드**(`DEFECT_CARRY_FIELDS`)를
 * 지금 선택된 결함으로 가져온다. 규모·개소·메모는 가져오지 않는다.
 *
 * ⚠️ **여기 보이는 번호는 `seq`(입력순번)다. 출력 결함번호가 아니다.**
 *    출력 결함번호는 출력 시점에만 존재한다(불변식 #2). 사용자가 화면에서 보는 번호 —
 *    좌측 리스트와 도면 위 풍선의 그 번호 — 가 `seq` 이므로 여기서도 같은 것을 보여준다.
 *
 * 이 컴포넌트는 **store·repo·캔버스를 모르고** 후보 목록을 props 로만 받는다.
 * 목록을 만드는 것도, 고른 결과를 커맨드로 바꾸는 것도 호출자(`CanvasRoute`) 몫이다.
 */
import { useMemo, useState } from 'react';
import { Modal } from './Form';

export type SimilarDefectItem = {
  id: string;
  /** 입력순번. **출력 결함번호가 아니다** */
  seq: number;
  memberName: string | null;
  defectTypeName: string | null;
  floorName: string | null;
  status: 'CURRENT' | 'NEW' | 'PREV_PENDING' | 'REPAIRED';
};

const STATUS_LABEL: Record<SimilarDefectItem['status'], string> = {
  CURRENT: '결함',
  NEW: '신규',
  PREV_PENDING: '전차',
  REPAIRED: '보수완료',
};

export type SimilarDefectPickerProps = {
  /** 이 용역의 결함 목록. 지금 선택된 결함은 호출자가 이미 빼고 넘긴다 */
  items: readonly SimilarDefectItem[];
  onPick: (item: SimilarDefectItem) => void;
  onClose: () => void;
};

export function SimilarDefectPicker({ items, onPick, onClose }: SimilarDefectPickerProps) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle === '') return items;
    return items.filter((d) => {
      const hay = `${d.memberName ?? ''} ${d.defectTypeName ?? ''} ${d.floorName ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  return (
    <Modal
      title="유사결함 불러오기"
      subtitle="고른 결함의 부재 · 결함유형 · 원인 · 보수방안을 가져옵니다. 규모 · 개소 · 메모는 가져오지 않습니다."
      onClose={onClose}
      // T-3 — 본문 첫 요소가 검색 입력이라 자동 포커스가 걸리면 태블릿에서 열자마자
      //       소프트 키보드가 올라와 목록을 가린다. 대부분은 검색 없이 눈으로 고른다.
      autoFocusFirst={false}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          닫기
        </button>
      }
    >
      <div className="sdp">
        <input
          className="input"
          type="search"
          placeholder="부재 · 결함유형으로 찾기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="부재 · 결함유형으로 찾기"
        />

        {filtered.length === 0 ? (
          <p className="idf-empty">
            {items.length === 0
              ? '이 용역에 불러올 다른 결함이 아직 없습니다.'
              : '검색 결과가 없습니다.'}
          </p>
        ) : (
          <ul className="sdp__list">
            {filtered.map((d) => (
              <li key={d.id}>
                <button type="button" className="sdp__item" onClick={() => onPick(d)}>
                  {/* seq — 좌측 리스트·도면 풍선과 같은 번호다 */}
                  <span className="sdp__seq num" data-status={d.status}>
                    {d.seq}
                  </span>
                  <span className="sdp__body">
                    <span className="sdp__title">{d.memberName ?? '부재 미입력'}</span>
                    <span className="sdp__sub">
                      {d.defectTypeName ?? '결함유형 미입력'}
                      {d.floorName ? ` · ${d.floorName}` : ''}
                    </span>
                  </span>
                  <span className="chip chip--status" data-status={d.status}>
                    {STATUS_LABEL[d.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
