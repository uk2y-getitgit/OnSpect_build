/**
 * 출력 옵션 — Phase 4 스펙 §4-1 2~4번.
 *
 * · 번호 부여: 층별 1번부터 / 전체 이어서. **사진번호도 이 모드를 따라간다** (K6 · Q34)
 * · 포함 범위: 전회차 미보수 · 보수완료 · 미완성 (D3 — 미완성은 기본 포함, 경고만)
 * · 조사구분: **결함정보 폼에 노출됐다**(PhotoPolish §2-7). 직전 입력에서 이어받으므로
 *   상세조사 구간을 통째로 뽑을 수 있다. 기본은 여전히 전체 (K8)
 * · 도면 표시: 자유그리기 · 메모 · 도곽 · 범례 — 조사위치도에만 영향을 준다
 */
import type { ExportParams, NumberMode, NumberingSurveyKind } from '@onspect/project-core';

export type OptionsPanelProps = {
  params: ExportParams;
  onChange: (next: ExportParams) => void;
  /** 조사위치도를 뽑지 않으면 도면 표시 옵션은 의미가 없다 — 비활성 사유를 함께 준다 */
  mapEnabled: boolean;
};

type SurveyChoice = 'ALL' | 'EXTERIOR' | 'DETAIL';

function surveyChoice(v: readonly NumberingSurveyKind[] | null): SurveyChoice {
  if (v === null || v.length === 0 || v.length >= 2) return 'ALL';
  return v[0] === 'DETAIL' ? 'DETAIL' : 'EXTERIOR';
}

export function OptionsPanel({ params, onChange, mapEnabled }: OptionsPanelProps) {
  const set = (patch: Partial<ExportParams>) => onChange({ ...params, ...patch });
  const setRender = (patch: Partial<ExportParams['render']>) =>
    onChange({ ...params, render: { ...params.render, ...patch } });
  const setDoc = (patch: Partial<ExportParams['doc']>) =>
    onChange({ ...params, doc: { ...params.doc, ...patch } });

  const mapHint = mapEnabled ? undefined : '조사위치도를 선택해야 적용됩니다';

  return (
    <div className="xp-options">
      {/* 2. 번호 부여 */}
      <fieldset className="xp-field">
        <legend className="xp-field__legend">번호 부여</legend>
        {(
          [
            // D19 — 사진번호는 더 이상 층에서 리셋되지 않는다(K6 폐기). 문구를 사실과 맞춘다
            [
              'PER_FLOOR',
              '층별 1번부터',
              '층이 바뀌면 결함번호만 1로 돌아갑니다. 사진번호는 용역 전체에 걸쳐 이어집니다',
            ],
            // D20 — 전체연속에서는 층 접두어를 붙이지 않는다. `2F-13` 은 2층의 13번이 아니라
            // 거짓말이 되기 때문이다(검수 보통1). 사용자가 이유를 알 수 있게 여기서 말해 준다
            [
              'CONTINUOUS',
              '전체 이어서',
              '선택한 층 전체에 걸쳐 번호가 계속 이어집니다. 층 접두어는 이 모드에서 쓰이지 않습니다',
            ],
          ] as [NumberMode, string, string][]
        ).map(([mode, label, hint]) => (
          <label className="xp-radio" key={mode} title={hint}>
            <input
              type="radio"
              name="xp-number-mode"
              checked={params.mode === mode}
              onChange={() => set({ mode })}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      {/* 3. 포함 범위 */}
      <fieldset className="xp-field">
        <legend className="xp-field__legend">포함 범위</legend>
        <label className="xp-check" title="전 회차에서 넘어와 아직 보수되지 않은 결함">
          <input
            type="checkbox"
            checked={params.includePrevPending}
            onChange={(e) => set({ includePrevPending: e.target.checked })}
          />
          <span>전회차 미보수</span>
        </label>
        <label className="xp-check" title="보수가 끝난 결함까지 함께 냅니다">
          <input
            type="checkbox"
            checked={params.includeRepaired}
            onChange={(e) => set({ includeRepaired: e.target.checked })}
          />
          <span>보수완료</span>
        </label>
        <label
          className="xp-check"
          title="부재·결함유형이 비어 있는 결함. 끄면 출력에서 조용히 빠지므로 기본은 켜져 있습니다"
        >
          <input
            type="checkbox"
            checked={params.includeIncomplete}
            onChange={(e) => set({ includeIncomplete: e.target.checked })}
          />
          <span>미완성 결함</span>
        </label>
      </fieldset>

      {/* 3-b. 조사구분 (K8) */}
      <fieldset className="xp-field">
        <legend className="xp-field__legend">조사구분</legend>
        {(
          [
            ['ALL', '전체'],
            ['EXTERIOR', '외관조사'],
            ['DETAIL', '상세조사'],
          ] as [SurveyChoice, string][]
        ).map(([v, label]) => (
          <label className="xp-radio" key={v}>
            <input
              type="radio"
              name="xp-survey"
              checked={surveyChoice(params.surveyKinds) === v}
              onChange={() =>
                set({ surveyKinds: v === 'ALL' ? null : [v as NumberingSurveyKind] })
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      {/* 4. 도면 표시 */}
      <fieldset className="xp-field" disabled={!mapEnabled}>
        <legend className="xp-field__legend">도면 표시</legend>
        <label className="xp-check" title={mapHint ?? '결함에 딸린 자유그리기를 함께 그립니다'}>
          <input
            type="checkbox"
            checked={params.render.sketch}
            onChange={(e) => setRender({ sketch: e.target.checked })}
          />
          <span>자유그리기</span>
        </label>
        <label className="xp-check" title={mapHint ?? '메모는 내부 메모입니다. 기본은 꺼져 있습니다'}>
          <input
            type="checkbox"
            checked={params.render.memo}
            onChange={(e) => setRender({ memo: e.target.checked })}
          />
          <span>메모</span>
        </label>
        <label className="xp-check" title={mapHint ?? '용역명·도면명·축척이 들어간 도곽'}>
          <input
            type="checkbox"
            checked={params.render.titleBlock}
            onChange={(e) => setRender({ titleBlock: e.target.checked })}
          />
          <span>도곽</span>
        </label>
        <label className="xp-check" title={mapHint ?? '이 도면에 쓰인 결함유형 범례'}>
          <input
            type="checkbox"
            checked={params.render.legend}
            onChange={(e) => setRender({ legend: e.target.checked })}
          />
          <span>범례</span>
        </label>
        <label className="xp-num" title={mapHint ?? '1 = 도면 원본 픽셀. 크게 할수록 인쇄가 선명합니다'}>
          <span>출력 배율</span>
          <input
            type="number"
            min={1}
            max={4}
            step={0.5}
            value={params.render.mapScale}
            onChange={(e) =>
              setRender({ mapScale: clampScaleInput(Number(e.target.value)) })
            }
          />
          <span className="muted">×</span>
        </label>
      </fieldset>

      {/* 머리말 2행 (K18) */}
      <fieldset className="xp-field xp-field--wide">
        <legend className="xp-field__legend">손상결함표 머리말</legend>
        <label className="xp-text" title="보고서마다 장 번호가 다릅니다. 표 머리말 2행에 그대로 인쇄됩니다">
          <input
            type="text"
            value={params.doc.headerLine2}
            maxLength={60}
            placeholder="제2장 현장조사"
            onChange={(e) => setDoc({ headerLine2: e.target.value })}
          />
        </label>
        {/*
          §2-8 — `assignNumbers()` 를 건드리지 않는다. 대표는 `사진 12` 그대로이고
          나머지는 배치 단계의 **파생 부번** `12-1`·`12-2` 다.
          손상결함표·결함리스트의 `사진번호` 열은 그대로 `12` 하나다.
        */}
        <label
          className="xp-check"
          title="결함번호·사진번호(정수)는 그대로입니다. 부번만 늘어납니다"
        >
          <input
            type="checkbox"
            // ⚠️ `=== true` — 옛 이력에서 복원한 `params.doc` 에는 이 키가 없을 수 있다.
            //    `undefined` 를 넣으면 React 가 비제어 입력으로 취급해 경고가 뜬다
            checked={params.doc.includeNonPrimaryPhotos === true}
            onChange={(e) => setDoc({ includeNonPrimaryPhotos: e.target.checked })}
          />
          <span>대표 외 사진 포함 (부번 12-1·12-2로 나갑니다·사진첩 장수가 늘어납니다)</span>
        </label>
        {/* F-4 — **표시만** 뺀다. 번호 자체와 `ExportRun.mapping` 은 그대로다 (불변식 #2) */}
        <label
          className="xp-check"
          title="사진첩 캡션 1행만 숨깁니다. 손상결함표·결함리스트의 사진번호 열은 그대로입니다"
        >
          <input
            type="checkbox"
            checked={params.doc.hidePhotoNumber === true}
            onChange={(e) => setDoc({ hidePhotoNumber: e.target.checked })}
          />
          <span>사진첩 사진번호 숨기기</span>
        </label>
      </fieldset>
    </div>
  );
}

function clampScaleInput(v: number): number {
  if (!Number.isFinite(v)) return 2;
  return Math.max(1, Math.min(4, v));
}
