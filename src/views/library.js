import * as sp from '../core/spotify.js'
import * as player from '../core/player.js'
import * as liked from '../core/likedcache.js'
import * as mixes from '../core/mixes.js'
import * as themes from '../core/themes.js'
import * as achievements from '../core/achievements.js'
import { ls } from '../core/store.js'
import { onLongPress } from '../core/gestures.js'
import { h, icon, pickImage, artistNames, fmtTime, toast, sheet, fill } from '../core/ui.js'
import { openTrackMenu } from './trackmenu.js'

const art = (url, cls = '') =>
  url ? h('img', { class: 'art ' + cls, src: url, loading: 'lazy', alt: '' }) : h('div', { class: 'art ph ' + cls }, icon('note', 22))

// menu: options for the long-press menu ({ contextUri, playlistId })
export function trackRow(t, onPlay, menu = {}) {
  if (!t) return null
  const row = h(
    'button',
    { class: 'row', onClick: onPlay },
    art(pickImage(t.album?.images, 64), 'sm'),
    h('div', { class: 'meta' }, h('div', { class: 't' }, t.name), h('div', { class: 's' }, artistNames(t))),
    h('span', { class: 'dur' }, t.duration_ms ? fmtTime(t.duration_ms) : ''),
  )
  onLongPress(row, () => openTrackMenu(t, menu))
  return row
}

function errorBox(e, what) {
  return h('div', { class: 'empty' }, h('p', {}, `Could not load ${what}.`), h('small', {}, e.message ?? String(e)))
}

// ---------- sorting ----------
const TRACK_SORTS = [
  ['default', 'Default order'],
  ['added', 'Date added'],
  ['name', 'Name'],
  ['artist', 'Artist'],
  ['length', 'Length'],
]
export function sortTracks(list, mode) {
  const a = [...list]
  const by = (f) => a.sort((x, y) => f(x).localeCompare(f(y), undefined, { sensitivity: 'base' }))
  if (mode === 'added') a.sort((x, y) => (y.addedAt ?? '').localeCompare(x.addedAt ?? ''))
  else if (mode === 'name') by((t) => t.name ?? '')
  else if (mode === 'artist') by((t) => artistNames(t))
  else if (mode === 'length') a.sort((x, y) => (x.duration_ms ?? 0) - (y.duration_ms ?? 0))
  return a
}

function sortButton(options, current, onPick) {
  const label = () => options.find(([id]) => id === current())?.[1] ?? 'Sort'
  const btn = h('button', { class: 'btn ghost small-btn' })
  const draw = () => fill(btn, icon('queue', 16), ' ' + label())
  btn.onclick = () =>
    sheet({
      title: 'Sort by',
      items: options.map(([id, name]) => ({ label: name, active: id === current(), onClick: () => (onPick(id), draw()) })),
    })
  draw()
  return btn
}

// ---------- Library (playlists + liked) ----------
export function renderLibrary(root, { go }) {
  let tab = ls.get('libraryTab', 'playlists')
  const body = h('div', { class: 'list' })
  const seg = h('div', { class: 'seg' })

  function drawSeg() {
    fill(seg,
      ...[
        ['playlists', 'Playlists'],
        ['liked', 'Liked Songs'],
      ].map(([id, label]) =>
        h('button', { class: tab === id ? 'on' : '', onClick: () => ((tab = id), ls.set('libraryTab', id), drawSeg(), load()) }, label),
      ),
    )
  }

  async function load() {
    fill(body, h('div', { class: 'empty' }, 'Loading...'))
    try {
      if (tab === 'playlists') await loadPlaylists()
      else await loadLiked()
    } catch (e) {
      fill(body, errorBox(e, tab === 'playlists' ? 'playlists' : 'liked songs'))
    }
  }

  const PL_SORTS = [
    ['default', 'Recently added'],
    ['name', 'Name'],
    ['size', 'Most songs'],
    ['small', 'Fewest songs'],
  ]

  async function loadPlaylists() {
    const all = await sp.allMyPlaylists()
    const list = h('div', { class: 'list-inner' })
    const draw = () => {
      const mode = ls.get('playlistSort', 'default')
      const sorted = [...all]
      if (mode === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      if (mode === 'size') sorted.sort((a, b) => (sp.playlistTotal(b) ?? 0) - (sp.playlistTotal(a) ?? 0))
      if (mode === 'small') sorted.sort((a, b) => (sp.playlistTotal(a) ?? 0) - (sp.playlistTotal(b) ?? 0))
      fill(list, ...sorted.map(rowForPlaylist))
      if (!sorted.length) list.append(h('div', { class: 'empty' }, 'No playlists yet'))
    }
    fill(body,
      h('div', { class: 'toolbar' }, sortButton(PL_SORTS, () => ls.get('playlistSort', 'default'), (id) => (ls.set('playlistSort', id), draw()))),
      list,
    )
    draw()
  }

  function rowForPlaylist(p) {
    const total = sp.playlistTotal(p)
    const themed = themes.getPlaylistTheme(p.uri)
    return h(
      'button',
      { class: 'row', onClick: () => go('collection', { kind: 'playlist', id: p.id, uri: p.uri, name: p.name, image: pickImage(p.images, 300), owner: p.owner?.display_name }) },
      art(pickImage(p.images, 64), 'sm'),
      h(
        'div',
        { class: 'meta' },
        h('div', { class: 't' }, p.name),
        h('div', { class: 's' }, (total != null ? `${total} songs` : p.owner?.display_name ?? 'Playlist') + (themed ? ' · 🎨 ' + themes.getTheme(themed).name : '')),
      ),
    )
  }

  // Liked songs come from the local cache, so sort + filter are instant.
  async function loadLiked() {
    await liked.load()
    const filter = h('input', { class: 'field', type: 'search', placeholder: 'Filter liked songs', autocomplete: 'off' })
    const info = h('div', { class: 'dim small' })
    const list = h('div', { class: 'list-inner' })
    let shown = 200

    const current = () => {
      const q = filter.value.trim()
      const base = q ? liked.searchLocal(q, 5000) : liked.all()
      return sortTracks(base, ls.get('likedSort', 'added'))
    }
    const draw = () => {
      const tracks = current()
      const st = liked.status()
      info.textContent = st.syncing
        ? 'Syncing your liked songs...'
        : `${st.count} songs` + (st.lastSync ? ` · synced ${new Date(st.lastSync).toLocaleString()}` : '')
      fill(list,
        ...tracks.slice(0, shown).map((t, i) => trackRow(t, () => mixes.playTracks(tracks.slice(i, i + 150)))),
      )
      if (tracks.length > shown)
        list.append(h('button', { class: 'btn ghost', onClick: () => ((shown += 300), draw()) }, `Show more (${tracks.length - shown} left)`))
      if (!tracks.length && !st.syncing) list.append(h('div', { class: 'empty' }, filter.value ? 'No matches' : 'No liked songs yet'))
    }
    filter.addEventListener('input', () => ((shown = 200), draw()))

    const actions = h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn primary', onClick: () => mixes.playTracks(current(), 'Playing liked songs') }, icon('play', 18), ' Play'),
      h(
        'button',
        {
          class: 'btn ghost',
          onClick: () => {
            achievements.unlock('dj')
            mixes.playTracks(mixes.smartShuffle(current()), 'Smart shuffle: no artist twice in a row')
          },
        },
        icon('shuffle', 18),
        ' Smart shuffle',
      ),
      h('button', { class: 'btn ghost', onClick: playRandomLiked }, icon('dice', 18), ' Random song'),
      sortButton(TRACK_SORTS, () => ls.get('likedSort', 'added'), (id) => (ls.set('likedSort', id), draw())),
      h('button', { class: 'ibtn', title: 'Sync now', 'aria-label': 'Sync now', onClick: () => liked.sync({ full: true }).catch((e) => toast(e.message)) }, icon('history', 20)),
    )
    fill(body, actions, filter, info, list)
    draw()
    const off1 = liked.onLiked('change', () => (list.isConnected ? draw() : off1()))
    const off2 = liked.onLiked('progress', (n, total) => {
      if (!info.isConnected) return off2()
      info.textContent = `Syncing your liked songs... ${n} / ${total}`
    })
    liked.ensureFresh().catch((e) => toast(e.message))
  }

  drawSeg()
  fill(root, h('h1', { class: 'title' }, 'Your Library'), seg, body)
  load()
}

export async function playRandomLiked() {
  try {
    const t = await liked.random()
    if (!t) return toast('No liked songs yet')
    if (await player.playBody({ uris: [t.uri] })) toast('🎲 ' + t.name + ' · ' + artistNames(t))
  } catch (e) {
    toast(e.message)
  }
}

// ---------- Playlist / album detail ----------
export function renderCollection(root, { kind, id, uri, name, image, owner }, { back }) {
  const list = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Loading...'))
  const subtitle = owner ? `By ${owner}` : ''
  let tracks = []
  let mode = 'default'

  const playBtn = h('button', { class: 'btn primary', onClick: () => player.playBody({ context_uri: uri }) }, icon('play', 18), ' Play')
  const shufBtn = h(
    'button',
    {
      class: 'btn ghost',
      onClick: async () => {
        if (tracks.length > 1) {
          achievements.unlock('dj')
          return mixes.playTracks(mixes.smartShuffle(tracks), 'Smart shuffle: no artist twice in a row')
        }
        await player.setShuffle(true)
        player.playBody({ context_uri: uri })
      },
    },
    icon('shuffle', 18),
    ' Shuffle',
  )
  const themeBtn = h('button', { class: 'btn ghost', onClick: pickTheme }, icon('palette', 18), ' Theme')
  const sortBtn = sortButton(TRACK_SORTS, () => mode, (m) => ((mode = m), drawList()))

  function pickTheme() {
    const cur = themes.getPlaylistTheme(uri)
    sheet({
      title: 'Theme while "' + name + '" plays',
      items: [
        { label: 'No special theme', active: !cur, onClick: () => (themes.setPlaylistTheme(uri, null), toast('Playlist theme removed')) },
        ...themes.allThemes().map((t) => ({ label: t.name, active: cur === t.id, onClick: () => (themes.setPlaylistTheme(uri, t.id), toast(`"${t.name}" will show while this plays`)) })),
      ],
    })
  }

  fill(root,
    h('button', { class: 'ibtn back', onClick: back, 'aria-label': 'Back' }, icon('back')),
    h(
      'div',
      { class: 'hero' },
      art(image, 'xl'),
      h('h1', { class: 'title' }, name),
      h('div', { class: 'dim' }, subtitle),
      h('div', { class: 'hero-actions' }, playBtn, shufBtn, themeBtn, sortBtn),
    ),
    list,
  )

  const menu = { contextUri: uri, playlistId: kind === 'playlist' ? id : undefined }
  // default order plays the real playlist; a custom sort plays our sorted list
  const rowPlay = (sorted, i) => () =>
    mode === 'default'
      ? player.playBody({ context_uri: uri, offset: { uri: sorted[i].uri } })
      : mixes.playTracks(sorted.slice(i, i + 150))

  function drawList() {
    const sorted = sortTracks(tracks, mode)
    fill(list, ...sorted.map((t, i) => trackRow(t, rowPlay(sorted, i), menu)))
    if (!sorted.length) list.append(h('div', { class: 'empty' }, 'No songs to show'))
  }

  ;(async () => {
    try {
      if (kind === 'album') {
        const a = await sp.album(id)
        tracks = (a.tracks?.items ?? []).map((t) => ({ ...t, album: { id: a.id, uri: a.uri, name: a.name, images: a.images } }))
      } else {
        tracks = (await sp.allPlaylistTracks(id)).map(({ track, addedAt }) => ({ ...track, addedAt }))
      }
      drawList()
    } catch (e) {
      if (e.status === 403 || e.status === 404) {
        fill(list,
          h('div', { class: 'empty' }, h('p', {}, 'Spotify only lets Pulse list songs for playlists you own or collaborate on.'), h('small', {}, 'You can still press Play above.')),
        )
      } else fill(list, errorBox(e, 'songs'))
    }
  })()
}
