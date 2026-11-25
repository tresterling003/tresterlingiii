import { CloudOff, LoaderCircle, LogIn } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCloud } from '@/cloud/CloudProvider';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Shows `children` only when cloud storage is connected and the person is signed in.
 * Otherwise explains why, in plain words.
 */
export function CloudGate({ children, feature }: { children: ReactNode; feature: string }) {
  const { status } = useCloud();
  if (status === 'ready') return <>{children}</>;
  if (status === 'loading')
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-muted">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Connecting to your cloud storage…
      </div>
    );
  if (status === 'signed-out')
    return (
      <EmptyState icon={LogIn} title="Sign in to use this">
        {feature} saves to your account. Sign in to claude.ai, then open this page again. If you’re signed in, ask the
        person who shared CreateSpace with you for access.
      </EmptyState>
    );
  return (
    <EmptyState icon={CloudOff} title="Cloud storage isn’t available here">
      {feature} works on the hosted CreateSpace link. This copy of the site is running without cloud storage, so nothing
      can be saved online from it.
    </EmptyState>
  );
}

/** Small banner for a load that's taking long or failed. */
export function LoadNotice({ state }: { state: string }) {
  if (state === 'slow')
    return (
      <p className="rounded-2xl bg-amber-100 px-4 py-2.5 text-sm font-bold text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
        Still connecting… your files may take a moment to appear.
      </p>
    );
  if (state === 'error')
    return (
      <p className="rounded-2xl bg-red-100 px-4 py-2.5 text-sm font-bold text-red-900 dark:bg-red-400/15 dark:text-red-200">
        Couldn’t reach cloud storage. Refresh the page to try again.
      </p>
    );
  return null;
}
