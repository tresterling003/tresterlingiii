import { describe, expect, it } from 'vitest';
import { classifyTurn, listenOnce, SimulatedMic } from '../src/speech/voiceTurn';
import { SimulatedRecognizer } from '../src/speech/recognizers';
import { VoiceActivityDetector } from '../src/speech/mic';

const vad = (speech: boolean) => ({ speechDetected: speech, voicedMs: speech ? 400 : 0, peak: 0.3, noiseFloor: 0.01 });
const base = { micStatus: 'open' as const, specMode: 'keywords' as const };

describe('classifyTurn (child-facing states)', () => {
  it('A: recognized target', () => {
    const r = classifyTurn({ ...base, mode: 'recognition', vad: vad(true), outcome: { alternatives: [{ transcript: 'hat' }], heardSound: true }, match: { matched: true, how: 'exact' } });
    expect(r).toEqual({ state: 'recognized', success: true, activityOnly: false });
  });
  it('B: speech detected but not recognized', () => {
    const r = classifyTurn({ ...base, mode: 'recognition', vad: vad(true), outcome: { alternatives: [], heardSound: true, error: 'no-speech' }, match: null });
    expect(r.state).toBe('heard');
    expect(r.success).toBe(false);
  });
  it('C: silence', () => {
    const r = classifyTurn({ ...base, mode: 'recognition', vad: vad(false), outcome: { alternatives: [], heardSound: false, error: 'no-speech' }, match: null });
    expect(r.state).toBe('silent');
  });
  it('D: microphone denied', () => {
    const r = classifyTurn({ ...base, micStatus: 'denied', mode: 'activity', vad: null, outcome: null, match: null });
    expect(r.state).toBe('unavailable');
  });
  it('D: recognition network error with no voice', () => {
    const r = classifyTurn({ ...base, mode: 'recognition', vad: vad(false), outcome: { alternatives: [], heardSound: false, error: 'network' }, match: null });
    expect(r.state).toBe('unavailable');
  });
  it('pictures mode is always picture interaction', () => {
    expect(classifyTurn({ ...base, mode: 'pictures', vad: null, outcome: null, match: null }).state).toBe('unavailable');
  });
  it('activity mode: any voice attempt succeeds as practice', () => {
    const r = classifyTurn({ ...base, mode: 'activity', vad: vad(true), outcome: null, match: null });
    expect(r).toEqual({ state: 'heard', success: true, activityOnly: true });
  });
  it('sound/syllable targets succeed on voice activity even in recognition mode', () => {
    const r = classifyTurn({ ...base, specMode: 'activity', mode: 'recognition', vad: vad(true), outcome: { alternatives: [], heardSound: true }, match: null });
    expect(r.success).toBe(true);
    expect(r.activityOnly).toBe(true);
  });
});

describe('VoiceActivityDetector', () => {
  it('calibrates noise floor then detects louder speech', () => {
    const v = new VoiceActivityDetector(200, 100);
    for (let i = 0; i < 10; i++) v.push(0.005, 25); // quiet room
    expect(v.report().speechDetected).toBe(false);
    for (let i = 0; i < 8; i++) v.push(0.1, 25); // speech
    expect(v.report().speechDetected).toBe(true);
  });
  it('ignores a short click', () => {
    const v = new VoiceActivityDetector(100, 140);
    for (let i = 0; i < 5; i++) v.push(0.005, 25);
    v.push(0.2, 25);
    for (let i = 0; i < 5; i++) v.push(0.005, 25);
    expect(v.report().speechDetected).toBe(false);
  });
});

describe('listenOnce with simulated mic + recognizer', () => {
  const spec = { accept: ['hat'], keywords: ['hat'], mode: 'keywords' as const, generous: true };
  const setup = () => {
    const rec = new SimulatedRecognizer();
    rec.delayMs = 50;
    const mic = new SimulatedMic(() => { const r = rec.peek('hat'); return r.kind === 'say' || r.kind === 'mumble'; });
    return { rec, mic };
  };
  it('recognizes the expected word and releases the mic', async () => {
    const { rec, mic } = setup();
    const r = await listenOnce({ mic, recognizer: rec, mode: 'recognition', lang: 'en-US', listenMs: 1500, spec, expected: 'hat' });
    expect(r.state).toBe('recognized');
    expect(mic.status).toBe('idle');
  });
  it('reports heard for voice without words', async () => {
    const { rec, mic } = setup();
    rec.queue.push({ kind: 'mumble' });
    const r = await listenOnce({ mic, recognizer: rec, mode: 'recognition', lang: 'en-US', listenMs: 1500, spec, expected: 'hat' });
    expect(r.state).toBe('heard');
    expect(r.success).toBe(false);
  });
  it('reports unavailable when permission is denied', async () => {
    const { rec, mic } = setup();
    mic.forcedStatus = 'denied';
    rec.queue.push({ kind: 'error', code: 'not-allowed' });
    const r = await listenOnce({ mic, recognizer: rec, mode: 'recognition', lang: 'en-US', listenMs: 800, spec });
    expect(r.state).toBe('unavailable');
  });
  it('wrong word is not a success', async () => {
    const { rec, mic } = setup();
    rec.queue.push({ kind: 'say', text: 'banana' });
    const r = await listenOnce({ mic, recognizer: rec, mode: 'recognition', lang: 'en-US', listenMs: 800, spec });
    expect(r.state).toBe('heard');
    expect(r.transcripts).toEqual(['banana']);
  });
});
