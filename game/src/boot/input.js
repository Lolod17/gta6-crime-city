// boot/input.js — JOB: keyboard and mouse: held and just-pressed keys, the mouse position and button, and
//   the keys that switch screens (pause, start from the title, radio mute).
// EXPORTS: bindInput
// USES: ../persist.js, ../radio.js, ../audio.js, ./state.js
// MUST NOT: move the player or read the keys for play (player.js reads state.input each step).
import { hasSave } from '../persist.js';
import { toggleMute } from '../radio.js';
import { initAudio } from '../audio.js';
import { state, canvas, startGame, togglePause } from './state.js';

/** Register the window and canvas listeners that fill state.input. */
export function bindInput() {
  const input = state.input;
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
    initAudio();
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) togglePause();
    if (state.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) startGame(hasSave());
    if (e.code === state.radio.key && !e.repeat && state.mode !== 'title') toggleMute(state, state.radio);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => { input.keys.clear(); input.mouse.down = false; if (state.mode === 'play') togglePause(); });
  canvas.addEventListener('mousemove', (e) => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.active = true; });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    input.mouse.down = true; input.mouse.clicked = true; input.mouse.active = true;
    input.mouse.x = e.clientX; input.mouse.y = e.clientY;
    initAudio();
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
