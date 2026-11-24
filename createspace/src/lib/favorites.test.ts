import { describe, expect, it } from 'vitest';
import { isIdList, sanitizeIds, toggleId } from './favorites';

describe('favorites helpers', () => {
  it('adds new ids to the front and removes existing ones', () => {
    expect(toggleId([], 'a')).toEqual(['a']);
    expect(toggleId(['a'], 'b')).toEqual(['b', 'a']);
    expect(toggleId(['b', 'a'], 'a')).toEqual(['b']);
  });

  it('validates stored data', () => {
    expect(isIdList(['a', 'b'])).toBe(true);
    expect(isIdList([])).toBe(true);
    expect(isIdList('a')).toBe(false);
    expect(isIdList([1])).toBe(false);
    expect(isIdList(null)).toBe(false);
  });

  it('drops unknown and duplicate ids', () => {
    expect(sanitizeIds(['a', 'x', 'a', 'b'], new Set(['a', 'b']))).toEqual(['a', 'b']);
  });
});
