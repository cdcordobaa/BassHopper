import { describe, expect, it } from 'vitest'
import { NoteTracker, type PitchFrame } from '../audio/NoteTracker'
import { midiToFreq } from '../music/notes'

const dt = 128 / 12000

function frames(spec: { midi: number | null; n: number; rms: number }[]): PitchFrame[] {
  const out: PitchFrame[] = []
  let t = 0
  for (const s of spec) {
    for (let i = 0; i < s.n; i++) {
      out.push({ time: (t += dt), freq: s.midi === null ? null : midiToFreq(s.midi), clarity: s.midi === null ? 0 : 0.95, rms: s.rms })
    }
  }
  return out
}

describe('NoteTracker', () => {
  it('emits one note-on per stable note and note-off on silence', () => {
    const tr = new NoteTracker(() => 0.01, 0.064, dt)
    const evs = frames([
      { midi: null, n: 5, rms: 0.001 },
      { midi: 28, n: 20, rms: 0.2 },
      { midi: null, n: 6, rms: 0.001 },
    ]).flatMap((f) => tr.push(f))
    expect(evs.map((e) => [e.type, e.midi])).toEqual([
      ['on', 28],
      ['off', 28],
    ])
    // onset taken from the attack frame, before pitch became stable
    expect(evs[0].time).toBeLessThan(6 * dt)
  })

  it('detects a re-pluck of the same note from the volume jump', () => {
    const tr = new NoteTracker(() => 0.01, 0.064, dt)
    const evs = frames([
      { midi: null, n: 3, rms: 0.001 },
      { midi: 33, n: 15, rms: 0.2 },
      { midi: 33, n: 15, rms: 0.05 },
      { midi: 33, n: 10, rms: 0.3 },
    ]).flatMap((f) => tr.push(f))
    expect(evs.filter((e) => e.type === 'on')).toHaveLength(2)
  })

  it('ignores a short glitch', () => {
    const tr = new NoteTracker(() => 0.01, 0.064, dt)
    const evs = frames([
      { midi: null, n: 3, rms: 0.001 },
      { midi: 40, n: 2, rms: 0.2 },
      { midi: null, n: 3, rms: 0.001 },
    ]).flatMap((f) => tr.push(f))
    expect(evs).toHaveLength(0)
  })
})
