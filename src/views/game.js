// 42. Guess the song: a few seconds of one of your liked songs, pick the title.

import * as player from '../core/player.js'
import * as liked from '../core/likedcache.js'
import * as achievements from '../core/achievements.js'
import { shuffle } from '../core/mixes.js'
import { ls } from '../core/store.js'
import { h, icon, overlay, pickImage, artistNames, toast, fill } from '../core/ui.js'

const ROUNDS = 10
const SECONDS = 15

export async function renderGame(root, _p, { back }) {
  fill(root, h('button', { class: 'ibtn back', onClick: back, 'aria-label': 'Back' }, icon('back')), h('h1', { class: 'title' }, 'Guess the song'), h('div', { class: 'empty' }, 'Loading your liked songs...'))
  try {
    await liked.ensureFresh()
  } catch (e) {
    toast(e.message)
  }
  const pool = liked.all()
  const best = ls.get('gameBest', 0)
  fill(root, 
    h('button', { class: 'ibtn back', onClick: back, 'aria-label': 'Back' }, icon('back')),
    h('h1', { class: 'title' }, 'Guess the song'),
    h('div', { class: 'card' }, h('p', {}, `${ROUNDS} rounds. A random liked song plays from the middle, the screen hides what it is, and you pick the right title. Faster answers score more.`), h('p', { class: 'dim small' }, `Best score: ${best}`)),
    pool.length >= 8
      ? h('button', { class: 'btn primary big', onClick: () => startGame(pool) }, icon('play', 20), ' Start')
      : h('div', { class: 'empty' }, 'You need at least 8 liked songs to play.'),
  )
}

function startGame(pool) {
  const order = shuffle(pool).slice(0, ROUNDS)
  let round = 0
  let score = 0
  let correct = 0
  let timer = 0
  let roundStart = 0
  let closed = false

  const status = h('div', { class: 'game-status' })
  const clock = h('div', { class: 'game-clock' }, h('i'))
  const reveal = h('div', { class: 'game-reveal' })
  const choices = h('div', { class: 'game-choices' })
  const o = overlay(
    'game',
    [h('div', { class: 'game-top' }, status, h('button', { class: 'ibtn', 'aria-label': 'Quit game', onClick: () => o.close() }, icon('close'))), clock, h('div', { class: 'game-disc' }, icon('note', 72)), reveal, choices],
    () => {
      closed = true
      clearInterval(timer)
    },
  )

  function next() {
    if (closed) return
    if (round >= order.length) return finish()
    const answer = order[round]
    const names = new Set([answer.name.toLowerCase()])
    const wrong = []
    for (const t of shuffle(pool)) {
      if (wrong.length === 3) break
      if (!names.has(t.name.toLowerCase())) {
        names.add(t.name.toLowerCase())
        wrong.push(t)
      }
    }
    const options = shuffle([answer, ...wrong])
    round++
    status.textContent = `Round ${round}/${order.length} · ${score} pts`
    fill(reveal)
    o.el.classList.remove('right', 'wrong')
    fill(choices, 
      ...options.map((t) =>
        h('button', { class: 'game-choice', onClick: (e) => pick(t, answer, e.currentTarget) }, h('b', {}, t.name), h('small', {}, artistNames(t))),
      ),
    )
    const pos = Math.floor((answer.duration_ms ?? 120000) * (0.25 + Math.random() * 0.3))
    player.playBody({ uris: [answer.uri], position_ms: pos })
    roundStart = Date.now()
    clearInterval(timer)
    timer = setInterval(() => {
      const left = 1 - (Date.now() - roundStart) / (SECONDS * 1000)
      clock.firstChild.style.width = Math.max(0, left * 100) + '%'
      if (left <= 0) pick(null, answer, null)
    }, 100)
  }

  function pick(t, answer, btn) {
    clearInterval(timer)
    if (choices.dataset.locked === '1') return
    choices.dataset.locked = '1'
    const ok = t?.uri === answer.uri
    if (ok) {
      correct++
      score += Math.max(10, Math.round(100 - ((Date.now() - roundStart) / (SECONDS * 1000)) * 90))
    }
    o.el.classList.add(ok ? 'right' : 'wrong')
    btn?.classList.add(ok ? 'right' : 'wrong')
    ;[...choices.children].forEach((b) => b.firstChild.textContent === answer.name && b.classList.add('right'))
    fill(reveal, h('img', { src: pickImage(answer.album?.images, 300), alt: '' }), h('div', {}, h('b', {}, answer.name), h('small', {}, artistNames(answer))))
    status.textContent = `Round ${round}/${order.length} · ${score} pts`
    setTimeout(() => {
      choices.dataset.locked = ''
      next()
    }, 2200)
  }

  function finish() {
    clearInterval(timer)
    const best = Math.max(ls.get('gameBest', 0), score)
    ls.set('gameBest', best)
    achievements.unlock('quiz-player')
    if (correct === order.length) achievements.unlock('quiz-perfect')
    fill(choices, 
      h('div', { class: 'game-end' }, h('b', {}, `${correct}/${order.length} right`), h('span', {}, `${score} points · best ${best}`)),
      h('button', { class: 'btn primary big', onClick: () => (o.close(), startGame(pool)) }, 'Play again'),
      h('button', { class: 'btn ghost big', onClick: () => o.close() }, 'Done'),
    )
    status.textContent = 'Game over'
  }

  next()
}
