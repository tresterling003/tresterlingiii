import { useCallback, useEffect, useRef, useState } from 'react';
import { useCloud } from '@/cloud/CloudProvider';
import { projectsPath, queueWrite, type LoadState } from '@/cloud/useCloudData';
import { readContracts, readExpenses, readIncome, type Contract, type ExpenseEntry, type IncomeEntry } from './model';

/*
 * Business data lives in the person's private cloud area (nobody else can read it, not even the
 * site owner), one document per section. Ids start with "_" so My Projects ignores them.
 */
const DOCS = { income: '_biz-income', expenses: '_biz-expenses', contracts: '_biz-contracts', settings: '_biz-settings' } as const;
type Section = keyof typeof DOCS;

export interface BusinessData {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  contracts: Contract[];
  currency: string;
}

export function useBusiness() {
  const { db, userId } = useCloud();
  const [data, setData] = useState<BusinessData>({ income: [], expenses: [], contracts: [], currency: 'USD' });
  const [loaded, setLoaded] = useState<Record<Section, boolean>>({ income: false, expenses: false, contracts: false, settings: false });
  const [state, setState] = useState<LoadState>('loading');
  const latest = useRef(data);
  latest.current = data;

  useEffect(() => {
    if (!db || !userId) return;
    const base = projectsPath(userId);
    const subs = (Object.keys(DOCS) as Section[]).map((section) =>
      db.doc(`${base}/${DOCS[section]}`).onSnapshot(
        (snap) => {
          const raw = snap.exists ? snap.data() : undefined;
          setData((d) => {
            if (section === 'income') return { ...d, income: readIncome(raw) };
            if (section === 'expenses') return { ...d, expenses: readExpenses(raw) };
            if (section === 'contracts') return { ...d, contracts: readContracts(raw) };
            return { ...d, currency: typeof raw?.currency === 'string' ? raw.currency : 'USD' };
          });
          if (!snap.metadata.fromCache) setLoaded((l) => (l[section] ? l : { ...l, [section]: true }));
        },
        () => setState('error'),
      ),
    );
    return () => subs.forEach((u) => u());
  }, [db, userId]);

  const allLoaded = Object.values(loaded).every(Boolean);
  useEffect(() => {
    if (allLoaded) setState('ready');
  }, [allLoaded]);
  useEffect(() => {
    if (state !== 'loading') return;
    const t = setTimeout(() => setState('slow'), 10000);
    return () => clearTimeout(t);
  }, [state]);

  /** Change one section's list and save it (writes to one document never overlap). */
  const save = useCallback(
    <K extends 'income' | 'expenses' | 'contracts'>(section: K, change: (items: BusinessData[K]) => BusinessData[K]) => {
      if (!db || !userId) return Promise.reject(new Error('Not connected'));
      const ref = db.doc(`${projectsPath(userId)}/${DOCS[section]}`);
      return queueWrite(ref.path, async () => {
        const next = change(latest.current[section]);
        latest.current = { ...latest.current, [section]: next };
        setData((d) => ({ ...d, [section]: next }));
        await ref.set({ items: next, updatedAt: new Date().toISOString() });
      });
    },
    [db, userId],
  );

  const setCurrency = useCallback(
    (currency: string) => {
      if (!db || !userId) return Promise.resolve();
      const ref = db.doc(`${projectsPath(userId)}/${DOCS.settings}`);
      setData((d) => ({ ...d, currency }));
      return queueWrite(ref.path, () => ref.set({ currency }));
    },
    [db, userId],
  );

  return { data, state, save, setCurrency };
}
