"use client";

import { useReducedMotion } from "framer-motion";
import { useMemo } from "react";

export function PawPrints() {
  const reduceMotion = useReducedMotion();
  const prints = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: 5 + Math.random() * 90,
        delay: Math.random() * 10,
        duration: 10 + Math.random() * 10,
        size: 18 + Math.random() * 16,
      })),
    [],
  );

  if (reduceMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-30">
      {prints.map((p) => (
        <span
          key={p.id}
          className="paw"
          style={{
            left: `${p.left}%`,
            fontSize: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          🐾
        </span>
      ))}
      <style jsx>{`
        .paw {
          position: absolute;
          top: -40px;
          animation-name: paw-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes paw-fall {
          0% {
            transform: translateY(0) rotate(-10deg);
          }
          100% {
            transform: translateY(110vh) rotate(10deg);
          }
        }
      `}</style>
    </div>
  );
}
