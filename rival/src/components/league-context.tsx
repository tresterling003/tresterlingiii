"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveSync, useMe, type SyncState } from "@/lib/hooks";
import type { MeResponse } from "@/lib/types";

type Ctx = {
  me: MeResponse | undefined;
  meLoading: boolean;
  meError: unknown;
  leagueId: string | null;
  setLeagueId: (id: string) => void;
  sync: SyncState;
  logOpen: boolean;
  openLog: () => void;
  closeLog: () => void;
};

const LeagueCtx = createContext<Ctx | null>(null);
const KEY = "rival.league";

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const [selected, setSelected] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    try { setSelected(localStorage.getItem(KEY)); } catch {}
  }, []);

  const leagueId = useMemo(() => {
    if (!me) return null;
    if (selected && me.leagues.some((l) => l.id === selected)) return selected;
    return me.leagues[0]?.id ?? null;
  }, [me, selected]);

  const setLeagueId = useCallback((id: string) => {
    setSelected(id);
    try { localStorage.setItem(KEY, id); } catch {}
  }, []);

  const sync = useLiveSync(leagueId);

  return (
    <LeagueCtx.Provider value={{
      me, meLoading: isLoading, meError: error, leagueId, setLeagueId, sync,
      logOpen, openLog: () => setLogOpen(true), closeLog: () => setLogOpen(false),
    }}>
      {children}
    </LeagueCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(LeagueCtx);
  if (!c) throw new Error("useApp must be used inside LeagueProvider");
  return c;
}
