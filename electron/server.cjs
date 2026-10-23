// Serves the built web app (dist/) on http://127.0.0.1:<port>/ so Spotify can
// redirect back to a loopback URL after login (file:// is not allowed).
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const DONE_PAGE = `<!doctype html><meta charset="utf-8"><title>Pulse</title>
<body style="font-family:system-ui,sans-serif;background:#0b0b12;color:#f2f2f7;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
<div><h1 style="font-size:40px;margin:0 0 8px">✅ Logged in</h1><p style="color:#8e8ea0">You can close this tab and go back to Pulse.</p></div>`

// onLogin(url): called when the browser comes back from the Spotify login
// (http://127.0.0.1:<port>/?code=...). Without it, the app page is served as usual.
function startServer(root, port, { onLogin } = {}) {
  const server = http.createServer((req, res) => {
    const full = new URL(req.url, `http://127.0.0.1:${port}`)
    if (onLogin && full.pathname === '/' && (full.searchParams.has('code') || full.searchParams.has('error'))) {
      onLogin(full.toString())
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_PAGE)
      return
    }
    const urlPath = decodeURIComponent(full.pathname)
    let file = path.join(root, path.normalize(urlPath))
    if (!file.startsWith(root)) {
      res.writeHead(403).end()
      return
    }
    fs.stat(file, (err, st) => {
      // Unknown paths fall back to the app shell.
      if (err || !st.isFile()) file = path.join(root, 'index.html')
      fs.readFile(file, (err2, data) => {
        if (err2) {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
        res.end(data)
      })
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

module.exports = { startServer }
