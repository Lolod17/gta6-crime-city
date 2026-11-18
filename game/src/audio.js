// audio.js — JOB: all sound, synthesised with WebAudio: engine, siren, screech, gunfire, crashes, ambience
//   and the radio theme.
// EXPORTS: initAudio, sfx, setListener, updateAudio
// USES: config.js
//
// WebAudio synthesis, no samples: an engine whose pitch climbs through five gears, the PAPD siren
// wail (loudest from the nearest cruiser in pursuit), tyre screech, gunshots, crashes, explosions,
// city hum and surf by the beach, UI jingles, and "Sundown Drive" — the title theme, which also
// plays on the car radio (Radio Sol 98.7). Everything starts on the first key press or click.
import { AUDIO, CAR, WORLD } from './config.js';

let ctx = null;
let master, sfxBus, musicBus, noiseBuf;
let engine = null, siren = null, screech = null, hum = null, surf = null;
let listener = { x: 0, y: 0 };
const music = { next: 0, step: 0, playing: false, level: 0 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = AUDIO.master; master.connect(comp);
  sfxBus = ctx.createGain(); sfxBus.gain.value = AUDIO.sfx; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  engine = makeEngine();
  siren = makeSiren();
  screech = makeNoiseLoop('bandpass', 2400, 6);
  hum = makeNoiseLoop('lowpass', 320, 0.7);
  surf = makeNoiseLoop('lowpass', 900, 0.5);
  music.next = ctx.currentTime + 0.1;
}

function noiseSource(loop = false) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = loop;
  return s;
}

function makeNoiseLoop(type, freq, q) {
  const src = noiseSource(true);
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start();
  return { src, f, g };
}

function makeEngine() {
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
  const o2 = ctx.createOscillator(); o2.type = 'square';
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 3;
  const g = ctx.createGain(); g.gain.value = 0;
  const g2 = ctx.createGain(); g2.gain.value = 0.45;
  o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(sfxBus);
  o1.start(); o2.start();
  return { o1, o2, f, g };
}

function makeSiren() {
  const o = ctx.createOscillator(); o.type = 'square';
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.value = 0;
  o.connect(f); f.connect(g); g.connect(sfxBus);
  o.start();
  return { o, f, g };
}

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(type, f0, f1, dur, vol, when = 0, bus = sfxBus) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, vol, 0.005, dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, type, freq, vol, when = 0, q = 1, bus = sfxBus) {
  const t = ctx.currentTime + when;
  const s = noiseSource();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, vol, 0.004, dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}

/** One-shot sound effect; with a position it fades with distance from the player. */
export function sfx(name, vol = 1, x, y) {
  if (!ctx) return;
  if (x !== undefined) {
    const d = Math.hypot(x - listener.x, y - listener.y);
    vol *= Math.max(0, 1 - d / 1300);
    if (vol < 0.02) return;
  }
  const v = vol;
  switch (name) {
    case 'gunshot': noise(0.16, 'bandpass', 1400, 0.9 * v, 0, 0.8); tone('sine', 150, 45, 0.12, 0.7 * v); break;
    case 'smg': noise(0.08, 'bandpass', 1900, 0.7 * v, 0, 0.9); tone('sine', 180, 60, 0.06, 0.4 * v); break;
    case 'explosion':
      noise(1.4, 'lowpass', 500, 1.2 * v); noise(0.4, 'lowpass', 2200, 0.6 * v); tone('sine', 70, 25, 1.0, 1.0 * v); break;
    case 'crash': noise(0.3, 'lowpass', 900, 0.9 * v); tone('triangle', 110, 50, 0.2, 0.6 * v); noise(0.18, 'highpass', 3500, 0.25 * v, 0.03); break;
    case 'thud': tone('sine', 90, 40, 0.15, 0.7 * v); noise(0.08, 'lowpass', 600, 0.4 * v); break;
    case 'ping': tone('triangle', 2200, 1300, 0.08, 0.25 * v); break;
    case 'horn': tone('square', 392, 392, 0.45, 0.16 * v); tone('square', 494, 494, 0.45, 0.13 * v); break;
    case 'door': noise(0.05, 'bandpass', 900, 0.5 * v); tone('sine', 140, 90, 0.08, 0.4 * v, 0.02); break;
    case 'hurt': tone('square', 240, 120, 0.12, 0.12 * v); break;
    case 'cash': tone('sine', 1046, 1046, 0.08, 0.3 * v); tone('sine', 1568, 1568, 0.14, 0.3 * v, 0.07); break;
    case 'pickup': case 'reload': tone('triangle', 660, 990, 0.12, 0.3 * v); tone('triangle', 990, 1320, 0.12, 0.25 * v, 0.08); break;
    case 'click': tone('square', 1800, 1800, 0.02, 0.1 * v); break;
    case 'alert': tone('square', 660, 660, 0.12, 0.16 * v); tone('square', 880, 880, 0.18, 0.16 * v, 0.13); break;
    case 'escape': [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.2, 0.22 * v, i * 0.08)); break;
    case 'objective': tone('triangle', 784, 784, 0.12, 0.25 * v); tone('triangle', 1175, 1175, 0.2, 0.25 * v, 0.1); break;
    case 'mission': [392, 523, 659].forEach((f, i) => tone('sawtooth', f, f, 0.3, 0.12 * v, i * 0.1)); break;
    case 'passed': [523, 659, 784, 1046, 1318].forEach((f, i) => tone('square', f, f, 0.28, 0.14 * v, i * 0.11)); tone('sawtooth', 130, 130, 1.0, 0.15 * v, 0.1); break;
    case 'failed': [392, 330, 262].forEach((f, i) => tone('sawtooth', f, f, 0.35, 0.14 * v, i * 0.18)); break;
    case 'wasted': tone('sawtooth', 220, 55, 1.6, 0.25 * v); noise(1.2, 'lowpass', 300, 0.4 * v); break;
    case 'busted': tone('square', 700, 700, 0.25, 0.18 * v); tone('square', 520, 520, 0.25, 0.18 * v, 0.28); tone('square', 700, 700, 0.25, 0.18 * v, 0.56); break;
    case 'spray': noise(0.9, 'highpass', 4000, 0.4 * v); break;
    case 'start': [262, 330, 392, 523].forEach((f) => tone('sawtooth', f, f, 0.9, 0.07 * v)); break;
    default: break;
  }
}

// ------------------------------------------------------------------ music: "Sundown Drive"
// 104 bpm, sixteenth-note grid, a four-chord loop in A minor with a bass arpeggio, a pad, a lead
// motif and a drum machine, scheduled a little ahead of the audio clock.
const BPM = 104;
const SIX = 60 / BPM / 4;
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];     // Am F C G
const LEAD = [76, -1, 74, 76, -1, 79, -1, 76, 74, -1, 72, -1, 69, -1, 72, 74,
  72, -1, 69, 72, -1, 76, -1, 74, 72, -1, 69, -1, 67, -1, 69, -1];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function scheduleStep(step, t) {
  const bar = Math.floor(step / 16) % 4, s = step % 16;
  const chord = CHORDS[bar];
  // drums
  if (s % 4 === 0) { kick(t); }
  if (s === 4 || s === 12) snare(t);
  if (s % 2 === 1) hat(t, 0.05); else hat(t, 0.025);
  // bass: root and octave in eighths
  if (s % 2 === 0) {
    const n = chord[0] - 12 + (s % 4 === 2 ? 12 : 0);
    voice('sawtooth', midi(n), t, SIX * 1.8, 0.16, 700);
  }
  // pad on the bar
  if (s === 0) for (const n of chord) voice('triangle', midi(n), t, SIX * 15, 0.05, 1800, 0.25);
  // lead after the first pass
  const ln = LEAD[(step % 32)];
  if (ln > 0 && Math.floor(step / 64) % 2 === 1) voice('square', midi(ln), t, SIX * 1.6, 0.05, 2600);
  // arpeggio sparkle
  if (s % 2 === 1) voice('sine', midi(chord[(s >> 1) % 3] + 12), t, SIX * 0.9, 0.04, 4000);
}

function voice(type, f, t, dur, vol, cutoff, attack = 0.01) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(musicBus);
  o.start(t); o.stop(t + dur + 0.05);
}
function kick(t) {
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
}
function snare(t) {
  const s = noiseSource(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random()); s.stop(t + 0.2);
}
function hat(t, vol) {
  const s = noiseSource(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random()); s.stop(t + 0.05);
}

export function setListener(x, y) { listener.x = x; listener.y = y; }

/** Per-frame: engine, siren, screech, ambience and the music scheduler follow the game state. */
export function updateAudio(state, dt) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const p = state.player;
  listener.x = p.x; listener.y = p.y;
  const playing = state.mode === 'play' || state.mode === 'mission';
  const set = (param, v, tc = 0.06) => param.setTargetAtTime(v, now, tc);

  // engine: five gears; each gear sweeps the pitch up, then drops on the shift
  const v = p.car;
  if (v && playing && !v.dead) {
    const sp = Math.hypot(v.vx, v.vy);
    const span = CAR.topSpeed / 5;
    const gear = Math.min(4, Math.floor(sp / span));
    const rpm = (sp - gear * span) / span;
    const f = 42 + rpm * 70 + gear * 9;
    set(engine.o1.frequency, f, 0.03); set(engine.o2.frequency, f * 0.5, 0.03);
    set(engine.f.frequency, 350 + v.control.throttle * 900 + rpm * 500);
    set(engine.g.gain, 0.07 + v.control.throttle * 0.07);
    set(screech.g.gain, v.skid > 0.25 && sp > 120 ? 0.12 * v.skid : 0, 0.04);
  } else {
    set(engine.g.gain, 0); set(screech.g.gain, 0);
  }

  // siren: the nearest cruiser with its lights on
  let nd = 1e9;
  for (const c of state.vehicles) if (c.police && c.siren && !c.dead) nd = Math.min(nd, Math.hypot(c.x - p.x, c.y - p.y));
  const sv = playing && nd < 1400 ? 0.09 * (1 - nd / 1400) : 0;
  set(siren.g.gain, sv, 0.1);
  set(siren.o.frequency, 760 + 380 * Math.sin(now * Math.PI * 0.9), 0.02);

  // ambience: city hum everywhere, surf near the shore
  const shore = Math.abs(p.x - WORLD.waterCol * WORLD.tile);
  set(hum.g.gain, playing || state.mode === 'title' ? 0.05 : 0, 0.5);
  set(surf.g.gain, (playing || state.mode === 'title') && shore < 700 ? 0.12 * (1 - shore / 700) * (0.6 + 0.4 * Math.sin(now * 0.8)) : 0, 0.3);

  // music: full on the title, the car radio while driving, quiet on foot
  const want = state.mode === 'title' ? AUDIO.music : v && playing ? AUDIO.music * 0.55 : state.mode === 'pause' ? AUDIO.music * 0.4 : 0;
  set(musicBus.gain, want, 0.4);
  if (want > 0 || musicBus.gain.value > 0.01) {
    if (music.next < now) music.next = now + 0.05;
    while (music.next < now + 0.15) {
      scheduleStep(music.step, music.next);
      music.step += 1;
      music.next += SIX;
    }
  }
}
