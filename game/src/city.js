// city.js — JOB: the one public entry for the city: the seeded city as data and the queries on it, re-exported from city/.
// EXPORTS: T_ROAD, makeRng, roadCenter, blockStart, BLOCK_SIZE, ROADS_X, ROADS_Y, worldToZone, solidsNear, isBlocked, lineOfSight, segmentHitsRect, segmentEnterRect, nearestNode, kerbPoint, buildCity, T_BLOCK, T_PARK, T_SAND, T_WATER
// MUST NOT: contain code of its own; generation is city/blocks.js, the grid city/roads.js, collision city/collide.js.
export { T_ROAD, T_BLOCK, T_PARK, T_SAND, T_WATER, roadCenter, blockStart, BLOCK_SIZE, ROADS_X, ROADS_Y, nearestNode, kerbPoint } from './city/roads.js';
export { makeRng, worldToZone, buildCity } from './city/blocks.js';
export { solidsNear, isBlocked, lineOfSight, segmentHitsRect, segmentEnterRect } from './city/collide.js';
