// Store add-on: a big clock tab in the player.
export default {
  id: 'clock',
  name: 'Clock',
  version: '1.0.0',
  description: 'A big clock + date tab in the Now Playing screen.',
  setup(api) {
    api.ui.addPanel({
      id: 'clock',
      title: 'Clock',
      render(el) {
        const box = document.createElement('div')
        box.style.cssText = 'display:grid;place-items:center;height:100%;text-align:center'
        const t = document.createElement('div')
        t.style.cssText = 'font-size:clamp(48px,18vw,140px);font-weight:800;font-variant-numeric:tabular-nums'
        const d = document.createElement('div')
        d.style.cssText = 'color:var(--text-dim);font-size:18px'
        const inner = document.createElement('div')
        inner.append(t, d)
        box.append(inner)
        el.append(box)
        const draw = () => {
          const now = new Date()
          t.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          d.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
        }
        draw()
        const i = setInterval(draw, 1000)
        return () => clearInterval(i)
      },
    })
  },
}
