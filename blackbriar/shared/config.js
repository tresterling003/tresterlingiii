// Tuning values for AFTER HOURS: BLACKBRIAR HIGH. Shared by the server, the in-browser solo sim, and the client.
export const CONFIG = {
  saveVersion: 2,
  maxPlayers: 4,
  // shift: 10:00 PM -> 4:00 AM (360 game minutes). shiftSeconds = real seconds for that span.
  shiftSeconds: 18 * 60,
  peacefulSeconds: 240,          // the Monitor does not hunt during the first part of the first shift
  lockdownGrace: 25,             // seconds everyone must be safe after 4:00 before the shift ends
  // player
  walkSpeed: 2.8, sprintSpeed: 5.0, crouchSpeed: 1.4, playerRadius: 0.3, eyeHeight: 1.62, crouchEye: 1.05,
  // vacuum (level 0 / 1 / 2 of the Suction Motor upgrade)
  vacuum: {
    reach: [2.2, 3.2, 4.0],         // metres from the intake that debris starts to move
    accel: [9, 13.5, 18],           // m/s^2 pull at the intake
    coneDeg: [34, 38, 42],          // half-angle of the suction cone
    bag: [300, 500, 900],           // bag capacity by Bigger Bag level
    noise: [13, 8.5],               // hearing radius by Quiet Motor level
    filmRadius: [0.3, 0.48],        // dust film cleared under the intake (m), by Wide Nozzle level
    wideCone: 12,                   // extra cone degrees with the Wide Nozzle
  },
  mop: { reach: 2.3, radius: [0.32, 0.44], strength: 255, capacity: [48000, 96000], smear: 70 },
  cart: { speed: 0.88 },
  roomba: { speed: 0.42, radius: 0.18, bag: 250, pickup: 0.24, noise: 4 },
  flashlight: { range: [16, 24], angle: [0.42, 0.5] },
  pay: { piece: 0.04, coin: 0.25, mudCell: 0.025, dustCell: 0.004 },
  roomBonus: { hall: 20, class: 15, service: 10, closet: 3, lcorr: 8, gym: 30, lockers: 15, pool: 25, cafe: 20 },
  failPenalty: 10,
  lockdownCatchPenalty: 25,
  skills: {
    suction1: { cat: 'Vacuum', name: 'Suction Motor I', cost: 40, needs: null, desc: 'Reach 2.2 m -> 3.2 m, pull +50%.' },
    suction2: { cat: 'Vacuum', name: 'Suction Motor II', cost: 120, needs: 'suction1', desc: 'Reach 3.2 m -> 4.0 m, pull +33%.' },
    wide1: { cat: 'Vacuum', name: 'Wide Nozzle', cost: 70, needs: null, desc: 'Suction cone +12 degrees; dust lifted 30 cm -> 48 cm wide.' },
    bag1: { cat: 'Vacuum', name: 'Bigger Bag', cost: 50, needs: null, desc: 'Bag 300 -> 500 pieces.' },
    bag2: { cat: 'Vacuum', name: 'Industrial Bag', cost: 140, needs: 'bag1', desc: 'Bag 500 -> 900 pieces.' },
    quiet1: { cat: 'Vacuum', name: 'Quiet Motor', cost: 90, needs: null, desc: 'Vacuum heard from 13 m -> 8.5 m.' },
    mop1: { cat: 'Mop', name: 'Wide Mop Head', cost: 45, needs: null, desc: 'Mop head 64 cm -> 88 cm wide.' },
    mop2: { cat: 'Mop', name: 'Super-Absorbent Strands', cost: 60, needs: null, desc: 'Mop holds twice as much dirt before it smears.' },
    light1: { cat: 'Gear', name: 'Brighter Flashlight', cost: 35, needs: null, desc: 'Beam 16 m -> 24 m, wider.' },
    shoes1: { cat: 'Gear', name: 'Gel Work Boots', cost: 55, needs: null, desc: 'Walk and sprint 15% faster, quieter steps.' },
    roomba1: { cat: 'Robots', name: 'Robot Vacuum', cost: 150, needs: null, item: true, desc: 'Carry it to a room, set it down, it cleans on its own (bag 250). Empty it when it beeps.' },
    roomba2: { cat: 'Robots', name: 'Second Robot Vacuum', cost: 220, needs: 'roomba1', item: true, desc: 'Another one. Two rooms at once.' },
  },
  // the Monitor
  monitor: {
    unseenSprint: 1.4, viewFreezeHalf: 0.72, // chase speed x1.4 (faster than your sprint) whenever nobody is looking; ~41 degrees either side of your view centre counts as looking
    speed: { patrol: 1.1, investigate: 1.7, stalk: 2.6, chase: 4.3, search: 1.4, retreat: 1.6, watch: 0 },
    lockdownSpeedMul: 1.15,
    viewRange: 17, viewHalfAngleDeg: 58, closeSense: 2.2, catchRadius: 1.05,
    hearMul: 1, lockdownHearMul: 1.5,
    loseSightSeconds: 3.2, searchSeconds: 14, retreatSeconds: [45, 75],
  },
  noise: { walk: 3.5, sprint: 9, crouch: 0, door: 7, empty: 6, bolt: 5, locker: 4 },
};
