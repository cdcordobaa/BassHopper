import { positionsForMidi, STRINGS, midiToName, type StringIndex } from '../music/notes'

export interface Mark {
  string: StringIndex
  fret: number
  kind: 'target' | 'played' | 'safe'
  label?: string
}

const FRETS = 12
const INLAYS = [3, 5, 7, 9]

export function marksForMidi(midi: number | null, kind: Mark['kind']): Mark[] {
  if (midi === null) return []
  return positionsForMidi(midi, FRETS).map((p) => ({ ...p, kind, label: midiToName(midi, false) }))
}

/** A horizontal bass neck, G string on top (like tab). */
export function Fretboard({ marks, compact = false }: { marks: Mark[]; compact?: boolean }) {
  const w = 900
  const h = compact ? 120 : 180
  const nut = 46
  const fretX = (f: number) => nut + ((w - nut - 10) * f) / FRETS
  const stringY = (s: number) => 18 + ((h - 36) * (3 - s)) / 3
  const noteX = (f: number) => (f === 0 ? nut / 2 : (fretX(f - 1) + fretX(f)) / 2)

  return (
    <svg className="fretboard" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Fretboard">
      <rect x={nut} y={6} width={w - nut - 10} height={h - 12} rx={6} className="fb-wood" />
      {INLAYS.map((f) => (
        <circle key={f} cx={noteX(f)} cy={h / 2} r={6} className="fb-inlay" />
      ))}
      <circle cx={noteX(12)} cy={h / 2 - 24} r={6} className="fb-inlay" />
      <circle cx={noteX(12)} cy={h / 2 + 24} r={6} className="fb-inlay" />
      {Array.from({ length: FRETS + 1 }, (_, f) => (
        <line key={f} x1={fretX(f)} x2={fretX(f)} y1={6} y2={h - 6} className={f === 0 ? 'fb-nut' : 'fb-fret'} />
      ))}
      {Array.from({ length: FRETS }, (_, f) => (
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
