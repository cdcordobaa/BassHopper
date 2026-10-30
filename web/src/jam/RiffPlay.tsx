import { useEffect, useRef, useState } from 'react'
import { riffTab } from './tab'
import { engine } from '../audio/engine'
import { timeChart, type Chart } from '../game/chart'
import { NORMAL_WINDOWS, ROOKIE_WINDOWS, Scorer, type Grade, type ScoreSummary } from '../game/scorer'
import { midiToName, STRINGS } from '../music/notes'
import { Fretboard, marksForMidi, type Mark } from '../ui/Fretboard'
import { Highway, type HighwayState } from '../ui/Highway'
import { useCurrentNote, useEngine } from '../ui/hooks'
import { Backing, BEATS_PER_BAR, defaultOptions } from './backing'
import { loopChart, type RiffChart } from './riffs'
import { findStyle } from './styles'
import { keyName } from './theory'
import { ensureTone } from './tone'
import './jam.css'

const SPEEDS = [0.5, 0.75, 0.9, 1]

interface Props {
  chart: Chart | RiffChart
  onExit: () => void
  onSetup?: () => void
}

type Phase = { name: 'intro' } | { name: 'playing'; run: number } | { name: 'done'; summary: ScoreSummary }

/** Plays a saved riff on the highway with scoring, optionally over the band it was jammed with. */
export function RiffPlay({ chart, onExit, onSetup }: Props) {
  const e = useEngine()
  const jam = 'jam' in chart ? chart.jam : undefined
  const [speed, setSpeed] = useState(1)
  const [rookie, setRookie] = useState(true)
  const [band, setBand] = useState(!!jam)
  const [loops, setLoops] = useState(2)
  const [phase, setPhase] = useState<Phase>({ name: 'intro' })
  const runs = useRef(0)

  if (phase.name === 'playing') {
    return (
      <RiffSession
        key={phase.run}
        chart={chart}
        speed={speed}
        rookie={rookie}
        band={band}
        loops={loops}
        onQuit={() => setPhase({ name: 'intro' })}
        onDone={(summary) => setPhase({ name: 'done', summary })}
      />
    )
  }

  const start = async () => {
    await engine.context()
    if (band && jam) await ensureTone()
    runs.current++
    setPhase({ name: 'playing', run: runs.current })
  }

  if (phase.name === 'done') {
    const s = phase.summary
    return (
      <div className="screen results">
        <h1>{chart.title}</h1>
        <div className="stars big">{[1, 2, 3].map((i) => <span key={i} className={i <= s.stars ? 'lit' : ''}>★</span>)}</div>
        <div className="result-grid">
          <div><b>{Math.round(s.accuracy * 100)}%</b>accuracy</div>
          <div><b>{s.score}</b>score</div>
          <div><b>{s.maxCombo}</b>best combo</div>
          <div><b>{s.total}</b>notes</div>
        </div>
        <p className="muted">
          <span className="g-perfect">{s.perfect} perfect</span> · <span className="g-good">{s.good} good</span> · <span className="g-miss">{s.miss} miss</span>
        </p>
        <p>{s.stars >= 2 ? 'You own this riff now.' : 'Your own riff — try it slower until it sits.'}</p>
        <div className="row center">
          <button className="primary" onClick={start}>↻ Again</button>
          <button className="ghost" onClick={onExit}>Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen intro">
      <header className="screen-head">
        <button className="ghost" onClick={onExit}>← Back</button>
        <h1>{chart.title}</h1>
        <span className="muted">{Math.round(chart.bpm * speed)} BPM</span>
      </header>
      <section className="card">
        <h2>The tab</h2>
        {jam && (
          <p className="muted">
            Jammed in {keyName({ tonic: jam.tonic, mode: jam.mode })} over a {findStyle(jam.style).name.toLowerCase()} groove.
          </p>
        )}
        <pre className="tab">{riffTab(chart, 4).join('\n')}</pre>
      </section>
      <section className="card row">
        <div className="seg">
          {SPEEDS.map((sp) => (
            <button key={sp} className={sp === speed ? 'on' : ''} onClick={() => setSpeed(sp)}>
              {Math.round(sp * 100)}%
            </button>
          ))}
        </div>
        <div className="seg" title="How many times the riff repeats">
          {[1, 2, 4].map((n) => (
            <button key={n} className={n === loops ? 'on' : ''} onClick={() => setLoops(n)}>
              ×{n}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={rookie} onChange={(ev) => setRookie(ev.target.checked)} /> Rookie timing
        </label>
        {jam && (
          <label className="check">
            <input type="checkbox" checked={band} onChange={(ev) => setBand(ev.target.checked)} /> Play with the band
          </label>
        )}
      </section>
      {!e.source && (
        <p className="warn">
          No input connected — the game can't hear you. {onSetup && <button onClick={onSetup}>Set up input</button>}
        </p>
      )}
      <div className="row center">
        <button className="primary huge" onClick={start}>▶ Play</button>
      </div>
    </div>
  )
}

interface SessionProps {
  chart: Chart | RiffChart
  speed: number
  rookie: boolean
  band: boolean
  loops: number
  onDone: (s: ScoreSummary) => void
  onQuit: () => void
}

type Feedback = { text: string; cls: string; id: number }

function RiffSession({ chart: riff, speed, rookie, band, loops, onDone, onQuit }: SessionProps) {
  const jam = 'jam' in riff ? riff.jam : undefined
  const [chart] = useState(() => loopChart(riff, loops))
  const hw = useRef<HighwayState>(null!)
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
    const outLat = engine.outputLatency()
    const latency = () => (engine.profile?.latencyMs ?? 0) / 1000

    const bus = ctx.createGain()
    bus.connect(ctx.destination)
    const beatTimes: number[] = []
    for (let i = 0; i < totalBeats; i++) beatTimes.push(t0 + i * spb)

    let backing: Backing | null = null
    if (band && jam) {
      backing = new Backing({
        ...defaultOptions(jam.style),
        progressionId: jam.progressionId,
        tonic: jam.tonic,
        barsPerChord: jam.barsPerChord,
        bpm,
        volume: 0.6,
      })
      // Count-in bar is the band's hi-hat ticks; bar 0 lines up with the chart's first beat.
      void backing.start(t0 + countIn * spb, countIn / BEATS_PER_BAR, jam.startBar)
    } else {
      beatTimes.forEach((t, i) => engine.click(t, i % chart.beatsPerBar === 0, bus))
    }

    const bursts: HighwayState['bursts'] = []
    hw.current = {
      notes: timed,
      grades: sc.grades,
      now: () => engine.now() - outLat,
      beatTimes: beatTimes.slice(countIn),
      beatsPerBar: chart.beatsPerBar,
      showNames: true,
      bursts,
    }

    const say = (text: string, cls: string) => setFeedback({ text, cls, id: ++fbId.current })
    const onGrade = (idx: number, grade: Grade, delta?: number) => {
      if (grade !== 'miss') bursts.push({ string: timed[idx].string, time: engine.now() - outLat, grade })
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
        backing?.stop()
        onDone(sc.summary())
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      offNote()
      bus.disconnect()
      backing?.dispose()
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
        <div className="hud-title">{chart.title}</div>
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
