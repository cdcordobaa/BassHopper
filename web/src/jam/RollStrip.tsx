import { useEffect, useRef } from 'react'
import { midiToName } from '../music/notes'
import type { JamNote } from './recorder'
import { FIT_COLORS } from './fit'
import type { NoteFit } from './theory'

export interface RollState {
  notes: () => JamNote[]
  /** Current position in beats, or null when the band is stopped. */
  nowBeat: () => number | null
  /** Last position seen, so the strip stays put after stopping. */
  lastBeat: number
  beatsPerBar: number
  chordName: (bar: number) => string
  fit: (midi: number, bar: number) => NoteFit
  /** Beats highlighted as "this will be saved". */
  selection: { from: number; to: number } | null
}

const BARS = 8

/** Scrolling piano roll of the last 8 bars, chord names on top, playhead at the right. */
export function RollStrip({ state }: { state: React.RefObject<RollState> }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvas.current!
    const g = cv.getContext('2d')!
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const dpr = window.devicePixelRatio || 1
      const W = cv.clientWidth
      const H = cv.clientHeight
      if (cv.width !== W * dpr || cv.height !== H * dpr) {
        cv.width = W * dpr
        cv.height = H * dpr
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, W, H)
      const s = state.current
      if (!s) return
      const live = s.nowBeat()
      const now = live ?? s.lastBeat
      const bpb = s.beatsPerBar
      const endBeat = (Math.floor(now / bpb) + 1) * bpb
      const startBeat = endBeat - BARS * bpb
      const top = 18
      const x = (b: number) => ((b - startBeat) / (endBeat - startBeat)) * W
      const visible = s.notes().filter((n) => (n.end ?? now) > startBeat && n.start < endBeat)
      let lo = 28
      let hi = 52
      for (const n of visible) {
        lo = Math.min(lo, n.midi)
        hi = Math.max(hi, n.midi)
      }
      const y = (m: number) => top + ((hi - m) / (hi - lo + 1)) * (H - top)
      const rowH = (H - top) / (hi - lo + 1)

      if (s.selection) {
        g.fillStyle = 'rgba(160,107,255,0.14)'
        g.fillRect(x(s.selection.from), top, x(s.selection.to) - x(s.selection.from), H - top)
      }
      for (let b = Math.ceil(startBeat); b <= endBeat; b++) {
        const bar = b % bpb === 0
        g.strokeStyle = bar ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.07)'
        g.lineWidth = bar ? 1.5 : 1
        g.beginPath()
        g.moveTo(x(b), bar ? 0 : top)
        g.lineTo(x(b), H)
        g.stroke()
        if (bar && b < endBeat && b >= 0) {
          g.fillStyle = '#9a91b5'
          g.font = '600 12px system-ui'
          g.textAlign = 'left'
          g.fillText(s.chordName(b / bpb), x(b) + 4, 13)
        }
      }
      for (const n of visible) {
        const bar = Math.floor(n.start / bpb)
        const x0 = x(Math.max(startBeat, n.start))
        const x1 = Math.max(x0 + 3, x(Math.min(endBeat, n.end ?? now)))
        const color = FIT_COLORS[s.fit(n.midi, bar)]
        g.fillStyle = color
        g.beginPath()
        g.roundRect(x0, y(n.midi) + 1, x1 - x0, Math.max(3, rowH - 2), 3)
        g.fill()
        if (x1 - x0 > 22 && rowH >= 9) {
          g.fillStyle = '#0d0b14'
          g.font = `700 ${Math.min(11, rowH)}px system-ui`
          g.textAlign = 'left'
          g.fillText(midiToName(n.midi, false), x0 + 3, y(n.midi) + rowH - 2)
        }
      }
      if (live !== null) {
        g.strokeStyle = '#fff'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(x(now), top)
        g.lineTo(x(now), H)
        g.stroke()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [state])

  return <canvas ref={canvas} className="roll-strip" />
}
