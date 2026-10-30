import { midiToName, sameNoteForgiving } from '../music/notes'
import type { TimedNote } from './chart'

export type Grade = 'perfect' | 'good' | 'miss'

export interface Judgment {
  kind: 'judgment'
  idx: number
  grade: Grade
  /** Positive = late, negative = early (seconds). */
  delta?: number
}

export interface WrongNote {
  kind: 'wrong'
  idx: number
  played: string
  needed: string
}

export interface ScoreSummary {
  perfect: number
  good: number
  miss: number
  total: number
  accuracy: number
  stars: 0 | 1 | 2 | 3
  score: number
  maxCombo: number
}

export interface Windows {
  perfect: number
  good: number
}

export const NORMAL_WINDOWS: Windows = { perfect: 0.05, good: 0.1 }
export const ROOKIE_WINDOWS: Windows = { perfect: 0.1, good: 0.2 }

export function starsFor(accuracy: number): 0 | 1 | 2 | 3 {
  if (accuracy >= 0.92) return 3
  if (accuracy >= 0.75) return 2
  if (accuracy >= 0.5) return 1
  return 0
}

/** Matches played notes against a timed chart. Pure logic: feed it note-ons and the clock. */
export class Scorer {
  readonly notes: TimedNote[]
  readonly grades: (Grade | null)[]
  combo = 0
  maxCombo = 0
  score = 0
  readonly windows: Windows

  constructor(notes: TimedNote[], windows: Windows = NORMAL_WINDOWS) {
    this.notes = notes
    this.windows = windows
    this.grades = notes.map(() => null)
  }

  /** A note was played at time t (already latency-corrected). */
  onNote(midi: number, t: number): Judgment | WrongNote | null {
    let best = -1
    let bestDist = Infinity
    let nearestWrong = -1
    for (const n of this.notes) {
      if (this.grades[n.idx] !== null) continue
      const dist = Math.abs(t - n.time)
      if (dist > this.windows.good) {
        if (n.time > t) break
        continue
      }
      if (sameNoteForgiving(midi, n.midi)) {
        if (dist < bestDist) {
          best = n.idx
          bestDist = dist
        }
      } else if (nearestWrong < 0) nearestWrong = n.idx
    }
    if (best >= 0) {
      const grade: Grade = bestDist <= this.windows.perfect ? 'perfect' : 'good'
      this.grade(best, grade)
      return { kind: 'judgment', idx: best, grade, delta: t - this.notes[best].time }
    }
    if (nearestWrong >= 0) {
      this.combo = 0
      return {
        kind: 'wrong',
        idx: nearestWrong,
        played: midiToName(midi, false),
        needed: midiToName(this.notes[nearestWrong].midi, false),
      }
    }
    return null
  }

  /** First note not yet judged. */
  nextUnjudged(): TimedNote | undefined {
    return this.notes.find((n) => this.grades[n.idx] === null)
  }

  /** Force a judgment (used by wait mode when you finally play the held note). */
  hit(idx: number, grade: Grade): Judgment {
    this.grade(idx, grade)
    return { kind: 'judgment', idx, grade }
  }

  /**
   * Signed offset from t to the nearest unjudged note of the same pitch within maxDist.
   * Lets a session learn latency even when it is too far off for notes to score.
   */
  nearestSamePitchDelta(midi: number, t: number, maxDist: number): number | null {
    let best: number | null = null
    for (const n of this.notes) {
      if (this.grades[n.idx] !== null || !sameNoteForgiving(midi, n.midi)) continue
      const d = t - n.time
      if (Math.abs(d) <= maxDist && (best === null || Math.abs(d) < Math.abs(best))) best = d
    }
    return best
  }

  /** Marks notes whose window has passed as misses. */
  tick(now: number): Judgment[] {
    const out: Judgment[] = []
    for (const n of this.notes) {
      if (n.time + this.windows.good >= now) break
      if (this.grades[n.idx] === null) {
        this.grade(n.idx, 'miss')
        out.push({ kind: 'judgment', idx: n.idx, grade: 'miss' })
      }
    }
    return out
  }

  multiplier(): number {
    return Math.min(4, 1 + Math.floor(this.combo / 8))
  }

  summary(): ScoreSummary {
    const count = (g: Grade) => this.grades.filter((x) => x === g).length
    const perfect = count('perfect')
    const good = count('good')
    const total = this.notes.length
    const accuracy = total ? (perfect + 0.6 * good) / total : 0
    return {
      perfect,
      good,
      miss: total - perfect - good,
      total,
      accuracy,
      stars: starsFor(accuracy),
      score: this.score,
      maxCombo: this.maxCombo,
    }
  }

  private grade(idx: number, grade: Grade) {
    this.grades[idx] = grade
    if (grade === 'miss') {
      this.combo = 0
      return
    }
    this.score += (grade === 'perfect' ? 100 : 60) * this.multiplier()
    this.combo++
    this.maxCombo = Math.max(this.maxCombo, this.combo)
  }
}
