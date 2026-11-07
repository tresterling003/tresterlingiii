import * as THREE from 'three';

/** Simple kinematic collision world: axis-aligned boxes and vertical cylinders.
 *  A full physics engine is unnecessary for this game's needs (walk, jump, stand on platforms),
 *  and a small custom solver keeps behaviour predictable and the bundle small. */

export interface BoxCollider {
  kind: 'box';
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** for moving platforms: displacement applied this frame */
  delta?: THREE.Vector3;
  /** standing on this triggers a callback */
  tag?: string;
  enabled?: boolean;
}

export interface CylCollider {
  kind: 'cyl';
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
  tag?: string;
  enabled?: boolean;
}

export type Collider = BoxCollider | CylCollider;

export interface Body {
  pos: THREE.Vector3; // feet position
  vel: THREE.Vector3;
  radius: number;
  height: number;
  grounded: boolean;
  groundTag?: string;
  groundCollider?: Collider | null;
}

export class CollisionWorld {
  colliders: Collider[] = [];
  gravity = 24;
  stepUp = 0.4;
  /** optional terrain height function (defaults to flat 0); return -Infinity for holes */
  ground: (x: number, z: number) => number = () => 0;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

  addBox(min: THREE.Vector3Like, max: THREE.Vector3Like, tag?: string): BoxCollider {
    const c: BoxCollider = { kind: 'box', min: new THREE.Vector3(min.x, min.y, min.z), max: new THREE.Vector3(max.x, max.y, max.z), tag };
    this.colliders.push(c);
    return c;
  }

  /** Box centred at (x, z), from y0 to y1, with half sizes hx, hz */
  addBoxAt(x: number, z: number, hx: number, hz: number, y0: number, y1: number, tag?: string): BoxCollider {
    return this.addBox({ x: x - hx, y: y0, z: z - hz }, { x: x + hx, y: y1, z: z + hz }, tag);
  }

  addCyl(x: number, z: number, r: number, y0 = 0, y1 = 3, tag?: string): CylCollider {
    const c: CylCollider = { kind: 'cyl', x, z, r, y0, y1, tag };
    this.colliders.push(c);
    return c;
  }

  remove(c: Collider): void {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  private top(c: Collider): number {
    return c.kind === 'box' ? c.max.y : c.y1;
  }
  private bottom(c: Collider): number {
    return c.kind === 'box' ? c.min.y : c.y0;
  }

  /** Highest walkable surface under (x,z) not above maxY. */
  groundAt(x: number, z: number, r: number, maxY: number): { y: number; c: Collider | null } {
    let best = this.ground(x, z);
    let bc: Collider | null = null;
    for (const c of this.colliders) {
      if (c.enabled === false) continue;
      const t = this.top(c);
      if (t > maxY || t <= best) continue;
      let over = false;
      if (c.kind === 'box') {
        const m = r * 0.5;
        over = x > c.min.x - m && x < c.max.x + m && z > c.min.z - m && z < c.max.z + m;
      } else {
        over = Math.hypot(x - c.x, z - c.z) < c.r + r * 0.3;
      }
      if (over) { best = t; bc = c; }
    }
    return { y: best, c: bc };
  }

  step(b: Body, dt: number): { landed: boolean; fellBelow: boolean } {
    // ride moving platforms
    if (b.grounded && b.groundCollider && b.groundCollider.kind === 'box' && b.groundCollider.delta) b.pos.add(b.groundCollider.delta);

    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    // horizontal push-out
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.colliders) {
        if (c.enabled === false) continue;
        const t = this.top(c);
        if (b.pos.y >= t - this.stepUp * (b.grounded ? 1 : 0.25) || b.pos.y + b.height <= this.bottom(c)) continue;
        if (c.kind === 'cyl') {
          const dx = b.pos.x - c.x, dz = b.pos.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + b.radius;
          if (d < min) {
            const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
            b.pos.x = c.x + nx * min;
            b.pos.z = c.z + nz * min;
          }
        } else {
          const cx = THREE.MathUtils.clamp(b.pos.x, c.min.x, c.max.x);
          const cz = THREE.MathUtils.clamp(b.pos.z, c.min.z, c.max.z);
          const dx = b.pos.x - cx, dz = b.pos.z - cz;
          const d = Math.hypot(dx, dz);
          if (d < b.radius) {
            if (d > 1e-4) {
              b.pos.x = cx + (dx / d) * b.radius;
              b.pos.z = cz + (dz / d) * b.radius;
            } else {
              // inside: push out along smallest penetration
              const pens = [b.pos.x - c.min.x, c.max.x - b.pos.x, b.pos.z - c.min.z, c.max.z - b.pos.z];
              const i = pens.indexOf(Math.min(...pens));
              if (i === 0) b.pos.x = c.min.x - b.radius;
              else if (i === 1) b.pos.x = c.max.x + b.radius;
              else if (i === 2) b.pos.z = c.min.z - b.radius;
              else b.pos.z = c.max.z + b.radius;
            }
          }
        }
      }
    }
    if (this.bounds) {
      b.pos.x = THREE.MathUtils.clamp(b.pos.x, this.bounds.minX, this.bounds.maxX);
      b.pos.z = THREE.MathUtils.clamp(b.pos.z, this.bounds.minZ, this.bounds.maxZ);
    }

    // vertical
    b.vel.y -= this.gravity * dt;
    const prevY = b.pos.y;
    b.pos.y += b.vel.y * dt;
    const g = this.groundAt(b.pos.x, b.pos.z, b.radius, Math.max(prevY, b.pos.y) + this.stepUp);
    const wasGrounded = b.grounded;
    b.grounded = false;
    let landed = false;
    if (b.pos.y <= g.y + 0.001 && b.vel.y <= 0) {
      // step up smoothly / land
      b.pos.y = g.y;
      if (!wasGrounded && b.vel.y < -4) landed = true;
      b.vel.y = 0;
      b.grounded = true;
      b.groundCollider = g.c;
      b.groundTag = g.c?.tag;
    } else if (wasGrounded && b.vel.y <= 0 && prevY - g.y < this.stepUp && prevY - g.y > 0 && g.y > -100) {
      // snap down small steps
      b.pos.y = g.y;
      b.vel.y = 0;
      b.grounded = true;
      b.groundCollider = g.c;
      b.groundTag = g.c?.tag;
    } else {
      b.groundCollider = null;
      b.groundTag = undefined;
    }
    return { landed, fellBelow: b.pos.y < -12 };
  }
}
