// 21. Theme + add-on store, read from a JSON list on GitHub.
// Format: { "themes": [{ id, name, author, description, url }], "addons": [...] }
// urls may be relative to the list's own address.

import * as themes from '../core/themes.js'
import * as plugins from '../core/plugins.js'
import * as settings from '../core/settings.js'
import * as achievements from '../core/achievements.js'
import { h, icon, toast, confirmSheet, promptSheet, fill } from '../core/ui.js'

export function renderStore(root, _p, { back }) {
  const body = h('div', {}, h('div', { class: 'empty' }, 'Loading the store...'))
  fill(root, 
    h('button', { class: 'ibtn back', onClick: back, 'aria-label': 'Back' }, icon('back')),
    h('h1', { class: 'title' }, 'Store'),
    h('p', { class: 'dim small' }, 'Themes and add-ons from a list on GitHub. ', h('button', { class: 'linkish', onClick: changeSource }, 'Change list')),
    body,
  )

  async function changeSource() {
    const url = await promptSheet({ title: 'Store list URL', value: settings.get('storeUrl'), okLabel: 'Use this list' })
    if (url == null) return
    settings.set('storeUrl', url.trim() || settings.DEFAULTS.storeUrl)
    load()
  }

  async function load() {
    const base = settings.get('storeUrl')
    fill(body, h('div', { class: 'empty' }, 'Loading the store...'))
    let index
    try {
      const res = await fetch(base, { cache: 'no-cache' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      index = await res.json()
    } catch (e) {
      fill(body, h('div', { class: 'empty' }, h('p', {}, 'Could not load the store list.'), h('small', {}, `${e.message}. The list has to be in a public GitHub repo.`)))
      return
    }
    const abs = (u) => new URL(u, base).toString()
    const installedThemes = new Set(themes.allThemes().map((t) => t.id))
    const installedAddons = new Set(plugins.listPlugins().map((p) => p.id))

    const item = (it, installed, onInstall) =>
      h(
        'div',
        { class: 'addon' },
        it.preview ? h('div', { class: 'swatch mini', style: { background: it.preview[0] } }, h('b', { style: { background: it.preview[1] } })) : null,
        h('div', { class: 'meta' }, h('div', { class: 't' }, it.name, it.author ? h('small', {}, ' by ' + it.author) : null), h('div', { class: 's wrap' }, it.description ?? '')),
        h(
          'button',
          {
            class: 'btn ' + (installed ? 'ghost' : 'primary'),
            onClick: async (e) => {
              const b = e.currentTarget
              b.disabled = true
              try {
                await onInstall()
                b.textContent = 'Installed'
                achievements.unlock('shopper')
              } catch (err) {
                toast(err.message)
                b.disabled = false
              }
            },
          },
          installed ? 'Reinstall' : 'Get',
        ),
      )

    fill(body, 
      h('h2', { class: 'sec' }, 'Themes'),
      h(
        'div',
        { class: 'card' },
        (index.themes ?? []).map((it) =>
          item(it, installedThemes.has(it.id), async () => {
            const res = await fetch(abs(it.url), { cache: 'no-cache' })
            const t = themes.saveUserTheme(await res.json())
            themes.setTheme(t.id)
            toast(`"${t.name}" installed and switched on`)
          }),
        ),
      ),
      h('h2', { class: 'sec' }, 'Add-ons'),
      h(
        'div',
        { class: 'card' },
        (index.addons ?? []).map((it) =>
          item(it, installedAddons.has(it.id), async () => {
            const ok = await confirmSheet({ title: `Install "${it.name}"?`, text: 'Add-ons are code that runs inside Pulse with access to your Spotify session. Only install ones you trust.', okLabel: 'Install' })
            if (!ok) throw new Error('Cancelled')
            const res = await fetch(abs(it.url), { cache: 'no-cache' })
            const def = await plugins.addFromSource(await res.text())
            toast(`"${def.name}" installed`)
          }),
        ),
      ),
    )
  }
  load()
}
