import * as themes from '../core/themes.js'
import * as plugins from '../core/plugins.js'
import * as settings from '../core/settings.js'
import * as native from '../core/native.js'
import * as achievements from '../core/achievements.js'
import * as nav from '../core/nav.js'
import { desktop, isDesktop } from '../core/desktop.js'
import { extractPalette, themeVarsFromPalette } from '../core/palette.js'
import { shareThemeSheet, parseThemeLink } from '../core/share.js'
import { logout, login, getClientId, redirectUri, isNative, hasScopes } from '../core/auth.js'
import { h, toast, sheet, icon, copyText, promptSheet, fill } from '../core/ui.js'
import { openDevices } from './devices.js'
import { CONTROLS, controlLayout } from './nowplaying.js'

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

// ---- small form rows bound to settings ----
function toggleRow(label, key, sub, onChange) {
  const input = h('input', { type: 'checkbox', checked: !!settings.get(key) })
  input.addEventListener('change', async () => {
    const ok = onChange ? await onChange(input.checked) : true
    if (ok === false) input.checked = !input.checked
    else settings.set(key, input.checked)
  })
  return h('div', { class: 'addon' }, h('div', { class: 'meta' }, h('div', { class: 't wrap' }, label), sub ? h('div', { class: 's wrap' }, sub) : null), h('label', { class: 'switch' }, input, h('i', {})))
}

function selectRow(label, key, options) {
  const sel = h('select', { class: 'field inline' }, options.map(([v, name]) => h('option', { value: v, selected: String(settings.get(key)) === String(v) }, name)))
  sel.addEventListener('change', () => settings.set(key, typeof settings.DEFAULTS[key] === 'number' ? Number(sel.value) : sel.value))
  return h('label', { class: 'ed-row' }, h('span', {}, label), sel)
}

function rangeRow(label, key, min, max, unit = '') {
  const out = h('span', { class: 'dim small' }, settings.get(key) + unit)
  const input = h('input', { type: 'range', class: 'range', min, max, value: settings.get(key) })
  input.addEventListener('input', () => (out.textContent = input.value + unit))
  input.addEventListener('change', () => settings.set(key, Number(input.value)))
  return h('label', { class: 'ed-row' }, h('span', {}, label, ' ', out), input)
}

const hours = Array.from({ length: 24 }, (_, i) => [i, `${String(i).padStart(2, '0')}:00`])

export function renderSettings(root) {
  const wrap = h('div', { class: 'settings' }, h('h1', { class: 'title' }, 'Settings'))
  fill(root, wrap)

  // ---------- Themes ----------
  const themeSec = h('section', { class: 'card' })
  const editor = h('div', { class: 'editor' })

  function drawThemes() {
    const active = themes.activeTheme()
    const shown = themes.effectiveThemeId()
    const reason = themes.themeReason()
    const grid = h(
      'div',
      { class: 'theme-grid' },
      themes.allThemes().map((t) => {
        const v = t.vars ?? {}
        const user = themes.userThemes().some((u) => u.id === t.id)
        return h(
          'button',
          {
            class: 'theme-card' + (t.id === active.id ? ' on' : '') + (t.id === shown && t.id !== active.id ? ' showing' : ''),
            onClick: () => {
              themes.setTheme(t.id)
              if (t.id.startsWith('hero-')) achievements.unlock('hero')
              drawThemes()
            },
          },
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

    const why = {
      playlist: 'Showing the theme you picked for the playing playlist.',
      season: `Showing the seasonal ${themes.getTheme(shown).name} theme. Tap any theme to use it instead.`,
      time: 'Showing your time-of-day theme (Looks > Auto theme). Tap any theme to use it until the next switch.',
    }[reason]

    const tint = h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: themes.albumTintEnabled() }), h('span', {}, 'Tint accent from album art'))
    tint.querySelector('input').addEventListener('change', (e) => themes.setAlbumTint(e.target.checked))

    fill(themeSec, 
      h('h2', {}, icon('palette', 20), ' Themes'),
      why ? h('p', { class: 'note' }, why) : null,
      grid,
      tint,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn ghost', onClick: drawEditor }, 'Tweak colors'),
        h('button', { class: 'btn ghost', onClick: themeFromPhoto }, icon('image', 16), ' From a photo'),
        h('button', { class: 'btn ghost', onClick: () => shareThemeSheet(themes.activeTheme().id) }, icon('qr', 16), ' Share'),
        h(
          'button',
          {
            class: 'btn ghost',
            onClick: () =>
              importSheet('Import theme', 'Paste theme JSON or a pulse://theme link', '.json,application/json', async (txt) => {
                const raw = txt.trim().startsWith('{') ? JSON.parse(txt) : await parseThemeLink(txt)
                const t = themes.saveUserTheme(raw)
                themes.setTheme(t.id)
                drawThemes()
                toast('Imported "' + t.name + '"')
              }),
          },
          'Import',
        ),
        h('button', { class: 'btn ghost', onClick: () => copyText(themes.exportTheme()) }, 'Export'),
        h('button', { class: 'btn ghost', onClick: () => nav.go('page', { name: 'store' }) }, icon('store', 16), ' Store'),
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
    fill(editor, 
      ...rows,
      layoutSel,
      h(
        'div',
        { class: 'btn-row' },
        saveName,
        h(
          'button',
          {
            class: 'btn primary',
            onClick: () => {
              const n = saveName.value.trim()
              if (!n) return toast('Give it a name')
              const t = themes.saveCurrentAs(n)
              themes.setTheme(t.id)
              achievements.unlock('theme-maker')
              if (themes.userThemes().length >= 5) achievements.unlock('collector')
              drawThemes()
              toast('Saved "' + t.name + '"')
            },
          },
          'Save as theme',
        ),
        h('button', { class: 'btn ghost', onClick: () => (themes.resetOverrides(), drawEditor()) }, 'Reset tweaks'),
        themes.userThemes().some((u) => u.id === active.id)
          ? h('button', { class: 'btn danger', onClick: () => (themes.deleteUserTheme(active.id), drawThemes()) }, 'Delete this theme')
          : null,
      ),
    )
  }

  // ---- 6. theme from a photo ----
  function themeFromPhoto() {
    const file = h('input', { type: 'file', accept: 'image/*', class: 'file' })
    const preview = h('div', { class: 'photo-preview' })
    const pad = h('div', { class: 'sheet-pad' }, h('p', { class: 'dim small' }, 'Pick a picture. Pulse pulls its colors into a theme.'), file, preview)
    const close = sheet({ title: 'Theme from a photo', content: pad })
    file.addEventListener('change', async () => {
      const f = file.files?.[0]
      if (!f) return
      const url = URL.createObjectURL(f)
      try {
        const pal = await extractPalette(url, 6)
        const options = [
          ['Dark', themeVarsFromPalette(pal, true)],
          ['Light', themeVarsFromPalette(pal, false)],
        ]
        fill(preview, 
          h('img', { class: 'photo-thumb', src: url, alt: '' }),
          h('div', { class: 'chips' }, pal.map((c) => h('i', { class: 'dot', style: { background: `rgb(${c.r},${c.g},${c.b})` } }))),
          h(
            'div',
            { class: 'theme-grid' },
            options.map(([label, vars]) =>
              h(
                'button',
                {
                  class: 'theme-card',
                  onClick: async () => {
                    const name = await promptSheet({ title: 'Name your theme', value: f.name.replace(/\.[^.]+$/, '').slice(0, 30) + ' ' + label })
                    if (!name?.trim()) return
                    const t = themes.saveUserTheme({ name: name.trim(), layout: 'floating', vars: { ...vars, '--radius': '16px', '--blur': '12px' } })
                    themes.setTheme(t.id)
                    achievements.unlock('photo-theme')
                    achievements.unlock('theme-maker')
                    if (themes.userThemes().length >= 5) achievements.unlock('collector')
                    close()
                    drawThemes()
                    toast('Made "' + t.name + '"')
                  },
                },
                h('div', { class: 'swatch', style: { background: vars['--bg'] } }, h('i', { style: { background: vars['--surface-2'] } }), h('b', { style: { background: vars['--accent'] } })),
                h('span', {}, label),
              ),
            ),
          ),
        )
      } catch (e) {
        toast('Could not read that picture: ' + e.message)
      }
    })
  }

  // ---------- Looks ----------
  const themeOptions = () => themes.allThemes().map((t) => [t.id, t.name])
  const looks = h(
    'section',
    { class: 'card' },
    h('h2', {}, icon('magic', 20), ' Looks'),
    toggleRow('Auto theme by time of day', 'autoTheme', 'Switches between a day and a night theme'),
    selectRow('Day theme', 'autoThemeDay', themeOptions()),
    selectRow('Night theme', 'autoThemeNight', themeOptions()),
    selectRow('Day starts', 'autoThemeDayStart', hours),
    selectRow('Night starts', 'autoThemeNightStart', hours),
    toggleRow('Seasonal themes', 'seasonal', 'Halloween (Oct 15 – Nov 1) and Christmas (Dec 1 – 26) switch on by themselves'),
    selectRow('Font', 'font', themes.FONT_PACKS.map((f) => [f.id, f.name])),
    selectRow('Player skin', 'skin', themes.SKINS.map((s) => [s.id, s.name])),
    toggleRow('Animated album gradient', 'albumGradient', 'A background that drifts with the colors of the playing album'),
  )
  settings.onSettings('change', (k) => {
    if (themeSec.isConnected && ['autoTheme', 'seasonal', 'autoThemeDay', 'autoThemeNight', 'autoThemeDayStart', 'autoThemeNightStart'].includes(k)) drawThemes()
  })

  // ---------- Player ----------
  const playerSec = h(
    'section',
    { class: 'card' },
    h('h2', {}, icon('play', 20), ' Player'),
    toggleRow('Swipe the album art', 'swipeGestures', 'Left = next, right = previous, down = close'),
    toggleRow('Double-tap art to like', 'doubleTapLike'),
    toggleRow('Fade volume in on play', 'fadeIn', 'Needs a device that allows volume control'),
    rangeRow('Fade-in length', 'fadeInSeconds', 1, 12, 's'),
    toggleRow('Shake to skip', 'shakeToSkip', 'Give your phone a good shake for the next song'),
    rangeRow('Shake strength needed', 'shakeStrength', 12, 40),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', onClick: arrangeControls }, icon('queue', 16), ' Arrange player buttons')),
  )

  // ---- 8. layout editor ----
  function arrangeControls() {
    let layout = controlLayout()
    const list = h('div', { class: 'arrange' })
    const draw = () => {
      fill(list, 
        ...layout.map((c, i) => {
          const def = CONTROLS.find((x) => x.id === c.id)
          const cb = h('input', { type: 'checkbox', checked: c.visible !== false, disabled: def.required })
          cb.addEventListener('change', () => ((c.visible = cb.checked), save()))
          return h(
            'div',
            { class: 'arrange-row' },
            h('label', { class: 'arrange-label' }, cb, h('span', {}, def.label), def.row ? h('small', { class: 'dim' }, ' · button row') : null),
            h('button', { class: 'ibtn', 'aria-label': 'Move up', disabled: i === 0, onClick: () => move(i, -1) }, icon('up', 20)),
            h('button', { class: 'ibtn flip', 'aria-label': 'Move down', disabled: i === layout.length - 1, onClick: () => move(i, 1) }, icon('up', 20)),
          )
        }),
      )
    }
    const move = (i, d) => {
      const j = i + d
      ;[layout[i], layout[j]] = [layout[j], layout[i]]
      save()
      draw()
    }
    const save = () => settings.set('controls', layout.map((c) => ({ ...c })))
    draw()
    sheet({
      title: 'Arrange player buttons',
      content: h(
        'div',
        { class: 'sheet-pad' },
        h('p', { class: 'dim small' }, 'Order and show/hide the player controls. "Button row" items appear in the main row, in this order.'),
        list,
        h('button', { class: 'btn ghost', onClick: () => ((layout = (settings.set('controls', null), controlLayout())), draw()) }, 'Reset'),
      ),
    })
  }

  // ---------- Add-ons ----------
  const addonSec = h('section', { class: 'card' })
  function drawAddons() {
    const list = plugins.listPlugins()
    fill(addonSec, 
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
          h('div', { class: 'meta' }, h('div', { class: 't' }, p.name, p.version ? h('small', {}, ' v' + p.version) : null), h('div', { class: 's wrap' }, p.error ? 'Error: ' + p.error : p.description || p.source)),
          p.source === 'imported' ? h('button', { class: 'ibtn', title: 'Remove', onClick: () => (plugins.removeUserPlugin(p.id), drawAddons()) }, icon('close', 20)) : null,
          h('label', { class: 'switch' }, sw, h('i', {})),
        )
      }),
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          {
            class: 'btn ghost',
            onClick: () =>
              importSheet('Import add-on', 'Paste add-on JavaScript (ES module with export default { id, name, setup(api) })', '.js,.mjs,text/javascript', async (code) => {
                const def = await plugins.addFromSource(code)
                drawAddons()
                toast('Added "' + def.name + '"')
              }),
          },
          'Import add-on',
        ),
        h('button', { class: 'btn ghost', onClick: () => nav.go('page', { name: 'store' }) }, icon('store', 16), ' Store'),
      ),
      h('p', { class: 'dim small' }, 'Add-ons are code that runs inside Pulse with access to your Spotify session. Only import ones you trust.'),
    )
  }
  plugins.onPluginsChange('change', () => {
    if (addonSec.isConnected) drawAddons()
  })

  // ---------- Android extras ----------
  const androidSec = native.isAndroid
    ? h(
        'section',
        { class: 'card' },
        h('h2', {}, icon('devices', 20), ' Android extras'),
        toggleRow('Notification controls', 'notifControls', 'Themed play/pause/skip in your notifications', async (on) => {
          if (on && !(await native.requestNotifications())) {
            toast('Allow notifications for Pulse first')
            return false
          }
        }),
        toggleRow('Floating mini-player bubble', 'bubble', 'A draggable bubble over other apps', async (on) => {
          if (on && !(await native.canDrawOverlays())) {
            toast('Allow "Display over other apps" for Pulse, then turn this on again')
            native.openOverlaySettings()
            return false
          }
        }),
        toggleRow('Resume when headphones connect', 'headphoneResume', 'Wired or Bluetooth. Works while Pulse or its notification is running'),
        h('p', { class: 'dim small' }, 'Home-screen widget: long-press your home screen > Widgets > Pulse.'),
      )
    : null

  // ---------- PC extras ----------
  let pcSec = null
  if (isDesktop) {
    const appId = h('input', { class: 'field', placeholder: 'Discord Application ID (numbers)', value: settings.get('discordAppId'), inputmode: 'numeric' })
    appId.addEventListener('change', () => settings.set('discordAppId', appId.value.trim()))
    pcSec = h(
      'section',
      { class: 'card' },
      h('h2', {}, icon('pip', 20), ' PC extras'),
      toggleRow('Global hotkeys', 'hotkeys', 'Ctrl+Alt+Space play/pause, Ctrl+Alt+→ / ← skip, Ctrl+Alt+L like. Works anywhere in Windows'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', onClick: () => desktop.openMini() }, icon('pip', 16), ' Open mini window (always on top)')),
      h('p', { class: 'dim small' }, 'The tray icon (bottom-right of the taskbar) has quick controls too.'),
      toggleRow('Discord "Listening to" status', 'discordEnabled', 'Shows the song on your Discord profile while Discord is open'),
      appId,
      h(
        'p',
        { class: 'dim small' },
        'Discord needs an Application ID: discord.com/developers/applications > New Application > name it "Pulse" (that name shows on your profile) > copy the Application ID here.',
      ),
    )
  }

  // ---------- Account ----------
  const missing = !hasScopes()
  const account = h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Account & playback'),
    missing
      ? h(
          'div',
          { class: 'note' },
          h('p', {}, 'Reconnect Spotify to turn on Stats, History and the playlist tools (they need a few extra permissions).'),
          h('button', { class: 'btn primary', onClick: () => login().catch((e) => toast(e.message)) }, 'Reconnect Spotify'),
        )
      : null,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', onClick: openDevices }, icon('devices', 18), ' Choose device')),
    h('p', { class: 'dim small' }, 'Redirect URI for this build: ', h('code', {}, redirectUri())),
    h('p', { class: 'dim small' }, 'Client ID: ', h('code', {}, getClientId().slice(0, 6) + '...')),
    isNative ? h('p', { class: 'dim small' }, 'Music plays in the Spotify app; Pulse is the remote.') : null,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn danger', onClick: () => (logout(), location.reload()) }, 'Log out')),
  )

  drawThemes()
  drawAddons()
  wrap.append(themeSec, looks, playerSec, addonSec, androidSec ?? '', pcSec ?? '', account)
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
