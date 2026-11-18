// traffic.js — JOB: the one public entry for city life: civilian cars, pedestrians, parked cars, pickups, re-exported from traffic/.
// EXPORTS: makePerson, initTraffic, populate, topUpCrowd, driveAlongRoads, updateTraffic, scarePeople, hurtPed,
//   ejectDriver, updatePickups, spawnLaneCar, loopPoint, DIRS, laneX, laneY, validDir, pickTurn
// USES: traffic/spawn.js, traffic/behaviour.js
// MUST NOT: contain code of its own; spawning is traffic/spawn.js, driving and reactions traffic/behaviour.js.
export { makePerson, initTraffic, populate, topUpCrowd, spawnLaneCar, loopPoint, DIRS, laneX, laneY, validDir, pickTurn } from './traffic/spawn.js';
export { driveAlongRoads, updateTraffic, scarePeople, hurtPed, ejectDriver, updatePickups } from './traffic/behaviour.js';
