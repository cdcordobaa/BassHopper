import { positionsForMidi, STRINGS } from '../music/notes'
import { pc, pcName, type Chord, type NoteFit } from './theory'

const FRETS = 12
const INLAYS = [3, 5, 7, 9]

interface Props {
  scale: number[]
  chord: Chord
  played: number | null
  playedFit: NoteFit | null
  flats: boolean
}

/**
 * Safe-notes neck: scale notes dim, current chord tones bright, root big and labelled,
 * the note you're playing in white. Same geometry/look as ui/Fretboard, with more mark kinds.
 */
export function JamNeck({ scale, chord, played, playedFit, flats }: Props) {
  const w = 900
  const h = 170
  const nut = 46
  const fretX = (f: number) => nut + ((w - nut - 10) * f) / FRETS
  const stringY = (s: number) => 18 + ((h - 36) * (3 - s)) / 3
  const noteX = (f: number) => (f === 0 ? nut / 2 : (fretX(f - 1) + fretX(f)) / 2)

  const marks: { s: number; f: number; kind: string; label: string }[] = []
  STRINGS.forEach((str, s) => {
    for (let f = 0; f <= FRETS; f++) {
      const p = pc(str.midi + f)
      const kind = p === chord.root ? 'root' : chord.tones.includes(p) ? 'chord' : scale.includes(p) ? 'scale' : null
      if (kind) marks.push({ s, f, kind, label: pcName(p, flats) })
    }
  })
  const playedAt = played === null ? [] : positionsForMidi(played, FRETS)

  return (
    <svg className="fretboard jam-neck" viewBox={`0 0 ${w} ${h + 16}`} role="img" aria-label="Safe notes on the neck">
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
        <text key={f} x={noteX(f + 1)} y={h + 12} className="fb-num">
          {f + 1}
        </text>
      ))}
      {STRINGS.map((s, i) => (
        <g key={s.name}>
          <line x1={nut} x2={w - 10} y1={stringY(i)} y2={stringY(i)} stroke={s.color} strokeWidth={4 - i * 0.6} opacity={0.6} />
          <text x={8} y={stringY(i) + 5} className="fb-string-name" fill={s.color}>
            {s.name}
          </text>
        </g>
      ))}
      {marks.map((m) => (
        <g key={`${m.s}-${m.f}`} className={`jn-mark jn-${m.kind}`}>
          <circle cx={noteX(m.f)} cy={stringY(m.s)} r={m.kind === 'root' ? 15 : m.kind === 'chord' ? 13 : 10} />
          <text x={noteX(m.f)} y={stringY(m.s) + 4}>
            {m.label}
          </text>
        </g>
      ))}
      {playedAt.map((p) => (
        <circle
          key={`p${p.string}-${p.fret}`}
          className={`jn-played jn-fit-${playedFit ?? 'scale'}`}
          cx={noteX(p.fret)}
          cy={stringY(p.string)}
          r={17}
        />
      ))}
    </svg>
  )
}
