import { describe, expect, it } from 'vitest'
import { barsToRange, beatToSongSec, ClockEstimator, loopOptions, tapOffset } from '../arena/sync'

describe('ClockEstimator', () => {
  it('maps song seconds to the ctx clock at playback rate', () => {
    const c = new ClockEstimator()
    c.reset(0.5)
    // Media started at ctx 10; at half speed media advances 0.5s per ctx second.
    for (let i = 0; i < 10; i++) c.push(10 + i * 0.1, i * 0.05)
    expect(c.toCtx(0)).toBeCloseTo(10)
    expect(c.toCtx(1)).toBeCloseTo(12)
    expect(c.toSong(12)).toBeCloseTo(1)
  })

  it('shrugs off jittery and stale samples via the median', () => {
    const c = new ClockEstimator(9)
    c.reset(1)
    const jitter = [0, 0.004, -0.003, 0.25, 0.002, -0.001, 0.003, -0.2, 0]
    jitter.forEach((j, i) => c.push(5 + i * 0.016, i * 0.016 + j))
    expect(c.toCtx(0)).toBeCloseTo(5, 2)
  })

  it('uses the seeded guess until samples arrive', () => {
    const c = new ClockEstimator()
    c.reset(1, 3)
    expect(c.ready).toBe(true)
    expect(c.toCtx(2)).toBe(5)
    c.push(10, 1)
    expect(c.toCtx(0)).toBe(9)
  })
})

describe('beatToSongSec', () => {
  it('adds the song offset', () => {
    expect(beatToSongSec({ bpm: 120 }, 1.5, 4)).toBeCloseTo(3.5)
  })
})

describe('tapOffset', () => {
  const beats = Array.from({ length: 16 }, (_, i) => 1 + i * 0.5)

  it('returns the median tap lateness', () => {
    const taps = beats.slice(2, 10).map((b, i) => b + 0.03 + (i % 2 ? 0.01 : -0.01))
    expect(tapOffset(taps, beats)).toBeCloseTo(0.03, 2)
  })

  it('needs enough taps and ignores ambiguous ones', () => {
    expect(tapOffset([1.02, 1.52], beats)).toBeNull()
    const taps = [...beats.slice(0, 6).map((b) => b - 0.02), 2.25, 2.26]
    expect(tapOffset(taps, beats)).toBeCloseTo(-0.02)
  })
})

describe('loopOptions', () => {
  it('uses sections when present', () => {
    const opts = loopOptions({ beatsPerBar: 4, lengthBeats: 64, sections: [{ beat: 16, name: 'Verse' }, { beat: 0, name: 'Intro' }, { beat: 48, name: '' }] })
    expect(opts).toEqual([
      { name: 'Intro', startBeat: 0, endBeat: 16 },
      { name: 'Verse', startBeat: 16, endBeat: 48 },
      { name: 'Section 3', startBeat: 48, endBeat: 64 },
    ])
  })

  it('falls back to 4-bar blocks', () => {
    const opts = loopOptions({ beatsPerBar: 4, lengthBeats: 40 })
    expect(opts.map((o) => [o.startBeat, o.endBeat])).toEqual([[0, 16], [16, 32], [32, 40]])
    expect(opts[1].name).toBe('Bars 5–8')
  })

  it('converts bar ranges', () => {
    expect(barsToRange(4, 3, 4)).toEqual({ name: 'Bars 3–4', startBeat: 8, endBeat: 16 })
    expect(barsToRange(4, 4, 3)).toEqual({ name: 'Bars 3–4', startBeat: 8, endBeat: 16 })
  })
})
