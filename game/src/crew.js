// crew.js — JOB: hostile gunmen on foot: spawning a crew, waking it, and its fight behaviour.
// EXPORTS: openGround, spawnCrew, ring, updateCrew, alive, dismissCrew
//
// Hostile crews on foot: the Glasshands and anyone else who shoots back. Used by the warehouse
// shootout, the protection job, the docks betrayal and the rampage. A crew member wakes when they
// see the player (or their target) or get shot, then the whole crew joins in: they keep a fighting
// distance, strafe, and fire. Targets are the player plus any protected person a job adds.
import { GANG } from './config.js';
import { lineOfSight, isBlocked } from './city.js';
import { makePerson } from './traffic.js';
import { moveCircle, spawnBullet } from './player.js';
import { burst } from './render.js';
import { sfx } from './audio.js';

/** Open ground near (x, y): spiral out until nothing solid is under a person. */
export function openGround(city, x, y, pad = 12) {
  let gx = x, gy = y;
  for (let k = 0; k < 60 && isBlocked(city, gx, gy, pad); k += 1) {
    gx = x + Math.cos(k * 1.3) * (8 + k * 4);
    gy = y + Math.sin(k * 1.3) * (8 + k * 4);
  }
  return { x: gx, y: gy };
}

/**
 * Put a crew on the ground at offsets around a centre.
 * opts: shirt, hat, health, awake (start hunting at once), look (extra fields on each member).
 */
export function spawnCrew(state, cx, cy, offsets, opts = {}) {
  const crew = [];
  for (const [dx, dy] of offsets) {
    const pt = openGround(state.city, cx + dx, cy + dy);
    const g = makePerson('gang', pt.x, pt.y, state.rng);
    g.shirt = opts.shirt || '#2a2a2a'; g.pants = '#1a1a1a'; g.hat = opts.hat === undefined ? '#c0e8ff' : opts.hat; g.armed = true;
    g.health = opts.health || GANG.health; g.cooldown = 0.5 + state.rng() * 1.5;
    g.alert = opts.awake ? 6 : 0; g.strafe = state.rng() < 0.5 ? 1 : -1;
    g.mission = true;
    Object.assign(g, opts.look || {});
    state.peds.push(g);
    crew.push(g);
  }
  return crew;
}

/** A ring of n offsets at radius r (for crews that arrive from all sides). */
export function ring(n, r, phase = 0) {
  return Array.from({ length: n }, (_, k) => [Math.cos(phase + (k / n) * Math.PI * 2) * r, Math.sin(phase + (k / n) * Math.PI * 2) * r]);
}

/** Step a crew. `targets` are extra people they hunt besides the player (a protected client). */
export function updateCrew(state, crew, dt, targets = [], fightFlag = { on: false }) {
  const p = state.player;
  for (const g of crew) {
    if (g.dead) continue;
    // holding fire (a standoff while somebody talks): face the player, do nothing else
    if (g.hold > 0) { g.hold -= dt; g.a = Math.atan2(p.y - g.y, p.x - g.x); g.moving = false; continue; }
    // a coward (Dario at the docks) never fights: he runs from the player and is gone
    if (g.coward) {
      const a = Math.atan2(g.y - p.y, g.x - p.x);
      g.a = a; moveCircle(state, g, Math.cos(a) * 190 * dt, Math.sin(a) * 190 * dt);
      g.walk += dt * 14; g.moving = true;
      if (Math.hypot(g.x - p.x, g.y - p.y) > 700) g.remove = true;
      continue;
    }
    // pick a target: the player, unless a protected person is clearly nearer (by a third). The player
    // can draw the fire by stepping in; picking strictly the nearest let a squad of three focus the
    // protection client and kill him in seconds while the player was still closing in
    let tgt = p, d = Math.hypot(p.x - g.x, p.y - g.y);
    for (const t of targets) {
      if (t.dead || t.hidden) continue;
      const dt2 = Math.hypot(t.x - g.x, t.y - g.y);
      if (dt2 < d * 0.66) { tgt = t; d = dt2; }
    }
    const sees = d < GANG.sight && lineOfSight(state.city, g.x, g.y, tgt.x, tgt.y);
    if (sees || g.alert > 0) fightFlag.on = true;
    if (sees || fightFlag.on) g.alert = 6;
    if (g.alert <= 0) { g.moving = false; continue; }
    g.alert -= dt;
    g.a = Math.atan2(tgt.y - g.y, tgt.x - g.x);
    const ca = Math.cos(g.a), sa = Math.sin(g.a);
    let mx = 0, my = 0;
    if (d > 240 || !sees) { mx = ca; my = sa; } else if (d < 120) { mx = -ca; my = -sa; }
    mx += -sa * g.strafe * 0.7; my += ca * g.strafe * 0.7;
    if (Math.random() < 0.01) g.strafe *= -1;
    moveCircle(state, g, mx * 120 * dt, my * 120 * dt);
    g.walk += dt * 10; g.moving = true;
    if (sees && !(tgt === p && p.health <= 0)) {
      g.cooldown -= dt;
      if (g.cooldown <= 0) {
        g.cooldown = GANG.shootRate + state.rng() * 0.6;
        const a = g.a + (Math.random() - 0.5) * 0.2;
        spawnBullet(state, g.x + ca * 16, g.y + sa * 16, a, 1300, GANG.damage, 520, 'gang', g);
        burst(state, 'muzzle', g.x + ca * 16, g.y + sa * 16, 1, 1);
        sfx('gunshot', 0.5, g.x, g.y);
      }
    }
  }
}

/** Living members of a crew. */
export const alive = (crew) => crew.filter((g) => !g.dead && !g.coward).length;

/** A job ended: whoever is left walks away (removed), the bodies stay. */
export function dismissCrew(state, crew) {
  for (const g of crew) { g.mission = false; if (!g.dead) g.remove = true; }
  state.peds = state.peds.filter((g) => !g.remove);
}
