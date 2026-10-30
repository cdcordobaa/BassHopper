// Finds a riff's key and picks a backing chord for each bar that belongs to that key.

import type { Chart } from '../game/chart'
import type { Key } from '../jam/theory'
import { positionToMidi } from './notes'

export interface KeyNote {
  /** Start in beats. */
  t: number
  /** Length in beats. */
  dur: number
  midi: number
}

// Krumhansl–Kessler key profiles, index 0 = tonic.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

// Chord roots a bass-and-drums rock band uses in each mode, as intervals above the tonic
// (major: I ii IV V vi bVII; minor: i III iv v VI VII).
const ROOTS_IN_MODE = { major: [0, 2, 5, 7, 9, 10], minor: [0, 3, 5, 7, 8, 10] } as const

const pcOf = (midi: number) => ((midi % 12) + 12) % 12

function correlation(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / 12
  const mb = b.reduce((s, v) => s + v, 0) / 12
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < 12; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

/** How much a note counts: longer notes, notes on the beat and low notes define the key. */
function weight(n: KeyNote, beatsPerBar: number, lowest: number): number {
  const pos = ((n.t % beatsPerBar) + beatsPerBar) % beatsPerBar
  const onDownbeat = Math.abs(pos) < 1e-6
  const onBeat = Math.abs(pos - Math.round(pos)) < 1e-6
  return Math.max(n.dur, 0.25) * (onDownbeat ? 2 : onBeat ? 1.3 : 1) * (n.midi === lowest ? 1.5 : 1)
}

/** Most likely key of a riff (Krumhansl–Schmuckler, weighted toward strong and low notes). */
export function detectKey(notes: KeyNote[], beatsPerBar = 4): Key {
  if (!notes.length) return { tonic: 4, mode: 'minor' }
  const lowest = Math.min(...notes.map((n) => n.midi))
  const hist = new Array<number>(12).fill(0)
  for (const n of notes) hist[pcOf(n.midi)] += weight(n, beatsPerBar, lowest)
  // Riffs usually start and end on their home note, and the lowest note is often home too.
  const total = hist.reduce((a, v) => a + v, 0)
  const byTime = [...notes].sort((a, b) => a.t - b.t)
  hist[pcOf(byTime[0].midi)] += total * 0.35
  hist[pcOf(byTime[byTime.length - 1].midi)] += total * 0.15
  hist[pcOf(lowest)] += total * 0.05

  let best: Key = { tonic: pcOf(lowest), mode: 'minor' }
  let bestScore = -Infinity
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ['minor', 'major'] as const) {
      const profile = mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE
      const rotated = hist.map((_, i) => hist[(i + tonic) % 12])
      // Tiny bias toward minor: bass riffs on open strings are mostly minor/power-chord rock.
      const score = correlation(rotated, profile) + (mode === 'minor' ? 0.01 : 0)
      if (score > bestScore) {
        bestScore = score
        best = { tonic, mode }
      }
    }
  }
  return best
}

// How well a played note sits over a power chord (root + fifth), by interval above the root.
// Root and fifth lock in; the third, fourth, sixth and seventh pass fine; semitone rubs and the
// tritone clash.
const FIT = [3, -1.5, -0.3, 0.6, 0.6, 0.4, -1.5, 1.5, -1, 0.4, 0.5, -0.8]

/**
 * One chord root (MIDI, near the riff's register) per bar, chosen from the chords of `key`.
 * Bars without notes keep the previous chord.
 */
export function barChordRoots(notes: KeyNote[], key: Key, beatsPerBar: number, bars: number): (number | null)[] {
  const lowest = notes.length ? Math.min(...notes.map((n) => n.midi)) : 40
  const candidates = ROOTS_IN_MODE[key.mode].map((iv) => (key.tonic + iv) % 12)
  const out: (number | null)[] = []
  let prev: number | null = null
  for (let b = 0; b < bars; b++) {
    const inBar = notes.filter((n) => Math.floor(n.t / beatsPerBar) === b)
    if (!inBar.length) {
      out.push(prev === null ? null : lowest + pcOf(prev - lowest))
      continue
    }
    const barLow = Math.min(...inBar.map((n) => n.midi))
    let bestPc = candidates[0]
    let bestScore = -Infinity
    for (const root of candidates) {
      let s = 0
      for (const n of inBar) s += weight(n, beatsPerBar, barLow) * FIT[(pcOf(n.midi) - root + 12) % 12]
      if (root === key.tonic) s += 0.5
      if (root === prev) s += 0.3
      if (s > bestScore) {
        bestScore = s
        bestPc = root
      }
    }
    prev = bestPc
    out.push(lowest + pcOf(bestPc - lowest))
  }
  return out
}

export function chartKeyNotes(chart: Chart): KeyNote[] {
  return chart.notes.map((n) => ({ t: n.t, dur: n.dur, midi: positionToMidi(n.string, n.fret) }))
}
