function detectOS() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "win";
  if (ua.includes("mac")) return "mac";
  return "other";
}

function el(id) {
  return document.getElementById(id);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : unit === 1 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

async function loadLatestRelease(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return await res.json();
}

function pickAsset(assets, predicate) {
  for (const a of assets || []) if (predicate(a)) return a;
  return null;
}

function main() {
  const paramRepo = new URLSearchParams(window.location.search).get("repo");
  const repo = (paramRepo || document.body.dataset.repo || "").trim();
  const releaseUrl = repo ? `https://github.com/${repo}/releases/latest` : "#";

  const btn = el("btn-download");
  const linkMac = el("link-mac");
  const linkWin = el("link-win");
  const linkRelease = el("link-release");
  const note = el("dl-note");
  const releaseMeta = el("release-meta");
  const metaMac = el("meta-mac");
  const metaWin = el("meta-win");

  linkRelease.href = repo ? releaseUrl : "#";

  // Fallbacks (work even without GitHub API)
  linkMac.href = repo ? releaseUrl : "#";
  linkWin.href = repo ? releaseUrl : "#";
  btn.href = repo ? releaseUrl : "#";
  note.textContent = "Tip: If macOS warns, right-click → Open the first time.";
  if (releaseMeta) releaseMeta.textContent = "Latest release: —";
  if (metaMac) metaMac.textContent = "Opens GitHub Releases";
  if (metaWin) metaWin.textContent = "Opens GitHub Releases";

  if (!repo || repo.includes("YOUR_GITHUB_USER")) {
    note.textContent =
      "Set your repo in `download/index.html` (data-repo) or add `?repo=YOUR_USER/YOUR_REPO` to the URL.";
    return;
  }

  loadLatestRelease(repo)
    .then((rel) => {
      const assets = rel.assets || [];
      const dmg = pickAsset(assets, (a) => a.name && a.name.endsWith(".dmg"));
      const exe = pickAsset(assets, (a) => a.name && a.name.endsWith(".exe"));

      if (dmg) linkMac.href = dmg.browser_download_url;
      if (exe) linkWin.href = exe.browser_download_url;

      const tag = rel.tag_name || "latest";
      if (releaseMeta) releaseMeta.textContent = `Latest release: ${tag}`;

      if (metaMac) {
        metaMac.textContent = dmg
          ? `${formatBytes(dmg.size)} • updated ${new Date(dmg.updated_at).toLocaleDateString()}`
          : "DMG not found in latest release";
      }
      if (metaWin) {
        metaWin.textContent = exe
          ? `${formatBytes(exe.size)} • updated ${new Date(exe.updated_at).toLocaleDateString()}`
          : "EXE not found in latest release";
      }

      const os = detectOS();
      if (os === "mac" && dmg) {
        btn.href = dmg.browser_download_url;
        note.textContent = `Recommended for your device: macOS (${dmg.name}).`;
      } else if (os === "win" && exe) {
        btn.href = exe.browser_download_url;
        note.textContent = `Recommended for your device: Windows (${exe.name}).`;
      } else {
        btn.href = releaseUrl;
        note.textContent = "Choose Mac or Windows above (or open all releases).";
      }
    })
    .catch(() => {
      note.textContent = "Couldn’t auto-detect latest release. Use the links above.";
    });
}

main();
