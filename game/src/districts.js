// The named districts of Puerto Ámbar and their one-line taglines. The city generator tags each
// block with a kind (city.js district()); this file gives each zone a name for its people and a
// line the HUD shows for four seconds when the player crosses into it. Pure data plus the
// entry test: nothing here touches the simulation.
import { WORLD } from './config.js';
import { worldToZone } from './city.js';

/** name and tagline per zone id. The whole map falls into one of these. */
export const DISTRICTS = {
  southside: { name: 'SOUTHSIDE', tagline: 'Warehouses, cheap rooms and cheaper promises' },
  downtown: { name: 'DOWNTOWN', tagline: 'Glass towers, old money and new trouble' },
  caracol: { name: 'BAIXO', tagline: 'Bar Caracol, where every secret is a special' },
  eastside: { name: 'EASTSIDE', tagline: 'Fast cars, short tempers, no witnesses' },
  centro: { name: 'CENTRO', tagline: 'The old quarter — everyone knows your name' },
  palmas: { name: 'PALMAS VERDES', tagline: 'Pools, palms and fences three keys deep' },
  marina: { name: 'MARINA SOL', tagline: 'Yachts by the hour, souls by the ounce' },
  palmlines: { name: 'PALMLINE BEACH', tagline: 'Sun, sand and bad decisions' },
  bahia: { name: 'BAHÍA AZUL', tagline: 'The last street before the water owns it' },
};

/** The district the player is in right now, by position. */
export function districtAt(city, x, y) {
  const zone = worldToZone(city, x, y);
  const z = DISTRICTS[zone] ? zone : (x > WORLD.waterCol * WORLD.tile ? 'bahia' : 'downtown');
  return { id: z, ...DISTRICTS[z] };
}

/** Called every tick. On first play, on a reset, or when the zone changes, returns a banner. */
export function updateDistricts(state, dt) {
  if (!state.loc) state.loc = { id: null };
  if (state.loc.hold > 0) state.loc.hold -= dt;
  if (state.mode !== 'play' && state.mode !== 'mission') return;
  const p = state.player;
  const here = districtAt(state.city, p.x, p.y);
  if (here.id === state.loc.id) return;
  const first = state.loc.id === null;
  state.loc.id = here.id;
  state.loc.hold = first ? 4 : 4;
  // a banner on entry — but not before the first frame of a fresh load
  state.locationBanner = { name: here.name, tagline: here.tagline, life: 4 };
}

/** Forget the district (new game, respawn far away): the next tick shows its banner again. */
export function resetDistricts(state) {
  state.loc = { id: null };
  state.locationBanner = null;
}
