import { describe, expect, it } from 'vitest'
import { parseNotation, type Chart, type ChartNote } from '../game/chart'
import { deriveDifficulty, simplestPosition } from '../arena/difficulty'
import { positionToMidi } from '../music/notes'

function chart(notation: string, step = 1): Chart {
  const { notes, lengthBeats } = parseNotation(notation, step)
  return { id: 't', title: 't', bpm: 100, beatsPerBar: 4, notes, lengthBeats, sections: [{ beat: 0, name: 'Intro' }], tempoMap: [{ beat: 0, bpm: 100 }] }
}

const times = (ns: ChartNote[]) => ns.map((n) => n.t)

describe('deriveDifficulty', () => {
  // Eighth notes: E string frets 0..7 over two beats, plus a fill.
  const eighths = chart('E0 E1 E2 E3 E5 E7 E8 E10 | A0 A2 A3 A5 A7 A5 A3 A2', 0.5)

  it('full keeps every note and the metadata', () => {
    const d = deriveDifficulty(eighths, 'full')
    expect(d.notes).toHaveLength(16)
    expect(d.sections).toEqual(eighths.sections)
    expect(d.tempoMap).toEqual(eighths.tempoMap)
    expect(d.lengthBeats).toBe(eighths.lengthBeats)
  })

  it('groove keeps at most one note per beat, the one on the beat', () => {
    const d = deriveDifficulty(eighths, 'groove')
    // 7.5 rounds to beat 8, which has no note of its own: kept as an anticipation of the next downbeat.
    expect(times(d.notes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7.5])
    // Positions are not simplified at groove level.
    expect(d.notes[2]).toMatchObject({ string: 0, fret: 5 })
  })

  it('groove keeps the note nearest the beat when nothing lands exactly on it', () => {
    const c: Chart = { ...chart('E0'), notes: [{ t: 0.3, dur: 0.2, string: 0, fret: 3 }, { t: 0.9, dur: 0.2, string: 0, fret: 5 }, { t: 1.4, dur: 0.2, string: 1, fret: 0 }], lengthBeats: 4 }
    // 0.3 → beat 0; 0.9 and 1.4 → beat 1, 0.9 is nearer.
    expect(times(deriveDifficulty(c, 'groove').notes)).toEqual([0.3, 0.9])
  })

  it('rookie keeps only beats 1 and 3 of each bar', () => {
    const d = deriveDifficulty(eighths, 'rookie')
    expect(times(d.notes)).toEqual([0, 2, 4, 6])
  })

  it('rookie takes the nearest note within a beat when nothing is on 1 or 3', () => {
    const c: Chart = { ...chart('E0'), notes: [{ t: 0.5, dur: 1, string: 1, fret: 2 }, { t: 3.5, dur: 1, string: 1, fret: 2 }, { t: 5.75, dur: 1, string: 1, fret: 3 }], lengthBeats: 8 }
    // beat 0 ← 0.5; beat 2: nearest within (1,3) — none (3.5 is 1.5 away); beat 4: 3.5; beat 6 ← 5.75
    expect(times(deriveDifficulty(c, 'rookie').notes)).toEqual([0.5, 3.5, 5.75])
  })

  it('rookie moves notes to the simplest position of the same pitch', () => {
    const c = chart('E5 A5 G0 D7')
    const d = deriveDifficulty(c, 'rookie')
    // E5 = A open; G0 stays open
    expect(d.notes[0]).toMatchObject({ string: 1, fret: 0 })
    expect(d.notes[1]).toMatchObject({ string: 3, fret: 0 })
    for (let i = 0; i < d.notes.length; i++) {
      const orig = c.notes.find((n) => n.t === d.notes[i].t)!
      expect(positionToMidi(d.notes[i].string, d.notes[i].fret)).toBe(positionToMidi(orig.string, orig.fret))
    }
  })

  it('does not mutate the input chart', () => {
    const c = chart('E5 A5 G0 D7')
    const before = JSON.stringify(c)
    deriveDifficulty(c, 'rookie')
    deriveDifficulty(c, 'groove')
    expect(JSON.stringify(c)).toBe(before)
  })

  it('handles an empty chart', () => {
    const c: Chart = { ...chart('E0'), notes: [] }
    for (const d of ['rookie', 'groove', 'full'] as const) expect(deriveDifficulty(c, d).notes).toEqual([])
  })
})

describe('simplestPosition', () => {
  it('prefers open strings, then the lowest fret', () => {
    expect(simplestPosition({ t: 0, dur: 1, string: 0, fret: 10 })).toMatchObject({ string: 2, fret: 0 }) // D
    expect(simplestPosition({ t: 0, dur: 1, string: 0, fret: 12 })).toMatchObject({ string: 2, fret: 2 }) // E2 → D string fret 2
    expect(simplestPosition({ t: 0, dur: 1, string: 0, fret: 1 })).toMatchObject({ string: 0, fret: 1 })
  })
})
