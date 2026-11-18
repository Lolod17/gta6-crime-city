// hud.js — JOB: the one public entry for the DOM heads-up display: updateHud runs the HUD parts in order; everything else is re-exported from hud/.
// EXPORTS: missionLabel, distanceLine, hintLine, initHud, pushNotice, updateHud
// USES: hud/panels.js, hud/mission.js, hud/overlays.js
// HEIST PASS: the HUD now runs a fourth part, hud/panels.js drawHeistPanels: the ALARM countdown and the
//   crew strip, drawn after the mission rows and before the overlays so a notice never covers the clock.
// MUST NOT: hold HUD code of its own beyond the show/hide switch and the order of the parts (that lives in hud/*.js).
import { initHud, set, updatePanels, drawMinimap, drawHeistPanels } from './hud/panels.js';
import { missionLabel, distanceLine, updateMissionHud } from './hud/mission.js';
import { hintLine, pushNotice, updateOverlays } from './hud/overlays.js';

export function updateHud(state, dt) {
  const els = state.hud;
  const playing = state.mode !== 'title';
  set(els, 'show', playing, (v) => els.hud.classList.toggle('hidden', !v));
  if (!playing) return;
  updatePanels(state, els);
  updateMissionHud(state, els);
  drawHeistPanels(state, els);
  updateOverlays(state, els, dt);
  drawMinimap(state, els);
}

export { missionLabel, distanceLine, hintLine, initHud, pushNotice };
