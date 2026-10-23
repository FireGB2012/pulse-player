import * as sp from '../core/spotify.js'
import * as player from '../core/player.js'
import * as liked from '../core/likedcache.js'
import * as mixes from '../core/mixes.js'
import { h, icon, pickImage, fill } from '../core/ui.js'
import { trackRow } from './library.js'

const art = (url) => (url ? h('img', { class: 'art sm', src: url, loading: 'lazy', alt: '' }) : h('div', { class: 'art sm ph' }, icon('note', 20)))

export function renderSearch(root, { go }) {
  const results = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Search songs, albums, artists, playlists'))
  // instant results from your cached Liked Songs, shown while Spotify answers
  const local = h('div', { class: 'list' })
  liked.load()
  function drawLocal(q) {
    const hits = q ? liked.searchLocal(q, 6) : []
    fill(local, 
      ...(hits.length ? [h('h2', { class: 'sec' }, 'In your Liked Songs'), ...hits.map((t) => trackRow(t, () => mixes.playTracks([t])))] : []),
    )
  }
  const input = h('input', {
    class: 'field',
    type: 'search',
    placeholder: 'What do you want to hear?',
    autocomplete: 'off',
    enterkeyhint: 'search',
  })

  let timer
  let seq = 0
  input.addEventListener('input', () => {
    clearTimeout(timer)
    const q = input.value.trim()
    drawLocal(q)
    if (!q) return fill(results, h('div', { class: 'empty' }, 'Search songs, albums, artists, playlists'))
    timer = setTimeout(() => run(q), 350)
  })

  const section = (label, nodes) => (nodes.length ? [h('h2', { class: 'sec' }, label), ...nodes] : [])

  async function run(q) {
    const mine = ++seq
    try {
      const r = await sp.search(q)
      if (mine !== seq) return
      const tracks = (r.tracks?.items ?? []).filter(Boolean)
      const albums = (r.albums?.items ?? []).filter(Boolean)
      const artists = (r.artists?.items ?? []).filter(Boolean)
      const playlists = (r.playlists?.items ?? []).filter(Boolean)

      fill(results, 
        ...section('Songs', tracks.map((t) => trackRow(t, () => player.playBody({ uris: [t.uri] })))),
        ...section(
          'Artists',
          artists.map((a) =>
            h(
              'button',
              { class: 'row', onClick: () => player.playBody({ context_uri: a.uri }) },
              art(pickImage(a.images, 64)),
              h('div', { class: 'meta' }, h('div', { class: 't' }, a.name), h('div', { class: 's' }, 'Artist · tap to play')),
            ),
          ),
        ),
        ...section(
          'Albums',
          albums.map((a) =>
            h(
              'button',
              { class: 'row', onClick: () => go('collection', { kind: 'album', id: a.id, uri: a.uri, name: a.name, image: pickImage(a.images, 300), owner: a.artists?.map((x) => x.name).join(', ') }) },
              art(pickImage(a.images, 64)),
              h('div', { class: 'meta' }, h('div', { class: 't' }, a.name), h('div', { class: 's' }, 'Album · ' + (a.artists ?? []).map((x) => x.name).join(', '))),
            ),
          ),
        ),
        ...section(
          'Playlists',
          playlists.map((p) =>
            h(
              'button',
              { class: 'row', onClick: () => go('collection', { kind: 'playlist', id: p.id, uri: p.uri, name: p.name, image: pickImage(p.images, 300), owner: p.owner?.display_name }) },
              art(pickImage(p.images, 64)),
              h('div', { class: 'meta' }, h('div', { class: 't' }, p.name), h('div', { class: 's' }, 'Playlist')),
            ),
          ),
        ),
      )
      if (!results.children.length) results.append(h('div', { class: 'empty' }, 'Nothing found'))
    } catch (e) {
      if (mine === seq) fill(results, h('div', { class: 'empty' }, h('p', {}, 'Search failed.'), h('small', {}, e.message)))
    }
  }

  fill(root, h('h1', { class: 'title' }, 'Search'), input, local, results)
}
