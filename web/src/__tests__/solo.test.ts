import { describe, expect, it } from 'vitest'
import type { SoloPiece } from '../arena/api'
import type { Progress } from '../game/progress'
import { learned, PASS, soloLevels } from '../solo/pieces'

const piece: SoloPiece = {
  id: 'riff',
  title: 'Riff',
  bpm: 100,
  phrases: [
    { name: 'A', notation: 'E0 E3 -' },
    { name: 'B', notation: 'A0*0.5 A2*0.5 A3*3' },
  ],
  perform: [0, 1, 0],
}

const played = (acc: Record<string, number>): Progress => ({
  xp: 0,
  days: [],
  levels: Object.fromEntries(Object.entries(acc).map(([id, a]) => [id, { stars: 1, bestScore: 0, bestAccuracy: a, plays: 1 }])),
})

describe('solo pieces', () => {
  it('makes a level per phrase and one for the whole piece, in whole bars', () => {
    const { phrases, stage } = soloLevels(piece)
    expect(phrases.map((l) => l.chart.lengthBeats)).toEqual([4, 4])
    expect(phrases.every((l) => l.solo)).toBe(true)
    // perform = A B A: 3 + 4 + 3 beats, rounded up to 3 bars
    expect(stage.chart.notes.map((n) => n.t)).toEqual([0, 1, 3, 3.5, 4, 7, 8])
    expect(stage.chart.lengthBeats).toBe(12)
  })

  it('marks a phrase learned at PASS accuracy', () => {
    const [a, b] = soloLevels(piece).phrases
    const p = played({ 'solo:riff:0': PASS, 'solo:riff:1': PASS - 0.01 })
    expect(learned(a, p)).toBe(true)
    expect(learned(b, p)).toBe(false)
    expect(learned(a, played({}))).toBe(false)
  })

  it('reports bad notation', () => {
    expect(() => soloLevels({ ...piece, phrases: [{ name: 'x', notation: 'Q9' }] })).toThrow(/Q9/)
  })
})
