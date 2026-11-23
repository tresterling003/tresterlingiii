import { Bone, FlipHorizontal2, Pipette, Plus, Scissors, Trash2, ArrowLeftRight } from 'lucide-react';
import { BONES, clonePose, swapSides, type BoneId, type RigPose } from '../lib/rig/skeleton';
import { DEFAULT_STICK, type RigStyle } from '../lib/rig/render';
import { presetPose } from '../lib/motion/planner';
import type { ActionId } from '../lib/motion/library';
import { dominantInkColor } from '../lib/raster/image';
import { useRef } from 'react';
import { addRigFrame, previewFramePose, commitFramePose, commitRig, compositeFrame, ensureRig, referenceFrame, useStore, actions } from '../state/store';
import { isRigDriven } from './CanvasView';
import { Section, Segmented, Slider } from './ui';

const PRESETS: { label: string; action: ActionId; key: number }[] = [
  { label: 'Crouch', action: 'crouch', key: 1 },
  { label: 'Jump', action: 'jump', key: 2 },
  { label: 'Punch', action: 'punch', key: 1 },
  { label: 'Kick', action: 'kick', key: 1 },
  { label: 'Wave', action: 'wave', key: 1 },
  { label: 'Walk', action: 'walk', key: 0 },
  { label: 'Run', action: 'run', key: 2 },
  { label: 'Point', action: 'point', key: 1 },
  { label: 'Throw', action: 'throw', key: 0 },
  { label: 'Surprise', action: 'surprise', key: 1 },
];

export function RigPanel() {
  const project = useStore((s) => s.project);
  const rigMode = useStore((s) => s.rigMode);
  const cutBone = useStore((s) => s.cutBone);
  if (!project) return null;
  const frame = project.frames.find((f) => f.id === project.currentId);
  const rig = project.rig;
  const style = project.rigStyle;

  if (!rig || !style) {
    return (
      <Section title="Pose Rig">
        <p className="text-[12px] text-paper-dim leading-snug">
          A rig is a skeleton you can pose. PosePilot uses it to create real new poses without AI — perfect for stick figures. For detailed drawings you can cut your drawing into pieces and pin them to the bones.
        </p>
        <button className="btn btn-primary w-full mt-3" onClick={() => { ensureRig(); actions.set({ rigMode: 'fit' }); }} data-testid="add-rig"><Bone size={14} /> Add a rig to my character</button>
      </Section>
    );
  }

  const rigDriven = isRigDriven(frame);
  const setPose = (p: RigPose, label: string) => frame?.rigPose && commitFramePose(frame.id, frame.rigPose, p, label);
  const setStyle = (next: RigStyle, label: string) => commitRig({ rig, style }, { rig, style: next }, label);

  return (
    <Section title="Pose Rig" right={<span className="text-[10.5px] text-kind-rig uppercase tracking-wide font-semibold">{style.kind === 'cutout' ? 'Cut-out' : style.kind === 'cartoon' ? 'Cartoon' : 'Stick'} rig</span>}>
      <Segmented
        label="Rig mode"
        value={rigMode}
        onChange={(v) => actions.set({ rigMode: v })}
        options={[
          { value: 'pose', label: 'Pose', title: 'Drag joints to pose a rig frame' },
          { value: 'fit', label: 'Fit to drawing', title: 'Line the skeleton up with your original drawing' },
          { value: 'cut', label: 'Cut-out', title: 'Pin pieces of your drawing to bones' },
        ]}
      />

      {rigMode === 'pose' && (
        rigDriven && frame?.rigPose ? (
          <div className="mt-3 space-y-2.5">
            <p className="text-[11.5px] text-paper-dim leading-snug">Drag the dots. Hands and feet move the whole limb (inverse kinematics); elbows and knees rotate one bone. The blue dot moves the body.</p>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button key={p.label} className="chip !h-6 !text-[11.5px]" onClick={() => setPose(presetPose(p.action, p.key, frame.rigPose!.facing, frame.rigPose!.view), `Preset: ${p.label}`)}>{p.label}</button>
              ))}
            </div>
            <LeanSlider frameId={frame.id} pose={frame.rigPose} />
            <div className="flex flex-wrap gap-1.5">
              <button className="btn !h-7 !text-[12px]" onClick={() => setPose({ ...clonePose(frame.rigPose!), facing: (frame.rigPose!.facing * -1) as 1 | -1 }, 'Flip facing')}><FlipHorizontal2 size={13} /> Face other way</button>
              <button className="btn !h-7 !text-[12px]" onClick={() => setPose(swapSides(frame.rigPose!), 'Swap left/right')}><ArrowLeftRight size={13} /> Swap L/R</button>
              <Segmented size="sm" label="View" value={frame.rigPose.view} onChange={(v) => setPose({ ...clonePose(frame.rigPose!), view: v }, 'Change view')} options={[{ value: 'side', label: 'Side' }, { value: 'front', label: 'Front' }]} />
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-[11.5px] text-paper-dim leading-snug">This frame is a drawing, not a rig pose. Pick a RIG frame in the timeline, generate poses in Rig mode, or add a new rig pose.</p>
            <button className="btn w-full mt-2" onClick={() => addRigFrame()}><Plus size={14} /> Add rig pose frame</button>
          </div>
        )
      )}

      {rigMode === 'fit' && (
        <div className="mt-3 space-y-2.5">
          <p className="text-[11.5px] text-paper-dim leading-snug">Select your <b>original</b> frame, then drag each dot onto the matching joint of your drawing. Bones stretch to fit your character's proportions. The blue dot moves the whole rig.</p>
          <Slider label="Size" value={Math.round(rig.height)} min={60} max={Math.round(project.height * 1.2)} onChange={(v) => commitRig({ rig, style }, { rig: { ...rig, height: v }, style }, 'Resize rig')} format={(v) => `${v}`} />
          <Segmented size="sm" label="Rest view" value={rig.rest.view} onChange={(v) => commitRig({ rig, style }, { rig: { ...rig, rest: { ...rig.rest, view: v } }, style }, 'Rig view')} options={[{ value: 'front', label: 'Drawn from front' }, { value: 'side', label: 'Drawn from side' }]} />
          {style.kind === 'stick' && (
            <div className="space-y-2 pt-1">
              <p className="label">Stick figure look</p>
              <div className="flex items-center gap-2">
                <input type="color" value={style.color} onChange={(e) => setStyle({ ...style, color: e.target.value }, 'Rig colour')} aria-label="Line colour" />
                <button className="btn !h-7 !text-[12px]" onClick={() => { const r = referenceFrame(); if (r) setStyle({ ...style, color: dominantInkColor(compositeFrame(r.id)) }, 'Match colour'); }}><Pipette size={13} /> Match my drawing</button>
              </div>
              <Slider label="Line" value={style.lineWidth} min={1} max={40} onChange={(v) => setStyle({ ...style, lineWidth: v }, 'Line thickness')} />
              <div className="flex gap-1.5">
                <button className="chip !h-6 !text-[11.5px]" aria-pressed={style.face} onClick={() => setStyle({ ...style, face: !style.face }, 'Toggle face')}>Eyes</button>
                <button className="chip !h-6 !text-[11.5px]" aria-pressed={!!style.headFill} onClick={() => setStyle({ ...style, headFill: style.headFill ? null : '#ffffff' }, 'Toggle head fill')}>Filled head</button>
              </div>
            </div>
          )}
        </div>
      )}

      {rigMode === 'cut' && (
        <div className="mt-3 space-y-2.5">
          <p className="text-[11.5px] text-paper-dim leading-snug"><Scissors size={12} className="inline mr-1" />On your original frame, choose a bone, then draw a loop around that body part (e.g. the right forearm). That piece of <b>your drawing</b> then moves with the bone in every rig pose. Anything not cut follows the torso.</p>
          <label className="flex items-center gap-2 text-[11.5px] text-paper-dim">
            Bone
            <select className="field !py-1 text-[12px]" value={cutBone} onChange={(e) => actions.set({ cutBone: e.target.value })} aria-label="Bone for the next piece">
              {BONES.filter((b) => b.id !== 'spine').map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </label>
          {style.kind === 'cutout' ? (
            <>
              <ul className="space-y-1">
                {style.parts.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-[12px] bg-ink-850 border border-ink-700 rounded px-2 py-1">
                    <span className="flex-1">{p.label}</span>
                    <button className="icon-btn !w-6 !h-6" aria-label={`Remove ${p.label}`} onClick={() => setStyle({ ...style, parts: style.parts.filter((x) => x.id !== p.id) }, 'Remove piece')}><Trash2 size={12} /></button>
                  </li>
                ))}
              </ul>
              <button className="chip !h-6 !text-[11.5px]" aria-pressed={style.remainder} onClick={() => setStyle({ ...style, remainder: !style.remainder }, 'Toggle remainder')}>Uncut parts follow the torso</button>
              <button className="btn !h-7 !text-[12px] w-full" onClick={() => setStyle({ ...DEFAULT_STICK, lineWidth: Math.max(3, Math.round(rig.height * 0.014)) }, 'Use stick figure')}>Switch back to a stick figure rig</button>
            </>
          ) : (
            <p className="text-[11px] text-paper-mute">No pieces yet. Tip: fit the rig to your drawing first.</p>
          )}
        </div>
      )}
    </Section>
  );
}

/** Lean previews live while dragging and is committed to undo history on release. */
function LeanSlider({ frameId, pose }: { frameId: string; pose: RigPose }) {
  const start = useRef<RigPose | null>(null);
  const commit = () => {
    const f = actions.get().project?.frames.find((x) => x.id === frameId);
    if (start.current && f?.rigPose && f.rigPose.lean !== start.current.lean) commitFramePose(frameId, start.current, f.rigPose, 'Lean');
    start.current = null;
  };
  return (
    <div onPointerDown={() => (start.current = clonePose(pose))} onPointerUp={commit} onKeyDown={() => { if (!start.current) start.current = clonePose(pose); }} onKeyUp={commit}>
      <Slider label="Lean" value={Math.round(pose.lean)} min={-60} max={60} onChange={(v) => previewFramePose(frameId, { ...pose, lean: v })} format={(v) => `${v}°`} />
    </div>
  );
}

export const RIG_BONES = BONES.map((b) => b.id as BoneId);
