// Tiny IndexedDB wrapper for data that is too big for localStorage
// (liked-songs cache, listening history).

const DB_NAME = 'pulse'
const VERSION = 1
let dbp = null

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // liked: one row per saved track, keyed by track id
      if (!db.objectStoreNames.contains('liked')) db.createObjectStore('liked', { keyPath: 'id' })
      // plays: one row per play, keyed by playedAt (ms)
      if (!db.objectStoreNames.contains('plays')) db.createObjectStore('plays', { keyPath: 'playedAt' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

export async function getAll(store) {
  const db = await open()
  return done(db.transaction(store).objectStore(store).getAll())
}

export async function count(store) {
  const db = await open()
  return done(db.transaction(store).objectStore(store).count())
}

export async function putMany(store, rows) {
  if (!rows.length) return
  const db = await open()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const r of rows) os.put(r)
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export async function del(store, key) {
  const db = await open()
  return done(db.transaction(store, 'readwrite').objectStore(store).delete(key))
}

export async function clear(store) {
  const db = await open()
  return done(db.transaction(store, 'readwrite').objectStore(store).clear())
}
