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
export const activeTheme = () => getTheme(activeId)
export const getOverrides = () => ({ ...overrides })
export const albumTintEnabled = () => tintOn

function sanitizeCss(css) {
  return String(css ?? '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/javascript:/gi, '')
}

export function applyTheme() {
  const root = document.documentElement
  const theme = activeTheme()
  appliedKeys.forEach((k) => root.style.removeProperty(k))
  const vars = { ...(theme.vars ?? {}), ...overrides }
  if (tintOn && tintColor) vars['--accent'] = tintColor
  appliedKeys = Object.keys(vars).filter((k) => k.startsWith('--'))
  for (const k of appliedKeys) root.style.setProperty(k, vars[k])
  root.dataset.layout = theme.layout ?? 'classic'
  root.dataset.theme = theme.id

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
  overrides = {}
  ls.set('theme', id)
  ls.set('themeOverrides', overrides)
  applyTheme()
}

export function setOverride(key, value) {
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
  return overrides[key] ?? activeTheme().vars?.[key] ?? getComputedStyle(document.documentElement).getPropertyValue(key).trim()
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
