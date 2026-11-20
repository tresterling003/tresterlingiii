// Everyone else: monsters, bosses, guards, villagers, horses, allies.
import * as THREE from 'three';
import { roll } from './player.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const walkAnim = e => (e.def.undead ? 'Walking_D_Skeletons' : 'Walking_A');
const runAnim = e => (e.def.undead ? 'Running_C' : 'Running_A');

export function moveToward(g, e, to, speed, dt, face = true) {
  const dx = to.x - e.pos.x, dz = to.z - e.pos.z, dd = Math.hypot(dx, dz);
  if (dd < 0.05) return dd;
  const step = Math.min(dd, speed * dt);
  e.pos.x += (dx / dd) * step;
  e.pos.z += (dz / dd) * step;
  if (face) e.rot += angleTo(e.rot, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
  if (!e.flying) {
    g.phys.resolve(e.pos, e.radius);
    e.pos.y = g.phys.ground(e.pos.x, e.pos.z);
  }
  return dd;
}
function faceTo(e, p, dt, k = 8) { e.rot += angleTo(e.rot, Math.atan2(p.x - e.pos.x, p.z - e.pos.z)) * Math.min(1, dt * k); }
function anim(e, name, opts) { if (e.actor.currentName !== name || (opts && opts.once)) e.actor.play(name, opts); }

// ------------------------------------------------------------------ monsters (and angry guards)
export function updateMob(g, e, dt) {
  const def = e.def, a = e.actor;
  if (e.dead) {
    e.deadT += dt;
    if (e.deadT > 5) a.root.position.y = e.pos.y - (e.deadT - 5) * 0.6;
    if (e.deadT > 8) a.root.visible = false;
    return;
  }
  if (e.hidden) return;
  e.cd -= dt;
  e.spCd -= dt;
  e.burnT -= dt;
  if (e.frozenT > 0) {
    e.frozenT -= dt;
    if (a.mixer) a.mixer.timeScale = 0;
    if (e.frozenT <= 0) { a.clearTint(); if (a.mixer) a.mixer.timeScale = 1; }
    return;
  }
  if (e.stunT > 0) { e.stunT -= dt; if (e.stunT <= 0 && e.stunFx) { e.stunFx = null; } return; }
  if (def.regen && e.hp < e.max && e.burnT <= 0 && e.state !== 'idle') { e.hp = Math.min(e.max, e.hp + def.regen * dt); if (Math.random() < dt) g.fx.text(e.pos.clone().add(V3(0, a.height * e.scale, 0)), 'regenerating', 'heal small'); }
  if (def.special === 'flyer') return updateWyvern(g, e, dt);

  const tgt = g.targetFor(e);
  const dist = tgt ? Math.hypot(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z) : Infinity;
  const fromHome = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);

  // neutral: waiting to be talked to (or ignored)
  if (e.neutral) {
    if (dist < 12) faceTo(e, tgt.pos, dt, 3);
    anim(e, e.idleAnim || 'Idle');
    return;
  }
  switch (e.state) {
    case 'idle': case 'wander': {
      if (tgt && (dist < def.aggro || e.provoked)) { e.state = 'chase'; e.provoked = false; g.alert(e); break; }
      // amble about near home
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = 3 + Math.random() * 5;
        e.wanderTo = e.patrol ? e.patrol[(e.pi = ((e.pi || 0) + 1) % e.patrol.length)] : V3(e.home.x + (Math.random() - 0.5) * 12, 0, e.home.z + (Math.random() - 0.5) * 12);
        if (e.patrol) e.wanderTo = V3(e.wanderTo[0], 0, e.wanderTo[1]);
      }
      if (e.wanderTo && Math.hypot(e.wanderTo.x - e.pos.x, e.wanderTo.z - e.pos.z) > 0.8) { moveToward(g, e, e.wanderTo, def.speed * 0.35, dt); anim(e, walkAnim(e)); }
      else anim(e, 'Idle');
      break;
    }
    case 'chase': {
      if (!tgt || (fromHome > (def.boss ? 70 : 48) && !e.patrol && e.team !== 'town')) { e.state = 'return'; break; }
      if (e.team === 'town' && !tgt) { e.state = 'idle'; break; }
      if (def.boss && doSpecial(g, e, tgt, dist, dt)) break;
      const ranged = def.kind !== 'melee';
      const reach = def.reach + (tgt.radius || 0.5) + (def.scale || 1) * 0.4;
      if (ranged) {
        if (dist > reach) { moveToward(g, e, tgt.pos, def.speed, dt); anim(e, runAnim(e)); }
        else if (dist < 6) { const away = e.pos.clone().sub(tgt.pos).setY(0).normalize().multiplyScalar(4).add(e.pos); moveToward(g, e, away, def.speed * 0.7, dt, false); faceTo(e, tgt.pos, dt); anim(e, walkAnim(e)); }
        else { faceTo(e, tgt.pos, dt); anim(e, 'Idle'); }
        if (dist < reach + 2 && e.cd <= 0 && g.mayAttack(e) && !g.phys.blocked(e.pos.x, e.pos.z, tgt.pos.x, tgt.pos.z)) windup(g, e, tgt);
      } else {
        // melee: close in, spreading out around the target a little
        const slot = tgt.pos.clone().add(V3(Math.sin(e.slot) * reach * 0.8, 0, Math.cos(e.slot) * reach * 0.8));
        // only a couple of enemies swing at you at once; the rest circle, waiting for an opening
        const waiting = !def.boss && !g.mayAttack(e);
        const want = waiting ? reach + 2.2 : reach;
        if (dist > want) { moveToward(g, e, dist > want + 4 ? tgt.pos : tgt.pos.clone().add(V3(Math.sin(e.slot) * want * 0.9, 0, Math.cos(e.slot) * want * 0.9)), def.speed * (e.rageK || 1), dt); anim(e, runAnim(e)); faceTo(e, tgt.pos, dt, 4); }
        else if (waiting) { e.slot += dt * 0.5; moveToward(g, e, tgt.pos.clone().add(V3(Math.sin(e.slot) * want, 0, Math.cos(e.slot) * want)), def.speed * 0.4, dt, false); faceTo(e, tgt.pos, dt); anim(e, walkAnim(e)); }
        else { faceTo(e, tgt.pos, dt); if (e.cd <= 0) windup(g, e, tgt); else anim(e, def.undead ? 'Idle_Combat' : 'Idle'); }
      }
      break;
    }
    case 'windup': {
      e.timer -= dt;
      if (e.tgt) faceTo(e, e.tgt.pos, dt, e.def.boss ? 2.5 : 6);
      if (e.timer <= 0) { strike(g, e); e.state = 'recover'; e.timer = 0.45; }
      break;
    }
    case 'recover': case 'special': {
      e.timer -= dt;
      if (e.timer <= 0) e.state = 'chase';
      break;
    }
    case 'return': {
      const dd = moveToward(g, e, e.home, def.speed, dt);
      anim(e, runAnim(e));
      e.hp = Math.min(e.max, e.hp + e.max * 0.2 * dt);
      if (dd < 1.5) { e.state = 'idle'; e.hp = e.max; }
      if (tgt && dist < def.aggro * 0.6 && fromHome < 30) e.state = 'chase';
      break;
    }
  }
}

function windup(g, e, tgt) {
  const def = e.def;
  e.state = 'windup';
  e.tgt = tgt;
  e.timer = def.kind === 'melee' ? (def.boss ? 0.62 : 0.48) : 0.55;
  e.cd = (def.boss ? 1.2 : 1.5) + Math.random() * (def.boss ? 0.8 : 1.4);
  const atk = (def.attacks || ['Unarmed_Melee_Attack_Punch_A'])[Math.floor(Math.random() * (def.attacks || [1]).length)];
  if (e.actor.procedural) e.actor.play('attack');
  else e.actor.play(def.model === 'wolf' ? 'Running_A' : atk, { once: true, fade: 0.08, speed: def.kind === 'melee' ? 1.25 : 1.1, then: () => {} });
  if (def.model === 'wolf') { const lunge = tgt.pos.clone().sub(e.pos).setY(0).normalize(); e.lunge = lunge; }
  if (def.boss) e.actor.flash(0xff4040, 160);
}
function strike(g, e) {
  const def = e.def, tgt = e.tgt;
  if (!tgt || tgt.dead) return;
  if (e.lunge) { e.pos.addScaledVector(e.lunge, 1.6); e.lunge = null; }
  if (def.kind === 'melee') {
    const dd = Math.hypot(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z);
    const ang = Math.abs(angleTo(e.rot, Math.atan2(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z)));
    if (dd < def.reach + 1.6 + (def.scale || 1) * 0.5 && ang < 1.3) g.mobHits(e, tgt, {});
    else g.fx.text(e.pos.clone().add(V3(0, 2.6, 0)), 'whiff', 'miss small');
  } else {
    const from = e.pos.clone().add(V3(0, 1.6 * (def.scale || 1), 0));
    const lead = tgt.vel ? tgt.pos.clone().addScaledVector(tgt.vel, 0.25) : tgt.pos.clone();
    const to = lead.add(V3(0, 1.3, 0));
    g.shoot({ from, to, kind: def.kind === 'caster' ? (def.undead ? 'green' : 'magic') : def.undead ? 'arrow' : 'arrow', speed: def.kind === 'caster' ? 20 : 34, by: e, life: 1.6 });
    g.sfx[def.kind === 'caster' ? 'zap' : 'twang']();
  }
}

// ------------------------------------------------------------------ boss move sets
function doSpecial(g, e, tgt, dist, dt) {
  const def = e.def;
  if (e.spCd > 0 || e.state !== 'chase') return false;
  const hpK = e.hp / e.max;
  if (def.special === 'cleave' && dist < 6.5) {
    special(g, e, 1.0, e.pos, 4.6, () => g.areaHit(e, e.pos, 4.6, roll(2, 8, 3), 'Cleave'), '2H_Melee_Attack_Spin');
    e.spCd = 6.5;
    return true;
  }
  if (def.special === 'cleave' && dist > 11 && dist < 26) {
    // charge!
    e.state = 'special'; e.timer = 0.9; e.spCd = 8;
    const dir = tgt.pos.clone().sub(e.pos).setY(0).normalize();
    g.fx.telegraph(tgt.pos.clone().setY(g.phys.ground(tgt.pos.x, tgt.pos.z)), 2.5, 0.8);
    e.actor.play('Running_A', { force: true });
    let t = 0;
    const run = () => { if (e.dead) return; t += 0.016; e.pos.addScaledVector(dir, 0.016 * 24); g.phys.resolve(e.pos, e.radius); e.pos.y = g.phys.ground(e.pos.x, e.pos.z); if (t < 0.7) requestAnimationFrame(run); else { g.areaHit(e, e.pos, 3, roll(2, 6, 3), 'Charge'); } };
    setTimeout(run, 250);
    if (!e.called && hpK < 0.5 && !g.hero.flags.vargAlone) { e.called = true; g.callBandits(e); }
    return true;
  }
  if (def.special === 'slam' && dist < 9) {
    const at = tgt.pos.clone();
    at.y = g.phys.ground(at.x, at.z);
    const r = def.scale > 1.5 ? 5 : 3.8;
    special(g, e, def.scale > 1.5 ? 1.15 : 0.95, at, r, () => { g.areaHit(e, at, r, roll(2, 8, 3), 'Slam'); g.shake(0.5); g.sfx.boom(); g.fx.burst(at.clone().add(V3(0, 0.5, 0)), 0xb09070, 40, 6, 3); }, '2H_Melee_Attack_Chop');
    e.spCd = def.scale > 1.5 ? 6 : 7;
    return true;
  }
  if (def.special === 'king') {
    if ((hpK < 0.66 && !e.summon1) || (hpK < 0.33 && !e.summon2)) {
      if (hpK < 0.33) e.summon2 = true; else e.summon1 = true;
      e.state = 'special'; e.timer = 1.6; e.spCd = 3;
      e.actor.play('Spellcast_Summon', { once: true, then: () => {} });
      g.ui.caption('"Rise. Serve your king."', 'bad');
      setTimeout(() => g.ui.caption(''), 2200);
      g.sfx.sting('evil');
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.spawnMob(i === 2 && hpK < 0.33 ? 'guardian' : 'bones', e.pos.x + Math.cos(a) * 5, e.pos.z + Math.sin(a) * 5, { rise: true, zone: e.zone, aggro: true }); }
      return true;
    }
    if (dist < 9 && Math.random() < 0.6) {
      special(g, e, 1.4, e.pos, 7.5, () => { g.areaHit(e, e.pos, 7.5, roll(3, 8, 0), 'Grave Chill', { save: 'might' }); g.flash('#7dffb0', 300); g.fx.burst(e.pos.clone().add(V3(0, 1, 0)), 0x50ff9a, 90, 12, 1); }, 'Spellcast_Long', 0x40ff90);
      e.spCd = hpK < 0.5 ? 6.5 : 8.5;
      return true;
    }
    if (dist > 9) {
      e.state = 'special'; e.timer = 1.1; e.spCd = 3.2;
      e.actor.play('Spellcast_Shoot', { once: true, then: () => {} });
      for (let i = 0; i < 3; i++) setTimeout(() => { if (!e.dead && tgt && !tgt.dead) g.shoot({ from: e.pos.clone().add(V3(0, 3.4, 0)), to: tgt.pos.clone().add(V3((i - 1) * 1.5, 1.2, 0)), kind: 'green', speed: 18, by: e, life: 2 }); }, 300 + i * 180);
      return true;
    }
  }
  return false;
}
function special(g, e, secs, at, r, fn, animName, color) {
  e.state = 'special';
  e.timer = secs + 0.5;
  g.fx.telegraph(at, r, secs, color || 0xff3030);
  e.actor.play(animName, { once: true, fade: 0.08, speed: 0.8, then: () => {} });
  e.actor.flash(0xff4040, 250);
  setTimeout(() => { if (!e.dead && !(e.frozenT > 0) && !(e.stunT > 0)) fn(); }, secs * 1000);
}

// Skarn the wyvern: circles above, swoops, lands to fight, takes off again.
function updateWyvern(g, e, dt) {
  const tgt = g.targetFor(e);
  const dist = tgt ? Math.hypot(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z) : Infinity;
  const ground = g.phys.ground(e.pos.x, e.pos.z);
  e.t = (e.t || 0) + dt;
  const a = e.actor;
  if (!e.awake) {
    e.flying = false; a.flying = 0;
    e.pos.y = ground;
    if (tgt && dist < e.def.aggro) { e.awake = true; e.phase = 'air'; e.phaseT = 9; g.alert(e); g.sfx.roar(); }
    return;
  }
  if (!tgt) { e.phase = 'air'; }
  e.phaseT -= dt;
  if (e.phase === 'air') {
    e.flying = true; a.flying = 1;
    const c = tgt ? tgt.pos : e.home, ang = e.t * 0.6;
    const want = V3(c.x + Math.cos(ang) * 18, ground + 13, c.z + Math.sin(ang) * 18);
    e.pos.lerp(want, Math.min(1, dt * 1.2));
    e.rot += angleTo(e.rot, ang + Math.PI / 2 + Math.PI) * Math.min(1, dt * 3);
    if (e.phaseT <= 0 && tgt) {
      e.swoops = (e.swoops || 0) + 1;
      if (e.swoops % 3 === 0) { e.phase = 'land'; e.phaseT = 8; }
      else { e.phase = 'swoop'; e.phaseT = 1.3; e.dive = tgt.pos.clone(); e.dive.y = g.phys.ground(e.dive.x, e.dive.z); g.fx.telegraph(e.dive, 4.5, 1.1); g.sfx.roar(); }
    }
  } else if (e.phase === 'swoop') {
    e.flying = true;
    const k = 1 - e.phaseT / 1.3;
    if (k > 0.55) { e.pos.lerp(e.dive.clone().add(V3(0, 1.5, 0)), Math.min(1, dt * 7)); a.play('attack'); }
    faceTo(e, e.dive, dt, 4);
    if (!e.hitDone && k > 0.85) { e.hitDone = true; g.areaHit(e, e.dive, 4.5, roll(2, 8, 4), 'Swoop'); g.shake(0.4); }
    if (e.phaseT <= 0) { e.hitDone = false; e.phase = 'air'; e.phaseT = 5 + Math.random() * 3; a.play('Idle'); }
  } else if (e.phase === 'land') {
    if (e.pos.y > ground + 0.2) { e.pos.y = Math.max(ground, e.pos.y - dt * 9); e.flying = true; a.flying = 1; }
    else {
      e.flying = false; a.flying = 0;
      e.pos.y = ground;
      if (tgt) {
        if (dist > 5) { moveToward(g, e, tgt.pos, 6, dt); }
        else { faceTo(e, tgt.pos, dt, 3); if (e.cd <= 0) { e.cd = 1.8; e.state = 'windup'; a.play('attack'); g.fx.telegraph(e.pos.clone().addScaledVector(V3(Math.sin(e.rot), 0, Math.cos(e.rot)), 3), 3, 0.6); setTimeout(() => { if (!e.dead && e.frozenT <= 0) g.areaHit(e, e.pos.clone().addScaledVector(V3(Math.sin(e.rot), 0, Math.cos(e.rot)), 3), 3.2, roll(2, 8, 3), 'Bite', { poison: true }); a.play('Idle'); }, 600); } }
      }
      e.cd -= dt;
    }
    if (e.phaseT <= 0) { e.phase = 'air'; e.phaseT = 8; g.sfx.roar(); }
  }
}

// ------------------------------------------------------------------ townsfolk
export function updateVillager(g, e, dt) {
  const a = e.actor;
  if (e.dead) { e.deadT += dt; if (e.deadT > 6) a.root.visible = false; return; }
  e.panic -= dt;
  if (e.panic > 0 && e.threat) {
    const away = e.pos.clone().sub(e.threat).setY(0).normalize().multiplyScalar(6).add(e.pos);
    moveToward(g, e, away, 7.5, dt);
    anim(e, 'Running_A');
    if (Math.random() < dt * 0.4) g.fx.text(e.pos.clone().add(V3(0, 2.8, 0)), ['Help!', 'Guards!', 'Aaah!'][Math.floor(Math.random() * 3)], 'say');
    return;
  }
  e.timer -= dt;
  if (e.timer <= 0) { e.timer = 4 + Math.random() * 8; const s = e.spots[Math.floor(Math.random() * e.spots.length)]; e.wanderTo = V3(s[0] + (Math.random() - 0.5) * 3, 0, s[1] + (Math.random() - 0.5) * 3); }
  if (e.wanderTo && Math.hypot(e.wanderTo.x - e.pos.x, e.wanderTo.z - e.pos.z) > 0.7) { moveToward(g, e, e.wanderTo, 2.2, dt); anim(e, 'Walking_A'); }
  else { anim(e, e.idleAnim || 'Idle'); if (g.player && g.player.pos.distanceTo(e.pos) < 4) faceTo(e, g.player.pos, dt, 2); }
}
export function updateNpc(g, e, dt) {
  const a = e.actor;
  const p = g.player;
  if (p && p.pos.distanceTo(e.pos) < 7 && !e.seated) faceTo(e, p.pos, dt, 3);
  else e.rot += angleTo(e.rot, e.face) * Math.min(1, dt * 2);
  anim(e, e.idleAnim || 'Idle');
  if (e.flinchT > 0) e.flinchT -= dt;
}
export function updateHorse(g, e, dt) {
  const a = e.actor;
  if (e.ridden) return;
  if (e.called && g.player) {
    const dd = moveToward(g, e, g.player.pos, 17, dt);
    if (a.gallop) a.gallop.timeScale = 1.2;
    if (dd < 3.5) { e.called = false; if (a.gallop) a.gallop.timeScale = 0; g.sfx.neigh && g.sfx.neigh(); }
    return;
  }
  e.timer -= dt;
  if (e.timer <= 0) { e.timer = 5 + Math.random() * 8; e.wanderTo = e.pen ? V3(e.pen.x + (Math.random() - 0.5) * e.pen.w, 0, e.pen.z + (Math.random() - 0.5) * e.pen.d) : null; }
  if (e.wanderTo && Math.hypot(e.wanderTo.x - e.pos.x, e.wanderTo.z - e.pos.z) > 1) { moveToward(g, e, e.wanderTo, 2.4, dt); if (a.gallop) a.gallop.timeScale = 0.3; }
  else if (a.gallop) a.gallop.timeScale = 0;
}
// a friendly fighter (the freed ghost knight)
export function updateAlly(g, e, dt) {
  const foes = g.targetsForPlayer().filter(f => f.zone === e.zone && !f.neutral);
  let best = null, bd = Infinity;
  for (const f of foes) { const dd = f.pos.distanceTo(e.pos); if (dd < bd) { bd = dd; best = f; } }
  e.cd -= dt;
  if (best && bd < 30) {
    if (bd > 2.8) { moveToward(g, e, best.pos, 7, dt); anim(e, 'Running_A'); }
    else { faceTo(e, best.pos, dt); if (e.cd <= 0) { e.cd = 1.1; e.actor.play('1H_Melee_Attack_Slice_Diagonal', { once: true, fade: 0.08, then: () => {} }); setTimeout(() => { if (!best.dead) g.allyHits(e, best); }, 300); } else anim(e, 'Idle'); }
  } else if (g.player) {
    const dd = g.player.pos.distanceTo(e.pos);
    if (dd > 5) { moveToward(g, e, g.player.pos, 7, dt); anim(e, 'Running_A'); } else anim(e, 'Idle');
  }
}
