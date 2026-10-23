// Store add-on: show the playing song in the window / taskbar title (nice on PC).
export default {
  id: 'window-title',
  name: 'Song in window title',
  version: '1.0.0',
  description: 'Puts "Song · Artist" in the window title, so it shows on the taskbar.',
  setup(api) {
    const original = document.title
    const draw = () => {
      const t = api.player.state.track
      document.title = t ? `${api.player.state.isPlaying ? '▶' : '❚❚'} ${t.name} · ${(t.artists ?? []).map((a) => a.name).join(', ')}` : original
    }
    const off = api.player.on('state', draw)
    draw()
    return () => {
      off()
      document.title = original
    }
  },
}
