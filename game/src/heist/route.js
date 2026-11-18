// heist/route.js — JOB: the getaway route: the line the escape follows, drawn on the road and on the
//   minimap, with a numbered checkpoint at each turn, and the progress a job stage reads to know when the
//   player has made it out.
// EXPORTS: planRoute, updateRoute, advanceRoute, routeProgress, routeRemaining, drawRoute, drawRouteMinimap,
//   routeMarkers, clearRoute, routeDestination, routeLinePoints, ROUTE_STYLE
// USES: ../city.js, ../render/draw.js
// MUST NOT: draw any other marker or move the player (render/entities.js and player.js do); it owns the
//   route data and draws only that.
//
// A route is planned from a start point to a destination over the street grid: a list of junction
// corners, so the escape turns real corners instead of cutting across blocks. planRoute walks the grid by
// the bigger gap first (the same cheap path the PAPD's cruisers steer by), so a route from the bank to the
// marina reads like a person's drive: go to the ring road, head east, then north to the water.
//
// The route draws three things:
//   * a dashed line along the ground between its corners, in the alarm's red, with a soft glow;
//   * a numbered checkpoint ring at every corner (1, 2, 3 ... the last says OUT);
//   * the same line, shrunk, inside the round minimap, plus a blip on each corner that is off the map.
// routeMarkers() hands the checkpoints to jobs.js so the stage can use the game's own ground markers, and
// advanceRoute() reports 'checkpoint' / 'done' so the mission can count them off.

import { roadCenter, ROADS_X, ROADS_Y, nearestNode, isBlocked } from '../city.js';
import { view } from '../render/draw.js';

/** The look of the route, kept here so the map and the road agree. */
export const ROUTE_STYLE = {
  road: 'rgba(255,72,72,0.92)',      // the line on the asphalt
  glow: 'rgba(255,72,72,0.22)',      // its soft halo
  done: 'rgba(120,255,160,0.75)',    // the part already driven
  dash: [16, 12],                    // dash length, gap
  width: 7,                          // px on the road
  cpR: 30,                           // checkpoint ring radius on the ground
  mapWidth: 2.5,                     // px on the minimap
  mapBlip: 4,
};

/** The road indices a point sits nearest to: the route is planned junction to junction. */
const nodeOf = (pt) => nearestNode(pt.x, pt.y);

/**
 * Plan a route from `from` to `to` along the grid. Returns
 *   { points: [{x,y,i,j,kind}], checkpoints: [{x,y,r,index,kind}], total, next }
 * Points alternate horizontal and vertical runs: the corners are where the escape turns. The number of
 * corners is at most one per road change, so a short hop across a block is one straight run.
 */
export function planRoute(from, to, opts = {}) {
  const a = nodeOf(from), b = nodeOf(to);
  const corners = [];
  // Take the bigger gap first so the route uses the ring roads, then close the other axis. Both legs run
  // along real roads because every corner is a junction centre.
  let i = a.i, j = a.j;
  const push = (ii, jj) => {
    if (corners.length && corners[corners.length - 1].i === ii && corners[corners.length - 1].j === jj) return;
    corners.push({ i: ii, j: jj, x: roadCenter(ii), y: roadCenter(jj) });
  };
  if (Math.abs(b.i - a.i) >= Math.abs(b.j - a.j)) {
    if (b.i !== i) { i = b.i; push(i, j); }
    if (b.j !== j) { j = b.j; push(i, j); }
  } else {
    if (b.j !== j) { j = b.j; push(i, j); }
    if (b.i !== i) { i = b.i; push(i, j); }
  }
  if (!corners.length) push(b.i, b.j);
  // the last corner is the destination itself, not the junction it is nearest to
  const points = [{ x: from.x, y: from.y, kind: 'start', ...a }];
  for (let k = 0; k < corners.length; k += 1) {
    const c = corners[k];
    const last = k === corners.length - 1;
    points.push({ x: last ? to.x : c.x, y: last ? to.y : c.y, i: c.i, j: c.j, kind: last ? 'end' : 'corner' });
  }
  // total length: the sum of the runs, for the ETA line and routeRemaining
  let total = 0;
  for (let k = 1; k < points.length; k += 1) total += Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
  const checkpoints = points.slice(1).map((pt, k) => ({
    x: pt.x, y: pt.y, r: pt.kind === 'end' ? ROUTE_STYLE.cpR * 1.5 : ROUTE_STYLE.cpR,
    index: k + 1, kind: pt.kind, label: pt.kind === 'end' ? 'OUT' : String(k + 1),
  }));
  return { points, checkpoints, total, next: 0, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, spread: opts.spread || 0 };
}

/** Closest point on a segment to (x, y) and its parameter t, for snapping the progress marker. */
function snap(seg, x, y) {
  const dx = seg.bx - seg.ax, dy = seg.by - seg.ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - seg.ax) * dx + (y - seg.ay) * dy) / len2));
  return { x: seg.ax + dx * t, y: seg.ay + dy * t, t };
}

/**
 * Each step of the mission: if the player is inside the current checkpoint's ring, move to the next one.
 * Returns 'checkpoint' when one is made, 'done' when the last is, else null.
 */
export function updateRoute(state, route, at) {
  if (!route || !route.checkpoints.length) return null;
  const p = at || (state.player.car || state.player);
  const cp = route.checkpoints[route.next];
  if (!cp) return 'done';
  if (Math.hypot(p.x - cp.x, p.y - cp.y) <= cp.r + 26) return advanceRoute(route, 1);
  return null;
}

/** Mark the next n checkpoints made; returns 'checkpoint' or 'done'. */
export function advanceRoute(route, n = 1) {
  if (!route) return null;
  for (let k = 0; k < n; k += 1) {
    if (route.next >= route.checkpoints.length) break;
    route.next += 1;
  }
  return route.next >= route.checkpoints.length ? 'done' : 'checkpoint';
}

/** Fractions of the route driven and left, for the objective line. 0..1. */
export function routeProgress(route, at) {
  if (!route || !route.total) return 0;
  const segs = routeSegments(route);
  let driven = 0;
  for (const cpi of route.checkpoints.slice(0, route.next)) driven += Math.hypot(cpi.x - (cpi.prev ? cpi.prev.x : route.from.x), cpi.y - (cpi.prev ? cpi.prev.y : route.from.y));
  if (at) {
    // a partial credit along the segment the player is on: the HUD's "%" moves as they drive
    const seg = segs[Math.min(segs.length - 1, route.next)];
    if (seg) { const s = snap(seg, at.x, at.y); if (route.next >= seg.i) driven += Math.hypot(s.x - seg.ax, s.y - seg.ay); }
  }
  return Math.max(0, Math.min(1, driven / route.total));
}

/** Metres (world pixels) left to the destination along the route, for the objective line. */
export function routeRemaining(route, at) {
  if (!route) return 0;
  const segs = routeSegments(route);
  let left = 0;
  for (let k = route.next; k < segs.length; k += 1) {
    const seg = segs[k];
    const len = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
    if (k === route.next && at) {
      const s = snap(seg, at.x, at.y);
      left += Math.hypot(seg.bx - s.x, seg.by - s.y);
    } else left += len;
  }
  return Math.round(left);
}

/** The route as straight runs, each tagged with the checkpoint index it ends at. */
function routeSegments(route) {
  const out = [];
  if (!route) return out;
  let a = route.points[0];
  for (let k = 1; k < route.points.length; k += 1) {
    const b = route.points[k];
    out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, i: k - 1 });
    a = b;
  }
  return out;
}

/** The route's destination point (the last checkpoint), or null. */
export function routeDestination(route) {
  if (!route || !route.checkpoints.length) return null;
  const last = route.checkpoints[route.checkpoints.length - 1];
  return { x: last.x, y: last.y };
}

/** Every point of the line, for a caller that wants to draw or test it itself. */
export function routeLinePoints(route) {
  return route ? route.points.slice() : [];
}

/** Ground markers for the checkpoints still to come (jobs.js draws them through state.fx.markers). */
export function routeMarkers(route) {
  if (!route) return [];
  return route.checkpoints.map((cp) => ({
    x: cp.x, y: cp.y, r: cp.r,
    color: cp.kind === 'end' ? '#7dff8a' : '#ff5a5a',
    label: cp.kind === 'end' ? 'GETAWAY' : `CHECKPOINT ${cp.index}`,
    cp: cp.index,
  }));
}

/** Forget the route (job failed, done). */
export function clearRoute(state) {
  if (state.heistRoute) state.heistRoute = null;
}

// ---------------------------------------------------------------- drawing (world space)

/**
 * Draw the route on the road under everything else moving: a glow, the driven part in green, the rest in
 * red dashes, and the checkpoint rings with their numbers. Called from render.js after the decals and
 * before the markers, so cars drive over it and markers sit on top.
 */
export function drawRoute(ctx, state, t) {
  const route = state.heistRoute;
  if (!route) return;
  const segs = routeSegments(route);
  if (!segs.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the halo: one wide soft stroke under the line
  ctx.strokeStyle = ROUTE_STYLE.glow;
  ctx.lineWidth = ROUTE_STYLE.width * 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const s of segs) { ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); }
  ctx.stroke();
  // the driven part, in green, solid
  ctx.strokeStyle = ROUTE_STYLE.done;
  ctx.lineWidth = ROUTE_STYLE.width;
  ctx.beginPath();
  for (const s of segs) {
    if (s.i >= route.next) break;
    ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by);
  }
  ctx.stroke();
  // the rest, in red, dashed, and drifting toward the destination so the line reads as a direction
  ctx.strokeStyle = ROUTE_STYLE.road;
  ctx.lineWidth = ROUTE_STYLE.width;
  ctx.lineDashOffset = -((t * 40) % (ROUTE_STYLE.dash[0] + ROUTE_STYLE.dash[1]));
  ctx.setLineDash(ROUTE_STYLE.dash);
  ctx.beginPath();
  for (const s of segs) {
    if (s.i < route.next) continue;
    ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // corner chevrons: a V at each bend, pointing the way round
  for (let k = 1; k < route.points.length - 1; k += 1) {
    const p = route.points[k];
    if (!visibleWorld(p.x, p.y, 80)) continue;
    const prev = route.points[k - 1], next = route.points[k + 1];
    const a1 = Math.atan2(p.y - prev.y, p.x - prev.x);
    const a2 = Math.atan2(next.y - p.y, next.x - p.x);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a2);
    ctx.strokeStyle = ROUTE_STYLE.road; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(0, 0); ctx.lineTo(-14, 10); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(2, 0); ctx.lineTo(-10, 6); ctx.stroke();
    ctx.restore();
    void a1;
  }
  // checkpoint rings, the next one pulsing
  for (const cp of route.checkpoints) {
    const done = cp.index <= route.next;
    const current = cp.index === route.next + 1;
    if (!visibleWorld(cp.x, cp.y, cp.r + 40)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5 + cp.index);
    const r = cp.r * (current ? 0.9 + pulse * 0.18 : 1);
    ctx.beginPath(); ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = done ? 'rgba(120,255,160,0.14)' : cp.kind === 'end' ? 'rgba(125,255,138,0.18)' : 'rgba(255,90,90,0.16)';
    ctx.fill();
    ctx.strokeStyle = done ? ROUTE_STYLE.done : cp.kind === 'end' ? '#7dff8a' : ROUTE_STYLE.road;
    ctx.lineWidth = current ? 4 : 2.5;
    ctx.stroke();
    if (done) {
      // a tick through the ring: this one is behind us
      ctx.strokeStyle = ROUTE_STYLE.done; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cp.x - 8, cp.y); ctx.lineTo(cp.x - 2, cp.y + 7); ctx.lineTo(cp.x + 9, cp.y - 8); ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cp.label, cp.x, cp.y + 1);
    }
  }
  // the destination gets a flag: a pole and a pennant, so the OUT reads from a distance
  const out = route.checkpoints[route.checkpoints.length - 1];
  if (out && visibleWorld(out.x, out.y, 120)) {
    const wave = Math.sin(t * 4) * 3;
    ctx.strokeStyle = '#2b2b30'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(out.x + 22, out.y - 6); ctx.lineTo(out.x + 22, out.y - 52); ctx.stroke();
    ctx.fillStyle = '#7dff8a';
    ctx.beginPath(); ctx.moveTo(out.x + 22, out.y - 52); ctx.lineTo(out.x + 54 + wave, out.y - 44); ctx.lineTo(out.x + 22, out.y - 34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(20,30,20,0.75)';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OUT', out.x + 37, out.y - 44);
  }
  ctx.restore();
}

const visibleWorld = (x, y, m) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;

// ---------------------------------------------------------------- drawing (minimap space)

/**
 * The same route inside the minimap: the player is the centre of the round map, so the line and the
 * checkpoints are drawn in map pixels with the minimap's own scale and offset. `origin` is where the map
 * put world (0, 0); `toMap` maps a world point to map pixels. Corners off the dial are pinned to the rim
 * as small blips, the same way the marker blips clamp.
 */
export function drawRouteMinimap(g, route, toMap, S, t) {
  if (!route) return;
  const segs = routeSegments(route);
  const clampToDial = (pt) => {
    const m = toMap(pt.x, pt.y);
    const dx = m.x - S / 2, dy = m.y - S / 2, d = Math.hypot(dx, dy), max = S / 2 - 10;
    if (d <= max || d === 0) return { ...m, pinned: false };
    return { x: S / 2 + (dx / d) * max, y: S / 2 + (dy / d) * max, pinned: true };
  };
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // the line, segment by segment, in red with the driven part green
  for (const s of segs) {
    const a = clampToDial({ x: s.ax, y: s.ay }), b = clampToDial({ x: s.bx, y: s.by });
    g.strokeStyle = s.i < route.next ? 'rgba(120,255,160,0.9)' : 'rgba(255,84,84,0.9)';
    g.lineWidth = ROUTE_STYLE.mapWidth;
    g.setLineDash(s.i < route.next ? [] : [5, 3]);
    g.lineDashOffset = -((t * 10) % 8);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  g.setLineDash([]);
  // checkpoint blips; the next one gets a ring big enough to notice on a 210 px dial
  for (const cp of route.checkpoints) {
    const m = clampToDial(cp);
    const done = cp.index <= route.next;
    const current = cp.index === route.next + 1;
    g.fillStyle = done ? 'rgba(120,255,160,0.9)' : cp.kind === 'end' ? '#7dff8a' : '#ff5a5a';
    g.strokeStyle = '#1a0a12'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(m.x, m.y, ROUTE_STYLE.mapBlip, 0, Math.PI * 2); g.fill(); g.stroke();
    if (current) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      g.strokeStyle = '#ffd8d8'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(m.x, m.y, ROUTE_STYLE.mapBlip + 3 + pulse * 3, 0, Math.PI * 2); g.stroke();
    }
    if (m.pinned) {
      // an arrowhead on the rim, so the way out of the dial is still readable
      const a = Math.atan2(m.y - S / 2, m.x - S / 2);
      g.fillStyle = done ? 'rgba(120,255,160,0.95)' : '#ff5a5a';
      g.beginPath();
      g.moveTo(m.x + Math.cos(a) * 4, m.y + Math.sin(a) * 4);
      g.lineTo(m.x + Math.cos(a + 2.4) * 6, m.y + Math.sin(a + 2.4) * 6);
      g.lineTo(m.x + Math.cos(a - 2.4) * 6, m.y + Math.sin(a - 2.4) * 6);
      g.closePath(); g.fill();
    }
  }
  g.restore();
}
