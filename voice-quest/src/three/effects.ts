import * as THREE from 'three';
import { softDot, sparkleTex } from './materials';

/** Gradient sky dome with a soft sun glow. */
export function makeSky(top = 0x5aa9ff, bottom = 0xdff1ff, sunDir = new THREE.Vector3(0.4, 0.5, 0.3)): THREE.Mesh {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) }, sun: { value: sunDir.clone().normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y*1.4+0.15,0.0,1.0); vec3 c = mix(bottom, top, pow(h,0.8));
      float s = max(dot(vDir, sun),0.0); c += vec3(1.0,0.92,0.75)*pow(s,40.0)*0.6 + vec3(1.0,0.95,0.85)*pow(s,4.0)*0.12;
      gl_FragColor = vec4(c,1.0); }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/** Gentle snowfall that follows a target (the camera / player). */
export class Snowfall {
  points: THREE.Points;
  private vel: Float32Array;
  private count: number;
  constructor(count = 2500, private range = 45, private height = 30) {
    this.count = count;
    const pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * range * 2;
      pos[i * 3 + 1] = Math.random() * height;
      pos[i * 3 + 2] = (Math.random() - 0.5) * range * 2;
      this.vel[i] = 0.8 + Math.random() * 1.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.22, map: softDot(), transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.9, sizeAttenuation: true });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }
  setDensity(f: number): void {
    this.points.geometry.setDrawRange(0, Math.floor(this.count * f));
  }
  update(dt: number, center: THREE.Vector3, t: number): void {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const r = this.range;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      a[k + 1] -= this.vel[i] * dt;
      a[k] += Math.sin(t * 0.7 + i) * 0.3 * dt;
      if (a[k + 1] < 0) a[k + 1] += this.height;
      // wrap around centre
      const dx = a[k] - center.x, dz = a[k + 2] - center.z;
      if (dx > r) a[k] -= r * 2; else if (dx < -r) a[k] += r * 2;
      if (dz > r) a[k + 2] -= r * 2; else if (dz < -r) a[k + 2] += r * 2;
    }
    pos.needsUpdate = true;
  }
}

interface Particle { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; color: THREE.Color; size: number; grav: number }

/** Pooled sparkle/confetti bursts. */
export class Bursts {
  points: THREE.Points;
  private parts: Particle[] = [];
  private max = 900;
  private geo: THREE.BufferGeometry;
  reduced = false;
  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.max * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.max * 3), 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(this.max), 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { map: { value: sparkleTex() } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; void main(){ vC=color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * (300.0 / -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC*t.rgb, t.a); }`,
    });
    this.points = new THREE.Points(this.geo, m);
    this.points.frustumCulled = false;
  }

  burst(at: THREE.Vector3, opts: { count?: number; colors?: number[]; speed?: number; up?: number; size?: number; grav?: number; life?: number } = {}): void {
    const n = Math.floor((opts.count ?? 40) * (this.reduced ? 0.35 : 1));
    const colors = opts.colors ?? [0xfff3a0, 0xff7ab8, 0x8fd3ff, 0xa6ff9e, 0xffffff];
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      const sp = (opts.speed ?? 5) * (0.4 + Math.random() * 0.8);
      const life = (opts.life ?? 1.1) * (0.6 + Math.random() * 0.6);
      this.parts.push({ p: at.clone(), v: dir.multiplyScalar(sp).add(new THREE.Vector3(0, opts.up ?? 2, 0)), life, max: life, color: new THREE.Color(colors[i % colors.length]), size: (opts.size ?? 0.6) * (0.6 + Math.random() * 0.8), grav: opts.grav ?? 6 });
    }
  }

  /** A gentle continuous trail (used for the guide fairy / magic). */
  trail(at: THREE.Vector3, color = 0xfff3a0): void {
    if (this.parts.length >= this.max) return;
    this.parts.push({ p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)), v: new THREE.Vector3(0, -0.3, 0), life: 0.8, max: 0.8, color: new THREE.Color(color), size: 0.35, grav: 0 });
  }

  update(dt: number): void {
    const pos = this.geo.attributes.position.array as Float32Array;
    const col = this.geo.attributes.color.array as Float32Array;
    const siz = this.geo.attributes.size.array as Float32Array;
    let w = 0;
    for (const pt of this.parts) {
      pt.life -= dt;
      if (pt.life <= 0) continue;
      pt.v.y -= pt.grav * dt;
      pt.v.multiplyScalar(1 - 1.5 * dt);
      pt.p.addScaledVector(pt.v, dt);
      const f = pt.life / pt.max;
      pos[w * 3] = pt.p.x; pos[w * 3 + 1] = pt.p.y; pos[w * 3 + 2] = pt.p.z;
      col[w * 3] = pt.color.r * f; col[w * 3 + 1] = pt.color.g * f; col[w * 3 + 2] = pt.color.b * f;
      siz[w] = pt.size * (0.5 + f * 0.5);
      this.parts[w++] = pt;
    }
    this.parts.length = w;
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

/** Instanced twinkling bulbs along a polyline. */
export class StringLights {
  mesh: THREE.InstancedMesh;
  private phases: number[] = [];
  private base: THREE.Color[] = [];
  reduced = false;
  constructor(points: THREE.Vector3[], spacing = 0.6, palette = [0xff3b3b, 0x3bff6a, 0x3bb4ff, 0xffd93b, 0xff5ee0]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const n = Math.max(1, Math.floor(a.distanceTo(b) / spacing));
      for (let j = 0; j < n; j++) {
        const p = a.clone().lerp(b, j / n);
        p.y -= Math.sin((j / n) * Math.PI) * 0.25; // sag
        pts.push(p);
      }
    }
    const geo = new THREE.SphereGeometry(0.09, 8, 6);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, m, pts.length);
    const mtx = new THREE.Matrix4();
    pts.forEach((p, i) => {
      mtx.makeTranslation(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, mtx);
      const c = new THREE.Color(palette[i % palette.length]);
      this.base.push(c);
      this.mesh.setColorAt(i, c);
      this.phases.push(Math.random() * Math.PI * 2);
    });
    // a thin wire
    this.mesh.castShadow = false;
  }
  update(t: number): void {
    if (this.reduced) return;
    const c = new THREE.Color();
    for (let i = 0; i < this.base.length; i++) {
      const k = 0.55 + 0.45 * Math.sin(t * 2 + this.phases[i]);
      c.copy(this.base[i]).multiplyScalar(0.6 + k * 1.2);
      this.mesh.setColorAt(i, c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
