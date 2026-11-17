// Seeded procedural city: a 60x60-tile grid of streets every 6 tiles, a downtown of towers, a ring
// of homes with pools, one park, a marina, a beach and the ocean. Same seed, same city.
// It only produces data; render.js draws it and the other modules query it for collisions,
// line of sight, road lanes and named places.
import { WORLD, COLORS } from './config.js';

export const T_ROAD = 1, T_BLOCK = 2, T_PARK = 3, T_SAND = 4, T_WATER = 5;

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

const { tile: T, tiles: N, period: P } = WORLD;
const BLOCKS_X = 8;    // city blocks west of the beach
const BLOCKS_Y = 10;
const CELL = P * T;    // collision hash cell = one street period

const PASTEL_WALLS = ['#f4d6b8', '#f7c6b4', '#e9e1cf', '#f2e3a4', '#cde7df', '#f5d0d8', '#e8d4f0', '#fbe2c0'];
const TOWER_WALLS = ['#d7e3ea', '#c9d6df', '#e6ddd0', '#bfd3dc', '#d9c8b8', '#e8e1d6'];
const ROOFS_HOUSE = ['#c46a4a', '#b85a3c', '#d4835a', '#9f5a48', '#e0a070', '#7f8fa0', '#c9b79c'];
const ROOFS_TOWER = ['#d8c7ab', '#c9b394', '#e4d6bc', '#b9c7c2', '#d9b79a', '#c7cfd4', '#e0c09a'];
const GLASS = ['#7fc4e0', '#8fd0e6', '#6fb3d6', '#9ad7e8', '#f2c27a'];

/** Pixel centre of the road numbered k (both axes use the same spacing). */
export const roadCenter = (k) => (P * k + 1) * T;
/** Block k's near edge in pixels. */
export const blockStart = (k) => (P * k + 2) * T;
export const BLOCK_SIZE = (P - 2) * T;
export const ROADS_X = BLOCKS_X + 1;  // vertical roads 0..8
export const ROADS_Y = BLOCKS_Y;      // horizontal roads 0..9

function district(bi, bj) {
  if ((bi === 1 || bi === 2) && (bj === 6 || bj === 7)) return 'park';
  if (bi === 7) return 'marina';
  if (bi >= 3 && bi <= 5 && bj >= 2 && bj <= 6) return 'downtown';
  if (bi >= 2 && bi <= 6 && bj >= 1 && bj <= 7) return 'commercial';
  return 'residential';
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

function hashSolids(city) {
  const cells = Math.ceil(WORLD.size / CELL);
  city.cells = cells;
  city.grid = Array.from({ length: cells * cells }, () => []);
  const put = (s, x0, y0, x1, y1) => {
    const a = Math.max(0, Math.floor(x0 / CELL)), b = Math.min(cells - 1, Math.floor(x1 / CELL));
    const c = Math.max(0, Math.floor(y0 / CELL)), d = Math.min(cells - 1, Math.floor(y1 / CELL));
    for (let gy = c; gy <= d; gy += 1) for (let gx = a; gx <= b; gx += 1) city.grid[gy * cells + gx].push(s);
  };
  for (const b of city.buildings) put(b, b.x, b.y, b.x + b.w, b.y + b.h);
  for (const t of city.trees) { t.solid = true; put(t, t.x - t.r, t.y - t.r, t.x + t.r, t.y + t.r); }
}

/** Solids (buildings with w/h, trees with r) in the hash cells around (x, y). */
export function solidsNear(city, x, y) {
  const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
  const out = city._near;
  out.length = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    const cy = gy + dy;
    if (cy < 0 || cy >= city.cells) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = gx + dx;
      if (cx < 0 || cx >= city.cells) continue;
      const list = city.grid[cy * city.cells + cx];
      for (let i = 0; i < list.length; i += 1) if (!out.includes(list[i])) out.push(list[i]);
    }
  }
  return out;
}

/** Is (x, y) inside a building (or the ocean, or off the map)? */
export function isBlocked(city, x, y, pad = 0) {
  if (x < pad || y < pad || x > WORLD.size - pad || y > WORLD.size - pad) return true;
  if (x > WORLD.waterCol * T - pad) return true;
  const list = solidsNear(city, x, y);
  for (const s of list) {
    if (s.w !== undefined) {
      if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return true;
    } else if ((x - s.x) ** 2 + (y - s.y) ** 2 < (s.r + pad) ** 2) return true;
  }
  return false;
}

/** True when no building stands between the two points (trees do not block sight). */
export function lineOfSight(city, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / CELL));
  const seen = city._los;
  seen.length = 0;
  for (let s = 0; s <= steps; s += 1) {
    const px = x0 + (dx * s) / steps, py = y0 + (dy * s) / steps;
    const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);
    if (gx < 0 || gy < 0 || gx >= city.cells || gy >= city.cells) continue;
    const list = city.grid[gy * city.cells + gx];
    for (const b of list) {
      if (b.w === undefined || seen.includes(b)) continue;
      seen.push(b);
      if (segmentHitsRect(x0, y0, dx, dy, b)) return false;
    }
  }
  return true;
}

/** Slab test: does the segment from (x0,y0) along (dx,dy) cross rect b? */
export function segmentHitsRect(x0, y0, dx, dy, b) {
  let t0 = 0, t1 = 1;
  const axes = [[dx, x0, b.x, b.x + b.w], [dy, y0, b.y, b.y + b.h]];
  for (const [d, o, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let a = (lo - o) / d, c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

/** Fraction along the segment where it first enters rect b, or -1. */
export function segmentEnterRect(x0, y0, dx, dy, b) {
  let t0 = 0, t1 = 1;
  const axes = [[dx, x0, b.x, b.x + b.w], [dy, y0, b.y, b.y + b.h]];
  for (const [d, o, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let a = (lo - o) / d, c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return -1;
  }
  return t0;
}

/** Nearest road intersection index to a point. */
export function nearestNode(x, y) {
  const i = Math.max(0, Math.min(ROADS_X - 1, Math.round(x / T / P - 1 / P)));
  const j = Math.max(0, Math.min(ROADS_Y - 1, Math.round(y / T / P - 1 / P)));
  return { i, j, x: roadCenter(i), y: roadCenter(j) };
}

/** A point on the sidewalk of block (bi, bj), mid-way along one side: used for named places. */
export function kerbPoint(bi, bj, side) {
  const x0 = blockStart(bi), y0 = blockStart(bj), mid = BLOCK_SIZE / 2, k = WORLD.sidewalk / 2;
  if (side === 'n') return { x: x0 + mid, y: y0 + k, side };
  if (side === 's') return { x: x0 + mid, y: y0 + BLOCK_SIZE - k, side };
  if (side === 'w') return { x: x0 + k, y: y0 + mid, side };
  return { x: x0 + BLOCK_SIZE - k, y: y0 + mid, side };
}

export function buildCity(seed = WORLD.seed) {
  const rng = makeRng(seed);
  const city = { seed, buildings: [], trees: [], blocks: [], piers: [], parking: [], places: {}, _near: [], _los: [] };

  // tile grid: roads every 6 tiles west of the beach, then sand, then water
  city.tiles = new Uint8Array(N * N);
  for (let ty = 0; ty < N; ty += 1) {
    for (let tx = 0; tx < N; tx += 1) {
      let t = T_BLOCK;
      if (tx >= WORLD.waterCol) t = T_WATER;
      else if (tx >= WORLD.beachCol) t = T_SAND;
      else if (tx % P < 2 || ty % P < 2) t = T_ROAD;
      city.tiles[ty * N + tx] = t;
    }
  }

  for (let bj = 0; bj < BLOCKS_Y; bj += 1) for (let bi = 0; bi < BLOCKS_X; bi += 1) fillBlock(city, rng, bi, bj);

  // the coast: a boardwalk lined with palms, three piers into the water
  const beachX = WORLD.beachCol * T, waterX = WORLD.waterCol * T;
  for (let y = 60; y < WORLD.size - 40; y += rng.range(80, 130)) {
    city.trees.push({ x: beachX + rng.range(30, 70), y, r: rng.range(13, 18), kind: 'palm' });
  }
  for (const pj of [2, 5, 8]) {
    city.piers.push({ x: waterX - 20, y: roadCenter(pj) - 18, w: 300, h: 36 });
  }
  // beach life: umbrellas and towels between the boardwalk and the surf
  city.umbrellas = [];
  for (let y = 40; y < WORLD.size - 40; y += rng.range(46, 90)) {
    city.umbrellas.push({ x: beachX + rng.range(145, waterX - beachX - 30), y, color: rng.pick(['#ff5a5a', '#ffd23f', '#18b6c9', '#ff8ac0', '#7ad37a', '#ffffff']), towel: rng.pick(['#3fa9f5', '#ff6f61', '#f7e04b', '#9b5de5']) });
  }
  // boats out on the bay: lane x, start y, speed (they loop the coast)
  city.boats = [];
  for (let k = 0; k < 6; k += 1) {
    city.boats.push({ x: waterX + rng.range(120, WORLD.size - waterX - 60), y: rng.range(0, WORLD.size), speed: rng.range(25, 70) * (rng() < 0.5 ? 1 : -1), len: rng.range(34, 60), color: rng.pick(['#ffffff', '#f2e6d0', '#ff7a59', '#2f6f9f']) });
  }
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

  hashSolids(city);
  city.colors = COLORS;
  return city;
}
