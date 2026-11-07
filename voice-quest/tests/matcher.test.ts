import { describe, expect, it } from 'vitest';
import { editDistance, matchAlternatives, matchTranscript, normalize } from '../src/speech/matcher';

const spec = (accept: string[], mode: 'phrase' | 'keywords' | 'activity' = 'keywords', keywords = accept, generous = true) => ({ accept, keywords, mode, generous });

describe('normalize', () => {
  it('lowercases, strips punctuation and expands digits', () => {
    expect(normalize("  The HAT! It's 2 ")).toBe('the hat its two');
  });
});

describe('matchTranscript', () => {
  it('exact single word', () => {
    expect(matchTranscript('Hat', spec(['hat'])).how).toBe('exact');
  });
  it('accepts equivalents', () => {
    expect(matchTranscript('a doggy', spec(['dog', 'doggy'])).matched).toBe(true);
  });
  it('keyword inside a longer utterance counts', () => {
    const r = matchTranscript('I found your hat snowman', spec(['hat']));
    expect(r.matched).toBe(true);
    expect(r.how).toBe('keyword');
  });
  it('phrase mode: whole phrase, or the key word alone', () => {
    const s = spec(['blue wheel'], 'phrase', ['blue']);
    expect(matchTranscript('blue wheel please', s).how).toBe('phrase');
    expect(matchTranscript('blue', s).how).toBe('keyword');
    expect(matchTranscript('red wheel', s).matched).toBe(false);
  });
  it('generous near-miss matching', () => {
    expect(matchTranscript('had', spec(['hat'])).how).toBe('close');
    expect(matchTranscript('had', spec(['hat'], 'keywords', ['hat'], false)).matched).toBe(false);
  });
  it('does not fuzz very short words', () => {
    expect(matchTranscript('no', spec(['go'])).matched).toBe(false);
  });
  it('activity mode accepts any recognised vocalisation', () => {
    expect(matchTranscript('bah', spec(['ba'], 'activity')).how).toBe('activity');
  });
  it('empty transcript never matches', () => {
    expect(matchTranscript('   ', spec(['hat'])).matched).toBe(false);
  });
  it('unrelated words do not match', () => {
    expect(matchTranscript('banana', spec(['hat'])).matched).toBe(false);
  });
});

describe('matchAlternatives', () => {
  it('picks the best alternative', () => {
    const r = matchAlternatives([{ transcript: 'cat', confidence: 0.6 }, { transcript: 'hat', confidence: 0.3 }], spec(['hat']));
    expect(r.matched).toBe(true);
    expect(r.transcript).toBe('hat');
    expect(r.confidence).toBe(0.3);
  });
});

describe('editDistance', () => {
  it('computes levenshtein', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
  });
});
