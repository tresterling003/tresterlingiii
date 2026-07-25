"use client";

import { useReducedMotion } from "framer-motion";
import { useMemo } from "react";

const COLORS = ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];

export function Confetti({ burst = false }: { burst?: boolean }) {
  const reduceMotion = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: burst ? 60 : 30 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: burst ? Math.random() * 0.4 : Math.random() * 6,
        duration: burst ? 1.2 + Math.random() * 0.8 : 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 360,
      })),
    [burst],
  );

  if (reduceMotion) return null;

  return (
    <div
      className={`pointer-events-none fixed inset-0 overflow-hidden ${burst ? "z-50" : "z-0"}`}
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
      <style jsx>{`
        .confetti-piece {
          position: absolute;
          top: -10px;
          width: 8px;
          height: 14px;
          animation-name: confetti-fall;
          animation-timing-function: ease-in;
          animation-iteration-count: ${burst ? 1 : "infinite"};
        }
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(360deg);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
