// Queue builders: smart shuffle, artist interleave, mood mixes.

import * as player from './player.js'
import { toast } from './ui.js'

export function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const mainArtist = (t) => t.artists?.[0]?.id ?? t.artists?.[0]?.name ?? '?'

// Shuffle so the same artist never plays twice in a row (when possible).
// Always picks from the artist with the most songs left, so big artists get
// spread out instead of bunching up at the end.
export function smartShuffle(tracks) {
  const groups = new Map()
  for (const t of shuffle(tracks)) {
    const k = mainArtist(t)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(t)
  }
  const out = []
  let prev = null
  while (groups.size) {
    const options = [...groups.entries()].filter(([k]) => k !== prev)
    const pool = options.length ? options : [...groups.entries()]
    const max = Math.max(...pool.map(([, v]) => v.length))
    // among the fullest groups pick one at random
    const top = pool.filter(([, v]) => v.length >= max - 1)
    const [k, list] = top[Math.floor(Math.random() * top.length)]
    out.push(list.pop())
    if (!list.length) groups.delete(k)
    prev = k
  }
  return out
}

// Round-robin through several lists (each shuffled first).
export function interleave(lists) {
  const qs = lists.map((l) => shuffle(l))
  const out = []
  const seen = new Set()
  while (qs.some((q) => q.length)) {
    for (const q of qs) {
      const t = q.shift()
      if (t && !seen.has(t.uri)) {
        seen.add(t.uri)
        out.push(t)
      }
    }
  }
  return out
}

// Start playing a list of tracks. Spotify takes a limited list per request.
export async function playTracks(tracks, label) {
  const uris = tracks.map((t) => t.uri).filter(Boolean).slice(0, 150)
  if (!uris.length) return toast('No songs to play')
  const ok = await player.playBody({ uris })
  // keep our order: Spotify's own shuffle would mix it up again
  if (ok && player.state.shuffle) await player.setShuffle(false)
  if (ok && label) toast(label)
  return ok
}
