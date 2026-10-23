// Achievements + badges. Unlocks are stored on this device.

import { ls, emitter } from './store.js'
import { toast } from './ui.js'

const bus = emitter()
export const onAchievements = bus.on

export const LIST = [
  { id: 'first-like', emoji: '💜', name: 'First Love', desc: 'Like a song in Pulse' },
  { id: 'likes-25', emoji: '💘', name: 'Heartbreaker', desc: 'Like 25 songs in Pulse' },
  { id: 'plays-100', emoji: '🎧', name: 'Tuned In', desc: '100 plays in your history' },
  { id: 'plays-1000', emoji: '🏆', name: 'Certified Listener', desc: '1,000 plays in your history' },
  { id: 'streak-3', emoji: '🔥', name: 'On Fire', desc: '3-day listening streak' },
  { id: 'streak-7', emoji: '⚡', name: 'Unstoppable', desc: '7-day listening streak' },
  { id: 'streak-30', emoji: '👑', name: 'Legend', desc: '30-day listening streak' },
  { id: 'night-owl', emoji: '🦉', name: 'Night Owl', desc: 'Listen between midnight and 4 AM' },
  { id: 'early-bird', emoji: '🐦', name: 'Early Bird', desc: 'Listen between 5 and 7 AM' },
  { id: 'theme-maker', emoji: '🎨', name: 'Designer', desc: 'Save your own theme' },
  { id: 'photo-theme', emoji: '📸', name: 'Picture Perfect', desc: 'Make a theme from a photo' },
  { id: 'collector', emoji: '🗂️', name: 'Collector', desc: 'Have 5 of your own themes' },
  { id: 'sharer', emoji: '📤', name: 'Show-off', desc: 'Share a theme or a now-playing card' },
  { id: 'karaoke', emoji: '🎤', name: 'Karaoke Star', desc: 'Open karaoke mode' },
  { id: 'party-host', emoji: '🥳', name: 'Party Host', desc: 'Start a party' },
  { id: 'quiz-player', emoji: '🎲', name: 'Game On', desc: 'Finish a Guess the Song game' },
  { id: 'quiz-perfect', emoji: '🧠', name: 'Big Brain', desc: 'Score 10/10 in Guess the Song' },
  { id: 'pomodoro', emoji: '🍅', name: 'Locked In', desc: 'Finish a focus session' },
  { id: 'mood-tagger', emoji: '🏷️', name: 'Mood Ring', desc: 'Tag 10 songs with moods' },
  { id: 'note-taker', emoji: '📝', name: 'Liner Notes', desc: 'Write a note on a song' },
  { id: 'shaker', emoji: '📳', name: 'Shake It Off', desc: 'Skip a song by shaking' },
  { id: 'dj', emoji: '🎛️', name: 'The DJ', desc: 'Use smart shuffle or a mix' },
  { id: 'cleaner', emoji: '🧹', name: 'Clean Freak', desc: 'Remove duplicate songs' },
  { id: 'time-traveler', emoji: '⏳', name: 'Time Traveler', desc: 'Play an "On this day" song' },
  { id: 'shopper', emoji: '🛍️', name: 'Window Shopper', desc: 'Install something from the store' },
  { id: 'wake-up', emoji: '⏰', name: 'Rise & Grind', desc: 'Wake up to a Pulse alarm' },
  { id: 'road-trip', emoji: '🚗', name: 'Road Trip', desc: 'Use car mode' },
  { id: 'hero', emoji: '🦸', name: 'Hero Mode', desc: 'Use a hero theme' },
]

const unlocked = () => ls.get('achievements', {})
export const isUnlocked = (id) => !!unlocked()[id]
export const unlockedAt = (id) => unlocked()[id] ?? null
export const progress = () => ({ done: Object.keys(unlocked()).length, total: LIST.length })

export function unlock(id) {
  const map = unlocked()
  if (map[id]) return false
  const a = LIST.find((x) => x.id === id)
  if (!a) return false
  map[id] = Date.now()
  ls.set('achievements', map)
  toast(`${a.emoji} Achievement: ${a.name}`, 4200)
  bus.emit('change', a)
  return true
}

// Counters for "do X n times" achievements.
export function bump(counter, by = 1) {
  const c = ls.get('achCounters', {})
  c[counter] = (c[counter] ?? 0) + by
  ls.set('achCounters', c)
  return c[counter]
}

// Checks that look at listening history.
export function checkHistory({ count, streak, plays }) {
  if (count >= 100) unlock('plays-100')
  if (count >= 1000) unlock('plays-1000')
  if (streak >= 3) unlock('streak-3')
  if (streak >= 7) unlock('streak-7')
  if (streak >= 30) unlock('streak-30')
  for (const p of plays.slice(0, 200)) {
    const h = new Date(p.playedAt).getHours()
    if (h < 4) unlock('night-owl')
    if (h >= 5 && h < 7) unlock('early-bird')
  }
}
