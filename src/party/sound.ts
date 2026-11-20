/* The TV's sound effects, made on the spot with Web Audio: no files to load,
   so it works the same on a laptop or a console browser. Phones stay
   silent. Browsers only allow sound after someone has clicked the page, so
   the TV offers a button when it needs one. */

type Fx = 'dice' | 'crash' | 'era' | 'win' | 'turn' | 'tick' | 'build' | 'steal'

let ctx: AudioContext | null = null
let muted = (() => {
  try {
    return window.localStorage.getItem('res_party_mute') === '1'
  } catch {
    return false
  }
})()

export const sound = {
  get muted() {
    return muted
  },
  setMuted(m: boolean) {
    muted = m
    try {
      window.localStorage.setItem('res_party_mute', m ? '1' : '0')
    } catch {
      /* fine */
    }
  },
  /** Call from a click: lets the browser play sound from now on. */
  unlock() {
    try {
      ctx ??= new AudioContext()
      void ctx.resume()
    } catch {
      ctx = null
    }
  },
  /** True when the browser is still blocking sound until a click. */
  get blocked() {
    return !ctx || ctx.state !== 'running'
  },
  play(fx: Fx) {
    if (muted || !ctx || ctx.state !== 'running') return
    try {
      PLAY[fx](ctx)
    } catch {
      /* never let a sound break the game */
    }
  },
}

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'triangle', vol = 0.18, slideTo?: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, c.currentTime + at)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + at + dur)
  g.gain.setValueAtTime(0.0001, c.currentTime + at)
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + at + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + at)
  o.stop(c.currentTime + at + dur + 0.05)
}

function noise(c: AudioContext, at: number, dur: number, vol = 0.25) {
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  const g = c.createGain()
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 2200
  g.gain.value = vol
  src.buffer = buf
  src.connect(f).connect(g).connect(c.destination)
  src.start(c.currentTime + at)
}

const PLAY: Record<Fx, (c: AudioContext) => void> = {
  /* A handful of clacks, like dice across a table. */
  dice: (c) => [0, 0.07, 0.15, 0.26, 0.4].forEach((t, i) => noise(c, t, 0.05, 0.3 - i * 0.04)),
  /* A sad slide down. */
  crash: (c) => {
    tone(c, 440, 0, 0.9, 'sawtooth', 0.12, 110)
    tone(c, 330, 0.05, 0.9, 'sawtooth', 0.08, 82)
  },
  /* A little fanfare. */
  era: (c) => [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.12, i === 3 ? 0.6 : 0.16, 'square', 0.1)),
  win: (c) => {
    ;[523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(c, f, i * 0.14, i === 5 ? 0.9 : 0.18, 'square', 0.1))
    tone(c, 262, 0, 1.5, 'triangle', 0.12)
  },
  turn: (c) => {
    tone(c, 880, 0, 0.12, 'sine', 0.15)
    tone(c, 1320, 0.1, 0.18, 'sine', 0.12)
  },
  tick: (c) => tone(c, 1500, 0, 0.05, 'square', 0.06),
  build: (c) => {
    tone(c, 196, 0, 0.08, 'square', 0.12)
    tone(c, 262, 0.09, 0.12, 'square', 0.12)
  },
  steal: (c) => tone(c, 700, 0, 0.25, 'sine', 0.12, 1400),
}
