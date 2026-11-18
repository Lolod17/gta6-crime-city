// render/world.js — JOB: the city and its static scenery on screen: the ground-chunk cache, water and boats, tree canopies and buildings in depth order, and the light (golden hour, dusk, streetlamps, vignette).
// EXPORTS: createRenderer, warmGround, resizeRenderer, drawGround, drawWater, drawBoats, drawPort, drawScenery, drawLight
// USES: ../config.js, ../city.js, ../clock.js, draw.js
// DISTRICT PASS: the ground painter for Bahía Azul (sand lots, lagoon, volleyball court, umbrellas) and the
//   Southside port (concrete slabs, lane paint, rail track, the quay with bollards), baked into the chunks;
//   the gantry cranes stand in the depth-sorted scenery, the freighter and a freight train in drawPort.
// MUST NOT: draw cars, people, police or effects (render/entities.js, render/fx.js), or change the city data.
// SPLIT PASS: code unchanged; outside render/ it is reached only through render.js, which boot/state.js, boot/loop.js, police/pursuit.js,
//   traffic/behaviour.js import after the split; loaded in the split-pass smoke run with no console errors.
import { WORLD, CAMERA } from '../config.js';
import { roadCenter, ROADS_X, ROADS_Y, PORT_Y0 } from '../city.js';
import { duskAmount } from '../clock.js';
import { CHUNK, drawGroundInto, drawBuilding, view, visible, shade, roundRect } from './draw.js';

const T = WORLD.tile;

// ---------------------------------------------------------------- district ground (baked into chunks)

const SAND_LOT = '#efd9a2', SAND_DARK = 'rgba(190,150,90,0.28)', CONCRETE = '#a7a9a6';

function umbrella(ctx, u) {
  ctx.fillStyle = u.towel; ctx.fillRect(u.x + 10, u.y + 4, 12, 22);
  ctx.fillStyle = 'rgba(120,80,40,0.25)';
  ctx.beginPath(); ctx.ellipse(u.x + 10, u.y + 7, 17, 12, 0.4, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < 8; k += 1) {
    ctx.fillStyle = k % 2 ? u.color : '#ffffff';
    ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.arc(u.x, u.y, 15, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2); ctx.closePath(); ctx.fill();
  }
}

/** A railway track: two steel rails on timber sleepers, vertical from y0 to y1 at x. */
function track(ctx, x, y0, y1) {
  ctx.fillStyle = '#6b5640';
  for (let y = y0; y < y1; y += 14) ctx.fillRect(x - 13, y, 26, 6);
  ctx.fillStyle = '#9aa0a6';
  ctx.fillRect(x - 9, y0, 3, y1 - y0);
  ctx.fillRect(x + 6, y0, 3, y1 - y0);
}

function paintBeach(ctx, b, rng) {
  const s = WORLD.sidewalk, d = b.beach;
  ctx.fillStyle = SAND_LOT;
  ctx.fillRect(b.x + s, b.y + s, b.size - 2 * s, b.size - 2 * s);
  // wind ripples and grain
  ctx.strokeStyle = SAND_DARK; ctx.lineWidth = 2;
  ctx.beginPath();
  for (const r of d.ripples) { ctx.moveTo(r.x, r.y); ctx.quadraticCurveTo(r.x + r.w / 2, r.y - 4, r.x + r.w, r.y); }
  ctx.stroke();
  for (let i = 0; i < 160; i += 1) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,245,210,0.6)' : 'rgba(180,140,90,0.3)';
    ctx.fillRect(b.x + s + rng() * (b.size - 2 * s), b.y + s + rng() * (b.size - 2 * s), 2, 2);
  }
  if (d.lagoon) {
    const L = d.lagoon;
    ctx.fillStyle = 'rgba(160,120,70,0.35)';
    ctx.beginPath(); ctx.ellipse(L.x, L.y, L.rx + 10, L.ry + 10, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(L.x, L.y, 4, L.x, L.y, L.rx);
    g.addColorStop(0, '#1f8fb3'); g.addColorStop(0.7, '#3fc0d8'); g.addColorStop(1, '#8fe3e8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(L.x, L.y, L.rx, L.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(240,255,255,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(L.x, L.y, L.rx - 3, L.ry - 3, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (d.court) {
    const c = d.court;
    ctx.fillStyle = '#f3dfae'; ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    ctx.strokeStyle = '#2f6fd0'; ctx.lineWidth = 3;
    ctx.strokeRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    ctx.strokeStyle = '#fafafa'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c.x, c.y - c.h / 2 - 8); ctx.lineTo(c.x, c.y + c.h / 2 + 8); ctx.stroke();
    ctx.fillStyle = '#444'; ctx.fillRect(c.x - 2, c.y - c.h / 2 - 10, 4, 4); ctx.fillRect(c.x - 2, c.y + c.h / 2 + 6, 4, 4);
  }
  for (const u of d.umbrellas) umbrella(ctx, u);
  return true;
}

function paintPort(ctx, b, rng) {
  const s = WORLD.sidewalk, d = b.port, x0 = b.x + s, y0 = b.y + s, size = b.size - 2 * s;
  ctx.fillStyle = CONCRETE;
  ctx.fillRect(x0, y0, size, size);
  // slab joints, oil stains, the yellow lane lines between the stacks
  ctx.strokeStyle = 'rgba(70,70,70,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < size; k += 48) { ctx.moveTo(x0 + k, y0); ctx.lineTo(x0 + k, y0 + size); ctx.moveTo(x0, y0 + k); ctx.lineTo(x0 + size, y0 + k); }
  ctx.stroke();
  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = 'rgba(40,35,30,0.18)';
    ctx.beginPath(); ctx.ellipse(x0 + rng() * size, y0 + rng() * size, 6 + rng() * 14, 4 + rng() * 8, rng() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 3; ctx.setLineDash([18, 12]);
  ctx.beginPath();
  for (const lx of d.lanes) { ctx.moveTo(lx, y0 + 10); ctx.lineTo(lx, y0 + size - 10); }
  ctx.stroke(); ctx.setLineDash([]);
  // hatched safety boxes at the stack ends
  ctx.strokeStyle = 'rgba(242,194,48,0.8)'; ctx.lineWidth = 2;
  ctx.strokeRect(x0 + 18, y0 + 8, 150, 18);
  for (const r of d.rails) track(ctx, r.x, r.y0, r.y1);
  return true;
}

/** The quay: concrete over the sand south of road 7, a yellow edge line, bollards, crane rails, the spur. */
function paintCoast(ctx, city, ox, oy) {
  const beachX = WORLD.beachCol * T, waterX = WORLD.waterCol * T;
  if (oy + CHUNK < PORT_Y0 - T || ox + CHUNK < beachX - T) return;
  const y0 = PORT_Y0 - T;
  ctx.fillStyle = CONCRETE;
  ctx.fillRect(beachX - 4, y0, waterX - beachX + 30, WORLD.size - y0);
  ctx.strokeStyle = 'rgba(70,70,70,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = y0; y < WORLD.size; y += 60) { ctx.moveTo(beachX, y); ctx.lineTo(waterX + 26, y); }
  ctx.stroke();
  // quay wall and edge stripe
  ctx.fillStyle = '#5d5f62'; ctx.fillRect(waterX + 20, y0, 10, WORLD.size - y0);
  ctx.fillStyle = '#f2c230'; ctx.fillRect(waterX + 12, y0, 5, WORLD.size - y0);
  for (let y = y0 + 40; y < WORLD.size; y += 90) {
    ctx.fillStyle = '#2b2b2e'; ctx.beginPath(); ctx.arc(waterX + 22, y, 6, 0, Math.PI * 2); ctx.fill();
  }
  // crane rails, then the quay spur the freight train runs on
  ctx.fillStyle = '#7c8186';
  for (const c of city.cranes) { ctx.fillRect(c.x - 2, y0, 4, WORLD.size - y0); ctx.fillRect(c.x + c.w - 2, y0, 4, WORLD.size - y0); break; }
  track(ctx, city.quayRail.x, y0, WORLD.size);
  // warning chevrons where the coast road meets the quay
  for (let k = 0; k < 6; k += 1) {
    ctx.fillStyle = k % 2 ? '#2b2b2e' : '#f2c230';
    ctx.fillRect(beachX + k * 36, y0, 36, 10);
  }
}

const DISTRICT_PAINT = {
  block: (ctx, b, rng) => (b.kind === 'beach' ? paintBeach(ctx, b, rng) : b.kind === 'port' ? paintPort(ctx, b, rng) : false),
  coast: paintCoast,
};

export function createRenderer(canvas, city) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const chunks = new Map();
  const r = { canvas, ctx, city, chunks, overlay: null, w: 0, h: 0 };
  r.chunk = (cx, cy) => {
    const key = cy * 100 + cx;
    let c = chunks.get(key);
    if (!c) {
      // one pixel of overlap on every side hides the seams between chunks at fractional zoom
      c = document.createElement('canvas');
      c.width = CHUNK + 2; c.height = CHUNK + 2;
      drawGroundInto(c.getContext('2d'), city, cx * CHUNK - 1, cy * CHUNK - 1, DISTRICT_PAINT);
      chunks.set(key, c);
    }
    return c;
  };
  return r;
}

/** Pre-render every ground chunk now (the title screen does this so play never hitches). */
export function warmGround(r) {
  const n = Math.ceil(WORLD.size / CHUNK);
  for (let cy = 0; cy < n; cy += 1) for (let cx = 0; cx < n; cx += 1) r.chunk(cx, cy);
}

export function resizeRenderer(r, w, h) {
  r.w = w; r.h = h;
  r.canvas.width = w; r.canvas.height = h;
  const ctx = r.ctx;
  // golden-hour grade: warm from the low western sun, cooler and darker toward the far corner
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,190,110,0.16)');
  g.addColorStop(0.55, 'rgba(255,140,90,0.05)');
  g.addColorStop(1, 'rgba(90,40,120,0.16)');
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(30,10,40,0.38)');
  r.overlay = g; r.vignette = v;
}

function drawTree(ctx, tr, cx, cy, zoom) {
  const H = tr.kind === 'palm' ? 60 : 34;
  const s = CAMERA.perspective / (CAMERA.perspective - H);
  const tx = cx + (tr.x - cx) * s, ty = cy + (tr.y - cy) * s;
  if (tr.kind === 'palm') {
    ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = '#3f8a3a';
    for (let k = 0; k < 7; k += 1) {
      const a = k * 0.9 + tr.r;
      ctx.beginPath();
      ctx.ellipse(tx + Math.cos(a) * tr.r * 0.75, ty + Math.sin(a) * tr.r * 0.75, tr.r * 0.95, tr.r * 0.32, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#5aa84a';
    ctx.beginPath(); ctx.arc(tx, ty, tr.r * 0.35, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#3d7a34';
    ctx.beginPath(); ctx.arc(tx, ty, tr.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5c9e45';
    ctx.beginPath(); ctx.arc(tx - tr.r * 0.25, ty - tr.r * 0.25, tr.r * 0.62, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- buildings

// ground chunks
export function drawGround(ctx, r) {
  const c0 = Math.max(0, Math.floor(view.x0 / CHUNK)), c1 = Math.min(Math.ceil(WORLD.size / CHUNK) - 1, Math.floor(view.x1 / CHUNK));
  const d0 = Math.max(0, Math.floor(view.y0 / CHUNK)), d1 = Math.min(Math.ceil(WORLD.size / CHUNK) - 1, Math.floor(view.y1 / CHUNK));
  for (let cy = d0; cy <= d1; cy += 1) for (let cx = c0; cx <= c1; cx += 1) ctx.drawImage(r.chunk(cx, cy), cx * CHUNK - 1, cy * CHUNK - 1);
}

// moving water: glints and the shore's foam line
export function drawWater(ctx, t) {
  const waterX = WORLD.waterCol * T;
  if (view.x1 > waterX - 30) {
    ctx.strokeStyle = 'rgba(230,252,255,0.75)'; ctx.lineWidth = 3;
    ctx.beginPath();
    // the surf stops where the port's quay wall begins: no foam over concrete
    const foamEnd = Math.min(view.y1 + 12, PORT_Y0 - T);
    for (let y = Math.floor(view.y0 / 12) * 12; y < foamEnd; y += 12) {
      const x = waterX + 6 + Math.sin(y * 0.03 + t * 1.6) * 5 + Math.sin(y * 0.11 - t) * 2;
      if (y === Math.floor(view.y0 / 12) * 12) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // slack water slapping the quay wall instead
    if (view.y1 > PORT_Y0 - T) {
      ctx.strokeStyle = 'rgba(230,252,255,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = Math.max(PORT_Y0 - T, Math.floor(view.y0 / 12) * 12); y < view.y1 + 12; y += 12) {
        const x = waterX + 34 + Math.sin(y * 0.05 + t * 2) * 2;
        if (y <= Math.max(PORT_Y0 - T, Math.floor(view.y0 / 12) * 12)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 70; i += 1) {
      const gx = waterX + 40 + ((i * 137.5) % 700) + Math.sin(t * 0.7 + i) * 10;
      const gy = view.y0 + ((i * 97.3 + t * 12) % (view.y1 - view.y0 + 40));
      if (gx > view.x1) continue;
      ctx.fillRect(gx, gy, 10 + (i % 5) * 3, 2);
    }
  }
}

// boats cruise the bay, leaving a wake
export function drawBoats(ctx, r, t) {
  for (const b of r.city.boats) {
    const y = (((b.y + t * b.speed) % WORLD.size) + WORLD.size) % WORLD.size;
    if (!visible(b.x, y, 80)) continue;
    const dir = b.speed > 0 ? 1 : -1;
    ctx.fillStyle = 'rgba(235,252,255,0.45)';
    ctx.beginPath(); ctx.moveTo(b.x - 6, y - dir * b.len * 0.3); ctx.lineTo(b.x + 6, y - dir * b.len * 0.3); ctx.lineTo(b.x + 18, y - dir * b.len * 1.6); ctx.lineTo(b.x - 18, y - dir * b.len * 1.6); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(b.x, y); ctx.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = 'rgba(10,40,60,0.3)'; ctx.beginPath(); ctx.ellipse(4, 5, b.len / 2, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.moveTo(b.len / 2, 0); ctx.quadraticCurveTo(b.len * 0.2, -10, -b.len / 2, -8); ctx.lineTo(-b.len / 2, 8); ctx.quadraticCurveTo(b.len * 0.2, 10, b.len / 2, 0); ctx.fill();
    ctx.fillStyle = '#d9e6ee'; ctx.fillRect(-b.len * 0.15, -5, b.len * 0.3, 10);
    ctx.restore();
  }
}

/** A gantry crane: four legs rising to a portal frame, and a boom reaching out over the water. */
function drawCrane(ctx, c, cx, cy) {
  const proj = (x, y, h) => { const s = CAMERA.perspective / (CAMERA.perspective - h); return [cx + (x - cx) * s, cy + (y - cy) * s]; };
  const H = c.height, legs = [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]];
  ctx.lineCap = 'round';
  ctx.strokeStyle = shade(c.color, -0.25); ctx.lineWidth = 7;
  ctx.beginPath();
  for (const [x, y] of legs) { const [tx, ty] = proj(x, y, H); ctx.moveTo(x, y); ctx.lineTo(tx, ty); }
  ctx.stroke();
  // cross bracing on the two long sides
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (const [ax, ay, bx, by] of [[c.x, c.y, c.x + c.w, c.y], [c.x, c.y + c.h, c.x + c.w, c.y + c.h]]) {
    const [p, q] = proj(ax, ay, H * 0.55), [r, t] = proj(bx, by, H * 0.55);
    ctx.moveTo(ax, ay); ctx.lineTo(r, t); ctx.moveTo(bx, by); ctx.lineTo(p, q);
  }
  ctx.stroke();
  // portal top and the boom
  const top = legs.map(([x, y]) => proj(x, y, H));
  ctx.fillStyle = c.color;
  ctx.beginPath(); ctx.moveTo(...top[0]); ctx.lineTo(...top[1]); ctx.lineTo(...top[3]); ctx.lineTo(...top[2]); ctx.closePath(); ctx.fill();
  const [b0x, b0y] = proj(c.x - 40, c.y + c.h / 2 - 9, H + 10), [b1x, b1y] = proj(c.x + c.w + c.boom, c.y + c.h / 2 - 9, H + 10);
  const [b2x, b2y] = proj(c.x + c.w + c.boom, c.y + c.h / 2 + 9, H + 10), [b3x, b3y] = proj(c.x - 40, c.y + c.h / 2 + 9, H + 10);
  ctx.fillStyle = shade(c.color, 0.1);
  ctx.beginPath(); ctx.moveTo(b0x, b0y); ctx.lineTo(b1x, b1y); ctx.lineTo(b2x, b2y); ctx.lineTo(b3x, b3y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shade(c.color, -0.35); ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 0; k <= 14; k += 1) {
    const f = k / 14;
    ctx.moveTo(b0x + (b1x - b0x) * f, b0y + (b1y - b0y) * f); ctx.lineTo(b3x + (b2x - b3x) * (f + 0.07), b3y + (b2y - b3y) * (f + 0.07));
  }
  ctx.stroke();
  // the operator's cab and a hanging spreader over the ship
  const [kx, ky] = proj(c.x + c.w + 30, c.y + c.h / 2, H + 4);
  ctx.fillStyle = '#e9edf0'; ctx.fillRect(kx - 9, ky - 7, 18, 14);
  ctx.fillStyle = '#6fb3d6'; ctx.fillRect(kx - 6, ky - 4, 12, 6);
  const [sx, sy] = proj(c.x + c.w + c.boom * 0.6, c.y + c.h / 2, H * 0.45);
  const [hx, hy] = proj(c.x + c.w + c.boom * 0.6, c.y + c.h / 2, H + 10);
  ctx.strokeStyle = '#2b2b2e'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(sx, sy); ctx.stroke();
  ctx.fillStyle = '#f2c230'; ctx.fillRect(sx - 14, sy - 5, 28, 10);
  ctx.lineCap = 'butt';
}

/** The moored freighter beside the quay (stacked boxes on deck) and a freight train on the quay spur. */
export function drawPort(ctx, r, t) {
  const sh = r.city.ship, rail = r.city.quayRail;
  if (!sh) return;
  if (view.x1 > sh.x - 40 && view.y1 > sh.y && view.y0 < sh.y + sh.h) {
    ctx.fillStyle = 'rgba(8,30,45,0.35)'; roundRect(ctx, sh.x + 10, sh.y + 14, sh.w, sh.h, 50); ctx.fill();
    ctx.fillStyle = sh.hull; roundRect(ctx, sh.x, sh.y, sh.w, sh.h, 50); ctx.fill();
    ctx.fillStyle = sh.deck; ctx.fillRect(sh.x + 10, sh.y + 40, sh.w - 20, sh.h - 80);
    // bridge at the stern, boxes forward of it
    ctx.fillStyle = '#f2f2ee'; ctx.fillRect(sh.x + 16, sh.y + sh.h - 150, sh.w - 32, 70);
    ctx.fillStyle = '#4a7fa0'; ctx.fillRect(sh.x + 22, sh.y + sh.h - 146, sh.w - 44, 12);
    const colors = ['#c0392b', '#2e86c1', '#e67e22', '#1e8449', '#d4ac0d', '#7d3c98'];
    let k = 0;
    for (let y = sh.y + 60; y < sh.y + sh.h - 170; y += 30) {
      for (let x = sh.x + 16; x < sh.x + sh.w - 30; x += 30) {
        ctx.fillStyle = colors[(k * 7 + Math.floor(y / 30)) % colors.length]; k += 1;
        ctx.fillRect(x, y, 26, 26);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x, y + 20, 26, 6);
      }
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(sh.x + sh.w / 2, sh.y + 26); ctx.fillText('ÁMBAR STAR', 0, 0); ctx.restore();
  }
  // a short freight train shunting up and down the quay spur, slowly
  const len = 4, wagon = 64, span = rail.y1 - rail.y0 - len * (wagon + 6) - 40;
  const y = rail.y0 + 20 + (Math.sin(t * 0.05) * 0.5 + 0.5) * span;
  if (!visible(rail.x, y + 140, 260)) return;
  for (let i = 0; i < len; i += 1) {
    const wy = y + i * (wagon + 6);
    ctx.fillStyle = 'rgba(30,20,40,0.3)'; ctx.fillRect(rail.x - 11 + 8, wy + 5, 24, wagon);
    ctx.fillStyle = i === 0 ? '#d9a441' : ['#2e86c1', '#c0392b', '#1e8449'][i % 3];
    ctx.fillRect(rail.x - 13, wy, 26, wagon);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let r2 = 6; r2 < wagon; r2 += 6) ctx.fillRect(rail.x - 13, wy + r2, 26, 1);
    if (i === 0) { ctx.fillStyle = '#333'; ctx.fillRect(rail.x - 9, wy + 6, 18, 14); }
  }
}

// tree canopies and buildings, sorted so nearer things (to the camera centre) draw last
export function drawScenery(ctx, r, cam, t, z) {
  const cx = cam.x, cy = cam.y;
  const draw = r.drawList || (r.drawList = []);
  draw.length = 0;
  for (const tr of r.city.trees) if (visible(tr.x, tr.y, 80)) draw.push(tr);
  for (const b of r.city.buildings) {
    if (b.x + b.w < view.x0 - 260 || b.x > view.x1 + 260 || b.y + b.h < view.y0 - 260 || b.y > view.y1 + 260) continue;
    draw.push(b);
  }
  for (const c of r.city.cranes || []) if (visible(c.x + c.w / 2, c.y, 420)) draw.push(c);
  for (const o of draw) {
    const ox = o.w !== undefined ? Math.max(o.x, Math.min(cx, o.x + o.w)) : o.x;
    const oy = o.w !== undefined ? Math.max(o.y, Math.min(cy, o.y + o.h)) : o.y;
    o._d = (ox - cx) ** 2 + (oy - cy) ** 2 - (o.height || 0) * 4;
  }
  draw.sort((a, b) => b._d - a._d);
  for (const o of draw) {
    if (o.boom) drawCrane(ctx, o, cx, cy);
    else if (o.w !== undefined) drawBuilding(ctx, o, cx, cy, t);
    else drawTree(ctx, o, cx, cy, z);
  }
}

// light: golden-hour grade and vignette over the whole frame
export function drawLight(ctx, r, state, w, h, z, cam) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = r.overlay; ctx.fillRect(0, 0, w, h);
  // dusk: as the HUD clock runs past 19:00 the coast sinks into violet (cosmetic only)
  const dusk = duskAmount(state);
  if (dusk > 0) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(150,105,190,${dusk.toFixed(3)})`; ctx.fillRect(0, 0, w, h);
    // sodium streetlamps on the four corners of every junction in view, warming up with the dusk
    ctx.globalCompositeOperation = 'lighter';
    const glow = Math.min(1, dusk / 0.3);
    const lr = 70 * z, off = WORLD.tile * 1.25;
    for (let i = 0; i < ROADS_X; i += 1) {
      const jx = roadCenter(i);
      if (jx < view.x0 - 120 || jx > view.x1 + 120) continue;
      for (let j = 0; j < ROADS_Y; j += 1) {
        const jy = roadCenter(j);
        if (jy < view.y0 - 120 || jy > view.y1 + 120) continue;
        for (const [dx, dy] of [[-off, -off], [off, -off], [-off, off], [off, off]]) {
          const sx = (jx + dx - cam.x) * z + w / 2 + cam.ox, sy = (jy + dy - cam.y) * z + h / 2 + cam.oy;
          const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, lr);
          g.addColorStop(0, `rgba(255,190,110,${(0.42 * glow).toFixed(3)})`);
          g.addColorStop(0.35, `rgba(255,150,80,${(0.16 * glow).toFixed(3)})`);
          g.addColorStop(1, 'rgba(255,140,70,0)');
          ctx.fillStyle = g; ctx.fillRect(sx - lr, sy - lr, lr * 2, lr * 2);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = r.vignette; ctx.fillRect(0, 0, w, h);
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,40,40,${Math.min(0.45, state.flash)})`;
    ctx.fillRect(0, 0, w, h);
  }
}
