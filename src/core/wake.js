// Keep the screen on (big art, car mode, karaoke, alarms).

import * as native from './native.js'

let lock = null
let users = 0

async function acquire() {
  if (native.isAndroid) return native.keepAwake(true)
  try {
    lock = await navigator.wakeLock?.request('screen')
  } catch {}
}

export function stayAwake() {
  if (users++ === 0) acquire()
  let released = false
  return () => {
    if (released) return
    released = true
    if (--users > 0) return
    if (native.isAndroid) native.keepAwake(false)
    lock?.release().catch(() => {})
    lock = null
  }
}

// browsers drop the lock when the page is hidden; take it back
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && users > 0 && !native.isAndroid) acquire()
})
