import { describe, expect, it } from 'vitest'
import { chartToTab, timeChart } from '../game/chart'
import { addRiff, deleteRiff, loadRiffs, newRiffId, renameRiff, riffChart, type Riff } from '../jam/riffs'

function memStore() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

const chart = riffChart({
  id: 'r1',
  title: 'Funky',
  bpm: 95.6,
  beatsPerBar: 4,
  bars: 1,
  notes: [
    { t: 0, dur: 1, midi: 33 },
    { t: 1.5, dur: 0.5, midi: 36 },
    { t: 3, dur: 1, midi: 38 },
  ],
  jam: { style: 'funk', progressionId: 'funk-vamp', tonic: 9, mode: 'minor', scale: 'dorian', barsPerChord: 4, startBar: 0 },
})

describe('riffChart', () => {
  it('builds a playable chart with fingering and jam info', () => {
    expect(chart.bpm).toBe(96)
    expect(chart.lengthBeats).toBe(4)
    expect(chart.notes.map((n) => [n.t, n.string, n.fret])).toEqual([
      [0, 1, 0],
      [1.5, 1, 3],
      [3, 2, 0],
    ])
    expect(chart.jam?.style).toBe('funk')
    expect(timeChart(chart, 0, 60, 0).map((n) => n.midi)).toEqual([33, 36, 38])
    expect(chartToTab(chart).join('\n')).toContain('A|0-----3-')
  })
})

describe('riff storage', () => {
  it('adds, renames, deletes and survives junk', () => {
    const s = memStore()
    expect(loadRiffs(s)).toEqual([])
    const riff: Riff = { id: 'r1', name: 'Funky', createdAt: 1, chart }
    addRiff(riff, s)
    addRiff({ ...riff, id: 'r2', name: 'Second' }, s)
    expect(loadRiffs(s).map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(s.m.has('bh.riffs.v1')).toBe(true)
    renameRiff('r1', '  Slap  ', s)
    const r1 = loadRiffs(s).find((r) => r.id === 'r1')!
    expect(r1.name).toBe('Slap')
    expect(r1.chart.title).toBe('Slap')
    renameRiff('r1', '   ', s)
    expect(loadRiffs(s).find((r) => r.id === 'r1')!.name).toBe('Slap')
    deleteRiff('r2', s)
    expect(loadRiffs(s).map((r) => r.id)).toEqual(['r1'])
    s.setItem('bh.riffs.v1', '{oops')
    expect(loadRiffs(s)).toEqual([])
    expect(newRiffId(1)).not.toBe(newRiffId(1))
  })
})
