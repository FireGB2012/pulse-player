import * as player from '../core/player.js'
import { getPanels, getButtons, onPluginsChange } from '../core/plugins.js'
import { h, icon, iconBtn, fmtTime, pickImage, artistNames } from '../core/ui.js'
import { openDevices } from './devices.js'

// Full-screen player. Returns { el, open, close }.
export function createNowPlaying() {
  let tab = 'player'
  let panelCleanup = null
  let dragging = false

  const art = h('img', { class: 'np-art', alt: '' })
  const artPh = h('div', { class: 'np-art ph' }, icon('note', 64))
  const title = h('div', { class: 'np-title' })
  const artist = h('div', { class: 'np-artist' })
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

  const shuffleBtn = iconBtn('shuffle', { title: 'Shuffle', onClick: () => player.setShuffle(!player.state.shuffle) })
  const prevBtn = iconBtn('prev', { title: 'Previous', size: 32, onClick: () => player.previous() })
  const playBtn = h('button', { class: 'playbtn', 'aria-label': 'Play or pause', onClick: () => player.toggle() })
  const nextBtn = iconBtn('next', { title: 'Next', size: 32, onClick: () => player.next() })
  const repeatBtn = iconBtn('repeat', { title: 'Repeat', onClick: () => player.cycleRepeat() })

  const vol = h('input', { class: 'range vol', type: 'range', min: 0, max: 100, value: 50, 'aria-label': 'Volume' })
  vol.addEventListener('change', () => player.setVolume(Number(vol.value)))

  const extras = h('div', { class: 'np-extras' })
  const tabs = h('div', { class: 'np-tabs' })
  const stage = h('div', { class: 'np-stage' })
  const deviceLabel = h('span', { class: 'dev-label' })

  const el = h(
    'div',
    { class: 'np', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'np-top' },
      iconBtn('down', { title: 'Close', onClick: () => close() }),
      h('div', { class: 'np-top-title' }, 'Now playing'),
      iconBtn('devices', { title: 'Devices', onClick: openDevices }),
    ),
    tabs,
    stage,
    h(
      'div',
      { class: 'np-controls' },
      h('div', { class: 'np-meta' }, h('div', { class: 'np-meta-text' }, title, artist), likeBtn),
      h('div', { class: 'np-seek' }, seekBar, h('div', { class: 'times' }, tCur, tTot)),
      h('div', { class: 'np-buttons' }, shuffleBtn, prevBtn, playBtn, nextBtn, repeatBtn),
      h('div', { class: 'np-vol' }, icon('vol', 18), vol),
      extras,
      deviceLabel,
    ),
  )

  function drawStage() {
    panelCleanup?.()
    panelCleanup = null
    stage.replaceChildren()
    stage.dataset.tab = tab
    if (tab === 'player') {
      const t = player.state.track
      const url = pickImage(t?.album?.images, 640)
      if (url) {
        art.src = url
        stage.append(art)
      } else stage.append(artPh)
      return
    }
    const p = getPanels().find((x) => `${x.pluginId}:${x.id}` === tab)
    if (!p) {
      tab = 'player'
      return drawStage()
    }
    const box = h('div', { class: 'panel' })
    stage.append(box)
    try {
      const c = p.render(box)
      if (typeof c === 'function') panelCleanup = c
    } catch (e) {
      box.append(h('div', { class: 'empty' }, 'Add-on error: ' + e.message))
    }
  }

  function drawTabs() {
    const panels = getPanels()
    tabs.replaceChildren()
    tabs.style.display = panels.length ? '' : 'none'
    if (!panels.length) return
    const entries = [{ key: 'player', title: 'Player' }, ...panels.map((p) => ({ key: `${p.pluginId}:${p.id}`, title: p.title }))]
    for (const e of entries) {
      tabs.append(h('button', { class: tab === e.key ? 'on' : '', onClick: () => ((tab = e.key), drawTabs(), drawStage()) }, e.title))
    }
  }

  function drawExtras() {
    extras.replaceChildren(
      ...getButtons().map((b) => iconBtn(b.icon, { title: b.title, onClick: () => b.onClick?.() })),
    )
  }

  function drawState(s) {
    const t = s.track
    title.textContent = t?.name ?? 'Nothing playing'
    artist.textContent = t ? artistNames(t) || t.show?.name || '' : 'Start a song in Spotify, or pick one here'
    playBtn.replaceChildren(icon(s.isPlaying ? 'pause' : 'play', 34))
    likeBtn.replaceChildren(icon(s.liked ? 'heartOn' : 'heart'))
    likeBtn.classList.toggle('on', s.liked)
    shuffleBtn.classList.toggle('on', s.shuffle)
    repeatBtn.classList.toggle('on', s.repeat !== 'off')
    repeatBtn.title = 'Repeat: ' + s.repeat
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
    if (tab === 'player') drawStage()
  })
  onPluginsChange('change', () => {
    drawTabs()
    drawExtras()
  })

  drawTabs()
  drawStage()
  drawExtras()
  drawState(player.state)

  function open() {
    el.classList.add('open')
    el.setAttribute('aria-hidden', 'false')
    drawStage()
  }
  function close() {
    el.classList.remove('open')
    el.setAttribute('aria-hidden', 'true')
    panelCleanup?.()
    panelCleanup = null
    stage.replaceChildren()
  }

  return { el, open, close }
}
