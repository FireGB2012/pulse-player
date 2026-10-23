import { h, toast } from '../core/ui.js'
import { getClientId, setClientId, login, redirectUri, isNative } from '../core/auth.js'

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied')
  } catch {
    toast('Long-press to copy')
  }
}

export function renderLogin(root, { error } = {}) {
  const input = h('input', {
    class: 'field',
    placeholder: 'Spotify Client ID (32 characters)',
    value: getClientId(),
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  })

  const uri = redirectUri()
  const uriRow = (u) =>
    h('button', { class: 'code-row', onClick: () => copy(u) }, h('code', {}, u), h('span', {}, 'copy'))

  const connect = h(
    'button',
    {
      class: 'btn primary big',
      onClick: async () => {
        const id = input.value.trim()
        if (!/^[a-f0-9]{32}$/i.test(id)) return toast('That does not look like a Client ID')
        setClientId(id)
        try {
          await login()
        } catch (e) {
          toast(e.message)
        }
      },
    },
    'Connect Spotify',
  )

  root.replaceChildren(
    h(
      'div',
      { class: 'login' },
      h('div', { class: 'logo' }, 'Pulse'),
      h('p', { class: 'dim' }, 'Your Spotify library, your look. Needs Spotify Premium.'),
      error ? h('p', { class: 'err' }, error) : null,
      h(
        'ol',
        { class: 'steps' },
        h(
          'li',
          {},
          'Go to ',
          h('b', {}, 'developer.spotify.com/dashboard'),
          ' and create an app (choose "Web API").',
        ),
        h('li', {}, 'Add this Redirect URI to the app:'),
        uriRow(uri),
        isNative ? null : h('li', {}, 'For the Android app also add:'),
        isNative ? null : uriRow('pulse://callback'),
        h('li', {}, 'Paste the app\'s Client ID below.'),
      ),
      input,
      connect,
      h('p', { class: 'dim small' }, 'No password or secret is stored. Login uses Spotify\'s official PKCE flow.'),
    ),
  )
}
