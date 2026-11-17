// Drawing, in order: ground (pre-rendered chunks with roads, lawns, pools, sand, shadows), decals,
// markers, people, cars, the player, tree canopies, extruded buildings (far to near), particles,
// the police helicopter, then the golden-hour light. Also owns the effect emitters (particles,
// decals, floating text, shake) the simulation calls.
import { WORLD, COLORS, CAMERA } from './config.js';
import { roadCenter, blockStart, BLOCK_SIZE, ROADS_X, ROADS_Y, makeRng } from './city.js';
import { shakeCamera } from './camera.js';

const T = WORLD.tile;
const CHUNK = 1080;
const MAX_PARTICLES = 900;
const MAX_DECALS = 700;

// ---------------------------------------------------------------- effect emitters

export function createFx() {
  return { particles: [], decals: [], texts: [], markers: [] };
}

/** Emit `n` particles of a kind at (x, y). power scales speed and size. dir aims sparks. */
export function burst(state, kind, x, y, n = 1, power = 1, dir = null) {
  const list = state.fx.particles;
  if (state.density < 0.6 && kind === 'smoke' && Math.random() < 0.5) return;
  for (let i = 0; i < n; i += 1) {
    if (list.length >= MAX_PARTICLES) list.shift();
    const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 1.6;
    let sp = 0, life = 1, size = 4, color = '#fff';
    switch (kind) {
      case 'smoke': sp = 20 * power; life = 1.4 + Math.random(); size = 8 + Math.random() * 8 * power; color = Math.random() < 0.5 ? '#5a5a62' : '#7c7a80'; break;
      case 'fire': sp = 40 * power; life = 0.45 + Math.random() * 0.4; size = 6 + Math.random() * 8 * power; color = Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f'; break;
      case 'spark': sp = 260 * power * (0.4 + Math.random()); life = 0.25 + Math.random() * 0.25; size = 2; color = '#ffe28a'; break;
      case 'debris': sp = 300 * power * Math.random(); life = 0.9; size = 3 + Math.random() * 4; color = '#2b2b30'; break;
      case 'blood': sp = 90 * power * Math.random(); life = 0.5; size = 2 + Math.random() * 2; color = '#a3121b'; break;
      case 'muzzle': sp = 0; life = 0.06; size = 9; color = '#fff3b0'; break;
      case 'explosion': sp = 0; life = 0.55; size = 120 * power; color = '#ffd36b'; break;
      case 'cash': sp = 60; life = 0.8; size = 10; color = '#7dff8a'; break;
      case 'splash': sp = 70 * power; life = 0.6; size = 3; color = '#e8fbff'; break;
      case 'dust': sp = 25; life = 0.6; size = 5 + Math.random() * 4; color = '#d9c9a8'; break;
      default: break;
    }
    list.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, size, color, rot: Math.random() * 6 });
  }
}

export function addDecal(state, kind, x, y, a = 0, strength = 1) {
  const list = state.fx.decals;
  if (list.length >= MAX_DECALS) list.shift();
  list.push({ kind, x, y, a, s: strength, life: kind === 'skid' ? 14 : kind === 'scorch' ? 60 : 40 });
}

export function floatText(state, x, y, text, color = '#fff') {
  state.fx.texts.push({ x, y, text, color, life: 1.2 });
}

export function addShake(state, amount) {
  shakeCamera(state.camera, amount);
}

export function updateEffects(state, dt) {
  const ps = state.fx.particles;
  let w = 0;
  for (let i = 0; i < ps.length; i += 1) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const drag = p.kind === 'spark' ? 3 : p.kind === 'debris' ? 2.2 : 1.2;
    p.vx *= Math.exp(-drag * dt); p.vy *= Math.exp(-drag * dt);
    if (p.kind === 'smoke' || p.kind === 'fire') { p.vy -= 18 * dt; p.vx += 10 * dt; }
    if (p.kind === 'cash') p.vy -= 40 * dt;
    if (p.kind === 'blood' && p.life < 0.05 && Math.random() < 0.3) addDecal(state, 'blood', p.x, p.y, 0, 0.4);
    ps[w++] = p;
  }
  ps.length = w;
  const ds = state.fx.decals;
  w = 0;
  for (let i = 0; i < ds.length; i += 1) { ds[i].life -= dt; if (ds[i].life > 0) ds[w++] = ds[i]; }
  ds.length = w;
  const ts = state.fx.texts;
  w = 0;
  for (let i = 0; i < ts.length; i += 1) { ts[i].life -= dt; ts[i].y -= 30 * dt; if (ts[i].life > 0) ts[w++] = ts[i]; }
  ts.length = w;
}

// ---------------------------------------------------------------- ground chunks

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const SUN = { x: 0.62, y: 0.34 };   // shadow direction per unit of height (sun low in the west)

function drawGroundInto(ctx, city, ox, oy) {
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

// ---------------------------------------------------------------- entities

function drawCar(ctx, v, t) {
  const L = v.len, W = v.wid;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.a);
  // soft shadow
  ctx.fillStyle = 'rgba(30,15,40,0.35)';
  roundRect(ctx, -L / 2 + 5, -W / 2 + 4, L, W, 7); ctx.fill();
  const dmg = Math.max(0, 1 - v.health / v.maxHealth);
  ctx.fillStyle = v.dead ? '#2a2526' : v.flash > 0 ? '#ffffff' : v.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7); ctx.fill();
  if (!v.dead) {
    if (v.police) {
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(-L * 0.14, -W / 2, L * 0.3, W);
    }
    if (v.taxi) { ctx.fillStyle = '#222'; ctx.fillRect(-4, -W / 2, 8, W); }
    // body highlight along the roofline
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, -L / 2 + 3, -W / 2 + 2, L - 6, W * 0.3, 4); ctx.fill();
    // glass
    ctx.fillStyle = v.open ? '#3a2b2b' : '#1d2b3a';
    roundRect(ctx, L * 0.06, -W / 2 + 3, L * 0.2, W - 6, 3); ctx.fill();       // windscreen
    ctx.fillRect(-L * 0.36, -W / 2 + 4, L * 0.1, W - 8);                        // rear window
    if (!v.open) {
      ctx.fillStyle = v.police ? '#f4f4f4' : shade(v.color, -0.12);
      roundRect(ctx, -L * 0.25, -W / 2 + 3, L * 0.31, W - 6, 3); ctx.fill();   // roof
    } else {
      ctx.fillStyle = '#5a3d33'; ctx.fillRect(-L * 0.24, -W / 2 + 4, L * 0.28, W - 8);   // seats
    }
    if (v.model === 'mule') { ctx.fillStyle = shade(v.color, -0.06); ctx.fillRect(-L / 2 + 2, -W / 2 + 2, L * 0.58, W - 4); }
    // lights
    ctx.fillStyle = '#fff6d0';
    ctx.fillRect(L / 2 - 3, -W / 2 + 2, 3, 5); ctx.fillRect(L / 2 - 3, W / 2 - 7, 3, 5);
    const braking = v.control.brake > 0 || v.control.handbrake;
    ctx.fillStyle = braking ? '#ff2a2a' : '#a01818';
    ctx.fillRect(-L / 2, -W / 2 + 2, 3, 5); ctx.fillRect(-L / 2, W / 2 - 7, 3, 5);
    if (braking) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,40,40,0.35)';
      ctx.beginPath(); ctx.arc(-L / 2 - 2, 0, 12, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (v.police) {
      const on = v.siren ? Math.sin(v.sirenPhase) > 0 : false;
      ctx.fillStyle = v.siren ? (on ? '#ff2b3a' : '#5a0d12') : '#7a1a20';
      ctx.fillRect(-L * 0.14, -W / 2 + 2, 5, W / 2 - 2);
      ctx.fillStyle = v.siren ? (!on ? '#2b6bff' : '#0d1c5a') : '#1a2a7a';
      ctx.fillRect(-L * 0.14, 0, 5, W / 2 - 2);
      if (v.siren) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = on ? 'rgba(255,40,60,0.30)' : 'rgba(40,90,255,0.30)';
        ctx.beginPath(); ctx.arc(-L * 0.1, on ? -W * 0.3 : W * 0.3, 46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = on ? 'rgba(255,90,100,0.35)' : 'rgba(90,140,255,0.35)';
        ctx.beginPath(); ctx.arc(-L * 0.1, on ? -W * 0.3 : W * 0.3, 20, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (dmg > 0.35) {
      ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(L * 0.3, -W / 2 + 2); ctx.lineTo(L * 0.42, -2); ctx.lineTo(L * 0.35, W / 2 - 3); ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#141112'; ctx.fillRect(-L * 0.3, -W / 2 + 3, L * 0.6, W - 6);
  }
  ctx.restore();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawPerson(ctx, p, t) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.dead) {
    ctx.rotate(p.a);
    ctx.fillStyle = p.shirt;
    roundRect(ctx, -10, -6, 20, 12, 5); ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(12, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(30,15,40,0.3)';
  ctx.beginPath(); ctx.ellipse(3, 3, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.a);
  const swing = p.moving ? Math.sin(p.walk * 1) * 6 : 0;
  ctx.fillStyle = p.pants || '#2c3440';
  ctx.fillRect(-2 + swing, -6, 7, 4); ctx.fillRect(-2 - swing, 2, 7, 4);
  ctx.fillStyle = p.shirt;
  roundRect(ctx, -6, -9, 11, 18, 5); ctx.fill();
  if (p.armed) {
    ctx.fillStyle = '#1a1a1e';
    ctx.fillRect(4, 3, 12, 3);
  }
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(1, 0, 5.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, 0, 4.6, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  if (p.hat) { ctx.fillStyle = p.hat; ctx.beginPath(); ctx.arc(0, 0, 5.4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(2, -4, 5, 8); }
  if (p.calling > 0) { ctx.fillStyle = '#9ab8ff'; ctx.fillRect(1, 4, 5, 3); }   // phone to the ear
  if (p.vip) { ctx.strokeStyle = '#7dff8a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke(); }
  if (p.rival) { ctx.strokeStyle = '#ff3d7f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
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

function wallShade(face) {
  // the sun is low in the west-south-west: west and south faces glow, east and north sit in shade
  return face === 'w' ? 0.08 : face === 's' ? -0.02 : face === 'e' ? -0.3 : -0.2;
}

function drawBuilding(ctx, b, cx, cy, t) {
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

// ---------------------------------------------------------------- frame

const view = { x0: 0, y0: 0, x1: 0, y1: 0 };
const visible = (x, y, m) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;

export function renderFrame(r, state) {
  const { ctx, w, h } = r;
  const cam = state.camera;
  const t = state.time;
  cam.w = w; cam.h = h;
  const z = cam.zoom;
  view.x0 = cam.x - w / 2 / z; view.y0 = cam.y - h / 2 / z;
  view.x1 = cam.x + w / 2 / z; view.y1 = cam.y + h / 2 / z;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.waterDeep;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(z, 0, 0, z, w / 2 - cam.x * z + cam.ox, h / 2 - cam.y * z + cam.oy);

  // ground chunks
  const c0 = Math.max(0, Math.floor(view.x0 / CHUNK)), c1 = Math.min(Math.ceil(WORLD.size / CHUNK) - 1, Math.floor(view.x1 / CHUNK));
  const d0 = Math.max(0, Math.floor(view.y0 / CHUNK)), d1 = Math.min(Math.ceil(WORLD.size / CHUNK) - 1, Math.floor(view.y1 / CHUNK));
  for (let cy = d0; cy <= d1; cy += 1) for (let cx = c0; cx <= c1; cx += 1) ctx.drawImage(r.chunk(cx, cy), cx * CHUNK - 1, cy * CHUNK - 1);

  // moving water: glints and the shore's foam line
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

  // boats cruise the bay, leaving a wake
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

  // decals
  for (const d of state.fx.decals) {
    if (!visible(d.x, d.y, 40)) continue;
    const fade = Math.min(1, d.life / 3);
    if (d.kind === 'skid') {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
      ctx.fillStyle = `rgba(20,20,24,${0.35 * d.s * fade})`; ctx.fillRect(-4, -2, 8, 4); ctx.restore();
    } else if (d.kind === 'blood') {
      ctx.fillStyle = `rgba(120,10,20,${0.7 * fade})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, 4 + d.s * 10, 0, Math.PI * 2); ctx.fill();
    } else if (d.kind === 'scorch') {
      ctx.fillStyle = `rgba(15,10,10,${0.6 * fade})`;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, 44, 34, d.a, 0, Math.PI * 2); ctx.fill();
    }
  }

  // mission and pickup markers: pulsing rings on the ground
  for (const m of state.fx.markers) {
    if (!visible(m.x, m.y, 80)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.fillStyle = m.color + '33';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = m.color; ctx.lineWidth = 3 + pulse * 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (0.85 + pulse * 0.15), 0, Math.PI * 2); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = m.color + '22';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (m.label) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(m.label, m.x, m.y - m.r - 8 - pulse * 4);
    }
  }

  // pickups (cash, health, weapons)
  for (const p of state.pickups) {
    if (!visible(p.x, p.y, 30)) continue;
    const bob = Math.sin(t * 5 + p.x) * 2;
    ctx.fillStyle = p.kind === 'cash' ? '#4fdc6a' : p.kind === 'health' ? '#ff5a6a' : '#ffd36b';
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10301a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.kind === 'cash' ? '$' : p.kind === 'health' ? '+' : 'A', p.x, p.y + bob + 1);
  }

  // people, then cars, then the player
  for (const p of state.peds) if (p.dead && visible(p.x, p.y, 30)) drawPerson(ctx, p, t);
  for (const p of state.peds) if (!p.dead && visible(p.x, p.y, 30)) drawPerson(ctx, p, t);
  for (const v of state.vehicles) if (visible(v.x, v.y, 60)) drawCar(ctx, v, t);
  const pl = state.player;
  if (!pl.car && state.mode !== 'title') {
    drawPerson(ctx, pl, t);
    if (state.input.mouse.active && pl.health > 0) {
      ctx.strokeStyle = 'rgba(255,80,80,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(pl.x + Math.cos(pl.a) * 140, pl.y + Math.sin(pl.a) * 140); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // bullets as tracers
  ctx.lineWidth = 2.2;
  for (const b of state.bullets) {
    ctx.strokeStyle = b.owner === 'player' ? 'rgba(255,240,170,0.95)' : 'rgba(255,150,120,0.9)';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); ctx.stroke();
  }

  // tree canopies and buildings, sorted so nearer things (to the camera centre) draw last
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

  // particles
  for (const p of state.fx.particles) {
    if (!visible(p.x, p.y, 140)) continue;
    const k = p.life / p.max;
    if (p.kind === 'smoke') {
      ctx.globalAlpha = 0.45 * k;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - k), 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'fire' || p.kind === 'muzzle') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'explosion') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      const rr = p.size * (1.2 - k * 0.7);
      ctx.fillStyle = 'rgba(255,200,90,0.8)';
      ctx.beginPath(); ctx.arc(p.x, p.y, rr * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.lineWidth = 6 * k;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'spark') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    } else if (p.kind === 'cash') {
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('$', p.x, p.y);
    } else {
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;

  // the police helicopter: its shadow on the ground, its spotlight, then the body above
  const heli = state.heli;
  if (heli && heli.active) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,250,220,0.16)';
    ctx.beginPath(); ctx.arc(heli.spotX, heli.spotY, 90, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,220,0.12)';
    ctx.beginPath(); ctx.arc(heli.spotX, heli.spotY, 60, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(30,15,40,0.3)';
    ctx.beginPath(); ctx.ellipse(heli.x + 70, heli.y + 40, 30, 12, heli.a, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(heli.x, heli.y); ctx.rotate(heli.a);
    ctx.fillStyle = '#14213d'; roundRect(ctx, -26, -11, 46, 22, 10); ctx.fill();
    ctx.fillRect(-58, -3, 34, 6);
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-12, -11, 12, 22);
    ctx.fillStyle = '#7fd0ff'; roundRect(ctx, 6, -8, 12, 16, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,0.55)'; ctx.lineWidth = 4;
    const ra = t * 30;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ra) * 48, Math.sin(ra) * 48); ctx.lineTo(-Math.cos(ra) * 48, -Math.sin(ra) * 48);
    ctx.moveTo(Math.cos(ra + 1.57) * 48, Math.sin(ra + 1.57) * 48); ctx.lineTo(-Math.cos(ra + 1.57) * 48, -Math.sin(ra + 1.57) * 48);
    ctx.stroke();
    ctx.fillStyle = Math.sin(t * 10) > 0 ? '#ff2b3a' : '#2b6bff';
    ctx.beginPath(); ctx.arc(-56, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // floating text
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const ft of state.fx.texts) {
    ctx.globalAlpha = Math.min(1, ft.life * 2);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(ft.text, ft.x + 1.5, ft.y + 1.5);
    ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  // light: golden-hour grade and vignette over the whole frame
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = r.overlay; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = r.vignette; ctx.fillRect(0, 0, w, h);
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,40,40,${Math.min(0.45, state.flash)})`;
    ctx.fillRect(0, 0, w, h);
  }
}
