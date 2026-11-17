// Every tunable number in one place. Distances are world pixels, times are seconds, speeds px/s.
// The rest of the game imports from here and hard-codes nothing it might want to tune.

/** Fixed simulation step: the loop accumulates real time and steps the world in 1/60 s slices. */
export const STEP = 1 / 60;
/** Frames slower than this (ms) count as slow; enough of them lower the spawn density. */
export const SLOW_FRAME_MS = 20;

export const WORLD = {
  seed: 1977,            // same seed, same city: screenshots and saves stay coherent
  tile: 72,              // one tile in pixels
  tiles: 60,             // the map is tiles x tiles
  period: 6,             // a road every 6 tiles ...
  roadTiles: 2,          // ... two tiles wide (one lane each way)
  sidewalk: 16,          // sidewalk strip inside each block edge
  beachCol: 50,          // tiles from here east are beach, then water
  waterCol: 53,
};
WORLD.size = WORLD.tile * WORLD.tiles;              // 4320 px
WORLD.lane = WORLD.tile / 2;                         // lane centre offset from road centre

export const CAMERA = {
  lerp: 0.12,            // fraction of the gap to the target closed each 60 Hz step; never snaps
  lookAhead: 0.32,       // seconds of velocity the camera leads by
  zoomFoot: 1.18,        // closer on foot
  zoomCar: 1.12,
  zoomFast: 0.9,         // zoomed out a little at top speed: more road ahead, cars still readable
  zoomLerp: 0.04,
  perspective: 900,      // virtual camera height used for the building extrusion
  shakeTime: 0.12,       // 120 ms per shake
  shakeMax: 14,
};

export const CAR = {
  topSpeed: 640,         // px/s
  toTop: 2.5,            // seconds from 0 to top speed
  toStop: 1.2,           // seconds from top speed to a stop under the brake
  reverseMax: 200,
  drag: 0.35,            // rolling drag per second when coasting (fraction of speed)
  steerSlow: 3.6,        // rad/s of yaw at walking-pace speeds (tight)
  steerFast: 2.3,        // rad/s at top speed (heavy): a ~280 px turning circle, one block
  steerMinSpeed: 70,     // below this, steering fades in with speed
  grip: 9.0,             // how fast sideways velocity is killed (per second)
  driftGrip: 1.6,        // grip with the handbrake held: the tail slides out
  handbrakeDecel: 260,
  radius: 22,            // collision circle
  length: 50,
  width: 24,
  health: 130,
  smokeAt: 55,           // health under which the engine smokes
  fireAt: 22,            // ... burns, then explodes
  burnTime: 5,
  crashDamage: 0.045,    // health lost per px/s of impact speed
  knockback: 0.55,       // fraction of impact speed returned as bounce
  enterRange: 70,
};
CAR.accel = CAR.topSpeed / CAR.toTop;                // 256 px/s^2
CAR.brake = CAR.topSpeed / CAR.toStop;               // 533 px/s^2

export const PLAYER = {
  walk: 150,
  run: 250,
  radius: 11,
  health: 100,
  armor: 0,
  respawnMoneyLoss: 0.1, // hospital / station take a tenth of the cash
  bustTime: 2.2,         // seconds a cop must stay on top of a slow player to arrest
  invulnAfterSpawn: 2,
};

export const WEAPONS = {
  pistol: { name: 'Pistol', rate: 0.28, damage: 26, spread: 0.035, speed: 1500, range: 620, ammo: 120, auto: false },
  smg: { name: 'SMG', rate: 0.085, damage: 15, spread: 0.08, speed: 1600, range: 560, ammo: 400, auto: true },
  // bought at Punta Arms (shop.js): the two better weapons
  shotgun: { name: 'Shotgun', rate: 0.75, damage: 16, spread: 0.16, speed: 1400, range: 380, ammo: 60, auto: false, pellets: 7 },
  carbine: { name: 'Carbine', rate: 0.11, damage: 30, spread: 0.025, speed: 1900, range: 760, ammo: 300, auto: true },
};
/** Weapon order for Q / number keys: 1 pistol, 2 SMG, 3 shotgun, 4 carbine. */
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'carbine'];

/** Punta Arms and the safehouse garage: everything costs cash, nothing is free. */
export const SHOP = {
  armor: { name: 'Armour vest', price: 800, key: 'Digit1' },       // refills armour to 100, rebuyable
  shotgun: { name: 'Shotgun', price: 2500, key: 'Digit2' },
  carbine: { name: 'Carbine', price: 6000, key: 'Digit3' },
  cometa: { name: 'Cometa SX', price: 9000, key: 'Digit4' },        // waits at the safehouse on every visit
  ammoRefill: 0.5,       // owned weapons are topped up to this fraction of a full load when bought
};

/** Mission and activity tunables. */
export const JOBS = {
  vipHealth: 120,        // the protection client
  rivalHealth: 160,      // Teo Castellan on foot at the docks
  tailNear: 150,         // closer than this with line of sight and the tail target grows suspicious
  tailFar: 620,          // further than this and he is lost
  tailSuspicion: 34,     // suspicion per second while too close (100 fails)
  rivalSpeed: 0.97,      // rival race driver top speed, fraction of his car's
  intactShare: 0.6,      // a delivered car must keep this much health
  fragileShare: 0.5,     // the glassware van
  witnessCall: 2.4,      // seconds a witness spends on the phone before the PAPD hears
};

export const TRAFFIC = {
  cars: 22,              // civilian cars kept alive around the player (scaled by density)
  peds: 46,
  parked: 26,            // parked cars placed once along kerbs
  spawnMin: 760,         // spawn ring: outside the screen ...
  spawnMax: 1250,        // ... but not too far
  despawn: 1600,
  cruise: 230,           // civilian cruising speed
  followGap: 70,
  pedWalk: 46,
  pedRun: 175,
  pedHealth: 24,         // one pistol round drops a bystander
  cashDropChance: 0.45,
};

export const POLICE = {
  maxStars: 5,
  carsPerStar: [0, 1, 3, 4, 6, 7],   // pursuit cars kept alive at each level
  footPerStar: [0, 1, 2, 3, 4, 5],
  patrolCars: 3,         // cruising cops at 0 stars
  sight: 480,            // a cop sees the player this far (with clear line of sight)
  evadeBase: 6,          // seconds out of sight to lose the stars ...
  evadePerStar: 1.5,     // ... plus this per star (4 stars: 12 s)
  chaseSpeed: 1.12,      // pursuit top speed as a fraction of CAR.topSpeed
  shootFromStar: 2,      // cops on foot shoot from 2 stars; from cars at 3
  carShootStar: 3,
  shootRate: 0.75,
  shootDamage: 6,
  helicopterStar: 4,
  starHeat: [0, 100, 260, 480, 760, 1100],   // heat needed for each star: every star is harder than the last
  heatPerCrime: {        // heat points
    carjack: 45,
    pedHit: 60,
    pedKill: 90,
    roadBump: 12,        // clipping a pedestrian with a car
    roadKill: 40,        // running one down
    gunfire: 35,
    copHit: 120,
    copKill: 200,
    copCarHit: 20,
  },
};

export const GANG = {
  health: 60,
  shootRate: 0.9,
  damage: 7,
  sight: 460,
};

export const HUD = {
  noticeTime: 1.5,       // anything costing money or health announces itself this long
  minimapSize: 210,
  minimapScale: 0.075,   // minimap px per world px
  bannerTime: 4,         // seconds a district banner stays up on entry
};

/** The in-game clock: 1 real second = clockMinutes of game time; a day starts at 18:00. */
export const CLOCK = {
  startMinute: 18 * 60,  // 18:24 once the opening seconds have run (see main.js)
  minutePerSecond: 2,    // one real second advances the clock by two game minutes
  dayLength: 24,         // hours on the dial
};

/** Radio: station and track line; a new track every 30 s of play. The mute key is M. */
export const RADIO = {
  trackSeconds: 30,
};

export const AUDIO = {
  master: 0.55,
  music: 0.32,
  sfx: 0.8,
};

/** The palette of a sun-soaked coast at golden hour. */
export const COLORS = {
  water: '#1f8fb3', waterDeep: '#17708f', foam: '#bfeef5',
  sand: '#ead19a', grass: '#7fb04f', grassDark: '#5f9440', park: '#6faa45',
  road: '#3b3f4a', roadEdge: '#2f323b', lane: '#f2d36b', laneWhite: '#e9e6dc',
  sidewalk: '#c9bfae', kerb: '#9c9282', plaza: '#d8c7a8',
  shadow: 'rgba(40,20,60,0.32)',
  sunTint: 'rgba(255,170,90,0.10)',
};
