import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Controller } from '../core/controller';

export const CtlContext = createContext<Controller | null>(null);

/** Re-render on any controller or store change. */
export function useCtl(): Controller {
  const ctl = useContext(CtlContext)!;
  useSyncExternalStore(ctl.subscribe, ctl.getVersion);
  useSyncExternalStore(ctl.store.subscribe, ctl.store.getVersion);
  return ctl;
}

export function download(name: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files?.[0] ?? null);
    i.click();
  });
}
