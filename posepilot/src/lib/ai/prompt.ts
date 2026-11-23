// Turns a planned key pose into a drawing instruction for an image model.
import type { MotionPlan, PlannedKey } from '../motion/planner';

export interface PromptOptions {
  plan: MotionPlan;
  key: PlannedKey;
  consistency: number; // 0..100
  correction?: string;
  hasGuide: boolean;
  hasPreviousAttempt: boolean;
  transparent: boolean;
}

export function buildPosePrompt(o: PromptOptions): string {
  const { plan, key } = o;
  const n = plan.keys.length;
  const strict = o.consistency >= 67;
  const loose = o.consistency < 34;
  const lines: string[] = [];
  lines.push(
    'You are helping a student animator. Image 1 is their ORIGINAL character drawing. Redraw this SAME character in a NEW pose for a 2D animation key frame.',
  );
  lines.push(`New pose: ${key.description}.`);
  lines.push(`This is key pose ${key.index + 1} of ${n} (${key.roleLabel.toLowerCase()}) in the motion: "${plan.prompt || plan.summary}".`);
  if (plan.view === 'side') lines.push('Show the character in side (profile) view, facing the same direction as the original where possible.');
  if (o.hasGuide)
    lines.push(
      'Image 2 is a simple colour-coded stick-figure POSE GUIDE: match its body, arm and leg positions (warm red/orange limbs = the character\'s right side, blue limbs = left side). Do NOT draw the stick figure itself.',
    );
  if (o.hasPreviousAttempt) lines.push(`Image ${o.hasGuide ? 3 : 2} is the previous attempt at this pose. Keep what works and apply the correction below.`);
  if (o.correction) lines.push(`Correction from the animator: ${o.correction}.`);
  if (strict) {
    lines.push(
      'Keep the character IDENTICAL to image 1: same proportions, head size, face, hair, clothing, accessories, colours, line colour, line thickness and drawing style. Change ONLY the pose. Do not add details, shading or textures that are not in the original.',
    );
  } else if (loose) {
    lines.push(
      'Keep the character recognisable (same design, clothing and colours), but you may use stronger perspective, foreshortening and stretch to make the pose dynamic.',
    );
  } else {
    lines.push('Keep the same character design, proportions, clothing, colours and line style as image 1. Small perspective changes are fine if the pose needs them.');
  }
  lines.push(
    `Draw the full body at the same scale as the original, centred in the frame, on a ${o.transparent ? 'transparent' : 'plain white'} background. No scenery, no text, no extra characters, no motion lines, no frame borders.`,
  );
  return lines.join('\n');
}

export function buildInbetweenPrompt(consistency: number, transparent: boolean): string {
  return [
    'You are helping a student animator. Image 1 and image 2 are two key poses of the same 2D character.',
    'Draw the IN-BETWEEN pose exactly halfway between them: every body part halfway between its position in image 1 and image 2.',
    consistency >= 50
      ? 'Keep the character identical: same proportions, face, clothing, colours, line colour, line thickness and style. Change only the pose.'
      : 'Keep the same character design and colours.',
    `Same scale and framing as the key poses, full body, ${transparent ? 'transparent' : 'plain white'} background, no scenery, no text.`,
  ].join('\n');
}
