import type { Chart, ChartNote } from '../game/chart'
import { positionsForMidi, positionToMidi } from '../music/notes'

export type Difficulty = 'rookie' | 'groove' | 'full'

export const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'rookie', label: 'Rookie', blurb: 'Beats 1 and 3, easiest positions' },
  { id: 'groove', label: 'Groove', blurb: 'One note per beat, no fast fills' },
  { id: 'full', label: 'Full Riff', blurb: 'Every note in the tab' },
]

/** Same pitch at the lowest fret available (open strings win). */
export function simplestPosition(n: ChartNote): ChartNote {
  const options = positionsForMidi(positionToMidi(n.string, n.fret), 24)
  if (!options.length) return n
  const best = options.reduce((a, b) => (b.fret < a.fret ? b : a))
  return { ...n, string: best.string, fret: best.fret }
}

/** For each target beat, the not-yet-used note closest to it within `reach` beats (strictly). */
function nearestTo(notes: ChartNote[], targets: number[], reach: number): ChartNote[] {
  const used = new Set<number>()
  const out: ChartNote[] = []
  let lo = 0
  for (const target of targets) {
    while (lo < notes.length && notes[lo].t <= target - reach) lo++
    let best = -1
    for (let i = lo; i < notes.length && notes[i].t < target + reach; i++) {
      if (used.has(i)) continue
      if (best < 0 || Math.abs(notes[i].t - target) < Math.abs(notes[best].t - target)) best = i
    }
    if (best >= 0) {
      used.add(best)
      out.push(notes[best])
    }
  }
  return out
}

function grooveNotes(notes: ChartNote[]): ChartNote[] {
  // One note per beat: among notes rounding to the same beat, keep the one nearest it.
  const byBeat = new Map<number, ChartNote>()
  for (const n of notes) {
    const beat = Math.round(n.t)
    const cur = byBeat.get(beat)
    if (!cur || Math.abs(n.t - beat) < Math.abs(cur.t - beat)) byBeat.set(beat, n)
  }
  return [...byBeat.values()]
}

function rookieNotes(notes: ChartNote[], beatsPerBar: number, lengthBeats: number): ChartNote[] {
  const offsets = beatsPerBar > 2 ? [0, 2] : [0]
  const lastT = notes.length ? notes[notes.length - 1].t : 0
  // Don't invent a downbeat after the chart ends just to catch a trailing pickup note.
  const end = lengthBeats > lastT ? lengthBeats : lastT + 1
  const targets: number[] = []
  for (let bar = 0; bar * beatsPerBar < end; bar++) {
    for (const o of offsets) if (bar * beatsPerBar + o < end) targets.push(bar * beatsPerBar + o)
  }
  return nearestTo(notes, targets, 1).map(simplestPosition)
}

/** Derives an easier chart from a full one. Pure; tempo map and sections are kept. */
export function deriveDifficulty<C extends Chart>(chart: C, difficulty: Difficulty): C {
  const sorted = [...chart.notes].sort((a, b) => a.t - b.t)
  let notes: ChartNote[]
  if (difficulty === 'groove') notes = grooveNotes(sorted)
  else if (difficulty === 'rookie') notes = rookieNotes(sorted, chart.beatsPerBar, chart.lengthBeats)
  else notes = sorted
  return { ...chart, notes: notes.sort((a, b) => a.t - b.t) }
}
