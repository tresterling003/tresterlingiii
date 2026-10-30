import * as THREE from 'three';
import type { ProceduralPlayer } from './playerModel';

// ---------------------------------------------------------------------------
// Instanced rendering for procedural players. Each player is still posed as
// its own jointed hierarchy (ProceduralPlayer), but the hierarchy is never
// added to the scene: every body part (helmet, facemask, jersey, thigh, …) of
// a whole team is drawn with ONE InstancedMesh. ~38 draw calls per player
// become ~26 per team, which keeps 22 players cheap on laptop GPUs.
// Skin tones use per-instance colors; jersey numbers come from a 0–99 atlas
// selected per instance.
// ---------------------------------------------------------------------------

interface Slot {
  source: THREE.Mesh;
}

interface PartGroup {
  mesh: THREE.InstancedMesh;
  slots: Slot[];
}

export class PlayerCrowd {
  readonly group = new THREE.Group();
  private parts: PartGroup[] = [];
  private owned: { dispose(): void }[] = [];

  constructor(
    private players: ProceduralPlayer[],
    numberAtlas: { material: THREE.Material; cell: (n: number) => [number, number] } | null,
    shadows: boolean,
  ) {
    const byKey = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; slots: Slot[]; isNumber: boolean; isSkin: boolean; numbers: number[]; skin: THREE.Color[]; castShadow: boolean }>();
    players.forEach((p) => {
      p.object.updateMatrixWorld(true);
      p.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const isNumber = !!m.userData.number;
        const isSkin = !!m.userData.skin;
        const material = m.material as THREE.Material;
        const key = `${m.geometry.uuid}|${isNumber ? 'num' : isSkin ? 'skin' : material.uuid}`;
        let g = byKey.get(key);
        if (!g) {
          g = { geometry: m.geometry, material, slots: [], isNumber, isSkin, numbers: [], skin: [], castShadow: m.castShadow };
          byKey.set(key, g);
        }
        g.slots.push({ source: m });
        if (isNumber) g.numbers.push(m.userData.number as number);
        if (isSkin) g.skin.push((m.material as THREE.MeshStandardMaterial).color.clone());
      });
    });
    for (const g of byKey.values()) {
      let geometry = g.geometry;
      let material = g.material;
      if (g.isNumber && numberAtlas) {
        geometry = geometry.clone();
        this.owned.push(geometry);
        const cells = new Float32Array(g.slots.length * 2);
        g.numbers.forEach((n, i) => {
          const [cx, cy] = numberAtlas.cell(n);
          cells[i * 2] = cx;
          cells[i * 2 + 1] = cy;
        });
        geometry.setAttribute('numCell', new THREE.InstancedBufferAttribute(cells, 2));
        material = numberAtlas.material;
      }
      if (g.isSkin) {
        material = SKIN_MATERIAL;
      }
      const mesh = new THREE.InstancedMesh(geometry, material, g.slots.length);
      mesh.castShadow = shadows && g.castShadow;
      mesh.frustumCulled = false;
      mesh.renderOrder = g.isNumber ? 2 : 0;
      if (g.isSkin) g.skin.forEach((c, i) => mesh.setColorAt(i, c));
      this.owned.push(mesh);
      this.group.add(mesh);
      this.parts.push({ mesh, slots: g.slots });
    }
    this.update();
  }

  /** Copy the posed hierarchy transforms into the instance buffers. */
  update() {
    for (const p of this.players) p.object.updateMatrixWorld(true);
    for (const part of this.parts) {
      const arr = part.mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < part.slots.length; i++) part.slots[i].source.matrixWorld.toArray(arr, i * 16);
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  get drawCount() {
    return this.parts.length;
  }

  dispose() {
    for (const o of this.owned) o.dispose();
    this.owned = [];
  }
}

const SKIN_MATERIAL = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.65 });

/** 0–99 jersey-number atlas (10×10 cells) with a per-instance cell offset. */
export function makeNumberAtlas(color: string, outline: string): { material: THREE.MeshStandardMaterial; texture: THREE.CanvasTexture; cell: (n: number) => [number, number] } {
  const cw = 192;
  const ch = 120;
  const c = document.createElement('canvas');
  c.width = cw * 10;
  c.height = ch * 10;
  const g = c.getContext('2d')!;
  g.font = `700 ${Math.round(ch * 0.82)}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 8;
  for (let n = 0; n < 100; n++) {
    const col = n % 10;
    const row = Math.floor(n / 10);
    const x = col * cw + cw / 2;
    const y = row * ch + ch / 2 + 4;
    g.strokeStyle = outline;
    g.strokeText(String(n), x, y);
    g.fillStyle = color;
    g.fillText(String(n), x, y);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.8, alphaTest: 0.2, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 numCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * 0.1 + numCell * 0.1;\n#endif');
  };
  material.customProgramCacheKey = () => 'fieldview-number-atlas';
  // canvas rows go top→bottom while UV v goes bottom→top (flipY)
  const cell = (n: number): [number, number] => [n % 10, 9 - Math.floor(n / 10)];
  return { material, texture, cell };
}
