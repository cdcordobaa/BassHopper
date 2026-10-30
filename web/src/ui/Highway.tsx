import { useEffect, useRef } from 'react'
import { STRINGS, midiToName } from '../music/notes'
import type { TimedNote } from '../game/chart'
import type { Grade } from '../game/scorer'

export interface HighwayState {
  notes: TimedNote[]
  grades: (Grade | null)[]
  /** Visual clock (audio time minus output latency). */
  now: () => number
  beatTimes: number[]
  beatsPerBar: number
  showNames: boolean
  /** Recent hits for the burst effect: lane + time. */
  bursts: { string: number; time: number; grade: Grade }[]
}

const LOOKAHEAD = 2.4
const HIT = 0.84
const VANISH = -0.3

/** Canvas note highway: 4 lanes (E A D G), gems carry the fret number. */
export function Highway({ state }: { state: React.RefObject<HighwayState> }) {
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
      const now = s.now()
      const cx = W / 2
      const laneW = Math.min(W * 0.85, 560) / 4
      const hitY = H * HIT
      const vanishY = H * VANISH
      // depth 0 = hit line, 1 = far end
      const scale = (d: number) => 1 / (1 + 1.6 * d)
      const yAt = (d: number) => vanishY + (hitY - vanishY) * scale(d)
      const xAt = (lane: number, d: number) => cx + (lane - 1.5) * laneW * scale(d)
      const depthOf = (t: number) => (t - now) / LOOKAHEAD

      // Road
      const dFar = 1
      const dNear = -0.12
      g.beginPath()
      g.moveTo(xAt(-0.5, dFar), yAt(dFar))
      g.lineTo(xAt(3.5, dFar), yAt(dFar))
      g.lineTo(xAt(3.5, dNear), yAt(dNear))
      g.lineTo(xAt(-0.5, dNear), yAt(dNear))
      g.closePath()
      const road = g.createLinearGradient(0, yAt(dFar), 0, H)
      road.addColorStop(0, 'rgba(30,22,50,0.2)')
      road.addColorStop(1, 'rgba(40,28,70,0.95)')
      g.fillStyle = road
      g.fill()

      // Lane tint + dividers
      STRINGS.forEach((str, i) => {
        g.beginPath()
        g.moveTo(xAt(i - 0.5, dFar), yAt(dFar))
        g.lineTo(xAt(i + 0.5, dFar), yAt(dFar))
        g.lineTo(xAt(i + 0.5, dNear), yAt(dNear))
        g.lineTo(xAt(i - 0.5, dNear), yAt(dNear))
        g.closePath()
        g.fillStyle = str.color + '10'
        g.fill()
      })
      g.strokeStyle = 'rgba(255,255,255,0.08)'
      g.lineWidth = 1
      for (let i = 0; i <= 4; i++) {
        g.beginPath()
        g.moveTo(xAt(i - 0.5, dFar), yAt(dFar))
        g.lineTo(xAt(i - 0.5, dNear), yAt(dNear))
        g.stroke()
      }

      // Beat lines
      s.beatTimes.forEach((bt, i) => {
        const d = depthOf(bt)
        if (d < dNear || d > dFar) return
        const bar = i % s.beatsPerBar === 0
        g.strokeStyle = bar ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)'
        g.lineWidth = bar ? 2 : 1
        g.beginPath()
        g.moveTo(xAt(-0.5, d), yAt(d))
        g.lineTo(xAt(3.5, d), yAt(d))
        g.stroke()
      })

      // Hit line
      g.strokeStyle = 'rgba(255,255,255,0.7)'
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(xAt(-0.5, 0), hitY)
      g.lineTo(xAt(3.5, 0), hitY)
      g.stroke()
      STRINGS.forEach((str, i) => {
        g.beginPath()
        g.arc(xAt(i, 0), hitY, laneW * 0.28, 0, Math.PI * 2)
        g.strokeStyle = str.color
        g.lineWidth = 3
        g.stroke()
        g.fillStyle = 'rgba(0,0,0,0.4)'
        g.fill()
        g.fillStyle = str.color
        g.font = `bold ${laneW * 0.16}px system-ui`
        g.textAlign = 'center'
        g.fillText(str.name, xAt(i, 0), hitY + laneW * 0.55)
      })

      // Gems, far to near so near ones draw on top
      for (let k = s.notes.length - 1; k >= 0; k--) {
        const n = s.notes[k]
        const grade = s.grades[n.idx]
        if (grade === 'perfect' || grade === 'good') continue
        const d = depthOf(n.time)
        if (d > dFar || d < dNear - 0.1) continue
        const sc = scale(d)
        const x = xAt(n.string, d)
        const y = yAt(d)
        const w = laneW * 0.8 * sc
        const h = laneW * 0.42 * sc
        const color = grade === 'miss' ? '#555' : STRINGS[n.string].color
        g.save()
        g.shadowColor = color
        g.shadowBlur = grade === 'miss' ? 0 : 18 * sc
        g.fillStyle = color
        g.beginPath()
        g.roundRect(x - w / 2, y - h / 2, w, h, h * 0.35)
        g.fill()
        g.restore()
        g.fillStyle = '#0d0b14'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.font = `900 ${h * 0.72}px system-ui`
        const label = String(n.fret)
        g.fillText(label, x, y + (s.showNames ? -h * 0.08 : h * 0.04))
        if (s.showNames) {
          g.font = `700 ${h * 0.32}px system-ui`
          g.fillText(midiToName(n.midi, false), x + w * 0.32, y + h * 0.18)
        }
        g.textBaseline = 'alphabetic'
      }

      // Hit bursts
      for (const b of s.bursts) {
        const age = now - b.time
        if (age < 0 || age > 0.35) continue
        const p = age / 0.35
        g.beginPath()
        g.arc(xAt(b.string, 0), hitY, laneW * (0.3 + p * 0.5), 0, Math.PI * 2)
        g.strokeStyle = b.grade === 'perfect' ? `rgba(255,255,255,${1 - p})` : `rgba(255,220,120,${1 - p})`
        g.lineWidth = 6 * (1 - p)
        g.stroke()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [state])

  return <canvas ref={canvas} className="highway" />
}
