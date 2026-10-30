import { describe, expect, it } from 'vitest'
import { beatToSec, parseNotation, secToBeat, timeChart, type Chart } from '../game/chart'

function chart(notation: string, extra: Partial<Chart> = {}): Chart {
  const { notes, lengthBeats } = parseNotation(notation)
  return { id: 't', title: 't', bpm: 120, beatsPerBar: 4, notes, lengthBeats, ...extra }
}

describe('beatToSec', () => {
  it('uses constant bpm without a tempo map', () => {
    const c = chart('E0')
    expect(beatToSec(c, 4)).toBeCloseTo(2)
    expect(beatToSec(c, 4, 0.5)).toBeCloseTo(4)
  })

  it('follows tempo changes', () => {
    // 4 beats at 120 (2s), then 60 bpm (1s per beat)
    const c = chart('E0', { tempoMap: [{ beat: 0, bpm: 120 }, { beat: 4, bpm: 60 }] })
    expect(beatToSec(c, 2)).toBeCloseTo(1)
    expect(beatToSec(c, 4)).toBeCloseTo(2)
    expect(beatToSec(c, 6)).toBeCloseTo(4)
    expect(beatToSec(c, 6, 0.5)).toBeCloseTo(8)
  })

  it('handles several changes and fractional beats', () => {
    const c = chart('E0', { tempoMap: [{ beat: 0, bpm: 60 }, { beat: 1, bpm: 120 }, { beat: 3, bpm: 240 }] })
    expect(beatToSec(c, 3.5)).toBeCloseTo(1 + 1 + 0.125)
  })

  it('extends the first tempo backwards for negative beats (count-ins)', () => {
    const c = chart('E0', { tempoMap: [{ beat: 0, bpm: 120 }, { beat: 4, bpm: 60 }] })
    expect(beatToSec(c, -2)).toBeCloseTo(-1)
  })

  it('treats an empty tempo map as constant bpm', () => {
    expect(beatToSec(chart('E0', { tempoMap: [] }), 2)).toBeCloseTo(1)
  })
})

describe('secToBeat', () => {
  it('inverts beatToSec', () => {
    const c = chart('E0', { tempoMap: [{ beat: 0, bpm: 120 }, { beat: 4, bpm: 60 }, { beat: 10, bpm: 180 }] })
    for (const b of [0, 1.5, 4, 5.25, 10, 13]) {
      expect(secToBeat(c, beatToSec(c, b))).toBeCloseTo(b)
      expect(secToBeat(c, beatToSec(c, b, 0.75), 0.75)).toBeCloseTo(b)
    }
    expect(secToBeat(chart('E0'), 3)).toBeCloseTo(6)
  })
})

describe('timeChart with a tempo map', () => {
  it('is unchanged without one', () => {
    const c = chart('E0 A0 D0')
    expect(timeChart(c, 10, 60, 2).map((n) => n.time)).toEqual([12, 13, 14])
  })

  it('places notes on the tempo map, scaled by speed', () => {
    const c = chart('E0 E0 E0 E0 A0 A0', { tempoMap: [{ beat: 0, bpm: 120 }, { beat: 4, bpm: 60 }] })
    const full = timeChart(c, 0, 120, 0).map((n) => n.time)
    expect(full[3]).toBeCloseTo(1.5)
    expect(full[4]).toBeCloseTo(2)
    expect(full[5]).toBeCloseTo(3)
    // half speed: bpm 60 → everything twice as long; count-in of 4 beats at 60 = 4s
    const half = timeChart(c, 0, 60, 4).map((n) => n.time)
    expect(half[5]).toBeCloseTo(4 + 6)
  })
})
