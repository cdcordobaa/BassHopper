import type * as ToneNS from 'tone'
import { engine } from '../audio/engine'
import { BeatGrid } from './grid'
import { findStyle, hitAt, swingOffset, type Style } from './styles'
import { findProgression, guideRoot, harmonyAtBar, PROGRESSIONS, voiceChord, type Harmony, type StyleId } from './theory'
import { ensureTone, type ToneLib } from './tone'

export interface BackingOptions {
  style: StyleId
  progressionId: string
  tonic: number
  bpm: number
  barsPerChord: number
  guideBass: boolean
  /** 0..1 master level of the backing band. */
  volume: number
}

export interface BeatInfo extends Harmony {
  bar: number
  /** 0-based beat within the bar. */
  beat: number
  counting: boolean
  /** Audio time the beat sounds at (scheduled time, before output latency). */
  time: number
}

export const BEATS_PER_BAR = 4
const STEPS_PER_BEAT = 4
const STEPS_PER_BAR = BEATS_PER_BAR * STEPS_PER_BEAT
const AHEAD = 0.25
export const MIN_BPM = 50
export const MAX_BPM = 160

export function defaultOptions(style: StyleId = 'rock'): BackingOptions {
  const s = findStyle(style)
  const prog = PROGRESSIONS[style][0]
  return { style, progressionId: prog.id, tonic: 9, bpm: s.bpm, barsPerChord: prog.barsPerChord, guideBass: false, volume: 0.7 }
}

interface Band {
  master: ToneNS.Gain
  drums: ToneNS.Gain
  snareHp: ToneNS.Filter
  kick: ToneNS.MembraneSynth
  snare: ToneNS.NoiseSynth
  hat: ToneNS.MetalSynth
  openHat: ToneNS.MetalSynth
  chords: ToneNS.PolySynth
  chordFilter: ToneNS.Filter
  bass: ToneNS.Synth
}

/**
 * Generated backing band: drums + chords (no bass line — that's you), on the engine's clock.
 * Uses its own look-ahead scheduler over a BeatGrid so the bar grid is known exactly for recording.
 */
export class Backing {
  grid: BeatGrid | null = null
  private opts: BackingOptions
  private band: Band | null = null
  private Tone: ToneLib | null = null
  private timer: number | null = null
  /** Bumped by every start/stop so a start still awaiting Tone can tell it was superseded. */
  private gen = 0
  private nextStep = 0
  /** Bar at which the progression (re)starts, and where in its cycle it starts. */
  private cycleStartBar = 0
  private barOffset = 0
  private toneFor = ''
  private listeners = new Set<(b: BeatInfo) => void>()

  constructor(opts: BackingOptions) {
    this.opts = { ...opts }
  }

  get options(): BackingOptions {
    return this.opts
  }

  get running(): boolean {
    return this.timer !== null
  }

  /**
   * Starts the band. Beat 0 (bar 0, first chord) sounds at `downbeat`;
   * `countInBars` of hi-hat ticks come before it. `barOffset` starts part-way into the progression.
   */
  async start(downbeat?: number, countInBars = 1, barOffset = 0) {
    this.stop()
    const gen = this.gen
    const Tone = await ensureTone()
    if (gen !== this.gen) return
    this.Tone = Tone
    if (!this.band) this.band = this.build(Tone)
    this.applyTone()
    this.applyVolume()
    const ctx = engine.ctx!
    const spb = 60 / this.opts.bpm
    const t0 = downbeat ?? ctx.currentTime + 0.15 + countInBars * BEATS_PER_BAR * spb
    this.grid = new BeatGrid(t0, this.opts.bpm)
    this.nextStep = -countInBars * STEPS_PER_BAR
    this.cycleStartBar = 0
    this.barOffset = barOffset
    const toneCtx = Tone.getContext()
    this.timer = toneCtx.setInterval(() => this.tick(), 0.02)
    this.tick()
  }

  stop() {
    this.gen++
    if (this.timer !== null && this.Tone) this.Tone.getContext().clearInterval(this.timer)
    this.timer = null
    this.band?.chords.releaseAll()
    this.Tone?.getDraw().cancel()
  }

  dispose() {
    this.stop()
    if (this.band) Object.values(this.band).forEach((n) => n.dispose())
    this.band = null
    this.toneFor = ''
    this.listeners.clear()
  }

  update(patch: Partial<BackingOptions>) {
    const prev = this.opts
    this.opts = { ...prev, ...patch }
    if (patch.bpm !== undefined) this.opts.bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, patch.bpm))
    const nextBar = Math.ceil(this.nextStep / STEPS_PER_BAR)
    if (this.running && this.grid) {
      if (this.opts.bpm !== prev.bpm) this.grid.setTempo(this.opts.bpm, nextBar * BEATS_PER_BAR)
      if (this.opts.progressionId !== prev.progressionId || this.opts.barsPerChord !== prev.barsPerChord) {
        this.cycleStartBar = nextBar
        this.barOffset = 0
      }
    } else {
      this.cycleStartBar = 0
    }
    if (patch.style) this.applyTone()
    if (patch.volume !== undefined) this.applyVolume()
  }

  onBeat(fn: (b: BeatInfo) => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }

  /** Position of a bar within the progression cycle (what a riff stores to replay over the same chords). */
  cycleBar(bar: number): number {
    return Math.max(0, bar) - this.cycleStartBar + this.barOffset
  }

  harmonyAt(bar: number): Harmony {
    const prog = findProgression(this.opts.progressionId) ?? PROGRESSIONS[this.opts.style][0]
    return harmonyAtBar(this.cycleBar(bar), prog, this.opts.tonic, this.opts.barsPerChord)
  }

  /** Where the band is at audio time `time` (pass engine.now() minus output latency for "what I hear"). */
  infoAt(time: number): BeatInfo | null {
    if (!this.grid) return null
    const b = this.grid.beatAt(time)
    const bar = Math.floor(b / BEATS_PER_BAR)
    const beat = Math.floor(b - bar * BEATS_PER_BAR)
    return { ...this.harmonyAt(bar), bar, beat, counting: bar < 0, time: this.grid.timeAt(Math.floor(b)) }
  }

  private tick() {
    const ctx = engine.ctx
    const grid = this.grid
    if (!ctx || !grid) return
    const horizon = ctx.currentTime + AHEAD
    while (grid.timeAt(this.nextStep / STEPS_PER_BEAT) < horizon) {
      this.schedule(this.nextStep)
      this.nextStep++
    }
  }

  private schedule(step: number) {
    const band = this.band
    const grid = this.grid
    const Tone = this.Tone
    if (!band || !grid || !Tone) return
    const style = findStyle(this.opts.style)
    const s = ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR
    const bar = Math.floor(step / STEPS_PER_BAR)
    const beatPos = step / STEPS_PER_BEAT
    const now = engine.ctx!.currentTime
    const time = Math.max(now, grid.timeAt(beatPos + swingOffset(s, style.swing) / STEPS_PER_BEAT))
    const stepSec = 60 / grid.bpm / STEPS_PER_BEAT

    if (s % STEPS_PER_BEAT === 0) {
      const info: BeatInfo = { ...this.harmonyAt(bar), bar, beat: s / STEPS_PER_BEAT, counting: bar < 0, time }
      Tone.getDraw().schedule(() => this.listeners.forEach((fn) => fn(info)), time + engine.outputLatency())
    }

    if (bar < 0) {
      if (s % STEPS_PER_BEAT === 0) band.hat.triggerAttackRelease(400, 0.03, time, s === 0 ? 0.9 : 0.55)
      return
    }

    const d = style.drums
    const k = hitAt(d.kick, s)
    if (k) band.kick.triggerAttackRelease(50, 0.25, time, k)
    const sn = hitAt(d.snare, s)
    if (sn) band.snare.triggerAttackRelease(0.12, time, sn)
    const oh = hitAt(d.openHat, s)
    if (oh) band.openHat.triggerAttackRelease(300, 0.2, time, oh * 0.6)
    else {
      const h = hitAt(d.hat, s)
      if (h) band.hat.triggerAttackRelease(300, 0.03, time, h * 0.6)
    }

    const h = this.harmonyAt(bar)
    const comp = style.comp.find(([at]) => at === s)
    if (comp) {
      const notes = voiceChord(h.chord).map((m) => Tone.Frequency(m, 'midi').toFrequency())
      band.chords.triggerAttackRelease(notes, comp[1] * stepSec * 0.92, time, style.tone === 'pad' ? 0.5 : 0.65)
    }
    if (this.opts.guideBass && (s === 0 || s === 8)) {
      band.bass.triggerAttackRelease(Tone.Frequency(guideRoot(h.chord), 'midi').toFrequency(), stepSec * 6, time, 0.6)
    }
  }

  private build(Tone: ToneLib): Band {
    const master = new Tone.Gain(this.opts.volume).toDestination()
    const drums = new Tone.Gain(0.9).connect(master)
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.05 },
    }).connect(drums)
    const snareHp = new Tone.Filter(900, 'highpass').connect(drums)
    const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(snareHp)
    snare.volume.value = -8
    const hat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(drums)
    hat.volume.value = -24
    const openHat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.25, release: 0.1 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(drums)
    openHat.volume.value = -26
    const chordFilter = new Tone.Filter(2200, 'lowpass').connect(master)
    const chords = new Tone.PolySynth(Tone.Synth).connect(chordFilter)
    chords.volume.value = -16
    const bass = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.3 } }).connect(master)
    bass.volume.value = -12
    return { master, drums, snareHp, kick, snare, hat, openHat, chords, chordFilter, bass }
  }

  private applyTone() {
    const band = this.band
    if (!band) return
    const style: Style = findStyle(this.opts.style)
    if (this.toneFor === style.tone) return
    this.toneFor = style.tone
    if (style.tone === 'pad') {
      band.chords.set({ oscillator: { type: 'fattriangle', count: 3, spread: 20 }, envelope: { attack: 0.25, decay: 0.3, sustain: 0.8, release: 0.8 } })
      band.chordFilter.frequency.value = 1800
    } else if (style.tone === 'keys') {
      band.chords.set({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.4, sustain: 0.3, release: 0.4 } })
      band.chordFilter.frequency.value = 3000
    } else {
      band.chords.set({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.15 } })
      band.chordFilter.frequency.value = 1600
    }
  }

  private applyVolume() {
    if (this.band) this.band.master.gain.rampTo(this.opts.volume, 0.05)
  }
}
