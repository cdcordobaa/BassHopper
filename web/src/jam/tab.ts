import { chartToTab, type Chart } from '../game/chart'
import { STRINGS } from '../music/notes'

/**
 * Tab for a riff. chartToTab only has 8th-note columns, so riffs with 16ths get a
 * 16th-resolution grid here instead (otherwise 16ths collide or look simultaneous).
 */
export function riffTab(chart: Chart, barsPerLine = 4): string[] {
  const has16ths = chart.notes.some((n) => !Number.isInteger(Math.round(n.t * 4) / 2))
  if (!has16ths) return chartToTab(chart, barsPerLine)
  const perBeat = 4
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
