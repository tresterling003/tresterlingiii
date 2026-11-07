"use client";
import { FLOOR, SPOTS, type SpotId } from "@/scene/layout";
import type { DayPhase } from "@/domain/time";
import type { WeatherKind } from "@/domain/types";

export type Pose = "stand" | "walk" | "sit" | "sleep" | "look-up" | "play" | "react" | "inspect" | "hop";
export type Expression = "happy" | "calm" | "sleepy" | "surprised" | "curious";

export type Behavior =
  | "idle"
  | "wander"
  | "sit"
  | "sleep"
  | "play"
  | "look-window"
  | "check-mail"
  | "react-computer"
  | "inspect-plant"
  | "read-board";

export interface ResidentView {
  x: number;
  y: number;
  facing: 1 | -1;
  pose: Pose;
  expression: Expression;
  behavior: Behavior;
  bubble: "none" | "exclaim" | "heart" | "zzz" | "note" | "question";
  /** Direction the eyes look, -1..1. */
  gaze: number;
}

export interface ResidentContext {
  phase: DayPhase;
  weather: WeatherKind;
  energy: number;
  reducedMotion: boolean;
}

interface Plan {
  behavior: Behavior;
  to?: { x: number; y: number };
  face?: 1 | -1;
  pose: Pose;
  expression: Expression;
  bubble?: ResidentView["bubble"];
  holdMs: number;
  gaze?: number;
}

const SPEED = 95; // world units / s
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function pick<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of entries) if ((r -= w) <= 0) return v;
  return entries[0][0];
}

/**
 * The resident's brain. Pure TypeScript with no React: it decides behaviours, walks
 * between spots with a rAF loop that only runs while moving, and pushes view
 * updates to a renderer callback. Position updates are cheap (transform only);
 * pose/expression changes are rare and trigger React renders.
 */
export class ResidentController {
  private view: ResidentView;
  private ctx: ResidentContext;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private raf = 0;
  private disposed = false;
  private last = 0;
  private walkTarget: { x: number; y: number } | null = null;
  private onArrive: (() => void) | null = null;
  private interruptUntil = 0;

  constructor(
    private onMove: (v: ResidentView) => void,
    private onPose: (v: ResidentView) => void,
    ctx: ResidentContext,
    start?: { x: number; y: number },
  ) {
    this.ctx = ctx;
    const sleeping = ctx.phase === "night";
    const s = sleeping ? SPOTS.cushion : SPOTS.center;
    this.view = {
      x: start?.x ?? s.x,
      y: start?.y ?? s.y,
      facing: 1,
      pose: sleeping ? "sleep" : "stand",
      expression: sleeping ? "sleepy" : "calm",
      behavior: sleeping ? "sleep" : "idle",
      bubble: sleeping ? "zzz" : "none",
      gaze: 0,
    };
  }

  get state() {
    return this.view;
  }

  start() {
    this.onMove(this.view);
    this.onPose(this.view);
    this.schedule(rand(1500, 3500));
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
  }

  setContext(ctx: Partial<ResidentContext>) {
    const wasNight = this.ctx.phase === "night";
    this.ctx = { ...this.ctx, ...ctx };
    // Morning: wake up gently.
    if (wasNight && this.ctx.phase !== "night" && this.view.behavior === "sleep") this.react("wake");
  }

  /** External events (mail, computer, petting…) interrupt the routine. */
  react(kind: "mail" | "computer" | "phone" | "storm" | "pet" | "wake") {
    if (this.disposed) return;
    const asleep = this.view.behavior === "sleep";
    if (asleep && kind !== "pet" && kind !== "wake") {
      // A sleeping resident just stirs; it is never jolted awake by notifications.
      this.flash({ bubble: "question", expression: "sleepy" }, 1400, { bubble: "zzz" });
      return;
    }
    this.interruptUntil = Date.now() + 1500;
    switch (kind) {
      case "mail":
        this.flash({ pose: "react", bubble: "exclaim", expression: "surprised", gaze: -1, facing: -1 }, 900, null, () => this.run(this.planFor("check-mail")));
        break;
      case "computer":
      case "phone":
        this.flash({ pose: "react", bubble: "note", expression: "curious", gaze: 1, facing: this.view.x < SPOTS.desk.x ? 1 : -1 }, 1600, null, () =>
          Math.random() < 0.55 ? this.run(this.planFor("react-computer")) : this.schedule(1200),
        );
        break;
      case "storm":
        this.run(this.planFor("look-window"));
        break;
      case "pet":
        this.flash({ pose: "hop", bubble: "heart", expression: "happy" }, 1300, null, () => this.schedule(rand(2000, 4000)));
        break;
      case "wake":
        this.flash({ behavior: "idle", pose: "sit", bubble: "none", expression: "sleepy" }, 2200, null, () => this.run(this.planFor("idle")));
        break;
    }
  }

  /** Commands from the pet panel. */
  command(b: Behavior) {
    this.run(this.planFor(b));
  }

  // ───────────────────────────────────────────────────────── internals

  private flash(p: Partial<ResidentView>, ms: number, after: Partial<ResidentView> | null, then?: () => void) {
    this.stopWalking();
    if (this.timer) clearTimeout(this.timer);
    this.setView(p);
    this.timer = setTimeout(() => {
      if (after) this.setView(after);
      else this.setView({ bubble: "none" });
      if (then) then();
      else this.schedule(rand(1500, 3000));
    }, ms);
  }

  private schedule(ms: number) {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(this.choose()), ms);
  }

  private choose(): Plan {
    const { phase, energy, weather } = this.ctx;
    if (phase === "night" || energy < 18) return this.planFor("sleep");
    const stormy = weather === "rain" || weather === "thunderstorm" || weather === "snow";
    const sleepyEvening = phase === "evening" ? 1.6 : 1;
    const b = pick<Behavior>([
      ["idle", 3],
      ["wander", 3],
      ["sit", 2 * sleepyEvening],
      ["play", phase === "afternoon" && energy > 40 ? 2 : 0.6],
      ["look-window", stormy ? 3 : 1.4],
      ["inspect-plant", phase === "morning" ? 1.6 : 0.8],
      ["read-board", phase === "morning" ? 1.4 : 0.7],
      ["react-computer", 0.6],
      ["sleep", phase === "evening" && energy < 45 ? 1.5 : 0.15],
    ]);
    if (b === this.view.behavior && b !== "wander") return this.planFor("wander");
    return this.planFor(b);
  }

  private planFor(b: Behavior): Plan {
    const at = (id: SpotId, jitter = 18) => ({ x: SPOTS[id].x + rand(-jitter, jitter), y: SPOTS[id].y + rand(-jitter / 2, jitter / 2) });
    switch (b) {
      case "idle":
        return { behavior: b, pose: "stand", expression: "calm", holdMs: rand(3500, 7000), gaze: rand(-0.6, 0.6) };
      case "wander":
        return { behavior: b, to: { x: rand(FLOOR.minX + 160, FLOOR.maxX - 120), y: rand(FLOOR.minY + 30, FLOOR.maxY - 30) }, pose: "stand", expression: "calm", holdMs: rand(2000, 4500) };
      case "sit":
        return { behavior: b, to: Math.random() < 0.6 ? at("cushion", 10) : at("rug"), pose: "sit", expression: "happy", holdMs: rand(9000, 16000) };
      case "sleep":
        return { behavior: b, to: at("cushion", 6), face: 1, pose: "sleep", expression: "sleepy", bubble: "zzz", holdMs: rand(40000, 90000) };
      case "play":
        return { behavior: b, to: at("rug", 30), pose: "play", expression: "happy", holdMs: rand(5000, 8000) };
      case "look-window":
        return { behavior: b, to: at("window", 40), face: 1, pose: "look-up", expression: "curious", holdMs: rand(6000, 10000), gaze: 0 };
      case "check-mail":
        return { behavior: b, to: at("door", 8), face: -1, pose: "inspect", expression: "curious", holdMs: 4200, bubble: "none", gaze: -0.5 };
      case "react-computer":
        return { behavior: b, to: at("desk", 10), face: 1, pose: "look-up", expression: "curious", holdMs: rand(4000, 6500), gaze: 0.8 };
      case "inspect-plant":
        return { behavior: b, to: at("plant", 6), face: -1, pose: "inspect", expression: "happy", holdMs: rand(4500, 7000) };
      case "read-board":
        return { behavior: b, to: at("board", 12), face: 1, pose: "look-up", expression: "calm", holdMs: rand(4000, 6000) };
    }
  }

  private run(plan: Plan) {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    const arrive = () => {
      this.setView({
        behavior: plan.behavior,
        pose: plan.pose,
        expression: plan.expression,
        bubble: plan.bubble ?? "none",
        facing: plan.face ?? this.view.facing,
        gaze: plan.gaze ?? 0,
      });
      this.schedule(plan.holdMs);
    };
    if (plan.to) {
      const dist = Math.hypot(plan.to.x - this.view.x, plan.to.y - this.view.y);
      if (dist > 12) {
        // Stand up first if lying down — a short, natural pause instead of sliding off the cushion.
        const wasDown = this.view.pose === "sleep" || this.view.pose === "sit";
        this.setView({ behavior: plan.behavior, pose: wasDown ? "stand" : this.view.pose, bubble: "none", expression: wasDown ? "sleepy" : this.view.expression });
        this.timer = setTimeout(() => this.walkTo(plan.to!, arrive), wasDown ? 700 : 150);
        return;
      }
    }
    arrive();
  }

  private walkTo(target: { x: number; y: number }, done: () => void) {
    const t = { x: Math.min(FLOOR.maxX, Math.max(FLOOR.minX, target.x)), y: Math.min(FLOOR.maxY, Math.max(FLOOR.minY, target.y)) };
    this.walkTarget = t;
    this.onArrive = done;
    this.setView({ pose: "walk", facing: t.x >= this.view.x ? 1 : -1, expression: "calm", gaze: 0 });
    if (this.ctx.reducedMotion) {
      // Reduced motion: a soft fade between spots instead of a walk cycle (still not an instant teleport).
      this.view = { ...this.view, x: t.x, y: t.y };
      this.onMove(this.view);
      this.finishWalk();
      return;
    }
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.step);
  }

  private step = (ts: number) => {
    if (this.disposed || !this.walkTarget) return;
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    const dx = this.walkTarget.x - this.view.x;
    const dy = this.walkTarget.y - this.view.y;
    const d = Math.hypot(dx, dy);
    const stepLen = SPEED * dt * (d < 40 ? 0.6 + (d / 40) * 0.4 : 1); // ease into the stop
    if (d <= stepLen || d < 1) {
      this.view = { ...this.view, x: this.walkTarget.x, y: this.walkTarget.y };
      this.onMove(this.view);
      this.finishWalk();
      return;
    }
    this.view = { ...this.view, x: this.view.x + (dx / d) * stepLen, y: this.view.y + (dy / d) * stepLen };
    this.onMove(this.view);
    this.raf = requestAnimationFrame(this.step);
  };

  private finishWalk() {
    this.walkTarget = null;
    const cb = this.onArrive;
    this.onArrive = null;
    this.setView({ pose: "stand" });
    // Natural pause on arrival before the next action.
    this.timer = setTimeout(() => cb?.(), 250);
  }

  private stopWalking() {
    cancelAnimationFrame(this.raf);
    if (this.walkTarget) {
      this.walkTarget = null;
      this.onArrive = null;
    }
  }

  private setView(p: Partial<ResidentView>) {
    this.view = { ...this.view, ...p };
    this.onPose(this.view);
  }
}
