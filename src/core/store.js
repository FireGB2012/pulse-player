// Tiny helpers: namespaced localStorage + event emitter.

export const ls = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('pulse.' + key)
      return v === null ? fallback : JSON.parse(v)
    } catch {
      return fallback
    }
  },
  set(key, val) {
    try {
      localStorage.setItem('pulse.' + key, JSON.stringify(val))
    } catch {}
  },
  del(key) {
    try {
      localStorage.removeItem('pulse.' + key)
    } catch {}
  },
}

export function emitter() {
  const map = new Map()
  return {
    on(ev, fn) {
      if (!map.has(ev)) map.set(ev, new Set())
      map.get(ev).add(fn)
      return () => map.get(ev)?.delete(fn)
    },
    emit(ev, ...args) {
      map.get(ev)?.forEach((fn) => {
        try {
          fn(...args)
        } catch (e) {
          console.error('[pulse] listener error in', ev, e)
        }
      })
    },
  }
}
