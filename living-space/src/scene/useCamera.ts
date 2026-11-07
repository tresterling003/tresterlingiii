"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { WORLD } from "./layout";

export interface Camera {
  scale: number;
  x: number; // world x at viewport centre
  y: number;
  vw: number;
  vh: number;
  panX: boolean;
}

/**
 * Responsive camera. Desktop/landscape: the whole room fits ("contain"), with the
 * wall/floor bleed filling any spare space edge-to-edge. Portrait phones: the room is
 * shown at a readable scale and the camera pans horizontally between areas.
 */
export function computeCamera(vw: number, vh: number): Omit<Camera, "x" | "y"> {
  const contain = Math.min(vw / WORLD.w, vh / WORLD.h);
  const portrait = vw / vh < 1;
  const readable = portrait ? (vh / WORLD.h) * 0.74 : contain;
  const scale = Math.max(contain, readable);
  return { scale, vw, vh, panX: WORLD.w * scale > vw + 1 };
}

export function clampX(x: number, cam: Omit<Camera, "x" | "y">) {
  const half = cam.vw / 2 / cam.scale;
  if (!cam.panX) return WORLD.w / 2;
  return Math.min(WORLD.w - half + 40, Math.max(half - 40, x));
}

export function useCamera() {
  const [cam, setCam] = useState<Camera>({ scale: 1, x: WORLD.w / 2, y: WORLD.h / 2, vw: 1600, vh: 900, panX: false });
  const camRef = useRef(cam);
  camRef.current = cam;

  useEffect(() => {
    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const base = computeCamera(vw, vh);
      setCam((c) => ({ ...base, x: clampX(c.vw === 1600 && c.x === WORLD.w / 2 && base.panX ? 800 : c.x, base), y: WORLD.h / 2 }));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  const panTo = useCallback((x: number) => setCam((c) => ({ ...c, x: clampX(x, c) })), []);
  const panBy = useCallback((dxScreen: number) => setCam((c) => ({ ...c, x: clampX(c.x - dxScreen / c.scale, c) })), []);
  return { cam, camRef, panTo, panBy };
}
