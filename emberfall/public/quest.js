// EMBERFALL — the quest as data: heroes, monsters, battles and every scene.
// Shared by the engine (rules) and the client (words on screen).
(function (root) {
'use strict';

const STATS = { might: 'Might', agility: 'Agility', mind: 'Mind', charm: 'Charm' };

// dmg is [dice, sides, bonus]
const CLASSES = {
  knight: { name: 'Knight', icon: '🛡️', hp: 32, armor: 15, stats: { might: 3, agility: 0, mind: 0, charm: 1 }, atk: 'might', dmg: [1, 8, 3], style: 'melee',
    ability: { id: 'guard', name: 'Shield Wall', text: 'Until your next turn, enemies must attack you — and you take half damage.' } },
  barbarian: { name: 'Barbarian', icon: '🪓', hp: 36, armor: 12, stats: { might: 4, agility: 1, mind: -1, charm: 0 }, atk: 'might', dmg: [1, 12, 3], style: 'melee',
    ability: { id: 'rage', name: 'Reckless Blow', text: 'A swing that cannot miss and deals double damage.', target: 'enemy' } },
  mage: { name: 'Mage', icon: '🔥', hp: 22, armor: 11, stats: { might: -1, agility: 1, mind: 4, charm: 1 }, atk: 'mind', dmg: [1, 8, 2], style: 'magic',
    ability: { id: 'fireball', name: 'Fireball', text: 'Burns every enemy for 2d6.' } },
  rogue: { name: 'Rogue', icon: '🗡️', hp: 26, armor: 13, stats: { might: 0, agility: 4, mind: 1, charm: 2 }, atk: 'agility', dmg: [1, 6, 4], style: 'melee',
    ability: { id: 'backstab', name: 'Backstab', text: '+5 to hit, and triple damage dice if it lands.', target: 'enemy' } },
  warden: { name: 'Warden', icon: '🌿', hp: 26, armor: 12, stats: { might: 0, agility: 2, mind: 3, charm: 1 }, atk: 'agility', dmg: [1, 8, 2], style: 'ranged',
    ability: { id: 'mend', name: 'Mending Herbs', text: 'Heal an ally for 2d6+3. Brings a fallen ally back to their feet.', target: 'ally' } },
};
// A background is where your hero came from: one small gift to the whole party.
const BACKGROUNDS = {
  soldier: { name: 'Soldier', icon: '⚔️', text: '+5 maximum health for you.' },
  scholar: { name: 'Scholar', icon: '📜', text: 'The party starts with +1 Fate.' },
  merchant: { name: 'Merchant', icon: '🪙', text: 'The party starts with +30 gold.' },
  herbalist: { name: 'Herbalist', icon: '🧪', text: 'The party starts with +2 potions.' },
  hunter: { name: 'Hunter', icon: '🏹', text: 'The party starts with +8 rations.' },
};
const TINTS = ['', '#ff9c9c', '#ffe08a', '#a6e3a1', '#9ecbff', '#d2b0ff', '#8d8fa3'];
const BONUS_POINTS = 3; // ability points to spend at character creation (at most 2 on one ability)
const MOON_DAY = 8;     // arrive after this day and the Bone King is at full power
const CLASS_ORDER = ['knight', 'warden', 'mage', 'rogue', 'barbarian'];
const COMPANIONS = { knight: 'Ser Bram', warden: 'Isolde', mage: 'Osric', rogue: 'Finch', barbarian: 'Greta' };

const ENEMIES = {
  thug: { name: 'Bandit Thug', model: 'barbarian', tint: '#8a5a5a', hp: 28, armor: 12, hit: 5, dmg: [1, 8, 3] },
  archer: { name: 'Bandit Archer', model: 'warden', tint: '#8a5a5a', hp: 16, armor: 13, hit: 5, dmg: [1, 8, 1], style: 'ranged' },
  bones: { name: 'Restless Bones', model: 'bones', hp: 16, armor: 11, hit: 5, dmg: [1, 6, 3] },
  stalker: { name: 'Grave Stalker', model: 'stalker', hp: 26, armor: 13, hit: 6, dmg: [1, 8, 3] },
  guard: { name: 'Barrow Guard', model: 'guard', hp: 40, armor: 15, hit: 6, dmg: [1, 10, 4] },
  goblin: { name: 'Goblin', model: 'rogue', tint: '#7fcf6a', scale: 0.72, hp: 11, armor: 12, hit: 4, dmg: [1, 6, 1] },
  troll: { name: 'Toll Troll', model: 'barbarian', tint: '#6fae7a', scale: 1.7, hp: 58, armor: 12, hit: 6, dmg: [2, 6, 3] },
  king: { name: 'The Bone King', model: 'chanter', scale: 1.75, boss: true, hp: 86, armor: 15, hit: 7, dmg: [2, 6, 5], chill: [2, 4, 2], summon: ['bones', 'bones'] },
};

// mods: applied at the start of a battle when the party holds that flag
//   strike: damage to enemies ('boss' = boss only) · hurt: damage to every hero
//   remove: enemies that run · add: extra enemies · armor: change to enemy armor · stun: enemies lose round one
//   heal: extra health for the boss
const BATTLES = {
  bandits: { title: 'Ambush on the Old Road', enemies: ['thug', 'thug', 'archer'], next: 'captive',
    mods: [
      { flag: 'distracted', hurt: [1, 4, 0], text: 'Arrows rain down before you can draw.' },
      { flag: 'flanked', strike: [1, 6, 1], text: 'You strike first, out of the ferns.' },
      { flag: 'scared', remove: 1, text: 'One bandit has already run for it.' },
    ],
    win: { text: 'The last bandit drops his blade and falls to his knees.', fx: { gold: 15 } } },
  goblins: { title: 'Goblin Raid', enemies: ['goblin', 'goblin', 'goblin', 'goblin'], next: '@trail',
    win: { text: 'The goblins scatter, leaving their own stash behind.', fx: { rations: 4, gold: 10 } } },
  troll: { title: 'The Toll Troll', enemies: ['troll'], next: '@trail',
    win: { text: 'The troll topples off its log. Under the log: a great many tolls.', fx: { gold: 30 } } },
  bog: { title: 'The Drowned Dead', enemies: ['bones', 'bones', 'stalker'], next: 'leg2',
    win: { text: 'The bones sink back under the black water. You wade on, quickly.', fx: {} } },
  hall: { title: 'The Hall of the Dead', enemies: ['bones', 'bones', 'guard', 'stalker'], next: 'corridor',
    mods: [
      { flag: 'noisy', add: ['bones'], text: 'The noise woke one more.' },
      { flag: 'quiet', strike: [1, 6, 2], text: 'They never hear you coming.' },
    ],
    win: { text: 'Bones clatter still. In an open coffin you find one dusty, unopened potion.', fx: { potions: 1 } } },
  king: { title: 'The Bone King', enemies: ['bones', 'king', 'bones'], next: 'crown', boss: true,
    mods: [
      { flag: 'stunned', stun: true, text: 'The Bone King reels, lost in an old memory.' },
      { flag: 'opening', strike: [2, 6, 2], only: 'boss', text: 'You hit him while he is still gloating.' },
      { flag: 'behind', armor: -2, only: 'boss', text: 'From behind, his rusted mail has gaps.' },
      { flag: 'crack', armor: -2, only: 'boss', text: 'You aim for the crack above his left eye.' },
      { flag: 'ghostAlly', strike: [2, 6, 4], only: 'boss', text: 'The ghost knight charges through the wall and buries his sword in the King.' },
      { flag: 'sunstone', strike: [1, 6, 2], text: 'The sunstone blazes. The dead recoil from its light.' },
      { flag: 'newmoon', add: ['stalker'], heal: 25, text: 'The new moon has risen. You are too late — the Bone King is at his full power.' },
    ],
    win: { text: 'The Bone King falls apart like a dropped puzzle. The Ash Crown rolls to your feet, still burning.', fx: {} } },
};

// A choice either has a stat check (stat, dc, ok, fail) or just happens (auto).
// Outcome fx: flag, potions, gold, rations, fate, heal (number or 'half'), dmgAll, dmgRoller,
// days (time lost), leg (days of travel to start). `cost` is paid up front. `quick` choices
// (shopping) apply at once and stay on the scene. next: '@trail' means "carry on travelling".
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
    text: ['Before the road, the trader\'s stall. “The Barrow is the better part of a week away,” she says. “Four heroes eat four rations a day. Hungry heroes get hurt.”'],
    choices: [
      { id: 'food', label: 'Buy 8 rations', cost: { gold: 10 }, quick: true, auto: { text: '', fx: { rations: 8 } } },
      { id: 'potion', label: 'Buy a healing potion', cost: { gold: 15 }, quick: true, auto: { text: '', fx: { potions: 1 } } },
      { id: 'go', label: 'Set out on the trail', next: 'leg1', auto: { text: 'You shoulder your packs. Emberfall watches you go.', fx: {} } },
    ] },

  leg1: { set: 'village', pace: true, dest: 'road',
    text: ['Forest lies between Emberfall and the Old Road crossing. Every day on the trail costs food and brings whatever the trail brings. How hard will you march?'],
    choices: [
      { id: 'forced', label: 'Forced march — 1 day, but everyone is worn down', next: '@trail', auto: { text: 'You march through the night. Feet blister. Tempers fray.', fx: { leg: 1, dmgAll: [1, 4, 0] } } },
      { id: 'steady', label: 'Steady pace — 2 days', next: '@trail', auto: { text: 'A sensible pace, a song or two, and an eye on the trees.', fx: { leg: 2 } } },
      { id: 'careful', label: 'Careful pace — 3 days, foraging and resting as you go', next: '@trail', auto: { text: 'You take it slow, filling your packs from the hedgerows.', fx: { leg: 3, forage: true } } },
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

  bridge: { set: 'bridge', title: 'The Old Bridge', enter: { days: 1 },
    text: ['The bridge is rope, rot and optimism. The gorge below is too deep to hear the river.'],
    choices: [
      { id: 'careful', label: 'Cross one at a time, light on your feet', stat: 'agility', dc: 12, next: 'leg2',
        ok: { text: 'The planks groan but hold. On the far side you find a traveller\'s cache under a cairn.', fx: { potions: 1 } },
        fail: { text: 'A plank gives way. {roller} catches the rope, but a satchel spins down into the dark.', fx: { dmgRoller: [1, 6, 0], potions: -1 } } },
      { id: 'brace', label: 'Haul the ropes tight and brace it', stat: 'might', dc: 12, next: 'leg2',
        ok: { text: 'The bridge goes taut as a drum. You cross at a stroll, with daylight left to rest.', fx: { heal: 6 } },
        fail: { text: 'The anchor post tears loose and clips {roller} on its way into the gorge.', fx: { dmgRoller: [1, 8, 0] } } },
      { id: 'study', label: 'Study the knots before trusting them', stat: 'mind', dc: 11, next: 'leg2',
        ok: { text: 'Three knots are false — someone meant this bridge to fall. You retie them and cross, wiser.', fx: { fate: 1 } },
        fail: { text: 'They look like knots. You cross anyway, and the sway turns every stomach.', fx: { dmgAll: [1, 3, 0] } } },
    ] },

  marsh: { set: 'marsh', title: 'The Mirefen', enter: { days: 1 },
    text: ['Fog, black water, and the smell of old leaves. Pale lights drift between the dead trees, always just ahead.'],
    choices: [
      { id: 'follow', label: 'Follow the lights', stat: 'mind', dc: 13,
        ok: { text: 'You read their pattern: they circle a drowned shrine. Its water is cold, clean, and kind.', fx: { heal: 'half', fate: 1 }, next: 'leg2' },
        fail: { text: 'The lights go out all at once. The water around you starts to move.', fx: {}, battle: 'bog' } },
      { id: 'push', label: 'Ignore them and wade straight through', stat: 'might', dc: 11, next: 'leg2',
        ok: { text: 'Waist-deep and miserable, but through by sunset.', fx: {} },
        fail: { text: 'Leeches. So many leeches.', fx: { dmgAll: [1, 4, 0] } } },
      { id: 'pole', label: 'Test each step with a pole', stat: 'agility', dc: 12, next: 'leg2',
        ok: { text: 'Slow and sure. You even fish a sealed satchel out of the reeds.', fx: { potions: 1, gold: 10 } },
        fail: { text: '{roller} goes in to the neck and comes out missing a boot and some dignity.', fx: { dmgRoller: [1, 6, 0] } } },
    ] },

  leg2: { set: 'meadow', pace: true, dest: 'camp',
    text: ['Open hills now, and on the horizon a black hump of earth: the Barrow. The moon is thinning. How hard will you march?'],
    choices: [
      { id: 'forced', label: 'Forced march — 1 day, but everyone is worn down', next: '@trail', auto: { text: 'You run the ridgeline until your lungs burn.', fx: { leg: 1, dmgAll: [1, 4, 0] } } },
      { id: 'steady', label: 'Steady pace — 2 days', next: '@trail', auto: { text: 'One foot, then the other.', fx: { leg: 2 } } },
      { id: 'careful', label: 'Careful pace — 3 days, foraging and resting as you go', next: '@trail', auto: { text: 'You keep to the hollows and travel well fed.', fx: { leg: 3, forage: true } } },
    ] },

  camp: { set: 'gate', title: 'The Barrow Gate', npc: { model: 'warden', name: 'Peddler', tint: '#d9c48a' }, enter: { days: 1, heal: 'half' },
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
        auto: { text: 'Not a single dart. You even find a niche the builders never meant anyone to reach.', fx: { fate: 1, potions: 1 } } },
      { id: 'disarm', label: 'Find the mechanism and jam it', stat: 'agility', dc: 13, next: 'ghost',
        ok: { text: 'A wedge in the right gear, and the whole corridor sighs to sleep.', fx: { fate: 1 } },
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


  // ---- trail events: drawn at random, one per day on the trail ----
  evTroll: { trail: true, set: 'road', npc: { model: 'barbarian', name: 'Toll Troll', tint: '#6fae7a', scale: 1.7, pose: 'Sit_Floor_Idle' },
    text: ['A troll the size of a haystack sits on a log across the road. “Toll,” it rumbles. “Ten gold. Or a riddle. Or your legs.”'],
    choices: [
      { id: 'pay', label: 'Pay the toll', cost: { gold: 10 }, next: '@trail', auto: { text: 'It bites each coin, nods, and rolls the log aside with one finger.', fx: {} } },
      { id: 'riddle', label: 'Trade riddles with it', stat: 'mind', dc: 12, next: '@trail',
        ok: { text: 'Your riddle stumps it. It laughs like a landslide and hands you a river-stone charm for luck.', fx: { fate: 1 } },
        fail: { text: 'Its riddle stumps you. A deal is a deal: it helps itself to your food sack.', fx: { rations: -6 } } },
      { id: 'fight', label: 'Draw steel', battle: 'troll', auto: { text: '“Legs it is,” says the troll, standing up. And up.', fx: {} } },
    ] },
  evGoblins: { trail: true, set: 'road', npc: { model: 'rogue', name: 'Goblin', tint: '#7fcf6a', scale: 0.72 },
    text: ['You wake to rustling. Small green hands are in your packs, and four pairs of yellow eyes are very surprised to see yours.'],
    choices: [
      { id: 'chase', label: 'Chase them down', stat: 'agility', dc: 12, next: '@trail',
        ok: { text: 'You catch the slowest one by the ear. It buys its freedom with the gang\'s whole stash.', fx: { gold: 15, rations: 3 } },
        fail: { text: 'Goblins are quick. So is your breakfast, apparently.', fx: { rations: -5 } } },
      { id: 'deal', label: 'Offer them a deal', stat: 'charm', dc: 12, next: '@trail',
        ok: { text: 'Goblins love a deal. They trade you smoked eel for a button they find fascinating.', fx: { rations: 5 } },
        fail: { text: 'Goblins love a deal. You discover later that you paid for your own boots.', fx: { gold: -10 } } },
      { id: 'fight', label: 'Teach them a lesson', battle: 'goblins', auto: { text: 'The goblins shriek, and pull out an alarming number of small knives.', fx: {} } },
    ] },
  evHunt: { trail: true, set: 'meadow',
    text: ['Deer tracks cross the trail, fresh. The hedgerows are heavy with berries, and with things that only look like berries.'],
    choices: [
      { id: 'hunt', label: 'Hunt', stat: 'agility', dc: 11, next: '@trail',
        ok: { text: 'One clean shot. Venison tonight, and for days after.', fx: { rations: 9 } },
        fail: { text: 'The deer hears you coming from a county away.', fx: {} } },
      { id: 'forage', label: 'Forage', stat: 'mind', dc: 10, next: '@trail',
        ok: { text: 'Mushrooms, nuts, wild onions. You know your hedgerows.', fx: { rations: 6 } },
        fail: { text: '{roller} was very sure about those mushrooms. {roller} was wrong.', fx: { dmgRoller: [1, 6, 0] } } },
      { id: 'on', label: 'No time — keep moving', next: '@trail', auto: { text: 'You leave the deer in peace.', fx: {} } },
    ] },
  evStorm: { trail: true, set: 'meadow',
    text: ['By afternoon the sky is the colour of slate. The first hailstone is the size of a hen\'s egg.'],
    choices: [
      { id: 'cave', label: 'Wait it out in a cave — lose a day', next: '@trail', auto: { text: 'Dry, safe, and bored. The storm blows itself out by morning.', fx: { days: 1 } } },
      { id: 'push', label: 'Heads down and push through', stat: 'might', dc: 12, next: '@trail',
        ok: { text: 'Soaked to the bone, but you have made your miles.', fx: {} },
        fail: { text: 'Hail hammers you flat, and rain gets into the food sacks.', fx: { dmgAll: [1, 4, 0], rations: -3 } } },
      { id: 'read', label: 'Read the wind for shelter', stat: 'mind', dc: 13, next: '@trail',
        ok: { text: 'The wind bends around a hollow oak big enough for all of you. Someone has left a blessing carved inside.', fx: { fate: 1 } },
        fail: { text: 'You read it wrong and walk straight into the worst of it.', fx: { dmgAll: [1, 3, 0] } } },
    ] },
  evWyvern: { trail: true, set: 'meadow', sky: 'wyvern',
    text: ['A shadow crosses the sun, and then crosses it again. A wyvern is circling, and it has noticed how slowly you walk.'],
    choices: [
      { id: 'hide', label: 'Dive for cover', stat: 'agility', dc: 11, next: '@trail',
        ok: { text: 'You lie in the bracken until the shadow slides away south.', fx: {} },
        fail: { text: 'It stoops, snatches a pack off {roller}\'s back, and is gone.', fx: { rations: -6 } } },
      { id: 'feed', label: 'Leave it a meal', cost: { rations: 4 }, next: '@trail',
        auto: { text: 'It lands, eats, and regards you with one gold eye. When it leaves, a single bright scale lies in the grass.', fx: { fate: 1 } } },
      { id: 'shout', label: 'Stand tall and roar back', stat: 'charm', dc: 13, next: '@trail',
        ok: { text: 'It decides you are too loud to be food.', fx: { fate: 1 } },
        fail: { text: 'It decides {roller} is exactly loud enough to be food. You drive it off — eventually.', fx: { dmgRoller: [1, 8, 0] } } },
    ] },
  evWitch: { trail: true, set: 'marsh', npc: { model: 'mage', name: 'Hedge Witch', tint: '#9fd89a' },
    text: ['A crooked cottage leans over a pond. A witch is stirring a pot outside it. “Travellers! I sell, I cook, and I see. Pick one.”'],
    choices: [
      { id: 'buy', label: 'Buy her potions', cost: { gold: 15 }, next: '@trail', auto: { text: 'Two bottles. One of them is still warm.', fx: { potions: 2 } } },
      { id: 'stew', label: 'Try the stew', stat: 'charm', dc: 10, next: '@trail',
        ok: { text: 'You compliment the seasoning. She beams, and ladles out seconds. You feel wonderful.', fx: { heal: 'half', rations: 2 } },
        fail: { text: '{roller} asks what is in it. She tells them. {roller} croaks like a frog for an hour.', fx: { dmgRoller: [1, 4, 0] } } },
      { id: 'see', label: 'Ask what she sees', next: '@trail', auto: { text: '“A crown that wears its wearer,” she says. “And luck, if you are polite to old women.”', fx: { fate: 1 } } },
    ] },
  evUnicorn: { trail: true, set: 'meadow', sky: 'glade',
    text: ['In a hollow full of white flowers something pale is drinking from a pool. It lifts its head. One horn, bright as a new nail.'],
    choices: [
      { id: 'gentle', label: 'Approach, slowly and gently', stat: 'charm', dc: 12, next: '@trail',
        ok: { text: 'It lets {roller} lay a hand on its neck. Every ache you own goes quiet.', fx: { heal: 'half', fate: 1 } },
        fail: { text: 'It is gone between one blink and the next. The flowers close.', fx: {} } },
      { id: 'gift', label: 'Leave an offering and go', cost: { rations: 2 }, next: '@trail', auto: { text: 'You leave apples by the pool. Behind you, something whickers, pleased.', fx: { fate: 1 } } },
      { id: 'pass', label: 'Pass by quietly', next: '@trail', auto: { text: 'Some things are better left unbothered.', fx: {} } },
    ] },
  evFever: { trail: true, set: 'road', enter: { dmgAll: [1, 3, 0] },
    text: ['Bad water. By noon the whole party is a delicate shade of green, and nobody wants to talk about it.'],
    choices: [
      { id: 'rest', label: 'Rest until it passes — lose a day', next: '@trail', auto: { text: 'A day of groaning under a tree. By evening you can face food again.', fx: { days: 1, heal: 6 } } },
      { id: 'brew', label: 'Brew a remedy', stat: 'mind', dc: 11, next: '@trail',
        ok: { text: 'Willow bark and mint. Foul, but it works.', fx: { heal: 6 } },
        fail: { text: 'The remedy is, if anything, worse than the water.', fx: {} } },
      { id: 'on', label: 'Grit your teeth and march', next: '@trail', auto: { text: 'You march. Greenly.', fx: {} } },
    ] },
  evTinker: { trail: true, set: 'road', npc: { model: 'warden', name: 'Tinker', tint: '#e0b07a' },
    text: ['A tinker\'s wagon sits in the ditch with a snapped axle. “I don\'t suppose,” she says, “any of you are strong? Or rich?”'],
    choices: [
      { id: 'lift', label: 'Lift the wagon while she fixes it', stat: 'might', dc: 11, next: '@trail',
        ok: { text: 'Up it goes. She pays you in sausages and a potion “that mostly works”.', fx: { rations: 6, potions: 1 } },
        fail: { text: 'Up it goes — and down again, on {roller}\'s foot.', fx: { dmgRoller: [1, 4, 0] } } },
      { id: 'buy', label: 'Buy food from her', cost: { gold: 10 }, next: '@trail', auto: { text: 'Hard cheese, harder bread. Both keep forever.', fx: { rations: 8 } } },
      { id: 'on', label: 'Wish her luck and walk on', next: '@trail', auto: { text: 'She waves, philosophically.', fx: {} } },
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

const api = { BACKGROUNDS, TINTS, BONUS_POINTS, MOON_DAY, STATS, CLASSES, CLASS_ORDER, COMPANIONS, ENEMIES, BATTLES, NODES, START: 'elder' };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.EmberfallData = api;
})(typeof self !== 'undefined' ? self : this);
