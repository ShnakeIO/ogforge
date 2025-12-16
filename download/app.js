function detectOS() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "win";
  if (ua.includes("mac")) return "mac";
  return "other";
}

function el(id) {
  return document.getElementById(id);
}

async function exists(url) {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const localMac = "assets/OGforge-mac.dmg";
  const localWin = "assets/OGforge-win.exe";

  const btn = el("btn-download");
  const linkMac = el("link-mac");
  const linkWin = el("link-win");
  const note = el("dl-note");
  const releaseMeta = el("release-meta");
  const metaMac = el("meta-mac");
  const metaWin = el("meta-win");

  // Default to local files (served by Render from this repo).
  linkMac.href = localMac;
  linkWin.href = localWin;
  btn.href = localMac;

  if (releaseMeta) releaseMeta.textContent = "Hosted installers (no setup)";
  if (metaMac) metaMac.textContent = "Direct download";
  if (metaWin) metaWin.textContent = "Direct download";
  note.textContent = "Tip: If macOS warns, right-click → Open the first time.";

  const [hasMac, hasWin] = await Promise.all([exists(localMac), exists(localWin)]);

  if (!hasMac) {
    linkMac.href = "assets/";
    if (metaMac) metaMac.textContent = "Missing — add OGforge-mac.dmg";
  }
  if (!hasWin) {
    linkWin.href = "assets/";
    if (metaWin) metaWin.textContent = "Missing — add OGforge-win.exe";
  }

  const os = detectOS();
  if (os === "win" && hasWin) btn.href = localWin;
  if (os === "mac" && hasMac) btn.href = localMac;

  if (!hasMac && !hasWin) {
    note.textContent =
      "Installers aren’t uploaded yet. Add files to `download/assets/` in the repo, then redeploy.";
  } else if (os === "win" && !hasWin) {
    note.textContent = "Windows installer not uploaded yet.";
  } else if (os === "mac" && !hasMac) {
    note.textContent = "macOS installer not uploaded yet.";
  }
}

main();
