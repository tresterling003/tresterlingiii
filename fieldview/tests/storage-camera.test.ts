import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { Store, type KvBackend } from '../src/data/store';
import { applyOffAxis, calibrationReference, DEFAULT_CALIBRATION, physicalScreen, wideScaleFactor } from '../src/render/camera';
import type { Calibration } from '../src/data/schema';

function mem(): KvBackend & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('local storage', () => {
  it('seeds demo content and survives a reload', () => {
    const kv = mem();
    const a = new Store(kv);
    const d = { ...a.get().drills[0], id: 'mine', name: 'My drill' };
    a.saveDrill(d);
    a.savePlaylist({ id: 'pl', name: 'Mine', drillIds: ['mine'] });
    const b = new Store(kv); // "reload"
    expect(b.get().drills.find((x) => x.id === 'mine')?.name).toBe('My drill');
    expect(b.get().playlists.find((p) => p.id === 'pl')?.drillIds).toEqual(['mine']);
  });

  it('exports and imports a validated package', () => {
    const src = new Store(mem());
    src.saveDrill({ ...src.get().drills[0], id: 'shared', name: 'Shared drill' });
    src.saveTeam({ ...src.get().team, offense: { ...src.get().team.offense, jersey: '#123456' } });
    const json = JSON.stringify(src.exportPackage());
    const dst = new Store(mem());
    const r = dst.importPackage(json);
    expect(r.ok).toBe(true);
    expect(dst.get().drills.some((d) => d.id === 'shared')).toBe(true);
    expect(dst.get().team.offense.jersey).toBe('#123456');
  });

  it('rejects malformed packages with readable errors', () => {
    const s = new Store(mem());
    expect(s.importPackage('not json').ok).toBe(false);
    const bad = s.exportPackage();
    (bad.drills[0] as unknown as { players: unknown[] }).players = bad.drills[0].players.slice(0, 9);
    const r = s.importPackage(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/players/);
  });

  it('drops corrupted entries instead of crashing', () => {
    const kv = mem();
    kv.setItem('fieldview.v1.drills', JSON.stringify([{ id: 'broken' }]));
    const s = new Store(kv);
    expect(s.get().drills).toEqual([]);
  });
});

describe('projector perspective', () => {
  const cal: Calibration = { ...DEFAULT_CALIBRATION, unit: 'in', imageWidth: 144, imageHeight: 81, bottomEdge: 18, distance: 120, eyeHeight: 66, offsetX: 12 };

  it('off-axis frustum maps the physical screen corners to the image corners', () => {
    const s = physicalScreen(cal);
    const cam = new PerspectiveCamera();
    cam.position.set(0, 0, 0);
    cam.updateMatrixWorld();
    applyOffAxis(cam, s);
    // Points on the physical screen plane (eye at origin, screen at -distance)
    const corners: [number, number, number, number][] = [
      [s.left, s.bottom, -1, -1],
      [s.right, s.top, 1, 1],
      [s.left, s.top, -1, 1],
      [s.right, s.bottom, 1, -1],
    ];
    for (const [x, y, nx, ny] of corners) {
      const p = new Vector3(x, y, -s.distance).project(cam);
      expect(p.x).toBeCloseTo(nx, 6);
      expect(p.y).toBeCloseTo(ny, 6);
    }
    // a point further away along the same ray lands on the same pixel
    const far = new Vector3(s.left * 5, s.bottom * 5, -s.distance * 5).project(cam);
    expect(far.x).toBeCloseTo(-1, 6);
  });

  it('converts units consistently', () => {
    const inches = physicalScreen(cal);
    const metric = physicalScreen({ ...cal, unit: 'cm', imageWidth: 144 * 2.54, imageHeight: 81 * 2.54, bottomEdge: 18 * 2.54, distance: 120 * 2.54, eyeHeight: 66 * 2.54, offsetX: 12 * 2.54 });
    expect(metric.left).toBeCloseTo(inches.left, 9);
    expect(metric.top).toBeCloseTo(inches.top, 9);
    expect(metric.distance).toBeCloseTo(inches.distance, 9);
  });

  it('calibration references follow similar triangles', () => {
    const ref = calibrationReference(cal);
    expect(ref.horizon).toBeCloseTo(66, 6);
    // pole base appears below the horizon and above the image bottom
    expect(ref.poleBase).toBeGreaterThan(cal.bottomEdge);
    expect(ref.poleBase).toBeLessThan(ref.horizon);
    expect(ref.poleTop - ref.poleBase).toBeCloseTo(ref.poleHeightOnWall, 6);
  });

  it('reports the wide-view scale honestly', () => {
    const s = physicalScreen(cal);
    const fovH = (Math.atan(s.right / s.distance) - Math.atan(s.left / s.distance)) * (180 / Math.PI);
    // symmetric screen with the same FOV ≈ life size; wider FOV shrinks
    expect(wideScaleFactor(physicalScreen({ ...cal, offsetX: 0 }), 2 * Math.atan(72 / 120) * (180 / Math.PI))).toBeCloseTo(1, 6);
    expect(wideScaleFactor(s, 100)).toBeLessThan(1);
    expect(fovH).toBeGreaterThan(0);
  });
});
