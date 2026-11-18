// city/collide.js — JOB: the spatial hash of solids and the queries on it: what is near a point, is a point blocked, line of sight, segment-vs-rect tests.
// EXPORTS: hashSolids, solidsNear, isBlocked, lineOfSight, segmentHitsRect, segmentEnterRect
// MUST NOT: generate or change the city (except hashSolids filling city.grid once at build time).
import { WORLD } from '../config.js';

const { tile: T, period: P } = WORLD;

const CELL = P * T;    // collision hash cell = one street period

export function hashSolids(city) {
  const cells = Math.ceil(WORLD.size / CELL);
  city.cells = cells;
  city.grid = Array.from({ length: cells * cells }, () => []);
  const put = (s, x0, y0, x1, y1) => {
    const a = Math.max(0, Math.floor(x0 / CELL)), b = Math.min(cells - 1, Math.floor(x1 / CELL));
    const c = Math.max(0, Math.floor(y0 / CELL)), d = Math.min(cells - 1, Math.floor(y1 / CELL));
    for (let gy = c; gy <= d; gy += 1) for (let gx = a; gx <= b; gx += 1) city.grid[gy * cells + gx].push(s);
  };
  for (const b of city.buildings) put(b, b.x, b.y, b.x + b.w, b.y + b.h);
  for (const t of city.trees) { t.solid = true; put(t, t.x - t.r, t.y - t.r, t.x + t.r, t.y + t.r); }
}

/** Solids (buildings with w/h, trees with r) in the hash cells around (x, y). */
export function solidsNear(city, x, y) {
  const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
  const out = city._near;
  out.length = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    const cy = gy + dy;
    if (cy < 0 || cy >= city.cells) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = gx + dx;
      if (cx < 0 || cx >= city.cells) continue;
      const list = city.grid[cy * city.cells + cx];
      for (let i = 0; i < list.length; i += 1) if (!out.includes(list[i])) out.push(list[i]);
    }
  }
  return out;
}

/** Is (x, y) inside a building (or the ocean, or off the map)? */
export function isBlocked(city, x, y, pad = 0) {
  if (x < pad || y < pad || x > WORLD.size - pad || y > WORLD.size - pad) return true;
  if (x > WORLD.waterCol * T - pad) return true;
  const list = solidsNear(city, x, y);
  for (const s of list) {
    if (s.w !== undefined) {
      if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return true;
    } else if ((x - s.x) ** 2 + (y - s.y) ** 2 < (s.r + pad) ** 2) return true;
  }
  return false;
}

/** True when no building stands between the two points (trees do not block sight). */
export function lineOfSight(city, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / CELL));
  const seen = city._los;
  seen.length = 0;
  for (let s = 0; s <= steps; s += 1) {
    const px = x0 + (dx * s) / steps, py = y0 + (dy * s) / steps;
    const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);
    if (gx < 0 || gy < 0 || gx >= city.cells || gy >= city.cells) continue;
    const list = city.grid[gy * city.cells + gx];
    for (const b of list) {
      if (b.w === undefined || seen.includes(b)) continue;
      seen.push(b);
      if (segmentHitsRect(x0, y0, dx, dy, b)) return false;
    }
  }
  return true;
}

/** Slab test: does the segment from (x0,y0) along (dx,dy) cross rect b? */
export function segmentHitsRect(x0, y0, dx, dy, b) {
  let t0 = 0, t1 = 1;
  const axes = [[dx, x0, b.x, b.x + b.w], [dy, y0, b.y, b.y + b.h]];
  for (const [d, o, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let a = (lo - o) / d, c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

/** Fraction along the segment where it first enters rect b, or -1. */
export function segmentEnterRect(x0, y0, dx, dy, b) {
  let t0 = 0, t1 = 1;
  const axes = [[dx, x0, b.x, b.x + b.w], [dy, y0, b.y, b.y + b.h]];
  for (const [d, o, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let a = (lo - o) / d, c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return -1;
  }
  return t0;
}
