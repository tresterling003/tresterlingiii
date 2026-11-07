import './styles.css';
import { Game } from './game';
import { VillageScene } from './scenes/village';
import { FactoryScene } from './scenes/factory';
import { DashScene } from './scenes/dash';
import { CabinScene } from './scenes/cabin';
import { showBreak, showSetup, showTitle, showWardrobe } from './ui/menus';
import { adultGate, showDashboard } from './ui/parent';
import { DevPanel } from './ui/devPanel';

const app = document.getElementById('app')!;
const loading = document.getElementById('loading');

function boot(): void {
  let game: Game;
  try {
    game = new Game(app);
  } catch (e) {
    app.innerHTML = `<div class="fatal">This browser could not start 3D graphics (WebGL).<br>Please try an up-to-date Chrome, Edge, Safari or Firefox.<br><small>${String(e)}</small></div>`;
    return;
  }
  const g = game;
  g.register('village', new VillageScene(g));
  g.register('factory', new FactoryScene(g));
  g.register('dash', new DashScene(g));
  g.register('cabin', new CabinScene(g));
  const dev = new DevPanel(g);
  const params = new URLSearchParams(location.search);
  if (params.has('dev')) dev.toggle(true);
  if (params.has('sim')) g.director.sim = true;
  if (params.has('quiet')) g.speaker.enabled = false; // automated tests: captions only, no speech synthesis
  (window as unknown as { __vq: Game }).__vq = g; // handy for automated smoke tests

  let title: HTMLElement | null = null;
  const resume = () => { g.paused = false; g.hud.show(true); };
  const pause = () => { g.paused = true; g.speaker.cancel(); };

  const needsSetup = (then: () => void) => {
    if (g.settings.setupDone) then();
    else showSetup(g, then);
  };

  const openTitle = () => {
    pause();
    g.hud.show(false);
    if (g.currentName !== 'village') void g.goto('village');
    title = showTitle(
      g,
      () => needsSetup(() => { title?.remove(); title = null; resume(); }),
      () => needsSetup(() => { title?.remove(); title = null; void g.goto('cabin').then(resume); }),
      () => adultGate(() => showDashboard(g, () => {})),
    );
  };

  g.onOpenParent = () => {
    pause();
    adultGate(() => showDashboard(g, resume), resume);
  };
  g.onOpenWardrobe = () => {
    pause();
    showWardrobe(g, resume);
  };
  g.onHome = () => {
    if (g.director.busy) return;
    if (g.currentName === 'village') openTitle();
    else void g.goto('village', { from: g.currentName ?? undefined });
  };
  g.onBreak = () => {
    pause();
    showBreak(g, () => { g.recordSession(); openTitle(); g.extendSession(); }, () => adultGate(() => { g.extendSession(); resume(); }, () => g.onBreak?.()));
  };
  window.addEventListener('beforeunload', () => g.recordSession());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !title && !document.querySelector('.overlay')) g.onHome?.();
  });

  void g.goto('village').then(() => {
    loading?.remove();
    openTitle();
  });
}

boot();
