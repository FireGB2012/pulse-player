// 23. Wake-up alarm that starts a playlist.
// Android: the system alarm clock opens Pulse at the right time (works when
// Pulse is closed). PC/web: works while Pulse is open.

import * as player from './player.js'
import * as native from './native.js'
import * as achievements from './achievements.js'
import { ls, emitter } from './store.js'
import { stayAwake } from './wake.js'
import { h, icon, overlay, toast } from './ui.js'

const bus = emitter()
export const onAlarm = bus.on

// { enabled, time: 'HH:MM', daily, playlistUri, playlistName, fade, snoozeUntil }
export const get = () => ({ enabled: false, time: '07:30', daily: true, playlistUri: '', playlistName: '', fade: true, ...ls.get('alarm', {}) })

export function nextFire(a = get()) {
  if (!a.enabled) return null
  if (a.snoozeUntil && a.snoozeUntil > Date.now()) return a.snoozeUntil
  const [hh, mm] = a.time.split(':').map(Number)
  const d = new Date()
  d.setHours(hh, mm, 0, 0)
  if (d.getTime() <= Date.now() + 5000) d.setDate(d.getDate() + 1)
  return d.getTime()
}

export function save(patch) {
  const a = { ...get(), ...patch }
  ls.set('alarm', a)
  schedule()
  bus.emit('change', a)
  return a
}

function schedule() {
  const at = nextFire()
  if (native.isAndroid) {
    if (at) native.scheduleAlarm(at, get().playlistName || 'Pulse alarm')
    else native.cancelAlarm()
  }
}

// PC/web: check while the app is open.
let checker = null
export function start() {
  schedule()
  if (native.isAndroid) return
  clearInterval(checker)
  checker = setInterval(() => {
    const at = nextFire()
    if (at && Date.now() >= at && Date.now() - at < 120_000) ring()
  }, 15_000)
}

let ringing = null
// test: from the "Test it now" button; leaves the alarm settings alone
export async function ring({ test = false } = {}) {
  if (ringing) return
  const a = get()
  // move on to the next day (or switch off a one-time alarm) right away
  if (!test) {
    if (a.daily) save({ snoozeUntil: 0 })
    else save({ enabled: false, snoozeUntil: 0 })
  }

  const release = stayAwake()
  const clock = h('div', { class: 'alarm-clock' })
  const info = h('div', { class: 'alarm-info' }, 'Starting your music...')
  const tick = () => (clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  tick()
  const t = setInterval(tick, 5000)
  ringing = overlay(
    'alarm',
    [
      h('div', { class: 'alarm-sun' }, '☀️'),
      clock,
      h('div', { class: 'alarm-hello' }, 'Good morning!'),
      info,
      h(
        'div',
        { class: 'alarm-buttons' },
        h('button', { class: 'btn ghost big', onClick: snooze }, 'Snooze 9 min'),
        h('button', { class: 'btn primary big', onClick: () => ringing?.close() }, "I'm up"),
      ),
    ],
    () => {
      clearInterval(t)
      release()
      ringing = null
    },
  )
  if (!test) achievements.unlock('wake-up')
  const ok = await startMusic(a, (msg) => (info.textContent = msg))
  if (ok) info.textContent = a.playlistName ? `Playing ${a.playlistName}` : 'Playing'
}

async function snooze() {
  ringing?.close()
  if (player.state.isPlaying) await player.toggle()
  save({ enabled: true, snoozeUntil: Date.now() + 9 * 60_000 })
  toast('Snoozed for 9 minutes')
}

// Spotify must be running somewhere. On Android, open it if no device shows up.
async function startMusic(a, say) {
  let devices = await player.getDevices().catch(() => [])
  if (!devices.length && native.isAndroid) {
    say('Opening Spotify...')
    location.href = 'spotify:'
    for (let i = 0; i < 20 && !devices.length; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      devices = await player.getDevices().catch(() => [])
    }
  }
  if (!devices.length) {
    say('No Spotify device found. Open Spotify and press play.')
    return false
  }
  const dev = devices.find((d) => d.is_active) ?? devices.find((d) => d.type === 'Smartphone') ?? devices[0]
  if (!player.state.hasDevice) await player.transferTo(dev.id)
  const body = a.playlistUri ? { context_uri: a.playlistUri } : undefined
  if (a.fade && player.canSetVolume()) {
    const target = player.state.volume || 60
    await player.setVolume(5)
    const ok = body ? await player.playBody(body) : await player.toggle()
    player.fadeVolume(5, target, 30_000)
    return ok
  }
  return body ? player.playBody(body) : player.toggle()
}
