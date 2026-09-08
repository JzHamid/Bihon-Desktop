const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bihon', {
  setupInfo: () => ipcRenderer.invoke('bihon:setup-info'),
  downloadsInfo: () => ipcRenderer.invoke('bihon:downloads-info'),
  chooseDownloads: () => ipcRenderer.invoke('bihon:choose-downloads'),
  openDownloads: () => ipcRenderer.invoke('bihon:open-downloads'),
  appInfo: () => ipcRenderer.invoke('bihon:app-info'),
  openLicenses: () => ipcRenderer.invoke('bihon:open-licenses'),
  books: {
    list: () => ipcRenderer.invoke('bihon:books-list'),
    import: () => ipcRenderer.invoke('bihon:books-import'),
    finalize: (id, metadata) => ipcRenderer.invoke('bihon:books-finalize', id, metadata),
    saveProgress: (id, progress) => ipcRenderer.invoke('bihon:books-progress', id, progress),
    remove: id => ipcRenderer.invoke('bihon:books-remove', id),
  },
  catalogs: {
    list: () => ipcRenderer.invoke('bihon:catalogs-list'),
    add: input => ipcRenderer.invoke('bihon:catalogs-add', input),
    remove: id => ipcRenderer.invoke('bihon:catalogs-remove', id),
    fetch: (id, url) => ipcRenderer.invoke('bihon:catalogs-fetch', id, url),
    cover: (id, url) => ipcRenderer.invoke('bihon:catalogs-cover', id, url),
    acquire: (id, url) => ipcRenderer.invoke('bihon:catalogs-acquire', id, url),
  },
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
