// player.js — JOB: the player: walking, aiming, shooting, getting in and out of cars, bullets, and cars
//   hitting people.
// EXPORTS: createPlayer, updatePlayer, moveCircle, fireWeapon, spawnBullet, updateBullets, tryEnterVehicle,
//   exitVehicle, seatPlayer, carHitsPeople
// USES: config.js, city.js, vehicle.js, render.js, audio.js
//
// The player: on-foot movement (walk/sprint), mouse aim, shooting, entering, stealing and leaving
// cars, and driving with the keyboard. Bullets from anyone are stepped here as well.
import { PLAYER, CAR, WEAPONS, WEAPON_ORDER } from './config.js';
import { solidsNear, segmentEnterRect, isBlocked } from './city.js';
import { forwardSpeed, damageVehicle } from './vehicle.js';
import { burst, addShake, addDecal } from './render.js';
import { sfx } from './audio.js';

export function createPlayer(x, y) {
  return {
    type: 'player', x, y, a: -Math.PI / 2, vx: 0, vy: 0, r: PLAYER.radius,
    health: PLAYER.health, armor: PLAYER.armor, car: null,
    weapon: 'pistol', ammo: { pistol: WEAPONS.pistol.ammo, smg: 0, shotgun: 0, carbine: 0 },
    cooldown: 0, walk: 0, moving: false, invuln: 0, bust: 0, lastHurt: -9,
    shirt: '#ff4f8b', pants: '#1f3b57', skin: '#c98e62', hair: '#1b1410', hat: null, armed: true,
  };
}

/** Step the player from input: drive if in a car, else walk/run and aim. */
export function updatePlayer(state, dt) {
  const p = state.player;
  const input = state.input;
  const k = input.keys;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.cooldown > 0) p.cooldown -= dt;
  if (p.health <= 0) return;

  if (input.pressed.has('KeyF') || input.pressed.has('Enter')) {
    if (p.car) exitVehicle(state); else tryEnterVehicle(state);
  }
  if (input.pressed.has('KeyQ') || WEAPON_ORDER.some((_, i) => input.pressed.has(`Digit${i + 1}`))) cycleWeapon(p, input.pressed);

  // aim follows the mouse in world space
  const aimA = Math.atan2(input.mouse.wy - p.y, input.mouse.wx - p.x);

  if (p.car) {
    const v = p.car;
    const c = v.control;
    c.throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    c.brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    c.steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    c.handbrake = k.has('Space');
    if (input.pressed.has('KeyH')) sfx('horn', 1, v.x, v.y);
    p.x = v.x; p.y = v.y; p.vx = v.vx; p.vy = v.vy; p.a = aimA;
    if ((input.mouse.clicked || (input.mouse.down && WEAPONS[p.weapon].auto)) && p.cooldown <= 0) fireWeapon(state, p, aimA, v);
    if (v.dead) exitVehicle(state, true);
    return;
  }

  // on foot
  let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  let my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
  const len = Math.hypot(mx, my);
  const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? PLAYER.run : PLAYER.walk;
  if (len > 0) { mx /= len; my /= len; }
  // a little inertia so walking feels weighted, not twitchy
  p.vx += (mx * speed - p.vx) * Math.min(1, 14 * dt);
  p.vy += (my * speed - p.vy) * Math.min(1, 14 * dt);
  moveCircle(state, p, p.vx * dt, p.vy * dt);
  p.moving = len > 0;
  if (p.moving) p.walk += dt * (speed / 12);
  p.a = input.mouse.active ? aimA : (len > 0 ? Math.atan2(my, mx) : p.a);

  const w = WEAPONS[p.weapon];
  // a click always fires, even one released before the next step; holding fires automatic weapons
  if (p.cooldown <= 0 && (input.mouse.clicked || (input.mouse.down && w.auto))) fireWeapon(state, p, p.a, null);
}

function cycleWeapon(p, pressed) {
  // number keys pick a weapon directly; Q steps to the next one that has ammo
  for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
    if (pressed.has(`Digit${i + 1}`)) { if (p.ammo[WEAPON_ORDER[i]] > 0) p.weapon = WEAPON_ORDER[i]; return; }
  }
  const at = WEAPON_ORDER.indexOf(p.weapon);
  for (let k = 1; k <= WEAPON_ORDER.length; k += 1) {
    const next = WEAPON_ORDER[(at + k) % WEAPON_ORDER.length];
    if (p.ammo[next] > 0) { p.weapon = next; return; }
  }
}

/** Walk a circle through the city, sliding along building faces. */
export function moveCircle(state, e, dx, dy) {
  const r = e.r;
  if (!isBlocked(state.city, e.x + dx, e.y, r)) e.x += dx;
  else e.vx *= 0.2;
  if (!isBlocked(state.city, e.x, e.y + dy, r)) e.y += dy;
  else e.vy *= 0.2;
}

export function fireWeapon(state, shooter, angle, fromCar) {
  const p = shooter;
  const w = WEAPONS[p.weapon];
  if (p.ammo[p.weapon] <= 0) {
    if (p.weapon !== 'pistol') { state.notify(`Out of ${w.name} ammo`, '#ffd36b'); p.weapon = 'pistol'; }
    else { p.cooldown = 0.3; sfx('click', 0.5, p.x, p.y); }
    return;
  }
  p.ammo[p.weapon] -= 1;
  p.cooldown = w.rate;
  const ox = fromCar ? fromCar.x + Math.cos(angle) * (fromCar.wid * 0.7) : p.x + Math.cos(angle) * 16;
  const oy = fromCar ? fromCar.y + Math.sin(angle) * (fromCar.wid * 0.7) : p.y + Math.sin(angle) * 16;
  // a shotgun throws several pellets per shell
  for (let k = 0; k < (w.pellets || 1); k += 1) {
    const a = angle + (Math.random() - 0.5) * w.spread * 2;
    spawnBullet(state, ox, oy, a, w.speed * (0.9 + Math.random() * 0.2), w.damage, w.range, 'player', fromCar || p);
  }
  burst(state, 'muzzle', ox, oy, 1, w.pellets ? 1.6 : 1);
  addShake(state, w.pellets ? 0.45 : 0.18);
  sfx(w.auto ? 'smg' : 'gunshot', w.pellets ? 1 : 0.9, ox, oy);
  state.stats.shots += 1;
  state.gunfire(ox, oy, 'player');
}

export function spawnBullet(state, x, y, a, speed, damage, range, owner, from) {
  state.bullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, damage, life: range / speed, owner, from });
}

/** Move bullets; the first building, car, person or player on each step's segment takes the hit. */
export function updateBullets(state, dt) {
  const list = state.bullets;
  let w = 0;
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    b.life -= dt;
    if (b.life <= 0) continue;
    const dx = b.vx * dt, dy = b.vy * dt;
    let hitT = 1, hit = null;
    for (const s of solidsNear(state.city, b.x, b.y)) {
      if (s.w === undefined) continue;
      const t = segmentEnterRect(b.x, b.y, dx, dy, s);
      if (t >= 0 && t < hitT) { hitT = t; hit = s; }
    }
    const test = (e, r) => {
      if (e === b.from) return;
      // closest approach of the segment to the circle
      const fx = b.x - e.x, fy = b.y - e.y;
      const aa = dx * dx + dy * dy, bb = 2 * (fx * dx + fy * dy), cc = fx * fx + fy * fy - r * r;
      const disc = bb * bb - 4 * aa * cc;
      if (disc < 0) return;
      const t = (-bb - Math.sqrt(disc)) / (2 * aa);
      if (t >= 0 && t < hitT) { hitT = t; hit = e; }
    };
    for (const v of state.vehicles) if (Math.abs(v.x - b.x) < 120 && Math.abs(v.y - b.y) < 120) test(v, v.r * 0.75);
    for (const p of state.peds) if (!p.dead && Math.abs(p.x - b.x) < 80 && Math.abs(p.y - b.y) < 80) test(p, 10);
    const pl = state.player;
    if (b.owner !== 'player' && !pl.car && pl.health > 0) test(pl, pl.r);
    if (!hit) { b.x += dx; b.y += dy; list[w++] = b; continue; }
    const hx = b.x + dx * hitT, hy = b.y + dy * hitT;
    const nx = b.vx / Math.hypot(b.vx, b.vy), ny = b.vy / Math.hypot(b.vx, b.vy);
    if (hit.type === 'vehicle') {
      damageVehicle(state, hit, b.damage * 0.35, b.owner === 'player' ? 'player' : null);
      burst(state, 'spark', hx, hy, 3, 0.8, Math.atan2(-ny, -nx));
      sfx('ping', 0.4, hx, hy);
      if (hit === pl.car && b.owner !== 'player') state.hurtPlayer(b.damage * 0.12, b.owner);   // the bodywork takes most of it
      if (b.owner === 'player' && hit.police) state.crime('copCarHit', hx, hy);
    } else if (hit.type === 'ped') {
      state.hurtPed(hit, b.damage, b.owner, nx, ny);
      burst(state, 'blood', hx, hy, 6, 1, Math.atan2(ny, nx));
    } else if (hit.type === 'player') {
      state.hurtPlayer(b.damage, b.owner);
      burst(state, 'blood', hx, hy, 5, 1, Math.atan2(ny, nx));
    } else {
      burst(state, 'dust', hx, hy, 3, 1);
      burst(state, 'spark', hx, hy, 2, 0.6, Math.atan2(-ny, -nx));
    }
  }
  list.length = w;
}

export function tryEnterVehicle(state) {
  const p = state.player;
  let best = null, bestD = CAR.enterRange;
  for (const v of state.vehicles) {
    if (v.dead || v.driver === 'player') continue;
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < bestD) { best = v; bestD = d; }
  }
  if (!best) return false;
  const v = best;
  if (v.driver === 'ai' || v.driver === 'cop' || v.driver === 'gang') {
    // pull the driver out: they become a fleeing pedestrian (or an angry cop)
    const side = v.a + Math.PI / 2;
    state.ejectDriver(v, v.x + Math.cos(side) * 30, v.y + Math.sin(side) * 30);
    state.crime(v.police ? 'copHit' : 'carjack', v.x, v.y);
    state.notify(v.police ? 'Stole a police cruiser!' : `Carjacked a ${v.name}`, '#ffd36b');
    sfx('door', 1, v.x, v.y);
  } else {
    sfx('door', 0.8, v.x, v.y);
  }
  v.driver = 'player';
  v.ai = null;
  if (v.police) v.siren = false;
  p.car = v;
  p.vx = 0; p.vy = 0;
  state.stats.carsStolen += 1;
  state.onEnterCar && state.onEnterCar(v);
  return true;
}

export function exitVehicle(state, forced = false) {
  const p = state.player;
  const v = p.car;
  if (!v) return;
  if (!forced && Math.abs(forwardSpeed(v)) > 160) return;   // jumping out at speed is not allowed
  // try the driver side, then the other side, then behind
  const tries = [v.a - Math.PI / 2, v.a + Math.PI / 2, v.a + Math.PI];
  let placed = false;
  for (const a of tries) {
    const x = v.x + Math.cos(a) * (v.wid * 0.5 + 16), y = v.y + Math.sin(a) * (v.wid * 0.5 + 16);
    if (!isBlocked(state.city, x, y, p.r)) { p.x = x; p.y = y; placed = true; break; }
  }
  if (!placed) { p.x = v.x; p.y = v.y; }
  v.driver = null;
  v.control.throttle = 0; v.control.brake = 0; v.control.steer = 0; v.control.handbrake = false;
  p.car = null;
  p.vx = 0; p.vy = 0;
  sfx('door', 0.8, v.x, v.y);
}

/** Put the player behind the wheel of v (the race start). */
export function seatPlayer(state, v) {
  const p = state.player;
  if (p.car && p.car !== v) { p.car.driver = null; }
  v.driver = 'player';
  p.car = v; p.x = v.x; p.y = v.y; p.vx = 0; p.vy = 0;
}

/** Running a person down: the car's speed decides how hard. */
export function carHitsPeople(state) {
  for (const v of state.vehicles) {
    const sp = Math.hypot(v.vx, v.vy);
    if (sp < 70 || v.dead) continue;
    for (const ped of state.peds) {
      if (ped.dead) continue;
      const dx = ped.x - v.x, dy = ped.y - v.y;
      if (Math.abs(dx) > 50 || Math.abs(dy) > 50) continue;
      const d = Math.hypot(dx, dy);
      if (d < v.r * 0.75 + 9) {
        const nx = dx / (d || 1), ny = dy / (d || 1);
        // knocked aside proportional to the car's speed
        ped.kx = nx * sp * 0.9 + v.vx * 0.5; ped.ky = ny * sp * 0.9 + v.vy * 0.5;
        state.hurtPed(ped, sp * 0.22, v.driver === 'player' ? 'player-car' : 'car', nx, ny);
        burst(state, 'blood', ped.x, ped.y, 8, 1.2);
        addDecal(state, 'blood', ped.x, ped.y, 0, 0.8);
        v.vx *= 0.94; v.vy *= 0.94;
        if (v.driver === 'player') { addShake(state, 0.25); sfx('thud', 0.8, ped.x, ped.y); }
      }
    }
    const pl = state.player;
    if (!pl.car && pl.health > 0 && v.driver !== 'player') {
      const d = Math.hypot(pl.x - v.x, pl.y - v.y);
      if (d < v.r * 0.75 + pl.r && sp > 90) {
        const nx = (pl.x - v.x) / (d || 1), ny = (pl.y - v.y) / (d || 1);
        moveCircle(state, pl, nx * 26, ny * 26);
        pl.vx = nx * sp * 0.8; pl.vy = ny * sp * 0.8;
        state.hurtPlayer(sp * 0.06, v.police ? 'cop' : 'car');
      }
    }
  }
}
