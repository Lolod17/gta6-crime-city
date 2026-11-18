// heist/crew.js — JOB: the two hired hands the heist arc gives the player: their own health, their
//   following of the player, their shooting at the PAPD, and the cut of the take each of them takes home.
// EXPORTS: HANDS, hireHands, updateHands, handTarget, formedUp, livingHands, handsReport, dismissHands,
//   payHands, handPortrait, handHealthShare
// USES: ../config.js, ../city.js, ../traffic.js, ../player.js, ../render.js, ../audio.js
// MUST NOT: spawn the Glasshands' hostile crews (crew.js does) or decide the take (missions.js does); it
//   moves two people, makes them shoot, and reports.
//
// A hand is a person record (traffic.js makePerson) with a `hand` field on it: 'sana' or 'bruno'. Unlike
// the hostile crews in crew.js, hands are on the player's side:
//
//   follow   walk to a point one pace behind the player, or beside the car if the player is driving
//   fight    if a PAPD officer or cruiser is within sight, stand, aim and fire at it instead
//   hurt     they take bullets like anyone else; at zero health they go down and stay down
//   cut      when the job pays, each living hand takes a share off the top (payHands)
//
// Hands are never spawned by traffic's pedestrian ring: they live in state.hands, and the renderer draws
// them from there through render/entities.js drawHands. They are not `peds`, so nothing else counts them.

import { lineOfSight } from '../city.js';
import { makePerson } from '../traffic.js';
import { moveCircle, spawnBullet } from '../player.js';
import { burst } from '../render.js';
import { sfx } from '../audio.js';

/** The two hands of the Banco de Ámbar job. Names, colours and their line when hired. */
export const HANDS = [
  { id: 'sana', name: 'SANA', shirt: '#3b6ea5', pants: '#22252e', hat: '#c8d8e8', skin: '#d9a066', hair: '#2a1a10',
    health: 130, line: 'Sana. I drive, you carry.', rate: 0.55, damage: 11, sight: 520 },
  { id: 'bruno', name: 'BRUNO', shirt: '#8f3b3b', pants: '#1d1f24', hat: null, skin: '#8d5524', hair: '#1b1410',
    health: 165, line: 'Bruno. Point me at the police.', rate: 0.8, damage: 15, sight: 440 },
];

const HAND_REACH = 62;       // how close a hand keeps to the player before it stops walking
const HAND_RUN = 230;        // px/s a hand moves to catch up
const HAND_TURN = 0.35;      // seconds between re-decisions of what a hand does
const HAND_SPREAD = 0.16;    // radians of aim wobble (a hand is a decent shot, not a sniper)
const HAND_RANGE = 460;      // a hand fires at a target inside this
const HAND_CATCHUP = 260;    // a hand this far from the player (through a wall) is put back beside them

/**
 * Hire both hands at a point (usually the crew van outside the bank). Returns the two person records; the
 * caller keeps them so it can read their health, and must hand them back to dismissHands when the job ends.
 */
export function hireHands(state, at, opts = {}) {
  const hands = [];
  for (let k = 0; k < HANDS.length; k += 1) {
    const spec = HANDS[k];
    const a = (opts.angle || 0) + k * 1.1;
    const hx = at.x + Math.cos(a) * (28 + k * 10), hy = at.y + Math.sin(a) * (28 + k * 10);
    const h = makePerson('hand', hx, hy, state.rng);
    h.hand = spec.id;
    h.name = spec.name;
    h.shirt = spec.shirt; h.pants = spec.pants; h.hat = spec.hat; h.skin = spec.skin; h.hair = spec.hair;
    h.health = spec.health; h.maxHealth = spec.health;
    h.armed = true; h.alive = true; h.dead = false; h.deadTime = 0;
    h.rate = spec.rate; h.damage = spec.damage; h.sight = spec.sight;
    h.cooldown = 0.4 + k * 0.2; h.think = 0; h.mode = 'follow'; h.alert = 0;
    // a hand's knee is where the shot starts: the muzzle offset, so rounds do not spawn in the body
    h.muzzle = 15;
    // hands are not pedestrians: they are ticked here, never by traffic, and they are not in state.peds
    h.type = 'hand';
    hands.push(h);
  }
  state.hands = hands;
  if (opts.say !== false) {
    // the two of them announce themselves through the dialogue queue, not the notices
    const lines = HANDS.map((s) => [s.name, s.line]);
    for (const [who, text] of lines) state.dialogueQueue.push([who, text, '#9ad7ff']);
  }
  return hands;
}

/** Living hands still on their feet. */
export function livingHands(state) {
  return (state.hands || []).filter((h) => !h.dead);
}

/**
 * Is there a PAPD officer or cruiser a hand can shoot at? Nearest first, inside `sight` and with a clear
 * line: the hands never fire through a bank wall or a container. Returns { kind, ref, x, y, d } or null.
 */
export function handTarget(state, hand) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const c of state.peds) {
    if (c.kind !== 'cop' || c.dead) continue;
    const d = Math.hypot(c.x - hand.x, c.y - hand.y);
    if (d < bestD && d < hand.sight && lineOfSight(state.city, hand.x, hand.y, c.x, c.y)) { best = { kind: 'cop', ref: c, x: c.x, y: c.y, d }; bestD = d; }
  }
  for (const v of state.vehicles) {
    if (!v.police || v.dead || v.driver !== 'cop') continue;
    const d = Math.hypot(v.x - hand.x, v.y - hand.y);
    if (d < bestD && d < hand.sight && lineOfSight(state.city, hand.x, hand.y, v.x, v.y)) { best = { kind: 'cruiser', ref: v, x: v.x, y: v.y, d }; bestD = d; }
  }
  // a hand will also answer a Glasshand if one is standing in front of it, but the PAPD comes first
  if (!best) {
    for (const c of state.peds) {
      if (c.kind !== 'gang' || c.dead) continue;
      const d = Math.hypot(c.x - hand.x, c.y - hand.y);
      if (d < hand.sight && lineOfSight(state.city, hand.x, hand.y, c.x, c.y)) { best = { kind: 'gang', ref: c, x: c.x, y: c.y, d }; break; }
    }
  }
  // the player is the reason they are here: never shoot past them, and never at them
  if (best && p.health <= 0) return null;
  return best;
}

/** Where a following hand wants to stand: behind the player on foot, or beside the car when driving. */
function followPoint(state, hand, k) {
  const p = state.player;
  const car = p.car;
  if (car) {
    // beside the driver's window, staggered so the two do not stand in the same spot
    const side = hand.hand === 'sana' ? 1 : -1;
    const a = car.a + Math.PI / 2 * side;
    return { x: car.x + Math.cos(a) * (car.wid / 2 + 18) + Math.cos(car.a) * (k === 0 ? -14 : 14), y: car.y + Math.sin(a) * (car.wid / 2 + 18) + Math.sin(car.a) * (k === 0 ? -14 : 14), run: true };
  }
  const back = Math.PI + p.a;
  const a = back + (k === 0 ? -0.5 : 0.5);
  return { x: p.x + Math.cos(a) * HAND_REACH * 0.8, y: p.y + Math.sin(a) * HAND_REACH * 0.8, run: false };
}

/**
 * Step both hands. `targets` is unused for now (the PAPD is found by handTarget) but the signature matches
 * crew.js updateCrew so a mission can call either without a shim.
 */
export function updateHands(state, dt) {
  const hands = state.hands;
  if (!hands || !hands.length) return;
  const p = state.player;
  for (let k = 0; k < hands.length; k += 1) {
    const h = hands[k];
    if (h.dead) { h.moving = false; h.deadTime = (h.deadTime || 0) + dt; continue; }
    if (h.health > h.maxHealth) h.health = h.maxHealth;
    h.think -= dt;
    // decide every third of a second, so walking and shooting do not flicker frame to frame
    if (h.think <= 0) {
      h.think = HAND_TURN;
      const t = handTarget(state, h);
      h.target = t;
      h.mode = t && t.d < HAND_RANGE ? 'fight' : 'follow';
    }
    if (h.mode === 'fight' && h.target && !h.target.ref.dead) {
      const t = h.target;
      const dx = t.x - h.x, dy = t.y - h.y;
      h.a = Math.atan2(dy, dx);
      // hold a firing line: step back if the target is closing, in if it is running
      h.moving = false;
      let mx = 0, my = 0;
      if (t.d < 120) { mx = -dx / t.d; my = -dy / t.d; }
      else if (t.d > 320) { mx = dx / t.d; my = dy / t.d; }
      if (mx || my) { moveCircle(state, h, mx * 90 * dt, my * 90 * dt); h.walk += dt * 9; h.moving = true; }
      else { h.moving = false; h.walk += dt * 2; }
      h.cooldown -= dt;
      if (h.cooldown <= 0) {
        h.cooldown = h.rate + state.rng() * 0.35;
        const a = h.a + (state.rng() - 0.5) * HAND_SPREAD * 2;
        const mx2 = h.x + Math.cos(a) * h.muzzle, my2 = h.y + Math.sin(a) * h.muzzle;
        spawnBullet(state, mx2, my2, a, 1350, h.damage, 560, 'hand', h);
        burst(state, 'muzzle', mx2, my2, 1, 1);
        sfx('gunshot', 0.45, mx2, my2);
        state.stats.handShots = (state.stats.handShots || 0) + 1;
      }
    } else {
      const want = followPoint(state, h, k);
      const dx = want.x - h.x, dy = want.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d > 26) {
        const step = Math.min(d, (want.run ? HAND_RUN : HAND_RUN * 0.8) * dt);
        moveCircle(state, h, (dx / d) * step, (dy / d) * step);
        h.a = Math.atan2(dy, dx);
        h.walk += dt * 12; h.moving = true;
      } else {
        h.moving = false;
        h.a = Math.atan2(p.y - h.y, p.x - h.x);
      }
      // the bank has walls: a hand that cannot find its way around one (a door it missed, straight-line
      // following) teleports to the player through the party's own service door rather than strand the job
      const gap = Math.hypot(h.x - p.x, h.y - p.y);
      if (gap > HAND_CATCHUP) {
        const side = h.hand === 'sana' ? 1 : -1;
        const a = p.a + Math.PI / 2 * side;
        h.x = p.x + Math.cos(a) * 24; h.y = p.y + Math.sin(a) * 24;
        h.alert = Math.max(h.alert, 2);
        state.notify(`${h.name} caught up`, '#9ad7ff');
      }
      // hands do not get stuck a county away: if the player drove off, they are put back in the car
      const far = Math.hypot(h.x - p.x, h.y - p.y);
      if (far > 1400) {
        const side = h.hand === 'sana' ? 1 : -1;
        const a = (p.car ? p.car.a : p.a) + Math.PI / 2 * side;
        h.x = p.x + Math.cos(a) * 26; h.y = p.y + Math.sin(a) * 26;
      }
    }
    if (h.health <= 0 && !h.dead) {
      h.dead = true; h.health = 0; h.moving = false;
      state.notify(`${h.name} is down`, '#ff7a7a');
      sfx('thud', 0.8, h.x, h.y);
      burst(state, 'blood', h.x, h.y, 6, 1);
    }
  }
}

/** Both hands on their feet and close to the player: the casing job's "the crew is formed up" test. */
export function formedUp(state, r = 160) {
  const hands = livingHands(state);
  if (hands.length < HANDS.length) return false;
  const p = state.player;
  return hands.every((h) => Math.hypot(h.x - p.x, h.y - p.y) < r);
}

/** A one-line report per hand for the HUD and the play-test: "SANA ok 88%". */
export function handsReport(state) {
  return (state.hands || []).map((h) => `${h.name} ${h.dead ? 'DOWN' : 'ok'} ${Math.max(0, Math.round((h.health / h.maxHealth) * 100))}%`);
}

/** Health of a hand as a fraction, for the HUD crew strip. */
export function handHealthShare(h) {
  return Math.max(0, Math.min(1, h.health / h.maxHealth));
}

/** A tiny portrait description the HUD can print: the hand's colour and the first letter of its name. */
export function handPortrait(h) {
  return { letter: h.name.slice(0, 1), color: h.shirt, down: !!h.dead };
}

/** The job is over: hands walk off. Their bodies stay on the street where they fell. */
export function dismissHands(state) {
  for (const h of state.hands || []) {
    h.mission = false;
    if (!h.dead) h.remove = true;
  }
  state.hands = [];
}

/**
 * Pay the hands their cut of `take`: each living hand takes cutPercent off the top, and the player only
 * ever sees what is left. Returns { gross, cut, net, lines }. A dead hand's share goes to nobody (the
 * game does not hand money to a widow: it is spent on the job).
 */
export function payHands(state, take, cutPercent) {
  const alive = livingHands(state);
  const each = Math.round(take * cutPercent);
  const cut = alive.length * each;
  const lines = [];
  for (const h of alive) lines.push(`${h.name} takes $${each.toLocaleString('en-US')}`);
  state.heist && (state.heist.cut = cut);
  state.stats.handCut = (state.stats.handCut || 0) + cut;
  return { gross: take, cut, net: take - cut, each, lines, paid: alive.length };
}
