// Background features started once the app is logged in: shake to skip,
// Android widget/notification/bubble/headphones, PC tray/hotkeys/Discord,
// history + liked-songs syncing, alarm, achievements.

import * as player from './player.js'
import * as settings from './settings.js'
import * as themes from './themes.js'
import * as native from './native.js'
import * as history from './history.js'
import * as liked from './likedcache.js'
import * as alarm from './alarm.js'
import * as achievements from './achievements.js'
import { desktop } from './desktop.js'
import { pickImage, artistNames, toast } from './ui.js'

// ---------- 18. shake to skip ----------
let lastShake = 0
function onMotion(e) {
  const a = e.accelerationIncludingGravity ?? e.acceleration
  if (!a || a.x == null) return
  const force = Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81)
  if (force < settings.get('shakeStrength')) return
  const now = Date.now()
  if (now - lastShake < 1500) return
  lastShake = now
  navigator.vibrate?.(40)
  player.next()
  toast('📳 Skipped')
  achievements.unlock('shaker')
}
function applyShake() {
  removeEventListener('devicemotion', onMotion)
  if (settings.get('shakeToSkip')) addEventListener('devicemotion', onMotion)
}

// ---------- now playing info for native/desktop ----------
function nowPlayingInfo() {
  const t = player.state.track
  return {
    title: t?.name ?? '',
    artist: t ? artistNames(t) : '',
    album: t?.album?.name ?? '',
    artUrl: pickImage(t?.album?.images, 300),
    isPlaying: !!player.state.isPlaying,
    liked: !!player.state.liked,
    durationMs: player.state.durationMs,
    progressMs: player.currentProgress(),
    trackUrl: t?.id ? `https://open.spotify.com/track/${t.id}` : '',
    accent: themes.effectiveVar('--accent'),
    bg: themes.effectiveVar('--bg'),
    text: themes.effectiveVar('--text'),
  }
}

let pushTimer = 0
let lastPushed = ''
function pushNowPlaying() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    const info = nowPlayingInfo()
    const key = JSON.stringify({ ...info, progressMs: 0 })
    // progress alone changes every tick; only resend when something else changed
    if (key === lastPushed) return
    lastPushed = key
    native.updateNowPlaying(info)
    desktop?.nowPlaying(info)
  }, 300)
}

function applyNativeControls() {
  native.setControls({
    notification: settings.get('notifControls'),
    bubble: settings.get('bubble'),
    headphoneResume: settings.get('headphoneResume'),
  })
}

function applyDesktop() {
  desktop?.configure({
    hotkeys: settings.get('hotkeys'),
    discordEnabled: settings.get('discordEnabled'),
    discordAppId: settings.get('discordAppId'),
  })
}

async function runCommand(cmd) {
  if (cmd === 'playpause') return player.toggle()
  if (cmd === 'next') return player.next()
  if (cmd === 'previous') return player.previous()
  if (cmd === 'like') {
    await player.toggleLike()
    return toast(player.state.liked ? '💜 Liked' : 'Removed from Liked Songs')
  }
}

function checkHistoryAchievements() {
  achievements.checkHistory({ count: history.all().length, streak: history.streak(), plays: history.all() })
}

export function startExtras() {
  applyShake()
  settings.onSettings('change', (k) => {
    if (k === 'shakeToSkip') applyShake()
    if (['notifControls', 'bubble', 'headphoneResume'].includes(k)) applyNativeControls()
    if (['hotkeys', 'discordEnabled', 'discordAppId'].includes(k)) applyDesktop()
  })

  player.on('state', pushNowPlaying)
  themes.onThemeChange('change', () => {
    lastPushed = ''
    pushNowPlaying()
  })
  player.on('liked', (t, on) => {
    liked.noteLiked(t, on)
    if (on) {
      achievements.unlock('first-like')
      if (achievements.bump('likes') >= 25) achievements.unlock('likes-25')
    }
  })
  player.on('context', (uri) => themes.setPlayingContext(uri))

  if (native.isAndroid) {
    applyNativeControls()
    native.on('headphonesConnected', () => {
      if (settings.get('headphoneResume') && !player.state.isPlaying) {
        player.toggle()
        toast('🎧 Headphones connected, resuming')
      }
    })
    native.on('launchAction', ({ action }) => action === 'alarm' && alarm.ring())
    native.takeLaunchAction().then((a) => a === 'alarm' && alarm.ring())
  }
  if (desktop) {
    applyDesktop()
    desktop.onCommand(runCommand)
  }

  history.start()
  history.onHistory('change', checkHistoryAchievements)
  history.load().then(checkHistoryAchievements)
  alarm.start()
  // keep the liked-songs cache warm in the background
  setTimeout(() => liked.ensureFresh().catch(() => {}), 8000)
}
