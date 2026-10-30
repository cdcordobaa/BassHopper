import type { Chart } from '../game/chart'
import { assignPositions } from './fingering'
import type { QNote } from './quantize'
import type { Mode, ScaleId, StyleId } from './theory'

/** The jam a riff came from, so it can be played back over the same band. */
export interface JamMeta {
  style: StyleId
  progressionId: string
  tonic: number
  mode: Mode
  scale: ScaleId
  barsPerChord: number
  /** Bar within the progression cycle where the riff's first bar sat. */
  startBar: number
}

/** A Chart that remembers the jam it was recorded in. Still a plain Chart for highway/scorer. */
export type RiffChart = Chart & { jam?: JamMeta }

export interface Riff {
  id: string
  name: string
  createdAt: number
  chart: RiffChart
}

const KEY = 'bh.riffs.v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>

const defaultStore = (): Store => globalThis.localStorage

export function loadRiffs(store: Store = defaultStore()): Riff[] {
  try {
    const raw = JSON.parse(store.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? (raw as Riff[]).filter((r) => r && typeof r.id === 'string' && r.chart) : []
  } catch {
    return []
  }
}

function write(riffs: Riff[], store: Store) {
  store.setItem(KEY, JSON.stringify(riffs))
}

export function addRiff(riff: Riff, store: Store = defaultStore()): Riff[] {
  const next = [riff, ...loadRiffs(store).filter((r) => r.id !== riff.id)]
  write(next, store)
  return next
}

export function renameRiff(id: string, name: string, store: Store = defaultStore()): Riff[] {
  const clean = name.trim()
  const next = loadRiffs(store).map((r) =>
    r.id === id && clean ? { ...r, name: clean, chart: { ...r.chart, title: clean } } : r,
  )
  write(next, store)
  return next
}

export function deleteRiff(id: string, store: Store = defaultStore()): Riff[] {
  const next = loadRiffs(store).filter((r) => r.id !== id)
  write(next, store)
  return next
}

/** Builds a highway-ready chart from quantized notes, with bass-friendly fingering. */
export function riffChart(opts: {
  id: string
  title: string
  bpm: number
  beatsPerBar: number
  bars: number
  notes: QNote[]
  jam?: JamMeta
}): RiffChart {
  const pos = assignPositions(opts.notes.map((n) => n.midi))
  return {
    id: opts.id,
    title: opts.title,
    bpm: Math.round(opts.bpm),
    beatsPerBar: opts.beatsPerBar,
    notes: opts.notes.map((n, i) => ({ t: n.t, dur: n.dur, string: pos[i].string, fret: pos[i].fret })),
    lengthBeats: opts.bars * opts.beatsPerBar,
    ...(opts.jam ? { jam: opts.jam } : {}),
  }
}

/** Repeats a chart `times` times back to back (practice loops). */
export function loopChart<C extends Chart>(chart: C, times: number): C {
  const notes = Array.from({ length: times }, (_, k) => chart.notes.map((n) => ({ ...n, t: n.t + k * chart.lengthBeats }))).flat()
  return { ...chart, notes, lengthBeats: chart.lengthBeats * times }
}

export function newRiffId(now = Date.now()): string {
  return `riff-${now.toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`
}
