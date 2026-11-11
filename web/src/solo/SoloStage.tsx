import { useEffect, useRef, useState } from 'react'
import { listSolos, type SoloPiece } from '../arena/api'
import type { Chart } from '../game/chart'
import type { Level } from '../game/path/worlds'
import { useProgress, type Progress } from '../game/progress'
import { Play } from '../ui/Play'
import { listen } from './listen'
import { learned, PASS, soloLevels, type SoloLevels } from './pieces'
import './solo.css'

interface Props {
  onBack: () => void
  onSetup: () => void
}

type View = { name: 'list' } | { name: 'piece'; id: string } | { name: 'play'; id: string; level: string }

/** Solo-bass arrangements: listen, learn phrase by phrase, then play the whole piece alone. */
export function SoloStage({ onBack, onSetup }: Props) {
  const [data, setData] = useState<{ path: string; solos: SoloPiece[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ name: 'list' })
  const p = useProgress()

  useEffect(() => {
    listSolos().then(setData, (e: Error) => setError(e.message))
  }, [])

  const piece = view.name !== 'list' ? data?.solos.find((s) => s.id === view.id) : undefined
  let levels: SoloLevels | null = null
  let broken: string | null = null
  if (piece && !piece.error) {
    try {
      levels = soloLevels(piece)
    } catch (e) {
      broken = (e as Error).message
    }
  }

  if (view.name === 'play' && piece && levels) {
    const all = [...levels.phrases, levels.stage]
    const i = all.findIndex((l) => l.id === view.level)
    const level = all[i]
    const after = levels.phrases[i + 1] ?? (i === levels.phrases.length - 1 ? levels.stage : undefined)
    const open = (l: Level) => setView({ name: 'play', id: piece.id, level: l.id })
    return (
      <Play
        key={level.id}
        level={level}
        exitLabel={piece.title}
        onExit={() => setView({ name: 'piece', id: piece.id })}
        onSetup={onSetup}
        onLevel={() => {}}
        next={after ? { title: after === levels.stage ? 'On stage' : after.title.split(' · ')[1], go: () => open(after) } : null}
        extra={<ListenButton chart={level.chart} />}
      />
    )
  }

  if (view.name !== 'list' && piece) {
    return (
      <PieceScreen
        piece={piece}
        levels={levels}
        broken={broken ?? piece.error ?? null}
        p={p}
        onBack={() => setView({ name: 'list' })}
        onPlay={(id) => setView({ name: 'play', id: piece.id, level: id })}
      />
    )
  }

  return (
    <div className="screen solo">
      <header className="screen-head">
        <button className="ghost" onClick={onBack}>← Home</button>
        <h1>Solo Stage</h1>
      </header>
      <p className="muted">Songs arranged for bass alone, recognisable with no band. Listen first, learn them phrase by phrase, then play the whole thing.</p>
      {error && <p className="warn">Couldn't reach the BassHopper helper ({error}). Start it with ./start.sh.</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && data.solos.length === 0 && (
        <p className="muted">
          No pieces yet. Put solo arrangements (JSON files) in <code>{data.path}</code>.
        </p>
      )}
      <div className="solo-list">
        {data?.solos.map((s) => (
          <button key={s.id} className="solo-card" onClick={() => setView({ name: 'piece', id: s.id })}>
            <b>{s.title}</b>
            {s.error ? <span className="warn">{s.error}</span> : <span className="muted">{[s.artist, s.key, `${s.bpm} BPM`].filter(Boolean).join(' · ')}</span>}
            {!s.error && <PieceProgress piece={s} p={p} />}
          </button>
        ))}
      </div>
    </div>
  )
}

function PieceProgress({ piece, p }: { piece: SoloPiece; p: Progress }) {
  let levels: SoloLevels
  try {
    levels = soloLevels(piece)
  } catch {
    return null
  }
  const passed = levels.phrases.filter((l) => learned(l, p)).length
  const stars = p.levels[levels.stage.id]?.stars ?? 0
  return (
    <span className="solo-progress">
      {passed}/{levels.phrases.length} phrases · on stage <Stars n={stars} />
    </span>
  )
}

function PieceScreen({ piece, levels, broken, p, onBack, onPlay }: {
  piece: SoloPiece
  levels: SoloLevels | null
  broken: string | null
  p: Progress
  onBack: () => void
  onPlay: (levelId: string) => void
}) {
  return (
    <div className="screen solo">
      <header className="screen-head">
        <button className="ghost" onClick={onBack}>← Solo Stage</button>
        <h1>{piece.title}</h1>
        {piece.artist && <span className="muted">{piece.artist}</span>}
      </header>
      {broken || !levels ? (
        <p className="warn">This piece can't be played: {broken}</p>
      ) : (
        <>
          <section className="card">
            {piece.about?.map((line) => <p key={line}>{line}</p>)}
            {piece.tip && <p className="tip">💡 {piece.tip}</p>}
            <p className="muted">{[piece.key, `${piece.bpm} BPM`].filter(Boolean).join(' · ')}</p>
            <ListenButton chart={levels.stage.chart} label="Listen to the whole piece" />
          </section>
          <section className="card">
            <h2>1 · Learn it phrase by phrase</h2>
            <p className="muted">Practice them in any order. {Math.round(PASS * 100)}% or better marks a phrase ✅ learned. Wait for me and a slower speed are fine.</p>
            <ol className="phrases">
              {levels.phrases.map((l, i) => {
                const best = p.levels[l.id]?.bestAccuracy
                const done = learned(l, p)
                return (
                  <li key={l.id} className={`phrase ${done ? 'done' : ''}`}>
                    <span className="phrase-name">{done ? '✅' : '▶'} {piece.phrases[i].name}</span>
                    <span className="muted">{best !== undefined ? `best ${Math.round(best * 100)}%` : 'not played yet'}</span>
                    <ListenButton chart={l.chart} label="Hear it" small />
                    <button className="primary" onClick={() => onPlay(l.id)}>Practice</button>
                  </li>
                )
              })}
            </ol>
          </section>
          <section className="card">
            <h2>2 · On stage</h2>
            <p className="muted">The whole piece, no band. {levels.phrases.every((l) => learned(l, p)) ? 'You know every phrase: go impress someone.' : 'Jump in whenever you like.'}</p>
            <div className="row">
              <Stars n={p.levels[levels.stage.id]?.stars ?? 0} />
              <button className="primary huge" onClick={() => onPlay(levels.stage.id)}>🎤 Perform</button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Stars({ n }: { n: number }) {
  return <span className="stars">{[1, 2, 3].map((i) => <span key={i} className={i <= n ? 'lit' : ''}>★</span>)}</span>
}

/** Plays a chart on the synth bass; press again to stop. */
export function ListenButton({ chart, label = 'Listen', small = false }: { chart: Chart; label?: string; small?: boolean }) {
  const [on, setOn] = useState(false)
  const [slow, setSlow] = useState(false)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  const toggle = async () => {
    if (stop.current) {
      stop.current()
      stop.current = null
      setOn(false)
      return
    }
    setOn(true)
    stop.current = await listen(chart, slow ? 0.6 : 1, () => {
      stop.current = null
      setOn(false)
    })
  }

  return (
    <span className="listen">
      <button className={small ? 'ghost' : ''} onClick={toggle}>{on ? '■ Stop' : `🔊 ${label}`}</button>
      {!small && (
        <label className="check">
          <input type="checkbox" checked={slow} disabled={on} onChange={(ev) => setSlow(ev.target.checked)} /> slow (60%)
        </label>
      )}
    </span>
  )
}
