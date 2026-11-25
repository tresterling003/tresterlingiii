import { describe, expect, it } from 'vitest';
import { filterTools, normalize } from './search';
import { TOOLS } from '@/tools/registry';

const ids = (query: string, category: Parameters<typeof filterTools>[1]['category'] = null) =>
  filterTools(TOOLS, { query, category }).map((t) => t.id);

describe('normalize', () => {
  it('lower-cases, trims and strips accents', () => {
    expect(normalize('  Côlor ')).toBe('color');
  });
});

describe('filterTools', () => {
  it('returns every tool in registry order when there is no query', () => {
    expect(ids('')).toEqual(TOOLS.map((t) => t.id));
    expect(ids('   ')).toHaveLength(TOOLS.length);
  });

  it('matches tool names, case-insensitively, ranking name matches first', () => {
    expect(ids('COLOR')[0]).toBe('color-studio');
    expect(ids('telep')).toEqual(['teleprompter']);
  });

  it('matches keywords', () => {
    expect(ids('gradient')).toContain('color-studio');
    expect(ids('pomodoro')).toEqual(['focus-room']);
    expect(ids('pdf')).toContain('invoice-maker');
  });

  it('matches descriptions', () => {
    expect(ids('dialogue')).toEqual(['storyboard-studio']);
  });

  it('matches category names', () => {
    const business = ids('business');
    expect(business).toEqual(expect.arrayContaining(['business-dashboard', 'rate-calculator', 'invoice-maker']));
    expect(business).toHaveLength(3);
  });

  it('requires every word to match', () => {
    expect(ids('invoice pdf')).toEqual(['invoice-maker']);
    expect(ids('invoice gradient')).toEqual([]);
  });

  it('returns nothing for gibberish', () => {
    expect(ids('zzqxv')).toEqual([]);
  });

  it('filters by category, alone and combined with search', () => {
    expect(ids('', 'business')).toEqual(['business-dashboard', 'rate-calculator', 'invoice-maker']);
    expect(ids('timer', 'productivity')).toEqual(['focus-room']);
    expect(ids('timer', 'business')).toEqual([]);
  });
});

describe('registry', () => {
  it('has unique ids and routes, and valid accent colors', () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((t) => t.route)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/);
      expect(t.route).toBe(`/tools/${t.id}`);
      expect(t.accent).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('only tools that are actually built are marked usable', () => {
    expect(TOOLS).toHaveLength(15);
    const usable = TOOLS.filter((t) => t.status === 'beta' || t.status === 'available');
    expect(usable.map((t) => t.id)).toEqual(['business-dashboard']);
    expect(TOOLS.filter((t) => t.workspace).map((t) => t.id)).toEqual(['business-dashboard']);
  });
});
