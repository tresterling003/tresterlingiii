import { Monitor, Moon, Sun } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { APP_VERSION } from '@/data/updates';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/cn';
import { clearAll } from '@/lib/storage';
import type { ThemePreference } from '@/lib/theme';
import { useFavorites } from '@/state/FavoritesProvider';
import { useTheme } from '@/state/ThemeProvider';

function Row({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-md">
        <h3 className="text-[0.9375rem] font-extrabold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 px-1 font-display text-lg">{title}</h2>
      <div className="panel divide-y divide-line">{children}</div>
    </section>
  );
}

/** A button that asks "Are you sure?" inline before doing something destructive. */
function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button size="sm" onClick={() => setAsking(true)} disabled={disabled}>
        {label}
      </Button>
    );
  return (
    <div className="flex animate-fade-in gap-2">
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
        Cancel
      </Button>
      <Button
        size="sm"
        variant="danger"
        autoFocus
        onClick={() => {
          onConfirm();
          setAsking(false);
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}

const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsPage() {
  useDocumentTitle('Settings');
  const { preference, setPreference } = useTheme();
  const favorites = useFavorites();
  const [notice, setNotice] = useState('');
  const count = favorites.ids.length;

  return (
    <div className="animate-fade-up">
      <PageHeader title="Settings" description="Preferences are saved in this browser only." />

      <div className="mt-8 space-y-8">
        <Panel title="Appearance">
          <Row title="Theme" description="Choose light or dark, or follow your device’s setting.">
            <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full bg-surface-2 p-1">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    'relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand',
                    preference === value ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={preference === value}
                    onChange={() => setPreference(value)}
                    className="sr-only"
                  />
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </label>
              ))}
            </div>
          </Row>
        </Panel>

        <Panel title="Favorites">
          <Row
            title="Saved tools"
            description={
              count > 0 ? (
                <>
                  You have {count} {count === 1 ? 'tool' : 'tools'} in{' '}
                  <Link to="/favorites" className="font-medium text-fg underline decoration-line-strong underline-offset-2">
                    Favorites
                  </Link>
                  .
                </>
              ) : (
                'You haven’t bookmarked any tools yet.'
              )
            }
          >
            <ConfirmButton
              label="Clear favorites"
              confirmLabel={`Remove ${count}`}
              disabled={count === 0}
              onConfirm={() => {
                favorites.clear();
                setNotice('Favorites cleared.');
              }}
            />
          </Row>
        </Panel>

        <Panel title="Your data">
          <Row
            title="Stored on this device"
            description="Your theme and favorites are saved in this browser only. Projects and suggestions are saved to your account in the cloud and aren’t affected by this reset."
          >
            <ConfirmButton
              label="Reset everything"
              confirmLabel="Reset"
              onConfirm={() => {
                clearAll();
                favorites.clear();
                setPreference('system');
                clearAll(); // remove the "system" value just written, leaving storage truly empty
                setNotice('All CreateSpace preferences were reset.');
              }}
            />
          </Row>
        </Panel>

        <p role="status" aria-live="polite" className={cn('text-sm font-medium', !notice && 'sr-only')}>
          {notice}
        </p>

        <p className="px-1 text-sm text-muted">
          CreateSpace v{APP_VERSION} ·{' '}
          <Link to="/whats-new" className="underline decoration-line-strong underline-offset-2 hover:text-fg">
            What’s New
          </Link>
        </p>
      </div>
    </div>
  );
}
