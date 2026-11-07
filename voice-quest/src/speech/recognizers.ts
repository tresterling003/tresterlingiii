// Modular speech-recognition adapters.
//
// IMPORTANT (disclosed to parents in the setup screen):
//  - Chrome / Edge implement the Web Speech API by streaming audio to the browser vendor's online
//    recognition service. It does not run offline in those browsers.
//  - Safari uses Apple's speech recognition, which may also use a server.
//  - Firefox does not currently ship SpeechRecognition; the game falls back to activity or picture mode.
// General-purpose recognizers are trained mostly on adult speech and are known to be less reliable for
// young children. Results are treated as hints, never as judgements about the child.

import type { Alternative } from './matcher';

export type RecognizerErrorCode =
  | 'not-supported'
  | 'not-allowed'
  | 'network'
  | 'no-speech'
  | 'aborted'
  | 'audio-capture'
  | 'service-not-allowed'
  | 'language-not-supported'
  | 'other';

export interface RecognitionOutcome {
  alternatives: Alternative[];
  error?: RecognizerErrorCode;
  errorMessage?: string;
  /** true if the recognizer reported hearing sound/speech events */
  heardSound: boolean;
}

export interface RecognizeOptions {
  lang: string;
  /** hard cap */
  maxMs: number;
  /** hints for the simulated adapter / debug panel */
  expected?: string;
  onInterim?: (text: string) => void;
}

export interface SpeechRecognizer {
  readonly name: string;
  readonly externalService: boolean;
  available(): boolean;
  recognize(opts: RecognizeOptions): Promise<RecognitionOutcome>;
  abort(): void;
}

// --- Web Speech API -------------------------------------------------------

interface SRAlternative { transcript: string; confidence: number }
interface SRResult { isFinal: boolean; length: number; [i: number]: SRAlternative }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
}
type SRCtor = new () => SRInstance;

function getSRCtor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class WebSpeechRecognizer implements SpeechRecognizer {
  readonly name = 'Browser speech recognition (Web Speech API)';
  readonly externalService = true;
  private rec: SRInstance | null = null;

  available(): boolean {
    return !!getSRCtor();
  }

  recognize(opts: RecognizeOptions): Promise<RecognitionOutcome> {
    const Ctor = getSRCtor();
    if (!Ctor) return Promise.resolve({ alternatives: [], error: 'not-supported', heardSound: false });
    return new Promise((resolve) => {
      const rec = new Ctor();
      this.rec = rec;
      rec.lang = opts.lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 5;
      const finals: Alternative[] = [];
      let interim = '';
      let heardSound = false;
      let error: RecognizerErrorCode | undefined;
      let errorMessage: string | undefined;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.rec = null;
        const alternatives = finals.length ? finals : interim ? [{ transcript: interim }] : [];
        resolve({ alternatives, error: alternatives.length ? undefined : error, errorMessage, heardSound: heardSound || alternatives.length > 0 });
      };
      rec.onsoundstart = () => (heardSound = true);
      rec.onspeechstart = () => (heardSound = true);
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            for (let j = 0; j < r.length; j++) finals.push({ transcript: r[j].transcript, confidence: r[j].confidence || undefined });
          } else {
            interim = r[0]?.transcript ?? interim;
            opts.onInterim?.(interim);
          }
        }
      };
      rec.onerror = (e) => {
        const map: Record<string, RecognizerErrorCode> = {
          'not-allowed': 'not-allowed', 'service-not-allowed': 'service-not-allowed', network: 'network',
          'no-speech': 'no-speech', aborted: 'aborted', 'audio-capture': 'audio-capture', 'language-not-supported': 'language-not-supported',
        };
        error = map[e.error] ?? 'other';
        errorMessage = e.message || e.error;
      };
      rec.onend = finish;
      const timer = setTimeout(() => {
        try { rec.stop(); } catch { /* ignore */ }
        setTimeout(finish, 900); // allow final result to arrive
      }, opts.maxMs);
      try {
        rec.start();
      } catch (e) {
        error = 'other';
        errorMessage = String(e);
        finish();
      }
    });
  }

  /** Ask the recognizer to stop listening and return what it has. */
  stop(): void {
    try { this.rec?.stop(); } catch { /* ignore */ }
  }

  abort(): void {
    try { this.rec?.abort(); } catch { /* ignore */ }
  }
}

// --- Simulated (developer testing without a microphone) --------------------

export type SimulatedResponse =
  | { kind: 'say'; text: string; confidence?: number }
  | { kind: 'mumble' } // voice activity, no transcript
  | { kind: 'silence' }
  | { kind: 'error'; code: RecognizerErrorCode };

export class SimulatedRecognizer implements SpeechRecognizer {
  readonly name = 'Simulated recognizer (developer mode)';
  readonly externalService = false;
  queue: SimulatedResponse[] = [];
  /** Used when the queue is empty. */
  defaultResponse: SimulatedResponse | 'expected' = 'expected';
  delayMs = 700;
  private aborted = false;

  available(): boolean {
    return true;
  }

  /** What the simulated mic should report as voice activity for the upcoming response. */
  peek(expected?: string): SimulatedResponse {
    const r = this.queue[0] ?? (this.defaultResponse === 'expected' ? { kind: 'say', text: expected ?? '' } : this.defaultResponse);
    return r;
  }

  recognize(opts: RecognizeOptions): Promise<RecognitionOutcome> {
    this.aborted = false;
    let r = this.queue.shift() ?? (this.defaultResponse === 'expected' ? ({ kind: 'say', text: opts.expected ?? '' } as SimulatedResponse) : this.defaultResponse);
    if (r.kind === 'say' && r.text === '__expected__') r = { kind: 'say', text: opts.expected ?? '' };
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.aborted) return resolve({ alternatives: [], error: 'aborted', heardSound: false });
        switch (r.kind) {
          case 'say':
            opts.onInterim?.(r.text);
            return resolve({ alternatives: [{ transcript: r.text, confidence: r.confidence ?? 0.8 }], heardSound: true });
          case 'mumble':
            return resolve({ alternatives: [], error: 'no-speech', heardSound: true });
          case 'silence':
            return resolve({ alternatives: [], error: 'no-speech', heardSound: false });
          case 'error':
            return resolve({ alternatives: [], error: r.code, heardSound: false });
        }
      }, Math.min(this.delayMs, opts.maxMs));
    });
  }

  abort(): void {
    this.aborted = true;
  }
}
