// The story: three jobs for Inés Ocampo and Dario Kell, told in briefings and subtitles.
//   1. Collection — lift a crate from the marina under a timer and deliver it across town.
//   2. Heat       — hold three stars for 60 seconds, then vanish at Paint & Pray.
//   3. Score      — clear the Glasshand crew out of their yard, take the stash, escape the PAPD.
// Each job has a start marker, a one-line briefing, 3-6 lines of dialogue, a reward, and stages
// that drive the objective text, timer and minimap marker. Failing puts the player back at the
// job's start marker with a car; it never goes to the title screen.
import { GANG, WEAPONS } from './config.js';
import { lineOfSight, blockStart, BLOCK_SIZE, isBlocked } from './city.js';
import { setWanted, clearWanted } from './police.js';
import { makePerson } from './traffic.js';
import { moveCircle, spawnBullet } from './player.js';
import { createVehicle } from './vehicle.js';
import { burst } from './render.js';
import { sfx } from './audio.js';

const C_INES = '#ffb35a', C_RIO = '#7fd0ff', C_DARIO = '#c38bff', C_GANG = '#ff6a6a';

function markerAt(pt, color, label, r = 46) { return { x: pt.x, y: pt.y, r, color, label }; }
const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;

/** The three jobs. Stage functions return 'next', a failure reason string starting with '!', or nothing. */
function defineMissions(city) {
  const P = city.places;
  return [
    {
      id: 'collection', title: 'COLLECTION', giver: 'INÉS', start: P.taqueria, reward: 1500,
      briefing: 'Lift Inés\'s crate from the marina warehouse before the harbour patrol sweeps it, then deliver it to the west-side laundromat.',
      dialogue: [
        ['INÉS', 'Rio. You still drive like your father?', C_INES],
        ['RIO', 'Worse. What\'s the job?', C_RIO],
        ['INÉS', 'A crate at the marina warehouse. Nobody watches it for the next ninety seconds.', C_INES],
        ['INÉS', 'Bring it to the laundromat on the west side. Don\'t stop for lights.', C_INES],
      ],
      outro: ['INÉS', 'Clean. That\'s your cut. Come back when you want real money.', C_INES],
      stages: [
        {
          objective: 'Get to the marina warehouse',
          timer: 90,
          marker: () => markerAt(P.pickup, '#ffd23f', 'PICKUP'),
          update(state, m) { if (near(state.player, P.pickup, 55)) return 'next'; },
        },
        {
          objective: 'Deliver the crate to the laundromat',
          timer: 80,
          marker: () => markerAt(P.drop, '#ffd23f', 'DROP-OFF'),
          enter(state) {
            state.notify('Crate loaded', '#ffd23f');
            sfx('pickup', 0.8);
            setWanted(state, 1);
            say(state, 'RADIO', 'Harbour patrol: someone just hit the marina. Units respond.', '#9ab8ff');
          },
          update(state) { if (near(state.player, P.drop, 55)) return 'next'; },
        },
      ],
    },
    {
      id: 'heat', title: 'HEAT', giver: 'DARIO', start: P.heatStart, reward: 3000,
      briefing: 'Pull every cruiser in the south district onto you for sixty seconds, then lose them with a respray at Paint & Pray.',
      dialogue: [
        ['DARIO', 'You\'re the driver Inés won\'t shut up about?', C_DARIO],
        ['RIO', 'Depends what she said.', C_RIO],
        ['DARIO', 'That you\'re loud. I need loud. My crew is emptying the evidence lot tonight.', C_DARIO],
        ['DARIO', 'Sixty seconds with three stars on you. Then Paint & Pray makes you disappear.', C_DARIO],
        ['RIO', 'Sixty seconds. Easy.', C_RIO],
      ],
      outro: ['DARIO', 'Lot\'s empty, cops are chasing ghosts. You\'re on the payroll.', C_DARIO],
      stages: [
        {
          objective: 'Get a car',
          update(state) { if (state.player.car) return 'next'; },
        },
        {
          objective: 'Survive the pursuit',
          timer: 60, survive: true,
          enter(state) { setWanted(state, 3, 3, 3); state.notify('Every cruiser is on you', '#ff5a5a'); },
          update(state, m) { if (m.timer <= 0) return 'next'; },
        },
        {
          objective: 'Lose the heat at Paint & Pray',
          marker: () => markerAt(P.garage, '#c38bff', 'PAINT & PRAY'),
          enter(state) { state.wanted.min = 0; state.wanted.max = 5; say(state, 'DARIO', 'Done! Now get to Paint & Pray, west end of 8th.', C_DARIO); },
          update(state) {
            if (near(state.player, P.garage, 60)) {
              clearWanted(state);
              respray(state);
              return 'next';
            }
          },
        },
      ],
    },
    {
      id: 'score', title: 'SCORE', giver: 'INÉS', start: P.taqueria, reward: 8000,
      briefing: 'The Glasshand crew holds Inés\'s yard off Harbour Avenue and her money with it. Clear the yard, take the stash, escape the response.',
      dialogue: [
        ['INÉS', 'The Glasshands took my yard and my money. Both come back today.', C_INES],
        ['RIO', 'How many of them?', C_RIO],
        ['INÉS', 'Six, maybe eight. Take this — it spits.', C_INES],
        ['INÉS', 'When the shooting stops, the whole PAPD comes. Don\'t be there.', C_INES],
      ],
      outro: ['INÉS', 'My money, my yard, my city. Puerto Ámbar is ours now, Rio.', C_INES],
      stages: [
        {
          objective: 'Go to the Glasshand yard',
          marker: () => markerAt(P.rival, '#ff5a5a', 'GLASSHANDS', 70),
          enter(state) {
            state.progress.smg = true;
            state.player.ammo.smg = Math.max(state.player.ammo.smg, 240);
            state.player.weapon = 'smg';
            state.notify('SMG unlocked — Q to switch', '#ffd23f');
          },
          update(state) { if (near(state.player, P.rival, 480)) return 'next'; },
        },
        {
          objective: 'Clear the yard',
          enter(state, m) { spawnCrew(state, m); state.noGunHeat = true; },
          update(state, m) {
            const left = m.crew.filter((g) => !g.dead).length;
            m.objectiveOverride = `Clear the yard — ${left} Glasshand${left === 1 ? '' : 's'} left`;
            if (left === 0) return 'next';
          },
        },
        {
          objective: 'Grab the stash',
          marker: () => markerAt({ x: P.rival.x, y: P.rival.y }, '#7dff8a', 'STASH', 36),
          enter(state) { state.noGunHeat = false; say(state, 'RIO', 'That\'s all of them. Where\'s the money...', C_RIO); },
          update(state) {
            if (near(state.player, P.rival, 40)) {
              state.addMoney(1200, P.rival.x, P.rival.y);
              burst(state, 'cash', P.rival.x, P.rival.y, 10, 1);
              return 'next';
            }
          },
        },
        {
          objective: 'Escape the police',
          enter(state) { setWanted(state, 3); say(state, 'RADIO', 'All units, shots fired off Harbour Avenue. Every car in the district, respond.', '#9ab8ff'); },
          update(state) { if (state.wanted.level === 0) return 'next'; },
        },
      ],
    },
  ];
}

function say(state, speaker, text, color) {
  state.dialogueQueue.unshift([speaker, text, color]);
  state.dialogueTimer = 0;
}

/** Paint & Pray: a respray hides the car from the PAPD. */
function respray(state) {
  const v = state.player.car;
  if (v) {
    const colors = ['#ff5a36', '#18b6c9', '#f2f2f2', '#2f2f35', '#e8337a', '#7ad3c8'];
    v.color = colors[(colors.indexOf(v.color) + 1) % colors.length];
    v.health = Math.max(v.health, v.maxHealth * 0.8);
  }
  burst(state, 'smoke', state.player.x, state.player.y, 14, 1.2);
  sfx('spray', 0.9);
}

function spawnCrew(state, m) {
  const P = state.city.places;
  const rx = blockStart(6), ry = blockStart(3), s = BLOCK_SIZE;
  const spots = [[60, 110], [150, 60], [230, 140], [120, 200], [200, 230], [250, 40], [40, 250], [150, 150]];
  m.crew = [];
  for (const [dx, dy] of spots) {
    // never inside a shed: spiral out from the spot until the ground is open
    let gx = rx + dx, gy = ry + dy;
    for (let k = 0; k < 40 && isBlocked(state.city, gx, gy, 12); k += 1) {
      gx = rx + dx + Math.cos(k * 1.3) * (8 + k * 4);
      gy = ry + dy + Math.sin(k * 1.3) * (8 + k * 4);
    }
    const g = makePerson('gang', gx, gy, state.rng);
    g.shirt = '#2a2a2a'; g.pants = '#1a1a1a'; g.hat = '#c0e8ff'; g.armed = true;
    g.health = GANG.health; g.cooldown = 0.5 + state.rng() * 1.5; g.alert = 0; g.strafe = state.rng() < 0.5 ? 1 : -1;
    g.mission = true;
    state.peds.push(g);
    m.crew.push(g);
  }
  // their ride, parked in the yard
  const car = createVehicle('marlin', rx + s / 2 + 40, ry + s - 50, 0, state.rng);
  car.color = '#1c1c22'; car.mission = true;
  state.vehicles.push(car);
  m.entities.push(car);
  say(state, 'GLASSHAND', 'That\'s Ocampo\'s driver! Light him up!', C_GANG);
}

/** Glasshand crew: wake up when they see or are hit, keep a fighting distance, strafe and shoot. */
function updateCrew(state, m, dt) {
  const p = state.player;
  for (const g of m.crew || []) {
    if (g.dead) continue;
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    const sees = d < GANG.sight && lineOfSight(state.city, g.x, g.y, p.x, p.y);
    if (sees || g.alert > 0) m.fight = true;
    // once shooting starts the whole crew joins in and hunts the player down
    if (sees || m.fight) g.alert = 6;
    if (g.alert <= 0) { g.moving = false; continue; }
    g.alert -= dt;
    g.a = Math.atan2(p.y - g.y, p.x - g.x);
    const ca = Math.cos(g.a), sa = Math.sin(g.a);
    let mx = 0, my = 0;
    if (d > 240 || !sees) { mx = ca; my = sa; } else if (d < 120) { mx = -ca; my = -sa; }
    mx += -sa * g.strafe * 0.7; my += ca * g.strafe * 0.7;
    if (Math.random() < 0.01) g.strafe *= -1;
    moveCircle(state, g, mx * 120 * dt, my * 120 * dt);
    g.walk += dt * 10; g.moving = true;
    if (sees) {
      g.cooldown -= dt;
      if (g.cooldown <= 0) {
        g.cooldown = GANG.shootRate + state.rng() * 0.6;
        const a = g.a + (Math.random() - 0.5) * 0.2;
        spawnBullet(state, g.x + ca * 16, g.y + sa * 16, a, 1300, GANG.damage, 520, 'gang', g);
        burst(state, 'muzzle', g.x + ca * 16, g.y + sa * 16, 1, 1);
        sfx('gunshot', 0.5, g.x, g.y);
      }
    }
  }
}

export function initMissions(state) {
  state.missionDefs = defineMissions(state.city);
  state.mission = null;
  state.dialogueQueue = [];
  state.dialogueTimer = 0;
  state.missionBannerTimer = 0;
  state.pendingReturn = null;
  state.onEscape = null;
  refreshMarkers(state);
}

/** Markers for the next job's start (when no job is running) plus Paint & Pray when wanted. */
function refreshMarkers(state) {
  const fx = state.fx;
  fx.markers.length = 0;
  const m = state.mission;
  if (m) {
    const st = m.def.stages[m.stage];
    if (st && st.marker) fx.markers.push(st.marker());
    return;
  }
  const next = state.missionDefs[state.progress.mission];
  if (next) fx.markers.push(markerAt(next.start, '#ffcf5a', `${next.giver}: ${next.title}`, 40));
  if (state.wanted.level > 0) fx.markers.push(markerAt(state.city.places.garage, '#c38bff', 'RESPRAY $250', 40));
}

function startMission(state, def) {
  state.mission = { def, stage: -1, timer: null, entities: [], crew: [], objectiveOverride: null };
  state.dialogueQueue = def.dialogue.slice();
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
  if (!st) { passMission(state); return; }
  m.timer = st.timer ?? null;
  if (st.enter) st.enter(state, m);
  refreshMarkers(state);
  if (m.stage > 0) sfx('objective', 0.7);
}

function passMission(state) {
  const m = state.mission;
  const def = m.def;
  state.mission = null;
  state.wanted.min = 0;
  state.wanted.max = 5;
  state.noGunHeat = false;
  state.progress.mission = Math.max(state.progress.mission, state.missionDefs.indexOf(def) + 1);
  state.banner = { title: 'MISSION PASSED', sub: `${def.title} — +$${def.reward.toLocaleString('en-US')}`, color: '#ffd23f' };
  state.missionBannerTimer = 3.5;
  state.addMoney(def.reward);
  state.dialogueQueue = [def.outro];
  if (state.progress.mission >= state.missionDefs.length) {
    state.dialogueQueue.push(['', 'All jobs done. Puerto Ámbar is yours — keep exploring, stealing and outrunning the PAPD.', '#fff']);
  }
  state.dialogueTimer = 0;
  state.stats.missions = state.progress.mission;
  sfx('passed', 1);
  state.save && state.save();
  refreshMarkers(state);
}

/** Fail the running job (timer, death, arrest): banner, clean up, back to the start marker. */
export function failMission(state, reason) {
  const m = state.mission;
  if (!m) return;
  for (const e of m.entities) e.mission = false;
  for (const g of m.crew || []) { g.mission = false; if (!g.dead) g.remove = true; }
  state.peds = state.peds.filter((g) => !g.remove);
  state.mission = null;
  state.noGunHeat = false;
  state.wanted.min = 0;
  state.wanted.max = 5;
  state.dialogueQueue = [];
  state.dialogue = null;
  state.respawnPoint = m.def.start;
  if (state.mode === 'play') {
    state.banner = { title: 'MISSION FAILED', sub: reason, color: '#ff5a5a' };
    state.missionBannerTimer = 2.6;
    state.pendingReturn = m.def.start;
  } else {
    state.failNote = reason;
  }
  sfx('failed', 0.9);
  refreshMarkers(state);
}

export function updateMissions(state, dt) {
  const p = state.player;
  // subtitles: one line every ~3.2 s
  if (state.dialogueTimer > 0) state.dialogueTimer -= dt;
  if (state.dialogueTimer <= 0) {
    const next = state.dialogueQueue.shift();
    if (next) {
      state.dialogue = { speaker: next[0], text: next[1], color: next[2] };
      state.dialogueTimer = 2.2 + next[1].length * 0.035;
    } else state.dialogue = null;
  }
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
    // waiting at a job's start marker
    const next = state.missionDefs[state.progress.mission];
    if (state.briefing) {
      // the briefing card holds the player (mode 'mission'): Enter takes the job, Backspace walks away
      if (state.input.pressed.has('Enter') || state.input.pressed.has('KeyE')) { state.mode = 'play'; startMission(state, next); }
      else if (state.input.pressed.has('Backspace') || state.input.pressed.has('KeyF')) { state.mode = 'play'; state.briefing = null; state.declined = next; }
    } else if (next && near(p, next.start, 44) && !state.pendingReturn && state.wanted.level === 0 && state.declined !== next) {
      state.briefing = { title: next.title, giver: next.giver, text: next.briefing, reward: next.reward, n: state.progress.mission + 1 };
      state.mode = 'mission';
      if (p.car) { const c = p.car.control; c.throttle = 0; c.brake = 1; c.steer = 0; }
      sfx('objective', 0.6);
    } else if (next && near(p, next.start, 44) && state.wanted.level > 0) {
      state.missionHint = 'Lose the police before taking a job';
    }
    if (state.declined && !near(p, state.declined.start, 120)) state.declined = null;
    // Paint & Pray respray as a free-roam service
    if (state.wanted.level > 0 && near(p, state.city.places.garage, 60) && p.car) {
      if (state.money >= 250) {
        state.addMoney(-250);
        clearWanted(state);
        respray(state);
        state.notify('Resprayed — the PAPD lost you', '#c38bff');
      } else state.missionHint = 'A respray costs $250';
    }
    const wantMarkers = (state.wanted.level > 0 ? 1 : 0) + (next ? 1 : 0);
    if (state.fx.markers.length !== wantMarkers) refreshMarkers(state);
    state.missionView = state.briefing ? null : { objective: next ? `Next job: ${next.title} — meet ${next.giver} at the yellow marker` : 'Free roam — Puerto Ámbar is yours', timer: null };
    return;
  }

  const st = m.def.stages[m.stage];
  if (m.timer !== null) {
    m.timer -= dt;
    if (m.timer <= 0 && !st.survive) { failMission(state, 'Out of time.'); return; }
  }
  if (m.def.id === 'score') updateCrew(state, m, dt);
  const r = st.update(state, m, dt);
  if (r === 'next') advance(state);
  else if (typeof r === 'string' && r[0] === '!') { failMission(state, r.slice(1)); return; }
  if (!state.mission) { state.missionView = null; return; }
  const cur = m.def.stages[m.stage];
  state.missionView = { objective: m.objectiveOverride || cur.objective, timer: m.timer, title: m.def.title };
}

export { WEAPONS };
