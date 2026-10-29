import type { Drill } from '../data/schema';
import { DrillSchema } from '../data/schema';
import { compileTimeline, playerPosAt, SAMPLE_HZ, type Timeline } from './timeline';

export interface Issue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Football plausibility + NFHS pre-snap legality checks. These are WARNINGS
 * for the coach — a drill can intentionally show an illegal look.
 */
export function validateDrill(drill: Drill, tl?: Timeline): Issue[] {
  const issues: Issue[] = [];
  const parsed = DrillSchema.safeParse(drill);
  if (!parsed.success) {
    for (const e of parsed.error.issues.slice(0, 6)) issues.push({ level: 'error', message: `${e.path.join('.')}: ${e.message}` });
    return issues;
  }
  const P = drill.players;
  if (P.length !== 11) issues.push({ level: 'error', message: `Offense has ${P.length} players (must be 11).` });
  const ids = new Set(P.map((p) => p.id));
  if (ids.size !== P.length) issues.push({ level: 'error', message: 'Duplicate player ids.' });
  const nums = P.map((p) => p.number);
  if (new Set(nums).size !== nums.length) issues.push({ level: 'warning', message: 'Two offensive players share a jersey number.' });
  for (const m of drill.movements) if (!ids.has(m.playerId)) issues.push({ level: 'error', message: `Movement ${m.id} references unknown player ${m.playerId}.` });

  const t = tl ?? compileTimeline(drill, 1);
  const snap = t.snap;
  const atSnap = new Map(t.tracks.map((tr) => [tr.spec.id, playerPosAt(tr, snap - 1e-3, t)]));

  // Line of scrimmage count at the snap (uses on-line designation of the final spot).
  const onLine = P.filter((p) => {
    const pos = atSnap.get(p.id)!;
    return pos.y < 1.0;
  });
  if (onLine.length < 7) issues.push({ level: 'warning', message: `Only ${onLine.length} players on the line at the snap (NFHS requires at least 7).` });
  const flagged = P.filter((p) => p.onLine).length;
  if (flagged !== onLine.length)
    issues.push({ level: 'info', message: `${flagged} players are marked on-line but ${onLine.length} are within 1 yd of the ball at the snap.` });
  const interior = P.filter((p) => p.role === 'OL' && p.number >= 50 && p.number <= 79).length;
  if (interior < 5) issues.push({ level: 'warning', message: `Only ${interior} linemen numbered 50–79 (NFHS requires 5 on the line).` });
  if (!P.some((p) => p.role === 'QB')) issues.push({ level: 'info', message: 'No QB in the formation — the snap will have no receiver.' });

  // Spacing: no two players closer than 0.9 yd (overlap) at any time pre-snap.
  const step = Math.round(SAMPLE_HZ / 10);
  let overlap: string | null = null;
  for (let i = 0; i < t.samples && !overlap && i / SAMPLE_HZ < snap; i += step) {
    for (let a = 0; a < t.tracks.length && !overlap; a++)
      for (let b = a + 1; b < t.tracks.length; b++) {
        const A = t.tracks[a];
        const B = t.tracks[b];
        const pair = [A.spec.stance, B.spec.stance];
        if (pair.includes('qb-center') && pair.includes('center')) continue; // QB under center
        if (Math.hypot(A.x[i] - B.x[i], A.y[i] - B.y[i]) < 0.75) {
          overlap = `${A.spec.label} and ${B.spec.label} overlap at ${(i / SAMPLE_HZ).toFixed(1)} s`;
          break;
        }
      }
  }
  if (overlap) issues.push({ level: 'warning', message: `Spacing: ${overlap}.` });

  // Motion at the snap: only one player moving, and not toward the line.
  const iSnap = Math.min(t.samples - 1, Math.floor(snap * SAMPLE_HZ) - 1);
  const movers = t.tracks.filter((tr) => tr.speed[iSnap] > 0.2);
  if (movers.length > 1) issues.push({ level: 'warning', message: `${movers.length} players are moving at the snap (only one may be in motion).` });
  for (const tr of movers) {
    const vy = (tr.y[iSnap] - tr.y[iSnap - 1]) * SAMPLE_HZ;
    if (vy < -0.3) issues.push({ level: 'warning', message: `${tr.spec.label} is moving toward the line at the snap (illegal motion).` });
    if (tr.spec.onLine && tr.spec.y < 1) issues.push({ level: 'warning', message: `${tr.spec.label} is in motion but designated on the line.` });
  }

  // Shift must be followed by all 11 set for at least one second.
  if (t.markers.shiftEnd !== null) {
    const lastStop = Math.max(
      ...t.tracks.map((tr) => {
        for (let i = iSnap; i > 0; i--) if (tr.speed[i] > 0.12 && !movers.includes(tr)) return i / SAMPLE_HZ;
        return 0;
      }),
    );
    if (snap - lastStop < 1.0)
      issues.push({ level: 'warning', message: `After the shift, players are set only ${(snap - lastStop).toFixed(2)} s before the snap (NFHS: 1 second).` });
  }

  const ans = drill.answers;
  for (const c of ans.correct) if (!ans.choices.some((ch) => ch.id === c)) issues.push({ level: 'error', message: `Correct answer "${c}" is not one of the choices.` });
  if (!drill.defense.defenders.some((d) => d.id === drill.defense.athleteId))
    issues.push({ level: 'error', message: 'Athlete position is not one of the defenders.' });
  if (t.markers.decision > snap + 0.01) issues.push({ level: 'info', message: 'Decision point is after the snap.' });
  return issues;
}
