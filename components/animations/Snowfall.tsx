"use client";

import { useReducedMotion } from "framer-motion";
import { useMemo } from "react";

export function Snowfall() {
  const reduceMotion = useReducedMotion();
  const flakes = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 8,
        duration: 8 + Math.random() * 8,
        size: 4 + Math.random() * 6,
        opacity: 0.4 + Math.random() * 0.5,
      })),
    [],
  );

  if (reduceMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {flakes.map((flake) => (
        <span
          key={flake.id}
          className="snowflake"
          style={{
            left: `${flake.left}%`,
            width: flake.size,
            height: flake.size,
            opacity: flake.opacity,
            animationDelay: `${flake.delay}s`,
            animationDuration: `${flake.duration}s`,
          }}
        />
      ))}
      <style jsx>{`
        .snowflake {
          position: absolute;
          top: -10px;
          border-radius: 9999px;
          background: white;
          animation-name: fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes fall {
          0% {
            transform: translateY(0) translateX(0);
          }
          100% {
            transform: translateY(110vh) translateX(20px);
          }
        }
      `}</style>
    </div>
  );
}
