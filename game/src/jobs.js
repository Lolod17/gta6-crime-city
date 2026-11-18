// jobs.js — JOB: the job runner: one stage machine for story missions and side jobs, with briefings, markers,
//   pass and fail.
// EXPORTS: markerAt, initJobs, objectivePoint, failMission, updateJobs
// USES: police.js, audio.js, crew.js, story.js, shop.js
//
// The job runner: one state machine for story missions (missions.js) and side activities
// (activities.js). A job has a start marker, a briefing card, stages and a reward. Each stage has an
// objective line, an optional timer, optional markers, and an update that returns
//   'next'   advance to the next stage,
//   'pass'   finish the job now (skipping any stages left),
//   '!why'   fail the job with that reason,
// or nothing to keep going. Failing puts the player back at the job's start with a car; it never
// goes to the title screen. This file also keeps the ground markers and the HUD objective current.
import { clearWanted } from './police.js';
import { sfx } from './audio.js';
import { updateCrew, dismissCrew } from './crew.js';
import { CAST, say, updateDialogue, nextMission, completeMission, storyComplete, updateStory } from './story.js';
import { shopMarkers } from './shop.js';

const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

export function markerAt(pt, color, label, r = 46) { return { x: pt.x, y: pt.y, r, color, label }; }

export function initJobs(state, missions, activities) {
  state.missionDefs = missions;
  state.activityDefs = activities;
  state.mission = null;
  state.dialogueQueue = state.dialogueQueue || [];
  state.dialogueTimer = 0;
  state.missionBannerTimer = 0;
  state.pendingReturn = null;
  state.briefing = null;
  state.declined = null;
}

/** Start markers offered right now: today's mission and every activity. */
function offers(state) {
  const out = [];
  const next = nextMission(state);
  if (next) out.push(next);
  for (const a of state.activityDefs) out.push(a);
  return out;
}

/** Rebuild the ground markers each tick: the running stage's, or the job starts and shops. */
function refreshMarkers(state) {
  const list = state.fx.markers;
  list.length = 0;
  const m = state.mission;
  if (m) {
    const st = m.def.stages[m.stage];
    const mk = st && st.marker ? st.marker(state, m) : null;
    if (Array.isArray(mk)) list.push(...mk.filter(Boolean)); else if (mk) list.push(mk);
    return;
  }
  for (const def of offers(state)) {
    if (def.kind === 'mission') list.push(markerAt(def.start, '#ffcf5a', `${CAST[def.giver].name}: ${def.title}`, 40));
    else list.push(markerAt(def.start, '#4fe3ff', def.title, 34));
  }
  list.push(...shopMarkers(state));
}

const rewardOf = (m) => (m.reward !== undefined ? m.reward : m.def.reward);

/** The position the distance line measures to: the nearest ground marker, or none. */
export function objectivePoint(state) {
  let best = null;
  let bestD = Infinity;
  const body = state.player.car || state.player;
  for (const mk of state.fx.markers) {
    if (!mk) continue;
    const d = Math.hypot(mk.x - body.x, mk.y - body.y);
    if (d < bestD) { bestD = d; best = mk; }
  }
  return best;
}

/** Where a running mission sits in the list at runtime, and the list's total: never typed by hand. */
function missionIndex(state, def) {
  if (def.kind !== 'mission') return { n: null, total: null };
  return { n: state.missionDefs.indexOf(def) + 1, total: state.missionDefs.length };
}

function startJob(state, def) {
  state.mission = { def, stage: -1, timer: null, entities: [], crew: [], targets: [], fight: { on: false }, objectiveOverride: null };
  state.dialogueQueue = (def.dialogue || []).map(([who, text]) => [CAST[who] ? CAST[who].name : who, text, CAST[who] ? CAST[who].color : '#fff']);
  state.dialogueTimer = 0;
  state.briefing = null;
  sfx('mission', 0.9);
  advance(state);
}

function advance(state) {
  const m = state.mission;
  m.stage += 1;
  m.objectiveOverride = null;
  const st = m.def.stages[m.stage];
  if (!st) { passJob(state); return; }
  m.timer = st.timer ?? null;
  if (st.enter) st.enter(state, m);
  if (m.stage > 0) sfx('objective', 0.7);
}

/** Leave the world as it was before the job: crews go home, pins on the wanted level come off. */
function cleanup(state, m) {
  if (m.def.cleanup) m.def.cleanup(state, m);
  for (const e of m.entities) e.mission = false;
  dismissCrew(state, m.crew);
  state.wanted.min = 0;
  state.wanted.max = 5;
  state.noGunHeat = false;
}

function passJob(state) {
  const m = state.mission;
  const def = m.def;
  cleanup(state, m);
  state.mission = null;
  const reward = rewardOf(m);
  const isMission = def.kind === 'mission';
  state.banner = {
    title: isMission ? 'MISSION PASSED' : `${def.title} DONE`,
    sub: `${m.passNote || def.title} — +${money(reward)}`,
    color: isMission ? '#ffd23f' : '#4fe3ff',
  };
  state.missionBannerTimer = 3.5;
  if (reward) state.addMoney(reward);
  const outro = typeof def.outro === 'function' ? def.outro(state, m) : def.outro;
  state.dialogueQueue = outro ? [[CAST[outro[0]].name, outro[1], CAST[outro[0]].color]] : [];
  state.dialogueTimer = 0;
  if (isMission) {
    completeMission(state, def.id);
    state.stats.missions = state.progress.done.length;
    if (storyComplete(state)) {
      const end = state.progress.ending === 'sold'
        ? 'THE END — rich, hunted, alone.'
        : 'THE END — the harbour is yours.';
      state.dialogueQueue.push(['', end, '#fff']);
    }
  } else {
    state.stats.activities = (state.stats.activities || 0) + 1;
    if (def.onPass) def.onPass(state, m);
  }
  sfx('passed', 1);
  state.save && state.save();
}

/** Fail the running job (timer, death, arrest, a stage's own fail condition). */
export function failMission(state, reason) {
  const m = state.mission;
  if (!m) return;
  cleanup(state, m);
  state.mission = null;
  state.dialogueQueue = [];
  state.dialogue = null;
  state.respawnPoint = m.def.start;
  if (state.mode === 'play') {
    state.banner = { title: m.def.kind === 'mission' ? 'MISSION FAILED' : `${m.def.title} FAILED`, sub: reason, color: '#ff5a5a' };
    state.missionBannerTimer = 2.6;
    state.pendingReturn = m.def.start;
  } else {
    state.failNote = reason;
  }
  sfx('failed', 0.9);
}

/** While no job runs: walk into a start marker to open its briefing; Enter takes it. */
function updateIdle(state) {
  const p = state.player;
  const input = state.input;
  if (state.briefing) {
    const def = state.briefing.def;
    if (input.pressed.has('Enter') || input.pressed.has('KeyE')) { state.mode = 'play'; startJob(state, def); }
    else if (input.pressed.has('Backspace') || input.pressed.has('KeyF')) { state.mode = 'play'; state.briefing = null; state.declined = def; }
    return;
  }
  if (state.declined && !near(p, state.declined.start, 120)) state.declined = null;
  if (state.mode !== 'play' || state.pendingReturn) return;
  for (const def of offers(state)) {
    if (!near(p, def.start, 44) || state.declined === def) continue;
    if (state.wanted.level > 0 && !def.allowWanted) { state.missionHint = 'Lose the police before taking a job'; continue; }
    const n = def.kind === 'mission' ? state.missionDefs.indexOf(def) + 1 : null;
    state.briefing = {
      def, title: def.title, n, kind: def.kind, day: def.day,
      giver: def.kind === 'mission' ? CAST[def.giver].full : 'side job · replayable',
      text: def.briefing, reward: def.rewardText || `PAYS ${money(def.reward)}`,
    };
    state.mode = 'mission';
    if (p.car) { const c = p.car.control; c.throttle = 0; c.brake = 1; c.steer = 0; }
    sfx('objective', 0.6);
    return;
  }
}

export function updateJobs(state, dt) {
  updateStory(state, dt);
  updateDialogue(state, dt);
  if (state.missionBannerTimer > 0) {
    state.missionBannerTimer -= dt;
    if (state.missionBannerTimer <= 0) {
      if (state.mode === 'play') state.banner = null;
      if (state.pendingReturn) {
        clearWanted(state);
        state.spawnAt(state.pendingReturn);
        state.pendingReturn = null;
      }
    }
  }
  state.missionHint = '';
  if (state.mode !== 'play' && state.mode !== 'mission') return;

  const m = state.mission;
  if (!m) {
    updateIdle(state);
    refreshMarkers(state);
    const next = nextMission(state);
    state.missionView = state.briefing ? null : {
      objective: next ? `Next: ${next.title} — meet ${CAST[next.giver].full} at the yellow marker` : 'Free roam — side jobs at the blue markers',
      timer: null,
      index: next ? missionIndex(state, next) : { n: null, total: state.missionDefs.length },
      point: next ? next.start : null, title: next ? next.title : null, kind: next ? 'mission' : null,
      to: next ? CAST[next.giver].full : null, active: false,
    };
    return;
  }

  const st = m.def.stages[m.stage];
  if (m.timer !== null) {
    m.timer -= dt;
    if (m.timer <= 0 && !st.survive) { failMission(state, st.timeout || 'Out of time.'); return; }
    // cue lines: [seconds left, who, text] spoken once as a timed stage's clock runs down
    for (const cue of st.cues || []) {
      const key = `${m.stage}:${cue[0]}`;
      if (m.timer <= cue[0] && !(m.cued ||= new Set()).has(key)) { m.cued.add(key); say(state, cue[1], cue[2]); }
    }
  }
  if (m.crew.length) {
    updateCrew(state, m.crew, dt, m.targets, m.fight);
    if (m.crew.some((g) => g.remove)) state.peds = state.peds.filter((g) => !g.remove);
  }
  if (m.def.tick) m.def.tick(state, m, dt);
  const r = st.update ? st.update(state, m, dt) : null;
  if (r === 'next') advance(state);
  else if (r === 'pass') { m.stage = m.def.stages.length - 1; advance(state); }
  else if (typeof r === 'string' && r[0] === '!') { failMission(state, r.slice(1)); return; }
  if (!state.mission) { state.missionView = null; refreshMarkers(state); return; }
  refreshMarkers(state);
  const cur = m.def.stages[m.stage];
  state.missionView = {
    objective: m.objectiveOverride || cur.objective, timer: m.timer, title: m.def.title, kind: m.def.kind, active: true,
    index: missionIndex(state, m.def), point: objectivePoint(state),
  };
}

