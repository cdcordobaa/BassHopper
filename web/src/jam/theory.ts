/** Pure music theory for the Jam Room: keys, scales, chords, Roman-numeral progressions. */

export type Mode = 'major' | 'minor'

export interface Key {
  /** Pitch class 0..11, C = 0. */
  tonic: number
  mode: Mode
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/** The 12 roots as shown in pickers (common spellings). */
export const ROOTS: readonly { pc: number; name: string }[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
].map((name, pc) => ({ pc, name }))

export const pc = (midi: number) => ((midi % 12) + 12) % 12

// Major keys spelled with flats, and minor keys spelled with flats (relative minors of those).
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6])
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3])

export function prefersFlats(key: Key): boolean {
  return (key.mode === 'major' ? FLAT_MAJOR : FLAT_MINOR).has(key.tonic)
}

export function pcName(p: number, flats = false): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pc(p)]
}

export function keyName(key: Key): string {
  return `${pcName(key.tonic, prefersFlats(key))} ${key.mode}`
}

export type ScaleId = 'major' | 'minor' | 'majorPent' | 'minorPent' | 'blues' | 'mixolydian' | 'dorian'

export const SCALES: Record<ScaleId, { name: string; intervals: readonly number[] }> = {
  major: { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  majorPent: { name: 'Major pentatonic', intervals: [0, 2, 4, 7, 9] },
  minorPent: { name: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10] },
  blues: { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
  mixolydian: { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  dorian: { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
}

export const SCALE_IDS = Object.keys(SCALES) as ScaleId[]

/** Pitch classes of a scale built on `tonic`, in scale order. */
export function scalePcs(tonic: number, scale: ScaleId): number[] {
  return SCALES[scale].intervals.map((i) => pc(tonic + i))
}

export type Quality = 'maj' | 'min' | 'dim' | '7' | 'm7' | 'maj7' | '5'

const QUALITY_INTERVALS: Record<Quality, readonly number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  '5': [0, 7],
}

const QUALITY_SUFFIX: Record<Quality, string> = { maj: '', min: 'm', dim: '°', '7': '7', m7: 'm7', maj7: 'maj7', '5': '5' }

export interface Chord {
  root: number
  quality: Quality
  /** Pitch classes, root first. */
  tones: number[]
  /** e.g. "Am7" */
  name: string
  /** e.g. "i7" */
  roman: string
}

export function chordTones(root: number, quality: Quality): number[] {
  return QUALITY_INTERVALS[quality].map((i) => pc(root + i))
}

export function makeChord(root: number, quality: Quality, roman: string, flats = false): Chord {
  return { root: pc(root), quality, tones: chordTones(root, quality), name: pcName(root, flats) + QUALITY_SUFFIX[quality], roman }
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
const MODE_SCALE: Record<Mode, ScaleId> = { major: 'major', minor: 'minor' }

/**
 * Parses a Roman numeral relative to the key's own scale: in a minor key "VII" is the
 * natural-minor 7th (G in A minor), "bVII" in a major key is the flat 7th.
 * Upper case = major, lower case = minor; suffixes: 7, maj7, °/dim, 5.
 */
export function parseRoman(roman: string, key: Key): Chord {
  const m = /^([b#]?)([IV]+|[iv]+)(°|dim|maj7|7|5)?$/.exec(roman)
  if (!m) throw new Error(`Bad roman numeral "${roman}"`)
  const [, acc, num, suffix] = m
  const degree = NUMERALS.indexOf(num.toUpperCase())
  if (degree < 0) throw new Error(`Bad roman numeral "${roman}"`)
  const upper = num === num.toUpperCase()
  const shift = acc === 'b' ? -1 : acc === '#' ? 1 : 0
  const root = pc(key.tonic + SCALES[MODE_SCALE[key.mode]].intervals[degree] + shift)
  let quality: Quality
  if (suffix === '°' || suffix === 'dim') quality = 'dim'
  else if (suffix === 'maj7') quality = 'maj7'
  else if (suffix === '7') quality = upper ? '7' : 'm7'
  else if (suffix === '5') quality = '5'
  else quality = upper ? 'maj' : 'min'
  return makeChord(root, quality, roman, prefersFlats(key))
}

/** The seven diatonic triads of a key, with their Roman numerals. */
export function diatonicChords(key: Key): Chord[] {
  const romans =
    key.mode === 'major'
      ? ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
      : ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']
  return romans.map((r) => parseRoman(r, key))
}

export type StyleId = 'rock' | 'blues' | 'funk' | 'pop' | 'punk' | 'groove' | 'reggae'

export interface Progression {
  id: string
  name: string
  mode: Mode
  /** One entry per chord slot; each slot lasts `barsPerChord` bars. */
  romans: string[]
  barsPerChord: number
  /** The friendliest scale to suggest over it. */
  scale: ScaleId
}

const p = (id: string, name: string, mode: Mode, romans: string, barsPerChord: number, scale: ScaleId): Progression => ({
  id,
  name,
  mode,
  romans: romans.split(' '),
  barsPerChord,
  scale,
})

export const PROGRESSIONS: Record<StyleId, Progression[]> = {
  rock: [
    p('rock-axis', 'I–V–vi–IV', 'major', 'I V vi IV', 1, 'majorPent'),
    p('rock-classic', 'I–IV–V–IV', 'major', 'I IV V IV', 1, 'majorPent'),
    p('rock-minor', 'i–VI–VII', 'minor', 'i i VI VII', 1, 'minorPent'),
  ],
  blues: [
    p('blues-12', '12-bar blues', 'major', 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 1, 'minorPent'),
    p('blues-quick', 'Quick-change 12-bar', 'major', 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 1, 'mixolydian'),
  ],
  funk: [
    p('funk-vamp', 'i7 vamp', 'minor', 'i7', 4, 'dorian'),
    p('funk-two', 'i7–IV7', 'minor', 'i7 IV7', 2, 'dorian'),
  ],
  pop: [
    p('pop-50s', 'I–vi–IV–V', 'major', 'I vi IV V', 1, 'major'),
    p('pop-sad', 'vi–IV–I–V', 'major', 'vi IV I V', 1, 'major'),
  ],
  punk: [
    p('punk-three', 'I–IV–V', 'major', 'I5 IV5 V5 V5', 1, 'majorPent'),
    p('punk-b7', 'I–bVII–IV', 'major', 'I5 bVII5 IV5 IV5', 1, 'mixolydian'),
  ],
  groove: [
    p('groove-aeolian', 'i–VI–III–VII', 'minor', 'i VI III VII', 1, 'minor'),
    p('groove-iv', 'i–iv–v', 'minor', 'i iv v i', 1, 'minorPent'),
  ],
  reggae: [
    p('reggae-two', 'I–IV', 'major', 'I IV', 2, 'majorPent'),
    p('reggae-v', 'I–V', 'major', 'I V', 2, 'majorPent'),
  ],
}

export function findProgression(id: string): Progression | undefined {
  for (const list of Object.values(PROGRESSIONS)) {
    const found = list.find((x) => x.id === id)
    if (found) return found
  }
  return undefined
}

export function progressionChords(prog: Progression, tonic: number): Chord[] {
  const key: Key = { tonic, mode: prog.mode }
  return prog.romans.map((r) => parseRoman(r, key))
}

/** Which chord slot is playing in a given bar of a repeating progression. */
export function chordIndexAtBar(bar: number, prog: Progression, barsPerChord = prog.barsPerChord): number {
  const n = prog.romans.length
  const slot = Math.floor(bar / Math.max(1, barsPerChord))
  return ((slot % n) + n) % n
}

export type NoteFit = 'root' | 'chord' | 'scale' | 'outside'

/** How a played pitch relates to the current harmony. Never "wrong", just how "inside" it sits. */
export function noteFit(midi: number, chord: Chord, scale: number[]): NoteFit {
  const c = pc(midi)
  if (c === chord.root) return 'root'
  if (chord.tones.includes(c)) return 'chord'
  if (scale.includes(c)) return 'scale'
  return 'outside'
}

export interface Harmony {
  slot: number
  chord: Chord
  next: Chord
  /** Bars until the chord changes (1 = next bar), or null for a one-chord vamp. */
  barsToNext: number | null
}

/** Current and upcoming chord for a bar of a looping progression. */
export function harmonyAtBar(bar: number, prog: Progression, tonic: number, barsPerChord = prog.barsPerChord): Harmony {
  const chords = progressionChords(prog, tonic)
  const slot = chordIndexAtBar(bar, prog, barsPerChord)
  const chord = chords[slot]
  const span = barsPerChord * prog.romans.length
  for (let k = 1; k <= span; k++) {
    const s = chordIndexAtBar(bar + k, prog, barsPerChord)
    if (chords[s].name !== chord.name) return { slot, chord, next: chords[s], barsToNext: k }
  }
  return { slot, chord, next: chord, barsToNext: null }
}

/** Close-position voicing with the root in [low, low+11]; kept above the bass pitch detector's range. */
export function voiceChord(chord: Chord, low = 60): number[] {
  const root = low + pc(chord.root - low)
  return chord.tones.map((t) => root + pc(t - chord.root))
}

/** A soft guide-bass root in the open-string octave (E1..D#2). */
export function guideRoot(chord: Chord): number {
  return 28 + pc(chord.root - 28)
}
