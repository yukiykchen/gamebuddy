const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const scriptPath = path.join(root, 'scripts', 'start-live.ps1');
const script = fs.readFileSync(scriptPath, 'utf8');

for (const marker of [
  'Sts2Dir',
  'GameExe',
  'SkipBuild',
  'NoDesktop',
  'Resolve-Sts2Directory',
  'Resolve-GameExecutable',
  'Test-BridgePortAvailable',
  'gamebuddy_bridge.dll',
  'GameBuddyBridge.json',
  'build.ps1',
  'npm start',
  'Start-Process -FilePath $gameExecutable',
  '不会自动结束进程'
]) {
  if (!script.includes(marker)) throw new Error(`Live launch script is missing marker: ${marker}`);
}

const buildIndex = script.indexOf("& (Join-Path $repoRoot 'mod\\GameBuddyBridge\\build.ps1')");
const desktopIndex = script.indexOf("Start-Process -FilePath 'powershell.exe'");
const gameIndex = script.indexOf('Start-Process -FilePath $gameExecutable');
if (!(buildIndex >= 0 && desktopIndex > buildIndex && gameIndex > desktopIndex)) {
  throw new Error('Live launch must build the Mod, then start GameBuddy, then start the game.');
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!packageJson.scripts['live:win']?.includes('scripts\\start-live.ps1')) {
  throw new Error('Missing npm live:win entry point.');
}

console.log('Live launch shape valid.');
