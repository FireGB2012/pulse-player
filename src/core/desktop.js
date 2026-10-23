// Bridge to the PC (Electron) app: tray, global hotkeys, mini window, Discord.
// window.pulseDesktop comes from electron/preload.cjs; absent everywhere else.

export const desktop = typeof window !== 'undefined' ? window.pulseDesktop ?? null : null
export const isDesktop = !!desktop
export const isMiniWindow = isDesktop && location.hash === '#mini'
