const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  openMain: () => ipcRenderer.send('open-main-window'),
  togglePet: () => ipcRenderer.send('toggle-pet'),
  setPetPassThrough: enabled => ipcRenderer.send('pet-pass-through', enabled)
});

contextBridge.exposeInMainWorld('runmateBridge', {
  onState: callback => ipcRenderer.on('bridge-state', (_event, state) => callback(state)),
  onEvent: callback => ipcRenderer.on('bridge-event', (_event, event) => callback(event)),
  onStatus: callback => ipcRenderer.on('bridge-status', (_event, status) => callback(status)),
  onObservation: callback => ipcRenderer.on('bridge-observation', (_event, observation) => callback(observation)),
  getObservation: () => ipcRenderer.invoke('get-observation'),
  acceptDecision: decision => ipcRenderer.send('accept-decision', decision)
});
