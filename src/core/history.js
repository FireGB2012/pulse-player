// Your own listening history, kept forever on this device. Spotify only
// remembers your last 50 plays, so Pulse copies them over regularly.

import * as sp from './spotify.js'
import * as db from './db.js'
import * as player from './player.js'
import { hasScopes } from './auth.js'
import { ls, emitter } from './store.js'

const bus = emitter()
export const onHistory = bus.on

let plays = null // newest first

function slimPlay(t, playedAt, contextUri, source) {
  const imgs = [...(t.album?.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const img = imgs.find((i) => (i.width ?? 0) >= 64) ?? imgs[0]
  return {
    playedAt,
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists ?? []).map((a) => ({ id: a.id, name: a.name })),
    album: t.album?.name ?? '',
    image: img?.url ?? '',
    durationMs: t.duration_ms ?? 0,
    contextUri: contextUri ?? null,
    source,
  }
}

export async function load() {
  if (plays) return plays
  try {
    plays = (await db.getAll('plays')).sort((a, b) => b.playedAt - a.playedAt)
  } catch {
    plays = []
  }
  return plays
}

async function add(rows) {
  await load()
  const have = new Set(plays.map((p) => p.playedAt))
  const fresh = rows.filter((r) => r.id && !have.has(r.playedAt))
  if (!fresh.length) return 0
  await db.putMany('plays', fresh)
  plays = [...fresh, ...plays].sort((a, b) => b.playedAt - a.playedAt)
  bus.emit('change')
  return fresh.length
}

// Copy new plays from Spotify's "recently played".
let syncing = null
export function sync() {
  syncing ??= (async () => {
    if (!hasScopes(['user-read-recently-played'])) return 0
    const after = ls.get('historyCursor', 0)
    const r = await sp.recentlyPlayed(after || undefined)
    const rows = (r?.items ?? [])
      .filter((i) => i.track)
      .map((i) => slimPlay(i.track, Date.parse(i.played_at), i.context?.uri, 'spotify'))
    const added = await add(rows)
    const newest = Math.max(after, ...rows.map((x) => x.playedAt))
    if (newest > after) ls.set('historyCursor', newest)
    return added
  })().finally(() => (syncing = null))
  return syncing
}

// Without the history permission, log what Pulse sees playing (after 30 s).
let watchTimer = null
function watchLocally(track) {
  clearTimeout(watchTimer)
  if (!track?.id || hasScopes(['user-read-recently-played'])) return
  const startedAt = Date.now()
  watchTimer = setTimeout(() => {
    if (player.state.track?.id === track.id && player.state.isPlaying)
      add([slimPlay(track, startedAt, player.state.contextUri, 'pulse')]).catch(() => {})
  }, 30_000)
}

let started = false
export function start() {
  if (started) return
  started = true
  load().then(() => sync().catch(() => {}))
  setInterval(() => sync().catch(() => {}), 10 * 60_000)
  let t = null
  player.on('track', (track) => {
    watchLocally(track)
    clearTimeout(t)
    t = setTimeout(() => sync().catch(() => {}), 45_000)
  })
}

export const all = () => plays ?? []

// ---- stats ----
const dayKey = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// Days in a row (ending today or yesterday) with at least one play.
export function streak() {
  const days = new Set(all().map((p) => dayKey(p.playedAt)))
  const d = new Date()
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dayKey(d.getTime()))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function longestStreak() {
  const days = [...new Set(all().map((p) => dayKey(p.playedAt)))]
    .map((k) => {
      const [y, m, d] = k.split('-').map(Number)
      return new Date(y, m, d).getTime()
    })
    .sort((a, b) => a - b)
  let best = 0
  let cur = 0
  let prev = null
  for (const t of days) {
    cur = prev != null && Math.round((t - prev) / 86400000) === 1 ? cur + 1 : 1
    best = Math.max(best, cur)
    prev = t
  }
  return best
}

function topBy(list, keyFn, labelFn, n = 5) {
  const map = new Map()
  for (const p of list) {
    for (const k of [].concat(keyFn(p))) {
      if (!k) continue
      const e = map.get(k.key) ?? { ...k, count: 0, ms: 0 }
      e.count++
      e.ms += p.durationMs
      map.set(k.key, e)
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, n).map(labelFn ?? ((x) => x))
}

// Summary of plays since `sinceMs`.
export function summary(sinceMs) {
  const list = all().filter((p) => p.playedAt >= sinceMs)
  const minutes = Math.round(list.reduce((s, p) => s + p.durationMs, 0) / 60000)
  const topArtists = topBy(list, (p) => p.artists.map((a) => ({ key: a.id, name: a.name })))
  const topTracks = topBy(list, (p) => ({ key: p.id, name: p.name, artists: p.artists.map((a) => a.name).join(', '), image: p.image, uri: p.uri }))
  const perDay = new Map()
  const perHour = new Array(24).fill(0)
  for (const p of list) {
    const d = new Date(p.playedAt)
    const k = d.toLocaleDateString(undefined, { weekday: 'long' })
    perDay.set(k, (perDay.get(k) ?? 0) + 1)
    perHour[d.getHours()]++
  }
  const busiestDay = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const topHour = list.length ? perHour.indexOf(Math.max(...perHour)) : null
  return { plays: list.length, minutes, topArtists, topTracks, busiestDay, topHour, perHour }
}

export function exportJson() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), plays: all() }, null, 1)
}

export async function importJson(text) {
  const data = JSON.parse(text)
  const rows = (data.plays ?? data).filter((p) => p && p.playedAt && p.id)
  return add(rows)
}
