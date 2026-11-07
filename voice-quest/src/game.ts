import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AudioEngine } from './core/audio';
import { Input } from './core/input';
import { Store } from './core/storage';
import { Speaker, VOICES } from './core/tts';
import { UNLOCKS } from './data/content';
import { Hud } from './ui/hud';
import { VoiceDirector } from './ui/voiceDirector';
import { el } from './ui/dom';

export type SceneName = 'village' | 'factory' | 'dash' | 'cabin';

export interface GameScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  music: 'village' | 'factory' | 'dash' | 'cabin';
  enter(arg?: unknown): void;
  exit(): void;
  update(dt: number, t: number): void;
  /** spoken replay of the current goal (🔊 button) */
  hint(): { text: string; portrait: string };
  /** called when settings change */
  applySettings?(): void;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  input: Input;
  audio = new AudioEngine();
  speaker = new Speaker();
  store = new Store();
  hud: Hud;
  director: VoiceDirector;
  ui: HTMLElement;
  envMap: THREE.Texture;
  scenes = new Map<SceneName, GameScene>();
  current: GameScene | null = null;
  currentName: SceneName | null = null;
  private fade: HTMLElement;
  private clock = new THREE.Clock();
  private t = 0;
  paused = true;
  playSeconds = 0;
  private breakShown = false;
  onBreak?: () => void;
  onOpenParent?: () => void;
  onOpenWardrobe?: () => void;
  onHome?: () => void;
  private sessionStart = Date.now();
  private fps = 60;
  qualityLow = false;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);
    this.renderer.domElement.classList.add('gl');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.input = new Input(this.renderer.domElement);
    this.ui = el('div', { class: 'ui' });
    container.append(this.ui);
    this.hud = new Hud(this.ui);
    this.director = new VoiceDirector(this.store, this.speaker, this.audio, this.ui);
    this.director.onStatus = (s) => this.hud.mic(s === 'listening');
    this.fade = el('div', { class: 'fade' });
    this.ui.append(this.fade);
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    this.hud.onReplay = () => this.replayHint();
    this.hud.onParent = () => this.onOpenParent?.();
    this.hud.onWardrobe = () => this.onOpenWardrobe?.();
    this.hud.onHome = () => this.onHome?.();
    this.refreshHud();
    this.loop();
  }

  get settings() {
    return this.store.settings;
  }
  get progress() {
    return this.store.progress;
  }
  get reduced(): boolean {
    return this.settings.reducedMotion;
  }

  applySettings(): void {
    const s = this.settings;
    this.audio.setVolumes(s.volumes);
    this.speaker.volume = s.volumes.voice * s.volumes.master;
    this.speaker.lang = s.lang;
    this.renderer.shadowMap.enabled = !s.reducedEffects;
    this.renderer.setPixelRatio(s.reducedEffects || this.qualityLow ? 1 : Math.min(window.devicePixelRatio, 2));
    document.body.classList.toggle('reduced-motion', s.reducedMotion);
    for (const sc of this.scenes.values()) sc.applySettings?.();
    this.store.save();
  }

  register(name: SceneName, s: GameScene): void {
    this.scenes.set(name, s);
    s.scene.environment = this.envMap;
  }

  async goto(name: SceneName, arg?: unknown): Promise<void> {
    this.fade.classList.add('on');
    this.audio.sfx('whoosh');
    await new Promise((r) => setTimeout(r, 380));
    this.current?.exit();
    this.director.generation++;
    this.speaker.cancel();
    this.current = this.scenes.get(name)!;
    this.currentName = name;
    this.current.enter(arg);
    this.audio.playSong(this.current.music);
    this.resize();
    this.fade.classList.remove('on');
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.current) {
      this.current.camera.aspect = w / h;
      this.current.camera.updateProjectionMatrix();
    }
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    this.t += dt;
    this.fps = this.fps * 0.9 + (1 / Math.max(raw, 1e-3)) * 0.1;
    if (!this.current) return;
    this.input.enabled = !this.paused && !this.director.busy;
    if (!this.paused) {
      this.current.update(dt, this.t);
      this.playSeconds += dt;
      this.checkSession();
    } else {
      // keep the world gently alive behind menus
      this.current.update(dt * 0.6, this.t);
    }
    this.input.endFrame();
    this.renderer.render(this.current.scene, this.current.camera);
  };

  private checkSession(): void {
    const m = this.settings.sessionMinutes;
    if (!m || this.breakShown) return;
    if (this.playSeconds > m * 60 && !this.director.busy) {
      this.breakShown = true;
      this.onBreak?.();
    }
  }

  /** Parent chose to keep playing after a break reminder. */
  extendSession(): void {
    this.breakShown = false;
    this.playSeconds = 0;
  }

  recordSession(): void {
    const p = this.progress;
    p.sessions.push({ start: this.sessionStart, minutes: Math.round(this.playSeconds / 60) });
    if (p.sessions.length > 200) p.sessions.shift();
    this.store.save(true);
  }

  replayHint(): void {
    if (!this.current || this.director.busy) return;
    const h = this.current.hint();
    void this.director.tell('Twinkle', h.portrait, h.text, VOICES.twinkle);
  }

  refreshHud(): void {
    const p = this.progress;
    this.hud.set(p.stars, p.coins, p.bells);
  }

  // ---------------- rewards ----------------
  addStars(n: number): void {
    this.progress.stars += n;
    this.audio.sfx('star');
    this.refreshHud();
    if (this.progress.stars >= 15) this.unlock('outfit-crown');
    this.store.save();
  }
  addCoins(n: number): void {
    this.progress.coins += n;
    this.audio.sfx('coin');
    this.refreshHud();
    this.store.save();
  }
  addBells(n: number): void {
    this.progress.bells += n;
    this.audio.sfx('bell', 1320);
    this.refreshHud();
    this.store.save();
  }
  has(id: string): boolean {
    return this.progress.unlocks.includes(id);
  }
  unlock(id: string): boolean {
    if (this.has(id)) return false;
    const u = UNLOCKS.find((x) => x.id === id);
    if (!u) return false;
    this.progress.unlocks.push(id);
    this.hud.toast(u.icon, `New: ${u.name}!`);
    this.audio.sfx('magic');
    this.store.save();
    return true;
  }
  complete(activity: string): void {
    this.progress.completions[activity] = (this.progress.completions[activity] ?? 0) + 1;
    this.store.save();
  }
  isFound(id: string): boolean {
    return this.progress.found.includes(id);
  }
  markFound(id: string): void {
    if (!this.isFound(id)) this.progress.found.push(id);
    this.store.save();
  }

  get fpsEstimate(): number {
    return this.fps;
  }
}
