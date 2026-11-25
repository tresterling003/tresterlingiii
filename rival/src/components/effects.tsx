"use client";

import { useEffect, useRef } from "react";

function Snowfall() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = c.clientWidth; h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener("resize", resize);
    const flakes = Array.from({ length: Math.round(Math.min(90, w / 14)) }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2.6, s: 0.3 + Math.random() * 0.9, d: Math.random() * 6.28,
    }));
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.shadowColor = "rgba(120,140,170,.45)";
      ctx.shadowBlur = 3;
      for (const f of flakes) {
        f.y += f.s; f.d += 0.01; f.x += Math.sin(f.d) * 0.35;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-30 h-full w-full" aria-hidden />;
}

const BULBS = ["#E5484D", "#F2C14E", "#3DB46D", "#4C8FE0", "#E86FB4"];
function Lights() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-10 overflow-hidden" aria-hidden>
      <svg className="absolute inset-x-0 top-0 h-10 w-full" preserveAspectRatio="none" viewBox="0 0 100 10">
        <path d="M0 2 Q 5 7 10 2 T 20 2 T 30 2 T 40 2 T 50 2 T 60 2 T 70 2 T 80 2 T 90 2 T 100 2" fill="none" stroke="#2b3a2f" strokeWidth=".4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute inset-x-0 top-0 flex justify-around">
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className="mt-[10px] block h-4 w-2.5 rounded-b-full rounded-t-sm"
            style={{ background: BULBS[i % 5], color: BULBS[i % 5], marginTop: i % 2 ? 8 : 14, animation: `glow ${1.6 + (i % 4) * 0.4}s ease-in-out ${i * 0.17}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

function Stars() {
  const stars = Array.from({ length: 40 }, (_, i) => ({ x: (i * 37.7) % 100, y: (i * 61.3) % 100, s: 2 + (i % 3), d: (i % 7) * 0.5 }));
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-[#F2C14E]"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, boxShadow: "0 0 6px #F2C14E", animation: `twinkle ${2 + (i % 3)}s ease-in-out ${s.d}s infinite` }}
        />
      ))}
    </div>
  );
}

export function Effects({ effect }: { effect: string }) {
  if (effect === "snowfall") return <Snowfall />;
  if (effect === "lights") return <Lights />;
  if (effect === "stars") return <Stars />;
  return null;
}
