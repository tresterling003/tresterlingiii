import { PARTS, type Option, type Part } from '../data/questions';

export interface Answer {
  /** Option ids. For multi-select, custom entries are stored as "custom:Their text". */
  picks: string[];
  /** Free text: the custom answer for single-choice, or the value of a text question. */
  custom?: string;
}
export type Answers = Record<string, Answer>;

export const BRIEF_FIELDS = [
  { key: 'name', label: 'Character Name', short: true },
  { key: 'type', label: 'Character Type', short: true },
  { key: 'personality', label: 'Personality' },
  { key: 'strength', label: 'Biggest Strength' },
  { key: 'weakness', label: 'Biggest Weakness' },
  { key: 'goal', label: 'Main Goal' },
  { key: 'setting', label: 'Setting / World', short: true },
  { key: 'genre', label: 'Genre', short: true },
  { key: 'appearance', label: 'Appearance' },
  { key: 'features', label: 'Two Distinguishing Features' },
  { key: 'palette', label: 'Suggested Color Palette' },
  { key: 'story', label: 'Possible Story Idea' },
] as const;

export type BriefKey = (typeof BRIEF_FIELDS)[number]['key'];
export type Brief = Record<BriefKey, string>;

/* ---------- small text helpers ---------- */

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const noEndDot = (s: string) => s.replace(/[.!?\s]+$/, '');
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) =>
  // Keep "I", acronyms, and likely proper nouns intact: only lowercase a plain capitalized word.
  /^[A-Z][a-z'-]*([\s,.;:]|$)/.test(s) && !/^I(\s|')/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
const sentence = (s: string) => {
  const t = clean(s);
  return t && !/[.!?…)]$/.test(t) ? `${t}.` : t;
};
const stripLead = (s: string, re: RegExp) => s.replace(re, '');

/* ---------- reading answers ---------- */

function part(id: string): Part {
  return PARTS[id];
}
function chosen(answers: Answers, id: string): Option | undefined {
  const pick = answers[id]?.picks?.[0];
  return part(id).options?.find((o) => o.id === pick);
}
function customText(answers: Answers, id: string): string {
  const a = answers[id];
  if (!a) return '';
  if (part(id).kind === 'text' || a.picks[0] === 'custom') return noEndDot(clean(a.custom));
  return '';
}

/** Is this part answered well enough to move on? */
export function isPartComplete(p: Part, a: Answer | undefined): boolean {
  if (p.optional) return true;
  if (!a) return false;
  if (p.kind === 'text') return clean(a.custom).length > 0;
  if (p.kind === 'multi') {
    const n = a.picks.length;
    return n >= (p.min ?? 1) && n <= (p.max ?? Infinity);
  }
  if (a.picks[0] === 'custom') return clean(a.custom).length > 0;
  return a.picks.length === 1;
}

/** Labels of everything picked in a multi-select part, in the order chosen. */
export function multiLabels(answers: Answers, id: string): string[] {
  const p = part(id);
  return (answers[id]?.picks ?? [])
    .map((pick) =>
      pick.startsWith('custom:')
        ? noEndDot(clean(pick.slice(7)))
        : p.options?.find((o) => o.id === pick)?.label ?? '',
    )
    .filter(Boolean);
}

/* ---------- the brief ---------- */

export function generateBrief(answers: Answers): Brief {
  const opt = (id: string) => chosen(answers, id);
  const own = (id: string) => customText(answers, id);
  const briefOf = (id: string) => {
    const o = opt(id);
    return o ? o.brief ?? o.label : cap(own(id));
  };

  const name = own('name') || 'My character';

  // Character type, plus a bare noun for the appearance sentence.
  const typeNoun = opt('type')?.phrase ?? (stripLead(own('type'), /^(an?|the)\s+/i) || 'character');

  // Personality: how they act around others + what they're like at their best and worst.
  const room = opt('room');
  const personality = [
    room ? room.brief! : own('room') ? `When they walk into a room full of strangers, they ${lowerFirst(stripLead(own('room'), /^(they|and)\s+/i))}.` : '',
    opt('strength') ? `At their best: ${lowerFirst(noEndDot(opt('strength')!.brief!.split('. ')[0]))}.` : own('strength') ? `At their best: ${lowerFirst(own('strength'))}.` : '',
    opt('flaw') ? `At their worst: ${lowerFirst(opt('flaw')!.label)} takes over.` : own('flaw') ? `At their worst: ${lowerFirst(own('flaw'))}.` : '',
  ].filter(Boolean).join(' ');

  // Goal
  const goalVerb = opt('goal')?.phrase ?? lowerFirst(stripLead(own('goal'), /^(to|wants to|they want to)\s+/i));
  const goal = goalVerb ? `To ${goalVerb}.` : '';

  // Appearance
  const build = opt('build')?.phrase;
  const shape = opt('shape')?.phrase;
  const style = opt('style')?.phrase ?? cap(own('style'));
  const article = (s: string) => (/^[aeiou]/i.test(s) ? 'An' : 'A');
  const lead = build ? `${build} ${typeNoun}` : typeNoun;
  const appearance = [
    `${article(lead)} ${lead}.`,
    shape ? `Shape language: ${lowerFirst(shape)}.` : '',
    style ? `Art style: ${lowerFirst(style)}.` : '',
  ].filter(Boolean).join(' ');

  // Features
  const feats = multiLabels(answers, 'features');
  const item = own('item');
  const features = [
    ...feats.map((f, i) => `${i + 1}. ${f}`),
    item ? `Also: never leaves home without ${lowerFirst(item)}.` : '',
  ].filter(Boolean).join('\n');

  // Story premise: "[Name] wants to [goal], but [conflict] stands in the way. To succeed, they must [challenge]."
  const world = opt('world')?.phrase ?? lowerFirst(own('world'));
  const obstacle = opt('obstacle')?.phrase ?? lowerFirst(stripLead(own('obstacle'), /\s+stands? in the way$/i));
  const flawFix = opt('flaw')?.phrase ?? (own('flaw') ? `overcome their biggest weakness (${lowerFirst(own('flaw'))})` : '');
  const strengthUse = opt('strength')?.phrase ?? (own('strength') ? `rely on their biggest strength (${lowerFirst(own('strength'))})` : '');
  const challenge = [flawFix, strengthUse].filter(Boolean).join(' and ');
  const genreLine = opt('genre')?.phrase ?? (own('genre') ? `Play it as ${/^(an?|the)\s/i.test(own('genre')) ? lowerFirst(own('genre')) : `${article(own('genre')).toLowerCase()} ${lowerFirst(own('genre'))}`}.` : '');

  const story = [
    `${world ? `In ${world}, ` : ''}${name} wants to ${goalVerb || 'find their purpose'}${obstacle ? `, but ${obstacle} stands in the way` : ''}.`,
    challenge ? `To succeed, they must ${challenge}.` : '',
    genreLine,
  ].filter(Boolean).join(' ');

  return {
    name,
    type: briefOf('type'),
    personality,
    strength: sentence(briefOf('strength')),
    weakness: sentence(briefOf('flaw')),
    goal,
    setting: briefOf('world'),
    genre: briefOf('genre'),
    appearance,
    features,
    palette: briefOf('palette'),
    story,
  };
}

/** The brief the student sees: quiz results with their own edits layered on top. */
export function finalBrief(answers: Answers, overrides: Partial<Brief>): Brief {
  // A renamed character should be renamed inside the story idea too.
  const newName = overrides.name?.trim();
  const base = generateBrief(newName ? { ...answers, name: { picks: [], custom: newName } } : answers);
  const out = { ...base };
  for (const f of BRIEF_FIELDS) {
    const o = overrides[f.key];
    if (typeof o === 'string' && o.trim()) out[f.key] = o.trim();
  }
  return out;
}

export function briefToText(brief: Brief): string {
  const lines = BRIEF_FIELDS.map((f) => {
    const v = brief[f.key];
    return v.includes('\n') ? `${f.label}:\n${v.split('\n').map((l) => `   ${l}`).join('\n')}` : `${f.label}: ${v}`;
  });
  return `CHARACTER BRIEF\n\n${lines.join('\n')}`;
}

export function buildPrompt(brief: Brief): string {
  return `I am a beginner Digital Arts & Animation student designing an original cartoon character for a future animated short film or series.

Use the Character Brief below to GENERATE ONE IMAGE containing 5 distinct full-body cartoon character inspiration sketches.

IMPORTANT ART REQUIREMENTS:

- Show all 5 concepts together in a clean character concept sheet.
- Label each concept 1–5.
- Use simple rough pencil-style sketches with readable outlines.
- Make each character visually different while keeping the same core personality and story concept.
- Explore different silhouettes, proportions, hairstyles, outfits, and accessories.
- Include at least 2 noticeable visual features on each character.
- Keep characters simple enough for a beginner to redraw with a drawing tablet in Toon Boom Harmony.
- Use a plain white background.
- No complex shading, dramatic lighting, realistic rendering, or detailed backgrounds.
- No existing copyrighted cartoon characters.
- Make the designs original and school appropriate.

The goal is to help me CHOOSE and COMBINE character design ideas, not to produce finished artwork.

Focus on clear silhouettes, memorable features, simple shapes, and character personality.

MY CHARACTER BRIEF:

${briefToText(brief).replace(/^CHARACTER BRIEF\n\n/, '')}

Please generate the visual concept sheet now.`;
}

export const NEXT_STEPS = [
  'Copy your 5-sketch prompt.',
  'Paste it into ChatGPT and generate your inspiration sheet.',
  'Choose one design or combine ideas from several.',
  'Open Toon Boom Harmony.',
  'Rough-sketch your original character.',
  'Create clean line art on a separate layer.',
  'Add color and save your work.',
];

export const REMINDER =
  'These sketches are inspiration. Your final character should reflect your own design choices. You can change your character or story later.';
