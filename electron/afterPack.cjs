const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function findAppBundle(appOutDir) {
  const entries = fs.readdirSync(appOutDir, { withFileTypes: true });
  const apps = entries.filter((e) => e.isDirectory() && e.name.endsWith('.app')).map((e) => path.join(appOutDir, e.name));
  if (apps.length === 1) return apps[0];
  if (apps.length > 1) {
    const og = apps.find((p) => path.basename(p).toLowerCase().includes('ogforge'));
    return og || apps[0];
  }
  return null;
}

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') return;
  const appPath = findAppBundle(context.appOutDir);
  if (!appPath) return;

  // Ensure the bundled app doesn't carry Electron's broken adhoc signature (causes "is damaged").
  run('codesign', ['--force', '--deep', '--sign', '-', appPath]);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
};

