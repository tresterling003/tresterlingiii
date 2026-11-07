import { el } from './dom';
import { iconSVG } from '../data/icons';

export class Hud {
  root: HTMLElement;
  private stars: HTMLElement;
  private coins: HTMLElement;
  private bells: HTMLElement;
  private bag: HTMLElement;
  private actionBtn: HTMLButtonElement;
  private toastBox: HTMLElement;
  private micBadge: HTMLElement;
  onAction?: () => void;
  onReplay?: () => void;
  onHome?: () => void;
  onWardrobe?: () => void;
  onParent?: () => void;

  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'hud hidden' });
    const mk = (cls: string, icon: string) => {
      const v = el('span', { class: 'v', text: '0' });
      const b = el('div', { class: `chip ${cls}` }, [el('span', { class: 'i', html: icon }), v]);
      return { b, v };
    };
    const s = mk('stars', iconSVG('star'));
    const c = mk('coins', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#ffc93c" stroke="#e0a200" stroke-width="8"/><path d="M50 28v44" stroke="#e0a200" stroke-width="8" stroke-linecap="round"/></svg>');
    const b = mk('bells', iconSVG('bell'));
    this.stars = s.v;
    this.coins = c.v;
    this.bells = b.v;
    this.bag = el('div', { class: 'bag' });
    const left = el('div', { class: 'hud-left' }, [s.b, c.b, b.b, this.bag]);
    const btn = (icon: string, label: string, cb: () => void, cls = '') => {
      const e = el('button', { class: `hud-btn ${cls}`, 'aria-label': label, title: label, html: icon });
      e.addEventListener('click', (ev) => { ev.stopPropagation(); cb(); });
      return e;
    };
    const right = el('div', { class: 'hud-right' }, [
      btn('🔊', 'Hear again', () => this.onReplay?.(), 'big'),
      btn('🏠', 'Village', () => this.onHome?.()),
      btn('👕', 'Dress up', () => this.onWardrobe?.()),
      btn('⚙️', 'Grown-ups', () => this.onParent?.(), 'parent'),
    ]);
    this.actionBtn = el('button', { class: 'action-btn hidden' });
    this.actionBtn.addEventListener('click', (e) => { e.stopPropagation(); this.onAction?.(); });
    this.toastBox = el('div', { class: 'toasts' });
    this.micBadge = el('div', { class: 'mic-badge hidden', html: '🎤 <span>Listening</span>' });
    this.root.append(left, right, this.actionBtn, this.toastBox, this.micBadge);
    parent.append(this.root);
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  set(stars: number, coins: number, bells: number): void {
    const bump = (e: HTMLElement, v: number) => {
      if (e.textContent !== String(v)) {
        e.textContent = String(v);
        e.parentElement?.classList.remove('bump');
        void e.parentElement?.offsetWidth;
        e.parentElement?.classList.add('bump');
      }
    };
    bump(this.stars, stars);
    bump(this.coins, coins);
    bump(this.bells, bells);
  }

  setBag(pics: string[]): void {
    this.bag.innerHTML = pics.map((p) => `<div class="bag-item">${iconSVG(p)}</div>`).join('');
  }

  /** Big contextual action button (also triggered by E / Enter). */
  setAction(pic: string | null, label = ''): void {
    if (!pic) {
      this.actionBtn.classList.add('hidden');
      return;
    }
    this.actionBtn.classList.remove('hidden');
    const html = `<span class="pic">${iconSVG(pic)}</span><span class="hand">👋</span><span class="key">${label}</span>`;
    if (this.actionBtn.dataset.html !== html) {
      this.actionBtn.innerHTML = html;
      this.actionBtn.dataset.html = html;
    }
  }

  toast(pic: string, text: string): void {
    const t = el('div', { class: 'toast' }, [el('div', { class: 'pic', html: iconSVG(pic) }), el('div', { class: 'txt', text })]);
    this.toastBox.append(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3800);
  }

  mic(on: boolean): void {
    this.micBadge.classList.toggle('hidden', !on);
  }
}
