const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, dialog, shell } = require('electron');
app.disableHardwareAcceleration();
if (process.env.WINEPREFIX || process.env.WINELOADER) {
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');
const { createObservationStore } = require('./harness/observation-store');
const { createOrchestrator } = require('./agent/orchestrator');
const { createOpenAiClient, readLlmConfig, redactSecrets } = require('./agent/llm/openai');
const {
  hasDeviceId,
  reportAppOut,
  reportAppStart,
  reportBridgeConnectResult,
  reportFirstOpen,
  reportLlmReview,
  reportPageIn,
  reportPageOut,
  reportSuggestionImpression
} = require('./agent/telemetry/datong');
const {
  KEYS_PAGE_URL,
  COMPANY_GATEWAY_NAME,
  DEFAULT_GATEWAY_URL,
  readGatewayPreference,
  writeGatewayPreference,
  buildPreferredConfig,
  createFallbackLlm,
  preferenceFile
} = require('./agent/llm/preferred-gateway');
const { ensureMapRoutes, routeChoiceCount } = require('./agent/tasks/route');
const { decide } = require('./agent/router');
const { recordDecision } = require('./agent/recorder');
const { decorateCardGuidance, hash: guidanceHash } = require('./agent/knowledge/card-guidance');
const { CardGuidanceService, rewardGuidanceFromState } = require('./agent/knowledge/card-guidance-service');
const { encounterGuideSignature, buildEncounterGuide, shouldAutoOpenEncounterGuide } = require('./agent/tasks/encounter-guide');
const { DanmakuBridgeAdapter } = require('./agent/danmaku/bridge-adapter');
const { SharedDanmakuClient } = require('./agent/danmaku/shared-client');
const { DanmakuLlmAtmosphere } = require('./agent/danmaku/llm-atmosphere');
const { createFactReviewService } = require('./review/fact-service');
const { readRunDetails } = require('./review/run-details');
const { createRecapStore } = require('./review/recap/store');
const { makeTimeline } = require('./review/recap/facts');
const { recapFixedMetrics } = require('./review/recap/presentation');
const { localRecap } = require('./review/recap/runner');
const { fromObservedState } = require('./review/recap/snapshot');
const { createClearUploadClient, submitClearedRun } = require('./review/clear-upload-client');
const { createLeaderboardClient, projectLeaderboardRequest } = require('./review/leaderboard-client');
const { loadPlayerProfile, saveDisplayName } = require('./review/player-profile');
const { createLocalFactStore } = require('./facts/local-fact-store');
const fs = require('node:fs');
const { createComposerHost, showComposerHost, setComposerExpanded } = require('./src/danmaku-composer-window');
const { showInactiveOnce, setMousePassthrough, setBoundsIfChanged } = require('./src/danmaku-window-state');
const { guardWindowCallback } = require('./src/window-lifecycle');
const { createGatewayWindow, showGatewayWindow } = require('./src/gateway-setup-window');

const BRIDGE_URL = process.env.GAMEBUDDY_BRIDGE_URL || 'ws://127.0.0.1:27182';
const BRIDGE_MODE = process.env.GAMEBUDDY_BRIDGE_MODE === 'replay' ? 'replay' : 'game';
let mainWindow;
let reviewWindow;
let petWindow;
let danmakuWindow;
let composerWindow;
let composerExpanded = false;
let tray;
let bridgeSocket;
let bridgeReconnectTimer;
let isQuitting = false;
let petHiddenByUser = false;
let petTopmostTimer;
let danmakuTimer;
let danmakuHideTimer;
let danmakuCursorProbe;
let petDragState;
let encounterGuideKey = '';
let dismissedEncounterGuideKey = '';
let activeEncounterGuide = null;
let cachedEncounterGuide = null;
let activeCardRecommendation = null;
let activeCardExpanded = false;
const activeLlmRequests = new Map();
const completedLlmDurationByTask = new Map();
let lastAgentThinking = { thinking: false, tasks: [], model: null, startedAtByTask: {}, durationsByTask: {} };
const observationStore = createObservationStore({ staleAfterMs: 5000 });
const PET_SKINS_DIR = path.join(__dirname, 'src', 'assets', 'pets');
const PET_POSES = ['waiting', 'watching', 'thinking', 'advising'];
const DECISION_LOG_ROOT = path.join(app.getPath('userData'), 'runs');
const PET_PREFERENCES_PATH = path.join(app.getPath('userData'), 'pet-preferences.json');
const REVIEW_HISTORY_PATH = process.env.GAMEBUDDY_REVIEW_FILE || path.join(app.getPath('userData'), 'review-history.v1.json');
const FACT_REVIEW_HISTORY_PATH = process.env.GAMEBUDDY_FACT_REVIEW_FILE || path.join(app.getPath('userData'), 'review-history.v2.json');
const FACTS_ROOT_PATH = process.env.GAMEBUDDY_FACTS_DIR || path.join(app.getPath('userData'), 'facts', 'v1');
const reviewService = createFactReviewService({ filePath: FACT_REVIEW_HISTORY_PATH });
const factStore = createLocalFactStore({ rootDir: FACTS_ROOT_PATH });
const lastRecapSnapshot = new Map();
const finishedReviewRuns = new Set();
const pendingReviewRuns = new Set();
const pendingAutomaticRecaps = new Set();
let reviewRefreshTimer;
reviewService.refreshFromFacts(factStore);
let reviewClearToken = null;
const llmConfig = readLlmConfig();
const baseLlmConfig = { ...llmConfig };
const GATEWAY_PREFERENCE_PATH = preferenceFile(app.getPath('userData'));
let gatewayPreference = readGatewayPreference(GATEWAY_PREFERENCE_PATH);
let gatewayWindow;

function makeLlmClient(overrides = {}, hooks = {}) {
  const originalConfig = { ...baseLlmConfig, ...overrides };
  const original = llmConfig.enabled ? createOpenAiClient(originalConfig, hooks) : null;
  if (!gatewayPreference?.apiKey) return original;
  const preferred = createOpenAiClient(buildPreferredConfig(originalConfig, gatewayPreference), hooks);
  return createFallbackLlm(preferred, original, {
    redactKey: gatewayPreference.apiKey,
    onFallback: detail => console.warn(`GameBuddy LLM preferred gateway failed, using original: ${redactSecrets(detail, llmConfig.apiKey)}`)
  });
}
const recapStore = createRecapStore({
  directory: path.join(app.getPath('userData'), 'recap-cache.v1'),
  factStore,
  llmFactory: () => makeLlmClient({ thinking: 'disabled', temperature: 0.1, stream: false, maxTokens: 3500 }, { timeoutMs: 90_000 })
});
let rewardGuidanceInput = null;
let guidanceRunKey = null;
const cardGuidanceService = new CardGuidanceService({
  llm: makeLlmClient({ thinking: 'disabled', temperature: 0.1, maxTokens: 3000 }, { timeoutMs: 60_000, onLog: publishLlmLog }),
  onUpdate: message => {
    broadcast('bridge-card-guidance', message);
    if (message && bridgeSocket?.readyState === WebSocket.OPEN) bridgeSocket.send(JSON.stringify(message));
  },
  onLog: entry => console.info('[GameBuddy guidance]', JSON.stringify(entry))
});
function syncCardGuidance(state, readRewardSnapshot = true) {
  if (!state) return;
  const common = { runId: state.run?.runId || agentRunId, character: state.run?.character, deck: state.player?.cards || [], relics: state.player?.relics || [], decisionState:{hp:state.player?.hp,maxHp:state.player?.maxHp} };
  const runKey = `${common.runId || ''}:${common.character || ''}`;
  if (guidanceRunKey && guidanceRunKey !== runKey) { rewardGuidanceInput = null; cardGuidanceService.clear(); }
  guidanceRunKey = runKey;
  if (readRewardSnapshot) rewardGuidanceInput = rewardGuidanceFromState(state,rewardGuidanceInput);
  if (state.shop && !state.combat) {
    const candidates = (state.shop.items || []).filter(i => i.itemType === 'card' && i.stocked !== false).map(i => ({ ...i.card, id: i.id, name: i.name, stockKey: i.stockKey }));
    cardGuidanceService.update({ ...common, candidates, context: 'shop', signature: state.shop.guidanceSignature || guidanceHash([state.run?.runId, state.run?.floor, state.shop.gold, state.shop.items]) });
  } else if (rewardGuidanceInput && !state.combat) {
    cardGuidanceService.update({ ...common, ...rewardGuidanceInput });
  } else if (cardGuidanceService.current) cardGuidanceService.clear();
}
const sharedDanmakuClient = new SharedDanmakuClient();
const clearUploadClient = createClearUploadClient();
const leaderboardClient = createLeaderboardClient();
let danmakuLlm = null;
function danmakuLlmOverrides() {
  return {
    thinking: 'disabled',
    wireApi: 'chat',
    reasoningEffort: '',
    temperature: Number.isFinite(baseLlmConfig.temperature) ? baseLlmConfig.temperature : 0.9,
    maxTokens: 800
  };
}

function createDanmakuLlm(client = makeLlmClient(danmakuLlmOverrides(), { timeoutMs: 60_000, onLog: publishLlmLog })) {
  if (!client) return null;
  return new DanmakuLlmAtmosphere({
    llm: client,
    onLog: entry => console.info('[GameBuddy Danmaku]', JSON.stringify(entry))
  });
}
danmakuLlm = createDanmakuLlm();
const danmakuAdapter = new DanmakuBridgeAdapter({
  sharedClient: sharedDanmakuClient,
  llmAtmosphere: danmakuLlm
});
let llmThinkingEnabled = llmConfig.thinking !== 'disabled';
if (llmConfig.enabled) {
  console.log(`GameBuddy LLM: ${llmConfig.model} · ${llmConfig.wireApi} · ${llmConfig.source}${llmConfig.providerName ? `/${llmConfig.providerName}` : ''}${llmThinkingEnabled ? ' · thinking on' : ' · thinking off'}`);
} else {
  console.log('GameBuddy LLM: rules only');
}
if (gatewayPreference?.baseURL) console.log(`GameBuddy LLM preferred gateway: ${gatewayPreference.baseURL}`);
let orchestrator;

function refreshFactReview(runId) {
  const summary = reviewService.ingestRun(runId, factStore.getEffectiveFacts(runId), factStore.getCoverage(runId));
  if (summary) finishedReviewRuns.add(runId);
  return summary;
}

function rebuildFactReviews() {
  for (const entry of factStore.rebuildIndex().runs) refreshFactReview(entry.runId);
}

function queueFactReview(fact, stored, replay) {
  if (fact.eventType === 'run.ended') {
    finishedReviewRuns.add(fact.runId);
    if (!stored.duplicate && !replay) pendingAutomaticRecaps.add(fact.runId);
  }
  if (!finishedReviewRuns.has(fact.runId) || stored.duplicate && fact.eventType !== 'capture.gap_detected') return;
  pendingReviewRuns.add(fact.runId);
  if (reviewRefreshTimer) return;
  reviewRefreshTimer = setTimeout(() => {
    reviewRefreshTimer = undefined;
    for (const runId of pendingReviewRuns) {
      try {
        const run = refreshFactReview(runId);
        if (run && pendingAutomaticRecaps.delete(runId)) {
          void getFinishedRecap(run).catch(error => console.warn('GameBuddy automatic recap failed:', error.message));
        }
      } catch (error) { console.warn('GameBuddy review refresh failed:', error.message); }
    }
    pendingReviewRuns.clear();
    publishReviewChanged();
  }, 500);
}

async function getFinishedRecap(run) {
  const recap = await recapStore.get(run.runId, run);
  if (recap.status !== 'stale' || isQuitting || !finishedReviewRuns.has(run.runId)) return recap;
  const latestRun = reviewService.getHistory().runs.find(entry => entry.runId === run.runId);
  return latestRun ? recapStore.get(run.runId, latestRun) : recap;
}

function logLlmMode() {
  console.log(llmConfig.enabled
    ? `GameBuddy LLM: ${llmConfig.model} · ${llmConfig.wireApi}${llmThinkingEnabled ? ' · thinking on' : ' · thinking off'}`
    : 'GameBuddy LLM: rules only');
}

function rebindLlmClients() {
  cardGuidanceService.llm = makeLlmClient({ thinking: 'disabled', temperature: 0.1, maxTokens: 3000 }, { timeoutMs: 60_000, onLog: publishLlmLog });
  const danmakuClient = makeLlmClient(danmakuLlmOverrides(), { timeoutMs: 60_000, onLog: publishLlmLog });
  if (danmakuClient && !danmakuLlm) {
    danmakuLlm = createDanmakuLlm(danmakuClient);
    danmakuAdapter.llmAtmosphere = danmakuLlm;
  } else if (danmakuLlm) {
    danmakuLlm.llm = danmakuClient;
  }
  if (orchestrator) {
    orchestrator.setLlm(watchDecisionLlm(makeLlmClient(
      { thinking: llmThinkingEnabled ? 'enabled' : 'disabled' },
      { onThinkingChange: updateAgentThinking, onLog: publishLlmLog }
    )));
  }
}

function applyLlmMode() {
  rebindLlmClients();
  broadcast('bridge-llm-mode', { enabled: llmConfig.enabled || Boolean(gatewayPreference?.apiKey), thinking: llmThinkingEnabled });
  logLlmMode();
}

const DECISION_LLM_METHODS = {
  completeRoute: 'map_route',
  completeCardReward: 'card_reward',
  completeRest: 'rest_site',
  completeEvent: 'event_choice',
  completeShop: 'shop_choice'
};

function buildOrchestrator() {
  orchestrator = createOrchestrator({
    llm: watchDecisionLlm(makeLlmClient(
      { thinking: llmThinkingEnabled ? 'enabled' : 'disabled' },
      { onThinkingChange: updateAgentThinking, onLog: publishLlmLog }
    )),
    onRecommendation: recommendation => {
      const review = consumeLlmReview();
      if (review) {
        void reportLlmReview({
          userDataDir: telemetryDir(),
          featureName: review.featureName,
          result: review.result
        });
      }
      publishRecommendation(recommendation);
    },
    onAgentStatus: status => broadcast('agent-status', status)
  });
}

buildOrchestrator();

function loadPetSkins() {
  const skins = [];
  let defaultSkin = null;
  if (!fs.existsSync(PET_SKINS_DIR)) return { skins, defaultSkin };
  for (const entry of fs.readdirSync(PET_SKINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packDir = path.join(PET_SKINS_DIR, entry.name);
    const manifestPath = path.join(packDir, 'pet.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest || typeof manifest !== 'object' || manifest.renderer !== 'image' || typeof manifest.id !== 'string') continue;
      const poseConfigs = {};
      let complete = true;
      for (const pose of PET_POSES) {
        const poseConfig = manifest.poses?.[pose];
        if (!poseConfig || typeof poseConfig.image !== 'string') {
          complete = false;
          break;
        }
        const imagePath = path.resolve(packDir, poseConfig.image);
        if (!imagePath.startsWith(`${path.resolve(packDir)}${path.sep}`) && imagePath !== path.resolve(packDir)) {
          complete = false;
          break;
        }
        if (!fs.existsSync(imagePath)) {
          complete = false;
          break;
        }
        const posterPath = typeof poseConfig.poster === 'string' ? path.resolve(packDir, poseConfig.poster) : null;
        const poster = posterPath
          && posterPath.startsWith(`${path.resolve(packDir)}${path.sep}`)
          && fs.existsSync(posterPath)
          ? `./assets/pets/${entry.name}/${poseConfig.poster}`
          : null;
        poseConfigs[pose] = { image: `./assets/pets/${entry.name}/${poseConfig.image}`, poster, alt: poseConfig.alt || `${manifest.displayName || entry.name} ${pose}` };
      }
      if (!complete) continue;
      const skin = {
        id: manifest.id,
        displayName: manifest.displayName || entry.name,
        renderer: manifest.renderer,
        character: typeof manifest.character === 'string' ? manifest.character : null,
        config: { kind: manifest.renderer, basePath: '', poses: poseConfigs }
      };
      skins.push(skin);
      if (!defaultSkin || manifest.default === true) defaultSkin = skin;
    } catch {
      continue;
    }
  }
  if (!defaultSkin) defaultSkin = skins[0] || null;
  return { skins, defaultSkin };
}

const { skins: petSkins, defaultSkin: defaultPetSkin } = loadPetSkins();
const petSkinById = new Map(petSkins.map(skin => [skin.id, skin]));
const petSkinByCharacter = new Map(petSkins.filter(skin => skin.character).map(skin => [skin.character, skin]));
let petSkinMode = 'auto';
let manualPetSkinId = null;
let activePetSkin = defaultPetSkin;

function readPetPreferences() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PET_PREFERENCES_PATH, 'utf8'));
    if (parsed?.mode === 'manual' && petSkinById.has(parsed.skinId)) {
      petSkinMode = 'manual';
      manualPetSkinId = parsed.skinId;
      activePetSkin = petSkinById.get(parsed.skinId);
    }
  } catch {
    // Missing or corrupt preferences use automatic mode.
  }
}

function writePetPreferences() {
  try {
    fs.writeFileSync(PET_PREFERENCES_PATH, JSON.stringify({
      mode: petSkinMode,
      skinId: petSkinMode === 'manual' ? manualPetSkinId : null
    }), 'utf8');
  } catch {
    // Preferences are best-effort; runtime selection still works.
  }
}

function publishPetSkin() {
  petWindow?.webContents.send('bridge-pet-skin', activePetSkin);
}

function selectPetSkin(skinId, mode = 'manual') {
  if (!petSkinById.has(skinId)) return;
  petSkinMode = mode;
  manualPetSkinId = skinId;
  activePetSkin = petSkinById.get(skinId);
  writePetPreferences();
  publishPetSkin();
}

function applyCharacterSkin(character) {
  if (!character || petSkinMode === 'manual') return;
  const nextSkin = petSkinByCharacter.get(String(character).toLowerCase());
  if (!nextSkin || nextSkin.id === activePetSkin?.id) return;
  activePetSkin = nextSkin;
  publishPetSkin();
}

function setPetSkinMode(mode) {
  if (mode === 'manual' && manualPetSkinId) {
    petSkinMode = 'manual';
    activePetSkin = petSkinById.get(manualPetSkinId) || activePetSkin;
  } else {
    petSkinMode = 'auto';
    const character = observationStore.getState()?.run?.character;
    activePetSkin = (character && petSkinByCharacter.get(String(character).toLowerCase())) || defaultPetSkin;
  }
  writePetPreferences();
  publishPetSkin();
}

function withRoutableState(state) {
  if (!state?.map) return state;
  const map = ensureMapRoutes(state.map);
  if (map === state.map) return state;
  return { ...state, map };
}

function observationForAgent(observation) {
  if (!observation?.state) return observation;
  return { ...observation, state: withRoutableState(observation.state) };
}

function considerObservation(observation, options) {
  return orchestrator.consider(observationForAgent(observation), options);
}
let bridgeHealthTimer;
let lastBridgeStatus = { status: 'waiting', detail: '等待本地 Mod Bridge', url: BRIDGE_URL, mode: BRIDGE_MODE };
let bridgeResultReported = false;
let appStartedAt = Date.now();
const pageOpenedAt = {};
let pendingLlmReview = null;
let agentRunId = null;

function telemetryDir() {
  try {
    return app.getPath('userData');
  } catch {
    return undefined;
  }
}

function trackPageIn(pageId) {
  if (pageOpenedAt[pageId]) return;
  pageOpenedAt[pageId] = Date.now();
  void reportPageIn({ userDataDir: telemetryDir(), pageId });
}

function trackPageOut(pageId) {
  const openedAt = pageOpenedAt[pageId];
  if (!openedAt) return;
  delete pageOpenedAt[pageId];
  void reportPageOut({ userDataDir: telemetryDir(), pageId, stayDuration: Date.now() - openedAt });
}

function reportBridgeOnce(result) {
  if (bridgeResultReported) return;
  bridgeResultReported = true;
  void reportBridgeConnectResult({ userDataDir: telemetryDir(), result });
}

function watchDecisionLlm(client) {
  if (!client) return client;
  const wrapped = { ...client };
  for (const [method, featureName] of Object.entries(DECISION_LLM_METHODS)) {
    if (typeof client[method] !== 'function') continue;
    wrapped[method] = async (...args) => {
      try {
        const result = await client[method](...args);
        pendingLlmReview = { featureName, result: 'success' };
        return result;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        pendingLlmReview = { featureName, result: 'fallback' };
        throw error;
      }
    };
  }
  return wrapped;
}

function consumeLlmReview() {
  const review = pendingLlmReview;
  pendingLlmReview = null;
  return review;
}

function currentObservation(now = Date.now()) {
  const observation = observationStore.getObservation(now);
  return { ...observation, decision: decide(observation) };
}

function startAgentRun() {
  const state = observationStore.getState();
  agentRunId = String(state?.run?.seed || state?.run?.id || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14));
}

function recordAgentDecision(observation, decision, accepted = null) {
  if (!agentRunId || !decision) return;
  try {
    recordDecision({ runId: agentRunId, observation, decision, accepted, rootDir: DECISION_LOG_ROOT });
  } catch (error) {
    console.warn('GameBuddy decision log skipped:', error.message);
  }
}

function broadcast(channel, payload) {
  for (const window of [mainWindow, petWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function publishReviewChanged() {
  if (reviewWindow && !reviewWindow.isDestroyed()) {
    reviewWindow.webContents.send('review:changed', reviewService.getDashboard());
  }
}

function clearDanmaku() {
  danmakuAdapter.invalidate();
  clearTimeout(danmakuHideTimer);
  if (danmakuWindow && !danmakuWindow.isDestroyed()) {
    setMousePassthrough(danmakuWindow, true);
    danmakuWindow.webContents.send('bridge-danmaku-clear', danmakuAdapter.director.snapshot());
    danmakuWindow.hide();
  }
  composerExpanded = false;
  if (composerWindow && !composerWindow.isDestroyed()) {
    composerWindow.webContents.send('bridge-danmaku-clear', danmakuAdapter.director.snapshot());
    layoutComposerWindow(false);
    composerWindow.blur();
    composerWindow.hide();
  }
}

function hideDanmakuAfter() {
  clearTimeout(danmakuHideTimer);
}

function flushDanmaku() {
  let messages;
  try {
    messages = danmakuAdapter.tick();
  } catch (error) {
    // 弹幕是可选表达层，绝不能让一个异常素材影响主进程或真实 Mod 连接。
    console.warn('[GameBuddy Danmaku] skipped invalid queued message:', error.message);
    danmakuAdapter.invalidate();
    return;
  }
  if (!messages.length || !danmakuWindow || danmakuWindow.isDestroyed()) return;
  clearTimeout(danmakuHideTimer);
  showInactiveOnce(danmakuWindow);
  showComposerWindow();
  const character = observationStore.getState()?.run?.character
    || danmakuAdapter.previous?.run?.character
    || null;
  for (const message of messages) {
    danmakuWindow.webContents.send('bridge-danmaku', { ...message, character });
  }
}

async function ingestCombatDanmaku(observation) {
  if (!agentRunId || !observation?.state) return;
  const result = await danmakuAdapter.ingestObservation(observation, { runId: agentRunId });
  if (result.reason === 'closed') hideDanmakuAfter();
}

function broadcastBridgeStatus(status, detail = '') {
  if (lastBridgeStatus.status === status && lastBridgeStatus.detail === detail) return;
  lastBridgeStatus = { status, detail, url: BRIDGE_URL, mode: BRIDGE_MODE };
  if (status === 'live') reportBridgeOnce('success');
  broadcast('bridge-status', lastBridgeStatus);
}

let lastBridgeIssue;
let bridgeIssueWrite = Promise.resolve();
function reportBridgeIssue(status, detail) {
  broadcastBridgeStatus(status, detail);
  const issue = { status, detail: String(detail).slice(0, 300) };
  const signature = JSON.stringify(issue);
  if (signature === lastBridgeIssue) return;
  lastBridgeIssue = signature;
  const file = path.join(app.getPath('userData'), 'last-bridge-issue.json');
  const record = JSON.stringify({ at: new Date().toISOString(), ...issue });
  bridgeIssueWrite = bridgeIssueWrite.then(() => fs.promises.writeFile(file, record)).catch(() => {});
}

const MAX_LLM_LOG_ENTRIES = 80;
let llmLogEntries = [];

function publishLlmLog(entry) {
  llmLogEntries = [...llmLogEntries, entry].slice(-MAX_LLM_LOG_ENTRIES);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bridge-llm-log', { entries: llmLogEntries });
  }
}

function clearLlmLog() {
  llmLogEntries = [];
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bridge-llm-log', { entries: [] });
  }
}

function buildAgentThinkingState(model) {
  const requests = [...activeLlmRequests.values()];
  const startedAtByTask = {};
  for (const request of requests) {
    if (!request.task || !Number.isFinite(request.startedAt)) continue;
    startedAtByTask[request.task] = Math.min(startedAtByTask[request.task] || request.startedAt, request.startedAt);
  }
  return {
    thinking: requests.length > 0,
    tasks: [...new Set(requests.map(request => request.task).filter(Boolean))],
    model: model || requests[0]?.model || llmConfig.model || null,
    startedAtByTask,
    durationsByTask: Object.fromEntries(completedLlmDurationByTask)
  };
}

function updateAgentThinking(thinking, detail = {}) {
  const requestId = detail.requestId || detail.task || 'llm';
  if (thinking) {
    completedLlmDurationByTask.delete(detail.task);
    activeLlmRequests.set(requestId, {
      ...detail,
      startedAt: activeLlmRequests.get(requestId)?.startedAt || Date.now()
    });
  } else {
    const completed = activeLlmRequests.get(requestId);
    if (completed?.task && Number.isFinite(completed.startedAt)) {
      completedLlmDurationByTask.set(completed.task, Math.max(0, Date.now() - completed.startedAt));
    }
    activeLlmRequests.delete(requestId);
  }
  lastAgentThinking = buildAgentThinkingState(detail.model);
  broadcast('bridge-agent-thinking', lastAgentThinking);
}

function clearAgentThinking(task) {
  for (const [requestId, request] of activeLlmRequests) {
    if (!task || request.task === task) activeLlmRequests.delete(requestId);
  }
  lastAgentThinking = buildAgentThinkingState();
  broadcast('bridge-agent-thinking', lastAgentThinking);
}

function publishRecommendation(recommendation) {
  if (['card_reward', 'rest_site', 'event_choice', 'map_route', 'shop_choice'].includes(recommendation?.task)) {
    void reportSuggestionImpression({
      userDataDir: telemetryDir(),
      elementId: 'suggestion_card',
      featureName: recommendation.task,
      source: recommendation.source
    });
  }
  broadcast('bridge-recommendation', recommendation);
  if (recommendation?.task === 'card_reward' || recommendation?.task === 'rest_site' || recommendation?.task === 'event_choice' || recommendation?.task === 'map_route' || recommendation?.task === 'shop_choice') {
    activeCardRecommendation = recommendation;
    activeCardExpanded = false;
    syncPetWindowSize();
    keepPetVisible();
    petWindow?.webContents.send('bridge-card-recommendation', recommendation);
    return;
  }
  if (activeCardRecommendation && (!recommendation || recommendation.task !== activeCardRecommendation.task)) {
    clearCardRecommendation();
  }
}

function keepPetVisible() {
  if (petHiddenByUser || !petWindow || petWindow.isDestroyed()) return;
  if (!petWindow.isAlwaysOnTop()) petWindow.setAlwaysOnTop(true, 'screen-saver');
  showInactiveOnce(petWindow);
  trackPageIn('pet');
}

function resizePetWindow(mode = 'compact') {
  if (!petWindow || petWindow.isDestroyed()) return;
  const target = mode === 'guide'
    ? { width: 570, height: 520 }
    : mode === 'card-expanded'
      ? { width: 570, height: 420 }
      : { width: 320, height: 330 };
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds).workArea;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const x = Math.max(display.x, Math.min(right - target.width, display.x + display.width - target.width));
  const y = Math.max(display.y, Math.min(bottom - target.height, display.y + display.height - target.height));
  petWindow.setBounds({ x, y, ...target }, false);
}

function syncPetWindowSize() {
  resizePetWindow(activeEncounterGuide
    ? 'guide'
    : activeCardRecommendation
      ? activeCardExpanded ? 'card-expanded' : 'card'
      : 'compact');
}

function encounterGuideState() {
  return {
    available: Boolean(cachedEncounterGuide && encounterGuideKey),
    visible: Boolean(activeEncounterGuide),
    kind: cachedEncounterGuide?.kind || null,
    title: cachedEncounterGuide?.title || null
  };
}

function publishEncounterGuideState() {
  petWindow?.webContents.send('bridge-encounter-guide-state', encounterGuideState());
}

function dismissCardRecommendation() {
  clearCardRecommendation();
}

function clearCardRecommendation() {
  if (!activeCardRecommendation) return;
  activeCardRecommendation = null;
  activeCardExpanded = false;
  petWindow?.webContents.send('bridge-card-recommendation', null);
  syncPetWindowSize();
}

function setCardExpanded(expanded) {
  if (!activeCardRecommendation || activeEncounterGuide) return;
  activeCardExpanded = Boolean(expanded);
  syncPetWindowSize();
}

function handleAcceptedEvent(event) {
  if (!event) return;
  void danmakuAdapter.ingestEvent({
    name: event.name,
    eventId: `bridge-event-${event.sequence || event.timestamp || Date.now()}`,
    outcome: event.data?.outcome,
    data: event.data,
    cardName: event.data?.cardName || event.data?.card?.name
  }).catch(error => console.warn('GameBuddy danmaku event skipped:', error.message));
  const liveState = observationStore.getObservation()?.state;
  // 弹幕场景统一使用应用会话 ID；Mod runId 仅用于事实来源校验。
  const keyRunId = agentRunId || liveState?.run?.runId;
  if (keyRunId) {
    try {
      danmakuAdapter.syncKeyComponents(event, liveState, keyRunId);
    } catch (error) {
      console.warn('GameBuddy key component alert skipped:', error.message);
    }
  }
  const displayEvent = event.name === 'card.reward.opened' && Array.isArray(event.data?.cards)
    ? {
      ...event,
      data: {
        ...event.data,
        cards: decorateCardGuidance(
          liveState?.run?.character,
          liveState?.player?.cards || [],
          liveState?.player?.relics || [],
          event.data.cards,
          { hp:liveState?.player?.hp, maxHp:liveState?.player?.maxHp }
        )
      }
    }
    : event;
  broadcast('bridge-event', displayEvent);
  if (event.name === 'card.reward.opened' && event.data?.signature) rewardGuidanceInput = { context: 'reward', signature: event.data.signature, candidates: event.data.cards || [] };
  if (['card.reward.selected', 'card.reward.closed', 'map.opened', 'combat.started', 'shop.opened', 'run.started', 'run.ended'].includes(event.name)) rewardGuidanceInput = null;
  if (event.name === 'shop.closed') cardGuidanceService.clear();
  else syncCardGuidance(liveState,!['card.reward.selected','card.reward.closed','map.opened','combat.started','run.ended'].includes(event.name));
  if (event.name === 'combat.ended') {
    clearEncounterGuide();
    hideDanmakuAfter();
  }
  if (['card.reward.closed', 'map.opened', 'combat.started', 'rest.closed', 'event.closed', 'shop.closed'].includes(event.name)) {
    clearCardRecommendation();
    clearAgentThinking('card_reward');
    clearAgentThinking('shop_choice');
    if (event.name === 'rest.closed') clearAgentThinking('rest_site');
    if (event.name === 'event.closed') clearAgentThinking('event_choice');
  }
  if (event.name === 'rest.opened' && activeCardRecommendation?.task === 'card_reward') {
    clearCardRecommendation();
    clearAgentThinking('card_reward');
  }
  if (event.name === 'event.opened' && (activeCardRecommendation?.task === 'card_reward' || activeCardRecommendation?.task === 'rest_site')) {
    clearCardRecommendation();
    clearAgentThinking('card_reward');
    clearAgentThinking('rest_site');
  }
  if (event.name === 'event.opened') {
    clearAgentThinking('map_route');
  }
  if (event.name === 'shop.opened') {
    clearCardRecommendation();
    clearAgentThinking('shop_choice');
    clearAgentThinking('map_route');
    clearAgentThinking('card_reward');
    clearAgentThinking('rest_site');
    clearAgentThinking('event_choice');
  }
  if (event.name === 'card.reward.closed' || event.name === 'map.opened' || event.name === 'rest.closed' || event.name === 'event.closed' || event.name === 'shop.closed') {
    orchestrator.clearRecommendation();
  }
}

function dismissEncounterGuide() {
  if (!activeEncounterGuide) return;
  dismissedEncounterGuideKey = encounterGuideKey;
  activeEncounterGuide = null;
  petWindow?.webContents.send('bridge-encounter-guide', null);
  syncPetWindowSize();
  publishEncounterGuideState();
}

function reopenEncounterGuide() {
  if (!cachedEncounterGuide || !encounterGuideKey) {
    publishEncounterGuideState();
    return false;
  }
  dismissedEncounterGuideKey = '';
  activeEncounterGuide = cachedEncounterGuide;
  syncPetWindowSize();
  keepPetVisible();
  petWindow?.webContents.send('bridge-encounter-guide', activeEncounterGuide);
  publishEncounterGuideState();
  return activeEncounterGuide;
}

function clearEncounterGuide() {
  const hadGuide = Boolean(activeEncounterGuide || cachedEncounterGuide);
  encounterGuideKey = '';
  dismissedEncounterGuideKey = '';
  activeEncounterGuide = null;
  cachedEncounterGuide = null;
  if (hadGuide) petWindow?.webContents.send('bridge-encounter-guide', null);
  syncPetWindowSize();
  publishEncounterGuideState();
}

async function considerEncounterGuide(state) {
  const key = encounterGuideSignature(state);
  if (!key) {
    clearEncounterGuide();
    return;
  }
  if (key === encounterGuideKey || key === dismissedEncounterGuideKey) return;
  encounterGuideKey = key;
  const guide = await buildEncounterGuide(state);
  if (encounterGuideKey !== key || dismissedEncounterGuideKey === key || !guide) return;
  cachedEncounterGuide = guide;
  if (!shouldAutoOpenEncounterGuide(guide)) {
    activeEncounterGuide = null;
    syncPetWindowSize();
    petWindow?.webContents.send('bridge-encounter-guide', null);
    publishEncounterGuideState();
    return;
  }
  activeEncounterGuide = guide;
  syncPetWindowSize();
  keepPetVisible();
  petWindow?.webContents.send('bridge-encounter-guide', guide);
  void reportSuggestionImpression({
    userDataDir: telemetryDir(),
    elementId: 'encounter_guide',
    featureName: 'encounter_guide',
    source: 'rules'
  });
  publishEncounterGuideState();
}

function hidePet() {
  petHiddenByUser = true;
  petWindow?.hide();
  trackPageOut('pet');
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

function showPetContextMenu(point) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const skinItems = petSkins.map(skin => ({
    label: skin.displayName,
    type: 'radio',
    checked: petSkinMode === 'manual' && manualPetSkinId === skin.id,
    click: () => selectPetSkin(skin.id, 'manual')
  }));
  const menu = Menu.buildFromTemplate([
    { label: '个人数据', click: () => { showPersonalData(); keepPetVisible(); } },
    { label: '查看本场攻略', enabled: Boolean(cachedEncounterGuide && encounterGuideKey), click: reopenEncounterGuide },
    {
      label: `思考模式：${llmThinkingEnabled ? '开' : '关'}`,
      enabled: llmConfig.enabled || Boolean(gatewayPreference?.apiKey),
      click: () => {
        llmThinkingEnabled = !llmThinkingEnabled;
        applyLlmMode();
      }
    },
    { label: '配置密钥', click: showGatewaySetup },
    {
      label: '切换形象',
      submenu: [
        { label: '自动跟随角色', type: 'radio', checked: petSkinMode === 'auto', click: () => setPetSkinMode('auto') },
        { type: 'separator' },
        ...skinItems
      ]
    },
    { type: 'separator' },
    { label: '退出 GameBuddy', click: quitApp }
  ]);
  menu.popup({
    window: petWindow,
    x: Math.max(0, Math.round(Number(point?.x) || 0)),
    y: Math.max(0, Math.round(Number(point?.y) || 0))
  });
}

function showGatewaySetup() {
  if (gatewayWindow && !gatewayWindow.isDestroyed()) {
    showGatewayWindow(gatewayWindow);
    return;
  }
  gatewayWindow = createGatewayWindow({
    preload: path.join(__dirname, 'preload.js'),
    page: path.join(__dirname, 'src', 'gateway-setup.html'),
    isCurrent: window => !isQuitting && gatewayWindow === window
  });
  const window = gatewayWindow;
  gatewayWindow.on('closed', () => { if (gatewayWindow === window) gatewayWindow = undefined; });
}

function connectBridge() {
  if (bridgeSocket) return;
  broadcastBridgeStatus('connecting');
  const socket = new WebSocket(BRIDGE_URL);
  bridgeSocket = socket;
  let disconnected = false;
  let opened = false;

  socket.on('open', () => {
    opened = true;
    broadcastBridgeStatus('connected');
    socket.send(JSON.stringify({ type: 'request_snapshot' }));
  });

  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); }
    catch {
      reportBridgeIssue('invalid', 'Mod 消息不是有效的 JSON');
      return;
    }
    try {
      if (message?.type === 'fact') {
        const replay = BRIDGE_MODE === 'replay' || message.replay === true;
        const stored = factStore.ingest(message.data, { replay });
        if (!stored.durable) {
          if (stored.reason === 'write_failed') reportBridgeIssue('storage_error', '无法写入本地对局日志');
          else reportBridgeIssue('invalid', stored.reason || '游戏事件校验失败');
          return;
        }
        socket.send(JSON.stringify({
          type: 'fact_ack',
          sourceSessionId: message.data.sourceSessionId,
          ackSourceSeq: stored.ackSourceSeq
        }));
        queueFactReview(message.data, stored, replay);
        void danmakuAdapter.ingestFact(message.data, { replay })
          .catch(error => console.warn('GameBuddy danmaku fact skipped:', error.message));
        broadcastBridgeStatus('live');
        try {
          void submitClearedRun({
            fact: message.data,
            stored,
            replay: BRIDGE_MODE === 'replay' || message.replay === true,
            facts: () => factStore.getEffectiveFacts(message.data.runId),
            coverage: () => factStore.getCoverage(message.data.runId),
            identity: () => loadPlayerProfile(app.getPath('userData')),
            client: clearUploadClient
          }).then(result => {
            if (result && result.ok === false) console.warn('GameBuddy clear upload skipped:', result.reason || 'failed');
          }).catch(error => console.warn('GameBuddy clear upload skipped:', error.message));
        } catch (error) {
          console.warn('GameBuddy clear upload skipped:', error.message);
        }
        return;
      }
      const result = observationStore.ingest(message);
      if (result.kind === 'invalid') {
        reportBridgeIssue('invalid', result.reason);
        return;
      }
      if (result.kind === 'state' || result.kind === 'duplicate') {
        const liveState = withRoutableState(result.state || observationStore.getState());
        if (liveState) broadcastBridgeStatus('live');
      }
      if (result.kind === 'state') {
        if (result.accepted) {
          if (!agentRunId) startAgentRun();
          const observation = currentObservation();
          void ingestCombatDanmaku(observation).catch(error => console.warn('GameBuddy danmaku observation skipped:', error.message));
          const routableState = withRoutableState(observation.state);
          const recapSnapshot = fromObservedState(routableState, randomUUID());
          if (recapSnapshot) {
            const signature = JSON.stringify({ ...recapSnapshot, snapshotId: null, capturedAt: null });
            if (lastRecapSnapshot.get(recapSnapshot.runId) !== signature) {
              try {
                factStore.appendSnapshot(recapSnapshot.runId, recapSnapshot);
                lastRecapSnapshot.set(recapSnapshot.runId, signature);
              } catch (error) { console.warn('GameBuddy recap snapshot skipped:', error.message); }
            }
          }
          applyCharacterSkin(routableState?.run?.character);
          if (!routableState.combat && routeChoiceCount(routableState) <= 1) clearAgentThinking('map_route');
          recordAgentDecision({ ...observation, state: routableState }, observation.decision);
          broadcast('bridge-state', routableState);
          syncCardGuidance(routableState);
          sendHighlightRoute(observation.decision, routableState);
          void considerEncounterGuide(routableState);
          for (const event of result.derivedEvents || []) handleAcceptedEvent(event);
        }
      }
      if (result.kind === 'event' && result.accepted) {
        handleAcceptedEvent(result.event);
      }
      if (result.accepted || (result.kind === 'duplicate' && !orchestrator.getRecommendation())) {
        const observation = observationStore.getObservation();
        if (result.accepted) broadcast('bridge-observation', observation);
        const agentObservation = observationForAgent(observation);
        const reuseCardReward = result.event?.name === 'card.reward.opened'
          && orchestrator.hasPublishedFor(agentObservation);
        if (reuseCardReward) broadcast('bridge-recommendation', orchestrator.getRecommendation());
        const forceEvents = new Set(['map.opened', 'rest.opened', 'rest.closed', 'event.opened', 'event.closed', 'shop.opened', 'shop.closed', 'card.reward.opened']);
        const derivedRestClosed = (result.derivedEvents || []).some(event => event.name === 'rest.closed');
        void considerObservation(observation, {
          force: ((result.kind === 'event' && forceEvents.has(result.event?.name)) || derivedRestClosed)
            && !reuseCardReward
        });
      }
    } catch (error) {
      reportBridgeIssue('processing_error', error.message);
    }
  });

  const disconnect = detail => {
    if (disconnected) return;
    disconnected = true;
    if (bridgeSocket === socket) bridgeSocket = null;
    if (isQuitting) return;
    clearEncounterGuide();
    clearCardRecommendation();
    clearDanmaku();
    rewardGuidanceInput = null;
    cardGuidanceService.clear();
    if (opened) reportBridgeIssue('disconnected', detail);
    else broadcastBridgeStatus('waiting', '等待本地 Mod Bridge');
    clearTimeout(bridgeReconnectTimer);
    bridgeReconnectTimer = setTimeout(connectBridge, 2500);
  };
  socket.on('error', error => disconnect(`桥接连接错误（${error.code || '未知'}）`));
  socket.on('close', code => disconnect(`Mod Bridge 已断开（${code}）`));
}

function sendHighlightRoute(decision, routableState) {
  if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN) return;
  if (routeChoiceCount(routableState) <= 1) return;
  let coords = [];
  if (decision?.agent === 'route' && decision?.status === 'ready') {
    coords = Array.isArray(decision.payload?.routeCoords) ? decision.payload.routeCoords : [];
  }
  if (!coords.length && routableState?.map?.routes?.length) {
    coords = routableState.map.routes[0];
  }
  if (!Array.isArray(coords) || !coords.length) return;
  bridgeSocket.send(JSON.stringify({ type: 'highlight_map_nodes', coords }));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 930,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#111315',
    title: 'GameBuddy · 杀戮尖塔 2 AI 搭子',
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const window = mainWindow;
  const isCurrent = () => !isQuitting && mainWindow === window;
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.webContents.on('did-finish-load', guardWindowCallback(window, isCurrent, () => {
    trackPageIn('main_panel');
    mainWindow.webContents.send('bridge-status', lastBridgeStatus);
    const observation = currentObservation();
    const state = observation.state;
    if (state) mainWindow.webContents.send('bridge-state', withRoutableState(state));
    mainWindow.webContents.send('bridge-observation', observation);
    const recommendation = orchestrator.getRecommendation();
    if (recommendation) mainWindow.webContents.send('bridge-recommendation', recommendation);
    else void considerObservation(observation, { force: true });
    mainWindow.webContents.send('bridge-llm-log', { entries: llmLogEntries });
  }));
  mainWindow.on('closed', () => { if (mainWindow === window) mainWindow = undefined; });
  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      trackPageOut('main_panel');
    }
  });
}

function createReviewWindow() {
  if (reviewWindow && !reviewWindow.isDestroyed()) {
    reviewWindow.show();
    reviewWindow.focus();
    return reviewWindow;
  }

  reviewWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f5bd19',
    show: false,
    title: 'GameBuddy · 个人数据',
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const window = reviewWindow;
  const isCurrent = () => !isQuitting && reviewWindow === window;
  reviewWindow.once('ready-to-show', guardWindowCallback(window, isCurrent, () => window.show()));

  reviewWindow.loadFile(path.join(__dirname, 'src', 'review.html'));
  reviewWindow.webContents.on('did-finish-load', guardWindowCallback(window, isCurrent, publishReviewChanged));
  reviewWindow.on('closed', () => { if (reviewWindow === window) reviewWindow = undefined; });
  return reviewWindow;
}

function showPersonalData() {
  const window = createReviewWindow();
  window.show();
  window.focus();
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 320,
    height: 330,
    minWidth: 320,
    minHeight: 330,
    maxWidth: 570,
    maxHeight: 520,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const window = petWindow;
  const isCurrent = () => !isQuitting && petWindow === window;
  const { workArea } = screen.getPrimaryDisplay();
  petWindow.setPosition(workArea.x + workArea.width - 344, workArea.y + workArea.height - 358);
  petWindow.setMaximumSize(570, 520);
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.loadFile(path.join(__dirname, 'src', 'pet.html'));
  petWindow.webContents.on('did-finish-load', guardWindowCallback(window, isCurrent, () => {
    trackPageIn('pet');
    petWindow.webContents.send('bridge-status', lastBridgeStatus);
    publishPetSkin();
    const observation = currentObservation();
    const state = observation.state;
    if (state) petWindow.webContents.send('bridge-state', withRoutableState(state));
    petWindow.webContents.send('bridge-observation', observation);
    const recommendation = orchestrator.getRecommendation();
    if (recommendation) petWindow.webContents.send('bridge-recommendation', recommendation);
    petWindow.webContents.send('bridge-agent-thinking', lastAgentThinking);
    petWindow.webContents.send('bridge-danmaku-clear', danmakuAdapter.director.snapshot());
    if (activeCardRecommendation) petWindow.webContents.send('bridge-card-recommendation', activeCardRecommendation);
    if (activeEncounterGuide) {
      syncPetWindowSize();
      petWindow.webContents.send('bridge-encounter-guide', activeEncounterGuide);
    }
    publishEncounterGuideState();
  }));
  petWindow.once('ready-to-show', guardWindowCallback(window, isCurrent, () => window.showInactive()));
  petWindow.on('closed', () => { if (petWindow === window) petWindow = undefined; });
}

function syncDanmakuWindowBounds() {
  if (!danmakuWindow || danmakuWindow.isDestroyed()) return;
  setBoundsIfChanged(danmakuWindow, screen.getPrimaryDisplay().bounds);
  if (composerWindow && !composerWindow.isDestroyed() && composerWindow.isVisible()) layoutComposerWindow(composerExpanded);
}

function composerHostBounds(expanded) {
  const anchor = danmakuWindow && !danmakuWindow.isDestroyed()
    ? danmakuWindow.getBounds()
    : screen.getPrimaryDisplay().bounds;
  const area = screen.getDisplayMatching(anchor).bounds;
  const width = expanded ? 520 : 128;
  const height = expanded ? 280 : 72;
  return {
    x: Math.round(area.x + area.width - width - 18),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height
  };
}

function layoutComposerWindow(expanded) {
  if (!composerWindow || composerWindow.isDestroyed()) return;
  setBoundsIfChanged(composerWindow, composerHostBounds(expanded));
}

function raiseComposerWindow() {
  showComposerHost(composerWindow);
}

function showComposerWindow() {
  if (!composerWindow || composerWindow.isDestroyed()) return;
  if (!composerWindow.isVisible()) layoutComposerWindow(composerExpanded);
  raiseComposerWindow();
}

function createDanmakuWindow() {
  const { bounds } = screen.getPrimaryDisplay();
  danmakuWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  danmakuWindow.setAlwaysOnTop(true, 'screen-saver');
  danmakuWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setMousePassthrough(danmakuWindow, true);
  danmakuWindow.webContents.setBackgroundThrottling(false);
  const hasSeparateComposer = process.platform === 'win32' || process.platform === 'darwin';
  danmakuWindow.loadFile(path.join(__dirname, 'src', 'danmaku.html'), hasSeparateComposer
    ? { query: { surface: 'overlay', ...(process.platform === 'darwin' ? { cursorProbe: 'native' } : {}) } }
    : undefined);
  if (hasSeparateComposer) createComposerWindow();
  const window = danmakuWindow;
  const isCurrent = () => !isQuitting && danmakuWindow === window;
  danmakuWindow.webContents.on('did-finish-load', guardWindowCallback(window, isCurrent, () => {
    setMousePassthrough(danmakuWindow, true);
    danmakuWindow?.webContents.send('bridge-danmaku-clear', danmakuAdapter.director.snapshot());
  }));
  danmakuWindow.on('closed', () => { if (danmakuWindow === window) danmakuWindow = undefined; });
  startDanmakuCursorProbe();
}

function createComposerWindow() {
  if (composerWindow) return;
  composerWindow = createComposerHost({
    bounds: composerHostBounds(false),
    parent: danmakuWindow,
    preload: path.join(__dirname, 'preload.js'),
    page: path.join(__dirname, 'src', 'danmaku.html')
  });
  composerWindow.on('closed', () => { composerWindow = undefined; });
}

function startDanmakuCursorProbe() {
  // Windows 全屏游戏不会把移动事件转发给未聚焦的透明窗口，改由主进程采样光标。
  if (process.platform !== 'win32' || danmakuCursorProbe) return;
  danmakuCursorProbe = setInterval(() => {
    const overlay = danmakuWindow;
    if (!overlay || overlay.isDestroyed() || !overlay.isVisible() || overlay.webContents.isLoading()) return;
    const point = screen.getCursorScreenPoint();
    const bounds = overlay.getBounds();
    const composer = composerWindow;
    const composerBounds = composer && !composer.isDestroyed() && composer.isVisible() ? composer.getBounds() : null;
    const overComposer = composerBounds && point.x >= composerBounds.x && point.x < composerBounds.x + composerBounds.width
      && point.y >= composerBounds.y && point.y < composerBounds.y + composerBounds.height;
    if (overComposer) {
      setMousePassthrough(overlay, true);
      // 同步 renderer 的暂停/交互状态，否则离开发送窗后会保留过期的悬停状态。
      overlay.webContents.send('danmaku-cursor-probe', { x: -1, y: -1 });
      return;
    }
    overlay.webContents.send('danmaku-cursor-probe', {
      x: point.x - bounds.x,
      y: point.y - bounds.y
    });
  }, 40);
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('GameBuddy · 杀戮尖塔 2 AI 搭子');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '个人数据', click: showPersonalData },
    { label: '显示 / 隐藏桌面宠物', click: () => {
      petHiddenByUser = petWindow?.isVisible() === true;
      if (petHiddenByUser) hidePet();
      else { petHiddenByUser = false; keepPetVisible(); }
    } },
    { type: 'separator' },
    { label: '退出', click: quitApp }
  ]));
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      trackPageOut('main_panel');
    } else {
      mainWindow.show();
      trackPageIn('main_panel');
    }
  });
}

ipcMain.on('window-minimize', event => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window-close', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window === reviewWindow) window.destroy();
  else {
    window?.hide();
    if (window === petWindow) trackPageOut('pet');
    if (window === mainWindow) trackPageOut('main_panel');
  }
});

ipcMain.on('open-main-window', () => {
  showPersonalData();
  keepPetVisible();
});
ipcMain.on('toggle-pet', () => {
  petHiddenByUser = petWindow?.isVisible() === true;
  if (petHiddenByUser) hidePet();
  else { petHiddenByUser = false; keepPetVisible(); }
});
ipcMain.on('pet-pass-through', (_event, enabled) => petWindow?.setIgnoreMouseEvents(Boolean(enabled), { forward: true }));
ipcMain.on('danmaku-pointer-mode', (event, interactive) => {
  if (!danmakuWindow || danmakuWindow.isDestroyed() || event.sender !== danmakuWindow.webContents) return;
  // 只有鼠标落在飞行弹幕上时才接管输入；发送按钮在独立窗口里，不走穿透。
  setMousePassthrough(danmakuWindow, !interactive);
});
ipcMain.on('danmaku-composer-focus', (event, enabled) => {
  const host = composerWindow && event.sender === composerWindow.webContents
    ? composerWindow
    : danmakuWindow;
  if (!host || host.isDestroyed()) return;
  const focusable = Boolean(enabled);
  if (host === composerWindow) {
    composerExpanded = focusable;
    setComposerExpanded(host, focusable, composerHostBounds(focusable));
    return;
  }
  // 弹幕层默认不可聚焦，避免抢走游戏键盘；打开输入栏时临时放开。
  if (host.isFocusable() !== focusable) host.setFocusable(focusable);
  if (focusable) {
    showInactiveOnce(host);
    host.focus();
    host.webContents.focus();
  }
});
ipcMain.on('pet-context-menu', (_event, point) => showPetContextMenu(point));
ipcMain.handle('gateway-setup:load', () => ({
  apiKey: gatewayPreference?.apiKey || '',
  baseURL: gatewayPreference?.baseURL || `${DEFAULT_GATEWAY_URL}/`,
  gatewayName: COMPANY_GATEWAY_NAME
}));
ipcMain.handle('gateway-setup:save', (_event, payload) => {
  const saved = writeGatewayPreference(GATEWAY_PREFERENCE_PATH, payload);
  if (!saved.ok) return saved;
  gatewayPreference = saved.preference;
  rebindLlmClients();
  console.log(`GameBuddy LLM preferred gateway: ${gatewayPreference.baseURL}`);
  gatewayWindow?.close();
  return { ok: true };
});
ipcMain.on('gateway-setup:cancel', () => gatewayWindow?.close());
ipcMain.on('gateway-setup:open-keys', () => {
  shell.openExternal(KEYS_PAGE_URL).catch(error => console.warn('GameBuddy key page failed:', error.message));
});
ipcMain.on('toggle-llm-thinking', () => {
  llmThinkingEnabled = !llmThinkingEnabled;
  applyLlmMode();
});
ipcMain.on('select-pet-skin', (_event, skinId) => selectPetSkin(skinId, 'manual'));
ipcMain.on('set-pet-skin-mode', (_event, mode) => setPetSkinMode(mode));
ipcMain.on('pet-drag-start', (_event, point) => {
  if (!petWindow || petWindow.isDestroyed() || !point) return;
  const [x, y] = petWindow.getPosition();
  petDragState = { startX: Number(point.x), startY: Number(point.y), windowX: x, windowY: y };
});
ipcMain.on('pet-drag-move', (_event, point) => {
  if (!petDragState || !petWindow || petWindow.isDestroyed() || !point) return;
  const x = petDragState.windowX + Number(point.x) - petDragState.startX;
  const y = petDragState.windowY + Number(point.y) - petDragState.startY;
  petWindow.setPosition(Math.round(x), Math.round(y), false);
});
ipcMain.on('pet-drag-end', () => { petDragState = undefined; });
ipcMain.on('dismiss-encounter-guide', dismissEncounterGuide);
ipcMain.handle('reopen-encounter-guide', reopenEncounterGuide);
ipcMain.on('dismiss-card-recommendation', dismissCardRecommendation);
ipcMain.on('set-card-expanded', (_event, expanded) => setCardExpanded(expanded));
ipcMain.on('accept-decision', (_event, decision) => {
  recordAgentDecision(currentObservation(), decision, true);
});
ipcMain.on('clear-llm-log', () => clearLlmLog());
ipcMain.handle('get-observation', () => currentObservation());
ipcMain.handle('review:listLeaderboard', (_event, input) => (
  leaderboardClient.list(projectLeaderboardRequest(input))
));
ipcMain.handle('review:getDashboard', () => reviewService.getDashboard());
ipcMain.handle('review:getRunDetails', (_event, runId) => readRunDetails(runId, reviewService.getHistory(), factStore));
ipcMain.handle('review:getRunMetrics', (_event, runId) => {
  const run = typeof runId === 'string' && reviewService.getHistory().runs.find(entry => entry.runId === runId);
  if (!run) return [];
  const timeline = makeTimeline(runId, factStore.getEffectiveFacts(runId), factStore.getCoverage(runId));
  return recapFixedMetrics(timeline, run);
});
ipcMain.handle('review:getRunRecapPreview', (_event, runId) => {
  const run = typeof runId === 'string' && reviewService.getHistory().runs.find(run => run.runId === runId);
  if (!run) return null;
  const timeline = makeTimeline(runId, factStore.getEffectiveFacts(runId), factStore.getCoverage(runId), factStore.getSnapshots(runId));
  return playerRecap(localRecap(timeline, run));
});
ipcMain.handle('review:getRunRecap', async (_event, runId) => {
  const run = typeof runId === 'string' && reviewService.getHistory().runs.find(run => run.runId === runId);
  if (!run) {
    return { status: 'unavailable', fixedMetrics: [], cards: [], closing: '' };
  }
  return playerRecap(await getFinishedRecap(run));
});
function playerRecap(recap) {
  const published = recap.status === 'ready';
  return { status: recap.status, fixedMetrics: recap.fixedMetrics, battleMetrics: recap.battleMetrics,
    runSummary: recap.runSummary, choiceStats: recap.choiceStats, portrait: published ? recap.portrait : '',
    cards: published ? recap.cards.map(card => ({ title: card.title, body: card.body })) : [],
    closing: published ? recap.closing : '', coverageNote: recap.coverageNote };
}
ipcMain.handle('review:getPlayerProfile', () => {
  const profile = loadPlayerProfile(app.getPath('userData'));
  return { displayName: profile.displayName };
});
ipcMain.handle('review:savePlayerProfile', (_event, displayName) => {
  const profile = saveDisplayName(app.getPath('userData'), displayName);
  return { displayName: profile.displayName };
});
ipcMain.handle('review:export', async () => {
  const result = await dialog.showSaveDialog(reviewWindow, {
    title: '导出 GameBuddy 本地复盘',
    defaultPath: `gamebuddy-review-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, `${JSON.stringify(reviewService.exportData(), null, 2)}\n`, 'utf8');
  return { ok: true };
});
ipcMain.handle('review:requestClear', () => {
  reviewClearToken = randomUUID();
  return reviewClearToken;
});
ipcMain.handle('review:clear', (_event, token) => {
  if (!reviewClearToken || token !== reviewClearToken) return { ok: false, reason: 'invalid_confirmation' };
  reviewClearToken = null;
  const dashboard = reviewService.clear();
  factStore.clearAll();
  lastRecapSnapshot.clear();
  finishedReviewRuns.clear();
  pendingReviewRuns.clear();
  pendingAutomaticRecaps.clear();
  clearTimeout(reviewRefreshTimer);
  reviewRefreshTimer = undefined;
  recapStore.clear();
  publishReviewChanged();
  return { ok: true, dashboard };
});
ipcMain.handle('get-shared-danmaku-context', () => danmakuAdapter.getSharedScene());
ipcMain.on('danmaku-presented', (event, id) => {
  if (event.sender !== danmakuWindow?.webContents || typeof id !== 'string') return;
  if (danmakuAdapter.director.acknowledgePresented(id)) {
    console.info('[GameBuddy Danmaku] presentation', JSON.stringify(danmakuAdapter.director.presentationStats()));
  }
});
ipcMain.handle('get-danmaku-stats', () => danmakuAdapter.director.presentationStats());
ipcMain.handle('submit-shared-danmaku', async (_event, payload = {}) => (
  danmakuAdapter.submitShared(payload.text, { echoDelayMs: 3000 })
));
ipcMain.handle('refresh-recommendation', async () => {
  if (bridgeSocket?.readyState === WebSocket.OPEN) {
    bridgeSocket.send(JSON.stringify({ type: 'request_snapshot' }));
  }
  const observation = currentObservation();
  if (observation?.state) broadcast('bridge-state', withRoutableState(observation.state));
  const recommendation = await considerObservation(observation, { force: true, reason: 'refresh' });
  if (recommendation) broadcast('bridge-recommendation', recommendation);
  return { ok: Boolean(recommendation), recommendation };
});

app.whenReady().then(() => {
  appStartedAt = Date.now();
  const userDataDir = app.getPath('userData');
  const firstOpen = !hasDeviceId(userDataDir);
  void reportAppStart({ userDataDir }).then(() => {
    if (firstOpen) return reportFirstOpen({ userDataDir });
    return null;
  });
  rebuildFactReviews();
  readPetPreferences();
  applyCharacterSkin(observationStore.getState()?.run?.character);
  createPetWindow();
  createDanmakuWindow();
  createTray();
  connectBridge();
  petTopmostTimer = setInterval(keepPetVisible, 1000);
  danmakuTimer = setInterval(flushDanmaku, 100);
  bridgeHealthTimer = setInterval(() => {
    if (lastBridgeStatus.status === 'live' && !observationStore.getObservation().fresh) {
      broadcastBridgeStatus('stale', '已连接，但超过 5 秒没有新的游戏状态');
    }
  }, 1000);
  screen.on('display-metrics-changed', syncDanmakuWindowBounds);
  screen.on('display-added', syncDanmakuWindowBounds);
  screen.on('display-removed', syncDanmakuWindowBounds);
  app.on('activate', () => {
    showPersonalData();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  trackPageOut('pet');
  trackPageOut('main_panel');
  if (!bridgeResultReported) reportBridgeOnce('fail');
  void reportAppOut({ userDataDir: telemetryDir(), stayDuration: Math.max(0, Date.now() - appStartedAt) });
  reviewService.flush();
  factStore.flush();
  clearTimeout(bridgeReconnectTimer);
  clearTimeout(reviewRefreshTimer);
  clearTimeout(danmakuHideTimer);
  clearInterval(bridgeHealthTimer);
  clearInterval(petTopmostTimer);
  clearInterval(danmakuTimer);
  clearInterval(danmakuCursorProbe);
  bridgeSocket?.close();
});
app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') app.quit();
});
