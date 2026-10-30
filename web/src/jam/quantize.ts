import type { JamNote } from './recorder'

export interface QNote {
  /** Beats from the start of the window. */
  t: number
  dur: number
  midi: number
}

export type GridDiv = 8 | 16

/**
 * Snaps recorded notes in [fromBeat, toBeat) to an 8th or 16th grid.
 * A note belongs to the window if its snapped start lands inside it. Two notes landing on the
 * same slot keep the first (the second is usually a re-trigger). Durations are at least one
 * slot and never overlap the next note or run past the window.
 */
export function quantize(notes: JamNote[], fromBeat: number, toBeat: number, div: GridDiv): QNote[] {
  const perBeat = div / 4
  const snap = (b: number) => Math.round(b * perBeat) / perBeat || 0
  const length = toBeat - fromBeat
  const out: QNote[] = []
  const sorted = [...notes].sort((a, b) => a.start - b.start)
  for (const n of sorted) {
    const t = snap(n.start - fromBeat)
    if (t < 0 || t >= length) continue
    if (out.length && out[out.length - 1].t === t) continue
    const end = n.end ?? n.start
    const dur = Math.max(1 / perBeat, snap(end - fromBeat) - t)
    out.push({ t, dur, midi: n.midi })
  }
  for (let i = 0; i < out.length; i++) {
    const limit = (i + 1 < out.length ? out[i + 1].t : length) - out[i].t
    out[i].dur = Math.min(out[i].dur, limit)
  }
  return out
}

/** The bar window for "save the last N bars": ends at the current bar line, or after the current bar once it is half played. */
export function saveWindow(nowBeat: number, bars: number, beatsPerBar: number): { from: number; to: number } {
  const bar = Math.floor(nowBeat / beatsPerBar)
  const into = nowBeat / beatsPerBar - bar
  const endBar = into >= 0.5 ? bar + 1 : bar
  return { from: (endBar - bars) * beatsPerBar, to: endBar * beatsPerBar }
}
