// missions.js — JOB: the eighteen story missions as data for the job runner.
// EXPORTS: defineMissions
// USES: config.js, city.js, police.js, traffic.js, player.js, vehicle.js, render.js, audio.js, crew.js, racing.js, story.js, shop.js, jobs.js,
//   heist/alarm.js, heist/crew.js, heist/route.js
// SPLIT PASS: code unchanged; imported by boot/state.js after the split; its imports from police.js and traffic.js
//   now resolve through those re-export shims; loaded in the split-pass smoke run with no console errors.
// DISTRICT PASS: day 4, THE COAST — missions 13–15: SANDTRAP (a chase through Bahía Azul), STACKED (a
//   shootout in the Southside container yard) and LAST CALL (a timed van run through the port gates).
// HEIST PASS: day 5, THE JOB — missions 16–18: CASING THE BANCO (watch the bank's doors from across the
//   street), THE SUBSTATION (cut the feed so the alarm stays quiet) and BANCO DE ÁMBAR (hire the two hands,
//   clear the hall, drill the vault, then leave by the getaway route inside the alarm's ninety seconds).
//   The alarm, the hands and the escape line are the new heist/ modules; the bank's floor plan is in
//   city/blocks.js and its floor is painted by render/world.js.
//
// The eighteen story missions of SUNDOWN: Puerto Ámbar, as a five-day arc for Rio Salcedo.
//   Day 1 — LEARN THE CITY: Collection, Fragile, The Tail, The Dash
//   Day 2 — THE CREW:       Three Drops, Street Race, Protection, The Warehouse
//   Day 3 — THE HEAT:       The Aurelia, Heat, Muelle Cinco, The Ledger
//   Day 4 — THE COAST:      Sandtrap, Stacked, Last Call
//   Day 5 — THE JOB:        Casing the Banco, The Substation, Banco de Ámbar
// Each mission is data for the runner in jobs.js: a giver, a start marker, a briefing, dialogue,
// a reward, and stages (objective line, timer, markers, fail condition). story.js decides which one
// is unlocked; crew.js and racing.js supply the gunmen and the rival driver, heist/ the alarm, the
// two hands and the getaway line.
import { JOBS, WORLD } from './config.js';
import { lineOfSight, blockStart, BLOCK_SIZE, roadCenter } from './city.js';
import { setWanted, clearWanted } from './police.js';
import { makePerson, spawnLaneCar } from './traffic.js';
import { seatPlayer } from './player.js';
import { createVehicle } from './vehicle.js';
import { burst } from './render.js';
import { sfx } from './audio.js';
import { spawnCrew, ring, alive, openGround } from './crew.js';
import { junctions, routeThrough, createRace, updateRace, createRival, updateRival } from './racing.js';
import { say } from './story.js';
import { respray } from './shop.js';
import { markerAt } from './jobs.js';
import { HEIST, raiseAlarm, quietAlarm, heistPhase, crewCutShare, alarmTunables } from './heist/alarm.js';
import { hireHands, updateHands, livingHands, payHands, handsReport } from './heist/crew.js';
import { planRoute, updateRoute, routeProgress, routeRemaining, routeMarkers, advanceRoute } from './heist/route.js';

const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;
const pct = (v, floor) => Math.max(0, Math.round(((v.health - v.maxHealth * floor) / (v.maxHealth * (1 - floor))) * 100));
const Y = '#ffd23f', RED = '#ff5a5a', GREEN = '#7dff8a', PINK = '#ff3d7f', VIOLET = '#c38bff';

// ------------------------------------------------------------------ shared pieces

/** A car parked on open ground near a point, kept alive for the job. */
function spawnCar(state, m, pt, model = 'pelican', dx = 46, dy = 0) {
  const at = openGround(state.city, pt.x + dx, pt.y + dy, 26);
  const v = createVehicle(model, at.x, at.y, Math.PI / 2, state.rng);
  v.mission = true;
  state.vehicles.push(v);
  m.entities.push(v);
  return v;
}

/** Stage: get into any car (one is parked beside the marker if the player arrived on foot). */
const getACar = (objective = 'Get in a car') => ({
  objective,
  enter(state, m) { if (!state.player.car) m.spare = spawnCar(state, m, state.player); },
  marker: (state, m) => (m.spare && !state.player.car ? markerAt(m.spare, Y, 'CAR', 34) : null),
  update(state) { if (state.player.car) return 'next'; },
});

/**
 * Stage: lose the PAPD. Either stay out of sight until the stars go, or drive into Paint & Pray for a
 * respray (marked on the map, free during a job). Without the garage a robot run that had climbed to
 * five stars could circle for minutes; the respray is the same way out free roam already offers.
 */
const escapeStage = (level, who, line, objective = 'Escape the police') => ({
  objective,
  enter(state) { setWanted(state, level); say(state, who, line); },
  marker: (state) => markerAt(state.city.places.garage, VIOLET, 'PAINT & PRAY', 46),
  update(state) {
    const P = state.city.places;
    if (state.player.car && near(state.player, P.garage, 60)) { clearWanted(state); respray(state); state.notify('Resprayed — the PAPD lost you', VIOLET); }
    const m = state.mission;
    if (m) m.objectiveOverride = `${objective} — or respray at Paint & Pray`;
    if (state.wanted.level === 0) return 'next';
  },
});
/** SANDTRAP's courier: laps of the four roads round Bahía Azul's beach blocks (road indices i, j). */
const COURIER_LAP = [[6, 0], [8, 0], [8, 2], [6, 2]];

/** The courier's own driving: flat out to the next corner of the lap, brake for the turn, back out when stuck. */
function driveCourier(v, m, dt) {
  const c = v.control;
  const [tx, ty] = m.route[m.wp];
  if (Math.hypot(tx - v.x, ty - v.y) < 70) m.wp = (m.wp + 1) % m.route.length;
  let diff = Math.atan2(ty - v.y, tx - v.x) - v.a;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const sp = Math.hypot(v.vx, v.vy);
  if (m.reverse > 0) {
    m.reverse -= dt;
    c.throttle = 0; c.brake = 1; c.steer = -Math.sign(diff); c.handbrake = false;
    return;
  }
  const sharp = Math.abs(diff) > 0.8;
  c.steer = Math.max(-1, Math.min(1, diff * 3));
  c.throttle = sharp && sp > 200 ? 0 : 1;
  c.brake = sharp && sp > 260 ? 1 : 0;
  c.handbrake = sharp && sp > 300;
  if (sp < 30) m.stuck += dt; else m.stuck = Math.max(0, m.stuck - dt);
  if (m.stuck > 1.2) { m.stuck = 0; m.reverse = 0.8; }
}

/** The race checkpoints against Teo: a lap of downtown and the marina that ends where it began. */
const RACE_LINE = [[1, 4], [4, 4], [4, 8], [7, 8], [7, 4], [5, 1], [1, 1]];

// ------------------------------------------------------------------ the fifteen missions

export function defineMissions(city) {
  const P = city.places;
  const list = [
    // =============================================================== DAY 1 — LEARN THE CITY
    {
      id: 'collection', day: 1, title: 'COLLECTION', giver: 'INES', start: P.taqueria, reward: 1500,
      briefing: 'Lift Inés\'s crate from the marina warehouse before the harbour patrol sweeps it, then deliver it to the west-side laundromat.',
      dialogue: [
        ['INES', 'Rio. Still driving like your father?'],
        ['RIO', 'Worse. What\'s the job?'],
        ['INES', 'A crate at the marina.'],
        ['INES', 'Ninety seconds. Don\'t stop for lights.'],
      ],
      outro: ['INES', 'Clean. Your cut. Nando has work.'],
      stages: [
        {
          objective: 'Get to the marina warehouse', timer: 90,
          cues: [[60, 'INES', 'Marina gate closes soon.']],
          marker: () => markerAt(P.pickup, Y, 'PICKUP'),
          update(state) { if (near(state.player, P.pickup, 55)) return 'next'; },
        },
        {
          objective: 'Deliver the crate to the laundromat', timer: 80,
          marker: () => markerAt(P.drop, Y, 'DROP-OFF'),
          enter(state) {
            state.notify('Crate loaded', Y); sfx('pickup', 0.8);
            setWanted(state, 1, 0, 2);   // the first job: a harbour patrol, never a five-star manhunt
            say(state, 'RADIO', 'Marina hit. Units respond.');
          },
          update(state) { if (near(state.player, P.drop, 55)) return 'next'; },
        },
      ],
    },
    {
      id: 'fragile', day: 1, title: 'FRAGILE', giver: 'NANDO', start: P.caracol, reward: 900,
      briefing: 'Drive a van of Nando\'s hand-blown glassware through rush-hour traffic to the Hotel Miramar downtown. Every bump costs; half the cargo broken and the client walks.',
      dialogue: [
        ['NANDO', 'You\'re Inés\'s new driver, sí?'],
        ['RIO', 'Never tried driving slow.'],
        ['NANDO', 'Two hundred glasses. Hotel Miramar.'],
        ['NANDO', 'Their bar, my reputation.'],
      ],
      outro: ['NANDO', 'Every glass counted. Come by.'],
      stages: [
        {
          objective: 'Get in the Mule Van behind Bar Caracol',
          enter(state, m) { m.van = spawnCar(state, m, P.caracol, 'mule', 0, 60); m.van.color = '#f0efe9'; },
          marker: (state, m) => markerAt(m.van, Y, 'VAN', 36),
          update(state, m) {
            if (m.van.dead) return '!The van is wrecked.';
            if (state.player.car === m.van) return 'next';
          },
        },
        {
          objective: 'Deliver the glassware to the Hotel Miramar', timer: 100,
          marker: () => markerAt(P.hotel, Y, 'HOTEL MIRAMAR'),
          enter(state) { say(state, 'NANDO', 'Gently, Rio. Glass remembers potholes.'); },
          update(state, m) {
            const v = m.van;
            if (v.dead || v.health < v.maxHealth * JOBS.fragileShare) return '!The glassware is smashed.';
            m.objectiveOverride = `Deliver the glassware to the Hotel Miramar — cargo ${pct(v, JOBS.fragileShare)}%`;
            if (state.player.car === v && near(v, P.hotel, 75)) return 'next';
          },
        },
      ],
    },
    {
      id: 'tail', day: 1, title: 'THE TAIL', giver: 'DARIO', start: P.tailStart, reward: 1200,
      briefing: 'Dario wants to know who the harbour accountant meets. Follow his white Sol Convertible through town for a minute. Too close and he sees you; too far and he is gone.',
      dialogue: [
        ['DARIO', 'I\'m Dario. I pay for patience.'],
        ['DARIO', 'The accountant drives a white Sol.'],
        ['DARIO', 'Follow him. Don\'t let him see.'],
        ['RIO', 'Close to see, far to vanish.'],
      ],
      outro: ['DARIO', 'Teo\'s buying the harbour.'],
      stages: [
        getACar('Get in a car for the tail'),
        {
          objective: 'Tail the accountant', timer: 65, survive: true,
          enter(state, m) {
            m.target = spawnLaneCar(state, state.player, 'sol', '#f7f0d8', 175, 330);   // ahead, in view, not yet suspicious
            m.entities.push(m.target);
            m.sus = 0; m.grace = 9;   // time to turn and pick him up before 'lost' applies
            say(state, 'DARIO', 'There — the white Sol.');
          },
          marker: (state, m) => markerAt(m.target, RED, 'TARGET', 30),
          update(state, m, dt) {
            const t = m.target, p = state.player;
            if (t.dead) return '!The accountant is dead. Dario wanted him followed, not flattened.';
            if (t.driver !== 'ai') return '!You blew your cover.';
            const d = Math.hypot(t.x - p.x, t.y - p.y);
            if (m.grace > 0) m.grace -= dt;
            else if (d > JOBS.tailFar) return '!You lost him.';
            if (m.grace <= 0 && d < JOBS.tailNear && lineOfSight(state.city, t.x, t.y, p.x, p.y)) m.sus += JOBS.tailSuspicion * dt;
            else m.sus = Math.max(0, m.sus - 10 * dt);
            if (m.sus >= 100) { t.ai.panic = 99; return '!He made you — the accountant is spooked.'; }
            m.objectiveOverride = `Tail the accountant — ${Math.round(d)} m back · suspicion ${Math.round(m.sus)}%`;
            if (m.timer <= 0) return 'next';
          },
        },
      ],
    },
    {
      id: 'dash', day: 1, title: 'THE DASH', giver: 'INES', start: P.dashStart, reward: 1500,
      briefing: 'Someone tipped the PAPD about Inés\'s money run. Grab the bag and race it to the safehouse before the clock runs out, with two stars on your tail the whole way.',
      dialogue: [
        ['INES', 'Rio, the bag is hot.'],
        ['INES', 'Somebody talked. Two stars behind.'],
        ['INES', 'Safehouse, now. Garage closes behind you.'],
      ],
      outro: ['INES', 'Bag\'s safe. Tomorrow, the crew.'],
      stages: [
        getACar('Get in a car — the PAPD is coming'),
        {
          objective: 'Get the bag to the safehouse', timer: 80,
          cues: [[70, 'TEO', 'Run home, little driver. Run.'], [50, 'INES', 'Garage is open. Hurry!'], [25, 'TEO', 'Ocampo picks slow drivers.']],
          timeout: 'Too slow — the PAPD boxed you in.',
          marker: () => markerAt(P.safehouse, '#7fd0ff', 'SAFEHOUSE', 50),
          enter(state) {
            setWanted(state, 2, 2, 5);
            say(state, 'RADIO', 'Suspect east. Two-star pursuit.');
          },
          update(state) {
            if (near(state.player, P.safehouse, 70)) { clearWanted(state); state.notify('Garage door down — the PAPD lost you', '#7fd0ff'); return 'next'; }
          },
        },
      ],
    },

    // =============================================================== DAY 2 — THE CREW
    {
      id: 'drops', day: 2, title: 'THREE DROPS', giver: 'INES', start: P.taqueria, reward: 2000,
      briefing: 'Three packages wait in three corners of the city. The PAPD already knows your car: collect them all under a wanted star and bring them to the taqueria.',
      dialogue: [
        ['INES', 'Three packages, three corners.'],
        ['RIO', 'So I go fast.'],
        ['INES', 'Fast and back. In that order.'],
      ],
      outro: ['INES', 'All three. You\'re crew now.'],
      stages: [
        getACar(),
        {
          objective: 'Collect the packages', timer: 200,
          enter(state, m) {
            m.got = [false, false, false];
            // pinned between one and two stars: the PAPD shadows the drops, it never swarms them
            // (at up to five stars a single scrape snowballed and the clock always ran out)
            setWanted(state, 1, 1, 2);
            state.notify('The PAPD is watching the drops', RED);
          },
          marker: (state, m) => P.parcels.map((pt, i) => (m.got[i] ? null : markerAt(pt, GREEN, 'PACKAGE', 40))),
          update(state, m) {
            P.parcels.forEach((pt, i) => {
              if (!m.got[i] && near(state.player, pt, 60)) {
                m.got[i] = true;
                state.notify(`Package ${m.got.filter(Boolean).length}/3`, GREEN);
                sfx('pickup', 0.8);
              }
            });
            const n = m.got.filter(Boolean).length;
            m.objectiveOverride = `Collect the packages under the PAPD's eyes — ${n}/3`;
            if (n === 3) return 'next';
          },
        },
        {
          objective: 'Bring the packages to the taqueria', timer: 90,
          marker: () => markerAt(P.taqueria, Y, 'TAQUERÍA'),
          enter(state) { say(state, 'INES', 'All three. Don\'t bring the PAPD.'); },
          update(state) { if (near(state.player, P.taqueria, 60)) return 'next'; },
        },
      ],
    },
    {
      id: 'race', day: 2, title: 'STREET RACE', giver: 'DARIO', start: P.raceStart, reward: 2500,
      briefing: 'Teo Castellan, boss of the Glasshands, races for respect. Seven checkpoints through downtown and the marina in a Marlin GT. Beat him to the last one.',
      dialogue: [
        ['DARIO', 'Teo races every Friday.'],
        ['TEO', 'Ocampo\'s driver. Keep up, little man.'],
        ['RIO', 'Try to keep your mirrors on.'],
      ],
      outro: ['TEO', 'Enjoy it. Next time, no race.'],
      tick(state, m, dt) { if (m.rival) updateRival(state, m.rival, dt); },
      stages: [
        {
          objective: 'Line up at the start', timer: 3, survive: true,
          enter(state, m) {
            const sx = roadCenter(1), sy = P.raceStart.y;
            m.checkpoints = junctions(RACE_LINE);
            const mine = createVehicle('marlin', sx - 30, sy, Math.PI / 2, state.rng);
            mine.color = '#18b6c9'; mine.mission = true;
            state.vehicles.push(mine); m.entities.push(mine);
            seatPlayer(state, mine);
            m.rival = createRival(state, sx + 30, sy, routeThrough({ x: sx + 30, y: sy }, m.checkpoints), 'marlin', PINK);
            m.entities.push(m.rival);
            m.race = createRace(m.checkpoints);
          },
          update(state, m) {
            m.objectiveOverride = `Race Teo Castellan — ${Math.ceil(m.timer)}…`;
            const c = state.player.car && state.player.car.control;
            if (c) { c.throttle = 0; c.brake = 1; }
            if (m.timer <= 0) return 'next';
          },
        },
        {
          objective: 'Race Teo Castellan',
          enter(state, m) { m.rival.racer.go = true; state.notify('GO!', GREEN); sfx('objective', 1); },
          marker: (state, m) => {
            const a = m.checkpoints[m.race.next], b = m.checkpoints[m.race.next + 1];
            return [a && markerAt(a, Y, m.race.next === m.checkpoints.length - 1 ? 'FINISH' : `CHECKPOINT ${m.race.next + 1}`, 70), b && markerAt(b, '#ffe9a0', '', 30)];
          },
          update(state, m, dt) {
            const ev = updateRace(state, m.race, dt);
            if (ev === 'finish') return 'next';
            if (ev === 'checkpoint') sfx('pickup', 0.6);
            const r = m.rival.racer;
            if (r.finished) return '!Teo Castellan won the race.';
            const me = m.race.next * 1e4 - Math.hypot(state.player.x - m.checkpoints[m.race.next].x, state.player.y - m.checkpoints[m.race.next].y);
            const cp = m.checkpoints[Math.min(r.checkpoints, m.checkpoints.length - 1)];
            const him = r.checkpoints * 1e4 - Math.hypot(m.rival.x - cp.x, m.rival.y - cp.y);
            m.objectiveOverride = `Race Teo Castellan — checkpoint ${m.race.next + 1}/${m.checkpoints.length} · ${me >= him || m.rival.dead ? '1st' : '2nd'}`;
          },
        },
      ],
    },
    {
      id: 'protect', day: 2, title: 'PROTECTION', giver: 'NANDO', start: P.clinic, reward: 2500,
      briefing: 'Somebody put a price on Nando Reyes. He is waiting outside the clinic. Keep him alive through two Glasshand hit squads, then drive him to the safehouse.',
      dialogue: [
        ['NANDO', 'They paid to shut me up!'],
        ['RIO', 'Stay behind me. Don\'t run.'],
      ],
      outro: ['NANDO', 'Careful. Dario talks to Teo.'],
      stages: [
        {
          objective: 'Protect Nando from the hit squad',
          enter(state, m) {
            // Nando waits on the pavement a few steps from the marker, never under the player's car
            // (spawned on the marker itself he was run over by the car the player arrived in)
            const body = state.player.car || state.player;
            let at = openGround(state.city, P.clinic.x, P.clinic.y);
            const offRoad = (q) => Math.floor(q.x / WORLD.tile) % 6 >= 2 && Math.floor(q.y / WORLD.tile) % 6 >= 2;
            for (const [dx, dy] of [[0, 90], [0, -90], [90, 0], [-90, 0], [30, 120], [30, -120], [120, 30], [-120, 30]]) {
              if (Math.hypot(at.x - body.x, at.y - body.y) >= 80 && offRoad(at)) break;
              at = openGround(state.city, P.clinic.x + dx, P.clinic.y + dy);
            }
            const v = makePerson('vip', at.x, at.y, state.rng);
            v.shirt = '#2bd9a6'; v.pants = '#2c3440'; v.hair = '#3b2a1a'; v.health = JOBS.vipHealth; v.vip = true; v.mission = true;
            state.peds.push(v);
            m.vip = v; m.targets.push(v);
            m.crew.push(...spawnCrew(state, P.clinic.x, P.clinic.y, ring(3, 420, 0.4), { awake: true }));
            // a defensive fight outside a clinic: the gunfire itself brings no PAPD (as at the warehouse
            // and the docks); without this, witness calls stacked four stars and the cops' crossfire
            // killed Nando before the second squad arrived
            state.noGunHeat = true;
            say(state, 'GANG', 'The barman! Nobody leaves!');
          },
          marker: (state, m) => markerAt(m.vip, GREEN, 'NANDO', 22),
          update(state, m) {
            if (m.vip.dead) return '!Nando is dead.';
            m.objectiveOverride = `Protect Nando — ${alive(m.crew)} Glasshands left · Nando ${Math.max(0, Math.round(m.vip.health / JOBS.vipHealth * 100))}%`;
            if (alive(m.crew) === 0) return 'next';
          },
        },
        {
          objective: 'A second squad — protect Nando',
          enter(state, m) {
            m.crew.push(...spawnCrew(state, P.clinic.x, P.clinic.y, ring(4, 460, 2.1), { awake: true }));
            say(state, 'NANDO', 'More of them, other side!');
          },
          marker: (state, m) => markerAt(m.vip, GREEN, 'NANDO', 22),
          update(state, m) {
            if (m.vip.dead) return '!Nando is dead.';
            m.objectiveOverride = `A second squad — ${alive(m.crew)} left · Nando ${Math.max(0, Math.round(m.vip.health / JOBS.vipHealth * 100))}%`;
            if (alive(m.crew) === 0) return 'next';
          },
        },
        {
          objective: 'Pick Nando up in a car',
          enter(state, m) { state.noGunHeat = false; if (!state.player.car) m.spare = spawnCar(state, m, m.vip, 'pelican', 60, 0); say(state, 'NANDO', 'Get a car. I\'m not walking.'); },
          marker: (state, m) => markerAt(m.vip, GREEN, 'NANDO', 30),
          update(state, m) {
            if (m.vip.dead) return '!Nando is dead.';
            const v = state.player.car;
            if (v && near(v, m.vip, 80) && Math.hypot(v.vx, v.vy) < 140) {
              m.vip.hidden = true;
              state.peds = state.peds.filter((p) => p !== m.vip);
              m.ride = v;
              state.notify('Nando is in the car', GREEN);
              return 'next';
            }
          },
        },
        {
          objective: 'Drive Nando to the safehouse',
          marker: () => markerAt(P.safehouse, '#7fd0ff', 'SAFEHOUSE', 50),
          update(state, m) {
            if (m.ride.dead) return '!Nando died in the wreck.';
            if (state.player.car === m.ride && near(m.ride, P.safehouse, 75)) return 'next';
          },
        },
      ],
    },
    {
      id: 'score', day: 2, title: 'THE WAREHOUSE', giver: 'INES', start: P.taqueria, reward: 4000,
      briefing: 'The Glasshand crew holds Inés\'s warehouse yard off Harbour Avenue and her money with it. Clear the yard, take the stash, escape the response.',
      dialogue: [
        ['INES', 'They took warehouse and money.'],
        ['RIO', 'How many of them?'],
        ['INES', 'Six, maybe eight. Take this.'],
        ['INES', 'When shooting stops, the PAPD comes.'],
      ],
      outro: ['INES', 'My money. Tomorrow, the harbour.'],
      stages: [
        {
          objective: 'Go to the Glasshand warehouse',
          marker: () => markerAt(P.rival, RED, 'GLASSHANDS', 70),
          enter(state) {
            const p = state.player;
            state.progress.smg = true;
            p.ammo.smg = Math.max(p.ammo.smg, 240);
            p.weapon = 'smg';
            state.notify('SMG from Inés — Q to switch', Y);
          },
          update(state) { if (near(state.player, P.rival, 480)) return 'next'; },
        },
        {
          objective: 'Clear the warehouse yard',
          enter(state, m) {
            const rx = blockStart(6), ry = blockStart(3), s = BLOCK_SIZE;
            m.crew.push(...spawnCrew(state, rx, ry, [[60, 110], [150, 60], [230, 140], [120, 200], [200, 230], [250, 40], [40, 250], [150, 150]]));
            const car = createVehicle('marlin', rx + s / 2 + 40, ry + s - 50, 0, state.rng);
            car.color = '#1c1c22'; car.mission = true;
            state.vehicles.push(car); m.entities.push(car);
            state.noGunHeat = true;
            say(state, 'GANG', 'Ocampo\'s driver! Light him up!');
          },
          update(state, m) {
            const left = alive(m.crew);
            m.objectiveOverride = `Clear the warehouse yard — ${left} Glasshand${left === 1 ? '' : 's'} left`;
            if (left === 0) return 'next';
          },
        },
        {
          objective: 'Grab the stash',
          marker: () => markerAt(P.rival, GREEN, 'STASH', 36),
          enter(state) { state.noGunHeat = false; say(state, 'RIO', 'That\'s all. Where\'s the money?'); },
          update(state) {
            if (near(state.player, P.rival, 40)) {
              state.addMoney(1200, P.rival.x, P.rival.y);
              burst(state, 'cash', P.rival.x, P.rival.y, 10, 1);
              return 'next';
            }
          },
        },
        escapeStage(3, 'RADIO', 'Shots off Harbour Avenue. All units.'),
      ],
    },

    // =============================================================== DAY 3 — THE HEAT
    {
      id: 'aurelia', day: 3, title: 'THE AURELIA', giver: 'DARIO', start: P.caracol, reward: 3000,
      briefing: 'Teo Castellan\'s gold Aurelia sits outside his downtown office. Steal it and deliver it to the container lot at the marina with at least half its bodywork — a buyer is waiting.',
      dialogue: [
        ['DARIO', 'Teo loves one thing: the Aurelia.'],
        ['DARIO', 'A dent costs you. Drive soft.'],
      ],
      outro: ['DARIO', 'Good car. Now the real job.'],
      stages: [
        {
          objective: 'Steal Castellan\'s Aurelia downtown',
          enter(state, m) {
            m.car = createVehicle('aurelia', P.aurelia.x + 34, P.aurelia.y, Math.PI / 2, state.rng);
            m.car.mission = true; m.car.parked = true;
            state.vehicles.push(m.car); m.entities.push(m.car);
          },
          marker: (state, m) => markerAt(m.car, Y, 'AURELIA', 34),
          update(state, m) {
            if (m.car.dead) return '!The Aurelia is wrecked.';
            if (state.player.car === m.car) return 'next';
          },
        },
        {
          objective: 'Deliver the Aurelia to the container lot', timer: 120,
          marker: () => markerAt(P.containers, Y, 'CONTAINER LOT', 50),
          enter(state) {
            setWanted(state, 1, 0, 2);   // capped below the star at which cruisers shoot: the bodywork must survive
            say(state, 'TEO', 'Somebody\'s in my car? Dead.');
          },
          update(state, m) {
            const v = m.car;
            if (v.dead || v.health < v.maxHealth * JOBS.intactShare) return '!The Aurelia is dented — the buyer walks.';
            m.objectiveOverride = `Deliver the Aurelia intact — bodywork ${pct(v, JOBS.intactShare)}%`;
            if (state.player.car === v && near(v, P.containers, 80)) return 'next';
          },
        },
      ],
    },
    {
      id: 'heat', day: 3, title: 'HEAT', giver: 'DARIO', start: P.heatStart, reward: 3500,
      briefing: 'Pull four stars of the PAPD onto you for forty seconds while Dario\'s people lift the harbour ledger from the evidence lot, then lose them with a respray at Paint & Pray.',
      dialogue: [
        ['DARIO', 'I need every cruiser on you.'],
        ['RIO', 'How many cruisers?'],
        ['DARIO', 'All of them. Forty seconds.'],
      ],
      outro: ['DARIO', 'We have the ledger. Muelle Cinco.'],
      stages: [
        getACar(),
        {
          objective: 'Survive the four-star pursuit', timer: 40, survive: true,
          cues: [[30, 'TEO', 'Hear that, Rio? Helicopters.'], [15, 'DARIO', 'Fifteen more. Keep moving!']],
          enter(state) { setWanted(state, 4, 4, 4); state.notify('Every cruiser is on you', RED); },
          update(state, m) { if (m.timer <= 0) return 'next'; },
        },
        {
          objective: 'Lose the heat at Paint & Pray',
          marker: () => markerAt(P.garage, VIOLET, 'PAINT & PRAY'),
          enter(state) { state.wanted.min = 0; state.wanted.max = 5; say(state, 'DARIO', 'Done! Paint & Pray. Go!'); },
          update(state) {
            if (near(state.player, P.garage, 60)) { clearWanted(state); respray(state); return 'next'; }
          },
        },
      ],
    },
    {
      id: 'docks', day: 3, title: 'MUELLE CINCO', giver: 'INES', start: P.taqueria, reward: 4000,
      briefing: 'Dario wants to hand over your share at Muelle Cinco, the marina warehouse. Inés smells a set-up. Go anyway, and come back with the harbour ledger.',
      dialogue: [
        ['INES', 'Dario wants you at the docks.'],
        ['INES', 'Alone. I don\'t like it.'],
        ['RIO', 'Neither do I. I\'m going.'],
      ],
      outro: ['INES', 'Dario sold you. Teo is finished.'],
      stages: [
        {
          objective: 'Meet Dario at Muelle Cinco',
          enter(state) {
            const p = state.player;
            if (p.armor < 100) { p.armor = 100; state.notify('Armour vest from Inés', Y); }   // seven guns wait at the pier
          },
          marker: () => markerAt(P.docks, Y, 'MUELLE CINCO', 50),
          update(state) { if (near(state.player, P.docks, 70)) return 'next'; },
        },
        {
          objective: 'It\'s a set-up', timer: 4, survive: true,
          enter(state, m) {
            const cx = P.docks.x + 90, cy = P.docks.y;
            m.dario = spawnCrew(state, cx, cy - 40, [[0, 0]], { shirt: VIOLET, hat: null, look: { hold: 3, coward: true, armed: false } })[0];
            m.teo = spawnCrew(state, cx, cy + 40, [[0, 0]], { shirt: PINK, hat: null, health: JOBS.rivalHealth, look: { hold: 4, rival: true } })[0];
            m.crew.push(m.dario, m.teo, ...spawnCrew(state, cx, cy, ring(5, 230, 0.3), { look: { hold: 4 } }));
            say(state, 'DARIO', 'Sorry, Rio. Teo pays cash.');
            state.dialogueQueue.splice(1, 0, ['TEO', 'The ledger, the car, then you.', PINK]);
          },
          update(state, m) { if (m.timer <= 0) return 'next'; },
        },
        {
          objective: 'Take down Teo Castellan',
          enter(state) { state.noGunHeat = true; sfx('alert', 0.8); },
          marker: (state, m) => (m.teo.dead ? null : markerAt(m.teo, PINK, 'TEO', 22)),
          update(state, m) {
            const left = alive(m.crew);
            m.objectiveOverride = m.teo.dead ? `Teo is down — ${left} Glasshands left` : `Take down Teo Castellan — ${left - 1} of his crew with him`;
            if (left === 0) return 'next';
          },
        },
        {
          objective: 'Take the harbour ledger',
          marker: (state, m) => markerAt(m.teo, GREEN, 'LEDGER', 30),
          enter(state) { state.noGunHeat = false; say(state, 'RIO', 'Teo\'s done. Dario ran.'); },
          update(state, m) {
            if (near(state.player, m.teo, 40)) { state.notify('Harbour ledger taken', GREEN); sfx('pickup', 0.9); return 'next'; }
          },
        },
        escapeStage(2, 'RADIO', 'Shots at Muelle Cinco. All units.'),
      ],
    },
    {
      id: 'ledger', day: 3, title: 'THE LEDGER', giver: 'NANDO', start: P.caracol, reward: 6000,
      rewardText: 'PAYS $6,000 (Inés) OR $14,000 (the broker)',
      briefing: 'Two buyers want the harbour ledger. Inés pays $6,000 and keeps you safe. The harbour broker pays $14,000 and every cop in Puerto Ámbar comes for you. Drive to the one you choose.',
      dialogue: [
        ['NANDO', 'Two buyers want the ledger.'],
        ['NANDO', 'Inés pays loyalty. Broker pays cash.'],
        ['NANDO', 'One pays in trust. Choose.'],
      ],
      outro: (state, m) => (m.choice === 'sold'
        ? ['NANDO', 'Rich now. Stay away a while.']
        : ['INES', 'Loyalty paid. The city\'s ours.']),
      stages: [
        {
          objective: 'Choose: Inés at the taqueria ($6,000) or the broker at the marina ($14,000)',
          marker: () => [markerAt(P.taqueria, '#ffb35a', 'GIVE TO INÉS · $6,000', 50), markerAt(P.broker, VIOLET, 'SELL TO BROKER · $14,000', 50)],
          update(state, m) {
            if (near(state.player, P.taqueria, 60)) {
              m.choice = 'loyal'; m.reward = 6000; m.passNote = 'You gave Inés the ledger';
              state.progress.ending = 'loyal';
              clearWanted(state);
              return 'pass';
            }
            if (near(state.player, P.broker, 60)) {
              m.choice = 'sold'; m.reward = 14000; m.passNote = 'You sold the ledger';
              state.progress.ending = 'sold';
              return 'next';
            }
          },
        },
        escapeStage(3, 'INES', 'You sold my city, Rio.', 'Inés knows — escape with the money'),
      ],
    },

    // =============================================================== DAY 4 — THE COAST
    {
      id: 'sandtrap', day: 4, title: 'SANDTRAP', giver: 'NANDO', start: P.playa, reward: 2500,
      briefing: 'A Glasshand courier is running Teo\'s last cash out along Bahía Azul to a waiting boat. Run his pink Marlin off the road before he reaches the water, then take the bag from the wreck.',
      dialogue: [
        ['NANDO', 'Pink Marlin. Teo\'s last cash.'],
        ['MARA', 'He\'s on the beach road now.'],
        ['RIO', 'Then he\'s mine. Hold the boat.'],
      ],
      outro: ['MARA', 'Boat left empty. Nice driving.'],
      stages: [
        getACar('Get in a car — the courier is moving'),
        {
          objective: 'Run the courier off the road', timer: 80,
          timeout: 'The courier reached his boat.',
          cues: [[55, 'MARA', 'He\'s heading for the sand!'], [25, 'NANDO', 'Boat\'s waiting. Hit him!']],
          enter(state, m) {
            // he laps Bahía Azul's four roads flat out, starting up the north road ahead of the player
            m.courier = createVehicle('marlin', roadCenter(6) + 200, roadCenter(0), 0, state.rng);
            const c = m.courier;
            c.color = '#ff6fb5'; c.driver = 'gang'; c.mission = true;
            c.topSpeed = JOBS.courierSpeed;
            c.maxHealth *= 0.75; c.health = c.maxHealth; c.hitBy = null;
            state.vehicles.push(c);
            m.entities.push(c);
            m.route = COURIER_LAP.map(([i, j]) => [roadCenter(i), roadCenter(j)]);
            m.wp = 1; m.stuck = 0; m.reverse = 0;
            m.grace = 6;
            m.harm = 0; m.lastHealth = c.health;   // only the player's rams and rounds count
            say(state, 'NANDO', 'There he goes — the pink one!');
          },
          marker: (state, m) => markerAt(m.courier, PINK, 'COURIER', 30),
          update(state, m, dt) {
            const c = m.courier, p = state.player;
            // pulled out of his seat: the bag is the player's for the taking
            if (c.driver === 'player' || (c.driver === null && !c.dead)) { m.bag = { x: c.x, y: c.y }; return 'next'; }
            if (c.driver === 'gang') driveCourier(c, m, dt);
            const d = Math.hypot(c.x - p.x, c.y - p.y);
            if (m.grace > 0) m.grace -= dt;
            else if (d > JOBS.chaseLost) return '!The courier got away.';
            // play-testing: driving in a panic he wrecked himself on traffic with nobody near him. His own
            // scrapes are now shrugged off; damage counts only when the player dealt it.
            const lost = m.lastHealth - c.health;
            if (lost > 0) {
              if (c.hitBy === 'player') m.harm += lost;
              else if (!c.dead) c.health += lost;
            }
            c.hitBy = null;
            m.lastHealth = c.health;
            // wrecked enough and he bails: the bag stays in the car
            if (c.dead || m.harm >= c.maxHealth * (1 - JOBS.courierBail)) {
              if (c.driver === 'gang') { c.driver = null; c.control.throttle = 0; c.control.brake = 1; }
              m.bag = { x: c.x, y: c.y };
              burst(state, 'smoke', c.x, c.y, 8, 1);
              return 'next';
            }
            const left = Math.max(0, Math.round(100 - (m.harm / (c.maxHealth * (1 - JOBS.courierBail))) * 100));
            m.objectiveOverride = `Run the courier off the road — his car ${left}% · ${Math.round(d)} m ahead`;
          },
        },
        {
          objective: 'Take the cash bag from the wreck',
          marker: (state, m) => markerAt(m.bag, GREEN, 'CASH BAG', 30),
          enter(state) { say(state, 'RIO', 'He\'s out. Where\'s the bag?'); sfx('objective', 0.6); },
          update(state, m) {
            if (near(state.player, m.bag, 46)) { state.notify('Cash bag taken', GREEN); sfx('pickup', 0.9); return 'next'; }
          },
        },
      ],
    },
    {
      id: 'stacked', day: 4, title: 'STACKED', giver: 'INES', start: P.yardGate, reward: 4500,
      briefing: 'What is left of the Glasshands has dug in among the container stacks of the Southside port, guarding a refrigerated box of Teo\'s goods. Clear the yard before the PAPD seals the port, then crack the reefer.',
      dialogue: [
        ['INES', 'Last Glasshands. Container yard.'],
        ['INES', 'Two minutes before the port closes.'],
        ['RIO', 'Then I\'d better not miss.'],
      ],
      outro: ['INES', 'The port is ours now, Rio.'],
      stages: [
        {
          objective: 'Get into the container yard',
          enter(state) {
            const p = state.player;
            if (p.armor < 60) { p.armor = 60; state.notify('Vest from Inés', Y); }
          },
          marker: () => markerAt(P.yard, Y, 'CONTAINER YARD', 50),
          update(state) { if (near(state.player, P.yard, 120)) return 'next'; },
        },
        {
          objective: 'Clear the container yard', timer: 120,
          timeout: 'The PAPD sealed the port.',
          cues: [[60, 'INES', 'One minute. Keep moving.'], [20, 'RADIO', 'Units closing on Southside port.']],
          enter(state, m) {
            const x0 = blockStart(7), y0 = blockStart(8), s = BLOCK_SIZE;
            m.crew.push(...spawnCrew(state, x0, y0, [[60, 40], [130, 70], [205, 40], [120, 150], [60, 230], [215, 200], [140, 260], [240, 120]], { shirt: '#3a3a44' }));
            state.noGunHeat = true;   // the port's own business: nobody calls this one in
            say(state, 'GANG', 'Ocampo\'s driver! Behind the reds!');
            m.yardCentre = { x: x0 + s / 2, y: y0 + s / 2 };
          },
          update(state, m) {
            const left = alive(m.crew);
            m.objectiveOverride = `Clear the container yard — ${left} Glasshand${left === 1 ? '' : 's'} left`;
            if (left === 0) return 'next';
          },
        },
        {
          objective: 'Crack the reefer container',
          marker: () => markerAt(P.reefer, GREEN, 'REEFER', 32),
          enter(state) { state.noGunHeat = false; say(state, 'RIO', 'Yard\'s quiet. Opening the reefer.'); },
          update(state) {
            if (near(state.player, P.reefer, 46)) {
              state.addMoney(1500, P.reefer.x, P.reefer.y);
              burst(state, 'cash', P.reefer.x, P.reefer.y, 10, 1);
              return 'next';
            }
          },
        },
        escapeStage(2, 'RADIO', 'Shots at the Southside port.'),
      ],
    },
    {
      id: 'lastcall', day: 4, title: 'LAST CALL', giver: 'NANDO', start: P.portVan, reward: 6000,
      briefing: 'The Ámbar Star sails on the tide. Drive Nando\'s refrigerated van through the three port gates — the coast-road gate, the crane row and the end of the quay — and up to the freighter\'s gangway before she casts off. Keep the cargo cold and in one piece.',
      dialogue: [
        ['NANDO', 'The Ámbar Star sails at the bell.'],
        ['NANDO', 'Three gates, then the gangway.'],
        ['RIO', 'And if I\'m late?'],
        ['NANDO', 'Then swim the cargo out.'],
      ],
      outro: ['NANDO', 'She sailed full. We\'re even, Rio.'],
      stages: [
        {
          objective: 'Get in Nando\'s reefer van',
          enter(state, m) { m.van = spawnCar(state, m, P.portVan, 'mule', 0, 52); m.van.color = '#dfe8ee'; },
          marker: (state, m) => markerAt(m.van, Y, 'REEFER VAN', 36),
          update(state, m) {
            if (m.van.dead) return '!The van is wrecked.';
            if (state.player.car === m.van) return 'next';
          },
        },
        {
          objective: 'Drive through the port gates', timer: 40,   // the robot driver needed 14 s; a person about 25
          timeout: 'The Ámbar Star sailed without the cargo.',
          cues: [[28, 'NANDO', 'The crew is untying her.'], [12, 'NANDO', 'Horn\'s going! Drive!']],
          enter(state, m) { m.gate = 0; m.away = 0; say(state, 'NANDO', 'First gate, the coast road.'); },
          marker: (state, m) => (m.gate < P.portGates.length
            ? markerAt(P.portGates[m.gate], Y, `GATE ${m.gate + 1}/${P.portGates.length}`, 60)
            : markerAt(P.berth, '#7fd0ff', 'GANGWAY', 60)),
          update(state, m, dt) {
            const v = m.van;
            if (v.dead || v.health < v.maxHealth * JOBS.reeferShare) return '!The cargo is ruined.';
            // leaving the van: a few seconds to get back in, then the job is off
            if (state.player.car !== v) { m.away += dt; if (m.away > 8) return '!You left the van.'; } else m.away = 0;
            const goal = m.gate < P.portGates.length ? P.portGates[m.gate] : P.berth;
            if (state.player.car === v && near(v, goal, 80)) {
              m.gate += 1;
              sfx('objective', 0.6);
              if (m.gate > P.portGates.length) return 'next';
              state.notify(m.gate < P.portGates.length ? `Gate ${m.gate} cleared` : 'Last gate — the gangway!', Y);
            }
            const where = m.gate < P.portGates.length ? `gate ${m.gate + 1}/${P.portGates.length}` : 'the gangway';
            m.objectiveOverride = `Through the port to ${where} — cargo ${pct(v, JOBS.reeferShare)}%${m.away > 0 ? ' · GET BACK IN THE VAN' : ''}`;
          },
        },
      ],
    },

    // =============================================================== DAY 5 — THE JOB
    // The heist arc. Three missions that build on each other: the casing gives you the bank's routine, the
    // substation buys you a silent alarm, and the robbery spends both. The alarm, the two hands and the
    // getaway line live in heist/ and are ticked by jobs.js, so all three missions only describe stages.
    {
      id: 'casing', day: 5, title: 'CASING THE BANCO', giver: 'DARIO', start: P.taqueria, reward: HEIST.probeReward,
      briefing: 'The Banco de Ámbar keeps the west side\'s cash in a room at the back of its marble hall. Before anybody touches it, watch the front doors from across the street and learn the routine: who comes out, when the cruiser passes, how long the guards take.',
      dialogue: [
        ['DARIO', 'New job. A bank, not a bar.'],
        ['RIO', 'Banks have cameras.'],
        ['DARIO', 'Which is why we watch first.'],
        ['DARIO', 'Park across the street. Say nothing.'],
      ],
      outro: ['DARIO', 'Two guards at nine. The vault at noon.'],
      stages: [
        getACar('Get in a car — the bank is in Centro'),
        {
          objective: 'Park across from the Banco de Ámbar and watch',
          timer: 18, survive: true,
          marker: () => markerAt(P.bankWatch, '#ff9ab0', 'WATCH THE DOORS', 46),
          enter(state, m) {
            m.seen = 0;
            m.guards = 0;
            say(state, 'DARIO', 'Doors, guards, the cruiser on the corner. Watch.');
          },
          update(state, m, dt) {
            const p = state.player, body = p.car || p;
            const inView = Math.hypot(body.x - P.bankWatch.x, body.y - P.bankWatch.y) < 260;
            const still = p.car ? Math.hypot(p.car.vx, p.car.vy) < 40 : true;
            // the guards come out on a loop: every few seconds one of them walks the pavement
            m.tick = (m.tick || 0) + dt;
            if (m.tick > 5.5) { m.tick = 0; m.guards += 1; }
            if (inView && still) m.seen += dt;
            m.objectiveOverride = `Watch the doors — ${Math.min(m.guards, 3)}/3 faces counted · keep the car still ${Math.max(0, Math.ceil(m.timer - m.seen > 0 ? m.timer - m.seen : 0))}s`;
            if (m.seen >= 12) return 'next';
            if (!inView) m.seen = Math.max(0, m.seen - dt * 0.5);
            void lineOfSight;
          },
        },
        {
          objective: 'Get out and look in the lobby windows',
          marker: () => markerAt(P.bank, '#7dff8a', 'LOBBY DOORS', 30),
          enter(state) { say(state, 'DARIO', 'Now a walk past. Nothing more.'); },
          update(state) {
            if (near(state.player, P.bank, 46)) { state.notify('Marble hall, four windows, one rear door', '#7dff8a'); return 'next'; }
          },
        },
        escapeStage(1, 'DARIO', 'That was the cruiser. Walk away.', 'Get clear of the bank'),
      ],
    },
    {
      id: 'substation', day: 5, title: 'THE SUBSTATION', giver: 'INES', start: P.taqueria, reward: HEIST.substationReward,
      briefing: 'The Banco de Ámbar\'s alarm line runs to a transformer yard on the east side. Cut the feed box before Thursday and the vault\'s alarm rings into an empty office instead of the PAPD switchboard. Get in, cut it, get out before a patrol rolls past.',
      dialogue: [
        ['INES', 'The alarm line runs east.'],
        ['RIO', 'Then I cut it east.'],
        ['INES', 'And if it sings, we\'re done.'],
      ],
      outro: ['INES', 'Silent alarm. Thursday we dance.'],
      stages: [
        getACar('Get in a car — the substation is on the east side'),
        {
          objective: 'Reach the transformer yard',
          marker: () => markerAt(P.substationBox, '#4fe3ff', 'FEED BOX', 60),
          enter(state) { say(state, 'INES', 'Fenced yard. Box is on the far wall.'); },
          update(state) { if (near(state.player, P.substationBox, 120)) return 'next'; },
        },
        {
          objective: 'Cut the bank\'s alarm line', timer: 6, survive: true,
          marker: () => markerAt(P.substationBox, Y, 'CUT THE LINE', 40),
          enter(state) { state.notify('Hold the box while the line spins down', Y); },
          update(state, m) {
            const p = state.player;
            if (!near(p, P.substationBox, 60)) return '!You left the feed box.';
            m.timer = Math.max(0, m.timer);
            m.objectiveOverride = `Cut the bank's alarm line — ${m.timer.toFixed(1)} s`;
            if (m.timer <= 0) {
              // the line is cut: the alarm is quiet for the robbery, and the PAPD hears nothing
              state.progress.alarmCut = true;
              state.notify('Alarm line cut — the vault is silent', '#7dff8a');
              burst(state, 'spark', P.substationBox.x, P.substationBox.y, 14, 1.2);
              sfx('ping', 1);
              return 'next';
            }
          },
        },
        {
          objective: 'Leave before a patrol turns the corner',
          marker: () => markerAt(P.substation, '#c38bff', 'GET CLEAR', 60),
          enter(state) { setWanted(state, 1, 0, 2); say(state, 'RADIO', 'Report of a man at the east transformer yard.'); },
          update(state) {
            // the patrol rolls past once the line is cut: lose it, and be somewhere else when you do
            if (state.wanted.level === 0 && !near(state.player, P.substation, 260)) return 'next';
          },
        },
      ],
    },
    {
      id: 'banco', day: 5, title: 'BANCO DE ÁMBAR', giver: 'DARIO', start: P.bank, reward: HEIST.bankReward,
      briefing: 'Thursday. The vault is full and, thanks to the substation, its alarm is deaf. Hire Sana and Bruno at the van, walk into the marble hall, put the guards down, drill the vault, and leave by the route Dario has painted on the road. If the alarm does go up you have ninety seconds before the whole city is on the bridge.',
      dialogue: [
        ['DARIO', 'The van\'s down the side street.'],
        ['RIO', 'Two hands, one vault.'],
        ['DARIO', 'Sana drives. Bruno shoots.'],
        ['DARIO', 'Do not let the alarm ring twice.'],
      ],
      outro: ['DARIO', 'The Banco de Ámbar. Clean. Keep the change.'],
      stages: [
        {
          objective: 'Hire the crew at the van',
          marker: () => markerAt(P.crewVan, '#9ad7ff', 'THE CREW', 44),
          enter(state, m) {
            // the two hands wait by the van. They join the moment the player is close enough to shake hands.
            m.handsHired = false;
            m.vanSpot = P.crewVan;
          },
          update(state, m) {
            if (!m.handsHired && near(state.player, P.crewVan, 100)) {
              // hands are ticked by updateHands in boot/loop.js, not by jobs.js updateCrew: they are not
              // in state.peds and they are not m.crew, or the hostile-crew stepper would drive them
              hireHands(state, P.crewVan, { angle: Math.PI * 0.9 });
              m.handsHired = true;
              state.notify('Sana and Bruno are with you', '#9ad7ff');
              sfx('objective', 0.7);
            }
            const names = handsReport(state);
            m.objectiveOverride = m.handsHired
              ? `Walk the crew into the bank — ${names.join(' · ')}`
              : 'Hire the crew at the van';
            if (m.handsHired) {
              // into the lobby first: that is the doorway the mission means, inside the bank's own block
              const inside = near(state.player, P.bankLobby, 90) || near(state.player, P.bankDoor, 46);
              if (inside) return 'next';
            }
          },
        },
        {
          objective: 'Clear the marble hall',
          enter(state, m) {
            // three guards in the hall, two more behind the counter, and the manager in his glass office
            const c = P.bankLobby;
            m.crew.push(...spawnCrew(state, c.x, c.y - 90, [[-70, 30], [70, 30], [0, 90]], { shirt: '#2b3a55', hat: null }));
            m.crew.push(...spawnCrew(state, c.x - 120, c.y - 170, [[0, 0], [60, 20]], { shirt: '#2b3a55', hat: null }));
            m.crew.push(...spawnCrew(state, P.bankCounter.x + 90, P.bankCounter.y - 160, [[0, 0]], { shirt: '#4a4a52', hat: null, health: 110 }));
            state.noGunHeat = true;   // the alarm answers this, not the witness network
            state.notify('Bank guards — the hall is not empty', RED);
            say(state, 'DARIO', 'Guards first. Vault second.');
            m.guardsAt = alive(m.crew);
          },
          marker: () => markerAt(P.bankLobby, RED, 'THE HALL', 50),
          update(state, m) {
            const left = alive(m.crew);
            m.objectiveOverride = `Clear the marble hall — ${left} guard${left === 1 ? '' : 's'} left`;
            if (left === 0) { state.noGunHeat = false; return 'next'; }
          },
        },
        {
          // the drill runs while the player stands at the door; the clock does not stop for a step away,
          // it only stops counting down (the objective line says so). 30 s: a person at the door needs 1,
          // the play-test robot 20 s with the walk up the hall.
          objective: 'Drill the vault door', timer: 30,
          timeout: 'The drill was too slow — the PAPD is already inside.',
          cues: [[18, 'BRUNO', 'Door\'s warm. Keep it turning.'], [8, 'SANA', 'Cruiser on the corner!']],
          marker: () => markerAt(P.bankVault, Y, 'THE VAULT', 46),
          enter(state, m) {
            state.progress.vaultOpen = false;
            say(state, 'SANA', 'I\'ll watch the doors. You drill.');
            // the alarm rings either way; the substation job only decides whether it is the branch manager
            // noticing a silent drill (9 s in) or the vault tripping its own bell at once
            m.alarmAt = state.progress.alarmCut ? 9 : 4;
            m.hold = 0;
          },
          update(state, m, dt) {
            // the objective line counts the WALK to the door, so the ring is generous: the vault room is
            // one corridor about 190 px behind the counter and the door's own stand is 90 px wide
            const drill = near(state.player, P.bankVault, 170);
            const at = drill;   // kept as a name for the objective line below
            // a moment to line up on the door: the drill runs while the player stands there, and the
            // timer is paused (not reversed) for the step back out of the corridor
            if (at) m.hold = Math.min(1.2, (m.hold || 0) + dt);
            m.paused = !at;
            if (m.alarmAt !== null && m.timer <= m.alarmAt && heistPhase(state) === 'idle') {
              m.alarmAt = null;
              raiseAlarm(state, state.progress.alarmCut ? 'the drill woke the branch manager' : 'the alarm tripped on the vault', { bank: P.bank });
              say(state, 'RADIO', 'Alarm, Banco de Ámbar. All units.');
              say(state, 'BRUNO', 'That\'s the bell, Rio. Ninety seconds.');
            }
            m.objectiveOverride = at
              ? `Drill the vault — the crew is with you, ${Math.max(0, Math.ceil(m.timer))} s`
              : `Get to the vault door — the drill waits, ${Math.max(0, Math.ceil(m.timer))} s`;
            // the drill is done at 4 s and the crew takes the vault from there: the player does not have
            // to stand in the corridor for the whole timer (the door's own stand is what stops the alarm)
            if (m.timer <= 4) {
              const hands = livingHands(state);
              const take = HEIST.bankReward + hands.length * 500;
              const paid = payHands(state, take, HEIST.cutPercent);
              m.take = take;
              state.heist && (state.heist.take = take);
              state.addMoney(paid.net, P.bankVault.x, P.bankVault.y - 20);
              burst(state, 'cash', P.bankVault.x, P.bankVault.y, 16, 1);
              for (const line of paid.lines) state.notify(line, '#ffd36b');
              state.notify(`Vault open — the crew takes $${paid.cut.toLocaleString('en-US')} of $${take.toLocaleString('en-US')}`, '#7dff8a');
              state.progress.vaultOpen = true;
              sfx('cash', 1);
              return 'next';
            }
          },
        },
        {
          objective: 'Escape with the take',
          enter(state, m) {
            // the getaway line: from the bank lobby to the boat at the marina, along the roads
            state.heistRoute = planRoute(P.bankLobby, P.getaway);
            m.route = state.heistRoute;
            if (heistPhase(state) === 'idle') {
              // a silent drill: the alarm was never raised, so ring it now as the doors open behind you
              raiseAlarm(state, 'the doors opened onto a waiting cruiser', { bank: P.bank });
            }
            say(state, 'SANA', 'Out the back. The line on the road is ours.');
          },
          marker: () => routeMarkers(state.heistRoute).filter((mk) => mk.cp === (state.heistRoute.next + 1)),
          update(state, m) {
            const r = state.heistRoute;
            if (!r) return 'next';
            const ev = updateRoute(state, r, state.player.car || state.player);
            if (ev === 'checkpoint') { sfx('pickup', 0.6); state.notify('Checkpoint', '#ff9a9a'); }
            const left = Math.max(0, r.total ? routeRemaining(r, state.player.car || state.player) : 0);
            const pctDone = Math.round(routeProgress(r, state.player.car || state.player) * 100);
            m.objectiveOverride = `Escape with the take — checkpoint ${r.next}/${r.checkpoints.length} · ${left} m · ${pctDone}%`;
            const hands = livingHands(state);
            if (hands.length === 0 && heistPhase(state) === 'alarm') {
              // both hands down is still survivable: they will rejoin from the van at the destination
            }
            if (ev === 'done') {
              quietAlarm(state, 'the boat left the pier');
              return 'next';
            }
          },
        },
      ],
    },
  ];
  for (const def of list) def.kind = 'mission';
  return list;
}

// the heist modules' numbers reach the missions above through HEIST; these two are kept so a play-test can
// read them from this module too without importing the heist files itself
export { crewCutShare, alarmTunables };
