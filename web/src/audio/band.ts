// Synthesized backing band (drums + chord stabs), scheduled on the audio clock.
// Kept free of the bass register so the pitch detector isn't fooled: chords sit above C5.

export type DrumStyle = 'rock' | 'funk' | 'disco' | 'halftime' | 'punk'
export type Backing = 'click' | 'drums' | 'band'

export const DRUM_STYLES: { id: DrumStyle; label: string }[] = [
  { id: 'rock', label: 'Rock' },
  { id: 'funk', label: 'Funk' },
  { id: 'disco', label: 'Disco' },
  { id: 'halftime', label: 'Half-time' },
  { id: 'punk', label: 'Punk' },
]

// 16 steps per 4/4 bar. k = kick, s = snare, h = closed hat, o = open hat.
const PATTERNS: Record<DrumStyle, { k: string; s: string; h: string; o: string }> = {
  rock: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '................' },
  funk: { k: 'x.....x...x..x..', s: '....x..x.x..x..x', h: 'xxxxxxxxxxxxxx.x', o: '..............x.' },
  disco: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x...x...x...x...', o: '..x...x...x...x.' },
  halftime: { k: 'x.........x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', o: '................' },
  punk: { k: 'x...x...x...x...', s: '..x...x...x...x.', h: 'xxxxxxxxxxxxxxxx', o: '................' },
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx)
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    noiseCache.set(ctx, buf)
  }
  return buf
}

function env(ctx: BaseAudioContext, time: number, peak: number, decay: number, dest: AudioNode): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, time)
  g.gain.exponentialRampToValueAtTime(peak, time + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, time + decay)
  g.connect(dest)
  return g
}

function kick(ctx: BaseAudioContext, time: number, dest: AudioNode, vel: number) {
  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(160, time)
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.11)
  osc.connect(env(ctx, time, 0.9 * vel, 0.32, dest))
  osc.start(time)
  osc.stop(time + 0.35)
}

function snare(ctx: BaseAudioContext, time: number, dest: AudioNode, vel: number) {
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 1400
  src.connect(hp).connect(env(ctx, time, 0.5 * vel, 0.18, dest))
  src.start(time)
  src.stop(time + 0.2)
  // Body from band-passed noise, not a sine: a pitched body at ~200 Hz reads as a bass note.
  const body = ctx.createBufferSource()
  body.buffer = noise(ctx)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 260
  bp.Q.value = 0.8
  body.connect(bp).connect(env(ctx, time, 0.6 * vel, 0.07, dest))
  body.start(time, 0.5)
  body.stop(time + 0.09)
}

function hat(ctx: BaseAudioContext, time: number, dest: AudioNode, vel: number, open: boolean) {
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 7500
  const decay = open ? 0.22 : 0.045
  src.connect(hp).connect(env(ctx, time, 0.22 * vel, decay, dest))
  src.start(time)
  src.stop(time + decay + 0.02)
}

/** Plays whatever the style's pattern has on `step` (0..15). */
export function playDrumStep(ctx: BaseAudioContext, style: DrumStyle, step: number, time: number, dest: AudioNode) {
  const p = PATTERNS[style]
  const accent = step % 4 === 0 ? 1 : 0.75
  if (p.k[step] === 'x') kick(ctx, time, dest, 1)
  if (p.s[step] === 'x') snare(ctx, time, dest, step % 4 === 0 ? 1 : 0.55)
  if (p.o[step] === 'x') hat(ctx, time, dest, accent, true)
  else if (p.h[step] === 'x') hat(ctx, time, dest, accent, false)
}

/**
 * A short power-chord stab voiced root + octave + octave-fifth, root at C5 or above.
 * A plain root+fifth has a combined period an octave BELOW the root, which the bass detector
 * hears as a note; this voicing's combined period is the root itself, above any bass note.
 */
export function playChordStab(ctx: BaseAudioContext, rootMidi: number, time: number, dur: number, dest: AudioNode) {
  let root = rootMidi
  while (root < 72) root += 12
  while (root > 83) root -= 12
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2600
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, time)
  g.gain.exponentialRampToValueAtTime(0.09, time + 0.01)
  g.gain.setValueAtTime(0.09, time + dur * 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
  lp.connect(g).connect(dest)
  for (const iv of [0, 12, 19]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 440 * 2 ** ((root + iv - 69) / 12)
    o.detune.value = iv === 0 ? -4 : 5
    o.connect(lp)
    o.start(time)
    o.stop(time + dur + 0.02)
  }
}
