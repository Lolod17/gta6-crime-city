// boot/loop.js — JOB: the fixed-step frame loop and its timing: stepWorld in the module order, the density
//   governor, render, HUD and audio each frame, autosave, resize, and the boot sequence that starts it.
// EXPORTS: startLoop
// USES: ../config.js, ../render.js, ../camera.js, ../player.js, ../vehicle.js, ../traffic.js, ../police.js, ../jobs.js, ../districts.js, ../clock.js, ../radio.js, ../shop.js, ../shop/weapons.js, ../witnesses.js, ../hud.js, ../audio.js, ../persist.js, ./state.js
// MUST NOT: build state or change screens itself beyond calling respawn when the death timer runs out (boot/state.js).
import { STEP, SLOW_FRAME_MS } from '../config.js';
import { resizeRenderer, renderFrame, updateEffects, warmGround } from '../render.js';
import { updateCamera, placeCamera, toWorld } from '../camera.js';
import { updatePlayer, updateBullets, carHitsPeople } from '../player.js';
import { updateVehicle, collideVehicles } from '../vehicle.js';
import { initTraffic, updateTraffic, updatePickups } from '../traffic.js';
import { updatePolice } from '../police.js';
import { updateJobs } from '../jobs.js';
import { updateDistricts } from '../districts.js';
import { advanceClock } from '../clock.js';
import { updateRadio } from '../radio.js';
import { updateShop } from '../shop.js';
import { updateArms } from '../shop/weapons.js';
import { updateWitnesses } from '../witnesses.js';
import { initHud, updateHud, hintLine } from '../hud.js';
import { updateAudio } from '../audio.js';
import { saveGame } from '../persist.js';
import { state, renderer, showTitle, respawn } from './state.js';

const input = state.input;

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
  } else if (state.mode === 'play' || state.mode === 'dead' || state.mode === 'mission' || state.mode === 'shop' || state.mode === 'arms') {
    if (state.mode === 'play') updatePlayer(state, dt);
    updatePolice(state, dt);
    updateJobs(state, dt);
    updateShop(state);
    updateArms(state);   // Armas del Muelle, the dockside gun counter
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
  state.hint = hintLine(state);
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

function resize() {
  const w = Math.max(640, innerWidth), h = Math.max(400, innerHeight);
  resizeRenderer(renderer, w, h);
  state.camera.w = w; state.camera.h = h;
}

/** Boot: size the canvas, build the HUD and parked cars, show the title and start the frames. */
export function startLoop() {
  addEventListener('resize', resize);
  resize();
  initHud(state);
  initTraffic(state);
  showTitle();
  placeCamera(state.camera, 2200, 2100);
  warmGround(renderer);
  requestAnimationFrame(frame);
}
