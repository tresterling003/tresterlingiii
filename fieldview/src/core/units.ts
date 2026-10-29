// Unit conversion. Virtual football data is stored in YARDS. Physical room
// measurements are stored in the unit the coach entered and converted to METERS
// for all projection math. Rendering (Three.js world space) is in METERS.

export const YARD_M = 0.9144;
export const FOOT_M = 0.3048;
export const INCH_M = 0.0254;
export const CM_M = 0.01;

export type LengthUnit = 'in' | 'ft' | 'cm' | 'm';

export function toMeters(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'in':
      return value * INCH_M;
    case 'ft':
      return value * FOOT_M;
    case 'cm':
      return value * CM_M;
    case 'm':
      return value;
  }
}

export function fromMeters(value: number, unit: LengthUnit): number {
  return value / toMeters(1, unit);
}

export const yd = (v: number) => v * YARD_M;

/**
 * Field coordinates (yards) → world (meters).
 * Field coords: x = lateral (+ = the defense's right as it faces the offense),
 * y = yards from the line of scrimmage toward the OFFENSE's backfield
 * (offense y > 0, defense y < 0). The ball is at x = 0, y = 0.
 * World: X = x, Z = -y (the defensive camera looks toward −Z), Y = up.
 */
export function fieldToWorld(x: number, y: number): { X: number; Z: number } {
  return { X: x * YARD_M, Z: -y * YARD_M };
}

/** Facing in degrees (0 = toward the defense, 90 = toward the defense's right / +x). */
export function facingToVec(deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  return { x: Math.sin(r), y: -Math.cos(r) };
}

export function vecToFacing(x: number, y: number): number {
  return (Math.atan2(x, -y) * 180) / Math.PI;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Shortest signed angle difference in radians. */
export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
