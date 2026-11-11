import type { SoloPiece } from '../arena/api'
import { parseNotation, type Chart } from '../game/chart'
import type { Level } from '../game/path/worlds'
import type { Progress } from '../game/progress'

/** Accuracy at which a phrase counts as learned (a progress mark only: nothing is ever locked). */
export const PASS = 0.9

export interface SoloLevels {
  phrases: Level[]
  /** The whole piece, top to bottom. */
  stage: Level
}

export const phraseId = (piece: string, i: number) => `solo:${piece}:${i}`
export const stageId = (piece: string) => `solo:${piece}:stage`

function chart(id: string, title: string, piece: SoloPiece, notation: string): Chart {
  const { notes, lengthBeats } = parseNotation(notation, piece.step ?? 1)
  const beatsPerBar = piece.beatsPerBar ?? 4
  // Whole bars, so the count-in and the highway's bar lines stay in step.
  return { id, title, bpm: piece.bpm, beatsPerBar, notes, lengthBeats: Math.ceil(lengthBeats / beatsPerBar) * beatsPerBar }
}

/** Levels for a piece: one per phrase plus the full performance. Throws on bad notation. */
export function soloLevels(piece: SoloPiece): SoloLevels {
  const phrases = piece.phrases.map((ph, i): Level => {
    const id = phraseId(piece.id, i)
    return {
      id,
      title: `${piece.title} · ${i + 1}. ${ph.name}`,
      solo: true,
      explain: [`Phrase ${i + 1} of ${piece.phrases.length}. ${Math.round(PASS * 100)}% or better and it's marked learned.`],
      tip: ph.tip ?? piece.tip ?? '',
      chart: chart(id, ph.name, piece, ph.notation),
    }
  })
  const order = piece.perform ?? piece.phrases.map((_, i) => i)
  const id = stageId(piece.id)
  const stage: Level = {
    id,
    title: `${piece.title} · On stage`,
    solo: true,
    explain: ['The whole piece, top to bottom: ' + order.map((i) => piece.phrases[i].name).join(' → ') + '.', 'Turn Wait for me off when you want the real thing.'],
    tip: piece.tip ?? '',
    chart: chart(id, piece.title, piece, order.map((i) => piece.phrases[i].notation).join(' | ')),
  }
  return { phrases, stage }
}

export function learned(level: Level, p: Progress): boolean {
  return (p.levels[level.id]?.bestAccuracy ?? 0) >= PASS
}
