import { Paperclip, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { checkFile } from '@/cloud/files';
import { newId } from '@/cloud/projectModel';
import { Button } from '@/components/ui/Button';
import { Dialog, TextField } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';
import {
  centsToInput,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  EXPENSE_CATEGORIES,
  parseMoney,
  today,
  type Contract,
  type ContractStatus,
  type ExpenseCategory,
  type ExpenseEntry,
  type IncomeEntry,
} from './model';

const inputCls =
  'h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base font-semibold text-fg shadow-card outline-none focus:border-line-strong focus:ring-4 focus:ring-brand/15';

export function Field({ label, children, error }: { label: string; children: (id: string) => ReactNode; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block px-1 text-sm font-extrabold">
        {label}
      </label>
      {children(id)}
      {error && <p className="mt-1 px-1 text-xs font-bold text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function MoneyInput({ label, value, onChange, currency, error }: { label: string; value: string; onChange: (v: string) => void; currency: string; error?: string }) {
  return (
    <Field label={`${label} (${currency})`} error={error}>
      {(id) => <input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" className={inputCls} />}
    </Field>
  );
}

function DateInput({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label={label} error={error}>
      {(id) => <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />}
    </Field>
  );
}

function ClientInput({ value, onChange, clients }: { value: string; onChange: (v: string) => void; clients: string[] }) {
  const listId = useId();
  return (
    <Field label="Client (optional)">
      {(id) => (
        <>
          <input id={id} list={listId} value={value} maxLength={120} onChange={(e) => onChange(e.target.value)} placeholder="Who is it for?" className={inputCls} />
          <datalist id={listId}>
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </>
      )}
    </Field>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 px-1 text-sm font-extrabold">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn('h-9 rounded-full px-3.5 text-sm font-bold shadow-card', value === o.value ? 'bg-ink text-ink-contrast' : 'bg-surface text-muted hover:text-fg')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function FormDialog({ title, onClose, onSubmit, submitLabel, children }: { title: string; onClose: () => void; onSubmit: () => void; submitLabel: string; children: ReactNode }) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onSubmit}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        className="max-h-[60vh] space-y-4 overflow-y-auto px-0.5 pb-1"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}

// ---------------- Income ----------------
export function IncomeDialog({
  entry,
  currency,
  clients,
  onSave,
  onClose,
}: {
  entry?: IncomeEntry;
  currency: string;
  clients: string[];
  onSave: (e: IncomeEntry) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(entry?.date ?? today());
  const [client, setClient] = useState(entry?.client ?? '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [amount, setAmount] = useState(entry ? centsToInput(entry.amountCents) : '');
  const [status, setStatus] = useState<IncomeEntry['status']>(entry?.status ?? 'paid');
  const [dueDate, setDueDate] = useState(entry?.dueDate ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const cents = parseMoney(amount);
    const e: Record<string, string> = {};
    if (cents === null || cents === 0) e.amount = 'Enter an amount, like 250 or 1,200.50';
    if (!date) e.date = 'Choose a date';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({
      id: entry?.id ?? newId('i'),
      date,
      client: client.trim(),
      description: description.trim(),
      amountCents: cents!,
      status,
      dueDate: status === 'pending' ? dueDate : '',
    });
    onClose();
  };

  return (
    <FormDialog title={entry ? 'Edit income' : 'Add income'} onClose={onClose} onSubmit={submit} submitLabel={entry ? 'Save' : 'Add income'}>
      <MoneyInput label="Amount" value={amount} onChange={setAmount} currency={currency} error={errors.amount} />
      <Segmented
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'paid', label: 'Paid' },
          { value: 'pending', label: 'Waiting for payment' },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateInput label={status === 'paid' ? 'Date paid' : 'Date invoiced'} value={date} onChange={setDate} error={errors.date} />
        {status === 'pending' && <DateInput label="Payment due (optional)" value={dueDate} onChange={setDueDate} />}
      </div>
      <ClientInput value={client} onChange={setClient} clients={clients} />
      <TextField label="What was it for? (optional)" value={description} onChange={setDescription} maxLength={300} placeholder="e.g. Logo design, wedding shoot" />
    </FormDialog>
  );
}

// ---------------- Expense ----------------
export function ExpenseDialog({ entry, currency, onSave, onClose }: { entry?: ExpenseEntry; currency: string; onSave: (e: ExpenseEntry) => void; onClose: () => void }) {
  const [date, setDate] = useState(entry?.date ?? today());
  const [description, setDescription] = useState(entry?.description ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(entry?.category ?? 'Software');
  const [amount, setAmount] = useState(entry ? centsToInput(entry.amountCents) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const cents = parseMoney(amount);
    const e: Record<string, string> = {};
    if (cents === null || cents === 0) e.amount = 'Enter an amount, like 19.99';
    if (!date) e.date = 'Choose a date';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ id: entry?.id ?? newId('e'), date, description: description.trim(), category, amountCents: cents! });
    onClose();
  };

  return (
    <FormDialog title={entry ? 'Edit expense' : 'Add expense'} onClose={onClose} onSubmit={submit} submitLabel={entry ? 'Save' : 'Add expense'}>
      <MoneyInput label="Amount" value={amount} onChange={setAmount} currency={currency} error={errors.amount} />
      <DateInput label="Date" value={date} onChange={setDate} error={errors.date} />
      <Segmented label="Category" value={category} onChange={setCategory} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
      <TextField label="What was it? (optional)" value={description} onChange={setDescription} maxLength={300} placeholder="e.g. Adobe subscription, camera lens" />
    </FormDialog>
  );
}

// ---------------- Contract ----------------
export function ContractDialog({
  entry,
  currency,
  clients,
  canAttach,
  onSave,
  onClose,
}: {
  entry?: Contract;
  currency: string;
  clients: string[];
  canAttach: boolean;
  /** `file` is a newly chosen attachment to upload; `removeFile` drops the current one. */
  onSave: (c: Contract, file: File | null, removeFile: boolean) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [client, setClient] = useState(entry?.client ?? '');
  const [value, setValue] = useState(entry?.valueCents ? centsToInput(entry.valueCents) : '');
  const [startDate, setStartDate] = useState(entry?.startDate ?? '');
  const [endDate, setEndDate] = useState(entry?.endDate ?? '');
  const [status, setStatus] = useState<ContractStatus>(entry?.status ?? 'draft');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileId = useId();

  const submit = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give the contract a name';
    const cents = value.trim() ? parseMoney(value) : 0;
    if (cents === null) e.value = 'Enter an amount, like 2,500';
    if (startDate && endDate && endDate < startDate) e.endDate = 'The end date is before the start date';
    if (file) {
      const check = checkFile(file);
      if (!check.ok) e.file = check.reason;
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave(
      { id: entry?.id ?? newId('c'), title: title.trim(), client: client.trim(), valueCents: cents ?? 0, startDate, endDate, status, notes: notes.trim(), file: entry?.file },
      file,
      removeFile,
    );
    onClose();
  };

  const currentFile = !removeFile && !file ? entry?.file : undefined;

  return (
    <FormDialog title={entry ? 'Edit contract' : 'Add contract'} onClose={onClose} onSubmit={submit} submitLabel={entry ? 'Save' : 'Add contract'}>
      <div>
        <TextField label="Contract name" value={title} onChange={setTitle} maxLength={160} placeholder="e.g. Brand identity package" />
        {errors.title && <p className="mt-1 px-1 text-xs font-bold text-red-600 dark:text-red-400">{errors.title}</p>}
      </div>
      <ClientInput value={client} onChange={setClient} clients={clients} />
      <Segmented label="Status" value={status} onChange={setStatus} options={CONTRACT_STATUSES.map((s) => ({ value: s, label: CONTRACT_STATUS_LABELS[s] }))} />
      <MoneyInput label="Total value (optional)" value={value} onChange={setValue} currency={currency} error={errors.value} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateInput label="Start date (optional)" value={startDate} onChange={setStartDate} />
        <DateInput label="End / delivery date (optional)" value={endDate} onChange={setEndDate} error={errors.endDate} />
      </div>
      <TextField label="Notes (optional)" value={notes} onChange={setNotes} maxLength={2000} multiline placeholder="Deliverables, revisions included, payment terms…" />
      {canAttach && (
        <div>
          <span className="mb-1.5 block px-1 text-sm font-extrabold">Contract file (optional)</span>
          {currentFile || file ? (
            <div className="flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 shadow-card">
              <Paperclip className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{file?.name ?? currentFile?.name}</span>
              <button
                type="button"
                aria-label="Remove file"
                onClick={() => (file ? setFile(null) : setRemoveFile(true))}
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label htmlFor={fileId} className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong text-sm font-bold text-muted hover:text-fg">
              <Paperclip className="size-4" aria-hidden="true" /> Attach a PDF or image
            </label>
          )}
          <input
            id={fileId}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          {errors.file && <p className="mt-1 px-1 text-xs font-bold text-red-600 dark:text-red-400">{errors.file}</p>}
        </div>
      )}
    </FormDialog>
  );
}
