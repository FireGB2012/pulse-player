// Add-on host. An add-on is an ES module whose default export is:
//   { id, name, version?, description?, defaultEnabled?, setup(api) -> teardown? }
// Built-ins live in src/plugins/*.js. Users can import their own (stored in
// localStorage and loaded through a blob: module URL).

import { ls, emitter } from './store.js'
import * as player from './player.js'
import * as sp from './spotify.js'
import * as themes from './themes.js'
import { toast, sheet, icon } from './ui.js'

const builtinModules = import.meta.glob('../plugins/*.js', { eager: true })
const builtins = Object.values(builtinModules)
  .map((m) => m.default)
  .filter(Boolean)

const bus = emitter()
export const onPluginsChange = bus.on

const running = new Map() // id -> { cleanups: [], teardown }
const status = new Map() // id -> { error? }
const panels = new Map() // `${pid}:${id}` -> { pluginId, id, title, icon, render }
const buttons = new Map() // `${pid}:${id}` -> { pluginId, id, icon, title, onClick }

export const getPanels = () => [...panels.values()]
export const getButtons = () => [...buttons.values()]

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/

function validate(def) {
  if (!def || typeof def !== 'object') throw new Error('Add-on must export a default object')
  if (!ID_RE.test(def.id ?? '')) throw new Error('Add-on "id" must be lowercase letters, numbers and dashes')
  if (!def.name) throw new Error('Add-on needs a "name"')
  if (typeof def.setup !== 'function') throw new Error('Add-on needs a setup(api) function')
  return def
}

async function importFromSource(code) {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  try {
    const mod = await import(/* @vite-ignore */ url)
    return validate(mod.default)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const userSources = () => ls.get('userPlugins', []) // [{id, name, code}]
const enabledMap = () => ls.get('pluginsEnabled', {})

function makeApi(def, ctx) {
  const key = (id) => `${def.id}:${id}`
  const own = (unsub) => {
    ctx.cleanups.push(unsub)
    return unsub
  }
  return Object.freeze({
    id: def.id,
    player: Object.freeze({
      get state() {
        return { ...player.state, progressMs: player.currentProgress() }
      },
      // events: 'state' | 'track' | 'progress' (ms, durationMs)
      on: (ev, fn) => own(player.on(ev, fn)),
      toggle: () => player.toggle(),
      pause: () => (player.state.isPlaying ? player.toggle() : Promise.resolve()),
      resume: () => (player.state.isPlaying ? Promise.resolve() : player.toggle()),
      next: () => player.next(),
      previous: () => player.previous(),
      seek: (ms) => player.seek(ms),
      setVolume: (pct) => player.setVolume(pct),
    }),
    ui: Object.freeze({
      // render(container) may return a cleanup function
      addPanel({ id, title, icon: ic = 'puzzle', render }) {
        panels.set(key(id), { pluginId: def.id, id, title, icon: ic, render })
        bus.emit('change')
        return own(() => {
          panels.delete(key(id))
          bus.emit('change')
        })
      },
      addPlayerButton({ id, icon: ic = 'puzzle', title, onClick }) {
        buttons.set(key(id), { pluginId: def.id, id, icon: ic, title, onClick })
        bus.emit('change')
        return own(() => {
          buttons.delete(key(id))
          bus.emit('change')
        })
      },
      toast,
      sheet,
      icon,
    }),
    theme: Object.freeze({
      get: () => themes.activeTheme(),
      getVar: (k) => themes.effectiveVar(k),
      setVar: (k, v) => themes.setOverride(k, v),
    }),
    storage: Object.freeze({
      get: (k, fallback) => ls.get(`plugin.${def.id}.${k}`, fallback),
      set: (k, v) => ls.set(`plugin.${def.id}.${k}`, v),
    }),
    // Authenticated Spotify Web API call, e.g. api.spotify.fetch('/me')
    spotify: Object.freeze({ fetch: (path, opts) => sp.api(path, opts) }),
  })
}

async function start(def) {
  if (running.has(def.id)) return
  const ctx = { cleanups: [], teardown: null }
  running.set(def.id, ctx)
  try {
    ctx.teardown = (await def.setup(makeApi(def, ctx))) ?? null
    status.set(def.id, {})
  } catch (e) {
    console.error('[pulse] add-on failed:', def.id, e)
    status.set(def.id, { error: e.message })
    toast(`Add-on "${def.name}" failed: ${e.message}`)
    stop(def.id)
  }
  bus.emit('change')
}

export function stop(id) {
  const ctx = running.get(id)
  if (!ctx) return
  running.delete(id)
  try {
    ctx.teardown?.()
  } catch (e) {
    console.error(e)
  }
  ctx.cleanups.splice(0).forEach((fn) => {
    try {
      fn()
    } catch {}
  })
  bus.emit('change')
}

const known = new Map() // id -> { def, source }

export async function loadAll() {
  for (const def of builtins) {
    try {
      validate(def)
      known.set(def.id, { def, source: 'built-in' })
    } catch (e) {
      console.error('[pulse] bad built-in add-on', e)
    }
  }
  for (const u of userSources()) {
    try {
      known.set(u.id, { def: await importFromSource(u.code), source: 'imported' })
    } catch (e) {
      known.set(u.id, { def: { id: u.id, name: u.name ?? u.id, setup() {} }, source: 'imported' })
      status.set(u.id, { error: e.message })
    }
  }
  const en = enabledMap()
  for (const [id, { def }] of known) {
    if (status.get(id)?.error) continue
    if (en[id] ?? def.defaultEnabled !== false) await start(def)
  }
  bus.emit('change')
}

export function listPlugins() {
  const en = enabledMap()
  return [...known.values()].map(({ def, source }) => ({
    id: def.id,
    name: def.name,
    version: def.version ?? '',
    description: def.description ?? '',
    source,
    enabled: running.has(def.id),
    wanted: en[def.id] ?? def.defaultEnabled !== false,
    error: status.get(def.id)?.error ?? null,
  }))
}

export async function setEnabled(id, on) {
  const en = enabledMap()
  en[id] = on
  ls.set('pluginsEnabled', en)
  const entry = known.get(id)
  if (!entry) return
  if (on) await start(entry.def)
  else stop(id)
  bus.emit('change')
}

export async function addFromSource(code) {
  const def = await importFromSource(code) // throws with a readable message if invalid
  if (builtins.some((b) => b.id === def.id)) throw new Error(`"${def.id}" is a built-in add-on id, pick another`)
  const list = userSources().filter((u) => u.id !== def.id)
  list.push({ id: def.id, name: def.name, code })
  ls.set('userPlugins', list)
  if (running.has(def.id)) stop(def.id)
  status.delete(def.id)
  known.set(def.id, { def, source: 'imported' })
  await setEnabled(def.id, true)
  return def
}

export function removeUserPlugin(id) {
  stop(id)
  ls.set('userPlugins', userSources().filter((u) => u.id !== id))
  known.delete(id)
  status.delete(id)
  bus.emit('change')
}
