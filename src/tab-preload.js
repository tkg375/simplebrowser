const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'file:' && location.pathname.endsWith('/history.html')) {
  contextBridge.exposeInMainWorld('historyAPI', {
    get: () => ipcRenderer.invoke('history:get'),
    clear: () => ipcRenderer.invoke('history:clear'),
    open: (url) => ipcRenderer.invoke('history:open', url),
    onUpdated: (callback) => ipcRenderer.on('history:updated', callback),
  });
}
