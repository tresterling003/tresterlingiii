// Key-pose library. Poses are authored in WORLD angles (degrees, canvas y-down: 0 = forward, 90 = down,
// -90 = up, 180 = backward) for a character facing right in side view. In front view, every limb is authored
// as if it were on the right-hand side of the screen (0 = outward), and the right limbs are mirrored for you.
import { wrapDeg, type BoneId, type View } from '../rig/skeleton';

export type ActionId =
  | 'walk' | 'run' | 'jump' | 'land' | 'punch' | 'kick' | 'wave' | 'turn' | 'crouch' | 'fall'
  | 'throw' | 'look' | 'idle' | 'point' | 'raise' | 'surprise' | 'coin';

export type Role = 'anticipation' | 'action' | 'peak' | 'follow-through' | 'contact' | 'passing' | 'breakdown' | 'settle' | 'recovery';

export const ROLE_LABEL: Record<Role, string> = {
  anticipation: 'Anticipation', action: 'Action', peak: 'Peak', 'follow-through': 'Follow-through',
  contact: 'Contact', passing: 'Passing', breakdown: 'Breakdown', settle: 'Settle', recovery: 'Recovery',
};

export type WorldAngles = Partial<Record<BoneId, number>>;
export interface KeyDef {
  role: Role;
  label: string;
  /** What the student should see — also sent to the AI as the pose description. */
  describe: string;
  w: WorldAngles;
  lean?: number;
  lift?: number;
  dx?: number;
  look?: number;
  flip?: boolean; // face the opposite way
  view?: View; // override action view (used by turn)
  hold: number; // base exposures at 12 fps
}

export interface ActionDef {
  id: ActionId;
  name: string;
  verb: string; // for summaries, e.g. "jump"
  view: View;
  upperBody?: boolean; // can be layered on top of a jump
  sided: 'arm' | 'leg' | null; // which limb "right/left" refers to
  bodyParts: string[];
  explain: string[]; // beginner-friendly, no jargon
  keys: KeyDef[];
  pick: Record<1 | 2 | 3, number[]>; // which keys to use for 1/2/3 poses
}

export const NEUTRAL_WORLD: Record<View, Required<WorldAngles>> = {
  side: { spine: -90, neck: -90, head: -90, uaR: 86, faR: 80, uaL: 94, faL: 88, thR: 88, shR: 92, ftR: 0, thL: 94, shL: 96, ftL: 0 },
  front: { spine: -90, neck: -90, head: -90, uaR: 78, faR: 84, uaL: 78, faL: 84, thR: 84, shR: 88, ftR: 10, thL: 84, shL: 88, ftL: 10 },
};

/** World-authored angles → local angles the rig stores. */
export function worldToLocalAngles(w: WorldAngles, view: View, lean = 0): Record<BoneId, number> {
  const W = { ...NEUTRAL_WORLD[view], ...w };
  const root = -90 + lean;
  const front = view === 'front';
  const first = (child: number, parent: number, mirrored: boolean) => (mirrored ? parent - (180 - child) : child - parent);
  const out: Record<BoneId, number> = {
    spine: W.spine - root,
    neck: W.neck - W.spine,
    head: W.head - W.neck,
    uaR: first(W.uaR, W.spine, front),
    faR: W.faR - W.uaR,
    uaL: first(W.uaL, W.spine, false),
    faL: W.faL - W.uaL,
    thR: first(W.thR, root, front),
    shR: W.shR - W.thR,
    ftR: W.ftR - W.shR,
    thL: first(W.thL, root, false),
    shL: W.shL - W.thL,
    ftL: W.ftL - W.shL,
  };
  for (const k of Object.keys(out) as BoneId[]) out[k] = wrapDeg(out[k]);
  // keep elbows/knees on their natural side of the wrap boundary
  return out;
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  jump: {
    id: 'jump', name: 'Jump', verb: 'jump', view: 'side', sided: null,
    bodyParts: ['legs', 'arms', 'torso'],
    explain: [
      'The character bends their knees before jumping. That squash builds anticipation, so the jump feels powerful.',
      'Arms swing back on the crouch and up on the launch — they help "throw" the body into the air.',
      'At the top of the jump the body is stretched or tucked; give that pose a few extra frames so it reads.',
    ],
    keys: [
      { role: 'anticipation', label: 'Crouch & load', describe: 'deep crouch with knees bent, body leaning forward, arms swung back behind the body, ready to spring', lean: 30, w: { spine: -55, neck: -70, head: -75, uaR: 150, faR: 140, uaL: 156, faL: 146, thR: 15, shR: 112, ftR: 0, thL: 22, shL: 116, ftL: 0 }, hold: 4 },
      { role: 'action', label: 'Launch', describe: 'pushing off the ground: legs straightening, toes pointed, arms thrown upward, body stretched long', lean: 12, lift: 0.04, dx: 0.08, w: { spine: -78, neck: -80, head: -85, uaR: -60, faR: -70, uaL: -54, faL: -64, thR: 100, shR: 104, ftR: 60, thL: 106, shL: 110, ftL: 66 }, hold: 2 },
      { role: 'peak', label: 'In the air', describe: 'high in the air at the top of the jump with knees tucked up and arms raised for balance', lean: 5, lift: 0.32, dx: 0.4, w: { spine: -85, neck: -88, head: -90, uaR: -30, faR: -46, uaL: -20, faL: -40, thR: 20, shR: 100, ftR: 30, thL: 36, shL: 116, ftL: 40 }, hold: 3 },
      { role: 'follow-through', label: 'Land & absorb', describe: 'landing on both feet with knees bending to absorb the impact, arms forward for balance', lean: 25, dx: 0.75, w: { spine: -60, neck: -75, head: -80, uaR: 30, faR: 10, uaL: 40, faL: 20, thR: 20, shR: 110, ftR: 0, thL: 28, shL: 112, ftL: 0 }, hold: 4 },
    ],
    pick: { 1: [2], 2: [0, 2], 3: [0, 1, 2] },
  },
  land: {
    id: 'land', name: 'Land', verb: 'land from a jump', view: 'side', sided: null,
    bodyParts: ['legs', 'arms', 'torso'],
    explain: [
      'Legs reach for the ground before contact.',
      'On impact the knees bend deeply — this "squash" shows the character\'s weight.',
      'Then the body rises again more slowly, settling into balance.',
    ],
    keys: [
      { role: 'anticipation', label: 'Reaching down', describe: 'dropping out of the air with legs reaching down toward the ground and arms raised out to the sides', lean: 0, lift: 0.14, w: { uaR: -40, faR: -60, uaL: -30, faL: -50, thR: 80, shR: 84, ftR: 30, thL: 90, shL: 94, ftL: 36 }, hold: 2 },
      { role: 'action', label: 'Impact', describe: 'impact on landing: knees bent deeply, body low and leaning forward, arms thrown forward', lean: 32, w: { spine: -52, neck: -70, head: -76, uaR: 20, faR: 5, uaL: 30, faL: 15, thR: 5, shR: 118, ftR: 0, thL: 14, shL: 120, ftL: 0 }, hold: 3 },
      { role: 'recovery', label: 'Recover', describe: 'rising back up from the landing, knees still slightly bent, arms lowering, regaining balance', lean: 8, w: { spine: -84, neck: -88, head: -88, uaR: 70, faR: 50, uaL: 80, faL: 60, thR: 70, shR: 104, thL: 76, shL: 106 }, hold: 4 },
    ],
    pick: { 1: [1], 2: [1, 2], 3: [0, 1, 2] },
  },
  punch: {
    id: 'punch', name: 'Punch', verb: 'throw a punch', view: 'side', sided: 'arm', upperBody: true,
    bodyParts: ['punching arm', 'torso', 'hips', 'legs'],
    explain: [
      'First the fist pulls back and the body twists away — that wind-up is the anticipation.',
      'The punch itself is fast: the arm snaps straight while the back leg pushes the weight forward.',
      'The body keeps moving a little after the hit (follow-through), so the punch feels heavy.',
    ],
    keys: [
      { role: 'anticipation', label: 'Wind up', describe: 'winding up for a punch: punching fist pulled back by the ribs, torso twisted away, other hand raised as a guard, knees bent in a fighting stance', lean: -8, dx: -0.02, w: { spine: -100, neck: -88, head: -88, uaR: 140, faR: -20, uaL: 60, faL: -60, thL: 70, shL: 96, ftL: 0, thR: 116, shR: 106, ftR: 0 }, hold: 4 },
      { role: 'action', label: 'Strike!', describe: 'the moment of the punch: punching arm fully extended straight forward, torso rotated into the hit, weight shifted onto the front leg, back heel lifting', lean: 18, dx: 0.06, w: { spine: -72, neck: -80, head: -80, uaR: 2, faR: 0, uaL: 120, faL: -60, thL: 55, shL: 82, ftL: 0, thR: 128, shR: 122, ftR: 22 }, hold: 2 },
      { role: 'follow-through', label: 'Follow through', describe: 'just after the punch: arm still extended and slightly past the target, body leaning further forward, then beginning to recover balance', lean: 24, dx: 0.09, w: { spine: -66, neck: -76, head: -76, uaR: 12, faR: 8, uaL: 110, faL: -70, thL: 50, shL: 86, ftL: 0, thR: 135, shR: 128, ftR: 30 }, hold: 4 },
      { role: 'recovery', label: 'Back to guard', describe: 'returning to a guarded fighting stance with both fists up', lean: 4, w: { spine: -88, uaR: 110, faR: -50, uaL: 60, faL: -60, thL: 70, shL: 96, ftL: 0, thR: 112, shR: 104, ftR: 0 }, hold: 4 },
    ],
    pick: { 1: [1], 2: [0, 1], 3: [0, 1, 2] },
  },
  kick: {
    id: 'kick', name: 'Kick', verb: 'kick', view: 'side', sided: 'leg',
    bodyParts: ['kicking leg', 'standing leg', 'arms', 'torso'],
    explain: [
      'The knee lifts first (the "chamber") — this is the anticipation.',
      'Then the leg snaps out while the body leans back to stay balanced.',
      'Arms swing out to counter-balance the leg.',
    ],
    keys: [
      { role: 'anticipation', label: 'Chamber', describe: 'kicking knee lifted high and bent, standing on one leg, arms out for balance, leaning slightly back', lean: -12, w: { spine: -100, uaR: 30, faR: 10, uaL: 170, faL: 160, thR: -10, shR: 95, ftR: 20, thL: 95, shL: 100, ftL: 0 }, hold: 3 },
      { role: 'action', label: 'Kick!', describe: 'kicking leg fully extended forward at hip height, body leaning back, arms spread for balance', lean: -28, w: { spine: -115, neck: -105, head: -100, uaR: 60, faR: 40, uaL: 190, faL: 200, thR: -15, shR: -15, ftR: -15, thL: 100, shL: 95, ftL: 0 }, hold: 2 },
      { role: 'follow-through', label: 'Lower the leg', describe: 'kicking leg bending and lowering back down, body coming upright again', lean: -10, w: { spine: -98, uaR: 60, faR: 30, uaL: 140, faL: 130, thR: 30, shR: 110, ftR: 20, thL: 92, shL: 96, ftL: 0 }, hold: 4 },
    ],
    pick: { 1: [1], 2: [0, 1], 3: [0, 1, 2] },
  },
  wave: {
    id: 'wave', name: 'Wave', verb: 'wave', view: 'front', sided: 'arm', upperBody: true,
    bodyParts: ['waving arm', 'hand', 'head'],
    explain: [
      'The arm lifts first, then the forearm swings side to side like a windshield wiper.',
      'The elbow stays mostly still — the motion comes from the forearm and hand.',
      'A small head tilt makes the wave feel friendly and alive.',
    ],
    keys: [
      { role: 'anticipation', label: 'Raise hand', describe: 'waving hand raised up beside the head with the elbow bent, palm facing forward', w: { uaR: 10, faR: -80, head: -86 }, hold: 3 },
      { role: 'action', label: 'Wave out', describe: 'hand tilted outward, away from the head, mid-wave, friendly expression', w: { uaR: 2, faR: -48, head: -82, spine: -88 }, hold: 3 },
      { role: 'follow-through', label: 'Wave in', describe: 'hand tilted inward toward the head, completing the wave', w: { uaR: 6, faR: -112, head: -86 }, hold: 3 },
    ],
    pick: { 1: [1], 2: [1, 2], 3: [0, 1, 2] },
  },
  turn: {
    id: 'turn', name: 'Turn', verb: 'turn around', view: 'side', sided: null,
    bodyParts: ['head', 'torso', 'feet'],
    explain: [
      'The eyes and head lead the turn, then the body follows — that is called overlapping action.',
      'The middle pose faces the viewer, so the turn passes through the front view.',
    ],
    keys: [
      { role: 'anticipation', label: 'Glance back', describe: 'head and eyes turning to look over the shoulder, body still facing forward', lean: -4, look: -1, w: { spine: -94, neck: -100, head: -105, uaR: 100, faR: 95, uaL: 85, faL: 80 }, hold: 3 },
      { role: 'action', label: 'Front view', describe: 'mid-turn, now facing the viewer directly, feet shifting', view: 'front', w: { uaR: 74, faR: 82, uaL: 74, faL: 82 }, hold: 2 },
      { role: 'settle', label: 'Facing back', describe: 'turn completed, now facing the opposite direction in profile', flip: true, w: {}, hold: 4 },
    ],
    pick: { 1: [2], 2: [1, 2], 3: [0, 1, 2] },
  },
  crouch: {
    id: 'crouch', name: 'Crouch', verb: 'crouch', view: 'side', sided: null,
    bodyParts: ['legs', 'hips', 'torso', 'arms'],
    explain: [
      'Hips drop down and back while the chest leans forward to keep balance over the feet.',
      'Arms come forward to counter-balance the hips going back.',
    ],
    keys: [
      { role: 'breakdown', label: 'Start bending', describe: 'beginning to crouch: knees starting to bend, hips moving back, torso leaning slightly forward', lean: 12, w: { spine: -80, thR: 55, shR: 110, thL: 60, shL: 112, uaR: 70, faR: 50, uaL: 80, faL: 60 }, hold: 2 },
      { role: 'action', label: 'Deep crouch', describe: 'deep crouch, knees fully bent, hips low, chest leaning forward, arms forward for balance, eyes looking ahead', lean: 32, w: { spine: -55, neck: -62, head: -60, thR: 10, shR: 118, ftR: 0, thL: 18, shL: 120, ftL: 0, uaR: 30, faR: 10, uaL: 40, faL: 20 }, hold: 4 },
      { role: 'settle', label: 'Settle', describe: 'holding the crouch, weight settled, arms relaxed in front', lean: 28, w: { spine: -60, neck: -68, head: -68, thR: 15, shR: 115, thL: 22, shL: 117, uaR: 60, faR: 40, uaL: 70, faL: 50 }, hold: 4 },
    ],
    pick: { 1: [1], 2: [0, 1], 3: [0, 1, 2] },
  },
  fall: {
    id: 'fall', name: 'Fall', verb: 'fall', view: 'side', sided: null,
    bodyParts: ['whole body'],
    explain: [
      'A fall starts with a reaction — arms fly up as the character is surprised.',
      'The body tips past its balance point, so the feet can no longer hold it.',
      'Finally the character hits the ground; the impact pose should feel heavy.',
    ],
    keys: [
      { role: 'anticipation', label: 'Surprised!', describe: 'startled, arms flung up, body jerking backward, eyes wide', lean: -10, w: { spine: -100, neck: -100, head: -105, uaR: -60, faR: -100, uaL: -40, faL: -80 }, hold: 3 },
      { role: 'action', label: 'Losing balance', describe: 'stumbling backward and losing balance, one leg lifting forward off the ground, arms flailing', lean: -35, dx: -0.1, w: { spine: -125, neck: -118, head: -120, uaR: 10, faR: -30, uaL: -30, faL: -60, thR: 40, shR: 70, ftR: -20, thL: 110, shL: 100, ftL: 0 }, hold: 2 },
      { role: 'follow-through', label: 'Hit the ground', describe: 'landed sitting on the ground, legs stretched forward, hands behind propping up the body', lean: -20, dx: -0.25, w: { spine: -110, neck: -100, head: -100, uaR: 120, faR: 100, uaL: 125, faL: 105, thR: 5, shR: 10, ftR: -60, thL: 0, shL: 8, ftL: -60 }, hold: 5 },
    ],
    pick: { 1: [1], 2: [0, 2], 3: [0, 1, 2] },
  },
  throw: {
    id: 'throw', name: 'Throw', verb: 'throw', view: 'side', sided: 'arm', upperBody: true,
    bodyParts: ['throwing arm', 'torso', 'legs'],
    explain: [
      'The throwing arm goes far back and the body leans away — big anticipation means a big throw.',
      'The release happens with the arm high and in front; the body whips forward.',
      'Follow-through: the arm keeps going across the body and the back leg can lift. The motion doesn\'t stop at the release!',
    ],
    keys: [
      { role: 'anticipation', label: 'Wind up', describe: 'winding up to throw: throwing arm pulled far back behind the head, other arm pointing at the target, leaning back, front foot stepping forward', lean: -15, w: { spine: -110, uaR: 200, faR: -120, uaL: -10, faL: -10, thL: 60, shL: 80, thR: 105, shR: 100 }, hold: 4 },
      { role: 'action', label: 'Release', describe: 'releasing the throw: throwing arm high and forward, body whipping forward, other arm pulling down', lean: 15, dx: 0.05, w: { spine: -75, uaR: -40, faR: -30, uaL: 120, faL: 100, thL: 65, shL: 90, thR: 120, shR: 115, ftR: 30 }, hold: 2 },
      { role: 'follow-through', label: 'Follow through', describe: 'after the throw: throwing arm swinging down across the body, torso bent forward, back leg lifting off the ground', lean: 35, dx: 0.08, w: { spine: -50, neck: -60, head: -62, uaR: 100, faR: 120, uaL: 150, faL: 160, thR: 140, shR: 160, ftR: 180, thL: 70, shL: 95 }, hold: 5 },
    ],
    pick: { 1: [1], 2: [0, 1], 3: [0, 1, 2] },
  },
  look: {
    id: 'look', name: 'Look Around', verb: 'look around', view: 'front', sided: null,
    bodyParts: ['eyes', 'head', 'neck'],
    explain: [
      'The eyes move first, then the head follows a moment later.',
      'Hold each look for a few frames so the audience can see where the character is looking.',
    ],
    keys: [
      { role: 'anticipation', label: 'Look one way', describe: 'eyes and head turned to look to one side, curious', look: -1, w: { neck: -92, head: -96 }, hold: 4 },
      { role: 'action', label: 'Look the other way', describe: 'eyes and head now turned to look to the other side', look: 1, w: { neck: -88, head: -84 }, hold: 4 },
      { role: 'settle', label: 'Back to center', describe: 'looking forward again, shoulders slightly raised in a little shrug', look: 0.2, w: { uaR: 70, uaL: 70, faR: 80, faL: 80 }, hold: 4 },
    ],
    pick: { 1: [0], 2: [0, 1], 3: [0, 1, 2] },
  },
  idle: {
    id: 'idle', name: 'Idle Motion', verb: 'stand idle', view: 'side', sided: null,
    bodyParts: ['chest', 'shoulders', 'knees'],
    explain: [
      'Even when standing still, living characters move a tiny bit: breathing and shifting weight.',
      'Keep these changes very small and slow — subtle motion keeps a character alive.',
    ],
    keys: [
      { role: 'action', label: 'Breathe in', describe: 'standing relaxed, chest slightly lifted while breathing in, shoulders a little higher', lean: -2, w: { spine: -93, uaR: 82, faR: 76, uaL: 98, faL: 92 }, hold: 6 },
      { role: 'settle', label: 'Breathe out', describe: 'standing relaxed while breathing out, knees slightly soft, head dipping a little', lean: 3, w: { spine: -88, head: -86, thR: 82, shR: 100, thL: 88, shL: 102 }, hold: 6 },
      { role: 'breakdown', label: 'Shift weight', describe: 'standing relaxed, weight shifted onto one leg, hip dropping slightly', dx: 0.02, w: { thR: 94, shR: 94, thL: 80, shL: 102 }, hold: 6 },
    ],
    pick: { 1: [0], 2: [0, 1], 3: [0, 1, 2] },
  },
  walk: {
    id: 'walk', name: 'Walk', verb: 'walk', view: 'side', sided: null,
    bodyParts: ['legs', 'arms (swing opposite to legs)', 'hips'],
    explain: [
      'In a walk, the arms swing opposite to the legs: right leg forward means left arm forward.',
      'The "contact" pose is where the front heel touches the ground; the "passing" pose is where one leg swings past the other.',
      'The body is lowest just after contact and highest as it pushes up — that up-and-down bounce makes a walk feel alive.',
    ],
    keys: [
      { role: 'contact', label: 'Contact', describe: 'walking contact pose: front heel touching the ground with the toe up, back leg pushing off on its toes, arms swinging opposite to the legs', lean: 4, w: { thR: 60, shR: 62, ftR: -22, thL: 122, shL: 126, ftL: 32, uaR: 120, faR: 108, uaL: 62, faL: 42 }, hold: 2 },
      { role: 'breakdown', label: 'Down', describe: 'walking down pose: front knee bending to take the weight, back foot peeling off the ground, body at its lowest', lean: 6, dx: 0.06, w: { thR: 70, shR: 96, ftR: 0, thL: 126, shL: 150, ftL: 62, uaR: 114, faR: 100, uaL: 66, faL: 46 }, hold: 2 },
      { role: 'passing', label: 'Passing', describe: 'walking passing pose: standing leg straight, the other leg bent and swinging past it, arms close to the body', lean: 4, dx: 0.14, w: { thR: 92, shR: 92, ftR: 0, thL: 70, shL: 140, ftL: 30, uaR: 92, faR: 80, uaL: 88, faL: 76 }, hold: 2 },
      { role: 'contact', label: 'Contact (other foot)', describe: 'walking contact pose with the other foot forward: front heel down, back leg pushing off, arms swinging opposite', lean: 4, dx: 0.28, w: { thL: 60, shL: 62, ftL: -22, thR: 122, shR: 126, ftR: 32, uaL: 120, faL: 108, uaR: 62, faR: 42 }, hold: 2 },
    ],
    pick: { 1: [0], 2: [0, 2], 3: [0, 2, 3] },
  },
  run: {
    id: 'run', name: 'Run', verb: 'run', view: 'side', sided: null,
    bodyParts: ['legs', 'arms (pumping)', 'torso lean'],
    explain: [
      'A run leans forward much more than a walk, and both feet leave the ground for a moment.',
      'Arms bend at about 90° and pump hard, opposite to the legs.',
    ],
    keys: [
      { role: 'contact', label: 'Contact', describe: 'running contact: front foot landing under the body, back leg extended behind, torso leaning forward, elbows bent and pumping', lean: 18, w: { spine: -72, thR: 55, shR: 50, ftR: -10, thL: 140, shL: 120, ftL: 50, uaR: 145, faR: 80, uaL: 40, faL: -40 }, hold: 2 },
      { role: 'passing', label: 'Push off', describe: 'running push-off: standing leg driving off the toes, other knee lifted high in front, arms pumping', lean: 18, lift: 0.04, dx: 0.2, w: { spine: -72, thR: 100, shR: 106, ftR: 60, thL: 20, shL: 120, ftL: 20, uaR: 60, faR: -20, uaL: 130, faL: 70 }, hold: 2 },
      { role: 'peak', label: 'Flight', describe: 'running flight pose: both feet off the ground, front leg reaching forward, back leg kicked up behind', lean: 16, lift: 0.1, dx: 0.42, w: { spine: -74, thR: 125, shR: 150, ftR: 80, thL: 35, shL: 70, ftL: 0, uaR: 40, faR: -40, uaL: 145, faL: 80 }, hold: 2 },
    ],
    pick: { 1: [2], 2: [0, 2], 3: [0, 1, 2] },
  },
  point: {
    id: 'point', name: 'Point', verb: 'point', view: 'side', sided: 'arm', upperBody: true,
    bodyParts: ['pointing arm', 'head'],
    explain: [
      'The arm dips a little before it rises — even small motions feel better with anticipation.',
      'The eyes look where the finger points, so the audience looks there too.',
    ],
    keys: [
      { role: 'anticipation', label: 'Get ready', describe: 'pointing arm pulled in slightly, elbow bent, about to raise it', lean: -3, w: { uaR: 110, faR: 40 }, hold: 3 },
      { role: 'action', label: 'Point', describe: 'arm raised and fully extended, pointing straight ahead with the index finger, looking in the same direction', lean: 4, w: { uaR: -6, faR: -6, head: -88 }, hold: 3 },
      { role: 'settle', label: 'Hold', describe: 'holding the point, arm settling slightly lower, steady and confident', lean: 2, w: { uaR: 2, faR: 0 }, hold: 5 },
    ],
    pick: { 1: [1], 2: [0, 1], 3: [0, 1, 2] },
  },
  raise: {
    id: 'raise', name: 'Raise Arm', verb: 'raise an arm', view: 'side', sided: 'arm', upperBody: true,
    bodyParts: ['raised arm', 'shoulder'],
    explain: ['The arm swings up from the shoulder; the elbow straightens near the end of the move.'],
    keys: [
      { role: 'anticipation', label: 'Dip', describe: 'arm dipping slightly and bending before it rises', w: { uaR: 120, faR: 60 }, hold: 3 },
      { role: 'action', label: 'Raising', describe: 'arm swinging upward in front of the body, elbow still a little bent', w: { uaR: -40, faR: -55 }, hold: 2 },
      { role: 'settle', label: 'Arm up', describe: 'arm raised straight up above the head', w: { uaR: -80, faR: -86 }, hold: 4 },
    ],
    pick: { 1: [2], 2: [1, 2], 3: [0, 1, 2] },
  },
  surprise: {
    id: 'surprise', name: 'Surprise', verb: 'react in surprise', view: 'side', sided: null,
    bodyParts: ['whole body', 'face'],
    explain: [
      'A quick "squash" before the jolt makes the surprise read clearly.',
      'The jolt is a big stretch: arms up, body pulled back, eyes wide.',
    ],
    keys: [
      { role: 'anticipation', label: 'Flinch', describe: 'small flinch: knees dipping, shoulders pulled in, arms close to the body', lean: 5, w: { thR: 80, shR: 102, thL: 86, shL: 104, uaR: 100, faR: 40, uaL: 104, faL: 44 }, hold: 2 },
      { role: 'action', label: 'Jolt!', describe: 'big surprised jolt: body stretched and leaning back, arms flung up, eyes and mouth wide open', lean: -10, w: { spine: -100, neck: -100, head: -105, uaR: -60, faR: -100, uaL: -40, faL: -80 }, hold: 3 },
      { role: 'settle', label: 'Hands up', describe: 'still shocked, hands raised near the face, leaning back slightly', lean: -6, w: { spine: -96, uaR: 60, faR: -100, uaL: 66, faL: -96 }, hold: 5 },
    ],
    pick: { 1: [1], 2: [0, 1], 3: [0, 1, 2] },
  },
  coin: {
    id: 'coin', name: 'Coin Flip', verb: 'flip', view: 'front', sided: null,
    bodyParts: ['object rotation'],
    explain: [
      'A flipping coin is a rotation: its face gets thinner as it turns edge-on, then the other side appears.',
      'The coin moves fastest in the middle of the toss and slows at the top of the arc.',
    ],
    keys: [
      { role: 'anticipation', label: 'Tilting', describe: 'the object tilting as it starts to flip, its face foreshortened', w: {}, hold: 2 },
      { role: 'action', label: 'Edge-on', describe: 'the object turned edge-on, showing only its thin side', w: {}, hold: 1 },
      { role: 'follow-through', label: 'Other side', describe: 'the object has flipped over and now shows its other side', w: {}, hold: 2 },
    ],
    pick: { 1: [1], 2: [1, 2], 3: [0, 1, 2] },
  },
};

export const PRESETS: { id: ActionId; label: string; prompt: string }[] = [
  { id: 'walk', label: 'Walk', prompt: 'Make the character walk forward' },
  { id: 'run', label: 'Run', prompt: 'Make the character run forward' },
  { id: 'jump', label: 'Jump', prompt: 'Make the character crouch and jump forward' },
  { id: 'punch', label: 'Punch', prompt: 'Make the character throw a powerful right punch' },
  { id: 'kick', label: 'Kick', prompt: 'Make the character do a front kick with the right leg' },
  { id: 'wave', label: 'Wave', prompt: 'Have the character wave with their right hand' },
  { id: 'turn', label: 'Turn', prompt: 'Make the character turn around' },
  { id: 'crouch', label: 'Crouch', prompt: 'Make the character crouch down' },
  { id: 'fall', label: 'Fall', prompt: 'Make the character look surprised and stumble backward' },
  { id: 'throw', label: 'Throw', prompt: 'Make the character throw a ball' },
  { id: 'look', label: 'Look Around', prompt: 'Make the character look around' },
  { id: 'idle', label: 'Idle Motion', prompt: 'Give the character a gentle idle breathing motion' },
];
