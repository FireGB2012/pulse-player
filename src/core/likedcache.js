// Local copy of your Liked Songs (IndexedDB) for instant search, timelines,
// "On this day", artist mixes and the song game.

import * as sp from './spotify.js'
import * as db from './db.js'
import { ls, emitter } from './store.js'

const bus = emitter()
export const onLiked = bus.on

let rows = null // in-memory copy, newest first
let syncing = null

// Keep only what Pulse needs, so thousands of songs stay small.
export function slimTrack(t) {
  if (!t) return null
  const imgs = [...(t.album?.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const small = imgs.find((i) => (i.width ?? 0) >= 64) ?? imgs[0]
  const big = imgs.find((i) => (i.width ?? 0) >= 300) ?? imgs[imgs.length - 1]
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists ?? []).map((a) => ({ id: a.id, name: a.name, uri: a.uri })),
    album: {
      id: t.album?.id,
      uri: t.album?.uri,
      name: t.album?.name,
      release_date: t.album?.release_date,
      images: [small, big].filter(Boolean).map((i) => ({ url: i.url, width: i.width, height: i.height })),
    },
    duration_ms: t.duration_ms,
  }
}

export async function load() {
  if (rows) return rows
  try {
    rows = (await db.getAll('liked')).sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''))
  } catch {
    rows = []
  }
  return rows
}

export const status = () => ({
  count: rows?.length ?? 0,
  lastSync: ls.get('likedSyncAt', 0),
  syncing: !!syncing,
})

// Pull new likes. Does a full re-download when songs were removed.
export function sync({ full = false } = {}) {
  syncing ??= doSync(full).finally(() => {
    syncing = null
    bus.emit('change')
  })
  bus.emit('change')
  return syncing
}

async function doSync(full) {
  await load()
  const known = new Set(rows.map((r) => r.id))
  const fresh = []
  let offset = 0
  let total = 0
  for (;;) {
    const page = await sp.savedTracks(offset)
    total = page.total ?? 0
    const items = (page.items ?? []).filter((e) => e?.track?.id)
    let allKnown = items.length > 0
    for (const e of items) {
      if (!known.has(e.track.id)) allKnown = false
      fresh.push({ ...slimTrack(e.track), addedAt: e.added_at })
    }
    offset += page.items?.length ?? 0
    bus.emit('progress', offset, total)
    if (!page.next || !items.length) break
    if (!full && allKnown) break
  }
  const merged = new Map(rows.map((r) => [r.id, r]))
  for (const r of fresh) merged.set(r.id, r)
  let next = [...merged.values()]
  if (full) {
    const keep = new Set(fresh.map((r) => r.id))
    next = next.filter((r) => keep.has(r.id))
  } else if (next.length !== total) {
    // something was un-liked somewhere else; redo it properly
    return doSync(true)
  }
  await db.clear('liked')
  await db.putMany('liked', next)
  rows = next.sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''))
  ls.set('likedSyncAt', Date.now())
  return rows
}

// Sync if the cache is older than maxAgeMs (default 6 h).
export async function ensureFresh(maxAgeMs = 6 * 3600_000) {
  await load()
  if (!rows.length || Date.now() - ls.get('likedSyncAt', 0) > maxAgeMs) {
    try {
      await sync()
    } catch {}
  }
  return rows
}

export function noteLiked(track, liked) {
  if (!rows || !track?.id) return
  if (liked && !rows.some((r) => r.id === track.id)) {
    const row = { ...slimTrack(track), addedAt: new Date().toISOString() }
    rows.unshift(row)
    db.putMany('liked', [row]).catch(() => {})
  } else if (!liked) {
    rows = rows.filter((r) => r.id !== track.id)
    db.del('liked', track.id).catch(() => {})
  }
  bus.emit('change')
}

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function searchLocal(q, limit = 30) {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (!words.length || !rows) return []
  const out = []
  for (const r of rows) {
    const hay = norm(`${r.name} ${r.artists.map((a) => a.name).join(' ')} ${r.album?.name}`)
    if (words.every((w) => hay.includes(w))) {
      out.push(r)
      if (out.length >= limit) break
    }
  }
  return out
}

// Songs you liked on this day in earlier years.
export function onThisDay(date = new Date()) {
  const m = date.getMonth()
  const d = date.getDate()
  const y = date.getFullYear()
  return (rows ?? []).filter((r) => {
    if (!r.addedAt) return false
    const a = new Date(r.addedAt)
    return a.getMonth() === m && a.getDate() === d && a.getFullYear() < y
  })
}

export function byYear() {
  const map = new Map()
  for (const r of rows ?? []) {
    const y = r.addedAt ? new Date(r.addedAt).getFullYear() : 'Unknown'
    if (!map.has(y)) map.set(y, [])
    map.get(y).push(r)
  }
  return [...map.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0])))
}

export function artists() {
  const map = new Map()
  for (const r of rows ?? []) {
    for (const a of r.artists) {
      const e = map.get(a.id) ?? { id: a.id, name: a.name, count: 0 }
      e.count++
      map.set(a.id, e)
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export const tracksByArtist = (artistId) => (rows ?? []).filter((r) => r.artists.some((a) => a.id === artistId))
export const all = () => rows ?? []

export async function random() {
  await load()
  if (rows.length) return rows[Math.floor(Math.random() * rows.length)]
  const first = await sp.savedTracks(0)
  if (!first.total) return null
  const page = await sp.api('/me/tracks', { query: { limit: 1, offset: Math.floor(Math.random() * first.total) } })
  return page.items?.[0]?.track ?? null
}
