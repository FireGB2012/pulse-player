// Lyrics add-on. Fetches time-synced lyrics from LRCLIB (https://lrclib.net),
// a free community lyrics database, and highlights the current line.
// Nothing is stored; lyrics are only shown while the track plays.

const cache = new Map() // trackId -> { lines: [{t, text}] | null, plain: string | null }

function parseLrc(lrc) {
  const lines = []
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/)
    if (m) lines.push({ t: (Number(m[1]) * 60 + Number(m[2])) * 1000, text: m[3] })
  }
  return lines.length ? lines : null
}

async function fetchLyrics(track) {
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

export default {
  id: 'lyrics',
  name: 'Lyrics',
  version: '1.0.0',
  description: 'Synced lyrics (from LRCLIB). Tap a line to jump to it.',
  setup(api) {
    api.ui.addPanel({
      id: 'lyrics',
      title: 'Lyrics',
      icon: 'note',
      render(container) {
        const box = document.createElement('div')
        box.className = 'lyrics'
        container.append(box)

        let lines = null
        let active = -1
        let token = 0

        const msg = (t) => {
          box.replaceChildren()
          const p = document.createElement('p')
          p.className = 'lyrics-msg'
          p.textContent = t
          box.append(p)
        }

        async function load(track) {
          const mine = ++token
          lines = null
          active = -1
          if (!track) return msg('Nothing playing')
          msg('Looking up lyrics...')
          const res = await fetchLyrics(track)
          if (mine !== token) return
          if (res.lines) {
            lines = res.lines
            box.replaceChildren(
              ...lines.map((l, i) => {
                const d = document.createElement('div')
                d.className = 'lyric-line'
                d.textContent = l.text || '♪'
                d.addEventListener('click', () => api.player.seek(l.t))
                d.dataset.i = i
                return d
              }),
            )
            highlight(api.player.state.progressMs)
          } else if (res.plain) {
            box.replaceChildren()
            const pre = document.createElement('div')
            pre.className = 'lyrics-plain'
            pre.textContent = res.plain
            box.append(pre)
          } else {
            msg(res.failed ? 'Could not reach the lyrics service' : 'No lyrics found for this track')
          }
        }

        function highlight(ms) {
          if (!lines) return
          let idx = -1
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].t <= ms + 150) idx = i
            else break
          }
          if (idx === active) return
          active = idx
          box.querySelectorAll('.lyric-line.on').forEach((n) => n.classList.remove('on'))
          const el = box.querySelector(`.lyric-line[data-i="${idx}"]`)
          if (el) {
            el.classList.add('on')
            el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        }

        const offTrack = api.player.on('track', load)
        const offProg = api.player.on('progress', (ms) => highlight(ms))
        load(api.player.state.track)

        return () => {
          token++
          offTrack()
          offProg()
        }
      },
    })
  },
}
