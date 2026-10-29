import type { Drill } from '../data/schema';
import type { Controller } from '../core/controller';
import { wallNow } from '../core/state';
import { mulberry32, newSeed } from '../sim/rng';
import { prettyKey, type Action } from '../input/keymap';

// ---------------------------------------------------------------------------
// Solo session: drill set → countdown → formation → motion → decision window →
// response or self-check → feedback → rest → next rep → summary.
//
// What is measured: which answer KEY was pressed and how long after the
// decision window opened (keyboard/remote/pedal input timing). Verbal calls and
// physical movement are NOT measured — that needs separate sensing hardware.
// ---------------------------------------------------------------------------

export interface SessionConfig {
  drillIds: string[];
  reps: number;
  restSec: number;
  randomOrder: boolean;
  randomTiming: boolean;
  mode: 'choice' | 'aloud';
  answerWindowSec: number;
  feedbackSec: number;
  countdownSec: number;
  showPostSnap: boolean;
  autoAdvance: boolean;
  /** For repeat-missed sessions: exact reps (drill + seed) to run. */
  exact?: { drillId: string; seed: number }[];
  label?: string;
}

export const DEFAULT_SESSION: SessionConfig = {
  drillIds: [],
  reps: 10,
  restSec: 4,
  randomOrder: true,
  randomTiming: true,
  mode: 'choice',
  answerWindowSec: 4,
  feedbackSec: 5,
  countdownSec: 3,
  showPostSnap: true,
  autoAdvance: true,
};

export interface RepResult {
  index: number;
  drillId: string;
  drillName: string;
  seed: number;
  mode: 'choice' | 'aloud';
  choiceId: string | null;
  choiceLabel: string | null;
  correctIds: string[];
  /** choice mode: graded from the key pressed; aloud: athlete self-report (or null) */
  correct: boolean | null;
  selfReported: boolean;
  /** key press latency after the decision window opened (ms), null if none */
  responseMs: number | null;
  at: string;
}

export interface SessionRecord {
  id: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
  config: SessionConfig;
  results: RepResult[];
}

type Phase = 'countdown' | 'watch' | 'decide' | 'feedback' | 'rest' | 'summary' | 'stopped';

export class SoloSession {
  phase: Phase = 'countdown';
  queue: { drill: Drill; seed: number }[] = [];
  index = 0;
  record: SessionRecord;
  private deadline = 0;
  private windowOpenWall = 0;
  private paused: { remaining: number } | null = null;
  private current: RepResult | null = null;
  private replaying = false;

  constructor(
    private ctl: Controller,
    readonly cfg: SessionConfig,
  ) {
    this.record = {
      id: `s-${Date.now().toString(36)}`,
      label: cfg.label ?? 'Solo session',
      startedAt: new Date().toISOString(),
      endedAt: null,
      config: cfg,
      results: [],
    };
  }

  private buildQueue() {
    const drills = this.cfg.drillIds.map((id) => this.ctl.findDrill(id)).filter((d): d is Drill => !!d);
    if (this.cfg.exact) {
      this.queue = this.cfg.exact
        .map((e) => ({ drill: this.ctl.findDrill(e.drillId)!, seed: e.seed }))
        .filter((q) => q.drill);
      return;
    }
    if (!drills.length) return;
    const rng = mulberry32(newSeed());
    const out: { drill: Drill; seed: number }[] = [];
    let bag: Drill[] = [];
    for (let i = 0; i < this.cfg.reps; i++) {
      if (!bag.length) {
        bag = [...drills];
        if (this.cfg.randomOrder) {
          for (let k = bag.length - 1; k > 0; k--) {
            const j = Math.floor(rng() * (k + 1));
            [bag[k], bag[j]] = [bag[j], bag[k]];
          }
          // avoid the same drill twice in a row across bag boundaries
          if (out.length && bag.length > 1 && bag[0].id === out[out.length - 1].drill.id) [bag[0], bag[1]] = [bag[1], bag[0]];
        }
      }
      const d = bag.shift()!;
      out.push({ drill: d, seed: this.cfg.randomTiming ? (rng() * 0xffffffff) >>> 0 : 1 });
    }
    this.queue = out;
  }

  start() {
    this.buildQueue();
    if (!this.queue.length) {
      this.ctl.setAthleteOverlay({ kind: 'message', title: 'No drills selected', subtitle: 'Choose a drill set to start a session.' });
      this.phase = 'stopped';
      return;
    }
    this.index = 0;
    this.beginCountdown(this.cfg.countdownSec);
  }

  stop() {
    this.phase = 'stopped';
    if (!this.record.endedAt) this.save();
  }

  private save() {
    this.record.endedAt = new Date().toISOString();
    const all = this.ctl.store.getJson<SessionRecord[]>('sessions', []);
    const i = all.findIndex((r) => r.id === this.record.id);
    if (i >= 0) all[i] = this.record;
    else all.push(this.record);
    this.ctl.store.setJson('sessions', all.slice(-200));
  }

  private keyLabel(a: Action) {
    const k = this.ctl.keymap[a]?.[0];
    return k ? prettyKey(k) : '—';
  }

  private beginCountdown(sec: number) {
    const q = this.queue[this.index];
    this.ctl.loadDrill(q.drill, { seed: q.seed, autoplay: false });
    this.phase = 'countdown';
    this.deadline = wallNow() + sec * 1000;
    this.ctl.setAthleteOverlay({
      kind: 'countdown',
      title: `Rep ${this.index + 1} of ${this.queue.length}`,
      subtitle: 'Get in your stance',
      countdownTo: this.deadline,
    });
  }

  private startRep() {
    this.phase = 'watch';
    this.replaying = false;
    this.ctl.setAthleteOverlay({ kind: 'none' });
    this.ctl.seek(0);
    this.ctl.play();
    const q = this.queue[this.index];
    this.current = {
      index: this.index,
      drillId: q.drill.id,
      drillName: q.drill.name,
      seed: q.seed,
      mode: this.cfg.mode,
      choiceId: null,
      choiceLabel: null,
      correctIds: q.drill.answers.correct,
      correct: null,
      selfReported: false,
      responseMs: null,
      at: new Date().toISOString(),
    };
  }

  /** Called by the controller when playback reaches a stop point. */
  onStopped(_reason: 'freeze' | 'end', reachedWall: number) {
    if (this.phase === 'watch' && !this.replaying) this.openDecision(reachedWall);
  }

  /** Wall time at which the decision point was (or will be) reached. */
  private decisionWall(): number {
    const c = this.ctl.state.clock;
    const td = this.ctl.timeline.markers.decision;
    if (!c.playing) return wallNow();
    return c.anchorWall + ((td - c.anchorT) / c.speed) * 1000;
  }

  private openDecision(openWall: number) {
    this.phase = 'decide';
    this.windowOpenWall = Math.min(openWall, wallNow());
    this.deadline = this.windowOpenWall + this.cfg.answerWindowSec * 1000;
    const d = this.queue[this.index].drill;
    if (this.cfg.mode === 'choice') {
      this.ctl.setAthleteOverlay({
        kind: 'prompt',
        title: 'Your call?',
        choices: d.answers.choices.slice(0, 6).map((c, i) => ({ key: this.keyLabel(`answer${i + 1}` as Action), label: c.label })),
        countdownTo: this.deadline,
      });
    } else {
      this.ctl.setAthleteOverlay({
        kind: 'prompt',
        title: 'Call it out loud!',
        subtitle: `Press ${this.keyLabel('advance')} to reveal`,
        countdownTo: this.deadline,
      });
    }
  }

  tick() {
    if (this.paused || this.phase === 'stopped' || this.phase === 'summary') return;
    const now = wallNow();
    if (this.phase === 'countdown' && now >= this.deadline) this.startRep();
    else if (this.phase === 'watch') {
      // non-freeze drills: decision window opens while the rep keeps playing
      const t = this.ctl.now();
      if (!this.replaying && t >= this.ctl.timeline.markers.decision) this.openDecision(this.decisionWall());
    } else if (this.phase === 'decide' && now >= this.deadline) {
      this.showFeedback(null, null);
    } else if ((this.phase === 'feedback' && this.cfg.autoAdvance && now >= this.deadline) || (this.phase === 'rest' && now >= this.deadline)) {
      this.advance();
    }
  }

  private answer(choiceIdx: number, wall: number) {
    const d = this.queue[this.index].drill;
    const ch = d.answers.choices[choiceIdx];
    if (!ch) return;
    this.showFeedback(ch.id, Math.max(0, wall - this.windowOpenWall));
  }

  private showFeedback(choiceId: string | null, responseMs: number | null, selfCheckPending = false) {
    const d = this.queue[this.index].drill;
    const r = this.current!;
    const correctLabels = d.answers.choices.filter((c) => d.answers.correct.includes(c.id)).map((c) => c.label);
    if (this.cfg.mode === 'choice') {
      r.choiceId = choiceId;
      r.choiceLabel = d.answers.choices.find((c) => c.id === choiceId)?.label ?? null;
      r.correct = choiceId !== null && d.answers.correct.includes(choiceId);
      r.responseMs = responseMs;
    } else {
      r.responseMs = responseMs;
    }
    this.phase = 'feedback';
    this.deadline = wallNow() + this.cfg.feedbackSec * 1000;
    if (this.cfg.showPostSnap) {
      // let the play finish so the athlete sees the snap and first steps
      this.ctl.play();
    }
    const explanation = d.answers.explanation.replace(/^EXAMPLE ANSWER — replace with your own rule\. /, '');
    const ex = d.answers.isExample ? 'Example answer — your coach can edit it' : '';
    if (this.cfg.mode === 'choice') {
      const tone = r.correct ? 'good' : 'bad';
      this.ctl.setAthleteOverlay({
        kind: 'feedback',
        tone,
        title: choiceId === null ? 'No answer' : r.correct ? 'Correct' : 'Not quite',
        subtitle: `${correctLabels.join(' / ')}${responseMs !== null ? ` · ${(responseMs / 1000).toFixed(2)} s` : ''}`,
        lines: [explanation, ex].filter(Boolean),
        choices: d.answers.choices.slice(0, 6).map((c, i) => ({
          key: this.keyLabel(`answer${i + 1}` as Action),
          label: c.label,
          state: d.answers.correct.includes(c.id) ? 'correct' : c.id === choiceId ? 'wrong' : 'none',
        })),
      });
      this.results();
    } else {
      this.ctl.setAthleteOverlay({
        kind: 'feedback',
        tone: 'neutral',
        title: correctLabels.join(' / '),
        subtitle: selfCheckPending ? `Did you call it? ${this.keyLabel('gotIt')} = yes · ${this.keyLabel('missed')} = no` : 'Time — here is the answer',
        lines: [explanation, ex].filter(Boolean),
      });
      if (!selfCheckPending) this.results();
      else this.deadline = wallNow() + Math.max(this.cfg.feedbackSec, 8) * 1000;
    }
  }

  private results() {
    if (this.current && !this.record.results.includes(this.current)) this.record.results.push(this.current);
  }

  private advance() {
    if (this.phase === 'feedback') {
      this.results();
      if (this.index + 1 >= this.queue.length) return this.summary();
      if (this.cfg.restSec > 0) {
        this.phase = 'rest';
        this.deadline = wallNow() + this.cfg.restSec * 1000;
        this.ctl.pause();
        this.ctl.setAthleteOverlay({ kind: 'rest', title: 'Reset', subtitle: `Next rep in`, countdownTo: this.deadline });
        return;
      }
    }
    this.index++;
    if (this.index >= this.queue.length) return this.summary();
    this.beginCountdown(Math.min(this.cfg.countdownSec, 2));
  }

  private summary() {
    this.phase = 'summary';
    this.save();
    const rs = this.record.results;
    const graded = rs.filter((r) => r.correct !== null);
    const right = graded.filter((r) => r.correct).length;
    const times = rs.map((r) => r.responseMs).filter((x): x is number => x !== null);
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : null;
    const missed = rs.filter((r) => r.correct === false || (r.correct === null && this.cfg.mode === 'choice'));
    this.ctl.pause();
    this.ctl.setAthleteOverlay({
      kind: 'summary',
      title: 'Session complete',
      subtitle: `${rs.length} reps completed`,
      lines: [
        this.cfg.mode === 'choice' ? `Submitted answers: ${right} / ${rs.length} correct` : `Self-checked: ${right} / ${graded.length} called correctly (athlete-reported)`,
        avg !== null ? `Average key response: ${avg.toFixed(2)} s` : '',
        missed.length ? `Missed: ${missed.length} — press ${this.keyLabel('replay')} to repeat them` : 'No misses!',
        `${this.keyLabel('advance')} = finish`,
        'Measures key presses only — not verbal calls or physical movement.',
      ].filter(Boolean),
    });
  }

  missedReps() {
    return this.record.results.filter((r) => r.correct === false || (r.correct === null && this.cfg.mode === 'choice')).map((r) => ({ drillId: r.drillId, seed: r.seed }));
  }

  togglePause() {
    if (this.paused) {
      this.deadline = wallNow() + this.paused.remaining;
      this.paused = null;
      if (this.phase === 'watch' || (this.phase === 'feedback' && this.cfg.showPostSnap)) this.ctl.play();
      this.ctl.update({ athlete: { ...this.ctl.state.athlete, subtitle: this.ctl.state.athlete.subtitle?.replace(' · PAUSED', '') } });
    } else {
      this.paused = { remaining: Math.max(0, this.deadline - wallNow()) };
      this.ctl.pause();
      this.ctl.update({ athlete: { ...this.ctl.state.athlete, subtitle: (this.ctl.state.athlete.subtitle ?? '') + ' · PAUSED' } });
    }
  }

  /** Returns true if the session consumed the input. */
  handle(actions: Action[], wall: number): boolean {
    if (this.phase === 'stopped') return false;
    if (actions.includes('pause')) {
      this.togglePause();
      return true;
    }
    if (this.paused) return true;
    const answerIdx = actions.map((a) => /^answer(\d)$/.exec(a)).find(Boolean);
    switch (this.phase) {
      case 'countdown':
        if (actions.includes('advance')) this.startRep();
        return true;
      case 'watch':
        if (this.cfg.mode === 'choice' && answerIdx && this.ctl.now() >= this.ctl.timeline.markers.decision - 1e-3) {
          this.windowOpenWall = this.decisionWall();
          this.answer(Number(answerIdx[1]) - 1, wall);
        }
        return true;
      case 'decide':
        if (this.cfg.mode === 'choice' && answerIdx) this.answer(Number(answerIdx[1]) - 1, wall);
        else if (this.cfg.mode === 'aloud' && actions.includes('advance')) this.showFeedback(null, Math.max(0, wall - this.windowOpenWall), true);
        return true;
      case 'feedback': {
        const r = this.current!;
        if (this.cfg.mode === 'aloud' && !this.record.results.includes(r)) {
          // two-button remotes: advance = got it, back = missed
          if (actions.includes('gotIt') || actions.includes('advance')) {
            r.correct = true;
            r.selfReported = true;
            this.results();
            this.ctl.update({ athlete: { ...this.ctl.state.athlete, subtitle: 'Logged: called it ✓', tone: 'good' } });
            this.deadline = wallNow() + 1500;
            return true;
          }
          if (actions.includes('missed') || actions.includes('replay')) {
            r.correct = false;
            r.selfReported = true;
            this.results();
            this.ctl.update({ athlete: { ...this.ctl.state.athlete, subtitle: 'Logged: missed ✗ — it will be in “repeat missed”', tone: 'bad' } });
            this.deadline = wallNow() + 1500;
            return true;
          }
          return true;
        }
        if (actions.includes('advance')) this.advance();
        else if (actions.includes('replay')) {
          // watch the same rep again (not re-scored)
          this.replaying = true;
          this.ctl.seek(0);
          this.ctl.play();
          this.deadline = wallNow() + (this.ctl.timeline.duration + this.cfg.feedbackSec) * 1000;
        }
        return true;
      }
      case 'rest':
        if (actions.includes('advance')) this.advance();
        return true;
      case 'summary':
        if (actions.includes('replay')) {
          const missed = this.missedReps();
          if (missed.length) this.ctl.startSession({ ...this.cfg, exact: missed, reps: missed.length, label: 'Repeat missed' });
        } else if (actions.includes('advance')) this.ctl.stopSession();
        return true;
    }
    return false;
  }
}
