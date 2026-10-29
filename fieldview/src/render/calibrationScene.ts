import * as THREE from 'three';
import { YARD_M } from '../core/units';
import { POLE_HEIGHT_M } from './camera';

/**
 * Calibration scene: 1-yard ground grid, a horizon line at infinity, and a
 * 6-ft reference pole (1-ft bands) straight ahead at a known distance. The
 * camera sits at the origin at the athlete's eye height, looking toward −Z.
 */
export class CalibrationScene {
  readonly scene = new THREE.Scene();
  private pole = new THREE.Group();
  private figure = new THREE.Group();

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color('#0d1626');
    s.add(new THREE.HemisphereLight('#ffffff', '#334433', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.4);
    sun.position.set(-5, 10, 4);
    s.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#244a2a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    s.add(ground);
    // 1-yard grid, bold every 5 yards
    const pts: number[] = [];
    const bold: number[] = [];
    for (let i = -30; i <= 30; i++) {
      const arr = i % 5 === 0 ? bold : pts;
      arr.push(i * YARD_M, 0.003, 2, i * YARD_M, 0.003, -60 * YARD_M);
    }
    for (let j = -2; j <= 60; j++) {
      const arr = j % 5 === 0 ? bold : pts;
      arr.push(-30 * YARD_M, 0.003, -j * YARD_M, 30 * YARD_M, 0.003, -j * YARD_M);
    }
    const mk = (a: number[], color: string) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
    };
    s.add(mk(pts, '#6f9b74'), mk(bold, '#ffffff'));
    // labels every 5 yards ahead
    for (let j = 5; j <= 30; j += 5) {
      const sp = textSprite(`${j} yd`);
      sp.position.set(-1.2, 0.25, -j * YARD_M);
      s.add(sp);
    }
    // horizon: a band far away exactly at eye height (updated per frame)
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(4000, 0.9), new THREE.MeshBasicMaterial({ color: '#ff8a00' }));
    hz.name = 'horizon';
    hz.position.set(0, 0, -700);
    s.add(hz);
    // pole with 1-ft bands
    for (let k = 0; k < 6; k++) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.3048, 12),
        new THREE.MeshStandardMaterial({ color: k % 2 ? '#ffffff' : '#e11d48', roughness: 0.6 }),
      );
      band.position.y = 0.3048 * (k + 0.5);
      this.pole.add(band);
    }
    const cap = textSprite('6 ft');
    cap.position.y = POLE_HEIGHT_M + 0.25;
    this.pole.add(cap);
    s.add(this.pole);
    // simple 6-ft athlete silhouette next to the pole (scale reference)
    const mat = new THREE.MeshStandardMaterial({ color: '#c9d4e3', roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 6, 12), mat);
    body.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat);
    head.position.y = 1.7;
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.6, 4, 8), mat);
      leg.position.set(sx, 0.4, 0);
      this.figure.add(leg);
    }
    this.figure.add(body, head);
    s.add(this.figure);
  }

  update(eye: number, refDistance: number) {
    const hz = this.scene.getObjectByName('horizon')!;
    hz.position.y = eye;
    this.pole.position.set(0, 0, -refDistance);
    this.figure.position.set(0.9, 0, -refDistance);
  }
}

function textSprite(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.font = '700 64px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t }));
  sp.scale.set(0.8, 0.3, 1);
  return sp;
}
