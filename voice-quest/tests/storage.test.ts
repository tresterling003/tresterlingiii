import { describe, expect, it } from 'vitest';
import { mergeDefaults, Store, summarizeAttempts, defaultSettings } from '../src/core/storage';
import { colorTarget, pickPreferred, targetFor, VOCAB } from '../src/data/content';

class MemKV { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

describe('Store', () => {
  it('round-trips and fills new defaults', () => {
    const kv = new MemKV();
    kv.setItem('voicequest.v1', JSON.stringify({ settings: { practiceLevel: 'C', volumes: { music: 0.1 } } }));
    const s = new Store(kv);
    expect(s.settings.practiceLevel).toBe('C');
    expect(s.settings.volumes.music).toBe(0.1);
    expect(s.settings.volumes.voice).toBe(1);
    expect(s.settings.voiceMode).toBe('activity');
  });
  it('survives corrupt data', () => {
    const kv = new MemKV();
    kv.setItem('voicequest.v1', '{not json');
    expect(new Store(kv).progress.stars).toBe(0);
  });
  it('deleteAll wipes storage', () => {
    const kv = new MemKV();
    const s = new Store(kv);
    s.progress.stars = 5;
    s.save(true);
    s.deleteAll();
    expect(kv.getItem('voicequest.v1')).toBeNull();
    expect(s.progress.stars).toBe(0);
  });
  it('mergeDefaults rejects wrong types', () => {
    expect(mergeDefaults({ a: 1 }, { a: 'x' })).toEqual({ a: 1 });
  });
});

describe('summarizeAttempts', () => {
  it('counts labels per target', () => {
    const base = { activity: 'x', level: 'B' as const, mode: 'activity' as const, state: 'heard' as const, tries: 1, transcripts: [] };
    const s = summarizeAttempts([
      { ...base, t: 1, target: 'hat', label: 'Recognized' },
      { ...base, t: 2, target: 'hat', label: 'Completed with help' },
      { ...base, t: 3, target: 'dog', label: 'Picture choice' },
    ]);
    expect(s.byTarget[0]).toMatchObject({ target: 'hat', total: 2, recognized: 1, helped: 1 });
  });
});

describe('content targets', () => {
  const st = defaultSettings();
  it('level A uses activity matching (no false precision for sounds)', () => {
    expect(targetFor(VOCAB.hat, 'A', st).mode).toBe('activity');
  });
  it('level C/D are phrases with keyword credit', () => {
    const t = targetFor(VOCAB.hat, 'D', st);
    expect(t.mode).toBe('phrase');
    expect(t.keywords).toContain('hat');
  });
  it('parent accepted answers are included', () => {
    const s2 = { ...st, acceptedExtra: { dog: ['dod'] } };
    expect(targetFor(VOCAB.dog, 'B', s2).accept).toContain('dod');
    expect(colorTarget('blue', 'C', st, 'wheel').model).toBe('blue wheel');
  });
  it('prefers target sounds', () => {
    const s3 = { ...st, targetSounds: ['m'] };
    expect(pickPreferred(['ball', 'mitten', 'dog'], s3, 0).word).toBe('mitten');
  });
});
