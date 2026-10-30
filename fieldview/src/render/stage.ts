import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DefenderSpec, Drill } from '../data/schema';
import { YARD_M, clamp } from '../core/units';
import { compileTimeline, compileDefenseTracks, type PlayerTrack, type Timeline } from '../sim/timeline';
import { createPose, solvePose, type Pose, type PoseContext, type RootTransform } from '../anim/pose';
import { offensePoseContext, defensePoseContext } from '../anim/contexts';
import { hashString } from '../sim/rng';
import { FieldView } from './field';
import { fieldCenterX } from '../data/field';
import { PlayerCrowd, makeNumberAtlas } from './playerCrowd';
import { ProceduralPlayer, makeBall, makeUniformMaterials, disposeUniformMaterials, type PlayerVisual, type UniformMaterials } from './playerModel';
import { applyOffAxis, applyWide, calibrationReference, letterbox, physicalScreen } from './camera';
import { CalibrationScene } from './calibrationScene';
import type { SharedState, ViewSettings } from '../core/state';
import { POSITION_EYE_HEIGHT } from '../core/state';
import { getGlbFactory } from './glbPlayer';

export interface Offscreen {
  id: string;
  label: string;
  ndcX: number;
  ndcY: number;
}

interface Actor {
  track: PlayerTrack;
  ctx: PoseContext;
  visual: PlayerVisual;
  pose: Pose;
  root: RootTransform;
  label?: THREE.Sprite;
}

export interface StageStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 900);
  timeline: Timeline | null = null;
  drill: Drill | null = null;
  offscreen: Offscreen[] = [];
  stats: StageStats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 };
  /** viewport (CSS px) actually used for the 3D view (letterboxed in calibrated mode) */
  viewport = { x: 0, y: 0, w: 1, h: 1 };

  private field: FieldView | null = null;
  private fieldKey = '';
  private actors: Actor[] = [];
  private defenseActors: Actor[] = [];
  private actorsKey = '';
  private crowds: PlayerCrowd[] = [];
  private atlases: { material: THREE.Material; texture: THREE.Texture }[] = [];
  private matsO: UniformMaterials | null = null;
  private matsD: UniformMaterials | null = null;
  private ball = makeBall();
  private sky = makeSky();
  private sun: THREE.DirectionalLight;
  private overlayGroup = new THREE.Group();
  private overlayKey = '';
  private losLine: THREE.Mesh;
  private tlKey = '';
  private state: SharedState | null = null;
  private lastFrame = 0;
  private frameTimes: number[] = [];
  private calib: CalibrationScene | null = null;
  lastT = 0;
  private _v = new THREE.Vector3();
  private _v2 = new THREE.Vector3();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setScissorTest(true);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.scene.background = new THREE.Color('#9fbbdc');
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#b9cbe0', 120, 420);
    const hemi = new THREE.HemisphereLight('#dfeaff', '#3d5a2f', 1.1);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    this.sun.position.set(-30, 55, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 10;
    sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(hemi, this.sun, this.sun.target, this.ball, this.overlayGroup);

    this.losLine = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.12),
      new THREE.MeshBasicMaterial({ color: '#2f7bff', transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.losLine.rotation.x = -Math.PI / 2;
    this.losLine.position.y = 0.012;
    this.scene.add(this.losLine);
  }

  /** Apply the shared state; rebuilds only what changed. */
  setState(s: SharedState) {
    this.state = s;
    const tlKey = `${hashString(JSON.stringify(s.drill))}|${s.seed}|${s.huddle}`;
    if (tlKey !== this.tlKey) {
      this.tlKey = tlKey;
      this.drill = s.drill;
      this.timeline = compileTimeline(s.drill, s.seed, { huddleBreak: s.huddle });
    }
    const fieldKey = `${s.drill.ball.yardLine}|${s.drill.ball.hash}|${s.quality.detail}`;
    if (fieldKey !== this.fieldKey) {
      this.fieldKey = fieldKey;
      if (this.field) {
        this.scene.remove(this.field.group);
        this.field.dispose();
      }
      this.field = new FieldView(s.drill.ball.yardLine, s.drill.ball.hash, { quality: s.quality.detail });
      this.scene.add(this.field.group);
      const cx = fieldCenterX(s.drill.ball.hash) * YARD_M;
      this.losLine.scale.x = 53.33 * YARD_M + 20;
      this.losLine.position.x = cx;
    }
    const actorsKey = `${tlKey}|${JSON.stringify(s.team)}|${s.quality.shadows}|${s.drill.defense.defenders.map((d) => d.id + d.x + d.depth + d.stance).join()}|${s.view.defenderId ?? s.drill.defense.athleteId}|${getGlbFactory() ? 'glb' : 'proc'}`;
    if (actorsKey !== this.actorsKey) {
      this.actorsKey = actorsKey;
      this.rebuildActors(s);
    }
    this.renderer.shadowMap.enabled = s.quality.shadows;
    this.sun.castShadow = s.quality.shadows;
    this.renderer.setPixelRatio(clamp(s.quality.pixelRatio, 0.5, 2));
    const ovKey = `${tlKey}|${s.overlays.paths}|${s.overlays.labels}|${s.evaluation}`;
    if (ovKey !== this.overlayKey) {
      this.overlayKey = ovKey;
      this.rebuildOverlays(s);
    }
    this.losLine.visible = s.overlays.los && !s.evaluation;
    for (const a of this.defenseActors) a.visual.object.visible = s.overlays.showDefense;
    if (this.crowds[1]) this.crowds[1].group.visible = s.overlays.showDefense;
  }

  private rebuildActors(s: SharedState) {
    for (const a of [...this.actors, ...this.defenseActors]) {
      this.scene.remove(a.visual.object);
      a.visual.dispose();
      if (a.label) this.overlayGroup.remove(a.label);
    }
    for (const c of this.crowds) {
      this.scene.remove(c.group);
      c.dispose();
    }
    this.crowds = [];
    for (const a of this.atlases) {
      a.material.dispose();
      a.texture.dispose();
    }
    this.atlases = [];
    if (this.matsO) disposeUniformMaterials(this.matsO);
    if (this.matsD) disposeUniformMaterials(this.matsD);
    this.matsO = makeUniformMaterials(s.team.offense);
    this.matsD = makeUniformMaterials(s.team.defense);
    const tl = this.timeline!;
    const glb = getGlbFactory();
    this.actors = tl.tracks.map((track) => {
      const spec = track.spec;
      const ctx = offensePoseContext(spec, s.drill);
      const seed = hashString(spec.id + spec.number);
      const visual: PlayerVisual = glb
        ? glb(this.matsO!, spec.number, ctx.build, seed)
        : new ProceduralPlayer(this.matsO!, spec.number, ctx.build, seed, { shadows: s.quality.shadows });
      if (glb) this.scene.add(visual.object);
      return { track, visual, pose: createPose(), root: { X: 0, Z: 0, yaw: 0 }, ctx };
    });
    const athleteId = s.view.defenderId ?? s.drill.defense.athleteId;
    const dTracks = compileDefenseTracks(s.drill, tl);
    this.defenseActors = dTracks
      .filter((t) => t.spec.id !== athleteId)
      .map((track) => {
        const d = s.drill.defense.defenders.find((x) => x.id === track.spec.id)!;
        const ctx = defensePoseContext(d);
        const seed = hashString('D' + d.id);
        const number = defNumber(d, seed);
        const visual: PlayerVisual = glb
          ? glb(this.matsD!, number, ctx.build, seed)
          : new ProceduralPlayer(this.matsD!, number, ctx.build, seed, { shadows: s.quality.shadows });
        if (glb) this.scene.add(visual.object);
        return { track, visual, pose: createPose(), root: { X: 0, Z: 0, yaw: 0 }, ctx };
      });
    if (!glb) {
      // Procedural athletes: draw each body part of a whole team in one call.
      const mk = (actors: Actor[], mats: UniformMaterials) => {
        const atlas = makeNumberAtlas(mats.uniform.numbers, numberOutline(mats.uniform.jersey, mats.uniform.numbers));
        this.atlases.push(atlas);
        const crowd = new PlayerCrowd(actors.map((a) => a.visual as ProceduralPlayer), atlas, s.quality.shadows);
        this.scene.add(crowd.group);
        this.crowds.push(crowd);
        return crowd;
      };
      mk(this.actors, this.matsO!);
      if (this.defenseActors.length) mk(this.defenseActors, this.matsD!);
    }
  }

  private rebuildOverlays(s: SharedState) {
    for (const c of [...this.overlayGroup.children]) {
      this.overlayGroup.remove(c);
      disposeDeep(c);
    }
    for (const a of this.actors) a.label = undefined;
    if (s.evaluation) return;
    const tl = this.timeline!;
    if (s.overlays.paths) {
      for (const tr of tl.tracks) {
        for (const seg of tr.segments) {
          if (seg.kind === 'align' || seg.kind === 'postsnap') continue;
          const color = seg.kind === 'shift' ? '#36d6ff' : '#ffd23f';
          this.overlayGroup.add(ribbon(seg.curve, color));
        }
      }
    }
    if (s.overlays.labels) {
      for (const a of this.actors) {
        const sp = labelSprite(a.track.spec.label);
        a.label = sp;
        this.overlayGroup.add(sp);
      }
    }
  }

  /** Render the scene at simulation time t. */
  render(t: number) {
    const s = this.state;
    const tl = this.timeline;
    if (!s || !tl) return;
    if (s.scene === 'calibration') return this.renderCalibration(s);
    const now = performance.now();
    if (this.lastFrame) {
      const dt = now - this.lastFrame;
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 90) this.frameTimes.shift();
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.stats.frameMs = avg;
      this.stats.fps = 1000 / avg;
    }
    this.lastFrame = now;

    const tt = clamp(t, 0, tl.duration);
    this.lastT = tt;
    for (const a of this.actors) {
      solvePose(tl, a.track, tt, a.ctx, a.pose, a.root);
      a.visual.applyPose(a.pose, a.root);
      if (a.label) a.label.position.set(a.root.X, 2.35 * a.ctx.build.height, a.root.Z);
    }
    if (s.overlays.showDefense) {
      for (const a of this.defenseActors) {
        solvePose(tl, a.track, tt, a.ctx, a.pose, a.root);
        a.visual.applyPose(a.pose, a.root);
      }
    }
    this.crowds[0]?.update();
    if (s.overlays.showDefense) this.crowds[1]?.update();
    this.updateBall(tt);
    this.updateCamera(s.view, s);
    this.sky.position.copy(this.camera.position);

    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    r.setScissor(0, 0, size.x, size.y);
    r.setViewport(0, 0, size.x, size.y);
    r.setClearColor('#000000');
    r.clear();
    const vp = this.viewport;
    r.setViewport(vp.x, vp.y, vp.w, vp.h);
    r.setScissor(vp.x, vp.y, vp.w, vp.h);
    r.render(this.scene, this.camera);
    this.stats.drawCalls = r.info.render.calls;
    this.stats.triangles = r.info.render.triangles;
    this.computeOffscreen();
  }

  private renderCalibration(s: SharedState) {
    if (!this.calib) this.calib = new CalibrationScene();
    const screen = physicalScreen(s.calibration);
    const ref = calibrationReference(s.calibration);
    this.calib.update(screen.eyeHeight, ref.refDistance);
    this.camera.position.set(0, screen.eyeHeight, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.updateMatrixWorld();
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    this.viewport = letterbox(size.x, size.y, screen.aspect);
    applyOffAxis(this.camera, screen);
    r.setScissor(0, 0, size.x, size.y);
    r.setViewport(0, 0, size.x, size.y);
    r.setClearColor('#000000');
    r.clear();
    const vp = this.viewport;
    r.setViewport(vp.x, vp.y, vp.w, vp.h);
    r.setScissor(vp.x, vp.y, vp.w, vp.h);
    r.render(this.calib.scene, this.camera);
    this.offscreen = [];
  }

  /** Flattened root + joint positions of every offensive player (for verification). */
  poseSnapshot(): number[] {
    const out: number[] = [];
    for (const a of this.actors) {
      const p = a.pose;
      out.push(a.root.X, a.root.Z, a.root.yaw, p.pelvis.x, p.pelvis.y, p.pelvis.z);
      for (const v of [...p.ankle, ...p.knee, ...p.wrist, p.neck]) out.push(v.x, v.y, v.z);
    }
    out.push(this.ball.position.x, this.ball.position.y, this.ball.position.z);
    return out;
  }

  /** Lowest ankle height of planted feet and offensive player count (for verification). */
  debugInfo() {
    return { actors: this.actors.length, defenders: this.defenseActors.length, lastT: this.lastT };
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
  }

  private updateCamera(v: ViewSettings, s: SharedState) {
    const drill = s.drill;
    const id = v.defenderId ?? drill.defense.athleteId;
    const d = drill.defense.defenders.find((x) => x.id === id) ?? drill.defense.defenders[0];
    const size = this.renderer.getSize(new THREE.Vector2());
    const screen = physicalScreen(s.calibration);
    const pos = (d.position ?? 'LB') as keyof typeof POSITION_EYE_HEIGHT;
    const eye = v.eyeHeight ?? (v.mode === 'calibrated' ? screen.eyeHeight : POSITION_EYE_HEIGHT[pos] ?? 1.55);
    this.camera.position.set((d.x + v.dx) * YARD_M, eye, (d.depth + v.ddepth) * YARD_M);
    const deg = Math.PI / 180;
    let pitch = v.lookPitch * deg;
    if (v.mode === 'wide' && v.lookPitch === 0) {
      // aim slightly down at the formation's center
      pitch = -Math.atan2(eye - 0.9, this.camera.position.z + 4.5);
    }
    this.camera.rotation.set(pitch, v.lookYaw * deg, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    if (v.mode === 'calibrated') {
      this.viewport = letterbox(size.x, size.y, screen.aspect);
      applyOffAxis(this.camera, screen);
    } else {
      this.viewport = { x: 0, y: 0, w: size.x, h: size.y };
      applyWide(this.camera, v.wideFov, size.x / Math.max(1, size.y));
    }
  }

  /** Horizontal FOV that fits every offensive player (with margin) from the current eye. */
  fitWideFov(t: number): number {
    if (!this.timeline) return 90;
    const cam = this.camera.position;
    let maxAng = 0;
    for (const a of this.actors) {
      const dx = a.root.X - cam.x;
      const dz = cam.z - a.root.Z;
      maxAng = Math.max(maxAng, Math.abs(Math.atan2(dx, Math.max(0.5, dz))));
    }
    void t;
    return clamp(((maxAng + 0.08) * 2 * 180) / Math.PI, 50, 150);
  }

  private computeOffscreen() {
    const out: Offscreen[] = [];
    for (const a of this.actors) {
      let inside = false;
      let sx = 0;
      let sy = 0;
      for (const y of [0.1, 1.0, 1.9]) {
        this._v.set(a.root.X, y, a.root.Z).project(this.camera);
        const behind = this._v2.set(a.root.X, y, a.root.Z).applyMatrix4(this.camera.matrixWorldInverse).z > 0;
        if (!behind && Math.abs(this._v.x) <= 1 && Math.abs(this._v.y) <= 1) inside = true;
        sx += this._v.x * (behind ? -1 : 1);
        sy += this._v.y;
      }
      if (!inside) out.push({ id: a.track.spec.id, label: a.track.spec.label, ndcX: sx / 3, ndcY: sy / 3 });
    }
    this.offscreen = out;
  }

  private updateBall(t: number) {
    const tl = this.timeline!;
    const center = this.actors.find((a) => a.track.spec.stance === 'center') ?? this.actors.find((a) => a.track.spec.role === 'OL');
    const qb = this.actors.find((a) => a.track.spec.id === tl.ball.qbId);
    const rb = this.actors.find((a) => a.track.spec.id === tl.ball.handoffTo);
    const rest = this._v;
    if (center) {
      // ball spot is fixed on the ground at the line of scrimmage
      rest.set(center.track.x[0] * YARD_M, 0.1, -0.1);
    } else rest.set(0, 0.1, 0);
    this.ball.rotation.set(0, 0, 0);
    if (t < tl.snap || !qb) {
      this.ball.position.copy(rest);
      return;
    }
    const hands = (a: Actor, out: THREE.Vector3) => {
      out.addVectors(a.pose.wrist[0], a.pose.wrist[1]).multiplyScalar(0.5);
      out.z += 0.06;
      const c = Math.cos(a.root.yaw);
      const sn = Math.sin(a.root.yaw);
      const x = out.x * c + out.z * sn;
      const z = -out.x * sn + out.z * c;
      out.set(a.root.X + x, out.y, a.root.Z + z);
      return out;
    };
    const qbHands = hands(qb, this._v2);
    const u = (t - tl.snap) / tl.ball.flight;
    if (u < 1) {
      const p = this.ball.position.lerpVectors(rest, qbHands, u);
      p.y += Math.sin(Math.PI * u) * (tl.ball.shotgun ? 0.35 : 0.05);
      this.ball.rotation.x = u * 2;
      return;
    }
    if (rb && tl.ball.handoffTime !== null && t >= tl.ball.handoffTime) {
      const k = clamp((t - tl.ball.handoffTime) / 0.18, 0, 1);
      const rbHands = hands(rb, new THREE.Vector3());
      this.ball.position.lerpVectors(qbHands, rbHands, k);
      this.ball.rotation.y = rb.root.yaw;
      return;
    }
    this.ball.position.copy(qbHands);
    this.ball.rotation.y = qb.root.yaw;
  }

  dispose() {
    for (const a of [...this.actors, ...this.defenseActors]) a.visual.dispose();
    this.field?.dispose();
    this.renderer.dispose();
  }
}

function numberOutline(jersey: string, numbers: string): string {
  const c = new THREE.Color(jersey);
  const n = new THREE.Color(numbers);
  const lum = (x: THREE.Color) => x.r * 0.3 + x.g * 0.59 + x.b * 0.11;
  if (Math.abs(lum(c) - lum(n)) > 0.4) return '#' + c.clone().multiplyScalar(0.6).getHexString();
  return lum(c) > 0.5 ? '#111111' : '#ffffff';
}

function defNumber(d: DefenderSpec, seed: number): number {
  const base: Record<string, number> = { DEL: 91, DTL: 95, DTR: 99, DER: 97, M: 54, W: 42, N: 25, CBL: 24, CBR: 21, SS: 31, FS: 6 };
  return base[d.id] ?? 10 + (seed % 80);
}

function ribbon(curve: { xs: number[]; ys: number[] }, color: string): THREE.Mesh {
  const pts: number[] = [];
  const w = 0.09;
  const n = curve.xs.length;
  for (let i = 0; i < n - 1; i++) {
    const x0 = curve.xs[i] * YARD_M;
    const z0 = -curve.ys[i] * YARD_M;
    const x1 = curve.xs[i + 1] * YARD_M;
    const z1 = -curve.ys[i + 1] * YARD_M;
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = (-(z1 - z0) / len) * w;
    const nz = ((x1 - x0) / len) * w;
    const y = 0.02;
    pts.push(x0 + nx, y, z0 + nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz, x0 + nx, y, z0 + nz, x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz);
  }
  // arrow head
  if (n >= 2) {
    const x1 = curve.xs[n - 1] * YARD_M;
    const z1 = -curve.ys[n - 1] * YARD_M;
    const x0 = curve.xs[n - 2] * YARD_M;
    const z0 = -curve.ys[n - 2] * YARD_M;
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    const s = 0.45;
    pts.push(x1 + dx * s, 0.02, z1 + dz * s, x1 + dz * s * 0.6, 0.02, z1 - dx * s * 0.6, x1 - dz * s * 0.6, 0.02, z1 + dx * s * 0.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
}

function labelSprite(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,16,28,0.78)';
  g.beginPath();
  g.roundRect(4, 4, 120, 56, 14);
  g.fill();
  g.fillStyle = '#ffd23f';
  g.font = '700 40px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(0.7, 0.35, 1);
  sp.renderOrder = 10;
  return sp;
}

function disposeDeep(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) {
      const map = (x as THREE.MeshBasicMaterial).map;
      if (map) map.dispose();
      x.dispose();
    }
  });
}

function makeSky(): THREE.Mesh {
  // Gradient dome that stays registered to the horizon in any projection.
  const g = new THREE.SphereGeometry(600, 32, 16);
  const pos = g.attributes.position;
  const cols: number[] = [];
  const top = new THREE.Color('#4f82c4');
  const mid = new THREE.Color('#a7c3e3');
  const hor = new THREE.Color('#e3ebf2');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 600;
    if (y > 0.25) c.lerpColors(mid, top, Math.min(1, (y - 0.25) / 0.75));
    else c.lerpColors(hor, mid, Math.max(0, y / 0.25));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  return m;
}
