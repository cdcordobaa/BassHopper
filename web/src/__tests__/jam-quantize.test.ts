import { describe, expect, it } from 'vitest'
import { assignPositions, playableMidi } from '../jam/fingering'
import { BeatGrid } from '../jam/grid'
import { quantize, saveWindow } from '../jam/quantize'
import { JamRecorder } from '../jam/recorder'

describe('quantize', () => {
  const rec = (...xs: [number, number, number][]) => xs.map(([midi, start, end]) => ({ midi, start, end }))

  it('snaps to an 8th grid relative to the window', () => {
    const q = quantize(rec([33, 8.04, 8.9], [36, 9.47, 9.8], [38, 10.9, 12.2]), 8, 12, 8)
    expect(q).toEqual([
      { t: 0, dur: 1, midi: 33 },
      { t: 1.5, dur: 0.5, midi: 36 },
      { t: 3, dur: 1, midi: 38 },
    ])
  })

  it('snaps to 16ths and keeps a minimum of one slot', () => {
    const q = quantize(rec([40, 0.26, 0.27], [41, 0.74, 1.3]), 0, 4, 16)
    expect(q).toEqual([
      { t: 0.25, dur: 0.25, midi: 40 },
      { t: 0.75, dur: 0.5, midi: 41 },
    ])
  })

  it('drops notes outside the window and duplicate slots, trims overlaps', () => {
    const q = quantize(rec([27, -0.4, 0.2], [28, -0.2, 0.5], [30, 3.9, 4.5], [33, 1.0, 3.0], [34, 1.1, 1.2], [35, 2.0, 2.5]), 0, 4, 8)
    expect(q).toEqual([
      { t: 0, dur: 0.5, midi: 28 },
      { t: 1, dur: 1, midi: 33 },
      { t: 2, dur: 0.5, midi: 35 },
    ])
  })

  it('picks the save window by how far into the bar we are', () => {
    expect(saveWindow(17, 2, 4)).toEqual({ from: 8, to: 16 })
    expect(saveWindow(19, 2, 4)).toEqual({ from: 12, to: 20 })
    expect(saveWindow(19, 1, 4)).toEqual({ from: 16, to: 20 })
  })
})

describe('fingering', () => {
  const fmt = (ps: { string: number; fret: number }[]) => ps.map((p) => `${'EADG'[p.string]}${p.fret}`).join(' ')

  it('prefers open strings and low frets', () => {
    expect(fmt(assignPositions([28, 33, 38, 43]))).toBe('E0 A0 D0 G0')
    expect(fmt(assignPositions([36, 38, 40]))).toBe('A3 D0 D2')
  })

  it('keeps the hand in one box instead of jumping', () => {
    expect(fmt(assignPositions([33, 36, 38, 40, 43, 45]))).toBe('A0 A3 D0 D2 G0 G2')
    // A2 alone would be G2, but A2–E3–A2 stays in the 7th-fret box rather than jumping G2→G9→G2.
    expect(fmt(assignPositions([45, 52, 45]))).toBe('D7 G9 D7')
  })

  it('octave-shifts unplayable pitches into range', () => {
    expect(playableMidi(20)).toBe(32)
    expect(playableMidi(70)).toBe(46)
    expect(assignPositions([])).toEqual([])
  })
})

describe('grid', () => {
  it('maps time and beats both ways and survives a tempo change', () => {
    const g = new BeatGrid(10, 120)
    expect(g.beatAt(11)).toBe(2)
    expect(g.timeAt(4)).toBe(12)
    g.setTempo(60, 8)
    expect(g.timeAt(8)).toBe(14)
    expect(g.timeAt(9)).toBe(15)
    expect(g.beatAt(13)).toBe(6)
    expect(g.beatAt(16)).toBe(10)
    expect(g.beatAt(9)).toBe(-2)
    expect(g.bpm).toBe(60)
  })
})

describe('recorder', () => {
  it('records monophonic notes and closes them on the next note', () => {
    const r = new JamRecorder()
    r.on(33, 0)
    r.on(36, 1)
    r.off(1.5)
    r.on(38, 2)
    expect(r.notes).toEqual([
      { midi: 33, start: 0, end: 1 },
      { midi: 36, start: 1, end: 1.5 },
      { midi: 38, start: 2, end: null },
    ])
    expect(r.snapshot(3)[2].end).toBe(3)
    expect(r.notes[2].end).toBeNull()
  })

  it('forgets notes older than its history', () => {
    const r = new JamRecorder(8)
    r.on(28, 0)
    r.on(30, 1)
    r.off(2)
    r.on(31, 20)
    expect(r.notes.map((n) => n.midi)).toEqual([31])
  })
})
