import type { StyleId } from './theory'

/** 16 steps per 4/4 bar. A pattern string uses one char per step: x = hit, o = soft hit, . = rest. */
export interface DrumPattern {
  kick: string
  snare: string
  hat: string
  openHat?: string
}

/** Chord comping: [step, length in steps] pairs within one bar. */
export type Comp = [number, number][]

export interface Style {
  id: StyleId
  name: string
  emoji: string
  bpm: number
  /** 0 = straight; 0.33 ≈ triplet shuffle (delays the off-beat 8th). */
  swing: number
  drums: DrumPattern
  comp: Comp
  /** Chord sound flavour. */
  tone: 'pad' | 'keys' | 'guitar'
}

export const STYLES: Style[] = [
  {
    id: 'rock', name: 'Rock', emoji: '🤘', bpm: 96, swing: 0, tone: 'guitar',
    drums: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    comp: [[0, 6], [6, 2], [8, 8]],
  },
  {
    id: 'blues', name: 'Blues', emoji: '🎷', bpm: 80, swing: 0.33, tone: 'keys',
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    comp: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
  },
  {
    id: 'funk', name: 'Funk', emoji: '🕺', bpm: 96, swing: 0, tone: 'guitar',
    drums: { kick: 'x..x......x..x..', snare: '....x..o.o..x..o', hat: 'xoxoxoxoxoxoxoxo', openHat: '..............x.' },
    comp: [[2, 1], [5, 1], [7, 1], [10, 1], [13, 1]],
  },
  {
    id: 'pop', name: 'Pop', emoji: '✨', bpm: 100, swing: 0, tone: 'pad',
    drums: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    comp: [[0, 16]],
  },
  {
    id: 'punk', name: 'Punk', emoji: '⚡', bpm: 150, swing: 0, tone: 'guitar',
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    comp: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
  },
  {
    id: 'groove', name: 'Minor groove', emoji: '🌙', bpm: 88, swing: 0, tone: 'pad',
    drums: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.xox.xox.xox.xo' },
    comp: [[0, 8], [8, 8]],
  },
  {
    id: 'reggae', name: 'Reggae', emoji: '🌴', bpm: 76, swing: 0.15, tone: 'keys',
    drums: { kick: '........x.......', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.' },
    comp: [[2, 1], [6, 1], [10, 1], [14, 1]],
  },
]

export function findStyle(id: StyleId): Style {
  return STYLES.find((s) => s.id === id) ?? STYLES[0]
}

/** Velocity for a step in a pattern lane, or 0 for a rest. */
export function hitAt(lane: string | undefined, step: number): number {
  const ch = lane?.[step % 16]
  return ch === 'x' ? 1 : ch === 'o' ? 0.45 : 0
}

/** Offset (in steps) applied to a step's sound by swing: only the off-beat 8th moves. */
export function swingOffset(step: number, swing: number): number {
  return step % 4 === 2 ? swing * 2 : 0
}
