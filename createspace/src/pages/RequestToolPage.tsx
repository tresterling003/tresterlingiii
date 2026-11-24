import { MessageSquarePlus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/** Placeholder entry point. Tool requests need a backend, which is planned for a later version. */
export function RequestToolPage() {
  useDocumentTitle('Request a Tool');
  return (
    <div className="max-w-3xl animate-fade-up">
      <PageHeader
        eyebrow={<Badge tone="outline">Planned</Badge>}
        title="Request a Tool"
        description="Soon you’ll be able to suggest tools you’d like to see in CreateSpace."
      />
      <div className="mt-8 flex gap-4 rounded-lg border border-dashed border-line-strong p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
          <MessageSquarePlus className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold">Requests aren’t open yet</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Sending a request needs a server to receive it, and CreateSpace doesn’t have one yet. Nothing on this page
            collects or sends information.
          </p>
          <ButtonLink to="/tools" size="sm" className="mt-4">
            Browse planned tools
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
