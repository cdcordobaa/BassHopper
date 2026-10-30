import { freqToMidiFloat } from '../music/notes'

export interface PitchFrame {
  /** AudioContext time of the last sample in the analysis window. */
  time: number
  freq: number | null
  clarity: number
  rms: number
}

export type NoteEvent =
  | { type: 'on'; midi: number; time: number }
  | { type: 'off'; midi: number; time: number }

const MIN_CLARITY = 0.8
const STABLE_FRAMES = 3
const SILENT_FRAMES = 4
const ATTACK_RATIO = 1.8
const REPLUCK_MIN_GAP = 0.08
const ATTACK_DEBOUNCE = 0.06

/**
 * Turns a stream of pitch frames into discrete note-on/off events.
 * Onset time comes from the RMS attack when available (more precise than pitch stabilisation).
 */
export class NoteTracker {
  private current: { midi: number; onset: number } | null = null
  private candMidi = -1
  private candCount = 0
  private candStart = 0
  private silent = 0
  private env = 0
  private lastAttack = -Infinity
  private getGate: () => number
  private windowSec: number
  private chunkSec: number

  constructor(getGate: () => number, windowSec: number, chunkSec: number) {
    this.getGate = getGate
    this.windowSec = windowSec
    this.chunkSec = chunkSec
  }

  push(f: PitchFrame): NoteEvent[] {
    const out: NoteEvent[] = []
    const gate = this.getGate()
    // Debounced: the rising edge of one pluck spans several frames.
    const attack = f.rms > gate && f.rms > this.env * ATTACK_RATIO && f.time - this.lastAttack > ATTACK_DEBOUNCE
    if (attack) this.lastAttack = f.time - this.chunkSec
    this.env = this.env * 0.8 + f.rms * 0.2

    const voiced = f.freq !== null && f.clarity >= MIN_CLARITY && f.rms >= gate
    if (!voiced) {
      this.silent++
      if (this.silent >= SILENT_FRAMES && this.current) {
        out.push({ type: 'off', midi: this.current.midi, time: f.time })
        this.current = null
      }
      this.candCount = 0
      return out
    }
    this.silent = 0
    const midi = Math.round(freqToMidiFloat(f.freq!))

    if (this.current && midi === this.current.midi) {
      if (attack && this.lastAttack - this.current.onset > REPLUCK_MIN_GAP) {
        out.push({ type: 'on', midi, time: this.lastAttack })
        this.current.onset = this.lastAttack
      }
      this.candCount = 0
      return out
    }

    if (midi === this.candMidi && this.candCount > 0) this.candCount++
    else {
      this.candMidi = midi
      this.candCount = 1
      this.candStart = f.time
    }
    if (this.candCount >= STABLE_FRAMES) {
      const recentAttack = this.lastAttack >= this.candStart - 0.12 && this.lastAttack <= f.time
      const onset = recentAttack ? this.lastAttack : this.candStart - this.windowSec / 2
      if (this.current) out.push({ type: 'off', midi: this.current.midi, time: onset })
      out.push({ type: 'on', midi, time: onset })
      this.current = { midi, onset }
      this.candCount = 0
    }
    return out
  }

  reset() {
    this.current = null
    this.candCount = 0
    this.silent = 0
    this.env = 0
    this.lastAttack = -Infinity
  }
}
