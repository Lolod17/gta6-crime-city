// Street racing: checkpoint routes laid along the road grid, the checkpoint ring the player must
// drive through, and a rival driver who runs the same route. Used by the race against Teo Castellan
// (Day 2) and the replayable checkpoint sprint (activities.js).
import { roadCenter } from './city.js';
import { createVehicle, forwardSpeed } from './vehicle.js';
import { JOBS } from './config.js';

/** Road intersections (i, j) -> pixel points. */
export const junctions = (list) => list.map(([i, j]) => ({ x: roadCenter(i), y: roadCenter(j) }));

/** Waypoints between consecutive checkpoints: along x first, then y, so every leg stays on a road. */
export function routeThrough(start, checkpoints) {
  const pts = [];
  let a = start;
  for (const c of checkpoints) {
    if (Math.abs(a.x - c.x) > 1 && Math.abs(a.y - c.y) > 1) pts.push({ x: c.x, y: a.y });
    pts.push({ x: c.x, y: c.y, checkpoint: true });
    a = c;
  }
  return pts;
}

/** A race in progress: checkpoints, the player's next index, the clock. */
export function createRace(checkpoints) {
  return { checkpoints, next: 0, time: 0, done: false };
}

/** Tick the player's side of a race; returns 'checkpoint' or 'finish' on the frame it happens. */
export function updateRace(state, race, dt) {
  race.time += dt;
  const c = race.checkpoints[race.next];
  if (!c) return null;
  const p = state.player;
  if (Math.hypot(p.x - c.x, p.y - c.y) < 90) {
    race.next += 1;
    if (race.next >= race.checkpoints.length) { race.done = true; return 'finish'; }
    return 'checkpoint';
  }
  return null;
}

/** The rival's car at a start point, facing the first waypoint, waiting for the green light. */
export function createRival(state, x, y, route, model = 'marlin', color = '#ff3d7f') {
  const first = route[0];
  const v = createVehicle(model, x, y, Math.atan2(first.y - y, first.x - x), state.rng);
  v.color = color;
  v.driver = 'gang';
  v.mission = true;
  v.racer = { route, wp: 0, checkpoints: 0, go: false, stuck: 0, reverse: 0 };
  state.vehicles.push(v);
  return v;
}

/** Drive the rival along his waypoints: aim, slow for corners, reverse out when wedged. */
export function updateRival(state, v, dt) {
  const r = v.racer;
  const c = v.control;
  if (!r || v.dead || v.driver !== 'gang') return;
  if (!r.go) { c.throttle = 0; c.brake = 1; c.steer = 0; return; }
  const w = r.route[r.wp];
  if (!w) { c.throttle = 0; c.brake = 1; c.steer = 0; r.finished = true; return; }
  const d = Math.hypot(w.x - v.x, w.y - v.y);
  if (d < 70) { if (w.checkpoint) r.checkpoints += 1; r.wp += 1; return; }
  let diff = Math.atan2(w.y - v.y, w.x - v.x) - v.a;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const fs = forwardSpeed(v);
  // how sharp is the corner at this waypoint?
  const n = r.route[r.wp + 1];
  let corner = 0;
  if (n) {
    const a1 = Math.atan2(w.y - v.y, w.x - v.x), a2 = Math.atan2(n.y - w.y, n.x - w.x);
    corner = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
  }
  const top = v.topSpeed * JOBS.rivalSpeed;
  const limit = corner > 0.6 ? Math.max(210, Math.min(top, d * 1.5)) : top;
  if (r.reverse > 0) {
    r.reverse -= dt;
    c.throttle = 0; c.brake = 1; c.steer = -Math.sign(diff); c.handbrake = false;
    return;
  }
  c.steer = Math.max(-1, Math.min(1, diff * 2.4));
  c.throttle = fs < limit && Math.abs(diff) < 1.3 ? 1 : 0.3;
  c.brake = fs > limit + 40 ? 1 : 0;
  c.handbrake = Math.abs(diff) > 0.9 && fs > 260;
  // wedged against something: back up for a moment
  if (Math.abs(fs) < 25) { r.stuck += dt; if (r.stuck > 1.2) { r.reverse = 0.8; r.stuck = 0; } } else r.stuck = 0;
}

/** The rival's progress as a fraction of the race, for the "position" readout. */
export const rivalProgress = (v) => (v && v.racer ? v.racer.checkpoints : 0);
