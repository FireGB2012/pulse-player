// App settings with defaults + change events. Stored in localStorage as one object.

import { ls, emitter } from './store.js'

export const DEFAULTS = {
  // looks
  autoTheme: false, // switch theme by time of day
  autoThemeDay: 'paper',
  autoThemeNight: 'midnight',
  autoThemeDayStart: 7, // hour
  autoThemeNightStart: 20,
  seasonal: true, // Halloween / Christmas themes switch themselves on
  font: 'theme', // font pack id, 'theme' = use the theme's font
  skin: 'none', // 'none' | 'vinyl' | 'cassette' | 'tapedeck'
  albumGradient: false, // animated gradient from album colors
  // player
  swipeGestures: true,
  doubleTapLike: true,
  fadeIn: false,
  fadeInSeconds: 4,
  shakeToSkip: false,
  shakeStrength: 22,
  controls: null, // layout editor: [{ id, visible }]
  // android extras
  notifControls: false,
  bubble: false,
  headphoneResume: false,
  widgetSync: true,
  // pc extras
  discordAppId: '',
  discordEnabled: false,
  hotkeys: true,
  // store
  storeUrl: 'https://raw.githubusercontent.com/FireGB2012/pulse-player/main/store/index.json',
}

const bus = emitter()
let values = { ...DEFAULTS, ...ls.get('settings', {}) }

export const onSettings = bus.on
export const get = (k) => values[k]
export const all = () => ({ ...values })

export function set(k, v) {
  if (values[k] === v) return
  values[k] = v
  ls.set('settings', values)
  bus.emit('change', k, v)
  bus.emit(k, v)
}
