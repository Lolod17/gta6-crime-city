// render/fx.js — JOB: the effects the simulation emits (particles, decals, floating text, camera shake): emitting, ageing, and drawing them.
// EXPORTS: createFx, burst, addDecal, floatText, addShake, updateEffects, drawDecals, drawParticles, drawFloatText
// MUST NOT: decide when an effect happens (callers do) or touch anything but state.fx and the camera shake.
import { shakeCamera } from '../camera.js';
import { visible } from './draw.js';

const MAX_PARTICLES = 900;
const MAX_DECALS = 700;

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

// decals
export function drawDecals(ctx, state) {
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
}

// particles
export function drawParticles(ctx, state) {
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
}

// floating text
export function drawFloatText(ctx, state) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const ft of state.fx.texts) {
    ctx.globalAlpha = Math.min(1, ft.life * 2);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(ft.text, ft.x + 1.5, ft.y + 1.5);
    ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;
}
