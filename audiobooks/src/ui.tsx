import type { ReactNode, SVGProps } from 'react';

/** 3725 -> "1:02:05", 125 -> "2:05" */
export function clock(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** 47204 -> "13 h 7 min", 600 -> "10 min" */
export function length(sec: number) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (!h) return `${Math.max(1, m)} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const go = (hash: string) => {
  location.hash = hash;
};

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
const Svg = ({ size = 24, children, ...p }: IconProps & { children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {children}
  </svg>
);

export const IPlay = (p: IconProps) => (
  <Svg {...p}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none" /></Svg>
);
export const IPause = (p: IconProps) => (
  <Svg {...p}><rect x="6" y="4" width="4.2" height="16" rx="1.2" fill="currentColor" stroke="none" /><rect x="13.8" y="4" width="4.2" height="16" rx="1.2" fill="currentColor" stroke="none" /></Svg>
);
export const IBack = ({ sec, ...p }: IconProps & { sec: number }) => (
  <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v5h5" /><text x="12" y="15.5" fontSize="7.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">{sec}</text></Svg>
);
export const IFwd = ({ sec, ...p }: IconProps & { sec: number }) => (
  <Svg {...p}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v5h-5" /><text x="12" y="15.5" fontSize="7.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">{sec}</text></Svg>
);
export const IPrev = (p: IconProps) => (
  <Svg {...p}><path d="M18 5v14l-9-7 9-7Z" fill="currentColor" /><path d="M6 5v14" /></Svg>
);
export const INext = (p: IconProps) => (
  <Svg {...p}><path d="M6 5v14l9-7-9-7Z" fill="currentColor" /><path d="M18 5v14" /></Svg>
);
export const IShelf = (p: IconProps) => (
  <Svg {...p}><path d="M4 19h16" /><path d="M6 19V6h3v13" /><path d="M10 19V4h3v15" /><path d="m15 7 2.8-.8 3 12.1-2.9.7Z" /></Svg>
);
export const IHome = (p: IconProps) => (
  <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></Svg>
);
export const IKids = (p: IconProps) => (
  <Svg {...p}><path d="M12 15c-3.3 0-6-2.9-6-6.5S8.7 2 12 2s6 2.9 6 6.5-2.7 6.5-6 6.5Z" /><path d="m11 15-1 2h4l-1-2" /><path d="M12 17c0 2-2 2.5-2 5" /></Svg>
);
export const ISearch = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
);
export const IDown = (p: IconProps) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const ILeft = (p: IconProps) => (
  <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>
);
export const IMoon = (p: IconProps) => (
  <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></Svg>
);
export const IMark = (p: IconProps) => (
  <Svg {...p}><path d="M6 3h12v18l-6-4-6 4Z" /></Svg>
);
export const IList = (p: IconProps) => (
  <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></Svg>
);
export const IX = (p: IconProps) => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);
export const ICheck = (p: IconProps) => (
  <Svg {...p}><path d="m5 12 5 5 9-10" /></Svg>
);
export const IPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);

export function Cover({ src, title, className = '' }: { src: string; title: string; className?: string }) {
  return (
    <div className={`cover ${className}`}>
      <span className="cover-fallback" aria-hidden="true">{title}</span>
      <img src={src} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
    </div>
  );
}

export function Bar({ value }: { value: number }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.round(value * 1000) / 10}%` }} />
    </div>
  );
}
