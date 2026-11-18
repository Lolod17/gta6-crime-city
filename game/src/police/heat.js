// police/heat.js — JOB: the wanted level: heat from crimes, stars from heat, what the PAPD can see, and the
//   evade clock that takes the stars away when nobody has seen the player for long enough.
// EXPORTS: createWanted, starsFor, evadeTime, reportCrime, addHeat, setWanted, lowerWanted, clearWanted, updateHeat
// USES: ../config.js, ../city.js, ../audio.js
// MUST NOT: spawn, steer or shoot with anything (that is police/pursuit.js).
import { POLICE } from '../config.js';
import { lineOfSight } from '../city.js';
import { sfx } from '../audio.js';

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

/** Take one star off (a courier run keeps the player low-key). */
export function lowerWanted(state) {
  const w = state.wanted;
  if (w.level <= 1) { if (w.level === 1) clearWanted(state); return; }
  w.level -= 1;
  w.heat = POLICE.starHeat[w.level] + 10;
  w.evade = 0;
}

export function clearWanted(state) {
  const w = state.wanted;
  w.heat = 0; w.level = 0; w.evade = 0; w.min = 0; w.max = POLICE.maxStars; w.seen = false;
}

function near(e, x, y, r) { return Math.abs(e.x - x) < r && Math.abs(e.y - y) < r && Math.hypot(e.x - x, e.y - y) < r; }

/** Each step: fade the star flash, work out who can see the player, and run the evade clock. */
export function updateHeat(state, dt) {
  const w = state.wanted;
  const p = state.player;
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
}
