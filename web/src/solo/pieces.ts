import type { SoloPiece } from '../arena/api'
import { parseNotation, type Chart } from '../game/chart'
import type { Level } from '../game/path/worlds'
import type { Progress } from '../game/progress'

/** Accuracy a phrase needs before the next one opens. */
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
      explain: [`Phrase ${i + 1} of ${piece.phrases.length}. Hit ${Math.round(PASS * 100)}% to open the next one.`],
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

/** Phrase i opens once the one before it has been played at PASS accuracy. */
export function phraseOpen(levels: SoloLevels, i: number, p: Progress): boolean {
  return i === 0 || (p.levels[levels.phrases[i - 1].id]?.bestAccuracy ?? 0) >= PASS
}

export function stageOpen(levels: SoloLevels, p: Progress): boolean {
  return levels.phrases.every((l) => (p.levels[l.id]?.bestAccuracy ?? 0) >= PASS)
}
