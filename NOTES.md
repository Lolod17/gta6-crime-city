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
