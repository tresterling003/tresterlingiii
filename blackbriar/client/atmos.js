// Atmosphere: the air in the building.
//  - soft shafts of light hanging under every ceiling fixture (one instanced draw), flickering with the lamp
//  - dust drifting around you, invisible until it crosses your flashlight beam
//  - the flashlight's own beam in the air, which trails your aim a little when you turn
import * as THREE from 'three';
import { LIGHTS, groundY } from '../shared/level.js';

const SHAFT_VS = `
  attribute float aLevel; attribute vec3 aColor;
  varying float vH, vLevel, vDist; varying vec3 vColor, vN, vV;
  void main() {
    vH = -position.y; vLevel = aLevel; vColor = aColor;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = cameraPosition - wp.xyz; vDist = length(vV);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const SHAFT_FS = `
  uniform float uK; varying float vH, vLevel, vDist; varying vec3 vColor, vN, vV;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));                   // faces seen edge-on fade out: soft edges
    float a = uK * vLevel * pow(max(1.0 - vH, 0.0), 1.7) * smoothstep(0.08, 0.65, f) * smoothstep(0.5, 2.4, vDist) * exp(-vDist * 0.028);
    gl_FragColor = vec4(vColor, a);
  }`;

const DUST_VS = `
  uniform float uTime, uSize, uMax, uFlashOn, uFlashCos; uniform vec3 uCam, uFlashPos, uFlashDir; attribute vec3 aSeed; varying float vB;
  void main() {
    vec3 box = vec3(12.0, 4.5, 12.0);
    vec3 p = position + vec3(sin(uTime * 0.07 + aSeed.x * 6.3) * 0.5, sin(uTime * 0.05 + aSeed.y * 6.3) * 0.3 - uTime * 0.012, cos(uTime * 0.06 + aSeed.z * 6.3) * 0.5);
    p = uCam + mod(p - uCam + box * 0.5, box) - box * 0.5;
    vec3 d = p - uFlashPos; float dl = max(length(d), 0.001), c = dot(d / dl, uFlashDir);
    float beam = uFlashOn * smoothstep(uFlashCos, mix(uFlashCos, 1.0, 0.55), c) / (1.0 + dl * dl * 0.05) * smoothstep(0.25, 0.9, dl);
    vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float z = -mv.z;
    vB = (0.012 + beam * 0.55) * smoothstep(0.7, 1.8, z); // nothing right against the lens
    gl_PointSize = min(uSize * (0.5 + aSeed.x * 0.8) / max(z, 0.1), uMax);
  }`;
const DUST_FS = `
  varying float vB;
  void main() { vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard; gl_FragColor = vec4(vec3(1.0, 0.94, 0.84) * vB * (1.0 - r * 4.0), 1.0); }`;

const BEAM_VS = `varying float vT; varying vec3 vN, vV;
  void main() { vT = -position.z / 7.0; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const BEAM_FS = `uniform float uK; varying float vT; varying vec3 vN, vV;
  void main() { float f = abs(dot(normalize(vN), normalize(vV))); float a = uK * pow(max(1.0 - vT, 0.0), 2.2) * smoothstep(0.02, 0.18, vT) * smoothstep(0.0, 0.55, f); gl_FragColor = vec4(1.0, 0.95, 0.86, a); }`;

// a frustum open at both ends: top rectangle (hx, hz) at y = 0, bottom flared out at y = -1
function frustum(hx, hz, flare) {
  const t = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]], b = t.map(([x, z]) => [x + Math.sign(x) * flare, z + Math.sign(z) * flare]), pos = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; pos.push(t[i][0], 0, t[i][1], b[i][0], -1, b[i][1], b[j][0], -1, b[j][1], t[i][0], 0, t[i][1], b[j][0], -1, b[j][1], t[j][0], 0, t[j][1]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

export function makeAtmos(scene, camera, { quality = 2, isTouch = false } = {}) {
  const lamps = LIGHTS.filter(L => !L.bulb && !L.emergency);
  const groups = [];
  const shaftMat = (k) => new THREE.ShaderMaterial({ uniforms: { uK: { value: k } }, vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const high of [false, true]) {
    const list = lamps.filter(L => !!L.high === high); if (!list.length) continue;
    const geo = high ? new THREE.CylinderGeometry(0.12, 1.0, 1, 18, 1, true).translate(0, -0.5, 0) : frustum(0.3, 0.6, 0.62);
    const mesh = new THREE.InstancedMesh(geo, shaftMat(high ? 0.055 : 0.07), list.length);
    const lvl = new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1), col = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    geo.setAttribute('aLevel', lvl); geo.setAttribute('aColor', col);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    list.forEach((L, i) => {
      const h = Math.max(0.5, L.y - groundY(L.x, L.z)), rot = L.room === 'hall' || L.room === 'service' || L.room === 'lcorr' ? Math.PI / 2 : 0;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m.compose(new THREE.Vector3(L.x, L.y - (high ? 0.05 : 0.06), L.z), q, high ? new THREE.Vector3(0.4 + h * 0.3, h, 0.4 + h * 0.3) : new THREE.Vector3(1, h, 1));
      mesh.setMatrixAt(i, m); c.setHex(L.color ?? 0xfff4e0); col.setXYZ(i, c.r, c.g, c.b);
    });
    mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh); groups.push({ mesh, list, lvl });
  }
  // dust
  const N = quality >= 2 && !isTouch ? 1400 : quality >= 1 ? 700 : 0; let dust = null;
  if (N) {
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 12; pos[i * 3 + 1] = Math.random() * 4.5 - 2.25; pos[i * 3 + 2] = (Math.random() - 0.5) * 12; seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uSize: { value: 9 }, uMax: { value: 4 }, uFlashOn: { value: 0 }, uFlashCos: { value: 0.9 }, uCam: { value: new THREE.Vector3() }, uFlashPos: { value: new THREE.Vector3() }, uFlashDir: { value: new THREE.Vector3(0, 0, -1) } },
      vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    dust = new THREE.Points(g, mat); dust.frustumCulled = false; dust.renderOrder = 6; scene.add(dust);
  }
  // the flashlight beam in the air
  const R = Math.tan(0.42) * 7, beamGeo = new THREE.CylinderGeometry(0.035, R, 7, 28, 1, true).rotateX(Math.PI / 2).translate(0, 0, -3.5); // apex at the lens, opening forward
  const beamMat = new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.frustumCulled = false; beam.renderOrder = 7; camera.add(beam); beam.position.set(-0.2, -0.2, 0);
  const _p = new THREE.Vector3(), _d = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, -1);
  let lagX = 0, lagY = 0, lastYaw = null, lastPitch = 0;
  return {
    beam,
    // levelOf(L) -> 0..1 for each lamp; P = player (yaw, pitch, light); flash = the SpotLight
    update(dt, t, levelOf, P, flash, flashAngle) {
      for (const G of groups) { for (let i = 0; i < G.list.length; i++) G.lvl.array[i] = levelOf(G.list[i]); G.lvl.needsUpdate = true; }
      // the light trails your aim: turn quickly and the beam catches up a moment later
      if (lastYaw == null) { lastYaw = P.yaw; lastPitch = P.pitch; }
      const dy = Math.atan2(Math.sin(P.yaw - lastYaw), Math.cos(P.yaw - lastYaw)), dp = P.pitch - lastPitch; lastYaw = P.yaw; lastPitch = P.pitch;
      const k = Math.exp(-dt * 7); lagX = Math.max(-0.3, Math.min(0.3, (lagX + dy * 0.55) * k)); lagY = Math.max(-0.22, Math.min(0.22, (lagY - dp * 0.55) * k));
      const sway = Math.sin(t * 1.3) * 0.012, swayY = Math.sin(t * 0.9) * 0.01;
      _d.set(0.2 + lagX + sway, 0.15 + lagY + swayY, -1).normalize(); // aimed to cross the centre of the view about a metre out
      if (flash) flash.target.position.set(beam.position.x + _d.x, beam.position.y + _d.y, _d.z);
      beam.quaternion.setFromUnitVectors(Z, _d);
      const on = P.light && flash && flash.intensity > 0 ? 1 : 0;
      beamMat.uniforms.uK.value += ((on ? 0.045 : 0) - beamMat.uniforms.uK.value) * Math.min(1, dt * 18);
      if (dust) {
        const u = dust.material.uniforms; u.uTime.value = t; camera.getWorldPosition(u.uCam.value); u.uFlashOn.value = on;
        beam.getWorldPosition(_p); u.uFlashPos.value.copy(_p); u.uFlashDir.value.copy(_d).transformDirection(camera.matrixWorld); u.uFlashCos.value = Math.cos(flashAngle ?? 0.42);
      }
    },
    setPixelRatio(pr) { if (dust) { dust.material.uniforms.uSize.value = 9 * pr; dust.material.uniforms.uMax.value = 3.5 * pr; } },
  };
}
