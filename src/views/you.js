// "You" tab: stats, history, moods, notes, timelines, mixes, playlist tools,
// achievements, and the doors to the game / party / alarm / store pages.

import * as sp from '../core/spotify.js'
import * as player from '../core/player.js'
import * as history from '../core/history.js'
import * as liked from '../core/likedcache.js'
import * as tags from '../core/tags.js'
import * as mixes from '../core/mixes.js'
import * as achievements from '../core/achievements.js'
import * as nav from '../core/nav.js'
import { hasScopes, login } from '../core/auth.js'
import { h, icon, toast, sheet, pickImage, artistNames, promptSheet, confirmSheet, fill } from '../core/ui.js'
import { trackRow, playRandomLiked } from './library.js'
import { editNote } from './trackmenu.js'
import { openBigArt, openCarMode } from './modes.js'
import { renderGame } from './game.js'
import { renderParty } from './party.js'
import { renderAlarm } from './alarm.js'
import { renderStore } from './store.js'

const backBtn = (back) => h('button', { class: 'ibtn back', onClick: back, 'aria-label': 'Back' }, icon('back'))
const pageHead = (back, title, sub) => [backBtn(back), h('h1', { class: 'title' }, title), sub ? h('p', { class: 'dim' }, sub) : null]

function reconnectNote(what) {
  return h(
    'div',
    { class: 'card note' },
    h('p', {}, `${what} needs a couple of extra Spotify permissions. Reconnect once to turn it on.`),
    h('button', { class: 'btn primary', onClick: () => login().catch((e) => toast(e.message)) }, 'Reconnect Spotify'),
  )
}

// history rows -> track-like objects for trackRow / playback
const playToTrack = (p) => ({
  id: p.id,
  uri: p.uri,
  name: p.name,
  artists: p.artists,
  album: { name: p.album, images: p.image ? [{ url: p.image, width: 64 }] : [] },
  duration_ms: p.durationMs,
})

// ---------- You (home) ----------
export async function renderYou(root, { go }) {
  const streakEl = h('b', {}, '–')
  const weekEl = h('b', {}, '–')
  const minEl = h('b', {}, '–')
  const ach = achievements.progress()
  const tile = (ic, label, onClick, sub) => h('button', { class: 'tile', onClick }, icon(ic, 26), h('span', {}, label), sub ? h('small', {}, sub) : null)

  fill(root,
    h('h1', { class: 'title' }, 'You'),
    hasScopes() ? null : reconnectNote('Stats and history'),
    h(
      'div',
      { class: 'card stat-strip' },
      h('div', {}, h('span', {}, '🔥'), streakEl, h('small', {}, 'day streak')),
      h('div', {}, weekEl, h('small', {}, 'plays this week')),
      h('div', {}, minEl, h('small', {}, 'minutes this week')),
      h('div', {}, h('b', {}, `${ach.done}/${ach.total}`), h('small', {}, 'badges')),
    ),
    h(
      'div',
      { class: 'tiles' },
      tile('chart', 'Stats & recap', () => go('page', { name: 'stats' })),
      tile('history', 'History', () => go('page', { name: 'history' })),
      tile('calendar', 'On this day', () => go('page', { name: 'onthisday' })),
      tile('album', 'Liked timeline', () => go('page', { name: 'timeline' })),
      tile('tag', 'Moods', () => go('page', { name: 'moods' })),
      tile('edit', 'Notes', () => go('page', { name: 'notes' })),
      tile('people', 'Artist mix', () => go('page', { name: 'artistmix' })),
      tile('dice', 'Random liked song', playRandomLiked),
      tile('dice', 'Guess the song', () => go('page', { name: 'game' })),
      tile('party', 'Party mode', () => go('page', { name: 'party' })),
      tile('trophy', 'Achievements', () => go('page', { name: 'achievements' })),
      tile('alarm', 'Wake-up alarm', () => go('page', { name: 'alarm' })),
      tile('timer', 'Focus timer', () => nav.openPlayer('pomodoro:focus')),
      tile('merge', 'Playlist tools', () => go('page', { name: 'playlisttools' })),
      tile('image', 'Big art mode', openBigArt),
      tile('car', 'Car mode', openCarMode),
      tile('store', 'Theme & add-on store', () => go('page', { name: 'store' })),
    ),
  )

  await history.load()
  const s = history.summary(Date.now() - 7 * 86400_000)
  streakEl.textContent = history.streak()
  weekEl.textContent = s.plays
  minEl.textContent = s.minutes
}

// ---------- router for sub pages ----------
export function renderPage(root, params, ctx) {
  const pages = {
    stats: renderStats,
    history: renderHistory,
    onthisday: renderOnThisDay,
    timeline: renderTimeline,
    year: renderYear,
    moods: renderMoods,
    notes: renderNotes,
    artistmix: renderArtistMix,
    achievements: renderAchievements,
    playlisttools: renderPlaylistTools,
    game: renderGame,
    party: renderParty,
    alarm: renderAlarm,
    store: renderStore,
  }
  const fn = pages[params.name]
  if (!fn) return fill(root, backBtn(ctx.back), h('div', { class: 'empty' }, 'Page not found'))
  fn(root, params, ctx)
}

// ---------- 24. stats ----------
function renderStats(root, _p, { back }) {
  let range = 'short_term'
  const seg = h('div', { class: 'seg' })
  const topBox = h('div')
  const recap = h('div', { class: 'card' })
  const drawSeg = () =>
    fill(seg,
      ...[
        ['short_term', '4 weeks'],
        ['medium_term', '6 months'],
        ['long_term', 'All time'],
      ].map(([id, label]) => h('button', { class: id === range ? 'on' : '', onClick: () => ((range = id), drawSeg(), loadTop()) }, label)),
    )

  async function loadTop() {
    if (!hasScopes(['user-top-read'])) return fill(topBox, reconnectNote('Top artists and songs'))
    fill(topBox, h('div', { class: 'empty' }, 'Loading...'))
    try {
      const [a, t] = await Promise.all([sp.top('artists', range, 10), sp.top('tracks', range, 20)])
      fill(topBox,
        h('h2', { class: 'sec' }, 'Top artists'),
        h(
          'div',
          { class: 'artist-row' },
          (a.items ?? []).map((ar, i) =>
            h(
              'button',
              { class: 'artist-chip', onClick: () => player.playBody({ context_uri: ar.uri }) },
              ar.images?.length ? h('img', { src: pickImage(ar.images, 160), alt: '', loading: 'lazy' }) : h('div', { class: 'ph' }, icon('person', 30)),
              h('span', {}, `${i + 1}. ${ar.name}`),
            ),
          ),
        ),
        h('h2', { class: 'sec' }, 'Top songs'),
        h('div', { class: 'list' }, (t.items ?? []).map((tr, i) => trackRow(tr, () => mixes.playTracks((t.items ?? []).slice(i))))),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', onClick: () => mixes.playTracks(t.items ?? [], 'Playing your top songs') }, icon('play', 16), ' Play top songs')),
      )
    } catch (e) {
      fill(topBox, h('div', { class: 'empty' }, 'Could not load stats: ' + e.message))
    }
  }

  async function loadRecap() {
    await history.load()
    const s = history.summary(Date.now() - 7 * 86400_000)
    const hour = s.topHour == null ? '–' : `${String(s.topHour).padStart(2, '0')}:00`
    const max = Math.max(1, ...s.perHour)
    fill(recap,
      h('h2', {}, '🗓️ Your week'),
      h(
        'div',
        { class: 'stat-strip flat' },
        h('div', {}, h('b', {}, s.plays), h('small', {}, 'plays')),
        h('div', {}, h('b', {}, s.minutes), h('small', {}, 'minutes')),
        h('div', {}, h('b', {}, history.streak()), h('small', {}, 'day streak')),
        h('div', {}, h('b', {}, history.longestStreak()), h('small', {}, 'best streak')),
      ),
      s.plays
        ? [
            h('p', { class: 'dim small' }, `Busiest day: ${s.busiestDay ?? '–'} · Favorite hour: ${hour}`),
            h('div', { class: 'hours' }, s.perHour.map((n, i) => h('i', { title: `${i}:00 – ${n} plays`, style: { height: Math.round((n / max) * 100) + '%' } }))),
            h('h2', { class: 'sec' }, 'Top artists this week'),
            h('ol', { class: 'rank' }, s.topArtists.map((a) => h('li', {}, a.name, h('small', {}, ` · ${a.count} plays`)))),
            h('h2', { class: 'sec' }, 'Top songs this week'),
            h('ol', { class: 'rank' }, s.topTracks.map((t) => h('li', {}, t.name, h('small', {}, ` · ${t.artists} · ${t.count}×`)))),
          ]
        : h('p', { class: 'dim' }, 'No plays recorded this week yet. Pulse saves your plays from now on.'),
    )
  }

  drawSeg()
  fill(root, ...pageHead(back, 'Stats'), recap, seg, topBox)
  loadRecap()
  loadTop()
}

// ---------- 25. history ----------
function renderHistory(root, _p, { back }) {
  const list = h('div', { class: 'list' })
  const info = h('p', { class: 'dim small' })
  let shown = 150

  async function draw() {
    await history.load()
    const all = history.all()
    info.textContent = `${all.length} plays saved on this device` + (all.length ? ` since ${new Date(all[all.length - 1].playedAt).toLocaleDateString()}` : '')
    fill(list)
    let day = ''
    for (const p of all.slice(0, shown)) {
      const d = new Date(p.playedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
      if (d !== day) {
        day = d
        list.append(h('h2', { class: 'sec' }, d))
      }
      const t = playToTrack(p)
      const row = trackRow(t, () => mixes.playTracks([t]))
      row.querySelector('.dur').textContent = new Date(p.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      list.append(row)
    }
    if (all.length > shown) list.append(h('button', { class: 'btn ghost', onClick: () => ((shown += 300), draw()) }, 'Show more'))
    if (!all.length) list.append(h('div', { class: 'empty' }, 'Nothing yet. Pulse copies your plays from Spotify every few minutes.'))
  }

  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden' })
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    if (!f) return
    try {
      const n = await history.importJson(await f.text())
      toast(`Imported ${n} plays`)
      draw()
    } catch (e) {
      toast('Import failed: ' + e.message)
    }
  })
  fill(root,
    ...pageHead(back, 'History', 'Spotify only remembers your last 50 plays. Pulse keeps them all, on this device.'),
    hasScopes(['user-read-recently-played']) ? null : reconnectNote('Full history'),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn ghost', onClick: () => history.sync().then((n) => (toast(n ? `${n} new plays` : 'Up to date'), draw())).catch((e) => toast(e.message)) }, icon('history', 16), ' Sync now'),
      h('button', { class: 'btn ghost', onClick: exportHistory }, icon('download', 16), ' Export'),
      h('button', { class: 'btn ghost', onClick: () => file.click() }, 'Import'),
      file,
    ),
    info,
    list,
  )
  draw()
}

function exportHistory() {
  const blob = new Blob([history.exportJson()], { type: 'application/json' })
  const a = h('a', { href: URL.createObjectURL(blob), download: `pulse-history-${new Date().toISOString().slice(0, 10)}.json` })
  document.body.append(a)
  a.click()
  a.remove()
  toast('History exported')
}

// ---------- shared: a list of liked songs with play buttons ----------
function songList(tracks, { emptyText = 'Nothing here', onPlay, label = 'list' } = {}) {
  const box = h('div', { class: 'list' })
  if (!tracks.length) return h('div', { class: 'empty' }, emptyText)
  box.append(
    h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn primary', onClick: () => (onPlay?.(), mixes.playTracks(tracks, `Playing ${label}`)) }, icon('play', 16), ' Play all'),
      h('button', { class: 'btn ghost', onClick: () => (onPlay?.(), achievements.unlock('dj'), mixes.playTracks(mixes.smartShuffle(tracks), `Smart shuffle: ${label}`)) }, icon('shuffle', 16), ' Smart shuffle'),
    ),
    ...tracks.slice(0, 400).map((t, i) => trackRow(t, () => (onPlay?.(), mixes.playTracks(tracks.slice(i, i + 150))))),
  )
  return box
}

async function withLiked(root, back, title, sub, build) {
  fill(root, ...pageHead(back, title, sub), h('div', { class: 'empty' }, 'Loading your liked songs...'))
  try {
    await liked.ensureFresh()
  } catch (e) {
    toast(e.message)
  }
  fill(root, ...pageHead(back, title, sub), build())
}

// ---------- 37. on this day ----------
function renderOnThisDay(root, _p, { back }) {
  withLiked(root, back, 'On this day', new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' }), () => {
    const list = liked.onThisDay()
    const year = new Date().getFullYear()
    const groups = new Map()
    for (const t of list) {
      const y = new Date(t.addedAt).getFullYear()
      if (!groups.has(y)) groups.set(y, [])
      groups.get(y).push(t)
    }
    if (!list.length) return h('div', { class: 'empty' }, 'You did not like any songs on this date in earlier years. Check back tomorrow!')
    return h(
      'div',
      {},
      [...groups.entries()].map(([y, tracks]) => [
        h('h2', { class: 'sec' }, `${year - y} year${year - y > 1 ? 's' : ''} ago · ${y}`),
        songList(tracks, { label: `songs from ${y}`, onPlay: () => achievements.unlock('time-traveler') }),
      ]),
    )
  })
}

// ---------- 38. timeline ----------
function renderTimeline(root, _p, { back, go }) {
  withLiked(root, back, 'Liked timeline', 'Your liked songs, by the year you liked them', () => {
    const years = liked.byYear()
    if (!years.length) return h('div', { class: 'empty' }, 'No liked songs yet')
    const max = Math.max(...years.map(([, l]) => l.length))
    return h(
      'div',
      { class: 'timeline' },
      years.map(([y, list]) =>
        h(
          'button',
          { class: 'tl-row', onClick: () => go('page', { name: 'year', year: y }) },
          h('b', {}, y),
          h('div', { class: 'tl-bar' }, h('i', { style: { width: Math.max(4, (list.length / max) * 100) + '%' } })),
          h('span', {}, list.length),
        ),
      ),
    )
  })
}

function renderYear(root, { year }, { back }) {
  withLiked(root, back, `Liked in ${year}`, null, () => {
    const list = liked.byYear().find(([y]) => String(y) === String(year))?.[1] ?? []
    return songList(list, { label: `your ${year} likes` })
  })
}

// ---------- 26 + 39. moods ----------
function renderMoods(root, _p, { back }) {
  const selected = new Set()
  const chips = h('div', { class: 'chips' })
  const body = h('div')
  const draw = () => {
    fill(chips,
      ...tags.moods().map((m) => {
        const n = tags.tracksWithMoods([m.id]).length
        return h('button', { class: 'chip' + (selected.has(m.id) ? ' on' : ''), onClick: () => (selected.has(m.id) ? selected.delete(m.id) : selected.add(m.id), draw()) }, `${m.emoji} ${m.name} `, h('small', {}, n))
      }),
      h(
        'button',
        {
          class: 'chip ghost',
          onClick: async () => {
            const name = await promptSheet({ title: 'New mood', placeholder: 'e.g. Rainy day' })
            if (name?.trim()) tags.addMood(name.trim())
            draw()
          },
        },
        '+ New',
      ),
    )
    const ids = [...selected]
    const list = ids.length ? tags.tracksWithMoods(ids) : []
    fill(body,
      ids.length
        ? [
            h(
              'div',
              { class: 'btn-row' },
              h(
                'button',
                {
                  class: 'btn primary',
                  onClick: () => {
                    achievements.unlock('dj')
                    mixes.playTracks(mixes.smartShuffle(list), 'Mood mix: ' + ids.map((id) => tags.moods().find((m) => m.id === id)?.name).join(' + '))
                  },
                },
                icon('play', 16),
                ' Play mood mix',
              ),
              ids.length === 1
                ? h(
                    'button',
                    {
                      class: 'btn danger',
                      onClick: async () => {
                        if (await confirmSheet({ title: 'Delete this mood?', text: 'Songs keep their other moods.', okLabel: 'Delete', danger: true })) {
                          tags.removeMood(ids[0])
                          selected.clear()
                          draw()
                        }
                      },
                    },
                    'Delete mood',
                  )
                : null,
            ),
            list.length ? h('div', { class: 'list' }, list.map((t, i) => trackRow(t, () => mixes.playTracks(list.slice(i))))) : h('div', { class: 'empty' }, 'No songs with this mood yet'),
          ]
        : h('p', { class: 'dim' }, 'Tag songs by long-pressing them (or ⋯ in the player > Mood tags). Pick one or more moods above to filter and build a mix.'),
    )
  }
  fill(root, ...pageHead(back, 'Moods'), chips, body)
  draw()
  const off = tags.onTags('change', () => (chips.isConnected ? draw() : off()))
}

// ---------- 27. notes ----------
function renderNotes(root, _p, { back }) {
  const box = h('div', { class: 'list' })
  const draw = () => {
    const all = tags.notes()
    fill(box,
      ...(all.length
        ? all.map(({ track, note }) =>
            h(
              'div',
              { class: 'note-card' },
              trackRow(track, () => mixes.playTracks([track])),
              h('button', { class: 'note-text', onClick: () => editNote(track) }, note),
            ),
          )
        : [h('div', { class: 'empty' }, 'No notes yet. Long-press a song > Add a note.')]),
    )
  }
  fill(root, ...pageHead(back, 'Notes'), box)
  draw()
  const off = tags.onTags('change', () => (box.isConnected ? draw() : off()))
}

// ---------- 40. artist mix ----------
function renderArtistMix(root, _p, { back }) {
  withLiked(root, back, 'Artist mix', 'Pick up to 3 artists. Pulse takes turns between their liked songs.', () => {
    const picked = []
    const filter = h('input', { class: 'field', type: 'search', placeholder: 'Find an artist' })
    const chosen = h('div', { class: 'chips' })
    const list = h('div', { class: 'list' })
    const playBtn = h('button', { class: 'btn primary', disabled: true }, icon('play', 16), ' Play mix')
    const all = liked.artists()
    const draw = () => {
      fill(chosen, ...picked.map((a) => h('button', { class: 'chip on', onClick: () => (picked.splice(picked.indexOf(a), 1), draw()) }, a.name + ' ✕')))
      playBtn.disabled = !picked.length
      const q = filter.value.trim().toLowerCase()
      fill(list,
        ...all
          .filter((a) => !q || a.name.toLowerCase().includes(q))
          .slice(0, 80)
          .map((a) =>
            h(
              'button',
              {
                class: 'row' + (picked.includes(a) ? ' picked' : ''),
                onClick: () => {
                  if (picked.includes(a)) picked.splice(picked.indexOf(a), 1)
                  else if (picked.length < 3) picked.push(a)
                  else return toast('Pick up to 3 artists')
                  draw()
                },
              },
              h('div', { class: 'art sm ph' }, icon('person', 22)),
              h('div', { class: 'meta' }, h('div', { class: 't' }, a.name), h('div', { class: 's' }, `${a.count} liked songs`)),
              picked.includes(a) ? icon('check', 22) : null,
            ),
          ),
      )
    }
    playBtn.onclick = () => {
      achievements.unlock('dj')
      mixes.playTracks(mixes.interleave(picked.map((a) => liked.tracksByArtist(a.id))), 'Artist mix: ' + picked.map((a) => a.name).join(' / '))
    }
    filter.addEventListener('input', draw)
    draw()
    return h('div', {}, chosen, h('div', { class: 'btn-row' }, playBtn), filter, list)
  })
}

// ---------- 43. achievements ----------
function renderAchievements(root, _p, { back }) {
  const p = achievements.progress()
  fill(root,
    ...pageHead(back, 'Achievements', `${p.done} of ${p.total} unlocked`),
    h(
      'div',
      { class: 'badges' },
      achievements.LIST.map((a) => {
        const at = achievements.unlockedAt(a.id)
        return h(
          'div',
          { class: 'badge' + (at ? ' on' : '') },
          h('div', { class: 'badge-emoji' }, at ? a.emoji : '🔒'),
          h('b', {}, a.name),
          h('small', {}, a.desc),
          at ? h('small', { class: 'dim' }, new Date(at).toLocaleDateString()) : null,
        )
      }),
    ),
  )
}

// ---------- 33 + 34. playlist tools ----------
function renderPlaylistTools(root, _p, { back }) {
  fill(root,
    ...pageHead(back, 'Playlist tools', 'Works on playlists you own (Spotify rule).'),
    hasScopes(['playlist-modify-private']) ? null : reconnectNote('Editing playlists'),
    h(
      'div',
      { class: 'tiles' },
      h('button', { class: 'tile', onClick: () => findDuplicates(root, back) }, icon('copy', 26), h('span', {}, 'Find duplicates')),
      h('button', { class: 'tile', onClick: mergeSheet }, icon('merge', 26), h('span', {}, 'Merge playlists')),
      h('button', { class: 'tile', onClick: splitSheet }, icon('queue', 26), h('span', {}, 'Split a playlist')),
    ),
  )
}

async function ownedPlaylists() {
  const [me, lists] = await Promise.all([sp.me(), sp.allMyPlaylists()])
  return lists.filter((p) => p.owner?.id === me.id || p.collaborative)
}

const songKey = (t) =>
  `${t.name}`
    .toLowerCase()
    .replace(/\s*[([].*?(remaster|version|edit|mono|stereo).*?[)\]]/g, '')
    .replace(/\s+-\s+.*remaster.*$/, '')
    .trim() +
  '|' +
  (t.artists?.[0]?.name ?? '').toLowerCase()

async function findDuplicates(root, back) {
  const status = h('p', { class: 'dim' }, 'Loading your playlists...')
  const out = h('div')
  fill(root, ...pageHead(() => renderPlaylistTools(root, {}, { back }), 'Duplicate finder'), status, out)
  let lists
  try {
    lists = await ownedPlaylists()
  } catch (e) {
    return (status.textContent = e.message)
  }
  const data = []
  for (const [i, p] of lists.entries()) {
    status.textContent = `Scanning ${i + 1} / ${lists.length}: ${p.name}`
    try {
      data.push({ p, tracks: await sp.allPlaylistTracks(p.id) })
    } catch {}
  }
  status.textContent = `Scanned ${data.length} playlists.`

  // inside one playlist
  const inside = []
  for (const { p, tracks } of data) {
    const seen = new Map()
    const dups = []
    for (const { track } of tracks) {
      const k = songKey(track)
      if (seen.has(k)) dups.push({ track, first: seen.get(k) })
      else seen.set(k, track)
    }
    if (dups.length) inside.push({ p, dups })
  }
  // across playlists
  const across = new Map()
  for (const { p, tracks } of data) {
    for (const { track } of tracks) {
      const k = songKey(track)
      const e = across.get(k) ?? { track, lists: new Set() }
      e.lists.add(p.name)
      across.set(k, e)
    }
  }
  const multi = [...across.values()].filter((e) => e.lists.size > 1).sort((a, b) => b.lists.size - a.lists.size)

  fill(out,
    h('h2', { class: 'sec' }, `Inside the same playlist (${inside.reduce((n, x) => n + x.dups.length, 0)})`),
    inside.length
      ? inside.map(({ p, dups }) =>
          h(
            'div',
            { class: 'card' },
            h('h2', {}, p.name),
            dups.map(({ track, first }) => h('div', { class: 'dim small' }, `${track.name} · ${artistNames(track)}` + (first.uri !== track.uri ? ' (different version)' : ''))),
            h(
              'button',
              {
                class: 'btn primary',
                onClick: async (e) => {
                  e.target.disabled = true
                  try {
                    await removeDuplicates(p, dups)
                    achievements.unlock('cleaner')
                    toast('Cleaned up ' + p.name)
                    e.target.textContent = 'Done'
                  } catch (err) {
                    toast(err.message)
                    e.target.disabled = false
                  }
                },
              },
              'Remove duplicates',
            ),
          ),
        )
      : h('p', { class: 'dim' }, 'None. Nice and tidy!'),
    h('h2', { class: 'sec' }, `In more than one playlist (${multi.length})`),
    multi.length
      ? h(
          'div',
          { class: 'list' },
          multi.slice(0, 200).map((e) => h('div', { class: 'row static' }, h('div', { class: 'meta' }, h('div', { class: 't' }, e.track.name + ' · ' + artistNames(e.track)), h('div', { class: 's wrap' }, [...e.lists].join(', '))))),
        )
      : h('p', { class: 'dim' }, 'No songs repeat across playlists.'),
  )
}

// Spotify removes every copy of a uri, so remove them all, then put one copy
// of each exact duplicate back where it first was.
async function removeDuplicates(p, dups) {
  const tracks = (await sp.allPlaylistTracks(p.id)).map((x) => x.track)
  const otherVersions = new Set(dups.filter((d) => d.first.uri !== d.track.uri).map((d) => d.track.uri))
  const sameUri = new Set(dups.filter((d) => d.first.uri === d.track.uri && !otherVersions.has(d.track.uri)).map((d) => d.track.uri))
  const seen = new Set()
  const desired = []
  for (const t of tracks) {
    if (otherVersions.has(t.uri)) continue
    if (sameUri.has(t.uri)) {
      if (seen.has(t.uri)) continue
      seen.add(t.uri)
    }
    desired.push(t.uri)
  }
  await sp.removeFromPlaylist(p.id, [...sameUri, ...otherVersions])
  // inserting in ascending order puts each one at its final index
  for (let i = 0; i < desired.length; i++) if (sameUri.has(desired[i])) await sp.addToPlaylist(p.id, [desired[i]], i)
}

async function pickPlaylists({ title, multiple, includeLiked }) {
  const lists = await ownedPlaylists()
  return new Promise((resolve) => {
    let done = false
    const chosen = new Set()
    const options = [...(includeLiked ? [{ id: 'liked', name: 'Liked Songs' }] : []), ...lists]
    const box = h('div', { class: 'list' })
    const draw = () =>
      fill(box,
        ...options.map((p) =>
          h(
            'button',
            {
              class: 'row' + (chosen.has(p.id) ? ' picked' : ''),
              onClick: () => {
                if (!multiple) {
                  done = true
                  close()
                  return resolve([p])
                }
                chosen.has(p.id) ? chosen.delete(p.id) : chosen.add(p.id)
                draw()
              },
            },
            h('div', { class: 'meta' }, h('div', { class: 't' }, p.name), h('div', { class: 's' }, sp.playlistTotal(p) != null ? `${sp.playlistTotal(p)} songs` : '')),
            chosen.has(p.id) ? icon('check', 22) : null,
          ),
        ),
      )
    draw()
    const close = sheet({
      title,
      content: h(
        'div',
        { class: 'sheet-pad' },
        box,
        multiple ? h('button', { class: 'btn primary', onClick: () => ((done = true), close(), resolve(options.filter((p) => chosen.has(p.id)))) }, 'Continue') : null,
      ),
      onClose: () => !done && resolve(null),
    })
  })
}

async function tracksOf(p) {
  if (p.id === 'liked') return (await liked.ensureFresh()).map((t) => t)
  return (await sp.allPlaylistTracks(p.id)).map((x) => x.track)
}

async function mergeSheet() {
  try {
    const picked = await pickPlaylists({ title: 'Merge which playlists?', multiple: true, includeLiked: true })
    if (!picked) return
    if (picked.length < 2) return toast('Pick at least 2')
    const name = await promptSheet({ title: 'Name the merged playlist', value: picked.map((p) => p.name).join(' + ').slice(0, 90) })
    if (!name?.trim()) return
    toast('Merging...')
    const seen = new Set()
    const uris = []
    for (const p of picked) for (const t of await tracksOf(p)) if (t?.uri && !seen.has(t.uri)) seen.add(t.uri), uris.push(t.uri)
    const np = await sp.createPlaylist(name.trim(), 'Merged with Pulse')
    await sp.addToPlaylist(np.id, uris)
    toast(`Created "${name.trim()}" with ${uris.length} songs`)
  } catch (e) {
    toast(e.message)
  }
}

async function splitSheet() {
  try {
    const picked = await pickPlaylists({ title: 'Split which playlist?', multiple: false, includeLiked: true })
    if (!picked) return
    const p = picked[0]
    const tracks = (await tracksOf(p)).filter((t) => t?.uri)
    sheet({
      title: `Split "${p.name}" (${tracks.length} songs)`,
      items: [
        ...[25, 50, 100].map((n) => ({
          label: `Every ${n} songs`,
          sub: `${Math.ceil(tracks.length / n)} playlists`,
          onClick: () => {
            const groups = []
            for (let i = 0; i < tracks.length; i += n) groups.push([`${p.name} (${groups.length + 1})`, tracks.slice(i, i + n)])
            makeSplit(groups)
          },
        })),
        {
          label: 'By release decade',
          onClick: () => {
            const map = new Map()
            for (const t of tracks) {
              const y = parseInt(t.album?.release_date)
              const k = y ? `${Math.floor(y / 10) * 10}s` : 'Unknown year'
              if (!map.has(k)) map.set(k, [])
              map.get(k).push(t)
            }
            makeSplit([...map.entries()].sort().map(([k, l]) => [`${p.name} · ${k}`, l]))
          },
        },
        {
          label: 'By main artist (5+ songs each)',
          onClick: () => {
            const map = new Map()
            for (const t of tracks) {
              const k = t.artists?.[0]?.name ?? 'Unknown'
              if (!map.has(k)) map.set(k, [])
              map.get(k).push(t)
            }
            makeSplit([...map.entries()].filter(([, l]) => l.length >= 5).map(([k, l]) => [`${p.name} · ${k}`, l]))
          },
        },
      ],
    })
  } catch (e) {
    toast(e.message)
  }
}

async function makeSplit(groups) {
  if (!groups.length) return toast('Nothing to split')
  if (!(await confirmSheet({ title: `Create ${groups.length} playlists?`, text: groups.map(([n, l]) => `${n} (${l.length})`).join('\n'), okLabel: 'Create' }))) return
  try {
    for (const [i, [name, list]] of groups.entries()) {
      toast(`Creating ${i + 1} / ${groups.length}...`, 1500)
      const np = await sp.createPlaylist(name.slice(0, 100), 'Split with Pulse')
      await sp.addToPlaylist(np.id, list.map((t) => t.uri))
    }
    toast(`Made ${groups.length} playlists`)
  } catch (e) {
    toast(e.message)
  }
}

