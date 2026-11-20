// Playing with friends. Filled in below.
export class Net {
  constructor(game) { this.g = game; this.host = false; this.guest = false; }
  tick() {}
  joinDialog() { this.g.ui.toast('Co-op is coming soon.'); }
}
