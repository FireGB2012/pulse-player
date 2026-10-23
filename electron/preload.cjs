// Bridge between the Pulse web app and the PC app (tray, hotkeys, mini window, Discord).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pulseDesktop', {
  platform: process.platform,
  // { title, artist, album, artUrl, isPlaying, liked, progressMs, durationMs, trackUrl }
  nowPlaying: (info) => ipcRenderer.send('pulse:nowPlaying', info),
  // { hotkeys, discordEnabled, discordAppId }
  configure: (opts) => ipcRenderer.send('pulse:configure', opts),
  openMini: () => ipcRenderer.send('pulse:openMini'),
  closeMini: () => ipcRenderer.send('pulse:closeMini'),
  // cmd: 'playpause' | 'next' | 'previous' | 'like'
  onCommand: (fn) => ipcRenderer.on('pulse:command', (_e, cmd) => fn(cmd)),
})
