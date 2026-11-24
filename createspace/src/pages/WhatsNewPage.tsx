import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { UPDATES, formatDate } from '@/data/updates';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function WhatsNewPage() {
  useDocumentTitle('What’s New');
  return (
    <div className="max-w-3xl animate-fade-up">
      <PageHeader title="What’s New" description="Updates to CreateSpace, newest first." />
      <ol className="mt-8 space-y-4">
        {UPDATES.map((u) => (
          <li key={u.version} className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>v{u.version}</Badge>
              <h2 className="font-display text-lg font-semibold">{u.title}</h2>
              <time dateTime={u.date} className="ml-auto text-sm text-muted">
                {formatDate(u.date)}
              </time>
            </div>
            <ul className="mt-3 space-y-1.5">
              {u.highlights.map((h) => (
                <li key={h} className="flex gap-2.5 text-sm leading-relaxed">
                  <span aria-hidden="true" className="mt-[9px] size-1 shrink-0 rounded-full bg-brand" />
                  {h}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
