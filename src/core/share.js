// Sharing: themes as a link / QR code, and "now playing" as an image card.

import qrcode from 'qrcode-generator'
import * as player from './player.js'
import * as themes from './themes.js'
import * as native from './native.js'
import * as achievements from './achievements.js'
import { loadImage } from './palette.js'
import { h, sheet, toast, copyText, pickImage, artistNames } from './ui.js'

// ---------- theme links ----------
const b64url = (bytes) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())
}

export async function themeLink(id) {
  const json = themes.exportTheme(id)
  const raw = new TextEncoder().encode(JSON.stringify(JSON.parse(json)))
  let data
  if (typeof CompressionStream === 'function') data = 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw')))
  else data = 'j' + b64url(raw)
  return 'pulse://theme/' + data
}

// Accepts a pulse://theme/... link (or just the data part) and returns the theme object.
export async function parseThemeLink(text) {
  const m = String(text).trim().match(/(?:pulse:\/\/theme\/)?([zj][A-Za-z0-9_-]+)$/)
  if (!m) throw new Error('That is not a Pulse theme link')
  const kind = m[1][0]
  let bytes = fromB64url(m[1].slice(1))
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'))
  return JSON.parse(new TextDecoder().decode(bytes))
}

function qrImage(text) {
  const qr = qrcode(0, 'L')
  qr.addData(text)
  qr.make()
  return qr.createDataURL(6, 2)
}

export async function shareThemeSheet(id) {
  const t = themes.getTheme(id)
  const link = await themeLink(id)
  let qr = null
  try {
    qr = h('img', { class: 'qr', src: qrImage(link), alt: 'QR code for this theme' })
  } catch {
    qr = h('p', { class: 'dim small' }, 'This theme is too big for a QR code. Share the link instead.')
  }
  achievements.unlock('sharer')
  sheet({
    title: 'Share "' + t.name + '"',
    content: h(
      'div',
      { class: 'sheet-pad center' },
      qr,
      h('p', { class: 'dim small' }, 'Scan it with a phone camera that has Pulse installed, or send the link. On PC: Settings > Themes > Import, then paste the link.'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onClick: () => copyText(link, 'Theme link copied') }, 'Copy link')),
    ),
  })
}

// ---------- 45. now playing card ----------
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    let last = lines[maxLines - 1]
    while (ctx.measureText(last + '…').width > maxWidth && last.length) last = last.slice(0, -1)
    lines[maxLines - 1] = last + '…'
  }
  return lines
}

export async function renderCard(track) {
  const W = 1080
  const H = 1350
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const v = (k) => themes.effectiveVar(k)
  const bg = v('--bg') || '#0b0b12'
  const accent = v('--accent') || '#7c5cff'
  const text = v('--text') || '#ffffff'
  const dim = v('--text-dim') || '#999999'
  const font = (v('--font') || 'system-ui, sans-serif').replace(/;/g, '')

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const g = ctx.createRadialGradient(W * 0.85, 0, 50, W * 0.85, 0, W)
  g.addColorStop(0, accent)
  g.addColorStop(1, 'transparent')
  ctx.globalAlpha = 0.35
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 1

  const url = pickImage(track?.album?.images, 640)
  const size = 820
  const x = (W - size) / 2
  const y = 120
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  ctx.fillStyle = accent
  roundRect(ctx, x, y, size, size, 36)
  ctx.fill()
  ctx.restore()
  if (url) {
    try {
      const img = await loadImage(url)
      ctx.save()
      roundRect(ctx, x, y, size, size, 36)
      ctx.clip()
      ctx.drawImage(img, x, y, size, size)
      ctx.restore()
    } catch {}
  }

  ctx.fillStyle = text
  ctx.textBaseline = 'top'
  ctx.font = `700 64px ${font}`
  let ty = y + size + 60
  for (const line of wrapText(ctx, track?.name ?? 'Nothing playing', W - 160, 2)) {
    ctx.fillText(line, 80, ty)
    ty += 76
  }
  ctx.fillStyle = dim
  ctx.font = `500 42px ${font}`
  for (const line of wrapText(ctx, track ? artistNames(track) : '', W - 160, 1)) {
    ctx.fillText(line, 80, ty + 6)
    ty += 52
  }
  ctx.fillStyle = accent
  roundRect(ctx, 80, H - 110, 18, 46, 9)
  ctx.fill()
  ctx.fillStyle = text
  ctx.font = `800 40px ${font}`
  ctx.fillText('Pulse', 112, H - 106)
  ctx.fillStyle = dim
  ctx.font = `500 32px ${font}`
  ctx.textAlign = 'right'
  ctx.fillText('now playing', W - 80, H - 100)
  return c
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function shareNowPlaying() {
  const t = player.state.track
  if (!t) return toast('Play something first')
  toast('Making your card...')
  const canvas = await renderCard(t)
  let dataUrl
  try {
    dataUrl = canvas.toDataURL('image/png')
  } catch {
    // album art blocked from canvas: draw without it
    throw new Error('Could not read the album art for the card')
  }
  achievements.unlock('sharer')
  const name = `pulse-${(t.name || 'now-playing').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
  if (native.isAndroid) {
    await native.shareImage(dataUrl.split(',')[1], `${t.name} · ${artistNames(t)}`)
    return
  }
  const blob = await (await fetch(dataUrl)).blob()
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t.name })
      return
    } catch (e) {
      if (e.name === 'AbortError') return
    }
  }
  const a = h('a', { href: dataUrl, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  sheet({ title: 'Card saved', content: h('div', { class: 'sheet-pad center' }, h('img', { class: 'card-preview', src: dataUrl, alt: '' }), h('p', { class: 'dim small' }, 'Saved as ' + name)) })
}
