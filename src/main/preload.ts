import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getMatugenTheme: () => ipcRenderer.invoke('get-matugen-theme'),
  onMatugenThemeUpdated: (callback: (result: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: unknown) => callback(result);
    ipcRenderer.on('matugen-theme-updated', listener);
    return () => ipcRenderer.removeListener('matugen-theme-updated', listener);
  },
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  platform: process.platform,
});
