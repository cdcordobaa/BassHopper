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
  it('finds middle C and the 24th fret on G with a real bass tone', () => {
    for (const midi of [60, 64, 67]) {
      const p = detectPitch(tone(midiToFreq(midi), [1, 0.7, 0.4]), RATE)
      expect(Math.round(freqToMidiFloat(p!.freq))).toBe(midi)
    }
  })

  it.each([28, 33, 38, 43, 50, 55, 60, 62, 67])('finds MIDI %i (pure sine)', (midi) => {
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

describe('detectPitch range', () => {
  it('rejects sounds above the bass range instead of reporting a lower octave', () => {
    // E5 (659 Hz) would otherwise be reported as E4 via its second period.
    expect(detectPitch(tone(midiToFreq(76), [1, 0.5, 0.3]), RATE)).toBeNull()
  })
})

describe('band bleed', () => {
  // The backing band's chord stabs (root + octave + octave-fifth, roots C5..B5) leak into the mic.
  // After the engine's 1200 Hz low-pass, none of them may read as a bass note.
  it.each(Array.from({ length: 12 }, (_, i) => 72 + i))('ignores a chord stab on MIDI %i', (root) => {
    const buf = new Float32Array(N)
    for (const iv of [0, 12, 19]) {
      const f = midiToFreq(root + iv)
      for (let h = 1; h * f < 1200; h++)
        for (let i = 0; i < N; i++) buf[i] += (0.3 / h) * Math.sin(2 * Math.PI * f * h * (i / RATE) + iv)
    }
    expect(detectPitch(buf, RATE)).toBeNull()
  })
})
