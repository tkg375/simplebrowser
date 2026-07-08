const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browser', {
  newTab: (url) => ipcRenderer.invoke('tabs:new', url),
  closeTab: (id) => ipcRenderer.invoke('tabs:close', id),
  activateTab: (id) => ipcRenderer.invoke('tabs:activate', id),
  go: (input) => ipcRenderer.invoke('nav:go', input),
  back: () => ipcRenderer.invoke('nav:back'),
  forward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  stop: () => ipcRenderer.invoke('nav:stop'),
  onState: (callback) => ipcRenderer.on('tabs:state', (_e, state) => callback(state)),
  onUpdateStatus: (callback) => ipcRenderer.on('update:status', (_e, status) => callback(status)),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  onWindowState: (callback) => ipcRenderer.on('window:state', (_e, state) => callback(state)),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  openHistory: () => ipcRenderer.invoke('tabs:openHistory'),
  setMenuOpen: (expanded) => ipcRenderer.invoke('menu:setOpen', expanded),
});
