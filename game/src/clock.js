// clock.js — JOB: the in-game time of day: where each story day's clock starts, how it runs with play,
// how the HUD prints it, and how deep the dusk is at any minute. Cosmetic only: the simulation never
// reads it; hud.js prints it and render.js grades the city by it.
// EXPORTS: DAY_OPENS, advanceClock, resetClock, clockParts, duskAmount
import { CLOCK } from './config.js';

/** Every day of the story opens at dusk, 18:24. */
export const DAY_OPENS = CLOCK.startMinute + 24;

/** Run the clock on by dt seconds of play (one game minute per real second). */
export function advanceClock(state, dt) {
  state.dayMinute = (state.dayMinute + dt * CLOCK.minutePerSecond) % (CLOCK.dayLength * 60);
}

/** Back to the day's opening minute (a new story day begins). */
export function resetClock(state) { state.dayMinute = DAY_OPENS; }

/** "DAY 1 18:24": the story day from the mission arc and the clock from play. */
export function clockParts(state) {
  const mins = Math.floor(state.dayMinute || 0);
  return { day: `DAY ${state.progress.day}`, time: `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` };
}

/** 0 by day, rising from 19:00 to its deepest at 21:00, easing off after 05:00. */
export function duskAmount(state) {
  if (state.mode === 'title' || state.dayMinute === undefined) return 0;
  const m = state.dayMinute;
  if (m >= 19 * 60) return Math.min(1, (m - 19 * 60) / 120) * 0.5;
  if (m < 5 * 60) return 0.5;
  if (m < 7 * 60) return (1 - (m - 5 * 60) / 120) * 0.5;
  return 0;
}
