// Color helpers: pull a palette out of an image and build theme colors from it.

export async function loadImage(src) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  await img.decode()
  return img
}

// Returns up to n colors [{ r, g, b, weight }] sorted by how much of the image they cover.
export async function extractPalette(src, n = 5) {
  const img = typeof src === 'string' ? await loadImage(src) : src
  const S = 48
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, S, S)
  const d = ctx.getImageData(0, 0, S, S).data
  const buckets = new Map()
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
    const b = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    b.r += d[i]
    b.g += d[i + 1]
    b.b += d[i + 2]
    b.n++
    buckets.set(key, b)
  }
  const total = S * S
  const sorted = [...buckets.values()]
    .map((b) => ({ r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n), weight: b.n / total }))
    .sort((a, b) => b.weight - a.weight)
  // keep colors that are visibly different from the ones already picked
  const out = []
  for (const col of sorted) {
    if (out.every((o) => dist(o, col) > 60)) out.push(col)
    if (out.length >= n) break
  }
  return out
}

const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)

export function saturation({ r, g, b }) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

// relative luminance 0..1
export function luminance({ r, g, b }) {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export const mix = (a, b, t) => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
})

export const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
export const rgba = ({ r, g, b }, a) => `rgba(${r}, ${g}, ${b}, ${a})`

const BLACK = { r: 0, g: 0, b: 0 }
const WHITE = { r: 255, g: 255, b: 255 }

// The most vivid color of the palette (good for an accent).
export function vivid(palette) {
  let best = palette[0]
  let bestScore = -1
  for (const c of palette) {
    const light = luminance(c)
    const score = saturation(c) * (1 - Math.abs(light - 0.35)) + c.weight * 0.3
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

// Build theme vars from a palette. dark=true gives a dark background.
export function themeVarsFromPalette(palette, dark = true) {
  const accent = vivid(palette)
  const others = palette.filter((c) => c !== accent)
  const base = others[0] ?? accent
  const second = others[1] ?? accent
  const bg = dark ? mix(base, BLACK, 0.82) : mix(base, WHITE, 0.9)
  const surface = dark ? mix(bg, WHITE, 0.06) : mix(bg, BLACK, 0.05)
  const surface2 = dark ? mix(bg, WHITE, 0.11) : mix(bg, BLACK, 0.09)
  const text = dark ? mix(accent, WHITE, 0.92) : mix(accent, BLACK, 0.9)
  const textDim = dark ? mix(accent, WHITE, 0.55) : mix(accent, BLACK, 0.55)
  // keep the accent readable on the background
  let acc = accent
  for (let i = 0; i < 6 && contrast(acc, bg) < 3; i++) acc = mix(acc, dark ? WHITE : BLACK, 0.18)
  return {
    '--bg': hex(bg),
    '--bg-image': `radial-gradient(900px 500px at 85% -10%, ${rgba(acc, dark ? 0.28 : 0.18)}, transparent 60%), radial-gradient(800px 500px at -10% 110%, ${rgba(second, dark ? 0.22 : 0.16)}, transparent 60%)`,
    '--surface': hex(surface),
    '--surface-2': hex(surface2),
    '--text': hex(text),
    '--text-dim': hex(textDim),
    '--accent': hex(acc),
    '--accent-contrast': luminance(acc) > 0.45 ? '#111111' : '#ffffff',
    '--border': dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.1)',
  }
}

export function contrast(a, b) {
  const la = luminance(a) + 0.05
  const lb = luminance(b) + 0.05
  return Math.max(la, lb) / Math.min(la, lb)
}
