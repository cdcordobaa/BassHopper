import { describe, expect, it } from 'vitest'
import { parseNotation, timeChart, type Chart } from '../game/chart'
import { Scorer, ROOKIE_WINDOWS } from '../game/scorer'

function chart(notation: string, bpm = 60): Chart {
  const { notes, lengthBeats } = parseNotation(notation)
  return { id: 't', title: 't', bpm, beatsPerBar: 4, notes, lengthBeats }
}

describe('parseNotation', () => {
  it('parses notes, rests, durations and repeats', () => {
    const { notes, lengthBeats } = parseNotation('(E0 -)x2 | A3*0.5 G12')
    expect(notes.map((n) => [n.t, n.string, n.fret])).toEqual([
      [0, 0, 0],
      [2, 0, 0],
      [4, 1, 3],
      [4.5, 3, 12],
    ])
    expect(lengthBeats).toBe(5.5)
  })

  it('rejects junk', () => {
    expect(() => parseNotation('X9')).toThrow()
  })
})

describe('Scorer', () => {
  // 60 bpm, no count-in, start at 0 → notes at 0s, 1s, 2s
  const timed = timeChart(chart('E0 A0 A3'), 0, 60, 0)

  it('grades perfect and good by timing', () => {
    const s = new Scorer(timed)
    expect(s.onNote(28, 0.02)).toMatchObject({ grade: 'perfect' })
    expect(s.onNote(33, 1.08)).toMatchObject({ grade: 'good' })
  })

  it('accepts an octave error and the same pitch on another string', () => {
    const s = new Scorer(timed)
    expect(s.onNote(28 + 12, 0)).toMatchObject({ grade: 'perfect' })
    // A3 = C (midi 36); same pitch as E string fret 8
    expect(s.onNote(36, 2)).toMatchObject({ grade: 'perfect' })
  })

  it('reports wrong notes with names', () => {
    const s = new Scorer(timed)
    expect(s.onNote(31, 1.0)).toEqual({ kind: 'wrong', idx: 1, played: 'G', needed: 'A' })
  })

  it('marks unplayed notes as misses after their window', () => {
    const s = new Scorer(timed)
    expect(s.tick(0.5)).toHaveLength(1)
    expect(s.tick(5)).toHaveLength(2)
    expect(s.summary()).toMatchObject({ miss: 3, stars: 0 })
  })

  it('rookie windows are wider', () => {
    const s = new Scorer(timed, ROOKIE_WINDOWS)
    expect(s.onNote(28, 0.15)).toMatchObject({ grade: 'good' })
  })

  it('computes stars and combo', () => {
    const s = new Scorer(timed)
    s.onNote(28, 0)
    s.onNote(33, 1)
    s.onNote(36, 2)
    expect(s.summary()).toMatchObject({ perfect: 3, stars: 3, maxCombo: 3, accuracy: 1 })
  })
})
