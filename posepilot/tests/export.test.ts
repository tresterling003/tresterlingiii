import { describe, expect, it } from 'vitest';
import { expandHolds, frameFileName, harmonyReadme, safeName } from '../src/lib/export/sequence';

describe('export helpers', () => {
  it('numbers frames predictably', () => {
    expect(frameFileName(1)).toBe('frame_0001.png');
    expect(frameFileName(42)).toBe('frame_0042.png');
    expect(frameFileName(1234)).toBe('frame_1234.png');
  });
  it('expands holds in order', () => {
    const f = [{ id: 'a', hold: 2 }, { id: 'b', hold: 1 }, { id: 'c', hold: 3 }];
    expect(expandHolds(f, true).map((x) => x.id).join('')).toBe('aabccc');
    expect(expandHolds(f, false).map((x) => x.id).join('')).toBe('abc');
  });
  it('writes a Harmony readme and safe names', () => {
    expect(harmonyReadme(12, 10, 1280, 720, true)).toMatch(/12 fps/);
    expect(safeName('  My Cool Jump!! ')).toBe('my-cool-jump');
    expect(safeName('???')).toBe('posepilot');
  });
});
