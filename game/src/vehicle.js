// Car physics: throttle, brake and reverse, speed-scaled steering, grip and handbrake drift,
// circle collisions against buildings, trees, the shore and other cars, damage, fire, explosions.
import { CAR, WORLD, POLICE } from './config.js';
import { solidsNear } from './city.js';
import { burst, addShake, addDecal, floatText } from './render.js';
import { sfx } from './audio.js';

/** The city's own makes. speed/accel/health are multipliers on CAR. */
export const MODELS = {
  pelican: { name: 'Pelican Sedan', colors: ['#e8e4da', '#4f6d8f', '#9b2d2d', '#2f4f3f', '#c9a227', '#6f7b84'], len: 50, wid: 24, speed: 0.92, accel: 0.95, health: 1 },
  marlin: { name: 'Marlin GT', colors: ['#ff5a36', '#ffcc22', '#18b6c9', '#f2f2f2', '#e8337a'], len: 52, wid: 23, speed: 1.12, accel: 1.25, health: 0.85 },
  cabana: { name: 'Cabana Cab', colors: ['#f6c431'], len: 50, wid: 24, speed: 0.95, accel: 1, health: 1, taxi: true },
  mule: { name: 'Mule Van', colors: ['#f0efe9', '#d8d2c0', '#7a8a96'], len: 62, wid: 28, speed: 0.78, accel: 0.75, health: 1.5 },
  sol: { name: 'Sol Convertible', colors: ['#7ad3c8', '#f49ac1', '#f7f0d8', '#ff8a3c'], len: 50, wid: 24, speed: 1.02, accel: 1.08, health: 0.9, open: true },
  cometa: { name: 'Cometa SX', colors: ['#ffd23f', '#ff3d7f', '#7ff0e0'], len: 52, wid: 23, speed: 1.22, accel: 1.45, health: 1.1 },
  aurelia: { name: 'Castellan\'s Aurelia', colors: ['#d4af37'], len: 54, wid: 24, speed: 1.16, accel: 1.3, health: 1 },
  cruiser: { name: 'PAPD Cruiser', colors: ['#14213d'], len: 52, wid: 25, speed: 1.12, accel: 1.2, health: 1.3, police: true },
};
export const CIVILIAN_MODELS = ['pelican', 'pelican', 'pelican', 'cabana', 'mule', 'sol', 'marlin'];

let nextId = 1;

export function createVehicle(modelKey, x, y, a, rng = Math.random) {
  const m = MODELS[modelKey];
  return {
    id: nextId++, type: 'vehicle', model: modelKey, name: m.name,
    color: m.colors[Math.floor(rng() * m.colors.length)],
    x, y, a, vx: 0, vy: 0, av: 0,
    len: m.len, wid: m.wid, r: Math.max(m.wid, m.len * 0.42),
    topSpeed: CAR.topSpeed * m.speed, accel: CAR.accel * m.accel,
    health: CAR.health * m.health, maxHealth: CAR.health * m.health,
    police: !!m.police, taxi: !!m.taxi, open: !!m.open,
    driver: null,          // 'player' | 'ai' | 'cop' | 'gang' | null (parked/abandoned)
    ai: null,
    control: { throttle: 0, brake: 0, steer: 0, handbrake: false },
    burning: 0, dead: false, siren: false, sirenPhase: Math.random() * 6,
    skid: 0, lastHit: 0, hitBy: null, flash: 0,
  };
}

/** Speed along the car's heading (negative when reversing). */
export const forwardSpeed = (v) => v.vx * Math.cos(v.a) + v.vy * Math.sin(v.a);
export const speedOf = (v) => Math.hypot(v.vx, v.vy);

/** One physics step from the car's control inputs. */
export function updateVehicle(state, v, dt) {
  if (v.dead) {
    v.vx *= Math.exp(-3 * dt); v.vy *= Math.exp(-3 * dt);
    v.x += v.vx * dt; v.y += v.vy * dt;
    collideWorld(state, v, dt);
    return;
  }
  const c = v.control;
  const ca = Math.cos(v.a), sa = Math.sin(v.a);
  let vf = v.vx * ca + v.vy * sa;            // forward component
  let vr = -v.vx * sa + v.vy * ca;           // sideways component
  const top = v.topSpeed * (v.speedMul || 1) * (v.health < CAR.fireAt ? 0.6 : 1);

  if (c.throttle > 0) {
    if (vf < -10) vf += CAR.brake * dt * c.throttle;
    // acceleration eases off near top speed so 0->top takes about CAR.toTop seconds
    else vf += v.accel * c.throttle * dt * (1.15 - 0.3 * Math.max(0, vf) / top);
    if (vf > top) vf = top + (vf - top) * Math.exp(-4 * dt);
  } else if (c.brake > 0) {
    if (vf > 10) vf -= CAR.brake * dt * c.brake;
    else vf = Math.max(-CAR.reverseMax, vf - v.accel * 0.7 * dt * c.brake);
  } else {
    vf -= vf * CAR.drag * dt;
    if (Math.abs(vf) < 4) vf = 0;
  }
  let grip = CAR.grip;
  if (c.handbrake) {
    grip = CAR.driftGrip;
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), CAR.handbrakeDecel * dt);
  }
  // sideways slip decays by grip; what is lost becomes tyre smoke and skid marks
  const slip = Math.abs(vr);
  vr *= Math.exp(-grip * dt);
  v.skid = slip > 90 ? Math.min(1, slip / 260) : 0;

  // steering scaled by speed: tight when slow, heavy at speed, nothing when stopped
  const speed = Math.abs(vf);
  const t = Math.min(1, speed / CAR.topSpeed);
  let rate = (CAR.steerSlow + (CAR.steerFast - CAR.steerSlow) * t) * Math.min(1, speed / CAR.steerMinSpeed);
  if (c.handbrake) rate *= 1.35;
  const targetAv = c.steer * rate * Math.sign(vf || 1);
  v.av += (targetAv - v.av) * Math.min(1, 14 * dt);
  v.a += v.av * dt;

  // velocity rebuilt on the old axes: the heading turns first, the momentum follows through grip
  v.vx = ca * vf - sa * vr;
  v.vy = sa * vf + ca * vr;
  v.x += v.vx * dt;
  v.y += v.vy * dt;
  collideWorld(state, v, dt);

  if (v.skid > 0.25 && speed > 120) {
    const bx = v.x - ca * v.len * 0.35, by = v.y - sa * v.len * 0.35;
    addDecal(state, 'skid', bx - sa * v.wid * 0.4, by + ca * v.wid * 0.4, v.a, v.skid);
    addDecal(state, 'skid', bx + sa * v.wid * 0.4, by - ca * v.wid * 0.4, v.a, v.skid);
    if (Math.random() < v.skid * 0.5) burst(state, 'smoke', bx, by, 1, 0.5);
  }
  if (v.health < CAR.smokeAt && Math.random() < 0.25) {
    burst(state, v.health < CAR.fireAt ? 'fire' : 'smoke', v.x + ca * v.len * 0.38, v.y + sa * v.len * 0.38, 1, 0.6);
  }
  if (v.health <= 0) {
    v.burning += dt;
    if (v.burning > CAR.burnTime) explodeVehicle(state, v);
  }
  if (v.flash > 0) v.flash -= dt;
  if (v.police && v.siren) v.sirenPhase += dt * 9;
}

function hitImpact(state, v, impact, nx, ny, px, py) {
  if (impact < 60) return;
  const damage = (impact - 60) * CAR.crashDamage;
  damageVehicle(state, v, damage, null);
  if (v.driver === 'player') {
    addShake(state, Math.min(1, impact / 500));
    state.stats.crashes += 1;
  }
  burst(state, 'spark', px, py, Math.min(12, 2 + impact / 50), 1, Math.atan2(ny, nx));
  if (state.time - v.lastHit > 0.15) {
    sfx('crash', Math.min(1, impact / 450), v.x, v.y);
    v.lastHit = state.time;
  }
}

/** Push the car out of buildings, trees, the shore and the map edge; bounce and take damage. */
export function collideWorld(state, v, dt) {
  const r = v.r * 0.82;
  const near = solidsNear(state.city, v.x, v.y);
  for (let i = 0; i < near.length; i += 1) {
    const s = near[i];
    let nx, ny, d, px, py;
    if (s.w !== undefined) {
      px = Math.max(s.x, Math.min(v.x, s.x + s.w));
      py = Math.max(s.y, Math.min(v.y, s.y + s.h));
      nx = v.x - px; ny = v.y - py; d = Math.hypot(nx, ny);
      if (d >= r) continue;
      if (d < 0.001) {
        // centre inside the rect: push out through the nearest face
        const l = v.x - s.x, rr = s.x + s.w - v.x, t = v.y - s.y, b = s.y + s.h - v.y;
        const m = Math.min(l, rr, t, b);
        nx = m === l ? -1 : m === rr ? 1 : 0; ny = m === t ? -1 : m === b ? 1 : 0; d = 0;
      } else { nx /= d; ny /= d; }
    } else {
      nx = v.x - s.x; ny = v.y - s.y; d = Math.hypot(nx, ny);
      if (d >= r + s.r) continue;
      nx /= d || 1; ny /= d || 1; d -= s.r;
      px = s.x + nx * s.r; py = s.y + ny * s.r;
    }
    v.x += nx * (r - d); v.y += ny * (r - d);
    const impact = -(v.vx * nx + v.vy * ny);
    if (impact > 0) {
      v.vx += nx * impact * (1 + CAR.knockback);
      v.vy += ny * impact * (1 + CAR.knockback);
      // scrape: lose some of the speed along the wall too
      v.vx *= 0.9; v.vy *= 0.9;
      hitImpact(state, v, impact, nx, ny, px, py);
    }
  }
  // map edges and the waterline act as walls
  const edges = [
    [v.x - r, 1, 0], [WORLD.size - (v.x + r), -1, 0], [v.y - r, 0, 1], [WORLD.size - (v.y + r), 0, -1],
    [WORLD.waterCol * WORLD.tile - (v.x + r), -1, 0],
  ];
  for (const [gap, nx, ny] of edges) {
    if (gap >= 0) continue;
    v.x -= nx * gap; v.y -= ny * gap;
    const impact = -(v.vx * nx + v.vy * ny);
    if (impact > 0) {
      v.vx += nx * impact * (1 + CAR.knockback); v.vy += ny * impact * (1 + CAR.knockback);
      hitImpact(state, v, impact, nx, ny, v.x - nx * r, v.y - ny * r);
    }
  }
}

/** Car against car: circles, momentum swapped along the normal, damage both ways. */
export function collideVehicles(state) {
  const list = state.vehicles;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = (a.r + b.r) * 0.8;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.0001) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      const ma = a.len * a.wid, mb = b.len * b.wid;
      const push = (rr - d);
      a.x -= nx * push * mb / (ma + mb); a.y -= ny * push * mb / (ma + mb);
      b.x += nx * push * ma / (ma + mb); b.y += ny * push * ma / (ma + mb);
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) continue;
      const j2 = (1 + 0.35) * rel / (1 / ma + 1 / mb);
      a.vx -= (j2 / ma) * nx; a.vy -= (j2 / ma) * ny;
      b.vx += (j2 / mb) * nx; b.vy += (j2 / mb) * ny;
      if (rel > 70) {
        const dmg = (rel - 70) * CAR.crashDamage * 0.8;
        const px = a.x + nx * a.r * 0.8, py = a.y + ny * a.r * 0.8;
        burst(state, 'spark', px, py, Math.min(14, 3 + rel / 40), 1);
        if (state.time - a.lastHit > 0.15) { sfx('crash', Math.min(1, rel / 400), px, py); a.lastHit = state.time; }
        const pa = a.driver === 'player', pb = b.driver === 'player';
        // the player's car is the hero car: it takes half from rams, and cruisers take less from it
        damageVehicle(state, a, dmg * (pa ? 0.5 : pb && a.police ? 0.6 : 1), pb ? 'player' : null);
        damageVehicle(state, b, dmg * (pb ? 0.5 : pa && b.police ? 0.6 : 1), pa ? 'player' : null);
        if (pa || pb) {
          addShake(state, Math.min(1, rel / 450));
          const other = pa ? b : a;
          if (other.police && rel > 140) state.crime('copCarHit', other.x, other.y);
          if (other.ai && other.driver === 'ai') other.ai.panic = 4;
        }
      }
    }
  }
}

export function damageVehicle(state, v, amount, by) {
  if (v.dead || amount <= 0) return;
  v.health -= amount;
  v.flash = 0.12;
  if (by) v.hitBy = by;
  if (v.driver === 'player' && amount >= 4) state.notify(`-${Math.round(amount)} car`, '#ffb070');
  if (v.health <= 0 && v.burning === 0) {
    v.burning = 0.001;
    if (v.driver === 'player') state.notify('Car on fire! Get out (F)', '#ff9a3c');
  }
}

/** Boom: kills the car, pushes and hurts everything near it, scorches the road. */
export function explodeVehicle(state, v) {
  if (v.dead) return;
  v.dead = true;
  v.health = 0;
  v.siren = false;
  burst(state, 'explosion', v.x, v.y, 1, 1);
  burst(state, 'fire', v.x, v.y, 26, 1.6);
  burst(state, 'smoke', v.x, v.y, 18, 1.4);
  burst(state, 'debris', v.x, v.y, 14, 1.2);
  addDecal(state, 'scorch', v.x, v.y, v.a, 1);
  addShake(state, 1);
  sfx('explosion', 1, v.x, v.y);
  floatText(state, v.x, v.y - 30, 'BOOM', '#ffd36b');
  const R = 140;
  for (const o of state.vehicles) {
    if (o === v) continue;
    const d = Math.hypot(o.x - v.x, o.y - v.y);
    if (d < R) {
      const k = 1 - d / R;
      o.vx += ((o.x - v.x) / (d || 1)) * 380 * k;
      o.vy += ((o.y - v.y) / (d || 1)) * 380 * k;
      damageVehicle(state, o, 70 * k, v.hitBy);
    }
  }
  for (const p of state.peds) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - v.x, p.y - v.y);
    if (d < R) state.hurtPed(p, 120 * (1 - d / R) + 20, v.hitBy, (p.x - v.x) / (d || 1), (p.y - v.y) / (d || 1));
  }
  const pl = state.player;
  const pd = Math.hypot(pl.x - v.x, pl.y - v.y);
  if (pd < R && !pl.car) state.hurtPlayer(80 * (1 - pd / R), 'explosion');
  if (pl.car === v) state.hurtPlayer(999, 'explosion');
  if (v.hitBy === 'player') {
    state.stats.carsWrecked += 1;
    if (v.police) state.crime('copKill', v.x, v.y);
  }
  // the driver of a burning car rarely makes it
  if (v.driver === 'ai' || v.driver === 'cop' || v.driver === 'gang') v.driver = null;
}

/** Explosion-free wear: police heat rises if the player rams a cruiser repeatedly. */
export function isPursuitCar(v) { return v.police && v.driver === 'cop'; }
export const POLICE_TOP = CAR.topSpeed * POLICE.chaseSpeed;
