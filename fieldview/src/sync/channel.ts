import type { SharedState } from '../core/state';

// ---------------------------------------------------------------------------
// Coach ↔ projector synchronization. The coach window is authoritative: it
// sends the whole (small) SharedState whenever it changes. Playback timing is
// carried as a clock anchor (sim time + wall-clock epoch), so both windows
// compute identical times every frame without streaming per-frame updates.
//
// Transport: postMessage to/from windows opened with window.open (works even
// from file://) plus a BroadcastChannel for any other same-origin tab.
// ---------------------------------------------------------------------------

export type Msg =
  | { type: 'state'; state: SharedState; from: string }
  | { type: 'hello'; from: string }
  | { type: 'key'; code: string; key: string; wall: number; from: string }
  | { type: 'heartbeat'; from: string; fps: number; offscreen: number; size: [number, number] }
  | { type: 'bye'; from: string };

const CHANNEL = 'fieldview-sync-v1';
const id = Math.random().toString(36).slice(2);

function makeChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export class SyncHost {
  private bc = makeChannel();
  private popups = new Set<Window>();
  private last: SharedState | null = null;
  displays = new Map<string, { lastSeen: number; fps: number; size: [number, number] }>();
  onKey: (m: Extract<Msg, { type: 'key' }>) => void = () => {};
  onHeartbeat: () => void = () => {};

  constructor() {
    const handle = (data: unknown) => {
      const m = data as Msg;
      if (!m || typeof m !== 'object' || !('type' in m) || m.from === id) return;
      if (m.type === 'hello') {
        this.displays.set(m.from, { lastSeen: Date.now(), fps: 0, size: [0, 0] });
        if (this.last) this.send(this.last);
      } else if (m.type === 'key') this.onKey(m);
      else if (m.type === 'heartbeat') {
        this.displays.set(m.from, { lastSeen: Date.now(), fps: m.fps, size: m.size });
        this.onHeartbeat();
      } else if (m.type === 'bye') this.displays.delete(m.from);
    };
    if (this.bc) this.bc.onmessage = (e) => handle(e.data);
    window.addEventListener('message', (e) => {
      if (e.source && e.source !== window) handle(e.data);
    });
  }

  openDisplay(): Window | null {
    const url = location.href.split('#')[0] + '#/display';
    const w = window.open(url, 'fieldview-display', 'popup=yes,width=1280,height=720');
    if (w) this.popups.add(w);
    return w;
  }

  send(state: SharedState) {
    this.last = state;
    const msg: Msg = { type: 'state', state, from: id };
    this.bc?.postMessage(msg);
    for (const w of [...this.popups]) {
      if (w.closed) {
        this.popups.delete(w);
        continue;
      }
      try {
        w.postMessage(msg, '*');
      } catch {
        /* ignore */
      }
    }
  }

  connectedDisplays(): number {
    const now = Date.now();
    let n = 0;
    for (const [k, v] of this.displays) {
      if (now - v.lastSeen < 3000) n++;
      else if (now - v.lastSeen > 30000) this.displays.delete(k);
    }
    return n;
  }
}

export class SyncClient {
  private bc = makeChannel();
  onState: (s: SharedState) => void = () => {};

  constructor() {
    const handle = (data: unknown) => {
      const m = data as Msg;
      if (m && typeof m === 'object' && m.type === 'state' && m.from !== id) this.onState(m.state);
    };
    if (this.bc) this.bc.onmessage = (e) => handle(e.data);
    window.addEventListener('message', (e) => handle(e.data));
    window.addEventListener('beforeunload', () => this.post({ type: 'bye', from: id }));
  }

  hello() {
    this.post({ type: 'hello', from: id });
  }

  post(m: Msg) {
    this.bc?.postMessage(m);
    try {
      window.opener?.postMessage(m, '*');
    } catch {
      /* opener gone */
    }
  }

  key(e: KeyboardEvent) {
    this.post({ type: 'key', code: e.code, key: e.key, wall: performance.timeOrigin + e.timeStamp, from: id });
  }

  heartbeat(fps: number, offscreen: number) {
    this.post({ type: 'heartbeat', from: id, fps, offscreen, size: [window.innerWidth, window.innerHeight] });
  }
}
