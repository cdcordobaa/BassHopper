import { describe, expect, it } from 'vitest'
import { ALL_LEVELS, WORLDS } from '../game/path/worlds'
import { positionToMidi } from '../music/notes'

describe('the path', () => {
  it('has unique level ids in world order', () => {
    const ids = ALL_LEVELS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    WORLDS.forEach((w) => w.levels.forEach((l) => expect(l.id.startsWith(`${w.number}-`)).toBe(true)))
  })

  it('ends every world with a boss', () => {
    WORLDS.forEach((w) => expect(w.levels.at(-1)?.boss).toBe(true))
  })

  it('fills whole bars', () => {
    ALL_LEVELS.forEach((l) => expect([l.id, l.chart.lengthBeats % 4]).toEqual([l.id, 0]))
  })

  it('only uses notes the pitch detector can hear', () => {
    // pitch.ts listens up to 420 Hz: G4 (MIDI 67) is the highest note a level may use.
    ALL_LEVELS.forEach((l) =>
      l.chart.notes.forEach((n) => expect(positionToMidi(n.string, n.fret)).toBeLessThanOrEqual(67)),
    )
  })
})
