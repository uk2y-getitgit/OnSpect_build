/**
 * 입력 미리보기 — S4-T7 (스펙 §4-6).
 *
 * S2b(캔버스 결함정보 입력 패널 연결) 이전에는 `DefectInfoForm` 이 붙을 화면이 없다.
 * 그래서 설정 화면에 이 탭을 두어 **설정을 바꾸면 현장 화면이 어떻게 바뀌는지**를
 * 클릭 없이도 확인하게 한다. 임시 도구가 아니다 — S2b 이후에도 남는다.
 *
 * 여기서 만드는 값은 **저장하지 않는다.** 저장 배선은 S2b 의 몫이다(캔버스 저장 대기열과
 * 두 경로가 생기면 어느 쪽 버그인지 못 가린다).
 */
import { useState } from 'react';
import { EMPTY_DEFECT_ATTRS, type DefectAttrs } from '@onspect/canvas-core';
import {
  causeById,
  outputSize,
  seedAttrs,
  STRUCTURAL_LABEL,
  type ItemSettings,
  type Project,
} from '@onspect/project-core';
import { DefectInfoForm } from '../../ui/defectForm/DefectInfoForm';

export function PreviewTab({ settings, project }: { settings: ItemSettings; project: Project }) {
  // 진입할 때 한 번만 프로젝트 기본 구조유형을 얹는다 — EMPTY_DEFECT_ATTRS 의 나머지는
  // canvas-core 소관이고 project-core 는 그 상수를 모른다(D13) → 여기(apps/web)가 합친다
  const [value, setValue] = useState<DefectAttrs>(() => ({
    ...EMPTY_DEFECT_ATTRS,
    ...seedAttrs(settings, project),
  }));

  const size = outputSize(value);
  const structuralLabel = value.structural
    ? STRUCTURAL_LABEL[value.structural]
    : '—';
  const cause = causeById(settings, value.causeId);

  return (
    <div className="idf-preview">
      <div className="notice notice--info">이 화면의 입력은 저장되지 않습니다.</div>

      <div className="idf-preview__body">
        <div className="idf-preview__form">
          <DefectInfoForm value={value} settings={settings} onChange={setValue} />
        </div>

        <div className="idf-preview__table">
          <p className="set-lead">이 입력이 손상결함표에서 어떻게 보이는가</p>
          <div className="tbl-scroll">
            <table className="idf-tbl">
              <thead>
                <tr>
                  <th>위치</th>
                  <th>부재명</th>
                  <th>구조체 유형</th>
                  <th>결함의 유형 및 형상</th>
                  <th>폭</th>
                  <th>길이</th>
                  <th>면적</th>
                  <th>개소</th>
                  <th>진행</th>
                  <th>누수</th>
                  <th>원인코드</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{value.locationNote || '—'}</td>
                  <td>{value.memberName ?? '—'}</td>
                  <td>{structuralLabel}</td>
                  <td>{value.defectTypeName ?? '—'}</td>
                  <td className="num">{size.widthMm}</td>
                  <td className="num">{size.lengthMm}</td>
                  <td className="num">{size.areaM2}</td>
                  <td className="num">{size.countEa}</td>
                  <td>{value.progress === 'ONGOING' ? 'O' : 'X'}</td>
                  <td>{value.leak ? 'O' : 'X'}</td>
                  <td className="num">{cause ? cause.code : (value.causeName ?? '—')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
