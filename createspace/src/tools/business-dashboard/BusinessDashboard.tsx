import {
  AlertCircle,
  CalendarClock,
  Check,
  Download,
  FileSignature,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useCloud } from '@/cloud/CloudProvider';
import { checkFile } from '@/cloud/files';
import { describeError } from '@/cloud/runtime';
import { deleteAssets, downloadAsset, uploadBlob } from '@/cloud/transfer';
import { CloudGate, LoadNotice } from '@/components/cloud/CloudGate';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import { ContractDialog, ExpenseDialog, IncomeDialog } from './Forms';
import {
  clientSummaries,
  CONTRACT_STATUS_LABELS,
  CURRENCIES,
  expensesCsv,
  formatMoney,
  incomeCsv,
  knownClients,
  monthlyIncome,
  summarize,
  today,
  upcoming,
  yearsIn,
  type Contract,
  type ContractStatus,
  type ExpenseEntry,
  type IncomeEntry,
} from './model';
import { useBusiness } from './useBusiness';

type Tab = 'overview' | 'income' | 'expenses' | 'contracts' | 'clients';
type Open =
  | { kind: 'income'; entry?: IncomeEntry }
  | { kind: 'expense'; entry?: ExpenseEntry }
  | { kind: 'contract'; entry?: Contract }
  | { kind: 'confirm'; title: string; onConfirm: () => void }
  | null;

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'income', label: 'Income', icon: Wallet },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'contracts', label: 'Contracts', icon: FileSignature },
  { id: 'clients', label: 'Clients', icon: Users },
];

const fmtDate = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** The tool's workspace. Shown inside the shared tool page layout. */
export default function BusinessDashboard() {
  return (
    <CloudGate feature="Business Dashboard">
      <Dashboard />
    </CloudGate>
  );
}

function Dashboard() {
  const { assets, downloads } = useCloud();
  const { data, state, save, setCurrency } = useBusiness();
  const [tab, setTab] = useState<Tab>('overview');
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState('');
  const close = useCallback(() => setOpen(null), []);
  const { income, expenses, contracts, currency } = data;
  const money = (c: number) => formatMoney(c, currency);
  const clients = useMemo(() => knownClients(income, contracts), [income, contracts]);
  const isEmpty = income.length === 0 && expenses.length === 0 && contracts.length === 0;
  const fail = (e: unknown) => setNotice(describeError(e));

  const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]);

  const saveContract = async (c: Contract, file: File | null, removeFile: boolean) => {
    let next = c;
    const old = c.file?.assetId;
    try {
      if (file && assets) {
        const check = checkFile(file);
        if (!check.ok) return setNotice(check.reason);
        const up = await uploadBlob(assets, file, check.kind);
        next = { ...c, file: { assetId: up.assetId, name: file.name } };
      } else if (removeFile) next = { ...c, file: undefined };
      await save('contracts', (l) => upsert(l, next));
      if (old && (file || removeFile)) await deleteAssets(assets, [old]);
    } catch (e) {
      fail(e);
    }
  };

  const exportCsv = async (kind: 'income' | 'expenses') => {
    if (!downloads) return;
    try {
      await downloads.save({
        filename: `createspace-${kind}-${today()}.csv`,
        data: kind === 'income' ? incomeCsv(income) : expensesCsv(expenses),
      });
      setNotice(`Exported ${kind} as a spreadsheet file.`);
    } catch (e) {
      fail(e);
    }
  };

  const actions = {
    addIncome: () => setOpen({ kind: 'income' }),
    addExpense: () => setOpen({ kind: 'expense' }),
    addContract: () => setOpen({ kind: 'contract' }),
  };

  return (
    <div className="space-y-5">
      <LoadNotice state={state} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Business Dashboard sections" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold shadow-card transition-colors',
                tab === id ? 'bg-ink text-ink-contrast' : 'bg-surface text-muted hover:text-fg',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-muted">
          Currency
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value).catch(fail)}
            className="h-10 rounded-full border border-line bg-surface px-3 font-bold text-fg shadow-card"
          >
            {[...new Set([currency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      {notice && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5 text-sm font-bold shadow-card">
          {notice}
          <button type="button" className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:text-fg" onClick={() => setNotice('')} aria-label="Dismiss message">
            <X className="size-4" aria-hidden="true" />
          </button>
        </p>
      )}

      {tab === 'overview' &&
        (isEmpty && state !== 'loading' ? (
          <GettingStarted {...actions} />
        ) : (
          <Overview income={income} expenses={expenses} contracts={contracts} money={money} {...actions} />
        ))}

      {tab === 'income' && (
        <EntryList
          title="Income"
          addLabel="Add income"
          onAdd={actions.addIncome}
          onExport={downloads && income.length ? () => exportCsv('income') : undefined}
          dates={income.map((i) => i.date)}
          empty="Record payments you receive, and invoices you’re waiting on."
          items={income}
          total={(items) => items.filter((i) => i.status === 'paid').reduce((n, i) => n + i.amountCents, 0)}
          totalLabel="Paid"
          money={money}
          row={(i) => ({
            title: i.client || i.description || 'Payment',
            sub: [i.client && i.description, fmtDate(i.date), i.status === 'pending' && i.dueDate && `due ${fmtDate(i.dueDate)}`].filter(Boolean).join(' · '),
            amount: i.amountCents,
            badge:
              i.status === 'pending' ? (
                <Badge tone={i.dueDate && i.dueDate < today() ? 'amber' : 'neutral'}>{i.dueDate && i.dueDate < today() ? 'Overdue' : 'Waiting'}</Badge>
              ) : (
                <Badge tone="green">Paid</Badge>
              ),
            extra:
              i.status === 'pending' ? (
                <Button size="sm" onClick={() => save('income', (l) => l.map((x) => (x.id === i.id ? { ...x, status: 'paid', date: today(), dueDate: '' } : x))).catch(fail)}>
                  <Check aria-hidden="true" /> Mark paid
                </Button>
              ) : null,
          })}
          onEdit={(entry) => setOpen({ kind: 'income', entry })}
          onDelete={(entry) =>
            setOpen({ kind: 'confirm', title: 'Delete this income entry?', onConfirm: () => save('income', (l) => l.filter((x) => x.id !== entry.id)).catch(fail) })
          }
        />
      )}

      {tab === 'expenses' && (
        <EntryList
          title="Expenses"
          addLabel="Add expense"
          onAdd={actions.addExpense}
          onExport={downloads && expenses.length ? () => exportCsv('expenses') : undefined}
          dates={expenses.map((e) => e.date)}
          empty="Track business costs like software, equipment and fees. Handy at tax time."
          items={expenses}
          total={(items) => items.reduce((n, e) => n + e.amountCents, 0)}
          totalLabel="Spent"
          money={money}
          row={(e) => ({ title: e.description || e.category, sub: [e.description && e.category, fmtDate(e.date)].filter(Boolean).join(' · '), amount: e.amountCents, badge: null, extra: null })}
          onEdit={(entry) => setOpen({ kind: 'expense', entry })}
          onDelete={(entry) =>
            setOpen({ kind: 'confirm', title: 'Delete this expense?', onConfirm: () => save('expenses', (l) => l.filter((x) => x.id !== entry.id)).catch(fail) })
          }
        />
      )}

      {tab === 'contracts' && (
        <Contracts
          contracts={contracts}
          money={money}
          onAdd={actions.addContract}
          onEdit={(entry) => setOpen({ kind: 'contract', entry })}
          onStatus={(c, status) => save('contracts', (l) => l.map((x) => (x.id === c.id ? { ...x, status } : x))).catch(fail)}
          onDownload={
            downloads
              ? (c) =>
                  c.file &&
                  downloadAsset(downloads, c.file.assetId, c.file.name)
                    .then(() => setNotice(`Downloaded ${c.file!.name}.`))
                    .catch(fail)
              : undefined
          }
          onDelete={(c) =>
            setOpen({
              kind: 'confirm',
              title: `Delete “${c.title}”?`,
              onConfirm: async () => {
                await save('contracts', (l) => l.filter((x) => x.id !== c.id)).catch(fail);
                if (c.file) await deleteAssets(assets, [c.file.assetId]);
              },
            })
          }
        />
      )}

      {tab === 'clients' && <Clients income={income} contracts={contracts} money={money} />}

      {open?.kind === 'income' && (
        <IncomeDialog entry={open.entry} currency={currency} clients={clients} onClose={close} onSave={(e) => save('income', (l) => upsert(l, e)).catch(fail)} />
      )}
      {open?.kind === 'expense' && <ExpenseDialog entry={open.entry} currency={currency} onClose={close} onSave={(e) => save('expenses', (l) => upsert(l, e)).catch(fail)} />}
      {open?.kind === 'contract' && (
        <ContractDialog entry={open.entry} currency={currency} clients={clients} canAttach={!!assets} onClose={close} onSave={saveContract} />
      )}
      {open?.kind === 'confirm' && (
        <Dialog
          title={open.title}
          onClose={close}
          actions={
            <>
              <Button onClick={close} data-autofocus>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  open.onConfirm();
                  close();
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted">This can’t be undone.</p>
        </Dialog>
      )}
    </div>
  );
}

// ---------------- Overview ----------------
function GettingStarted({ addIncome, addExpense, addContract }: { addIncome: () => void; addExpense: () => void; addContract: () => void }) {
  const steps = [
    { icon: Wallet, title: 'Log income', text: 'Payments you’ve received, or invoices you’re waiting on.', action: addIncome, label: 'Add income' },
    { icon: Receipt, title: 'Track expenses', text: 'Software, gear and other business costs.', action: addExpense, label: 'Add expense' },
    { icon: FileSignature, title: 'Keep contracts', text: 'Deals, dates and signed files in one place.', action: addContract, label: 'Add contract' },
  ];
  return (
    <div className="panel p-5 sm:p-7">
      <h2 className="font-display text-xl">Your business at a glance</h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
        Nothing here yet, and that’s fine. Add things only when you have them; the totals, charts and reminders fill in as you go. Everything is private to your account.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text, action, label }) => (
          <div key={title} className="flex flex-col rounded-[22px] bg-surface p-4 shadow-card">
            <Icon className="size-6 text-muted" aria-hidden="true" />
            <h3 className="mt-2 font-extrabold">{title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted">{text}</p>
            <Button size="sm" className="mt-3 self-start" onClick={action}>
              <Plus aria-hidden="true" /> {label}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, note, accent }: { label: string; value: string; note?: string; accent: string }) {
  return (
    <div style={{ '--accent': accent } as CSSProperties} className="tile rounded-[22px] p-4">
      <p className="text-xs font-extrabold tile-ink opacity-80">{label}</p>
      <p className="mt-1 text-xl font-extrabold tracking-tight tile-ink tabular-nums sm:text-2xl">{value}</p>
      {note && <p className="mt-0.5 text-xs font-bold tile-ink opacity-75">{note}</p>}
    </div>
  );
}

function Overview(props: {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  contracts: Contract[];
  money: (c: number) => string;
  addIncome: () => void;
  addExpense: () => void;
  addContract: () => void;
}) {
  const { income, expenses, contracts, money } = props;
  const s = summarize(income, expenses);
  const months = monthlyIncome(income);
  const max = Math.max(...months.map((m) => m.cents), 1);
  const next = upcoming(income, contracts).slice(0, 6);
  const year = today().slice(0, 4);
  const active = contracts.filter((c) => c.status === 'signed' || c.status === 'sent');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Earned this month" value={money(s.earnedThisMonth)} accent="#2FA866" />
        <Stat label={`Earned in ${year}`} value={money(s.earnedThisYear)} accent="#3778E0" />
        <Stat label="Waiting to be paid" value={money(s.outstanding)} note={s.overdue ? `${money(s.overdue)} overdue` : undefined} accent="#D99A14" />
        <Stat label={`Profit in ${year}`} value={money(s.profitThisYear)} note={`after ${money(s.expensesThisYear)} expenses`} accent="#8257E6" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="panel p-4 sm:p-6" aria-labelledby="chart-h">
          <h2 id="chart-h" className="font-display text-lg">
            Income, last 12 months
          </h2>
          <div className="mt-4 flex h-44 items-end gap-1.5 sm:gap-2" aria-hidden="true">
            {months.map((m) => (
              <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div
                  className="w-full rounded-t-lg bg-[#2FA866]/70 transition-[height] duration-500 dark:bg-[#2FA866]/60"
                  style={{ height: `${m.cents ? Math.max(4, (m.cents / max) * 100) : 0}%` }}
                  title={`${m.label}: ${money(m.cents)}`}
                />
                <span className="text-[0.625rem] font-bold text-muted">{m.label}</span>
              </div>
            ))}
          </div>
          <table className="sr-only">
            <caption>Paid income by month</caption>
            <tbody>
              {months.map((m) => (
                <tr key={m.key}>
                  <th>{m.label}</th>
                  <td>{money(m.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel p-4 sm:p-6" aria-labelledby="upcoming-h">
          <h2 id="upcoming-h" className="font-display text-lg">
            Coming up
          </h2>
          {next.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-muted">No payments waiting and no contracts ending soon.</p>
          ) : (
            <ul className="mt-3 space-y-2" aria-label="Coming up">
              {next.map((u) => {
                const late = u.daysAway < 0;
                const when = !Number.isFinite(u.daysAway)
                  ? 'no due date'
                  : u.daysAway === 0
                    ? 'today'
                    : late
                      ? `${-u.daysAway} ${u.daysAway === -1 ? 'day' : 'days'} overdue`
                      : `in ${u.daysAway} ${u.daysAway === 1 ? 'day' : 'days'}`;
                return (
                  <li key={u.kind + u.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', late ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-surface-2 text-muted')}>
                      {late ? <AlertCircle className="size-4" aria-hidden="true" /> : u.kind === 'payment' ? <Wallet className="size-4" aria-hidden="true" /> : <CalendarClock className="size-4" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{u.title}</span>
                      <span className="block text-xs font-semibold text-muted">
                        {u.kind === 'payment' ? 'Payment' : 'Contract ends'} · {when}
                      </span>
                    </span>
                    {u.amountCents > 0 && <span className="text-sm font-extrabold tabular-nums">{money(u.amountCents)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs font-bold text-muted">
            {active.length} active {active.length === 1 ? 'contract' : 'contracts'}
          </p>
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={props.addIncome}>
          <Plus aria-hidden="true" /> Add income
        </Button>
        <Button size="sm" onClick={props.addExpense}>
          <Plus aria-hidden="true" /> Add expense
        </Button>
        <Button size="sm" onClick={props.addContract}>
          <Plus aria-hidden="true" /> Add contract
        </Button>
      </div>
    </div>
  );
}

// ---------------- Lists ----------------
interface RowView {
  title: string;
  sub: string;
  amount: number;
  badge: ReactNode;
  extra: ReactNode;
}

function EntryList<T extends { id: string; date: string }>(props: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  onExport?: () => void;
  dates: string[];
  empty: string;
  items: T[];
  total: (items: T[]) => number;
  totalLabel: string;
  money: (c: number) => string;
  row: (item: T) => RowView;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
}) {
  const years = yearsIn(props.dates);
  const [year, setYear] = useState<number | 'all'>(years[0]);
  const shown = props.items.filter((i) => year === 'all' || i.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="panel p-4 sm:p-6" aria-label={props.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-lg">{props.title}</h2>
          {props.items.length > 0 && (
            <span className="text-sm font-bold text-muted">
              {props.totalLabel}: <span className="text-fg tabular-nums">{props.money(props.total(shown))}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.items.length > 0 && (
            <select
              aria-label="Year"
              value={year}
              onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="h-9 rounded-full border border-line bg-surface px-3 text-sm font-bold shadow-card"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              <option value="all">All years</option>
            </select>
          )}
          {props.onExport && (
            <Button size="sm" onClick={props.onExport}>
              <Download aria-hidden="true" /> Export CSV
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={props.onAdd}>
            <Plus aria-hidden="true" /> {props.addLabel}
          </Button>
        </div>
      </div>

      {props.items.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-muted">{props.empty}</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-muted">Nothing recorded in {year}.</p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label={`${props.title} entries`}>
          {shown.map((item) => {
            const r = props.row(item);
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-surface p-3 shadow-card">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-extrabold">{r.title}</span>
                    {r.badge}
                  </span>
                  <span className="block truncate text-xs font-semibold text-muted">{r.sub}</span>
                </span>
                <span className="font-extrabold tabular-nums">{props.money(r.amount)}</span>
                <span className="flex items-center gap-1">
                  {r.extra}
                  <IconButton label={`Edit ${r.title}`} onClick={() => props.onEdit(item)}>
                    <Pencil />
                  </IconButton>
                  <IconButton label={`Delete ${r.title}`} onClick={() => props.onDelete(item)}>
                    <Trash2 />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg [&_svg]:size-4">
      {children}
    </button>
  );
}

const contractTone = (s: ContractStatus) => (s === 'signed' ? 'green' : s === 'sent' ? 'blue' : s === 'completed' ? 'neutral' : s === 'cancelled' ? 'outline' : 'amber');

function Contracts(props: {
  contracts: Contract[];
  money: (c: number) => string;
  onAdd: () => void;
  onEdit: (c: Contract) => void;
  onStatus: (c: Contract, s: ContractStatus) => void;
  onDownload?: (c: Contract) => void;
  onDelete: (c: Contract) => void;
}) {
  const order: ContractStatus[] = ['signed', 'sent', 'draft', 'completed', 'cancelled'];
  const sorted = [...props.contracts].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.endDate || '9').localeCompare(b.endDate || '9'));
  return (
    <section className="panel p-4 sm:p-6" aria-label="Contracts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg">Contracts</h2>
        <Button size="sm" variant="primary" onClick={props.onAdd}>
          <Plus aria-hidden="true" /> Add contract
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-muted">Keep track of client agreements: what’s agreed, dates, value, and the signed file.</p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2" aria-label="Contract list">
          {sorted.map((c) => (
            <li key={c.id} className="flex flex-col rounded-[22px] bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-extrabold break-words">{c.title}</p>
                  {c.client && <p className="text-sm font-semibold text-muted">{c.client}</p>}
                </div>
                <Badge tone={contractTone(c.status)}>{CONTRACT_STATUS_LABELS[c.status]}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {c.valueCents > 0 && (
                  <div>
                    <dt className="text-xs font-bold text-muted">Value</dt>
                    <dd className="font-extrabold tabular-nums">{props.money(c.valueCents)}</dd>
                  </div>
                )}
                {(c.startDate || c.endDate) && (
                  <div>
                    <dt className="text-xs font-bold text-muted">Dates</dt>
                    <dd className="font-bold">{[fmtDate(c.startDate), fmtDate(c.endDate)].filter(Boolean).join(' → ')}</dd>
                  </div>
                )}
              </dl>
              {c.notes && <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-muted">{c.notes}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                <label className="sr-only" htmlFor={`cs-${c.id}`}>
                  Status of {c.title}
                </label>
                <select
                  id={`cs-${c.id}`}
                  value={c.status}
                  onChange={(e) => props.onStatus(c, e.target.value as ContractStatus)}
                  className="h-9 rounded-full border border-line bg-surface-2 px-3 text-sm font-bold"
                >
                  {Object.entries(CONTRACT_STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                {c.file && props.onDownload && (
                  <Button size="sm" variant="ghost" onClick={() => props.onDownload!(c)} aria-label={`Download ${c.file.name}`}>
                    <Paperclip aria-hidden="true" /> <span className="max-w-32 truncate">{c.file.name}</span>
                  </Button>
                )}
                <span className="ml-auto flex">
                  <IconButton label={`Edit ${c.title}`} onClick={() => props.onEdit(c)}>
                    <Pencil />
                  </IconButton>
                  <IconButton label={`Delete ${c.title}`} onClick={() => props.onDelete(c)}>
                    <Trash2 />
                  </IconButton>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Clients({ income, contracts, money }: { income: IncomeEntry[]; contracts: Contract[]; money: (c: number) => string }) {
  const list = clientSummaries(income, contracts);
  return (
    <section className="panel p-4 sm:p-6" aria-label="Clients">
      <h2 className="font-display text-lg">Clients</h2>
      <p className="mt-1 text-sm text-muted">Built automatically from the client names on your income and contracts.</p>
      {list.length === 0 ? (
        <EmptyState icon={Users} title="No clients yet" className="mt-4">
          Add a client name when you log income or a contract and they’ll show up here.
        </EmptyState>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Client list">
          {list.map((c) => (
            <li key={c.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-2xl bg-surface p-3.5 shadow-card sm:grid-cols-[minmax(0,1fr)_repeat(3,auto)]">
              <span className="min-w-0">
                <span className="block truncate font-extrabold">{c.name}</span>
                <span className="block text-xs font-semibold text-muted">
                  {c.contracts} {c.contracts === 1 ? 'contract' : 'contracts'}
                  {c.activeContracts ? ` (${c.activeContracts} active)` : ''}
                  {c.lastDate && ` · last ${fmtDate(c.lastDate)}`}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-xs font-bold text-muted">Paid</span>
                <span className="font-extrabold tabular-nums">{money(c.paidCents)}</span>
              </span>
              {c.outstandingCents > 0 && (
                <span className="col-start-2 text-right sm:col-start-auto">
                  <span className="block text-xs font-bold text-muted">Waiting</span>
                  <span className="font-extrabold text-amber-700 tabular-nums dark:text-amber-300">{money(c.outstandingCents)}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
