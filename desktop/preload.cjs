const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bihon', {
  setupInfo: () => ipcRenderer.invoke('bihon:setup-info'),
  downloadsInfo: () => ipcRenderer.invoke('bihon:downloads-info'),
  chooseDownloads: () => ipcRenderer.invoke('bihon:choose-downloads'),
  openDownloads: () => ipcRenderer.invoke('bihon:open-downloads'),
  onProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('bihon:progress', listener);
    return () => ipcRenderer.removeListener('bihon:progress', listener);
  },
});

ipcRenderer.on('bihon:reader-zoom', (_event, action) => {
  if (['in', 'out', 'reset'].includes(action)) window.dispatchEvent(new CustomEvent('bihon:reader-zoom', { detail: action }));
});
ipcRenderer.on('bihon:extensions-ready', () => window.dispatchEvent(new Event('bihon:extensions-ready')));
