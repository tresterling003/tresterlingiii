"use client";
import type { ReactNode } from "react";
import { Skeleton, ErrorState } from "./ui/states";

export function PageHeader({ eyebrow, title, action }: { eyebrow?: ReactNode; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="truncate font-display text-3xl font-bold uppercase italic leading-none sm:text-[40px]">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-8 h-10 w-56" />
      <Skeleton className="mb-6 h-64 w-full" />
      <div className="grid gap-6 sm:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

export function PageError({ error, retry }: { error: unknown; retry?: () => void }) {
  return <ErrorState message={(error as Error)?.message} onRetry={retry} />;
}
