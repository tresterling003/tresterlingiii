// ================= FX: particles, shockwaves, shake, commentary =================
class Particles {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.grow = new Float32Array(max); this.col = new Float32Array(max * 4); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSize', this.aSize);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: innerHeight * 0.5 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol;
        void main(){ vCol=aCol; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=aSize*uScale/max(0.1,-mv.z); }`,
      fragmentShader: `varying vec4 vCol; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; float a=smoothstep(0.5,0.0,r); gl_FragColor=vec4(vCol.rgb, vCol.a*a); }`,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
  }
  spawn(p, v, life, size, color, alpha = 1, opts = {}) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = opts.grow || 0; this.drag[i] = opts.drag ?? 1.5; this.grav[i] = opts.grav ?? 9.8;
    const c = color.isColor ? color : new THREE.Color(color); this.col.set([c.r, c.g, c.b, alpha], i * 4);
  }
  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt; if (this.life[i] <= 0) continue;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.01) { this.pos[i * 3 + 1] = 0.01; this.vel[i * 3 + 1] *= -0.2; }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      // compact live particles to the front
      if (w !== i) { for (const [arr, s] of [[this.pos, 3], [this.vel, 3], [this.col, 4]]) for (let k2 = 0; k2 < s; k2++) arr[w * s + k2] = arr[i * s + k2]; this.life[w] = this.life[i]; this.maxLife[w] = this.maxLife[i]; this.size[w] = this.size[i]; this.grow[w] = this.grow[i]; this.drag[w] = this.drag[i]; this.grav[w] = this.grav[i]; }
      this.aPos.array.set(this.pos.subarray(w * 3, w * 3 + 3), w * 3);
      this.aCol.array[w * 4] = this.col[w * 4]; this.aCol.array[w * 4 + 1] = this.col[w * 4 + 1]; this.aCol.array[w * 4 + 2] = this.col[w * 4 + 2]; this.aCol.array[w * 4 + 3] = this.col[w * 4 + 3] * Math.min(1, t * 2.5);
      this.aSize.array[w] = this.size[w];
      w++;
    }
    this.n = w;
    this.points.geometry.setDrawRange(0, w);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

const FX = {
  sparks: null, dust: null, rings: [], shakeAmp: 0, shakeT: 0, slowmo: 1, slowmoT: 0, flashEl: null,
  init() {
    this.sparks = new Particles(600, true); this.dust = new Particles(400, false);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), ringMat.clone()); m.visible = false; scene.add(m); this.rings.push({ m, t: 0, life: 0 }); }
  },
  sweat(p, dir, power = 1) {
    for (let i = 0; i < 26 * power; i++) {
      _v1.set(dir.x + gauss() * 0.6, Math.abs(gauss()) * 0.9 + 0.3, dir.z + gauss() * 0.6).normalize().multiplyScalar(2 + Math.random() * 4 * power);
      this.sparks.spawn(p, _v1, 0.35 + Math.random() * 0.4, 0.035 + Math.random() * 0.04, new THREE.Color().setHSL(0.56, 0.4, 0.75 + Math.random() * 0.2), 0.9, { drag: 1.2, grav: 9 });
    }
  },
  impact(p, color = 0xffffff, power = 1) {
    for (let i = 0; i < 18 * power; i++) {
      _v1.set(gauss(), gauss(), gauss()).normalize().multiplyScalar(3 + Math.random() * 5);
      this.sparks.spawn(p, _v1, 0.18 + Math.random() * 0.22, 0.05 + Math.random() * 0.05, color, 1, { drag: 4, grav: 0 });
    }
    const r = this.rings.find(r => r.life <= 0) || this.rings[0];
    r.m.position.copy(p); r.m.quaternion.copy(camera.quaternion); r.t = 0; r.life = 0.35; r.power = power; r.m.material.color.set(color); r.m.visible = true;
  },
  dustPuff(p, n = 6, spread = 1) {
    for (let i = 0; i < n; i++) {
      _v1.set(gauss() * spread, Math.random() * 0.6, gauss() * spread);
      _v2.set(p.x + gauss() * 0.1, 0.05, p.z + gauss() * 0.1);
      this.dust.spawn(_v2, _v1, 0.6 + Math.random() * 0.5, 0.18 + Math.random() * 0.15, 0xd8c3a0, 0.22, { drag: 3, grav: -0.3, grow: 0.5 });
    }
  },
  shake(a) { if (!SETTINGS.shake) return; this.shakeAmp = Math.max(this.shakeAmp, a); },
  slowMo(scale, dur) { this.slowmo = scale; this.slowmoT = dur; },
  update(dtReal) {
    this.sparks.update(dtReal); this.dust.update(dtReal);
    for (const r of this.rings) {
      if (r.life <= 0) continue; r.t += dtReal; const k = r.t / r.life;
      if (k >= 1) { r.life = 0; r.m.visible = false; continue; }
      r.m.scale.setScalar(0.2 + k * 1.3 * r.power); r.m.material.opacity = (1 - k) * 0.8; r.m.quaternion.copy(camera.quaternion);
    }
    this.shakeAmp = damp(this.shakeAmp, 0, 7, dtReal);
    if (this.slowmoT > 0) { this.slowmoT -= dtReal; if (this.slowmoT <= 0) this.slowmo = 1; }
  },
  timeScale() { return this.slowmo; },
  clear() { this.sparks.clear(); this.dust.clear(); for (const r of this.rings) { r.life = 0; r.m.visible = false; } },
};

// ================= COMMENTARY =================
const BOOTH = ['MARV KESSLER', 'DEE ALVAREZ'];
const LINES = {
  hit: ['{t} drills {v}! That one had some mustard on it.', '{v} is OUT — {t} found the target.', 'Direct hit from {t}! {v} heads to the bench.', '{t} with the rocket, {v} never saw it coming.', 'Down goes {v}! Credit {t}.'],
  hitBig: ['OH! {t} absolutely LASERS {v}!', 'That is a missile from {t}! {v} felt that one in the third row.', '{t} put everything into that — {v} is gone!'],
  perfect: ['Perfect release from {t}. You cannot teach that timing.', 'Textbook mechanics from {t} — perfect release!'],
  catch: ['WHAT A CATCH by {c}! {t} is out and {r} is back in!', '{c} SNAGS it! {t} has to sit, and here comes {r}!', 'Hands like glue! {c} brings {r} back into the game!'],
  catchNoReturn: ['{c} pulls it in! {t} is out!', 'Great hands from {c} — {t} has to take a seat!'],
  bobble: ['{c} bobbles it! {t} gets the out anyway.', 'Can\'t hang on — {c} drops the catch!'],
  block: ['Blocked! {b} deflects it away.', '{b} gets the ball up in time — nice block!'],
  fumble: ['{b} tries to block and loses the handle — that\'s an out!', 'Fumble on the block! {b} is out!'],
  dodge: ['{d} slips it!', 'Nice juke by {d}.', '{d} with the matador move!', 'Can\'t touch {d}!'],
  ghost: ['{d} GHOSTS through it! Unreal agility!'],
  lastMan: ['{p} is the last one standing for the {team}!', 'It\'s all on {p} now — {n} on one!', 'Everybody\'s looking at {p}. Last hope for the {team}!'],
  captain: ['{p} is a CAPTAIN — and the captain\'s armband just lit up! Team boost!'],
  gamePoint: ['One more out and this game is over!'],
  comeback: ['The {team} are clawing their way back into this!', 'Do NOT count out the {team}!'],
  rush: ['And we are underway! Here comes the opening rush!', 'The whistle blows — everybody to the line!'],
  gameWin: ['That\'s the game! The {team} take it!', 'Game over — the {team} close it out!'],
  matchWin: ['THE {team} WIN THE MATCH!', 'Ballgame! The {team} take the series!'],
  fake: ['{t} with the pump fake — got {v} to bite!'],
};
const COMM = {
  recent: [], lineTimer: 0, coTimer: 0,
  say(kind, vars = {}, force = false) {
    const pool = LINES[kind]; if (!pool) return;
    if (!force && this.lineTimer > 0 && Math.random() < 0.6) return;
    let s = pool.filter(l => !this.recent.includes(l)); if (!s.length) s = pool;
    const line = pick(s); this.recent.push(line); if (this.recent.length > 8) this.recent.shift();
    const txt = line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    const el = $('#cline'); el.innerHTML = `<div class="who">${BOOTH[(Math.random() * 2) | 0]}</div><div class="txt">${txt}</div>`;
    el.classList.add('on'); this.lineTimer = 3.6;
  },
  callout(text, sub = '', color = '#fff', dur = 1.6) {
    const el = $('#callout');
    el.innerHTML = `<div class="co" style="color:${color}">${text}${sub ? `<small>${sub}</small>` : ''}</div>`;
    this.coTimer = dur;
  },
  update(dt) {
    if (this.lineTimer > 0) { this.lineTimer -= dt; if (this.lineTimer <= 0) $('#cline').classList.remove('on'); }
    if (this.coTimer > 0) { this.coTimer -= dt; if (this.coTimer <= 0) { const c = $('#callout .co'); if (c) { c.classList.add('out'); setTimeout(() => { if (this.coTimer <= 0) $('#callout').innerHTML = ''; }, 360); } } }
  },
  clear() { $('#callout').innerHTML = ''; $('#cline').classList.remove('on'); this.lineTimer = this.coTimer = 0; },
};
