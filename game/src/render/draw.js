// render/draw.js — JOB: the drawing primitives: rounded rects, colour shading, the baked ground chunk (roads, lots, sand, shadows), extruded buildings, and the camera view box.
// EXPORTS: CHUNK, roundRect, shade, drawGroundInto, drawBuilding, view, visible
// USES: ../config.js, ../city.js
// MUST NOT: read game state (player, cars, wanted level) or own any loop; it draws what it is handed.
import { WORLD, COLORS, CAMERA } from '../config.js';
import { roadCenter, ROADS_X, ROADS_Y, makeRng } from '../city.js';

const T = WORLD.tile;
export const CHUNK = 1080;

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const SUN = { x: 0.62, y: 0.34 };   // shadow direction per unit of height (sun low in the west)

export function drawGroundInto(ctx, city, ox, oy) {
  const rng = makeRng(city.seed + ox * 7 + oy * 13);
  const beachX = WORLD.beachCol * T, waterX = WORLD.waterCol * T;
  ctx.save();
  ctx.translate(-ox, -oy);
  // asphalt everywhere west of the beach; blocks are painted over it
  ctx.fillStyle = COLORS.road;
  ctx.fillRect(0, 0, beachX, WORLD.size);
  // sand and the ocean
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(beachX, 0, waterX - beachX, WORLD.size);
  for (let i = 0; i < 400; i += 1) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,240,200,0.5)' : 'rgba(190,160,110,0.35)';
    ctx.fillRect(beachX + rng() * (waterX - beachX), oy + rng() * CHUNK, 2, 2);
  }
  const wg = ctx.createLinearGradient(waterX, 0, WORLD.size, 0);
  wg.addColorStop(0, '#46c1d6'); wg.addColorStop(0.18, COLORS.water); wg.addColorStop(1, COLORS.waterDeep);
  ctx.fillStyle = wg;
  ctx.fillRect(waterX, 0, WORLD.size - waterX, WORLD.size);
  // wet sand band
  ctx.fillStyle = 'rgba(160,120,70,0.25)';
  ctx.fillRect(waterX - 18, 0, 18, WORLD.size);
  // boardwalk
  ctx.fillStyle = '#b98a5a';
  ctx.fillRect(beachX + 92, 0, 40, WORLD.size);
  ctx.strokeStyle = 'rgba(80,50,30,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = oy - (oy % 10); y < oy + CHUNK; y += 10) { ctx.moveTo(beachX + 92, y); ctx.lineTo(beachX + 132, y); }
  ctx.stroke();
  // umbrellas and towels on the sand
  for (const u of city.umbrellas) {
    if (u.y < oy - 40 || u.y > oy + CHUNK + 40) continue;
    ctx.fillStyle = u.towel; ctx.fillRect(u.x + 10, u.y + 4, 12, 22);
    ctx.fillStyle = 'rgba(120,80,40,0.25)';
    ctx.beginPath(); ctx.ellipse(u.x + 10, u.y + 7, 17, 12, 0.4, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 8; k += 1) {
      ctx.fillStyle = k % 2 ? u.color : '#ffffff';
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.arc(u.x, u.y, 15, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2); ctx.closePath(); ctx.fill();
    }
  }
  // piers
  for (const p of city.piers) {
    ctx.fillStyle = 'rgba(10,50,70,0.35)';
    ctx.fillRect(p.x + 8, p.y + 10, p.w, p.h);
    ctx.fillStyle = '#a77b4f';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = 'rgba(70,40,20,0.45)';
    ctx.beginPath();
    for (let x = p.x; x < p.x + p.w; x += 9) { ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); }
    ctx.stroke();
  }

  // blocks: sidewalk, kerb, then the inside
  for (const b of city.blocks) {
    if (b.x > ox + CHUNK || b.y > oy + CHUNK || b.x + b.size < ox || b.y + b.size < oy) continue;
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(b.x, b.y, b.size, b.size);
    ctx.strokeStyle = COLORS.kerb; ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.size - 3, b.size - 3);
    // paving joints on the sidewalk
    ctx.strokeStyle = 'rgba(120,110,95,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 8; k < b.size; k += 18) {
      ctx.moveTo(b.x + k, b.y); ctx.lineTo(b.x + k, b.y + WORLD.sidewalk);
      ctx.moveTo(b.x + k, b.y + b.size - WORLD.sidewalk); ctx.lineTo(b.x + k, b.y + b.size);
      ctx.moveTo(b.x, b.y + k); ctx.lineTo(b.x + WORLD.sidewalk, b.y + k);
      ctx.moveTo(b.x + b.size - WORLD.sidewalk, b.y + k); ctx.lineTo(b.x + b.size, b.y + k);
    }
    ctx.stroke();
    const s = WORLD.sidewalk;
    if (b.kind === 'downtown' || b.kind === 'marina' || b.kind === 'commercial' || b.kind === 'yard') {
      ctx.fillStyle = b.kind === 'downtown' ? COLORS.plaza : b.kind === 'yard' ? '#a89a84' : b.kind === 'marina' ? '#bdb5a6' : '#a9a49b';
      ctx.fillRect(b.x + s, b.y + s, b.size - 2 * s, b.size - 2 * s);
      if (b.kind === 'downtown') {
        ctx.strokeStyle = 'rgba(150,130,100,0.25)';
        ctx.beginPath();
        for (let k = s; k < b.size - s; k += 24) {
          ctx.moveTo(b.x + k, b.y + s); ctx.lineTo(b.x + k, b.y + b.size - s);
          ctx.moveTo(b.x + s, b.y + k); ctx.lineTo(b.x + b.size - s, b.y + k);
        }
        ctx.stroke();
      } else if (b.kind === 'commercial') {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        for (let k = s + 10; k < b.size - s; k += 22) { ctx.moveTo(b.x + k, b.y + s + 2); ctx.lineTo(b.x + k, b.y + s + 14); }
        ctx.stroke();
      } else if (b.kind === 'yard') {
        for (let i = 0; i < 40; i += 1) {
          ctx.fillStyle = 'rgba(80,70,55,0.3)';
          ctx.fillRect(b.x + s + rng() * (b.size - 2 * s), b.y + s + rng() * (b.size - 2 * s), 3 + rng() * 6, 2);
        }
        ctx.strokeStyle = '#6d6052'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
        ctx.strokeRect(b.x + s + 2, b.y + s + 2, b.size - 2 * s - 4, b.size - 2 * s - 4);
        ctx.setLineDash([]);
      }
    }
    for (const l of b.lawns) {
      ctx.fillStyle = b.kind === 'park' ? COLORS.park : COLORS.grass;
      ctx.fillRect(l.x, l.y, l.w, l.h);
      for (let i = 0; i < l.w * l.h / 260; i += 1) {
        ctx.fillStyle = rng() < 0.5 ? 'rgba(60,100,30,0.25)' : 'rgba(170,210,100,0.22)';
        ctx.fillRect(l.x + rng() * l.w, l.y + rng() * l.h, 3, 3);
      }
    }
    if (b.kind === 'park') {
      ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.size / 2); ctx.quadraticCurveTo(b.x + b.size / 2, b.y + b.size * 0.3, b.x + b.size, b.y + b.size / 2);
      ctx.moveTo(b.x + b.size / 2, b.y); ctx.quadraticCurveTo(b.x + b.size * 0.65, b.y + b.size / 2, b.x + b.size / 2, b.y + b.size);
      ctx.stroke(); ctx.lineCap = 'butt';
    }
    for (const p of b.pools) {
      if (p.pond) {
        ctx.fillStyle = '#3f9fb8';
        ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, p.h / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c7b98a'; ctx.lineWidth = 4; ctx.stroke();
      } else {
        ctx.fillStyle = '#f2efe6'; roundRect(ctx, p.x - 3, p.y - 3, p.w + 6, p.h + 6, 4); ctx.fill();
        const pg = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
        pg.addColorStop(0, '#5fe0f0'); pg.addColorStop(1, '#23a8d0');
        ctx.fillStyle = pg; roundRect(ctx, p.x, p.y, p.w, p.h, 3); ctx.fill();
      }
    }
  }

  // road markings: dashed centre lines, solid edges, zebra crossings at every junction
  const roadEndX = beachX;
  ctx.lineWidth = 2;
  for (let k = 0; k < ROADS_X; k += 1) {
    const c = roadCenter(k);
    if (c < ox - T || c > ox + CHUNK + T) continue;
    for (let j = 0; j <= ROADS_Y; j += 1) {
      const y0 = j === 0 ? 0 : roadCenter(j - 1) + T + 14, y1 = j === ROADS_Y ? WORLD.size : roadCenter(j) - T - 14;
      if (y1 <= y0) continue;
      ctx.strokeStyle = COLORS.lane; ctx.setLineDash([22, 16]);
      ctx.beginPath(); ctx.moveTo(c - 2, y0); ctx.lineTo(c - 2, y1); ctx.moveTo(c + 2, y0); ctx.lineTo(c + 2, y1); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = 'rgba(233,230,220,0.55)';
      ctx.beginPath(); ctx.moveTo(c - T + 6, y0); ctx.lineTo(c - T + 6, y1); ctx.moveTo(c + T - 6, y0); ctx.lineTo(c + T - 6, y1); ctx.stroke();
    }
  }
  for (let k = 0; k < ROADS_Y; k += 1) {
    const c = roadCenter(k);
    if (c < oy - T || c > oy + CHUNK + T) continue;
    for (let i = 0; i < ROADS_X; i += 1) {
      const x0 = i === 0 ? 0 : roadCenter(i - 1) + T + 14, x1 = Math.min(roadEndX, roadCenter(i) - T - 14);
      const segs = [[x0, x1]];
      if (i === ROADS_X - 1) segs.push([roadCenter(i) + T + 14, roadEndX]);
      for (const [a, bnd] of segs) {
        if (bnd <= a) continue;
        ctx.strokeStyle = COLORS.lane; ctx.setLineDash([22, 16]);
        ctx.beginPath(); ctx.moveTo(a, c - 2); ctx.lineTo(bnd, c - 2); ctx.moveTo(a, c + 2); ctx.lineTo(bnd, c + 2); ctx.stroke();
        ctx.setLineDash([]); ctx.strokeStyle = 'rgba(233,230,220,0.55)';
        ctx.beginPath(); ctx.moveTo(a, c - T + 6); ctx.lineTo(bnd, c - T + 6); ctx.moveTo(a, c + T - 6); ctx.lineTo(bnd, c + T - 6); ctx.stroke();
      }
    }
  }
  ctx.fillStyle = 'rgba(240,238,228,0.85)';
  for (let i = 0; i < ROADS_X; i += 1) {
    for (let j = 0; j < ROADS_Y; j += 1) {
      const cx = roadCenter(i), cy = roadCenter(j);
      if (cx < ox - 2 * T || cx > ox + CHUNK + 2 * T || cy < oy - 2 * T || cy > oy + CHUNK + 2 * T) continue;
      for (let s = -T + 8; s < T - 8; s += 12) {
        ctx.fillRect(cx + s, cy - T - 12, 7, 10);  // north crossing
        ctx.fillRect(cx + s, cy + T + 2, 7, 10);   // south
        ctx.fillRect(cx - T - 12, cy + s, 10, 7);  // west
        if (i < ROADS_X - 1) ctx.fillRect(cx + T + 2, cy + s, 10, 7);
      }
      // manhole
      ctx.fillStyle = 'rgba(30,30,36,0.5)';
      ctx.beginPath(); ctx.arc(cx + 30, cy - 26, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(240,238,228,0.85)';
    }
  }
  // asphalt grain
  for (let i = 0; i < 900; i += 1) {
    const x = ox + rng() * CHUNK, y = oy + rng() * CHUNK;
    if (x > beachX) continue;
    ctx.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, 2, 2);
  }

  // building and tree shadows, one union path so overlaps do not double-darken
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  for (const b of city.buildings) {
    const dx = b.height * SUN.x, dy = b.height * SUN.y;
    if (b.x > ox + CHUNK || b.y > oy + CHUNK || b.x + b.w + dx < ox || b.y + b.h + dy < oy) continue;
    ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w + dx, b.y + dy);
    ctx.lineTo(b.x + b.w + dx, b.y + b.h + dy); ctx.lineTo(b.x + dx, b.y + b.h + dy); ctx.lineTo(b.x, b.y + b.h); ctx.closePath();
  }
  ctx.fill();
  ctx.beginPath();
  for (const t of city.trees) {
    const h = t.kind === 'palm' ? 60 : 30;
    const sx = t.x + h * SUN.x, sy = t.y + h * SUN.y;
    if (Math.abs(sx - ox - CHUNK / 2) > CHUNK || Math.abs(sy - oy - CHUNK / 2) > CHUNK) continue;
    ctx.moveTo(sx + t.r * 1.2, sy); ctx.ellipse(sx, sy, t.r * 1.2, t.r * 0.9, 0.4, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function wallShade(face) {
  // the sun is low in the west-south-west: west and south faces glow, east and north sit in shade
  return face === 'w' ? 0.08 : face === 's' ? -0.02 : face === 'e' ? -0.3 : -0.2;
}

export function drawBuilding(ctx, b, cx, cy, t) {
  const s = CAMERA.perspective / (CAMERA.perspective - b.height);
  const rx = cx + (b.x - cx) * s, ry = cy + (b.y - cy) * s, rw = b.w * s, rh = b.h * s;
  const faces = [];
  if (b.y > cy) faces.push(['n', b.x, b.y, b.x + b.w, b.y, rx, ry, rx + rw, ry]);
  if (b.y + b.h < cy) faces.push(['s', b.x, b.y + b.h, b.x + b.w, b.y + b.h, rx, ry + rh, rx + rw, ry + rh]);
  if (b.x > cx) faces.push(['w', b.x, b.y, b.x, b.y + b.h, rx, ry, rx, ry + rh]);
  if (b.x + b.w < cx) faces.push(['e', b.x + b.w, b.y, b.x + b.w, b.y + b.h, rx + rw, ry, rx + rw, ry + rh]);
  for (const [face, ax, ay, bx, by, cx2, cy2, dx, dy] of faces) {
    ctx.fillStyle = shade(b.wall, wallShade(face));
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(dx, dy); ctx.lineTo(cx2, cy2); ctx.closePath(); ctx.fill();
    // windows: towers get ribbon glazing per floor, the rest get punched windows
    const floors = b.floors;
    const glass = face === 'w' || face === 's' ? b.glass : shade(b.glass, -0.35);
    ctx.fillStyle = glass;
    const lerp = (f) => [ax + (cx2 - ax) * f, ay + (cy2 - ay) * f, bx + (dx - bx) * f, by + (dy - by) * f];
    const len = Math.hypot(bx - ax, by - ay);
    const cols = b.kind === 'tower' ? 0 : Math.max(1, Math.floor(len / 22));
    for (let f = 0; f < floors; f += 1) {
      const f0 = (f + 0.28) / floors, f1 = (f + 0.78) / floors;
      const [p0x, p0y, p1x, p1y] = lerp(f0);
      const [q0x, q0y, q1x, q1y] = lerp(f1);
      if (cols === 0) {
        ctx.beginPath();
        ctx.moveTo(p0x + (p1x - p0x) * 0.04, p0y + (p1y - p0y) * 0.04); ctx.lineTo(p0x + (p1x - p0x) * 0.96, p0y + (p1y - p0y) * 0.96);
        ctx.lineTo(q0x + (q1x - q0x) * 0.96, q0y + (q1y - q0y) * 0.96); ctx.lineTo(q0x + (q1x - q0x) * 0.04, q0y + (q1y - q0y) * 0.04);
        ctx.closePath(); ctx.fill();
      } else {
        for (let c = 0; c < cols; c += 1) {
          const u0 = (c + 0.25) / cols, u1 = (c + 0.75) / cols;
          ctx.beginPath();
          ctx.moveTo(p0x + (p1x - p0x) * u0, p0y + (p1y - p0y) * u0); ctx.lineTo(p0x + (p1x - p0x) * u1, p0y + (p1y - p0y) * u1);
          ctx.lineTo(q0x + (q1x - q0x) * u1, q0y + (q1y - q0y) * u1); ctx.lineTo(q0x + (q1x - q0x) * u0, q0y + (q1y - q0y) * u0);
          ctx.closePath(); ctx.fill();
        }
      }
    }
  }
  // roof
  ctx.fillStyle = b.roof;
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeStyle = shade(b.roof, -0.3); ctx.lineWidth = 3;
  ctx.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3);
  if (b.kind === 'house') {
    // hip roof ridge
    ctx.strokeStyle = shade(b.roof, -0.18); ctx.lineWidth = 1.5;
    const inset = Math.min(rw, rh) * 0.35;
    ctx.beginPath();
    if (rw > rh) {
      ctx.moveTo(rx, ry); ctx.lineTo(rx + inset, ry + rh / 2); ctx.lineTo(rx, ry + rh);
      ctx.moveTo(rx + rw, ry); ctx.lineTo(rx + rw - inset, ry + rh / 2); ctx.lineTo(rx + rw, ry + rh);
      ctx.moveTo(rx + inset, ry + rh / 2); ctx.lineTo(rx + rw - inset, ry + rh / 2);
    } else {
      ctx.moveTo(rx, ry); ctx.lineTo(rx + rw / 2, ry + inset); ctx.lineTo(rx + rw, ry);
      ctx.moveTo(rx, ry + rh); ctx.lineTo(rx + rw / 2, ry + rh - inset); ctx.lineTo(rx + rw, ry + rh);
      ctx.moveTo(rx + rw / 2, ry + inset); ctx.lineTo(rx + rw / 2, ry + rh - inset);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,170,0.12)';
    ctx.fillRect(rx, ry, rw / 2, rh);
  } else {
    ctx.fillStyle = 'rgba(255,230,190,0.10)';
    ctx.fillRect(rx + 4, ry + 4, rw - 8, rh * 0.4);
  }
  for (const it of b.roofItems) {
    const ix = rx + rw * it.u, iy = ry + rh * it.v;
    if (it.type === 'ac') {
      ctx.fillStyle = '#c9cdd2'; ctx.fillRect(ix - it.s / 2, iy - it.s / 2, it.s, it.s * 0.7);
      ctx.fillStyle = '#8b9096'; ctx.beginPath(); ctx.arc(ix, iy - it.s * 0.15, it.s * 0.22, 0, Math.PI * 2); ctx.fill();
    } else if (it.type === 'pool') {
      ctx.fillStyle = '#f0ece2'; ctx.fillRect(ix - rw * 0.25 - 4, iy - rh * 0.15 - 4, rw * 0.5 + 8, rh * 0.3 + 8);
      ctx.fillStyle = '#3fd0ea'; ctx.fillRect(ix - rw * 0.25, iy - rh * 0.15, rw * 0.5, rh * 0.3);
    } else if (it.type === 'helipad') {
      const rr = Math.min(rw, rh) * 0.28;
      ctx.fillStyle = '#4a4f57'; ctx.beginPath(); ctx.arc(ix, iy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f2d36b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#f4f4f4'; ctx.font = `bold ${Math.round(rr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', ix, iy + 1);
    }
  }
  if (b.label) {
    ctx.fillStyle = b.label === 'HOSPITAL' ? '#d22' : '#fff';
    ctx.font = `bold ${Math.max(10, Math.min(16, rw / 8))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.label, rx + rw / 2, ry + rh / 2);
  }
}

/** The world rectangle the camera sees this frame; renderFrame fills it, the draw passes cull against it. */
export const view = { x0: 0, y0: 0, x1: 0, y1: 0 };
export const visible = (x, y, m) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
