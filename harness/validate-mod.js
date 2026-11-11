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
  'Scripts/GameBuddyExporter.cs',
  'Scripts/GameBuddyRewardCandidateSelector.cs',
  'Scripts/GameBuddyRewardSelectionTracker.cs',
  'Scripts/CardRemovalPatches.cs'
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing Mod file: ${relative}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'GameBuddyBridge.json'), 'utf8'));
if (manifest.id !== 'gamebuddy_bridge' || manifest.has_dll !== true || manifest.has_pck !== false) {
  throw new Error('GameBuddyBridge manifest is inconsistent with a DLL-only read-only Mod');
}

const exporter = fs.readFileSync(path.join(root, 'Scripts', 'GameBuddyExporter.cs'), 'utf8');
const exporterAndPatches = exporter
  + fs.readFileSync(path.join(root, 'Scripts', 'CardRewardPatches.cs'), 'utf8')
  + fs.readFileSync(path.join(root, 'Scripts', 'CardRemovalPatches.cs'), 'utf8');
for (const marker of ['127.0.0.1', '27182', 'gamebuddy.state.v1', 'DebugOnlyGetState', 'LocalContext.GetMe', 'NextMove', 'BroadcastState', 'BroadcastEvent', 'GameBuddyWebSocketServer', 'GetAllMapPoints', 'MapPointType', 'rest.opened', 'rest.closed', 'NCardRewardSelectionScreen', 'TrackCardRewardScreen', 'ClearCardRewardScreen', 'card.reward.opened', 'card.reward.selected', 'RewardSelectionTracker', 'EventRoom', 'NEventRoom', 'NEventOptionButton', 'event.opened', 'event.closed', 'MerchantRoom', 'MerchantInventory', 'CardEntries', 'RelicEntries', 'PotionEntries', 'shop.opened', 'shop.updated', 'shop.closed', 'CARD_REMOVAL', 'EventId', 'PageId', 'OptionId', 'display text as the compatibility path', 'RewardSelectionTracker.Observe(', 'DynamicDescription', 'DescriptionSource', 'EnergyCostX', 'StarCost', 'StarCostX', 'StarCostSource', 'Optional cost metadata can move between early-access patches', 'FromDeckForRemoval', 'BeginCardRemoval', 'EndCardRemoval', 'IsRemovable', 'card.removal.opened', 'card.removal.closed', 'NDeckCardSelectScreen']) {
  if (!exporterAndPatches.includes(marker)) throw new Error(`Mod exporter is missing marker: ${marker}`);
}

const rewardOverlay = fs.readFileSync(path.join(root, 'Scripts', 'GameBuddyRewardOverlay.cs'), 'utf8');
for (const marker of ['GameBuddyRewardCandidateSelector.Resolve', 'Context.Accepts', 'GameBuddyCardGuidanceCodec.TryParse', 'DistanceSquaredTo', 'holder?.Hitbox', 'holder?.CardNode', 'ContainsPointer(x.Visual!)', 'candidateKeys.Distinct']) {
  if (!rewardOverlay.includes(marker)) throw new Error(`Reward overlay is missing candidate marker: ${marker}`);
}
if (!exporter.includes('BuildRewardSnapshot()') || !exporter.includes('RewardSnapshot? Reward = null')) throw new Error('Active reward must survive reconnect through snapshots');
if (rewardOverlay.includes('Grow(24')) {
  throw new Error('Reward overlay must not use expanded overlapping rectangles for candidate detection');
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
