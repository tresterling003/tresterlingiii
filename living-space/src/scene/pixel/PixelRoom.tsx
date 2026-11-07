"use client";
import { useEffect, useRef } from "react";
import type { Task } from "@/domain/types";
import { envelopeCount } from "@/domain/mail";
import type { SceneLook } from "@/engine/clock";
import type { ResidentView } from "@/engine/character";
import { RoomShell, WallClockHands, FairyLights } from "../Room";
import { WindowSky, WindowLand, WindowFrame, CloudShape, CLOUDS, G, GLASS_RECT, WINDOW_RECT, windowLook } from "../Window";
import { FrontDoor, MailPile, FlyingEnvelope } from "../Door";
import { DailySheet, StickyNotes, SHEET, NOTES, noteSlots, type SheetModel } from "../Board";
import { Desk, DeskLamp, Computer, Phone, Chair, FloorPlant, Cushion, Ball, Badge } from "../Desk";
import { ResidentArt, RESIDENT_RECT, POSE_FRAMES } from "../Resident";
import { HOTSPOTS, type HotspotId } from "../layout";
import type { RoomTheme } from "../theme";
import { O, P } from "../palette";
import { PX, STAGE, STAGE_PX, SpriteCache, drawSprite, px, type Sprite } from "./raster";
import { clearTextCache, drawText, fit, textWidth, wrapPx, PIXEL_FONT, type TextStyle } from "./text";

export interface RoomModel {
  theme: RoomTheme;
  look: SceneLook;
  unread: number;
  tasks: Task[];
  sheet: SheetModel;
  pulses: { door: number; computer: number; phone: number; doorCount: number };
  compAwake: boolean;
  phoneLit: boolean;
  compUnseen: number;
  phoneUnseen: number;
  reduced: boolean;
  hover: HotspotId | null;
  showBall: boolean;
}

interface Props {
  model: RoomModel;
  resident: () => ResidentView | null;
  onFirstPaint?: () => void;
}

const W = STAGE_PX.w;
const H = STAGE_PX.h;

/** Draw a sprite whose art is authored around a local origin, placed at world (wx, wy). */
function drawAt(ctx: CanvasRenderingContext2D, s: Sprite | null, wx: number, wy: number) {
  if (!s) return;
  ctx.drawImage(s.img, px(s.x + Math.round(wx / PX) * PX, "x"), px(s.y + Math.round(wy / PX) * PX, "y"));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function PixelRoom({ model, resident, onFirstPaint }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const resRef = useRef(resident);
  resRef.current = resident;
  const paintedRef = useRef(onFirstPaint);
  paintedRef.current = onFirstPaint;

  useEffect(() => {
    const canvas = ref.current!;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    ctx.imageSmoothingEnabled = false;
    let dirty = true;
    const cache = new SpriteCache(() => (dirty = true));
    const tint = { r: 255, g: 255, b: 255, a: 0, init: false };
    let raf = 0;
    let last = 0;
    let painted = false;

    document.fonts?.load(`500 10px ${PIXEL_FONT}`).then(() => {
      clearTextCache();
      dirty = true;
    });

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const m = modelRef.current;
      const r = resRef.current();
      const now = Date.now();
      // Movement renders every frame; idle animation runs at a retro 12 fps; reduced motion ~2 fps.
      const moving = r?.pose === "walk" || now - m.pulses.door < 2500;
      const interval = m.reduced ? 500 : moving ? 0 : 1000 / 12;
      if (!dirty && ts - last < interval) return;
      last = ts;
      dirty = false;
      draw(ctx, cache, m, r, m.reduced ? 0 : ts / 1000, now, tint);
      if (!painted && cache.has("bg")) {
        painted = true;
        paintedRef.current?.();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="pixel-room" style={{ left: STAGE.x, top: STAGE.y, width: STAGE.w, height: STAGE.h }} aria-hidden />;
}

// ───────────────────────────────────────────────────────────────────────────────

const T = (size: number, color: string, weight: TextStyle["weight"] = 500, align: TextStyle["align"] = "left"): TextStyle => ({ size, color, weight, align });

function draw(
  ctx: CanvasRenderingContext2D,
  cache: SpriteCache,
  m: RoomModel,
  r: ResidentView | null,
  t: number,
  now: number,
  tint: { r: number; g: number; b: number; a: number; init: boolean },
) {
  const { theme, look } = m;
  const L = look.lighting;
  const S = cache.get.bind(cache);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.wallpaper;
  ctx.fillRect(0, 0, W, H);

  // ── Backdrop ──────────────────────────────────────────────────────────────
  const themeKey = JSON.stringify(theme);
  drawSprite(ctx, S("bg", themeKey, () => ({ el: <RoomShell theme={theme} />, rect: STAGE, harden: false })));
  drawSprite(ctx, S("fairy", String(Math.round(L.lamps * 4)), () => ({ el: <FairyLights glow={Math.round(L.lamps * 4) / 4} />, rect: { x: 0, y: 36, w: 1620, h: 60 } })));
  const minute = Math.floor(look.minutes);
  drawSprite(ctx, S("hands", String(minute), () => ({ el: <WallClockHands minutes={minute} />, rect: { x: 1476, y: 128, w: 68, h: 68 } })));

  // ── Window ────────────────────────────────────────────────────────────────
  const wl = windowLook(look.weather, L);
  const skyKey = [wl.skyTop, wl.skyBot, wl.night, wl.overcast, Math.round(look.minutes / 6), look.weather === "thunderstorm"].join();
  drawSprite(ctx, S("sky", skyKey, () => ({ el: <WindowSky look={wl} minutes={look.minutes} weather={look.weather} />, rect: GLASS_RECT, harden: false })));
  const gx = px(G.x, "x"), gy = px(G.y, "y"), gw = Math.round(G.w / PX), gh = Math.round(G.h / PX);
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx, gy, gw, gh);
  ctx.clip();
  CLOUDS.slice(0, wl.cloudCount).forEach((d, i) => {
    const s = S(`cloud${i}`, wl.cloudColor, () => ({ el: <CloudShape color={wl.cloudColor} s={d.s} />, rect: { x: -6, y: -6, w: 110 * d.s, h: 66 * d.s } }));
    const x = t ? G.x - 120 + (((t + d.delay) / d.dur) % 1) * (G.w + 160) : G.x + i * 80 - 20;
    drawAt(ctx, s, x, G.y + d.y);
  });
  drawSprite(ctx, S("land", [wl.landDark, wl.snowy, wl.night].join(), () => ({ el: <WindowLand look={wl} />, rect: GLASS_RECT })));
  const rainy = look.weather === "rain" || look.weather === "thunderstorm";
  if (rainy) {
    ctx.fillStyle = "#DCE8F2";
    const n = look.weather === "thunderstorm" ? 46 : 30;
    const speed = look.weather === "thunderstorm" ? 160 : 110; // px per second
    for (let i = 0; i < n; i++) {
      const y = ((i * 37) % gh + t * speed) % gh;
      const x = ((i * 61) % (gw + 12)) - 6 - Math.round((y / gh) * 6);
      ctx.fillRect(gx + x, gy + Math.round(y), 1, 4);
      ctx.fillRect(gx + x - 1, gy + Math.round(y) + 4, 1, 2);
    }
  }
  if (look.weather === "snow") {
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 34; i++) {
      const y = ((i * 29) % gh + t * 11) % gh;
      const x = (i * 23) % gw + Math.round(Math.sin(t * 0.8 + i) * 2);
      const sz = i % 3 === 0 ? 2 : 1;
      ctx.fillRect(gx + x, gy + Math.round(y), sz, sz);
    }
  }
  if (look.weather === "fog") {
    ctx.fillStyle = "rgba(238,240,242,0.55)";
    [50, 66, 82].forEach((y, i) => ctx.fillRect(gx - 20 + Math.round(Math.sin(t / 3 + i * 2) * 12), gy + y, gw + 40, 10));
  }
  if (look.weather === "thunderstorm" && t) {
    const ph = (t % 9) / 9;
    const flash = ph > 0.94 && ph < 0.95 ? 0.75 : ph > 0.965 && ph < 0.975 ? 0.5 : 0;
    if (flash) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(gx, gy, gw, gh);
      // A jagged pixel bolt.
      ctx.fillStyle = "#FFF6C8";
      let bx = gx + 70, by = gy;
      for (let k = 0; k < 9; k++) {
        ctx.fillRect(bx, by, 2, 6);
        by += 6;
        bx += k % 2 ? 3 : -2;
      }
    }
  }
  ctx.restore();
  drawSprite(ctx, S("wframe", String(rainy), () => ({ el: <WindowFrame rainy={rainy} />, rect: WINDOW_RECT })));

  // Daylight pool on the floor
  const sunPool = Math.max(0, L.daylight - look.dim) * 0.45;
  if (sunPool > 0.02) {
    const k = look.minutes / 1440;
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = L.golden > 0.5 ? `rgba(255,217,160,${sunPool})` : `rgba(255,243,214,${sunPool})`;
    ctx.beginPath();
    ctx.moveTo(px(470, "x"), px(604, "y"));
    ctx.lineTo(px(830, "x"), px(604, "y"));
    ctx.lineTo(px(980 - k * 300, "x"), px(780, "y"));
    ctx.lineTo(px(380 - k * 200, "x"), px(780, "y"));
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  // ── Board: planner sheet + sticky notes ───────────────────────────────────
  drawSprite(ctx, S("sheet", JSON.stringify(m.sheet.rows.map((x) => x.status)) + m.sheet.sample, () => ({ el: <DailySheet model={m.sheet} />, rect: { x: SHEET.x - 9, y: SHEET.y - 9, w: SHEET.w + 21, h: SHEET.h + 21 } })));
  drawSheetText(ctx, m.sheet);
  const notes = noteSlots(m.tasks);
  drawSprite(ctx, S("notes", JSON.stringify(notes.map((n) => [n.x, n.y, n.color])), () => ({ el: <StickyNotes tasks={m.tasks} />, rect: { x: NOTES.x - 6, y: NOTES.y - 12, w: NOTES.w + 18, h: NOTES.max * NOTES.gap + 12 } })));
  const noteStyle = T(11, O, 500);
  notes.forEach((n) => {
    const lines = n.text ? wrapPx(n.text, Math.floor(NOTES.w / PX) - 5, 2, noteStyle) : ["Add a", "note +"];
    lines.forEach((ln, i) => drawText(ctx, ln, px(n.x, "x") + (n.text ? 3 : Math.round(NOTES.w / PX / 2)), px(n.y, "y") + 5 + i * 11, { ...noteStyle, align: n.text ? "left" : "center" }));
  });

  // ── Door ──────────────────────────────────────────────────────────────────
  const sinceDoor = now - m.pulses.door;
  const flapOpen = m.pulses.door > 0 && sinceDoor > 80 && sinceDoor < 1300;
  drawSprite(ctx, S("door", String(flapOpen), () => ({ el: <FrontDoor flapOpen={flapOpen} />, rect: { x: 18, y: 160, w: 300, h: 510 } })));
  drawText(ctx, "MAIL", px(188, "x"), px(456, "y"), T(11, "#E9D8B8", 500, "center"));

  // ── Desk ──────────────────────────────────────────────────────────────────
  drawSprite(ctx, S("desk", "1", () => ({ el: <Desk />, rect: { x: 1150, y: 500, w: 425, h: 215 } })));
  const f12 = Math.floor(t * 12);
  for (let k = 0; k < 3 && t; k++) {
    const rise = ((t * 9 + k * 5) % 15) | 0;
    ctx.fillStyle = `rgba(255,255,255,${0.55 - rise / 30})`;
    ctx.fillRect(px(1461 + k * 5, "x") + (rise % 4 < 2 ? 0 : 1), px(506, "y") - rise, 1, 2);
  }
  const lampOn = Math.max(L.lamps, look.dim * 0.8);
  drawSprite(ctx, S("lamp", String(lampOn > 0.15), () => ({ el: <DeskLamp on={lampOn} />, rect: { x: 1488, y: 400, w: 112, h: 152 } })));
  drawSprite(ctx, S("computer", String(m.compAwake), () => ({ el: <Computer awake={m.compAwake} />, rect: { x: 1266, y: 372, w: 202, h: 174 } })));
  const sinceComp = now - m.pulses.computer;
  if (m.pulses.computer && sinceComp < 1600) {
    ctx.fillStyle = `rgba(159,227,201,${0.7 * (1 - sinceComp / 1600)})`;
    ctx.fillRect(px(1287, "x"), px(391, "y"), Math.round(160 / PX), Math.round(110 / PX));
  }
  const buzz = m.pulses.phone && now - m.pulses.phone < 1400 ? (f12 % 2 ? 1 : -1) : 0;
  drawSprite(ctx, S("phone", String(m.phoneLit), () => ({ el: <Phone lit={m.phoneLit} />, rect: { x: 1188, y: 468, w: 64, h: 82 } })), buzz, 0);
  const badge = (n: number, wx: number, wy: number, rr: number) => {
    if (n <= 0) return;
    drawAt(ctx, S(`badge${rr}`, "1", () => ({ el: <Badge r={rr} />, rect: { x: -rr - 3, y: -rr - 3, w: rr * 2 + 6, h: rr * 2 + 6 } })), wx, wy);
    drawText(ctx, n > 9 ? "9+" : String(n), px(wx, "x") + 1, px(wy, "y") - 5, T(11, P.paper, 600, "center"));
  };
  badge(m.compUnseen, 1458, 384, 19);
  badge(m.phoneUnseen, 1245, 474, 19);

  // ── Floor, depth-sorted with the resident ─────────────────────────────────
  const floor: { z: number; draw: () => void }[] = [];
  floor.push({ z: 640, draw: () => drawSprite(ctx, S("pile", String(envelopeCount(m.unread)), () => ({ el: <MailPile unread={m.unread} />, rect: { x: 60, y: 600, w: 330, h: 120 } }))) });
  if (m.pulses.door && sinceDoor < 2600) {
    floor.push({
      z: 641,
      draw: () => {
        const n = Math.min(3, Math.max(1, m.pulses.doorCount));
        for (let i = 0; i < n; i++) {
          const k = (sinceDoor - i * 260) / 1500;
          if (k < 0 || k > 1) continue;
          // Keyframes: through the slot → arc to the pile → settle.
          const kf = [[0, 0, -6], [0.12, 0, 4], [0.55, 28, 210], [0.7, 40, 236], [1, 42, 236]];
          let j = 0;
          while (j < kf.length - 2 && kf[j + 1][0] <= k) j++;
          const a = kf[j], b = kf[j + 1];
          const u = (k - a[0]) / (b[0] - a[0]);
          const ease = u * u;
          const lying = k > 0.55;
          ctx.globalAlpha = k < 0.12 ? k / 0.12 : k > 0.8 ? (1 - k) / 0.2 : 1;
          drawAt(ctx, S(`env${lying}`, "1", () => ({ el: <FlyingEnvelope lying={lying} />, rect: { x: -27, y: -27, w: 54, h: 54 } })), 188 + lerp(a[1], b[1], ease), 440 + lerp(a[2], b[2], ease));
          ctx.globalAlpha = 1;
        }
      },
    });
  }
  floor.push({ z: 742, draw: () => drawSprite(ctx, S("plant", "1", () => ({ el: <FloorPlant />, rect: { x: 360, y: 528, w: 192, h: 228 } }))) });
  floor.push({ z: 780, draw: () => drawSprite(ctx, S("cushion", theme.cushion, () => ({ el: <Cushion color={theme.cushion} />, rect: { x: 798, y: 774, w: 204, h: 72 } }))) });
  floor.push({ z: 822, draw: () => drawSprite(ctx, S("chair", "1", () => ({ el: <Chair />, rect: { x: 1255, y: 630, w: 150, h: 208 } }))) });
  if (m.showBall && r?.pose !== "play") floor.push({ z: 845, draw: () => drawSprite(ctx, S("ball", "1", () => ({ el: <Ball x={600} y={840} />, rect: { x: 579, y: 819, w: 42, h: 48 } }))) });
  if (r) {
    floor.push({
      z: r.y,
      draw: () => {
        const frames = POSE_FRAMES[r.pose];
        const f = t ? Math.floor(t * 8) % frames : 0;
        const frame = { pose: r.pose, expression: r.expression, bubble: r.bubble, facing: r.facing, gaze: Math.max(-1, Math.min(1, Math.round(r.gaze))), f, blink: t > 0 && t % 5.2 > 5.02 };
        const colors = [theme.residentBody, theme.residentBelly, theme.residentSprout];
        drawAt(ctx, S("pip", JSON.stringify(frame) + colors.join(), () => ({ el: <ResidentArt frame={frame} body={colors[0]} belly={colors[1]} sprout={colors[2]} />, rect: RESIDENT_RECT })), r.x, r.y);
      },
    });
  }
  floor.sort((a, b) => a.z - b.z).forEach((d) => d.draw());

  // ── Light ─────────────────────────────────────────────────────────────────
  const target = { r: L.tint[0], g: L.tint[1], b: L.tint[2], a: Math.min(0.62, L.tint[3] + look.dim * 0.35) };
  const s = tint.init ? 0.08 : 1;
  tint.r = lerp(tint.r, target.r, s);
  tint.g = lerp(tint.g, target.g, s);
  tint.b = lerp(tint.b, target.b, s);
  tint.a = lerp(tint.a, target.a, s);
  tint.init = true;
  if (tint.a > 0.005) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgba(${tint.r | 0},${tint.g | 0},${tint.b | 0},${tint.a})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "screen";
  // Posterised glows: three flat rings instead of a smooth gradient.
  const glow = (wx: number, wy: number, rx: number, ry: number, rgb: string, a: number) => {
    if (a < 0.01) return;
    for (const k of [1, 0.66, 0.36]) {
      ctx.fillStyle = `rgba(${rgb},${a * 0.34})`;
      ctx.beginPath();
      ctx.ellipse(px(wx, "x"), px(wy, "y"), (rx * k) / PX, (ry * k) / PX, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  glow(1545, 520, 140, 105, "255,190,105", lampOn * 0.7);
  glow(190, 250, 90, 70, "255,210,130", lampOn * 0.45);
  glow(1367, 450, 130, 100, "150,230,200", m.compAwake ? 0.45 : 0.03 + lampOn * 0.06);
  if (L.lamps > 0.05) {
    for (let i = 0; i < 23; i++) {
      const x = 20 + i * 70;
      const y = 56 + Math.sin((i / 22) * Math.PI * 6) * 6 + 10 * Math.sin(((i % 6) / 5) * Math.PI) + 4;
      const pulse = t ? 0.75 + 0.25 * Math.sin(t * 1.3 + i) : 1;
      glow(x, y, 22, 22, ["255,200,90", "240,120,90", "255,225,140", "160,230,200"][i % 4], L.lamps * 0.55 * pulse);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  if (sunPool > 0.15 && t) {
    ctx.fillStyle = "rgba(255,244,214,0.8)";
    for (let i = 0; i < 10; i++) {
      const ph = ((t + i * 1.7) / (14 + (i % 4) * 3)) % 1;
      ctx.fillRect(px(480 + ((i * 53) % 380) + ph * 60, "x"), px(420 + ((i * 71) % 260) - ph * 90, "y"), 1, 1);
    }
  }

  // ── Selection brackets (hover / keyboard focus), drawn unlit like UI ──────
  if (m.hover) {
    const h = HOTSPOTS[m.hover];
    const o = t && Math.floor(t * 3) % 2 ? 1 : 0;
    const x0 = px(h.x, "x") - o, y0 = px(h.y, "y") - o, x1 = px(h.x + h.w, "x") + o, y1 = px(h.y + h.h, "y") + o;
    const arm = 6;
    // Chunky corner brackets: a dark 3px L with a light 1px core.
    const corner = (cx: number, cy: number, sx: number, sy: number, w: number, d: number) => {
      ctx.fillRect(sx > 0 ? cx - d : cx - arm + 1 - d, cy - d, arm + 2 * d, w);
      ctx.fillRect(cx - d, sy > 0 ? cy - d : cy - arm + 1 - d, w, arm + 2 * d);
    };
    for (const [color, w, d] of [[O, 3, 1], [P.paper, 1, 0]] as const) {
      ctx.fillStyle = color;
      corner(x0, y0, 1, 1, w, d);
      corner(x1, y0, -1, 1, w, d);
      corner(x0, y1, 1, -1, w, d);
      corner(x1, y1, -1, -1, w, d);
    }
  }
}

function drawSheetText(ctx: CanvasRenderingContext2D, m: SheetModel) {
  const x0 = px(SHEET.x, "x");
  const cx = px(SHEET.x + SHEET.w / 2, "x");
  const y0 = px(SHEET.y, "y");
  const wPx = Math.round(SHEET.w / PX);
  const head = T(11, P.paper, 700, "center");
  drawText(ctx, "TODAY", cx, y0 + 3, head);
  const sub = T(11, P.paper, 500, "center");
  drawText(ctx, fit(`${m.weekday.charAt(0)}${m.weekday.slice(1).toLowerCase()}, ${m.date}`, wPx - 6, sub), cx, y0 + 15, sub);
  const rowStyle = T(11, O, 500);
  const timeStyle = T(11, O, 600);
  const firstY = px(SHEET.firstRow, "y");
  if (m.message) drawText(ctx, m.message, cx, firstY + 18, { ...rowStyle, align: "center", color: "#7A6352" });
  if (m.empty) drawText(ctx, "No plans today", cx, firstY + 18, { ...rowStyle, align: "center" });
  const timeW = Math.max(24, ...m.rows.map((r) => textWidth(r.time, timeStyle))) + 5;
  m.rows.forEach((r, i) => {
    const y = firstY + i * Math.round(SHEET.row / PX) + 2;
    const color = r.status === "past" ? "#A08E7E" : O;
    drawText(ctx, r.time, x0 + 4, y, { ...timeStyle, color });
    const ts = { ...rowStyle, color };
    drawText(ctx, fit(r.title, wPx - timeW - 8, ts), x0 + 4 + timeW, y, ts);
  });
  const footY = px(SHEET.y + SHEET.h, "y") - 12;
  if (m.more > 0) drawText(ctx, `+${m.more} more`, x0 + 4, footY, T(11, P.tomato, 600));
  if (m.sample) drawText(ctx, "SAMPLE", px(SHEET.x + SHEET.w - 67, "x"), footY, T(11, P.tomato, 600, "center"));
}
