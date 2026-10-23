// 41. Party mode. Friends scan a QR code and send song requests that land in
// your queue. No Pulse server needed: requests go through ntfy.sh, a free public
// message relay, on a random secret channel that only exists for this party.

import qrcode from 'qrcode-generator'
import * as sp from '../core/spotify.js'
import * as player from '../core/player.js'
import * as achievements from '../core/achievements.js'
import { emitter } from '../core/store.js'
import { h, icon, toast, copyText, artistNames, fill } from '../core/ui.js'

const bus = emitter()
let party = null // { topic, es, log: [], recent: [] }

const RELAY = 'https://ntfy.sh/'

function randomTopic() {
  const a = new Uint8Array(9)
  crypto.getRandomValues(a)
  return 'pulse-party-' + Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
}

async function resolve(text) {
  const m = text.match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/)
  if (m) return sp.api(`/tracks/${m[1]}`)
  const r = await sp.search(text)
  return r.tracks?.items?.find(Boolean) ?? null
}

async function onRequest(raw) {
  const text = String(raw).trim().slice(0, 120)
  if (!text || !party) return
  // simple flood guard: 15 requests a minute
  const now = Date.now()
  party.recent = party.recent.filter((t) => now - t < 60_000)
  if (party.recent.length >= 15) return
  party.recent.push(now)
  const entry = { at: now, text, status: 'Looking it up...' }
  party.log.unshift(entry)
  bus.emit('change')
  try {
    const t = await resolve(text)
    if (!t) entry.status = 'Not found'
    else if (await player.addToQueue(t.uri)) {
      entry.status = `Queued: ${t.name} · ${artistNames(t)}`
      toast(`🎉 Request: ${t.name}`)
    } else entry.status = 'Could not queue (no active device?)'
  } catch (e) {
    entry.status = 'Error: ' + e.message
  }
  bus.emit('change')
}

export function startParty() {
  stopParty()
  const topic = randomTopic()
  const es = new EventSource(RELAY + topic + '/sse')
  party = { topic, es, log: [], recent: [], startedAt: Date.now() }
  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.event === 'message' && msg.message) onRequest(msg.message)
    } catch {}
  }
  es.onerror = () => bus.emit('change')
  achievements.unlock('party-host')
  bus.emit('change')
}

export function stopParty() {
  party?.es.close()
  party = null
  bus.emit('change')
}

export const partyRunning = () => !!party

export function renderParty(root, _p, { back }) {
  const body = h('div')
  const draw = () => {
    if (!party) {
      fill(body,
        h(
          'div',
          { class: 'card' },
          h('p', {}, 'Friends scan your code, type a song name (or paste a Spotify link) and hit send. Pulse adds it to your queue.'),
          h('p', { class: 'dim small' }, 'Requests travel through ntfy.sh, a free public relay, on a random channel name nobody can guess. Stop the party to close it.'),
        ),
        h('button', { class: 'btn primary big', onClick: startParty }, icon('party', 20), ' Start a party'),
      )
      return
    }
    const link = RELAY + party.topic
    const qr = qrcode(0, 'M')
    qr.addData(link)
    qr.make()
    const live = party.es.readyState === 1
    fill(body,
      h(
        'div',
        { class: 'card center' },
        h('img', { class: 'qr', src: qr.createDataURL(7, 2), alt: 'Party QR code' }),
        h('p', { class: 'dim small' }, live ? '🟢 Listening for requests' : '🟡 Connecting...'),
        h('p', { class: 'small' }, 'Guests: scan, type a song in the message box at the bottom, press send.'),
        h('div', { class: 'btn-row center' }, h('button', { class: 'btn ghost', onClick: () => copyText(link, 'Party link copied') }, icon('link', 16), ' Copy link'), h('button', { class: 'btn danger', onClick: stopParty }, 'End party')),
      ),
      h('h2', { class: 'sec' }, `Requests (${party.log.length})`),
      party.log.length
        ? h('div', { class: 'list' }, party.log.map((e) => h('div', { class: 'row static' }, h('div', { class: 'meta' }, h('div', { class: 't' }, '“' + e.text + '”'), h('div', { class: 's wrap' }, `${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${e.status}`)))))
        : h('p', { class: 'dim' }, 'No requests yet.'),
    )
  }
  const off = bus.on('change', () => (body.isConnected ? draw() : off()))
  fill(root, h('button', { class: 'ibtn back', onClick: back, 'aria-label': 'Back' }, icon('back')), h('h1', { class: 'title' }, 'Party mode'), body)
  draw()
}
