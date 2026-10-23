// Pulse for PC: an Electron window around the same web app the Android build uses.
const { app, BrowserWindow, dialog, shell } = require('electron')
const path = require('node:path')
const { startServer } = require('./server.cjs')

// Must match the Redirect URI added in the Spotify dashboard: http://127.0.0.1:5173/
const PORT = 5173
const ORIGIN = `http://127.0.0.1:${PORT}`

if (!app.requestSingleInstanceLock()) app.quit()

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Pulse',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|spotify):/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (staysInWindow(url)) return
    e.preventDefault()
    if (/^(https?|spotify):/.test(url)) shell.openExternal(url)
  })

  win.loadURL(ORIGIN + '/')
}

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.whenReady().then(async () => {
  try {
    await startServer(path.join(__dirname, '..', 'dist'), PORT)
  } catch (e) {
    dialog.showErrorBox(
      'Pulse',
      `Port ${PORT} is already in use, so Pulse can't start.\nClose whatever is using it (like "npm run dev") and try again.\n\n${e.message}`,
    )
    app.quit()
    return
  }
  createWindow()
})

app.on('window-all-closed', () => app.quit())
