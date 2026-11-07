import * as THREE from 'three';
import type { Game, GameScene } from '../game';
import { UNLOCKS } from '../data/content';
import { Bursts, StringLights } from '../three/effects';
import { emojiSprite, mat, woodTex } from '../three/materials';
import { Hero } from '../three/models/hero';
import { makeBell, makeItem, makePresent, Snowman, ToyRobot } from '../three/models/characters';
import { cyl, mesh, sphere } from '../three/models/kit';
import { makePine } from '../three/models/props';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

type Slot = 'door' | 'mantel' | 'window' | 'shelf' | 'wall' | 'table';
const SLOT_ITEMS: Record<Slot, string[]> = {
  door: ['deco-wreath'],
  mantel: ['deco-stocking', 'deco-bells'],
  window: ['deco-lights'],
  shelf: ['toy-robot', 'toy-train', 'toy-snowman'],
  wall: ['deco-alphabet'],
  table: ['deco-snowglobe'],
};
const SLOT_POS: Record<Slot, THREE.Vector3> = {
  door: v3(-5.4, 2.4, 0.5),
  mantel: v3(0, 2.6, -4.6),
  window: v3(4.2, 3, -4.9),
  shelf: v3(5.4, 2.2, 0),
  wall: v3(-2.8, 4.4, -4.9),
  table: v3(-2.8, 1.2, 1.4),
};

export class CabinScene implements GameScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  music = 'cabin' as const;
  private hero = new Hero();
  private fire: THREE.PointLight;
  private flames: THREE.Mesh[] = [];
  private bursts = new Bursts();
  private slotGroups = new Map<Slot, THREE.Group>();
  private markers = new Map<Slot, THREE.Sprite>();
  private robot: ToyRobot | null = null;
  private lights: StringLights[] = [];
  private raycaster = new THREE.Raycaster();
  private yaw = 0;
  private exitBtn: HTMLButtonElement;
  private t = 0;

  constructor(private g: Game) {
    const sc = this.scene;
    sc.background = new THREE.Color(0x2b1b14);
    sc.add(new THREE.HemisphereLight(0xffe8d0, 0x4a2f20, 0.7));
    const lamp = new THREE.PointLight(0xffd7a0, 14, 18, 2);
    lamp.position.set(0, 5.5, 1);
    lamp.castShadow = true;
    sc.add(lamp);
    this.fire = new THREE.PointLight(0xff8a3d, 18, 12, 2);
    this.fire.position.set(0, 1, -4);
    sc.add(this.fire);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex('#a06a3c', [6, 3]), roughness: 0.8 });
    const floor = mesh(new THREE.PlaneGeometry(12, 11), new THREE.MeshStandardMaterial({ map: woodTex('#8a5a33', [6, 6]), roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    sc.add(floor);
    const back = mesh(new THREE.PlaneGeometry(12, 7), wood);
    back.position.set(0, 3.5, -5);
    sc.add(back);
    for (const s of [-1, 1]) {
      const w = mesh(new THREE.PlaneGeometry(11, 7), wood);
      w.rotation.y = -s * Math.PI / 2;
      w.position.set(s * 6, 3.5, 0.5);
      sc.add(w);
    }
    // beams
    for (const x of [-4, 0, 4]) {
      const b = mesh(new THREE.BoxGeometry(0.4, 0.4, 11), mat(0x5d3a1f));
      b.position.set(x, 6.6, 0.5);
      sc.add(b);
    }
    // rug
    const rug = mesh(new THREE.CircleGeometry(2.6, 40), mat(0xc62828, { rough: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.02, -0.8);
    sc.add(rug);
    const rug2 = mesh(new THREE.RingGeometry(1.8, 2.1, 40), mat(0xfdd835, { rough: 1 }));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(0, 0.03, -0.8);
    sc.add(rug2);
    // fireplace
    const stone = mat(0x9e9e9e, { rough: 0.95 });
    const fp = mesh(new THREE.BoxGeometry(3.6, 2.4, 0.9), stone);
    fp.position.set(0, 1.2, -4.6);
    sc.add(fp);
    const hole = mesh(new THREE.BoxGeometry(2, 1.4, 0.5), mat(0x1a1a1a));
    hole.position.set(0, 0.8, -4.2);
    sc.add(hole);
    const mantel = mesh(new THREE.BoxGeometry(4, 0.25, 1.1), mat(0x5d3a1f));
    mantel.position.set(0, 2.5, -4.5);
    sc.add(mantel);
    const chim = mesh(new THREE.BoxGeometry(2.4, 4.5, 0.7), stone);
    chim.position.set(0, 4.85, -4.7);
    sc.add(chim);
    for (let i = 0; i < 5; i++) {
      const f = mesh(new THREE.ConeGeometry(0.22 + Math.random() * 0.1, 0.8, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb300 : 0xff5722, transparent: true, opacity: 0.9 }), false);
      f.position.set(-0.6 + i * 0.3, 0.5, -4.1);
      sc.add(f);
      this.flames.push(f);
    }
    const log = mesh(cyl(0.12, 0.12, 1.6, 8), mat(0x5d3a1f));
    log.rotation.z = Math.PI / 2;
    log.position.set(0, 0.2, -4.1);
    sc.add(log);
    // window
    const win = mesh(new THREE.PlaneGeometry(2.2, 1.8), mat(0x9ecbff, { emissive: 0x6fa8ff, emissiveIntensity: 0.8 }), false);
    win.position.set(4.2, 3, -4.95);
    sc.add(win);
    const frame = mesh(new THREE.BoxGeometry(2.5, 2.1, 0.08), mat(0xffffff));
    frame.position.set(4.2, 3, -4.99);
    sc.add(frame);
    // little tree
    const tree = makePine(3, false, true);
    tree.position.set(-4.4, 0, -3.6);
    sc.add(tree);
    // shelf
    const shelf = mesh(new THREE.BoxGeometry(0.8, 0.12, 3.4), mat(0x6d4c41));
    shelf.position.set(5.6, 1.6, 0);
    sc.add(shelf);
    // table
    const table = mesh(cyl(0.9, 0.9, 0.12, 24), mat(0x8d5a2b));
    table.position.set(-2.8, 1, 1.4);
    sc.add(table);
    const leg = mesh(cyl(0.12, 0.2, 1, 10), mat(0x6d4c41));
    leg.position.set(-2.8, 0.5, 1.4);
    sc.add(leg);
    // armchair
    const chair = new THREE.Group();
    const seat = mesh(new THREE.BoxGeometry(1.6, 0.6, 1.4), mat(0x1565c0, { rough: 0.9 }));
    seat.position.y = 0.5;
    const backrest = mesh(new THREE.BoxGeometry(1.6, 1.4, 0.35), mat(0x1565c0, { rough: 0.9 }));
    backrest.position.set(0, 1.1, -0.55);
    chair.add(seat, backrest);
    chair.position.set(2.8, 0, 1.2);
    chair.rotation.y = -0.6;
    sc.add(chair);
    this.hero.position.set(0, 0, 0.8);
    sc.add(this.hero);
    for (const s of Object.keys(SLOT_ITEMS) as Slot[]) {
      const grp = new THREE.Group();
      sc.add(grp);
      this.slotGroups.set(s, grp);
      const mk = emojiSprite('✨', 0.7);
      mk.position.copy(SLOT_POS[s]).add(v3(0, 0.9, 0.4));
      mk.userData.slot = s;
      sc.add(mk);
      this.markers.set(s, mk);
    }
    sc.add(this.bursts.points);
    sc.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.receiveShadow = true; o.castShadow = true; } });

    this.exitBtn = document.createElement('button');
    this.exitBtn.className = 'exit-btn hidden';
    this.exitBtn.innerHTML = '🚪';
    this.exitBtn.setAttribute('aria-label', 'Back to the village');
    this.exitBtn.addEventListener('click', () => this.g.goto('village', { from: 'cabin' }));
    g.ui.append(this.exitBtn);
  }

  private unlockedFor(s: Slot): string[] {
    return SLOT_ITEMS[s].filter((id) => this.g.has(id));
  }

  private chosen(s: Slot): string | null {
    const un = this.unlockedFor(s);
    const c = this.g.progress.cabin[s];
    if (c === 'none') return null;
    if (c && un.includes(c)) return c;
    return un[0] ?? null;
  }

  private rebuild(): void {
    for (const s of Object.keys(SLOT_ITEMS) as Slot[]) {
      const grp = this.slotGroups.get(s)!;
      grp.clear();
      for (const l of this.lights) this.scene.remove(l.mesh);
      const id = this.chosen(s);
      const pos = SLOT_POS[s];
      const mk = this.markers.get(s)!;
      mk.visible = this.unlockedFor(s).length > 0;
      if (s === 'shelf') {
        // all unlocked toys go on the shelf
        for (const [i, tid] of this.unlockedFor(s).entries()) this.addToy(grp, tid, v3(5.6, 1.66, -1.1 + i * 1.1));
        continue;
      }
      if (!id) {
        if (!this.unlockedFor(s).length) {
          const box = makePresent(0x9e9e9e, 0xbdbdbd, 0.5);
          box.position.copy(pos).add(v3(0, -0.3, 0.2));
          (box.children[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, transparent: true, opacity: 0.35 });
          grp.add(box);
        }
        continue;
      }
      this.addDeco(grp, id, pos);
    }
    this.lights = [];
    if (this.chosen('window') === 'deco-lights') {
      const pts = [v3(3, 4.1, -4.85), v3(4.2, 4.3, -4.85), v3(5.4, 4.1, -4.85)];
      const sl = new StringLights(pts, 0.25);
      const sl2 = new StringLights([v3(-5.8, 6.2, -4.8), v3(0, 6.0, -4.8), v3(5.8, 6.2, -4.8)], 0.4);
      this.lights.push(sl, sl2);
      this.scene.add(sl.mesh, sl2.mesh);
    }
  }

  private addDeco(grp: THREE.Group, id: string, pos: THREE.Vector3): void {
    switch (id) {
      case 'deco-wreath': {
        const w = mesh(new THREE.TorusGeometry(0.6, 0.22, 10, 24), mat(0x2e7d32, { rough: 0.9 }));
        w.position.copy(pos);
        w.rotation.y = Math.PI / 2;
        grp.add(w);
        for (let i = 0; i < 8; i++) {
          const b = mesh(sphere(0.08), mat(0xe53935, { rough: 0.3 }));
          const a = (i / 8) * Math.PI * 2;
          b.position.copy(pos).add(v3(0.15, Math.sin(a) * 0.6, Math.cos(a) * 0.6));
          grp.add(b);
        }
        // door itself
        const door = mesh(new THREE.BoxGeometry(0.15, 3.4, 1.8), mat(0x5d3a1f));
        door.position.set(-5.92, 1.7, 0.5);
        grp.add(door);
        break;
      }
      case 'deco-stocking':
        for (const x of [-1.2, 0, 1.2]) {
          const s = makeItem('sock');
          s.position.set(x, 1.95, -3.95);
          grp.add(s);
        }
        break;
      case 'deco-bells':
        for (const x of [-1.4, -0.7, 0, 0.7, 1.4]) {
          const b = makeBell(0.2);
          b.position.set(x, 2.1 - Math.abs(x) * 0.1, -3.95);
          grp.add(b);
        }
        break;
      case 'deco-lights':
        break;
      case 'deco-alphabet': {
        const letters = ['B', 'M', 'P', 'S'];
        letters.forEach((l, i) => {
          const sp = emojiSprite(l, 0.9, ['#1e88e5', '#ec407a', '#8e24aa', '#fb8c00'][i]);
          sp.position.copy(pos).add(v3(i * 1.0 - 1.5, 0, 0.1));
          grp.add(sp);
        });
        break;
      }
      case 'deco-snowglobe': {
        const base = mesh(cyl(0.35, 0.4, 0.2, 20), mat(0x6d4c41));
        base.position.copy(pos).add(v3(0, 0.15, 0));
        grp.add(base);
        const glass = mesh(sphere(0.42, 24, 18), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, roughness: 0.05, transparent: true, opacity: 0.35 }));
        glass.position.copy(pos).add(v3(0, 0.6, 0));
        grp.add(glass);
        const tiny = new Snowman();
        tiny.scale.setScalar(0.11);
        tiny.position.copy(pos).add(v3(0, 0.25, 0));
        grp.add(tiny);
        break;
      }
    }
  }

  private addToy(grp: THREE.Group, id: string, p: THREE.Vector3): void {
    if (id === 'toy-robot') {
      const r = new ToyRobot(this.g.progress.robotDesign ?? {});
      r.scale.setScalar(0.4);
      r.position.copy(p);
      r.rotation.y = -Math.PI / 2;
      r.alive = true;
      grp.add(r);
      this.robot = r;
    } else if (id === 'toy-train') {
      const tr = new THREE.Group();
      const eng = mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3), mat(0xe53935));
      eng.position.y = 0.25;
      const cab = mesh(new THREE.BoxGeometry(0.25, 0.25, 0.3), mat(0x1e88e5));
      cab.position.set(-0.15, 0.55, 0);
      const st = mesh(cyl(0.06, 0.08, 0.2, 8), mat(0x212121));
      st.position.set(0.15, 0.5, 0);
      tr.add(eng, cab, st);
      for (const x of [-0.15, 0.15]) for (const z of [-0.16, 0.16]) {
        const w = mesh(cyl(0.1, 0.1, 0.05, 12), mat(0xfdd835));
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.1, z);
        tr.add(w);
      }
      tr.position.copy(p);
      tr.rotation.y = Math.PI / 2;
      grp.add(tr);
    } else if (id === 'toy-snowman') {
      const s = new Snowman();
      s.scale.setScalar(0.22);
      s.position.copy(p);
      s.rotation.y = -Math.PI / 2;
      s.setHappy(true);
      grp.add(s);
    }
  }

  applySettings(): void {
    this.hero.setLook(this.g.settings.hero);
    this.bursts.reduced = this.g.settings.reducedEffects;
  }

  enter(): void {
    this.applySettings();
    this.robot = null;
    this.rebuild();
    this.g.hud.show(true);
    this.g.hud.setBag([]);
    this.exitBtn.classList.remove('hidden');
    this.hero.play('wave');
    const n = UNLOCKS.filter((u) => this.g.has(u.id) && (u.kind === 'decoration' || u.kind === 'toy')).length;
    setTimeout(() => void this.g.director.tell('Twinkle', 'present', n ? 'Welcome home! Tap the sparkles to change your decorations.' : 'This is your cozy cabin! Play games in the village to win decorations for it.'), 600);
  }

  exit(): void {
    this.exitBtn.classList.add('hidden');
  }

  hint(): { text: string; portrait: string } {
    return { text: 'Tap the sparkles to change your decorations. Tap the door to go outside.', portrait: 'present' };
  }

  update(dt: number, t: number): void {
    this.t = t;
    const g = this.g;
    this.yaw = THREE.MathUtils.clamp(this.yaw - g.input.dragDX * 0.003, -0.5, 0.5);
    const cp = v3(Math.sin(this.yaw) * 10, 4.4, Math.cos(this.yaw) * 10);
    this.camera.position.lerp(cp, 1 - Math.exp(-6 * dt));
    this.camera.lookAt(0, 2, -1);
    this.fire.intensity = 14 + Math.sin(t * 13) * 3 + Math.sin(t * 7.3) * 2;
    this.flames.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(t * 9 + i * 2) * 0.25; f.position.y = 0.45 + f.scale.y * 0.1; });
    for (const m of this.markers.values()) m.scale.setScalar(0.6 + Math.sin(t * 4) * 0.08);
    this.hero.animate(dt, 0, 0, true, g.settings.reducedMotion);
    this.robot?.update(dt);
    for (const l of this.lights) l.update(t);
    this.bursts.update(dt);
    if (g.director.busy) return;
    for (const c of g.input.clicks) {
      const ndc = new THREE.Vector2((c.x / innerWidth) * 2 - 1, -(c.y / innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObjects([...this.markers.values()].filter((m) => m.visible), false)[0];
      if (hit) this.cycle(hit.object.userData.slot as Slot);
      else if (this.raycaster.intersectObject(this.hero, true).length) { this.hero.play('celebrate'); g.audio.sfx('cheer'); }
    }
  }

  private cycle(s: Slot): void {
    const un = this.unlockedFor(s);
    if (!un.length) return;
    if (s === 'shelf') {
      this.robot?.parts.head.rotation.set(0, 0, 0);
      this.hero.play('celebrate');
      this.g.audio.sfx('cheer');
      return;
    }
    const opts = [...un, 'none'];
    const cur = this.chosen(s) ?? 'none';
    const next = opts[(opts.indexOf(cur) + 1) % opts.length];
    this.g.progress.cabin[s] = next;
    this.g.store.save();
    this.g.audio.sfx('magic');
    this.bursts.burst(SLOT_POS[s], { count: 40, speed: 4 });
    this.rebuild();
  }
}
