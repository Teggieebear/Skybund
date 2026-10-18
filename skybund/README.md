# Skybund

Skybund is a browser-only Three.js sky adventure made for Start.ng. Jump between floating islands, collect gems, avoid obstacles, and submit your best sky score to the Start.ng leaderboard.

## Files for Start.ng

The files needed to run the game are at the repository root:

- `index.html` — ready-to-play static entry point
- `game.js` — Three.js scene, game rules, and controls
- `startng.js` — Start.ng identity, sign-in, score, and leaderboard messaging
- `styles.css` — responsive interface
- `startng.json` — the Sky score and Gems collected leaderboard columns
- `cover.png` — 16:10 game cover

Start.ng serves static files and does not run an install or build step. Keep all game paths relative and include these files at the top level of the public GitHub repository.

## Play and controls

- Desktop: use A/D or the left/right arrow keys to steer; press Space, W, or Up to jump.
- Mobile: use the on-screen left, right, and jump controls.
- Avoid the floating obstacles, land on islands, and collect the glowing gems.
- A fall ends the run. Restart to try again.

## Start.ng identity and leaderboard

The game asks the official `https://start.ng/connect` frame for the current player using `postMessage` and validates both the message origin and frame source. It uses the returned Start.ng character style for the in-game explorer. It never handles passwords or email addresses. A guest can play and is offered Start.ng sign-in; an offline or local preview remains playable without pretending to have a Start.ng identity.

The leaderboard is declared in `startng.json`. Signed-in runs submit integer `score` and `gems` values through Start.ng's documented `startng:score` message. The public leaderboard uses `startng:leaderboard`.

## Local preview

Run the Replit web preview, or serve this folder over HTTP with a static file server. ES modules and the browser's cross-origin rules mean opening `index.html` directly as a `file://` URL may not load the Three.js module. Identity, score submission, and the shared leaderboard require the game to be live at a `*.start.ng` address.

## Validate a public repository

After you have pushed the files to a public GitHub repository, Start.ng's documented check endpoint can validate that repository without publishing it:

```sh
curl -X POST https://api.start.ng/games/check \
  -H 'Content-Type: application/json' \
  -d '{"repo_url":"https://github.com/YOUR-NAME/YOUR-REPO","name":"skybund"}'
```

The check endpoint downloads a public repository; it cannot validate an unpushed local folder. No repository is created or pushed as part of this project.

See the current official rules at <https://start.ng/docs.md>.
