import { describe, expect, it } from 'vitest'
import type { SoloPiece } from '../arena/api'
import type { Progress } from '../game/progress'
import { PASS, phraseOpen, soloLevels, stageOpen } from '../solo/pieces'

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

  it('opens each phrase after the previous one is passed, and the stage after all of them', () => {
    const l = soloLevels(piece)
    const none = played({})
    expect(phraseOpen(l, 0, none)).toBe(true)
    expect(phraseOpen(l, 1, none)).toBe(false)
    const first = played({ 'solo:riff:0': PASS })
    expect(phraseOpen(l, 1, first)).toBe(true)
    expect(stageOpen(l, first)).toBe(false)
    expect(stageOpen(l, played({ 'solo:riff:0': 0.95, 'solo:riff:1': 0.9 }))).toBe(true)
  })

  it('reports bad notation', () => {
    expect(() => soloLevels({ ...piece, phrases: [{ name: 'x', notation: 'Q9' }] })).toThrow(/Q9/)
  })
})
