import { useEffect, useRef, useState } from 'react'
import { DRUM_STYLES, playChordStab, playDrumStep, type Backing, type DrumStyle } from '../audio/band'
import { engine } from '../audio/engine'
import { chartToTab, timeChart } from '../game/chart'
import { nextLevel, type Level } from '../game/path/worlds'
import { getProgress, recordRun } from '../game/progress'
import { NORMAL_WINDOWS, ROOKIE_WINDOWS, Scorer, type Grade, type ScoreSummary } from '../game/scorer'
import { midiToName, sameNoteForgiving, STRINGS } from '../music/notes'
import { Fretboard, marksForMidi, type Mark } from './Fretboard'
import { Highway, type HighwayState } from './Highway'
import { useCurrentNote, useEngine } from './hooks'

const SPEEDS = [0.5, 0.75, 0.9, 1]
const BACKINGS: { id: Backing; label: string }[] = [
  { id: 'click', label: '⏱ Click' },
  { id: 'drums', label: '🥁 Drums' },
  { id: 'band', label: '🎸 Full band' },
]

interface Props {
  level: Level
  onExit: () => void
  onSetup: () => void
  onLevel: (id: string) => void
}

type Phase =
  | { name: 'intro' }
  | { name: 'playing'; run: number }
  | { name: 'done'; summary: ScoreSummary; xp: number; avgDelta: number | null; latencyAdjustMs: number }

export function Play({ level, onExit, onSetup, onLevel }: Props) {
  const e = useEngine()
  const [speed, setSpeed] = useState(1)
  const [rookie, setRookie] = useState(true)
  const [wait, setWait] = useState(true)
  const [backing, setBackingState] = useState<Backing>(() => (localStorage.getItem('bh.backing') as Backing | null) ?? 'drums')
  const [style, setStyle] = useState<DrumStyle>(level.style ?? 'rock')
  const setBacking = (b: Backing) => {
    localStorage.setItem('bh.backing', b)
    setBackingState(b)
  }
  const [phase, setPhase] = useState<Phase>({ name: 'intro' })
  const runs = useRef(0)

  useEffect(() => {
    setPhase({ name: 'intro' })
    setStyle(level.style ?? 'rock')
  }, [level.id, level.style])

  if (phase.name === 'playing') {
    return (
      <Session
        key={phase.run}
        level={level}
        speed={speed}
        rookie={rookie}
        wait={wait}
        backing={backing}
        style={style}
        onQuit={() => setPhase({ name: 'intro' })}
        onDone={(summary, avgDelta, latencyAdjustMs) => {
          const xp = recordRun(level.id, summary)
          setPhase({ name: 'done', summary, xp, avgDelta, latencyAdjustMs })
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
    const { summary: s, xp, avgDelta, latencyAdjustMs } = phase
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
        {Math.abs(latencyAdjustMs) >= 15 && (
          <p className="muted">🎯 Latency auto-adjusted by {latencyAdjustMs > 0 ? '+' : ''}{latencyAdjustMs} ms — timing will feel fairer next time.</p>
        )}
        {s.stars < 2 && <p className="muted">Next level unlocked anyway. Come back for 2★+ when you feel ready — repetition is how it sticks.</p>}
        <div className="row center">
          <button className="primary" onClick={start}>↻ Retry</button>
          {next && <button className="primary" onClick={() => onLevel(next.id)}>Next: {next.title} →</button>}
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
          <input type="checkbox" checked={wait} onChange={(ev) => setWait(ev.target.checked)} /> 🐢 Wait for me (highway stops until you play the note)
        </label>
        <label className="check">
          <input type="checkbox" checked={rookie} onChange={(ev) => setRookie(ev.target.checked)} /> Rookie timing (wider windows)
        </label>
        <span className="muted">{Math.round(level.chart.bpm * speed)} BPM</span>
      </section>
      <section className="card">
        <h2>Backing band</h2>
        <div className="row">
          <div className="seg">
            {BACKINGS.map((b) => (
              <button key={b.id} className={b.id === backing ? 'on' : ''} onClick={() => setBacking(b.id)}>
                {b.label}
              </button>
            ))}
          </div>
          {backing !== 'click' && (
            <div className="seg">
              {DRUM_STYLES.map((d) => (
                <button key={d.id} className={d.id === style ? 'on' : ''} onClick={() => setStyle(d.id)}>
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {backing !== 'click' && e.source?.kind === 'mic' && (
          <p className="muted">🎧 Headphones recommended. Otherwise keep the band quieter than your amp so the mic hears your bass, not the drums.</p>
        )}
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
  wait: boolean
  backing: Backing
  style: DrumStyle
  onDone: (s: ScoreSummary, avgDelta: number | null, latencyAdjustMs: number) => void
  onQuit: () => void
}

type Feedback = { text: string; cls: string; id: number }

function Session({ level, speed, rookie, wait, backing, style, onDone, onQuit }: SessionProps) {
  const chart = level.chart
  const hw = useRef<HighwayState>(null!)
  const scorer = useRef<Scorer>(null!)
  const [hud, setHud] = useState({ score: 0, combo: 0, mult: 1, beat: -99, waiting: false })
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
    // Note times live on a "game clock". In wait mode the game clock stops at an unplayed note;
    // `paused` is how far it lags the audio clock. In timed mode paused stays 0.
    const timed = timeChart(chart, t0, bpm, countIn)
    const sc = new Scorer(timed, rookie ? ROOKIE_WINDOWS : NORMAL_WINDOWS)
    scorer.current = sc
    const outLat = engine.outputLatency()
    const baseLatency = (engine.profile?.latencyMs ?? 0) / 1000
    let paused = 0
    let frozenAudio: number | null = null
    let frozenGame = 0
    const gameNow = () => (frozenAudio !== null ? frozenGame : engine.now() - paused)

    // Latency learning: raw offsets (before correction) of correct notes from their targets;
    // the correction is their recent median, so it can't feed back on itself.
    const offsets: number[] = []
    let adapt = 0
    const learn = (d: number) => {
      offsets.push(d)
      const recent = offsets.slice(-8).sort((a, b) => a - b)
      if (recent.length >= 3) adapt = Math.max(-0.3, Math.min(0.3, recent[Math.floor(recent.length / 2)]))
    }
    const deltas: number[] = []

    const bus = ctx.createGain()
    bus.connect(ctx.destination)
    const beatTimes = Array.from({ length: totalBeats }, (_, i) => t0 + i * spb)

    // Band: 16th-note steps on the game clock. Count-in is always sticks/clicks.
    const stepDur = spb / 4
    const totalSteps = totalBeats * 4
    const bars = Math.ceil(chart.lengthBeats / chart.beatsPerBar)
    const barRoots: (number | null)[] = []
    for (let b = 0; b < bars; b++) {
      const inBar = timed.filter((n) => Math.floor(chart.notes[n.idx].t / chart.beatsPerBar) === b)
      barRoots.push(inBar.length ? Math.min(...inBar.map((n) => n.midi)) : (barRoots[b - 1] ?? null))
    }
    const playStep = (step: number, at: number) => {
      const countSteps = countIn * 4
      if (step < countSteps || backing === 'click') {
        if (step % 4 === 0) engine.click(at, (step / 4) % chart.beatsPerBar === 0, bus)
        return
      }
      const songStep = step - countSteps
      playDrumStep(ctx, style, songStep % 16, at, bus)
      if (backing === 'band' && songStep % 4 === 0) {
        const root = barRoots[Math.floor(songStep / 4 / chart.beatsPerBar)]
        if (root !== null && root !== undefined) playChordStab(ctx, root, at, spb * 0.85, bus)
      }
    }
    let nextStep = 0

    const bursts: HighwayState['bursts'] = []
    hw.current = {
      notes: timed,
      grades: sc.grades,
      now: () => gameNow() - outLat,
      beatTimes: beatTimes.slice(countIn),
      beatsPerBar: chart.beatsPerBar,
      showNames: !!level.showNames,
      bursts,
    }

    const say = (text: string, cls: string) => setFeedback({ text, cls, id: ++fbId.current })
    const onGrade = (idx: number, grade: Grade, delta?: number) => {
      if (grade !== 'miss') bursts.push({ string: timed[idx].string, time: gameNow() - outLat, grade })
      if (delta !== undefined) deltas.push(delta)
      const timing = delta === undefined || Math.abs(delta) < 0.02 ? '' : delta > 0 ? ' · late' : ' · early'
      say(grade === 'miss' ? 'MISS' : grade.toUpperCase() + (grade === 'good' ? timing : ''), `g-${grade}`)
    }

    const offNote = engine.onNote((ev) => {
      if (ev.type !== 'on') return
      if (frozenAudio !== null) {
        const next = sc.nextUnjudged()
        if (!next) return
        if (sameNoteForgiving(ev.midi, next.midi)) {
          // Played within the normal window after the freeze still counts by timing.
          const late = ev.time - baseLatency - frozenAudio
          const grade: Grade = late <= sc.windows.perfect ? 'perfect' : 'good'
          sc.hit(next.idx, grade)
          onGrade(next.idx, grade, late <= sc.windows.good ? late : undefined)
          paused += engine.now() - frozenAudio
          frozenAudio = null
        } else say(`You played ${midiToName(ev.midi, false)}, needed ${midiToName(next.midi, false)}`, 'g-wrong')
        return
      }
      const t = ev.time - baseLatency - paused
      const d = sc.nearestSamePitchDelta(ev.midi, t, 0.4)
      const r = sc.onNote(ev.midi, t - adapt)
      if (d !== null) learn(d)
      if (!r) return
      if (r.kind === 'wrong') say(`You played ${r.played}, needed ${r.needed}`, 'g-wrong')
      else onGrade(r.idx, r.grade, r.delta)
    })

    let raf = 0
    let lastTarget = -1
    let finished = false
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const g = gameNow()
      const next = sc.nextUnjudged()
      if (wait) {
        // Hold the highway when the next note reaches the line unplayed.
        // Freeze with the gem sitting exactly on the hit line (past it, perspective hides it).
        if (frozenAudio === null && next && g - adapt >= next.time) {
          frozenGame = next.time + adapt
          frozenAudio = engine.now()
          say('Waiting for you…', 'g-wait')
        }
      } else {
        for (const j of sc.tick(g - adapt)) onGrade(j.idx, j.grade)
      }
      // The band follows the game clock, so it pauses and resumes with you.
      while (frozenAudio === null && nextStep < totalSteps && t0 + nextStep * stepDur < g + 0.1) {
        const st = t0 + nextStep * stepDur
        if (st >= g - 0.02) playStep(nextStep, st + paused)
        nextStep++
      }
      const beat = Math.floor((g - outLat - t0) / spb)
      setHud({ score: sc.score, combo: sc.combo, mult: sc.multiplier(), beat, waiting: frozenAudio !== null })
      const nextIdx = next ? next.idx : -1
      if (nextIdx !== lastTarget) {
        lastTarget = nextIdx
        setTarget(next ? [{ string: next.string, fret: next.fret, kind: 'target', label: String(next.fret) }] : [])
      }
      if (!finished && !next && g > beatTimes[beatTimes.length - 1] + spb + 0.8) {
        finished = true
        cancelAnimationFrame(raf)
        if (offsets.length >= 6 && Math.abs(adapt) >= 0.015) {
          engine.updateProfile({ latencyMs: Math.round((baseLatency + adapt) * 1000) })
        }
        onDone(sc.summary(), deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null, Math.round(adapt * 1000))
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
        {hud.waiting && target[0] && (
          <div className="wait-banner">
            Play <b>{target[0].fret === 0 ? 'open' : `fret ${target[0].fret} on`} {STRINGS[target[0].string].name}</b> to continue
          </div>
        )}
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
