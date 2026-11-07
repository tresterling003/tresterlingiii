// Microphone detection + local speech-activity detection.
// Everything here runs locally in the browser: audio samples are analysed for loudness and never stored or sent.

export type MicStatus = 'idle' | 'requesting' | 'open' | 'denied' | 'no-mic' | 'unsupported' | 'insecure' | 'error';

export interface VadReport {
  speechDetected: boolean;
  /** milliseconds above the speech threshold */
  voicedMs: number;
  peak: number;
  noiseFloor: number;
}

/** Pure VAD state machine, separated from Web Audio so it can be unit tested. */
export class VoiceActivityDetector {
  noiseFloor = 0.01;
  voicedMs = 0;
  peak = 0;
  private calibMs = 0;
  private calibSum = 0;
  private calibN = 0;
  private lastVoiceAt = -Infinity;
  private elapsed = 0;
  constructor(
    private calibrationMs = 250,
    private minVoicedMs = 140,
    private minThreshold = 0.018,
  ) {}

  get threshold(): number {
    return Math.max(this.minThreshold, this.noiseFloor * 2.8);
  }

  /** Feed one RMS frame (0..1) of duration dtMs. Returns whether this frame is voiced. */
  push(rms: number, dtMs: number): boolean {
    this.elapsed += dtMs;
    this.peak = Math.max(this.peak, rms);
    if (this.calibMs < this.calibrationMs) {
      this.calibMs += dtMs;
      this.calibSum += rms;
      this.calibN++;
      this.noiseFloor = Math.min(0.05, this.calibSum / this.calibN);
      return false;
    }
    const voiced = rms > this.threshold;
    if (voiced) {
      this.voicedMs += dtMs;
      this.lastVoiceAt = this.elapsed;
    } else {
      // slowly track the noise floor while quiet
      this.noiseFloor = this.noiseFloor * 0.995 + Math.min(rms, 0.05) * 0.005;
    }
    return voiced;
  }

  /** ms since the last voiced frame */
  sinceVoice(): number {
    return this.elapsed - this.lastVoiceAt;
  }

  report(): VadReport {
    return { speechDetected: this.voicedMs >= this.minVoicedMs, voicedMs: this.voicedMs, peak: this.peak, noiseFloor: this.noiseFloor };
  }
}

export class MicMonitor {
  status: MicStatus = 'idle';
  level = 0; // smoothed 0..1 for UI
  voicedNow = false;
  vad = new VoiceActivityDetector();
  lastError = '';
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array | null = null;
  private raf = 0;
  private lastT = 0;
  onFrame?: (level: number, voiced: boolean) => void;

  constructor(private getCtx: () => AudioContext) {}

  static supported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async open(): Promise<MicStatus> {
    if (!window.isSecureContext) return (this.status = 'insecure');
    if (!MicMonitor.supported()) return (this.status = 'unsupported');
    this.status = 'requesting';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = (e as DOMException)?.name ?? '';
      this.lastError = `${name}: ${(e as Error)?.message ?? e}`;
      if (name === 'NotAllowedError' || name === 'SecurityError') return (this.status = 'denied');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') return (this.status = 'no-mic');
      return (this.status = 'error');
    }
    const ctx = this.getCtx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser); // NOT connected to destination: no playback of the child's voice
    this.vad = new VoiceActivityDetector();
    this.lastT = performance.now();
    this.status = 'open';
    const tick = () => {
      if (!this.analyser || !this.buf) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(sum / this.buf.length);
      const now = performance.now();
      const dt = Math.min(100, now - this.lastT);
      this.lastT = now;
      this.voicedNow = this.vad.push(rms, dt);
      const target = Math.min(1, rms * 9);
      this.level += (target - this.level) * 0.35;
      this.onFrame?.(this.level, this.voicedNow);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return this.status;
  }

  /** Stop and release the microphone hardware immediately. */
  close(): VadReport {
    cancelAnimationFrame(this.raf);
    const rep = this.vad.report();
    try { this.source?.disconnect(); } catch { /* ignore */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.level = 0;
    this.voicedNow = false;
    if (this.status === 'open') this.status = 'idle';
    return rep;
  }
}
