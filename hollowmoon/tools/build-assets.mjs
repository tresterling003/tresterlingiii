// Shrinks the KayKit Adventurers models (CC0, Kay Lousberg) for the web:
// one shared animation set, no weapons. Usage:
//   npm i --no-save @gltf-transform/core @gltf-transform/functions
//   node tools/build-assets.mjs <dir with KayKit .glb files> public/assets
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, quantize } from '@gltf-transform/functions';
const [src, out] = process.argv.slice(2);
const KEEP = ['Idle', 'Unarmed_Idle', 'Walking_A', 'Running_A', 'Cheer', 'Death_A', 'Death_A_Pose', 'Death_B', 'Death_B_Pose', 'Hit_A', 'Hit_B',
  'Interact', 'Lie_Down', 'Lie_Idle', 'Lie_StandUp', 'Sit_Floor_Down', 'Sit_Floor_Idle', 'Sit_Floor_StandUp', 'Spellcast_Shoot', 'Spellcast_Raise',
  'Throw', 'Unarmed_Melee_Attack_Punch_A', 'Block', 'Blocking', 'Use_Item', '1H_Ranged_Aiming', '2H_Melee_Attack_Chop', 'Dodge_Backward', 'Jump_Full_Short', 'PickUp'];
const io = new NodeIO();
for (const [name, file, anims] of [['knight', 'Knight', true], ['barbarian', 'Barbarian'], ['mage', 'Mage'], ['rogue', 'Rogue'], ['hooded', 'Rogue_Hooded']]) {
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
    if (p && /^handslot/.test(p.getName())) n.dispose(); // swords, shields, staffs
  }
  await doc.transform(resample(), prune(), dedup(), quantize({ quantizePosition: 14, quantizeNormal: 10 }));
  await io.write(`${out}/${name}.glb`, doc);
}
