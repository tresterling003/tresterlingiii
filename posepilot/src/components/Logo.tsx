export function Logo({ size = 22, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#1c1d22" stroke="#373a43" />
        <circle cx="16" cy="8.2" r="3.2" fill="none" stroke="#4d8dff" strokeWidth="2.2" />
        <path d="M16 11.4v8.4M16 14.2l-6 3.6M16 14.2l7.2-3.2M16 19.8l-5 6.4M16 19.8l6 5.8" stroke="#ecebe8" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
      {withText && <span className="font-semibold tracking-tight text-[14.5px]">Pose<span className="text-accent">Pilot</span></span>}
    </span>
  );
}
