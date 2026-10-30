import { positionToMidi, STRINGS, type StringIndex } from '../music/notes'

/** One note in a chart. Time and duration are in beats. */
export interface ChartNote {
  t: number
  dur: number
  string: StringIndex
  fret: number
}

/** The shared format every source produces: lessons, Guitar Pro imports, transcriptions, your riffs. */
export interface Chart {
  id: string
  title: string
  bpm: number
  beatsPerBar: number
  notes: ChartNote[]
  /** Total length in beats (includes trailing rests). */
  lengthBeats: number
  /** Tempo changes, sorted by beat; the first entry is at beat 0. Absent = constant `bpm`. */
  tempoMap?: TempoPoint[]
  /** Named song sections (verse, chorus…) starting at a beat. */
  sections?: ChartSection[]
}

export interface TempoPoint {
  beat: number
  bpm: number
}

export interface ChartSection {
  beat: number
  name: string
}

export interface TimedNote {
  idx: number
  time: number
  midi: number
  string: StringIndex
  fret: number
}

const STRING_LETTERS: Record<string, StringIndex> = { E: 0, A: 1, D: 2, G: 3 }

/**
 * Compact lesson notation. Tokens are separated by spaces; `|` is ignored (bar marker).
 *   E0   open E          A3   A string, fret 3
 *   -    rest            *0.5 duration suffix in beats (default = `step`)
 *   (…)x2 repeat a group
 * Example: "E0 E0 - E0 | A0*0.5 A0*0.5 A3 A5"
 */
export function parseNotation(src: string, step = 1): { notes: ChartNote[]; lengthBeats: number } {
  const expanded = src.replace(/\(([^)]*)\)x(\d+)/g, (_, body: string, n: string) =>
    Array(Number(n)).fill(body).join(' '),
  )
  const notes: ChartNote[] = []
  let t = 0
  for (const tok of expanded.split(/\s+/)) {
    if (!tok || tok === '|') continue
    const m = /^([EADG]\d{1,2}|-)(?:\*([\d.]+))?$/.exec(tok)
    if (!m) throw new Error(`Bad notation token "${tok}"`)
    const dur = m[2] ? Number(m[2]) : step
    if (m[1] !== '-') {
      notes.push({ t, dur, string: STRING_LETTERS[m[1][0]], fret: Number(m[1].slice(1)) })
    }
    t += dur
  }
  return { notes, lengthBeats: t }
}

/**
 * Seconds from beat 0 to `beat`, following the tempo map if there is one.
 * `speed` scales playback (0.5 = half speed, so twice the seconds).
 */
export function beatToSec(chart: Pick<Chart, 'bpm' | 'tempoMap'>, beat: number, speed = 1): number {
  const map = chart.tempoMap
  if (!map?.length) return (beat * 60) / (chart.bpm * speed)
  let sec = 0
  let from = 0
  let bpm = map[0].bpm
  for (let i = 1; i < map.length && map[i].beat < beat; i++) {
    sec += ((map[i].beat - from) * 60) / bpm
    from = map[i].beat
    bpm = map[i].bpm
  }
  return (sec + ((beat - from) * 60) / bpm) / speed
}

/** Inverse of beatToSec. */
export function secToBeat(chart: Pick<Chart, 'bpm' | 'tempoMap'>, sec: number, speed = 1): number {
  const map = chart.tempoMap
  const s = sec * speed
  if (!map?.length) return (s * chart.bpm) / 60
  let at = 0
  let from = 0
  let bpm = map[0].bpm
  for (let i = 1; i < map.length; i++) {
    const segEnd = at + ((map[i].beat - from) * 60) / bpm
    if (segEnd > s) break
    at = segEnd
    from = map[i].beat
    bpm = map[i].bpm
  }
  return from + ((s - at) * bpm) / 60
}

export function timeChart(chart: Chart, startTime: number, bpm: number, countInBeats: number): TimedNote[] {
  const spb = 60 / bpm
  const speed = bpm / chart.bpm
  const at = chart.tempoMap?.length
    ? (beat: number) => startTime + countInBeats * spb + beatToSec(chart, beat, speed)
    : (beat: number) => startTime + (countInBeats + beat) * spb
  return chart.notes.map((n, idx) => ({
    idx,
    time: at(n.t),
    midi: positionToMidi(n.string, n.fret),
    string: n.string,
    fret: n.fret,
  }))
}

/** Renders a chart as ASCII tab, G string on top, eighth-note grid. */
export function chartToTab(chart: Chart, barsPerLine = 2): string[] {
  const perBeat = 2
  const cols = Math.ceil(chart.lengthBeats * perBeat)
  const grid: string[][] = STRINGS.map(() => Array(cols).fill('--'))
  for (const n of chart.notes) {
    const c = Math.min(cols - 1, Math.round(n.t * perBeat))
    grid[n.string][c] = String(n.fret).padEnd(2, '-')
  }
  const colsPerBar = chart.beatsPerBar * perBeat
  const bars = Math.ceil(cols / colsPerBar)
  const lines: string[] = []
  for (let b0 = 0; b0 < bars; b0 += barsPerLine) {
    for (let s = 3; s >= 0; s--) {
      let line = `${STRINGS[s].name}|`
      for (let b = b0; b < Math.min(bars, b0 + barsPerLine); b++) {
        line += grid[s].slice(b * colsPerBar, (b + 1) * colsPerBar).join('') + '|'
      }
      lines.push(line)
    }
    lines.push('')
  }
  return lines
}
