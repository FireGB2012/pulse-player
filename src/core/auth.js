// Spotify login using Authorization Code + PKCE (no client secret needed).
// Web/PC: redirects the page. Android (Capacitor): opens a Custom Tab and
// catches the pulse://callback deep link.

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Preferences } from '@capacitor/preferences'
import { ls } from './store.js'

const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public', // duplicate finder, merge/split
  'playlist-modify-private',
  'user-top-read', // stats
  'user-read-recently-played', // listening history
  'streaming', // for the PC Web Playback SDK later
].join(' ')

// Scopes added after the first release. Older logins lack them until the user reconnects.
export const NEW_SCOPES = ['user-top-read', 'user-read-recently-played', 'playlist-modify-private']
export const hasScopes = (list = NEW_SCOPES) => {
  const granted = (ls.get('tokens')?.scope ?? '').split(' ')
  return list.every((s) => granted.includes(s))
}

export const isNative = Capacitor.isNativePlatform()

// These must match EXACTLY what you add in the Spotify dashboard.
export const redirectUri = () => (isNative ? 'pulse://callback' : location.origin + '/')

// The Client ID is also kept in a native preferences file on the phone, so it
// comes back even if the WebView's localStorage gets cleared.
export const getClientId = () => ls.get('clientId', '')
export const setClientId = (id) => {
  const v = String(id).trim()
  ls.set('clientId', v)
  Preferences.set({ key: 'clientId', value: v }).catch(() => {})
}

export async function restoreClientId() {
  try {
    const saved = getClientId()
    if (saved) return await Preferences.set({ key: 'clientId', value: saved })
    const { value } = await Preferences.get({ key: 'clientId' })
    if (value) ls.set('clientId', value)
  } catch {}
}

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function randomString(n) {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return Array.from(a, (x) => CHARS[x % CHARS.length]).join('')
}

export async function login() {
  const clientId = getClientId()
  if (!clientId) throw new Error('Paste your Spotify Client ID first')
  const verifier = randomString(96)
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const state = randomString(16)
  ls.set('pkce', { verifier, state })

  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  }).toString()

  if (isNative) await Browser.open({ url: url.toString() })
  else if (window.pulseDesktop) window.pulseDesktop.openExternal(url.toString()) // PC: your normal browser
  else location.href = url.toString()
}

// Returns true if the URL was a login redirect and tokens were stored.
export async function handleRedirect(urlStr) {
  const u = new URL(urlStr)
  const code = u.searchParams.get('code')
  const err = u.searchParams.get('error')
  const state = u.searchParams.get('state')
  if (!code && !err) return false

  const saved = ls.get('pkce')
  ls.del('pkce')
  if (err) throw new Error('Spotify login failed: ' + err)
  if (!saved || saved.state !== state) throw new Error('Login state mismatch, try again')

  await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: saved.verifier,
  })
  return true
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: getClientId(), ...params }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error_description || data.error || 'Token request failed')
  const prev = ls.get('tokens', {})
  ls.set('tokens', {
    access: data.access_token,
    refresh: data.refresh_token ?? prev.refresh,
    expires: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? prev.scope ?? '',
  })
}

// Passive mode (PC mini window): never refresh tokens here, the main window
// does that. Two windows refreshing at once would fight over the refresh token.
let passive = false
export const setPassive = (on) => (passive = on)

async function waitForFreshToken() {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const t = ls.get('tokens')
    if (t && Date.now() < t.expires - 60_000) return t.access
  }
  throw new Error('Waiting for the main window to refresh the login')
}

export const isLoggedIn = () => !!ls.get('tokens')?.refresh
export const logout = () => ls.del('tokens')

let refreshing = null
export async function getToken() {
  const t = ls.get('tokens')
  if (!t) throw new Error('Not logged in')
  if (Date.now() < t.expires - 60_000) return t.access
  if (passive) return waitForFreshToken()
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }).finally(
    () => (refreshing = null),
  )
  await refreshing
  return ls.get('tokens').access
}

// Call once at startup. onLogin fires after a successful redirect.
export async function initAuth({ onLogin, onError }) {
  if (isNative) {
    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith('pulse://')) return
      try {
        await Browser.close().catch(() => {})
        if (await handleRedirect(url)) onLogin()
      } catch (e) {
        onError(e)
      }
    })
    return
  }
  // PC: the browser lands on Pulse's local server, which hands the code back here
  window.pulseDesktop?.onAuthCallback(async (url) => {
    try {
      if (await handleRedirect(url)) onLogin()
    } catch (e) {
      onError(e)
    }
  })
  const q = location.search
  if (q.includes('code=') || q.includes('error=')) {
    try {
      const ok = await handleRedirect(location.href)
      history.replaceState({}, '', location.pathname)
      if (ok) onLogin()
    } catch (e) {
      history.replaceState({}, '', location.pathname)
      onError(e)
    }
  }
}
