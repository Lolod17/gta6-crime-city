// shop/weapons.js — JOB: Armas del Muelle, the gun counter in a painted container on the Southside port yard:
//   three weapons with prices, buying them (or a box of ammo once owned), the counter panel the HUD shows,
//   and what the save keeps of it.
// EXPORTS: ARMS, ARMS_ORDER, armsMarker, armsOwnedNames, updateArms, armsSave, restoreArms
// USES: ../config.js, ../audio.js
// MUST NOT: draw anything (hud/overlays.js shows state.armsView) or touch Punta Arms (shop.js).
//
// Walk up to the counter on foot while no job runs and the panel opens; 1–3 buy, BACKSPACE leaves.
// Cash comes off at once (the HUD money line and a red -$ notice), the weapon goes into the player's
// hands with a full load, and the purchase is saved straight away. Owning a weapon, the same key buys
// a box of ammo. Ammo is never reset: what is left carries over through death, arrest and saves.
// The clerk will not serve anyone the PAPD is chasing.
import { WEAPONS, WEAPON_ORDER } from '../config.js';
import { sfx } from '../audio.js';

/** The three weapons on the counter. `weapon` is registered in WEAPONS so the player can fire it. */
export const ARMS = {
  revolver: {
    name: 'Bulldog Revolver', price: 1200, key: 'Digit1', boxPrice: 240, box: 24,
    blurb: 'heavy rounds, one at a time',
    weapon: { name: 'Revolver', rate: 0.55, damage: 55, spread: 0.02, speed: 1800, range: 700, ammo: 48, auto: false },
  },
  mpistol: {
    name: 'Vespa Machine Pistol', price: 3200, key: 'Digit2', boxPrice: 500, box: 120,
    blurb: 'hold the trigger, spray the street',
    weapon: { name: 'Vespa MP', rate: 0.06, damage: 11, spread: 0.12, speed: 1550, range: 480, ammo: 360, auto: true },
  },
  marksman: {
    name: 'Faro Marksman Rifle', price: 7500, key: 'Digit3', boxPrice: 900, box: 10,
    blurb: 'one shot, from across the yard',
    weapon: { name: 'Marksman', rate: 1.0, damage: 110, spread: 0.004, speed: 2600, range: 1150, ammo: 30, auto: false },
  },
};
export const ARMS_ORDER = ['revolver', 'mpistol', 'marksman'];

// register the three with the weapon table: number keys 5, 6 and 7 pick them once owned
for (const k of ARMS_ORDER) {
  WEAPONS[k] = ARMS[k].weapon;
  if (!WEAPON_ORDER.includes(k)) WEAPON_ORDER.push(k);
}

const COLOR = '#ff5a3d';
const money = (n) => '$' + n.toLocaleString('en-US');
const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;
const owned = (state) => (state.progress.arms ||= {});

/** The counter's ground marker, shown whenever no job runs. */
export function armsMarker(state) {
  const P = state.city.places;
  return { x: P.arms.x, y: P.arms.y, r: 36, color: COLOR, label: 'ARMAS DEL MUELLE' };
}

/** Names of the bought weapons, for the HUD line under the ammo count. */
export function armsOwnedNames(state) {
  const o = owned(state);
  return ARMS_ORDER.filter((k) => o[k]).map((k) => ARMS[k].weapon.name.toUpperCase());
}

function buy(state, k) {
  const item = ARMS[k], p = state.player, o = owned(state);
  if (state.wanted.level > 0) { state.notify('"Lose the cops first, amigo."', '#ffd36b'); sfx('click', 0.5); return; }
  // play-testing: at the two-load cap a box was still charged for and added nothing
  if (o[k] && (p.ammo[k] || 0) >= item.weapon.ammo * 2) { state.notify(`${item.weapon.name} ammo is full`, '#ffd36b'); sfx('click', 0.5); return; }
  const price = o[k] ? item.boxPrice : item.price;
  if (state.money < price) { state.notify(`${o[k] ? 'A box of ammo' : item.name} costs ${money(price)}`, '#ff7a7a'); sfx('click', 0.5); return; }
  state.addMoney(-price);
  if (o[k]) {
    // a box on top of what is left, up to two full loads
    p.ammo[k] = Math.min(item.weapon.ammo * 2, (p.ammo[k] || 0) + item.box);
    state.notify(`+${item.box} ${item.weapon.name} rounds`, '#7ff0e0');
    sfx('reload', 0.8);
  } else {
    o[k] = true;
    p.ammo[k] = Math.max(p.ammo[k] || 0, item.weapon.ammo);
    p.weapon = k;
    state.notify(`Bought: ${item.name}`, '#7ff0e0');
    sfx('cash', 0.9);
  }
  state.armsLog = state.armsLog || [];
  state.armsLog.push({ item: k, price, money: state.money, ammo: p.ammo[k] });
  state.save && state.save();
}

/** The counter: opens on foot at the marker, buys on 1–3, closes on BACKSPACE / F / ENTER. */
export function updateArms(state) {
  const p = state.player, P = state.city.places, input = state.input;
  if (state.mode === 'arms') {
    for (const k of ARMS_ORDER) if (input.pressed.has(ARMS[k].key)) buy(state, k);
    if (input.pressed.has('Backspace') || input.pressed.has('KeyF') || input.pressed.has('Enter')) {
      state.mode = 'play'; state.armsDeclined = true; state.armsView = null;
      return;
    }
    const o = owned(state);
    state.armsView = {
      title: 'ARMAS DEL MUELLE',
      sub: state.wanted.level > 0 ? 'The clerk won\'t serve you with the PAPD outside' : 'Southside port · cash only',
      items: ARMS_ORDER.map((k, i) => ({
        n: i + 1,
        name: ARMS[k].name,
        price: o[k] ? ARMS[k].boxPrice : ARMS[k].price,
        owned: !!o[k],
        note: !o[k] ? ARMS[k].blurb
          : (p.ammo[k] || 0) >= ARMS[k].weapon.ammo * 2 ? `owned — ${p.ammo[k]} rounds · full`
          : `owned — ${p.ammo[k] || 0} rounds · buy a box of ${ARMS[k].box}`,
      })),
    };
    return;
  }
  state.armsView = null;
  if (state.mode !== 'play' || state.mission) return;
  if (!p.car && near(p, P.arms, 40) && !state.armsDeclined) { state.mode = 'arms'; sfx('objective', 0.5); return; }
  if (state.armsDeclined && !near(p, P.arms, 110)) state.armsDeclined = false;
}

/** What the save keeps: which of the three were bought. (Ammo for every weapon is saved by persist.js.) */
export function armsSave(state) {
  const o = owned(state);
  return Object.fromEntries(ARMS_ORDER.map((k) => [k, !!o[k]]));
}

/** Give back a save's purchases and its ammo counts, ignoring anything this build does not sell. */
export function restoreArms(state, arms, ammo) {
  const o = owned(state), p = state.player;
  for (const k of ARMS_ORDER) if (arms && arms[k]) o[k] = true;
  if (ammo && typeof ammo === 'object') {
    for (const [k, n] of Object.entries(ammo)) {
      if (!WEAPONS[k] || typeof n !== 'number' || !Number.isFinite(n)) continue;
      if (ARMS[k] && !o[k]) continue;   // ammo for a weapon the save never bought
      p.ammo[k] = Math.max(0, Math.min(WEAPONS[k].ammo * 2, Math.round(n)));
    }
  }
}
