// activities.js — JOB: the three replayable side jobs (checkpoint sprint, courier run, rampage) as data for
//   the job runner.
// EXPORTS: defineActivities
// USES: police.js, audio.js, crew.js, racing.js, vehicle.js, jobs.js
// SPLIT PASS: code unchanged; imported by boot/state.js after the split; its imports from police.js now resolve
//   through that re-export shim; loaded in the split-pass smoke run with no console errors.
//
// Side activities: three replayable jobs outside the story, each at its own blue marker.
//   CHECKPOINT SPRINT — a timed run through six checkpoints. Pays by time left; street racing
//                       earns a wanted star.
//   COURIER RUN       — a parcel to a random address against the clock. Pays by distance; a
//                       courier is invisible, so it takes a wanted star off. Can be taken while wanted.
//   RAMPAGE           — sixty seconds against waves of Glasshands. Pays per kill; the noise brings
//                       two stars when it ends.
// They run on the same stage machine as the missions (jobs.js) and keep a best score each.
import { setWanted, lowerWanted } from './police.js';
import { sfx } from './audio.js';
import { spawnCrew, ring, alive, openGround } from './crew.js';
import { junctions, createRace, updateRace } from './racing.js';
import { createVehicle } from './vehicle.js';
import { markerAt } from './jobs.js';

const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;
const CYAN = '#4fe3ff';

/** Three sprint routes, used in turn so each replay is a different run. */
const SPRINTS = [
  [[0, 4], [2, 4], [2, 7], [5, 7], [5, 9], [0, 9]],
  [[0, 3], [3, 3], [3, 0], [6, 0], [6, 2], [8, 2]],
  [[2, 1], [2, 5], [6, 5], [6, 8], [3, 8], [0, 8]],
];
const SPRINT_PAR = 70;

/** Stage: be in a car (one is parked at the marker if the player came on foot). */
const carStage = {
  objective: 'Get in a car',
  enter(state, m) {
    if (state.player.car) return;
    const at = openGround(state.city, state.player.x + 46, state.player.y, 26);
    m.spare = createVehicle('pelican', at.x, at.y, Math.PI / 2, state.rng);
    m.spare.mission = true;
    state.vehicles.push(m.spare); m.entities.push(m.spare);
  },
  marker: (state, m) => (m.spare && !state.player.car ? markerAt(m.spare, CYAN, 'CAR', 32) : null),
  update(state) { if (state.player.car) return 'next'; },
};

const best = (state, key) => state.progress.bests[key] || 0;
function record(state, key, value, lower = false) {
  const b = state.progress.bests;
  if (!b[key] || (lower ? value < b[key] : value > b[key])) { b[key] = value; state.notify('New best!', CYAN); }
}

export function defineActivities(city) {
  const P = city.places;
  const list = [
    {
      id: 'sprint', title: 'CHECKPOINT SPRINT', start: P.sprint, reward: 400,
      rewardText: 'PAYS $400 + $15 PER SECOND LEFT · +1 STAR',
      briefing: 'Six checkpoints across the west side against a 70-second clock. Finish fast and get paid for every second left — street racing gets you noticed.',
      stages: [
        carStage,
        {
          objective: 'Sprint through the checkpoints', timer: SPRINT_PAR,
          enter(state, m) {
            const runs = state.stats.sprints = (state.stats.sprints || 0) + 1;
            m.race = createRace(junctions(SPRINTS[runs % SPRINTS.length]));
            sfx('objective', 1);
          },
          marker: (state, m) => {
            const a = m.race.checkpoints[m.race.next], b = m.race.checkpoints[m.race.next + 1];
            return [a && markerAt(a, CYAN, m.race.next === m.race.checkpoints.length - 1 ? 'FINISH' : `CHECKPOINT ${m.race.next + 1}`, 70), b && markerAt(b, '#b8f6ff', '', 30)];
          },
          update(state, m, dt) {
            const ev = updateRace(state, m.race, dt);
            if (ev === 'checkpoint') sfx('pickup', 0.6);
            const b = best(state, 'sprint');
            m.objectiveOverride = `Sprint — checkpoint ${m.race.next + 1}/${m.race.checkpoints.length}${b ? ` · best ${b.toFixed(1)} s` : ''}`;
            if (ev === 'finish') {
              const left = Math.max(0, m.timer);
              m.reward = 400 + Math.round(left * 15);
              m.passNote = `${m.race.time.toFixed(1)} s`;
              record(state, 'sprint', +m.race.time.toFixed(1), true);
              return 'next';
            }
          },
        },
      ],
      onPass(state) { setWanted(state, Math.max(1, state.wanted.level)); state.notify('Street racing — the PAPD noticed', '#ff5a5a'); },
    },
    {
      id: 'courier', title: 'COURIER RUN', start: P.depot, reward: 250, allowWanted: true,
      rewardText: 'PAYS BY DISTANCE · −1 STAR',
      briefing: 'A parcel for an address somewhere in Puerto Ámbar. Beat the clock to get paid. Nobody looks twice at a courier: a delivery takes a wanted star off.',
      stages: [
        carStage,
        {
          objective: 'Deliver the parcel',
          enter(state, m) {
            const list = P.addresses.filter((a) => a !== state.lastAddress);
            m.to = list[Math.floor(state.rng() * list.length)];
            state.lastAddress = m.to;
            const d = Math.hypot(m.to.x - state.player.x, m.to.y - state.player.y);
            m.timer = Math.round(d / 190 + 18);
            m.reward = 150 + Math.round(d / 8);
          },
          marker: (state, m) => markerAt(m.to, CYAN, 'PARCEL DROP', 46),
          update(state, m) {
            m.objectiveOverride = `Deliver the parcel — pays $${m.reward}`;
            if (near(state.player, m.to, 60)) { record(state, 'courier', (state.progress.bests.courier || 0) + 1); return 'next'; }
          },
        },
      ],
      onPass(state) { if (state.wanted.level > 0) { lowerWanted(state); state.notify('Just a courier — one star off', '#7dff8a'); } },
    },
    {
      id: 'rampage', title: 'RAMPAGE', start: P.rampage, reward: 0,
      rewardText: 'PAYS $120 PER GLASSHAND · +2 STARS AFTER',
      briefing: 'Glasshands have taken over the south end. Sixty seconds, as many of them as you can drop. Everything you hit pays; the noise brings two stars when it is over.',
      stages: [
        {
          objective: 'Rampage', timer: 60, survive: true,
          enter(state, m) {
            m.spawned = 0;
            m.wave = () => {
              const p = state.player;
              const n = Math.min(4, 16 - m.spawned);
              if (n <= 0) return;
              m.crew.push(...spawnCrew(state, p.x, p.y, ring(n, 380, state.rng() * 6), { awake: true }));
              m.spawned += n;
            };
            m.wave(); m.wave();
            state.noGunHeat = true;
            sfx('alert', 0.8);
          },
          update(state, m) {
            const kills = m.crew.filter((g) => g.dead).length;
            if (alive(m.crew) < 3) m.wave();
            m.reward = kills * 120;
            m.passNote = `${kills} Glasshands`;
            const b = best(state, 'rampage');
            m.objectiveOverride = `Rampage — ${kills} down · $${m.reward}${b ? ` · best ${b}` : ''}`;
            if (m.timer <= 0) { record(state, 'rampage', kills); return 'next'; }
          },
        },
      ],
      onPass(state) { setWanted(state, Math.max(2, state.wanted.level)); },
    },
  ];
  for (const def of list) def.kind = 'activity';
  return list;
}
