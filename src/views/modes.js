// Full-screen modes: dim big-art, car mode, karaoke.

import * as player from '../core/player.js'
import * as achievements from '../core/achievements.js'
import { fetchLyrics, lineAt, translateLines } from '../core/lyrics.js'
import { ls } from '../core/store.js'
import { stayAwake } from '../core/wake.js'
import { h, icon, iconBtn, overlay, pickImage, artistNames, fill } from '../core/ui.js'

// ---------- 16. dim always-on big art ----------
export function openBigArt() {
  const img = h('img', { class: 'ba-art', alt: '' })
  const t1 = h('div', { class: 'ba-title' })
  const t2 = h('div', { class: 'ba-artist' })
  const clock = h('div', { class: 'ba-clock' })
  const controls = h(
    'div',
    { class: 'ba-controls' },
    iconBtn('prev', { title: 'Previous', size: 36, onClick: (e) => (e.stopPropagation(), player.previous()) }),
    iconBtn('play', { title: 'Play or pause', size: 44, cls: 'ba-play', onClick: (e) => (e.stopPropagation(), player.toggle()) }),
    iconBtn('next', { title: 'Next', size: 36, onClick: (e) => (e.stopPropagation(), player.next()) }),
    iconBtn('close', { title: 'Exit', size: 30, onClick: (e) => (e.stopPropagation(), o.close()) }),
  )
  const inner = h('div', { class: 'ba-inner' }, img, t1, t2, clock)
  let hideTimer = 0
  const showControls = () => {
    o.el.classList.add('show-controls')
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => o.el.classList.remove('show-controls'), 4000)
  }

  const draw = (s = player.state) => {
    const t = s.track
    const url = pickImage(t?.album?.images, 640)
    if (url && img.src !== url) img.src = url
    t1.textContent = t?.name ?? 'Nothing playing'
    t2.textContent = t ? artistNames(t) : ''
    controls.children[1].replaceChildren(icon(s.isPlaying ? 'pause' : 'play', 44))
  }
  const tick = () => (clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  // shift a few pixels now and then so an OLED screen doesn't burn in
  const shift = () => (inner.style.transform = `translate(${Math.round(Math.random() * 24 - 12)}px, ${Math.round(Math.random() * 24 - 12)}px)`)

  const offState = player.on('state', draw)
  const release = stayAwake()
  const timers = [setInterval(tick, 10_000), setInterval(shift, 60_000)]
  const o = overlay('bigart', [inner, controls], () => {
    offState()
    release()
    timers.forEach(clearInterval)
    clearTimeout(hideTimer)
  })
  o.el.addEventListener('click', showControls)
  draw()
  tick()
}

// ---------- 48. car mode ----------
export function openCarMode() {
  achievements.unlock('road-trip')
  const t1 = h('div', { class: 'car-title' })
  const t2 = h('div', { class: 'car-artist' })
  const playBtn = h('button', { class: 'car-btn car-play', 'aria-label': 'Play or pause', onClick: () => player.toggle() })
  const likeBtn = h('button', { class: 'car-small', 'aria-label': 'Like', onClick: () => player.toggleLike() })
  const bar = h('div', { class: 'car-bar' }, h('i'))
  const draw = (s = player.state) => {
    t1.textContent = s.track?.name ?? 'Nothing playing'
    t2.textContent = s.track ? artistNames(s.track) : 'Start Spotify, then come back'
    fill(playBtn, icon(s.isPlaying ? 'pause' : 'play', 96))
    fill(likeBtn, icon(s.liked ? 'heartOn' : 'heart', 44))
    likeBtn.classList.toggle('on', !!s.liked)
  }
  const offState = player.on('state', draw)
  const offProg = player.on('progress', (ms, dur) => (bar.firstChild.style.width = (dur ? (ms / dur) * 100 : 0) + '%'))
  const release = stayAwake()
  const o = overlay(
    'carmode',
    [
      h('div', { class: 'car-top' }, h('button', { class: 'car-small', 'aria-label': 'Exit car mode', onClick: () => o.close() }, icon('close', 40)), h('div', { class: 'car-meta' }, t1, t2), likeBtn),
      bar,
      h(
        'div',
        { class: 'car-buttons' },
        h('button', { class: 'car-btn', 'aria-label': 'Previous', onClick: () => player.previous() }, icon('prev', 80)),
        playBtn,
        h('button', { class: 'car-btn', 'aria-label': 'Next', onClick: () => player.next() }, icon('next', 80)),
      ),
    ],
    () => {
      offState()
      offProg()
      release()
    },
  )
  draw()
}

// ---------- 29. karaoke ----------
export function openKaraoke() {
  achievements.unlock('karaoke')
  const bg = h('div', { class: 'kara-bg' })
  const prev = h('div', { class: 'kara-line kara-prev' })
  const cur = h('div', { class: 'kara-line kara-cur' }, h('span', { class: 'kara-fill' }), h('span', { class: 'kara-text' }))
  const trans = h('div', { class: 'kara-trans' })
  const next = h('div', { class: 'kara-line kara-next' })
  const msg = h('div', { class: 'kara-msg' })
  const title = h('div', { class: 'kara-title' })

  let lines = null
  let translated = null
  let idx = -2
  let token = 0

  async function load(track) {
    const mine = ++token
    lines = null
    translated = null
    idx = -2
    prev.textContent = next.textContent = trans.textContent = ''
    cur.querySelector('.kara-text').textContent = ''
    title.textContent = track ? `${track.name} · ${artistNames(track)}` : ''
    const url = pickImage(track?.album?.images, 640)
    bg.style.backgroundImage = url ? `url("${url}")` : 'none'
    if (!track) return (msg.textContent = 'Nothing playing')
    msg.textContent = 'Loading lyrics...'
    const res = await fetchLyrics(track)
    if (mine !== token) return
    if (!res.lines) return (msg.textContent = res.plain ? 'This song only has unsynced lyrics' : 'No synced lyrics for this song')
    msg.textContent = ''
    lines = res.lines
    const lang = ls.get('plugin.lyrics.translate', '')
    if (lang)
      translateLines(lines.map((l) => l.text), lang)
        .then((tr) => mine === token && ((translated = tr), (idx = -2)))
        .catch(() => {})
    update(player.currentProgress())
  }

  function update(ms) {
    if (!lines) return
    const i = lineAt(lines, ms)
    const line = lines[i]
    const nextT = lines[i + 1]?.t ?? (line ? line.t + 5000 : 0)
    // fill the current line from left to right over its duration
    const pct = line ? Math.min(100, Math.max(0, ((ms - line.t) / Math.max(400, nextT - line.t)) * 100)) : 0
    cur.style.setProperty('--fill', pct + '%')
    if (i === idx) return
    idx = i
    prev.textContent = lines[i - 1]?.text ?? ''
    const text = line ? line.text || '♪' : '♪'
    cur.querySelector('.kara-text').textContent = text
    cur.querySelector('.kara-fill').textContent = text
    trans.textContent = translated?.[i] && translated[i] !== line?.text ? translated[i] : ''
    next.textContent = lines[i + 1]?.text ?? ''
    cur.classList.remove('pop')
    void cur.offsetWidth
    cur.classList.add('pop')
  }

  const offTrack = player.on('track', load)
  const offProg = player.on('progress', update)
  const release = stayAwake()
  const o = overlay(
    'karaoke',
    [bg, h('div', { class: 'kara-top' }, title, iconBtn('close', { title: 'Exit karaoke', onClick: () => o.close() })), h('div', { class: 'kara-lines' }, prev, cur, trans, next, msg)],
    () => {
      token++
      offTrack()
      offProg()
      release()
    },
  )
  load(player.state.track)
}
