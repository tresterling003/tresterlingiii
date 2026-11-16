// EMBERFALL — the quest as data: heroes, monsters, battles and every scene.
// Shared by the engine (rules) and the client (words on screen).
(function (root) {
'use strict';

const STATS = { might: 'Might', agility: 'Agility', mind: 'Mind', charm: 'Charm' };

// dmg is [dice, sides, bonus]
const CLASSES = {
  knight: { name: 'Knight', icon: '🛡️', hp: 32, armor: 15, stats: { might: 3, agility: 0, mind: 0, charm: 1 }, atk: 'might', dmg: [1, 8, 3], style: 'melee',
    ability: { id: 'guard', name: 'Shield Wall', text: 'Until your next turn, enemies must attack you — and you take half damage.' },
    ability2: { id: 'smite', name: 'Radiant Smite', text: 'An attack that adds 2d6 holy damage if it lands.', target: 'enemy' } },
  barbarian: { name: 'Barbarian', icon: '🪓', hp: 36, armor: 12, stats: { might: 4, agility: 1, mind: -1, charm: 0 }, atk: 'might', dmg: [1, 12, 3], style: 'melee',
    ability: { id: 'rage', name: 'Reckless Blow', text: 'A swing that cannot miss and deals double damage.', target: 'enemy' },
    ability2: { id: 'whirl', name: 'Whirlwind', text: 'Your axe hits every enemy for 1d10+3.' } },
  mage: { name: 'Mage', icon: '🔥', hp: 22, armor: 11, stats: { might: -1, agility: 1, mind: 4, charm: 1 }, atk: 'mind', dmg: [1, 8, 2], style: 'magic',
    ability: { id: 'fireball', name: 'Fireball', text: 'Burns every enemy for 2d6.' },
    ability2: { id: 'darts', name: 'Arcane Darts', text: 'Three bolts that never miss: 3d4+3 to one enemy.', target: 'enemy' } },
  rogue: { name: 'Rogue', icon: '🗡️', hp: 26, armor: 13, stats: { might: 0, agility: 4, mind: 1, charm: 2 }, atk: 'agility', dmg: [1, 6, 4], style: 'melee',
    ability: { id: 'backstab', name: 'Backstab', text: '+5 to hit, and triple damage dice if it lands.', target: 'enemy' },
    ability2: { id: 'cripple', name: 'Crippling Strike', text: 'An attack that, if it lands, makes the enemy lose its next turn.', target: 'enemy' } },
  warden: { name: 'Warden', icon: '🌿', hp: 26, armor: 12, stats: { might: 0, agility: 2, mind: 3, charm: 1 }, atk: 'agility', dmg: [1, 8, 2], style: 'ranged',
    ability: { id: 'mend', name: 'Mending Herbs', text: 'Heal an ally for 2d6+3. Brings a fallen ally back to their feet.', target: 'ally' },
    ability2: { id: 'volley', name: 'Volley', text: 'A rain of bolts on every enemy for 1d8+2.' } },
};
// A background is where your hero came from: one small gift to the whole party.
const BACKGROUNDS = {
  soldier: { name: 'Soldier', icon: '⚔️', text: '+5 maximum health for you.' },
  scholar: { name: 'Scholar', icon: '📜', text: 'The party starts with +1 Fate.' },
  merchant: { name: 'Merchant', icon: '🪙', text: 'The party starts with +30 gold.' },
  herbalist: { name: 'Herbalist', icon: '🧪', text: 'The party starts with +2 potions.' },
  outlander: { name: 'Outlander', icon: '🏹', text: 'You start with a Lucky Coin: +1 to your attack rolls.' },
};
const TINTS = ['', '#ff9c9c', '#ffe08a', '#a6e3a1', '#9ecbff', '#d2b0ff', '#8d8fa3'];
const BONUS_POINTS = 3; // ability points to spend at character creation (at most 2 on one ability)
// Magic items. Whoever finds one keeps it.
const ITEMS = {
  luckycoin: { name: 'Lucky Coin', icon: '🪙', text: '+1 to attack rolls', hit: 1 },
  emberbrand: { name: 'Emberbrand', icon: '🔥', text: '+2 damage on every hit', dmg: 2 },
  wardring: { name: 'Ring of Warding', icon: '💍', text: '+1 armor', armor: 1 },
  trollbelt: { name: 'Troll-hide Belt', icon: '🥋', text: '+6 maximum health', hp: 6 },
  wyvernscale: { name: 'Wyvern Scale', icon: '🐉', text: '+1 armor', armor: 1 },
  owlcharm: { name: 'Owl Charm', icon: '🦉', text: '+1 Mind', stat: { mind: 1 } },
  silvertongue: { name: 'Silver Tongue Ring', icon: '💬', text: '+1 Charm', stat: { charm: 1 } },
};
const CLASS_ORDER = ['knight', 'warden', 'mage', 'rogue', 'barbarian'];
const COMPANIONS = { knight: 'Ser Bram', warden: 'Isolde', mage: 'Osric', rogue: 'Finch', barbarian: 'Greta' };

const ENEMIES = {
  thug: { name: 'Bandit Thug', model: 'barbarian', tint: '#8a5a5a', hp: 34, armor: 12, hit: 6, dmg: [1, 8, 4] },
  archer: { name: 'Bandit Archer', model: 'warden', tint: '#8a5a5a', hp: 24, armor: 13, hit: 6, dmg: [1, 8, 3], style: 'ranged' },
  bones: { name: 'Restless Bones', model: 'bones', hp: 20, armor: 12, hit: 5, dmg: [1, 6, 3] },
  stalker: { name: 'Grave Stalker', model: 'stalker', hp: 34, armor: 14, hit: 7, dmg: [1, 8, 4] },
  guard: { name: 'Barrow Guard', model: 'guard', hp: 54, armor: 16, hit: 7, dmg: [1, 10, 5] },
  goblin: { name: 'Goblin', model: 'rogue', tint: '#7fcf6a', scale: 0.72, hp: 11, armor: 12, hit: 4, dmg: [1, 6, 1] },
  troll: { name: 'Toll Troll', model: 'barbarian', tint: '#6fae7a', scale: 1.7, hp: 58, armor: 12, hit: 6, dmg: [2, 6, 3] },
  king: { name: 'The Bone King', model: 'chanter', scale: 1.75, boss: true, hp: 150, armor: 16, hit: 10, dmg: [2, 8, 7], chill: [2, 6, 4], summon: ['bones', 'bones'] },
};

// mods: applied at the start of a battle when the party holds that flag
//   strike: damage to enemies ('boss' = boss only) · hurt: damage to every hero
//   remove: enemies that run · add: extra enemies · armor: change to enemy armor · stun: enemies lose round one
//   heal: extra health for the boss
const BATTLES = {
  bandits: { title: 'Ambush on the Old Road', enemies: ['thug', 'thug', 'archer'], next: 'captive', levelUp: true,
    mods: [
      { flag: 'distracted', hurt: [1, 4, 0], text: 'Arrows rain down before you can draw.' },
      { flag: 'flanked', strike: [1, 6, 1], text: 'You strike first, out of the ferns.' },
      { flag: 'scared', remove: 1, text: 'One bandit has already run for it.' },
    ],
    win: { text: 'The last bandit drops his blade and falls to his knees.', fx: { gold: 15 } } },
  goblins: { title: 'Goblin Raid', enemies: ['goblin', 'goblin', 'goblin', 'goblin'], next: '@road',
    win: { text: 'The goblins scatter, leaving their own stash behind.', fx: { gold: 25 } } },
  troll: { title: 'The Toll Troll', enemies: ['troll'], next: '@road',
    win: { text: 'The troll topples off its log. Under the log: a great many tolls, and a belt cut from the hide of a much bigger troll.', fx: { gold: 30, item: 'trollbelt' } } },
  bog: { title: 'The Drowned Dead', enemies: ['bones', 'bones', 'stalker'], next: '@road:camp',
    win: { text: 'The bones sink back under the black water. You wade on, quickly.', fx: {} } },
  hall: { title: 'The Hall of the Dead', enemies: ['bones', 'bones', 'guard', 'stalker'], next: 'corridor', levelUp: true,
    mods: [
      { flag: 'noisy', add: ['bones'], text: 'The noise woke one more.' },
      { flag: 'quiet', strike: [1, 6, 2], text: 'They never hear you coming.' },
    ],
    win: { text: 'Bones clatter still. On a skeletal finger, something glints: a ring that hums when you touch it.', fx: { potions: 1, item: 'wardring' } } },
  king: { title: 'The Bone King', enemies: ['bones', 'king', 'bones'], next: 'crown', boss: true,
    mods: [
      { flag: 'stunned', stun: true, text: 'The Bone King reels, lost in an old memory.' },
      { flag: 'opening', strike: [2, 6, 2], only: 'boss', text: 'You hit him while he is still gloating.' },
      { flag: 'behind', armor: -2, only: 'boss', text: 'From behind, his rusted mail has gaps.' },
      { flag: 'crack', armor: -2, only: 'boss', text: 'You aim for the crack above his left eye.' },
      { flag: 'ghostAlly', strike: [2, 6, 4], only: 'boss', text: 'The ghost knight charges through the wall and buries his sword in the King.' },
      { flag: 'sunstone', strike: [1, 6, 2], text: 'The sunstone blazes. The dead recoil from its light.' },
    ],
    win: { text: 'The Bone King falls apart like a dropped puzzle. The Ash Crown rolls to your feet, still burning.', fx: {} } },
};

// A choice either has a stat check (stat, dc, ok, fail) or just happens (auto).
// Outcome fx: flag, potions, gold, fate, item, heal (number or 'half'), dmgAll, dmgRoller.
// `cost` is paid up front. `quick` choices (shopping) apply at once and stay on the scene.
// next: '@road:<scene>' plays a random road encounter on the way to <scene>; '@road' carries on there.
// A choice (or an outcome) leads on with `next` (a scene) or `battle`.
const NODES = {
  elder: { set: 'village', title: 'Emberfall', npc: { model: 'mage', name: 'Elder Maren', tint: '#b9b3c9' },
    text: [
      'Dusk in Emberfall. The elder, Maren, waits for you by the fire with ash on her hands.',
      '“The Ash Crown is gone from the chapel,” she says. “And since it left, the dead of the old Barrow have begun to walk.”',
      '“Bring it back before the new moon and the village vault is yours. How will you spend your last hour here?”',
    ],
    choices: [
      { id: 'rumours', label: 'Buy a round and listen for rumours', stat: 'charm', dc: 11, next: 'store',
        ok: { text: 'A gravedigger leans in. “There\'s a second way into the Barrow — a drain behind the yew tree. Nobody guards a drain.”', fx: { flag: 'secret' } },
        fail: { text: 'You learn a great deal about turnip prices and nothing about the Barrow.', fx: {} } },
      { id: 'haggle', label: 'Haggle for supplies', stat: 'charm', dc: 13, next: 'store',
        ok: { text: 'The apothecary sighs and slides two extra potions across the counter.', fx: { potions: 2 } },
        fail: { text: '“Full price or nothing,” she says. You leave with one small bottle.', fx: { potions: 1 } } },
      { id: 'chapel', label: 'Light a candle in the empty chapel', next: 'store',
        auto: { text: 'The candle catches on the first try. Something old and kind is watching over you.', fx: { fate: 1 } } },
    ] },

  store: { set: 'village', npc: { model: 'warden', name: 'Trader', tint: '#d9c48a' },
    text: ['Before you leave, the trader waves you over. “Adventurers! Don\'t walk into a barrow with empty pockets. Potions, charms — everything a hero needs, at prices only slightly criminal.”'],
    choices: [
      { id: 'potion', label: 'Buy a healing potion', cost: { gold: 15 }, quick: true, auto: { text: '', fx: { potions: 1 } } },
      { id: 'charm', label: 'Buy a luck charm (+1 Fate)', cost: { gold: 25 }, quick: true, auto: { text: '', fx: { fate: 1 } } },
      { id: 'go', label: 'Set out for the Barrow', next: '@road:road', auto: { text: 'You shoulder your packs. Emberfall watches you go.', fx: {} } },
    ] },

  road: { set: 'road', title: 'The Old Road', npc: { model: 'rogue', name: 'Merchant', pose: 'Lie_Idle', tint: '#c9b28a' },
    text: [
      'An hour out, a cart lies on its side across the road. A merchant is slumped against the wheel, clutching his ribs.',
      'The birds have stopped singing. Somewhere in the trees, a bowstring creaks.',
    ],
    choices: [
      { id: 'help', label: 'Tend the merchant\'s wounds', stat: 'mind', dc: 12, battle: 'bandits',
        ok: { text: 'You bind his ribs. He presses a warm stone into your hand: “Sunstone. The dead can\'t stand it.” Then the bandits step out of the trees.', fx: { flag: 'sunstone' } },
        fail: { text: 'You are still fumbling with bandages when the first arrow lands.', fx: { flag: 'distracted' } } },
      { id: 'scout', label: 'Slip into the trees and flank them', stat: 'agility', dc: 12, battle: 'bandits',
        ok: { text: 'You find three bandits crouched in the ferns, watching the wrong way.', fx: { flag: 'flanked' } },
        fail: { text: 'A twig snaps. “There!” someone shouts.', fx: {} } },
      { id: 'shout', label: 'Call them out and stare them down', stat: 'charm', dc: 14, battle: 'bandits',
        ok: { text: '“We know you\'re there. We are in a hurry and a bad mood.” One bandit thinks better of it and runs.', fx: { flag: 'scared' } },
        fail: { text: 'Laughter from the trees. “Take everything but their boots!”', fx: {} } },
    ] },

  captive: { set: 'road', npc: { model: 'barbarian', name: 'Bandit', pose: 'Sit_Floor_Idle', tint: '#8a5a5a' },
    text: ['“Mercy! We only rob the road because the Barrow took our camp. I have seen what is down there.”'],
    choices: [
      { id: 'spare', label: 'Spare him and hear him out', next: 'fork',
        auto: { text: '“The long corridor past the first hall — step only on the cracked stones. The smooth ones bite.” He runs.', fx: { flag: 'trapKnown' } } },
      { id: 'loot', label: 'Take his purse and send him off', next: 'fork',
        auto: { text: 'Thirty gold. He does not argue.', fx: { gold: 30 } } },
      { id: 'press', label: 'Lean on him for both', stat: 'might', dc: 12, next: 'fork',
        ok: { text: 'He talks fast and empties his pockets faster: thirty gold, and a warning — in the long corridor, step only on the cracked stones.', fx: { flag: 'trapKnown', gold: 30 } },
        fail: { text: 'He throws dirt in your eyes and bolts into the trees. You get nothing.', fx: {} } },
    ] },

  fork: { set: 'road',
    text: ['By noon the road forks. Left, the Old Bridge crosses the gorge — quick, and in plain sight. Right, a track sinks into the Mirefen — slow, and nobody watches it.'],
    choices: [
      { id: 'bridge', label: 'Take the Old Bridge', next: 'bridge', auto: { text: 'You take the high road.', fx: {} } },
      { id: 'marsh', label: 'Take the Mirefen track', next: 'marsh', auto: { text: 'You take the low road.', fx: {} } },
    ] },

  bridge: { set: 'bridge', title: 'The Old Bridge',
    text: ['The bridge is rope, rot and optimism. The gorge below is too deep to hear the river.'],
    choices: [
      { id: 'careful', label: 'Cross one at a time, light on your feet', stat: 'agility', dc: 12, next: '@road:camp',
        ok: { text: 'The planks groan but hold. On the far side you find a traveller\'s cache under a cairn.', fx: { potions: 1 } },
        fail: { text: 'A plank gives way. {roller} catches the rope, but a satchel spins down into the dark.', fx: { dmgRoller: [1, 6, 0], potions: -1 } } },
      { id: 'brace', label: 'Haul the ropes tight and brace it', stat: 'might', dc: 12, next: '@road:camp',
        ok: { text: 'The bridge goes taut as a drum. You cross at a stroll, with daylight left to rest.', fx: { heal: 6 } },
        fail: { text: 'The anchor post tears loose and clips {roller} on its way into the gorge.', fx: { dmgRoller: [1, 8, 0] } } },
      { id: 'study', label: 'Study the knots before trusting them', stat: 'mind', dc: 11, next: '@road:camp',
        ok: { text: 'Three knots are false — someone meant this bridge to fall. You retie them and cross, wiser.', fx: { fate: 1 } },
        fail: { text: 'They look like knots. You cross anyway, and the sway turns every stomach.', fx: { dmgAll: [1, 3, 0] } } },
    ] },

  marsh: { set: 'marsh', title: 'The Mirefen',
    text: ['Fog, black water, and the smell of old leaves. Pale lights drift between the dead trees, always just ahead.'],
    choices: [
      { id: 'follow', label: 'Follow the lights', stat: 'mind', dc: 13,
        ok: { text: 'You read their pattern: they circle a drowned shrine. Its water is cold, clean, and kind.', fx: { heal: 'half', fate: 1 }, next: '@road:camp' },
        fail: { text: 'The lights go out all at once. The water around you starts to move.', fx: {}, battle: 'bog' } },
      { id: 'push', label: 'Ignore them and wade straight through', stat: 'might', dc: 11, next: '@road:camp',
        ok: { text: 'Waist-deep and miserable, but through by sunset.', fx: {} },
        fail: { text: 'Leeches. So many leeches.', fx: { dmgAll: [1, 4, 0] } } },
      { id: 'pole', label: 'Test each step with a pole', stat: 'agility', dc: 12, next: '@road:camp',
        ok: { text: 'Slow and sure. You even fish a sealed satchel out of the reeds.', fx: { potions: 1, gold: 15 } },
        fail: { text: '{roller} goes in to the neck and comes out missing a boot and some dignity.', fx: { dmgRoller: [1, 6, 0] } } },
    ] },

  camp: { set: 'gate', title: 'The Barrow Gate', npc: { model: 'warden', name: 'Peddler', tint: '#d9c48a' }, enter: { heal: 'half' },
    text: [
      'Night. The Barrow is a black hill with a stone door in it. A peddler has, improbably, set up shop outside.',
      '“Last stall before the afterlife,” she says cheerfully. You rest by her fire, and your wounds ease.',
    ],
    choices: [
      { id: 'buy', label: 'Buy two potions', cost: { gold: 20 }, next: 'door',
        auto: { text: '“Pleasure doing business with the soon-to-be-dead.”', fx: { potions: 2 } } },
      { id: 'supper', label: 'Share your supper and swap stories', stat: 'charm', dc: 11, next: 'door',
        ok: { text: '“The thing on the throne? Proud. Proud things flinch when you name what they were.” She tells you the Bone King\'s true name.', fx: { flag: 'truename' } },
        fail: { text: 'She has heard all your stories before, and told them better.', fx: {} } },
      { id: 'watch', label: 'Keep watch and sharpen blades', next: 'door',
        auto: { text: 'A quiet night. Edges keen, nerves steady.', fx: { fate: 1 } } },
    ] },

  door: { set: 'gate',
    text: ['The stone door is carved with a ring of runes around a keyhole shaped like an open mouth.'],
    choices: [
      { id: 'runes', label: 'Read the runes', next: 'riddle', auto: { text: 'You brush the moss away and read.', fx: {} } },
      { id: 'force', label: 'Put your shoulders to it', stat: 'might', dc: 14, next: 'hall',
        ok: { text: 'Stone grinds. The door gives.', fx: {} },
        fail: { text: 'It opens — with a boom that rolls down into the dark. Something down there heard.', fx: { flag: 'noisy' } } },
      { id: 'pick', label: 'Pick the lock', stat: 'agility', dc: 13, next: 'hall',
        ok: { text: 'Click. The mouth yawns open, silent as a held breath.', fx: { flag: 'quiet' } },
        fail: { text: 'The pick snaps and the mouth bites {roller}. The door swings open anyway, laughing dust.', fx: { dmgRoller: [1, 6, 0] } } },
      { id: 'drain', label: 'Take the drain behind the yew tree', need: 'secret', next: 'hall',
        auto: { text: 'It is exactly as unpleasant as it sounds. But you come up behind the first hall, unseen.', fx: { flag: 'quiet' } } },
    ] },

  riddle: { set: 'gate',
    text: ['The runes read: “I have cities but no houses, forests but no trees, rivers but no fish. Speak my name.”'],
    choices: [
      { id: 'dream', label: '“A dream.”', next: 'hall', auto: { text: 'The mouth snaps shut on empty air and the door crashes open. So much for subtle.', fx: { flag: 'noisy' } } },
      { id: 'map', label: '“A map.”', next: 'hall', auto: { text: 'The mouth closes, as if satisfied, and the door swings wide without a sound.', fx: { flag: 'quiet', fate: 1 } } },
      { id: 'grave', label: '“A graveyard.”', next: 'hall', auto: { text: 'Darts hiss from the runes. The door opens — loudly.', fx: { flag: 'noisy', dmgAll: [1, 3, 0] } } },
    ] },

  hall: { set: 'crypt', title: 'The Hall of the Dead', battle: 'hall',
    text: ['Rows of stone coffins. Half of them are open. Their owners are standing in the aisle, and they have noticed you.'] },

  corridor: { set: 'crypt', title: 'The Long Corridor',
    text: ['Beyond the hall the floor becomes a chessboard of stone — some slabs cracked, some smooth as mirrors. Small holes line the walls.'],
    choices: [
      { id: 'cracked', label: 'Step only on the cracked stones, as the bandit said', need: 'trapKnown', next: 'ghost',
        auto: { text: 'Not a single dart. In a niche the builders never meant anyone to reach, a single old coin lies waiting. It feels lucky.', fx: { fate: 1, item: 'luckycoin' } } },
      { id: 'disarm', label: 'Find the mechanism and jam it', stat: 'agility', dc: 13, next: 'ghost',
        ok: { text: 'A wedge in the right gear, and the whole corridor sighs to sleep. Behind the mechanism: an old coin that feels lucky.', fx: { item: 'luckycoin' } },
        fail: { text: 'It was not the right gear.', fx: { dmgAll: [1, 6, 0] } } },
      { id: 'sprint', label: 'Shields up and run', stat: 'might', dc: 12, next: 'ghost',
        ok: { text: 'Darts spark off steel. Through!', fx: {} },
        fail: { text: 'Most of the darts miss.', fx: { dmgAll: [1, 4, 1] } } },
      { id: 'sense', label: 'Feel for the pattern in the magic', stat: 'mind', dc: 12, next: 'ghost',
        ok: { text: 'The trap is a song with one wrong note. You hum the right one, and walk.', fx: { fate: 1 } },
        fail: { text: 'The trap hums back at {roller}.', fx: { dmgRoller: [2, 4, 0] } } },
    ] },

  ghost: { set: 'crypt', npc: { model: 'knight', name: 'The Bound Knight', ghost: true, pose: 'Sit_Floor_Idle' },
    text: [
      'In a side chapel a knight kneels in chains of pale light — a ghost, his tabard marked with Emberfall\'s flame.',
      '“I guarded the crown in life,” he whispers. “The King bound me here so I would have to watch him wear it.”',
    ],
    choices: [
      { id: 'free', label: 'Break the chains', stat: 'mind', dc: 13, next: 'throne',
        ok: { text: 'The chains ring like bells and fall. “Then I have one charge left in me,” he says, and fades toward the throne.', fx: { flag: 'ghostAlly' } },
        fail: { text: 'The chains flare. The ghost screams, and so do you.', fx: { dmgAll: [1, 4, 0] } } },
      { id: 'ask', label: 'Ask how the King can be beaten', stat: 'charm', dc: 12, next: 'throne',
        ok: { text: '“His crown is cracked above the left eye. Strike there.”', fx: { flag: 'crack' } },
        fail: { text: '“I… cannot remember. It has been so long.”', fx: {} } },
      { id: 'bless', label: 'Kneel and ask his blessing', next: 'throne',
        auto: { text: 'A cold hand on each brow. Your wounds close a little.', fx: { heal: 8 } } },
    ] },

  throne: { set: 'throne', title: 'The Throne of Ash', scene: 'boss', npc: { model: 'chanter', name: 'The Bone King', scale: 1.75, crown: true, pose: 'Sit_Chair_Idle', throne: true },
    text: [
      'The throne room is lit by green fire. On the throne sits a giant in rusted mail, the Ash Crown burning on his skull.',
      '“More thieves,” says the Bone King, rising. “Come, then. Kneel, or be knelt.”',
    ],
    choices: [
      { id: 'name', label: 'Speak his true name', need: 'truename', battle: 'king',
        auto: { text: '“Aldric Vane. You were a gravedigger.” The green fire gutters. For a moment he is only a frightened man.', fx: { flag: 'stunned' } } },
      { id: 'parley', label: 'Offer him a bargain', stat: 'charm', dc: 15, battle: 'king',
        ok: { text: 'He listens — a heartbeat too long.', fx: { flag: 'stunned' } },
        fail: { text: '“I do not bargain with meat.”', fx: {} } },
      { id: 'charge', label: 'Charge before he finishes rising', stat: 'might', dc: 12, battle: 'king',
        ok: { text: 'You are on him while he is still gloating.', fx: { flag: 'opening' } },
        fail: { text: 'He catches the charge on his arm and throws {roller} back across the hall.', fx: { dmgRoller: [1, 8, 0] } } },
      { id: 'shadows', label: 'Circle through the shadows of the pillars', stat: 'agility', dc: 13, battle: 'king',
        ok: { text: 'By the time he looks for you, you are behind him.', fx: { flag: 'behind' } },
        fail: { text: 'Green fire flares. No shadows left to hide in.', fx: {} } },
    ] },

  crown: { set: 'throne', prop: 'crown',
    text: ['The crown is warm. It whispers that you would make a far better ruler than a gravedigger did.'],
    choices: [
      { id: 'smash', label: 'Smash it on the throne', next: 'endAshes', auto: { text: 'You raise it high.', fx: {} } },
      { id: 'carry', label: 'Carry it home to the chapel', next: 'endHome', auto: { text: 'You wrap it in a cloak and do not look at it.', fx: {} } },
      { id: 'wear', label: 'Put it on', stat: 'mind', dc: 16,
        ok: { text: 'The whispers break against {roller}\'s will like waves on a cliff.', fx: {}, next: 'endSovereign' },
        fail: { text: 'The whispers were right, of course. They always are.', fx: {}, next: 'endKing' } },
    ] },


  // ---- road encounters: one is drawn at random on each stretch of road ----
  evTroll: { trail: true, set: 'road', title: 'A Toll Troll', npc: { model: 'barbarian', name: 'Toll Troll', tint: '#6fae7a', scale: 1.7, pose: 'Sit_Floor_Idle' },
    text: ['A troll the size of a haystack sits on a log across the road. “Toll,” it rumbles. “Ten gold. Or a riddle. Or your legs.”'],
    choices: [
      { id: 'pay', label: 'Pay the toll', cost: { gold: 10 }, next: '@road', auto: { text: 'It bites each coin, nods, and rolls the log aside with one finger.', fx: {} } },
      { id: 'riddle', label: 'Trade riddles with it', stat: 'mind', dc: 12, next: '@road',
        ok: { text: 'Your riddle stumps it. It laughs like a landslide and hands you a river-stone charm for luck.', fx: { fate: 1 } },
        fail: { text: 'Its riddle stumps you. A deal is a deal: it helps itself to your purse.', fx: { gold: -15 } } },
      { id: 'fight', label: 'Draw steel', battle: 'troll', auto: { text: '“Legs it is,” says the troll, standing up. And up.', fx: {} } },
    ] },
  evGoblins: { trail: true, set: 'road', title: 'Goblins!', npc: { model: 'rogue', name: 'Goblin', tint: '#7fcf6a', scale: 0.72 },
    text: ['You wake to rustling. Small green hands are in your packs, and four pairs of yellow eyes are very surprised to see yours.'],
    choices: [
      { id: 'chase', label: 'Chase them down', stat: 'agility', dc: 12, next: '@road',
        ok: { text: 'You catch the slowest one by the ear. It buys its freedom with the gang\'s whole stash.', fx: { gold: 25 } },
        fail: { text: 'Goblins are quick. So is your coin purse, apparently.', fx: { gold: -10 } } },
      { id: 'deal', label: 'Offer them a deal', stat: 'charm', dc: 12, next: '@road',
        ok: { text: 'Goblins love a deal. They trade you a stolen potion for a button they find fascinating.', fx: { potions: 1 } },
        fail: { text: 'Goblins love a deal. You discover later that you paid for your own boots.', fx: { gold: -10 } } },
      { id: 'fight', label: 'Teach them a lesson', battle: 'goblins', auto: { text: 'The goblins shriek, and pull out an alarming number of small knives.', fx: {} } },
    ] },
  evWyvern: { trail: true, set: 'meadow', title: 'Wings Overhead', sky: 'wyvern',
    text: ['A shadow crosses the sun, and then crosses it again. A wyvern is circling, and it has noticed how slowly you walk.'],
    choices: [
      { id: 'hide', label: 'Dive for cover', stat: 'agility', dc: 11, next: '@road',
        ok: { text: 'You lie in the bracken until the shadow slides away south.', fx: {} },
        fail: { text: 'It stoops, rakes {roller} across the back, and is gone.', fx: { dmgRoller: [1, 8, 0] } } },
      { id: 'climb', label: 'Climb to its nest while it hunts', stat: 'might', dc: 13, next: '@road',
        ok: { text: 'Among the bones in the nest {roller} finds a shed scale, hard as plate. It will turn a blade.', fx: { item: 'wyvernscale' } },
        fail: { text: 'It comes back early. {roller} leaves by the fast way: down.', fx: { dmgRoller: [1, 8, 0] } } },
      { id: 'shout', label: 'Stand tall and roar back', stat: 'charm', dc: 13, next: '@road',
        ok: { text: 'It decides you are too loud to be food. The bards will hear about this.', fx: { fate: 1 } },
        fail: { text: 'It decides {roller} is exactly loud enough to be food. You drive it off — eventually.', fx: { dmgRoller: [1, 8, 0] } } },
    ] },
  evWitch: { trail: true, set: 'marsh', title: 'The Hedge Witch', npc: { model: 'mage', name: 'Hedge Witch', tint: '#9fd89a' },
    text: ['A crooked cottage leans over a pond. A witch is stirring a pot outside it. “Travellers! I sell, I cook, and I see. Pick one.”'],
    choices: [
      { id: 'buy', label: 'Buy her potions', cost: { gold: 15 }, next: '@road', auto: { text: 'Two bottles. One of them is still warm.', fx: { potions: 2 } } },
      { id: 'stew', label: 'Try the stew', stat: 'charm', dc: 10, next: '@road',
        ok: { text: 'You compliment the seasoning. She beams, and ladles out seconds. You feel wonderful.', fx: { heal: 'half' } },
        fail: { text: '{roller} asks what is in it. She tells them. {roller} croaks like a frog for an hour.', fx: { dmgRoller: [1, 4, 0] } } },
      { id: 'see', label: 'Ask her to teach you to see', stat: 'mind', dc: 12, next: '@road',
        ok: { text: '“Sharp one.” She hangs a carved owl around {roller}\'s neck. The world looks a little clearer through it.', fx: { item: 'owlcharm' } },
        fail: { text: '“A crown that wears its wearer,” she says. “That is all you are ready to see.”', fx: {} } },
    ] },
  evUnicorn: { trail: true, set: 'meadow', title: 'The Glade',
    text: ['In a hollow full of white flowers something pale is drinking from a pool. It lifts its head. One horn, bright as a new nail.'],
    choices: [
      { id: 'gentle', label: 'Approach, slowly and gently', stat: 'charm', dc: 12, next: '@road',
        ok: { text: 'It lets {roller} lay a hand on its neck. Every ache you own goes quiet.', fx: { heal: 'half', fate: 1 } },
        fail: { text: 'It is gone between one blink and the next. The flowers close.', fx: {} } },
      { id: 'study', label: 'Watch from a distance and learn', stat: 'mind', dc: 11, next: '@road',
        ok: { text: 'Where its hooves touched, the grass has healed over old scars. You bottle water from the pool.', fx: { potions: 2 } },
        fail: { text: 'You blink, and it was never there.', fx: {} } },
      { id: 'pass', label: 'Bow, and pass by', next: '@road', auto: { text: 'Some things are better left unbothered. You feel oddly lucky.', fx: { fate: 1 } } },
    ] },
  evChest: { trail: true, set: 'road', title: 'The Ruined Watchtower',
    text: ['In the shell of an old watchtower sits a handsome iron-bound chest. No dust on it. No lock, either. It seems almost eager.'],
    choices: [
      { id: 'open', label: 'Throw it open', stat: 'might', dc: 13, next: '@road',
        ok: { text: 'The lid snaps at {roller} with a mouthful of teeth — and {roller} holds it open bare-handed until it spits out its last meal: a sword that burns.', fx: { item: 'emberbrand' } },
        fail: { text: 'The chest has teeth. The chest has a tongue. {roller} has a new respect for furniture.', fx: { dmgRoller: [2, 4, 0] } } },
      { id: 'check', label: 'Check it for traps first', stat: 'mind', dc: 12, next: '@road',
        ok: { text: 'It is breathing. You toss it a boot; while it chews, you reach in the back and take the burning sword it was sitting on.', fx: { item: 'emberbrand' } },
        fail: { text: 'No traps that you can see. Unfortunately, the trap is the chest.', fx: { dmgRoller: [1, 6, 0] } } },
      { id: 'leave', label: 'Nothing good is ever that eager', next: '@road', auto: { text: 'You back away. The chest sighs, distinctly.', fx: {} } },
    ] },
  evBard: { trail: true, set: 'meadow', title: 'A Wandering Bard', npc: { model: 'rogue', name: 'Bard', tint: '#ffb0d0' },
    text: ['A bard sits on a milestone, tuning a lute. “Heroes! Splendid. I need a last verse, and you need an audience. Impress me.”'],
    choices: [
      { id: 'tale', label: 'Tell him a tale of your deeds', stat: 'charm', dc: 12, next: '@road',
        ok: { text: 'By the end he is weeping. He presses a silver ring on {roller}: “You talk better than I sing.”', fx: { item: 'silvertongue' } },
        fail: { text: 'He nods politely. “I will say you were tall,” he decides.', fx: {} } },
      { id: 'feat', label: 'Show him a feat of strength', stat: 'might', dc: 12, next: '@road',
        ok: { text: '{roller} lifts the milestone, bard and all. The song he writes will follow you for years.', fx: { fate: 1, gold: 10 } },
        fail: { text: 'The milestone does not move. The bard writes that down too.', fx: {} } },
      { id: 'coin', label: 'Toss him a coin for a marching song', cost: { gold: 5 }, next: '@road', auto: { text: 'It is a good song. The miles go easier, and so do the bruises.', fx: { heal: 6 } } },
    ] },

  endAshes: { ending: 'good', set: 'throne', title: 'The Crown Breaks',
    text: ['It shatters into cold cinders. All through the Barrow, bones lie down with a sound like rain.', 'Emberfall sleeps soundly. The vault turns out to be mostly turnips. You regret nothing.'] },
  endHome: { ending: 'good', set: 'village', title: 'The Crown Returns',
    text: ['You set it back on the chapel altar at dawn. Maren counts every hero twice, then counts the vault into your hands.', 'Some nights the crown still glows. That is a problem for other heroes.'] },
  endSovereign: { ending: 'good', set: 'throne', title: 'The Ash Sovereign', crowned: true,
    text: ['The dead of the Barrow kneel — to {roller}.', 'Emberfall has a new protector. The villagers are fairly sure that is good news.'] },
  endKing: { ending: 'dark', set: 'throne', title: 'Long Live the King', crowned: true,
    text: ['{roller} sits down on the throne. The green fire leaps up to greet them.', 'The rest of the party backs slowly toward the door.'] },
};

const api = { BACKGROUNDS, TINTS, BONUS_POINTS, ITEMS, STATS, CLASSES, CLASS_ORDER, COMPANIONS, ENEMIES, BATTLES, NODES, START: 'elder' };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.EmberfallData = api;
})(typeof self !== 'undefined' ? self : this);
