// 50. PC always-on-top mini window (opened from Settings > PC extras or the tray).

import * as player from '../core/player.js'
import { desktop } from '../core/desktop.js'
import { h, icon, pickImage, artistNames } from '../core/ui.js'

export function renderMiniWindow(root) {
  document.documentElement.classList.add('mini-window')
  const art = h('img', { class: 'mw-art', alt: '' })
  const title = h('div', { class: 't' })
  const artist = h('div', { class: 's' })
  const btn = (ic, label, fn, size = 22) => h('button', { class: 'ibtn', 'aria-label': label, title: label, onClick: fn }, icon(ic, size))
  const play = btn('play', 'Play or pause', () => player.toggle(), 28)
  const like = btn('heart', 'Like', () => player.toggleLike())
  const bar = h('div', { class: 'mini-bar' }, h('i'))

  root.replaceChildren(
    h(
      'div',
      { class: 'mw' },
      art,
      h('div', { class: 'meta mw-drag' }, title, artist),
      h('div', { class: 'mw-buttons' }, btn('prev', 'Previous', () => player.previous()), play, btn('next', 'Next', () => player.next()), like, btn('close', 'Close mini window', () => desktop?.closeMini(), 18)),
      bar,
    ),
  )

  player.on('state', (s) => {
    const t = s.track
    title.textContent = t?.name ?? 'Nothing playing'
    artist.textContent = t ? artistNames(t) : 'Start Spotify somewhere'
    const url = pickImage(t?.album?.images, 64)
    if (url && art.src !== url) art.src = url
    play.replaceChildren(icon(s.isPlaying ? 'pause' : 'play', 28))
    like.replaceChildren(icon(s.liked ? 'heartOn' : 'heart', 22))
    like.classList.toggle('on', !!s.liked)
  })
  player.on('progress', (ms, dur) => (bar.firstChild.style.width = (dur ? (ms / dur) * 100 : 0) + '%'))
  player.start()
}
