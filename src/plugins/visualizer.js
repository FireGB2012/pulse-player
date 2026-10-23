// Ambient visualizer. DECORATIVE: Spotify does not expose live audio data to
// third-party apps, so the bars are animated to look good, not driven by the
// actual sound. They idle when paused and use your theme accent color.

export default {
  id: 'visualizer',
  name: 'Visualizer',
  version: '1.0.0',
  description: 'Animated bars in your accent color (decorative, not audio-reactive).',
  setup(api) {
    api.ui.addPanel({
      id: 'viz',
      title: 'Visualizer',
      icon: 'note',
      render(container) {
        const canvas = document.createElement('canvas')
        canvas.className = 'viz'
        container.append(canvas)
        const ctx = canvas.getContext('2d')
        const BARS = 28
        const phase = Array.from({ length: BARS }, () => Math.random() * Math.PI * 2)
        const speed = Array.from({ length: BARS }, () => 1.2 + Math.random() * 2.2)
        let level = 0.1
        let raf = 0

        function size() {
          const r = canvas.getBoundingClientRect()
          const dpr = window.devicePixelRatio || 1
          canvas.width = Math.max(1, Math.floor(r.width * dpr))
          canvas.height = Math.max(1, Math.floor(r.height * dpr))
        }
        size()
        const ro = new ResizeObserver(size)
        ro.observe(canvas)

        function frame(now) {
          const t = now / 1000
          const playing = api.player.state.isPlaying
          level += ((playing ? 1 : 0.08) - level) * 0.06
          const { width: w, height: h } = canvas
          ctx.clearRect(0, 0, w, h)
          ctx.fillStyle = api.theme.getVar('--accent') || '#7c5cff'
          const gap = w / BARS
          const bw = gap * 0.62
          for (let i = 0; i < BARS; i++) {
            const wave = 0.5 + 0.5 * Math.sin(t * speed[i] + phase[i])
            const env = 0.55 + 0.45 * Math.sin(t * 0.7 + i * 0.35)
            const bh = Math.max(4, h * (0.08 + 0.85 * wave * env * level))
            const x = i * gap + (gap - bw) / 2
            const r = Math.min(bw / 2, 10)
            ctx.beginPath()
            ctx.roundRect(x, h - bh, bw, bh, r)
            ctx.fill()
          }
          raf = requestAnimationFrame(frame)
        }
        raf = requestAnimationFrame(frame)

        return () => {
          cancelAnimationFrame(raf)
          ro.disconnect()
        }
      },
    })
  },
}
