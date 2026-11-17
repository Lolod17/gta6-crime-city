// The Puerto Ámbar Police Department: heat and wanted stars, patrol cruisers, pursuit that hunts
// the player through the street grid and rams, cops on foot who arrest or shoot, a helicopter
// from four stars, line of sight, and escape: stay out of sight long enough and the stars go.
import { POLICE, CAR, PLAYER, TRAFFIC } from './config.js';
import { lineOfSight, roadCenter, nearestNode, ROADS_X, ROADS_Y } from './city.js';
import { createVehicle, forwardSpeed, speedOf } from './vehicle.js';
import { driveAlongRoads, makePerson, DIRS, validDir, pickTurn, laneX, laneY } from './traffic.js';
import { moveCircle, spawnBullet } from './player.js';
import { burst } from './render.js';
import { sfx } from './audio.js';

export function createWanted() {
  return { heat: 0, level: 0, evade: 0, seen: false, lastX: 0, lastY: 0, min: 0, max: 5, flash: 0, peak: 0 };
}

/** Stars for a heat value, from the rising thresholds in POLICE.starHeat. */
export function starsFor(heat) {
  let k = 0;
  while (k < POLICE.maxStars && heat >= POLICE.starHeat[k + 1]) k += 1;
  return k;
}

export const evadeTime = (level) => POLICE.evadeBase + POLICE.evadePerStar * level;

/** A crime at (x, y): adds heat (full if a cop sees it, half if only bystanders do). */
export function reportCrime(state, kind, x, y) {
  const heat = POLICE.heatPerCrime[kind];
  if (!heat) return;
  const w = state.wanted;
  // repeated minor crimes in quick succession (a scrape along a cruiser, a burst of fire) count once
  w.cool = w.cool || {};
  const gap = kind === 'copCarHit' ? 2 : kind === 'gunfire' ? 0.8 : 0;
  if (gap && state.time - (w.cool[kind] || -99) < gap) return;
  w.cool[kind] = state.time;
  const copSees = state.vehicles.some((v) => v.police && v.driver === 'cop' && near(v, x, y, POLICE.sight) && lineOfSight(state.city, v.x, v.y, x, y))
    || state.peds.some((p) => p.kind === 'cop' && !p.dead && near(p, x, y, POLICE.sight) && lineOfSight(state.city, p.x, p.y, x, y));
  const serious = kind === 'pedKill' || kind === 'copHit' || kind === 'copKill' || kind === 'roadKill';
  const k = copSees || serious ? 1 : 0.5;
  addHeat(state, heat * k);
  if (copSees || w.level > 0) { w.seen = true; w.evade = 0; w.lastX = x; w.lastY = y; }
}

export function addHeat(state, amount) {
  const w = state.wanted;
  const before = w.level;
  // a mission can pin the level between min and max (Heat holds it at exactly three stars)
  w.heat = Math.min(POLICE.starHeat[w.max] + 60, w.heat + amount);
  w.level = Math.max(w.min, Math.min(w.max, starsFor(w.heat)));
  if (w.level > before) {
    w.flash = 1.5;
    w.evade = 0;
    w.peak = Math.max(w.peak, w.level);
    state.notify(`WANTED ${'★'.repeat(w.level)}`, '#ff5a5a');
    sfx('alert', 0.8);
  }
}

/** Set the wanted level outright (missions use this). */
export function setWanted(state, level, min = 0, max = POLICE.maxStars) {
  const w = state.wanted;
  w.min = min;
  w.max = max;
  w.heat = Math.max(w.heat, POLICE.starHeat[level] + 20);
  w.level = Math.min(max, Math.max(level, starsFor(w.heat)));
  w.flash = 1.5; w.evade = 0; w.seen = true;
  w.lastX = state.player.x; w.lastY = state.player.y;
  w.peak = Math.max(w.peak, w.level);
}

export function clearWanted(state) {
  const w = state.wanted;
  w.heat = 0; w.level = 0; w.evade = 0; w.min = 0; w.max = POLICE.maxStars; w.seen = false;
}

function near(e, x, y, r) { return Math.abs(e.x - x) < r && Math.abs(e.y - y) < r && Math.hypot(e.x - x, e.y - y) < r; }

function spawnCruiser(state, pursuing) {
  const p = state.player;
  const rng = state.rng;
  // while they can see the player, reinforcements come from ahead of them; while searching, they
  // converge on the last place the player was seen, so breaking line of sight really is an escape
  const body = p.car || p;
  const w = state.wanted;
  const hx = w.seen ? p.x + (body.vx || 0) * 1.2 : w.lastX, hy = w.seen ? p.y + (body.vy || 0) * 1.2 : w.lastY;
  for (let tries = 0; tries < 12; tries += 1) {
    const i = rng.int(0, ROADS_X - 1), j = rng.int(0, ROADS_Y - 1);
    const x = roadCenter(i), y = roadCenter(j);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < TRAFFIC.spawnMin * 0.9 || d > TRAFFIC.spawnMax * 1.15) continue;
    if (pursuing && Math.hypot(x - hx, y - hy) > d + 200) continue;
    const dd = [0, 1, 2, 3].filter((k) => validDir(i, j, k));
    const dir = rng.pick(dd);
    const v = createVehicle('cruiser', dir % 2 === 0 ? x : laneX(i, dir), dir % 2 === 1 ? y : laneY(j, dir), Math.atan2(DIRS[dir][1], DIRS[dir][0]), rng);
    if (state.vehicles.some((o) => Math.hypot(o.x - v.x, o.y - v.y) < 70)) continue;
    v.driver = 'cop';
    v.ai = { d: dir, i: i + DIRS[dir][0], j: j + DIRS[dir][1], next: dir, panic: 0, wait: 0, cruise: 200, mode: pursuing ? 'pursue' : 'patrol', stuck: 0, reverse: 0, shoot: rng.range(0, 1) };
    v.ai.next = pickTurn(rng, v.ai.i, v.ai.j, dir);
    v.siren = pursuing;
    state.vehicles.push(v);
    return v;
  }
  return null;
}

/** Steer a cruiser at a point: straight when it can see it, else along the grid toward it. */
function steerPursuit(state, v, dt, tx, ty, canSee) {
  const ai = v.ai;
  const c = v.control;
  let gx = tx, gy = ty;
  if (!canSee) {
    // grid navigation: head to the junction next along the bigger axis gap
    const me = nearestNode(v.x, v.y), goal = nearestNode(tx, ty);
    let ni = me.i, nj = me.j;
    const atNode = Math.hypot(v.x - me.x, v.y - me.y) < 90;
    if (atNode || ai.navI === undefined) {
      const di = goal.i - me.i, dj = goal.j - me.j;
      if (di === 0 && dj === 0) { ni = goal.i; nj = goal.j; }
      else if (Math.abs(di) >= Math.abs(dj)) ni += Math.sign(di); else nj += Math.sign(dj);
      if (atNode) { ai.navI = ni; ai.navJ = nj; }
      else if (ai.navI === undefined) { ai.navI = me.i; ai.navJ = me.j; }
    }
    gx = roadCenter(ai.navI); gy = roadCenter(ai.navJ);
    if (Math.hypot(gx - v.x, gy - v.y) < 50) ai.navI = undefined;
  } else ai.navI = undefined;

  let diff = Math.atan2(gy - v.y, gx - v.x) - v.a;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const fs = forwardSpeed(v);
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    c.throttle = 0; c.brake = 1; c.steer = -Math.sign(diff); c.handbrake = false;
    return;
  }
  c.steer = Math.max(-1, Math.min(1, diff * 3));
  const dist = Math.hypot(tx - v.x, ty - v.y);
  const sharp = Math.abs(diff) > 1.2;
  c.handbrake = sharp && fs > 260;
  c.throttle = sharp && fs > 300 ? 0 : 1;
  c.brake = sharp && fs > 380 ? 1 : 0;
  v.speedMul = dist > 900 ? 1.25 : 1;   // rubber band: cruisers far behind close the gap
  // stuck against something: back off and try again
  if (Math.abs(fs) < 25 && c.throttle > 0) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
  if (ai.stuck > 1.1) { ai.stuck = 0; ai.reverse = 0.7; }
}

function copShoot(state, from, x, y, spread) {
  const p = state.player;
  const a = Math.atan2(p.y - y, p.x - x) + (Math.random() - 0.5) * spread;
  spawnBullet(state, x + Math.cos(a) * 18, y + Math.sin(a) * 18, a, 1300, POLICE.shootDamage, 600, 'cop', from);
  burst(state, 'muzzle', x + Math.cos(a) * 18, y + Math.sin(a) * 18, 1, 1);
  sfx('gunshot', 0.55, x, y);
}

export function updatePolice(state, dt) {
  const w = state.wanted;
  const p = state.player;
  const body = p.car || p;
  if (w.flash > 0) w.flash -= dt;

  // who can see the player right now?
  let seen = false;
  const sight = POLICE.sight * (p.car ? 1.1 : 0.9);
  for (const v of state.vehicles) {
    if (!v.police || v.driver !== 'cop') continue;
    v.canSee = near(v, p.x, p.y, sight) && lineOfSight(state.city, v.x, v.y, p.x, p.y);
    if (v.canSee) seen = true;
  }
  for (const c of state.peds) {
    if (c.kind !== 'cop' || c.dead) continue;
    c.canSee = near(c, p.x, p.y, sight * 0.9) && lineOfSight(state.city, c.x, c.y, p.x, p.y);
    if (c.canSee) seen = true;
  }
  const heli = state.heli;
  if (heli.active && Math.hypot(heli.spotX - p.x, heli.spotY - p.y) < 110) seen = true;

  if (w.level > 0) {
    if (seen) { w.evade = 0; w.lastX = p.x; w.lastY = p.y; }
    else {
      w.evade += dt;
      if (w.evade >= evadeTime(w.level) && w.min === 0) {
        clearWanted(state);
        state.notify('You lost them', '#7dff8a');
        state.stats.escapes += 1;
        sfx('escape', 0.7);
        state.onEscape && state.onEscape();
      }
    }
  }
  w.seen = seen;

  // keep the right number of cruisers alive
  let pursuers = 0, patrols = 0;
  for (const v of state.vehicles) {
    if (!v.police || v.driver !== 'cop' || v.dead) continue;
    if (v.ai && v.ai.mode === 'pursue') pursuers += 1; else patrols += 1;
  }
  const wantCars = Math.round(POLICE.carsPerStar[w.level] * Math.max(0.6, state.density));
  if (w.level > 0 && pursuers < wantCars && state.rng() < (w.seen ? 0.05 : 0.012)) spawnCruiser(state, true);
  if (w.level === 0 && patrols < POLICE.patrolCars && state.rng() < 0.01) spawnCruiser(state, false);

  // drive each cruiser
  for (const v of state.vehicles) {
    if (!v.police || v.driver !== 'cop' || v.dead || !v.ai) continue;
    const ai = v.ai;
    if (w.level > 0 && ai.mode !== 'pursue') { ai.mode = 'pursue'; v.siren = true; }
    if (w.level === 0 && ai.mode === 'pursue') {
      ai.mode = 'patrol'; v.siren = false; v.speedMul = 1;
      const nd = nearestNode(v.x, v.y);
      ai.i = nd.i; ai.j = nd.j; ai.d = 0;
      const dd = [0, 1, 2, 3].filter((k) => validDir(nd.i, nd.j, k));
      ai.d = dd[0]; ai.next = pickTurn(state.rng, nd.i, nd.j, ai.d);
    }
    if (ai.mode === 'patrol') { driveAlongRoads(state, v, dt, { speed: 190 }); continue; }
    const lead = Math.min(0.8, Math.hypot(p.x - v.x, p.y - v.y) / 700);
    const tx = w.seen ? p.x + (body.vx || 0) * lead : w.lastX, ty = w.seen ? p.y + (body.vy || 0) * lead : w.lastY;
    steerPursuit(state, v, dt, tx, ty, v.canSee);
    const d = Math.hypot(p.x - v.x, p.y - v.y);
    // dismount next to a player on foot or one who has stopped
    const playerSlow = !p.car || speedOf(p.car) < 60;
    const footCops = state.peds.reduce((n, c) => n + (c.kind === 'cop' && !c.dead ? 1 : 0), 0);
    if (d < 150 && playerSlow && speedOf(v) < 120 && w.level >= 1 && footCops < POLICE.footPerStar[w.level]) {
      v.control.throttle = 0; v.control.brake = 1;
      if (speedOf(v) < 40 && !v.dismounted) {
        v.dismounted = true;
        const n = w.level >= 3 ? 2 : 1;
        for (let k = 0; k < n; k += 1) {
          const side = v.a + (k === 0 ? -Math.PI / 2 : Math.PI / 2);
          const cop = makePerson('cop', v.x + Math.cos(side) * 28, v.y + Math.sin(side) * 28, state.rng);
          dressCop(cop);
          cop.car = v;
          state.peds.push(cop);
        }
        v.driver = null; v.siren = true;
      }
    }
    // shooting from the car at three stars and up
    if (w.level >= POLICE.carShootStar && v.canSee && d < 380 && v.driver === 'cop') {
      ai.shoot -= dt;
      if (ai.shoot <= 0) { ai.shoot = POLICE.shootRate * 2.4 + state.rng() * 0.8; copShoot(state, v, v.x, v.y, 0.22); }
    }
  }

  // cops on foot
  let bustNear = false;
  for (const c of state.peds) {
    if (c.kind !== 'cop' || c.dead) continue;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (w.level === 0) {
      // stand down: walk back to the cruiser and drive off, or just leave
      if (c.car && !c.car.dead) {
        const cd = Math.hypot(c.car.x - c.x, c.car.y - c.y);
        if (cd < 26) { c.car.driver = 'cop'; c.car.dismounted = false; c.car.siren = false; c.car.ai && (c.car.ai.mode = 'patrol'); c.remove = true; continue; }
        walkTo(state, c, c.car.x, c.car.y, TRAFFIC.pedWalk * 2, dt);
      } else if (d > 900) c.remove = true;
      continue;
    }
    c.a = Math.atan2(p.y - c.y, p.x - c.x);
    const shoots = w.level >= POLICE.shootFromStar && c.canSee;
    const keep = shoots ? 170 : 14;
    if (d > keep) walkTo(state, c, p.x, p.y, TRAFFIC.pedRun * 0.95, dt);
    else c.moving = false;
    if (shoots && d < 420) {
      c.cooldown -= dt;
      if (c.cooldown <= 0) { c.cooldown = POLICE.shootRate + state.rng() * 0.5; copShoot(state, c, c.x, c.y, p.car ? 0.2 : 0.12); }
    }
    // climb back in and resume the chase once the player drives off
    if (c.car && !c.car.dead && p.car && speedOf(p.car) > 200 && d > 220) {
      const cd = Math.hypot(c.car.x - c.x, c.car.y - c.y);
      if (cd < 30) { c.car.driver = 'cop'; c.car.dismounted = false; c.car.ai = c.car.ai || { mode: 'pursue', stuck: 0, reverse: 0, shoot: 1 }; c.remove = true; continue; }
      walkTo(state, c, c.car.x, c.car.y, TRAFFIC.pedRun, dt);
    }
    if (!p.car && d < 30 && p.health > 0) bustNear = true;
  }
  state.peds = state.peds.filter((c) => !c.remove);

  // arrest: a cop's hand on a player who is on foot (or boxed in at low stars)
  let boxed = false;
  if (p.car && w.level > 0 && w.level <= 2 && speedOf(p.car) < 15) {
    boxed = state.vehicles.some((v) => v.police && v !== p.car && Math.hypot(v.x - p.car.x, v.y - p.car.y) < 75);
  }
  if ((bustNear || boxed) && w.level > 0) {
    p.bust += dt;
    if (p.bust > PLAYER.bustTime) state.busted();
  } else p.bust = Math.max(0, p.bust - dt * 2);

  updateHelicopter(state, dt);
}

export function dressCop(c) {
  c.shirt = '#1f3d7a'; c.pants = '#14213d'; c.hat = '#14213d'; c.armed = true; c.health = 50;
  c.skin = c.skin || '#c98e62';
}

function walkTo(state, c, x, y, speed, dt) {
  const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy) || 1;
  c.a = Math.atan2(dy, dx);
  moveCircle(state, c, (dx / d) * speed * dt, (dy / d) * speed * dt);
  c.walk += dt * (speed / 12); c.moving = true;
}

function updateHelicopter(state, dt) {
  const h = state.heli;
  const p = state.player;
  const w = state.wanted;
  if (w.level >= POLICE.helicopterStar && !h.active) {
    h.active = true;
    h.x = p.x - 900; h.y = p.y - 700; h.spotX = h.x; h.spotY = h.y; h.a = 0; h.shoot = 2;
  }
  if (!h.active) return;
  if (w.level < POLICE.helicopterStar) {
    // fly away
    h.x += 260 * dt; h.y -= 200 * dt;
    if (Math.hypot(h.x - p.x, h.y - p.y) > 1600) h.active = false;
    return;
  }
  const tx = p.x - 60, ty = p.y - 80;
  const dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy);
  const sp = Math.min(330, d * 1.3);
  if (d > 1) { h.x += (dx / d) * sp * dt; h.y += (dy / d) * sp * dt; }
  h.a += (Math.atan2(dy, dx) - h.a) * Math.min(1, 2 * dt);
  // the spotlight trails toward the player and loses them at speed
  h.spotX += (p.x - h.spotX) * Math.min(1, 2.4 * dt);
  h.spotY += (p.y - h.spotY) * Math.min(1, 2.4 * dt);
  if (w.level >= 5 && Math.hypot(h.spotX - p.x, h.spotY - p.y) < 80) {
    h.shoot -= dt;
    if (h.shoot <= 0) { h.shoot = 0.5; copShoot(state, h, h.x, h.y, 0.25); }
  }
}

export function createHeli() {
  return { active: false, x: 0, y: 0, a: 0, spotX: 0, spotY: 0, shoot: 0 };
}

/** Cops spawned from a pulled-over cruiser stay cops. */
export function onEjectCop(state, ped) {
  if (ped.kind === 'cop') { dressCop(ped); }
}

export { CAR };
