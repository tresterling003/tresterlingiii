// End-to-end verification in a real browser (Chromium via Playwright).
// Usage: start the app (npm run dev, or npm run build && npm start), then
//   node scripts/verify-browser.cjs [url]
// Writes verify-output/report.json and prints a summary.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./pw.cjs');

const URL_ = process.argv[2] || process.env.FV_URL || 'http://localhost:5173/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const maxDiff = (a, b) => (a.length !== b.length ? Infinity : a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('coach: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('coach console: ' + m.text()));
  await page.goto(URL_);
  await page.waitForFunction(() => window.__ctl && window.__stages && window.__stages.length, null, { timeout: 90000 });
  const env = await page.evaluate(() => {
    const gl = window.__stages[0].renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return { ua: navigator.userAgent, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown', cores: navigator.hardwareConcurrency };
  });
  console.log('Environment:', JSON.stringify(env));

  // Helper: solve poses at time t and return a snapshot (renders one frame).
  const snapAt = (t) => page.evaluate(async (t) => {
    const c = window.__ctl;
    c.pause();
    c.seek(t);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__stages[0].poseSnapshot();
  }, t);

  // 1. Counts / spacing
  const counts = await page.evaluate(() => {
    const c = window.__ctl;
    const out = [];
    for (const d of c.store.get().drills) {
      c.loadDrill(d, { seed: 1 });
      const tl = c.timeline;
      out.push({ id: d.id, players: tl.tracks.length, onLine: d.players.filter((p) => p.onLine).length, defenders: d.defense.defenders.length });
    }
    return out;
  });
  check('Every drill has 11 offensive players', counts.every((c) => c.players === 11), `${counts.length} drills`);
  check('Every drill has ≥7 on the line', counts.every((c) => c.onLine >= 7));
  await page.evaluate(() => window.__ctl.loadDrill(window.__ctl.findDrill('demo-across-rl'), { seed: 1 }));
  await page.waitForTimeout(300);
  const dbg = await page.evaluate(() => window.__stages[0].debugInfo());
  check('Renderer shows 11 offensive + 10 defensive players (athlete is the camera)', dbg.actors === 11 && dbg.defenders === 10, JSON.stringify(dbg));

  // 2. Exact replay determinism (different seeds in between)
  await page.evaluate(() => window.__ctl.loadDrill(window.__ctl.findDrill('demo-jet-rl'), { seed: 777 }));
  const times = [0.5, 3.0, 5.2, 6.1, 6.9, 7.8];
  const first = [];
  for (const t of times) first.push(await snapAt(t));
  await page.evaluate(() => window.__ctl.loadDrill(window.__ctl.findDrill('demo-jet-rl'), { seed: 12345 }));
  const other = await snapAt(6.1);
  await page.evaluate(() => window.__ctl.loadDrill(window.__ctl.findDrill('demo-jet-rl'), { seed: 777 }));
  let worst = 0;
  for (const [i, t] of [...times].reverse().entries()) worst = Math.max(worst, maxDiff(first[times.length - 1 - i], await snapAt(t)));
  check('Replay reproduces identical player positions/poses (scrubbed in reverse order)', worst === 0, `max difference ${worst}`);
  check('A new rep (different seed) changes timing', maxDiff(first[3], other) > 1e-3);

  // 3. Clock: speed, pause, freeze, reset
  const clock = await page.evaluate(async () => {
    const c = window.__ctl;
    c.loadDrill(c.findDrill('demo-across-rl'), { seed: 1 });
    c.setFreezeMode('none');
    c.seek(0);
    c.setSpeed(2);
    c.play();
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 1000));
    const el = (performance.now() - t0) / 1000;
    const tPlay = c.now();
    c.pause();
    const tp1 = c.now();
    await new Promise((r) => setTimeout(r, 400));
    const tp2 = c.now();
    c.setSpeed(0.5);
    c.play();
    const t1 = performance.now();
    await new Promise((r) => setTimeout(r, 1000));
    const elSlow = (performance.now() - t1) / 1000;
    const tSlow = (c.now() - tp2) / elSlow; // sim seconds per real second
    c.pause();
    // freeze at the drill decision point
    c.setFreezeMode('drill');
    c.setSpeed(4);
    c.seek(0);
    c.play();
    await new Promise((r) => {
      const id = setInterval(() => {
        if (!c.state.clock.playing) {
          clearInterval(id);
          r();
        }
      }, 20);
    });
    const frozeAt = c.now();
    const decision = c.timeline.markers.decision;
    c.seek(0);
    const reset = c.now();
    c.setSpeed(1);
    return { el, tPlay, tp1, tp2, tSlow, frozeAt, decision, reset };
  });
  check('2× speed advances ~2 s of sim time per real second', Math.abs(clock.tPlay - 2 * clock.el) < 0.15, `sim ${clock.tPlay.toFixed(3)} s in ${clock.el.toFixed(3)} s`);
  check('Pause holds time exactly', clock.tp1 === clock.tp2, `${clock.tp1} → ${clock.tp2}`);
  check('0.5× speed advances ~0.5 s per real second', Math.abs(clock.tSlow - 0.5) < 0.05, `${clock.tSlow.toFixed(3)} sim s per real s`);
  check('Freeze stops exactly at the decision point', Math.abs(clock.frozeAt - clock.decision) < 1e-9, `${clock.frozeAt} vs ${clock.decision}`);
  check('Reset returns to t = 0', clock.reset === 0);
  // Pose reached by playing at 3× and freezing equals the pose reached by seeking
  const viaPlay = await page.evaluate(async () => {
    const c = window.__ctl;
    c.setFreezeMode('pre-snap');
    c.setSpeed(3);
    c.seek(0);
    c.play();
    await new Promise((r) => {
      const id = setInterval(() => {
        if (!c.state.clock.playing) {
          clearInterval(id);
          r();
        }
      }, 20);
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    c.setSpeed(1);
    return { t: c.now(), snap: window.__stages[0].poseSnapshot() };
  });
  const viaSeek = await snapAt(viaPlay.t);
  check('Snap-time pose is identical whether reached by playback (3×) or by scrubbing', maxDiff(viaPlay.snap, viaSeek) === 0, `t=${viaPlay.t.toFixed(4)}`);
  await page.evaluate(() => window.__ctl.setFreezeMode('drill'));

  // 4. Coach ↔ projector window synchronization
  const [display] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => window.__ctl.sync.openDisplay())]);
  display.on('pageerror', (e) => errors.push('display: ' + e.message));
  await display.waitForFunction(() => window.__stages && window.__stages.length && window.__displayState && window.__displayState(), null, { timeout: 90000 });
  // software rendering is slow here: poll for heartbeats rather than sleeping
  await page.waitForFunction(() => window.__ctl.sync.connectedDisplays() > 0, null, { timeout: 30000 }).catch(() => {});
  const connected = await page.evaluate(() => window.__ctl.sync.connectedDisplays());
  check('Projector window connects and sends heartbeats', connected === 1, `${connected} connected`);
  for (const t of [2.345, 7.777]) {
    await page.evaluate((t) => {
      const c = window.__ctl;
      c.pause();
      c.seek(t);
    }, t);
    await page.waitForFunction((t) => window.__stages[0].lastT === t, t, { timeout: 30000 }).catch(() => {});
    await display.waitForFunction((t) => window.__stages[0].lastT === t, t, { timeout: 30000 }).catch(() => {});
    const a = await page.evaluate(() => ({ t: window.__stages[0].lastT, s: window.__stages[0].poseSnapshot() }));
    const b = await display.evaluate(() => ({ t: window.__stages[0].lastT, s: window.__stages[0].poseSnapshot() }));
    check(`Projector shows the identical frame when paused at ${t} s`, a.t === b.t && maxDiff(a.s, b.s) === 0, `coach t=${a.t} display t=${b.t} diff=${maxDiff(a.s, b.s)}`);
  }
  // During playback both windows compute the same time from the shared clock anchor
  await page.evaluate(() => {
    const c = window.__ctl;
    c.setFreezeMode('none');
    c.seek(1);
    c.play();
  });
  await page.waitForTimeout(500);
  const wall = await page.evaluate(() => performance.timeOrigin + performance.now() + 50);
  const tc = await page.evaluate((w) => {
    const c = window.__ctl.state.clock;
    return c.anchorT + ((w - c.anchorWall) / 1000) * c.speed;
  }, wall);
  const td = await display.evaluate((w) => {
    const c = window.__displayState().clock;
    return c.anchorT + ((w - c.anchorWall) / 1000) * c.speed;
  }, wall);
  check('During playback both windows derive the same sim time for the same instant', Math.abs(tc - td) < 1e-9, `coach ${tc.toFixed(6)} display ${td.toFixed(6)}`);
  // Key press in the projector window (presentation remote) drives the coach
  await page.evaluate(() => window.__ctl.pause());
  await display.bringToFront();
  await display.keyboard.press('KeyB');
  await page.waitForFunction(() => window.__ctl.state.clock.playing, null, { timeout: 15000 }).catch(() => {});
  const playingAfterKey = await page.evaluate(() => window.__ctl.state.clock.playing);
  check('A remote key pressed in the projector window controls the coach timeline', playingAfterKey === true);
  await page.evaluate(() => {
    window.__ctl.pause();
    window.__ctl.setFreezeMode('drill');
  });
  // evaluation mode propagates
  await page.evaluate(() => window.__ctl.update({ evaluation: true }));
  await display.waitForFunction(() => window.__displayState().evaluation === true, null, { timeout: 15000 }).catch(() => {});
  check('Evaluation mode propagates to the projector', await display.evaluate(() => window.__displayState().evaluation === true));
  await display.close();
  await page.bringToFront();

  // 5. Solo session (recognition test) driven by key presses
  const sessionResult = await page.evaluate(async () => {
    const c = window.__ctl;
    c.setSpeed(3);
    c.store.setJson('sessions', []);
    c.startSession({
      drillIds: ['demo-across-rl', 'demo-doubles-nomo', 'demo-jet-rl'],
      reps: 4,
      restSec: 0.5,
      randomOrder: true,
      randomTiming: true,
      mode: 'choice',
      answerWindowSec: 20,
      feedbackSec: 0.6,
      countdownSec: 0.5,
      showPostSnap: false,
      autoAdvance: true,
    });
    return c.session.queue.map((q) => q.drill.id);
  });
  let phases = new Set();
  const start = Date.now();
  let pressed = 0;
  while (Date.now() - start < 120000) {
    const st = await page.evaluate(() => ({ kind: window.__ctl.state.athlete.kind, phase: window.__ctl.session && window.__ctl.session.phase }));
    phases.add(st.phase);
    if (st.kind === 'summary') break;
    if (st.phase === 'decide') {
      await page.waitForTimeout(120);
      await page.keyboard.press(pressed % 2 ? 'Digit1' : 'Digit4');
      pressed++;
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(60);
  }
  const rec = await page.evaluate(() => window.__ctl.store.getJson('sessions', []).at(-1));
  check('Solo session runs countdown → rep → decision → feedback → rest → summary', ['countdown', 'watch', 'decide', 'feedback', 'rest', 'summary'].every((p) => phases.has(p)), [...phases].join(' → '));
  check('Solo session records 4 reps with answers and key response times', rec && rec.results.length === 4 && rec.results.every((r) => r.choiceId && typeof r.responseMs === 'number'), rec ? rec.results.map((r) => `${r.drillId}:${r.correct ? '✓' : '✗'} ${Math.round(r.responseMs)}ms`).join(', ') : 'no record');
  const missed = rec ? rec.results.filter((r) => !r.correct).length : 0;
  if (missed) {
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(500);
    const rq = await page.evaluate(() => window.__ctl.session && window.__ctl.session.queue.length);
    check('“Repeat missed” builds a session of exactly the missed reps', rq === missed, `${rq} queued for ${missed} missed`);
    await page.evaluate(() => window.__ctl.stopSession());
  } else {
    await page.keyboard.press('Space');
  }
  // Call-aloud mode with self-check
  await page.evaluate(() => {
    window.__ctl.startSession({ drillIds: ['demo-bunch'], reps: 1, restSec: 0, randomOrder: false, randomTiming: false, mode: 'aloud', answerWindowSec: 20, feedbackSec: 0.5, countdownSec: 0.3, showPostSnap: false, autoAdvance: true });
  });
  let aloudDone = false;
  const s2 = Date.now();
  while (Date.now() - s2 < 60000) {
    const ph = await page.evaluate(() => window.__ctl.session && window.__ctl.session.phase);
    if (ph === 'decide') await page.keyboard.press('Space');
    if (ph === 'feedback') {
      await page.keyboard.press('KeyY');
      await page.waitForTimeout(300);
    }
    if (ph === 'summary') {
      aloudDone = true;
      break;
    }
    await page.waitForTimeout(80);
  }
  const aloud = await page.evaluate(() => window.__ctl.store.getJson('sessions', []).at(-1));
  check('Call-aloud mode reveals the answer and records an athlete self-check', aloudDone && aloud.results[0].selfReported && aloud.results[0].correct === true);
  await page.evaluate(() => {
    window.__ctl.stopSession();
    window.__ctl.setSpeed(1);
    window.__ctl.update({ evaluation: false });
  });

  // 6. Persistence across reload + export/import
  const exported = await page.evaluate(() => {
    const c = window.__ctl;
    const d = { ...c.findDrill('demo-zip'), id: 'verify-drill', name: 'Verify Drill (saved)' };
    c.store.saveDrill(d);
    c.store.savePlaylist({ id: 'verify-pl', name: 'Verify playlist', drillIds: ['verify-drill', 'demo-bunch'] });
    return JSON.stringify(c.store.exportPackage());
  });
  await page.reload();
  await page.waitForFunction(() => window.__ctl, null, { timeout: 90000 });
  const afterReload = await page.evaluate(() => ({ d: !!window.__ctl.findDrill('verify-drill'), p: window.__ctl.store.get().playlists.some((p) => p.id === 'verify-pl') }));
  check('Saved drill and playlist survive a page reload', afterReload.d && afterReload.p);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__ctl, null, { timeout: 90000 });
  const cleared = await page.evaluate(() => !!window.__ctl.findDrill('verify-drill'));
  const imp = await page.evaluate((json) => window.__ctl.store.importPackage(json), exported);
  await page.reload();
  await page.waitForFunction(() => window.__ctl, null, { timeout: 90000 });
  const afterImport = await page.evaluate(() => !!window.__ctl.findDrill('verify-drill') && window.__ctl.store.get().playlists.some((p) => p.id === 'verify-pl'));
  check('Export → clear storage → import restores drills and playlists (and survives reload)', !cleared && imp.ok && afterImport, imp.ok ? imp.summary : JSON.stringify(imp.errors));
  const bad = await page.evaluate(() => window.__ctl.store.importPackage('{"format":"fieldview-package","version":1,"exportedAt":"x","drills":[{"id":"x"}]}'));
  check('Invalid package is rejected with validation errors', !bad.ok && bad.errors.length > 0, bad.ok ? '' : bad.errors.slice(0, 2).join('; '));

  // 7. Stability across repeated reps
  const stab = await page.evaluate(async () => {
    const c = window.__ctl;
    const st = window.__stages[0];
    const mem = () => ({ geo: st.renderer.info.memory.geometries, tex: st.renderer.info.memory.textures, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 });
    c.setFreezeMode('none');
    c.setSpeed(6);
    const drills = c.store.get().drills;
    const runReps = async (n, offset) => {
      for (let r = 0; r < n; r++) {
        c.loadDrill(drills[(r + offset) % drills.length], { seed: 500 + r, autoplay: true });
        await new Promise((res) => {
          const id = setInterval(() => {
            if (!c.state.clock.playing) {
              clearInterval(id);
              res();
            }
          }, 25);
        });
      }
    };
    await runReps(drills.length, 0); // warm up: every drill once
    if (window.gc) window.gc();
    await new Promise((r) => setTimeout(r, 300));
    const before = mem();
    const t0 = performance.now();
    await runReps(30, 3);
    const secs = (performance.now() - t0) / 1000;
    if (window.gc) window.gc();
    await new Promise((r) => setTimeout(r, 300));
    const after = mem();
    c.setSpeed(1);
    c.setFreezeMode('drill');
    return { before, after, secs, fps: st.stats.fps };
  });
  check('30 consecutive reps complete without errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('GPU resources do not leak across reps', stab.after.geo <= stab.before.geo + 5 && stab.after.tex <= stab.before.tex + 5, `geometries ${stab.before.geo}→${stab.after.geo}, textures ${stab.before.tex}→${stab.after.tex}`);
  check('JS heap stays bounded across reps', !stab.before.heap || stab.after.heap < stab.before.heap * 1.5 + 5e6, `${(stab.before.heap / 1e6).toFixed(1)} MB → ${(stab.after.heap / 1e6).toFixed(1)} MB`);

  // 8. Performance measurement (this environment)
  const perf = await page.evaluate(async () => {
    const st = window.__stages[0];
    const c = window.__ctl;
    c.loadDrill(c.findDrill('demo-across-rl'), { seed: 1 });
    c.setFreezeMode('none');
    c.seek(0);
    c.play();
    const frames = [];
    let last = performance.now();
    await new Promise((r) => {
      const step = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (frames.length < 60) requestAnimationFrame(step);
        else r();
      };
      requestAnimationFrame(step);
    });
    c.pause();
    const ms = frames.slice(3).sort((a, b) => a - b);
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    return { avgMs: avg, fps: 1000 / avg, draws: st.stats.drawCalls, tris: st.stats.triangles, w: st.renderer.domElement.width, h: st.renderer.domElement.height };
  });
  check('Performance measured (informational)', true, `${perf.fps.toFixed(1)} fps avg at ${perf.w}×${perf.h}, ${perf.draws} draw calls, ${perf.tris} triangles on "${env.renderer}"`);

  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  fs.mkdirSync(path.join(__dirname, '..', 'verify-output'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'verify-output', 'report.json'), JSON.stringify({ url: URL_, env, results, perf, date: new Date().toISOString() }, null, 2));
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
