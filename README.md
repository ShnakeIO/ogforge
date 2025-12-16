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

This repo includes a separate static landing page in `download/`.

On Render, create a **Static Site**:

- **Publish directory**: `download`
- **Build command**: (leave empty)

### Option A (what the download page uses now): host installers in the repo

Put your built installers here and commit them:

- `download/assets/OGforge-mac.dmg`
- `download/assets/OGforge-win.exe`

Render will serve them directly, and the download page will link to them.

Important: if the macOS app says “damaged” on open, you need Apple notarization (below) or macOS will block it for most players.

### Option B (recommended if files are too big): GitHub Releases

When you push a tag like `v1.0.0`, GitHub Actions will build installers and attach them to a GitHub Release.

## macOS signing + notarization (so it opens normally)

Unsigned Electron apps are often blocked by Gatekeeper with “is damaged and can’t be opened”.
This repo supports Developer ID signing + notarization in `.github/workflows/release.yml` and `electron/notarize.js`.

Add these GitHub repo secrets:

- `MAC_CERTIFICATE_P12_BASE64`: base64 of your Developer ID Application `.p12`
- `MAC_CERTIFICATE_PASSWORD`: password for that `.p12`
- `APPLE_ID`: your Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD`: an app-specific password for that Apple ID
- `APPLE_TEAM_ID`: your Apple Developer Team ID
