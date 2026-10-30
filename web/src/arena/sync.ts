import { beatToSec, type Chart } from '../game/chart'

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Maps song (media) seconds onto the AudioContext clock.
 * HTMLMediaElement.currentTime is coarse and jittery, so we keep a rolling median of
 * (ctxTime - mediaTime / rate): the ctx time at which media second 0 would have played.
 */
export class ClockEstimator {
  private samples: number[] = []
  private size: number
  private rate = 1
  private zero: number | null = null

  constructor(size = 31) {
    this.size = size
  }

  /** Forget everything (after a seek or a rate change). Optionally seed with a guess. */
  reset(rate: number, guessZero: number | null = null) {
    this.samples = []
    this.rate = rate
    this.zero = guessZero
  }

  push(ctxTime: number, mediaTime: number) {
    this.samples.push(ctxTime - mediaTime / this.rate)
    if (this.samples.length > this.size) this.samples.shift()
    this.zero = median(this.samples)
  }

  get ready(): boolean {
    return this.zero !== null
  }

  get sampleCount(): number {
    return this.samples.length
  }

  /** Context time at which media second `songSec` plays (before output latency). */
  toCtx(songSec: number): number {
    return (this.zero ?? 0) + songSec / this.rate
  }

  toSong(ctxTime: number): number {
    return (ctxTime - (this.zero ?? 0)) * this.rate
  }
}

/** Media second at which `beat` sounds: offsetSec is where beat 0 lands in the audio. */
export function beatToSongSec(chart: Pick<Chart, 'bpm' | 'tempoMap'>, offsetSec: number, beat: number): number {
  return offsetSec + beatToSec(chart, beat, 1)
}

/**
 * Tap-along sync. Given tap times (ctx clock, already minus output latency) and the
 * scheduled beat times, returns how many seconds (ctx clock) the chart grid should move
 * later to match the taps — the median of each tap's distance to its nearest beat.
 * Null if there aren't enough usable taps.
 */
export function tapOffset(taps: number[], beatTimes: number[], minTaps = 6): number | null {
  if (beatTimes.length < 2) return null
  const deltas: number[] = []
  for (const tap of taps) {
    let i = 0
    for (let k = 1; k < beatTimes.length; k++) if (Math.abs(tap - beatTimes[k]) < Math.abs(tap - beatTimes[i])) i = k
    const gap = i + 1 < beatTimes.length ? beatTimes[i + 1] - beatTimes[i] : beatTimes[i] - beatTimes[i - 1]
    const delta = tap - beatTimes[i]
    // A tap more than ~40% of a beat from the nearest beat is ambiguous: ignore it.
    if (Math.abs(delta) < gap * 0.4) deltas.push(delta)
  }
  return deltas.length >= minTaps ? median(deltas) : null
}

export interface LoopRange {
  name: string
  startBeat: number
  endBeat: number
}

/** Loop choices: the song's sections if it has them, else 4-bar blocks. */
export function loopOptions(chart: Pick<Chart, 'beatsPerBar' | 'lengthBeats' | 'sections'>, barsPerBlock = 4): LoopRange[] {
  const end = chart.lengthBeats
  const secs = [...(chart.sections ?? [])].filter((s) => s.beat < end).sort((a, b) => a.beat - b.beat)
  if (secs.length) {
    return secs.map((s, i) => ({
      name: s.name || `Section ${i + 1}`,
      startBeat: s.beat,
      endBeat: i + 1 < secs.length ? secs[i + 1].beat : end,
    })).filter((r) => r.endBeat > r.startBeat)
  }
  const block = chart.beatsPerBar * barsPerBlock
  const out: LoopRange[] = []
  for (let b = 0; b < end; b += block) {
    const bar = b / chart.beatsPerBar + 1
    out.push({ name: `Bars ${bar}–${bar + barsPerBlock - 1}`, startBeat: b, endBeat: Math.min(end, b + block) })
  }
  return out
}

/** Bar range (1-based, inclusive) to beats. */
export function barsToRange(beatsPerBar: number, fromBar: number, toBar: number): LoopRange {
  const a = Math.max(1, Math.min(fromBar, toBar))
  const b = Math.max(fromBar, toBar)
  return { name: `Bars ${a}–${b}`, startBeat: (a - 1) * beatsPerBar, endBeat: b * beatsPerBar }
}

/** Extra slack after the scorer has finalised the last note before a loop pass restarts. */
export const LOOP_TAIL_SEC = 0.05

/**
 * A loop pass is over once the scorer (which runs at ctx time minus input latency) has had the
 * full good window after the loop end, so a late but valid hit on the last note still counts.
 */
export function loopPassOver(now: number, latencySec: number, endAt: number, goodWindow: number): boolean {
  return now - latencySec > endAt + goodWindow + LOOP_TAIL_SEC
}

/**
 * Where to seek a lagging stem so it lands in step with the master: the master keeps playing
 * while the seek runs, so aim ahead by the last measured seek cost (ctx seconds × rate).
 */
export function stemSeekTarget(masterPos: number, seekCostSec: number, rate: number): number {
  return masterPos + Math.min(0.5, Math.max(0, seekCostSec)) * rate
}
