// Radio Sol 98.7 and its sister stations: a station and a track title for the HUD, cycling every
// RADIO.trackSeconds of play, muted and unmuted with the radio key, with the mute state kept in the
// HUD. Purely cosmetic: no audio is generated here (audio.js owns the engine and siren), this is
// the line the station would print on its display. Nothing here changes the simulation.
import { RADIO } from './config.js';

/** Each station cycles its own tracks and sits on the dial as `frequency`, for the HUD line. */
export const STATIONS = [
  {
    id: 'sol',
    name: 'RADIO SOL',
    frequency: '98.7',
    kind: 'Pop y salsa',
    tracks: ['Bayside Drive', 'Ámbar Nights', 'Costa Rosada', 'Slow Traffic', 'Muelle 5'],
  },
  {
    id: 'brasa',
    name: 'LA BRASA',
    frequency: '105.3',
    kind: 'Cumbia',
    tracks: ['Cumbia del Mar', 'Puerto Caliente', 'Baila Paloma', 'Tres de la Mañana', 'El Rescate'],
  },
  {
    id: 'wave',
    name: 'MAREJADA FM',
    frequency: '89.1',
    kind: 'Synthwave',
    tracks: ['Neon Lindo', 'Boardwalk Hours', 'Last Summer', 'Palm Static', 'Highway Americas'],
  },
];

/** Radio state for a fresh game or a load: first station, first track. */
export function createRadio() {
  return { station: 0, track: 0, t: 0, muted: false, key: 'KeyM' };
}

/** The line the HUD prints: station, current track, and `· muted` when the radio is muted. */
export function radioLine(radio) {
  const s = STATIONS[radio.station];
  const text = `${s.name} · ${s.tracks[radio.track]}${radio.muted ? ' · muted' : ''}`;
  return { station: s.name, frequency: s.frequency, track: s.tracks[radio.track], muted: !!radio.muted, kind: s.kind, text };
}

/** Advance the clock of the radio: every RADIO.trackSeconds the track changes. */
export function updateRadio(state, radio, dt) {
  radio.t += dt;
  if (radio.t >= RADIO.trackSeconds) {
    radio.t -= RADIO.trackSeconds;
    const s = STATIONS[radio.station];
    radio.track += 1;
    if (radio.track >= s.tracks.length) {
      radio.track = 0;
      radio.station = (radio.station + 1) % STATIONS.length;
    }
  }
}

/** Mute key (default M): toggles the mute and announces it only in words, never with sound. */
export function toggleMute(state, radio) {
  radio.muted = !radio.muted;
  state.notify(radio.muted ? 'Radio muted' : 'Radio on', radio.muted ? '#8a8a94' : '#7ff0e0');
}
