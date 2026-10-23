// Lyrics from LRCLIB (https://lrclib.net), a free community lyrics database,
// plus optional translation. Shared by the Lyrics add-on, karaoke and the PC layout.

const cache = new Map() // trackId -> { lines: [{t, text}] | null, plain: string | null }

export function parseLrc(lrc) {
  const lines = []
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/)
    if (m) lines.push({ t: (Number(m[1]) * 60 + Number(m[2])) * 1000, text: m[3] })
  }
  return lines.length ? lines : null
}

export async function fetchLyrics(track) {
  if (cache.has(track.id)) return cache.get(track.id)
  const q = new URLSearchParams({
    artist_name: track.artists?.[0]?.name ?? '',
    track_name: track.name,
    album_name: track.album?.name ?? '',
    duration: String(Math.round((track.duration_ms ?? 0) / 1000)),
  })
  let result = { lines: null, plain: null }
  try {
    const res = await fetch('https://lrclib.net/api/get?' + q)
    if (res.ok) {
      const data = await res.json()
      result = {
        lines: data.syncedLyrics ? parseLrc(data.syncedLyrics) : null,
        plain: data.plainLyrics ?? null,
      }
    }
  } catch {
    return { lines: null, plain: null, failed: true }
  }
  cache.set(track.id, result)
  return result
}

// Index of the line playing at `ms`, or -1.
export function lineAt(lines, ms) {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= ms + 150) idx = i
    else break
  }
  return idx
}

// ---- translation (Google's free web endpoint, no key needed) ----
const tcache = new Map() // `${lang}:${text}` -> translated
export const LANGS = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['pt', 'Portuguese'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['nl', 'Dutch'],
  ['pl', 'Polish'],
  ['tr', 'Turkish'],
  ['ru', 'Russian'],
  ['uk', 'Ukrainian'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh-CN', 'Chinese'],
  ['id', 'Indonesian'],
  ['vi', 'Vietnamese'],
  ['sv', 'Swedish'],
  ['da', 'Danish'],
  ['no', 'Norwegian'],
]
export const defaultLang = () => {
  const n = (navigator.language || 'en').split('-')[0]
  return LANGS.some(([c]) => c === n) ? n : 'en'
}

// Translate many lines at once. Returns an array the same length as `lines`.
export async function translateLines(all, lang) {
  // only send lines with words; blank lines stay blank
  const idx = all.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0)
  const done = await translateNonEmpty(idx.map((i) => all[i].trim()), lang)
  const res = all.map(() => '')
  idx.forEach((i, k) => (res[i] = done[k] ?? ''))
  return res
}

async function translateNonEmpty(lines, lang) {
  const text = lines.join('\n')
  const key = `${lang}:${text}`
  if (tcache.has(key)) return tcache.get(key)
  const out = []
  // keep requests small enough for a GET url
  const chunks = []
  let cur = []
  for (const l of lines) {
    if ((cur.join('\n') + l).length > 1500) {
      chunks.push(cur)
      cur = []
    }
    cur.push(l)
  }
  if (cur.length) chunks.push(cur)
  for (const chunk of chunks) {
    const q = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: chunk.join('\n') })
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + q)
    if (!res.ok) throw new Error('Translation failed (' + res.status + ')')
    const data = await res.json()
    const joined = (data?.[0] ?? []).map((p) => p?.[0] ?? '').join('')
    const parts = joined.split('\n')
    for (let i = 0; i < chunk.length; i++) out.push((parts[i] ?? '').trim())
  }
  tcache.set(key, out)
  return out
}
