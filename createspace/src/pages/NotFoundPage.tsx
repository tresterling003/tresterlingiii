import { Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <EmptyState
      icon={Compass}
      title="This page doesn’t exist"
      className="mt-6"
      actions={
        <>
          <ButtonLink to="/" variant="primary" size="sm">
            Go to dashboard
          </ButtonLink>
          <ButtonLink to="/tools" size="sm">
            All tools
          </ButtonLink>
        </>
      }
    >
      The link may be mistyped, or the page may have moved.
    </EmptyState>
  );
}
