/**
 * 앱 셸 — 라우팅 · 저장소 상태 · 지속 배너.
 *
 * 화면은 `routes/` 아래에 있다. 여기는 어느 화면을 띄울지와
 * **모든 화면에 걸치는 것**(저장 실패 배너 · 전역 토스트)만 다룬다.
 */
import { AppDataProvider, useAppData } from './data/appData';
import { deleteDatabase } from './data/idb/db';
import { useServiceWorker } from './pwa/useServiceWorker';
import { useRoute } from './router';
import { PrintRoute } from './export/printView/PrintRoute';
import { CanvasRoute } from './routes/CanvasRoute';
import { DrawingUpload } from './routes/DrawingUpload';
import { Export } from './routes/Export';
import { ProjectForm } from './routes/ProjectForm';
import { ProjectList } from './routes/ProjectList';
import { ProjectSetup } from './routes/ProjectSetup';
import { Settings } from './routes/Settings';
import { ToastHost } from './ui/ToastHost';
import { useState } from 'react';
import { ConfirmDialog } from './ui/Overlays';

export default function App() {
  return (
    <AppDataProvider>
      <ToastHost>
        <Shell />
      </ToastHost>
    </AppDataProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { storage, saveError, clearSaveError } = useAppData();
  const [resetting, setResetting] = useState(false);
  // 서비스워커 등록(P2)과 새 버전 감지(P4). 등록 실패는 앱을 막지 않는다
  const { updateAvailable, applying, applyUpdate } = useServiceWorker();

  // 인쇄 뷰는 **앱 셸 밖**이다 (§4-9) — 배너·초기화 버튼이 인쇄물에 섞이면 안 된다
  if (route.name === 'EXPORT_PRINT') {
    return (
      <PrintRoute projectId={route.projectId} runId={route.runId} kind={route.kind} />
    );
  }

  return (
    <div className="shell">
      {/* 저장 실패는 **지속 배너**다. 토스트로 흘려보내지 않는다 (§2-9-e) */}
      {saveError && (
        <div className="banner banner--error" role="alert">
          <span className="banner__text">{saveError}</span>
          <span className="banner__hint">앱은 계속 쓸 수 있지만 이 변경은 저장되지 않았습니다.</span>
          <button type="button" className="btn btn--small" onClick={clearSaveError}>
            닫기
          </button>
        </div>
      )}
      {/*
        새 버전 배너 (P4 · 가정 V3) — **저절로 새로고침하지 않는다.**
        현장에서 입력 중에 화면이 갈아엎히면 값이 날아간다. 누르는 것은 사용자다.
      */}
      {updateAvailable && (
        <div className="banner banner--update" role="status">
          <span className="banner__text">새 버전이 있습니다</span>
          <span className="banner__hint">
            지금 작업 중이라면 나중에 눌러도 됩니다. 누르기 전까지는 현재 버전 그대로 씁니다.
          </span>
          <span className="banner__spacer" />
          <button
            type="button"
            className="btn btn--small btn--primary"
            disabled={applying}
            onClick={applyUpdate}
            title="새 버전을 적용하고 화면을 새로 불러옵니다"
          >
            {applying ? '적용 중…' : '지금 새로고침'}
          </button>
        </div>
      )}
      {storage.phase === 'UNAVAILABLE' && (
        <div className="banner banner--warn" role="alert">
          <span className="banner__text">이 브라우저에 데이터를 저장할 수 없습니다 — {storage.message}</span>
          <span className="banner__hint">
            사생활 보호 모드이거나 저장이 차단되어 있습니다. 화면은 동작하지만 새로고침하면 사라집니다.
          </span>
        </div>
      )}

      <div className="shell__body">
        {route.name === 'LIST' && <ProjectList />}
        {route.name === 'NEW' && <ProjectForm projectId={null} />}
        {route.name === 'EDIT' && <ProjectForm projectId={route.projectId} />}
        {route.name === 'SETUP' && <ProjectSetup projectId={route.projectId} />}
        {route.name === 'UPLOAD' && (
          <>
            <ProjectSetup projectId={route.projectId} />
            <DrawingUpload projectId={route.projectId} floorId={route.floorId} />
          </>
        )}
        {route.name === 'SETTINGS' && (
          <Settings projectId={route.projectId} fromFloorId={route.fromFloorId} />
        )}
        {route.name === 'EXPORT' && <Export projectId={route.projectId} />}
        {route.name === 'CANVAS' && (
          <CanvasRoute projectId={route.projectId} floorId={route.floorId} />
        )}
      </div>

      {route.name === 'LIST' && (
        <button
          type="button"
          className="shell__reset"
          title="이 브라우저에 저장된 OnSpect 데이터를 전부 지웁니다"
          onClick={() => setResetting(true)}
        >
          로컬 데이터 초기화
        </button>
      )}

      {resetting && (
        <ConfirmDialog
          title="로컬 데이터를 초기화할까요?"
          body={
            <>
              <p>이 브라우저에 저장된 <b>모든 용역 · 도면 · 결함</b>이 사라집니다.</p>
              <p className="muted">되돌릴 수 없습니다. 초기화 후 페이지가 새로고침됩니다.</p>
            </>
          }
          confirmLabel="전부 지우기"
          onConfirm={() => {
            void deleteDatabase().then(() => window.location.reload());
          }}
          onCancel={() => setResetting(false)}
        />
      )}
    </div>
  );
}
