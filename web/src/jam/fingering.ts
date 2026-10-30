import { STRINGS, type StringIndex } from '../music/notes'

export interface Position {
  string: StringIndex
  fret: number
}

const LOWEST = STRINGS[0].midi

/** Brings a pitch into the playable range of a 4-string bass (E1 .. G string fret `maxFret`). */
export function playableMidi(midi: number, maxFret = 12): number {
  const highest = STRINGS[3].midi + maxFret
  let m = midi
  while (m < LOWEST) m += 12
  while (m > highest) m -= 12
  return m
}

function candidates(midi: number, maxFret: number): Position[] {
  const out: Position[] = []
  STRINGS.forEach((s, i) => {
    const fret = midi - s.midi
    if (fret >= 0 && fret <= maxFret) out.push({ string: i as StringIndex, fret })
  })
  return out
}

// Low frets are easiest for a beginner; open strings cost nothing.
const placeCost = (p: Position) => p.fret * 0.35 + p.string * 0.05

// Fretted notes within a 4-fret box need no shift; open strings leave the hand where it is.
function moveCost(a: Position, b: Position, hand: number): number {
  if (b.fret === 0) return 0
  const from = a.fret === 0 ? hand : a.fret
  const d = Math.abs(b.fret - from)
  return Math.max(0, d - 3) * 1.2 + d * 0.08 + Math.abs(a.string - b.string) * 0.05
}

/**
 * Picks string/fret for a melody: prefers low frets, then minimal hand movement (Viterbi
 * over all positions). Out-of-range pitches are octave-shifted into range.
 */
export function assignPositions(midis: number[], maxFret = 12): Position[] {
  if (!midis.length) return []
  const cands = midis.map((m) => candidates(playableMidi(m, maxFret), maxFret))
  // cost[i][j], back[i][j], hand[i][j] = last fretted position on the best path
  let cost = cands[0].map(placeCost)
  let hand = cands[0].map((p) => p.fret)
  const back: number[][] = [cands[0].map(() => -1)]
  for (let i = 1; i < cands.length; i++) {
    const nc: number[] = []
    const nh: number[] = []
    const nb: number[] = []
    for (const b of cands[i]) {
      let best = Infinity
      let arg = 0
      cands[i - 1].forEach((a, k) => {
        const c = cost[k] + moveCost(a, b, hand[k]) + placeCost(b)
        if (c < best) {
          best = c
          arg = k
        }
      })
      nc.push(best)
      nb.push(arg)
      nh.push(b.fret === 0 ? hand[arg] : b.fret)
    }
    cost = nc
    hand = nh
    back.push(nb)
  }
  let j = cost.indexOf(Math.min(...cost))
  const out: Position[] = []
  for (let i = cands.length - 1; i >= 0; i--) {
    out.unshift(cands[i][j])
    j = back[i][j]
  }
  return out
}
