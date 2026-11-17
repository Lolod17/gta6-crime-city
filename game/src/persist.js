// Save and load through localStorage: cash, story progress, stats and the wanted level. One slot,
// written on every job passed, every 15 s of play, and from the pause menu. Versioned so a future
// format can refuse an old save instead of misreading it.
const KEY = 'sundown-puerto-ambar-save';
const VERSION = 1;

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function saveGame(state) {
  const data = {
    v: VERSION,
    savedAt: Date.now(),
    money: state.money,
    progress: { mission: state.progress.mission, smg: state.progress.smg },
    stats: state.stats,
    wanted: state.wanted.level,
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!data || data.v !== VERSION) return null;
    return {
      money: Math.max(0, Number(data.money) || 0),
      progress: { mission: Math.max(0, Math.min(3, data.progress?.mission | 0)), smg: !!data.progress?.smg },
      stats: data.stats || {},
      wanted: Math.max(0, Math.min(5, data.wanted | 0)),
    };
  } catch { return null; }
}
