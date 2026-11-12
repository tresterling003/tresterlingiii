// Tuning values for AFTER HOURS: BLACKBRIAR HIGH. Shared by the server, the in-browser solo sim, and the client.
export const CONFIG = {
  saveVersion: 1,
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
    bag: [300, 500],                // bag capacity by Bigger Bag level
    noise: [13, 8.5],               // hearing radius by Quiet Motor level
    filmRadius: 0.28,               // dust film cleared under the intake (m)
  },
  mop: { reach: 2.3, radius: 0.24, strength: 150 },
  flashlight: { range: [16, 24], angle: [0.42, 0.5] },
  pay: { piece: 0.04, mudCell: 0.025, dustCell: 0.004 },
  roomBonus: { hall: 20, class: 15, service: 10, closet: 3 },
  failPenalty: 10,
  lockdownCatchPenalty: 25,
  skills: {
    suction1: { name: 'Suction Motor I', cost: 40, needs: null, desc: 'Reach 2.2 m -> 3.2 m, pull +50%.' },
    suction2: { name: 'Suction Motor II', cost: 120, needs: 'suction1', desc: 'Reach 3.2 m -> 4.0 m, pull +33%.' },
    bag1: { name: 'Bigger Bag', cost: 60, needs: null, desc: 'Bag 300 -> 500 pieces.' },
    quiet1: { name: 'Quiet Motor', cost: 90, needs: null, desc: 'Vacuum heard from 13 m -> 8.5 m.' },
    light1: { name: 'Brighter Flashlight', cost: 35, needs: null, desc: 'Beam 16 m -> 24 m, wider.' },
  },
  // the Monitor
  monitor: {
    speed: { patrol: 1.1, investigate: 1.7, stalk: 1.05, chase: 4.3, search: 1.4, retreat: 1.6, watch: 0 },
    lockdownSpeedMul: 1.15,
    viewRange: 17, viewHalfAngleDeg: 58, closeSense: 2.2, catchRadius: 1.05,
    hearMul: 1, lockdownHearMul: 1.5,
    loseSightSeconds: 3.2, searchSeconds: 14, retreatSeconds: [45, 75],
  },
  noise: { walk: 3.5, sprint: 9, crouch: 0, door: 7, empty: 6, bolt: 5, locker: 4 },
};
