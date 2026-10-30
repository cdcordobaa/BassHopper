export interface BassString {
  name: string
  midi: number
  color: string
}

// Standard 4-string tuning, low to high. Index 0 = E (thickest).
export const STRINGS: readonly BassString[] = [
  { name: 'E', midi: 28, color: '#ff4d6d' },
  { name: 'A', midi: 33, color: '#ffb703' },
  { name: 'D', midi: 38, color: '#3ddc97' },
  { name: 'G', midi: 43, color: '#4cc9f0' },
]

export type StringIndex = 0 | 1 | 2 | 3

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToName(midi: number, withOctave = true): string {
  const name = NAMES[((midi % 12) + 12) % 12]
  return withOctave ? `${name}${Math.floor(midi / 12) - 1}` : name
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function freqToMidiFloat(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440)
}

export function positionToMidi(string: StringIndex, fret: number): number {
  return STRINGS[string].midi + fret
}

export function positionsForMidi(midi: number, maxFret = 12): { string: StringIndex; fret: number }[] {
  const out: { string: StringIndex; fret: number }[] = []
  STRINGS.forEach((s, i) => {
    const fret = midi - s.midi
    if (fret >= 0 && fret <= maxFret) out.push({ string: i as StringIndex, fret })
  })
  return out
}

/** Pitch is "the same note" if equal or off by exactly one octave (common bass harmonic error). */
export function sameNoteForgiving(a: number, b: number): boolean {
  const d = Math.abs(a - b)
  return d === 0 || d === 12
}
