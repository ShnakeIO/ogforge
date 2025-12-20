# OGforge (desktop + download site)

- Render static site is served from `download/` (see `render.yaml`).
- Latest version + download URLs live in `download/version.json`.
- The desktop app checks `https://forge-iye0.onrender.com/version.json` on launch and periodically, and prompts in-game to download the new `.dmg`/`.exe`.
