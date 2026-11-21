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
    this.padKeys = {};
    this.padHeld = {};
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
      if (e.button === 1) { this.pressed.KeyT = true; e.preventDefault(); }
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
  down(...codes) { return codes.some(c => this.keys[c] || this.padKeys[c]); }
  // held attack / block, from any device
  get attackHeld() { return !!(this.mouseL || this.touch.attack || this.padAttack); }
  get blockHeld() { return !!(this.mouseR || this.touch.block || this.padBlock); }
  // ------------------------------------------------------------ game controllers (standard mapping)
  //  left stick / D-pad: move · right stick: look · RT: attack (hold = heavy) · LT: block & parry / aim
  //  A: jump · B: dodge · X: interact · Y: potion · LB/RB: abilities · L3: sprint · R3: lock on · Start: pause · Back: map
  poll(dt, nav) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads || []) if (p && p.connected && p.buttons && p.buttons.length > 9) { gp = p; break; }
    if (!gp) { if (this.pad) { this.pad = null; this.padKeys = {}; this.padMove = null; this.padAttack = this.padBlock = false; } return; }
    if (!this.pad) this.onPad && this.onPad(gp.id);
    this.pad = gp;
    const b = i => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.45);
    const dz = v => (Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8);
    const now = {};
    for (let i = 0; i < gp.buttons.length; i++) now[i] = b(i);
    const edge = i => now[i] && !this.padHeld[i];
    let lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    const dpx = (now[15] ? 1 : 0) - (now[14] ? 1 : 0), dpy = (now[13] ? 1 : 0) - (now[12] ? 1 : 0);
    if (dpx || dpy) { lx = dpx; ly = dpy; }
    // menus, dialogue and the title screen: the pad drives a highlight instead
    if (nav && nav.active()) {
      const dir = Math.abs(lx) > 0.5 || Math.abs(ly) > 0.5 ? (Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : ly > 0 ? 'down' : 'up') : null;
      if (dir && (dir !== this.navDir || (this.navT -= dt) <= 0)) { nav.move(dir); this.navT = dir !== this.navDir ? 0.38 : 0.13; }
      this.navDir = dir;
      if (edge(0)) nav.ok();
      if (edge(1)) nav.back();
      if (edge(9)) nav.start();
      if (edge(4) || edge(5)) nav.tab(edge(5) ? 1 : -1);
      this.padKeys = {}; this.padMove = null; this.padAttack = this.padBlock = false;
      this.padHeld = now;
      return;
    }
    this.navDir = null;
    const map = { 0: 'Space', 1: 'KeyQ', 2: 'KeyE', 4: 'Digit1', 5: 'Digit2', 8: 'KeyM', 9: 'Escape', 11: 'KeyT' };
    // Y: tap for a potion, hold for the weapon wheel
    if (now[3]) { this.yHeld = (this.yHeld || 0) + dt; if (this.yHeld > 0.28) this.padWheel = true; }
    else { if (this.yHeld && this.yHeld <= 0.28) this.pressed.KeyR = true; this.yHeld = 0; this.padWheel = false; }
    const keys = {};
    for (const [i, code] of Object.entries(map)) if (now[i]) { keys[code] = true; if (edge(+i)) this.pressed[code] = true; }
    if (edge(10)) this.padSprint = !this.padSprint;
    if (!lx && !ly) this.padSprint = false;
    if (this.padSprint) keys.ShiftLeft = true;
    this.padKeys = keys;
    this.padMove = lx || ly ? { x: lx, y: -ly } : null;
    this.padAttack = now[7];
    if (edge(7)) this.pressed.PadAttack = true;
    this.padBlock = now[6];
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    this.mx += rx * Math.abs(rx) * 900 * dt * this.sens;
    this.my += ry * Math.abs(ry) * 650 * dt * this.sens;
    this.padHeld = now;
  }
  hit(...codes) { const h = codes.some(c => this.pressed[c]); return h; }
  endFrame() { this.pressed = {}; this.mx = 0; this.my = 0; }
  axis() {
    let x = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let y = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    if (this.move.x || this.move.y) { x = this.move.x; y = this.move.y; }
    else if (this.padMove && !x && !y) { x = this.padMove.x; y = this.padMove.y; }
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
    this.yaw = Math.PI; this.pitch = 0.2; this.dist = 6.8;
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
    // swordplay
    this.chargeT = 0; this.charging = false; this.blockT = 9; this.lastBlockAt = -9; this.counterT = 0; this.comboAt = -9; this.queued = null; this.dodgeAge = 9; this.lock = null; this.clock = 0;
  }
  get cls() { return this.g.kit(); }
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
    this.counterT = Math.max(0, this.counterT - dt);
    this.dodgeAge += dt; this.clock += dt;
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
    const ranged = this.cls.style !== 'melee';
    if (this.lock && (this.lock.dead || this.lock.zone !== g.zone || this.lock.pos.distanceTo(this.pos) > 32 || !g.isHostile(this.lock))) this.lock = null;
    if (!frozen && this.state !== 'stagger') {
      if (input.hit('KeyE')) g.interact();
      if (input.hit('KeyH')) g.whistle();
      if (input.hit('KeyR')) g.drinkPotion();
      if (input.hit('KeyT')) this.toggleLock();
      if (!this.mount && !deep) {
        // dodge — also cancels the tail of a swing
        if (input.hit('KeyQ', 'ControlLeft', 'AltLeft') && (this.state === 'move' || (this.state === 'attack' && this.struck))) this.dodge(moving ? wish : this.lock ? fwd.clone().negate() : fwd.clone().negate());
        if (input.hit('Digit1')) this.ability(0, wish);
        if (input.hit('Digit2')) this.ability(1, wish);
      }
      const tap = input.hit('Mouse0', 'KeyF', 'PadAttack') || input.touch.attackHit;
      const held = input.attackHeld;
      if (!deep) {
        if (ranged || this.mount) {
          if (tap || (held && this.state === 'move' && this.atkT <= 0)) this.attack(wish);
          this.charging = false;
        } else {
          // melee: tap for a quick light attack, hold and release for a slow heavy one that breaks guards
          if (tap) { this.charging = true; this.chargeT = 0; this.chargeFull = false; }
          if (this.charging) {
            if (held && !input.hit('KeyF')) {
              this.chargeT += dt;
              if (this.chargeT > 0.28) this.actor.setTint(0xffc060, Math.min(0.55, (this.chargeT - 0.28) * 0.9));
              if (this.chargeT > 0.85 && !this.chargeFull) { this.chargeFull = true; g.sfx.chime && g.sfx.chime(); }
              if (this.chargeT >= 1.15) { this.charging = false; this.attack(wish, 'heavy'); }
            } else { this.charging = false; this.attack(wish, this.chargeT >= 0.28 ? 'heavy' : 'light'); }
            if (!this.charging) this.actor.clearTint();
          }
        }
      }
      input.touch.attackHit = false;
    } else if (this.charging) { this.charging = false; this.actor.clearTint(); }
    // ranged heroes aim with the right button (zoom over the shoulder); everyone else blocks — and parries
    this.aimMode = ranged && !frozen && !deep && input.blockHeld;
    const wantBlock = !ranged && !frozen && !this.mount && !deep && input.blockHeld && (this.state === 'move' || (this.state === 'attack' && this.struck));
    if (!frozen && !this.mount && !deep && input.blockHeld && !this.blockWas && this.state !== 'dodge' && g.tryCounter()) { this.blockWas = true; }
    this.blockWas = input.blockHeld;
    if (wantBlock && !this.blocking) {
      if (this.state === 'attack') { this.state = 'move'; this.queued = null; }
      // the parry window opens when you raise your guard — but not if you keep flicking it
      this.blockT = this.clock - this.lastBlockAt < 0.45 ? 0.3 : 0;
      this.lastBlockAt = this.clock;
      if (this.charging) { this.charging = false; this.actor.clearTint(); }
    }
    this.blocking = wantBlock;
    if (this.blocking) this.blockT += dt;
    if (this.aimMode && !this.mount) this.rot += angleTo(this.rot, this.yaw + Math.PI) * Math.min(1, dt * 14);
    // locked on: the camera keeps the target in view and you face it
    if (this.lock && !frozen) {
      const dx = this.lock.pos.x - this.pos.x, dz = this.lock.pos.z - this.pos.z;
      this.yaw += angleTo(this.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 6);
      this.pitch += (0.28 - this.pitch) * Math.min(1, dt * 3);
    }

    // movement
    const sprinting = !frozen && moving && (input.down('ShiftLeft', 'ShiftRight') || input.touch.sprint) && this.stamina > 2 && !this.blocking && !this.charging;
    if (sprinting) { this.stamina -= dt * (this.mount ? 10 : 18); this.staminaWait = 0.9; }
    else if ((this.staminaWait -= dt) <= 0) this.stamina = Math.min(100, this.stamina + dt * (this.blocking ? 9 : this.state === 'attack' ? 12 : 26));

    let speed = this.mount ? (sprinting ? 26 : 14) : sprinting ? 10.5 : 6.4;
    if (this.aimMode && !this.mount) speed = 3.4;
    if (deep) speed = 3.6;
    if (this.blocking) speed = 2.6;
    if (this.charging && this.chargeT > 0.2) speed = 2.2;
    if (this.lock && !sprinting && !this.mount) speed *= 0.85;
    if (this.state === 'attack') speed *= this.mount ? 0.8 : 0.25;
    if (this.mount) speed *= { pony: 0.85, bay: 1, black: 1.12, white: 1.25 }[this.mount.breed] || 1;
    if (g.slowT > 0) speed *= 0.6;
    if (this.state === 'dodge') {
      this.dodgeT -= dt;
      const k = Math.max(0.35, this.dodgeT / 0.42);
      this.vel.x = this.dodgeDir.x * 14 * k; this.vel.z = this.dodgeDir.z * 14 * k;
      if (this.dodgeT <= 0) this.state = 'move';
    } else if (this.state === 'stagger') {
      this.vel.x *= 0.85; this.vel.z *= 0.85;
      if ((this.staggerT -= dt) <= 0) this.state = 'move';
    } else if (this.state === 'attack' && this.lunge) {
      // the bound toward the target sets the velocity itself
    } else {
      const target = wish.clone().multiplyScalar(speed * Math.min(1, ax.l + (this.mount ? 0 : 0)));
      const acc = this.mount ? 3.5 : this.onGround ? 14 : 3;
      this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * acc);
      this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * acc);
    }
    // turning: face where you go, or where you aim when attacking
    if (this.state === 'attack' && this.lunge && !this.struck) {
      const L = this.lunge, dx = L.t.pos.x - this.pos.x, dz = L.t.pos.z - this.pos.z, dd = Math.hypot(dx, dz) - (L.t.def.boss ? 0.9 * (L.t.def.scale || 1) : 0);
      if (dd > L.stop && !L.t.dead) { this.vel.x = (dx / Math.hypot(dx, dz)) * L.speed; this.vel.z = (dz / Math.hypot(dx, dz)) * L.speed; this.faceTo = Math.atan2(dx, dz); }
      else { this.vel.x *= 0.3; this.vel.z *= 0.3; this.lunge = null; }
    }
    if (this.state === 'attack' && this.faceTo !== undefined) this.rot += angleTo(this.rot, this.faceTo) * Math.min(1, dt * 18);
    else if (this.lock && !sprinting && !this.mount && this.state !== 'dodge') this.rot += angleTo(this.rot, Math.atan2(this.lock.pos.x - this.pos.x, this.lock.pos.z - this.pos.z)) * Math.min(1, dt * 12);
    else if (moving && this.state !== 'dodge') this.rot += angleTo(this.rot, Math.atan2(wish.x, wish.z)) * Math.min(1, dt * (this.mount ? 5 : 12));
    if (this.blocking && !this.lock) this.rot += angleTo(this.rot, this.yaw + Math.PI) * Math.min(1, dt * 10);

    // jump and gravity
    if (!frozen && (input.hit('Space') || input.touch.jumpHit) && this.onGround && !deep && this.state === 'move') { this.vel.y = this.mount ? 9 : 8.4; this.onGround = false; this.jumped = true; g.sfx.swish(); }
    input.touch.jumpHit = false;
    this.vel.y -= 24 * dt;
    this.pos.addScaledVector(this.vel, dt);
    // keep inside the world and out of walls
    if (g.zone === 'world') { this.pos.x = THREE.MathUtils.clamp(this.pos.x, -1040, 1040); this.pos.z = THREE.MathUtils.clamp(this.pos.z, -1040, 1040); }
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

    // a counter: the blow lands a beat after you turn into it
    if (this.state === 'counter') {
      this.vel.x *= 0.5; this.vel.z *= 0.5;
      if (this.pendingCounter && (this.pendingCounter.t -= dt) <= 0) { const L = this.pendingCounter.list; this.pendingCounter = null; g.counterHit(L); }
      if ((this.counterAnim -= dt) <= 0) { this.state = 'move'; this.comboAt = this.clock; this.lastKind = 'light'; }
    }
    // attacks resolve mid-swing
    if (this.state === 'attack') {
      this.atkT -= dt;
      if (!this.struck && this.atkT <= this.hitAt) { this.struck = true; this.strike(); }
      if (this.atkT <= 0) { this.state = 'move'; this.comboAt = this.clock; if (this.queued) { const q = this.queued; this.queued = null; this.attack(wish, q); } }
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
    this.updateLockMark(dt);
  }

  animate(dt, moving, sprinting, deep) {
    const a = this.actor;
    if (this.state === 'attack' || this.state === 'dodge' || this.state === 'stagger' || this.state === 'cast' || this.state === 'counter') return;
    let want;
    if (this.mount) want = 'Sit_Chair_Idle';
    else if (!this.onGround && this.jumped) want = 'Jump_Idle';
    else if (this.blocking) want = 'Blocking';
    else if (this.charging && this.chargeT > 0.2) want = 'Block';
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
    let dist = this.aimMode ? 3.6 : (this.mount ? 9 : g.bossActive ? 8.5 : g.inCombat ? this.dist * 1.12 : this.dist) * (g.zone === 'barrow' ? 0.85 : g.zone === 'inside' ? 0.62 : 1);
    if (g.finalT > 0) dist *= 0.55;
    const dir = V3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const side = V3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(this.aimMode ? 1.15 : g.aiming ? 0.7 : 0.35);
    let d2 = dist;
    // pull in when something is in the way
    for (let k = 1; k <= 8; k++) {
      const p = head.clone().addScaledVector(dir, (dist * k) / 8);
      if (g.zone !== 'world' || g.inTown ? g.phys.blocked(head.x, head.z, p.x, p.z, 0.35) && (g.zone !== 'world' || p.y < head.y + 9) : false) { d2 = (dist * (k - 1)) / 8; break; }
      if (g.zone === 'world' && p.y < g.phys.ground(p.x, p.z) + 0.4) { d2 = (dist * (k - 1)) / 8; break; }
    }
    d2 = Math.max(1.6, d2);
    const want = head.clone().addScaledVector(dir, d2).add(side);
    if (g.zone === 'world') want.y = Math.max(want.y, g.phys.ground(want.x, want.z) + 0.6);
    if (g.zone === 'inside' && g.rooms.ceil) {
      const R = g.rooms, cx = 5000, hw = R.W / 2 - 0.35, hd = R.D / 2 - 0.35;
      want.y = Math.min(want.y, R.ceil - 0.5);
      want.x = THREE.MathUtils.clamp(want.x, cx - hw, cx + hw); want.z = THREE.MathUtils.clamp(want.z, -hd, hd);
    }
    this.camPos.lerp(want, Math.min(1, dt * 14));
    // look past the hero, not at them: the crosshair then sits level with the horizon instead of over their head
    const ahead = (this.aimMode ? 30 : 14) * Math.max(0, 1 - Math.max(0, this.pitch) / 0.85);
    const lookAt = head.clone().add(side).add(V3(0, 0.5, 0)).addScaledVector(V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), ahead);
    this.camLook.lerp(lookAt, Math.min(1, dt * 18));
    const fov = (this.aimMode ? 0.72 : 1) * (g.baseFov || 60) * (g.finalT > 0 ? 0.78 : 1) * (g.camPunch > 0 ? 0.93 : 1);
    if (Math.abs(g.camera.fov - fov) > 0.1) { g.camera.fov += (fov - g.camera.fov) * Math.min(1, dt * 10); g.camera.updateProjectionMatrix(); }
    if (!g.cineActive) { g.camera.position.copy(this.camPos); g.camera.lookAt(this.camLook); }
    if (g.shakeT > 0) { g.camera.position.x += (Math.random() - 0.5) * g.shakeP; g.camera.position.y += (Math.random() - 0.5) * g.shakeP; }
  }

  // ------------------------------------------------------------ fighting
  aimDir() {
    const to = this.aim().point;
    return to.clone().sub(this.pos.clone().add(V3(0, 1.6, 0))).normalize();
  }
  // What the crosshair is on: a ray from the camera through the middle of the screen.
  aim() {
    const g = this.g, o = g.camera.position.clone(), dir = new THREE.Vector3();
    g.camera.getWorldDirection(dir);
    let best = null, bt = 140;
    for (const e of g.targetsForPlayer()) {
      const c = e.pos.clone().add(V3(0, (e.actor.height || 2.2) * (e.def.scale || 1) * 0.5, 0));
      const t = c.clone().sub(o).dot(dir);
      if (t < 2 || t > bt) continue;
      const miss = o.clone().addScaledVector(dir, t).distanceTo(c);
      const r = (0.9 + (e.def.scale || 1) * 0.6 + (e.flying ? 2 : 0)) + t * 0.035; // a little aim assist that grows with distance
      if (miss < r) { best = e; bt = t; }
    }
    if (best) return { point: best.pos.clone().add(V3(0, (best.actor.height || 2.2) * (best.def.scale || 1) * 0.55, 0)), target: best };
    for (let t = 3; t < 140; t += 1.5) {
      const p = o.clone().addScaledVector(dir, t);
      if (p.y < g.phys.ground(p.x, p.z) + 0.05) return { point: p, target: null };
    }
    return { point: o.addScaledVector(dir, 140), target: null };
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
  attack(wish, kind = 'light') {
    const C = this.cls, g = this.g;
    const ranged = C.style !== 'melee';
    const melee = !ranged || (this.mount && C.style !== 'magic' && C.style !== 'ranged');
    // mid-swing: only the end of a swing can chain into the next one; mashing early does nothing
    if (this.state === 'attack') { if (melee && !ranged && this.struck && this.atkT < this.rate * 0.5) this.queued = kind; return; }
    if (this.state !== 'move' || this.atkT > 0) return;
    const heavy = kind === 'heavy' && !ranged && !this.mount;
    const cost = ranged ? 4 : heavy ? 20 : 9;
    if (this.stamina < 3 && !ranged) { g.fx.text(this.pos.clone().add(V3(0, 2.4, 0)), 'out of breath', 'miss small'); g.ui.staminaFlash && g.ui.staminaFlash(); return; }
    this.stamina = Math.max(0, this.stamina - cost); this.staminaWait = 0.7;
    const aim = this.aimDir();
    const meleeDir = wish.lengthSq() > 0.01 ? wish : V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const faceDir = V3(Math.sin(this.rot), 0, Math.cos(this.rot));
    // who to hit: the one you push toward, else the one you face, else the one the camera looks at, else whoever is closest
    const t = ranged ? (this.aimed = this.aim()).target : this.lock
      || (wish.lengthSq() > 0.01 && this.pickTarget(9.5, 0.8, wish))
      || this.pickTarget(C.reach + 3, 1.3, faceDir)
      || this.pickTarget(9.5, 0.9, meleeDir)
      || this.pickTarget(this.mount ? C.reach + 2 : 6.5, Math.PI, faceDir);
    this.target = t;
    this.faceTo = t ? Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : ranged || this.mount ? Math.atan2(aim.x, aim.z) : this.rot;
    this.state = 'attack';
    // a chain: three quick blows, the third one hits hardest
    this.combo = this.clock - this.comboAt < 0.55 && this.lastKind === 'light' && !heavy ? (this.combo + 1) % 3 : 0;
    this.lastKind = kind;
    this.finisher = !ranged && !heavy && this.combo === 2;
    let rate = C.rate * (this.rageT > 0 ? 0.8 : 1) * (heavy ? 1.6 : this.finisher ? 1.15 : 1) * (this.stamina < 10 && !ranged ? 1.3 : 1);
    this.rate = rate;
    this.atkT = rate;
    this.hitAt = rate * (ranged ? 0.55 : heavy ? 0.42 : 0.5);
    this.struck = false;
    this.heavy = heavy;
    const name = heavy ? C.heavy || '2H_Melee_Attack_Chop' : C.attacks[this.combo % C.attacks.length];
    // freeflow: close the gap to the target in one bound, so every blow lands
    this.lunge = null;
    if (t && !ranged && !this.mount) {
      const dd = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) - (t.def.boss ? 0.9 * (t.def.scale || 1) : 0);
      const stop = Math.max(1.4, C.reach * 0.7);
      if (dd > stop) { this.lunge = { t, speed: Math.min(30, (dd - stop) / Math.max(0.12, this.hitAt * 0.9)), stop }; if (dd > 4) { this.iframes = Math.max(this.iframes, 0.15); g.sfx.swish(); } }
    }
    this.actor.play(this.mount ? '1H_Melee_Attack_Slice_Horizontal' : name, { once: true, fade: 0.06, speed: (1.15 / (rate / 0.7)) * 0.9 * (heavy ? 1.25 : 1), then: () => {} });
    // step into a heavy blow
    if (heavy) { const f = V3(Math.sin(this.faceTo), 0, Math.cos(this.faceTo)); this.vel.x += f.x * 6; this.vel.z += f.z * 6; }
    g.sfx.swish();
  }
  strike() {
    const g = this.g, C = this.cls;
    if (C.style === 'melee' || this.mount && C.style !== 'magic' && C.style !== 'ranged') {
      const reach = C.reach + 0.5 + (this.mount ? 1.2 : 0) + (this.heavy ? 0.5 : 0);
      const hits = g.targetsForPlayer().filter(e => {
        const to = e.pos.clone().sub(this.pos); to.y = 0;
        const dd = to.length() - (e.def.boss ? 0.9 * (e.def.scale || 1) : 0);
        if (dd > reach) return false;
        const ang = Math.abs(angleTo(this.rot, Math.atan2(to.x, to.z)));
        return ang < (this.heavy ? 1.4 : 1.15) || dd < 1.2;
      });
      // also catch innocent bystanders, because that is how crime works
      const bystanders = g.peopleNear(this.pos, reach).filter(p => Math.abs(angleTo(this.rot, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z))) < 1.0);
      // the one you lunged at is always caught by the swing
      const T0 = this.target;
      if (T0 && !T0.dead && !hits.includes(T0) && g.isHostile(T0) && Math.hypot(T0.pos.x - this.pos.x, T0.pos.z - this.pos.z) - (T0.def.boss ? 0.9 * (T0.def.scale || 1) : 0) < reach + 1.4) hits.unshift(T0);
      const o = { kind: 'weapon', heavy: this.heavy, finisher: this.finisher };
      hits.slice(0, this.heavy ? 4 : 3).forEach(e => g.playerHits(e, { ...o }));
      bystanders.forEach(p => g.playerHits(p, { kind: 'weapon' }));
      if (!hits.length && !bystanders.length) g.sfx.swish();
      if (this.heavy && hits.length) g.shake(0.25);
    } else {
      const from = this.pos.clone().add(V3(0, this.mount ? 3.2 : 1.6, 0)).addScaledVector(V3(Math.sin(this.rot), 0, Math.cos(this.rot)), 0.8);
      // fire at whatever is under the crosshair now
      const a = this.aim(), t = a.target && !a.target.dead ? a.target : null;
      const to = a.point;
      g.shoot({ from, to, kind: C.style === 'magic' ? 'magic' : 'bolt', speed: C.style === 'magic' ? 48 : 85, life: 2, homing: t ? () => (t.dead ? null : t.pos.clone().add(V3(0, (t.actor.height || 2) * (t.def.scale || 1) * 0.55, 0))) : null, by: 'player' });
      g.sfx[C.style === 'magic' ? 'zap' : 'twang']();
      g.kick = 0.05;
    }
  }
  dodge(dir) {
    if (this.stamina < 16 || !this.onGround) { if (this.stamina < 16) this.g.fx.text(this.pos.clone().add(V3(0, 2.4, 0)), 'out of breath', 'miss small'); return; }
    this.stamina -= 20; this.staminaWait = 0.8;
    this.state = 'dodge';
    this.queued = null;
    this.dodgeT = 0.42;
    this.iframes = 0.36;
    this.dodgeAge = 0;
    this.dodgeDir = dir.clone().setY(0).normalize();
    // locked on, you roll around the enemy and keep facing it
    let anim = 'Dodge_Forward';
    if (this.lock) {
      const side = angleTo(this.rot, Math.atan2(this.dodgeDir.x, this.dodgeDir.z));
      anim = Math.abs(side) < 0.8 ? 'Dodge_Forward' : Math.abs(side) > 2.3 ? 'Dodge_Backward' : side > 0 ? 'Dodge_Left' : 'Dodge_Right';
    } else this.rot = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    this.actor.play(anim, { once: true, fade: 0.05, speed: 1.5, then: () => {} });
    this.g.sfx.swish();
  }
  // lock on to the enemy nearest the middle of the screen (T, middle mouse, R3)
  toggleLock() {
    if (this.lock) { this.lock = null; return; }
    const g = this.g, f = V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.lock = this.pickTarget(26, 1.1, f) || this.pickTarget(14, Math.PI, f);
    if (!this.lock) g.ui.toast('No enemy to lock on to');
  }
  updateLockMark() {
    const g = this.g;
    if (!this.lockMark) {
      this.lockMark = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      this.lockMark.rotation.x = -Math.PI / 2;
      g.scene.add(this.lockMark);
    }
    const t = this.lock;
    this.lockMark.visible = !!t;
    if (!t) return;
    const s = (t.def.scale || 1) * (t.def.boss ? 1.3 : 1);
    this.lockMark.scale.setScalar(s * (1 + Math.sin(this.clock * 6) * 0.06));
    this.lockMark.position.set(t.pos.x, (t.flying ? g.phys.ground(t.pos.x, t.pos.z) : t.pos.y) + 0.08, t.pos.z);
    this.lockMark.material.color.set(t.stunT > 0 ? 0xffd040 : 0xff5040);
  }
  stagger(secs = 0.35, from) {
    if (this.state === 'dodge' || this.mount) return;
    if (this.charging) { this.charging = false; this.actor.clearTint(); }
    this.queued = null; this.blocking = false;
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
      const a = this.aim(), t = a.target;
      const from = this.pos.clone().add(V3(0, 1.8, 0));
      const to = a.point;
      this.rot = Math.atan2(to.x - this.pos.x, to.z - this.pos.z);
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
      const a = this.aim(), t = a.target;
      const spot = t ? t.pos.clone() : a.point.distanceTo(this.pos) < 45 ? a.point.clone() : this.pos.clone().addScaledVector(a.point.clone().sub(this.pos).setY(0).normalize(), 20);
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
