import * as sp from '../core/spotify.js'
import * as player from '../core/player.js'
import { h, icon, pickImage, artistNames, fmtTime, toast } from '../core/ui.js'

const art = (url, cls = '') =>
  url ? h('img', { class: 'art ' + cls, src: url, loading: 'lazy', alt: '' }) : h('div', { class: 'art ph ' + cls }, icon('note', 22))

export function trackRow(t, onPlay) {
  if (!t) return null
  return h(
    'button',
    { class: 'row', onClick: onPlay },
    art(pickImage(t.album?.images, 64), 'sm'),
    h('div', { class: 'meta' }, h('div', { class: 't' }, t.name), h('div', { class: 's' }, artistNames(t))),
    h('span', { class: 'dur' }, t.duration_ms ? fmtTime(t.duration_ms) : ''),
  )
}

function errorBox(e, what) {
  return h('div', { class: 'empty' }, h('p', {}, `Could not load ${what}.`), h('small', {}, e.message ?? String(e)))
}

// ---------- Library (playlists + liked) ----------
export function renderLibrary(root, { go }) {
  let tab = 'playlists'
  const body = h('div', { class: 'list' })
  const seg = h('div', { class: 'seg' })

  function drawSeg() {
    seg.replaceChildren(
      ...[
        ['playlists', 'Playlists'],
        ['liked', 'Liked Songs'],
      ].map(([id, label]) =>
        h('button', { class: tab === id ? 'on' : '', onClick: () => ((tab = id), drawSeg(), load()) }, label),
      ),
    )
  }

  async function load() {
    body.replaceChildren(h('div', { class: 'empty' }, 'Loading...'))
    try {
      if (tab === 'playlists') await loadPlaylists()
      else await loadLiked()
    } catch (e) {
      body.replaceChildren(errorBox(e, tab === 'playlists' ? 'playlists' : 'liked songs'))
    }
  }

  async function loadPlaylists() {
    const first = await sp.myPlaylists(0)
    const items = (first.items ?? []).filter(Boolean)
    body.replaceChildren()
    if (!items.length) body.append(h('div', { class: 'empty' }, 'No playlists yet'))
    for (const p of items) {
      const total = sp.playlistTotal(p)
      body.append(
        h(
          'button',
          { class: 'row', onClick: () => go('collection', { kind: 'playlist', id: p.id, uri: p.uri, name: p.name, image: pickImage(p.images, 300), owner: p.owner?.display_name }) },
          art(pickImage(p.images, 64), 'sm'),
          h('div', { class: 'meta' }, h('div', { class: 't' }, p.name), h('div', { class: 's' }, total != null ? `${total} songs` : p.owner?.display_name ?? 'Playlist')),
        ),
      )
    }
    if (first.next) body.append(loadMore(first.total, first.items.length, sp.myPlaylists, async (page) => {
      for (const p of page.items.filter(Boolean)) body.insertBefore(rowForPlaylist(p), body.lastChild)
    }))
  }

  function rowForPlaylist(p) {
    const total = sp.playlistTotal(p)
    return h(
      'button',
      { class: 'row', onClick: () => go('collection', { kind: 'playlist', id: p.id, uri: p.uri, name: p.name, image: pickImage(p.images, 300), owner: p.owner?.display_name }) },
      art(pickImage(p.images, 64), 'sm'),
      h('div', { class: 'meta' }, h('div', { class: 't' }, p.name), h('div', { class: 's' }, total != null ? `${total} songs` : 'Playlist')),
    )
  }

  function loadMore(total, loaded, fetcher, onPage) {
    let offset = loaded
    const btn = h('button', { class: 'btn ghost' }, 'Load more')
    btn.onclick = async () => {
      btn.disabled = true
      try {
        const page = await fetcher(offset)
        offset += page.items.length
        await onPage(page)
        if (!page.next) btn.remove()
        else btn.disabled = false
      } catch (e) {
        toast(e.message)
        btn.disabled = false
      }
    }
    return btn
  }

  async function loadLiked() {
    const tracks = []
    const first = await sp.savedTracks(0)
    tracks.push(...first.items.map((e) => e.track).filter(Boolean))
    body.replaceChildren()
    const playAll = h('button', { class: 'btn primary', onClick: () => player.playBody({ uris: tracks.slice(0, 100).map((t) => t.uri) }) }, icon('play', 18), ' Play liked songs')
    body.append(playAll)
    const rowsAnchor = h('div', { class: 'list-inner' })
    body.append(rowsAnchor)
    const draw = (list, from) =>
      list.forEach((t, i) =>
        rowsAnchor.append(trackRow(t, () => player.playBody({ uris: tracks.slice(from + i, from + i + 100).map((x) => x.uri) }))),
      )
    draw(tracks, 0)
    if (first.next)
      body.append(
        loadMore(first.total, first.items.length, sp.savedTracks, async (page) => {
          const from = tracks.length
          const more = page.items.map((e) => e.track).filter(Boolean)
          tracks.push(...more)
          draw(more, from)
        }),
      )
  }

  drawSeg()
  root.replaceChildren(h('h1', { class: 'title' }, 'Your Library'), seg, body)
  load()
}

// ---------- Playlist / album detail ----------
export function renderCollection(root, { kind, id, uri, name, image, owner }, { back }) {
  const list = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Loading...'))
  let subtitle = owner ? `By ${owner}` : ''

  const playBtn = h(
    'button',
    { class: 'btn primary', onClick: () => player.playBody({ context_uri: uri }) },
    icon('play', 18),
    ' Play',
  )
  const shufBtn = h(
    'button',
    {
      class: 'btn ghost',
      onClick: async () => {
        await player.setShuffle(true)
        player.playBody({ context_uri: uri })
      },
    },
    icon('shuffle', 18),
    ' Shuffle',
  )

  root.replaceChildren(
    h('button', { class: 'ibtn back', onClick: back, 'aria-label': 'Back' }, icon('back')),
    h(
      'div',
      { class: 'hero' },
      art(image, 'xl'),
      h('h1', { class: 'title' }, name),
      h('div', { class: 'dim' }, subtitle),
      h('div', { class: 'hero-actions' }, playBtn, shufBtn),
    ),
    list,
  )

  const rowPlay = (t) => () => player.playBody({ context_uri: uri, offset: { uri: t.uri } })

  ;(async () => {
    try {
      let tracks = []
      if (kind === 'album') {
        const a = await sp.album(id)
        tracks = (a.tracks?.items ?? []).map((t) => ({ ...t, album: { images: a.images } }))
      } else {
        const r = await sp.playlistItems(id)
        tracks = (r.items ?? []).map(sp.entryTrack).filter((t) => t && t.type !== 'episode')
      }
      list.replaceChildren(...tracks.map((t) => trackRow(t, rowPlay(t))))
      if (!tracks.length) list.append(h('div', { class: 'empty' }, 'No songs to show'))
    } catch (e) {
      if (e.status === 403 || e.status === 404) {
        list.replaceChildren(
          h('div', { class: 'empty' }, h('p', {}, 'Spotify only lets Pulse list songs for playlists you own or collaborate on.'), h('small', {}, 'You can still press Play above.')),
        )
      } else list.replaceChildren(errorBox(e, 'songs'))
    }
  })()
}
