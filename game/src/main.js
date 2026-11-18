// main.js — JOB: the page's entry module: wires input to the shared state and starts the loop; the work lives in boot/.
// EXPORTS: state (the one shared game state; importing this module boots and runs the game)
// USES: boot/state.js, boot/input.js, boot/loop.js
// MUST NOT: hold game code of its own beyond the boot order (state, then input, then the loop).
import { state } from './boot/state.js';
import { bindInput } from './boot/input.js';
import { startLoop } from './boot/loop.js';

bindInput();
startLoop();

export { state };
