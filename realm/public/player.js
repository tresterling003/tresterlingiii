// You: movement, camera, attacks, abilities, riding.
import * as THREE from 'three';
import { CLASSES } from './data.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const d = n => 1 + Math.floor(Math.random() * n);
export const roll = (n, s, b = 0) => { let t = b; for (let i = 0; i < n; i++) t += d(s); return t; };

// ---------------------------------------------------------------- input
export class Input {
  constructor(canvas) {
    this.keys = {};
    this.pressed = {};
    this.mx = 0; this.my = 0;
    this.move = { x: 0, y: 0 }; // touch joystick
    this.touch = { attack: false, block: false, sprint: false };
    this.locked = false;
    this.sens = 1;
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.code;
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouseL = this.mouseR = false; });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouseL = true; this.pressed.Mouse0 = true; }
      if (e.button === 2) this.mouseR = true;
      this.dragging = !this.locked;
      this.dragFrom = [e.clientX, e.clientY];
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouseL = false; if (e.button === 2) this.mouseR = false; this.dragging = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (this.locked) { this.mx += e.movementX * this.sens; this.my += e.movementY * this.sens; }
      else if (this.dragging) { this.mx += e.movementX * this.sens * 1.4; this.my += e.movementY * this.sens * 1.4; }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    this.canvas = canvas;
  }
  lock() { try { const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed here */ } }
  unlock() { try { document.exitPointerLock && document.exitPointerLock(); } catch { /* fine */ } }
  down(...codes) { return codes.some(c => this.keys[c]); }
  hit(...codes) { const h = codes.some(c => this.pressed[c]); return h; }
  endFrame() { this.pressed = {}; this.mx = 0; this.my = 0; }
  axis() {
    let x = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let y = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    if (this.move.x || this.move.y) { x = this.move.x; y = this.move.y; }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l, l: 1 } : { x, y, l };
  }
}

// ---------------------------------------------------------------- the hero in the world
export class Player {
  constructor(game, actor) {
    this.g = game;
    this.actor = actor;
    this.pos = V3(0, 0, 0);
    this.vel = V3(0, 0, 0);
    this.rot = Math.PI;
    this.yaw = Math.PI; this.pitch = 0.32; this.dist = 6.8;
    this.onGround = true;
    this.state = 'move';
    this.atkT = 0; this.combo = 0; this.dodgeT = 0; this.iframes = 0;
    this.stamina = 100; this.staminaWait = 0;
    this.cds = [0, 0];
    this.mount = null;
    this.invisT = 0; this.rageT = 0; this.healT = 0; this.potionT = 0; this.hurtT = 0;
    this.camPos = V3(0, 10, 10);
    this.camLook = V3(0, 2, 0);
    this.lastAnim = '';
  }
  get cls() { return CLASSES[this.g.hero.cls]; }
  get radius() { return this.mount ? 1.0 : 0.55; }

  // ------------------------------------------------------------ per frame
  update(dt, input, frozen) {
    const g = this.g, hero = g.hero;
    this.cds = this.cds.map(c => Math.max(0, c - dt));
    this.iframes = Math.max(0, this.iframes - dt);
    this.invisT = Math.max(0, this.invisT - dt);
    this.rageT = Math.max(0, this.rageT - dt);
    this.potionT = Math.max(0, this.potionT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.healT > 0) { this.healT -= dt; g.healPlayer(this.healRate * dt, true); }
    this.actor.setOpacity(this.invisT > 0 ? 0.3 : 1);

    // camera input
    if (!frozen) {
      this.yaw -= input.mx * 0.0032;
      this.pitch = THREE.MathUtils.clamp(this.pitch + input.my * 0.0026, -0.25, 1.15);
      if (input.down('KeyQ') && input.down('ShiftLeft')) {} // reserved
    }
    if (this.state === 'dead') { this.actor.update(dt); return; }
    const ax = frozen ? { x: 0, y: 0, l: 0 } : input.axis();
    // world-space wish direction from the camera's yaw
    const fwd = V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), right = V3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = fwd.clone().multiplyScalar(ax.y).addScaledVector(right, ax.x);
    const moving = wish.lengthSq() > 0.01;
    const deep = this.pos.y < -0.9 && !this.mount && g.zone === 'world' && g.phys.ground(this.pos.x, this.pos.z) < -1.0;

    // actions
    if (!frozen && this.state !== 'stagger') {
      if (input.hit('KeyE')) g.interact();
      if (input.hit('KeyH')) g.whistle();
      if (input.hit('KeyR')) g.drinkPotion();
      if (!this.mount && !deep) {
        if (input.hit('KeyQ', 'ControlLeft') && this.state !== 'dodge') this.dodge(moving ? wish : fwd.clone().negate());
        if (input.hit('Digit1')) this.ability(0, wish);
        if (input.hit('Digit2')) this.ability(1, wish);
      }
      if (!deep && (input.hit('Mouse0', 'KeyF') || input.touch.attackHit || (input.mouseL && this.state === 'move' && this.atkT <= 0) || (input.touch.attack && this.atkT <= 0))) this.attack(wish);
      input.touch.attackHit = false;
    }
    this.blocking = !frozen && !this.mount && !deep && (input.mouseR || input.touch.block) && this.state === 'move';

    // movement
    const sprinting = !frozen && moving && (input.down('ShiftLeft', 'ShiftRight') || input.touch.sprint) && this.stamina > 2 && !this.blocking;
    if (sprinting) { this.stamina -= dt * (this.mount ? 10 : 18); this.staminaWait = 0.9; }
    else if ((this.staminaWait -= dt) <= 0) this.stamina = Math.min(100, this.stamina + dt * 24);

    let speed = this.mount ? (sprinting ? 21 : 12) : sprinting ? 10.5 : 6.4;
    if (deep) speed = 3.6;
    if (this.blocking) speed = 2.4;
    if (this.state === 'attack') speed *= this.mount ? 0.8 : 0.25;
    if (g.slowT > 0) speed *= 0.6;
    if (this.state === 'dodge') {
      this.dodgeT -= dt;
      this.vel.x = this.dodgeDir.x * 13; this.vel.z = this.dodgeDir.z * 13;
      if (this.dodgeT <= 0) this.state = 'move';
    } else if (this.state === 'stagger') {
      this.vel.x *= 0.85; this.vel.z *= 0.85;
      if ((this.staggerT -= dt) <= 0) this.state = 'move';
    } else {
      const target = wish.clone().multiplyScalar(speed * Math.min(1, ax.l + (this.mount ? 0 : 0)));
      const acc = this.mount ? 3.5 : this.onGround ? 14 : 3;
      this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * acc);
      this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * acc);
    }
    // turning: face where you go, or where you aim when attacking
    if (this.state === 'attack' && this.faceTo !== undefined) this.rot += angleTo(this.rot, this.faceTo) * Math.min(1, dt * 18);
    else if (moving && this.state !== 'dodge') this.rot += angleTo(this.rot, Math.atan2(wish.x, wish.z)) * Math.min(1, dt * (this.mount ? 5 : 12));
    if (this.blocking) this.rot += angleTo(this.rot, this.yaw + Math.PI) * Math.min(1, dt * 10);

    // jump and gravity
    if (!frozen && (input.hit('Space') || input.touch.jumpHit) && this.onGround && !deep && this.state === 'move') { this.vel.y = this.mount ? 9 : 8.4; this.onGround = false; this.jumped = true; g.sfx.swish(); }
    input.touch.jumpHit = false;
    this.vel.y -= 24 * dt;
    this.pos.addScaledVector(this.vel, dt);
    // keep inside the world and out of walls
    if (g.zone === 'world') { this.pos.x = THREE.MathUtils.clamp(this.pos.x, -250, 250); this.pos.z = THREE.MathUtils.clamp(this.pos.z, -250, 250); }
    g.phys.resolve(this.pos, this.radius);
    let ground = g.phys.ground(this.pos.x, this.pos.z);
    if (deep || (ground < -1.0 && g.zone === 'world' && !this.mount)) ground = Math.max(ground, -1.15);
    if (this.mount && ground < -1.6) ground = -1.6;
    // stop climbing cliffs: too steep, slide back
    if (g.zone === 'world' && ground - this.pos.y > 1.6 && this.onGround) { this.pos.addScaledVector(this.vel, -dt); ground = g.phys.ground(this.pos.x, this.pos.z); this.vel.x *= -0.2; this.vel.z *= -0.2; }
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -6) { this.actor.once('Jump_Land', 1.6); }
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > ground + 0.25) this.onGround = false;
    else if (this.vel.y <= 0) { this.pos.y = ground; this.vel.y = 0; this.onGround = true; }

    // attacks resolve mid-swing
    if (this.state === 'attack') {
      this.atkT -= dt;
      if (!this.struck && this.atkT <= this.hitAt) { this.struck = true; this.strike(); }
      if (this.atkT <= 0) this.state = 'move';
    } else this.atkT -= dt;

    // ride: the horse goes where you go
    if (this.mount) {
      const h = this.mount;
      h.pos.copy(this.pos);
      h.rot = this.rot;
      h.actor.root.position.copy(this.pos);
      h.actor.root.rotation.y = this.rot;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (h.actor.gallop) h.actor.gallop.timeScale = sp > 0.5 ? 0.35 + sp / 18 : 0;
      if (sp > 15 && Math.random() < dt * 5) g.sfx.hoof && g.sfx.hoof();
    }
    this.actor.root.position.copy(this.pos);
    if (this.mount) this.actor.root.position.y += 1.55;
    if (deep) this.actor.root.position.y = this.pos.y - 0.1;
    this.actor.root.rotation.y = this.rot;
    this.animate(dt, moving, sprinting, deep);
    this.actor.update(dt);
    this.updateCamera(dt);
  }

  animate(dt, moving, sprinting, deep) {
    const a = this.actor;
    if (this.state === 'attack' || this.state === 'dodge' || this.state === 'stagger' || this.state === 'cast') return;
    let want;
    if (this.mount) want = 'Sit_Chair_Idle';
    else if (!this.onGround && this.jumped) want = 'Jump_Idle';
    else if (this.blocking) want = 'Blocking';
    else if (deep) want = moving ? 'Running_A' : 'Idle';
    else if (moving) want = sprinting ? 'Running_A' : Math.hypot(this.vel.x, this.vel.z) > 4.5 ? 'Running_B' : 'Walking_A';
    else want = this.g.inCombat ? (this.cls.style === 'melee' && this.g.hero.cls === 'barbarian' ? '2H_Melee_Idle' : 'Idle') : 'Idle';
    if (this.onGround) this.jumped = false;
    if (want !== this.lastAnim || a.currentName !== want) { a.play(want, { fade: 0.15 }); this.lastAnim = want; }
    if (want === 'Running_A' || want === 'Running_B') a.current && (a.current.timeScale = deep ? 0.5 : sprinting ? 1.25 : 1.0);
  }

  updateCamera(dt) {
    const g = this.g;
    const head = this.pos.clone().add(V3(0, this.mount ? 3.4 : 1.9, 0));
    const dist = (this.mount ? 9 : g.bossActive ? 8.5 : this.dist) * (g.zone === 'barrow' ? 0.85 : 1);
    const dir = V3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const side = V3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(g.aiming ? 0.9 : 0.35);
    let d2 = dist;
    // pull in when something is in the way
    for (let k = 1; k <= 8; k++) {
      const p = head.clone().addScaledVector(dir, (dist * k) / 8);
      if (g.zone === 'barrow' ? g.phys.blocked(head.x, head.z, p.x, p.z) : p.y < g.phys.ground(p.x, p.z) + 0.4) { d2 = (dist * (k - 1)) / 8; break; }
    }
    d2 = Math.max(1.6, d2);
    const want = head.clone().addScaledVector(dir, d2).add(side);
    if (g.zone === 'world') want.y = Math.max(want.y, g.phys.ground(want.x, want.z) + 0.6);
    this.camPos.lerp(want, Math.min(1, dt * 14));
    this.camLook.lerp(head.clone().add(side), Math.min(1, dt * 18));
    if (!g.cineActive) { g.camera.position.copy(this.camPos); g.camera.lookAt(this.camLook); }
    if (g.shakeT > 0) { g.camera.position.x += (Math.random() - 0.5) * g.shakeP; g.camera.position.y += (Math.random() - 0.5) * g.shakeP; }
  }

  // ------------------------------------------------------------ fighting
  aimDir() {
    // where the camera looks, flattened a little
    return V3(-Math.sin(this.yaw) * Math.cos(this.pitch - 0.25), -Math.sin(this.pitch - 0.25), -Math.cos(this.yaw) * Math.cos(this.pitch - 0.25)).normalize();
  }
  // the enemy you most likely mean: close to where you are facing/aiming
  pickTarget(range, cone, dir) {
    const g = this.g, f = dir || this.aimDir();
    let best = null, bs = Infinity;
    for (const e of g.targetsForPlayer()) {
      const to = e.pos.clone().sub(this.pos); to.y = 0;
      const dd = to.length();
      if (dd > range + (e.def.boss ? 2 : 0)) continue;
      const ang = Math.acos(THREE.MathUtils.clamp(to.normalize().dot(V3(f.x, 0, f.z).normalize()), -1, 1));
      if (ang > cone) continue;
      const score = dd + ang * 8;
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  }
  attack(wish) {
    if (this.state !== 'move' || this.atkT > 0) return;
    const C = this.cls, g = this.g;
    const ranged = C.style !== 'melee';
    const aim = this.aimDir();
    const t = ranged ? this.pickTarget(C.reach, 0.32, aim) : this.pickTarget(C.reach + 2.5, 1.4, wish.lengthSq() > 0.01 ? wish : aim);
    this.target = t;
    this.faceTo = t ? Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : ranged || this.mount ? Math.atan2(aim.x, aim.z) : this.rot;
    this.state = 'attack';
    const rate = C.rate * (this.rageT > 0 ? 0.8 : 1);
    this.atkT = rate;
    this.hitAt = rate * (ranged ? 0.55 : 0.5);
    this.struck = false;
    const name = C.attacks[this.combo++ % C.attacks.length];
    this.actor.play(this.mount ? '1H_Melee_Attack_Slice_Horizontal' : name, { once: true, fade: 0.06, speed: 1.15 / (rate / 0.7) * 0.9, then: () => {} });
    g.sfx.swish();
  }
  strike() {
    const g = this.g, C = this.cls;
    if (C.style === 'melee' || this.mount && C.style !== 'magic' && C.style !== 'ranged') {
      const reach = C.reach + (this.mount ? 1.2 : 0);
      const hits = g.targetsForPlayer().filter(e => {
        const to = e.pos.clone().sub(this.pos); to.y = 0;
        const dd = to.length() - (e.def.boss ? 0.9 * (e.def.scale || 1) : 0);
        if (dd > reach) return false;
        const ang = Math.abs(angleTo(this.rot, Math.atan2(to.x, to.z)));
        return ang < 1.15 || dd < 1.2;
      });
      // also catch innocent bystanders, because that is how crime works
      const bystanders = g.peopleNear(this.pos, reach).filter(p => Math.abs(angleTo(this.rot, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z))) < 1.0);
      hits.slice(0, 3).forEach(e => g.playerHits(e, { kind: 'weapon' }));
      bystanders.forEach(p => g.playerHits(p, { kind: 'weapon' }));
      if (!hits.length && !bystanders.length) g.sfx.swish();
    } else {
      const from = this.pos.clone().add(V3(0, this.mount ? 3.2 : 1.6, 0)).addScaledVector(V3(Math.sin(this.rot), 0, Math.cos(this.rot)), 0.8);
      const t = this.target && !this.target.dead ? this.target : null;
      const to = t ? t.pos.clone().add(V3(0, (t.actor.height || 2) * 0.55, 0)) : from.clone().addScaledVector(this.aimDir(), 40);
      g.shoot({ from, to, kind: C.style === 'magic' ? 'magic' : 'bolt', speed: C.style === 'magic' ? 32 : 55, homing: t ? () => (t.dead ? null : t.pos.clone().add(V3(0, (t.actor.height || 2) * 0.55, 0))) : null, by: 'player' });
      g.sfx[C.style === 'magic' ? 'zap' : 'twang']();
    }
  }
  dodge(dir) {
    if (this.stamina < 20 || !this.onGround) return;
    this.stamina -= 22; this.staminaWait = 0.8;
    this.state = 'dodge';
    this.dodgeT = 0.42;
    this.iframes = 0.38;
    this.dodgeDir = dir.clone().setY(0).normalize();
    this.rot = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    this.actor.play('Dodge_Forward', { once: true, fade: 0.05, speed: 1.5, then: () => {} });
    this.g.sfx.swish();
  }
  stagger(secs = 0.35, from) {
    if (this.state === 'dodge' || this.mount) return;
    this.state = 'stagger';
    this.staggerT = secs;
    if (from) { const k = this.pos.clone().sub(from).setY(0).normalize().multiplyScalar(5); this.vel.x = k.x; this.vel.z = k.z; }
    this.actor.play(Math.random() < 0.5 ? 'Hit_A' : 'Hit_B', { once: true, fade: 0.05, speed: 1.4, then: () => {} });
  }

  ability(i, wish) {
    const g = this.g, hero = g.hero, C = this.cls, ab = C.abilities[i];
    if (!ab || hero.level < ab.lvl) { g.ui.toast(ab ? `${ab.name} unlocks at level ${ab.lvl}` : ''); return; }
    if (this.cds[i] > 0 || this.state !== 'move') return;
    this.cds[i] = ab.cd;
    const fwd = V3(Math.sin(this.rot), 0, Math.cos(this.rot));
    const mod = s => g.stat(s);
    const near = r => g.targetsForPlayer().filter(e => e.pos.distanceTo(this.pos) < r + (e.def.boss ? 1.2 : 0));
    const cast = (anim, secs = 0.6) => { this.state = 'cast'; this.actor.play(anim, { once: true, fade: 0.06, speed: 1.3, then: () => {} }); setTimeout(() => { if (this.state === 'cast') this.state = 'move'; }, secs * 1000); };
    g.ui.flashAbility(i);
    if (ab.id === 'bash') {
      const t = this.pickTarget(8, 1.0, wish.lengthSq() > 0.01 ? wish : this.aimDir());
      if (t) this.rot = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      const dir = V3(Math.sin(this.rot), 0, Math.cos(this.rot));
      this.vel.x = dir.x * 22; this.vel.z = dir.z * 22;
      cast('Block_Hit', 0.45);
      setTimeout(() => {
        const f = V3(Math.sin(this.rot), 0, Math.cos(this.rot));
        g.targetsForPlayer().filter(e => { const to = e.pos.clone().sub(this.pos).setY(0); return to.length() < 3.6 && to.normalize().dot(f) > 0.3; })
          .forEach(e => { g.playerHits(e, { kind: 'ability', dmg: roll(1, 8, mod('might')), name: 'Shield Bash', sure: true }); g.stun(e, 2.2); });
        g.shake(0.35); g.sfx.clang();
      }, 220);
    } else if (ab.id === 'smite') {
      cast('Spellcast_Raise', 0.8);
      setTimeout(() => {
        g.fx.burst(this.pos.clone().add(V3(0, 1.2, 0)), 0xfff0a0, 70, 9, 2);
        g.ring(this.pos, 7, 0xfff0a0);
        near(7).forEach(e => g.playerHits(e, { kind: 'ability', dmg: roll(3, 6, 0), name: 'Radiant Smite', sure: true, holy: true }));
        g.healPlayer(10);
        g.flash('#fff6c8', 300); g.sfx.chime(); g.shake(0.3);
      }, 350);
    } else if (ab.id === 'whirl') {
      this.state = 'cast';
      this.actor.play('2H_Melee_Attack_Spin', { once: true, fade: 0.05, speed: 1.2, then: () => { this.state = 'move'; } });
      setTimeout(() => { if (this.state === 'cast') this.state = 'move'; }, 1100);
      let n = 0;
      const tick = () => { near(3.8).forEach(e => g.playerHits(e, { kind: 'ability', dmg: roll(1, 6, Math.ceil(mod('might') / 2)), name: n ? '' : 'Whirlwind', sure: true })); g.sfx.swish(); if (++n < 2) setTimeout(tick, 320); };
      setTimeout(tick, 250);
    } else if (ab.id === 'rage') {
      this.rageT = 10;
      cast('Cheer', 0.7);
      g.fx.burst(this.pos.clone().add(V3(0, 1.5, 0)), 0xff3020, 50, 6, 2);
      g.flash('#ff3020', 250); g.sfx.roar(); g.ui.toast('RAGE!');
    } else if (ab.id === 'fireball') {
      cast('Spellcast_Shoot', 0.5);
      const aim = this.aimDir(), t = this.pickTarget(34, 0.35, aim);
      if (t) this.rot = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      const from = this.pos.clone().add(V3(0, 1.8, 0));
      const to = t ? t.pos.clone().add(V3(0, 1, 0)) : from.clone().addScaledVector(aim, 34);
      setTimeout(() => g.shoot({ from, to, kind: 'fire', speed: 26, by: 'player', life: 1.8, aoe: { r: 4.5, dmg: () => roll(2, 6, mod('mind')), name: 'Fireball', fire: true } }), 200);
      g.sfx.fire();
    } else if (ab.id === 'nova') {
      cast('Spellcast_Raise', 0.7);
      setTimeout(() => {
        g.ring(this.pos, 8, 0x9fe8ff);
        g.fx.burst(this.pos.clone().add(V3(0, 1, 0)), 0xbff4ff, 80, 10, 1);
        near(8).forEach(e => { g.playerHits(e, { kind: 'ability', dmg: roll(1, 6, 0), name: 'Frost Nova', sure: true }); g.freeze(e, 3); });
        g.sfx.chime(); g.flash('#bff4ff', 250);
      }, 300);
    } else if (ab.id === 'shadowstep') {
      const t = this.pickTarget(14, Math.PI, this.aimDir());
      if (!t) { this.cds[i] = 0.5; g.ui.toast('No enemy close enough'); return; }
      g.fx.burst(this.pos.clone().add(V3(0, 1, 0)), 0x6040a0, 40, 4, 1);
      const behind = V3(-Math.sin(t.rot), 0, -Math.cos(t.rot)).multiplyScalar(1.6 + (t.def.scale || 1) * 0.6);
      this.pos.copy(t.pos).add(behind);
      this.pos.y = g.phys.ground(this.pos.x, this.pos.z);
      this.rot = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      g.fx.burst(this.pos.clone().add(V3(0, 1, 0)), 0x6040a0, 40, 4, 1);
      cast('Dualwield_Melee_Attack_Stab', 0.45);
      setTimeout(() => g.playerHits(t, { kind: 'ability', name: 'Backstab', crit: true, sure: true }), 180);
      g.sfx.swish();
    } else if (ab.id === 'smoke') {
      this.invisT = 6;
      g.fx.burst(this.pos.clone().add(V3(0, 1, 0)), 0x9aa0aa, 90, 4, 1.5);
      g.loseTrack();
      g.sfx.boom(); g.ui.toast('Invisible!');
      cast('Throw', 0.5);
    } else if (ab.id === 'volley') {
      const aim = this.aimDir(), t = this.pickTarget(36, 0.4, aim);
      const spot = t ? t.pos.clone() : this.pos.clone().addScaledVector(V3(aim.x, 0, aim.z).normalize(), 16);
      spot.y = g.phys.ground(spot.x, spot.z);
      this.rot = Math.atan2(spot.x - this.pos.x, spot.z - this.pos.z);
      cast('2H_Ranged_Shoot', 0.5);
      g.fx.telegraph(spot, 4.2, 0.6, 0x7dff9a);
      for (let k = 0; k < 6; k++) setTimeout(() => {
        const p = spot.clone().add(V3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
        g.shoot({ from: p.clone().add(V3(0, 16, 2)), to: p, kind: 'bolt', speed: 45, by: 'player', life: 0.6, aoe: { r: 2.2, dmg: () => roll(1, 6, 0), name: k ? '' : 'Volley', quiet: true } });
      }, 250 + k * 130);
      g.sfx.twang();
    } else if (ab.id === 'grove') {
      cast('Spellcast_Raise', 0.7);
      this.healT = 4;
      this.healRate = roll(3, 6, mod('mind')) / 4;
      g.ring(this.pos, 6, 0x7dff9a);
      g.fx.burst(this.pos.clone().add(V3(0, 0.5, 0)), 0x7dff9a, 70, 3, 3);
      g.healAllies && g.healAllies(this.pos, 8, this.healRate * 4);
      g.sfx.chime();
    }
  }
}
