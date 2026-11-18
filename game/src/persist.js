// persist.js — JOB: the single save slot in localStorage: write, read and validate.
// EXPORTS: hasSave, saveGame, loadGame
// USES: nothing (no imports)
// DISTRICT PASS: the save also keeps the Armas del Muelle purchases (progress.arms) and the ammo left in
//   every weapon, so bought ammo carries over; the story now runs to day 4.
// SPLIT PASS: code unchanged; imported by boot/state.js, boot/input.js, boot/loop.js after the split; loaded in the
//   split-pass smoke run with no console errors.
//
// Save and load through localStorage: cash, the story day, the ids of completed missions, what was
// bought, activity bests, stats and the wanted level. One slot, written on every job passed, every
// purchase, every 15 s of play, and from the pause menu. Versioned: an older format is refused
// rather than misread.
const KEY = 'sundown-puerto-ambar-save';
const VERSION = 2;

/** {name: true} for every truthy entry of a plain object with short lowercase keys; {} otherwise. */
function flags(o) {
  if (!o || typeof o !== 'object') return {};
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => /^[a-z]{1,16}$/.test(k) && v === true));
}

/** {name: n} for every finite non-negative number, or null when the save predates ammo. */
function counts(o) {
  if (!o || typeof o !== 'object') return null;
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => /^[a-z]{1,16}$/.test(k) && Number.isFinite(v) && v >= 0));
}

export function hasSave() {
  try { return !!loadGame(); } catch { return false; }
}

export function saveGame(state) {
  const pr = state.progress;
  const data = {
    v: VERSION,
    savedAt: Date.now(),
    money: state.money,
    day: pr.day,
    done: pr.done.slice(),
    progress: { smg: pr.smg, owned: { ...pr.owned }, arms: { ...(pr.arms || {}) }, ending: pr.ending, bests: { ...pr.bests } },
    ammo: { ...state.player.ammo },
    stats: state.stats,
    wanted: state.wanted.level,
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

/**
 * The saved game, sanitised, or null. `validIds` drops mission ids this build does not know; `lastDay`
 * is the story's last day (story.js LAST_DAY), so a save can never name a day the build lacks.
 */
export function loadGame(validIds = null, lastDay = 4) {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!data || data.v !== VERSION) return null;
    const done = Array.isArray(data.done) ? data.done.filter((id) => typeof id === 'string' && (!validIds || validIds.includes(id))) : [];
    const owned = data.progress?.owned || {};
    return {
      money: Math.max(0, Number(data.money) || 0),
      day: Math.max(1, Math.min(lastDay, data.day | 0)),
      done: [...new Set(done)],
      progress: {
        smg: !!data.progress?.smg,
        owned: { armor: !!owned.armor, shotgun: !!owned.shotgun, carbine: !!owned.carbine, cometa: !!owned.cometa },
        arms: flags(data.progress?.arms),
        ending: data.progress?.ending === 'sold' || data.progress?.ending === 'loyal' ? data.progress.ending : null,
        bests: data.progress?.bests && typeof data.progress.bests === 'object' ? data.progress.bests : {},
      },
      stats: data.stats || {},
      wanted: Math.max(0, Math.min(5, data.wanted | 0)),
      ammo: counts(data.ammo),
    };
  } catch { return null; }
}
