# Pulse

A customizable Spotify player. Android app first (this repo), PC version next
(same code, wrapped in Tauri). Themes are JSON files, add-ons are small JS files.
Needs **Spotify Premium**.

## How it works (read this once)

Spotify does not let third-party apps stream or download the audio. So Pulse is
a **remote + library browser**: it logs in with your Spotify account, shows your
playlists / liked songs / search, and controls playback on a Spotify Connect
device. On your phone that device is the **Spotify app**, which keeps playing in
the background while Pulse is the nicer interface.

Rules Spotify enforces for new "Development Mode" apps (since Feb 2026):
- app owner needs Premium (you have it), 1 Client ID per developer, max 5 users
- search returns max 10 results per type
- Pulse can only list songs for playlists you own or collaborate on (you can still press Play on any playlist)
- no audio analysis, so the Visualizer add-on is decorative (animated bars, not reacting to the sound)

## 1. Create the Spotify app (2 minutes)

1. https://developer.spotify.com/dashboard -> **Create app**, choose **Web API**
2. Add these Redirect URIs and save:
   - `pulse://callback` (Android)
   - `http://127.0.0.1:5173/` (PC / browser dev)
3. Copy the **Client ID**. You paste it into Pulse on first launch. No secret needed.

## 2. Run it on PC (browser, for development)

```bash
npm install
npm run dev        # open http://127.0.0.1:5173
```

Without an active Spotify device you will see "No active device". Open Spotify
on any device, play a song once, then control it from Pulse.

## 3. Get the APK (pick one)

**A. GitHub builds it for you (no Android Studio)**
Push this folder to a GitHub repo. The workflow in `.github/workflows/android-apk.yml`
runs on every push; download `pulse-debug-apk` from the Actions run, unzip,
install `app-debug.apk` on your phone (allow "install unknown apps").

**B. Android Studio**
```bash
npm install
npm run android:sync     # builds web + copies into android/
npm run android:open     # opens Android Studio -> Run, or Build > Build APK
```

**C. Command line** (Android SDK + JDK 21 installed)
```bash
npm run android:sync
cd android && ./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

If you ever delete `android/` and regenerate it (`npx cap add android`), run
`npm run android:patch` to re-add the `pulse://callback` login redirect.

## Themes

Settings -> Themes: 9 built-in, a color/roundness/blur editor, **Save as theme**,
**Import** (file or paste), **Export**. A theme is one JSON file
(see `examples/vinyl.theme.json`):

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "layout": "classic",
  "vars": {
    "--bg": "#101018", "--bg-image": "none",
    "--surface": "#181824", "--surface-2": "#222233",
    "--text": "#ffffff", "--text-dim": "#9a9ab0",
    "--accent": "#ff5e9c", "--accent-contrast": "#ffffff",
    "--border": "rgba(255,255,255,0.08)",
    "--radius": "16px", "--blur": "0px", "--font": "system-ui, sans-serif"
  },
  "css": ".np-art { border-radius: 50%; }"
}
```

- `layout`: `classic`, `floating` (floating nav/mini-player) or `compact` (denser lists)
- `vars`: any CSS custom property starting with `--` (the list above is what the app uses)
- `css`: optional extra CSS for full control (`@import` is stripped)
- Settings -> "Tint accent from album art" is optional and overrides `--accent`

## Add-ons

Built-in: **Lyrics** (synced, from LRCLIB), **Sleep timer**, **Visualizer**.
Toggle them in Settings -> Add-ons, or import your own `.js` file
(see `examples/hello-addon.js`). An add-on is an ES module:

```js
export default {
  id: 'my-addon', name: 'My add-on', version: '1.0.0',
  setup(api) {
    api.player.on('track', t => api.ui.toast(t?.name ?? ''))   // 'state' | 'track' | 'progress'
    api.ui.addPanel({ id: 'p', title: 'My tab', render(el) { /* draw into el */ return () => {/* cleanup */} } })
    api.ui.addPlayerButton({ id: 'b', icon: 'timer', title: 'Do it', onClick() {} })
    return () => {}   // teardown when switched off
  },
}
```

API: `api.player` (`state`, `on`, `toggle`, `pause`, `resume`, `next`, `previous`, `seek`, `setVolume`),
`api.ui` (`addPanel`, `addPlayerButton`, `toast`, `sheet`, `icon`),
`api.theme` (`get`, `getVar`, `setVar`), `api.storage` (`get`, `set`, per add-on),
`api.spotify.fetch(path, opts)` (authenticated Web API call).
Imported add-ons run with full access to your Spotify session: only import code you trust.

## Project layout

```
src/core/     auth (PKCE), spotify API client, player state, themes, add-on host
src/views/    login, library, search, now playing, settings, devices
src/themes/   built-in theme JSON files (drop a new .json here to add one)
src/plugins/  built-in add-ons (drop a new .js here to add one)
android/      Capacitor Android project (pulse://callback already registered)
```

## PC app (Windows .exe)

Same `src/` wrapped in Electron (`electron/`). It serves the app on
`http://127.0.0.1:5173/`, so add that Redirect URI in the Spotify dashboard.
Like the phone app it controls a Spotify device (it does not play audio itself).

- GitHub builds it: `.github/workflows/windows-exe.yml` runs on every push;
  download `pulse-windows-exe` from the Actions run, unzip, run `Pulse-*-portable.exe`.
- Locally: `npm run pc:start` (run it) or `npm run pc:build` (exe in `release/`).
