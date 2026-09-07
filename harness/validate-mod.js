const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'mod', 'GameBuddyBridge');
const requiredFiles = [
  'GameBuddyBridge.csproj',
  'GameBuddyBridge.json',
  'README.md',
  'build.ps1',
  'Scripts/Entry.cs',
  'Scripts/GameBuddyCollectorNode.cs',
  'Scripts/GameBuddyExporter.cs'
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing Mod file: ${relative}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'GameBuddyBridge.json'), 'utf8'));
if (manifest.id !== 'gamebuddy_bridge' || manifest.has_dll !== true || manifest.has_pck !== false) {
  throw new Error('GameBuddyBridge manifest is inconsistent with a DLL-only read-only Mod');
}

const exporter = fs.readFileSync(path.join(root, 'Scripts', 'GameBuddyExporter.cs'), 'utf8');
for (const marker of ['127.0.0.1', '27182', 'gamebuddy.state.v1', 'DebugOnlyGetState', 'LocalContext.GetMe', 'AttackIntent', 'BroadcastState', 'BroadcastEvent', 'GameBuddyWebSocketServer', 'GetAllMapPoints', 'MapPointType', 'rest.opened']) {
  if (!exporter.includes(marker)) throw new Error(`Mod exporter is missing marker: ${marker}`);
}

const project = fs.readFileSync(path.join(root, 'GameBuddyBridge.csproj'), 'utf8');
if (!project.includes(`<AssemblyName>${manifest.id}</AssemblyName>`)) {
  throw new Error('Mod assembly name must match manifest id so the STS2 loader can find the DLL');
}

const buildScript = fs.readFileSync(path.join(root, 'build.ps1'), 'utf8');
for (const marker of ['STS2_DIR', 'Sts2Dir', 'CopyModAfterBuild', 'dotnet --list-sdks']) {
  if (!buildScript.includes(marker)) throw new Error(`Mod build script is missing marker: ${marker}`);
}

console.log(`Mod shape valid: ${root}`);
console.log(`Required files: ${requiredFiles.length}`);
