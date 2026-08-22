/**
 * 도면 썸네일 — IndexedDB Blob → objectURL.
 *
 * URL 은 도면 단위로 캐시하고 용역을 벗어날 때 한꺼번에 해제한다 (§2-8-c).
 * 여기서 개별로 revoke 하면 같은 Blob 을 쓰는 다른 화면이 깨진다.
 */
import { useEffect, useState } from 'react';
import type { Drawing } from '@onspect/project-core';
import { useAppData } from '../data/appData';

export function DrawingThumb({ drawing, projectId }: { drawing: Drawing; projectId: string }) {
  const { storage } = useAppData();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (storage.phase !== 'READY') return;
    let alive = true;
    void storage.repo.objectUrl(drawing.thumbBlobKey, projectId).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [storage, drawing.thumbBlobKey, projectId]);

  return (
    <span className="thumb" aria-hidden="true">
      {url && <img src={url} alt="" loading="lazy" />}
    </span>
  );
}
