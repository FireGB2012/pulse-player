// Example add-on. Import it in Pulse: Settings > Add-ons > Import add-on.
export default {
  id: 'hello-addon',
  name: 'Hello add-on',
  version: '1.0.0',
  description: 'Toast on track change + a "Track info" tab in the player.',
  setup(api) {
    // react to the player
    const off = api.player.on('track', (t) => {
      if (t) api.ui.toast('Now playing: ' + t.name)
    })

    // add a tab to the Now Playing screen
    api.ui.addPanel({
      id: 'info',
      title: 'Track info',
      render(el) {
        const box = document.createElement('div')
        box.style.padding = '24px 8px'
        el.append(box)
        const draw = () => {
          const t = api.player.state.track
          box.textContent = t
            ? `${t.name} - album: ${t.album?.name} - ${Math.round(t.duration_ms / 1000)}s`
            : 'Nothing playing'
        }
        draw()
        const stop = api.player.on('track', draw)
        return stop // cleanup when the tab closes
      },
    })

    // add a button to the player controls
    api.ui.addPlayerButton({
      id: 'skip-twice',
      icon: 'next',
      title: 'Skip twice',
      async onClick() {
        await api.player.next()
        setTimeout(() => api.player.next(), 600)
      },
    })

    return off // teardown when the add-on is switched off
  },
}
