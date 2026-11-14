"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useMe } from "@/lib/hooks";
import type { MeResponse } from "@/lib/types";

type Ctx = {
  me: MeResponse | undefined;
  meLoading: boolean;
  meError: unknown;
  logOpen: boolean;
  openLog: () => void;
  closeLog: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const [logOpen, setLogOpen] = useState(false);
  return (
    <AppCtx.Provider value={{ me, meLoading: isLoading, meError: error, logOpen, openLog: () => setLogOpen(true), closeLog: () => setLogOpen(false) }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used inside AppProvider");
  return c;
}
