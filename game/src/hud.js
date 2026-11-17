// HUD: wanted stars, cash, health and armour, weapon, speed, minimap with blips and the mission
// marker, mission objective and timer, dialogue subtitles, 1.5 s notices for anything that costs or
// pays, and the big centre banners (mission passed, wasted, busted).
import { HUD, WORLD, POLICE } from './config.js';
import { roadCenter, ROADS_X, ROADS_Y } from './city.js';
import { evadeTime } from './police.js';
import { radioLine } from './radio.js';
import { districtAt } from './districts.js';

const $ = (id) => document.getElementById(id);
const MM_SCALE = 0.09;
/** One world pixel is one metre: the distances the HUD prints, and nothing in the simulation. */
const METRES_PER_PX = 1;

/**
 * The mission label: "MISSION 4/12 — HEAT — 40s". The position and the total come from the
 * mission list at runtime (jobs.js missionIndex); the seconds appear only while the stage runs a
 * clock. Side jobs read "SIDE JOB — RAMPAGE — 60s".
 */
export function missionLabel(view) {
  if (!view) return '';
  const secs = view.active && view.timer !== undefined && view.timer !== null ? ` — ${Math.max(0, Math.ceil(view.timer))}s` : '';
  if (view.kind === 'mission' && view.index && view.index.n) return `MISSION ${view.index.n}/${view.index.total} — ${view.title}${secs}`;
  if (view.kind && view.title) return `SIDE JOB — ${view.title}${secs}`;
  if (view.index && view.index.total && !view.index.n) return `ALL ${view.index.total} MISSIONS DONE`;
  return '';
}

/** Distance to the objective: "214 m to Inés Ocampo" before a job, "1259 m to MARINA SOL" during one. */
export function distanceLine(state, view) {
  const pt = view && view.point;
  if (!pt) return '';
  const body = state.player.car || state.player;
  const d = Math.round(Math.hypot(pt.x - body.x, pt.y - body.y) * METRES_PER_PX);
  if (d < 25) return '';
  return `${d} m to ${view.to || pt.label || districtAt(state.city, pt.x, pt.y).name}`;
}

/** "DAY 1 18:24": the story day from the mission arc and the clock from play. */
export function clockParts(state) {
  const mins = Math.floor(state.dayMinute || 0);
  return { day: `DAY ${state.progress.day}`, time: `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` };
}

export function initHud(state) {
  const els = {};
  for (const id of ['hud', 'mlabel', 'distance', 'clock', 'radio', 'locBanner', 'locName', 'locTag', 'money', 'stars', 'weapon', 'hpBar', 'arBar', 'minimap', 'objective', 'timer', 'notices',
    'dialogue', 'speaker', 'line', 'banner', 'briefing', 'brTitle', 'brGiver', 'brText', 'brReward', 'bannerTitle', 'bannerSub', 'speedo', 'speedVal', 'carName', 'hint', 'status', 'bustBar']) els[id] = $(id);
  const stars = [];
  els.stars.innerHTML = '';
  for (let i = 0; i < POLICE.maxStars; i += 1) {
    const s = document.createElement('span');
    s.textContent = '★';
    els.stars.appendChild(s);
    stars.push(s);
  }
  els.starEls = stars;
  els.mm = els.minimap.getContext('2d');
  els.mmBase = buildMinimapBase(state.city);
  els.cache = {};
  state.hud = els;
  state.notices = [];
}

/** The whole map drawn small once: water, sand, blocks by district, roads, landmarks. */
function buildMinimapBase(city) {
  const s = MM_SCALE;
  const c = document.createElement('canvas');
  c.width = Math.ceil(WORLD.size * s); c.height = c.width;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3f4a'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#e3c88f'; g.fillRect(WORLD.beachCol * WORLD.tile * s, 0, c.width, c.height);
  g.fillStyle = '#2a8fb0'; g.fillRect(WORLD.waterCol * WORLD.tile * s, 0, c.width, c.height);
  const tint = { downtown: '#b9b1a3', commercial: '#a39d92', residential: '#8fb862', park: '#5fa040', marina: '#b0a898', yard: '#a0705a' };
  for (const b of city.blocks) {
    g.fillStyle = tint[b.kind] || '#999';
    g.fillRect(b.x * s, b.y * s, b.size * s, b.size * s);
  }
  for (const b of city.buildings) {
    g.fillStyle = b.kind === 'tower' ? '#e8e2d6' : b.kind === 'house' ? '#c97a5a' : '#d9d0c0';
    g.fillRect(b.x * s, b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
  }
  g.fillStyle = '#5a5f6c';
  for (let k = 0; k < ROADS_X; k += 1) g.fillRect((roadCenter(k) - WORLD.tile) * s, 0, WORLD.tile * 2 * s, c.height);
  for (let k = 0; k < ROADS_Y; k += 1) g.fillRect(0, (roadCenter(k) - WORLD.tile) * s, WORLD.beachCol * WORLD.tile * s, WORLD.tile * 2 * s);
  return c;
}

/** Queue a notice; anything that costs money or health announces itself for HUD.noticeTime. */
export function pushNotice(state, text, color = '#fff') {
  const el = document.createElement('div');
  el.className = 'notice';
  el.textContent = text;
  el.style.color = color;
  state.hud.notices.prepend(el);
  state.notices.push({ el, life: HUD.noticeTime });
  if (state.notices.length > 5) { const old = state.notices.shift(); old.el.remove(); }
  state.hud.status.textContent = text;
}

function set(els, key, value, apply) {
  if (els.cache[key] === value) return;
  els.cache[key] = value;
  apply(value);
}

export function updateHud(state, dt) {
  const els = state.hud;
  const p = state.player;
  const w = state.wanted;
  const playing = state.mode !== 'title';
  set(els, 'show', playing, (v) => els.hud.classList.toggle('hidden', !v));
  if (!playing) return;

  set(els, 'money', state.money, (v) => { els.money.textContent = '$' + v.toLocaleString('en-US'); });
  // stars: lit up to the level; flashing while the cops are searching, not seeing
  const evading = w.level > 0 && !w.seen;
  const blinkOn = Math.floor(state.time * 4) % 2 === 0;
  const starKey = `${w.level}|${evading && blinkOn}|${w.flash > 0 && blinkOn}`;
  set(els, 'stars', starKey, () => {
    els.starEls.forEach((s, i) => {
      const lit = i < w.level;
      s.className = lit ? (evading && blinkOn ? 'star dim' : w.flash > 0 && blinkOn ? 'star flash' : 'star lit') : 'star';
    });
  });
  set(els, 'hp', Math.round(p.health), (v) => { els.hpBar.style.width = Math.max(0, v) + '%'; els.hpBar.classList.toggle('low', v < 30); });
  set(els, 'ar', Math.round(p.armor), (v) => { els.arBar.style.width = Math.max(0, v) + '%'; });
  set(els, 'bust', Math.round(p.bust * 20), (v) => { els.bustBar.style.width = Math.min(100, v * 5 / 2.2) + '%'; els.bustBar.parentElement.classList.toggle('hidden', v === 0); });
  const wname = p.weapon === 'smg' ? 'SMG' : 'PISTOL';
  set(els, 'weapon', `${wname} ${p.ammo[p.weapon]}`, (v) => { els.weapon.textContent = v; });

  if (p.car) {
    const kmh = Math.round(Math.hypot(p.car.vx, p.car.vy) * 0.28);
    set(els, 'speed', kmh, (v) => { els.speedVal.textContent = v; });
    set(els, 'carName', p.car.name, (v) => { els.carName.textContent = v; });
  }
  set(els, 'speedo', !!p.car, (v) => els.speedo.classList.toggle('hidden', !v));

  // objective and timer from the mission system
  const m = state.missionView || {};
  set(els, 'objective', m.objective || '', (v) => { els.objective.textContent = v; els.objective.classList.toggle('hidden', !v); });
  const timer = m.timer !== undefined && m.timer !== null ? Math.max(0, Math.ceil(m.timer)) : '';
  set(els, 'timer', timer, (v) => {
    els.timer.textContent = v === '' ? '' : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
    els.timer.classList.toggle('hidden', v === '');
    els.timer.classList.toggle('urgent', v !== '' && v <= 10);
  });
  set(els, 'mlabel', missionLabel(state.missionView), (v) => { els.mlabel.textContent = v; els.mlabel.classList.toggle('hidden', !v); });
  set(els, 'distance', distanceLine(state, m), (v) => { els.distance.textContent = v; els.distance.classList.toggle('hidden', !v); });
  const ck = clockParts(state);
  set(els, 'clock', ck.day + ck.time, () => { els.clock.innerHTML = `<b>${ck.day}</b>${ck.time}`; });
  const rl = radioLine(state.radio);
  set(els, 'radio', rl.text, () => {
    els.radio.innerHTML = '';
    const st = document.createElement('span'); st.className = 'st'; st.textContent = `♪ ${rl.station} ${rl.frequency}`;
    els.radio.append(st, rl.muted ? 'MUTED · M to unmute' : `${rl.track} · M mute`);
    els.radio.classList.toggle('muted', rl.muted);
  });
  const lb = state.locationBanner;
  set(els, 'loc', lb ? lb.name : '', () => {
    els.locBanner.classList.toggle('hidden', !lb);
    if (lb) { els.locName.textContent = lb.name; els.locTag.textContent = lb.tagline; }
  });
  const dl = state.dialogue;
  set(els, 'dialogue', dl ? dl.speaker + dl.text : '', () => {
    els.dialogue.classList.toggle('hidden', !dl);
    if (dl) { els.speaker.textContent = dl.speaker; els.speaker.style.color = dl.color || '#ffcf5a'; els.line.textContent = dl.text; }
  });
  const br = state.briefing;
  set(els, 'briefing', br ? br.title : '', () => {
    els.briefing.classList.toggle('hidden', !br);
    if (br) {
      els.brTitle.textContent = `JOB ${br.n} · ${br.title}`;
      els.brGiver.textContent = `for ${br.giver}`;
      els.brText.textContent = br.text;
      els.brReward.textContent = `PAYS $${br.reward.toLocaleString('en-US')}`;
    }
  });
  set(els, 'hint', state.hint || '', (v) => { els.hint.textContent = v; els.hint.classList.toggle('hidden', !v); });
  const bn = state.banner;
  set(els, 'banner', bn ? bn.title + bn.sub : '', () => {
    els.banner.classList.toggle('hidden', !bn);
    if (bn) { els.bannerTitle.textContent = bn.title; els.bannerTitle.style.color = bn.color; els.bannerSub.textContent = bn.sub || ''; }
  });

  // notices fade out after their time
  for (const n of state.notices) {
    n.life -= dt;
    if (n.life < 0.3) n.el.style.opacity = Math.max(0, n.life / 0.3);
  }
  while (state.notices.length && state.notices[0].life <= 0) state.notices.shift().el.remove();
  for (let i = state.notices.length - 1; i >= 0; i -= 1) if (state.notices[i].life <= 0) { state.notices[i].el.remove(); state.notices.splice(i, 1); }

  drawMinimap(state, els);
}

function drawMinimap(state, els) {
  const g = els.mm;
  const S = els.minimap.width;
  const p = state.player;
  const s = MM_SCALE;
  const t = state.time;
  g.save();
  g.clearRect(0, 0, S, S);
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#2a8fb0'; g.fillRect(0, 0, S, S);
  const ox = S / 2 - p.x * s, oy = S / 2 - p.y * s;
  g.drawImage(els.mmBase, ox, oy);
  const blip = (x, y, r, color, ring) => {
    let bx = x * s + ox, by = y * s + oy;
    const dx = bx - S / 2, dy = by - S / 2, d = Math.hypot(dx, dy), max = S / 2 - 10;
    const clamped = d > max;
    if (clamped) { bx = S / 2 + (dx / d) * max; by = S / 2 + (dy / d) * max; }
    g.fillStyle = color;
    g.beginPath(); g.arc(bx, by, clamped ? r * 0.85 : r, 0, Math.PI * 2); g.fill();
    if (ring) { g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); }
    return { bx, by, clamped };
  };
  // landmarks
  const pl = state.city.places;
  const icon = (pt, letter, color) => {
    const b = blip(pt.x, pt.y, 7, color, true);
    g.fillStyle = '#111'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, b.bx, b.by + 0.5);
  };
  icon(pl.safehouse, 'S', '#7fd0ff');
  icon(pl.garage, '$', '#c38bff');
  icon(pl.hospital, '+', '#ffffff');
  // gang and cops
  for (const ped of state.peds) {
    if (ped.dead) continue;
    if (ped.kind === 'gang') blip(ped.x, ped.y, 3, '#ff3b3b');
    else if (ped.kind === 'cop' && state.wanted.level > 0) blip(ped.x, ped.y, 3, '#5a9bff');
  }
  for (const v of state.vehicles) {
    if (!v.police || v.dead) continue;
    if (state.wanted.level === 0 && Math.hypot(v.x - p.x, v.y - p.y) > 900) continue;
    const on = Math.floor(t * 6 + v.id) % 2 === 0;
    blip(v.x, v.y, 4, state.wanted.level > 0 ? (on ? '#ff3b4a' : '#3b6bff') : '#7aa0ff', true);
  }
  if (state.heli.active) blip(state.heli.x, state.heli.y, 5, '#ffffff', true);
  // mission markers (clamped to the rim so the way is always shown)
  for (const m of state.fx.markers) {
    const b = blip(m.x, m.y, 6, m.color, true);
    if (b.clamped) {
      g.strokeStyle = m.color; g.lineWidth = 2;
      g.beginPath(); g.arc(b.bx, b.by, 9 + Math.sin(t * 6) * 2, 0, Math.PI * 2); g.stroke();
    }
  }
  // the player's arrow
  const a = p.car ? p.car.a : p.a;
  g.translate(S / 2, S / 2); g.rotate(a);
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -6); g.lineTo(-3, 0); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke();
  g.restore();
  // rim, and the wanted-level police flash around it
  g.strokeStyle = state.wanted.level > 0 ? (Math.floor(t * 4) % 2 ? '#ff3b4a' : '#3b6bff') : 'rgba(255,255,255,0.85)';
  g.lineWidth = 4;
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); g.stroke();
  if (state.wanted.level > 0 && !state.wanted.seen) {
    const k = Math.min(1, state.wanted.evade / evadeTime(state.wanted.level));
    g.strokeStyle = '#7dff8a'; g.lineWidth = 4;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 8, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke();
  }
}
