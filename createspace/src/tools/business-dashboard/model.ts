/**
 * Business Dashboard data and calculations (plain logic, unit-tested).
 * Money is stored as whole cents to avoid rounding errors (e.g. $12.50 → 1250).
 * Dates are stored as "YYYY-MM-DD" strings.
 */

export interface IncomeEntry {
  id: string;
  date: string;
  client: string;
  description: string;
  amountCents: number;
  status: 'paid' | 'pending';
  /** When a pending payment is expected. */
  dueDate: string;
}

export const EXPENSE_CATEGORIES = ['Software', 'Equipment', 'Supplies', 'Marketing', 'Travel', 'Education', 'Fees', 'Other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseEntry {
  id: string;
  date: string;
  description: string;
  category: ExpenseCategory;
  amountCents: number;
}

export const CONTRACT_STATUSES = ['draft', 'sent', 'signed', 'completed', 'cancelled'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface Contract {
  id: string;
  title: string;
  client: string;
  valueCents: number;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  notes: string;
  /** Optional attached file (e.g. a signed PDF) in cloud storage. */
  file?: { assetId: string; name: string };
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'INR', 'MXN', 'BRL', 'ZAR', 'NGN', 'PHP'] as const;

// ---------- reading stored data safely ----------
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const cents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const list = (data: Record<string, unknown> | undefined) => (Array.isArray(data?.items) ? (data.items as unknown[]) : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');

export const readIncome = (data: Record<string, unknown> | undefined): IncomeEntry[] =>
  list(data)
    .filter((x) => typeof x.id === 'string' && isDate(x.date))
    .map((x) => ({
      id: x.id as string,
      date: x.date as string,
      client: str(x.client, 120),
      description: str(x.description, 300),
      amountCents: cents(x.amountCents),
      status: x.status === 'pending' ? 'pending' : 'paid',
      dueDate: isDate(x.dueDate) ? x.dueDate : '',
    }));

export const readExpenses = (data: Record<string, unknown> | undefined): ExpenseEntry[] =>
  list(data)
    .filter((x) => typeof x.id === 'string' && isDate(x.date))
    .map((x) => ({
      id: x.id as string,
      date: x.date as string,
      description: str(x.description, 300),
      category: (EXPENSE_CATEGORIES as readonly string[]).includes(x.category as string) ? (x.category as ExpenseCategory) : 'Other',
      amountCents: cents(x.amountCents),
    }));

export const readContracts = (data: Record<string, unknown> | undefined): Contract[] =>
  list(data)
    .filter((x) => typeof x.id === 'string' && typeof x.title === 'string')
    .map((x) => {
      const file = x.file as { assetId?: unknown; name?: unknown } | undefined;
      return {
        id: x.id as string,
        title: str(x.title, 160),
        client: str(x.client, 120),
        valueCents: cents(x.valueCents),
        startDate: isDate(x.startDate) ? x.startDate : '',
        endDate: isDate(x.endDate) ? x.endDate : '',
        status: (CONTRACT_STATUSES as readonly string[]).includes(x.status as string) ? (x.status as ContractStatus) : 'draft',
        notes: str(x.notes, 2000),
        file: file && typeof file.assetId === 'string' && typeof file.name === 'string' ? { assetId: file.assetId, name: file.name } : undefined,
      };
    });

// ---------- money ----------
/** "1,234.50" / "$1234.5" / "1234" → cents. Returns null when it isn't a valid non-negative amount. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!cleaned || cleaned.startsWith('-')) return null;
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '.') return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export const formatMoney = (amountCents: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountCents / 100);

export const centsToInput = (c: number) => (c / 100).toFixed(2);

// ---------- dates ----------
export const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const yearOf = (date: string) => Number(date.slice(0, 4));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// ---------- summaries ----------
export interface Summary {
  earnedThisMonth: number;
  earnedThisYear: number;
  outstanding: number;
  overdue: number;
  expensesThisYear: number;
  profitThisYear: number;
}

export function summarize(income: IncomeEntry[], expenses: ExpenseEntry[], now = today()): Summary {
  const year = now.slice(0, 4);
  const month = now.slice(0, 7);
  const paid = income.filter((i) => i.status === 'paid');
  const sum = (xs: { amountCents: number }[]) => xs.reduce((n, x) => n + x.amountCents, 0);
  const pending = income.filter((i) => i.status === 'pending');
  const earnedThisYear = sum(paid.filter((i) => i.date.startsWith(year)));
  const expensesThisYear = sum(expenses.filter((e) => e.date.startsWith(year)));
  return {
    earnedThisMonth: sum(paid.filter((i) => i.date.startsWith(month))),
    earnedThisYear,
    outstanding: sum(pending),
    overdue: sum(pending.filter((i) => i.dueDate && i.dueDate < now)),
    expensesThisYear,
    profitThisYear: earnedThisYear - expensesThisYear,
  };
}

/** Paid income per month for the last `count` months, oldest first. */
export function monthlyIncome(income: IncomeEntry[], now = today(), count = 12) {
  const [y, m] = now.split('-').map(Number);
  const months: { key: string; label: string; cents: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: d.toLocaleDateString(undefined, { month: 'short' }), cents: 0 });
  }
  const byKey = new Map(months.map((x) => [x.key, x]));
  for (const i of income) if (i.status === 'paid') byKey.get(i.date.slice(0, 7))?.cents !== undefined && (byKey.get(i.date.slice(0, 7))!.cents += i.amountCents);
  return months;
}

export interface Upcoming {
  kind: 'payment' | 'contract';
  id: string;
  title: string;
  date: string;
  /** negative = overdue / past */
  daysAway: number;
  amountCents: number;
}

/** Pending payments (soonest due first, overdue included) and active contracts ending within 30 days. */
export function upcoming(income: IncomeEntry[], contracts: Contract[], now = today()): Upcoming[] {
  const payments: Upcoming[] = income
    .filter((i) => i.status === 'pending')
    .map((i) => ({
      kind: 'payment' as const,
      id: i.id,
      title: i.client || i.description || 'Payment',
      date: i.dueDate,
      daysAway: i.dueDate ? daysBetween(now, i.dueDate) : Infinity,
      amountCents: i.amountCents,
    }));
  const ending: Upcoming[] = contracts
    .filter((c) => (c.status === 'signed' || c.status === 'sent') && c.endDate && daysBetween(now, c.endDate) <= 30 && daysBetween(now, c.endDate) >= -7)
    .map((c) => ({ kind: 'contract' as const, id: c.id, title: c.title, date: c.endDate, daysAway: daysBetween(now, c.endDate), amountCents: c.valueCents }));
  return [...payments, ...ending].sort((a, b) => a.daysAway - b.daysAway);
}

export interface ClientSummary {
  name: string;
  paidCents: number;
  outstandingCents: number;
  contracts: number;
  activeContracts: number;
  lastDate: string;
}

/** Clients built from income and contracts (no separate client list to maintain). */
export function clientSummaries(income: IncomeEntry[], contracts: Contract[]): ClientSummary[] {
  const map = new Map<string, ClientSummary>();
  const get = (raw: string) => {
    const name = raw.trim();
    if (!name) return null;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, { name, paidCents: 0, outstandingCents: 0, contracts: 0, activeContracts: 0, lastDate: '' });
    return map.get(key)!;
  };
  for (const i of income) {
    const c = get(i.client);
    if (!c) continue;
    if (i.status === 'paid') c.paidCents += i.amountCents;
    else c.outstandingCents += i.amountCents;
    if (i.date > c.lastDate) c.lastDate = i.date;
  }
  for (const k of contracts) {
    const c = get(k.client);
    if (!c) continue;
    c.contracts++;
    if (k.status === 'signed' || k.status === 'sent') c.activeContracts++;
    const d = k.startDate || k.endDate;
    if (d > c.lastDate) c.lastDate = d;
  }
  return [...map.values()].sort((a, b) => b.paidCents - a.paidCents || a.name.localeCompare(b.name));
}

export const knownClients = (income: IncomeEntry[], contracts: Contract[]) =>
  [...new Set([...income.map((i) => i.client.trim()), ...contracts.map((c) => c.client.trim())].filter(Boolean))].sort((a, b) => a.localeCompare(b));

export const yearsIn = (dates: string[], now = today()) =>
  [...new Set([yearOf(now), ...dates.filter(Boolean).map(yearOf)])].sort((a, b) => b - a);

// ---------- CSV export (for taxes / accountants) ----------
const csvCell = (v: string | number) => {
  const s = String(v);
  // Guard against spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

export const incomeCsv = (items: IncomeEntry[]) =>
  toCsv([
    ['Date', 'Client', 'Description', 'Amount', 'Status', 'Due date'],
    ...items.map((i) => [i.date, i.client, i.description, centsToInput(i.amountCents), i.status, i.dueDate]),
  ]);
export const expensesCsv = (items: ExpenseEntry[]) =>
  toCsv([['Date', 'Description', 'Category', 'Amount'], ...items.map((e) => [e.date, e.description, e.category, centsToInput(e.amountCents)])]);
