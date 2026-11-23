// Natural-language motion planner. Runs entirely in the browser (no AI needed) and produces a structured
// MotionPlan used by BOTH generation modes: the rig renders the planned key poses directly, and the AI mode
// turns each planned key into a drawing instruction plus a skeleton "pose guide" image.
import { neutralPose, swapSides, wrapDeg, type BoneId, type RigPose, type View } from '../rig/skeleton';
import { ACTIONS, NEUTRAL_WORLD, ROLE_LABEL, worldToLocalAngles, type ActionDef, type ActionId, type KeyDef, type Role } from './library';

export type Intensity = 'subtle' | 'normal' | 'exaggerated';
export type Speed = 'slow' | 'normal' | 'fast';
export type Direction = 'forward' | 'backward' | 'left' | 'right' | 'up' | 'down' | 'toward camera' | 'away' | 'in place';

export interface PlanSettings {
  poseCount: 2 | 3;
  intensity: Intensity;
  speed: Speed;
  side?: 'right' | 'left'; // override
  facing?: 1 | -1; // character's facing in the original drawing
  view?: 'auto' | View;
}

export interface PlannedKey {
  index: number;
  role: Role;
  roleLabel: string;
  label: string;
  action: ActionId;
  description: string;
  pose: RigPose;
  hold: number;
}

export interface ClarifyOption { label: string; patch: Partial<PlanSettings> & { prompt?: string } }
export interface Clarification { id: string; question: string; options: ClarifyOption[] }

export interface MotionPlan {
  prompt: string;
  recognized: boolean;
  actions: ActionId[];
  summary: string;
  direction: Direction;
  side: 'right' | 'left';
  sideWasGuessed: boolean;
  bodyParts: string[];
  intensity: Intensity;
  speed: Speed;
  view: View;
  keys: PlannedKey[];
  explanation: string[];
  notes: string[];
  clarify: Clarification[];
  timing: { fps: number; totalFrames: number; seconds: number; inbetweensPerGap: number };
  special?: 'coin';
}

const MATCHERS: { id: ActionId; re: RegExp }[] = [
  { id: 'coin', re: /\bcoins?\b|\bflip(?:s|ping)? (?:a |the )?(?:coin|card|pancake)/ },
  { id: 'land', re: /\bland(?:s|ing|ed)?\b|\btouch(?:es)? down\b/ },
  { id: 'jump', re: /\bjump(?:s|ing|ed)?\b|\bleap(?:s|ing|t)?\b|\bhop(?:s|ping)?\b|\bspring(?:s|ing)? up\b|\bbounce\b/ },
  { id: 'punch', re: /\bpunch(?:es|ing|ed)?\b|\bjab\b|\buppercut\b|\bhook\b|\bstrike\b|\bswing (?:a|his|her|their) fist/ },
  { id: 'kick', re: /\bkick(?:s|ing|ed)?\b/ },
  { id: 'wave', re: /\bwav(?:e|es|ing|ed)\b|\bsay(?:s|ing)? (?:hi|hello|bye|goodbye)\b|\bgreet/ },
  { id: 'throw', re: /\bthrow(?:s|ing|n)?\b|\bthrew\b|\btoss(?:es|ing)?\b|\bpitch(?:es|ing)?\b|\bhurl|\bfling/ },
  { id: 'look', re: /\blook(?:s|ing)? (?:around|left|right|to the|up|over|both)|\bglanc|\bpeek|\bsearch(?:es|ing)?\b|\bturn(?:s|ing)? (?:his|her|their|the|its) head\b|\bhead (?:turn|to the)/ },
  { id: 'turn', re: /\bturn(?:s|ing)? (?:around|back|away)\b|\bspin(?:s|ning)?\b|\bface the other way\b|\bturn(?:s|ing)?\b|\brotate/ },
  { id: 'crouch', re: /\bcrouch(?:es|ing)?\b|\bsquat(?:s|ting)?\b|\bduck(?:s|ing)?\b|\bkneel|\bbend(?:s|ing)? down\b|\bget(?:s)? low\b/ },
  { id: 'surprise', re: /\bsurpris|\bshock|\bstartl|\bscared\b|\bgasp|\bjump scare/ },
  { id: 'fall', re: /\bfall(?:s|ing)?\b|\bfell\b|\btrip(?:s|ping)?\b|\bstumbl|\bslip(?:s|ping)?\b|\bcollaps|\bknocked (?:down|over|back)/ },
  { id: 'run', re: /\brun(?:s|ning)?\b|\bran\b|\bsprint|\bdash(?:es|ing)?\b|\bjog(?:s|ging)?\b|\brac(?:e|es|ing)\b/ },
  { id: 'walk', re: /\bwalk(?:s|ing|ed)?\b|\bstroll|\bstep(?:s|ping)? (?:forward|ahead|back)|\bmarch|\bstrid|\bsneak|\btiptoe/ },
  { id: 'point', re: /\bpoint(?:s|ing)?\b/ },
  { id: 'raise', re: /\brais(?:e|es|ing)\b|\blift(?:s|ing)? (?:his|her|their|the|its|an?|one) (?:arm|hand)|\breach(?:es|ing)? up\b|\bhands? up\b|\barms? up\b/ },
  { id: 'idle', re: /\bidle\b|\bbreath(?:e|ing)\b|\bstand(?:s|ing)? (?:still|around)\b|\bwait(?:s|ing)?\b|\bsway/ },
];

/** Find actions in the order they are mentioned. */
export function detectActions(text: string): ActionId[] {
  const t = ` ${text.toLowerCase()} `;
  const found: { id: ActionId; at: number }[] = [];
  for (const m of MATCHERS) {
    const r = new RegExp(m.re.source, 'g');
    let hit: RegExpExecArray | null;
    while ((hit = r.exec(t))) {
      // "turn his head" is a look, not a full turn; "jump scare" is surprise
      if (m.id === 'turn' && /turn(?:s|ing)? (?:his|her|their|the|its) head/.test(t.slice(hit.index, hit.index + 30))) continue;
      if (m.id === 'jump' && /jump scare/.test(t.slice(hit.index, hit.index + 12))) continue;
      if (m.id === 'raise' && found.some((f) => f.id === 'point')) continue;
      found.push({ id: m.id, at: hit.index });
      break;
    }
  }
  // "throw a punch" is a punch; "raise the arm and point" is a point
  let ids = found.sort((a, b) => a.at - b.at).map((f) => f.id);
  if (ids.includes('punch')) ids = ids.filter((i) => i !== 'throw');
  if (ids.includes('point')) ids = ids.filter((i) => i !== 'raise');
  if (ids.includes('kick')) ids = ids.filter((i) => i !== 'raise');
  if (ids.includes('surprise') && ids.includes('fall')) ids = ids.filter((i) => i !== 'surprise');
  if (ids.includes('coin')) ids = ['coin'];
  // "land from a jump" is a landing; "jump and land" is a jump (whose last key is the landing)
  if (ids.includes('land') && ids.includes('jump')) ids = ids.filter((i) => i !== (ids.indexOf('land') < ids.indexOf('jump') ? 'jump' : 'land'));
  if (ids.includes('look')) ids = ids.filter((i) => i !== 'turn');
  return Array.from(new Set(ids));
}

export function detectSide(text: string): 'right' | 'left' | null {
  const t = text.toLowerCase();
  const m = /\b(left|right)(?:[- ]hand(?:ed)?)?\s+(?:hand|arm|fist|leg|foot|punch|hook|jab|kick|side)/.exec(t) || /\bwith (?:his|her|their|the|its|my) (left|right)\b/.exec(t);
  return m ? (m[1] as 'left' | 'right') : null;
}

export function detectDirection(text: string): Direction {
  const t = text.toLowerCase();
  if (/toward(?:s)? (?:the )?(?:camera|viewer|us|screen|audience)/.test(t)) return 'toward camera';
  if (/away from (?:the )?(?:camera|viewer|us)/.test(t)) return 'away';
  if (/\bbackward|\bback(?:wards)?\b(?! to)|\bin reverse/.test(t) && !/\bback to\b/.test(t)) return 'backward';
  if (/\bforward|\bahead\b|\bacross\b/.test(t)) return 'forward';
  // a side word that is not describing a limb is a direction
  const sideRe = /\b(left|right)\b(?!\s*(?:hand|arm|fist|leg|foot|punch|hook|jab|kick|side))/;
  const sd = sideRe.exec(t.replace(/\bwith (?:his|her|their|the|its|my) (?:left|right)\b/, ''));
  if (sd) return sd[1] as Direction;
  if (/\bup(?:ward)?s?\b|\binto the air\b/.test(t)) return 'up';
  if (/\bdown(?:ward)?s?\b/.test(t)) return 'down';
  if (/\bin place\b|\bon the spot\b/.test(t)) return 'in place';
  return 'forward';
}

export function detectIntensity(text: string): Intensity | null {
  const t = text.toLowerCase();
  if (/\b(powerful|hard|huge|big|massive|explosive|dramatic|wild|crazy|super|strong|epic|intense|energetic)\b/.test(t)) return 'exaggerated';
  if (/\b(gentle|gently|subtle|softly|soft|small|little|tiny|slight|slightly|calm)\b/.test(t)) return 'subtle';
  return null;
}

export function detectSpeed(text: string): Speed | null {
  const t = text.toLowerCase();
  if (/\b(slow|slowly|lazy|lazily|sleepy|careful|carefully|tired)\b/.test(t)) return 'slow';
  if (/\b(fast|quick|quickly|rapid|rapidly|sudden|suddenly|snappy|swift)\b/.test(t)) return 'fast';
  return null;
}

const INTENSITY_SCALE: Record<Intensity, number> = { subtle: 0.6, normal: 1, exaggerated: 1.3 };
const SPEED_SCALE: Record<Speed, number> = { slow: 1.6, normal: 1, fast: 0.6 };

function buildPose(action: ActionDef, key: KeyDef, view: View, facing: 1 | -1, intensity: Intensity): RigPose {
  const v = key.view ?? view;
  const base = neutralPose(v, facing);
  const neutralLocal = worldToLocalAngles({}, v, 0);
  const target = worldToLocalAngles(adaptToView(key.w, action, v), v, key.lean ?? 0);
  const k = INTENSITY_SCALE[intensity];
  const angles = {} as Record<BoneId, number>;
  for (const b of Object.keys(target) as BoneId[]) angles[b] = neutralLocal[b] + wrapDeg(target[b] - neutralLocal[b]) * k;
  return {
    ...base,
    angles,
    lean: (key.lean ?? 0) * k,
    lift: (key.lift ?? 0) * (intensity === 'exaggerated' ? 1.25 : intensity === 'subtle' ? 0.7 : 1),
    dx: key.dx ?? 0,
    look: key.look ?? 0,
    view: v,
    facing: key.flip ? (-facing as 1 | -1) : facing,
  };
}

/** Side-view keys rendered in front view: keep arm/leg lift but treat "forward" as "outward". */
function adaptToView(w: Partial<Record<BoneId, number>>, action: ActionDef, v: View) {
  if (v === action.view || v === 'side') return w;
  // front view requested for a side-authored action: legs stay under the body, arms keep their height
  const out: Partial<Record<BoneId, number>> = {};
  for (const [b, a] of Object.entries(w) as [BoneId, number][]) {
    if (b === 'spine' || b === 'neck' || b === 'head') out[b] = -90 + (a + 90) * 0.3;
    else if (b.startsWith('ua') || b.startsWith('fa')) out[b] = a > 90 && a < 270 ? 180 - a : a; // fold "back" into "out"
    else if (b.startsWith('ft')) out[b] = 10;
    else out[b] = NEUTRAL_WORLD.front[b] + (a - NEUTRAL_WORLD.side[b]) * 0.35;
  }
  return out;
}

/** Layer an upper-body action (punch, wave...) on top of an airborne pose (e.g. punch in mid-air). */
function layerUpperBody(lower: RigPose, upper: RigPose): RigPose {
  const angles = { ...lower.angles };
  for (const b of ['spine', 'neck', 'head', 'uaR', 'faR', 'uaL', 'faL'] as BoneId[]) angles[b] = upper.angles[b];
  return { ...lower, angles, look: upper.look };
}

function allocate(n: number, total: number): number[] {
  const alloc = new Array(n).fill(1);
  let left = total - n;
  for (let i = 0; left > 0; i = (i + 1) % n, left--) alloc[i]++;
  return alloc;
}

export function planMotion(prompt: string, settings: PlanSettings): MotionPlan {
  const text = prompt.trim();
  const notes: string[] = [];
  const clarify: Clarification[] = [];
  let actions = detectActions(text);
  const recognized = actions.length > 0;
  if (!recognized) actions = ['idle'];

  // "crouch ... then jump" → the crouch becomes the jump's anticipation
  const ci = actions.indexOf('crouch');
  if (ci >= 0 && actions[ci + 1] === 'jump') {
    actions.splice(ci, 1);
    notes.push('Your crouch becomes the anticipation pose of the jump.');
  }

  const facing: 1 | -1 = settings.facing ?? 1;
  const direction = detectDirection(text);
  const detectedSide = detectSide(text);
  const side = settings.side ?? detectedSide ?? 'right';
  const intensity = detectIntensity(text) ?? settings.intensity;
  const speed = detectSpeed(text) ?? settings.speed;
  const first = ACTIONS[actions[0]];
  const view: View = settings.view && settings.view !== 'auto' ? settings.view : direction === 'toward camera' ? 'front' : first.view;

  const total = settings.poseCount;
  if (actions.length > total) {
    notes.push(`${actions.length} actions don't fit in ${total} poses, so PosePilot used the first ${total}: ${actions.slice(0, total).map((a) => ACTIONS[a].name).join(', ')}. Generate the rest as a second set.`);
    actions = actions.slice(0, total);
  }
  const alloc = allocate(actions.length, total);

  // Travel direction: walking "left" etc. sets which way the character faces while moving
  let moveFacing = facing;
  if (direction === 'left') moveFacing = -1;
  if (direction === 'right') moveFacing = 1;
  const travels = (id: ActionId) => ['walk', 'run', 'jump', 'land'].includes(id);
  const dxSign = direction === 'backward' ? -1 : 1;
  const travelScale = direction === 'up' || direction === 'in place' ? 0 : 1;

  const keys: PlannedKey[] = [];
  let dxCarry = 0;
  let prev: { action: ActionId; pose: RigPose } | null = null;
  actions.forEach((id, ai) => {
    const def = ACTIONS[id];
    const count = Math.min(alloc[ai], 3) as 1 | 2 | 3;
    const picks = def.pick[count];
    const thisFacing = travels(id) ? moveFacing : facing;
    let lastDx = 0;
    for (const pi of picks) {
      const kd = def.keys[pi];
      let pose = buildPose(def, kd, view, thisFacing, intensity);
      if (def.sided && side === 'left') pose = swapSides(pose);
      const ownDx = travels(id) ? (kd.dx ?? 0) * dxSign * travelScale : (kd.dx ?? 0);
      pose.dx = dxCarry + ownDx;
      lastDx = ownDx;
      if (id === 'look' && direction === 'right') pose.look = -pose.look;
      if (prev && def.upperBody && (prev.action === 'jump' || prev.action === 'run') && prev.pose.lift > 0.05) {
        pose = layerUpperBody(prev.pose, pose);
        notes.push(`The ${def.name.toLowerCase()} happens in mid-air, on top of the ${ACTIONS[prev.action].name.toLowerCase()}.`);
      }
      const hold = Math.max(1, Math.round(kd.hold * SPEED_SCALE[speed]));
      keys.push({
        index: keys.length,
        role: kd.role,
        roleLabel: ROLE_LABEL[kd.role],
        label: kd.label,
        action: id,
        description: describeKey(kd, def, side),
        pose,
        hold,
      });
    }
    dxCarry += lastDx;
    const last = keys[keys.length - 1];
    prev = { action: id, pose: last.pose };
  });

  if (!recognized) {
    clarify.push({
      id: 'action',
      question: text ? "PosePilot couldn't tell which motion you meant. Pick the closest one:" : 'Pick a motion to start:',
      options: (['jump', 'punch', 'wave', 'walk', 'kick', 'throw', 'crouch', 'fall'] as ActionId[]).map((a) => ({ label: ACTIONS[a].name, patch: { prompt: text ? `${text} (${ACTIONS[a].verb})` : `Make the character ${ACTIONS[a].verb}` } })),
    });
    notes.push('Showing a gentle idle motion until you choose.');
  }
  const sidedAction = actions.find((a) => ACTIONS[a].sided);
  if (recognized && sidedAction && !detectedSide && !settings.side) {
    const limb = ACTIONS[sidedAction].sided === 'leg' ? 'leg' : 'hand';
    clarify.push({
      id: 'side',
      question: `Which ${limb}? (PosePilot guessed right)`,
      options: [
        { label: `Right ${limb}`, patch: { side: 'right' } },
        { label: `Left ${limb}`, patch: { side: 'left' } },
      ],
    });
  }

  const bodyParts = Array.from(new Set(actions.flatMap((a) => ACTIONS[a].bodyParts)));
  const explanation = actions.flatMap((a) => ACTIONS[a].explain.slice(0, actions.length > 1 ? 1 : 3));
  if (intensity === 'exaggerated') explanation.push('Exaggerated poses push the stretch and squash further — great for cartoony energy.');
  if (speed === 'slow') explanation.push('Slow motion = more frames on each pose. Fast motion = fewer frames.');

  const inbetweensPerGap = speed === 'slow' ? 3 : speed === 'fast' ? 1 : 2;
  const totalFrames = keys.reduce((s, k) => s + k.hold, 0) + (keys.length) * inbetweensPerGap;
  const names = actions.map((a) => ACTIONS[a].verb);
  const dirText = direction !== 'forward' && direction !== 'in place' && actions.some(travels) ? ` ${direction}` : '';
  const summary = recognized
    ? `${capital(joinWords(names))}${dirText}${sidedAction ? ` (${side} ${ACTIONS[sidedAction].sided})` : ''} — ${keys.map((k) => k.label.toLowerCase()).join(' → ')}`
    : 'Gentle idle motion (no action recognised yet)';

  return {
    prompt: text,
    recognized,
    actions,
    summary,
    direction,
    side,
    sideWasGuessed: !detectedSide && !settings.side,
    bodyParts,
    intensity,
    speed,
    view,
    keys,
    explanation,
    notes: Array.from(new Set(notes)),
    clarify,
    timing: { fps: 12, totalFrames, seconds: Math.round((totalFrames / 12) * 10) / 10, inbetweensPerGap },
    special: actions[0] === 'coin' ? 'coin' : undefined,
  };
}

function describeKey(kd: KeyDef, def: ActionDef, side: 'right' | 'left') {
  let d = kd.describe;
  if (def.sided) {
    const limb = def.sided === 'arm' ? 'arm' : 'leg';
    d = d.replace(/\b(punching|waving|throwing|pointing|raised|kicking) (arm|fist|hand|leg)\b/g, `${side} $2`);
    if (!d.includes(side)) d += ` (using the ${side} ${limb})`;
  }
  return d;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const joinWords = (w: string[]) => (w.length <= 1 ? w.join('') : `${w.slice(0, -1).join(', ')} then ${w[w.length - 1]}`);

/** A single library pose, for the rig panel's pose presets. */
export function presetPose(action: ActionId, keyIndex: number, facing: 1 | -1, view?: View): RigPose {
  const def = ACTIONS[action];
  const pose = buildPose(def, def.keys[keyIndex], view ?? def.view, facing, 'normal');
  return { ...pose, dx: 0 };
}
