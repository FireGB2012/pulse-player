// Touch/mouse gesture helpers built on pointer events.

// Long-press (or right-click on PC). Swallows the click that follows a long-press.
export function onLongPress(el, fn, ms = 480) {
  let timer = 0
  let fired = false
  let start = null
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    fired = false
    start = { x: e.clientX, y: e.clientY }
    clearTimeout(timer)
    timer = setTimeout(() => {
      fired = true
      navigator.vibrate?.(12)
      fn(e)
    }, ms)
  })
  const cancel = () => clearTimeout(timer)
  el.addEventListener('pointerup', cancel)
  el.addEventListener('pointercancel', cancel)
  el.addEventListener('pointerleave', cancel)
  el.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel()
  })
  el.addEventListener(
    'click',
    (e) => {
      if (fired) {
        e.preventDefault()
        e.stopImmediatePropagation()
        fired = false
      }
    },
    true,
  )
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    clearTimeout(timer)
    fn(e)
  })
}

// Swipes + double-tap on one element.
// handlers: { left, right, down, up, doubleTap, move(dx, dy), end() }
export function onSwipe(el, handlers, { threshold = 70 } = {}) {
  let start = null
  let lastTap = 0
  el.style.touchAction = 'none'
  el.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, t: Date.now() }
    el.setPointerCapture?.(e.pointerId)
  })
  el.addEventListener('pointermove', (e) => {
    if (!start) return
    handlers.move?.(e.clientX - start.x, e.clientY - start.y)
  })
  const finish = (e) => {
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const dt = Date.now() - start.t
    start = null
    handlers.end?.()
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (Math.max(ax, ay) >= threshold) {
      if (ax > ay) (dx < 0 ? handlers.left : handlers.right)?.()
      else (dy > 0 ? handlers.down : handlers.up)?.()
      return
    }
    if (ax < 12 && ay < 12 && dt < 300) {
      const now = Date.now()
      if (now - lastTap < 320) {
        lastTap = 0
        handlers.doubleTap?.(e)
      } else {
        lastTap = now
        handlers.tap?.(e)
      }
    }
  }
  el.addEventListener('pointerup', finish)
  el.addEventListener('pointercancel', () => {
    start = null
    handlers.end?.()
  })
}
