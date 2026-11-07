import * as THREE from 'three';
import type { Input } from '../core/input';
import type { AudioEngine } from '../core/audio';
import type { Hero } from '../three/models/hero';
import { CollisionWorld, type Body } from './physics';

export class FollowCamera {
  yaw = 0;
  pitch = 0.42;
  dist = 11;
  minDist = 6;
  maxDist = 16;
  target = new THREE.Vector3();
  private look = new THREE.Vector3();
  private lastDrag = -10;
  constructor(public cam: THREE.PerspectiveCamera) {}

  snap(target: THREE.Vector3): void {
    this.target.copy(target);
    this.look.copy(target);
    this.apply(1);
  }

  update(dt: number, input: Input, focus: THREE.Vector3, heading: number | null, t: number): void {
    if (input.dragDX || input.dragDY) this.lastDrag = t;
    this.yaw -= input.dragDX * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.dragDY * 0.004, 0.12, 1.15);
    if (input.keys.has('KeyQ')) this.yaw += dt * 2;
    if (input.keys.has('KeyR')) this.yaw -= dt * 2;
    this.dist = THREE.MathUtils.clamp(this.dist + input.wheel * 0.8, this.minDist, this.maxDist);
    // gentle auto-follow behind the hero while moving (paused right after the player drags the view)
    if (heading !== null && t - this.lastDrag > 2.5) {
      let d = heading + Math.PI - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < 2.4) this.yaw += d * Math.min(1, dt * 0.9);
    }
    this.target.copy(focus);
    this.apply(dt);
  }

  private apply(dt: number): void {
    const k = 1 - Math.exp(-8 * dt);
    this.look.lerp(this.target, k);
    const cp = Math.cos(this.pitch);
    const pos = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.dist).add(this.look).add(new THREE.Vector3(0, 1.4, 0));
    this.cam.position.lerp(pos, dt >= 1 ? 1 : 1 - Math.exp(-10 * dt));
    this.cam.lookAt(this.look.x, this.look.y + 1.4, this.look.z);
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  right(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}

export class HeroController {
  body: Body;
  speed = 6.8;
  jumpV = 9.6;
  private jumps = 0;
  moveTarget: THREE.Vector3 | null = null;
  onArrive: (() => void) | null = null;
  arriveDist = 0.6;
  iceZones: { x: number; z: number; r: number }[] = [];
  private stepT = 0;
  heading: number | null = null;
  enabled = true;

  constructor(public hero: Hero, public world: CollisionWorld, private audio: AudioEngine) {
    this.body = { pos: hero.position.clone(), vel: new THREE.Vector3(), radius: 0.42, height: 1.9, grounded: true };
  }

  teleport(p: THREE.Vector3, yaw = 0): void {
    this.body.pos.copy(p);
    this.body.vel.set(0, 0, 0);
    this.hero.position.copy(p);
    this.hero.rotation.y = yaw;
    this.moveTarget = null;
  }

  walkTo(p: THREE.Vector3, arriveDist = 0.6, onArrive: (() => void) | null = null): void {
    this.moveTarget = p.clone();
    this.arriveDist = arriveDist;
    this.onArrive = onArrive;
  }

  update(dt: number, input: Input, cam: FollowCamera, reduced: boolean): void {
    const b = this.body;
    let want = new THREE.Vector3();
    if (this.enabled && input.enabled) {
      const ax = input.axis();
      if (ax.x || ax.y) {
        this.moveTarget = null;
        this.onArrive = null;
        want.addScaledVector(cam.forward(), ax.y).addScaledVector(cam.right(), ax.x);
      } else if (this.moveTarget) {
        const d = new THREE.Vector3(this.moveTarget.x - b.pos.x, 0, this.moveTarget.z - b.pos.z);
        const dist = d.length();
        if (dist < this.arriveDist) {
          this.moveTarget = null;
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        } else want = d.normalize().multiplyScalar(Math.min(1, dist / 1.5 + 0.3));
      }
      if (input.jumpPressed() && this.jumps < 2) {
        b.vel.y = this.jumps === 0 ? this.jumpV : this.jumpV * 0.85;
        this.jumps++;
        b.grounded = false;
        this.audio.sfx('jump');
      }
    }
    const onIce = this.iceZones.some((z) => Math.hypot(b.pos.x - z.x, b.pos.z - z.z) < z.r);
    const accel = !b.grounded ? 5 : onIce ? 1.6 : 14;
    const tv = want.multiplyScalar(this.speed);
    b.vel.x += (tv.x - b.vel.x) * Math.min(1, accel * dt);
    b.vel.z += (tv.z - b.vel.z) * Math.min(1, accel * dt);
    const res = this.world.step(b, dt);
    if (b.grounded) this.jumps = 0;
    if (res.landed) {
      this.hero.land();
      this.audio.sfx('land');
    }
    if (res.fellBelow) this.teleport(new THREE.Vector3(0, 0, 8));
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (hs > 0.5 && want.lengthSq() > 0.01) {
      const yaw = Math.atan2(b.vel.x, b.vel.z);
      let d = yaw - this.hero.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.hero.rotation.y += d * Math.min(1, dt * 12);
      this.heading = yaw;
    } else this.heading = null;
    this.hero.position.copy(b.pos);
    this.hero.animate(dt, hs, b.vel.y, b.grounded, reduced);
    if (b.grounded && hs > 1) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) {
        this.stepT = 2.2;
        this.audio.sfx('step');
      }
    }
  }
}
