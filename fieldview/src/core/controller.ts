import type { Drill, Playlist } from '../data/schema';
import { Store } from '../data/store';
import { compileTimeline, type Timeline } from '../sim/timeline';
import { newSeed } from '../sim/rng';
import { SyncHost } from '../sync/channel';
import { actionsFor, normalizeKeymap, type Action, type Keymap } from '../input/keymap';
import { clockTime, wallNow, type AthleteOverlay, type SharedState } from './state';
import { initialState } from './initialState';
import { SoloSession, type SessionConfig } from '../assess/session';
import { hashString } from '../sim/rng';

export type FreezeMode = 'drill' | 'none' | 'before-motion' | 'mid-motion' | 'after-motion' | 'pre-snap';

export const FREEZE_LABELS: Record<FreezeMode, string> = {
  drill: 'Drill decision point',
  none: 'No freeze',
  'before-motion': 'Before motion',
  'mid-motion': 'During motion',
  'after-motion': 'After motion',
  'pre-snap': 'Just before snap',
};

export type AppMode = 'coach' | 'solo' | 'editor' | 'calibrate' | 'library' | 'settings';

/**
 * The single authoritative simulation timeline + session state. All UI and
 * every projector window derive what they show from `state` (and its clock).
 */
export class Controller {
  state: SharedState;
  readonly store: Store;
  readonly sync = new SyncHost();
  timeline: Timeline;
  freezeMode: FreezeMode = 'drill';
  randomizeTiming = true;
  playlist: Playlist | null = null;
  playlistIndex = 0;
  keymap: Keymap;
  session: SoloSession | null = null;
  mode: AppMode = 'coach';
  calibrationScene = false;
  lastKey: { code: string; actions: Action[]; at: number } | null = null;
  coachResults: { drillId: string; correct: boolean; at: number }[] = [];
  private listeners = new Set<() => void>();
  private version = 0;
  private tlKey = '';
  private tickTimer: number;
  private broadcastPending = false;

  constructor(store = new Store()) {
    this.store = store;
    const drills = store.get().drills;
    const first = drills.find((d) => d.id === 'demo-across-rl') ?? drills[0];
    this.state = initialState(store, first, 1);
    this.keymap = normalizeKeymap(store.getJson('keymap', null));
    const prefs = store.getJson<Partial<{ view: SharedState['view']; overlays: SharedState['overlays']; quality: SharedState['quality']; huddle: boolean; freezeMode: FreezeMode }>>('prefs', {});
    if (prefs.view) this.state.view = { ...this.state.view, ...prefs.view, defenderId: null };
    if (prefs.overlays) this.state.overlays = { ...this.state.overlays, ...prefs.overlays };
    if (prefs.quality) this.state.quality = { ...this.state.quality, ...prefs.quality };
    if (prefs.huddle !== undefined) this.state.huddle = prefs.huddle;
    if (prefs.freezeMode) this.freezeMode = prefs.freezeMode;
    this.timeline = this.compile();
    this.sync.onKey = (m) => this.handleKey(m.code, m.wall);
    this.sync.onHeartbeat = () => this.tick();
    store.subscribe(() => {
      const d = store.get();
      // keep calibration / team in sync with saved profiles
      this.update({ calibration: store.activeCalibration(), team: d.team });
    });
    this.tickTimer = window.setInterval(() => this.tick(), 30);
    this.applyStopAt();
    this.broadcast();
  }

  dispose() {
    clearInterval(this.tickTimer);
  }

  // --- subscription for React -------------------------------------------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private notify() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private compile(): Timeline {
    const s = this.state;
    const key = `${hashString(JSON.stringify(s.drill))}|${s.seed}|${s.huddle}`;
    if (key !== this.tlKey || !this.timeline) {
      this.tlKey = key;
      this.timeline = compileTimeline(s.drill, s.seed, { huddleBreak: s.huddle });
    }
    return this.timeline;
  }

  update(patch: Partial<SharedState>, opts: { silent?: boolean } = {}) {
    this.state = { ...this.state, ...patch, rev: this.state.rev + 1 };
    this.compile();
    if (!opts.silent) this.broadcast();
    this.notify();
  }

  private broadcast() {
    if (this.broadcastPending) return;
    this.broadcastPending = true;
    queueMicrotask(() => {
      this.broadcastPending = false;
      this.sync.send(this.state);
    });
  }

  savePrefs() {
    const s = this.state;
    this.store.setJson('prefs', { view: s.view, overlays: s.overlays, quality: s.quality, huddle: s.huddle, freezeMode: this.freezeMode });
  }

  // --- clock ---------------------------------------------------------------------
  now(): number {
    return Math.min(clockTime(this.state.clock), this.timeline.duration);
  }

  freezePoint(): number | null {
    const m = this.timeline.markers;
    const fm = this.session ? 'drill' : this.freezeMode;
    switch (fm) {
      case 'none':
        return null;
      case 'drill':
        return this.state.drill.recognition.freeze ? m.decision : null;
      case 'before-motion':
        return m.firstMotion !== null ? Math.max(0, m.firstMotion - 0.05) : Math.max(m.set + 0.5, m.snap - 1);
      case 'mid-motion':
        return m.firstMotion !== null && m.motionEnd !== null ? (m.firstMotion + m.motionEnd) / 2 : null;
      case 'after-motion':
        return m.motionEnd !== null ? Math.min(m.motionEnd + 0.2, m.snap - 0.02) : m.set + 0.5;
      case 'pre-snap':
        return m.snap - 0.03;
    }
  }

  private applyStopAt() {
    const c = this.state.clock;
    const t = clockTime(c);
    const f = this.freezePoint();
    const stopAt = f !== null && f > t + 1e-3 ? f : this.timeline.duration;
    if (stopAt !== c.stopAt) this.update({ clock: { ...c, stopAt } });
  }

  play() {
    let t = this.now();
    if (t >= this.timeline.duration - 1e-3) t = 0;
    const f = this.freezePoint();
    const stopAt = f !== null && f > t + 1e-3 ? f : this.timeline.duration;
    this.update({ clock: { ...this.state.clock, playing: true, anchorT: t, anchorWall: wallNow(), stopAt } });
  }

  pause() {
    const t = this.now();
    this.update({ clock: { ...this.state.clock, playing: false, anchorT: t, anchorWall: wallNow() } });
  }

  toggle() {
    if (this.state.clock.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    const tt = Math.max(0, Math.min(t, this.timeline.duration));
    const f = this.freezePoint();
    const stopAt = f !== null && f > tt + 1e-3 ? f : this.timeline.duration;
    this.update({ clock: { ...this.state.clock, anchorT: tt, anchorWall: wallNow(), stopAt } });
  }

  setSpeed(speed: number) {
    const t = this.now();
    this.update({ clock: { ...this.state.clock, speed, anchorT: t, anchorWall: wallNow() } });
  }

  setFreezeMode(m: FreezeMode) {
    this.freezeMode = m;
    this.savePrefs();
    this.seek(this.now());
    this.notify();
  }

  /** Exact replay: same drill, same seed, from the start. */
  replay(autoplay = true) {
    this.update({ athlete: { kind: 'none' } });
    this.seek(0);
    if (autoplay) this.play();
  }

  /** New rep: new random timing (if enabled); next drill if a playlist is active. */
  nextRep(autoplay = true) {
    let drill = this.state.drill;
    if (this.playlist) {
      this.playlistIndex = (this.playlistIndex + 1) % this.playlist.drillIds.length;
      drill = this.findDrill(this.playlist.drillIds[this.playlistIndex]) ?? drill;
    }
    this.loadDrill(drill, { seed: this.randomizeTiming ? newSeed() : 1, autoplay });
  }

  loadDrill(drill: Drill, opts: { seed?: number; autoplay?: boolean; keepView?: boolean } = {}) {
    const view = opts.keepView === false ? { ...this.state.view, defenderId: null } : this.state.view;
    // switching drills resets a view that pointed at a defender this drill doesn't have
    const validDef = view.defenderId && drill.defense.defenders.some((d) => d.id === view.defenderId) ? view.defenderId : null;
    this.update({
      drill,
      seed: opts.seed ?? this.state.seed,
      athlete: { kind: 'none' },
      view: { ...view, defenderId: validDef },
      clock: { ...this.state.clock, playing: false, anchorT: 0, anchorWall: wallNow(), stopAt: null },
    });
    this.applyStopAt();
    if (opts.autoplay) this.play();
  }

  setPlaylist(p: Playlist | null) {
    this.playlist = p;
    this.playlistIndex = 0;
    if (p) {
      const d = this.findDrill(p.drillIds[0]);
      if (d) this.loadDrill(d, { seed: this.randomizeTiming ? newSeed() : 1 });
    }
    this.notify();
  }

  findDrill(id: string): Drill | undefined {
    return this.store.get().drills.find((d) => d.id === id);
  }

  setAthleteOverlay(a: AthleteOverlay) {
    this.update({ athlete: a });
  }

  revealAnswer() {
    const d = this.state.drill;
    const correct = d.answers.choices.filter((c) => d.answers.correct.includes(c.id)).map((c) => c.label);
    this.setAthleteOverlay({
      kind: 'feedback',
      tone: 'neutral',
      title: correct.join(' / '),
      subtitle: d.answers.isExample ? 'Example answer — coach-editable' : d.defense.call,
      lines: [d.answers.explanation.replace(/^EXAMPLE ANSWER — replace with your own rule\. /, '')],
    });
  }

  scoreCoachRep(correct: boolean) {
    this.coachResults.push({ drillId: this.state.drill.id, correct, at: Date.now() });
    const all = this.store.getJson<unknown[]>('coachResults', []);
    all.push({ drillId: this.state.drill.id, drillName: this.state.drill.name, correct, at: new Date().toISOString(), seed: this.state.seed });
    this.store.setJson('coachResults', all.slice(-2000));
    this.notify();
  }

  // --- solo sessions ----------------------------------------------------------------
  startSession(cfg: SessionConfig) {
    this.session?.stop();
    this.session = new SoloSession(this, cfg);
    this.session.start();
    this.notify();
  }

  stopSession() {
    this.session?.stop();
    this.session = null;
    this.update({ athlete: { kind: 'none' } });
  }

  // --- periodic tick (also driven by projector heartbeats) -----------------------------
  tick() {
    const c = this.state.clock;
    if (c.playing && c.stopAt !== null) {
      const raw = c.anchorT + ((wallNow() - c.anchorWall) / 1000) * c.speed;
      if (raw >= c.stopAt - 1e-6) {
        const reason = c.stopAt >= this.timeline.duration - 1e-6 ? 'end' : 'freeze';
        // exact wall time the stop point was reached (independent of tick latency)
        const reachedWall = c.anchorWall + ((c.stopAt - c.anchorT) / c.speed) * 1000;
        this.update({ clock: { ...c, playing: false, anchorT: c.stopAt, anchorWall: wallNow() } });
        this.session?.onStopped(reason, reachedWall);
        if (reason === 'freeze') this.applyStopAt();
      }
    }
    this.session?.tick();
  }

  // --- input ----------------------------------------------------------------------
  setKeymap(k: Keymap) {
    this.keymap = k;
    this.store.setJson('keymap', k);
    this.notify();
  }

  handleKey(code: string, wall = wallNow()): boolean {
    const actions = actionsFor(code, this.keymap);
    if (!actions.length) return false;
    this.lastKey = { code, actions, at: Date.now() };
    if (this.session && this.session.handle(actions, wall)) {
      this.notify();
      return true;
    }
    if (this.mode === 'editor' || this.mode === 'settings' || this.mode === 'library' || this.mode === 'calibrate') return false;
    // Coach-mode defaults for remotes / pedals.
    if (actions.includes('pause')) this.toggle();
    else if (actions.includes('advance')) {
      const t = this.now();
      if (!this.state.clock.playing && t < this.timeline.duration - 1e-3) this.play();
      else this.nextRep();
    } else if (actions.includes('replay')) this.replay();
    this.notify();
    return true;
  }
}
