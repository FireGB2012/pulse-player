import * as player from '../core/player.js'
import * as settings from '../core/settings.js'
import * as tags from '../core/tags.js'
import * as themes from '../core/themes.js'
import { getPanels, getButtons, onPluginsChange } from '../core/plugins.js'
import { onSwipe } from '../core/gestures.js'
import { h, icon, iconBtn, fmtTime, pickImage, artistNames, sheet, toast, fill } from '../core/ui.js'
import { openDevices } from './devices.js'
import { openQueue, openMoodPicker, editNote, openTrackMenu } from './trackmenu.js'
import { openBigArt, openCarMode, openKaraoke } from './modes.js'
import { shareNowPlaying } from '../core/share.js'

// ---- layout editor data (Settings > Player > Arrange controls) ----
export const CONTROLS = [
  { id: 'shuffle', label: 'Shuffle', row: true },
  { id: 'prev', label: 'Previous', row: true },
  { id: 'play', label: 'Play / pause', row: true, required: true },
  { id: 'next', label: 'Next', row: true },
  { id: 'repeat', label: 'Repeat', row: true },
  { id: 'queue', label: 'Queue', row: true },
  { id: 'like', label: 'Like button' },
  { id: 'seek', label: 'Seek bar' },
  { id: 'volume', label: 'Volume slider' },
  { id: 'addons', label: 'Add-on buttons' },
  { id: 'device', label: 'Device name' },
]
const DEFAULT_HIDDEN = new Set(['queue'])

// Saved layout merged with any controls added since it was saved.
export function controlLayout() {
  const saved = settings.get('controls') ?? []
  const known = new Set(saved.map((c) => c.id))
  const list = saved.filter((c) => CONTROLS.some((x) => x.id === c.id))
  for (const c of CONTROLS) if (!known.has(c.id)) list.push({ id: c.id, visible: !DEFAULT_HIDDEN.has(c.id) })
  return list
}

const wideQuery = matchMedia('(min-width: 1000px)')

// Full-screen player. Returns { el, open, close }.
export function createNowPlaying() {
  let tab = 'player'
  let panelCleanup = null
  let dragging = false
  let wide = wideQuery.matches

  const title = h('div', { class: 'np-title' })
  const artist = h('div', { class: 'np-artist' })
  const noteLine = h('button', { class: 'np-note', onClick: () => player.state.track && editNote(player.state.track) })
  const likeBtn = iconBtn('heart', { title: 'Like', cls: 'like', onClick: () => player.toggleLike() })

  const seekBar = h('input', { class: 'range seek', type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Seek' })
  const tCur = h('span', {}, '0:00')
  const tTot = h('span', {}, '0:00')
  seekBar.addEventListener('pointerdown', () => (dragging = true))
  seekBar.addEventListener('input', () => {
    tCur.textContent = fmtTime((seekBar.value / 1000) * player.state.durationMs)
  })
  seekBar.addEventListener('change', () => {
    dragging = false
    player.seek((seekBar.value / 1000) * player.state.durationMs)
  })

  const btns = {
    shuffle: iconBtn('shuffle', { title: 'Shuffle', onClick: () => player.setShuffle(!player.state.shuffle) }),
    prev: iconBtn('prev', { title: 'Previous', size: 32, onClick: () => player.previous() }),
    play: h('button', { class: 'playbtn', 'aria-label': 'Play or pause', onClick: () => player.toggle() }),
    next: iconBtn('next', { title: 'Next', size: 32, onClick: () => player.next() }),
    repeat: iconBtn('repeat', { title: 'Repeat', onClick: () => player.cycleRepeat() }),
    queue: iconBtn('queue', { title: 'Queue', onClick: openQueue }),
  }

  const vol = h('input', { class: 'range vol', type: 'range', min: 0, max: 100, value: 50, 'aria-label': 'Volume' })
  vol.addEventListener('change', () => player.setVolume(Number(vol.value)))

  const buttonRow = h('div', { class: 'np-buttons' })
  const seekRow = h('div', { class: 'np-seek' }, seekBar, h('div', { class: 'times' }, tCur, tTot))
  const volRow = h('div', { class: 'np-vol' }, icon('vol', 18), vol)
  const extras = h('div', { class: 'np-extras' })
  const tabs = h('div', { class: 'np-tabs' })
  const stage = h('div', { class: 'np-stage' })
  const artBox = h('div', { class: 'np-artbox' }) // gestures live here, not on panels
  const side = h('div', { class: 'np-side' })
  const deviceLabel = h('span', { class: 'dev-label' })

  const el = h(
    'div',
    { class: 'np', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'np-top' },
      iconBtn('down', { title: 'Close', onClick: () => close() }),
      h('div', { class: 'np-top-title' }, 'Now playing'),
      h('div', { class: 'np-top-right' }, iconBtn('devices', { title: 'Devices', onClick: openDevices }), iconBtn('more', { title: 'More', onClick: openMore })),
    ),
    tabs,
    stage,
    side,
    h(
      'div',
      { class: 'np-controls' },
      h('div', { class: 'np-meta' }, h('div', { class: 'np-meta-text' }, title, artist, noteLine), likeBtn),
      seekRow,
      buttonRow,
      volRow,
      extras,
      deviceLabel,
    ),
  )

  function applyLayout() {
    const layout = controlLayout()
    const visible = (id) => layout.find((c) => c.id === id)?.visible !== false
    fill(buttonRow, ...layout.filter((c) => CONTROLS.find((x) => x.id === c.id)?.row && (c.visible || c.id === 'play')).map((c) => btns[c.id]))
    likeBtn.style.display = visible('like') ? '' : 'none'
    seekRow.style.display = visible('seek') ? '' : 'none'
    volRow.style.display = visible('volume') ? '' : 'none'
    extras.style.display = visible('addons') ? '' : 'none'
    deviceLabel.style.display = visible('device') ? '' : 'none'
  }

  function openMore() {
    const t = player.state.track
    const items = [
      { label: '🖼️  Big art mode', sub: 'Dim, always-on album art', onClick: openBigArt },
      { label: '🚗  Car mode', sub: 'Giant buttons', onClick: openCarMode },
    ]
    if (getPanels().some((p) => p.pluginId === 'lyrics')) items.push({ label: '🎤  Karaoke', sub: 'Huge synced lyrics', onClick: openKaraoke })
    items.push({ label: '📤  Share as image', onClick: () => shareNowPlaying().catch((e) => toast(e.message)) })
    if (t) {
      items.push(
        { label: '🏷️  Mood tags', onClick: () => openMoodPicker(t) },
        { label: '📝  ' + (tags.getNote(t.uri) ? 'Edit note' : 'Add a note'), onClick: () => editNote(t) },
        { label: '⋯  Song options', onClick: () => openTrackMenu(t, { contextUri: player.state.contextUri }) },
      )
    }
    items.push({ label: '📃  Queue', onClick: openQueue })
    const ctx = player.state.contextUri
    if (ctx && !ctx.includes(':collection'))
      items.push({
        label: '🎨  Theme for this playlist',
        sub: themes.getPlaylistTheme(ctx) ? themes.getTheme(themes.getPlaylistTheme(ctx)).name : 'None',
        onClick: () =>
          sheet({
            title: 'Theme while this plays',
            items: [
              { label: 'No special theme', onClick: () => themes.setPlaylistTheme(ctx, null) },
              ...themes.allThemes().map((th) => ({ label: th.name, active: themes.getPlaylistTheme(ctx) === th.id, onClick: () => themes.setPlaylistTheme(ctx, th.id) })),
            ],
          }),
      })
    sheet({ title: 'More', items })
  }

  // ---- album art + skins ----
  function renderArt() {
    const t = player.state.track
    const url = pickImage(t?.album?.images, 640)
    const img = url ? h('img', { class: 'np-art', src: url, alt: '', draggable: 'false' }) : h('div', { class: 'np-art ph' }, icon('note', 64))
    const skin = settings.get('skin')
    if (skin === 'vinyl')
      return h('div', { class: 'skin skin-vinyl' }, h('div', { class: 'disc' }, url ? h('img', { class: 'label', src: url, alt: '', draggable: 'false' }) : h('div', { class: 'label ph' }), h('i', { class: 'hole' })), h('div', { class: 'tonearm' }))
    if (skin === 'cassette')
      return h(
        'div',
        { class: 'skin skin-cassette' },
        h(
          'div',
          { class: 'shell' },
          h('div', { class: 'sticker' }, url ? h('img', { src: url, alt: '', draggable: 'false' }) : null, h('span', {}, t ? `${t.name} · ${artistNames(t)}` : 'Pulse mixtape')),
          h('div', { class: 'window' }, h('i', { class: 'reel' }), h('i', { class: 'tape' }), h('i', { class: 'reel' })),
          h('div', { class: 'holes' }, h('i'), h('i'), h('i'), h('i')),
        ),
      )
    if (skin === 'tapedeck')
      return h(
        'div',
        { class: 'skin skin-deck' },
        h('div', { class: 'deck-screen' }, url ? h('img', { src: url, alt: '', draggable: 'false' }) : null, h('div', { class: 'marquee' }, h('span', {}, t ? `${t.name} — ${artistNames(t)}` : 'NO TAPE'))),
        h('div', { class: 'deck-reels' }, h('i', { class: 'reel' }), h('div', { class: 'vu' }, ...Array.from({ length: 12 }, (_, i) => h('b', { style: { animationDelay: `${(i * 97) % 600}ms` } }))), h('i', { class: 'reel' })),
      )
    return img
  }

  function heartBurst() {
    const b = h('div', { class: 'heart-burst' }, icon('heartOn', 96))
    artBox.append(b)
    setTimeout(() => b.remove(), 900)
  }

  onSwipe(artBox, {
    left: () => settings.get('swipeGestures') && (player.next(), nudge('left')),
    right: () => settings.get('swipeGestures') && (player.previous(), nudge('right')),
    down: () => settings.get('swipeGestures') && close(),
    doubleTap: () => {
      if (!settings.get('doubleTapLike') || !player.state.track) return
      if (!player.state.liked) player.toggleLike()
      heartBurst()
    },
    move: (dx, dy) => {
      if (!settings.get('swipeGestures')) return
      const art = artBox.firstElementChild
      if (art) art.style.transform = `translate(${dx * 0.35}px, ${Math.max(0, dy) * 0.35}px) rotate(${dx * 0.02}deg)`
    },
    end: () => {
      const art = artBox.firstElementChild
      if (art) art.style.transform = ''
    },
  })
  function nudge(dir) {
    artBox.classList.remove('nudge-left', 'nudge-right')
    void artBox.offsetWidth
    artBox.classList.add('nudge-' + dir)
  }

  function panelKeys() {
    return getPanels().map((p) => ({ key: `${p.pluginId}:${p.id}`, title: p.title, panel: p }))
  }

  function renderPanel(box, key) {
    const p = getPanels().find((x) => `${x.pluginId}:${x.id}` === key)
    if (!p) return false
    try {
      const c = p.render(box)
      if (typeof c === 'function') panelCleanup = c
    } catch (e) {
      box.append(h('div', { class: 'empty' }, 'Add-on error: ' + e.message))
    }
    return true
  }

  function drawStage() {
    panelCleanup?.()
    panelCleanup = null
    fill(stage)
    fill(side)
    if (!el.classList.contains('open')) return
    if (wide) {
      // PC: art on the left, a panel (lyrics by default) on the right
      stage.dataset.tab = 'player'
      fill(artBox, renderArt())
      stage.append(artBox)
      const keys = panelKeys()
      if (!keys.some((k) => k.key === tab)) tab = keys.find((k) => k.panel.pluginId === 'lyrics')?.key ?? keys[0]?.key ?? 'player'
      if (tab !== 'player') {
        const box = h('div', { class: 'panel' })
        side.append(box)
        renderPanel(box, tab)
      }
      return
    }
    stage.dataset.tab = tab
    if (tab === 'player') {
      fill(artBox, renderArt())
      stage.append(artBox)
      return
    }
    const box = h('div', { class: 'panel' })
    stage.append(box)
    if (!renderPanel(box, tab)) {
      tab = 'player'
      drawStage()
    }
  }

  function drawTabs() {
    const keys = panelKeys()
    fill(tabs)
    tabs.style.display = keys.length ? '' : 'none'
    if (!keys.length) return
    const entries = wide ? keys : [{ key: 'player', title: 'Player' }, ...keys]
    for (const e of entries) {
      tabs.append(h('button', { class: tab === e.key ? 'on' : '', onClick: () => ((tab = e.key), drawTabs(), drawStage()) }, e.title))
    }
  }

  function drawExtras() {
    fill(extras, ...getButtons().map((b) => iconBtn(b.icon, { title: b.title, onClick: () => b.onClick?.() })))
  }

  function drawState(s) {
    const t = s.track
    title.textContent = t?.name ?? 'Nothing playing'
    artist.textContent = t ? artistNames(t) || t.show?.name || '' : 'Start a song in Spotify, or pick one here'
    const note = t ? tags.getNote(t.uri) : ''
    noteLine.textContent = note ? '📝 ' + note : ''
    noteLine.style.display = note ? '' : 'none'
    fill(btns.play, icon(s.isPlaying ? 'pause' : 'play', 34))
    fill(likeBtn, icon(s.liked ? 'heartOn' : 'heart'))
    likeBtn.classList.toggle('on', s.liked)
    btns.shuffle.classList.toggle('on', s.shuffle)
    btns.repeat.classList.toggle('on', s.repeat !== 'off')
    btns.repeat.title = 'Repeat: ' + s.repeat
    el.classList.toggle('playing', !!s.isPlaying)
    if (!dragging) vol.value = s.volume
    tTot.textContent = fmtTime(s.durationMs)
    deviceLabel.textContent = s.device ? `Playing on ${s.device.name}` : 'No active device'
    onProgress(player.currentProgress(), s.durationMs)
  }

  function onProgress(ms, dur) {
    if (dragging) return
    seekBar.value = dur ? Math.round((ms / dur) * 1000) : 0
    seekBar.style.setProperty('--pct', (dur ? (ms / dur) * 100 : 0) + '%')
    tCur.textContent = fmtTime(ms)
  }

  player.on('state', drawState)
  player.on('progress', onProgress)
  player.on('track', () => {
    // only the art needs redrawing; keep a running panel alive
    if (artBox.isConnected) fill(artBox, renderArt())
  })
  onPluginsChange('change', () => {
    drawTabs()
    drawExtras()
  })
  settings.onSettings('change', (k) => {
    if (k === 'controls') applyLayout()
    if (k === 'skin' && el.classList.contains('open')) drawStage()
  })
  tags.onTags('change', () => drawState(player.state))
  wideQuery.addEventListener('change', (e) => {
    wide = e.matches
    el.classList.toggle('wide', wide)
    drawTabs()
    drawStage()
  })
  el.classList.toggle('wide', wide)

  applyLayout()
  drawTabs()
  drawExtras()
  drawState(player.state)

  // tabKey: an add-on tab like 'lyrics:lyrics' to open on
  function open(tabKey) {
    if (typeof tabKey === 'string') tab = tabKey
    el.classList.add('open')
    el.setAttribute('aria-hidden', 'false')
    drawTabs()
    drawStage()
  }
  function close() {
    el.classList.remove('open')
    el.setAttribute('aria-hidden', 'true')
    panelCleanup?.()
    panelCleanup = null
    fill(stage)
    fill(side)
  }

  return { el, open, close, isOpen: () => el.classList.contains('open') }
}
