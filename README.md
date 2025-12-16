# OGforge

Single-file canvas mining game (`index.html`) with autosave, plus an Electron wrapper to build a Mac `.dmg`.

## Run the game (browser)

- Open `index.html` in a browser.

## Saves / progress

- The game autosaves to `localStorage`.
- Intro screen shows **Continue Mine** if a save exists.
- Forge menu includes **Restart Mine** to wipe saves and start fresh.

## Package as a Mac app (Electron)

Prereqs: Node.js (LTS) on macOS.

- Install deps: `npm install`
- Run locally: `npm run dev`
- Build DMG + ZIP: `npm run dist:mac`
- Outputs go to `dist/`

## Build a Windows EXE (Electron)

- Build EXE installer: `npm run dist:win`
- Outputs go to `dist/`

## GitHub Releases automation

This repo includes `.github/workflows/release.yml` which will build and attach installers when you push a tag like `v1.0.0`.

## Host a download page on Render

This repo includes a separate static landing page in `download/` (it links to your GitHub Releases).

On Render, create a **Static Site**:

- **Publish directory**: `download`
- **Build command**: (leave empty)

After you create a GitHub Release and upload your `.dmg`, update `download/index.html` to point at your repo’s releases URL.
