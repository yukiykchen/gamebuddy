const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  openMain: () => ipcRenderer.send('open-main-window'),
  togglePet: () => ipcRenderer.send('toggle-pet'),
  showPetMenu: point => ipcRenderer.send('pet-context-menu', point),
  setPetPassThrough: enabled => ipcRenderer.send('pet-pass-through', enabled),
  startPetDrag: point => ipcRenderer.send('pet-drag-start', point),
  movePet: point => ipcRenderer.send('pet-drag-move', point),
  endPetDrag: () => ipcRenderer.send('pet-drag-end'),
  dismissEncounterGuide: () => ipcRenderer.send('dismiss-encounter-guide')
});

contextBridge.exposeInMainWorld('gamebuddyBridge', {
  onState: callback => ipcRenderer.on('bridge-state', (_event, state) => callback(state)),
  onEvent: callback => ipcRenderer.on('bridge-event', (_event, event) => callback(event)),
  onStatus: callback => ipcRenderer.on('bridge-status', (_event, status) => callback(status)),
  onObservation: callback => ipcRenderer.on('bridge-observation', (_event, observation) => callback(observation)),
  onRecommendation: callback => ipcRenderer.on('bridge-recommendation', (_event, recommendation) => callback(recommendation)),
  onAgentStatus: callback => ipcRenderer.on('agent-status', (_event, status) => callback(status)),
  onEncounterGuide: callback => ipcRenderer.on('bridge-encounter-guide', (_event, guide) => callback(guide)),
  getObservation: () => ipcRenderer.invoke('get-observation'),
  refreshRecommendation: () => ipcRenderer.invoke('refresh-recommendation'),
  acceptDecision: decision => ipcRenderer.send('accept-decision', decision)
});
