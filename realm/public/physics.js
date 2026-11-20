// Collision: static circles and boxes in a spatial hash, plus walkable platforms (bridges).
// Everything that moves is a circle on the ground plane; height comes from the ground.
import { height } from './world.js';

const CELL = 8;
const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;

export class Physics {
  constructor() { this.grid = new Map(); this.platforms = []; this.heights = null; }

  add(shape) {
    const r = shape.r || Math.hypot(shape.hw, shape.hd);
    for (let cx = Math.floor((shape.x - r) / CELL); cx <= Math.floor((shape.x + r) / CELL); cx++)
      for (let cz = Math.floor((shape.z - r) / CELL); cz <= Math.floor((shape.z + r) / CELL); cz++) {
        const k = key(cx, cz);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(shape);
      }
    return shape;
  }
  circle(x, z, r, tag) { return this.add({ t: 'c', x, z, r, tag }); }
  box(x, z, hw, hd, rot = 0, tag) { return this.add({ t: 'b', x, z, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot), tag }); }
  remove(shape) { shape.dead = true; }
  // a flat walkable surface: { x, z, hw, hd, rot, y }
  platform(p) { p.c = Math.cos(p.rot || 0); p.s = Math.sin(p.rot || 0); this.platforms.push(p); }

  near(x, z) {
    const out = this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    return out || [];
  }

  // Push a circle (pos.x, pos.z, radius) out of everything solid.
  resolve(pos, radius) {
    let hit = false;
    const seen = new Set();
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      for (const s of this.near(pos.x + ox * CELL, pos.z + oz * CELL)) {
        if (s.dead || seen.has(s)) continue;
        seen.add(s);
        if (s.t === 'c') {
          const dx = pos.x - s.x, dz = pos.z - s.z, d = Math.hypot(dx, dz), m = s.r + radius;
          if (d < m && d > 1e-4) { pos.x = s.x + (dx / d) * m; pos.z = s.z + (dz / d) * m; hit = true; }
        } else {
          // into the box's frame
          const dx = pos.x - s.x, dz = pos.z - s.z;
          const lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
          const qx = Math.max(-s.hw, Math.min(s.hw, lx)), qz = Math.max(-s.hd, Math.min(s.hd, lz));
          let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
          let nx, nz;
          if (d > 1e-4) {
            if (d >= radius) continue;
            nx = qx + (ex / d) * radius; nz = qz + (ez / d) * radius;
          } else {
            // centre is inside: leave by the nearest side
            const px = s.hw - Math.abs(lx), pz = s.hd - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx || 1) * (s.hw + radius); nz = lz; } else { nx = lx; nz = Math.sign(lz || 1) * (s.hd + radius); }
          }
          pos.x = s.x + nx * s.c + nz * s.s;
          pos.z = s.z - nx * s.s + nz * s.c;
          hit = true;
        }
      }
    }
    return hit;
  }

  // Is the straight line between two points blocked by a box (walls, buildings)?
  blocked(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      for (const s of this.near(x, z)) {
        if (s.dead || s.t !== 'b' || s.low) continue;
        const dx = x - s.x, dz = z - s.z, lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
        if (Math.abs(lx) < s.hw && Math.abs(lz) < s.hd) return true;
      }
    }
    return false;
  }

  // Height of the ground (or a bridge) under a point. Inside the Barrow the floor is flat.
  ground(x, z) {
    if (x > 600) return 0;
    let h = this.heights ? this.heights(x, z) : height(x, z);
    for (const p of this.platforms) {
      const dx = x - p.x, dz = z - p.z, lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
      if (Math.abs(lx) < p.hw && Math.abs(lz) < p.hd) h = Math.max(h, p.y);
    }
    return h;
  }
}
