// districts.js — JOB: district names and taglines, and the banner shown when the player crosses into one.
// EXPORTS: DISTRICTS, districtAt, updateDistricts, resetDistricts
// USES: config.js, city.js
// DISTRICT PASS: Bahía Azul (the beach strip) and Southside (the port) carry their own ground kind and accent
//   colour; the banner reports the tile under the player so the look and the name always agree.
// SPLIT PASS: code unchanged; imported by boot/state.js, boot/loop.js, hud/mission.js after the split; loaded in the
//   split-pass smoke run with no console errors.
//
// The named districts of Puerto Ámbar and their one-line taglines. The city generator tags each
// block with a kind (city.js district()); this file gives each zone a name for its people and a
// line the HUD shows for four seconds when the player crosses into it. Pure data plus the
// entry test: nothing here touches the simulation.
import { WORLD, HUD } from './config.js';
import { worldToZone, tileAt, TILE_NAMES } from './city.js';

/** name and tagline per zone id. The whole map falls into one of these. */
export const DISTRICTS = {
  southside: { name: 'SOUTHSIDE', tagline: 'Cranes, containers and cheaper promises', ground: 'port', accent: '#f2c230' },
  downtown: { name: 'DOWNTOWN', tagline: 'Glass towers, old money and new trouble' },
  caracol: { name: 'BAIXO', tagline: 'Bar Caracol, where every secret is a special' },
  eastside: { name: 'EASTSIDE', tagline: 'Fast cars, short tempers, no witnesses' },
  centro: { name: 'CENTRO', tagline: 'The old quarter — everyone knows your name' },
  palmas: { name: 'PALMAS VERDES', tagline: 'Pools, palms and fences three keys deep' },
  marina: { name: 'MARINA SOL', tagline: 'Yachts by the hour, souls by the ounce' },
  palmlines: { name: 'VISTA CORAL', tagline: 'Pink stucco, quiet money, louder engines' },
  bahia: { name: 'BAHÍA AZUL', tagline: 'Sand in the engine, salt in the alibi', ground: 'beach', accent: '#18b6c9' },
};

/** The district the player is in right now, by position. */
export function districtAt(city, x, y) {
  const zone = worldToZone(city, x, y);
  const z = DISTRICTS[zone] ? zone : (x > WORLD.waterCol * WORLD.tile ? 'bahia' : 'downtown');
  return { id: z, ...DISTRICTS[z], tile: TILE_NAMES[tileAt(city, x, y)] };
}

/** Called every tick. On first play, on a reset, or when the zone changes, returns a banner. */
export function updateDistricts(state, dt) {
  if (!state.loc) state.loc = { id: null };
  if (state.locationBanner && (state.locationBanner.life -= dt) <= 0) state.locationBanner = null;
  if (state.mode !== 'play' && state.mode !== 'mission') return;
  const p = state.player;
  const here = districtAt(state.city, p.x, p.y);
  state.loc.tile = here.tile;   // the ground under the player right now (beach-sand, port-concrete, road ...)
  state.loc.ground = here.ground || null;
  if (here.id === state.loc.id) return;
  state.loc.id = here.id;
  // stepping back and forth over a boundary does not repeat a banner seen in the last 15 s
  const seen = (state.loc.seen ||= {});
  if (seen[here.id] !== undefined && state.time - seen[here.id] < 15) return;
  seen[here.id] = state.time;
  state.locationBanner = { id: here.id, name: here.name, tagline: here.tagline, accent: here.accent || null, tile: here.tile, life: HUD.bannerTime };
}

/** Forget the district (new game, respawn far away): the next tick shows its banner again. */
export function resetDistricts(state) {
  state.loc = { id: null };
  state.locationBanner = null;
}
