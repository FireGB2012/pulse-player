// Lyrics add-on. Time-synced lyrics from LRCLIB (https://lrclib.net), a free
// community lyrics database, with optional translation and a karaoke mode.
// Nothing is stored; lyrics are only shown while the track plays.

import { fetchLyrics, lineAt, translateLines, LANGS, defaultLang } from '../core/lyrics.js'
import { openKaraoke } from '../views/modes.js'

export default {
  id: 'lyrics',
  name: 'Lyrics',
  version: '1.1.0',
  description: 'Synced lyrics (from LRCLIB). Tap a line to jump to it. Translate + karaoke mode.',
  setup(api) {
    api.ui.addPanel({
      id: 'lyrics',
      title: 'Lyrics',
      icon: 'note',
      render(container) {
        const bar = document.createElement('div')
        bar.className = 'lyrics-bar'
        const box = document.createElement('div')
        box.className = 'lyrics'
        container.append(bar, box)

        let lines = null
        let translated = null
        let active = -1
        let token = 0

        // ---- toolbar: translate + karaoke ----
        const mkBtn = (label, onClick) => {
          const b = document.createElement('button')
          b.className = 'chip'
          b.textContent = label
          b.onclick = onClick
          bar.append(b)
          return b
        }
        const transBtn = mkBtn('', () => {
          const cur = api.storage.get('translate', '')
          api.ui.sheet({
            title: 'Translate lyrics to',
            items: [
              { label: 'Off', active: !cur, onClick: () => setLang('') },
              ...LANGS.map(([code, name]) => ({ label: name, active: cur === code, onClick: () => setLang(code) })),
            ],
          })
        })
        mkBtn('🎤 Karaoke', () => openKaraoke())
        const drawTransBtn = () => {
          const cur = api.storage.get('translate', '')
          transBtn.textContent = cur ? '🌐 ' + (LANGS.find(([c]) => c === cur)?.[1] ?? cur) : '🌐 Translate'
          transBtn.classList.toggle('on', !!cur)
        }
        function setLang(code) {
          api.storage.set('translate', code)
          drawTransBtn()
          load(api.player.state.track)
        }
        if (api.storage.get('translate', null) === null) api.storage.set('translate', '')
        drawTransBtn()

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
          translated = null
          active = -1
          if (!track) return msg('Nothing playing')
          msg('Looking up lyrics...')
          const res = await fetchLyrics(track)
          if (mine !== token) return
          const lang = api.storage.get('translate', '')
          if (res.lines) {
            lines = res.lines
            draw()
            highlight(api.player.state.progressMs)
            if (lang) {
              try {
                translated = await translateLines(lines.map((l) => l.text), lang || defaultLang())
                if (mine === token) draw(), highlight(api.player.state.progressMs)
              } catch (e) {
                if (mine === token) api.ui.toast(e.message)
              }
            }
          } else if (res.plain) {
            box.replaceChildren()
            const pre = document.createElement('div')
            pre.className = 'lyrics-plain'
            pre.textContent = res.plain
            box.append(pre)
            if (lang) {
              try {
                const parts = res.plain.split('\n')
                const tr = await translateLines(parts, lang)
                if (mine !== token) return
                pre.replaceChildren(
                  ...parts.flatMap((p, i) => {
                    const d = document.createElement('div')
                    d.textContent = p || ' '
                    const t = document.createElement('div')
                    t.className = 'lyric-trans'
                    t.textContent = tr[i] && tr[i] !== p ? tr[i] : ''
                    return [d, t]
                  }),
                )
              } catch {}
            }
          } else {
            msg(res.failed ? 'Could not reach the lyrics service' : 'No lyrics found for this track')
          }
        }

        function draw() {
          active = -1
          box.replaceChildren(
            ...lines.map((l, i) => {
              const d = document.createElement('div')
              d.className = 'lyric-line'
              d.dataset.i = i
              d.textContent = l.text || '♪'
              const tr = translated?.[i]
              if (tr && tr !== l.text) {
                const t = document.createElement('div')
                t.className = 'lyric-trans'
                t.textContent = tr
                d.append(t)
              }
              d.addEventListener('click', () => api.player.seek(l.t))
              return d
            }),
          )
        }

        function highlight(ms) {
          if (!lines) return
          const idx = lineAt(lines, ms)
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
