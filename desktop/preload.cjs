const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bihon', {
  downloadsInfo: () => ipcRenderer.invoke('bihon:downloads-info'),
  chooseDownloads: () => ipcRenderer.invoke('bihon:choose-downloads'),
  openDownloads: () => ipcRenderer.invoke('bihon:open-downloads'),
  onProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('bihon:progress', listener);
    return () => ipcRenderer.removeListener('bihon:progress', listener);
  },
});
