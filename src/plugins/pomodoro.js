// Pomodoro focus timer: 25 min focus, 5 min break, each with its own playlist.

import * as player from '../core/player.js'
import * as achievements from '../core/achievements.js'

export default {
  id: 'pomodoro',
  name: 'Focus timer',
  version: '1.0.0',
  description: 'Pomodoro: focus and break rounds, each with its own playlist.',
  setup(api) {
    const cfg = () => ({ focus: 25, break: 5, focusUri: '', focusName: '', breakUri: '', breakName: '', ...api.storage.get('cfg', {}) })
    // run: { phase: 'focus'|'break', endAt, pausedLeft, rounds }
    let run = api.storage.get('run', null)
    const listeners = new Set()
    const save = () => {
      api.storage.set('run', run)
      listeners.forEach((f) => f())
    }

    async function startPhase(phase) {
      const c = cfg()
      const mins = phase === 'focus' ? c.focus : c.break
      run = { phase, endAt: Date.now() + mins * 60_000, pausedLeft: null, rounds: run?.rounds ?? 0 }
      save()
      const uri = phase === 'focus' ? c.focusUri : c.breakUri
      if (uri) await player.playBody({ context_uri: uri })
    }

    const tick = setInterval(() => {
      if (!run || run.pausedLeft != null) return
      if (Date.now() >= run.endAt) {
        if (run.phase === 'focus') {
          run.rounds++
          achievements.unlock('pomodoro')
          api.ui.toast('🍅 Focus done! Break time.')
          navigator.vibrate?.([200, 100, 200])
          startPhase('break')
        } else {
          api.ui.toast('Break over. Back to it!')
          navigator.vibrate?.(300)
          startPhase('focus')
        }
      }
      listeners.forEach((f) => f())
    }, 1000)

    api.ui.addPanel({
      id: 'focus',
      title: 'Focus',
      render(el) {
        const box = document.createElement('div')
        box.className = 'pomo'
        el.append(box)
        const draw = () => {
          const c = cfg()
          const left = run ? (run.pausedLeft ?? Math.max(0, run.endAt - Date.now())) : c.focus * 60_000
          const total = (run?.phase === 'break' ? c.break : c.focus) * 60_000
          const pct = run ? 1 - left / total : 0
          const m = Math.floor(left / 60000)
          const s = Math.floor((left % 60000) / 1000)
          box.innerHTML = ''
          const ring = document.createElement('div')
          ring.className = 'pomo-ring' + (run?.phase === 'break' ? ' break' : '')
          ring.style.setProperty('--p', Math.round(pct * 360) + 'deg')
          ring.innerHTML = `<div><b>${m}:${String(s).padStart(2, '0')}</b><small>${run ? (run.phase === 'focus' ? 'Focus' : 'Break') : 'Ready'}${run?.rounds ? ' · ' + run.rounds + ' done' : ''}</small></div>`
          const row = document.createElement('div')
          row.className = 'btn-row center'
          const btn = (label, cls, fn) => {
            const b = document.createElement('button')
            b.className = 'btn ' + cls
            b.textContent = label
            b.onclick = fn
            row.append(b)
          }
          if (!run) btn('Start focus', 'primary', () => startPhase('focus'))
          else if (run.pausedLeft != null)
            btn('Resume', 'primary', () => {
              run.endAt = Date.now() + run.pausedLeft
              run.pausedLeft = null
              save()
            })
          else
            btn('Pause', 'primary', () => {
              run.pausedLeft = Math.max(0, run.endAt - Date.now())
              save()
            })
          if (run) btn('Skip', 'ghost', () => startPhase(run.phase === 'focus' ? 'break' : 'focus'))
          if (run) btn('Reset', 'ghost', () => ((run = null), save()))
          const conf = document.createElement('div')
          conf.className = 'btn-row center'
          const setBtn = (label, fn) => {
            const b = document.createElement('button')
            b.className = 'btn ghost'
            b.textContent = label
            b.onclick = fn
            conf.append(b)
          }
          setBtn(`Focus ${c.focus} min`, () => pickMinutes('focus', [15, 20, 25, 30, 45, 50, 60]))
          setBtn(`Break ${c.break} min`, () => pickMinutes('break', [3, 5, 10, 15]))
          setBtn(c.focusName ? `🎯 ${c.focusName}` : 'Focus playlist', () => pickList('focus'))
          setBtn(c.breakName ? `☕ ${c.breakName}` : 'Break playlist', () => pickList('break'))
          box.append(ring, row, conf)
        }
        listeners.add(draw)
        draw()
        return () => listeners.delete(draw)
      },
    })

    function pickMinutes(key, list) {
      api.ui.sheet({
        title: key === 'focus' ? 'Focus length' : 'Break length',
        items: list.map((m) => ({ label: `${m} minutes`, onClick: () => (api.storage.set('cfg', { ...cfg(), [key]: m }), save()) })),
      })
    }

    async function pickList(key) {
      try {
        const r = await api.spotify.fetch('/me/playlists', { query: { limit: 50 } })
        api.ui.sheet({
          title: key === 'focus' ? 'Play during focus' : 'Play during breaks',
          items: [
            { label: 'Nothing (keep what plays)', onClick: () => (api.storage.set('cfg', { ...cfg(), [key + 'Uri']: '', [key + 'Name']: '' }), save()) },
            ...(r.items ?? []).filter(Boolean).map((p) => ({ label: p.name, onClick: () => (api.storage.set('cfg', { ...cfg(), [key + 'Uri']: p.uri, [key + 'Name']: p.name }), save()) })),
          ],
        })
      } catch (e) {
        api.ui.toast(e.message)
      }
    }

    return () => clearInterval(tick)
  },
}
