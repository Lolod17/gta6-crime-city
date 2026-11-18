// main.js — JOB: boot, input, the fixed-step loop and the screen state machine (title, play, pause, dead,
//   briefing, shop).
// EXPORTS: state (the one shared game state; it also boots and runs the game on load)
//
// SUNDOWN: Puerto Ámbar — boot, the fixed-step loop, input, and the state machine
// (title -> play <-> pause, play -> dead -> play, play -> job briefing -> play, play -> shop -> play).
// Every module reads and writes the one shared `state` object built here.
import { STEP, SLOW_FRAME_MS, WORLD, PLAYER, POLICE } from './config.js';
import { buildCity, makeRng, isBlocked } from './city.js';
import { createRenderer, resizeRenderer, renderFrame, createFx, updateEffects, floatText, warmGround, burst } from './render.js';
import { createCamera, updateCamera, placeCamera, toWorld } from './camera.js';
import { createPlayer, updatePlayer, updateBullets, carHitsPeople } from './player.js';
import { createVehicle, updateVehicle, collideVehicles } from './vehicle.js';
import { initTraffic, updateTraffic, hurtPed, ejectDriver, scarePeople, updatePickups, populate } from './traffic.js';
import { createWanted, createHeli, updatePolice, reportCrime, clearWanted, onEjectCop } from './police.js';
import { initJobs, updateJobs, failMission } from './jobs.js';
import { defineMissions } from './missions.js';
import { defineActivities } from './activities.js';
import { beginDay } from './story.js';
import { updateDistricts, resetDistricts } from './districts.js';
import { DAY_OPENS, advanceClock } from './clock.js';
import { createRadio, updateRadio, toggleMute, radioLine } from './radio.js';
import { updateShop, restoreOwned } from './shop.js';
import { witnessShot, updateWitnesses } from './witnesses.js';
import { initHud, updateHud, pushNotice } from './hud.js';
import { initAudio, sfx, updateAudio } from './audio.js';
import { hasSave, saveGame, loadGame } from './persist.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || WORLD.seed;
const canvas = document.getElementById('game');
const city = buildCity(seed);
const renderer = createRenderer(canvas, city);
const state = createState();
window.__sundown = state;   // exposed for the automated play-test and screenshot script

function createState() {
  const s = {
    mode: 'title', time: 0, city, rng: makeRng(seed + 101), density: 1,
    camera: createCamera(), player: createPlayer(city.places.start.x, city.places.start.y),
    vehicles: [], peds: [], bullets: [], pickups: [], fx: createFx(),
    wanted: createWanted(), heli: createHeli(),
    money: 250, stats: { kills: 0, carsStolen: 0, carsWrecked: 0, crashes: 0, shots: 0, escapes: 0, deaths: 0, busts: 0 },
    progress: { day: 1, done: [], smg: false, owned: {}, ending: null, bests: {} },
    input: { keys: new Set(), pressed: new Set(), mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false, clicked: false, active: false } },
    dialogue: null, banner: null, hint: '', missionView: null, flash: 0, deadTimer: 0, timeScale: 1,
    mission: null,
    loc: { id: null }, locationBanner: null, dayMinute: DAY_OPENS, radio: createRadio(),
  };
  s.notify = (text, color) => pushNotice(s, text, color);
  s.crime = (kind, x, y) => { if (s.mode === 'play' && !(kind === 'gunfire' && s.noGunHeat)) reportCrime(s, kind, x, y); };
  s.hurtPed = (ped, dmg, by, nx, ny) => hurtPed(s, ped, dmg, by, nx, ny);
  s.ejectDriver = (v, x, y) => ejectDriver(s, v, x, y);
  s.onEject = (ped) => onEjectCop(s, ped);
  s.gunfire = (x, y, owner) => {
    scarePeople(s, x, y, 380);
    if (owner === 'player') witnessShot(s, x, y);   // bystanders who saw it phone the PAPD
  };
  s.addMoney = (amount, x, y) => {
    s.money += amount;
    s.notify(`${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toLocaleString('en-US')}`, amount >= 0 ? '#7dff8a' : '#ff7a7a');
    if (x !== undefined) floatText(s, x, y - 14, `${amount >= 0 ? '+' : '-'}$${Math.abs(amount)}`, amount >= 0 ? '#7dff8a' : '#ff7a7a');
  };
  s.hurtPlayer = (dmg, by) => {
    const p = s.player;
    if (p.health <= 0 || p.invuln > 0 || s.mode !== 'play') return;
    const soak = Math.min(p.armor, dmg * 0.7);
    p.armor -= soak;
    p.health -= dmg - soak;
    s.flash = Math.min(0.5, s.flash + dmg / 60);
    if (s.time - p.lastHurt > 0.4 && dmg >= 2) { s.notify(`-${Math.round(dmg)} health`, '#ff7a7a'); p.lastHurt = s.time; }
    sfx('hurt', 0.5);
    if (p.health <= 0) die('WASTED', 'hospital');
  };
  s.busted = () => die('BUSTED', 'station');
  s.spawnAt = (pt) => spawnPlayer(pt, true);
  s.onEnterCar = (v) => { if (!v.police && s.time - (s.lastRadio || -99) > 40) { s.lastRadio = s.time; s.notify(`♪ ${radioLine(s.radio).text}`, '#7ff0e0'); } };
  s.save = () => saveGame(s);
  return s;
}

// ------------------------------------------------------------------ input

const input = state.input;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (!input.keys.has(e.code)) input.pressed.add(e.code);
  input.keys.add(e.code);
  initAudio();
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) togglePause();
  if (state.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) startGame(hasSave());
  if (e.code === state.radio.key && !e.repeat && state.mode !== 'title') toggleMute(state, state.radio);
});
addEventListener('keyup', (e) => input.keys.delete(e.code));
addEventListener('blur', () => { input.keys.clear(); input.mouse.down = false; if (state.mode === 'play') togglePause(); });
canvas.addEventListener('mousemove', (e) => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.active = true; });
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  input.mouse.down = true; input.mouse.clicked = true; input.mouse.active = true;
  input.mouse.x = e.clientX; input.mouse.y = e.clientY;
  initAudio();
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ screens

const ui = {
  title: document.getElementById('title'),
  pause: document.getElementById('pause'),
  btnNew: document.getElementById('btnNew'),
  btnContinue: document.getElementById('btnContinue'),
  btnResume: document.getElementById('btnResume'),
  btnSave: document.getElementById('btnSave'),
  btnQuit: document.getElementById('btnQuit'),
};
ui.btnNew.addEventListener('click', () => startGame(false));
ui.btnContinue.addEventListener('click', () => startGame(true));
ui.btnResume.addEventListener('click', () => togglePause());
ui.btnSave.addEventListener('click', () => { saveGame(state); state.notify('Game saved', '#7fd0ff'); togglePause(); });
ui.btnQuit.addEventListener('click', () => { saveGame(state); location.reload(); });

function showTitle() {
  state.mode = 'title';
  ui.title.classList.remove('hidden');
  ui.btnContinue.disabled = !hasSave();
  // the title camera drifts down the coast road over the live city
  state.titlePath = 0;
}

function startGame(fromSave) {
  initAudio();
  ui.title.classList.add('hidden');
  initJobs(state, defineMissions(city), defineActivities(city));
  const save = fromSave ? loadGame(state.missionDefs.map((d) => d.id)) : null;
  if (save) {
    state.money = save.money;
    state.progress = { ...state.progress, ...save.progress, day: save.day, done: save.done };
    state.stats = { ...state.stats, ...save.stats };
    if (state.progress.smg) state.player.ammo.smg = Math.max(state.player.ammo.smg, 120);
    restoreOwned(state);
  }
  state.mode = 'play';
  spawnPlayer(city.places.safehouse, true, state.progress.owned.cometa ? 'cometa' : 'marlin');
  if (save && save.wanted > 0) {
    state.wanted.heat = POLICE.starHeat[save.wanted] + 20;
    state.wanted.level = save.wanted;
  }
  populate(state);
  resetDistricts(state);
  beginDay(state);
  state.notify(save ? 'Welcome back to Puerto Ámbar' : 'Puerto Ámbar. 6:40 pm.', '#ffcf5a');
  sfx('start', 0.8);
}

function togglePause() {
  if (state.mode === 'play') {
    state.mode = 'pause';
    ui.pause.classList.remove('hidden');
  } else if (state.mode === 'pause') {
    state.mode = 'play';
    ui.pause.classList.add('hidden');
  }
}

/** Put the player at a place (on the kerb) with a car parked beside them. */
function spawnPlayer(place, withCar, model = 'pelican') {
  const p = state.player;
  p.x = place.x; p.y = place.y;
  // find open ground near the place
  for (let r = 0; r < 200 && isBlocked(city, p.x, p.y, p.r + 2); r += 8) { p.x = place.x + r; p.y = place.y + r * 0.5; }
  p.health = PLAYER.health; p.car = null; p.vx = 0; p.vy = 0; p.bust = 0;
  p.invuln = PLAYER.invulnAfterSpawn;
  if (withCar) {
    let cx = p.x + 40, cy = p.y;
    for (const [dx, dy] of [[0, 46], [0, -46], [46, 0], [-46, 0], [60, 40]]) {
      if (!isBlocked(city, p.x + dx, p.y + dy, 26)) { cx = p.x + dx; cy = p.y + dy; break; }
    }
    const v = createVehicle(model, cx, cy, Math.abs(cy - p.y) > Math.abs(cx - p.x) ? 0 : -Math.PI / 2, state.rng);
    if (model === 'cometa') v.owned = true;
    state.vehicles.push(v);
  }
  placeCamera(state.camera, p.x, p.y);
}

function die(title, where) {
  if (state.mode !== 'play') return;
  const p = state.player;
  state.mode = 'dead';
  state.deadTimer = 3.2;
  state.timeScale = 0.35;
  state.banner = { title, sub: title === 'WASTED' ? 'Puerto Ámbar General patches you up.' : 'The PAPD takes your cut.', color: title === 'WASTED' ? '#ff4a4a' : '#5a9bff' };
  state.respawnAt = where;
  if (title === 'WASTED') { state.stats.deaths += 1; if (p.car) { p.car.driver = null; } }
  else { state.stats.busts += 1; if (p.car) { p.car.driver = null; p.car = null; } }
  p.health = Math.max(0, p.health);
  failMission(state, title === 'WASTED' ? 'You died.' : 'You were busted.');
  sfx(title === 'WASTED' ? 'wasted' : 'busted', 1);
}

function respawn() {
  const p = state.player;
  const loss = Math.round(state.money * PLAYER.respawnMoneyLoss);
  clearWanted(state);
  state.peds = state.peds.filter((c) => c.kind !== 'cop');
  state.vehicles = state.vehicles.filter((v) => !(v.police && v.driver === 'cop'));
  state.bullets.length = 0;
  state.heli.active = false;
  state.banner = null;
  state.timeScale = 1;
  state.mode = 'play';
  if (p.car) { p.car.driver = null; p.car = null; }
  // a failed job sends the player back to its start marker; otherwise hospital or station
  spawnPlayer(state.respawnPoint || (state.respawnAt === 'station' ? city.places.station : city.places.hospital), true);
  state.respawnPoint = null;
  populate(state);
  if (loss > 0) state.addMoney(-loss);
  if (state.failNote) { state.notify(`Mission failed: ${state.failNote}`, '#ff5a5a'); state.failNote = null; }
  state.onRespawn && state.onRespawn();
}

// ------------------------------------------------------------------ loop

function stepWorld(dt) {
  state.time += dt;
  const m = input.mouse;
  const w = toWorld(state.camera, m.x, m.y);
  m.wx = w.x; m.wy = w.y;

  if (state.mode === 'title') {
    // attract mode: the camera glides along a loop over downtown and the coast
    state.titlePath += dt * 0.035;
    const t = state.titlePath;
    state.player.x = 2200 + Math.cos(t) * 1100;
    state.player.y = 2100 + Math.sin(t * 1.3) * 1200;
    state.player.vx = -Math.sin(t) * 120; state.player.vy = Math.cos(t * 1.3) * 140;
  } else if (state.mode === 'play' || state.mode === 'dead' || state.mode === 'mission' || state.mode === 'shop') {
    if (state.mode === 'play') updatePlayer(state, dt);
    updatePolice(state, dt);
    updateJobs(state, dt);
    updateShop(state);
    updateWitnesses(state, dt);
    updateDistricts(state, dt);
    // the clock and the radio run with play; the HUD reads them, the simulation never does
    advanceClock(state, dt);
    updateRadio(state, state.radio, dt);
  }
  if (state.mode !== 'pause') {
    updateTraffic(state, dt);
    for (const v of state.vehicles) {
      if (v.parked && v.driver === null && Math.abs(v.vx) + Math.abs(v.vy) < 1 && !v.dead) continue;
      updateVehicle(state, v, dt);
    }
    collideVehicles(state);
    carHitsPeople(state);
    updateBullets(state, dt);
    if (state.mode === 'play') updatePickups(state, dt);
    updateEffects(state, dt);
    updateCamera(state.camera, state, dt);
    if (state.flash > 0) state.flash -= dt;
  }
  if (state.mode === 'dead') {
    state.deadTimer -= dt / state.timeScale;
    if (state.deadTimer <= 0) respawn();
  }
  input.pressed.clear();
  input.mouse.clicked = false;
}

let last = performance.now();
let acc = 0;
let slow = 0, fast = 0;
let autosave = 0;
const perf = { step: 0, render: 0, work: 0 };
state.perf = perf;
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  // density governor: frames whose work exceeds 20 ms thin the crowds before anything else is cut
  if (perf.work > SLOW_FRAME_MS && state.mode !== 'title') { slow += 1; fast = 0; } else { fast += 1; slow = Math.max(0, slow - 0.25); }
  if (slow > 20) { state.density = Math.max(0.4, state.density - 0.1); slow = 0; }
  if (fast > 600) { state.density = Math.min(1, state.density + 0.05); fast = 0; }
  const t0 = performance.now();

  acc += real * (state.mode === 'dead' ? state.timeScale : 1);
  let steps = 0;
  while (acc >= STEP && steps < 6) { stepWorld(STEP); acc -= STEP; steps += 1; }
  if (steps === 6) acc = 0;
  const t1 = performance.now();
  state.hint = hintFor();
  renderFrame(renderer, state);
  updateHud(state, real);
  updateAudio(state, real);
  const t2 = performance.now();
  perf.step += ((t1 - t0) - perf.step) * 0.1;
  perf.render += ((t2 - t1) - perf.render) * 0.1;
  perf.work = (t2 - t0);
  if (state.mode === 'play') {
    autosave += real;
    if (autosave > 15) { autosave = 0; saveGame(state); }
  }
  requestAnimationFrame(frame);
}

function hintFor() {
  if (state.mode !== 'play' && state.mode !== 'mission' && state.mode !== 'shop') return '';
  const p = state.player;
  if (state.briefing) return 'ENTER — take the job    BACKSPACE — not now';
  if (state.mode === 'shop') return '1–4 — buy    BACKSPACE — leave the counter';
  if (state.missionHint) return state.missionHint;
  if (p.car) return '';
  for (const v of state.vehicles) {
    if (!v.dead && v.driver !== 'player' && Math.hypot(v.x - p.x, v.y - p.y) < 70) {
      return v.driver ? `F — steal the ${v.name}` : `F — get in the ${v.name}`;
    }
  }
  return '';
}

function resize() {
  const w = Math.max(640, innerWidth), h = Math.max(400, innerHeight);
  resizeRenderer(renderer, w, h);
  state.camera.w = w; state.camera.h = h;
}
addEventListener('resize', resize);
resize();
initHud(state);
initTraffic(state);
showTitle();
placeCamera(state.camera, 2200, 2100);
warmGround(renderer);
requestAnimationFrame(frame);

export { state };
