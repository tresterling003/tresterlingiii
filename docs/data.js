// EMBERFALL: OPEN REALM — all the content: heroes, monsters, people, items, quests, dialogue.
// Dialogue nodes are functions of `g`, the game API (see game.js → api()).

export const STATS = { might: 'Might', agility: 'Agility', mind: 'Mind', charm: 'Charm' };
export const STAT_ICON = { might: '💪', agility: '🤸', mind: '🧠', charm: '💬' };
export const BONUS_POINTS = 3;
export const XP_LEVELS = [0, 150, 400, 800, 1300, 2000]; // XP needed for levels 1–6
export const TINTS = ['', '#ff9c9c', '#ffe08a', '#a6e3a1', '#9ecbff', '#d2b0ff', '#8d8fa3'];

// dmg is [dice, sides]; the attack ability is added on top.
export const CLASSES = {
  knight: { name: 'Knight', icon: '🛡️', hp: 44, hpLv: 8, armor: 16, stats: { might: 3, agility: 0, mind: 0, charm: 1 }, atk: 'might', dmg: [1, 8], style: 'melee', reach: 2.7, rate: 0.62,
    gear: ['1H_Sword', 'Round_Shield'], hat: true, attacks: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop'], block: 0.2,
    blurb: 'Heavy armour, a big shield, and a habit of standing between monsters and everyone else.',
    abilities: [
      { id: 'bash', name: 'Shield Bash', icon: '🛡️', cd: 6, lvl: 1, text: 'Charge forward and slam everything in front: 1d8 + Might, and they are stunned.' },
      { id: 'smite', name: 'Radiant Smite', icon: '✨', cd: 16, lvl: 3, text: 'Holy light bursts out of you: 3d6 to every enemy nearby, and you heal 10.' },
    ] },
  barbarian: { name: 'Barbarian', icon: '🪓', hp: 50, hpLv: 9, armor: 13, stats: { might: 4, agility: 1, mind: -1, charm: 0 }, atk: 'might', dmg: [1, 12], style: 'melee', reach: 3.0, rate: 0.78,
    gear: ['2H_Axe'], hat: true, attacks: ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop'], block: 0.45,
    blurb: 'The biggest axe in the realm and the health to match. Subtlety not included.',
    abilities: [
      { id: 'whirl', name: 'Whirlwind', icon: '🌪️', cd: 7, lvl: 1, text: 'Spin your axe through everything around you: 2d6 + Might.' },
      { id: 'rage', name: 'Rage', icon: '😡', cd: 24, lvl: 3, text: 'For 10 seconds: +50% damage, take 25% less, and every hit heals you.' },
    ] },
  mage: { name: 'Mage', icon: '🔥', hp: 30, hpLv: 6, armor: 11, stats: { might: -1, agility: 1, mind: 4, charm: 1 }, atk: 'mind', dmg: [1, 10], style: 'magic', reach: 28, rate: 0.6,
    gear: ['2H_Staff'], hat: true, attacks: ['Spellcast_Shoot'], block: 0.5,
    blurb: 'Fragile, clever, and able to set a troll on fire from across a river.',
    abilities: [
      { id: 'fireball', name: 'Fireball', icon: '☄️', cd: 5, lvl: 1, text: 'A ball of fire that bursts for 2d6 + Mind on everything nearby. Trolls hate it.' },
      { id: 'nova', name: 'Frost Nova', icon: '❄️', cd: 14, lvl: 3, text: 'Freeze every enemy around you solid for 3 seconds: 1d6 cold.' },
    ] },
  rogue: { name: 'Rogue', icon: '🗡️', hp: 36, hpLv: 7, armor: 14, stats: { might: 0, agility: 4, mind: 1, charm: 2 }, atk: 'agility', dmg: [1, 6], style: 'melee', reach: 2.3, rate: 0.42,
    gear: ['Knife', 'Knife_Offhand'], hat: false, attacks: ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab', 'Dualwield_Melee_Attack_Chop'], block: 0.55,
    blurb: 'Two knives, quick feet, and a sneak attack for anyone who looks the other way. Best thief in town.',
    abilities: [
      { id: 'shadowstep', name: 'Shadowstep', icon: '🌑', cd: 8, lvl: 1, text: 'Vanish and reappear behind the nearest enemy, with a guaranteed critical stab.' },
      { id: 'smoke', name: 'Smoke Bomb', icon: '💨', cd: 20, lvl: 3, text: 'Turn invisible for 6 seconds. Monsters — and guards — lose track of you.' },
    ] },
  warden: { name: 'Warden', icon: '🌿', hp: 38, hpLv: 7, armor: 13, stats: { might: 0, agility: 3, mind: 2, charm: 1 }, atk: 'agility', dmg: [1, 8], style: 'ranged', reach: 32, rate: 0.7,
    gear: ['2H_Crossbow'], hat: false, attacks: ['2H_Ranged_Shoot'], block: 0.5,
    blurb: 'A crossbow, a hood, and the old green magic of the woods. Hits hard from far away.',
    abilities: [
      { id: 'volley', name: 'Volley', icon: '🏹', cd: 9, lvl: 1, text: 'Rain bolts on the spot you aim at: six bolts of 1d6.' },
      { id: 'grove', name: 'Mending Grove', icon: '🌱', cd: 18, lvl: 3, text: 'Heal 3d6 + Mind over 4 seconds — you and every ally nearby.' },
    ] },
};
export const CLASS_ORDER = ['knight', 'barbarian', 'mage', 'rogue', 'warden'];

export const BACKGROUNDS = {
  soldier: { name: 'Soldier', icon: '⚔️', text: '+6 maximum health.' },
  scholar: { name: 'Scholar', icon: '📜', text: 'Start with 2 Fate instead of 1.' },
  merchant: { name: 'Merchant', icon: '🪙', text: 'Start with 60 more gold.' },
  herbalist: { name: 'Herbalist', icon: '🧪', text: 'Start with 3 extra potions.' },
  outlaw: { name: 'Outlaw', icon: '🎭', text: '+3 to every steal and pickpocket roll.' },
};

export const ITEMS = {
  luckycoin: { name: 'Lucky Coin', icon: '🪙', text: '+1 to attack rolls', mods: { hit: 1 } },
  emberbrand: { name: 'Emberbrand', icon: '🔥', text: '+3 fire damage on every hit — trolls cannot heal through it', mods: { dmg: 3, fire: 1 } },
  wardring: { name: 'Ring of Warding', icon: '💍', text: '+1 armor', mods: { armor: 1 } },
  trollbelt: { name: 'Troll-hide Belt', icon: '🥋', text: '+10 maximum health', mods: { hp: 10 } },
  wyvernscale: { name: 'Wyvern Scale Mail', icon: '🐉', text: '+2 armor', mods: { armor: 2 } },
  owlcharm: { name: 'Owl Charm', icon: '🦉', text: '+1 Mind', mods: { mind: 1 } },
  silvertongue: { name: 'Silver Tongue Ring', icon: '💬', text: '+1 Charm', mods: { charm: 1 } },
  vargcloak: { name: "Varg's Wolf Cloak", icon: '🐺', text: '+1 Agility', mods: { agility: 1 } },
  gobcrown: { name: 'Tin Pie Crown', icon: '🥧', text: '+1 Might (it is mostly pie tin)', mods: { might: 1 } },
  crownsov: { name: 'Ash Crown (mastered)', icon: '👑', text: '+1 to every ability', mods: { might: 1, agility: 1, mind: 1, charm: 1 } },
  crowncursed: { name: 'Ash Crown (cursed)', icon: '💀', text: '+3 Might, −2 Charm', mods: { might: 3, charm: -2 } },
};
// Quest items have no bonuses; they show in the bag.
export const KEY_ITEMS = {
  gravekey: { name: 'The Grave Key', icon: '🗝️' }, piebasket: { name: "Pell's Pie Basket", icon: '🧺' }, lute: { name: "Lirel's Lute", icon: '🪕' },
  ashcrown: { name: 'The Ash Crown', icon: '👑' },
};

// ---- monsters and people who can fight
// kind: melee | ranged | caster. gear: weapons from the model (or the gear kit, for skeletons).
export const MONSTERS = {
  wolf: { name: 'Grey Wolf', model: 'wolf', hp: 16, armor: 12, hit: 4, dmg: [1, 6, 2], speed: 8.6, reach: 2.2, aggro: 20, xp: 25, gold: [0, 0], kind: 'melee' },
  bandit: { name: 'Bandit', model: 'barbarian', tint: '#9a7a62', gear: ['1H_Axe'], hp: 26, armor: 12, hit: 4, dmg: [1, 8, 2], speed: 5.8, reach: 2.6, aggro: 18, xp: 40, gold: [3, 12], kind: 'melee', attacks: ['1H_Melee_Attack_Chop'] },
  archer: { name: 'Bandit Archer', model: 'warden', tint: '#9a7a62', gear: ['2H_Crossbow'], hp: 18, armor: 12, hit: 5, dmg: [1, 8, 1], speed: 5.2, reach: 18, aggro: 24, xp: 40, gold: [3, 10], kind: 'ranged', attacks: ['2H_Ranged_Shoot'] },
  varg: { name: 'Varg the Red', title: 'Bandit Chief', model: 'knight', tint: '#c25a4a', gear: ['2H_Sword'], scale: 1.3, boss: true, hp: 150, armor: 15, hit: 6, dmg: [2, 6, 3], speed: 6.4, reach: 3.4, aggro: 22, xp: 260, gold: [40, 40], kind: 'melee',
    attacks: ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop'], special: 'cleave', loot: ['gravekey', 'vargcloak'] },
  raider: { name: 'Desert Raider', model: 'barbarian', tint: '#d8b070', gear: ['1H_Axe'], hp: 28, armor: 12, hit: 5, dmg: [1, 8, 2], speed: 6.0, reach: 2.6, aggro: 20, xp: 45, gold: [4, 14], kind: 'melee', attacks: ['1H_Melee_Attack_Chop'] },
  icewolf: { name: 'Ice Wolf', model: 'wolf', tint: '#e8f2ff', hp: 22, armor: 13, hit: 5, dmg: [1, 8, 2], speed: 9, reach: 2.2, aggro: 22, xp: 35, gold: [0, 0], kind: 'melee' },
  frosttroll: { name: 'Frost Troll', model: 'barbarian', tint: '#a8d8f0', gear: ['2H_Axe'], scale: 1.6, hp: 95, armor: 12, hit: 6, dmg: [2, 6, 3], speed: 5.4, reach: 3.6, aggro: 18, xp: 160, gold: [20, 40], kind: 'melee', regen: 2, special: 'slam', attacks: ['2H_Melee_Attack_Chop'] },
  goblin: { name: 'Goblin', model: 'rogue', tint: '#8bd36f', gear: ['Knife'], scale: 0.68, hp: 12, armor: 12, hit: 4, dmg: [1, 6, 1], speed: 7.4, reach: 2.0, aggro: 18, xp: 20, gold: [1, 6], kind: 'melee', attacks: ['1H_Melee_Attack_Stab'] },
  shaman: { name: 'Goblin Shaman', model: 'mage', tint: '#8bd36f', gear: ['1H_Wand'], scale: 0.75, hp: 15, armor: 11, hit: 5, dmg: [1, 8, 1], speed: 5.5, reach: 15, aggro: 22, xp: 30, gold: [2, 8], kind: 'caster', attacks: ['Spellcast_Shoot'] },
  grub: { name: 'Grub', title: 'The Pie King', model: 'barbarian', tint: '#7fc65f', gear: ['1H_Axe', 'Barbarian_Round_Shield'], scale: 1.12, boss: true, hp: 120, armor: 13, hit: 5, dmg: [1, 10, 3], speed: 6.0, reach: 2.9, aggro: 20, xp: 200, gold: [30, 30], kind: 'melee',
    attacks: ['1H_Melee_Attack_Chop'], special: 'slam', loot: ['piebasket', 'gobcrown'] },
  troll: { name: 'Gorm', title: 'The Toll Troll', model: 'barbarian', tint: '#6f9e7c', gear: ['2H_Axe'], scale: 2.0, boss: true, hp: 180, armor: 12, hit: 6, dmg: [2, 8, 3], speed: 5.6, reach: 4.4, aggro: 16, xp: 320, gold: [60, 60], kind: 'melee',
    attacks: ['2H_Melee_Attack_Chop'], special: 'slam', regen: 3, loot: ['trollbelt'] },
  mimic: { name: 'Mimic', title: 'It Was Never A Chest', model: 'mimic', boss: true, hp: 70, armor: 13, hit: 5, dmg: [2, 6, 2], speed: 6.6, reach: 2.6, aggro: 6, xp: 160, gold: [25, 25], kind: 'melee', loot: ['lute'] },
  wyvern: { name: 'Skarn', title: 'Wyvern of the Peak', model: 'wyvern', boss: true, hp: 230, armor: 14, hit: 7, dmg: [2, 8, 3], speed: 9, reach: 4.6, aggro: 34, xp: 420, gold: [120, 120], kind: 'melee', special: 'flyer', loot: ['wyvernscale'] },
  bones: { name: 'Restless Bones', model: 'bones', gear: ['Skeleton_Blade'], hp: 18, armor: 12, hit: 4, dmg: [1, 6, 2], speed: 5.0, reach: 2.4, aggro: 16, xp: 25, gold: [1, 4], kind: 'melee', undead: true, attacks: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal'] },
  stalker: { name: 'Grave Stalker', model: 'stalker', gear: ['Skeleton_Crossbow'], hp: 20, armor: 13, hit: 5, dmg: [1, 8, 1], speed: 5.4, reach: 18, aggro: 22, xp: 30, gold: [1, 5], kind: 'ranged', undead: true, attacks: ['2H_Ranged_Shoot'] },
  guardian: { name: 'Barrow Guardian', model: 'guard', gear: ['Skeleton_Axe', 'Skeleton_Shield_Small_A'], hp: 42, armor: 15, hit: 6, dmg: [1, 10, 3], speed: 4.6, reach: 2.8, aggro: 16, xp: 60, gold: [3, 9], kind: 'melee', undead: true, attacks: ['1H_Melee_Attack_Chop'] },
  chanter: { name: 'Grave Chanter', model: 'chanter', gear: ['Skeleton_Staff'], hp: 24, armor: 12, hit: 5, dmg: [1, 8, 2], speed: 4.6, reach: 16, aggro: 22, xp: 40, gold: [2, 7], kind: 'caster', undead: true, attacks: ['Spellcast_Shoot'] },
  boneking: { name: 'The Bone King', title: 'Wearer of the Ash Crown', model: 'chanter', gear: ['Skeleton_Staff'], scale: 1.85, crown: true, boss: true, hp: 340, armor: 15, hit: 7, dmg: [2, 8, 4], speed: 5.2, reach: 3.6, aggro: 30, xp: 650, gold: [200, 200],
    kind: 'melee', undead: true, attacks: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'], special: 'king', loot: [] },
  // the town watch: only hostile when you are wanted, or if you attack them
  sparring: { name: 'Sparring Partner', model: 'knight', tint: '#c8c8c8', gear: ['1H_Sword', 'Round_Shield'], hp: 45, armor: 13, hit: 3, dmg: [1, 4, 0], speed: 5.5, reach: 2.4, aggro: 30, xp: 0, gold: [0, 0], kind: 'melee', team: 'monster', guard: 0.45,
    attacks: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab'] },
  watch: { name: 'Town Guard', model: 'knight', tint: '#8fb3ff', gear: ['1H_Sword', 'Badge_Shield'], hp: 40, armor: 16, hit: 5, dmg: [1, 8, 2], speed: 6.9, reach: 2.6, aggro: 40, xp: 0, gold: [0, 4], kind: 'melee', team: 'town',
    attacks: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop'] },
};

// ---- the people of the realm. pos is [x, z] in the overworld.
// how often each foe raises its guard against light blows (heavy blows break guards)
for (const [k, v] of Object.entries({ bandit: 0.22, raider: 0.22, watch: 0.38, guardian: 0.42, varg: 0.28, grub: 0.25, sparring: 0.42, bones: 0.12 })) if (MONSTERS[k]) MONSTERS[k].guard = v;

export const NPCS = {
  maren: { name: 'Elder Maren', model: 'mage', tint: '#c9b8e6', gear: ['Spellbook'], hat: true, pos: [3, 80], face: 0, idle: 'Idle', title: 'Village Elder' },
  hale: { name: 'Captain Hale', model: 'knight', tint: '#8fb3ff', gear: ['1H_Sword', 'Badge_Shield'], hat: true, pos: [20, 36], face: 1.6, title: 'Captain of the Watch' },
  brida: { name: 'Brida', model: 'warden', tint: '#e6c27a', gear: [], pos: [-12, 70.5], face: 3.14, title: 'Trader' },
  doran: { name: 'Doran', model: 'barbarian', tint: '#c48a5a', gear: ['1H_Axe'], hat: false, pos: [19, 54], face: -0.8, title: 'Blacksmith' },
  tom: { name: 'Old Tom', model: 'rogue', tint: '#b9a27a', gear: [], pos: [-21, 38], face: 2.2, title: 'Stablemaster' },
  pell: { name: 'Farmer Pell', model: 'barbarian', tint: '#d8c48a', gear: [], hat: false, pos: [50, 112], face: -2.4, title: 'Farmer' },
  lirel: { name: 'Lirel', model: 'rogue', tint: '#ffb0d0', gear: ['Mug'], pos: [-16, 54], face: 0.9, idle: 'Sit_Chair_Idle', title: 'Bard', seatY: 0.0 },
  morwen: { name: 'Morwen', model: 'mage', tint: '#8fd88a', gear: ['1H_Wand'], hat: true, pos: [-190, 60], face: 0.4, title: 'Hedge Witch' },
  aldous: { name: 'Ser Aldous', model: 'knight', ghost: true, gear: ['1H_Sword'], hat: true, zone: 'barrow', title: 'The Bound Knight', idle: 'Sit_Floor_Idle' },
};

// ---- quests. Each step's `at` is where the marker points: an NPC id, a site id, or [x, z].
export const QUESTS = {
  main: { title: 'The Ash Crown', giver: 'maren', main: true, steps: [
    { text: 'Talk to Elder Maren at the chapel', at: 'maren' },
    { text: 'Take the Grave Key from Varg the Red at the Ruined Keep', at: 'keep' },
    { text: 'Travel north to the Barrow and open its door', at: 'barrowdoor' },
    { text: 'Find the Bone King in the depths of the Barrow', at: 'throne' },
    { text: 'Decide the fate of the Ash Crown', at: 'throne' },
    { text: 'Return to Elder Maren with the crown', at: 'maren' },
  ], reward: { xp: 600 } },
  goblins: { title: 'Goblin Trouble', giver: 'pell', steps: [
    { text: 'Get back Pell\'s pie basket from the Goblin Warren in the east', at: 'warren' },
    { text: 'Return the pies to Farmer Pell', at: 'pell' },
  ], reward: { xp: 250, gold: 60 } },
  lute: { title: 'The Lost Lute', giver: 'lirel', steps: [
    { text: 'Look for Lirel\'s lute at the Old Watchtower, north-east of the bridge', at: 'tower' },
    { text: 'Give the lute back to Lirel at the tavern', at: 'lirel' },
  ], reward: { xp: 220, item: 'silvertongue' } },
  glowcaps: { title: 'Glowcaps', giver: 'morwen', steps: [
    { text: 'Gather 5 glowcap mushrooms in the Mirefen (easier to spot at night)', at: 'swamp', count: 'glowcap', need: 5 },
    { text: 'Bring the glowcaps to Morwen', at: 'morwen' },
  ], reward: { xp: 200, item: 'owlcharm', potions: 2 } },
  wyvern: { title: 'Wings over the Peak', giver: 'hale', steps: [
    { text: 'Slay Skarn the wyvern on the Wyvern Peak, far north-east', at: 'peak' },
    { text: 'Report to Captain Hale', at: 'hale' },
  ], reward: { xp: 400, gold: 150 } },
  shards: { title: 'Ember Shards', giver: 'doran', steps: [
    { text: 'Find the 6 Ember Shards scattered across the realm (they glow on the map)', at: 'shard', count: 'shard', need: 6 },
    { text: 'Bring the shards to Doran the blacksmith', at: 'doran' },
  ], reward: { xp: 300, item: 'emberbrand' } },
  troll: { title: 'The Toll Troll', giver: 'troll', steps: [
    { text: 'Get past Gorm the troll at the North Bridge — pay, talk, or fight', at: 'bridge' },
  ], reward: { xp: 150 } },
};

// ---- dialogue. A node is { text, options:[{ t, next, do, check:{stat,dc}, ok, fail, cost, if, end }] }
// ok / fail are nodes too. `do(g)` runs when the option (or outcome) is chosen.
const bye = (t = 'Farewell.') => ({ t, end: true });
const RUMOURS = [
  '"They say the Bone King was a good man once. Nobody remembers his name, which is the sad part."',
  '"Solmara\'s markets sell spices you cannot find anywhere else. And sand. Lots of sand."',
  '"Frosthold\'s Jarl wrestles bears for fun. The bears have started to avoid him."',
  '"Tidewatch ships sail clear across the western lake. Mind the deep water — you will sink in armour."',
  '"Trolls hate fire. Wyverns hate being looked at. Bandits hate paying taxes, same as everyone."',
  '"If the watch is after you, duck into a house. Out of sight is out of mind — mostly."',
  '"Shrines out in the wilds will heal you, and once you have touched one you can travel back to it."',
  '"Old Tom at the Emberfall stables sells horses. Or so I hear. I walk everywhere."',
];
export const DIALOGUE = {
  maren: g => {
    const s = g.step('main');
    if (s === undefined || s === 0) return {
      text: g.fmt('{name}, thank the stars. The Ash Crown has been stolen from this very chapel — and since it went, the dead in the old Barrow have begun to walk.'),
      options: [
        { t: 'Who took it?', next: () => ({ text: 'A thing that calls itself the Bone King. Once, they say, it was only a gravedigger. The crown made it something else.', options: [
          { t: 'How do I get into the Barrow?', next: 'maren_key' }, bye('I will think on it.') ] }) },
        { t: 'I will bring it back.', next: 'maren_key' },
        bye('Not today, Elder.'),
      ] };
    if (s === 1) return { text: 'Varg and his bandits hold the Ruined Keep, west along the road. Get the Grave Key from him — by steel or by words. His gang is no joke: Pell\'s goblins or Lirel\'s errand might be good practice first.', options: [
      { t: 'Any advice?', next: () => ({ text: 'Varg is proud. Proud men can sometimes be talked into things. Or out of things. Mostly into fights.', options: [bye('Thanks.')] }) }, bye('On my way.') ] };
    if (s === 2) return { text: 'You have the key! The Barrow lies far to the north, past the river. The North Bridge is quickest — though I hear something big has started charging a toll.', options: [bye()] };
    if (s === 3 || s === 4) return { text: 'The crown is still down there, {name}. I can feel it, like a coal in my chest.', options: [bye()] };
    if (s === 5) return { text: g.fmt('You have it. You really have it. {name}, Emberfall will sing about you until the bards run out of rhymes.'), options: [
      { t: 'Return the Ash Crown to the chapel', do: g => g.endMain('home'), end: true } ] };
    return { text: g.fmt(g.flag('ending') === 'home' ? 'The crown sleeps quietly on the altar. You did that, {name}.' : 'The realm is quieter since the Barrow. Thank you, {name}.'), options: [
      { t: 'Any other work around here?', next: () => ({ text: 'Ask Captain Hale about bounties, Pell about goblins, and Lirel about — well, anything, if you have an hour.', options: [bye()] }) }, bye() ] };
  },
  maren_key: g => ({ text: 'The Barrow is sealed, and the only key belonged to the old gravedigger. Varg the Red took it when his bandits raided the graveyard. Find Varg at the Ruined Keep, out west.',
    options: [{ t: 'Then I will start with Varg.', do: g => g.startQuest('main', 1), end: true }] }),

  hale: g => {
    if (g.bounty > 0) return { text: `You are wanted, ${g.hero.name}. ${g.bounty} star${g.bounty > 1 ? 's' : ''} of trouble. Pay ${g.fine()} gold, or explain yourself.`, options: [
      { t: `Pay the fine (${g.fine()} gold)`, if: g => g.gold >= g.fine(), do: g => { g.pay(g.fine()); g.clearBounty(); }, end: true },
      { t: 'This is all a misunderstanding.', check: { stat: 'charm', dc: 10 + g.bounty * 2 },
        ok: { text: 'Hale sighs, rubs his eyes, and waves you off. "Fine. Misunderstanding. Do not let me misunderstand you again."', do: g => g.clearBounty() },
        fail: { text: '"That is what they all say." He reaches for his sword.', do: g => g.guardsAttack() } },
      bye('I will be going now.') ] };
    const w = g.step('wyvern');
    if (w === 1) return { text: 'Skarn is dead? By the… Here. The bounty, and the thanks of every shepherd in the north.', options: [{ t: 'Collect the bounty', do: g => g.completeQuest('wyvern'), end: true }] };
    return { text: 'The watch keeps the peace in Emberfall. Mostly from drunks. Lately from worse.', options: [
      { t: 'Any bounties going?', if: g => w === undefined && !g.done('wyvern'), next: () => ({ text: 'One. A wyvern called Skarn has made a nest on Wyvern Peak, far north-east, and it eats sheep. Big reward for its head.', options: [
        { t: 'I will hunt it.', do: g => g.startQuest('wyvern', 0), end: true }, bye('Too big for me, for now.') ] }) },
      { t: 'What are the rules here?', next: () => ({ text: 'Attack townsfolk, steal from stalls, take a horse you have not paid for — and you are wanted. Wanted folk get my guards. Lose them, or come and pay your fine.', options: [bye('Understood.')] }) },
      bye() ] };
  },
  brida: g => ({ text: 'Potions, charms and fine questionable goods! Coin first, adventuring second.', options: [
    { t: 'Healing potion (20 gold)', if: g => g.gold >= 20, do: g => { g.pay(20); g.addPotions(1); }, next: 'brida' },
    { t: 'Fate charm, +1 Fate (40 gold)', if: g => g.gold >= 40 && g.fateCount < 3, do: g => { g.pay(40); g.addFate(1); }, next: 'brida' },
    { t: 'Ring of Warding, +1 armor (150 gold)', if: g => g.gold >= 150 && !g.has('wardring'), do: g => { g.pay(150); g.giveItem('wardring'); }, next: 'brida' },
    bye('Just looking.') ] }),
  doran: g => {
    const s = g.step('shards'), tier = g.flag('smith') || 0, cost = [60, 140, 260][tier];
    const upgrade = tier < 3 ? [{ t: `Sharpen my weapon, +1 damage (${cost} gold)`, if: g => g.gold >= cost, do: g => { g.pay(cost); g.setFlag('smith', tier + 1); g.toast(`Weapon upgraded: +${tier + 1} damage`); }, next: 'doran' }] : [];
    if (s === 1) return { text: 'Six ember shards! Stand back. This is the fun part.', options: [{ t: 'Hand them over', do: g => g.completeQuest('shards'), end: true }] };
    return { text: s === 0 ? `Found any shards? ${g.count('shard')} of 6 so far.` : 'Doran. Steel, iron, and the occasional horseshoe.', options: [
      ...upgrade,
      { t: 'Anything special you could forge?', if: g => s === undefined && !g.done('shards'), next: () => ({ text: 'When the crown was stolen, its ember split into shards and scattered across the realm. Bring me six and I will forge you a blade that burns.', options: [
        { t: 'I will find them.', do: g => g.startQuest('shards', 0), end: true }, bye('Maybe later.') ] }) },
      bye() ] };
  },
  tom: g => {
    if (g.ownsHorse) return { text: 'She is a good horse. Whistle (H) and she will come running.', options: [bye()] };
    return { text: 'Need a horse? Sixty gold and she is yours. Or you could just take one, like a common horse thief, and see how Captain Hale feels about it.', options: [
      { t: 'Buy a horse (60 gold)', if: g => g.gold >= 60, do: g => { g.pay(60); g.buyHorse(); }, end: true },
      { t: 'Could you do me a better price?', check: { stat: 'charm', dc: 13 },
        ok: { text: '"Oh, go on. Forty, because I like your face."', options: [{ t: 'Buy for 40 gold', if: g => g.gold >= 40, do: g => { g.pay(40); g.buyHorse(); }, end: true }, bye('Still too much.')] },
        fail: { text: '"Sixty. Horses do not eat compliments."' } },
      bye('Just admiring them.') ] };
  },
  pell: g => {
    const s = g.step('goblins');
    if (s === 1 || (s === 0 && g.has('piebasket'))) return { text: 'My pies! And only slightly nibbled. Here — take this, and take a pie for the road.', options: [{ t: 'You are welcome', do: g => g.completeQuest('goblins'), end: true }] };
    if (s === 0) return { text: 'The goblins are holed up in the old mine, east along the road. Their boss calls himself the Pie King. With MY pies.', options: [bye()] };
    if (g.done('goblins')) return { text: 'No goblins all week. Best week of my life.', options: [bye()] };
    return { text: 'Goblins! Every night! They took a whole basket of pies and now there is a tiny goblin wearing a pie tin for a crown.', options: [
      { t: 'I will get your pies back.', do: g => g.startQuest('goblins', 0), end: true }, bye('Good luck with that.') ] };
  },
  lirel: g => {
    const s = g.step('lute');
    if (s === 1 || (s === 0 && g.has('lute'))) return { text: 'My lute! It is… why is it damp? No — do not tell me. Here, this ring helped me talk my way out of three marriages.', options: [{ t: 'Give back the lute', do: g => g.completeQuest('lute'), end: true }] };
    if (s === 0) return { text: 'The Old Watchtower, north-east of the bridge. I left it in a chest at the bottom. A very… friendly-looking chest.', options: [bye()] };
    return { text: g.done('lute') ? 'Want a song? Everyone wants a song. It is about you!' : 'Ah, a hero! I would sing for you, but I have lost my lute. I left it in a chest at the Old Watchtower and the chest… looked at me.', options: [
      { t: 'I will fetch it.', if: g => s === undefined && !g.done('lute'), do: g => g.startQuest('lute', 0), end: true },
      { t: 'Heard any rumours?', next: () => ({ text: 'Trolls hate fire. Wyverns hate being looked at. And the Bone King hates his real name. Which nobody knows. Probably.', options: [bye('Useful.')] }) },
      bye() ] };
  },
  morwen: g => {
    const s = g.step('glowcaps');
    if (s === 1) return { text: 'Five glowcaps, still humming. Lovely. Here is something to sharpen your eyes, and two of my best brews.', options: [{ t: 'Hand them over', do: g => g.completeQuest('glowcaps'), end: true }] };
    return { text: s === 0 ? `Glowcaps, dearie. ${g.count('glowcap')} of 5. They glow at night, which is the whole point.` : 'A visitor! I sell, I cook, and I see. Mostly I need mushrooms.', options: [
      { t: 'What do you need?', if: g => s === undefined && !g.done('glowcaps'), next: () => ({ text: 'Five glowcaps from the Mirefen. They glow blue at night. Mind the wolves.', options: [
        { t: 'I will gather them.', do: g => g.startQuest('glowcaps', 0), end: true }, bye() ] }) },
      { t: 'Buy a potion (15 gold)', if: g => g.gold >= 15, do: g => { g.pay(15); g.addPotions(1); }, next: 'morwen' },
      { t: 'What do you see?', check: { stat: 'mind', dc: 12 },
        ok: { text: '"The Bone King\'s true name is Aldric Vane. Say it to his face and he will remember he was a man. Briefly."', do: g => g.setFlag('truename', 1) },
        fail: { text: '"I see… you, standing there, wasting my afternoon."' } },
      bye() ] };
  },
  troll: g => {
    if (g.flag('trollpass')) return { text: '"Friend! Pass, pass. Mind the planks."', options: [bye('Thanks, Gorm.')] };
    return { text: '"TOLL," says the troll, standing up. And up. "Fifty gold. Or a riddle. Or your legs. Gorm is easy."', options: [
      { t: 'Pay the toll (50 gold)', if: g => g.gold >= 50, do: g => { g.pay(50); g.setFlag('trollpass', 1); g.completeQuest('troll'); }, end: true },
      { t: 'Trade riddles', check: { stat: 'mind', dc: 13 },
        ok: { text: '"What has roots nobody sees, is taller than trees, up up it goes and yet never grows?" Gorm thinks for nine minutes. "…MOUNTAIN? No. Gorm gives up. You pass. Gorm likes you."', do: g => { g.setFlag('trollpass', 1); g.completeQuest('troll'); } },
        fail: { text: 'Gorm\'s riddle is about his own feet, and you cannot work it out. "LEGS, then."', do: g => g.fight('troll') } },
      { t: 'Make friends', check: { stat: 'charm', dc: 15 },
        ok: { text: 'You compliment his bridge. Nobody has ever complimented his bridge. Gorm weeps, hugs you, and gives you a lucky river stone.', do: g => { g.setFlag('trollpass', 1); g.addFate(1); g.completeQuest('troll'); } },
        fail: { text: '"Gorm knows when he is being buttered." He raises his axe.', do: g => g.fight('troll') } },
      { t: 'Draw steel', do: g => g.fight('troll'), end: true },
      bye('I will find another way across.') ] };
  },
  varg: g => ({ text: '"Another hero. The last one is in that pot." Varg the Red hefts a sword taller than you. "You want the Grave Key? Take it from me."', options: [
    { t: 'Fight', do: g => g.fight('varg'), end: true },
    { t: '"Give me the key, and you live."', check: { stat: 'charm', dc: 16 },
      ok: { text: 'Something in your voice makes him think twice. He tosses you the key. "Take it and go. That Barrow gives me nightmares anyway."', do: g => g.vargYields() },
      fail: { text: 'He laughs until he coughs. "Get them, lads!"', do: g => g.fight('varg') } },
    { t: '"Fight me alone. No lads."', check: { stat: 'might', dc: 12 },
      ok: { text: '"Ha! I like you. Back off, lads." The bandits lower their weapons and watch.', do: g => g.fight('varg', true) },
      fail: { text: '"Alone? With you? Lads!"', do: g => g.fight('varg') } } ] }),
  aldous: g => {
    if (g.flag('aldous')) return { text: '"Go. I will be at your side when the time comes."', options: [bye()] };
    return { text: '"I guarded the crown in life," the ghost whispers. "The Bone King bound me here, so I would have to watch him wear it."', options: [
      { t: 'Break his chains', check: { stat: 'mind', dc: 13 },
        ok: { text: 'The chains ring like bells and fall. "Then I have one charge left in me. I will be there when you face him."', do: g => g.setFlag('aldous', 'ally') },
        fail: { text: 'The chains flare and burn you. The ghost groans.', do: g => g.hurtHero(8) } },
      { t: 'Ask how to beat the King', check: { stat: 'charm', dc: 12 },
        ok: { text: '"His crown is cracked above the left eye. Strike there." (The Bone King will have 3 less armor.)', do: g => g.setFlag('aldous', 'crack') },
        fail: { text: '"I… cannot remember. It has been so long."' } },
      { t: 'Kneel for his blessing', do: g => { g.setFlag('aldous', 'bless'); g.healHero(999); g.toast('Fully healed'); }, end: true },
      bye('Rest well.') ] };
  },
  boneking: g => ({ text: '"More thieves," says the Bone King, rising from his throne. "Kneel, or be knelt."', options: [
    { t: 'Speak his true name: "Aldric Vane."', if: g => g.flag('truename'), do: g => { g.setFlag('kingstun', 1); g.fight('boneking'); }, end: true },
    { t: 'Fight', do: g => g.fight('boneking'), end: true } ] }),
  crown: g => ({ text: 'The Ash Crown lies in the dust, still burning. It whispers that you would make a far better ruler than a gravedigger did.', options: [
    { t: 'Smash it on the throne', do: g => g.endMain('ashes'), end: true },
    { t: 'Take it home to Elder Maren', do: g => { g.giveKey('ashcrown'); g.setStep('main', 5); g.toast('Bring the crown to Elder Maren'); }, end: true },
    { t: 'Put it on', check: { stat: 'mind', dc: 15 },
      ok: { text: 'The whispers break against your will like waves against a cliff. The crown is yours, and you are still you.', do: g => g.endMain('sovereign') },
      fail: { text: 'The whispers were right. They always are.', do: g => g.endMain('cursed') } } ] }),
  stall: g => ({ text: 'The stall is piled with bread, trinkets and potions. Its owner is busy haggling with someone else.', options: [
    { t: 'Steal something', check: { stat: 'agility', dc: g.stealDC() },
      ok: { text: 'Nobody saw a thing.', do: g => g.stealLoot() },
      fail: { text: '"THIEF!"', do: g => g.crime(1, 'theft') } },
    bye('Leave it') ] }),
  barrowdoor: g => {
    if (!g.has('gravekey')) return { text: 'A stone door carved with a ring of runes, around a keyhole shaped like an open mouth. It will not move.', options: [
      { t: 'Read the runes', check: { stat: 'mind', dc: 12 }, ok: { text: '"Only the Grave Key opens the way of the dead." The gravedigger\'s key, then. Varg has it.' }, fail: { text: 'Old letters, and a lot of skulls.' } },
      { t: 'Force it', check: { stat: 'might', dc: 20 }, ok: { text: 'Somehow, impossibly, the stone grinds open.', do: g => g.openBarrow() }, fail: { text: 'It does not budge. You may have pulled something.' } },
      bye('Leave') ] };
    return { text: 'The Grave Key fits the keyhole as if the door has been waiting for it.', options: [{ t: 'Enter the Barrow', do: g => g.openBarrow(), end: true }, bye('Not yet')] };
  },

  // ---------------------------------------------------------------- people indoors
  resident: g => {
    const rob = { t: 'Hand over your coin. (Intimidate)', check: { stat: 'might', dc: 13 },
      ok: { text: 'They go pale and push a purse across the table.', do: g => g.rob() },
      fail: { text: '"HELP! THIEF! GUARDS!"', do: g => g.crime(1, 'robbery') } };
    if (g.bounty > 0) return { text: '"You — you are the one the watch is looking for! Get out of my house!"', options: [
      { t: 'You never saw me. (Intimidate)', check: { stat: 'might', dc: 12 }, ok: { text: 'They nod very quickly and stare at the floor.' }, fail: { text: '"GUARDS! In here!"', do: g => g.crime(1, 'trespassing') } },
      { t: 'I am leaving.', do: g => g.leaveRoom(), end: true } ] };
    if (g.isNight()) return { text: '"What — who are you? It is the middle of the night! Get out of my house!"', options: [
      { t: 'Sorry. Wrong door.', do: g => g.leaveRoom(), end: true },
      { t: 'I just need somewhere warm to sit. (Persuade)', check: { stat: 'charm', dc: 12 }, ok: { text: '"…Fine. By the fire. Touch nothing."' }, fail: { text: '"OUT!"', do: g => g.leaveRoom() } },
      rob ] };
    const hello = ['"Oh! A visitor. Mind the floor, I just swept it."', '"Can I help you? Door was open, I suppose."', `"Welcome to ${g.town()}, traveller. Not many folk knock these days."`, '"If you are selling something, I am not buying."'];
    return { text: hello[Math.floor(Math.random() * hello.length)], options: [
      { t: 'Heard any news?', next: () => ({ text: RUMOURS[Math.floor(Math.random() * RUMOURS.length)], options: [bye('Thanks.')] }) },
      rob, bye('Just passing through.') ] };
  },
  barkeep: g => ({ text: `"Welcome to the best tavern in ${g.town()}. Also the only one with a roof that does not leak. What will it be?"`, options: [
    { t: 'A mug of ale (5 gold) — restores a little health', if: g => g.gold >= 5, do: g => { g.pay(5); g.healHero(10 + g.level() * 2); g.toast('Ahh. That hits the spot.'); }, next: 'barkeep' },
    { t: 'A healing potion (25 gold)', if: g => g.gold >= 25, do: g => { g.pay(25); g.addPotions(1); }, next: 'barkeep' },
    { t: 'Rent a room for the night (15 gold) — sleep until dawn', if: g => g.gold >= 15, do: g => { g.pay(15); g.rest(); }, end: true },
    { t: 'Heard any rumours?', next: () => ({ text: RUMOURS[Math.floor(Math.random() * RUMOURS.length)], options: [bye('Interesting.')] }) },
    bye('Nothing for now.') ] }),
  smithy: g => {
    const tier = g.flag('smith') || 0, cost = [60, 140, 260][tier];
    return { text: `"Steel for sale, steel sharpened, steel straightened after you bent it on a troll. ${g.town()} folk swear by my work."`, options: [
      ...(tier < 3 ? [{ t: `Sharpen my weapon, +1 damage (${cost} gold)`, if: g => g.gold >= cost, do: g => { g.pay(cost); g.setFlag('smith', tier + 1); g.toast(`Weapon upgraded: +${tier + 1} damage`); }, next: 'smithy' }] : []),
      { t: 'Forge me a weapon', next: 'forge' },
      { t: 'Any tips for a fight?', next: () => ({ text: '"Swinging wildly gets you killed. Watch for the wind-up — when they flash, block right then and you will knock them off balance. Then you go in. Hard."', options: [bye('Got it.')] }) },
      bye() ] };
  },
  priest: g => ({ text: '"Peace be with you, child. The light keeps no doors locked."', options: [
    { t: 'Bless me (once a day) — fully heals you', do: g => g.pray(), end: true },
    { t: 'Donate 30 gold (+1 Fate)', if: g => g.gold >= 30 && g.fateCount < 3, do: g => { g.pay(30); g.addFate(1); }, next: 'priest' },
    { t: `Confess my crimes and pay the fine (${g.fine()} gold)`, if: g => g.bounty > 0 && g.gold >= g.fine(), do: g => { g.pay(g.fine()); g.clearBounty(); g.toast('Your slate is wiped clean.'); }, end: true },
    bye('Thank you.') ] }),
  lord: g => {
    if (g.bounty > 0) return { text: `${g.lord()} rises from the throne. "You stand in my hall with the watch at your heels? Kneel and pay, or my guards will make you kneel."`, options: [
      { t: `Kneel and pay (${g.fine()} gold)`, if: g => g.gold >= g.fine(), do: g => { g.pay(g.fine()); g.clearBounty(); }, end: true },
      { t: 'Your Majesty, there has been a misunderstanding. (Persuade)', check: { stat: 'charm', dc: 15 }, ok: { text: '"…Bold. I like bold. Go — and do not test me twice."', do: g => g.clearBounty() }, fail: { text: '"Seize them."', do: g => g.guardsAttack() } },
      { t: 'Make me.', do: g => g.guardsAttack(), end: true } ] };
    return { text: `"I am ${g.lord()}, and ${g.town()} is mine to keep safe. Speak, adventurer — quickly. A kingdom does not run itself."`, options: [
      { t: 'Is there any work for me?', next: () => ({ text: '"Always. Monsters on the roads, raiders in the sands, something foul in the old Barrow. Speak with Elder Maren in Emberfall, or Captain Hale of the watch. Bring me good news and you will find me generous."', options: [bye('I will.')] }) },
      { t: 'Tell me about this kingdom.', next: () => ({ text: RUMOURS[Math.floor(Math.random() * RUMOURS.length)], options: [bye('Thank you, Your Majesty.')] }) },
      bye('By your leave.') ] };
  },
  sergeant: g => ({ text: '"Hah! Another one who thinks fighting is mashing the swing button. Listen up, because I only say it once."', options: [
    { t: 'Teach me to fight.', next: () => ({ text: 'STAMINA is your life. Every swing, block and roll costs it. Run dry and you are a sack of meat.\n\nLIGHT attack: click. HEAVY attack: hold and release — slow, but it smashes through a guard.\n\nBLOCK: hold right mouse. Soaks most of a hit from the front.\n\nPARRY: start blocking just as their blow lands — when they flash and the "!" appears. A parry knocks them off balance.\n\nCOUNTER: hit an off-balance foe and it is a guaranteed critical.\n\nDODGE: Q (or Ctrl). Roll right as they swing for a perfect dodge — time slows and your next hit is a counter.', options: [
      { t: 'Spar with me.', do: g => g.spar(), end: true }, bye('Understood, Sergeant.') ] }) },
    { t: 'Spar with me.', do: g => g.spar(), end: true },
    bye('Not today.') ] }),
  board: g => ({ text: 'Notices are nailed over one another:\n• WANTED: Varg the Red, bandit lord of the Ruined Keep.\n• BOUNTY: the wyvern Skarn, Wyvern Peak. Apply to Captain Hale.\n• Lost: one goat. Answers to "Goat".\n• Raiders on the Solmara road. Travel in groups.\n• Frost trolls seen near Frosthold. Bring fire.', options: [bye('Leave the board')] }),
};

// Hints shown on the loading screen and in the pause menu.
export const TIPS = [
  'Attacks roll a d20 against the target\'s armor. A natural 20 is a critical hit.',
  'Trolls regenerate — unless something is on fire. Fireball, or a burning sword.',
  'A rogue\'s attacks deal extra damage to enemies who are not looking at them.',
  'Lose the guards: get out of sight for long enough and your bounty clears.',
  'Shrines are fast-travel points. Touch one, then pick it on the map (M).',
  'Dodge (Q) makes you briefly untouchable. Big attacks glow red first.',
  'Wolves hunt at night. So do worse things.',
];

// ================================================================== arms, materials, horses, missions (Emberfall & the Whispering Wood)
// r / l: what goes in the right / left hand. style: melee | ranged | magic. atk: the ability score the weapon uses.
export const WEAPONS = {
  fists: { name: 'Bare Fists', icon: 'fist', r: null, l: null, style: 'melee', atk: 'might', dmg: [1, 4], rate: 0.36, reach: 2.1, block: 0.6, attacks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'], heavy: 'Unarmed_Melee_Attack_Kick', text: 'Fast. Weak. Always with you.' },
  sword: { name: 'Arming Sword & Shield', icon: 'sword', r: '1H_Sword', l: 'Round_Shield', style: 'melee', atk: 'might', dmg: [1, 8], rate: 0.55, reach: 2.7, block: 0.2, attacks: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop'], heavy: '2H_Melee_Attack_Chop', price: 70, text: 'Balanced, with a shield that soaks up blows.' },
  greatsword: { name: 'Greatsword', icon: 'greatsword', r: '2H_Sword', l: null, style: 'melee', atk: 'might', dmg: [2, 6], rate: 0.76, reach: 3.2, block: 0.4, attacks: ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'], heavy: '2H_Melee_Attack_Spin', price: 190, craft: { iron: 4, gold: 70 }, text: 'Long reach, wide arcs, heavy spin.' },
  axe: { name: 'Axe & Buckler', icon: 'axe', r: '1H_Axe', l: 'Barbarian_Round_Shield', style: 'melee', atk: 'might', dmg: [1, 10], rate: 0.6, reach: 2.6, block: 0.25, attacks: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop'], heavy: '2H_Melee_Attack_Chop', price: 95, craft: { iron: 2, hide: 1, gold: 25 }, text: 'Bites deep. The buckler still blocks.' },
  greataxe: { name: 'Greataxe', icon: 'greataxe', r: '2H_Axe', l: null, style: 'melee', atk: 'might', dmg: [1, 12], rate: 0.8, reach: 3.0, block: 0.45, attacks: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'], heavy: '2H_Melee_Attack_Spin', price: 170, craft: { iron: 4, hide: 1, gold: 60 }, text: 'Slow, brutal, wonderful.' },
  daggers: { name: 'Twin Daggers', icon: 'daggers', r: 'Knife', l: 'Knife_Offhand', style: 'melee', atk: 'agility', dmg: [1, 6], rate: 0.4, reach: 2.3, block: 0.55, attacks: ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab', 'Dualwield_Melee_Attack_Chop'], heavy: '1H_Melee_Attack_Stab', price: 80, craft: { iron: 2, gold: 20 }, sneak: true, text: 'Lightning combos and sneak attacks.' },
  staff: { name: 'Ember Staff', icon: 'staff', r: '2H_Staff', l: null, style: 'magic', atk: 'mind', dmg: [1, 10], rate: 0.6, reach: 28, block: 0.5, attacks: ['Spellcast_Shoot'], price: 160, text: 'Hurls bolts of fire-light. Uses Mind.' },
  wand: { name: 'Wand & Grimoire', icon: 'wand', r: '1H_Wand', l: 'Spellbook', style: 'magic', atk: 'mind', dmg: [1, 8], rate: 0.45, reach: 26, block: 0.55, attacks: ['Spellcast_Shoot'], price: 140, craft: { ember: 1, gold: 60 }, text: 'Quick little spells. Uses Mind.' },
  crossbow: { name: 'Heavy Crossbow', icon: 'crossbow', r: '2H_Crossbow', l: null, style: 'ranged', atk: 'agility', dmg: [1, 10], rate: 0.72, reach: 34, block: 0.5, attacks: ['2H_Ranged_Shoot'], price: 150, craft: { iron: 2, hide: 2, gold: 40 }, text: 'Hits hard at range. Uses Agility.' },
  handbow: { name: 'Hand Crossbow', icon: 'handbow', r: '1H_Crossbow', l: null, style: 'ranged', atk: 'agility', dmg: [1, 6], rate: 0.42, reach: 26, block: 0.55, attacks: ['1H_Ranged_Shoot'], price: 110, craft: { iron: 1, hide: 1, gold: 30 }, text: 'Light and quick. Uses Agility.' },
};
export const START_WEAPON = { knight: 'sword', barbarian: 'greataxe', mage: 'staff', rogue: 'daggers', warden: 'crossbow' };
export const MATERIALS = { iron: { name: 'Iron', icon: 'iron' }, hide: { name: 'Hide', icon: 'hide' }, ember: { name: 'Ember Shard', icon: 'ember' } };
export const HORSES = {
  pony: { name: 'Shire Pony', tint: '#a8865e', speed: 0.85, price: 40, text: 'Stout and cheap. Not fast.' },
  bay: { name: 'Bay Courser', tint: '#8a5a3a', speed: 1.0, price: 70, text: 'A good all-round horse.' },
  black: { name: 'Black Destrier', tint: '#2c2622', speed: 1.12, price: 160, text: 'A warhorse. Fast and fearless.' },
  white: { name: 'White Palfrey', tint: '#ece8e0', speed: 1.25, price: 260, text: 'The fastest in the kingdom.' },
};

Object.assign(QUESTS, {
  pit: { title: 'Blood & Sand', giver: 'pitmaster', steps: [
    { text: 'Win three rounds in the Emberfall fighting pit', at: 'arena' },
  ], reward: { xp: 220, gold: 90 } },
  wolves: { title: 'Wolves at the Woodline', giver: 'guild', steps: [
    { text: 'Hunt 6 wolves in the Whispering Wood, west of Emberfall', at: 'wood', count: 'wolf', need: 6 },
    { text: 'Report to the Guild Hall in Emberfall', at: 'guild' },
  ], reward: { xp: 200, gold: 70, mat: { hide: 2 } } },
  bertram: { title: 'The Lost Woodcutter', giver: 'guild', steps: [
    { text: 'Find Bertram the woodcutter in the Whispering Wood', at: 'bertram' },
    { text: 'Drive off the wolves circling Bertram', at: 'bertram', count: 'bertwolf', need: 3 },
    { text: 'Talk to Bertram', at: 'bertram' },
    { text: 'Tell the Guild Hall that Bertram is safe', at: 'guild' },
  ], reward: { xp: 240, gold: 60, potions: 1 } },
  camp: { title: 'The Red Hand Camp', giver: 'guild', steps: [
    { text: 'Clear out the Red Hand bandit camp deep in the Whispering Wood', at: 'camp', count: 'camp', need: 5 },
    { text: 'Collect your pay at the Guild Hall', at: 'guild' },
  ], reward: { xp: 320, gold: 140, mat: { iron: 3 } } },
  nightknife: { title: 'Bounty: The Night Knife', giver: 'guild', steps: [
    { text: 'Hunt the Night Knife in the back alleys of Emberfall — he only comes out after dark', at: 'nightknife' },
    { text: 'Collect the bounty at the Guild Hall', at: 'guild' },
  ], reward: { xp: 300, gold: 180 } },
});

Object.assign(MONSTERS, {
  redhand: { name: 'Red Hand Cutthroat', model: 'rogue', tint: '#b8423a', gear: ['Knife', 'Knife_Offhand'], hp: 30, armor: 13, hit: 5, dmg: [1, 8, 2], speed: 6.4, reach: 2.4, aggro: 22, xp: 50, gold: [5, 15], kind: 'melee', guard: 0.2, attacks: ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab'], drop: 'iron' },
  redchief: { name: 'Mag the Red Hand', title: 'Bandit Captain', model: 'barbarian', tint: '#b8423a', gear: ['2H_Axe'], scale: 1.15, boss: true, hp: 160, armor: 14, hit: 6, dmg: [2, 6, 3], speed: 6.2, reach: 3.0, aggro: 24, xp: 200, gold: [60, 60], kind: 'melee', guard: 0.3, special: 'slam', attacks: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'] },
  nightknife: { name: 'The Night Knife', title: 'Assassin of the Alleys', model: 'rogue', tint: '#3a3448', gear: ['Knife', 'Knife_Offhand'], boss: true, hp: 130, armor: 15, hit: 7, dmg: [1, 8, 4], speed: 7.6, reach: 2.4, aggro: 20, xp: 260, gold: [40, 40], kind: 'melee', guard: 0.35, attacks: ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Stab', 'Dualwield_Melee_Attack_Chop'] },
  pitfighter: { name: 'Pit Fighter', model: 'barbarian', tint: '#c89a6a', gear: ['1H_Axe', 'Barbarian_Round_Shield'], hp: 26, armor: 12, hit: 4, dmg: [1, 6, 2], speed: 6.0, reach: 2.5, aggro: 60, xp: 30, gold: [0, 0], kind: 'melee', guard: 0.25, attacks: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal'] },
  pitbrute: { name: 'Pit Brute', model: 'knight', tint: '#a87a5a', gear: ['2H_Sword'], scale: 1.2, hp: 60, armor: 13, hit: 5, dmg: [2, 6, 2], speed: 5.4, reach: 3.0, aggro: 60, xp: 60, gold: [0, 0], kind: 'melee', guard: 0.35, attacks: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'] },
});
MONSTERS.bandit.drop = MONSTERS.raider.drop = MONSTERS.watch.drop = 'iron';
MONSTERS.wolf.drop = MONSTERS.icewolf.drop = 'hide';

const cost = c => Object.entries(c).map(([k, v]) => (k === 'gold' ? `${v} gold` : `${v} ${MATERIALS[k].name.toLowerCase()}`)).join(', ');
Object.assign(DIALOGUE, {
  armorer: g => ({ text: '"Steel for every hand. Pay in gold, pay in blood — gold preferred."', options: [
    ...Object.entries(WEAPONS).filter(([k, w]) => w.price && !g.hasWeapon(k)).map(([k, w]) => ({ t: `${w.name} — ${w.price} gold`, if: g => g.gold >= w.price, do: g => { g.pay(w.price); g.giveWeapon(k); }, next: 'armorer' })),
    { t: 'Sell me a torch (5 gold)', if: g => g.gold >= 5 && !g.flag('torch'), do: g => { g.pay(5); g.setFlag('torch', 1); g.toast('Torch bought — press G or pick it on the weapon wheel.'); }, next: 'armorer' },
    { t: 'How do I switch weapons?', next: () => ({ text: 'Hold Tab (Y on a controller, the wheel button on a phone) to open the weapon wheel. Time slows while you choose.', options: [bye('Got it.')] }) },
    bye('Just looking.') ] }),
  forge: g => ({ text: '"Bring me iron and hide and I\'ll make you something worth swinging. Iron comes off bandits and the ore rocks in the Whispering Wood. Hide comes off wolves."', options: [
    ...Object.entries(WEAPONS).filter(([k, w]) => w.craft && !g.hasWeapon(k)).map(([k, w]) => ({ t: `Forge: ${w.name} (${cost(w.craft)})`, if: g => g.canCraft(w.craft), do: g => { g.spend(w.craft); g.giveWeapon(k); }, next: 'forge' })),
    { t: `What do I have? (${g.matsText()})`, next: 'forge' },
    bye('Later.') ] }),
  alchemist: g => ({ text: '"Tinctures, tonics and things that fizz. Do not lick anything."', options: [
    { t: 'Healing potion (20 gold)', if: g => g.gold >= 20, do: g => { g.pay(20); g.addPotions(1); }, next: 'alchemist' },
    { t: 'Three healing potions (50 gold)', if: g => g.gold >= 50, do: g => { g.pay(50); g.addPotions(3); }, next: 'alchemist' },
    { t: 'Fate charm, +1 Fate (40 gold)', if: g => g.gold >= 40 && g.fateCount < 3, do: g => { g.pay(40); g.addFate(1); }, next: 'alchemist' },
    bye('Thanks.') ] }),
  grocer: g => ({ text: '"Rope, oil, salt, nails — and I buy what you drag in from the woods."', options: [
    { t: 'Torch (5 gold)', if: g => g.gold >= 5 && !g.flag('torch'), do: g => { g.pay(5); g.setFlag('torch', 1); g.toast('Torch bought — press G to light it.'); }, next: 'grocer' },
    { t: 'Sell 1 hide (8 gold)', if: g => g.mat('hide') > 0, do: g => { g.spend({ hide: 1 }); g.earn(8); }, next: 'grocer' },
    { t: 'Sell 1 iron (10 gold)', if: g => g.mat('iron') > 0, do: g => { g.spend({ iron: 1 }); g.earn(10); }, next: 'grocer' },
    { t: 'Buy 1 iron (18 gold)', if: g => g.gold >= 18, do: g => { g.pay(18); g.addMat('iron', 1); }, next: 'grocer' },
    bye() ] }),
  baker: g => ({ text: '"Fresh this morning! Well — this week."', options: [
    { t: 'Honey loaf (6 gold) — heals a little', if: g => g.gold >= 6, do: g => { g.pay(6); g.healHero(14 + g.level() * 2); g.toast('Delicious.'); }, next: 'baker' },
    { t: 'Meat pie (12 gold) — heals a lot', if: g => g.gold >= 12, do: g => { g.pay(12); g.healHero(30 + g.level() * 4); g.toast('Very filling.'); }, next: 'baker' },
    bye() ] }),
  myhouse: g => ({ text: 'Your house. Small, draughty, and yours.', options: [
    { t: 'Sleep until morning', do: g => g.sleepUntil(0.27), end: true },
    { t: 'Sleep until nightfall', do: g => g.sleepUntil(0.8), end: true },
    { t: 'Save the game', do: g => { g.saveGame(); g.toast('Saved.'); }, end: true },
    bye('Leave it') ] }),
  guild: g => {
    const ms = ['wolves', 'bertram', 'camp', 'nightknife'];
    const ready = ms.filter(id => g.step(id) === QUESTS[id].steps.length - 1);
    const open = ms.filter(id => g.step(id) === undefined && !g.done(id));
    return { text: ready.length ? '"Back already? Let us see about your pay."' : '"The Adventurers\' Guild. Work for those who can swing a blade and keep their mouth shut. Pick a contract."', options: [
      ...ready.map(id => ({ t: `Turn in: ${QUESTS[id].title}`, do: g => g.completeQuest(id), next: 'guild' })),
      ...open.map(id => ({ t: `Take contract: ${QUESTS[id].title}`, do: g => g.startQuest(id, 0), next: 'guild' })),
      ...(open.length || ready.length ? [] : [{ t: 'Any more work?', next: () => ({ text: '"Not today. Try the fighting pit, or the wider realm — there is always trouble out there."', options: [bye()] }) }]),
      bye('Later.') ] };
  },
  pitmaster: g => {
    const tier = g.flag('pitTier') || 0;
    return { text: tier ? `"Back for more, champion? Tier ${tier + 1} pays better — and bleeds more."` : '"Welcome to the Pit! Three rounds. Fists, steel, whatever you like. Win and the crowd pays you. Lose and the crowd pays to watch."', options: [
      { t: tier ? `Fight tier ${tier + 1} (entry 10 gold)` : 'I will fight. (entry 10 gold)', if: g => g.gold >= 10, do: g => { g.pay(10); g.startArena(); }, end: true },
      { t: 'Tips?', next: () => ({ text: '"Watch for the blue spark over a fighter\'s head — that is them swinging. Block right then and you will counter them flat. Keep your combo going and the crowd goes wild."', options: [bye('Got it.')] }) },
      bye('Not now.') ] };
  },
  stable: g => ({ text: `"Horses! Fast ones, slow ones, ones that bite." ${g.horseText()}`, options: [
    ...Object.entries(HORSES).filter(([k]) => !g.ownsBreed(k)).map(([k, h]) => ({ t: `Buy the ${h.name} — ${h.price} gold (${h.text})`, if: g => g.gold >= h.price, do: g => { g.pay(h.price); g.buyBreed(k); }, end: true })),
    ...g.ownedBreeds().map(k => ({ t: `Ride the ${HORSES[k].name} today`, do: g => g.pickHorse(k), end: true })),
    ...g.ownedBreeds().filter(k => g.ownedBreeds().length > 1).map(k => ({ t: `Sell the ${HORSES[k].name} (${Math.floor(HORSES[k].price / 2)} gold)`, do: g => g.sellBreed(k), next: 'stable' })),
    bye('Just looking.') ] }),
  bertram: g => {
    const s = g.step('bertram');
    if (s === 0) return { text: '"Oh thank the gods — a person! I came out for timber and the wolves came out for me. They\'re still out there. Listen!"', options: [{ t: 'Stay behind me.', do: g => g.bertramWolves(), end: true }] };
    if (s === 2) return { text: '"You... you actually did it. I am going home and I am never cutting another tree. Tell the Guild I owe you a drink. Several."', options: [{ t: 'Get home safe.', do: g => g.setStep('bertram', 3), end: true }] };
    return { text: '"Are they gone? Are they gone?"', options: [bye('Not yet.')] };
  },
});
