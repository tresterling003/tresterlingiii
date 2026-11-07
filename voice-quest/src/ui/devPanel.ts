// Developer-only voice testing panel. Clearly separates recognizer/technical problems from player responses.
import type { Game } from '../game';
import type { TurnLog } from './voiceDirector';
import { el, esc } from './dom';

export class DevPanel {
  root: HTMLElement;
  private visible = false;
  constructor(private g: Game) {
    this.root = el('div', { class: 'devpanel hidden' });
    g.ui.append(this.root);
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' && (g.settings.devPanel || new URLSearchParams(location.search).has('dev'))) this.toggle();
    });
    g.director.onTurn = () => this.render();
    g.director.onStatus = (s) => {
      g.hud.mic(s === 'listening');
      const st = this.root.querySelector('#dv-listen');
      if (st) st.textContent = s;
    };
    setInterval(() => this.visible && this.renderStatus(), 500);
  }

  toggle(force?: boolean): void {
    this.visible = force ?? !this.visible;
    this.root.classList.toggle('hidden', !this.visible);
    if (this.visible) this.render();
  }

  private async permission(): Promise<string> {
    try {
      const p = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
      return p?.state ?? 'unknown';
    } catch {
      return 'unknown (Permissions API unavailable)';
    }
  }

  private async renderStatus(): Promise<void> {
    const d = this.g.director;
    const e = this.root.querySelector('#dv-status');
    if (!e) return;
    e.innerHTML = `Mic permission: <b>${await this.permission()}</b> · Setting: <b>${this.g.settings.voiceMode}</b> · Active mode: <b>${d.mode}</b> · Recognition API: <b>${d.recognitionSupported() ? 'available' : 'missing'}</b> · Consent: <b>${this.g.settings.consentExternal}</b> · FPS ~${Math.round(this.g.fpsEstimate)}${d.runtimeNote ? `<br><span class="warn">${esc(d.runtimeNote)}</span>` : ''}`;
  }

  private turnHTML(l: TurnLog): string {
    const t = l.turn;
    const techIssue = t.state === 'unavailable' || (t.recognizerError && t.recognizerError !== 'no-speech' && t.recognizerError !== 'aborted');
    return `<div class="dv-turn ${techIssue ? 'tech' : ''}">
      <div><b>${esc(l.activity)}</b> · expected <b>${esc(l.expected)}</b> · mode ${l.mode}${l.sim ? ' · <i>SIMULATED</i>' : ''}</div>
      <div>Accepted: <span class="muted">${esc(l.accepted.slice(0, 12).join(', '))}</span></div>
      <div>Mic: ${t.micStatus} · Speech detected (VAD): <b>${t.vad ? (t.vad.speechDetected ? `yes (${Math.round(t.vad.voicedMs)}ms, peak ${t.vad.peak.toFixed(3)}, floor ${t.vad.noiseFloor.toFixed(3)})` : 'no') : 'n/a'}</b></div>
      <div>Transcripts: <b>${t.transcripts.length ? t.transcripts.map(esc).join(' | ') : '—'}</b> · confidence: ${t.match?.confidence !== undefined ? t.match.confidence.toFixed(2) : 'n/a'}</div>
      <div>Match: ${t.match ? `${t.match.how}${t.match.matchedText ? ` (“${esc(t.match.matchedText)}”)` : ''}` : '—'} · <b>Final state: ${t.state}${t.success ? ' ✅' : ''}${t.activityOnly ? ' (activity only)' : ''}</b> · ${Math.round(t.durationMs)}ms</div>
      ${t.recognizerError || t.errorMessage ? `<div class="warn">${techIssue ? 'TECHNICAL: ' : ''}${esc(t.recognizerError ?? '')} ${esc(t.errorMessage ?? '')}</div>` : ''}
    </div>`;
  }

  render(): void {
    if (!this.visible) return;
    const d = this.g.director;
    const sim = d.simRec;
    this.root.innerHTML = `
      <div class="dv-head"><b>Voice test panel (developer)</b><button class="btn tiny" id="dv-x">✕</button></div>
      <div id="dv-status" class="dv-sec"></div>
      <div class="dv-sec">Listening: <b id="dv-listen">—</b></div>
      <div class="dv-sec">
        <label><input type="checkbox" id="dv-sim" ${d.sim ? 'checked' : ''}/> Simulate microphone + recognizer (no real mic is opened)</label>
        <div class="row-btns">Next response:
          <button class="btn tiny" data-q="expected">✓ expected</button>
          <button class="btn tiny" data-q="mumble">~ voice, no words</button>
          <button class="btn tiny" data-q="silence">∅ silence</button>
          <button class="btn tiny" data-q="err-not-allowed">⚠ permission denied</button>
          <button class="btn tiny" data-q="err-network">⚠ network error</button>
        </div>
        <div class="row-btns"><input id="dv-text" placeholder="say custom text…"/><button class="btn tiny" id="dv-say">queue</button></div>
        <div class="muted">Queue: ${sim.queue.map((q) => (q.kind === 'say' ? `"${esc(q.text)}"` : q.kind === 'error' ? `error:${q.code}` : q.kind)).join(', ') || '(empty → expected answer)'}</div>
      </div>
      <div class="dv-sec dv-log">${d.log.slice(-8).reverse().map((l) => this.turnHTML(l)).join('') || '<span class="muted">No turns yet.</span>'}</div>`;
    void this.renderStatus();
    this.root.querySelector('#dv-x')!.addEventListener('click', () => this.toggle(false));
    this.root.querySelector<HTMLInputElement>('#dv-sim')!.addEventListener('change', (e) => { d.sim = (e.target as HTMLInputElement).checked; this.render(); });
    this.root.querySelectorAll<HTMLElement>('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const q = b.dataset.q!;
      if (q === 'expected') sim.queue.push({ kind: 'say', text: '__expected__' });
      else if (q === 'mumble') sim.queue.push({ kind: 'mumble' });
      else if (q === 'silence') sim.queue.push({ kind: 'silence' });
      else if (q === 'err-not-allowed') sim.queue.push({ kind: 'error', code: 'not-allowed' });
      else if (q === 'err-network') sim.queue.push({ kind: 'error', code: 'network' });
      this.render();
    }));
    this.root.querySelector('#dv-say')!.addEventListener('click', () => {
      const v = this.root.querySelector<HTMLInputElement>('#dv-text')!.value;
      sim.queue.push({ kind: 'say', text: v });
      this.render();
    });
  }
}
