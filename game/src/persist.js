// persist.js — JOB: the single save slot in localStorage: write, read and validate.
// EXPORTS: hasSave, saveGame, loadGame
//
// Save and load through localStorage: cash, the story day, the ids of completed missions, what was
// bought, activity bests, stats and the wanted level. One slot, written on every job passed, every
// purchase, every 15 s of play, and from the pause menu. Versioned: an older format is refused
// rather than misread.
const KEY = 'sundown-puerto-ambar-save';
const VERSION = 2;

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
    progress: { smg: pr.smg, owned: { ...pr.owned }, ending: pr.ending, bests: { ...pr.bests } },
    stats: state.stats,
    wanted: state.wanted.level,
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

/** The saved game, sanitised, or null. `validIds` drops mission ids this build does not know. */
export function loadGame(validIds = null) {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!data || data.v !== VERSION) return null;
    const done = Array.isArray(data.done) ? data.done.filter((id) => typeof id === 'string' && (!validIds || validIds.includes(id))) : [];
    const owned = data.progress?.owned || {};
    return {
      money: Math.max(0, Number(data.money) || 0),
      day: Math.max(1, Math.min(3, data.day | 0)),
      done: [...new Set(done)],
      progress: {
        smg: !!data.progress?.smg,
        owned: { armor: !!owned.armor, shotgun: !!owned.shotgun, carbine: !!owned.carbine, cometa: !!owned.cometa },
        ending: data.progress?.ending === 'sold' || data.progress?.ending === 'loyal' ? data.progress.ending : null,
        bests: data.progress?.bests && typeof data.progress.bests === 'object' ? data.progress.bests : {},
      },
      stats: data.stats || {},
      wanted: Math.max(0, Math.min(5, data.wanted | 0)),
    };
  } catch { return null; }
}
