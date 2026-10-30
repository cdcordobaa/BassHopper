import { MAX_BPM, MIN_BPM, type BackingOptions } from './backing'
import { STYLES } from './styles'
import { findProgression, PROGRESSIONS, ROOTS, SCALE_IDS, SCALES, type ScaleId } from './theory'

interface Props {
  opts: BackingOptions
  scale: ScaleId
  onChange: (patch: Partial<BackingOptions>, scale?: ScaleId) => void
  onScale: (s: ScaleId) => void
}

const BARS_PER_CHORD = [1, 2, 4]

export function JamControls({ opts, scale, onChange, onScale }: Props) {
  const prog = findProgression(opts.progressionId)
  return (
    <section className="card jam-controls">
      <div className="style-picker">
        {STYLES.map((s) => (
          <button
            key={s.id}
            className={s.id === opts.style ? 'on' : ''}
            onClick={() => {
              const p = PROGRESSIONS[s.id][0]
              onChange({ style: s.id, progressionId: p.id, bpm: s.bpm, barsPerChord: p.barsPerChord }, p.scale)
            }}
          >
            <span>{s.emoji}</span> {s.name}
          </button>
        ))}
      </div>
      <div className="jam-grid">
        <label>
          Key
          <span className="row tight">
            <select value={opts.tonic} onChange={(e) => onChange({ tonic: Number(e.target.value) })}>
              {ROOTS.map((r) => (
                <option key={r.pc} value={r.pc}>
                  {r.name}
                </option>
              ))}
            </select>
            <span className="muted">{prog?.mode ?? 'major'}</span>
          </span>
        </label>
        <label>
          Chords
          <select
            value={opts.progressionId}
            onChange={(e) => {
              const p = findProgression(e.target.value)
              if (p) onChange({ progressionId: p.id, barsPerChord: p.barsPerChord }, p.scale)
            }}
          >
            {PROGRESSIONS[opts.style].map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.mode})
              </option>
            ))}
          </select>
        </label>
        <label>
          Safe notes
          <select value={scale} onChange={(e) => onScale(e.target.value as ScaleId)}>
            {SCALE_IDS.map((id) => (
              <option key={id} value={id}>
                {SCALES[id].name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bars per chord
          <div className="seg">
            {BARS_PER_CHORD.map((b) => (
              <button key={b} className={b === opts.barsPerChord ? 'on' : ''} onClick={() => onChange({ barsPerChord: b })}>
                {b}
              </button>
            ))}
          </div>
        </label>
        <label>
          Tempo <b>{opts.bpm} BPM</b>
          <input type="range" min={MIN_BPM} max={MAX_BPM} value={opts.bpm} onChange={(e) => onChange({ bpm: Number(e.target.value) })} />
        </label>
        <label>
          Band volume
          <input type="range" min={0} max={100} value={Math.round(opts.volume * 100)} onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={opts.guideBass} onChange={(e) => onChange({ guideBass: e.target.checked })} /> Guide bass (soft roots
        to follow — best with headphones, the mic may hear it)
      </label>
    </section>
  )
}
