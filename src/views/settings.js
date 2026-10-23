import * as themes from '../core/themes.js'
import * as plugins from '../core/plugins.js'
import { logout, getClientId, redirectUri, isNative } from '../core/auth.js'
import { h, toast, sheet, icon } from '../core/ui.js'
import { openDevices } from './devices.js'

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied to clipboard')
  } catch {
    sheet({ title: 'Copy this', content: h('textarea', { class: 'field mono', rows: 12, readonly: true }, text) })
  }
}

// Pick a file OR paste text. onText(text) gets the content.
function importSheet(title, hint, accept, onText) {
  const area = h('textarea', { class: 'field mono', rows: 10, placeholder: hint, spellcheck: 'false' })
  const file = h('input', { type: 'file', accept, class: 'file' })
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    if (f) area.value = await f.text()
  })
  let close = () => {}
  const go = h(
    'button',
    {
      class: 'btn primary',
      onClick: async () => {
        try {
          await onText(area.value)
          close()
        } catch (e) {
          toast(e.message)
        }
      },
    },
    'Import',
  )
  close = sheet({ title, content: h('div', { class: 'sheet-pad' }, file, area, go) })
}

export function renderSettings(root) {
  const wrap = h('div', { class: 'settings' }, h('h1', { class: 'title' }, 'Settings'))
  root.replaceChildren(wrap)

  // ---------- Themes ----------
  const themeSec = h('section', { class: 'card' })
  const editor = h('div', { class: 'editor' })

  function drawThemes() {
    const active = themes.activeTheme()
    const grid = h(
      'div',
      { class: 'theme-grid' },
      themes.allThemes().map((t) => {
        const v = t.vars ?? {}
        const user = themes.userThemes().some((u) => u.id === t.id)
        return h(
          'button',
          { class: 'theme-card' + (t.id === active.id ? ' on' : ''), onClick: () => (themes.setTheme(t.id), drawThemes()) },
          h(
            'div',
            { class: 'swatch', style: { background: v['--bg'], border: '1px solid ' + (v['--border'] ?? 'transparent') } },
            h('i', { style: { background: v['--surface'] } }),
            h('b', { style: { background: v['--accent'] } }),
          ),
          h('span', {}, t.name),
          user ? h('small', {}, 'yours') : null,
        )
      }),
    )

    const tint = h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: themes.albumTintEnabled() }), h('span', {}, 'Tint accent from album art'))
    tint.querySelector('input').addEventListener('change', (e) => themes.setAlbumTint(e.target.checked))

    themeSec.replaceChildren(
      h('h2', {}, icon('palette', 20), ' Themes'),
      grid,
      tint,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn ghost', onClick: drawEditor }, 'Tweak colors'),
        h('button', { class: 'btn ghost', onClick: () => importSheet('Import theme', 'Paste theme JSON here', '.json,application/json', (txt) => {
          const t = themes.saveUserTheme(JSON.parse(txt))
          themes.setTheme(t.id)
          drawThemes()
          toast('Imported "' + t.name + '"')
        }) }, 'Import'),
        h('button', { class: 'btn ghost', onClick: () => copy(themes.exportTheme()) }, 'Export'),
      ),
      editor,
    )
  }

  function drawEditor() {
    const active = themes.activeTheme()
    const rows = themes.EDITABLE_VARS.map((v) => {
      const cur = themes.effectiveVar(v.key)
      if (v.type === 'color') {
        const input = h('input', { type: 'color', value: toHex(cur) })
        input.addEventListener('input', () => themes.setOverride(v.key, input.value))
        return h('label', { class: 'ed-row' }, h('span', {}, v.label), input)
      }
      const input = h('input', { type: 'range', class: 'range', min: v.min, max: v.max, value: parseInt(cur) || 0 })
      input.addEventListener('input', () => themes.setOverride(v.key, input.value + v.unit))
      return h('label', { class: 'ed-row' }, h('span', {}, v.label), input)
    })
    const layoutSel = h(
      'select',
      { class: 'field' },
      ['classic', 'floating', 'compact'].map((l) => h('option', { value: l, selected: (active.layout ?? 'classic') === l }, 'Layout: ' + l)),
    )
    layoutSel.addEventListener('change', () => {
      // layout is part of the theme; save a copy so the choice sticks
      const t = themes.saveCurrentAs(active.name + ' (custom)')
      t.layout = layoutSel.value
      themes.saveUserTheme(t)
      themes.setTheme(t.id)
      drawThemes()
    })
    const saveName = h('input', { class: 'field', placeholder: 'Name your theme' })
    editor.replaceChildren(
      ...rows,
      layoutSel,
      h(
        'div',
        { class: 'btn-row' },
        saveName,
        h('button', { class: 'btn primary', onClick: () => {
          const n = saveName.value.trim()
          if (!n) return toast('Give it a name')
          const t = themes.saveCurrentAs(n)
          themes.setTheme(t.id)
          drawThemes()
          toast('Saved "' + t.name + '"')
        } }, 'Save as theme'),
        h('button', { class: 'btn ghost', onClick: () => (themes.resetOverrides(), drawEditor()) }, 'Reset tweaks'),
        themes.userThemes().some((u) => u.id === active.id)
          ? h('button', { class: 'btn danger', onClick: () => (themes.deleteUserTheme(active.id), drawThemes()) }, 'Delete this theme')
          : null,
      ),
    )
  }

  // ---------- Add-ons ----------
  const addonSec = h('section', { class: 'card' })
  function drawAddons() {
    const list = plugins.listPlugins()
    addonSec.replaceChildren(
      h('h2', {}, icon('puzzle', 20), ' Add-ons'),
      ...list.map((p) => {
        const sw = h('input', { type: 'checkbox', checked: p.enabled })
        sw.addEventListener('change', async () => {
          await plugins.setEnabled(p.id, sw.checked)
          drawAddons()
        })
        return h(
          'div',
          { class: 'addon' },
          h('div', { class: 'meta' }, h('div', { class: 't' }, p.name, p.version ? h('small', {}, ' v' + p.version) : null), h('div', { class: 's' }, p.error ? 'Error: ' + p.error : p.description || p.source)),
          p.source === 'imported' ? h('button', { class: 'ibtn', title: 'Remove', onClick: () => (plugins.removeUserPlugin(p.id), drawAddons()) }, icon('close', 20)) : null,
          h('label', { class: 'switch' }, sw, h('i', {})),
        )
      }),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn ghost', onClick: () => importSheet('Import add-on', 'Paste add-on JavaScript (ES module with export default { id, name, setup(api) })', '.js,.mjs,text/javascript', async (code) => {
          const def = await plugins.addFromSource(code)
          drawAddons()
          toast('Added "' + def.name + '"')
        }) }, 'Import add-on'),
      ),
      h('p', { class: 'dim small' }, 'Add-ons are code that runs inside Pulse with access to your Spotify session. Only import ones you trust.'),
    )
  }
  plugins.onPluginsChange('change', () => {
    if (addonSec.isConnected) drawAddons()
  })

  // ---------- Account ----------
  const account = h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Account & playback'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', onClick: openDevices }, icon('devices', 18), ' Choose device')),
    h('p', { class: 'dim small' }, 'Redirect URI for this build: ', h('code', {}, redirectUri())),
    h('p', { class: 'dim small' }, 'Client ID: ', h('code', {}, getClientId().slice(0, 6) + '...')),
    isNative ? h('p', { class: 'dim small' }, 'Music plays in the Spotify app; Pulse is the remote.') : null,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn danger', onClick: () => (logout(), location.reload()) }, 'Log out')),
  )

  drawThemes()
  drawAddons()
  wrap.append(themeSec, addonSec, account)
}

// <input type=color> needs #rrggbb. Convert rgb()/named values via a canvas.
function toHex(c) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillStyle = c
    const v = ctx.fillStyle
    if (v.startsWith('#')) return v.length === 7 ? v : '#000000'
    const m = v.match(/(\d+)[, ]+(\d+)[, ]+(\d+)/)
    if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  } catch {}
  return '#000000'
}
