// Picture library: simple, bold SVG pictures for pre-readers. Unknown keys render as emoji/text.
import { COLORS } from './content';

const S = (body: string) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

const ICONS: Record<string, string> = {
  hat: S('<ellipse cx="50" cy="74" rx="40" ry="9" fill="#263238"/><rect x="28" y="22" width="44" height="52" rx="5" fill="#37474f"/><rect x="28" y="56" width="44" height="10" fill="#e53935"/><circle cx="64" cy="61" r="5" fill="#ff5252"/>'),
  scarf: S('<path d="M18 38c10-12 54-12 64 0v12c-10 10-54 10-64 0z" fill="#43a047"/><path d="M58 50l14 0 4 38-16 0z" fill="#43a047"/><path d="M18 44c14 8 50 8 64 0" stroke="#fff" stroke-width="5" fill="none"/><path d="M60 72h16M60 80h16" stroke="#fff" stroke-width="4"/>'),
  carrot: S('<path d="M22 30L86 72 30 44z" fill="#ff7a1a"/><path d="M28 34l8 4M40 44l6 3M54 52l5 3" stroke="#c75b00" stroke-width="3"/><path d="M24 30l-12-14M24 30l-16-2M24 30l-2-18" stroke="#43a047" stroke-width="6" stroke-linecap="round"/>'),
  buttons: S('<circle cx="50" cy="24" r="12" fill="#222"/><circle cx="50" cy="52" r="12" fill="#222"/><circle cx="50" cy="80" r="12" fill="#222"/><circle cx="46" cy="20" r="3" fill="#777"/><circle cx="46" cy="48" r="3" fill="#777"/><circle cx="46" cy="76" r="3" fill="#777"/>'),
  ball: S('<circle cx="50" cy="52" r="36" fill="#e53935"/><path d="M14 52h72M50 16v72" stroke="#fff" stroke-width="7"/><circle cx="38" cy="38" r="6" fill="#fff" opacity=".5"/>'),
  present: S('<rect x="16" y="40" width="68" height="48" rx="4" fill="#8e24aa"/><rect x="12" y="30" width="76" height="16" rx="4" fill="#ab47bc"/><rect x="44" y="30" width="12" height="58" fill="#fdd835"/><path d="M50 30c-16-22-30-6-14 0M50 30c16-22 30-6 14 0" stroke="#fdd835" stroke-width="7" fill="none"/>'),
  mitten: S('<path d="M30 80V42c0-18 10-28 22-28s20 10 20 26v40z" fill="#e53935"/><path d="M30 52c-14-4-18 10-6 18l6 4" fill="#e53935"/><rect x="26" y="76" width="50" height="14" rx="5" fill="#fff"/>'),
  star: S('<path d="M50 8l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 39l30-3z" fill="#ffd600" stroke="#ffab00" stroke-width="3" stroke-linejoin="round"/>'),
  snow: S('<g stroke="#4fc3f7" stroke-width="7" stroke-linecap="round"><path d="M50 10v80M15 30l70 40M15 70l70-40"/><path d="M40 16l10 10 10-10M40 84l10-10 10 10" fill="none"/></g>'),
  bell: S('<path d="M50 14c-18 0-26 16-26 34v14l-8 12h68l-8-12V48c0-18-8-34-26-34z" fill="#ffc93c" stroke="#e0a200" stroke-width="3"/><circle cx="50" cy="82" r="8" fill="#b8860b"/><path d="M40 12h20" stroke="#d32f2f" stroke-width="7" stroke-linecap="round"/>'),
  tree: S('<path d="M50 6L22 46h12L16 72h68L66 46h12z" fill="#2e7d32"/><rect x="43" y="72" width="14" height="18" fill="#6d4c41"/><circle cx="40" cy="50" r="4" fill="#e53935"/><circle cx="60" cy="60" r="4" fill="#fdd835"/><circle cx="52" cy="34" r="4" fill="#1e88e5"/>'),
  dog: S('<ellipse cx="50" cy="56" rx="26" ry="24" fill="#c8935a"/><ellipse cx="24" cy="48" rx="10" ry="20" fill="#8d5a2b"/><ellipse cx="76" cy="48" rx="10" ry="20" fill="#8d5a2b"/><ellipse cx="50" cy="66" rx="14" ry="10" fill="#f5e1c8"/><circle cx="40" cy="50" r="5" fill="#222"/><circle cx="60" cy="50" r="5" fill="#222"/><ellipse cx="50" cy="62" rx="6" ry="4" fill="#222"/>'),
  cat: S('<path d="M24 36L28 12 42 28M76 36L72 12 58 28" fill="#9e9e9e"/><ellipse cx="50" cy="56" rx="28" ry="26" fill="#9e9e9e"/><circle cx="40" cy="52" r="5" fill="#222"/><circle cx="60" cy="52" r="5" fill="#222"/><path d="M47 62h6l-3 4z" fill="#ff8a80"/><path d="M20 60h18M20 68h18M62 60h18M62 68h18" stroke="#555" stroke-width="2"/>'),
  wheel: S('<circle cx="50" cy="50" r="38" fill="#263238"/><circle cx="50" cy="50" r="22" fill="#1e88e5"/><circle cx="50" cy="50" r="7" fill="#eee"/>'),
  bridge: S('<path d="M8 60q42-30 84 0" stroke="#8d5a2b" stroke-width="10" fill="none"/><path d="M8 72h84" stroke="#a0703f" stroke-width="10"/><path d="M20 50v22M50 40v32M80 50v22" stroke="#8d5a2b" stroke-width="6"/><path d="M0 90h100" stroke="#4fc3f7" stroke-width="10"/>'),
  moon: S('<path d="M62 12a38 38 0 1 0 26 58A30 30 0 1 1 62 12z" fill="#ffe082"/>'),
  sock: S('<path d="M34 10h30v46l18 14c8 8 2 22-10 20L36 76c-4-2-2-6-2-10z" fill="#d32f2f"/><rect x="32" y="10" width="34" height="14" fill="#fff"/>'),
  help: S('<path d="M30 56c-8-8-4-22 8-22 6 0 10 4 12 8 2-4 6-8 12-8 12 0 16 14 8 22L50 78z" fill="#ff5c8a"/><path d="M14 64l18 10M86 64L68 74" stroke="#f2c19b" stroke-width="10" stroke-linecap="round"/>'),
  jump: S('<circle cx="50" cy="20" r="10" fill="#f2c19b"/><path d="M50 32v26M50 40l-18-14M50 40l18-14M50 58l-14 16M50 58l14 16" stroke="#e53935" stroke-width="8" stroke-linecap="round"/><path d="M20 92h60" stroke="#90a4ae" stroke-width="5"/><path d="M50 78v8" stroke="#90a4ae" stroke-width="3" stroke-dasharray="2 3"/>'),
  go: S('<circle cx="50" cy="50" r="40" fill="#43a047"/><path d="M38 28l28 22-28 22z" fill="#fff"/>'),
  robot: S('<rect x="28" y="16" width="44" height="30" rx="6" fill="#fdd835"/><rect x="34" y="24" width="32" height="12" rx="4" fill="#263238"/><circle cx="42" cy="30" r="3" fill="#3df5ff"/><circle cx="58" cy="30" r="3" fill="#3df5ff"/><rect x="24" y="48" width="52" height="32" rx="6" fill="#e53935"/><circle cx="34" cy="86" r="9" fill="#1e88e5"/><circle cx="66" cy="86" r="9" fill="#1e88e5"/><path d="M50 16V6" stroke="#999" stroke-width="3"/><circle cx="50" cy="6" r="4" fill="#8e24aa"/>'),
  left: S('<circle cx="50" cy="50" r="42" fill="#1e88e5"/><path d="M60 26L34 50l26 24" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  right: S('<circle cx="50" cy="50" r="42" fill="#e53935"/><path d="M40 26l26 24-26 24" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  penguin: S('<ellipse cx="50" cy="58" rx="28" ry="34" fill="#263238"/><ellipse cx="50" cy="64" rx="18" ry="24" fill="#fff"/><circle cx="42" cy="38" r="4" fill="#fff"/><circle cx="58" cy="38" r="4" fill="#fff"/><path d="M44 46h12l-6 8z" fill="#ff9800"/>'),
  owl: S('<ellipse cx="50" cy="56" rx="30" ry="34" fill="#8d6e63"/><circle cx="38" cy="44" r="12" fill="#fff"/><circle cx="62" cy="44" r="12" fill="#fff"/><circle cx="38" cy="44" r="6" fill="#222"/><circle cx="62" cy="44" r="6" fill="#222"/><path d="M45 56h10l-5 8z" fill="#ffb300"/><path d="M24 26l8 10M76 26l-8 10" stroke="#8d6e63" stroke-width="8"/>'),
  bunny: S('<ellipse cx="38" cy="22" rx="8" ry="20" fill="#eee"/><ellipse cx="62" cy="22" rx="8" ry="20" fill="#eee"/><circle cx="50" cy="60" r="28" fill="#fafafa" stroke="#ddd" stroke-width="2"/><circle cx="40" cy="56" r="4" fill="#222"/><circle cx="60" cy="56" r="4" fill="#222"/><circle cx="50" cy="66" r="4" fill="#ff8a80"/>'),
  music: S('<path d="M36 74V24l40-10v50" stroke="#8e24aa" stroke-width="7" fill="none"/><ellipse cx="28" cy="76" rx="12" ry="9" fill="#8e24aa"/><ellipse cx="68" cy="66" rx="12" ry="9" fill="#8e24aa"/>'),
  wave: S('<path d="M40 86V48c0-6 10-6 10 0V26c0-6 10-6 10 0v20-26c0-6 10-6 10 0v28-18c0-6 10-6 10 0v32c0 18-10 26-24 26S40 86 40 86z" fill="#f2c19b"/>'),
  circle: S('<circle cx="50" cy="50" r="36" fill="#ff7043"/>'),
  square: S('<rect x="16" y="16" width="68" height="68" rx="6" fill="#42a5f5"/>'),
  triangle: S('<path d="M50 12l40 74H10z" fill="#66bb6a"/>'),
  sing: S('<circle cx="40" cy="50" r="26" fill="#f2c19b"/><ellipse cx="40" cy="60" rx="8" ry="10" fill="#7a2b2b"/><circle cx="32" cy="44" r="3" fill="#222"/><circle cx="48" cy="44" r="3" fill="#222"/><path d="M72 20v30" stroke="#8e24aa" stroke-width="5"/><ellipse cx="68" cy="52" rx="7" ry="5" fill="#8e24aa"/><path d="M84 36v22" stroke="#e53935" stroke-width="4"/><ellipse cx="81" cy="59" rx="5" ry="4" fill="#e53935"/>'),
};

export function iconSVG(key: string): string {
  if (key.startsWith('color:')) {
    const c = COLORS[key.slice(6)];
    return S(`<circle cx="50" cy="50" r="40" fill="${c?.css ?? '#ccc'}" stroke="#fff" stroke-width="6"/><circle cx="36" cy="36" r="8" fill="#fff" opacity=".45"/>`);
  }
  if (key.startsWith('shape:')) return ICONS[key.slice(6)] ?? ICONS.star;
  if (key.startsWith('letter:')) {
    const [, l, col] = key.split(':');
    return S(`<circle cx="50" cy="50" r="44" fill="${col ?? '#ff7043'}"/><text x="50" y="68" font-size="54" font-family="Arial Rounded MT Bold, Arial, sans-serif" font-weight="900" text-anchor="middle" fill="#fff">${l}</text>`);
  }
  if (ICONS[key]) return ICONS[key];
  // emoji or custom
  const safe = key.replace(/[<>&"]/g, '');
  return `<div class="emoji-pic">${safe}</div>`;
}
