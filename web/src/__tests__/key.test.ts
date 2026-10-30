import { describe, expect, it } from 'vitest'
import { parseNotation } from '../game/chart'
import { barChordRoots, chartKeyNotes, detectKey } from '../music/key'
import { pc } from '../jam/theory'

const chart = (notation: string) => {
  const { notes, lengthBeats } = parseNotation(notation, 1)
  return { id: 't', title: 't', bpm: 80, beatsPerBar: 4, notes, lengthBeats }
}

describe('detectKey', () => {
  it('hears an E–A–D rock riff as E, not A', () => {
    const notes = chartKeyNotes(chart('(E0 E0 - E0 | A0 A0 - A0 | D0 D0 A0 A0 | E0 - E0 -)x2'))
    expect(detectKey(notes).tonic).toBe(4)
  })

  it('finds E minor in a riff around the low E', () => {
    const notes = chartKeyNotes(chart('(E0*0.5 E0*0.5 E3 E5 E3 | E0*0.5 E0*0.5 E5 E3 E0 | A0*0.5 A0*0.5 A3 A5 A3 | E0 E3 E0 -)x2'))
    expect(detectKey(notes)).toEqual({ tonic: 4, mode: 'minor' })
  })
})

describe('barChordRoots', () => {
  it('stays on E for a string walk instead of jumping to whatever note is lowest', () => {
    const c = chart('(E0 A0 D0 G0 G0 D0 A0 E0)x2')
    const notes = chartKeyNotes(c)
    const roots = barChordRoots(notes, detectKey(notes), 4, 4)
    expect(roots.map((r) => pc(r!))).toEqual([4, 4, 4, 4])
  })

  it('only uses chords from the key', () => {
    const c = chart('E1 E2 E3 E4 A1 A2 A3 A4 D1 D2 D3 D4 G1 G2 G3 G4')
    const notes = chartKeyNotes(c)
    const key = detectKey(notes)
    const allowed = [0, 3, 5, 7, 8, 10, 2, 9].map((i) => (key.tonic + i) % 12)
    for (const r of barChordRoots(notes, key, 4, 4)) expect(allowed).toContain(pc(r!))
  })

  it('follows the riff when it moves to A', () => {
    const c = chart('E0 - E0 - | E0 E0 - E0 | A0 - A0 A0 | - A0 - A0')
    const notes = chartKeyNotes(c)
    const roots = barChordRoots(notes, detectKey(notes), 4, 4)
    expect(roots.map((r) => pc(r!))).toEqual([4, 4, 9, 9])
  })
})
