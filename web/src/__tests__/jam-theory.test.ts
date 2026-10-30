import { describe, expect, it } from 'vitest'
import {
  chordIndexAtBar,
  diatonicChords,
  findProgression,
  guideRoot,
  harmonyAtBar,
  keyName,
  noteFit,
  parseRoman,
  PROGRESSIONS,
  progressionChords,
  ROOTS,
  SCALE_IDS,
  scalePcs,
  voiceChord,
  type Key,
} from '../jam/theory'

const C: Key = { tonic: 0, mode: 'major' }
const Am: Key = { tonic: 9, mode: 'minor' }
const names = (pcs: number[]) => pcs.join(',')

describe('scales', () => {
  it('builds the seven scales on any root', () => {
    expect(names(scalePcs(0, 'major'))).toBe('0,2,4,5,7,9,11')
    expect(names(scalePcs(9, 'minor'))).toBe('9,11,0,2,4,5,7')
    expect(names(scalePcs(9, 'minorPent'))).toBe('9,0,2,4,7')
    expect(names(scalePcs(7, 'majorPent'))).toBe('7,9,11,2,4')
    expect(names(scalePcs(4, 'blues'))).toBe('4,7,9,10,11,2')
    expect(names(scalePcs(7, 'mixolydian'))).toBe('7,9,11,0,2,4,5')
    expect(names(scalePcs(2, 'dorian'))).toBe('2,4,5,7,9,11,0')
    expect(SCALE_IDS).toHaveLength(7)
  })

  it('has all 12 roots and spells keys sensibly', () => {
    expect(ROOTS).toHaveLength(12)
    expect(keyName({ tonic: 10, mode: 'major' })).toBe('Bb major')
    expect(keyName({ tonic: 6, mode: 'minor' })).toBe('F# minor')
    expect(keyName({ tonic: 3, mode: 'minor' })).toBe('Eb minor')
    expect(keyName(Am)).toBe('A minor')
  })
})

describe('chords', () => {
  it('lists diatonic triads for major and minor keys', () => {
    expect(diatonicChords(C).map((c) => c.name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°'])
    expect(diatonicChords(Am).map((c) => c.name)).toEqual(['Am', 'B°', 'C', 'Dm', 'Em', 'F', 'G'])
  })

  it('parses roman numerals with sevenths, accidentals and power chords', () => {
    expect(parseRoman('V7', C)).toMatchObject({ name: 'G7', tones: [7, 11, 2, 5] })
    expect(parseRoman('i7', Am)).toMatchObject({ name: 'Am7', tones: [9, 0, 4, 7] })
    expect(parseRoman('IV7', Am).name).toBe('D7')
    expect(parseRoman('bVII5', { tonic: 4, mode: 'major' })).toMatchObject({ name: 'D5', tones: [2, 9] })
    expect(parseRoman('VII', Am).name).toBe('G')
    expect(parseRoman('bVII', { tonic: 5, mode: 'major' }).name).toBe('Eb')
    expect(() => parseRoman('X', C)).toThrow()
  })
})

describe('progressions', () => {
  it('covers every style and all numerals parse', () => {
    for (const [style, list] of Object.entries(PROGRESSIONS)) {
      expect(list.length, style).toBeGreaterThan(0)
      for (const prog of list) for (let t = 0; t < 12; t++) expect(progressionChords(prog, t)).toHaveLength(prog.romans.length)
    }
  })

  it('12-bar blues in A', () => {
    const blues = findProgression('blues-12')!
    expect(progressionChords(blues, 9).map((c) => c.name).join(' ')).toBe('A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7')
    const quick = findProgression('blues-quick')!
    expect(progressionChords(quick, 9).map((c) => c.name).join(' ')).toBe('A7 D7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7')
  })

  it('rock axis in E and minor groove in A', () => {
    expect(progressionChords(findProgression('rock-axis')!, 4).map((c) => c.name)).toEqual(['E', 'B', 'C#m', 'A'])
    expect(progressionChords(findProgression('groove-aeolian')!, 9).map((c) => c.name)).toEqual(['Am', 'F', 'C', 'G'])
    expect(progressionChords(findProgression('funk-two')!, 4).map((c) => c.name)).toEqual(['Em7', 'A7'])
  })

  it('finds the chord slot for a bar, looping', () => {
    const prog = findProgression('rock-axis')!
    expect([0, 1, 2, 3, 4, 7].map((b) => chordIndexAtBar(b, prog, 1))).toEqual([0, 1, 2, 3, 0, 3])
    expect([0, 1, 2, 3, 8].map((b) => chordIndexAtBar(b, prog, 2))).toEqual([0, 0, 1, 1, 0])
  })

  it('reports the next chord and when it arrives', () => {
    const prog = findProgression('reggae-two')!
    expect(harmonyAtBar(0, prog, 7, 2)).toMatchObject({ chord: { name: 'G' }, next: { name: 'C' }, barsToNext: 2 })
    expect(harmonyAtBar(1, prog, 7, 2).barsToNext).toBe(1)
    const vamp = findProgression('funk-vamp')!
    expect(harmonyAtBar(5, vamp, 9).barsToNext).toBeNull()
    // Repeated chords in a row are skipped: quick-change bars 2-3 are both I7 after bar 1's IV7.
    expect(harmonyAtBar(2, findProgression('blues-quick')!, 9, 1)).toMatchObject({ next: { name: 'D7' }, barsToNext: 2 })
    expect(harmonyAtBar(0, findProgression('blues-12')!, 9, 1)).toMatchObject({ next: { name: 'D7' }, barsToNext: 4 })
  })
})

describe('fit, voicing, guide bass', () => {
  it('rates how "inside" a note is', () => {
    const am7 = parseRoman('i7', Am)
    const scale = scalePcs(9, 'minorPent')
    expect(noteFit(45, am7, scale)).toBe('root')
    expect(noteFit(36, am7, scale)).toBe('chord')
    expect(noteFit(38, am7, scale)).toBe('scale')
    expect(noteFit(37, am7, scale)).toBe('outside')
  })

  it('voices chords above the detector range and guide roots low', () => {
    const g7 = parseRoman('V7', C)
    expect(voiceChord(g7)).toEqual([67, 71, 74, 77])
    expect(voiceChord(parseRoman('I', C))).toEqual([60, 64, 67])
    expect(guideRoot(g7)).toBe(31)
    expect(guideRoot(parseRoman('I', { tonic: 3, mode: 'major' }))).toBe(39)
  })
})
