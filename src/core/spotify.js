// Thin Spotify Web API client. Only uses endpoints that still work for
// Development Mode apps (Feb 2026 rules): no batch fetches, search limit <= 10.

import { getToken } from './auth.js'

const BASE = 'https://api.spotify.com/v1'

export class SpotifyError extends Error {
  constructor(status, message, reason) {
    super(message)
    this.status = status
    this.reason = reason
  }
}

export async function api(path, { method = 'GET', query, body, retry = true } = {}) {
  const url = new URL(path.startsWith('http') ? path : BASE + path)
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v)

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + (await getToken()),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 429 && retry) {
    const wait = Math.min(Number(res.headers.get('Retry-After') ?? 1), 10)
    await new Promise((r) => setTimeout(r, wait * 1000))
    return api(path, { method, query, body, retry: false })
  }
  if (res.status === 204) return null

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {}
  if (!res.ok) throw new SpotifyError(res.status, data?.error?.message || res.statusText, data?.error?.reason)
  return data
}

// ---- library / browsing ----
export const me = () => api('/me')
export const myPlaylists = (offset = 0) => api('/me/playlists', { query: { limit: 50, offset } })
export const playlistItems = (id, offset = 0) =>
  api(`/playlists/${id}/items`, { query: { limit: 50, offset, additional_types: 'track' } })
export const savedTracks = (offset = 0) => api('/me/tracks', { query: { limit: 50, offset } })
export const album = (id) => api(`/albums/${id}`)
export const search = (q) =>
  api('/search', { query: { q, type: 'track,album,artist,playlist', limit: 10 } })

// ---- player ----
export const playerState = () => api('/me/player', { query: { additional_types: 'track' } })
export const devices = () => api('/me/player/devices')
export const transfer = (deviceId, play = true) =>
  api('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play } })
export const play = (body, deviceId) =>
  api('/me/player/play', { method: 'PUT', query: { device_id: deviceId }, body })
export const pause = () => api('/me/player/pause', { method: 'PUT' })
export const next = () => api('/me/player/next', { method: 'POST' })
export const previous = () => api('/me/player/previous', { method: 'POST' })
export const seek = (ms) => api('/me/player/seek', { method: 'PUT', query: { position_ms: Math.round(ms) } })
export const shuffle = (on) => api('/me/player/shuffle', { method: 'PUT', query: { state: !!on } })
export const repeat = (mode) => api('/me/player/repeat', { method: 'PUT', query: { state: mode } })
export const volume = (pct) =>
  api('/me/player/volume', { method: 'PUT', query: { volume_percent: Math.round(pct) } })
export const queueAdd = (uri) => api('/me/player/queue', { method: 'POST', query: { uri } })

// ---- generic library (Feb 2026): works with any Spotify URI ----
export const saveItem = (uri) => api('/me/library', { method: 'PUT', query: { uris: uri } })
export const removeItem = (uri) => api('/me/library', { method: 'DELETE', query: { uris: uri } })
export const isSaved = async (uri) => {
  const r = await api('/me/library/contains', { query: { uris: uri } })
  return Array.isArray(r) ? !!r[0] : false
}

// Playlist payloads were renamed (tracks -> items, track -> item). Handle both.
export const entryTrack = (e) => e?.item ?? e?.track ?? null
export const playlistTotal = (p) => p?.items?.total ?? p?.tracks?.total ?? null

// ---- queue / stats / history ----
export const queue = () => api('/me/player/queue')
// type: 'artists' | 'tracks', range: 'short_term' (4 weeks) | 'medium_term' (6 months) | 'long_term'
export const top = (type, range = 'short_term', limit = 20) =>
  api(`/me/top/${type}`, { query: { time_range: range, limit } })
export const recentlyPlayed = (after) => api('/me/player/recently-played', { query: { limit: 50, after } })

// ---- playlist editing (only works on playlists you own) ----
export async function createPlaylist(name, description = '') {
  const body = { name, description, public: false }
  try {
    return await api('/me/playlists', { method: 'POST', body })
  } catch (e) {
    if (e.status !== 404 && e.status !== 405) throw e
    const u = await me()
    return api(`/users/${encodeURIComponent(u.id)}/playlists`, { method: 'POST', body })
  }
}

export async function addToPlaylist(id, uris, position) {
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100)
    await api(`/playlists/${id}/items`, {
      method: 'POST',
      body: { uris: chunk, ...(position != null ? { position: position + i } : {}) },
    })
  }
}

// Removes every occurrence of each uri.
export async function removeFromPlaylist(id, uris) {
  for (let i = 0; i < uris.length; i += 100) {
    const list = uris.slice(i, i + 100).map((uri) => ({ uri }))
    await api(`/playlists/${id}/items`, { method: 'DELETE', body: { items: list, tracks: list } })
  }
}

// Every page of a paged endpoint. fetchPage(offset) -> { items, next, total }
export async function allPages(fetchPage, onProgress) {
  const out = []
  let offset = 0
  for (;;) {
    const page = await fetchPage(offset)
    const items = page?.items ?? []
    out.push(...items)
    offset += items.length
    onProgress?.(out.length, page?.total ?? out.length)
    if (!page?.next || !items.length) return out
  }
}

export const allMyPlaylists = () => allPages(myPlaylists).then((l) => l.filter(Boolean))
export const allPlaylistTracks = (id) =>
  allPages((o) => playlistItems(id, o)).then((l) =>
    l.map((e) => ({ track: entryTrack(e), addedAt: e?.added_at ?? null })).filter((x) => x.track && x.track.type !== 'episode'),
  )
