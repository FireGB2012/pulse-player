import * as player from '../core/player.js'
import { h, sheet, toast } from '../core/ui.js'

export async function openDevices() {
  let list = []
  try {
    list = await player.getDevices()
  } catch (e) {
    toast('Could not load devices: ' + e.message)
    return
  }
  const openSpotify = h(
    'a',
    { class: 'btn ghost', href: 'spotify:' },
    'Open Spotify app',
  )
  if (!list.length) {
    sheet({
      title: 'No active Spotify device',
      content: h(
        'div',
        { class: 'sheet-pad' },
        h('p', {}, 'Pulse controls the Spotify app. Open Spotify on your phone, play any song once, then come back here.'),
        openSpotify,
      ),
    })
    return
  }
  sheet({
    title: 'Play on...',
    items: list.map((d) => ({
      label: d.name,
      sub: d.type + (d.is_active ? ' · playing here' : ''),
      active: d.is_active,
      onClick: async () => {
        if (await player.transferTo(d.id)) toast('Switched to ' + d.name)
      },
    })),
  })
}

export function noDeviceSheet() {
  sheet({
    title: 'No active device',
    content: h(
      'div',
      { class: 'sheet-pad' },
      h('p', {}, 'Spotify has no active player yet. Open the Spotify app, start any song, then try again.'),
      h('a', { class: 'btn', href: 'spotify:' }, 'Open Spotify app'),
    ),
  })
}
