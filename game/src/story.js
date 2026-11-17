// The story of SUNDOWN: Puerto Ámbar — the cast, the three days, each day's spoken lines, the
// subtitle queue, and which mission is unlocked. Missions unlock in order inside a day; the day
// advances only when every mission of that day is done. missions.js holds the missions themselves.
import { sfx } from './audio.js';

/** The named cast. Rio is the player. Teo Castellan is the rival. All names are original. */
export const CAST = {
  RIO: { name: 'RIO', full: 'Rio Salcedo', color: '#7fd0ff' },
  INES: { name: 'INÉS', full: 'Inés Ocampo', color: '#ffb35a', role: 'runs the Taquería Inés and half the west side' },
  DARIO: { name: 'DARIO', full: 'Dario Kell', color: '#c38bff', role: 'fixer, smiles while he counts' },
  NANDO: { name: 'NANDO', full: 'Nando Reyes', color: '#2bd9a6', role: 'barman at Bar Caracol, hears everything' },
  TEO: { name: 'TEO', full: 'Teo Castellan', color: '#ff3d7f', role: 'boss of the Glasshand crew, the rival' },
  RADIO: { name: 'RADIO', full: 'PAPD dispatch', color: '#9ab8ff' },
  GANG: { name: 'GLASSHAND', full: 'Glasshand crew', color: '#ff6a6a' },
};

/** The three days. `lines` are spoken once when the day begins: one per character. */
export const DAYS = [
  null,
  {
    title: 'LEARN THE CITY',
    lines: [
      ['INES', 'New in Puerto Ámbar? Learn its streets before they learn your face.'],
      ['DARIO', 'Inés says you can drive. Show me on the boulevard, not in a story.'],
      ['NANDO', 'Bar Caracol hears everything, kid. Today it hears your name for the first time.'],
    ],
  },
  {
    title: 'THE CREW',
    lines: [
      ['INES', 'Yesterday you were a driver. Today you\'re crew — act like it.'],
      ['DARIO', 'Teo Castellan\'s Glasshands want our streets. Make them look slow.'],
      ['NANDO', 'Somebody paid to have me quiet. Keep me breathing and I keep talking.'],
    ],
  },
  {
    title: 'THE HEAT',
    lines: [
      ['INES', 'Teo has the harbour ledger. Whoever holds it owns this city.'],
      ['DARIO', 'Last day of hard work, Rio. Then we all get rich. Well — somebody does.'],
      ['NANDO', 'Watch Dario at the docks. A man who counts that fast is counting you too.'],
    ],
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
  queueLines(state, d.lines);
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

/** "DAY 2 · THE CREW · 5/12" for the HUD. */
export function dayLabel(state) {
  const day = state.progress.day;
  return `DAY ${day} · ${DAYS[day].title} · ${state.progress.done.length}/${state.missionDefs.length} MISSIONS`;
}
