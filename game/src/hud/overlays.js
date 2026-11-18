// hud/overlays.js — JOB: the HUD text that comes and goes: notices, the radio line, the district banner,
//   dialogue subtitles, the job briefing card, the key hint and the big centre banners.
// EXPORTS: hintLine, pushNotice, updateOverlays
// USES: ../config.js, ../radio.js, ./panels.js
// DISTRICT PASS: the counter panel lists what a shop sells (Armas del Muelle, and Punta Arms, whose
//   shopView was built but never shown); the banner takes its district's accent colour.
// MUST NOT: decide what is said or when (story.js, jobs.js and radio.js do); it shows what state holds.
import { HUD } from '../config.js';
import { radioLine } from '../radio.js';
import { set } from './panels.js';

/** The one-line key hint above the dialogue: job briefing, shop counter, mission hint, or the car in reach. */
export function hintLine(state) {
  if (state.mode !== 'play' && state.mode !== 'mission' && state.mode !== 'shop' && state.mode !== 'arms') return '';
  const p = state.player;
  if (state.briefing) return 'ENTER — take the job    BACKSPACE — not now';
  if (state.mode === 'shop') return '1–4 — buy    BACKSPACE — leave the counter';
  if (state.mode === 'arms') return '1–3 — buy    BACKSPACE — leave the counter';
  if (state.missionHint) return state.missionHint;
  if (p.car) return '';
  for (const v of state.vehicles) {
    if (!v.dead && v.driver !== 'player' && Math.hypot(v.x - p.x, v.y - p.y) < 70) {
      return v.driver ? `F — steal the ${v.name}` : `F — get in the ${v.name}`;
    }
  }
  return '';
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

/** Radio, district banner, dialogue, briefing, hint and centre banner; then age the notices by dt. */
export function updateOverlays(state, els, dt) {
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
    if (lb) {
      els.locName.textContent = lb.name; els.locTag.textContent = lb.tagline;
      els.locBanner.style.borderLeftColor = lb.accent || '';   // beach teal, port hazard yellow
    }
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
      els.brReward.textContent = br.reward;
    }
  });
  // the shop counter: whichever counter the player is standing at
  const cv = state.mode === 'arms' ? state.armsView : state.mode === 'shop' && state.shopView ? { title: 'PUNTA ARMS', sub: 'Guns, vests and one very fast car', ...state.shopView } : null;
  const cvKey = cv ? cv.title + cv.sub + cv.items.map((i) => `${i.name}${i.price}${i.note}`).join('|') : '';
  set(els, 'counter', cvKey, () => {
    els.counter.classList.toggle('hidden', !cv);
    if (!cv) return;
    els.counter.innerHTML = '';
    const head = document.createElement('div'); head.className = 'ctTitle'; head.textContent = cv.title;
    const sub = document.createElement('div'); sub.className = 'ctSub'; sub.textContent = cv.sub;
    els.counter.append(head, sub);
    for (const it of cv.items) {
      const row = document.createElement('div'); row.className = 'ctRow' + (it.owned ? ' owned' : '');
      const key = document.createElement('b'); key.textContent = it.n;
      const name = document.createElement('span'); name.className = 'ctName'; name.textContent = it.name;
      const price = document.createElement('span'); price.className = 'ctPrice'; price.textContent = `$${it.price.toLocaleString('en-US')}`;
      const note = document.createElement('div'); note.className = 'ctNote'; note.textContent = it.note;
      row.append(key, name, price, note);
      els.counter.append(row);
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

}
