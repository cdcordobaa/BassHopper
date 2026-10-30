import { describe, expect, it } from 'vitest'
import { detectPitch } from '../audio/pitch'
import { freqToMidiFloat, midiToFreq } from '../music/notes'

const RATE = 12000
const N = 768

function tone(freq: number, harmonics: number[] = [1], phase = 0.3): Float32Array {
  const buf = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let v = 0
    harmonics.forEach((amp, h) => (v += amp * Math.sin(2 * Math.PI * freq * (h + 1) * (i / RATE) + phase * h)))
    buf[i] = v * 0.3
  }
  return buf
}

describe('detectPitch', () => {
  it.each([28, 33, 38, 43, 50, 55, 62])('finds MIDI %i (pure sine)', (midi) => {
    const p = detectPitch(tone(midiToFreq(midi)), RATE)
    expect(p).not.toBeNull()
    expect(Math.round(freqToMidiFloat(p!.freq))).toBe(midi)
    expect(p!.clarity).toBeGreaterThan(0.9)
  })

  it('does not jump an octave on a strong 2nd harmonic (typical bass tone)', () => {
    const f = midiToFreq(33) // open A, 55 Hz
    const p = detectPitch(tone(f, [1, 1.6, 0.8, 0.5, 0.3]), RATE)
    expect(Math.round(freqToMidiFloat(p!.freq))).toBe(33)
  })

  it('is accurate to within a few cents', () => {
    const f = midiToFreq(28)
    const p = detectPitch(tone(f, [1, 0.7, 0.4]), RATE)
    const cents = (freqToMidiFloat(p!.freq) - 28) * 100
    expect(Math.abs(cents)).toBeLessThan(5)
  })

  it('returns low clarity or null for noise', () => {
    const buf = new Float32Array(N)
    let seed = 1
    for (let i = 0; i < N; i++) {
      seed = (seed * 16807) % 2147483647
      buf[i] = seed / 2147483647 - 0.5
    }
    const p = detectPitch(buf, RATE)
    expect(p === null || p.clarity < 0.8).toBe(true)
  })

  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(N), RATE)).toBeNull()
  })
})
