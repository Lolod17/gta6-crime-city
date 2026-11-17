// The twelve story missions of SUNDOWN: Puerto Ámbar, as a three-day arc for Rio Salcedo.
//   Day 1 — LEARN THE CITY: Collection, Fragile, The Tail, The Dash
//   Day 2 — THE CREW:       Three Drops, Street Race, Protection, The Warehouse
//   Day 3 — THE HEAT:       The Aurelia, Heat, Muelle Cinco, The Ledger
// Each mission is data for the runner in jobs.js: a giver, a start marker, a briefing, dialogue,
// a reward, and stages (objective line, timer, markers, fail condition). story.js decides which one
// is unlocked; crew.js and racing.js supply the gunmen and the rival driver.
import { JOBS } from './config.js';
import { lineOfSight, blockStart, BLOCK_SIZE, nearestNode, roadCenter } from './city.js';
import { setWanted, clearWanted } from './police.js';
import { makePerson, DIRS, laneX, laneY, validDir, pickTurn } from './traffic.js';
import { createVehicle } from './vehicle.js';
import { burst } from './render.js';
import { sfx } from './audio.js';
import { spawnCrew, ring, alive, openGround } from './crew.js';
import { junctions, routeThrough, createRace, updateRace, createRival, updateRival } from './racing.js';
import { say } from './story.js';
import { respray } from './shop.js';
import { markerAt } from './jobs.js';

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

/** Put the player behind the wheel of v (the race start). */
function seatPlayer(state, v) {
  const p = state.player;
  if (p.car && p.car !== v) { p.car.driver = null; }
  v.driver = 'player';
  p.car = v; p.x = v.x; p.y = v.y; p.vx = 0; p.vy = 0;
}

/** Stage: get into any car (one is parked beside the marker if the player arrived on foot). */
const getACar = (objective = 'Get in a car') => ({
  objective,
  enter(state, m) { if (!state.player.car) m.spare = spawnCar(state, m, state.player); },
  marker: (state, m) => (m.spare && !state.player.car ? markerAt(m.spare, Y, 'CAR', 34) : null),
  update(state) { if (state.player.car) return 'next'; },
});

/** A road car driven by the traffic AI, starting on a lane near the player (the tail target). */
function spawnRoadCar(state, m, model, color, cruise) {
  const p = state.player;
  const node = nearestNode(p.x, p.y);
  const dirs = [0, 1, 2, 3].filter((d) => validDir(node.i, node.j, d));
  const d = dirs[Math.floor(state.rng() * dirs.length)];
  const along = 170;
  const x = d % 2 === 0 ? roadCenter(node.i) + DIRS[d][0] * along : laneX(node.i, d);
  const y = d % 2 === 1 ? roadCenter(node.j) + DIRS[d][1] * along : laneY(node.j, d);
  const v = createVehicle(model, x, y, Math.atan2(DIRS[d][1], DIRS[d][0]), state.rng);
  v.color = color;
  v.driver = 'ai';
  const ni = node.i + DIRS[d][0], nj = node.j + DIRS[d][1];
  v.ai = { d, i: ni, j: nj, next: pickTurn(state.rng, ni, nj, d), panic: 0, wait: 0, cruise };
  v.mission = true;
  state.vehicles.push(v);
  m.entities.push(v);
  return v;
}

/** The race checkpoints against Teo: a lap of downtown and the marina that ends where it began. */
const RACE_LINE = [[1, 4], [4, 4], [4, 8], [7, 8], [7, 4], [5, 1], [1, 1]];

// ------------------------------------------------------------------ the twelve missions

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
          marker: () => markerAt(P.pickup, Y, 'PICKUP'),
          update(state) { if (near(state.player, P.pickup, 55)) return 'next'; },
        },
        {
          objective: 'Deliver the crate to the laundromat', timer: 80,
          marker: () => markerAt(P.drop, Y, 'DROP-OFF'),
          enter(state) {
            state.notify('Crate loaded', Y); sfx('pickup', 0.8);
            setWanted(state, 1);
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
      outro: ['NANDO', 'Every glass counted. Come by the bar.'],
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
      outro: ['DARIO', 'He met the Glasshands. Teo\'s buying the harbour.'],
      stages: [
        getACar('Get in a car for the tail'),
        {
          objective: 'Tail the accountant', timer: 65, survive: true,
          enter(state, m) {
            m.target = spawnRoadCar(state, m, 'sol', '#f7f0d8', 175);
            m.sus = 0; m.grace = 4;
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
            if (d < JOBS.tailNear && lineOfSight(state.city, t.x, t.y, p.x, p.y)) m.sus += JOBS.tailSuspicion * dt;
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
          objective: 'Collect the packages', timer: 160,
          enter(state, m) {
            m.got = [false, false, false];
            setWanted(state, 1, 1, 5);
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
      outro: ['NANDO', 'I owe you my neck. Dario talks to Teo.'],
      stages: [
        {
          objective: 'Protect Nando from the hit squad',
          enter(state, m) {
            const at = openGround(state.city, P.clinic.x, P.clinic.y);
            const v = makePerson('vip', at.x, at.y, state.rng);
            v.shirt = '#2bd9a6'; v.pants = '#2c3440'; v.hair = '#3b2a1a'; v.health = JOBS.vipHealth; v.vip = true; v.mission = true;
            state.peds.push(v);
            m.vip = v; m.targets.push(v);
            m.crew.push(...spawnCrew(state, P.clinic.x, P.clinic.y, ring(3, 420, 0.4), { awake: true }));
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
          enter(state, m) { if (!state.player.car) m.spare = spawnCar(state, m, m.vip, 'pelican', 60, 0); say(state, 'NANDO', 'Get a car. I\'m not walking.'); },
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
        {
          objective: 'Escape the police',
          enter(state) { setWanted(state, 3); say(state, 'RADIO', 'Shots off Harbour Avenue. All units.'); },
          update(state) { if (state.wanted.level === 0) return 'next'; },
        },
      ],
    },

    // =============================================================== DAY 3 — THE HEAT
    {
      id: 'aurelia', day: 3, title: 'THE AURELIA', giver: 'DARIO', start: P.caracol, reward: 3000,
      briefing: 'Teo Castellan\'s gold Aurelia sits outside his downtown office. Steal it and deliver it to the container lot at the marina with at least 60% of its bodywork — a buyer is waiting.',
      dialogue: [
        ['DARIO', 'Teo loves one thing: the Aurelia.'],
        ['DARIO', 'A scratch costs us. A dent costs you.'],
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
            setWanted(state, 1);
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
        ['DARIO', 'All of them. Forty seconds. Paint & Pray.'],
      ],
      outro: ['DARIO', 'We have the ledger. Muelle Cinco.'],
      stages: [
        getACar(),
        {
          objective: 'Survive the four-star pursuit', timer: 40, survive: true,
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
        {
          objective: 'Escape the police',
          enter(state) { setWanted(state, 2); say(state, 'RADIO', 'Shots at Muelle Cinco. All units.'); },
          update(state) { if (state.wanted.level === 0) return 'next'; },
        },
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
        ? ['NANDO', 'Fourteen thousand and every cop in town. Don\'t come by the bar for a while.']
        : ['INES', 'Loyalty is expensive, Rio. Today I pay for it. Puerto Ámbar is ours.']),
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
        {
          objective: 'Inés knows — escape with the money',
          enter(state) { setWanted(state, 3); say(state, 'INES', 'You sold my city, Rio.'); },
          update(state) { if (state.wanted.level === 0) return 'next'; },
        },
      ],
    },
  ];
  for (const def of list) def.kind = 'mission';
  return list;
}
