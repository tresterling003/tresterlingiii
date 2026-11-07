// Keyboard, mouse (drag to look, click to walk/select) and optional gamepad.

export class Input {
  keys = new Set<string>();
  private pressed = new Set<string>();
  dragDX = 0;
  dragDY = 0;
  wheel = 0;
  clicks: { x: number; y: number }[] = [];
  pointerX = 0;
  pointerY = 0;
  private down: { x: number; y: number; t: number; moved: number } | null = null;
  enabled = true;
  private padJumpPrev = false;
  private padActPrev = false;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      if (this.down) {
        this.dragDX += e.movementX;
        this.dragDY += e.movementY;
        this.down.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (this.down && this.down.moved < 8 && performance.now() - this.down.t < 600) this.clicks.push({ x: e.clientX, y: e.clientY });
      this.down = null;
    });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** true once per key press */
  hit(...codes: string[]): boolean {
    let r = false;
    for (const c of codes) if (this.pressed.has(c)) r = true;
    return r;
  }

  axis(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    const pad = this.pad();
    if (pad) {
      if (Math.abs(pad.axes[0]) > 0.2) x += pad.axes[0];
      if (Math.abs(pad.axes[1]) > 0.2) y -= pad.axes[1];
      if (Math.abs(pad.axes[2] ?? 0) > 0.2) this.dragDX += (pad.axes[2] ?? 0) * 6;
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  jumpPressed(): boolean {
    const pad = this.pad();
    const pj = !!pad?.buttons[0]?.pressed;
    const r = this.hit('Space') || (pj && !this.padJumpPrev);
    this.padJumpPrev = pj;
    return r;
  }
  actPressed(): boolean {
    const pad = this.pad();
    const pa = !!pad?.buttons[2]?.pressed || !!pad?.buttons[1]?.pressed;
    const r = this.hit('KeyE', 'Enter') || (pa && !this.padActPrev);
    this.padActPrev = pa;
    return r;
  }

  endFrame(): void {
    this.pressed.clear();
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheel = 0;
    this.clicks.length = 0;
  }
}
