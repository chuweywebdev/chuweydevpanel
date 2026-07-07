const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_INVOKE = ['get-version', 'check-for-updates', 'download-update', 'quit-and-install'];
const ALLOWED_ON = ['server-status', 'update-available', 'checking-for-update', 'update-not-available', 'update-downloaded', 'update-error', 'update-download-progress'];

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome
  },
  invoke(channel, ...args) {
    if (ALLOWED_INVOKE.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error('IPC invoke denied: ' + channel));
  },
  on(channel, callback) {
    if (ALLOWED_ON.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  removeListener(channel, callback) {
    if (ALLOWED_ON.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  }
});
