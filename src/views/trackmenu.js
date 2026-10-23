// Long-press menu for a song, queue viewer, mood + note editors.

import * as sp from '../core/spotify.js'
import * as player from '../core/player.js'
import * as tags from '../core/tags.js'
import * as nav from '../core/nav.js'
import * as achievements from '../core/achievements.js'
import { noteLiked } from '../core/likedcache.js'
import { h, icon, sheet, toast, pickImage, artistNames, promptSheet, copyText, fill } from '../core/ui.js'

export function openTrackMenu(t, { contextUri, playlistId } = {}) {
  if (!t?.uri) return
  const items = [
    { label: 'Play now', onClick: () => player.playBody(contextUri ? { context_uri: contextUri, offset: { uri: t.uri } } : { uris: [t.uri] }) },
    {
      label: 'Play next',
      sub: 'Adds it to your queue',
      onClick: async () => (await player.addToQueue(t.uri)) && toast('Playing next: ' + t.name),
    },
    { label: 'Show queue', onClick: openQueue },
  ]
  if (t.album?.id)
    items.push({
      label: 'Go to album',
      sub: t.album.name,
      onClick: () => nav.go('collection', { kind: 'album', id: t.album.id, uri: t.album.uri ?? `spotify:album:${t.album.id}`, name: t.album.name, image: pickImage(t.album.images, 300), owner: artistNames(t) }),
    })
  for (const a of (t.artists ?? []).slice(0, 2))
    if (a.uri || a.id) items.push({ label: 'Play ' + a.name, sub: 'Artist radio from their top songs', onClick: () => player.playBody({ context_uri: a.uri ?? `spotify:artist:${a.id}` }) })
  items.push(
    { label: 'Like / unlike', onClick: () => toggleSaved(t) },
    { label: 'Mood tags', sub: tags.getMoods(t.uri).join(', ') || 'None yet', onClick: () => openMoodPicker(t) },
    { label: tags.getNote(t.uri) ? 'Edit note' : 'Add a note', sub: tags.getNote(t.uri) || undefined, onClick: () => editNote(t) },
    { label: 'Add to playlist', onClick: () => addToPlaylistSheet([t]) },
    { label: 'Copy Spotify link', onClick: () => copyText(`https://open.spotify.com/track/${t.id}`, 'Link copied') },
  )
  if (playlistId)
    items.push({
      label: 'Remove from this playlist',
      onClick: async () => {
        try {
          await sp.removeFromPlaylist(playlistId, [t.uri])
          toast('Removed')
        } catch (e) {
          toast(e.message)
        }
      },
    })
  sheet({ title: `${t.name} · ${artistNames(t)}`, items })
}

async function toggleSaved(t) {
  try {
    const saved = await sp.isSaved(t.uri)
    await (saved ? sp.removeItem(t.uri) : sp.saveItem(t.uri))
    noteLiked(t, !saved)
    if (player.state.track?.uri === t.uri) {
      player.state.liked = !saved
      player.refresh()
    }
    toast(saved ? 'Removed from Liked Songs' : 'Added to Liked Songs')
    if (!saved) {
      achievements.unlock('first-like')
      if (achievements.bump('likes') >= 25) achievements.unlock('likes-25')
    }
  } catch (e) {
    toast(e.message)
  }
}

export async function openQueue() {
  let q
  try {
    q = await player.getQueue()
  } catch (e) {
    return toast('Could not load the queue: ' + e.message)
  }
  const row = (t, i) =>
    h(
      'div',
      { class: 'row static' },
      t.album?.images?.length ? h('img', { class: 'art sm', src: pickImage(t.album.images, 64), alt: '' }) : h('div', { class: 'art sm ph' }, icon('note', 20)),
      h('div', { class: 'meta' }, h('div', { class: 't' }, t.name), h('div', { class: 's' }, artistNames(t) || t.show?.name || '')),
      i != null ? h('span', { class: 'dur' }, '#' + (i + 1)) : null,
    )
  const box = h(
    'div',
    { class: 'sheet-pad queue' },
    q.current ? [h('div', { class: 'sec' }, 'Now playing'), row(q.current)] : null,
    h('div', { class: 'sec' }, 'Up next'),
    q.queue.length ? q.queue.slice(0, 30).map(row) : h('p', { class: 'dim' }, 'Nothing queued. Long-press any song and pick "Play next".'),
  )
  sheet({ title: 'Queue', content: box })
}

export function openMoodPicker(t) {
  let chosen = new Set(tags.getMoods(t.uri))
  const grid = h('div', { class: 'chips' })
  const draw = () => {
    fill(grid, 
      ...tags.moods().map((m) =>
        h(
          'button',
          {
            class: 'chip' + (chosen.has(m.id) ? ' on' : ''),
            onClick: () => {
              chosen.has(m.id) ? chosen.delete(m.id) : chosen.add(m.id)
              draw()
            },
          },
          `${m.emoji} ${m.name}`,
        ),
      ),
      h(
        'button',
        {
          class: 'chip ghost',
          onClick: async () => {
            const name = await promptSheet({ title: 'New mood', placeholder: 'e.g. Rainy day' })
            if (name?.trim()) {
              const id = tags.addMood(name.trim())
              if (id) chosen.add(id)
            }
            draw()
          },
        },
        '+ New mood',
      ),
    )
  }
  draw()
  const close = sheet({
    title: 'Moods for ' + t.name,
    content: h(
      'div',
      { class: 'sheet-pad' },
      grid,
      h(
        'button',
        {
          class: 'btn primary',
          onClick: () => {
            tags.setMoods(t, [...chosen])
            if (tags.taggedCount() >= 10) achievements.unlock('mood-tagger')
            toast('Moods saved')
            close()
          },
        },
        'Save',
      ),
    ),
  })
}

export async function editNote(t) {
  const text = await promptSheet({ title: 'Note on ' + t.name, value: tags.getNote(t.uri), placeholder: 'What does this song mean to you?', multiline: true })
  if (text == null) return
  tags.setNote(t, text)
  if (text.trim()) achievements.unlock('note-taker')
  toast(text.trim() ? 'Note saved' : 'Note removed')
}

// Pick one of your playlists and add the tracks to it.
export async function addToPlaylistSheet(tracks) {
  let me
  let lists
  try {
    ;[me, lists] = await Promise.all([sp.me(), sp.allMyPlaylists()])
  } catch (e) {
    return toast(e.message)
  }
  const mine = lists.filter((p) => p.owner?.id === me.id || p.collaborative)
  sheet({
    title: 'Add to playlist',
    items: [
      {
        label: '+ New playlist',
        onClick: async () => {
          const name = await promptSheet({ title: 'New playlist', placeholder: 'Name' })
          if (!name?.trim()) return
          try {
            const p = await sp.createPlaylist(name.trim(), 'Made with Pulse')
            await sp.addToPlaylist(p.id, tracks.map((t) => t.uri))
            toast('Created "' + name.trim() + '"')
          } catch (e) {
            toast(e.message)
          }
        },
      },
      ...mine.map((p) => ({
        label: p.name,
        onClick: async () => {
          try {
            await sp.addToPlaylist(p.id, tracks.map((t) => t.uri))
            toast('Added to ' + p.name)
          } catch (e) {
            toast(e.message)
          }
        },
      })),
    ],
  })
}
