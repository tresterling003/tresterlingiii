import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { runtime, getService, type Assets, type Db, type Downloads, type UserApi } from './runtime';

export type CloudStatus = 'loading' | 'ready' | 'signed-out' | 'unavailable';

export interface Cloud {
  status: CloudStatus;
  db: Db | null;
  assets: Assets | null;
  downloads: Downloads | null;
  user: UserApi | null;
  /** This person's private id (null when signed out). */
  userId: string | null;
  isOwner: boolean;
  /** May this person upload files? */
  canUpload: boolean;
}

const initial: Cloud = {
  status: 'loading',
  db: null,
  assets: null,
  downloads: null,
  user: null,
  userId: null,
  isOwner: false,
  canUpload: false,
};

const CloudContext = createContext<Cloud>(initial);

/** Connects once at startup and shares the result with every page. */
export function CloudProvider({ children }: { children: ReactNode }) {
  const [cloud, setCloud] = useState<Cloud>(() => (runtime() ? initial : { ...initial, status: 'unavailable' }));

  useEffect(() => {
    if (!runtime()) return;
    let cancelled = false;
    (async () => {
      const [db, assets, downloads, user] = await Promise.all([
        getService<Db>('db'),
        getService<Assets>('assets'),
        getService<Downloads>('downloads'),
        getService<UserApi>('user'),
      ]);
      const userId = (await user?.id().catch(() => null)) ?? null;
      const isOwner = (await user?.isOwner().catch(() => false)) ?? false;
      if (cancelled) return;
      setCloud({
        // On the hosted page, no database means the person isn't signed in (or has no access).
        status: db && userId ? 'ready' : 'signed-out',
        db,
        assets,
        downloads,
        user,
        userId,
        isOwner,
        canUpload: !!assets,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <CloudContext.Provider value={cloud}>{children}</CloudContext.Provider>;
}

export const useCloud = () => useContext(CloudContext);
