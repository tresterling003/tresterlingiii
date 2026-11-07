// Practice content. These are SAMPLE entries for play — not a prescribed treatment sequence.
// Parents (optionally guided by a speech-language pathologist) choose level, sounds and custom words.

import type { PracticeLevel, Settings, Unlock } from '../types';

export interface VocabItem {
  id: string;
  /** Main target word. */
  word: string;
  /** Picture key into the icon library (or an emoji). */
  picture: string;
  /** Accepted equivalents for the single word. */
  accept: string[];
  /** Simple sound/syllable model for Level A, written so a TTS voice says it reasonably ("hah", "buh"). */
  syllable: { say: string; show: string };
  /** Short phrase (Level C). */
  phrase: string;
  /** Sentence (Level D). */
  sentence: string;
}

export const VOCAB: Record<string, VocabItem> = {
  hat: { id: 'hat', word: 'hat', picture: 'hat', accept: ['hat', 'hats', 'cap'], syllable: { say: 'ha', show: 'HA' }, phrase: 'my hat', sentence: 'I found your hat.' },
  scarf: { id: 'scarf', word: 'scarf', picture: 'scarf', accept: ['scarf', 'scarves', 'scarfs'], syllable: { say: 'ska', show: 'SKA' }, phrase: 'red scarf', sentence: 'Here is your scarf.' },
  carrot: { id: 'carrot', word: 'nose', picture: 'carrot', accept: ['nose', 'carrot', 'carrots', 'noses'], syllable: { say: 'no', show: 'NO' }, phrase: 'carrot nose', sentence: 'I found your nose.' },
  buttons: { id: 'buttons', word: 'buttons', picture: 'buttons', accept: ['buttons', 'button', 'coal'], syllable: { say: 'buh', show: 'BUH' }, phrase: 'more buttons', sentence: 'I found the buttons.' },
  ball: { id: 'ball', word: 'ball', picture: 'ball', accept: ['ball', 'balls'], syllable: { say: 'ba', show: 'BA' }, phrase: 'big ball', sentence: 'I found a ball.' },
  mitten: { id: 'mitten', word: 'mitten', picture: 'mitten', accept: ['mitten', 'mittens', 'glove', 'gloves'], syllable: { say: 'ma', show: 'MA' }, phrase: 'my mitten', sentence: 'I found a mitten.' },
  present: { id: 'present', word: 'present', picture: 'present', accept: ['present', 'presents', 'gift', 'gifts', 'box'], syllable: { say: 'pa', show: 'PA' }, phrase: 'a present', sentence: 'I found a present.' },
  snow: { id: 'snow', word: 'snow', picture: 'snow', accept: ['snow', 'snowflake', 'snowflakes', 'snowball'], syllable: { say: 'so', show: 'SO' }, phrase: 'more snow', sentence: 'I like the snow.' },
  dog: { id: 'dog', word: 'dog', picture: 'dog', accept: ['dog', 'doggy', 'puppy', 'dogs', 'doggie'], syllable: { say: 'da', show: 'DA' }, phrase: 'big dog', sentence: 'The dog is running.' },
  tree: { id: 'tree', word: 'tree', picture: 'tree', accept: ['tree', 'trees', 'christmas tree'], syllable: { say: 'ta', show: 'TA' }, phrase: 'big tree', sentence: 'I see a tree.' },
  star: { id: 'star', word: 'star', picture: 'star', accept: ['star', 'stars'], syllable: { say: 'sta', show: 'STA' }, phrase: 'gold star', sentence: 'I found a star.' },
  bell: { id: 'bell', word: 'bell', picture: 'bell', accept: ['bell', 'bells', 'ding'], syllable: { say: 'beh', show: 'BEH' }, phrase: 'ring bell', sentence: 'The bell is ringing.' },
  wheel: { id: 'wheel', word: 'wheel', picture: 'wheel', accept: ['wheel', 'wheels', 'tire'], syllable: { say: 'wee', show: 'WEE' }, phrase: 'blue wheel', sentence: 'The robot needs a wheel.' },
  open: { id: 'open', word: 'open', picture: 'bridge', accept: ['open', 'opened', 'bridge', 'down', 'please'], syllable: { say: 'oh', show: 'OH' }, phrase: 'open please', sentence: 'Please open the bridge.' },
  help: { id: 'help', word: 'help', picture: 'help', accept: ['help', 'helped', 'please'], syllable: { say: 'heh', show: 'HEH' }, phrase: 'help me', sentence: 'Can you help me?' },
  jump: { id: 'jump', word: 'jump', picture: 'jump', accept: ['jump', 'jumps', 'hop', 'up'], syllable: { say: 'ju', show: 'JU' }, phrase: 'jump up', sentence: 'I want to jump.' },
  go: { id: 'go', word: 'go', picture: 'go', accept: ['go', 'goes', 'going', 'let\'s go', 'run'], syllable: { say: 'go', show: 'GO' }, phrase: 'go fast', sentence: 'Let\'s go fast.' },
  moon: { id: 'moon', word: 'moon', picture: 'moon', accept: ['moon', 'moons'], syllable: { say: 'moo', show: 'MOO' }, phrase: 'big moon', sentence: 'I see the moon.' },
  sock: { id: 'sock', word: 'sock', picture: 'sock', accept: ['sock', 'socks', 'stocking', 'stockings'], syllable: { say: 'sah', show: 'SAH' }, phrase: 'red sock', sentence: 'I found a sock.' },
  cat: { id: 'cat', word: 'cat', picture: 'cat', accept: ['cat', 'kitty', 'kitten', 'cats', 'kitties'], syllable: { say: 'ka', show: 'KA' }, phrase: 'little cat', sentence: 'The cat is sleepy.' },
};

export const COLORS: Record<string, { hex: number; css: string; accept: string[] }> = {
  red: { hex: 0xe53935, css: '#e53935', accept: ['red', 'read', 'rad', 'bread', 'wed'] },
  blue: { hex: 0x1e88e5, css: '#1e88e5', accept: ['blue', 'blew', 'boo', 'bloo', 'bwue'] },
  yellow: { hex: 0xfdd835, css: '#fdd835', accept: ['yellow', 'hello', 'yeah low', 'lello', 'jello'] },
  green: { hex: 0x43a047, css: '#43a047', accept: ['green', 'grin', 'queen', 'gween', 'clean'] },
  purple: { hex: 0x8e24aa, css: '#8e24aa', accept: ['purple', 'pupple', 'people', 'purpel'] },
  orange: { hex: 0xfb8c00, css: '#fb8c00', accept: ['orange', 'onge', 'orang'] },
};

export const SHAPES = ['circle', 'square', 'triangle', 'star'] as const;
export type ShapeName = (typeof SHAPES)[number];
export const SHAPE_ACCEPT: Record<ShapeName, string[]> = {
  circle: ['circle', 'round', 'ball', 'circles'],
  square: ['square', 'box', 'block', 'squares'],
  triangle: ['triangle', 'triangles', 'try angle'],
  star: ['star', 'stars'],
};

/** What the child is asked to say for a given vocab item at a given level. */
export interface PromptTarget {
  /** text the child sees / hears modelled */
  model: string;
  /** how the TTS should say the model (can differ for syllables) */
  modelSpoken: string;
  /** accepted transcripts (normalized matching happens in matcher.ts) */
  accept: string[];
  /** 'activity' = any vocal attempt counts as practice (used for sounds/syllables, which recognizers can't judge) */
  mode: 'phrase' | 'keywords' | 'activity';
  /** Keywords for open responses / phrase partial credit. */
  keywords: string[];
  level: PracticeLevel;
  picture: string;
  /** stable id for logs */
  id: string;
}

export function extraAccepted(settings: Settings, word: string): string[] {
  return settings.acceptedExtra[word.toLowerCase()] ?? [];
}

/**
 * Build the target for an item at a level.
 * Phrases and sentences give keyword credit: saying the key word inside a longer or shorter utterance is accepted.
 */
export function targetFor(item: VocabItem, level: PracticeLevel, settings: Settings, openQuestion?: string): PromptTarget {
  const extras = extraAccepted(settings, item.word);
  const wordAccept = [...item.accept, ...extras];
  const base = { picture: item.picture, id: item.id, level };
  switch (level) {
    case 'A':
      return { ...base, model: item.syllable.show, modelSpoken: item.syllable.say, accept: [item.syllable.say, ...wordAccept], keywords: wordAccept, mode: 'activity' };
    case 'B':
      return { ...base, model: item.word, modelSpoken: item.word, accept: wordAccept, keywords: wordAccept, mode: 'keywords' };
    case 'C':
      return { ...base, model: item.phrase, modelSpoken: item.phrase, accept: [item.phrase], keywords: wordAccept, mode: 'phrase' };
    case 'D':
      return { ...base, model: item.sentence, modelSpoken: item.sentence, accept: [item.sentence], keywords: wordAccept, mode: 'phrase' };
    case 'E':
      return { ...base, model: openQuestion ?? item.word, modelSpoken: item.word, accept: wordAccept, keywords: wordAccept, mode: 'keywords' };
  }
}

/** Target for a colour word, used by the Toy Factory and Reindeer Dash. */
export function colorTarget(color: string, level: PracticeLevel, settings: Settings, noun?: string): PromptTarget {
  const c = COLORS[color];
  const extras = extraAccepted(settings, color);
  const accept = [...c.accept, ...extras];
  const base = { picture: `color:${color}`, id: noun ? `${color}-${noun}` : color, level };
  if (level === 'A') return { ...base, model: color.slice(0, 2).toUpperCase(), modelSpoken: color, accept, keywords: accept, mode: 'activity' };
  if (level === 'B' || level === 'E' || !noun) return { ...base, model: color, modelSpoken: color, accept, keywords: accept, mode: 'keywords' };
  const phrase = level === 'C' ? `${color} ${noun}` : `I want the ${color} ${noun}.`;
  return { ...base, model: phrase, modelSpoken: phrase, accept: [phrase], keywords: accept, mode: 'phrase' };
}

/** Target for an arbitrary word list (custom words, animal sounds, songs). */
export function simpleTarget(id: string, model: string, accept: string[], picture: string, level: PracticeLevel, mode: PromptTarget['mode'] = 'keywords'): PromptTarget {
  return { id, model, modelSpoken: model, accept, keywords: accept, mode, level, picture };
}

/** Rough letter-sound check used to prefer words with the parent's target sounds. Not a phonetic analysis. */
export function wordHasSound(word: string, sound: string): boolean {
  const w = word.toLowerCase();
  const s = sound.toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return false;
  return w.includes(s);
}

/** Pick a vocab item from candidates, preferring target sounds if set. Deterministic per seed for testing. */
export function pickPreferred(ids: string[], settings: Settings, seed = Math.random()): VocabItem {
  const items = ids.map((id) => VOCAB[id]).filter(Boolean);
  const preferred = settings.targetSounds.length
    ? items.filter((it) => settings.targetSounds.some((s) => wordHasSound(it.word, s) || wordHasSound(it.syllable.say, s)))
    : [];
  const pool = preferred.length ? preferred : items;
  return pool[Math.floor(seed * pool.length) % pool.length];
}

// ---------------- Rewards catalogue ----------------

export const UNLOCKS: Unlock[] = [
  { id: 'deco-wreath', kind: 'decoration', name: 'Holly Wreath', icon: '🎄', how: 'Help your first snowman' },
  { id: 'deco-snowglobe', kind: 'decoration', name: 'Snow Globe', icon: '🔮', how: 'Help all four snowmen' },
  { id: 'deco-lights', kind: 'decoration', name: 'Rainbow Lights', icon: '💡', how: 'Find 5 hidden stars' },
  { id: 'deco-stocking', kind: 'decoration', name: 'Stockings', icon: '🧦', how: 'Finish the Reindeer Dash' },
  { id: 'deco-bells', kind: 'decoration', name: 'Bell Garland', icon: '🔔', how: 'Play at the Bell Tower' },
  { id: 'deco-alphabet', kind: 'decoration', name: 'Letter Friends Banner', icon: '🔤', how: 'Help 3 letter friends' },
  { id: 'toy-robot', kind: 'toy', name: 'Bolt the Robot', icon: '🤖', how: 'Build a robot in the Toy Factory' },
  { id: 'toy-train', kind: 'toy', name: 'Toy Train', icon: '🚂', how: 'Finish the Toy Factory' },
  { id: 'toy-snowman', kind: 'toy', name: 'Snowman Figure', icon: '⛄', how: 'Help all four snowmen' },
  { id: 'outfit-elf', kind: 'outfit', name: 'Elf Hat', icon: '🧝', how: 'Finish the Toy Factory' },
  { id: 'outfit-antlers', kind: 'outfit', name: 'Antler Headband', icon: '🦌', how: 'Finish the Reindeer Dash' },
  { id: 'outfit-crown', kind: 'outfit', name: 'Star Crown', icon: '👑', how: 'Collect 15 magic stars' },
  { id: 'outfit-earmuffs', kind: 'outfit', name: 'Fluffy Earmuffs', icon: '🎧', how: 'Help a letter friend' },
  { id: 'rd-nose', kind: 'reindeer', name: 'Glowing Red Nose', icon: '🔴', how: 'Finish the Reindeer Dash' },
  { id: 'rd-bells', kind: 'reindeer', name: 'Jingle Collar', icon: '🔔', how: 'Collect 10 bells in the Dash' },
  { id: 'rd-lights', kind: 'reindeer', name: 'Twinkle Antlers', icon: '✨', how: 'Find the secret path in the Dash' },
];

export const CABIN_SLOTS = ['door', 'mantel', 'window', 'shelf', 'tree', 'floor'] as const;
export type CabinSlot = (typeof CABIN_SLOTS)[number];
