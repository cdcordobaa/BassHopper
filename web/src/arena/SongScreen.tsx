import { useMemo, useState } from 'react'
import { chartToTab } from '../game/chart'
import { useEngine } from '../ui/hooks'
import type { Song, SongChart } from './api'
import type { Mix } from './ArenaSession'
import { DIFFICULTIES, deriveDifficulty, type Difficulty } from './difficulty'
import { OffsetNudge } from './OffsetNudge'
import { loadArena } from './store'
import { barsToRange, loopOptions, type LoopRange } from './sync'
import './arena.css'

const SPEEDS = [0.5, 0.75, 0.9, 1]
const PREVIEW_BARS = 4

export interface ArenaSettings {
  difficulty: Difficulty
  speed: number
  loop: LoopRange | null
  mix: Mix
}

interface Props {
  song: Song
  chart: SongChart | null | undefined
  chartError: string | null
  settings: ArenaSettings
  onSettings: (patch: Partial<ArenaSettings>) => void
  onOffset: (offsetSec: number) => void
  onPlay: () => void
  onFree: () => void
  onBack: () => void
  onSetup: () => void
}

export function SongScreen({ song, chart, chartError, settings, onSettings, onOffset, onPlay, onFree, onBack, onSetup }: Props) {
  const e = useEngine()
  const { difficulty, speed, loop, mix } = settings
  const best = loadArena().songs[song.id] ?? {}
  const loops = useMemo(() => (chart ? loopOptions(chart) : []), [chart])
  const bars = chart ? Math.max(1, Math.ceil(chart.lengthBeats / chart.beatsPerBar)) : 1
  const [customFrom, setCustomFrom] = useState(1)
  const [customTo, setCustomTo] = useState(4)
  const loopKey = loop ? `${loop.startBeat}-${loop.endBeat}` : 'all'

  const preview = useMemo(() => {
    if (!chart) return ''
    const d = deriveDifficulty(chart, difficulty)
    const start = loop?.startBeat ?? 0
    const len = PREVIEW_BARS * chart.beatsPerBar
    const notes = d.notes.filter((n) => n.t >= start && n.t < start + len).map((n) => ({ ...n, t: n.t - start }))
    return chartToTab({ ...d, notes, lengthBeats: len }).join('\n')
  }, [chart, difficulty, loop])

  const guideAvailable = song.stems.includes('bass')
  const bpm = chart ? Math.round(chart.bpm * speed) : null
  const tempoChanges = chart && chart.tempoMap.length > 1

  return (
    <div className="screen arena">
      <header className="screen-head">
        <button className="ghost" onClick={onBack}>← Library</button>
        <h1>
          {song.title}
          {song.artist && <span className="muted"> · {song.artist}</span>}
        </h1>
      </header>

      <p className="tip">🎧 Use headphones or keep the song quiet — the mic hears your speakers.</p>

      {chart === undefined && !chartError && <p className="muted">Loading chart…</p>}
      {chartError && <p className="error">Couldn't load the chart: {chartError}</p>}

      {chart === null && (
        <section className="card">
          <h2>No tab for this song</h2>
          <p className="muted">Import it again with a Guitar Pro file to get a chart. Until then you can play along freely — the neck shows what you're playing. (Auto-transcription comes later.)</p>
        </section>
      )}

      {chart && (
        <>
          <section className="card">
            <h2>Difficulty</h2>
            <div className="arena-diffs">
              {DIFFICULTIES.map((d) => (
                <button key={d.id} className={d.id === difficulty ? 'arena-diff on' : 'arena-diff'} onClick={() => onSettings({ difficulty: d.id })}>
                  <b>{d.label}</b>
                  <span className="muted small">{d.blurb}</span>
                  <span className="stars">{[1, 2, 3].map((i) => <span key={i} className={i <= (best[d.id]?.stars ?? 0) ? 'lit' : ''}>★</span>)}</span>
                </button>
              ))}
            </div>
            <pre className="tab">{preview}</pre>
            {chart.droppedNotes ? <p className="muted small">{chart.droppedNotes} notes were out of 4-string range and left out.</p> : null}
          </section>

          <section className="card">
            <h2>Practice</h2>
            <div className="row">
              <div className="seg">
                {SPEEDS.map((sp) => (
                  <button key={sp} className={sp === speed ? 'on' : ''} onClick={() => onSettings({ speed: sp })}>
                    {Math.round(sp * 100)}%
                  </button>
                ))}
              </div>
              <span className="muted">
                {bpm} BPM{tempoChanges && ' (tempo changes)'}
              </span>
            </div>
            <div className="row arena-loop">
              <label>
                <span className="muted small">Loop</span>
                <select
                  value={loopKey}
                  onChange={(ev) => {
                    const v = ev.target.value
                    onSettings({ loop: v === 'all' ? null : (loops.find((l) => `${l.startBeat}-${l.endBeat}` === v) ?? null) })
                  }}
                >
                  <option value="all">Whole song (scored)</option>
                  {loops.map((l) => (
                    <option key={`${l.startBeat}-${l.endBeat}`} value={`${l.startBeat}-${l.endBeat}`}>
                      ⟳ {l.name}
                    </option>
                  ))}
                  {loop && !loops.some((l) => `${l.startBeat}-${l.endBeat}` === loopKey) && <option value={loopKey}>⟳ {loop.name}</option>}
                </select>
              </label>
              <span className="muted small">or bars</span>
              <input type="number" min={1} max={bars} value={customFrom} onChange={(ev) => setCustomFrom(Number(ev.target.value))} />
              <span className="muted small">to</span>
              <input type="number" min={1} max={bars} value={customTo} onChange={(ev) => setCustomTo(Number(ev.target.value))} />
              <button onClick={() => onSettings({ loop: barsToRange(chart.beatsPerBar, Math.min(customFrom, bars), Math.min(customTo, bars)) })}>Loop these</button>
            </div>
            {loop && <p className="muted small">Loops repeat until you quit; stars are only awarded for whole-song runs.</p>}
          </section>
        </>
      )}

      <section className="card">
        <h2>Mixer</h2>
        <div className="sliders">
          <label>
            <span>Band {song.stems.includes('no_bass') ? '(bass removed)' : '(full mix)'}</span>
            <input type="range" min={0} max={1} step={0.01} value={mix.band} onChange={(ev) => onSettings({ mix: { ...mix, band: Number(ev.target.value) } })} />
          </label>
          <label className={guideAvailable ? '' : 'muted'}>
            <span>Guide bass {guideAvailable ? '' : '(needs stems)'}</span>
            <input type="range" min={0} max={1} step={0.01} disabled={!guideAvailable} value={mix.guide} onChange={(ev) => onSettings({ mix: { ...mix, guide: Number(ev.target.value) } })} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={mix.duck} disabled={!guideAvailable} onChange={(ev) => onSettings({ mix: { ...mix, duck: ev.target.checked } })} /> Guide bass ducks when you miss
        </label>
        {e.source?.kind === 'mic' && guideAvailable && <p className="muted small">Guide bass starts muted on a mic — the mic would hear it and score it as you.</p>}
        <div className="row">
          <OffsetNudge offsetSec={song.offsetSec} onNudge={(d) => onOffset(Math.round((song.offsetSec + d) * 1000) / 1000)} />
          <span className="muted small">Fine-tune while playing too, or press T on each beat to auto-sync.</span>
        </div>
      </section>

      {!e.source && chart && (
        <p className="warn">
          No input connected — the game can't hear you. <button onClick={onSetup}>Set up input</button>
        </p>
      )}

      <div className="row center">
        {chart && (
          <button className="primary huge" onClick={onPlay}>
            ▶ {loop ? 'Loop' : 'Play'}
          </button>
        )}
        <button className={chart ? 'ghost' : 'primary huge'} onClick={onFree} disabled={chart === undefined && !chartError}>
          🎵 Listen / play along
        </button>
      </div>
    </div>
  )
}
