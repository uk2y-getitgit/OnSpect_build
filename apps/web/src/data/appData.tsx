/**
 * 앱 전역 데이터 컨텍스트 — 저장소 열기 · 실패 배너 · 새로고침 신호.
 *
 * 규칙 (§2-9-e):
 *   · **로컬 우선.** 모든 쓰기는 곧바로 메모리 상태에 반영되고 저장은 뒤따라간다.
 *     **UI 가 저장 완료를 기다리지 않는다** (불변식 3)
 *   · 실패(quota 초과 · 사생활 보호 모드)는 **지속 배너**로 알린다.
 *     토스트로 흘려보내지 않는다. 앱은 메모리 상태로 계속 동작한다
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { describeError, openDb, requestPersistence, type PersistenceState } from './idb/db.js';
import { IdbProjectRepo } from './idb/repo.js';

export type StorageState =
  | { phase: 'LOADING' }
  | { phase: 'READY'; repo: IdbProjectRepo; deviceId: string }
  | { phase: 'UNAVAILABLE'; message: string };

type AppDataValue = {
  storage: StorageState;
  /**
   * 저장소 영속 허용 여부 (D11 · P3). 앱 시작 시 1회 요청한 결과.
   * **거절돼도 앱은 그대로 동작한다** — 브라우저가 용량 압박 때 지울 수 있다는 뜻일 뿐이다
   */
  persistence: PersistenceState;
  /** 저장 실패 지속 배너 문구. null 이면 배너 없음 */
  saveError: string | null;
  clearSaveError: () => void;
  /** 쓰기를 감싸 실패를 배너로 올린다. **UI 는 결과를 기다리지 않아도 된다** */
  guard: <T>(work: () => Promise<T>) => Promise<T | null>;
  /** 목록·구성 화면이 다시 읽어야 할 때 올린다 */
  reloadKey: number;
  reload: () => void;
};

const Ctx = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [storage, setStorage] = useState<StorageState>({ phase: 'LOADING' });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [persistence, setPersistence] = useState<PersistenceState>('UNKNOWN');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    openDb().then((r) => {
      if (!alive.current) return;
      if (r.ok) {
        setStorage({ phase: 'READY', repo: new IdbProjectRepo(r.db, r.deviceId), deviceId: r.deviceId });
        /**
         * 축출 방어 (D11 · P3) — **앱 시작 시 1회.**
         * 도면을 올리지 않고 pull 만 하는 태블릿에서도 반드시 돌아야 한다.
         * DB 를 연 **뒤**에 요청한다 — 저장된 데이터가 있는 오리진일수록 브라우저가 잘 허락한다.
         * 결과를 기다리지 않는다. 거절돼도 앱은 그대로 동작한다
         */
        void requestPersistence().then((p) => {
          if (alive.current) setPersistence(p);
        });
      } else setStorage({ phase: 'UNAVAILABLE', message: r.message });
    });
    return () => {
      alive.current = false;
    };
  }, []);

  const guard = useCallback(async <T,>(work: () => Promise<T>): Promise<T | null> => {
    try {
      const out = await work();
      setSaveError((cur) => (cur === null ? cur : null));
      return out;
    } catch (e) {
      setSaveError(`변경 사항을 저장하지 못했습니다 — ${describeError(e)}`);
      return null;
    }
  }, []);

  const value = useMemo<AppDataValue>(
    () => ({
      storage,
      persistence,
      saveError,
      clearSaveError: () => setSaveError(null),
      guard,
      reloadKey,
      reload: () => setReloadKey((v) => v + 1),
    }),
    [storage, persistence, saveError, guard, reloadKey],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppDataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppDataProvider 안에서만 쓸 수 있습니다');
  return v;
}

/** 저장소가 준비됐을 때만 repo 를 돌려준다 */
export function useRepo(): IdbProjectRepo | null {
  const { storage } = useAppData();
  return storage.phase === 'READY' ? storage.repo : null;
}
