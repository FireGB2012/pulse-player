// Sleep timer: fades the volume out over the last minute, then pauses.
// Note: it runs inside Pulse, so Android may freeze it if the app is swiped
// away or heavily backgrounded. For a rock-solid timer use Spotify's own.

import * as player from '../core/player.js'

const FADE_MS = 60_000

export default {
  id: 'sleep-timer',
  name: 'Sleep timer',
  version: '1.1.0',
  description: 'Fades out over the last minute, then pauses. 15 to 90 minutes.',
  setup(api) {
    let interval = null
    let fadeStarted = false
    let volumeBefore = null

    const clear = () => {
      clearInterval(interval)
      interval = null
      fadeStarted = false
      api.storage.set('endAt', 0)
    }

    function arm(endAt) {
      clearInterval(interval)
      fadeStarted = false
      api.storage.set('endAt', endAt)
      interval = setInterval(async () => {
        const left = endAt - Date.now()
        if (left <= FADE_MS && !fadeStarted && api.player.state.isPlaying && player.canSetVolume()) {
          fadeStarted = true
          volumeBefore = api.player.state.volume
          player.fadeVolume(volumeBefore, 0, Math.max(2000, left - 1500))
        }
        if (left <= 0) {
          clear()
          await api.player.pause()
          // put the volume back so the next play isn't silent
          if (volumeBefore != null) setTimeout(() => api.player.setVolume(volumeBefore), 1200)
          volumeBefore = null
          api.ui.toast('Sleep timer: paused. Night!')
        }
      }, 1000)
    }

    const resumeAt = api.storage.get('endAt', 0)
    if (resumeAt > Date.now()) arm(resumeAt)

    const offBtn = api.ui.addPlayerButton({
      id: 'sleep',
      icon: 'timer',
      title: 'Sleep timer',
      onClick() {
        const left = api.storage.get('endAt', 0) - Date.now()
        const items = [15, 30, 45, 60, 90].map((m) => ({
          label: `${m} minutes`,
          onClick() {
            arm(Date.now() + m * 60_000)
            api.ui.toast(`Fading out and pausing in ${m} min`)
          },
        }))
        if (left > 0) {
          items.push({
            label: 'Turn off timer',
            sub: `${Math.ceil(left / 60000)} min left`,
            onClick() {
              clear()
              api.ui.toast('Sleep timer off')
            },
          })
        }
        api.ui.sheet({ title: 'Sleep timer', items })
      },
    })

    return () => {
      clearInterval(interval)
      offBtn()
    }
  },
}
