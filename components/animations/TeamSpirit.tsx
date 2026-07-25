"use client";

import { useReducedMotion } from "framer-motion";

export function TeamSpirit() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="pulse-ring pulse-ring-1" />
      <div className="pulse-ring pulse-ring-2" />
      <style jsx>{`
        .pulse-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 40vmax;
          height: 40vmax;
          border-radius: 9999px;
          border: 2px solid var(--color-accent);
          opacity: 0.25;
          animation-name: pulse-out;
          animation-timing-function: ease-out;
          animation-iteration-count: infinite;
          transform: translate(-50%, -50%) scale(0.6);
        }
        .pulse-ring-1 {
          animation-duration: 6s;
        }
        .pulse-ring-2 {
          animation-duration: 6s;
          animation-delay: 3s;
        }
        @keyframes pulse-out {
          0% {
            transform: translate(-50%, -50%) scale(0.6);
            opacity: 0.3;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.3);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
