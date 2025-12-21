# OGforge (desktop + download site)

- Render static site is served from `download/` (see `render.yaml`).
- Latest version + download URLs live in `download/version.json`.
- The desktop app checks `https://raw.githubusercontent.com/ShnakeIO/ogforge/main/download/version.json` (with a Render fallback) on launch and periodically, and prompts in-game to download the new `.dmg`/`.exe`.
