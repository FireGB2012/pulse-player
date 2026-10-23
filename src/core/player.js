// Player state + controls. Playback happens on a Spotify Connect device
// (on Android: the Spotify app on the phone). We poll /me/player for state and
// interpolate progress locally so the UI stays smooth.

import * as sp from './spotify.js'
import * as settings from './settings.js'
import { emitter } from './store.js'

const bus = emitter()

export const state = {
  hasDevice: false,
  device: null,
  isPlaying: false,
  track: null, // simplified Spotify track object
  progressMs: 0,
  durationMs: 0,
  shuffle: false,
  repeat: 'off',
  volume: 50,
  liked: false,
  contextUri: null,
}

let lastSync = 0
let pollTimer = null
let tickTimer = null
let lastTrackId = null

export const on = bus.on

function applyRemote(s) {
  if (!s || !s.device) {
    state.hasDevice = false
    state.device = null
    state.isPlaying = false
    bus.emit('state', state)
    return
  }
  const item = s.item && s.item.type !== 'episode' ? s.item : s.item || null
  state.hasDevice = true
  state.device = s.device
  state.isPlaying = !!s.is_playing
  state.progressMs = s.progress_ms ?? 0
  state.durationMs = item?.duration_ms ?? 0
  state.shuffle = !!s.shuffle_state
  state.repeat = s.repeat_state ?? 'off'
  if (!fading) state.volume = s.device.volume_percent ?? state.volume
  const ctx = s.context?.uri ?? null
  if (ctx !== state.contextUri) {
    state.contextUri = ctx
    bus.emit('context', ctx)
  }
  state.track = item
  lastSync = Date.now()

  const id = item?.id ?? null
  if (id !== lastTrackId) {
    lastTrackId = id
    state.liked = false
    bus.emit('track', item)
    if (item?.uri) sp.isSaved(item.uri).then((v) => ((state.liked = v), bus.emit('state', state))).catch(() => {})
  }
  bus.emit('state', state)
}

export async function refresh() {
  try {
    applyRemote(await sp.playerState())
  } catch (e) {
    bus.emit('error', e)
  }
}

export function start() {
  stop()
  refresh()
  const loop = () => {
    refresh().finally(() => {
      pollTimer = setTimeout(loop, state.isPlaying ? 4000 : 8000)
    })
  }
  pollTimer = setTimeout(loop, 4000)
  tickTimer = setInterval(() => {
    if (!state.isPlaying || !state.durationMs) return
    const p = Math.min(state.durationMs, state.progressMs + (Date.now() - lastSync))
    bus.emit('progress', p, state.durationMs)
  }, 250)
  document.addEventListener('visibilitychange', onVisible)
}

export function stop() {
  clearTimeout(pollTimer)
  clearInterval(tickTimer)
  document.removeEventListener('visibilitychange', onVisible)
}

function onVisible() {
  if (!document.hidden) refresh()
}

export const currentProgress = () =>
  state.isPlaying ? Math.min(state.durationMs, state.progressMs + (Date.now() - lastSync)) : state.progressMs

// Run a command, then re-sync shortly after.
async function cmd(fn) {
  try {
    await fn()
  } catch (e) {
    if (e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE') bus.emit('no-device')
    else bus.emit('error', e)
    return false
  }
  setTimeout(refresh, 450)
  return true
}

// ---- volume fades ----
let fading = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const canSetVolume = () => state.hasDevice && state.device?.supports_volume !== false

export async function fadeVolume(from, to, ms) {
  if (!canSetVolume()) return false
  fading = true
  try {
    const steps = Math.max(2, Math.min(12, Math.round(ms / 400)))
    for (let i = 1; i <= steps; i++) {
      await sp.volume(from + ((to - from) * i) / steps)
      if (i < steps) await sleep(ms / steps)
    }
    state.volume = to
    bus.emit('state', state)
    return true
  } catch {
    return false
  } finally {
    fading = false
  }
}

// Start playback, optionally fading the volume in (Settings > Player).
async function startPlaying(fn) {
  if (!settings.get('fadeIn') || !canSetVolume()) return fn()
  const target = state.volume || 50
  fading = true
  try {
    await sp.volume(Math.round(target * 0.08))
  } catch {}
  try {
    await fn()
  } catch (e) {
    fading = false
    sp.volume(target).catch(() => {})
    throw e
  }
  fadeVolume(Math.round(target * 0.08), target, settings.get('fadeInSeconds') * 1000)
}

export const toggle = () =>
  cmd(async () => {
    if (state.isPlaying) {
      state.isPlaying = false
      state.progressMs = currentProgress()
      bus.emit('state', state)
      await sp.pause()
    } else {
      state.isPlaying = true
      lastSync = Date.now()
      bus.emit('state', state)
      await startPlaying(() => sp.play())
    }
  })

export const next = () => cmd(() => sp.next())
export const previous = () => cmd(() => sp.previous())

export const seek = (ms) =>
  cmd(async () => {
    state.progressMs = ms
    lastSync = Date.now()
    await sp.seek(ms)
  })

export const setShuffle = (on) =>
  cmd(async () => {
    state.shuffle = on
    bus.emit('state', state)
    await sp.shuffle(on)
  })

export const cycleRepeat = () => {
  const nextMode = { off: 'context', context: 'track', track: 'off' }[state.repeat] ?? 'off'
  return cmd(async () => {
    state.repeat = nextMode
    bus.emit('state', state)
    await sp.repeat(nextMode)
  })
}

export const setVolume = (pct) =>
  cmd(async () => {
    state.volume = pct
    await sp.volume(pct)
  })

export async function toggleLike() {
  const uri = state.track?.uri
  if (!uri) return
  const want = !state.liked
  state.liked = want
  bus.emit('state', state)
  try {
    await (want ? sp.saveItem(uri) : sp.removeItem(uri))
    bus.emit('liked', state.track, want)
  } catch (e) {
    state.liked = !want
    bus.emit('state', state)
    bus.emit('error', e)
  }
}

// body: { uris: [...] } or { context_uri, offset: { uri } }
export const playBody = (body) => cmd(() => startPlaying(() => sp.play(body, state.hasDevice ? undefined : pickedDevice())))

export const addToQueue = (uri) => cmd(() => sp.queueAdd(uri))
export async function getQueue() {
  const q = await sp.queue()
  return { current: q?.currently_playing ?? null, queue: (q?.queue ?? []).filter(Boolean) }
}

let preferredDevice = null
export const pickedDevice = () => preferredDevice
export const setPreferredDevice = (id) => (preferredDevice = id)

export async function transferTo(deviceId) {
  const ok = await cmd(() => sp.transfer(deviceId, true))
  if (ok) preferredDevice = deviceId
  return ok
}

export const getDevices = async () => (await sp.devices())?.devices ?? []
