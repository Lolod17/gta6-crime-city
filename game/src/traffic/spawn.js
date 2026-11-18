// traffic/spawn.js — JOB: where city life comes from: the lane geometry of the street grid, people, parked
//   cars, civilian cars and pedestrians spawned in a ring off screen, and THE TAIL's lane car.
// EXPORTS: LANE, DIRS, laneX, laneY, validDir, pickTurn, loopPoint, nearestLoopS, makePerson, initTraffic, populate, spawnCar, spawnPed, spawnLaneCar
// USES: ../config.js, ../city.js, ../vehicle.js
// MUST NOT: steer, brake or move anything after it is placed (that is traffic/behaviour.js).
import { TRAFFIC, WORLD } from '../config.js';
import { roadCenter, BLOCK_SIZE, ROADS_X, ROADS_Y, nearestNode } from '../city.js';
import { createVehicle, CIVILIAN_MODELS } from '../vehicle.js';

const LANE = WORLD.lane;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // E S W N (screen y points down)
const SHIRTS = ['#f2f2f2', '#ffcf5a', '#5ac8fa', '#ff8a65', '#9ccc65', '#ba68c8', '#4db6ac', '#f06292', '#ffd180', '#90a4ae'];
const SKINS = ['#f1c7a0', '#d9a066', '#b07842', '#8d5524', '#e0ac69', '#c68642'];
const HAIRS = ['#1b1410', '#3b2a1a', '#6a4a2a', '#c9a15a', '#2a2a2a', '#8a3a1a'];

/** Lane centre line for travel in direction d along the road through node (i, j). */
function laneX(i, d) { return roadCenter(i) + (d === 1 ? -LANE : LANE); }   // S drives west side, N east side
function laneY(j, d) { return roadCenter(j) + (d === 0 ? LANE : -LANE); }   // E drives south side, W north side

function validDir(i, j, d) {
  const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
  return ni >= 0 && ni < ROADS_X && nj >= 0 && nj < ROADS_Y;
}

function pickTurn(rng, i, j, d) {
  const options = [];
  for (let nd = 0; nd < 4; nd += 1) {
    if (nd === (d + 2) % 4 || !validDir(i, j, nd)) continue;
    options.push(nd, nd === d ? nd : null);   // straight ahead is twice as likely
  }
  const valid = options.filter((o) => o !== null);
  if (valid.length === 0) return (d + 2) % 4;
  return valid[Math.floor(rng() * valid.length)];
}

export function makePerson(kind, x, y, rng = Math.random) {
  const pick = (l) => l[Math.floor(rng() * l.length)];
  return {
    type: 'ped', kind, x, y, a: rng() * Math.PI * 2, vx: 0, vy: 0, kx: 0, ky: 0, r: 9,
    health: 30, dead: false, deadTime: 0, mode: 'path', flee: 0, fx: 0, fy: 0,
    block: null, s: 0, dirSign: rng() < 0.5 ? 1 : -1, speed: TRAFFIC.pedWalk * (0.8 + rng() * 0.5),
    walk: rng() * 10, moving: true, cooldown: 0, armed: false,
    shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(HAIRS), pants: rng() < 0.5 ? '#2c3440' : '#5a4a3a', hat: null,
  };
}

/** Point on block b's sidewalk loop at perimeter distance s. */
function loopPoint(b, s) {
  const inset = WORLD.sidewalk / 2;
  const L = BLOCK_SIZE - inset * 2;
  s = ((s % (4 * L)) + 4 * L) % (4 * L);
  const x0 = b.x + inset, y0 = b.y + inset;
  if (s < L) return { x: x0 + s, y: y0, a: 0 };
  if (s < 2 * L) return { x: x0 + L, y: y0 + (s - L), a: Math.PI / 2 };
  if (s < 3 * L) return { x: x0 + L - (s - 2 * L), y: y0 + L, a: Math.PI };
  return { x: x0, y: y0 + L - (s - 3 * L), a: -Math.PI / 2 };
}

function nearestLoopS(b, x, y) {
  const inset = WORLD.sidewalk / 2;
  const L = BLOCK_SIZE - inset * 2;
  const lx = Math.max(0, Math.min(L, x - b.x - inset)), ly = Math.max(0, Math.min(L, y - b.y - inset));
  const dists = [ly, L - lx, L - ly, lx];   // distance to N, E, S, W edges
  const m = Math.min(...dists);
  if (m === dists[0]) return lx;
  if (m === dists[1]) return L + ly;
  if (m === dists[2]) return 2 * L + (L - lx);
  return 3 * L + (L - ly);
}

export function initTraffic(state) {
  const rng = state.rng;
  const city = state.city;
  for (let k = 0; k < TRAFFIC.parked && k < city.parking.length; k += 1) {
    const spot = city.parking[k];
    const v = createVehicle(rng.pick(CIVILIAN_MODELS), spot.x, spot.y, spot.a, rng);
    v.parked = true;
    state.vehicles.push(v);
  }
}

/** Fill the streets around the player at once (game start, respawn), on screen included. */
export function populate(state) {
  for (let k = 0; k < TRAFFIC.cars; k += 1) spawnCar(state, 160);
  // two thirds of the crowd lands inside the screen, so the pavement reads as busy at a glance
  const near = Math.round(TRAFFIC.peds * 0.65);
  for (let k = 0; k < TRAFFIC.peds; k += 1) {
    if (k < near) spawnPed(state, 150, 680); else spawnPed(state, 60);
  }
}

/** Refill the streets up to their caps after a teleport, counting what is already near the player,
    so a respawn cannot pile a second crowd on top of the first. */
export function topUpCrowd(state) {
  const p = state.player;
  let civ = 0;
  for (const ped of state.peds) {
    if (ped.kind !== 'civ' || ped.dead) continue;
    if (Math.hypot(ped.x - p.x, ped.y - p.y) <= TRAFFIC.despawn) civ += 1;
  }
  let cars = 0;
  for (const v of state.vehicles) {
    if (v.police || v.dead || v.driver !== 'ai') continue;
    if (Math.hypot(v.x - p.x, v.y - p.y) <= TRAFFIC.despawn) cars += 1;
  }
  for (let k = civ; k < TRAFFIC.peds; k += 1) spawnPed(state, 60);
  for (let k = cars; k < TRAFFIC.cars; k += 1) spawnCar(state, 160);
}

function spawnCar(state, minDist = TRAFFIC.spawnMin) {
  const p = state.player;
  const rng = state.rng;
  for (let tries = 0; tries < 8; tries += 1) {
    const i = rng.int(0, ROADS_X - 1), j = rng.int(0, ROADS_Y - 1);
    const d = rng.int(0, 3);
    if (!validDir(i, j, d)) continue;
    const along = rng.range(90, 300);
    const x = d % 2 === 0 ? roadCenter(i) + DIRS[d][0] * along : laneX(i, d);
    const y = d % 2 === 1 ? roadCenter(j) + DIRS[d][1] * along : laneY(j, d);
    const dist = Math.hypot(x - p.x, y - p.y);
    if (dist < minDist || dist > TRAFFIC.spawnMax) continue;
    if (state.vehicles.some((v) => Math.abs(v.x - x) < 80 && Math.abs(v.y - y) < 80)) continue;
    const v = createVehicle(rng.pick(CIVILIAN_MODELS), x, y, Math.atan2(DIRS[d][1], DIRS[d][0]), rng);
    v.driver = 'ai';
    const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
    v.ai = { d, i: ni, j: nj, next: pickTurn(rng, ni, nj, d), panic: 0, wait: 0, cruise: TRAFFIC.cruise * rng.range(0.85, 1.15) };
    v.vx = Math.cos(v.a) * v.ai.cruise * 0.7; v.vy = Math.sin(v.a) * v.ai.cruise * 0.7;
    state.vehicles.push(v);
    return v;
  }
  return null;
}


function spawnPed(state, minDist = TRAFFIC.spawnMin * 0.8, maxDist = TRAFFIC.spawnMax) {
  const p = state.player;
  const rng = state.rng;
  for (let tries = 0; tries < 6; tries += 1) {
    const b = rng.pick(state.city.blocks);
    if (b.kind === 'yard' || b.kind === 'bank') continue;   // nobody strolls round the bank's marble
    const s = rng.range(0, 4 * BLOCK_SIZE);
    const pt = loopPoint(b, s);
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d < minDist || d > maxDist) continue;
    const ped = makePerson('civ', pt.x, pt.y, rng);
    ped.block = b; ped.s = s; ped.health = TRAFFIC.pedHealth;
    state.peds.push(ped);
    return;
  }
}


/** A car driven by the traffic AI, starting `along` px down a lane from the junction nearest p (THE TAIL's target). */
export function spawnLaneCar(state, p, model, color, cruise, along = 170) {
  const node = nearestNode(p.x, p.y);
  const dirs = [0, 1, 2, 3].filter((d) => validDir(node.i, node.j, d));
  const d = dirs[Math.floor(state.rng() * dirs.length)];
  const x = d % 2 === 0 ? roadCenter(node.i) + DIRS[d][0] * along : laneX(node.i, d);
  const y = d % 2 === 1 ? roadCenter(node.j) + DIRS[d][1] * along : laneY(node.j, d);
  const v = createVehicle(model, x, y, Math.atan2(DIRS[d][1], DIRS[d][0]), state.rng);
  v.color = color;
  v.driver = 'ai';
  const ni = node.i + DIRS[d][0], nj = node.j + DIRS[d][1];
  v.ai = { d, i: ni, j: nj, next: pickTurn(state.rng, ni, nj, d), panic: 0, wait: 0, cruise };
  v.mission = true;
  state.vehicles.push(v);
  return v;
}


export { LANE, DIRS, laneX, laneY, validDir, pickTurn, loopPoint, nearestLoopS, spawnCar, spawnPed };
