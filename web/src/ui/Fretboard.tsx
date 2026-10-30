import { positionsForMidi, STRINGS, midiToName, type StringIndex } from '../music/notes'

export interface Mark {
  string: StringIndex
  fret: number
  kind: 'target' | 'played' | 'safe'
  label?: string
}

const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21]
const DOUBLE_INLAYS = [12, 24]
const MIDDLE_C = 60
// Each fret is this much narrower than the one before: a gentle version of a real neck,
// so 24 frets fit without the high ones getting too small to read.
const TAPER = 0.974

export function marksForMidi(midi: number | null, kind: Mark['kind'], frets = 12): Mark[] {
  if (midi === null) return []
  return positionsForMidi(midi, frets).map((p) => ({ ...p, kind, label: midiToName(midi, false) }))
}

/** A horizontal bass neck, G string on top (like tab). */
export function Fretboard({
  marks,
  compact = false,
  frets = 12,
  showMiddleC = false,
}: {
  marks: Mark[]
  compact?: boolean
  frets?: number
  showMiddleC?: boolean
}) {
  const w = frets > 12 ? 1300 : 900
  const h = compact ? 120 : 180
  const nut = 46
  const widths = Array.from({ length: frets }, (_, f) => TAPER ** f)
  const total = widths.reduce((a, v) => a + v, 0)
  const edges = [0]
  widths.forEach((v) => edges.push(edges[edges.length - 1] + v))
  const fretX = (f: number) => nut + ((w - nut - 10) * edges[f]) / total
  const stringY = (s: number) => 18 + ((h - 36) * (3 - s)) / 3
  const noteX = (f: number) => (f === 0 ? nut / 2 : (fretX(f - 1) + fretX(f)) / 2)
  const middleC = showMiddleC ? positionsForMidi(MIDDLE_C, frets) : []

  return (
    <svg className="fretboard" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Fretboard">
      <rect x={nut} y={6} width={w - nut - 10} height={h - 12} rx={6} className="fb-wood" />
      {SINGLE_INLAYS.filter((f) => f <= frets).map((f) => (
        <circle key={f} cx={noteX(f)} cy={h / 2} r={6} className="fb-inlay" />
      ))}
      {DOUBLE_INLAYS.filter((f) => f <= frets).map((f) => (
        <g key={f}>
          <circle cx={noteX(f)} cy={h / 2 - 24} r={6} className="fb-inlay" />
          <circle cx={noteX(f)} cy={h / 2 + 24} r={6} className="fb-inlay" />
        </g>
      ))}
      {Array.from({ length: frets + 1 }, (_, f) => (
        <line key={f} x1={fretX(f)} x2={fretX(f)} y1={6} y2={h - 6} className={f === 0 ? 'fb-nut' : 'fb-fret'} />
      ))}
      {Array.from({ length: frets }, (_, f) => (
        <text key={f} x={noteX(f + 1)} y={h} className="fb-num">
          {f + 1}
        </text>
      ))}
      {STRINGS.map((s, i) => (
        <g key={s.name}>
          <line x1={nut} x2={w - 10} y1={stringY(i)} y2={stringY(i)} stroke={s.color} strokeWidth={4 - i * 0.6} opacity={0.75} />
          <text x={8} y={stringY(i) + 5} className="fb-string-name" fill={s.color}>
            {s.name}
          </text>
        </g>
      ))}
      {middleC.map((p) => (
        <g key={`c${p.string}`} className="fb-middle-c">
          <circle cx={noteX(p.fret)} cy={stringY(p.string)} r={compact ? 13 : 15} />
          <text x={noteX(p.fret)} y={stringY(p.string) + 4}>
            C4
          </text>
        </g>
      ))}
      {marks.map((m, i) => (
        <g key={i} className={`fb-mark fb-${m.kind}`}>
          <circle cx={noteX(m.fret)} cy={stringY(m.string)} r={compact ? 13 : 15} style={{ ['--c' as string]: STRINGS[m.string].color }} />
          {m.label && (
            <text x={noteX(m.fret)} y={stringY(m.string) + 5}>
              {m.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
