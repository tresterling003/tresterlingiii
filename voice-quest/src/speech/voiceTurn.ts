// One listening turn: open mic -> detect activity -> (optionally) recognize -> match -> classify -> release mic.
// Layers are kept separate:  microphone detection | speech activity detection | transcript recognition | target matching.
// There is no articulation assessment layer in this version (see README "Limitations").

import type { VoiceMode, VoiceState } from '../types';
import { matchAlternatives, type MatchResult, type MatchSpec } from './matcher';
import type { MicStatus, VadReport } from './mic';
import type { RecognitionOutcome, RecognizerErrorCode, SpeechRecognizer } from './recognizers';

export interface MicLike {
  status: MicStatus;
  level: number;
  voicedNow: boolean;
  lastError?: string;
  open(): Promise<MicStatus>;
  close(): VadReport;
  vad: { sinceVoice(): number; report(): VadReport };
}

export interface TurnResult {
  state: VoiceState;
  /** true when the turn counts as a successful communication for the game */
  success: boolean;
  /** true when success came from voice activity only (sounds / activity mode), not a transcript match */
  activityOnly: boolean;
  match: MatchResult | null;
  transcripts: string[];
  vad: VadReport | null;
  micStatus: MicStatus;
  recognizerError?: RecognizerErrorCode;
  errorMessage?: string;
  durationMs: number;
}

const BLOCKING_ERRORS: RecognizerErrorCode[] = ['not-supported', 'not-allowed', 'service-not-allowed', 'network', 'language-not-supported', 'audio-capture'];

export interface ClassifyInput {
  mode: VoiceMode;
  micStatus: MicStatus;
  vad: VadReport | null;
  outcome: RecognitionOutcome | null;
  match: MatchResult | null;
  specMode: MatchSpec['mode'];
}

/** Pure classification of a turn into the child-facing state. */
export function classifyTurn(i: ClassifyInput): { state: VoiceState; success: boolean; activityOnly: boolean } {
  if (i.mode === 'pictures') return { state: 'unavailable', success: false, activityOnly: false };
  const micBlocked = ['denied', 'no-mic', 'unsupported', 'insecure', 'error'].includes(i.micStatus);
  const recBlocked = i.mode === 'recognition' && !!i.outcome?.error && BLOCKING_ERRORS.includes(i.outcome.error) && !(i.outcome.alternatives.length);
  const voiced = !!i.vad?.speechDetected || !!i.outcome?.heardSound || !!i.outcome?.alternatives.some((a) => a.transcript.trim());

  if (i.match?.matched && i.match.how !== 'activity') return { state: 'recognized', success: true, activityOnly: false };
  if (micBlocked && (i.mode === 'activity' || recBlocked || !voiced)) return { state: 'unavailable', success: false, activityOnly: false };

  // Activity-based success: activity mode, or sound/syllable targets which recognizers cannot judge.
  if ((i.mode === 'activity' || i.specMode === 'activity') && voiced) return { state: 'heard', success: true, activityOnly: true };

  if (recBlocked && !voiced) return { state: 'unavailable', success: false, activityOnly: false };
  if (voiced) return { state: 'heard', success: false, activityOnly: false };
  return { state: 'silent', success: false, activityOnly: false };
}

export interface ListenDeps {
  mic: MicLike | null;
  recognizer: SpeechRecognizer | null;
  mode: VoiceMode;
  lang: string;
  listenMs: number;
  spec: MatchSpec;
  expected?: string;
  onLevel?: (level: number, voiced: boolean) => void;
  onInterim?: (text: string) => void;
  /** set .cancelled = true to end early */
  token?: { cancelled: boolean };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function listenOnce(d: ListenDeps): Promise<TurnResult> {
  const t0 = performance.now();
  const base = { match: null, transcripts: [], vad: null, durationMs: 0 } as const;
  if (d.mode === 'pictures') return { ...base, transcripts: [], state: 'unavailable', success: false, activityOnly: false, micStatus: 'idle' };

  let micStatus: MicStatus = 'idle';
  if (d.mic) micStatus = await d.mic.open();
  const micOk = micStatus === 'open';
  const useRec = d.mode === 'recognition' && !!d.recognizer && d.recognizer.available();

  if (!micOk && !useRec) {
    d.mic?.close();
    return { ...base, transcripts: [], state: 'unavailable', success: false, activityOnly: false, micStatus, errorMessage: d.mic?.lastError };
  }

  let outcome: RecognitionOutcome | null = null;
  let recDone = !useRec;
  if (useRec) {
    d.recognizer!
      .recognize({ lang: d.lang, maxMs: d.listenMs + 4000, expected: d.expected, onInterim: d.onInterim })
      .then((o) => { outcome = o; recDone = true; });
  }

  // Poll loop: end when the child finished an utterance, or the window passed in silence.
  const hardCap = d.listenMs + 6000;
  let everVoiced = false;
  let stopRequested = false;
  while (true) {
    await sleep(50);
    const el = performance.now() - t0;
    const level = d.mic?.level ?? 0;
    const voicedNow = d.mic?.voicedNow ?? false;
    if (voicedNow) everVoiced = true;
    d.onLevel?.(level, voicedNow);
    if (d.token?.cancelled) break;
    if (recDone && useRec) break;
    const since = micOk ? d.mic!.vad.sinceVoice() : Infinity;
    const utteranceEnded = everVoiced && since > 1100;
    const windowOver = el > d.listenMs && since > 700;
    if ((utteranceEnded || windowOver || el > hardCap) && !stopRequested) {
      if (!useRec) break;
      stopRequested = true;
      (d.recognizer as { stop?: () => void }).stop?.();
      // give the recognizer a moment to deliver its final result
      const waitStart = performance.now();
      while (!recDone && performance.now() - waitStart < 2500) await sleep(50);
      if (!recDone) d.recognizer!.abort();
      break;
    }
  }
  if (d.token?.cancelled && useRec && !recDone) d.recognizer!.abort();

  const vad = d.mic ? d.mic.close() : null; // release the microphone now
  d.onLevel?.(0, false);
  const o = outcome as RecognitionOutcome | null;
  const match = o && o.alternatives.length ? matchAlternatives(o.alternatives, d.spec) : null;
  const cls = classifyTurn({ mode: d.mode, micStatus, vad: micOk ? vad : null, outcome: o, match, specMode: d.spec.mode });
  return {
    ...cls,
    match,
    transcripts: o?.alternatives.map((a) => a.transcript) ?? [],
    vad: micOk ? vad : null,
    micStatus,
    recognizerError: o?.error,
    errorMessage: o?.errorMessage ?? d.mic?.lastError,
    durationMs: performance.now() - t0,
  };
}

/** A fake microphone for developer testing; voice activity follows the simulated recognizer's next response. */
export class SimulatedMic implements MicLike {
  status: MicStatus = 'idle';
  level = 0;
  voicedNow = false;
  private t0 = 0;
  private voiceFrom = 200;
  private voiceTo = 0;
  forcedStatus: MicStatus | null = null;
  constructor(private willVoice: () => boolean) {}
  vad = {
    sinceVoice: () => {
      const el = performance.now() - this.t0;
      if (this.voiceTo === 0 || el < this.voiceFrom) return Infinity;
      return Math.max(0, el - this.voiceTo);
    },
    report: (): VadReport => ({ speechDetected: this.voiceTo > 0, voicedMs: this.voiceTo ? this.voiceTo - this.voiceFrom : 0, peak: this.voiceTo ? 0.4 : 0.01, noiseFloor: 0.01 }),
  };
  async open(): Promise<MicStatus> {
    if (this.forcedStatus) return (this.status = this.forcedStatus);
    this.t0 = performance.now();
    this.voiceTo = this.willVoice() ? 800 : 0;
    const tick = () => {
      if (this.status !== 'open') return;
      const el = performance.now() - this.t0;
      this.voicedNow = this.voiceTo > 0 && el > this.voiceFrom && el < this.voiceTo;
      this.level = this.voicedNow ? 0.35 + Math.random() * 0.4 : 0.02;
      setTimeout(tick, 40);
    };
    this.status = 'open';
    tick();
    return this.status;
  }
  close(): VadReport {
    const r = this.vad.report();
    this.status = 'idle';
    this.level = 0;
    this.voicedNow = false;
    return r;
  }
}
