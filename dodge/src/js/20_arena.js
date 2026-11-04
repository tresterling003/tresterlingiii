// ================= RENDERER / ARENA =================
const canvas = $('#gl');
const QUALITY = (() => {
  const q = SETTINGS.quality === 'auto' ? (isTouch ? 'medium' : 'high') : SETTINGS.quality;
  return { name: q, pr: q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.5) : 1, minPr: q === 'high' ? 0.9 : 0.7, shadows: q === 'high', shadowSize: 2048, crowd: q === 'high' ? 2400 : q === 'medium' ? 1000 : 600, aa: q !== 'low' };
})();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.aa, powerPreference: 'high-performance' });
renderer.setPixelRatio(QUALITY.pr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = QUALITY.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060b);
scene.fog = new THREE.Fog(0x04060b, 38, 85);
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35; pm.dispose(); }
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 160);
camera.position.set(0, 8, 16);

const ARENA = { teamObjs: [], boardTex: null, jumboCtx: null, jumboTex: null, crowdMat: null, lights: {} };

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, c);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}

// ---------- court floor ----------
const FLOOR_W = 26, FLOOR_D = 15; // meters covered by the painted floor texture
function drawCourt(x, w, h, home, away, homeLogo, uniH, uniA) {
  const ppm = w / FLOOR_W; const cx = w / 2, cy = h / 2; const X = (m) => cx + m * ppm, Y = (m) => cy + m * ppm;
  // wood planks
  x.fillStyle = '#c8955b'; x.fillRect(0, 0, w, h);
  const rnd = seeded(42); const plankH = 0.18 * ppm;
  for (let y = 0; y < h; y += plankH) {
    let px = -rnd() * 300;
    while (px < w) {
      const len = (1.2 + rnd() * 2.6) * ppm; const l = 0.48 + rnd() * 0.14;
      x.fillStyle = `hsl(${30 + rnd() * 6},${48 + rnd() * 12}%,${l * 100}%)`; x.fillRect(px, y, len, plankH);
      x.fillStyle = 'rgba(60,30,10,.35)'; x.fillRect(px, y, 1.5, plankH);
      for (let g = 0; g < 4; g++) { x.fillStyle = `rgba(90,50,20,${0.05 + rnd() * 0.07})`; x.fillRect(px, y + rnd() * plankH, len, 1); }
      px += len;
    }
    x.fillStyle = 'rgba(70,35,10,.28)'; x.fillRect(0, y, w, 1.2);
  }
  // apron (out of bounds) in deep navy with gloss
  x.fillStyle = '#0d1630';
  x.fillRect(0, 0, w, Y(-COURT.HZ - 0.02)); x.fillRect(0, Y(COURT.HZ + 0.02), w, h); x.fillRect(0, 0, X(-COURT.HX - 0.02), h); x.fillRect(X(COURT.HX + 0.02), 0, w, h);
  // team halves tinted
  const tint = (col, x0, x1, a) => { x.fillStyle = col; x.globalAlpha = a; x.fillRect(X(x0), Y(-COURT.HZ), (x1 - x0) * ppm, COURT.W * ppm); x.globalAlpha = 1; };
  tint(uniH.p, -COURT.HX, -COURT.HX + 2.2, 0.55); tint(uniA.p, COURT.HX - 2.2, COURT.HX, 0.55);
  tint(uniH.p, -COURT.ATTACK, 0, 0.12); tint(uniA.p, 0, COURT.ATTACK, 0.12);
  // lines
  x.strokeStyle = '#fbfbf6'; x.lineWidth = 0.06 * ppm;
  x.strokeRect(X(-COURT.HX), Y(-COURT.HZ), COURT.L * ppm, COURT.W * ppm);
  x.lineWidth = 0.1 * ppm; x.beginPath(); x.moveTo(X(0), Y(-COURT.HZ)); x.lineTo(X(0), Y(COURT.HZ)); x.stroke();
  x.lineWidth = 0.05 * ppm; x.setLineDash([0.4 * ppm, 0.25 * ppm]);
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(X(s * COURT.ATTACK), Y(-COURT.HZ)); x.lineTo(X(s * COURT.ATTACK), Y(COURT.HZ)); x.stroke(); }
  x.setLineDash([]);
  // center circle + logo
  x.beginPath(); x.arc(X(0), Y(0), 1.8 * ppm, 0, Math.PI * 2); x.fillStyle = 'rgba(13,22,48,.85)'; x.fill(); x.lineWidth = 0.06 * ppm; x.stroke();
  if (homeLogo) x.drawImage(homeLogo, X(-1.45), Y(-1.45), 2.9 * ppm, 2.9 * ppm);
  // end zone names
  x.save(); x.font = `${0.9 * ppm}px Anton, Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.translate(X(-COURT.HX + 1.1), Y(0)); x.rotate(-Math.PI / 2); x.fillStyle = uniH.s === '#ffffff' ? '#0b1020' : '#ffffff'; x.globalAlpha = 0.9; x.fillText(home.name, 0, 0); x.restore();
  x.save(); x.font = `${0.9 * ppm}px Anton, Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.translate(X(COURT.HX - 1.1), Y(0)); x.rotate(Math.PI / 2); x.fillStyle = '#ffffff'; x.globalAlpha = 0.9; x.fillText(away.name, 0, 0); x.restore();
  // apron branding
  x.save(); x.font = `${0.62 * ppm}px Anton, Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(255,255,255,.85)';
  x.fillText('DODGE NATION LEAGUE', X(-5), Y(COURT.HZ + 1.1)); x.fillStyle = '#ffcc33'; x.fillText(home.city + ' ' + home.name, X(5), Y(COURT.HZ + 1.1));
  x.fillStyle = 'rgba(255,255,255,.55)'; x.fillText('DNL', X(0), Y(-COURT.HZ - 1.0)); x.restore();
}

function buildArena() {
  const g = new THREE.Group(); scene.add(g);
  // floor
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.0, envMapIntensity: 1.6 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_W, FLOOR_D), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  ARENA.floorMat = floorMat;
  // surrounding concourse floor
  const conc = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), new THREE.MeshStandardMaterial({ color: 0x0a0d16, roughness: 0.9 }));
  conc.rotation.x = -Math.PI / 2; conc.position.y = -0.01; conc.receiveShadow = true; g.add(conc);
  // stands
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x10131d, roughness: 0.9 });
  const rows = 15, rowD = 0.9, rowH = 0.48;
  const crowdSpots = [];
  const addStand = (len, axis, sign, start) => {
    for (let r = 0; r < rows; r++) {
      const geo = new THREE.BoxGeometry(axis === 'z' ? len + r * 1.6 : rowD, rowH * (r + 1) + 0.6, axis === 'z' ? rowD : len + r * 1.6);
      const m = new THREE.Mesh(geo, seatMat);
      const d = start + r * rowD; const y = (rowH * (r + 1) + 0.6) / 2;
      if (axis === 'z') m.position.set(0, y, sign * d); else m.position.set(sign * d, y, 0);
      g.add(m);
      const n = Math.floor((len + r * 1.6) / 0.62);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5; const along = t * (len + r * 1.6);
        const top = rowH * (r + 1) + 0.6;
        if (axis === 'z' && sign > 0 && Math.abs(along) < 10.5) continue; // broadcast camera / press row
        crowdSpots.push(axis === 'z' ? [along, top, sign * d, sign > 0 ? Math.PI : 0, r] : [sign * d, top, along, sign > 0 ? -Math.PI / 2 : Math.PI / 2, r]);
      }
    }
  };
  addStand(30, 'z', -1, 8.2); addStand(30, 'z', 1, 9.4); addStand(17, 'x', -1, 13.5); addStand(17, 'x', 1, 13.5);
  // dasher wall / LED boards
  const boardTex = canvasTex(2048, 64, (x) => {
    const grd = x.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, '#0b1124'); grd.addColorStop(1, '#05070e'); x.fillStyle = grd; x.fillRect(0, 0, 2048, 64);
    x.font = '44px Anton, Impact, sans-serif'; x.textBaseline = 'middle';
    const items = ['DODGE NATION', '★', 'PRO DODGEBALL', '★', 'DNL LIVE', '★', 'THROW HARD', '★', 'CATCH EVERYTHING', '★'];
    let px = 20; let i = 0; while (px < 2048) { const s = items[i++ % items.length]; x.fillStyle = s === '★' ? '#ffcc33' : (i % 4 === 1 ? '#ff5a1f' : '#ffffff'); x.fillText(s, px, 34); px += x.measureText(s).width + 40; }
  });
  boardTex.wrapS = THREE.RepeatWrapping; boardTex.repeat.set(3, 1); ARENA.boardTex = boardTex;
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false });
  const b1 = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.85), boardMat); b1.position.set(0, 0.45, -7.6); g.add(b1);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(15, 0.85), boardMat); b.position.set(s * 12.9, 0.45, 0); b.rotation.y = -s * Math.PI / 2; g.add(b); }
  // scorer's table on camera side (low, below view)
  const table = new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x0b1022, roughness: 0.5 }));
  table.position.set(0, 0.4, 7.4); g.add(table);
  const tableFace = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.7), boardMat); tableFace.position.set(0, 0.4, 7.81); tableFace.rotation.y = Math.PI; g.add(tableFace);
  // press row riser (near side, behind the broadcast position)
  const press = new THREE.Mesh(new THREE.BoxGeometry(21, 1.3, 2.2), new THREE.MeshStandardMaterial({ color: 0x0a0d18, roughness: 0.6 }));
  press.position.set(0, 0.65, 10.6); g.add(press);
  const pressFace = new THREE.Mesh(new THREE.PlaneGeometry(21, 0.9), boardMat); pressFace.position.set(0, 0.75, 9.49); pressFace.rotation.y = Math.PI; g.add(pressFace);
  // benches (far sideline)
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x1b2236, roughness: 0.6 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.45, 0.5), benchMat); b.position.set(s * 5.2, 0.225, -6.25); b.castShadow = b.receiveShadow = true; g.add(b);
    const back = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.6, 0.08), benchMat); back.position.set(s * 5.2, 0.75, -6.52); g.add(back);
    ARENA.teamObjs.push({ bench: b });
  }
  // ceiling / rafters / banners
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(80, 70), new THREE.MeshBasicMaterial({ color: 0x020307 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 22; g.add(ceil);
  const truss = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.6, metalness: 0.4 });
  for (const z of [-6, 0, 6]) { const t = new THREE.Mesh(new THREE.BoxGeometry(34, 0.4, 0.4), truss); t.position.set(0, 16.5, z); g.add(t); }
  // jumbotron
  const jc = document.createElement('canvas'); jc.width = 512; jc.height = 288; ARENA.jumboCtx = jc.getContext('2d');
  const jt = new THREE.CanvasTexture(jc); jt.colorSpace = THREE.SRGBColorSpace; ARENA.jumboTex = jt;
  const jumbo = new THREE.Group(); jumbo.position.set(0, 12.2, 0); g.add(jumbo);
  const jbody = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.6, 6.2), new THREE.MeshStandardMaterial({ color: 0x07090f, roughness: 0.4, metalness: 0.6 })); jumbo.add(jbody);
  const scrMat = new THREE.MeshBasicMaterial({ map: jt, toneMapped: false });
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.26), scrMat); const a = i * Math.PI / 2; s.position.set(Math.sin(a) * 3.11, 0, Math.cos(a) * 3.11); s.rotation.y = a; jumbo.add(s); }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.35, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a1f, toneMapped: false, side: THREE.DoubleSide }));
  ring.position.y = -2.0; jumbo.add(ring); ARENA.jumboRing = ring;
  ARENA.jumbo = jumbo;
  // light shafts
  // lights
  scene.add(new THREE.HemisphereLight(0xa8bcff, 0x2a1d12, 0.55));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.6); key.position.set(3, 20, 9); key.target.position.set(0, 0, 0);
  key.castShadow = QUALITY.shadows; key.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 9, bottom: -9, near: 5, far: 40 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key, key.target); ARENA.lights.key = key;
  const rimL = new THREE.SpotLight(0x8fb4ff, 160, 40, 0.6, 0.6); rimL.position.set(-14, 12, -10); rimL.target.position.set(-3, 0, 0); scene.add(rimL, rimL.target);
  const rimR = new THREE.SpotLight(0xffc89a, 160, 40, 0.6, 0.6); rimR.position.set(14, 12, -10); rimR.target.position.set(3, 0, 0); scene.add(rimR, rimR.target);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6); fill.position.set(-4, 8, 14); scene.add(fill);
  const standLight = new THREE.PointLight(0x6d7fb8, 35, 40, 1.6); standLight.position.set(0, 14, 0); scene.add(standLight);
  buildCrowd(crowdSpots, g);
  return g;
}

// ---------- crowd (GPU animated instanced fans) ----------
function crowdGeometry() {
  const parts = [];
  const add = (geo, part, tx, ty, tz) => { geo.translate(tx, ty, tz); const n = geo.attributes.position.count; geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1)); parts.push(geo.toNonIndexed ? geo.toNonIndexed() : geo); };
  const torso = new THREE.CapsuleGeometry(0.17, 0.3, 2, 7); torso.scale(1.15, 1, 0.72); add(torso, 0, 0, 0.36, 0);
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 6), 1, 0, 0.66, 0);
  const head = new THREE.SphereGeometry(0.105, 8, 6); head.scale(0.92, 1.08, 1); add(head, 1, 0, 0.8, 0.01);
  add(new THREE.CapsuleGeometry(0.045, 0.36, 1, 5), 2, -0.235, 0.36, 0);
  add(new THREE.CapsuleGeometry(0.045, 0.36, 1, 5), 2, 0.235, 0.36, 0);
  // merge
  let total = 0; for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), part = new Float32Array(total); let o = 0;
  for (const p of parts) { const n = p.attributes.position.count; pos.set(p.attributes.position.array, o * 3); nrm.set(p.attributes.normal.array, o * 3); part.set(p.attributes.aPart.array, o); o += n; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  return g;
}
function buildCrowd(spots, g) {
  const max = QUALITY.crowd; const step = Math.max(1, spots.length / max);
  const chosen = []; for (let i = 0; i < spots.length; i += step) chosen.push(spots[Math.floor(i)]);
  const geo = crowdGeometry();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
  const uniforms = { uTime: { value: 0 }, uHype: { value: 0.2 }, uWave: { value: -99 }, uCheer: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float aPart; attribute float aPhase; attribute float aSkin; attribute vec3 aSeat;
      uniform float uTime, uHype, uWave, uCheer; varying float vPart; varying float vSkin; varying float vHair; varying float vY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vPart = aPart; vSkin = aSkin; vHair = fract(aPhase * 13.7); vY = position.y;
      float excite = clamp(uHype + uCheer * (0.6 + 0.4 * fract(aPhase * 7.13)), 0.0, 1.5);
      float bob = abs(sin(uTime * (3.0 + 4.0 * excite) + aPhase * 6.283)) * (0.02 + 0.16 * excite);
      float wave = exp(-pow((aSeat.x - uWave) * 0.35, 2.0));
      float up = clamp(excite - 0.55 + 0.4 * fract(aPhase * 3.7), 0.0, 1.0) + wave;
      transformed.y += bob + wave * 0.35;
      if (aPart > 1.5) { transformed.y += up * 0.62 * (0.7 + 0.3 * sin(uTime * 9.0 + aPhase * 20.0)); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vPart; varying float vSkin; varying float vHair; varying float vY;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 skin = mix(vec3(0.92,0.72,0.58), vec3(0.3,0.19,0.12), vSkin);
      vec3 hair = vHair < 0.55 ? vec3(0.06,0.045,0.035) : vHair < 0.8 ? vec3(0.3,0.18,0.09) : vHair < 0.92 ? vec3(0.75,0.6,0.35) : vec3(0.55,0.55,0.55);
      if (vPart > 0.5) diffuseColor.rgb = skin * 0.85;
      if (vPart > 0.5 && vPart < 1.5 && vY > 0.83) diffuseColor.rgb = hair;
      if (vPart > 1.5 && vY < 0.24) diffuseColor.rgb = skin * 0.85;`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, chosen.length);
  const phase = new Float32Array(chosen.length), skin = new Float32Array(chosen.length), seat = new Float32Array(chosen.length * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  chosen.forEach((sp, i) => {
    const sc = 0.92 + Math.random() * 0.16; s.set(sc, sc, sc); q.setFromAxisAngle(_v1.set(0, 1, 0), sp[3] + (Math.random() - 0.5) * 0.3);
    p.set(sp[0] + (Math.random() - 0.5) * 0.12, sp[1], sp[2]); m.compose(p, q, s); mesh.setMatrixAt(i, m);
    phase[i] = Math.random(); skin[i] = Math.random() ** 1.3; seat[i * 3] = Math.atan2(sp[2], sp[0]) * 8; seat[i * 3 + 1] = sp[4]; seat[i * 3 + 2] = 0;
    mesh.setColorAt(i, new THREE.Color(0x888888));
  });
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 1));
  geo.setAttribute('aSeat', new THREE.InstancedBufferAttribute(seat, 3));
  mesh.frustumCulled = false;
  g.add(mesh);
  ARENA.crowd = { mesh, uniforms, spots: chosen };
}
function paintCrowd(uniH, uniA) {
  const { mesh, spots } = ARENA.crowd; const c = new THREE.Color();
  const neutral = ['#d9d9d9', '#2b2b2b', '#5a6270', '#8a1c1c', '#1f3a6b', '#e8e2d0'];
  spots.forEach((sp, i) => {
    const homeBias = sp[0] < 0 ? 0.62 : 0.4; const r = Math.random();
    const col = r < homeBias * 0.85 ? (Math.random() < 0.7 ? uniH.p : uniH.s) : r < 0.85 ? (Math.random() < 0.7 ? uniA.p : uniA.s) : pick(neutral);
    c.set(col).multiplyScalar(0.55 + Math.random() * 0.25); mesh.setColorAt(i, c);
  });
  mesh.instanceColor.needsUpdate = true;
}

// ---------- per-match dressing (floor paint, banners, jumbotron) ----------
let banners = null;
async function dressArena(home, away, uniH, uniA) {
  const homeLogo = await svgToImage(logoSVG(home), 512);
  const tex = canvasTex(2048, Math.round(2048 * FLOOR_D / FLOOR_W), (x, c) => drawCourt(x, c.width, c.height, home, away, homeLogo, uniH, uniA));
  if (ARENA.floorMat.map) ARENA.floorMat.map.dispose();
  ARENA.floorMat.map = tex; ARENA.floorMat.needsUpdate = true;
  paintCrowd(uniH, uniA);
  if (!banners) {
    banners = new THREE.Group(); scene.add(banners);
    for (let i = 0; i < TEAMS.length; i++) {
      const t = TEAMS[i]; const img = await svgToImage(logoSVG(t), 256);
      const bt = canvasTex(256, 512, (x) => {
        x.fillStyle = t.secondary; x.fillRect(0, 0, 256, 512); x.fillStyle = t.primary; x.fillRect(0, 0, 256, 18); x.fillRect(0, 494, 256, 18);
        if (img) x.drawImage(img, 28, 40, 200, 200);
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '44px Anton, Impact, sans-serif'; x.fillText(t.name, 128, 300);
        x.font = '26px Anton, Impact, sans-serif'; x.fillStyle = t.primary; x.fillText('DNL CHAMPIONS', 128, 350);
        x.fillStyle = 'rgba(255,255,255,.8)'; x.font = '30px Anton, Impact, sans-serif'; x.fillText(String(2009 + i * 2), 128, 410);
      });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9, side: THREE.DoubleSide }));
      b.position.set(-12.6 + i * 3.6, 17.5, -16.5); banners.add(b);
    }
  }
}
function drawJumbo(lines) {
  const x = ARENA.jumboCtx; if (!x) return;
  const w = 512, h = 288;
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1230'); g.addColorStop(1, '#03050c'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  lines(x, w, h);
  ARENA.jumboTex.needsUpdate = true;
}
