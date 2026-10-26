# ElonDash 🚀⚡

A high-octane 3D Tesla Roadster endless runner web game with live telemetry leaderboard, pilot callsign registration, and Elon Musk-inspired cyberpunk aesthetic.

## Features
- **ElonDash Live Leaderboard**: Real-time ranking with gold, silver, bronze cyber badges, and unified **Distance (`m`) & Score (`pts`)** telemetries combined in each row.
- **Fresh Board**: Starts completely empty until you launch your maiden run and post records.
- **Pilot Telemetry Registration**: Prompts the player for their Callsign before every race launch (via button or Space key) with an ultra-clean cyber launch button.
- **Automatic Telemetry Sync**: When a run concludes on Game Over, the pilot's final score and distance are automatically recorded to the persistent leaderboard and saved in `localStorage` and `leaderboard.json`.
- **Frictionless Cyberpunk UI**:
  - Locked viewport (no accidental page scrolling on home menu).
  - Cleaned minimalist footer: Contains only the centered "About the game" link.
  - Removed login system, external friend invites, and driving history clutter for pure arcade speed.

## Controls
- **Change Lanes**: `←` / `→` or `A` / `D`
- **Jump**: `↑` / `Space` or `W`
- **Air Slam / Dive**: `↓` or `S`
- **Boost / Thrusters**: `Shift`
- **Item Power-up**: `Z` or touch button
- **Pause**: `P`
- **Mute / Sound**: `M`

## Running Locally

```bash
npm start
```
or
```bash
node server.js
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure
- `index.html`: Main game structure with Three.js stage, HUD, Live Leaderboard panel, and Callsign modal.
- `server.js`: Zero-dependency Node.js HTTP server providing static hosting, local geo-mocking, and persistent `/api/leaderboard` API.
- `leaderboard.json`: Persistent JSON storage for live records (starts clean).
- `assets/live-leaderboard.css`: Styles for the Live Leaderboard, zero-scroll lock, and Callsign prompt modal.
- `assets/live-leaderboard.js`: Client controller managing live scores, unified metric rendering, and pre-race pilot prompts.
- `assets/game-2AB5qqqU.js`: Core Three.js procedural game engine with pre-race pilot prompt and game-over score hooks.
- `assets/game-jCuEpiW3.css`: Base game design system stylesheet.
