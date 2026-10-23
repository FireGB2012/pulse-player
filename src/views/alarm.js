import * as sp from '../core/spotify.js'
import * as alarm from '../core/alarm.js'
import * as native from '../core/native.js'
import { h, icon, sheet, toast, fill } from '../core/ui.js'

export function renderAlarm(root, _p, { back }) {
  const body = h('div')
  const draw = () => {
    const a = alarm.get()
    const next = alarm.nextFire(a)
    const time = h('input', { class: 'field time', type: 'time', value: a.time })
    time.addEventListener('change', () => alarm.save({ time: time.value || '07:30', enabled: true, snoozeUntil: 0 }))
    const sw = (label, key) => {
      const input = h('input', { type: 'checkbox', checked: !!a[key] })
      input.addEventListener('change', () => alarm.save({ [key]: input.checked, ...(key === 'enabled' ? { snoozeUntil: 0 } : {}) }))
      return h('div', { class: 'addon' }, h('div', { class: 'meta' }, h('div', { class: 't' }, label)), h('label', { class: 'switch' }, input, h('i', {})))
    }
    fill(body,
      h(
        'div',
        { class: 'card' },
        time,
        sw('Alarm on', 'enabled'),
        sw('Every day', 'daily'),
        sw('Gentle 30-second fade-in', 'fade'),
        h(
          'button',
          { class: 'row', onClick: pickPlaylist },
          h('div', { class: 'art sm ph' }, icon('queue', 22)),
          h('div', { class: 'meta' }, h('div', { class: 't' }, a.playlistName || 'Pick a playlist'), h('div', { class: 's' }, a.playlistName ? 'Tap to change' : 'Otherwise it resumes whatever was playing')),
        ),
        h('p', { class: 'dim small' }, next ? `Rings ${new Date(next).toLocaleString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' })}` : 'Alarm is off'),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', onClick: () => alarm.ring({ test: true }) }, 'Test it now')),
      ),
      h(
        'p',
        { class: 'dim small' },
        native.isAndroid
          ? 'Android opens Pulse at alarm time, even when it is closed. Keep the volume up and Spotify logged in on this phone.'
          : 'On PC the alarm works while Pulse is open (it can sit in the tray).',
      ),
    )
  }
  async function pickPlaylist() {
    try {
      const lists = await sp.allMyPlaylists()
      sheet({
        title: 'Wake up to...',
        items: [{ label: 'Whatever was playing', onClick: () => alarm.save({ playlistUri: '', playlistName: '' }) }, ...lists.map((p) => ({ label: p.name, onClick: () => alarm.save({ playlistUri: p.uri, playlistName: p.name }) }))],
      })
    } catch (e) {
      toast(e.message)
    }
  }
  const off = alarm.onAlarm('change', () => (body.isConnected ? draw() : off()))
  fill(root, h('button', { class: 'ibtn back', onClick: back, 'aria-label': 'Back' }, icon('back')), h('h1', { class: 'title' }, 'Wake-up alarm'), body)
  draw()
}
