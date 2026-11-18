// traffic/behaviour.js — JOB: what city life does each step: lane following and turning at junctions,
//   braking for what is ahead, panic, pedestrians strolling, fleeing and diving aside, injuries, pickups.
// EXPORTS: driveAlongRoads, updateTraffic, scarePeople, hurtPed, ejectDriver, updatePickups
// USES: ../config.js, ../city.js, ../vehicle.js, ../player.js, ../render.js, ../audio.js, ./spawn.js
// MUST NOT: decide where new cars and people appear (that is traffic/spawn.js).
import { TRAFFIC } from '../config.js';
import { roadCenter, ROADS_X, ROADS_Y } from '../city.js';
import { forwardSpeed } from '../vehicle.js';
import { moveCircle } from '../player.js';
import { burst, addDecal, floatText } from '../render.js';
import { sfx } from '../audio.js';
import { LANE, DIRS, laneX, laneY, pickTurn, loopPoint, nearestLoopS, makePerson, spawnCar, spawnPed } from './spawn.js';

/** Road-following driver: aim at a carrot on the lane, turn at junctions, brake for what is ahead. */
export function driveAlongRoads(state, v, dt, opts = {}) {
  const ai = v.ai;
  const rng = state.rng;
  const nx = roadCenter(ai.i), ny = roadCenter(ai.j);
  const d = ai.d;
  // distance left to the junction along the travel axis
  const left = d % 2 === 0 ? (nx - v.x) * DIRS[d][0] : (ny - v.y) * DIRS[d][1];
  let tx, ty;
  const turning = ai.next !== d;
  if (turning || left > 0) {
    // approach: follow our lane toward the junction
    const ahead = Math.min(left, 90);
    tx = d % 2 === 0 ? v.x + DIRS[d][0] * ahead : laneX(ai.i, d);
    ty = d % 2 === 1 ? v.y + DIRS[d][1] * ahead : laneY(ai.j, d);
    if (turning && left < 140) {
      // swing into the exit lane through the junction
      const e = ai.next;
      tx = (e % 2 === 0 ? nx + DIRS[e][0] * 60 : laneX(ai.i, e));
      ty = (e % 2 === 1 ? ny + DIRS[e][1] * 60 : laneY(ai.j, e));
      if (left < LANE * 1.2) {
        ai.d = e; ai.i += DIRS[e][0]; ai.j += DIRS[e][1];
        ai.next = pickTurn(rng, ai.i, ai.j, e);
      }
    }
  } else {
    ai.i += DIRS[d][0]; ai.j += DIRS[d][1];
    if (ai.i < 0 || ai.i >= ROADS_X || ai.j < 0 || ai.j >= ROADS_Y) { ai.i -= DIRS[d][0]; ai.j -= DIRS[d][1]; ai.d = (d + 2) % 4; }
    ai.next = pickTurn(rng, ai.i, ai.j, ai.d);
    tx = v.x + Math.cos(v.a) * 60; ty = v.y + Math.sin(v.a) * 60;
  }
  let diff = Math.atan2(ty - v.y, tx - v.x) - v.a;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const c = v.control;
  c.steer = Math.max(-1, Math.min(1, diff * 2.6));
  c.handbrake = false;
  let target = opts.speed || ai.cruise;
  if (ai.panic > 0) { target *= 1.6; ai.panic -= dt; }
  if (turning && left < 160 && left > -20) target = Math.min(target, 150);

  // look ahead for cars, people and the player in our path
  const fs = forwardSpeed(v);
  const look = TRAFFIC.followGap + Math.max(0, fs) * 0.45;
  const ca = Math.cos(v.a), sa = Math.sin(v.a);
  let blocked = false;
  const check = (o, rad) => {
    const ox = o.x - v.x, oy = o.y - v.y;
    const f = ox * ca + oy * sa, s = -ox * sa + oy * ca;
    if (f > 0 && f < look && Math.abs(s) < rad) blocked = true;
  };
  if (ai.panic <= 0) {
    for (const o of state.vehicles) if (o !== v && Math.abs(o.x - v.x) < 200 && Math.abs(o.y - v.y) < 200) check(o, 24);
    for (const o of state.peds) if (!o.dead && Math.abs(o.x - v.x) < 120 && Math.abs(o.y - v.y) < 120) check(o, 18);
    if (!state.player.car) check(state.player, 18);
  }
  if (blocked) {
    c.throttle = 0; c.brake = fs > 10 ? 1 : 0;
    ai.wait += dt;
    if (ai.wait > 3 && Math.random() < 0.01) sfx('horn', 0.4, v.x, v.y);
  } else {
    ai.wait = 0;
    c.throttle = fs < target ? 1 : 0;
    c.brake = fs > target + 60 ? 0.5 : 0;
  }
}

export function updateTraffic(state, dt) {
  const p = state.player;
  const rng = state.rng;
  const want = Math.round(TRAFFIC.cars * state.density);
  let civCars = 0;
  for (const v of state.vehicles) if (v.driver === 'ai') civCars += 1;
  if (civCars < want && rng() < 0.3) spawnCar(state);

  // despawn what is far behind (parked cars stay; wrecks and abandoned cars go once out of view)
  const keep = [];
  for (const v of state.vehicles) {
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    const removable = v.driver === 'ai' || v.dead || (v.driver === null && !v.parked) || v.driver === 'cop' && state.wanted.level === 0;
    if (removable && d > TRAFFIC.despawn && v !== p.car && !v.mission) continue;
    keep.push(v);
  }
  state.vehicles = keep;

  for (const v of state.vehicles) {
    if (v.driver === 'ai' && v.ai) driveAlongRoads(state, v, dt);
    else if (v.driver === null && !v.dead) { v.control.throttle = 0; v.control.brake = 0; v.control.steer = 0; v.control.handbrake = true; }
  }

  // pedestrians
  const wantPeds = Math.round(TRAFFIC.peds * state.density);
  let civ = 0;
  for (const ped of state.peds) if (ped.kind === 'civ' && !ped.dead) civ += 1;
  if (civ < wantPeds) spawnPed(state);
  const out = [];
  for (const ped of state.peds) {
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (ped.kind === 'civ' && d > TRAFFIC.despawn) continue;
    // a hired hand is in state.hands (heist/crew.js), but a stray one in the crowd must not be despawned
    if (ped.kind === 'hand') continue;
    if (ped.dead) { ped.deadTime += dt; if (ped.deadTime > 25 && d > 700) continue; }
    out.push(ped);
    if (ped.dead) { slide(state, ped, dt); continue; }
    if (ped.kind === 'civ') updateCivilian(state, ped, dt);
  }
  state.peds = out;
}


/** Dead or knocked-down bodies slide to a stop. */
function slide(state, ped, dt) {
  if (Math.abs(ped.kx) + Math.abs(ped.ky) < 2) return;
  moveCircle(state, ped, ped.kx * dt, ped.ky * dt);
  ped.kx *= Math.exp(-5 * dt); ped.ky *= Math.exp(-5 * dt);
}

/** A pedestrian in the path of the player's speeding car dives aside (most of the time). */
function dodge(state, ped, dt) {
  if (ped.dive > 0) {
    ped.dive -= dt;
    moveCircle(state, ped, ped.dvx * dt, ped.dvy * dt);
    ped.walk += dt * 16; ped.moving = true;
    return true;
  }
  const v = state.player.car;
  if (!v || ped.diveChecked > state.time) return false;
  ped.diveChecked = state.time + 0.1;
  const sp = Math.hypot(v.vx, v.vy);
  const dx = ped.x - v.x, dy = ped.y - v.y;
  // any moving car close by (mounting the kerb, nosing through a crowd) sends people running from it
  if (sp > 50 && dx * dx + dy * dy < 120 * 120 && ped.flee <= 0) {
    ped.flee = 2.5 + Math.random(); ped.fx = v.x; ped.fy = v.y; ped.mode = 'flee';
    if (Math.random() < 0.3) ped.shout = 1.2;
  }
  if (sp < 140) return false;
  const ahead = (dx * v.vx + dy * v.vy) / sp;             // distance along the car's travel
  const side = (-dx * v.vy + dy * v.vx) / sp;             // signed distance off its line
  if (ahead > 0 && ahead < sp * 0.45 && Math.abs(side) < 30 && Math.random() < 0.8) {
    const s = side >= 0 ? 1 : -1;
    ped.dive = 0.35;
    ped.dvx = (-v.vy / sp) * s * 330; ped.dvy = (v.vx / sp) * s * 330;
    ped.a = Math.atan2(ped.dvy, ped.dvx);
    ped.flee = Math.max(ped.flee, 2); ped.fx = v.x; ped.fy = v.y; ped.mode = 'flee';
    return true;
  }
  return false;
}

function updateCivilian(state, ped, dt) {
  slide(state, ped, dt);
  if (dodge(state, ped, dt)) return;
  // a witness on the phone (witnesses.js) stands still, facing where the shots came from
  if (ped.calling > 0) { ped.moving = false; ped.a = Math.atan2(ped.callY - ped.y, ped.callX - ped.x); return; }
  if (ped.flee > 0) {
    ped.flee -= dt;
    const dx = ped.x - ped.fx, dy = ped.y - ped.fy;
    const d = Math.hypot(dx, dy) || 1;
    const sp = TRAFFIC.pedRun;
    ped.a = Math.atan2(dy, dx);
    moveCircle(state, ped, (dx / d) * sp * dt, (dy / d) * sp * dt);
    ped.walk += dt * 14; ped.moving = true;
    if (ped.flee <= 0) ped.mode = 'return';
    return;
  }
  if (!ped.block) return;
  if (ped.mode === 'return') {
    ped.s = nearestLoopS(ped.block, ped.x, ped.y);
    const pt = loopPoint(ped.block, ped.s);
    const dx = pt.x - ped.x, dy = pt.y - ped.y, d = Math.hypot(dx, dy);
    if (d < 4) { ped.mode = 'path'; return; }
    ped.a = Math.atan2(dy, dx);
    moveCircle(state, ped, (dx / d) * ped.speed * dt, (dy / d) * ped.speed * dt);
    ped.walk += dt * 6;
    if (d > 400) ped.block = null;
    return;
  }
  // stroll around the block, now and then turning back
  ped.s += ped.speed * ped.dirSign * dt;
  if (Math.random() < 0.0015) ped.dirSign *= -1;
  const pt = loopPoint(ped.block, ped.s);
  ped.x = pt.x; ped.y = pt.y;
  ped.a = pt.a + (ped.dirSign < 0 ? Math.PI : 0);
  ped.walk += dt * 6; ped.moving = true;
}

/** Everyone within earshot of a gunshot (or a crash) runs from it. */
export function scarePeople(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.dead || ped.kind !== 'civ') continue;
    if (Math.abs(ped.x - x) > radius || Math.abs(ped.y - y) > radius) continue;
    ped.flee = 4 + Math.random() * 3; ped.fx = x; ped.fy = y; ped.mode = 'flee';
  }
  for (const v of state.vehicles) {
    if (v.driver === 'ai' && v.ai && Math.hypot(v.x - x, v.y - y) < radius) v.ai.panic = 3;
  }
}

/** Damage a person; deaths drop cash and count as crimes when the player did it. */
export function hurtPed(state, ped, damage, by, nx = 0, ny = 0) {
  if (ped.dead) return;
  ped.health -= damage;
  ped.kx += nx * 120; ped.ky += ny * 120;
  const byPlayer = by === 'player' || by === 'player-car';
  if (ped.kind === 'civ') { ped.flee = 6; ped.fx = ped.x - nx * 50; ped.fy = ped.y - ny * 50; }
  if (ped.health > 0) {
    if (byPlayer) state.crime(ped.kind === 'cop' ? 'copHit' : ped.kind === 'gang' ? 'none' : by === 'player-car' ? 'roadBump' : 'pedHit', ped.x, ped.y);
    if (ped.kind === 'gang' || ped.kind === 'cop') ped.alert = 5;
    return;
  }
  ped.dead = true;
  ped.deadTime = 0;
  sfx('hurt', 0.6, ped.x, ped.y);
  addDecal(state, 'blood', ped.x, ped.y, 0, 1);
  if (byPlayer) {
    state.stats.kills += 1;
    if (ped.kind === 'cop') state.crime('copKill', ped.x, ped.y);
    else if (ped.kind === 'civ') state.crime(by === 'player-car' ? 'roadKill' : 'pedKill', ped.x, ped.y);
    state.onPedKilled && state.onPedKilled(ped);
  }
  if (ped.kind !== 'cop' && Math.random() < TRAFFIC.cashDropChance + (ped.kind === 'gang' ? 0.5 : 0)) {
    state.pickups.push({ kind: 'cash', x: ped.x + 8, y: ped.y + 8, amount: ped.kind === 'gang' ? 150 + Math.floor(Math.random() * 150) : 10 + Math.floor(Math.random() * 60), life: 30 });
  }
  if (ped.kind === 'cop' && Math.random() < 0.6) state.pickups.push({ kind: 'ammo', x: ped.x + 8, y: ped.y, life: 30 });
  scarePeople(state, ped.x, ped.y, 260);
}

/** Pull the driver out of a car: a civilian runs, a cop stays to fight. */
export function ejectDriver(state, v, x, y) {
  const kind = v.driver === 'cop' ? 'cop' : v.driver === 'gang' ? 'gang' : 'civ';
  const ped = makePerson(kind, x, y, state.rng);
  if (kind === 'civ') { ped.flee = 6; ped.fx = v.x; ped.fy = v.y; ped.mode = 'flee'; ped.health = TRAFFIC.pedHealth; }
  state.onEject && state.onEject(ped, v);
  state.peds.push(ped);
  v.driver = null;
  v.ai = null;
  return ped;
}

/** Walk or drive over a pickup to take it. */
export function updatePickups(state, dt) {
  const p = state.player;
  const out = [];
  for (const it of state.pickups) {
    it.life -= dt;
    if (it.life <= 0) continue;
    if (Math.hypot(it.x - p.x, it.y - p.y) < (p.car ? 34 : 22)) {
      if (it.kind === 'cash') { state.addMoney(it.amount, it.x, it.y); sfx('cash', 0.7, it.x, it.y); }
      else if (it.kind === 'health') { p.health = Math.min(100, p.health + 40); state.notify('+40 health', '#7dff8a'); sfx('cash', 0.5, it.x, it.y); }
      else if (it.kind === 'ammo') {
        // ammo for every weapon the player owns
        p.ammo.pistol += 24;
        if (state.progress.smg) p.ammo.smg += 60;
        if (state.progress.owned?.shotgun) p.ammo.shotgun += 8;
        if (state.progress.owned?.carbine) p.ammo.carbine += 40;
        floatText(state, it.x, it.y - 10, '+AMMO', '#ffd36b'); sfx('reload', 0.7, it.x, it.y);
      }
      burst(state, 'cash', it.x, it.y, 1, 1);
      continue;
    }
    out.push(it);
  }
  state.pickups = out;
}

