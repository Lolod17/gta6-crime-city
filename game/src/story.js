// story.js — JOB: the story frame: cast, the three days and their lines, the subtitle queue, and which
//   mission is unlocked.
// EXPORTS: CAST, DAYS, LAST_DAY, say, queueLines, updateDialogue, nextMission, missionsOfDay, storyComplete,
//   beginDay, completeMission, catchUpDay, updateStory, dayLabel
// DISTRICT PASS: a fourth day, THE COAST, holds missions 13–15 in Bahía Azul and the Southside port; the
//   lifeguard Mara joins the cast; catchUpDay moves an old save that finished day 3 on to day 4.
// USES: audio.js, clock.js
// SPLIT PASS: code unchanged; imported by boot/state.js after the split; loaded in the split-pass smoke run with no
//   console errors.
//
// The story of SUNDOWN: Puerto Ámbar — the cast, the three days, each day's spoken lines, the
// subtitle queue, and which mission is unlocked. Missions unlock in order inside a day; the day
// advances only when every mission of that day is done. missions.js holds the missions themselves.
import { sfx } from './audio.js';
import { resetClock } from './clock.js';

/** The named cast. Rio is the player. Teo Castellan is the rival. All names are original. */
export const CAST = {
  RIO: { name: 'RIO', full: 'Rio Salcedo', color: '#7fd0ff' },
  INES: { name: 'INÉS', full: 'Inés Ocampo', color: '#ffb35a', role: 'runs the Taquería Inés and half the west side' },
  DARIO: { name: 'DARIO', full: 'Dario Kell', color: '#c38bff', role: 'fixer, smiles while he counts' },
  NANDO: { name: 'NANDO', full: 'Nando Reyes', color: '#2bd9a6', role: 'barman at Bar Caracol, hears everything' },
  TEO: { name: 'TEO', full: 'Teo Castellan', color: '#ff3d7f', role: 'boss of the Glasshand crew, the rival' },
  RADIO: { name: 'RADIO', full: 'PAPD dispatch', color: '#9ab8ff' },
  GANG: { name: 'GLASSHAND', full: 'Glasshand crew', color: '#ff6a6a' },
  MARA: { name: 'MARA', full: 'Mara Quintero', color: '#18b6c9', role: 'lifeguard at Bahía Azul, sees every boat come in' },
};

/** The three days. `lines` are spoken once when the day begins: one per character. */
export const DAYS = [
  null,
  {
    title: 'LEARN THE CITY',
    lines: [
      ['INES', 'Learn these streets, Rio. Fast.'],
      ['DARIO', 'Inés says you drive. Prove it.'],
      ['NANDO', 'Bar Caracol hears everything, kid.'],
    ],
  },
  {
    title: 'THE CREW',
    lines: [
      ['INES', 'Today you\'re crew. Act like it.'],
      ['DARIO', 'Glasshands want our streets. Embarrass them.'],
      ['NANDO', 'Someone wants me quiet. Help.'],
    ],
  },
  {
    title: 'THE HEAT',
    lines: [
      ['INES', 'Teo has the harbour ledger.'],
      ['DARIO', 'Last day. Then we\'re rich.'],
      ['NANDO', 'Watch Dario. He counts fast.'],
    ],
  },
  {
    title: 'THE COAST',
    lines: [
      ['INES', 'Teo\'s gone. His cargo isn\'t.'],
      ['MARA', 'Glasshands on my beach. Again.'],
      ['NANDO', 'The port pays. If you\'re fast.'],
    ],
    // the player who sold the ledger to the broker hears a colder Inés
    sold: [['INES', 'You sold me out. Earn it back.']],
  },
];
export const LAST_DAY = DAYS.length - 1;

/** Queue a subtitle line now (it jumps the queue). `who` is a CAST key or a raw name. */
export function say(state, who, text) {
  const c = CAST[who] || { name: who, color: '#fff' };
  state.dialogueQueue.unshift([c.name, text, c.color]);
  state.dialogueTimer = 0;
}

/** Append lines [who, text] to the subtitle queue, played in order. */
export function queueLines(state, lines) {
  for (const [who, text] of lines) {
    const c = CAST[who] || { name: who, color: '#fff' };
    state.dialogueQueue.push([c.name, text, c.color]);
  }
}

/** Subtitles: one line at a time, held long enough to read. */
export function updateDialogue(state, dt) {
  if (state.dialogueTimer > 0) state.dialogueTimer -= dt;
  if (state.dialogueTimer <= 0) {
    const next = state.dialogueQueue.shift();
    if (next) {
      state.dialogue = { speaker: next[0], text: next[1], color: next[2] };
      state.dialogueTimer = 2.2 + next[1].length * 0.035;
    } else state.dialogue = null;
  }
}

/** The mission the player can take now: the first one of today not yet done. */
export function nextMission(state) {
  const day = state.progress.day;
  return state.missionDefs.find((d) => d.day === day && !state.progress.done.includes(d.id)) || null;
}

export const missionsOfDay = (state, day) => state.missionDefs.filter((d) => d.day === day);
export const storyComplete = (state) => state.progress.done.length >= state.missionDefs.length;

/** A day begins: its title card and the cast's lines for it. */
export function beginDay(state) {
  const day = state.progress.day;
  const d = DAYS[day];
  if (!d) return;
  state.dayCard = { title: `DAY ${day}`, sub: d.title, life: 4 };
  resetClock(state);   // every day of the story opens at dusk
  const lines = d.sold && state.progress.ending === 'sold' ? [...d.sold, ...d.lines.filter(([who]) => who !== 'INES')] : d.lines;
  queueLines(state, lines);
}

/** Record a finished mission; when it was the day's last, the next day begins. */
export function completeMission(state, id) {
  const pr = state.progress;
  if (!pr.done.includes(id)) pr.done.push(id);
  const dayDone = missionsOfDay(state, pr.day).every((d) => pr.done.includes(d.id));
  if (dayDone && pr.day < LAST_DAY) {
    pr.day += 1;
    // the day card follows the mission-passed banner
    state.pendingDay = 3.6;
    sfx('objective', 0.6);
  }
}

/** A loaded save whose current day is already finished moves on (old saves ended at day 3). */
export function catchUpDay(state) {
  const pr = state.progress;
  while (pr.day < LAST_DAY && missionsOfDay(state, pr.day).every((d) => pr.done.includes(d.id))) pr.day += 1;
}

/** Tick the day card and the delayed start of a new day. */
export function updateStory(state, dt) {
  if (state.pendingDay > 0) {
    state.pendingDay -= dt;
    if (state.pendingDay <= 0) { state.pendingDay = 0; beginDay(state); }
  }
  if (state.dayCard) {
    state.dayCard.life -= dt;
    if (state.dayCard.life <= 0) state.dayCard = null;
  }
}

/** "DAY 4 · THE COAST · 13/15 MISSIONS" for the HUD. */
export function dayLabel(state) {
  const day = state.progress.day;
  return `DAY ${day} · ${DAYS[day].title} · ${state.progress.done.length}/${state.missionDefs.length} MISSIONS`;
}
