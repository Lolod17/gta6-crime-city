// render.js — JOB: the one public entry for drawing: renderFrame runs the passes in order; everything else is re-exported from render/.
// EXPORTS: createFx, burst, addDecal, floatText, addShake, updateEffects, createRenderer, warmGround, resizeRenderer, renderFrame
// USES: config.js, render/draw.js, render/world.js, render/entities.js, render/fx.js
// MUST NOT: hold drawing code of its own beyond the pass order and the camera transform (that lives in render/*.js).
import { COLORS } from './config.js';
import { view } from './render/draw.js';
import { drawGround, drawWater, drawBoats, drawScenery, drawLight } from './render/world.js';
import { drawMarkers, drawPickups, drawActors, drawBullets, drawHeli } from './render/entities.js';
import { drawDecals, drawParticles, drawFloatText } from './render/fx.js';

export { createFx, burst, addDecal, floatText, addShake, updateEffects } from './render/fx.js';
export { createRenderer, warmGround, resizeRenderer } from './render/world.js';

// Drawing, in order: ground (pre-rendered chunks with roads, lawns, pools, sand, shadows), water and
// boats, decals, markers, pickups, people, cars, the player, bullets, tree canopies and extruded
// buildings (far to near), particles, the police helicopter, floating text, then the light.
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

  drawGround(ctx, r);
  drawWater(ctx, t);
  drawBoats(ctx, r, t);
  drawDecals(ctx, state);
  drawMarkers(ctx, state, t);
  drawPickups(ctx, state, t);
  drawActors(ctx, state, t);
  drawBullets(ctx, state);
  drawScenery(ctx, r, cam, t, z);
  drawParticles(ctx, state);
  drawHeli(ctx, state, t);
  drawFloatText(ctx, state);
  drawLight(ctx, r, state, w, h, z, cam);
}
