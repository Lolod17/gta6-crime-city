// police.js — JOB: the one public entry for the PAPD: wanted stars, pursuit, cops on foot, the helicopter, re-exported from police/.
// EXPORTS: createWanted, starsFor, evadeTime, reportCrime, addHeat, setWanted, lowerWanted, clearWanted,
//   updatePolice, dressCop, createHeli, onEjectCop, createBlockade, ESCALATION
// USES: police/heat.js, police/pursuit.js
// MUST NOT: contain code of its own; heat and stars are police/heat.js, cruisers, cops and the helicopter police/pursuit.js.
export { createWanted, starsFor, evadeTime, reportCrime, addHeat, setWanted, lowerWanted, clearWanted } from './police/heat.js';
export { updatePolice, dressCop, createHeli, onEjectCop, createBlockade, ESCALATION } from './police/pursuit.js';
