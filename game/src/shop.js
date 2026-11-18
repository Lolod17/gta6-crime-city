// shop.js — JOB: places that take cash: Punta Arms, the safehouse garage and the Paint & Pray respray.
// EXPORTS: RESPRAY_PRICE, respray, shopMarkers, ownedList, restoreOwned, updateShop
// USES: config.js, city.js, vehicle.js, police.js, render.js, audio.js
// SPLIT PASS: code unchanged; imported by boot/state.js, boot/loop.js after the split; its imports from police.js now
//   resolve through that re-export shim; loaded in the split-pass smoke run with no console errors.
//
// Places that take cash: Punta Arms (armour, shotgun, carbine), the safehouse garage (the Cometa SX
// bought here waits there on every visit) and Paint & Pray (a respray loses the PAPD for $250).
// Everything the player owns shows in the HUD; nothing is unlocked without paying for it.
import { SHOP, WEAPONS } from './config.js';
import { isBlocked } from './city.js';
import { createVehicle } from './vehicle.js';
import { clearWanted } from './police.js';
import { burst } from './render.js';
import { sfx } from './audio.js';

export const RESPRAY_PRICE = 250;
const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;
const ITEMS = ['armor', 'shotgun', 'carbine', 'cometa'];
const money = (n) => '$' + n.toLocaleString('en-US');

/** Paint & Pray: a new colour and a patched body hide the car from the PAPD. */
export function respray(state) {
  const v = state.player.car;
  if (v) {
    const colors = ['#ff5a36', '#18b6c9', '#f2f2f2', '#2f2f35', '#e8337a', '#7ad3c8'];
    v.color = colors[(colors.indexOf(v.color) + 1) % colors.length];
    v.health = Math.max(v.health, v.maxHealth * 0.8);
  }
  burst(state, 'smoke', state.player.x, state.player.y, 14, 1.2);
  sfx('spray', 0.9);
}

/** Ground markers for the shops (shown whenever no job is running). */
export function shopMarkers(state) {
  const P = state.city.places;
  const out = [{ x: P.shop.x, y: P.shop.y, r: 36, color: '#ff7a59', label: 'PUNTA ARMS' }];
  if (state.wanted.level > 0) out.push({ x: P.garage.x, y: P.garage.y, r: 40, color: '#c38bff', label: `RESPRAY ${money(RESPRAY_PRICE)}` });
  return out;
}

/** What the HUD lists as bought. */
export function ownedList(state) {
  const o = state.progress.owned;
  const out = [];
  if (o.armor) out.push('VEST');
  if (o.shotgun) out.push('SHOTGUN');
  if (o.carbine) out.push('CARBINE');
  if (o.cometa) out.push('COMETA SX');
  return out;
}

/** Give back what a save says was bought (weapons need ammo, the vest its armour). */
export function restoreOwned(state) {
  const o = state.progress.owned, p = state.player;
  if (o.armor) p.armor = Math.max(p.armor, 50);
  for (const w of ['shotgun', 'carbine']) if (o[w]) p.ammo[w] = Math.max(p.ammo[w], Math.round(WEAPONS[w].ammo * SHOP.ammoRefill));
}

const refillPrice = (item) => Math.round(SHOP[item].price / 5);

function buy(state, item) {
  const s = SHOP[item], p = state.player, o = state.progress.owned;
  if (item !== 'armor' && o[item]) {
    if (item === 'cometa') { state.notify('You already own the Cometa SX', '#ffd36b'); return; }
    // owning a weapon already: buying again refills its ammo at a fifth of the price
    const price = refillPrice(item);
    if (state.money < price) { state.notify(`Ammo costs ${money(price)}`, '#ff7a7a'); sfx('click', 0.5); return; }
    state.addMoney(-price);
    p.ammo[item] = WEAPONS[item].ammo;
    sfx('reload', 0.8);
    return;
  }
  if (item === 'armor' && p.armor >= 100) { state.notify('Armour is already full', '#ffd36b'); return; }
  if (state.money < s.price) { state.notify(`${s.name} costs ${money(s.price)}`, '#ff7a7a'); sfx('click', 0.5); return; }
  state.addMoney(-s.price);
  o[item] = true;
  if (item === 'armor') p.armor = 100;
  else if (item === 'cometa') { state.notify('The Cometa SX waits at the safehouse', '#7ff0e0'); placeSafehouseCar(state, true); }
  else { p.ammo[item] = Math.round(WEAPONS[item].ammo * SHOP.ammoRefill); p.weapon = item; }
  state.notify(`Bought: ${s.name}`, '#7ff0e0');
  sfx('cash', 0.9);
  state.save && state.save();
}

/** The Cometa appears at the safehouse when the player comes home and it is not already there. */
function placeSafehouseCar(state, force = false) {
  if (!state.progress.owned.cometa) return;
  const P = state.city.places;
  const p = state.player;
  if (state.vehicles.some((v) => v.owned && !v.dead)) return;
  const d = Math.hypot(p.x - P.safehouse.x, p.y - P.safehouse.y);
  if (!force && (d > 1100 || d < 650)) return;   // close enough to matter, far enough not to pop in on screen
  let x = P.safehouse.x + 46, y = P.safehouse.y + 70;
  for (let k = 0; k < 12 && isBlocked(state.city, x, y, 26); k += 1) y += 30;
  const v = createVehicle('cometa', x, y, Math.PI / 2, state.rng);
  v.owned = true; v.parked = true;
  state.vehicles.push(v);
}

/** Punta Arms counter and Paint & Pray, while no job runs. */
export function updateShop(state) {
  const p = state.player;
  const P = state.city.places;
  const input = state.input;
  placeSafehouseCar(state);
  if (state.mode === 'shop') {
    for (const item of ITEMS) if (input.pressed.has(SHOP[item].key)) buy(state, item);
    if (input.pressed.has('Backspace') || input.pressed.has('KeyF') || input.pressed.has('Enter')) {
      state.mode = 'play'; state.shopDeclined = true;
    }
    const o = state.progress.owned;
    state.shopView = {
      items: ITEMS.map((k, i) => ({
        n: i + 1, name: SHOP[k].name,
        price: k === 'shotgun' || k === 'carbine' ? (o[k] ? refillPrice(k) : SHOP[k].price) : SHOP[k].price,
        owned: k !== 'armor' && !!o[k],
        note: k === 'armor' ? `armour ${Math.round(p.armor)}/100`
          : k === 'cometa' ? (o.cometa ? 'owned — parked at the safehouse' : 'fastest car in Puerto Ámbar')
          : o[k] ? 'owned — buy a full load of ammo' : `${WEAPONS[k].name.toLowerCase()} and ammo`,
      })),
    };
    return;
  }
  state.shopView = null;
  if (state.mode !== 'play' || state.mission) return;
  // walk up to the Punta Arms counter on foot
  if (!p.car && near(p, P.shop, 40) && !state.shopDeclined) { state.mode = 'shop'; sfx('objective', 0.5); return; }
  if (state.shopDeclined && !near(p, P.shop, 110)) state.shopDeclined = false;
  // Paint & Pray respray as a free-roam service
  if (state.wanted.level > 0 && near(p, P.garage, 60) && p.car) {
    if (state.money >= RESPRAY_PRICE) {
      state.addMoney(-RESPRAY_PRICE);
      clearWanted(state);
      respray(state);
      state.notify('Resprayed — the PAPD lost you', '#c38bff');
    } else state.missionHint = `A respray costs ${money(RESPRAY_PRICE)}`;
  }
}
