function detectOS() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "win";
  if (ua.includes("mac")) return "mac";
  return "other";
}

function el(id) {
  return document.getElementById(id);
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

  linkRelease.href = repo ? releaseUrl : "#";

  // Fallbacks (work even without GitHub API)
  linkMac.href = repo ? releaseUrl : "#";
  linkWin.href = repo ? releaseUrl : "#";
  btn.href = repo ? releaseUrl : "#";
  note.textContent = "Tip: If macOS warns, right-click → Open the first time.";

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

      const os = detectOS();
      if (os === "mac" && dmg) {
        btn.href = dmg.browser_download_url;
        note.textContent = `Downloading ${dmg.name}`;
      } else if (os === "win" && exe) {
        btn.href = exe.browser_download_url;
        note.textContent = `Downloading ${exe.name}`;
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
