// Global navigation so menus and overlays can open pages. main.js wires it up.

let impl = { go() {}, back() {}, closePlayer() {}, openPlayer() {} }
export const setNav = (n) => (impl = { ...impl, ...n })
export const go = (name, params) => {
  impl.closePlayer()
  impl.go(name, params)
}
export const back = () => impl.back()
// Open the full player, optionally on an add-on tab like 'lyrics:lyrics'.
export const openPlayer = (tab) => impl.openPlayer(tab)
