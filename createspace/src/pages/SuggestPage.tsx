import { Inbox, Lightbulb, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCloud } from '@/cloud/CloudProvider';
import { formatWhen } from '@/cloud/files';
import { newId } from '@/cloud/projectModel';
import { describeError, type Profile } from '@/cloud/runtime';
import {
  DETAILS_MAX,
  MAX_PER_PERSON,
  STATUS_LABELS,
  TITLE_MAX,
  validateSuggestion,
  type Suggestion,
  type SuggestionStatus,
} from '@/cloud/suggestionModel';
import { updateSuggestionDoc, useMySuggestions, useSuggestionInbox, type InboxEntry } from '@/cloud/useCloudData';
import { CloudGate, LoadNotice } from '@/components/cloud/CloudGate';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader, SectionHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/cn';
import { CATEGORIES } from '@/tools/categories';

const statusTone = (s: SuggestionStatus): 'green' | 'blue' | 'amber' | 'outline' | 'neutral' =>
  s === 'added' ? 'green' : s === 'planned' ? 'blue' : s === 'considering' ? 'amber' : s === 'not-now' ? 'outline' : 'neutral';

export function SuggestPage() {
  useDocumentTitle('Suggest a Tool');
  const { isOwner, status } = useCloud();
  const [tab, setTab] = useState<'suggest' | 'inbox'>('suggest');

  return (
    <div className="animate-fade-up space-y-5 sm:space-y-6">
      <PageHeader
        title="Suggest a Tool"
        description="Tell us what you’d like CreateSpace to add. Every suggestion is read."
        actions={
          isOwner &&
          status === 'ready' && (
            <div role="tablist" aria-label="Suggestions view" className="inline-flex rounded-full bg-surface p-1 shadow-card">
              {(['suggest', 'inbox'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors',
                    tab === t ? 'bg-ink text-ink-contrast' : 'text-muted hover:text-fg',
                  )}
                >
                  {t === 'suggest' ? <Lightbulb className="size-4" aria-hidden="true" /> : <Inbox className="size-4" aria-hidden="true" />}
                  {t === 'suggest' ? 'Suggest' : 'Inbox'}
                </button>
              ))}
            </div>
          )
        }
      />
      <CloudGate feature="Suggesting a tool">{tab === 'inbox' && isOwner ? <OwnerInbox /> : <SuggestForm />}</CloudGate>
    </div>
  );
}

function SuggestForm() {
  const { db, userId } = useCloud();
  const { items, state } = useMySuggestions();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSent(false);
    const problem = validateSuggestion(title, details);
    if (problem) return setError(problem);
    if (items.length >= MAX_PER_PERSON) return setError(`You’ve reached the limit of ${MAX_PER_PERSON} suggestions. Thank you!`);
    if (!db || !userId) return;
    setError('');
    setSending(true);
    const entry: Suggestion = {
      id: newId('s'),
      title: title.trim(),
      details: details.trim(),
      category,
      status: 'new',
      createdAt: new Date().toISOString(),
    };
    try {
      await updateSuggestionDoc(db, userId, (list) => [entry, ...list]);
      setTitle('');
      setDetails('');
      setCategory('');
      setSent(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    if (!db || !userId) return;
    await updateSuggestionDoc(db, userId, (list) => list.filter((s) => s.id !== id)).catch((err) => setError(describeError(err)));
  };

  return (
    <>
      <Panel label="New suggestion">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <TextField label="What tool should we add?" value={title} onChange={setTitle} maxLength={TITLE_MAX} placeholder="e.g. Font pairing helper" />
          <TextField
            label="What would it help you do?"
            value={details}
            onChange={setDetails}
            maxLength={DETAILS_MAX}
            multiline
            placeholder="Describe the problem it would solve and how you’d use it."
          />
          <fieldset>
            <legend className="mb-1.5 px-1 text-sm font-extrabold">Category (optional)</legend>
            <div className="flex flex-wrap gap-1.5">
              {[...CATEGORIES.map((c) => c.name), 'Not sure'].map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={category === name}
                  onClick={() => setCategory(category === name ? '' : name)}
                  className={cn(
                    'h-9 rounded-full px-3.5 text-sm font-bold shadow-card transition-colors',
                    category === name ? 'bg-ink text-ink-contrast' : 'bg-surface text-muted hover:text-fg',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" variant="primary" disabled={sending}>
              <Send aria-hidden="true" /> {sending ? 'Sending…' : 'Send suggestion'}
            </Button>
            <p role="status" aria-live="polite" className={cn('text-sm font-bold', error ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-300')}>
              {error || (sent ? 'Thanks! Your suggestion was sent.' : '')}
            </p>
          </div>
        </form>
      </Panel>

      <Panel label="Your suggestions">
        <SectionHeader title="Your suggestions" count={items.length || undefined} />
        <LoadNotice state={state} />
        {items.length === 0 ? (
          <p className="px-1 text-sm font-semibold text-muted">Suggestions you send appear here, with what’s happening to each one.</p>
        ) : (
          <ul className="space-y-2" aria-label="Your suggestions">
            {items.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-2xl bg-surface p-3.5 shadow-card">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold break-words">{s.title}</span>
                    <Badge tone={statusTone(s.status)}>{STATUS_LABELS[s.status]}</Badge>
                  </div>
                  {s.details && <p className="mt-1 text-sm break-words whitespace-pre-line text-muted">{s.details}</p>}
                  <p className="mt-1 text-xs font-semibold text-muted">
                    {[s.category, formatWhen(s.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  aria-label={`Withdraw suggestion “${s.title}”`}
                  title="Withdraw"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function OwnerInbox() {
  const { db, user } = useCloud();
  const { items, state } = useSuggestionInbox(true);
  const [filter, setFilter] = useState<SuggestionStatus | 'all'>('all');
  const [names, setNames] = useState<Record<string, Profile>>({});
  const [error, setError] = useState('');

  // Resolve authors' display names on every change (the platform caches these).
  const authorKey = [...new Set(items.map((i) => i.authorId))].sort().join(',');
  useEffect(() => {
    if (!user || !authorKey) return;
    let live = true;
    user.profiles(authorKey.split(',')).then((p) => live && setNames(p)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user, authorKey]);

  const shown = filter === 'all' ? items : items.filter((i) => i.status === filter);

  const setStatus = (entry: InboxEntry, status: SuggestionStatus) =>
    db && updateSuggestionDoc(db, entry.authorId, (list) => list.map((s) => (s.id === entry.id ? { ...s, status } : s))).catch((e) => setError(describeError(e)));
  const remove = (entry: InboxEntry) =>
    db && updateSuggestionDoc(db, entry.authorId, (list) => list.filter((s) => s.id !== entry.id)).catch((e) => setError(describeError(e)));

  return (
    <Panel label="Suggestions inbox">
      <SectionHeader title="Inbox" count={items.length} />
      <p className="-mt-1 mb-3 px-1 text-sm text-muted">Only you can see this. Statuses you set are shown to the person who suggested it.</p>
      <div role="group" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-1.5">
        {(['all', ...Object.keys(STATUS_LABELS)] as Array<SuggestionStatus | 'all'>).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={cn(
              'h-8 rounded-full px-3 text-sm font-bold shadow-card',
              filter === s ? 'bg-ink text-ink-contrast' : 'bg-surface text-muted hover:text-fg',
            )}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
            <span className="ml-1 opacity-60 tabular-nums">{s === 'all' ? items.length : items.filter((i) => i.status === s).length}</span>
          </button>
        ))}
      </div>
      <LoadNotice state={state} />
      {error && <p className="mb-3 text-sm font-bold text-red-600">{error}</p>}
      {shown.length === 0 ? (
        <EmptyState icon={Inbox} title={items.length ? 'Nothing with this status' : 'No suggestions yet'}>
          {items.length ? 'Choose another filter.' : 'Share CreateSpace and suggestions will arrive here.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2" aria-label="All suggestions">
          {shown.map((s) => (
            <li key={`${s.authorId}-${s.id}`} className="rounded-2xl bg-surface p-3.5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-extrabold break-words">{s.title}</p>
                  {s.details && <p className="mt-1 text-sm break-words whitespace-pre-line text-muted">{s.details}</p>}
                  <p className="mt-1 text-xs font-semibold text-muted">
                    {[names[s.authorId]?.name || 'Someone', s.category, formatWhen(s.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="sr-only" htmlFor={`st-${s.id}`}>
                    Status for {s.title}
                  </label>
                  <select
                    id={`st-${s.id}`}
                    value={s.status}
                    onChange={(e) => setStatus(s, e.target.value as SuggestionStatus)}
                    className="h-9 rounded-full border border-line bg-surface-2 px-3 text-sm font-bold"
                  >
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => remove(s)}
                    aria-label={`Delete suggestion “${s.title}”`}
                    className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
