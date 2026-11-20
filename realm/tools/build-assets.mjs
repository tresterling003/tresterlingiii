// Builds public/assets/ from the CC0 KayKit packs (Kay Lousberg), the three.js
// Horse and the Khronos Fox sample (CC-BY 4.0, tomkranis / AsoboStudio / scurest).
//   npm i --no-save @gltf-transform/core @gltf-transform/functions
//   node tools/build-assets.mjs <packs dir> <extra dir with Horse.glb, Fox.glb> public/assets
// <packs dir> holds the cloned KayKit-* repositories.
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, quantize, mergeDocuments, unpartition, join } from '@gltf-transform/functions';
import { readdirSync, statSync, copyFileSync } from 'node:fs';
import { join as pjoin } from 'node:path';

const [packs, extra, out] = process.argv.slice(2);
const io = new NodeIO();
const walk = d => readdirSync(d).flatMap(f => { const p = pjoin(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(packs).filter(f => /\.(gltf|glb)$/.test(f) && !/fbx|obj/i.test(f));
const find = (name, hint = '') => {
  const f = files.find(p => p.includes(hint) && p.split('/').pop().replace(/\.gltf\.glb$|\.glb$|\.gltf$/, '') === name);
  if (!f) throw new Error('missing model ' + name);
  return f;
};

// ---- characters: one shared animation set, weapons kept so the game can pick a loadout
const HERO_ANIMS = ['Idle', '2H_Melee_Idle', 'Unarmed_Idle', 'Walking_A', 'Walking_B', 'Walking_Backwards', 'Running_A', 'Running_B', 'Jump_Start', 'Jump_Idle', 'Jump_Land',
  'Dodge_Forward', 'Dodge_Backward', 'Dodge_Left', 'Dodge_Right', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab',
  '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spin', 'Dualwield_Melee_Attack_Chop', 'Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab',
  '1H_Ranged_Shoot', '2H_Ranged_Shoot', '2H_Ranged_Aiming', 'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Spellcasting', 'Block', 'Blocking', 'Block_Hit',
  'Hit_A', 'Hit_B', 'Death_A', 'Death_A_Pose', 'Death_B', 'Cheer', 'Interact', 'PickUp', 'Use_Item', 'Throw', 'Sit_Chair_Idle', 'Sit_Floor_Idle', 'Lie_Idle', 'Lie_Down',
  'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'];
const BONE_ANIMS = ['Skeletons_Awaken_Floor', 'Skeletons_Awaken_Standing', 'Spawn_Ground_Skeletons', 'Taunt', 'Idle_Combat', 'Walking_D_Skeletons', 'Running_C', 'Death_C_Skeletons',
  'Spellcast_Summon', '1H_Melee_Attack_Jump_Chop'];
const CHARS = [
  ['knight', 'Knight', ['1H_Sword', 'Round_Shield', 'Badge_Shield', '2H_Sword'], HERO_ANIMS],
  ['barbarian', 'Barbarian', ['2H_Axe', '1H_Axe', 'Mug', 'Barbarian_Round_Shield']],
  ['mage', 'Mage', ['2H_Staff', '1H_Wand', 'Spellbook']],
  ['rogue', 'Rogue', ['Knife', 'Knife_Offhand', '1H_Crossbow', 'Throwable']],
  ['warden', 'Rogue_Hooded', ['2H_Crossbow', 'Knife']],
  ['bones', 'Skeleton_Minion', [], BONE_ANIMS], ['stalker', 'Skeleton_Rogue', []], ['guard', 'Skeleton_Warrior', []], ['chanter', 'Skeleton_Mage', []],
];
async function shrink(doc) { await doc.transform(resample(), prune(), dedup(), quantize({ quantizePosition: 14, quantizeNormal: 10 })); }
for (const [name, file, gear, anims] of CHARS) {
  const doc = await io.read(find(file, 'Characters'));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (anims && anims.includes(a.getName())) continue;
    a.listChannels().forEach(c => c.dispose());
    a.listSamplers().forEach(s => s.dispose());
    a.dispose();
  }
  for (const n of root.listNodes()) { const p = n.getParentNode(); if (p && /^handslot/.test(p.getName()) && !gear.includes(n.getName())) n.dispose(); }
  await shrink(doc);
  await io.write(`${out}/${name}.glb`, doc);
}

// ---- kits: many small models in one file, each under a node named after it
async function kit(outName, list, hint) {
  const target = new (await import('@gltf-transform/core')).Document();
  target.createBuffer();
  const main = target.createScene('kit');
  for (const name of list) {
    const src = await io.read(find(name, hint));
    const map = mergeDocuments(target, src);
    const scene = map.get(src.getRoot().listScenes()[0]);
    const holder = target.createNode(name);
    scene.listChildren().forEach(c => { scene.removeChild(c); holder.addChild(c); });
    scene.dispose();
    main.addChild(holder);
  }
  await target.transform(unpartition(), prune(), dedup(), join(), quantize({ quantizePosition: 14, quantizeNormal: 10 }));
  await io.write(`${out}/${outName}.glb`, target);
}
await kit('town', [
  ...['home_A', 'home_B', 'tavern', 'blacksmith', 'church', 'market', 'tower_A', 'tower_B', 'castle', 'barracks', 'well', 'windmill', 'archeryrange', 'tower_catapult', 'lumbermill']
    .flatMap(t => ['blue', 'green', 'red', 'yellow'].map(c => `building_${t}_${c}`)),
  'building_watermill_yellow', 'building_destroyed', 'building_mine_yellow', 'building_bridge_A', 'building_stage_A', 'building_stage_B', 'building_stage_C',
  'tent', 'barrel', 'crate_A_big', 'crate_B_small', 'crate_long_A', 'pallet', 'sack', 'fence_wood_straight', 'fence_wood_straight_gate', 'fence_stone_straight', 'wall_straight', 'wall_straight_gate',
  'wall_corner_A_outside', 'wall_corner_A_inside', 'flag_red', 'flag_blue', 'weaponrack', 'wheelbarrow', 'bucket_water', 'target', 'resource_lumber'], 'Medieval');
await kit('nature', ['tree_single_A', 'tree_single_B', 'trees_A_small', 'trees_A_medium', 'trees_A_large', 'trees_B_small', 'trees_B_medium', 'trees_B_large',
  'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E', 'hill_single_A', 'mountain_A', 'mountain_B', 'mountain_C', 'waterlily_A', 'waterplant_A',
  'cloud_big', 'cloud_small'], 'Medieval');
await kit('dungeon', ['wall', 'wall_doorway', 'wall_arched', 'wall_corner', 'wall_cracked', 'wall_broken', 'wall_gated', 'wall_window_closed', 'floor_tile_large', 'floor_tile_small_broken_A',
  'floor_dirt_large', 'floor_tile_big_spikes', 'floor_tile_grate', 'pillar', 'pillar_decorated', 'column', 'torch_mounted', 'torch_lit', 'chest', 'chest_gold', 'barrel_large', 'barrel_small',
  'box_large', 'crates_stacked', 'banner_patternA_red', 'banner_thin_green', 'banner_shield_red', 'rubble_large', 'rubble_half', 'stairs', 'table_long_decorated_A', 'candle_triple',
  'coin_stack_large', 'key', 'sword_shield_broken', 'shelf_large', 'trunk_large_A', 'keg', 'bed_floor'], 'Dungeon');
await kit('gear', ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Shield_Small_A', 'Skeleton_Crossbow', 'Skeleton_Arrow', 'arrow', 'smokebomb'], '');

// ---- animals
for (const [name, file] of [['horse', 'Horse.glb'], ['wolf', 'Fox.glb']]) {
  const doc = await io.read(`${extra}/${file}`);
  await doc.transform(prune(), dedup());
  await io.write(`${out}/${name}.glb`, doc);
}
