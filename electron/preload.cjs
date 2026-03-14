const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopMeta', {
  platform: process.platform,
  versions: process.versions
});

contextBridge.exposeInMainWorld('windowControls', {
  getState: () => ipcRenderer.invoke('desktop:get-window-state'),
  minimize: () => ipcRenderer.send('desktop:window-action', 'minimize'),
  toggleMaximize: () => ipcRenderer.send('desktop:window-action', 'toggle-maximize'),
  close: () => ipcRenderer.send('desktop:window-action', 'close')
});
