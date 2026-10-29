import * as THREE from 'three';
import type { Calibration } from '../data/schema';
import { toMeters } from '../core/units';

// ---------------------------------------------------------------------------
// Projector perspective. PHYSICAL room measurements (calibration) define where
// the projected image sits relative to the athlete's eye; VIRTUAL football
// alignment (defender spot, depth, eye height) defines where the eye is on the
// field. Calibrated View = off-axis frustum through the physical screen.
// ---------------------------------------------------------------------------

export interface PhysicalScreen {
  /** meters, relative to the athlete's eye (x right, y up), at distance d */
  left: number;
  right: number;
  bottom: number;
  top: number;
  distance: number;
  /** physical image aspect */
  aspect: number;
  /** display pixels */
  resW: number;
  resH: number;
  eyeHeight: number;
}

export function physicalScreen(c: Calibration): PhysicalScreen {
  const m = (v: number) => toMeters(v, c.unit);
  const W = m(c.imageWidth);
  const H = m(c.imageHeight);
  const B = m(c.bottomEdge);
  const D = m(c.distance);
  const E = m(c.eyeHeight);
  const O = m(c.offsetX);
  return {
    left: -W / 2 - O,
    right: W / 2 - O,
    bottom: B - E,
    top: B + H - E,
    distance: D,
    aspect: W / H,
    resW: c.resolutionW,
    resH: c.resolutionH,
    eyeHeight: E,
  };
}

/** Field of view (degrees) subtended by the physical screen. */
export function screenFov(s: PhysicalScreen) {
  const h = (Math.atan(s.right / s.distance) - Math.atan(s.left / s.distance)) * (180 / Math.PI);
  const v = (Math.atan(s.top / s.distance) - Math.atan(s.bottom / s.distance)) * (180 / Math.PI);
  return { h, v };
}

/** Apply an off-axis projection: the frustum passes exactly through the screen edges. */
export function applyOffAxis(cam: THREE.PerspectiveCamera, s: PhysicalScreen, near = 0.05, far = 900) {
  const k = near / s.distance;
  cam.near = near;
  cam.far = far;
  cam.projectionMatrix.makePerspective(s.left * k, s.right * k, s.top * k, s.bottom * k, near, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

/** Symmetric wide projection with a horizontal FOV (degrees). */
export function applyWide(cam: THREE.PerspectiveCamera, hFovDeg: number, aspect: number, near = 0.05, far = 900) {
  const hf = (hFovDeg * Math.PI) / 180;
  const vf = 2 * Math.atan(Math.tan(hf / 2) / aspect);
  cam.fov = (vf * 180) / Math.PI;
  cam.aspect = aspect;
  cam.near = near;
  cam.far = far;
  cam.updateProjectionMatrix();
}

/**
 * How large objects appear in Wide view relative to true life size in the
 * Calibrated view (same screen, same standing spot), near the image center.
 */
export function wideScaleFactor(s: PhysicalScreen, hFovDeg: number): number {
  const screenW = s.right - s.left;
  const focalCal = s.distance / screenW; // focal length in "screen widths"
  const focalWide = 0.5 / Math.tan((hFovDeg * Math.PI) / 360);
  return focalWide / focalCal;
}

/** Largest viewport with the given aspect, centered in a canvas (letterbox). */
export function letterbox(cw: number, ch: number, aspect: number) {
  let w = cw;
  let h = cw / aspect;
  if (h > ch) {
    h = ch;
    w = ch * aspect;
  }
  return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w: Math.round(w), h: Math.round(h) };
}

export const DEFAULT_CALIBRATION: Calibration = {
  id: 'default',
  name: 'Example room (edit me)',
  unit: 'in',
  imageWidth: 144, // 12 ft wide image
  imageHeight: 81, // 16:9
  bottomEdge: 18,
  distance: 120, // 10 ft from the wall
  eyeHeight: 68,
  offsetX: 0,
  resolutionW: 1920,
  resolutionH: 1080,
};

export interface CalibrationCheck {
  level: 'ok' | 'warn';
  message: string;
}

export function checkCalibration(c: Calibration): CalibrationCheck[] {
  const s = physicalScreen(c);
  const out: CalibrationCheck[] = [];
  const pxAspect = c.resolutionW / c.resolutionH;
  const mismatch = Math.abs(pxAspect - s.aspect) / pxAspect;
  if (mismatch > 0.03)
    out.push({
      level: 'warn',
      message: `Measured image aspect ${s.aspect.toFixed(2)} differs from the resolution aspect ${pxAspect.toFixed(2)} by ${(mismatch * 100).toFixed(0)}%. Re-measure, or check projector scaling/keystone. FIELDVIEW uses your physical measurements.`,
    });
  const fov = screenFov(s);
  out.push({ level: 'ok', message: `The image covers ${fov.h.toFixed(0)}° × ${fov.v.toFixed(0)}° of the athlete's view.` });
  if (s.top < 0) out.push({ level: 'warn', message: 'The top of the image is below eye level — the horizon will be off-screen.' });
  if (s.bottom > 0) out.push({ level: 'warn', message: 'The bottom of the image is above eye level — the field near the athlete will be off-screen.' });
  if (s.distance < 1.2) out.push({ level: 'warn', message: 'The athlete is very close to the screen; small head movements will noticeably distort perspective.' });
  if (Math.abs(c.offsetX) > 0) out.push({ level: 'ok', message: 'Off-center standing position: the frustum is shifted (off-axis) to match.' });
  return out;
}

export const POLE_HEIGHT_M = 6 * 0.3048; // 6-ft reference pole

/**
 * Where calibration references should land on the wall (in the profile's
 * units, measured up from the floor / across from the image center). Measure
 * them on the projected image with a tape to verify the setup.
 */
export function calibrationReference(c: Calibration) {
  const s = physicalScreen(c);
  const E = s.eyeHeight;
  const D = s.distance;
  const B = E + s.bottom; // image bottom above the floor
  // place the pole far enough that its base is visible above the image bottom
  const minD = E - B > 1e-3 ? (E * D) / (E - B) : D * 1.5;
  const refDistance = Math.max(minD * 1.2, D * 1.4, 3);
  const onWall = (h: number) => E - ((E - h) * D) / refDistance;
  const unit = (m: number) => m / toMeters(1, c.unit);
  return {
    refDistance, // meters from the eye, straight ahead
    horizon: unit(E),
    poleBase: unit(onWall(0)),
    poleTop: unit(onWall(POLE_HEIGHT_M)),
    poleHeightOnWall: unit((POLE_HEIGHT_M * D) / refDistance),
    imageBottom: unit(B),
    imageTop: unit(B + (s.top - s.bottom)),
  };
}
