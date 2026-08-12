const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'mod', 'RunmateBridge');
const requiredFiles = [
  'RunmateBridge.csproj',
  'RunmateBridge.json',
  'README.md',
  'Scripts/Entry.cs',
  'Scripts/RunmateCollectorNode.cs',
  'Scripts/RunmateExporter.cs'
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing Mod file: ${relative}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'RunmateBridge.json'), 'utf8'));
if (manifest.id !== 'runmate_bridge' || manifest.has_dll !== true || manifest.has_pck !== false) {
  throw new Error('RunmateBridge manifest is inconsistent with a DLL-only read-only Mod');
}

const exporter = fs.readFileSync(path.join(root, 'Scripts', 'RunmateExporter.cs'), 'utf8');
for (const marker of ['127.0.0.1', '27182', 'runmate.state.v1', 'DebugOnlyGetState', 'LocalContext.GetMe', 'AttackIntent', 'BroadcastState', 'BroadcastEvent', 'RunmateWebSocketServer']) {
  if (!exporter.includes(marker)) throw new Error(`Mod exporter is missing marker: ${marker}`);
}

console.log(`Mod shape valid: ${root}`);
console.log(`Required files: ${requiredFiles.length}`);
