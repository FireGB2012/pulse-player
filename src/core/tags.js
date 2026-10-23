// Mood tags and personal notes on songs. Stored on this device only.

import { ls, emitter } from './store.js'
import { slimTrack } from './likedcache.js'

const bus = emitter()
export const onTags = bus.on

const DEFAULT_MOODS = [
  { id: 'hype', name: 'Hype', emoji: '🔥' },
  { id: 'chill', name: 'Chill', emoji: '🌊' },
  { id: 'happy', name: 'Happy', emoji: '😄' },
  { id: 'sad', name: 'Sad', emoji: '🌧️' },
  { id: 'focus', name: 'Focus', emoji: '🎯' },
  { id: 'gym', name: 'Gym', emoji: '💪' },
  { id: 'night', name: 'Night', emoji: '🌙' },
  { id: 'party', name: 'Party', emoji: '🎉' },
]

export const moods = () => ls.get('moods', DEFAULT_MOODS)
export function addMood(name, emoji = '🏷️') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!id || moods().some((m) => m.id === id)) return null
  const list = [...moods(), { id, name, emoji }]
  ls.set('moods', list)
  bus.emit('change')
  return id
}
export function removeMood(id) {
  ls.set('moods', moods().filter((m) => m.id !== id))
  const all = entries()
  for (const e of Object.values(all)) e.moods = (e.moods ?? []).filter((m) => m !== id)
  save(all)
}

// uri -> { moods: [...], note: '', track: slim }
const entries = () => ls.get('trackTags', {})
function save(all) {
  for (const [k, e] of Object.entries(all)) if (!e.moods?.length && !e.note) delete all[k]
  ls.set('trackTags', all)
  bus.emit('change')
}

export const getMoods = (uri) => entries()[uri]?.moods ?? []
export const getNote = (uri) => entries()[uri]?.note ?? ''

export function setMoods(track, list) {
  const all = entries()
  const e = all[track.uri] ?? { moods: [], note: '' }
  e.moods = list
  e.track = slimTrack(track)
  all[track.uri] = e
  save(all)
}

export function setNote(track, note) {
  const all = entries()
  const e = all[track.uri] ?? { moods: [], note: '' }
  e.note = note.trim()
  e.track = e.track ?? slimTrack(track)
  all[track.uri] = e
  save(all)
}

export const tracksWithMoods = (ids) =>
  Object.values(entries())
    .filter((e) => e.track && ids.some((id) => e.moods?.includes(id)))
    .map((e) => e.track)

export const notes = () =>
  Object.values(entries())
    .filter((e) => e.note && e.track)
    .map((e) => ({ track: e.track, note: e.note }))

export const taggedCount = () => Object.values(entries()).filter((e) => e.moods?.length).length
