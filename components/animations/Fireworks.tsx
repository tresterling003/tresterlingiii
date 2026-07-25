"use client";

import { useReducedMotion } from "framer-motion";
import { useMemo } from "react";

const COLORS = ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#eab308"];

export function Fireworks() {
  const reduceMotion = useReducedMotion();
  const bursts = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: i,
        left: 10 + Math.random() * 80,
        top: 10 + Math.random() * 50,
        delay: Math.random() * 6,
        color: COLORS[i % COLORS.length],
      })),
    [],
  );

  if (reduceMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {bursts.map((b) => (
        <span
          key={b.id}
          className="burst"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            animationDelay: `${b.delay}s`,
            background: b.color,
            color: b.color,
          }}
        />
      ))}
      <style jsx>{`
        .burst {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          animation-name: firework-pop;
          animation-duration: 3s;
          animation-iteration-count: infinite;
          animation-timing-function: ease-out;
        }
        @keyframes firework-pop {
          0% {
            box-shadow: 0 0 0 0 currentColor;
            opacity: 1;
            transform: scale(1);
          }
          70% {
            opacity: 0.6;
          }
          100% {
            box-shadow: 0 0 0 60px transparent;
            opacity: 0;
            transform: scale(1.4);
          }
        }
      `}</style>
    </div>
  );
}
