// Minimal Discord Rich Presence client over Discord's local IPC pipe.
// Shows "Listening to <song>" while Discord is running on this PC.
const net = require('node:net')
const path = require('node:path')

const OP_HANDSHAKE = 0
const OP_FRAME = 1

function pipePath(i) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${i}`
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || '/tmp'
  return path.join(dir, `discord-ipc-${i}`)
}

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data))
  const head = Buffer.alloc(8)
  head.writeInt32LE(op, 0)
  head.writeInt32LE(json.length, 4)
  return Buffer.concat([head, json])
}

class DiscordPresence {
  constructor() {
    this.appId = ''
    this.enabled = false
    this.sock = null
    this.ready = false
    this.pending = null // last activity to send once connected
    this.retry = null
    this.listeningType = true // fall back to "Playing" if Discord rejects "Listening"
    this.buf = Buffer.alloc(0)
  }

  configure({ enabled, appId }) {
    const changed = appId !== this.appId
    this.enabled = !!enabled && /^\d{15,22}$/.test(appId || '')
    this.appId = appId || ''
    if (!this.enabled || changed) this.disconnect()
    if (this.enabled && !this.sock) this.connect()
  }

  connect(i = 0) {
    clearTimeout(this.retry)
    if (!this.enabled) return
    if (i > 9) {
      // Discord not running; try again later
      this.retry = setTimeout(() => this.connect(), 20_000)
      return
    }
    const sock = net.createConnection(pipePath(i))
    sock.once('connect', () => {
      this.sock = sock
      this.buf = Buffer.alloc(0)
      sock.write(encode(OP_HANDSHAKE, { v: 1, client_id: this.appId }))
    })
    sock.on('data', (d) => this.onData(d))
    sock.once('error', () => {
      sock.destroy()
      if (this.sock !== sock) this.connect(i + 1)
    })
    sock.once('close', () => {
      if (this.sock === sock) {
        this.sock = null
        this.ready = false
        if (this.enabled) this.retry = setTimeout(() => this.connect(), 15_000)
      }
    })
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk])
    while (this.buf.length >= 8) {
      const len = this.buf.readInt32LE(4)
      if (this.buf.length < 8 + len) return
      let msg = null
      try {
        msg = JSON.parse(this.buf.subarray(8, 8 + len).toString())
      } catch {}
      this.buf = this.buf.subarray(8 + len)
      if (!msg) continue
      if (msg.evt === 'READY') {
        this.ready = true
        if (this.pending !== undefined) this.send(this.pending)
      } else if (msg.evt === 'ERROR' && msg.cmd === 'SET_ACTIVITY' && this.listeningType) {
        this.listeningType = false
        this.send(this.pending)
      }
    }
  }

  disconnect() {
    clearTimeout(this.retry)
    this.ready = false
    const s = this.sock
    this.sock = null
    s?.destroy()
  }

  // info from the app (title, artist, album, artUrl, isPlaying, progressMs, durationMs, trackUrl)
  update(info) {
    let activity = null
    if (info?.title && info.isPlaying) {
      const start = Date.now() - (info.progressMs || 0)
      activity = {
        type: this.listeningType ? 2 : 0,
        details: info.title.slice(0, 128),
        state: ('by ' + (info.artist || 'Unknown')).slice(0, 128),
        timestamps: info.durationMs ? { start, end: start + info.durationMs } : { start },
        assets: info.artUrl ? { large_image: info.artUrl, large_text: (info.album || info.title).slice(0, 128) } : undefined,
        buttons: info.trackUrl ? [{ label: 'Open in Spotify', url: info.trackUrl }] : undefined,
        instance: false,
      }
    }
    this.pending = activity
    if (this.ready) this.send(activity)
  }

  send(activity) {
    if (!this.sock || !this.ready) return
    if (activity) activity.type = this.listeningType ? 2 : 0
    this.sock.write(encode(OP_FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: String(Date.now()) + Math.random() }))
  }
}

module.exports = { DiscordPresence }
