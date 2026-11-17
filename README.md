# SUNDOWN: Puerto Ámbar

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Lolod17/gta6-crime-city/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Lolod17/gta6-crime-city/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the browser: a sun-soaked coastal city to drive and walk,
cars to steal, a five-star wanted system with pursuit, ramming cruisers, cops on foot and a
helicopter, gunfights, and a twelve-mission story over three days for Inés Ocampo, Dario Kell and
Nando Reyes against the rival Teo Castellan.

![cover](screenshots/1-cover-dash.jpg)

## Play

    node serve.ts        # then open http://localhost:8080 in desktop Chrome

Static files only (`game/`), no build step, no network requests, no libraries.

| Keys | |
|---|---|
| W A S D | drive / walk |
| Space | handbrake drift |
| F | steal / enter / exit a car |
| Mouse | aim, click to shoot (also from the car) |
| Q | switch weapon · Shift sprint · H horn |
| Enter | take a job at a yellow marker |
| M | mute / unmute the radio |
| Esc | pause, save |

## The story

Twelve missions across three days (`game/src/missions.js`), plus replayable side jobs. The HUD
shows the mission label with its place in the list (`MISSION 4/12 — THE DASH — 50s`, counted from
the list at runtime), the objective and the distance to it, the day and clock (`DAY 1 18:24`), a
banner with a tagline on entering each of nine districts, the cast speaking in short lines, and
the radio station and track (cycling every 30 s, M mutes). From four stars a PAPD helicopter
follows with a searchlight; after 19:00 the city sinks into dusk and the streetlamps come on.

## Source

`game/src/`: `main.js` loop and state machine · `config.js` every tunable · `city.js` seeded city ·
`render.js` drawing and effects · `camera.js` · `player.js` · `vehicle.js` car physics ·
`traffic.js` cars and pedestrians · `police.js` wanted level and pursuit · `missions.js` story ·
`hud.js` HUD and minimap · `districts.js` district names and taglines · `radio.js` stations · `audio.js` WebAudio synthesis · `persist.js` save/load.

Hand-in: `MAKEFUN_OUTPUT_DIR=out node main.ts`. Decisions are recorded in [NOTES.md](NOTES.md).
License: MIT.
