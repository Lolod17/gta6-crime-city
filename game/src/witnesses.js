// witnesses.js — JOB: bystanders who see the player shoot and phone the PAPD.
// EXPORTS: witnessShot, updateWitnesses
// USES: config.js, city.js, render.js
//
// Witnesses: bystanders who see the player fire a gun stop running long enough to phone the PAPD.
// A call that finishes (the caller is still alive after JOBS.witnessCall seconds) reports the
// shooting as a crime at the place it happened; shooting the caller first keeps it quiet, at a cost.
// Pedestrians already flee gunfire and cars in traffic.js; this file only adds the phone call.
import { JOBS } from './config.js';
import { lineOfSight } from './city.js';
import { floatText } from './render.js';

const SEE = 460;          // a bystander notices shots this far away with a clear line of sight
const MAX_CALLERS = 2;    // at most this many people dial at once

/** The player fired at (x, y): up to two bystanders who saw it start a call. */
export function witnessShot(state, x, y) {
  if (state.wanted.level > 0) { state.crime('gunfire', x, y); return; }   // the police are already looking
  let callers = state.peds.filter((p) => p.calling > 0).length;
  for (const ped of state.peds) {
    if (callers >= MAX_CALLERS) break;
    if (ped.dead || ped.kind !== 'civ' || ped.calling > 0) continue;
    if (Math.abs(ped.x - x) > SEE || Math.abs(ped.y - y) > SEE) continue;
    if (Math.hypot(ped.x - x, ped.y - y) > SEE || !lineOfSight(state.city, ped.x, ped.y, x, y)) continue;
    ped.calling = JOBS.witnessCall;
    ped.callX = x; ped.callY = y;
    callers += 1;
    floatText(state, ped.x, ped.y - 18, '☎ calling the PAPD', '#9ab8ff');
  }
}

/** Count calls down; a finished call is a report. Callers stand still with the phone up. */
export function updateWitnesses(state, dt) {
  for (const ped of state.peds) {
    if (!(ped.calling > 0)) continue;
    if (ped.dead) { ped.calling = 0; continue; }
    ped.calling -= dt;
    if (ped.calling <= 0) {
      ped.calling = 0;
      ped.flee = 4;
      state.crime('gunfire', ped.callX, ped.callY);
      state.notify('A witness called the PAPD', '#9ab8ff');
      state.stats.witnessCalls = (state.stats.witnessCalls || 0) + 1;
    }
  }
}
