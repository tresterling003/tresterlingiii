// Shrinks the KayKit Adventurers + Skeletons models (CC0, Kay Lousberg) for the web:
// one shared animation set (on the knight) and one weapon loadout per hero.
//   npm i --no-save @gltf-transform/core @gltf-transform/functions
//   node tools/build-assets.mjs <dir with KayKit .glb files> public/assets
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, quantize } from '@gltf-transform/functions';
const [src, out] = process.argv.slice(2);
const KEEP = ['Idle', '2H_Melee_Idle', 'Walking_A', 'Running_A', 'Cheer', 'Death_A', 'Death_B', 'Hit_A', 'Hit_B', 'Interact', 'Lie_Idle', 'Lie_Down', 'Lie_StandUp',
  'Sit_Floor_Idle', 'Sit_Chair_Idle', 'Sit_Chair_StandUp', 'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Spellcasting', '1H_Melee_Attack_Chop',
  '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Stab', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', 'Dualwield_Melee_Attack_Slice', '2H_Ranged_Shoot',
  'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B', 'Block', 'Blocking', 'Block_Hit', 'Use_Item', 'Dodge_Backward', 'PickUp', 'Throw'];
const MODELS = [
  ['knight', 'Knight', ['1H_Sword', 'Round_Shield'], true], ['barbarian', 'Barbarian', ['2H_Axe']], ['mage', 'Mage', ['2H_Staff']],
  ['rogue', 'Rogue', ['Knife', 'Knife_Offhand']], ['warden', 'Rogue_Hooded', ['2H_Crossbow']],
  ['bones', 'Skeleton_Minion', []], ['stalker', 'Skeleton_Rogue', []], ['guard', 'Skeleton_Warrior', []], ['chanter', 'Skeleton_Mage', []],
];
const io = new NodeIO();
for (const [name, file, gear, anims] of MODELS) {
  const doc = await io.read(`${src}/${file}.glb`);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (anims && KEEP.includes(a.getName())) continue;
    a.listChannels().forEach(c => c.dispose());
    a.listSamplers().forEach(s => s.dispose());
    a.dispose();
  }
  for (const n of root.listNodes()) {
    const p = n.getParentNode();
    if (p && /^handslot/.test(p.getName()) && !gear.includes(n.getName())) n.dispose();
  }
  await doc.transform(resample(), prune(), dedup(), quantize({ quantizePosition: 14, quantizeNormal: 10 }));
  await io.write(`${out}/${name}.glb`, doc);
}
