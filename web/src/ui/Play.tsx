import { useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { chartToTab, timeChart } from '../game/chart'
import { nextLevel, type Level } from '../game/path/worlds'
import { getProgress, recordRun } from '../game/progress'
import { NORMAL_WINDOWS, ROOKIE_WINDOWS, Scorer, type Grade, type ScoreSummary } from '../game/scorer'
import { midiToName, STRINGS } from '../music/notes'
import { Fretboard, marksForMidi, type Mark } from './Fretboard'
import { Highway, type HighwayState } from './Highway'
import { useCurrentNote, useEngine } from './hooks'

const SPEEDS = [0.5, 0.75, 0.9, 1]

interface Props {
  level: Level
  onExit: () => void
  onSetup: () => void
  onLevel: (id: string) => void
}

type Phase = { name: 'intro' } | { name: 'playing'; run: number } | { name: 'done'; summary: ScoreSummary; xp: number; avgDelta: number | null }

export function Play({ level, onExit, onSetup, onLevel }: Props) {
  const e = useEngine()
  const [speed, setSpeed] = useState(1)
  const [rookie, setRookie] = useState(false)
  const [phase, setPhase] = useState<Phase>({ name: 'intro' })
  const runs = useRef(0)

  useEffect(() => setPhase({ name: 'intro' }), [level.id])

  if (phase.name === 'playing') {
    return (
      <Session
        key={phase.run}
        level={level}
        speed={speed}
        rookie={rookie}
        onQuit={() => setPhase({ name: 'intro' })}
        onDone={(summary, avgDelta) => {
          const xp = recordRun(level.id, summary)
          setPhase({ name: 'done', summary, xp, avgDelta })
        }}
      />
    )
  }

  const start = async () => {
    await engine.context()
    runs.current++
    setPhase({ name: 'playing', run: runs.current })
  }

  if (phase.name === 'done') {
    const { summary: s, xp, avgDelta } = phase
    const next = nextLevel(level.id)
    const tendency =
      avgDelta === null || Math.abs(avgDelta) < 0.015
        ? 'Your timing is centred. Nice.'
        : `On average you play ${Math.round(Math.abs(avgDelta) * 1000)} ms ${avgDelta > 0 ? 'late — anticipate the click a little' : 'early — relax and wait for the click'}.`
    return (
      <div className="screen results">
        <h1>{level.title}</h1>
        <div className="stars big">{[1, 2, 3].map((i) => <span key={i} className={i <= s.stars ? 'lit' : ''}>★</span>)}</div>
        <div className="result-grid">
          <div><b>{Math.round(s.accuracy * 100)}%</b>accuracy</div>
          <div><b>{s.score}</b>score</div>
          <div><b>{s.maxCombo}</b>best combo</div>
          <div><b>+{xp}</b>XP</div>
        </div>
        <p className="muted">
          <span className="g-perfect">{s.perfect} perfect</span> · <span className="g-good">{s.good} good</span> · <span className="g-miss">{s.miss} miss</span>
        </p>
        <p>{tendency}</p>
        {s.stars < 2 && <p className="muted">Get 2★ to unlock the next level. Try slower speed or Rookie mode.</p>}
        <div className="row center">
          <button className="primary" onClick={start}>↻ Retry</button>
          {next && s.stars >= 2 && <button className="primary" onClick={() => onLevel(next.id)}>Next: {next.title} →</button>}
          <button className="ghost" onClick={onExit}>Map</button>
        </div>
      </div>
    )
  }

  const best = getProgress().levels[level.id]
  return (
    <div className="screen intro">
      <header className="screen-head">
        <button className="ghost" onClick={onExit}>← Map</button>
        <h1>
          {level.id} · {level.title}
        </h1>
        {best && <span className="stars">{[1, 2, 3].map((i) => <span key={i} className={i <= best.stars ? 'lit' : ''}>★</span>)}</span>}
      </header>
      <section className="card">
        {level.explain.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="tip">💡 {level.tip}</p>
      </section>
      <section className="card">
        <h2>The tab</h2>
        <p className="muted">Each line is a string (G on top, E at the bottom). Numbers are frets; 0 = open string.</p>
        <pre className="tab">{chartToTab(level.chart).join('\n')}</pre>
      </section>
      <section className="card row">
        <div className="seg">
          {SPEEDS.map((sp) => (
            <button key={sp} className={sp === speed ? 'on' : ''} onClick={() => setSpeed(sp)}>
              {Math.round(sp * 100)}%
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={rookie} onChange={(ev) => setRookie(ev.target.checked)} /> Rookie timing (wider windows)
        </label>
        <span className="muted">{Math.round(level.chart.bpm * speed)} BPM</span>
      </section>
      {!e.source && (
        <p className="warn">
          No input connected — the game can't hear you. <button onClick={onSetup}>Set up input</button>
        </p>
      )}
      <div className="row center">
        <button className="primary huge" onClick={start}>▶ Play</button>
      </div>
    </div>
  )
}

interface SessionProps {
  level: Level
  speed: number
  rookie: boolean
  onDone: (s: ScoreSummary, avgDelta: number | null) => void
  onQuit: () => void
}

type Feedback = { text: string; cls: string; id: number }

function Session({ level, speed, rookie, onDone, onQuit }: SessionProps) {
  const chart = level.chart
  const hw = useRef<HighwayState>(null!)
  const scorer = useRef<Scorer>(null!)
  const [hud, setHud] = useState({ score: 0, combo: 0, mult: 1, beat: -99 })
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [target, setTarget] = useState<Mark[]>([])
  const playing = useCurrentNote()
  const fbId = useRef(0)

  useEffect(() => {
    const ctx = engine.ctx!
    const bpm = chart.bpm * speed
    const spb = 60 / bpm
    const countIn = chart.beatsPerBar
    const t0 = ctx.currentTime + 0.6
    const totalBeats = countIn + Math.ceil(chart.lengthBeats)
    const timed = timeChart(chart, t0, bpm, countIn)
    const sc = new Scorer(timed, rookie ? ROOKIE_WINDOWS : NORMAL_WINDOWS)
    scorer.current = sc
    const outLat = engine.outputLatency()
    const latency = () => (engine.profile?.latencyMs ?? 0) / 1000
    const deltas: number[] = []

    const bus = ctx.createGain()
    bus.connect(ctx.destination)
    const beatTimes: number[] = []
    for (let i = 0; i < totalBeats; i++) {
      const t = t0 + i * spb
      beatTimes.push(t)
      engine.click(t, i % chart.beatsPerBar === 0, bus)
    }

    const bursts: HighwayState['bursts'] = []
    hw.current = {
      notes: timed,
      grades: sc.grades,
      now: () => engine.now() - outLat,
      beatTimes: beatTimes.slice(countIn),
      beatsPerBar: chart.beatsPerBar,
      showNames: !!level.showNames,
      bursts,
    }

    const say = (text: string, cls: string) => setFeedback({ text, cls, id: ++fbId.current })
    const onGrade = (idx: number, grade: Grade, delta?: number) => {
      if (grade !== 'miss') bursts.push({ string: timed[idx].string, time: engine.now() - outLat, grade })
      if (delta !== undefined) deltas.push(delta)
      const timing = delta === undefined || Math.abs(delta) < 0.02 ? '' : delta > 0 ? ' · late' : ' · early'
      say(grade === 'miss' ? 'MISS' : grade.toUpperCase() + (grade === 'good' ? timing : ''), `g-${grade}`)
    }

    const offNote = engine.onNote((ev) => {
      if (ev.type !== 'on') return
      const r = sc.onNote(ev.midi, ev.time - latency())
      if (!r) return
      if (r.kind === 'wrong') say(`You played ${r.played}, needed ${r.needed}`, 'g-wrong')
      else onGrade(r.idx, r.grade, r.delta)
    })

    const end = t0 + totalBeats * spb + 0.8
    let raf = 0
    let lastTarget = -1
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = engine.now()
      for (const j of sc.tick(now - latency())) onGrade(j.idx, j.grade)
      const beat = Math.floor((now - outLat - t0) / spb)
      setHud({ score: sc.score, combo: sc.combo, mult: sc.multiplier(), beat })
      const nextIdx = sc.grades.findIndex((g) => g === null)
      if (nextIdx !== lastTarget) {
        lastTarget = nextIdx
        const n = timed[nextIdx]
        setTarget(n ? [{ string: n.string, fret: n.fret, kind: 'target', label: String(n.fret) }] : [])
      }
      if (now > end) {
        cancelAnimationFrame(raf)
        onDone(sc.summary(), deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null)
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      offNote()
      bus.disconnect()
    }
    // A session runs once per mount; parent remounts with a new key to retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const countIn = chart.beatsPerBar
  const counting = hud.beat < 0 && hud.beat >= -countIn
  const marks: Mark[] = [...target, ...marksForMidi(playing, 'played').slice(0, 2)]

  return (
    <div className="screen play">
      <div className="hud">
        <button className="ghost" onClick={onQuit}>✕</button>
        <div className="hud-title">{level.title}</div>
        <div className="hud-score">{hud.score.toLocaleString()}</div>
        <div className={`hud-combo ${hud.mult > 1 ? 'hot' : ''}`}>
          {hud.combo} combo {hud.mult > 1 && <b>×{hud.mult}</b>}
        </div>
      </div>
      <div className="stage">
        <Highway state={hw} />
        {counting && <div className="countin">{hud.beat + countIn + 1}</div>}
        {feedback && (
          <div key={feedback.id} className={`feedback ${feedback.cls}`}>
            {feedback.text}
          </div>
        )}
        <div className="now-playing">
          {playing !== null ? (
            <>
              <span>hearing</span> <b>{midiToName(playing, false)}</b>
            </>
          ) : (
            <span>…</span>
          )}
        </div>
      </div>
      <div className="play-neck">
        <Fretboard marks={marks} compact />
        <div className="legend">
          <span className="lg-target">● next note</span> <span className="lg-played">● what you're playing</span>
          {STRINGS.map((s) => <span key={s.name} style={{ color: s.color }}>{s.name}</span>)}
        </div>
      </div>
    </div>
  )
}
