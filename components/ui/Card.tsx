export function Card({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`rounded-2xl border border-border bg-white p-5 shadow-sm shadow-black/[0.02] ${className}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-white/60 px-6 py-14 text-center">
      {icon && <div className="text-3xl">{icon}</div>}
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  color = "#6366f1",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `${color}1f`, color }}
    >
      {children}
    </span>
  );
}
