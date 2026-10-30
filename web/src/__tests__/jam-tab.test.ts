import { describe, expect, it } from 'vitest'
import { chartToTab, type Chart } from '../game/chart'
import { riffTab } from '../jam/tab'

const chart = (notes: Chart['notes']): Chart => ({ id: 'x', title: 'x', bpm: 100, beatsPerBar: 4, notes, lengthBeats: 4 })

describe('riffTab', () => {
  it('uses chartToTab for 8th-note riffs', () => {
    const c = chart([{ t: 0, dur: 0.5, string: 0, fret: 3 }, { t: 1.5, dur: 0.5, string: 1, fret: 5 }])
    expect(riffTab(c, 4)).toEqual(chartToTab(c, 4))
  })

  it('keeps two 16ths on one string in separate columns', () => {
    const c = chart([{ t: 0.25, dur: 0.25, string: 0, fret: 3 }, { t: 0.5, dur: 0.25, string: 0, fret: 5 }])
    const e = riffTab(c, 4).find((l) => l.startsWith('E|'))!
    expect(e).toBe('E|--3-5-' + '--'.repeat(13) + '|')
  })
})
