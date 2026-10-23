// Bridge to Pulse's own Android code (widget, notification controls, floating
// bubble, headphones, alarms, sharing). Everything is a no-op off Android.

import { Capacitor, registerPlugin } from '@capacitor/core'

const Native = registerPlugin('PulseNative')
export const isAndroid = Capacitor.getPlatform() === 'android'

async function call(method, args = {}) {
  if (!isAndroid) return null
  try {
    return await Native[method](args)
  } catch (e) {
    console.warn('[pulse] native', method, e)
    return null
  }
}

// info: { title, artist, artUrl, isPlaying, accent, bg, text }
export const updateNowPlaying = (info) => call('updateNowPlaying', info)
// { notification: bool, bubble: bool, headphoneResume: bool }
export const setControls = (opts) => call('setControls', opts)
export const canDrawOverlays = async () => !!(await call('canDrawOverlays'))?.value
export const openOverlaySettings = () => call('openOverlaySettings')
export const requestNotifications = async () => (await call('requestNotifications'))?.granted ?? false
export const keepAwake = (on) => call('keepAwake', { on })
// at: epoch ms
export const scheduleAlarm = (at, label) => call('scheduleAlarm', { at, label })
export const cancelAlarm = () => call('cancelAlarm')
export const shareImage = (base64, title) => call('shareImage', { base64, title })
export const takeLaunchAction = async () => (await call('takeLaunchAction'))?.action ?? null

export function on(event, fn) {
  if (!isAndroid) return () => {}
  const h = Native.addListener(event, fn)
  return () => h.then((x) => x.remove())
}
