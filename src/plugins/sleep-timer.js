// Sleep timer: pauses playback after a chosen time.
// Note: it runs inside Pulse, so Android may freeze it if the app is swiped
// away or heavily backgrounded. For a rock-solid timer use Spotify's own.

export default {
  id: 'sleep-timer',
  name: 'Sleep timer',
  version: '1.0.0',
  description: 'Pause playback after 15 to 90 minutes. Works while Pulse stays open.',
  setup(api) {
    let interval = null

    const clear = () => {
      clearInterval(interval)
      interval = null
      api.storage.set('endAt', 0)
    }

    function arm(endAt) {
      clearInterval(interval)
      api.storage.set('endAt', endAt)
      interval = setInterval(async () => {
        if (Date.now() >= endAt) {
          clear()
          await api.player.pause()
          api.ui.toast('Sleep timer: paused. Night!')
        }
      }, 5000)
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
            api.ui.toast(`Pausing in ${m} min`)
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
