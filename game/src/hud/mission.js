// hud/mission.js — JOB: the mission rows of the HUD: the mission label, the objective, the distance to
//   the objective and the countdown timer.
// EXPORTS: missionLabel, distanceLine, updateMissionHud
// USES: ../districts.js, ./panels.js
// MUST NOT: run or change a mission (jobs.js does); it prints state.missionView.
import { districtAt } from '../districts.js';
import { set } from './panels.js';

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

/** Objective, timer, mission label and distance from state.missionView. */
export function updateMissionHud(state, els) {
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
}
