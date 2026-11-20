// A small set of line-drawn icons, so the game does not look like a phone keyboard.
const P = {
  sword: '<path d="M19 3l2 2-11 11-3 1 1-3z"/><path d="M6 14l4 4M5 19l2-2M4 17l3 3"/>',
  greatsword: '<path d="M20 2l2 2-12 12-3 .5.5-3z"/><path d="M5 13l6 6M3 21l3-3"/>',
  axe: '<path d="M14 4c3 0 6 3 6 6l-4 1-3-3z"/><path d="M14 8L4 20"/>',
  greataxe: '<path d="M12 3c4-1 8 3 8 7l-4 1-4-4zM12 3C9 3 7 6 7 8l3 1"/><path d="M13 9L3 21"/>',
  daggers: '<path d="M8 3l2 9-2 2-2-2z"/><path d="M7 14v6"/><path d="M16 3l2 9-2 2-2-2z"/><path d="M15 14v6"/>',
  staff: '<path d="M6 21L17 8"/><circle cx="18.5" cy="5.5" r="2.5"/><path d="M15 3l1 1M21 8l1 1"/>',
  wand: '<path d="M5 19L15 9"/><path d="M17 3v3M15.5 4.5h3M20 8v2M19 9h2"/>',
  crossbow: '<path d="M4 6c5 3 11 3 16 0"/><path d="M4 6l8 6 8-6"/><path d="M12 4v17M10 19h4"/>',
  handbow: '<path d="M6 8c4 2 8 2 12 0"/><path d="M6 8l6 4 6-4"/><path d="M12 7v8l-3 5"/>',
  fist: '<path d="M7 11V7a1.5 1.5 0 013 0v3M10 10V6a1.5 1.5 0 013 0v4M13 10V7a1.5 1.5 0 013 0v4M16 10a1.5 1.5 0 013 0v3c0 4-3 7-6 7h-1c-3 0-5-2-5-5v-3a1.5 1.5 0 013 0"/>',
  torch: '<path d="M10 22l1-10h2l1 10z"/><path d="M12 2c3 3 3 5 1.5 7.5C15 8 15 6 14 5c0 2-1 3-2 3-1-1-1-3 0-6z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M12 7v10M8 11h8"/>',
  dodge: '<path d="M4 12a8 8 0 0114-5"/><path d="M18 3v4h-4"/><path d="M20 12a8 8 0 01-14 5"/><path d="M6 21v-4h4"/>',
  jump: '<path d="M12 20V6M6 12l6-6 6 6"/><path d="M5 21h14"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 013 0V11M11 11V4a1.5 1.5 0 013 0v7M14 11V5.5a1.5 1.5 0 013 0V13M17 9.5a1.5 1.5 0 013 0V14c0 4-3 7-7 7h-1c-3 0-5-2-6-4l-2-4a1.5 1.5 0 012.5-1.5L8 13"/>',
  potion: '<path d="M10 3h4M10.5 3v5L6 15a5 5 0 004 7h4a5 5 0 004-7l-4.5-7V3"/><path d="M7.5 14h9"/>',
  horse: '<path d="M6 21v-5c-2-1-3-3-2-5l3-4 1-4 3 3h2c4 0 7 3 7 7v2"/><path d="M20 19v2M16 21v-5M9 9h.01"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  spin: '<path d="M12 3a9 9 0 019 9M12 21a9 9 0 01-9-9"/><path d="M21 12l-3-2M3 12l3 2"/><circle cx="12" cy="12" r="2"/>',
  fire: '<path d="M12 22c-4 0-7-3-7-7 0-5 5-6 5-12 3 2 4 5 4 8 1-1 2-3 2-4 2 2 3 5 3 8 0 4-3 7-7 7z"/>',
  snow: '<path d="M12 2v20M3 7l18 10M3 17l18-10"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  cloud: '<path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A4 4 0 1117 18z"/>',
  arrows: '<path d="M5 19L19 5M14 5h5v5"/><path d="M5 13l6-6M5 13h3M5 13v3"/>',
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
  bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
};
export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.target}</svg>`;
}
// class abilities → icons
export const ABILITY_ICON = { bash: 'shield', smite: 'sun', whirl: 'spin', rage: 'fire', fireball: 'fire', nova: 'snow', shadowstep: 'daggers', smoke: 'cloud', volley: 'arrows', grove: 'leaf' };
