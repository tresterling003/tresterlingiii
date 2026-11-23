import { describe, expect, it } from 'vitest';
import { detectActions, detectDirection, detectSide, planMotion, type PlanSettings } from '../src/lib/motion/planner';

const S: PlanSettings = { poseCount: 3, intensity: 'normal', speed: 'normal' };

describe('motion planner', () => {
  it('turns "make the character wave" into a 3-key wave plan', () => {
    const p = planMotion('make the character wave', S);
    expect(p.recognized).toBe(true);
    expect(p.actions).toEqual(['wave']);
    expect(p.keys).toHaveLength(3);
    expect(p.keys.map((k) => k.role)).toEqual(['anticipation', 'action', 'follow-through']);
    expect(p.summary).toMatch(/^Wave/);
    expect(p.explanation.length).toBeGreaterThan(0);
    // side wasn't given, so the planner guesses right and offers a quick choice
    expect(p.side).toBe('right');
    expect(p.clarify.map((c) => c.id)).toContain('side');
  });

  it('understands the examples from the brief', () => {
    expect(detectActions('Make him throw a powerful punch.')).toEqual(['punch']);
    expect(detectActions('Make her slowly turn her head to the left.')).toEqual(['look']);
    expect(detectActions('Make this character crouch and prepare to jump.')).toEqual(['crouch', 'jump']);
    expect(detectActions('Make him look surprised and stumble backward.')).toEqual(['fall']);
    expect(detectActions('Have the character wave with their right hand.')).toEqual(['wave']);
    expect(detectActions('Make him land from a jump.')).toEqual(['land']);
    expect(detectActions('Make this coin flip toward the camera.')).toEqual(['coin']);
    expect(detectActions('Make the robot raise its arm and point forward.')).toEqual(['point']);
  });

  it('builds the "crouch, jump, punch" vision example with a mid-air punch', () => {
    const p = planMotion('I want my character to crouch down, jump into the air, and throw a punch.', S);
    expect(p.actions).toEqual(['jump', 'punch']);
    expect(p.keys).toHaveLength(3);
    expect(p.keys[0].label).toBe('Crouch & load');
    expect(p.keys[2].action).toBe('punch');
    expect(p.keys[2].pose.lift).toBeGreaterThan(0.1); // the punch happens in the air
    expect(p.notes.join(' ')).toMatch(/anticipation/);
  });

  it('reads sides, directions, intensity and speed', () => {
    expect(detectSide('punch with his left fist')).toBe('left');
    expect(detectSide('a right hook')).toBe('right');
    expect(detectDirection('walk to the left')).toBe('left');
    expect(detectDirection('jump forward')).toBe('forward');
    expect(detectDirection('flip toward the camera')).toBe('toward camera');
    const slow = planMotion('slowly wave', S);
    const fast = planMotion('quickly wave', S);
    expect(slow.speed).toBe('slow');
    expect(fast.speed).toBe('fast');
    expect(slow.timing.totalFrames).toBeGreaterThan(fast.timing.totalFrames);
    const big = planMotion('a powerful punch', S);
    const small = planMotion('a gentle punch', S);
    expect(Math.abs(big.keys[1].pose.lean)).toBeGreaterThan(Math.abs(small.keys[1].pose.lean));
  });

  it('respects pose count and travel direction', () => {
    const two = planMotion('jump forward', { ...S, poseCount: 2 });
    expect(two.keys).toHaveLength(2);
    expect(two.keys[1].pose.dx).toBeGreaterThan(two.keys[0].pose.dx);
    const left = planMotion('walk to the left', S);
    expect(left.keys.every((k) => k.pose.facing === -1)).toBe(true);
  });

  it('left-hand requests move the left limb', () => {
    const r = planMotion('wave with the right hand', S);
    const l = planMotion('wave with the left hand', S);
    expect(l.keys[0].pose.angles.uaL).toBeCloseTo(r.keys[0].pose.angles.uaR, 5);
    expect(l.keys[0].description).toMatch(/left/);
  });

  it('asks a quick question instead of guessing wildly on unknown text', () => {
    const p = planMotion('do the thing', S);
    expect(p.recognized).toBe(false);
    expect(p.clarify[0].id).toBe('action');
    expect(p.clarify[0].options.length).toBeGreaterThan(3);
  });

  it('every key pose differs from the others (no copies)', () => {
    for (const prompt of ['jump', 'punch', 'kick', 'wave', 'walk', 'run', 'throw', 'fall', 'crouch', 'look around', 'idle', 'turn around']) {
      const p = planMotion(prompt, S);
      const sig = p.keys.map((k) => JSON.stringify([k.pose.angles, k.pose.lean, k.pose.lift, k.pose.look, k.pose.facing, k.pose.view]));
      expect(new Set(sig).size, prompt).toBe(p.keys.length);
    }
  });
});
