import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../src/data/questions';
import { BRIEF_FIELDS, briefToText, buildPrompt, finalBrief, generateBrief, isPartComplete, type Answers } from '../src/lib/brief';
import { canRenderInPdf, fileName, pdfSafe } from '../src/lib/pdf';

const picks: Answers = {
  room: { picks: ['observer'] },
  type: { picks: ['robot'] },
  world: { picks: ['school'] },
  genre: { picks: ['mystery'] },
  strength: { picks: ['invent'] },
  flaw: { picks: ['loner'] },
  goal: { picks: ['truth'] },
  obstacle: { picks: ['rules'] },
  style: { picks: ['flat'] },
  shape: { picks: ['square'] },
  build: { picks: ['tiny'] },
  features: { picks: ['goggles', 'custom:a cracked screen for a face'] },
  palette: { picks: ['ocean'] },
  name: { picks: [], custom: 'Sprocket' },
  item: { picks: [], custom: 'A lucky bottle cap' },
};

const custom: Answers = {
  room: { picks: ['custom'], custom: 'They trip over a chair.' },
  type: { picks: ['custom'], custom: 'a half-cat librarian' },
  world: { picks: ['custom'], custom: 'A city on the back of a giant turtle' },
  genre: { picks: ['custom'], custom: 'cooking-competition musical' },
  strength: { picks: ['custom'], custom: 'Remembering every tiny detail' },
  flaw: { picks: ['custom'], custom: 'Never being on time' },
  goal: { picks: ['custom'], custom: 'to open the best noodle shop in the galaxy' },
  obstacle: { picks: ['custom'], custom: 'a very organized flock of pigeons' },
  style: { picks: ['custom'], custom: 'Paper cut-outs' },
  shape: { picks: ['mix'] },
  build: { picks: ['lanky'] },
  features: { picks: ['custom:a bell collar', 'custom:ink-stained paws'] },
  palette: { picks: ['custom'], custom: 'sky blue, orange, and silver' },
  name: { picks: [], custom: 'Marlow' },
};

describe('character brief', () => {
  it('builds every field from the chosen answers', () => {
    const b = generateBrief(picks);
    for (const f of BRIEF_FIELDS) expect(b[f.key], f.key).toBeTruthy();
    expect(b.name).toBe('Sprocket');
    expect(b.type).toBe('Robot or machine');
    expect(b.setting).toBe('An ordinary school with unusual secrets');
    expect(b.appearance).toBe('A small and compact robot. Shape language: mostly squares and blocky forms, which read as sturdy and dependable. Art style: bold, flat modern cartoon style with thick outlines and simple shapes.');
    expect(b.features).toBe('1. Goggles pushed up on their head\n2. a cracked screen for a face\nAlso: never leaves home without a lucky bottle cap.');
    expect(b.story).toBe(
      'In an ordinary school that hides unusual secrets, Sprocket wants to uncover the truth behind a secret no one will talk about, but a powerful authority figure who keeps saying no stands in the way. To succeed, they must finally let someone else help and use their gift for building a solution out of scraps. Play it as a mystery, with clues, twists, and one big reveal.',
    );
  });

  it('reads naturally when every answer is written in', () => {
    const b = generateBrief(custom);
    expect(b.type).toBe('A half-cat librarian');
    expect(b.personality).toBe('When they walk into a room full of strangers, they trip over a chair. At their best: remembering every tiny detail. At their worst: never being on time.');
    expect(b.goal).toBe('To open the best noodle shop in the galaxy.');
    expect(b.appearance).toContain('A tall and lanky half-cat librarian.');
    expect(b.story).toBe(
      'In a city on the back of a giant turtle, Marlow wants to open the best noodle shop in the galaxy, but a very organized flock of pigeons stands in the way. To succeed, they must overcome their biggest weakness (never being on time) and rely on their biggest strength (remembering every tiny detail). Play it as a cooking-competition musical.',
    );
    expect(b.palette).toBe('Sky blue, orange, and silver');
  });

  it('never produces "undefined" or empty placeholders for any combination of first/last options', () => {
    for (const which of ['first', 'last'] as const) {
      const a: Answers = { name: { picks: [], custom: 'Pip' } };
      for (const q of QUESTIONS)
        for (const p of q.parts) {
          if (p.kind === 'single') a[p.id] = { picks: [which === 'first' ? p.options![0].id : p.options![p.options!.length - 1].id] };
          if (p.kind === 'multi') a[p.id] = { picks: p.options!.slice(0, 2).map((o) => o.id) };
        }
      const text = buildPrompt(generateBrief(a));
      expect(text).not.toMatch(/undefined|null|\[object|\.\./);
    }
  });

  it('layers edits over quiz answers and renames the character inside the story', () => {
    const b = finalBrief(picks, { name: 'Dot', weakness: 'Talks to vending machines.', goal: '   ' });
    expect(b.name).toBe('Dot');
    expect(b.weakness).toBe('Talks to vending machines.');
    expect(b.goal).toBe(generateBrief(picks).goal);
    expect(b.story).toContain('Dot wants to');
    expect(b.story).not.toContain('Sprocket');
  });

  it('puts the complete, edited brief inside the prompt', () => {
    const b = finalBrief(picks, { weakness: 'Talks to vending machines.' });
    const p = buildPrompt(b);
    expect(p).toContain('GENERATE ONE IMAGE containing 5 distinct full-body cartoon character inspiration sketches');
    expect(p).toContain('Please generate the visual concept sheet now.');
    for (const f of BRIEF_FIELDS) {
      expect(p).toContain(`${f.label}:`);
      for (const line of b[f.key].split('\n')) expect(p).toContain(line);
    }
    expect(briefToText(b)).toMatch(/^CHARACTER BRIEF\n\nCharacter Name: Sprocket/);
  });
});

describe('quiz rules', () => {
  it('needs exactly two features and a non-blank name', () => {
    const parts = Object.fromEntries(QUESTIONS.flatMap((q) => q.parts.map((p) => [p.id, p])));
    expect(isPartComplete(parts.features, { picks: ['hair'] })).toBe(false);
    expect(isPartComplete(parts.features, { picks: ['hair', 'tail'] })).toBe(true);
    expect(isPartComplete(parts.name, { picks: [], custom: '   ' })).toBe(false);
    expect(isPartComplete(parts.item, undefined)).toBe(true);
    expect(isPartComplete(parts.type, { picks: ['custom'], custom: '' })).toBe(false);
  });
});

describe('pdf text', () => {
  it('normalizes smart punctuation and detects text the built-in font cannot draw', () => {
    expect(pdfSafe('“Zoë’s” plan – done…')).toBe('"Zoë\'s" plan - done...');
    expect(canRenderInPdf('Zoë’s café – 1–5')).toBe(true);
    expect(canRenderInPdf('Мария 🦊')).toBe(false);
    expect(fileName('Zoë the Brave!')).toBe('zo-the-brave-character-brief.pdf');
  });
});
