import './styles.css'
import { App as CapApp } from '@capacitor/app'
import { h, icon, iconBtn, toast, pickImage, artistNames } from './core/ui.js'
import * as themes from './core/themes.js'
import * as auth from './core/auth.js'
import * as player from './core/player.js'
import * as plugins from './core/plugins.js'
import { renderLogin } from './views/login.js'
import { renderLibrary, renderCollection } from './views/library.js'
import { renderSearch } from './views/search.js'
import { renderSettings } from './views/settings.js'
import { createNowPlaying } from './views/nowplaying.js'
import { openDevices, noDeviceSheet } from './views/devices.js'

const app = document.getElementById('app')
themes.applyTheme()

let started = false
let loginError = null

async function boot() {
  await auth.restoreClientId()
  await auth.initAuth({
    onLogin: () => startApp(),
    onError: (e) => {
      loginError = e.message
      if (!started) renderLogin(app, { error: loginError })
      else toast(e.message)
    },
  })
  if (!started) {
    if (auth.isLoggedIn()) startApp()
    else renderLogin(app, { error: loginError })
  }
}

function startApp() {
  if (started) return
  started = true

  const view = h('main', { class: 'view' })
  const nav = h('nav', { class: 'tabs' })
  const np = createNowPlaying()

  // ---------- routing ----------
  const stack = []
  let current = { name: 'library' }
  const ctx = {
    go(name, params = {}) {
      if (name === 'collection') stack.push(current)
      else stack.length = 0
      current = { name, params }
      draw()
    },
    back() {
      current = stack.pop() ?? { name: 'library' }
      draw()
    },
  }

  function draw() {
    view.scrollTop = 0
    if (current.name === 'library') renderLibrary(view, ctx)
    else if (current.name === 'search') renderSearch(view, ctx)
    else if (current.name === 'settings') renderSettings(view)
    else if (current.name === 'collection') renderCollection(view, current.params, ctx)
    drawNav()
  }

  function drawNav() {
    const base = current.name === 'collection' ? 'library' : current.name
    nav.replaceChildren(
      ...[
        ['library', 'Library', 'library'],
        ['search', 'Search', 'search'],
        ['settings', 'Settings', 'settings'],
      ].map(([id, label, ic]) =>
        h('button', { class: base === id ? 'on' : '', onClick: () => ctx.go(id) }, icon(ic, 24), h('span', {}, label)),
      ),
    )
  }

  // ---------- mini player ----------
  const mArt = h('img', { class: 'art sm', alt: '' })
  const mTitle = h('div', { class: 't' })
  const mArtist = h('div', { class: 's' })
  const mPlay = h('button', { class: 'ibtn', 'aria-label': 'Play or pause', onClick: (e) => (e.stopPropagation(), player.toggle()) })
  const mBar = h('div', { class: 'mini-bar' }, h('i', {}))
  const mini = h(
    'div',
    { class: 'mini', onClick: () => np.open() },
    mArt,
    h('div', { class: 'meta' }, mTitle, mArtist),
    mPlay,
    mBar,
  )
  mini.style.display = 'none'

  let lastArt = ''
  player.on('state', (s) => {
    const t = s.track
    mini.style.display = t ? '' : 'none'
    if (!t) return
    mTitle.textContent = t.name
    mArtist.textContent = artistNames(t)
    const url = pickImage(t.album?.images, 64)
    if (url !== lastArt) {
      lastArt = url
      mArt.src = url
    }
    mPlay.replaceChildren(icon(s.isPlaying ? 'pause' : 'play', 28))
  })
  player.on('progress', (ms, dur) => {
    mBar.firstChild.style.width = (dur ? (ms / dur) * 100 : 0) + '%'
  })
  player.on('track', (t) => themes.tintFromImage(pickImage(t?.album?.images, 64)))

  // ---------- errors (throttled so polling can't spam) ----------
  const seen = new Map()
  player.on('error', (e) => {
    if (e.message === 'Not logged in') return location.reload()
    const now = Date.now()
    if (now - (seen.get(e.message) ?? 0) < 15000) return
    seen.set(e.message, now)
    if (e.status === 401) return toast('Session expired. Log out and connect again.')
    if (e.status === 403) return toast('Spotify said no (403): ' + e.message)
    toast(e.message)
  })
  let noDevOpen = false
  player.on('no-device', () => {
    if (noDevOpen) return
    noDevOpen = true
    noDeviceSheet()
    setTimeout(() => (noDevOpen = false), 4000)
  })

  // ---------- shell ----------
  const topbar = h('header', { class: 'topbar' }, h('div', { class: 'brand' }, 'Pulse'), iconBtn('devices', { title: 'Devices', onClick: openDevices }))
  app.replaceChildren(h('div', { class: 'shell' }, topbar, view, mini, nav), np.el)

  draw()
  plugins.loadAll()
  player.start()

  // Android back button
  CapApp.addListener('backButton', () => {
    if (np.el.classList.contains('open')) np.close()
    else if (current.name === 'collection') ctx.back()
    else if (current.name !== 'library') ctx.go('library')
    else CapApp.minimizeApp().catch(() => {})
  }).catch(() => {})
}

boot()
