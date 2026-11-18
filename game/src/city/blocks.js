// city/blocks.js — JOB: generating the city from its seed: the RNG, each block's lots and buildings, trees, the coast, parked cars, named places, and the district each point belongs to.
// EXPORTS: makeRng, worldToZone, buildCity, districtKind, PORT_Y0
// USES: ../config.js, roads.js, collide.js
// DISTRICT PASS: Bahía Azul is now a beach strip (sand lots, a lagoon, a volleyball court, beach bars and
//   lifeguard huts on the north-east coast) and Southside is the industrial port (container stacks, gantry
//   cranes, a rail spur and a concrete quay on the south-east coast). Both are retiled as T_BEACH / T_PORT.
// MUST NOT: draw anything (render/ does) or be called after boot: same seed, same city, built once.
// SPLIT PASS: code unchanged; outside city/ it is reached only through city.js, which boot/state.js, hud/panels.js, police/heat.js,
//   police/pursuit.js, traffic/spawn.js, traffic/behaviour.js import after the split; loaded in the split-pass smoke
//   run with no console errors.
import { WORLD, COLORS } from '../config.js';
import { BLOCKS_X, BLOCKS_Y, roadCenter, blockStart, BLOCK_SIZE, layTiles, kerbPoint, T_BEACH, T_PORT, T_ROAD, T_SAND } from './roads.js';
import { hashSolids } from './collide.js';

/** Small fast seeded generator (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
  rng.pick = (list) => list[Math.floor(rng() * list.length)];
  return rng;
}

const { tile: T, period: P } = WORLD;

const PASTEL_WALLS = ['#f4d6b8', '#f7c6b4', '#e9e1cf', '#f2e3a4', '#cde7df', '#f5d0d8', '#e8d4f0', '#fbe2c0'];
const TOWER_WALLS = ['#d7e3ea', '#c9d6df', '#e6ddd0', '#bfd3dc', '#d9c8b8', '#e8e1d6'];
const ROOFS_HOUSE = ['#c46a4a', '#b85a3c', '#d4835a', '#9f5a48', '#e0a070', '#7f8fa0', '#c9b79c'];
const ROOFS_TOWER = ['#d8c7ab', '#c9b394', '#e4d6bc', '#b9c7c2', '#d9b79a', '#c7cfd4', '#e0c09a'];
const GLASS = ['#7fc4e0', '#8fd0e6', '#6fb3d6', '#9ad7e8', '#f2c27a'];

/** The two coastal districts with their own ground: block sets, and the coast rows beside them. */
const BEACH_BLOCKS = new Set(['6,0', '7,0', '6,1', '7,1']);
const PORT_BLOCKS = new Set(['7,7', '7,8', '7,9', '6,9']);
/** The port's quay starts south of this line (the middle of road 7); the beach strip ends at road 2. */
export const PORT_Y0 = roadCenter(7);
const BEACH_Y1 = roadCenter(2);
const CONTAINER_COLORS = ['#c0392b', '#2e86c1', '#e67e22', '#1e8449', '#7d3c98', '#d4ac0d', '#5d6d7e', '#a04000'];

/**
 * 'beach' or 'port' for a world point inside one of the two districts (their blocks, the roads between
 * them, and the coast beside them), else null. Block indices here are centred on the roads.
 */
export function districtKind(x, y) {
  const bi = Math.floor((x / T - 1) / P), bj = Math.floor((y / T - 1) / P);
  if (x >= WORLD.beachCol * T - T) {
    if (y < BEACH_Y1) return 'beach';
    if (y >= PORT_Y0) return 'port';
    return null;
  }
  if (BEACH_BLOCKS.has(`${bi},${bj}`)) return 'beach';
  if (PORT_BLOCKS.has(`${bi},${bj}`)) return 'port';
  return null;
}

function district(bi, bj) {
  if (BEACH_BLOCKS.has(`${bi},${bj}`)) return 'beach';
  if (PORT_BLOCKS.has(`${bi},${bj}`)) return 'port';
  if ((bi === 1 || bi === 2) && (bj === 6 || bj === 7)) return 'park';
  if (bi === 7) return 'marina';
  if (bi >= 3 && bi <= 5 && bj >= 2 && bj <= 6) return 'downtown';
  if (bi >= 2 && bi <= 6 && bj >= 1 && bj <= 7) return 'commercial';
  return 'residential';
}

/** The nine named districts, as a table of block columns per block row (see districts.js). */
const ZONE_ROWS = [
  ['palmlines', 'centro', 'marina'],
  ['caracol', 'downtown', 'palmlines', 'palmas', 'marina'],
  ['caracol', 'centro', 'eastside', 'palmas', 'palmlines', 'marina'],
  ['centro', 'eastside', 'palmas', 'palmlines', 'eastside', 'marina'],
  ['centro', 'downtown', 'palmas', 'palmlines', 'eastside', 'marina'],
  ['caracol', 'centro', 'downtown', 'eastside', 'palmas', 'marina'],
];

/**
 * Named district for a world point. The beach strip is Bahía Azul and the port is Southside, wherever
 * their own ground is; everywhere else the block row picks the row and the block column picks within it.
 */
export function worldToZone(city, x, y) {
  const kind = districtKind(x, y);
  if (kind === 'beach') return 'bahia';
  if (kind === 'port') return 'southside';
  const bi = Math.max(0, Math.min(BLOCKS_X - 1, Math.floor(x / (P * T)) - 1));
  const bj = Math.max(0, Math.min(BLOCKS_Y - 1, Math.floor(y / (P * T)) - 1));
  const row = ZONE_ROWS[Math.min(ZONE_ROWS.length - 1, Math.floor(bj / 2))];
  return row[Math.max(0, Math.min(row.length - 1, Math.floor(bi * row.length / BLOCKS_X)))];
}

function addBuilding(city, rng, x, y, w, h, height, kind, extra = {}) {
  const b = {
    x, y, w, h, height, kind,
    wall: kind === 'tower' ? rng.pick(TOWER_WALLS) : rng.pick(PASTEL_WALLS),
    roof: kind === 'house' ? rng.pick(ROOFS_HOUSE) : rng.pick(ROOFS_TOWER),
    glass: rng.pick(GLASS),
    floors: Math.max(1, Math.round(height / 16)),
    roofItems: [],
    label: null,
    ...extra,
  };
  if (!b.roof) b.roof = b.wall;   // containers: the roof is the box's own paint
  if (kind === 'container' || kind === 'hut') { city.buildings.push(b); return b; }
  // rooftop clutter drawn on the roof: AC boxes, a water tank, sometimes a pool or a helipad
  if (kind !== 'house') {
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i += 1) {
      b.roofItems.push({ type: 'ac', u: rng.range(0.15, 0.75), v: rng.range(0.15, 0.75), s: rng.range(10, 18) });
    }
    if (kind === 'tower' && w > 110 && h > 110) {
      const r = rng();
      if (r < 0.3) b.roofItems.push({ type: 'pool', u: 0.5, v: 0.5 });
      else if (r < 0.55) b.roofItems.push({ type: 'helipad', u: 0.5, v: 0.5 });
    }
  }
  city.buildings.push(b);
  return b;
}

function fillBlock(city, rng, bi, bj) {
  const x0 = blockStart(bi), y0 = blockStart(bj);
  const kind = district(bi, bj);
  const inset = WORLD.sidewalk + 8;
  const ix = x0 + inset, iy = y0 + inset, is = BLOCK_SIZE - inset * 2;
  const block = { bi, bj, x: x0, y: y0, size: BLOCK_SIZE, kind, pools: [], lawns: [], plazas: [] };
  city.blocks.push(block);

  if (kind === 'park') {
    block.lawns.push({ x: x0, y: y0, w: BLOCK_SIZE, h: BLOCK_SIZE });
    const pond = bi === 2 && bj === 6;
    if (pond) block.pools.push({ x: x0 + 70, y: y0 + 80, w: 150, h: 110, pond: true });
    for (let i = 0; i < 16; i += 1) {
      const tx = x0 + rng.range(30, BLOCK_SIZE - 30), ty = y0 + rng.range(30, BLOCK_SIZE - 30);
      if (pond && tx > x0 + 50 && tx < x0 + 240 && ty > y0 + 60 && ty < y0 + 210) continue;
      city.trees.push({ x: tx, y: ty, r: rng.range(14, 22), kind: 'oak' });
    }
    return;
  }

  if (kind === 'downtown') {
    block.plazas.push({ x: x0, y: y0, w: BLOCK_SIZE, h: BLOCK_SIZE });
    const split = rng();
    const g = 12;
    if (split < 0.3) {
      addBuilding(city, rng, ix + 6, iy + 6, is - 12, is - 12, rng.range(230, 360), 'tower');
    } else if (split < 0.65) {
      const half = (is - g) / 2;
      const vertical = rng() < 0.5;
      for (let k = 0; k < 2; k += 1) {
        const bx = vertical ? ix + k * (half + g) : ix;
        const by = vertical ? iy : iy + k * (half + g);
        addBuilding(city, rng, bx, by, vertical ? half : is, vertical ? is : half, rng.range(150, 320), 'tower');
      }
    } else {
      const q = (is - g) / 2;
      for (let k = 0; k < 4; k += 1) {
        if (rng() < 0.18) { block.lawns.push({ x: ix + (k % 2) * (q + g), y: iy + Math.floor(k / 2) * (q + g), w: q, h: q }); continue; }
        addBuilding(city, rng, ix + (k % 2) * (q + g), iy + Math.floor(k / 2) * (q + g), q, q, rng.range(110, 280), 'tower');
      }
    }
    return;
  }

  if (kind === 'beach') { fillBeach(city, rng, block); return; }
  if (kind === 'port') { fillPort(city, rng, block); return; }

  if (kind === 'marina') {
    block.plazas.push({ x: x0, y: y0, w: BLOCK_SIZE, h: BLOCK_SIZE });
    const n = rng.int(1, 2);
    const h = (is - (n - 1) * 16) / n;
    for (let k = 0; k < n; k += 1) {
      addBuilding(city, rng, ix + 20, iy + k * (h + 16), is - 40, h, rng.range(34, 60), 'warehouse',
        { wall: rng.pick(['#e9c9a0', '#d8b48c', '#f0dcc0', '#c8d8d8']), roof: rng.pick(['#7c8b94', '#a4766a', '#8c9c8c']) });
    }
    return;
  }

  if (kind === 'commercial') {
    block.plazas.push({ x: x0, y: y0, w: BLOCK_SIZE, h: BLOCK_SIZE });
    const rows = rng.int(1, 2), cols = rng.int(1, 2);
    const g = 14;
    const cw = (is - (cols - 1) * g) / cols, ch = (is - (rows - 1) * g) / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        addBuilding(city, rng, ix + c * (cw + g), iy + r * (ch + g), cw, ch, rng.range(55, 130), 'shop');
      }
    }
    return;
  }

  // residential: four lots, each a house with a yard and often a pool
  block.lawns.push({ x: x0 + WORLD.sidewalk, y: y0 + WORLD.sidewalk, w: BLOCK_SIZE - WORLD.sidewalk * 2, h: BLOCK_SIZE - WORLD.sidewalk * 2 });
  const lot = (BLOCK_SIZE - WORLD.sidewalk * 2) / 2;
  for (let k = 0; k < 4; k += 1) {
    const lx = x0 + WORLD.sidewalk + (k % 2) * lot, ly = y0 + WORLD.sidewalk + Math.floor(k / 2) * lot;
    const hw = rng.range(62, 84), hh = rng.range(56, 78);
    // the house sits toward the street corner; the pool goes in the back yard
    const hx = k % 2 === 0 ? lx + 12 : lx + lot - hw - 12;
    const hy = k < 2 ? ly + 12 : ly + lot - hh - 12;
    addBuilding(city, rng, hx, hy, hw, hh, rng.range(22, 38), 'house');
    if (rng() < 0.6) {
      const px = k % 2 === 0 ? lx + lot - 50 : lx + 10, py = k < 2 ? ly + lot - 40 : ly + 10;
      block.pools.push({ x: px, y: py, w: 40, h: 28 });
    } else {
      city.trees.push({ x: k % 2 === 0 ? lx + lot - 28 : lx + 28, y: k < 2 ? ly + lot - 28 : ly + 28, r: rng.range(12, 17), kind: rng() < 0.5 ? 'palm' : 'oak' });
    }
  }
}

/**
 * Bahía Azul beach lot: the block is sand inside its sidewalk, with a lagoon, a volleyball court, a beach
 * bar or a lifeguard hut, umbrellas with towels, and palms. block.beach holds what the ground painter draws.
 */
function fillBeach(city, rng, block) {
  const s = WORLD.sidewalk, x0 = block.x + s, y0 = block.y + s, size = block.size - 2 * s;
  const props = { umbrellas: [], lagoon: null, court: null, ripples: [] };
  block.beach = props;
  // a lagoon in two of the four lots, a volleyball court in the others
  if ((block.bi + block.bj) % 2 === 0) props.lagoon = { x: x0 + size * 0.55, y: y0 + size * 0.55, rx: size * 0.3, ry: size * 0.22 };
  else props.court = { x: x0 + size * 0.42, y: y0 + size * 0.46, w: 120, h: 64 };
  // a beach bar (the chiringuito) or a lifeguard hut on stilts, low enough to see over
  const bar = block.bi === 6;
  addBuilding(city, rng, x0 + 18, y0 + 18, bar ? 86 : 44, bar ? 54 : 44, bar ? 26 : 38, 'hut', {
    wall: bar ? '#e8c07a' : '#f4f1e8', roof: bar ? '#d9a441' : '#e63b2e', floors: 1,
  });
  for (let i = 0; i < 9; i += 1) {
    const ux = x0 + rng.range(30, size - 30), uy = y0 + rng.range(100, size - 24);
    if (props.lagoon && Math.hypot((ux - props.lagoon.x) / (props.lagoon.rx + 26), (uy - props.lagoon.y) / (props.lagoon.ry + 26)) < 1) continue;
    if (props.court && ux > props.court.x - 80 && ux < props.court.x + 80 && uy > props.court.y - 50 && uy < props.court.y + 50) continue;
    props.umbrellas.push({ x: ux, y: uy, color: rng.pick(['#ff5a5a', '#ffd23f', '#18b6c9', '#ff8ac0', '#7ad37a']), towel: rng.pick(['#3fa9f5', '#ff6f61', '#f7e04b', '#9b5de5']) });
  }
  for (let i = 0; i < 26; i += 1) props.ripples.push({ x: x0 + rng() * size, y: y0 + rng() * size, w: rng.range(14, 34) });
  for (let i = 0; i < 4; i += 1) {
    const tx = x0 + rng.range(20, size - 20), ty = y0 + rng.range(20, size - 20);
    if (props.lagoon && Math.hypot((tx - props.lagoon.x) / (props.lagoon.rx + 20), (ty - props.lagoon.y) / (props.lagoon.ry + 20)) < 1) continue;
    if (tx < x0 + 130 && ty < y0 + 90) continue;   // keep the hut clear
    city.trees.push({ x: tx, y: ty, r: rng.range(13, 18), kind: 'palm' });
  }
}

/**
 * Southside port yard: concrete inside the sidewalk, rows of container stacks (solid, two to three
 * high), a rail spur along the yard, and painted lane lines. Cranes stand on the quay (buildCity).
 */
function fillPort(city, rng, block) {
  const s = WORLD.sidewalk, x0 = block.x + s, y0 = block.y + s, size = block.size - 2 * s;
  block.port = { rails: [{ x: x0 + size - 46, y0: block.y, y1: block.y + block.size }], lanes: [] };
  // two rows of stacks each side of a driving lane, leaving the rail strip on the east side clear
  const cw = 62, ch = 26, gap = 6;
  for (const col of [x0 + 22, x0 + 22 + cw + 50]) {
    block.port.lanes.push(col + cw + 25);
    for (let y = y0 + 34; y + ch < y0 + size - 30; y += ch + gap) {
      if (rng() < 0.22) continue;          // gaps in the stacks: cover with ways through
      const stack = rng.int(1, 3);
      addBuilding(city, rng, col, y, cw, ch, 15 + stack * 13, 'container', {
        wall: rng.pick(CONTAINER_COLORS), roof: null, floors: 0, stack,
      });
    }
  }
}

/** Retile the two districts: their lots (and the port's quay over the sand) get their own tile kind. */
function retileDistricts(city) {
  const N = WORLD.tiles;
  for (let ty = 0; ty < N; ty += 1) {
    for (let tx = 0; tx < N; tx += 1) {
      const k = ty * N + tx;
      if (city.tiles[k] === T_ROAD) continue;
      const kind = districtKind((tx + 0.5) * T, (ty + 0.5) * T);
      if (kind === 'port' && (city.tiles[k] === T_SAND || tx < WORLD.beachCol)) city.tiles[k] = T_PORT;
      else if (kind === 'beach' && tx < WORLD.beachCol) city.tiles[k] = T_BEACH;
    }
  }
}

export function buildCity(seed = WORLD.seed) {
  const rng = makeRng(seed);
  const city = { seed, buildings: [], trees: [], blocks: [], piers: [], parking: [], places: {}, _near: [], _los: [] };

  layTiles(city);

  for (let bj = 0; bj < BLOCKS_Y; bj += 1) for (let bi = 0; bi < BLOCKS_X; bi += 1) fillBlock(city, rng, bi, bj);

  // the coast: a boardwalk lined with palms, three piers into the water
  const beachX = WORLD.beachCol * T, waterX = WORLD.waterCol * T;
  for (let y = 60; y < WORLD.size - 40; y += rng.range(80, 130)) {
    if (y > PORT_Y0 - 20) break;   // the quay has no palms
    city.trees.push({ x: beachX + rng.range(30, 70), y, r: rng.range(13, 18), kind: 'palm' });
  }
  for (const pj of [2, 5]) {
    city.piers.push({ x: waterX - 20, y: roadCenter(pj) - 18, w: 300, h: 36 });
  }
  // beach life: umbrellas and towels between the boardwalk and the surf
  city.umbrellas = [];
  for (let y = 40; y < PORT_Y0 - 30; y += rng.range(46, 90)) {
    city.umbrellas.push({ x: beachX + rng.range(145, waterX - beachX - 30), y, color: rng.pick(['#ff5a5a', '#ffd23f', '#18b6c9', '#ff8ac0', '#7ad37a', '#ffffff']), towel: rng.pick(['#3fa9f5', '#ff6f61', '#f7e04b', '#9b5de5']) });
  }
  // boats out on the bay: lane x, start y, speed (they loop the coast)
  city.boats = [];
  for (let k = 0; k < 6; k += 1) {
    city.boats.push({ x: waterX + rng.range(200, WORLD.size - waterX - 60), y: rng.range(0, WORLD.size), speed: rng.range(25, 70) * (rng() < 0.5 ? 1 : -1), len: rng.range(34, 60), color: rng.pick(['#ffffff', '#f2e6d0', '#ff7a59', '#2f6f9f']) });
  }
  // Bahía Azul's sand: lifeguard huts on stilts and a row of surf flags along the strip
  city.lifeguards = [];
  for (const y of [roadCenter(0) + 150, roadCenter(1) + 120]) {
    addBuilding(city, rng, beachX + 150, y, 34, 34, 40, 'hut', { wall: '#f4f1e8', roof: '#e63b2e', floors: 1 });
    city.lifeguards.push({ x: beachX + 167, y: y + 17 });
  }
  // Southside's quay: three gantry cranes over the water's edge, a moored freighter, a rail spur
  city.cranes = [];
  for (const y of [roadCenter(7) + 160, roadCenter(8) + 120, roadCenter(9) - 60]) {
    city.cranes.push({ x: beachX + 40, y, w: 150, h: 46, height: 210, boom: 260, color: rng.pick(['#e8a317', '#d64541', '#2d7dd2']) });
  }
  city.ship = { x: waterX + 40, y: roadCenter(7) + 70, w: 120, h: WORLD.size - roadCenter(7) - 160, hull: '#24384f', deck: '#8a3b2e' };
  city.quayRail = { x: beachX + 18, y0: PORT_Y0, y1: WORLD.size };
  // palms down the central boulevard's verges
  for (let bj = 0; bj < BLOCKS_Y; bj += 1) {
    const y0 = blockStart(bj);
    for (const off of [36, BLOCK_SIZE - 36]) {
      city.trees.push({ x: blockStart(4) - 4, y: y0 + off, r: 13, kind: 'palm' });
    }
  }

  // parked cars along kerbs: a lane-side spot beside a block, facing along the road
  for (let k = 0; k < 40; k += 1) {
    const bi = rng.int(0, BLOCKS_X - 1), bj = rng.int(0, BLOCKS_Y - 1);
    const side = rng.pick(['n', 's', 'w', 'e']);
    const along = rng.range(50, BLOCK_SIZE - 50);
    const x0 = blockStart(bi), y0 = blockStart(bj);
    let x, y, a;
    if (side === 'n') { x = x0 + along; y = y0 - 16; a = Math.PI; }
    else if (side === 's') { x = x0 + along; y = y0 + BLOCK_SIZE + 16; a = 0; }
    else if (side === 'w') { x = x0 - 16; y = y0 + along; a = Math.PI / 2; }
    else { x = x0 + BLOCK_SIZE + 16; y = y0 + along; a = -Math.PI / 2; }
    city.parking.push({ x, y, a });
  }

  // named places: the story's map
  const label = (bi, bj, name, color) => {
    const b = city.buildings.find((bb) => bb.x >= blockStart(bi) && bb.x < blockStart(bi) + BLOCK_SIZE && bb.y >= blockStart(bj) && bb.y < blockStart(bj) + BLOCK_SIZE);
    if (b) { b.label = name; if (color) b.roof = color; }
    return b;
  };
  label(1, 2, 'SAFEHOUSE', '#4a6a8a');
  label(6, 8, 'POLICE', '#2c4f8f');
  label(2, 3, 'HOSPITAL', '#f4f4f4');
  label(5, 7, 'TAQUERIA INÉS', '#d9572b');
  label(0, 8, 'PAINT & PRAY', '#6b3fa0');
  label(4, 1, 'BAR CARACOL', '#2b8f7a');
  label(2, 5, 'PUNTA ARMS', '#8f2b2b');
  label(7, 5, 'MUELLE CINCO', '#3f5f6f');
  city.places = {
    safehouse: kerbPoint(1, 2, 'e'),
    station: kerbPoint(6, 8, 'n'),
    hospital: kerbPoint(2, 3, 'e'),
    taqueria: kerbPoint(5, 7, 'n'),
    pickup: kerbPoint(7, 1, 'w'),       // marina warehouse, north-east
    drop: kerbPoint(0, 5, 'e'),         // west side
    heatStart: kerbPoint(3, 8, 's'),
    garage: kerbPoint(0, 8, 'n'),       // Paint & Pray resprays clear the heat
    rival: { x: blockStart(6) + BLOCK_SIZE / 2, y: blockStart(3) + BLOCK_SIZE / 2 },
    // pass 2: the three-day story and the side activities
    caracol: kerbPoint(4, 1, 's'),      // Nando's bar
    hotel: kerbPoint(4, 4, 'n'),        // downtown hotel: the glassware delivery
    tailStart: kerbPoint(3, 0, 's'),
    parcels: [kerbPoint(1, 0, 's'), kerbPoint(6, 5, 'w'), kerbPoint(2, 9, 'n')],
    raceStart: { x: roadCenter(1), y: roadCenter(1) + 90 },
    clinic: kerbPoint(5, 2, 'w'),
    dashStart: kerbPoint(6, 6, 'w'),    // the Day 1 dash to the safehouse begins out east       // where Nando waits to be protected
    aurelia: kerbPoint(3, 5, 'e'),      // Teo's gold car, parked downtown
    docks: kerbPoint(7, 5, 'w'),        // Muelle Cinco
    containers: kerbPoint(7, 8, 'w'),   // the car drop at the container lot
    broker: kerbPoint(7, 2, 'w'),       // the harbour broker who buys the ledger
    shop: kerbPoint(2, 5, 'e'),         // Punta Arms
    sprint: { x: roadCenter(0) + WORLD.lane, y: roadCenter(1) + 60 },   // activity: checkpoint race
    depot: kerbPoint(5, 4, 's'),        // activity: delivery job
    rampage: kerbPoint(6, 9, 'n'),      // activity: rampage
    addresses: [kerbPoint(0, 2, 'e'), kerbPoint(3, 7, 'n'), kerbPoint(6, 0, 's'), kerbPoint(1, 8, 'e'), kerbPoint(4, 9, 'n')],
    start: { x: roadCenter(2) + WORLD.lane, y: blockStart(2) + 120 },
    // district pass: the beach chase, the container yard, the port delivery, the dockside gun counter
    playa: kerbPoint(5, 1, 'e'),         // Nando waits by the Bahía Azul promenade
    yardGate: kerbPoint(6, 7, 'e'),      // Inés's car at the Southside gate
    yard: { x: blockStart(7) + BLOCK_SIZE / 2 - 10, y: blockStart(8) + BLOCK_SIZE / 2 },
    reefer: { x: blockStart(7) + BLOCK_SIZE - 52, y: blockStart(8) + 60 },
    portVan: kerbPoint(6, 9, 'e'),
    portGates: [
      { x: roadCenter(8), y: roadCenter(7) },                         // the gate on the coast road
      { x: WORLD.beachCol * T + 110, y: roadCenter(8) - 40 },         // under the first crane
      { x: WORLD.beachCol * T + 110, y: roadCenter(9) + 90 },         // the far end of the quay
    ],
    berth: { x: WORLD.beachCol * T + 150, y: roadCenter(8) + 260 },   // the freighter's gangway
    arms: kerbPoint(7, 7, 'w'),          // Armas del Muelle, the gun counter in a container
  };
  // the rival crew's block is a walled lot, not a tower: clear its middle
  city.buildings = city.buildings.filter((b) => !(b.x >= blockStart(6) && b.x < blockStart(6) + BLOCK_SIZE && b.y >= blockStart(3) && b.y < blockStart(3) + BLOCK_SIZE));
  const rx = blockStart(6), ry = blockStart(3), s = BLOCK_SIZE;
  const rivalBlock = city.blocks.find((bl) => bl.bi === 6 && bl.bj === 3);
  rivalBlock.kind = 'yard';
  // low crates and a shed give cover in the yard
  addBuilding(city, rng, rx + 40, ry + 40, 60, 40, 26, 'shed', { wall: '#b98d5f', roof: '#7a5638' });
  addBuilding(city, rng, rx + s - 110, ry + 60, 50, 50, 22, 'shed', { wall: '#a07a50', roof: '#5e4630' });
  addBuilding(city, rng, rx + 70, ry + s - 90, 70, 34, 24, 'shed', { wall: '#8f6a48', roof: '#6b4a32' });
  addBuilding(city, rng, rx + s - 100, ry + s - 80, 40, 40, 20, 'shed', { wall: '#b98d5f', roof: '#7a5638' });

  // the gun counter: a painted container on the port yard's west kerb
  const ax = blockStart(7) + WORLD.sidewalk + 4, ay = blockStart(7) + BLOCK_SIZE / 2 - 60;
  city.buildings = city.buildings.filter((b) => !(b.kind === 'container' && b.x < ax + 70 && b.x + b.w > ax && b.y < ay + 120 && b.y + b.h > ay));
  addBuilding(city, rng, ax + 10, ay, 44, 120, 30, 'container', { wall: '#2b2b30', roof: '#ff7a59', floors: 0, label: 'ARMAS' });
  city.places.arms = { x: blockStart(7) + WORLD.sidewalk / 2, y: ay + 60, side: 'w' };

  retileDistricts(city);
  hashSolids(city);
  city.colors = COLORS;
  return city;
}
