// Target-word matching. Pure functions, unit tested.
// This compares *transcripts* (text a recognizer produced) with accepted answers.
// It does NOT assess pronunciation or articulation.

export interface Alternative {
  transcript: string;
  /** 0..1 when the recognizer reports it; undefined when unknown */
  confidence?: number;
}

export interface MatchSpec {
  accept: string[];
  keywords: string[];
  mode: 'phrase' | 'keywords' | 'activity';
  generous: boolean;
}

export type MatchHow = 'exact' | 'phrase' | 'keyword' | 'close' | 'activity' | 'none';

export interface MatchResult {
  matched: boolean;
  how: MatchHow;
  matchedText?: string;
  transcript?: string;
  confidence?: number;
}

const NUMBER_WORDS: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five',
  '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten',
};

/** Lowercase, strip punctuation, expand digits, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(' ');
}

export function tokens(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

/** Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Allowed distance for a "close" match. Very short words get no fuzz (too many false positives). */
export function closeThreshold(word: string): number {
  if (word.length <= 2) return 0;
  if (word.length <= 5) return 1;
  return 2;
}

function containsSequence(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Find a keyword in the token list, as single words or contiguous multi-word keywords. */
function findKeyword(toks: string[], keywords: string[], generous: boolean): { how: MatchHow; text: string } | null {
  for (const k of keywords) {
    const kt = tokens(k);
    if (kt.length && containsSequence(toks, kt)) return { how: 'keyword', text: k };
  }
  if (generous) {
    for (const k of keywords) {
      const kt = tokens(k);
      if (kt.length !== 1) continue;
      const kw = kt[0];
      const th = closeThreshold(kw);
      if (!th) continue;
      for (const t of toks) {
        // require same first letter OR same length to keep false positives low
        if (Math.abs(t.length - kw.length) > th) continue;
        if (editDistance(t, kw) <= th && (t[0] === kw[0] || t.length === kw.length)) return { how: 'close', text: t };
      }
    }
  }
  return null;
}

/** Match one transcript against a spec. */
export function matchTranscript(transcript: string, spec: MatchSpec): MatchResult {
  const toks = tokens(transcript);
  if (!toks.length) return { matched: false, how: 'none', transcript };
  const joined = toks.join(' ');

  if (spec.mode === 'activity') {
    // Sounds/syllables: recognizers cannot judge these. Any recognized vocalisation counts as practice.
    return { matched: true, how: 'activity', transcript, matchedText: joined };
  }

  for (const a of spec.accept) {
    const at = tokens(a);
    if (!at.length) continue;
    if (at.join(' ') === joined) return { matched: true, how: 'exact', transcript, matchedText: a };
  }
  for (const a of spec.accept) {
    const at = tokens(a);
    if (at.length > 1 && containsSequence(toks, at)) return { matched: true, how: 'phrase', transcript, matchedText: a };
  }
  // Keyword credit (phrases/sentences: the key word anywhere counts — we value communication over exact form)
  const kw = findKeyword(toks, spec.keywords.length ? spec.keywords : spec.accept, spec.generous);
  if (kw) return { matched: true, how: kw.how, transcript, matchedText: kw.text };
  return { matched: false, how: 'none', transcript };
}

/** Match across all recognizer alternatives; return the best result (exact > phrase > keyword > close). */
export function matchAlternatives(alts: Alternative[], spec: MatchSpec): MatchResult {
  const rank: Record<MatchHow, number> = { exact: 5, phrase: 4, keyword: 3, activity: 2, close: 1, none: 0 };
  let best: MatchResult = { matched: false, how: 'none', transcript: alts[0]?.transcript };
  for (const alt of alts) {
    const r = matchTranscript(alt.transcript, spec);
    r.confidence = alt.confidence;
    if (rank[r.how] > rank[best.how]) best = r;
  }
  if (!best.matched && alts[0]) best.confidence = alts[0].confidence;
  return best;
}
