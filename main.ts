// SUNDOWN: Puerto Ámbar — the make.fun gta6-01 entry program (Node 22, standard library only).
// The game itself is game/: static files (index.html plus ES modules under game/src) that a desktop
// browser opens offline, with no library, no build step and no network request.
// This program hands it in: it copies game/ and screenshots/ to the output directory and writes
// dossier.json there with buildDossier from the kit's vendored make.fun library, unchanged.
// Before copying it checks that every frame shots.json describes exists; after, it prints one summary line.
//
// Play locally:  node serve.ts   then open http://localhost:8080
// Hand in:       mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

// shots.json describes each screenshot; refuse to hand in a description of a frame that is not there
const shots: { name: string }[] = existsSync(join(here, 'shots.json')) ? JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8')) : [];
for (const s of shots) {
  if (!existsSync(join(here, 'screenshots', s.name))) throw new Error(`shots.json names ${s.name}, which is not in screenshots/`);
}
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's caps (reference/gate.json). text_max_bytes shapes the dossier text; the others make
// buildDossier refuse an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB,
// more than 993 entries or 48 MiB under game/, or a game/ path longer than 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// one line for the person running the hand-in: what went out, and how big
const countFiles = (dir: string): { files: number; bytes: number } => {
  let files = 0, bytes = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const c = countFiles(p); files += c.files; bytes += c.bytes; } else { files += 1; bytes += statSync(p).size; }
  }
  return { files, bytes };
};
const g = countFiles(join(out, 'game'));
const shotsOut = readdirSync(join(out, 'screenshots'));
console.log(`handed in: game/ ${g.files} files (${(g.bytes / 1024).toFixed(0)} KiB), ${shotsOut.length} screenshots, dossier.json ${(statSync(join(out, 'dossier.json')).size / 1024).toFixed(0)} KiB -> ${out}`);
