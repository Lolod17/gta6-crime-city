# NOTES — decisions taken while building (no questions asked, conservative choices)

- **Original setting.** The game is *SUNDOWN: Puerto Ámbar*: an invented coastal city, the PAPD,
  Inés Ocampo, Dario Kell, Rio, the Glasshand crew, Paint & Pray, Radio Sol 98.7 and the theme
  "Sundown Drive". No name, character, logo, map, art or music from any commercial game. The
  repository name was given; the game itself never uses it.
- **Top-down 2D canvas with fake 3D**, no library: buildings are extruded from a camera-centred
  perspective, shadows are baked into pre-rendered 1080 px ground chunks. Measured frame work in
  headless Chrome: ~1 ms simulation + ~2–3 ms render, well under the 16.7 ms budget.
- **Density governor**: when frame *work* exceeds 20 ms for a run of frames, traffic and pedestrian
  density drops (floor 40%) before any feature is cut; it recovers after 10 s of fast frames.
- **City**: seed 1977, 60×60 tiles of 72 px, roads every 6 tiles, downtown towers, commercial ring,
  residential blocks with pools, one park with a pond, a marina, beach with boardwalk, piers, boats.
- **Feel numbers** live in `game/src/config.js`. Car 0→top in 2.5 s, brakes to stop in 1.2 s,
  steering 3.6 rad/s slow → 2.3 rad/s at top speed (raised from 1.55 after play-testing: the
  turning circle was wider than a block). Camera lerp 0.12, look-ahead 0.32 s, zoom 0.9–1.18.
  Shake 120 ms, off under `prefers-reduced-motion`. Notices show for 1.5 s.
- **Wanted level** uses rising heat thresholds (100/260/480/760/1100). Play-testing showed linear
  thresholds snowballed to five stars from scrapes; road accidents now count less than shootings,
  ramming a cruiser counts at most every 2 s, pedestrians dive away from a speeding car.
- **Escape**: while unseen, reinforcements head to the last-known position (not ahead of the
  player), and evade time is 6 s + 1.5 s per star. Paint & Pray resprays for $250.
- **Heat job** pins the level at exactly three stars for the 60 s (the brief's wording).
- **Score job** escape starts at three stars (four made it near-impossible in testing); it can
  escalate to the helicopter.
- **Failing** a job (timer, death, arrest) returns the player to that job's start marker with a car.
- **Save**: localStorage, one slot, written on each job passed, every 15 s, and from the pause menu.
- **Testing**: Playwright drove the game with real key presses and mouse clicks (an autodriver
  reading the car's position each 30 ms). All three jobs were completed that way. For the robot only,
  test scripts topped up car/player health so its frequent crashes didn't end runs early; the game
  code has no cheats.
- **Screenshots**: captured last at 1280×720 from Chrome while playing (the Heat and Score jobs
  were reached by loading a save through the title screen's CONTINUE). JPEG straight from the
  browser, unedited.
- `window.__sundown` exposes the state object for that test harness; it is read-only in play.

## Pass 3 — the HUD layers

- **Original strings only.** The two entries ranked above us show "SOL FM" and "PALMLINE BEACH —
  Sun, sand and bad decisions"; an earlier draft had copied both. The station is now RADIO SOL
  98.7 (the game's own Radio Sol) and that district is VISTA CORAL with its own line.
- **District banners** fire on entering a zone (city.js `worldToZone`), for 4 s; the same zone does
  not re-banner within 15 s, so walking back and forth over a boundary doesn't spam it.
- **Clock** runs one game minute per second of play and resets to 18:24 at the start of each story
  day, so the day number follows the mission arc. From 19:00 a violet multiply grade deepens over
  two game hours and sodium lamps light every junction: cosmetic only, the simulation never reads it.
- **Dialogue** lines are 3–6 words; the longer day-opening and ending lines were cut down. Timed
  stages can carry `cues` (spoken once at N seconds left); THE DASH and HEAT give Teo a voice mid-run.
- **Mission label** reads the index and total from `state.missionDefs` at runtime; the seconds show
  only while the current stage has a timer.
- **Screenshots** were taken by a sampler that only saves a frame when every layer the scene needs
  is visible at once (tools outside the repo). The robot's car health was topped up during the
  chase takes; the frames themselves are unedited JPEGs from Chrome.

## Pass 4: recorded playthrough, one job per file

- **Playthrough.** Each of the twelve missions was started and played with real input: a save with
  the earlier missions done, a real click on CONTINUE, W/A/S/D driving to the yellow marker, Enter,
  then keys and mouse clicks for the objective. Results per mission are in `../PLAYLOG.md` (outside
  the repo, with the test tools). As in earlier passes, the robot's car and body health were topped
  up because it crashes far more than a person does. FRAGILE and THE AURELIA were the exception: car
  damage is their objective, so they ran with no top-up.
- **What blocked missions, and the fixes:**
  - STREET RACE. Teo's AI held 30% throttle while braking, and `vehicle.js` ignores the brake while
    any throttle is held. He reached the first corner at full speed, wedged against the houses, and
    scraped there until his car was wrecked, so the race was never contested. He now lifts off to
    brake, and brakes from the real stopping distance (v² = v₀² + 2·a·d). He finishes the lap in
    about 36 s, at 94% of his car's top speed.
  - PROTECTION. Nando spawned on the marker, under the car the player had just arrived in, and
    started at 25% health. He now waits on the pavement, clear of the car and off the road. The
    clinic shootout no longer draws PAPD heat from gunfire, as with the warehouse and docks fights;
    before, witness calls stacked four stars and the crossfire killed him.
  - THE TAIL. The accountant spawned 47 m from the player, so suspicion built before the player
    could move. He now starts about 330 m ahead, in view. Suspicion cannot build during the opening
    grace, which went from 4 s to 9 s.
  - THREE DROPS. At up to five stars, a single scrape snowballed and the clock always ran out. The
    wanted level is now pinned at 1–2 stars and the collection timer went from 160 s to 200 s.
  - Escape stages (THE WAREHOUSE, MUELLE CINCO, THE LEDGER sold). These now mark Paint & Pray: a
    respray ends the stage, the same way out free roam already offers. Before, a chase that had
    climbed to five stars could go on for minutes.
  - COLLECTION and THE AURELIA. The wanted level is capped at 2, below the star at which cruisers
    shoot. Before, the first mission became a five-star manhunt and rammed cars failed the bodywork
    objective. MUELLE CINCO hands over Inés's vest before the seven-gun ambush.
- **Source outline.** Every file under `game/src/` opens with a `JOB:` line (its one job) and an
  `EXPORTS:` line. Logic that lived in the wrong file moved into the file named for it:
  - Clock code was spread over `main.js`, `story.js`, `hud.js` and `render.js`. It now lives in
    the new `clock.js`.
  - The key hint moved from `main.js` to `hud.js` (`hintLine`).
  - THE TAIL's lane-car spawner moved from `missions.js` to `traffic.js` (`spawnLaneCar`).
  - `seatPlayer` moved from `missions.js` to `player.js`.
  - Two unused re-exports (`CAR` from `police.js`, `say` from `jobs.js`) are gone.

## Pass 5: render and city split into focused modules

- **Moved, not rewritten.** `render.js` (842 lines) and `city.js` (414) were split by copying line
  ranges across unchanged. The new files are `render/draw.js`, `render/world.js`,
  `render/entities.js`, `render/fx.js`, `city/roads.js`, `city/blocks.js` and `city/collide.js`.
  `render.js` and `city.js` stay as the public entries with the same exports, so no caller changed.
  `renderFrame` was one 260-line function. Each of its commented passes became a named function
  with the same body, and they are called in the original order. The tile-grid loop in `buildCity`
  became `layTiles(city)`, called from the same spot.
- **Two modules the brief did not name.** The effect emitters (particles, decals, floating text,
  shake) are neither primitives, scenery nor entities, so they went to `render/fx.js`. The collision
  and line-of-sight queries are neither block generation nor the road grid, so they went to
  `city/collide.js`. The HUD was already its own file (`hud.js`), so it was left as it is.
- **How sameness was checked.** `buildCity` from the old and new code gives identical JSON for
  seeds 1977, 1 and 42, and `isBlocked`, `lineOfSight`, `worldToZone` and `nearestNode` agree on
  3,000 sample points. The old and new `renderFrame` drew the same live game state onto two canvases
  with 0 differing bytes: a street with particles and decals, the helicopter with its searchlight,
  dusk at 21:04 with the streetlamps, and bullets, markers and floating text.
- **Screenshots** were retaken on this build with the pass-4 sampler: real keyboard and mouse input,
  and a frame is kept only when every layer the scene needs is on screen. Unedited JPEGs from Chrome.
