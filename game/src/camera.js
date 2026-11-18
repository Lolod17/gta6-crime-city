// camera.js — JOB: the follow camera: lead, zoom with speed, clamp to the city, shake, and screen/world
//   conversion.
// EXPORTS: createCamera, placeCamera, updateCamera, shakeCamera, toScreen, toWorld
// USES: config.js
// SPLIT PASS: code unchanged; imported by boot/state.js, boot/loop.js after the split; loaded in the split-pass smoke
//   run with no console errors.
//
// Smoothed follow camera: leads the player by their velocity, zooms out with speed, never snaps,
// stays inside the city, and shakes briefly on impacts and gunfire (unless reduced motion is on).
import { CAMERA, WORLD } from './config.js';

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createCamera() {
  return { x: 0, y: 0, zoom: CAMERA.zoomFoot, shake: 0, shakeAmp: 0, ox: 0, oy: 0, w: 1280, h: 720 };
}

/** Jump straight to a point (only on spawn and respawn, never during play). */
export function placeCamera(cam, x, y) {
  cam.x = x; cam.y = y;
}

export function updateCamera(cam, state, dt) {
  const p = state.player;
  const body = p.car || p;
  const vx = body.vx || 0, vy = body.vy || 0;
  const speed = Math.hypot(vx, vy);
  const k = 60 * dt;                       // lerp constants are per 60 Hz step
  const lerp = 1 - Math.pow(1 - CAMERA.lerp, k);

  let tx = body.x + vx * CAMERA.lookAhead;
  let ty = body.y + vy * CAMERA.lookAhead;
  if (!p.car && state.input.mouse.active) {
    // on foot the camera leans a little toward the aim
    tx += (state.input.mouse.wx - p.x) * 0.18;
    ty += (state.input.mouse.wy - p.y) * 0.18;
  }

  const fast = Math.min(1, speed / 640);
  const targetZoom = p.car ? CAMERA.zoomCar + (CAMERA.zoomFast - CAMERA.zoomCar) * fast : CAMERA.zoomFoot;
  cam.zoom += (targetZoom - cam.zoom) * (1 - Math.pow(1 - CAMERA.zoomLerp, k));

  cam.x += (tx - cam.x) * lerp;
  cam.y += (ty - cam.y) * lerp;

  // clamp so the view never shows beyond the map
  const hw = cam.w / 2 / cam.zoom, hh = cam.h / 2 / cam.zoom;
  cam.x = Math.max(hw, Math.min(WORLD.size - hw, cam.x));
  cam.y = Math.max(hh, Math.min(WORLD.size - hh, cam.y));

  if (cam.shake > 0 && !reduceMotion) {
    cam.shake -= dt;
    const a = cam.shakeAmp * (cam.shake / CAMERA.shakeTime);
    cam.ox = (Math.random() * 2 - 1) * a;
    cam.oy = (Math.random() * 2 - 1) * a;
  } else {
    cam.shake = 0; cam.ox = 0; cam.oy = 0;
  }
}

/** Shake for 120 ms; amount 0..1 scales the amplitude. A bigger hit overrides a smaller one. */
export function shakeCamera(cam, amount) {
  if (reduceMotion) return;
  const amp = CAMERA.shakeMax * Math.min(1, amount);
  if (cam.shake <= 0 || amp >= cam.shakeAmp * (cam.shake / CAMERA.shakeTime)) {
    cam.shakeAmp = amp;
    cam.shake = CAMERA.shakeTime;
  }
}

/** World point to screen pixel. */
export function toScreen(cam, x, y) {
  return { x: (x - cam.x) * cam.zoom + cam.w / 2 + cam.ox, y: (y - cam.y) * cam.zoom + cam.h / 2 + cam.oy };
}

/** Screen pixel to world point. */
export function toWorld(cam, sx, sy) {
  return { x: (sx - cam.w / 2 - cam.ox) / cam.zoom + cam.x, y: (sy - cam.h / 2 - cam.oy) / cam.zoom + cam.y };
}
