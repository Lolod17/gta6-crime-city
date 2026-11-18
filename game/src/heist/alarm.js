// heist/alarm.js — JOB: the bank alarm and the city lockdown it sets off: raising the alarm turns every
//   PAPD car toward the Banco de Ámbar, shuts the Southside port gates and starts a 90-second escape clock
//   that the HUD and the job runner read.
// EXPORTS: HEIST, createHeist, alarmTunables, raiseAlarm, quietAlarm, resetAlarm, updateAlarm, gateBlockedAt,
//   lockdownRoll, heistTimerText, heistPhase, crewCutShare
// USES: ../config.js, ../city.js, ../police.js, ../audio.js, ../render.js
// MUST NOT: draw anything (heist/route.js and hud/*.js do) or read the input; it owns the heist clock and
//   the lockdown state, and police/pursuit.js asks it where to send a cruiser.
//
// The heist arc runs on one little state machine kept in state.heist:
//
//   idle ──raiseAlarm()──▶ alarm ──90 s──▶ over
//     ▲                      │                │
//     └──────quietAlarm()────┴────────────────┘
//
// An ALARM IS LOUD. While it lasts, the PAPD does not need to see the player to chase: every cruiser in
// the city is given the bank's address as its target, reinforcements are spawned up the roads that lead
// there, and the port stops working: its three gates drop shut and a car that tries to leave through
// one is turned back. The only way off the clock is to survive it: ninety seconds after the alarm, the
// lockdown lifts and the timer reads ESCAPED. A job stage may also quiet it (quietAlarm) when the player
// gets away inside a mission's own rules.
//
// The numbers are here, at the top, so a play-test can tune the ninety seconds without hunting through
// the missions. HEIST is the frozen copy the rest of the game imports; alarmTunables() hands out the live
// object a runner may edit.

import { roadCenter, isBlocked, nearestNode } from '../city.js';
import { setWanted } from '../police.js';
import { sfx } from '../audio.js';
import { burst } from '../render.js';

/** Tunables for the heist arc. One object: the escape clock, the gates, the chase boost and the crew's cut. */
export const HEIST = {
  escapeSeconds: 90,       // the brief's ninety seconds: the alarm gives the player this long to be gone
  startStars: 3,           // raising the alarm puts three stars on the player at once ...
  peakStars: 5,            // ... and lets it climb to five, the full PAPD response
  converge: 1,             // fraction of the city's cruisers sent to the bank address while the alarm holds
  reinforceEvery: 5.5,     // seconds between cruisers called in while the alarm is up
  gateCount: 3,            // the Southside port's three gates (as LAST CALL drives them)
  gateRadius: 96,          // a car this close to a closed gate is held there
  gateShutAt: 0.4,         // seconds after the alarm before every gate is down
  cutPercent: 0.25,        // the crew's cut of the take: a quarter each, off the top
  bankReward: 12000,       // the Banco de Ámbar's safe, before the crew's cut
  probeReward: 2500,       // casing the bank
  substationReward: 4000,  // cutting the substation feed
  sirenHold: 2.5,          // seconds the alarm klaxon rings (audio only)
};

/** The live tunables: jobs.js and the missions read this so a play-test can edit one number. */
export function alarmTunables() { return HEIST; }

/**
 * A fresh heist record. Kept on the state object from boot; every field it grows later (the route, the
 * crew, the take) is listed here so a save/load or a new game starts from a known shape.
 */
export function createHeist() {
  return {
    status: 'idle',        // 'idle' | 'alarm' | 'over'
    timer: 0,              // seconds left on the escape clock
    total: HEIST.escapeSeconds,
    gates: [],             // the port gates, each { x, y, shut, held }
    bank: null,            // the Banco de Ámbar: { x, y, name }
    address: null,         // where the PAPD is being sent (the bank while the alarm holds)
    raisedAt: 0,           // state.time when the alarm went up
    lastReinforce: 0,
    converged: 0,          // how many cruisers were pointed at the bank (for the play-test print)
    spawns: 0,             // cruisers called in by the alarm
    escapes: 0,
    klaxon: 0,             // seconds of klaxon left (audio)
    log: [],               // short strings: what the alarm did, in order
    take: 0,               // the last robbery's gross take, for the crew's cut
    cut: 0,                // ... and what the crew took out of it
  };
}

/** Push one line onto the heist log, keeping the last 24. */
function note(h, text) {
  h.log.push(text);
  if (h.log.length > 24) h.log.shift();
}

/**
 * Ring it. `why` is shown to the player ("the vault tripped the alarm"), `at` is the bank, and `port` is
 * where the Southside gates are. Safe to call twice: the second call only tops the clock back up.
 */
export function raiseAlarm(state, why = 'The alarm is going', opts = {}) {
  const h = state.heist;
  if (!h) return null;
  const P = state.city.places;
  const bank = opts.bank || (P && P.bank) || null;
  const wasHot = h.status === 'alarm';
  h.bank = bank ? { x: bank.x, y: bank.y, name: 'BANCO DE ÁMBAR' } : h.bank;
  h.address = h.bank ? { x: h.bank.x, y: h.bank.y } : null;
  h.status = 'alarm';
  h.timer = h.total;
  h.raisedAt = state.time;
  h.klaxon = HEIST.sirenHold;
  h.converged = 0;
  h.spawns = 0;
  // the gates: LAST CALL's three, so a heist and a port job agree on where the port lets you out
  const gates = opts.gates || (P && P.portGates) || [];
  h.gates = gates.map((g) => ({ x: g.x, y: g.y, shut: false, held: 0 }));
  for (const g of h.gates) g.shut = true;
  // three stars at once, five allowed: the whole city answers
  setWanted(state, HEIST.startStars, 0, HEIST.peakStars);
  state.wanted.seen = true;
  state.wanted.lastX = h.address ? h.address.x : state.player.x;
  state.wanted.lastY = h.address ? h.address.y : state.player.y;
  note(h, wasHot ? 'alarm re-rung' : `ALARM: ${why}`);
  note(h, `PAPD sent to the bank, ${HEIST.gateCount} port gates shut`);
  state.notify(`ALARM — ${why.toUpperCase()}`, '#ff5a5a');
  sfx('alert', 1);
  sfx('siren', 0.7);
  if (h.address) burst(state, 'spark', h.address.x, h.address.y, 10, 1.4);
  return h;
}

/** The lock lifts early (a job stage beats the clock, or the player is taken). */
export function quietAlarm(state, why = 'escaped') {
  const h = state.heist;
  if (!h || h.status === 'idle') return;
  h.status = 'over';
  h.timer = 0;
  h.klaxon = 0;
  for (const g of h.gates) { g.shut = false; g.held = 0; }
  h.escapes += 1;
  note(h, `lockdown lifted: ${why}`);
  state.notify('Lockdown lifted', '#7dff8a');
  sfx('escape', 0.8);
}

/** Back to idle (a new game, a respawn, a failed job). */
export function resetAlarm(state) {
  const h = state.heist;
  if (!h) return;
  h.status = 'idle';
  h.timer = 0;
  h.klaxon = 0;
  h.converged = 0;
  h.spawns = 0;
  h.take = 0;
  h.cut = 0;
  for (const g of h.gates || []) { g.shut = false; g.held = 0; }
}

/** Where the PAPD should be sent right now: the bank while the alarm holds, else null. */
export function alarmAddress(state) {
  const h = state.heist;
  return h && h.status === 'alarm' ? h.address : null;
}

/** Which port gate, if any, is shut under a point (a car close to it). */
export function gateBlockedAt(state, x, y) {
  const h = state.heist;
  if (!h || h.status !== 'alarm') return null;
  for (const g of h.gates) {
    if (g.shut && Math.hypot(g.x - x, g.y - y) < HEIST.gateRadius) return g;
  }
  return null;
}

/**
 * The escape clock. Runs while the heist state says alarm: ticks down, tells the HUD, holds cars at the
 * shut port gates and, when it reaches zero, lifts the lockdown itself (that is ESCAPED for the player).
 */
export function updateAlarm(state, dt) {
  const h = state.heist;
  if (!h) return;
  if (h.klaxon > 0) h.klaxon = Math.max(0, h.klaxon - dt);
  if (h.status !== 'alarm') return;
  h.timer = Math.max(0, h.timer - dt);
  // the gates hold traffic in: a car sitting on a shut gate is shoved back to where it came from
  for (const g of h.gates) {
    if (!g.shut) continue;
    for (const v of state.vehicles) {
      if (v.dead) continue;
      const d = Math.hypot(v.x - g.x, v.y - g.y);
      if (d < HEIST.gateRadius) {
        g.held += 1;
        // nothing passes: the gate blocker is solid, so slide the car out of its square
        if (isBlocked(state.city, v.x, v.y, v.r)) {
          const nd = nearestNode(g.x, g.y);
          const ax = nd.x - g.x, ay = nd.y - g.y;
          const a = Math.atan2(ay, ax);
          v.x = g.x + Math.cos(a) * (HEIST.gateRadius + 6);
          v.y = g.y + Math.sin(a) * (HEIST.gateRadius + 6);
          v.vx *= 0.2; v.vy *= 0.2;
        }
      }
    }
  }
  if (h.timer <= 0) {
    h.status = 'over';
    for (const g of h.gates) { g.shut = false; g.held = 0; }
    h.escapes += 1;
    note(h, 'ninety seconds up: lockdown lifted, PAPD pulling back');
    state.notify('ESCAPED — the lockdown is over', '#7dff8a');
    sfx('escape', 1);
    state.stats.escapes += 1;
    state.onHeistEscape && state.onHeistEscape();
  }
}

/**
 * The escape clock as the HUD prints it: "ALARM 01:14", or null when no alarm runs. hh:mm:ss would be
 * noise at ninety seconds; minutes and seconds are enough.
 */
export function heistTimerText(state) {
  const h = state.heist;
  if (!h || h.status === 'idle') return null;
  if (h.status === 'over') return 'ESCAPED';
  const s = Math.max(0, Math.ceil(h.timer));
  return `ALARM ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 'idle' | 'alarm' | 'over' — what the route renderer and the HUD switch on. */
export function heistPhase(state) {
  return state.heist ? state.heist.status : 'idle';
}

/** The crew's cut of a take: a quarter each hand, off the top (the number the robbery prints). */
export function crewCutShare(take, hands = 2) {
  return Math.round(take * HEIST.cutPercent * hands);
}

/**
 * Roads that lead to a point, nearest first: a shortlist for the alarm's reinforcements, so cruisers
 * arrive on real streets instead of inside a block. Used by police/pursuit.js when the alarm calls a car.
 */
export function lockdownRoll(state, n = 4) {
  const h = state.heist;
  const target = h && h.address ? h.address : { x: state.player.x, y: state.player.y };
  const out = [];
  const p = state.player;
  for (let i = 0; i <= 8; i += 1) {
    for (let j = 0; j <= 9; j += 1) {
      const x = roadCenter(i), y = roadCenter(j);
      const dToBank = Math.hypot(x - target.x, y - target.y);
      const dToPlayer = Math.hypot(x - p.x, y - p.y);
      if (dToPlayer < 620 || dToPlayer > 1500) continue;   // off screen but not the next county
      out.push({ i, j, x, y, d: dToBank });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, n);
}
