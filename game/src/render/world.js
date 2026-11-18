// render/world.js — JOB: the city and its static scenery on screen: the ground-chunk cache, water and boats, tree canopies and buildings in depth order, and the light (golden hour, dusk, streetlamps, vignette).
// EXPORTS: createRenderer, warmGround, resizeRenderer, drawGround, drawWater, drawBoats, drawScenery, drawLight
// MUST NOT: draw cars, people, police or effects (render/entities.js, render/fx.js), or change the city data.
import { WORLD, CAMERA } from '../config.js';
import { roadCenter, ROADS_X, ROADS_Y } from '../city.js';
import { duskAmount } from '../clock.js';
import { CHUNK, drawGroundInto, drawBuilding, view, visible } from './draw.js';

const T = WORLD.tile;

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
      drawGroundInto(c.getContext('2d'), city, cx * CHUNK - 1, cy * CHUNK - 1);
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
    for (let y = Math.floor(view.y0 / 12) * 12; y < view.y1 + 12; y += 12) {
      const x = waterX + 6 + Math.sin(y * 0.03 + t * 1.6) * 5 + Math.sin(y * 0.11 - t) * 2;
      if (y === Math.floor(view.y0 / 12) * 12) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
  for (const o of draw) {
    const ox = o.w !== undefined ? Math.max(o.x, Math.min(cx, o.x + o.w)) : o.x;
    const oy = o.w !== undefined ? Math.max(o.y, Math.min(cy, o.y + o.h)) : o.y;
    o._d = (ox - cx) ** 2 + (oy - cy) ** 2 - (o.height || 0) * 4;
  }
  draw.sort((a, b) => b._d - a._d);
  for (const o of draw) {
    if (o.w !== undefined) drawBuilding(ctx, o, cx, cy, t);
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
