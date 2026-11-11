const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  openMain: () => ipcRenderer.send('open-main-window'),
  togglePet: () => ipcRenderer.send('toggle-pet'),
  showPetMenu: point => ipcRenderer.send('pet-context-menu', point),
  toggleLlmThinking: () => ipcRenderer.send('toggle-llm-thinking'),
  selectPetSkin: skinId => ipcRenderer.send('select-pet-skin', skinId),
  setPetSkinMode: mode => ipcRenderer.send('set-pet-skin-mode', mode),
  setPetPassThrough: enabled => ipcRenderer.send('pet-pass-through', enabled),
  startPetDrag: point => ipcRenderer.send('pet-drag-start', point),
  movePet: point => ipcRenderer.send('pet-drag-move', point),
  endPetDrag: () => ipcRenderer.send('pet-drag-end'),
  dismissEncounterGuide: () => ipcRenderer.send('dismiss-encounter-guide'),
  reopenEncounterGuide: () => ipcRenderer.invoke('reopen-encounter-guide'),
  dismissCardRecommendation: () => ipcRenderer.send('dismiss-card-recommendation'),
  setCardExpanded: expanded => ipcRenderer.send('set-card-expanded', Boolean(expanded))
});

contextBridge.exposeInMainWorld('gatewaySetup', {
  load: () => ipcRenderer.invoke('gateway-setup:load'),
  save: payload => ipcRenderer.invoke('gateway-setup:save', payload),
  cancel: () => ipcRenderer.send('gateway-setup:cancel'),
  openKeysPage: () => ipcRenderer.send('gateway-setup:open-keys')
});

contextBridge.exposeInMainWorld('gamebuddyBridge', {
  onState: callback => ipcRenderer.on('bridge-state', (_event, state) => callback(state)),
  onEvent: callback => ipcRenderer.on('bridge-event', (_event, event) => callback(event)),
  onCardGuidance: callback => ipcRenderer.on('bridge-card-guidance', (_event, message) => callback(message)),
  onArchetypeMilestone: callback => ipcRenderer.on('bridge-archetype-milestone', (_event, milestone) => callback(milestone)),
  onStatus: callback => ipcRenderer.on('bridge-status', (_event, status) => callback(status)),
  onObservation: callback => ipcRenderer.on('bridge-observation', (_event, observation) => callback(observation)),
  onRecommendation: callback => ipcRenderer.on('bridge-recommendation', (_event, recommendation) => callback(recommendation)),
  onAgentStatus: callback => ipcRenderer.on('agent-status', (_event, status) => callback(status)),
  onEncounterGuide: callback => ipcRenderer.on('bridge-encounter-guide', (_event, guide) => callback(guide)),
  onEncounterGuideState: callback => ipcRenderer.on('bridge-encounter-guide-state', (_event, state) => callback(state)),
  onCardRecommendation: callback => ipcRenderer.on('bridge-card-recommendation', (_event, recommendation) => callback(recommendation)),
  onAgentThinking: callback => ipcRenderer.on('bridge-agent-thinking', (_event, state) => callback(state)),
  onLlmMode: callback => ipcRenderer.on('bridge-llm-mode', (_event, mode) => callback(mode)),
  onPetSkin: callback => ipcRenderer.on('bridge-pet-skin', (_event, skin) => callback(skin)),
  onLlmLog: callback => ipcRenderer.on('bridge-llm-log', (_event, payload) => callback(payload)),
  onDanmaku: callback => ipcRenderer.on('bridge-danmaku', (_event, message) => callback(message)),
  onDanmakuClear: callback => ipcRenderer.on('bridge-danmaku-clear', (_event, state) => callback(state)),
  acknowledgeDanmakuPresented: id => ipcRenderer.send('danmaku-presented', id),
  getDanmakuStats: () => ipcRenderer.invoke('get-danmaku-stats'),
  setDanmakuPointerMode: interactive => ipcRenderer.send('danmaku-pointer-mode', Boolean(interactive)),
  onDanmakuCursorProbe: callback => ipcRenderer.on('danmaku-cursor-probe', (_event, point) => callback(point)),
  setDanmakuComposerFocus: enabled => ipcRenderer.send('danmaku-composer-focus', Boolean(enabled)),
  clearLlmLog: () => ipcRenderer.send('clear-llm-log'),
  getObservation: () => ipcRenderer.invoke('get-observation'),
  getReviewDashboard: () => ipcRenderer.invoke('review:getDashboard'),
  getRunRecapPreview: runId => ipcRenderer.invoke('review:getRunRecapPreview', runId),
  getRunRecap: runId => ipcRenderer.invoke('review:getRunRecap', runId),
  getRunMetrics: runId => ipcRenderer.invoke('review:getRunMetrics', runId),
  getRunDetails: runId => ipcRenderer.invoke('review:getRunDetails', runId),
  getPlayerProfile: () => ipcRenderer.invoke('review:getPlayerProfile'),
  savePlayerProfile: displayName => ipcRenderer.invoke('review:savePlayerProfile', displayName),
  onReviewChanged: callback => ipcRenderer.on('review:changed', (_event, dashboard) => callback(dashboard)),
  exportReview: () => ipcRenderer.invoke('review:export'),
  requestReviewClear: () => ipcRenderer.invoke('review:requestClear'),
  clearReview: token => ipcRenderer.invoke('review:clear', token),
  listLeaderboard: filters => ipcRenderer.invoke('review:listLeaderboard', {
    character: filters?.character,
    ascension: filters?.ascension,
    gameMode: filters?.gameMode
  }),
  getSharedDanmakuContext: () => ipcRenderer.invoke('get-shared-danmaku-context'),
  submitSharedDanmaku: text => ipcRenderer.invoke('submit-shared-danmaku', { text }),
  refreshRecommendation: () => ipcRenderer.invoke('refresh-recommendation'),
  acceptDecision: decision => ipcRenderer.send('accept-decision', decision)
});
