"use client";

import { useEffect, useRef, useState } from "react";
import { Gift, Heart } from "lucide-react";
import { GameFrame } from "@/components/game-frame";

const DURATION = 45;
const COLORS = ["#E5484D", "#3C7CC4", "#2E8B57", "#7D5BC0", "#E86FB4", "#D2752A"];

type Thing = { x: number; y: number; v: number; kind: "gift" | "star" | "coal"; c: string; r: number; spin: number };

function Catch({ finish }: { finish: (s: number) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ score: 0, lives: 3, left: DURATION });

  useEffect(() => {
    const c = cv.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const size = () => { W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    addEventListener("resize", size);
    let sledX = W / 2, target = W / 2, score = 0, lives = 3, last = performance.now(), spawn = 0, raf = 0, over = false, flash = 0;
    const t0 = performance.now();
    const things: Thing[] = [];
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => { if (["ArrowLeft", "ArrowRight", "a", "d"].includes(e.key)) { keys.add(e.key); e.preventDefault(); } };
    const ku = (e: KeyboardEvent) => keys.delete(e.key);
    const pm = (e: PointerEvent) => { const r = c.getBoundingClientRect(); target = e.clientX - r.left; };
    addEventListener("keydown", kd); addEventListener("keyup", ku); c.addEventListener("pointermove", pm); c.addEventListener("pointerdown", pm);

    const end = () => { if (over) return; over = true; cancelAnimationFrame(raf); setTimeout(() => finish(score), 350); };

    function drawGift(t: Thing) {
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.spin);
      if (t.kind === "coal") {
        ctx.fillStyle = "#2a2a2e"; ctx.beginPath();
        for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283, rr = t.r * (0.8 + ((i * 37) % 5) / 12); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.beginPath(); ctx.arc(-t.r * .3, -t.r * .3, t.r * .25, 0, 6.283); ctx.fill();
      } else if (t.kind === "star") {
        ctx.fillStyle = "#F2C14E"; ctx.shadowColor = "#F2C14E"; ctx.shadowBlur = 12; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283 - 1.571, rr = i % 2 ? t.r * .45 : t.r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
      } else {
        const s = t.r * 1.6;
        ctx.fillStyle = t.c; ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, 5); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(-s * .09, -s / 2, s * .18, s); ctx.fillRect(-s / 2, -s * .09, s, s * .18);
        ctx.beginPath(); ctx.ellipse(-s * .16, -s / 2 - 3, s * .16, s * .1, -.5, 0, 6.283); ctx.ellipse(s * .16, -s / 2 - 3, s * .16, s * .1, .5, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    }

    function drawSled(x: number) {
      const y = H - 46, w = Math.min(130, W * .28);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.beginPath(); ctx.ellipse(0, 34, w * .55, 7, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = "#B88A10"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-w / 2, 26); ctx.lineTo(w / 2 - 6, 26); ctx.quadraticCurveTo(w / 2 + 10, 26, w / 2 + 8, 12); ctx.stroke();
      ctx.fillStyle = "#C8323C"; ctx.beginPath(); ctx.roundRect(-w / 2, -8, w, 30, [14, 14, 8, 8]); ctx.fill();
      ctx.fillStyle = "#A3202B"; ctx.fillRect(-w / 2, 12, w, 10);
      ctx.fillStyle = "#F2C14E"; ctx.fillRect(-w / 2 + 6, 2, w - 12, 4);
      ctx.restore();
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const elapsed = (now - t0) / 1000;
      const left = Math.max(0, DURATION - Math.floor(elapsed));
      const speedUp = 1 + elapsed / 30;
      if (keys.has("ArrowLeft") || keys.has("a")) target = sledX - 600 * dt;
      if (keys.has("ArrowRight") || keys.has("d")) target = sledX + 600 * dt;
      target = Math.max(40, Math.min(W - 40, target));
      sledX += (target - sledX) * Math.min(1, dt * 14);

      spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(0.32, 0.85 - elapsed / 70);
        const roll = Math.random();
        const kind: Thing["kind"] = roll < 0.2 + elapsed / 300 ? "coal" : roll > 0.95 ? "star" : "gift";
        things.push({ x: 24 + Math.random() * (W - 48), y: -20, v: (120 + Math.random() * 90) * speedUp, kind, c: COLORS[(Math.random() * COLORS.length) | 0], r: kind === "star" ? 16 : 15, spin: (Math.random() - .5) * .4 });
      }

      const sw = Math.min(130, W * .28), sy = H - 50;
      for (let i = things.length - 1; i >= 0; i--) {
        const t = things[i];
        t.y += t.v * dt; t.spin += dt * (t.kind === "star" ? 2 : 0.6);
        if (t.y > sy - 14 && t.y < sy + 18 && Math.abs(t.x - sledX) < sw / 2 + 6) {
          things.splice(i, 1);
          if (t.kind === "coal") { lives--; flash = 1; } else score = Math.min(120, score + (t.kind === "star" ? 3 : 1));
          continue;
        }
        if (t.y > H + 30) things.splice(i, 1);
      }

      ctx.clearRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#1d3557"); sky.addColorStop(1, "#46689a");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.7)";
      for (let i = 0; i < 40; i++) { const x = (i * 97.3 + elapsed * 8 * (1 + (i % 3))) % W, y = (i * 53.7 + elapsed * 30 * (1 + (i % 4) / 3)) % H; ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3) * .6, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = "#eef4fb"; ctx.beginPath(); ctx.moveTo(0, H - 18); ctx.quadraticCurveTo(W * .25, H - 34, W * .5, H - 20); ctx.quadraticCurveTo(W * .75, H - 8, W, H - 26); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      things.forEach(drawGift);
      drawSled(sledX);
      if (flash > 0) { ctx.fillStyle = `rgba(229,72,77,${flash * .35})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 3); }

      setHud((h) => (h.score !== score || h.lives !== lives || h.left !== left ? { score, lives, left } : h));
      if (lives <= 0 || left <= 0) return end();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { over = true; cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("keydown", kd); removeEventListener("keyup", ku); };
  }, [finish]);

  return (
    <div className="overflow-hidden rounded-xl3 bg-card shadow-pop">
      <div className="flex items-center gap-4 px-5 py-3 font-semibold">
        <span className="text-2xl tabular-nums">{hud.score}</span><span className="text-muted">presents</span>
        <span className="ml-auto flex gap-1" aria-label={`${hud.lives} lives`}>{[0, 1, 2].map((i) => <Heart key={i} className={i < hud.lives ? "h-5 w-5 fill-accent text-accent" : "h-5 w-5 text-line"} />)}</span>
        <span className="w-14 text-right text-xl tabular-nums">0:{String(hud.left).padStart(2, "0")}</span>
      </div>
      <canvas ref={cv} className="block h-[62dvh] max-h-[560px] min-h-[380px] w-full touch-none select-none" aria-label="Game area. Move with your finger, mouse or arrow keys." />
    </div>
  );
}

export default function Page() {
  return (
    <GameFrame game="catch" color="teal" icon={<Gift className="h-10 w-10" />} howTo="Drag or use arrow keys to move the sleigh. Presents are 1 point, gold stars 3. Coal costs a heart. You have 45 seconds.">
      {(finish) => <Catch finish={finish} />}
    </GameFrame>
  );
}
