import { Construction } from 'lucide-react';
import { STATUS } from '@/tools/status';
import type { ToolDefinition } from '@/tools/types';

/** Workspace contents for a tool that isn't built yet. Never pretends the tool works. */
export function ToolUnavailable({ tool }: { tool: ToolDefinition }) {
  return (
    <div className="panel relative overflow-hidden">
      {/* faint accent grid suggesting an empty workspace, not a fake interface */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />
      <div className="relative mx-auto flex min-h-[340px] max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-surface text-muted shadow-card">
          <Construction className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-display text-xl">{tool.name} isn’t available yet</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {STATUS[tool.status].explanation} Save it to your favorites and it’ll be waiting here when it launches.
        </p>
        {tool.tentative && (
          <p className="mt-2 text-sm text-muted">This tool is tentative and may change or be replaced.</p>
        )}

        <div className="mt-6 w-full rounded-[20px] bg-surface p-4 text-left shadow-card">
          <h3 className="text-sm font-extrabold text-muted">Planned</h3>
          <ul className="mt-2 space-y-1.5">
            {tool.plannedFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm font-semibold">
                <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-(--accent)" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
