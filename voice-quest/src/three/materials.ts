import * as THREE from 'three';

const cache = new Map<string, THREE.Material>();

/** Shared stylized "soft plastic / clay" material. */
export function mat(color: number | string, opts: { rough?: number; metal?: number; emissive?: number | string; emissiveIntensity?: number; flat?: boolean; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([color, opts]);
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color as THREE.ColorRepresentation),
      roughness: opts.rough ?? 0.55,
      metalness: opts.metal ?? 0,
      flatShading: !!opts.flat,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
    });
    if (opts.emissive !== undefined) {
      m.emissive = new THREE.Color(opts.emissive as THREE.ColorRepresentation);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    cache.set(key, m);
  }
  return m;
}

/** Unshared copy (for per-object colour changes). */
export function matUnique(color: number | string, rough = 0.55, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color as THREE.ColorRepresentation), roughness: rough, metalness: metal });
}

export const SNOW = () => mat(0xf4f8ff, { rough: 0.85 });
export const ICE = () => {
  const key = 'ice';
  let m = cache.get(key) as THREE.MeshPhysicalMaterial | undefined;
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.88 });
    cache.set(key, m);
  }
  return m;
};

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

let candyTex: THREE.Texture | null = null;
export function candyStripeMat(): THREE.MeshStandardMaterial {
  if (!candyTex) {
    candyTex = canvasTex(64, 256, (g) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 64, 256);
      g.fillStyle = '#e8263b';
      for (let i = -4; i < 12; i++) {
        g.beginPath();
        g.moveTo(0, i * 32);
        g.lineTo(64, i * 32 + 40);
        g.lineTo(64, i * 32 + 56);
        g.lineTo(0, i * 32 + 16);
        g.fill();
      }
    }, [1, 4]);
  }
  return new THREE.MeshStandardMaterial({ map: candyTex, roughness: 0.25 });
}

export function woodTex(base = '#9c6b3f', repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(60,30,10,${0.05 + Math.random() * 0.12})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      const y = Math.random() * 128;
      g.moveTo(0, y);
      g.bezierCurveTo(40, y + Math.random() * 8 - 4, 80, y + Math.random() * 8 - 4, 128, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(40,20,5,0.35)';
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 2, 128);
  }, repeat);
}

export function cobbleTex(repeat: [number, number]): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#cfd7e6';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const ox = (y % 2) * 16;
        const l = 70 + Math.random() * 18;
        g.fillStyle = `hsl(${215 + Math.random() * 15}, 14%, ${l}%)`;
        g.beginPath();
        g.roundRect(x * 32 + ox - 14 + 2, y * 32 + 2, 28, 28, 8);
        g.fill();
      }
    // snow dusting
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.6})`;
      g.beginPath();
      g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, repeat);
}

export function snowGroundTex(): THREE.CanvasTexture {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = '#eef4ff';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1600; i++) {
      const v = Math.random();
      g.fillStyle = v > 0.5 ? `rgba(255,255,255,${Math.random() * 0.7})` : `rgba(170,195,235,${Math.random() * 0.18})`;
      g.beginPath();
      g.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 6, 0, Math.PI * 2);
      g.fill();
    }
  }, [30, 30]);
}

export function brickTex(base: string, repeat: [number, number]): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 3;
    for (let y = 0; y < 8; y++) {
      g.beginPath();
      g.moveTo(0, y * 16);
      g.lineTo(128, y * 16);
      g.stroke();
      for (let x = 0; x < 4; x++) {
        const xx = x * 32 + (y % 2) * 16;
        g.beginPath();
        g.moveTo(xx, y * 16);
        g.lineTo(xx, y * 16 + 16);
        g.stroke();
      }
    }
  }, repeat);
}

/** A label/emoji drawn on a sprite (used for portal signs and floating icons). */
export function emojiSprite(emoji: string, size = 1.6, bg?: string): THREE.Sprite {
  const tex = canvasTex(256, 256, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.arc(128, 128, 120, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 10;
      g.strokeStyle = '#fff';
      g.stroke();
    }
    g.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, 128, 140);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

/** Soft round sprite texture for particles. */
let dotTex: THREE.Texture | null = null;
export function softDot(): THREE.Texture {
  if (!dotTex) {
    dotTex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.4, 'rgba(255,255,255,0.8)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    });
  }
  return dotTex;
}

let sparkTex: THREE.Texture | null = null;
export function sparkleTex(): THREE.Texture {
  if (!sparkTex) {
    sparkTex = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,250,220,0.6)');
      gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.moveTo(32, 2); g.lineTo(35, 29); g.lineTo(62, 32); g.lineTo(35, 35); g.lineTo(32, 62); g.lineTo(29, 35); g.lineTo(2, 32); g.lineTo(29, 29);
      g.fill();
    });
  }
  return sparkTex;
}
