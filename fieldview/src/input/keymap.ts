// Remappable inputs. Presentation remotes and USB foot pedals present
// themselves as keyboards (usually PageUp/PageDown, arrows, B/period, F5,
// Enter), so everything is bound by KeyboardEvent.code.

export const ACTIONS = [
  'answer1',
  'answer2',
  'answer3',
  'answer4',
  'answer5',
  'answer6',
  'advance',
  'replay',
  'pause',
  'gotIt',
  'missed',
] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  answer1: 'Answer 1',
  answer2: 'Answer 2',
  answer3: 'Answer 3',
  answer4: 'Answer 4',
  answer5: 'Answer 5',
  answer6: 'Answer 6',
  advance: 'Start / reveal / next',
  replay: 'Replay rep',
  pause: 'Pause / resume',
  gotIt: 'Self-check: got it',
  missed: 'Self-check: missed',
};

export type Keymap = Record<Action, string[]>;

export const DEFAULT_KEYMAP: Keymap = {
  answer1: ['Digit1', 'Numpad1'],
  answer2: ['Digit2', 'Numpad2'],
  answer3: ['Digit3', 'Numpad3'],
  answer4: ['Digit4', 'Numpad4'],
  answer5: ['Digit5', 'Numpad5'],
  answer6: ['Digit6', 'Numpad6'],
  advance: ['Space', 'Enter', 'PageDown', 'ArrowRight'],
  replay: ['PageUp', 'ArrowLeft', 'KeyR'],
  pause: ['KeyB', 'Period', 'KeyP'],
  gotIt: ['KeyY'],
  missed: ['KeyN'],
};

export function actionsFor(code: string, map: Keymap): Action[] {
  return ACTIONS.filter((a) => map[a]?.includes(code));
}

export function normalizeKeymap(m: Partial<Keymap> | null | undefined): Keymap {
  const out = { ...DEFAULT_KEYMAP };
  if (m) for (const a of ACTIONS) if (Array.isArray(m[a])) out[a] = m[a]!.filter((x) => typeof x === 'string');
  return out;
}

export function prettyKey(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace('ArrowRight', '→')
    .replace('ArrowLeft', '←')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('PageDown', 'PgDn')
    .replace('PageUp', 'PgUp')
    .replace('Period', '.');
}
