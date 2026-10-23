// Pulse for PC: an Electron window around the same web app the Android build uses,
// plus a tray icon, global hotkeys, an always-on-top mini window and Discord status.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, dialog, shell } = require('electron')
const path = require('node:path')
const { startServer } = require('./server.cjs')
const { DiscordPresence } = require('./discord.cjs')

// Must match the Redirect URI added in the Spotify dashboard: http://127.0.0.1:5173/
const PORT = 5173
const ORIGIN = `http://127.0.0.1:${PORT}`

if (!app.requestSingleInstanceLock()) app.quit()

let win = null
let mini = null
let tray = null
let nowPlaying = null
const discord = new DiscordPresence()

// The app itself and the Spotify login pages (incl. "Continue with Google/
// Facebook/Apple") stay in the window; everything else (like spotify: links)
// goes to the system.
const LOGIN_HOSTS = ['spotify.com', 'google.com', 'facebook.com', 'apple.com']
const staysInWindow = (url) => {
  if (url.startsWith(ORIGIN + '/')) return true
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && LOGIN_HOSTS.some((d) => u.hostname === d || u.hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

function guardNavigation(w) {
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|spotify):/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e, url) => {
    if (staysInWindow(url)) return
    e.preventDefault()
    if (/^(https?|spotify):/.test(url)) shell.openExternal(url)
  })
}

const webPreferences = { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') }

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Pulse',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences,
  })
  guardNavigation(win)
  win.loadURL(ORIGIN + '/')
  win.on('closed', () => {
    win = null
    mini?.close()
  })
}

function showMain() {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function openMini() {
  if (mini) return mini.focus()
  const area = screen.getPrimaryDisplay().workArea
  const W = 380
  const H = 92
  mini = new BrowserWindow({
    width: W,
    height: H,
    x: area.x + area.width - W - 16,
    y: area.y + area.height - H - 16,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#111111',
    title: 'Pulse mini',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences,
  })
  mini.setAlwaysOnTop(true, 'floating')
  guardNavigation(mini)
  mini.loadURL(ORIGIN + '/#mini')
  mini.on('closed', () => (mini = null))
}

// Commands run in the main window, which owns the Spotify login.
function command(cmd) {
  win?.webContents.send('pulse:command', cmd)
}

function buildTray() {
  const label = nowPlaying?.title ? `${nowPlaying.title} · ${nowPlaying.artist}` : 'Nothing playing'
  tray.setToolTip(('Pulse · ' + label).slice(0, 127))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: label.slice(0, 60), enabled: false },
      { type: 'separator' },
      { label: nowPlaying?.isPlaying ? 'Pause' : 'Play', click: () => command('playpause') },
      { label: 'Next', click: () => command('next') },
      { label: 'Previous', click: () => command('previous') },
      { label: nowPlaying?.liked ? 'Unlike' : 'Like', click: () => command('like') },
      { type: 'separator' },
      { label: 'Mini window', click: openMini },
      { label: 'Show Pulse', click: showMain },
      { label: 'Quit', click: () => app.quit() },
    ]),
  )
}

const HOTKEYS = {
  'CommandOrControl+Alt+Space': 'playpause',
  'CommandOrControl+Alt+Right': 'next',
  'CommandOrControl+Alt+Left': 'previous',
  'CommandOrControl+Alt+L': 'like',
}
function setHotkeys(on) {
  globalShortcut.unregisterAll()
  if (!on) return
  for (const [accel, cmd] of Object.entries(HOTKEYS)) {
    try {
      globalShortcut.register(accel, () => command(cmd))
    } catch {}
  }
}

ipcMain.on('pulse:nowPlaying', (e, info) => {
  if (e.sender !== win?.webContents) return
  nowPlaying = info
  if (tray) buildTray()
  discord.update(info)
})
ipcMain.on('pulse:configure', (e, opts) => {
  if (e.sender !== win?.webContents) return
  setHotkeys(opts?.hotkeys !== false)
  discord.configure({ enabled: opts?.discordEnabled, appId: String(opts?.discordAppId ?? '').trim() })
})
ipcMain.on('pulse:openExternal', (e, url) => {
  if (e.sender === win?.webContents && /^https:\/\/accounts\.spotify\.com\//.test(url)) shell.openExternal(url)
})
ipcMain.on('pulse:openMini', openMini)
ipcMain.on('pulse:closeMini', () => mini?.close())

app.on('second-instance', showMain)

app.whenReady().then(async () => {
  try {
    await startServer(path.join(__dirname, '..', 'dist'), PORT, {
      onLogin: (url) => {
        showMain()
        win?.webContents.send('pulse:authCallback', url)
      },
    })
  } catch (e) {
    dialog.showErrorBox(
      'Pulse',
      `Port ${PORT} is already in use, so Pulse can't start.\nClose whatever is using it (like "npm run dev") and try again.\n\n${e.message}`,
    )
    app.quit()
    return
  }
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')))
  tray.on('click', showMain)
  buildTray()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  discord.disconnect()
})
