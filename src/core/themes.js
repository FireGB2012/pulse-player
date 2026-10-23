// Theme manager. A theme is a JSON file:
// {
//   "id": "midnight", "name": "Midnight",
//   "layout": "classic" | "floating" | "compact",   (optional)
//   "vars":   { "--bg": "#0b0b12", ... },           (CSS custom properties)
//   "css":    "optional extra CSS string"           (optional)
// }
// Built-in themes live in src/themes/*.json. Imported/edited themes are kept
// in localStorage.

import { ls, emitter } from './store.js'
import * as settings from './settings.js'
import { extractPalette, rgba, mix } from './palette.js'

const builtinModules = import.meta.glob('../themes/*.json', { eager: true })
export const builtinThemes = Object.values(builtinModules).map((m) => m.default ?? m)

export const EDITABLE_VARS = [
  { key: '--bg', label: 'Background', type: 'color' },
  { key: '--surface', label: 'Cards', type: 'color' },
  { key: '--text', label: 'Text', type: 'color' },
  { key: '--text-dim', label: 'Dim text', type: 'color' },
  { key: '--accent', label: 'Accent', type: 'color' },
  { key: '--accent-contrast', label: 'Text on accent', type: 'color' },
  { key: '--radius', label: 'Roundness', type: 'range', min: 0, max: 32, unit: 'px' },
  { key: '--blur', label: 'Glass blur', type: 'range', min: 0, max: 40, unit: 'px' },
]

const bus = emitter()
export const onThemeChange = bus.on

let activeId = ls.get('theme', 'midnight')
let overrides = ls.get('themeOverrides', {})
let tintOn = ls.get('albumTint', false) // opt-in so each theme keeps its own accent
let tintColor = null
let lastTintUrl = ''
let appliedKeys = []

export const userThemes = () => ls.get('userThemes', [])
export const allThemes = () => [...builtinThemes, ...userThemes()]
export const getTheme = (id) => allThemes().find((t) => t.id === id) ?? builtinThemes[0]
// The theme the user picked (what the editor edits).
export const activeTheme = () => getTheme(activeId)

// ---- automatic themes ----
// Priority: per-playlist theme > seasonal theme > time-of-day theme > picked theme.
export const SEASONS = [
  { id: 'halloween', name: 'Halloween', from: [10, 15], to: [11, 1] },
  { id: 'christmas', name: 'Christmas', from: [12, 1], to: [12, 26] },
]

export function currentSeason(date = new Date()) {
  const md = (date.getMonth() + 1) * 100 + date.getDate()
  return SEASONS.find((s) => md >= s.from[0] * 100 + s.from[1] && md <= s.to[0] * 100 + s.to[1]) ?? null
}

let contextUri = null
const playlistThemes = () => ls.get('playlistThemes', {})
export const getPlaylistTheme = (uri) => (uri ? playlistThemes()[uri] ?? null : null)
export function setPlaylistTheme(uri, id) {
  const map = playlistThemes()
  if (id) map[uri] = id
  else delete map[uri]
  ls.set('playlistThemes', map)
  applyTheme()
}

// Called by the player when the playing playlist/album changes.
export function setPlayingContext(uri) {
  if (uri === contextUri) return
  const before = effectiveThemeId()
  contextUri = uri
  if (effectiveThemeId() !== before) applyTheme()
}

// Why the current theme is showing: 'playlist' | 'season' | 'time' | 'picked'
export function themeReason() {
  return effectiveTheme().reason
}

// A theme picked by hand wins until the next automatic switch (season start,
// or the next day/night change).
const pickedAt = () => ls.get('themePickedAt', 0)

function lastTimeSwitch(now = new Date()) {
  let best = 0
  for (const hour of [settings.get('autoThemeDayStart'), settings.get('autoThemeNightStart')]) {
    const d = new Date(now)
    d.setHours(hour, 0, 0, 0)
    if (d > now) d.setDate(d.getDate() - 1)
    best = Math.max(best, d.getTime())
  }
  return best
}

function effectiveTheme() {
  const exists = (id) => id && allThemes().some((t) => t.id === id)
  const pl = getPlaylistTheme(contextUri)
  if (exists(pl)) return { id: pl, reason: 'playlist' }
  const now = new Date()
  const season = settings.get('seasonal') ? currentSeason(now) : null
  if (season && exists(season.id) && pickedAt() < new Date(now.getFullYear(), season.from[0] - 1, season.from[1]).getTime())
    return { id: season.id, reason: 'season' }
  if (settings.get('autoTheme') && pickedAt() < lastTimeSwitch(now)) {
    const h = now.getHours()
    const dayStart = settings.get('autoThemeDayStart')
    const nightStart = settings.get('autoThemeNightStart')
    const isDay = dayStart <= nightStart ? h >= dayStart && h < nightStart : h >= dayStart || h < nightStart
    const id = isDay ? settings.get('autoThemeDay') : settings.get('autoThemeNight')
    if (exists(id)) return { id, reason: 'time' }
  }
  return { id: activeId, reason: 'picked' }
}
export const effectiveThemeId = () => effectiveTheme().id

// ---- font packs ----
export const FONT_PACKS = [
  { id: 'theme', name: 'Theme default' },
  { id: 'system', name: 'Clean', font: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'pixel', name: 'Pixel', font: "'Press Start 2P', monospace" },
  { id: 'retro', name: 'Retro terminal', font: "'VT323', monospace" },
  { id: 'hand', name: 'Handwriting', font: "'Caveat', cursive" },
  { id: 'comic', name: 'Comic hero', font: "'Bungee', system-ui, sans-serif" },
  { id: 'future', name: 'Sci-fi', font: "'Orbitron', system-ui, sans-serif" },
]

export const SKINS = [
  { id: 'none', name: 'Plain art' },
  { id: 'vinyl', name: 'Vinyl record' },
  { id: 'cassette', name: 'Cassette' },
  { id: 'tapedeck', name: 'Tape deck' },
]

let checkTimer = null
export function startAutoThemes() {
  clearInterval(checkTimer)
  let last = effectiveThemeId()
  checkTimer = setInterval(() => {
    const now = effectiveThemeId()
    if (now !== last) {
      last = now
      applyTheme()
    }
  }, 60_000)
  settings.onSettings('change', (k) => {
    // switching an automatic theme on should show it right away
    if (['autoTheme', 'autoThemeDay', 'autoThemeNight', 'autoThemeDayStart', 'autoThemeNightStart', 'seasonal'].includes(k)) ls.set('themePickedAt', 0)
    if (['autoTheme', 'autoThemeDay', 'autoThemeNight', 'autoThemeDayStart', 'autoThemeNightStart', 'seasonal', 'font', 'skin', 'albumGradient'].includes(k)) {
      last = effectiveThemeId()
      applyTheme()
      if (k === 'albumGradient' && lastTintUrl) tintFromImage(lastTintUrl)
    }
  })
}
export const getOverrides = () => ({ ...overrides })
export const albumTintEnabled = () => tintOn

function sanitizeCss(css) {
  return String(css ?? '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/javascript:/gi, '')
}

let albumColors = null // ['rgba(...)', ...] for the animated gradient

export function applyTheme() {
  const root = document.documentElement
  const theme = getTheme(effectiveThemeId())
  appliedKeys.forEach((k) => root.style.removeProperty(k))
  const vars = { ...(theme.vars ?? {}), ...(theme.id === activeId ? overrides : {}) }
  if (tintOn && tintColor) vars['--accent'] = tintColor
  const pack = FONT_PACKS.find((f) => f.id === settings.get('font'))
  if (pack?.font) vars['--font'] = pack.font
  if (settings.get('albumGradient') && albumColors) {
    albumColors.forEach((c, i) => (vars[`--album-${i + 1}`] = c))
  }
  appliedKeys = Object.keys(vars).filter((k) => k.startsWith('--'))
  for (const k of appliedKeys) root.style.setProperty(k, vars[k])
  root.dataset.layout = theme.layout ?? 'classic'
  root.dataset.theme = theme.id
  root.dataset.font = pack?.id ?? 'theme'
  root.dataset.skin = settings.get('skin')
  root.dataset.gradient = settings.get('albumGradient') && albumColors ? 'on' : 'off'

  let style = document.getElementById('theme-css')
  if (!style) {
    style = document.createElement('style')
    style.id = 'theme-css'
    document.head.append(style)
  }
  style.textContent = sanitizeCss(theme.css)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && vars['--bg']) meta.setAttribute('content', vars['--bg'])
  bus.emit('change', theme)
}

export function setTheme(id) {
  activeId = id
  ls.set('themePickedAt', Date.now())
  overrides = {}
  ls.set('theme', id)
  ls.set('themeOverrides', overrides)
  applyTheme()
}

export function setOverride(key, value) {
  if (effectiveThemeId() !== activeId) {
    // an automatic theme is showing; edit that one instead
    activeId = effectiveThemeId()
    overrides = {}
    ls.set('theme', activeId)
  }
  overrides[key] = value
  ls.set('themeOverrides', overrides)
  applyTheme()
}

export function resetOverrides() {
  overrides = {}
  ls.set('themeOverrides', overrides)
  applyTheme()
}

// Current effective value of a var (override > theme > computed).
export function effectiveVar(key) {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim() || overrides[key] || activeTheme().vars?.[key] || ''
}

export function validateTheme(t) {
  if (!t || typeof t !== 'object') throw new Error('Theme must be a JSON object')
  if (!t.name || typeof t.name !== 'string') throw new Error('Theme needs a "name"')
  if (!t.vars || typeof t.vars !== 'object') throw new Error('Theme needs a "vars" object')
  const vars = {}
  for (const [k, v] of Object.entries(t.vars)) {
    if (!k.startsWith('--')) throw new Error(`Variable "${k}" must start with --`)
    vars[k] = String(v)
  }
  const id = (t.id || t.name).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme'
  return {
    id,
    name: t.name,
    author: t.author ?? '',
    layout: ['classic', 'floating', 'compact'].includes(t.layout) ? t.layout : 'classic',
    vars,
    css: typeof t.css === 'string' ? t.css : '',
  }
}

export function saveUserTheme(theme) {
  const clean = validateTheme(theme)
  const list = userThemes().filter((t) => t.id !== clean.id)
  // never overwrite a built-in id
  if (builtinThemes.some((b) => b.id === clean.id)) clean.id = clean.id + '-custom'
  list.push(clean)
  ls.set('userThemes', list)
  return clean
}

export function deleteUserTheme(id) {
  ls.set('userThemes', userThemes().filter((t) => t.id !== id))
  if (activeId === id) setTheme('midnight')
}

// Save current look (active theme + tweaks) as a new theme.
export function saveCurrentAs(name) {
  const base = activeTheme()
  return saveUserTheme({
    name,
    layout: base.layout,
    css: base.css,
    vars: { ...(base.vars ?? {}), ...overrides },
  })
}

export function exportTheme(id = activeId) {
  const t = getTheme(id)
  return JSON.stringify(
    { id: t.id, name: t.name, author: t.author ?? '', layout: t.layout ?? 'classic', vars: { ...t.vars, ...(id === activeId ? overrides : {}) }, css: t.css ?? '' },
    null,
    2,
  )
}

// ---- album tint ----
export function setAlbumTint(on) {
  tintOn = on
  ls.set('albumTint', on)
  if (!on) tintColor = null
  applyTheme()
  if (on && lastTintUrl) tintFromImage(lastTintUrl)
}

export async function tintFromImage(url) {
  if (url) lastTintUrl = url
  if (url && settings.get('albumGradient')) updateAlbumGradient(url)
  if (!tintOn || !url) return
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = c.height = 24
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, 24, 24)
    const d = ctx.getImageData(0, 0, 24, 24).data
    // pick the most saturated, reasonably bright pixel bucket
    let best = null
    let bestScore = -1
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const sat = max === 0 ? 0 : (max - min) / max
      const light = (max + min) / 510
      const score = sat * (1 - Math.abs(light - 0.55))
      if (score > bestScore) {
        bestScore = score
        best = [r, g, b]
      }
    }
    if (best && bestScore > 0.12) {
      tintColor = `rgb(${best[0]}, ${best[1]}, ${best[2]})`
      applyTheme()
    }
  } catch {
    // cross-origin canvas blocked or image failed: keep current accent
  }
}

// ---- animated album gradient ----
let gradientUrl = ''
async function updateAlbumGradient(url) {
  if (url === gradientUrl) return
  gradientUrl = url
  try {
    const pal = await extractPalette(url, 4)
    if (url !== gradientUrl || !pal.length) return
    const pick = (i) => pal[i % pal.length]
    albumColors = [0, 1, 2].map((i) => rgba(mix(pick(i), { r: 0, g: 0, b: 0 }, 0.15), 0.55))
    applyTheme()
  } catch {
    // image blocked or failed: keep the last gradient
  }
}
