import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DRUM_STYLES, playChordStab, playDrumStep, type Backing, type DrumStyle } from '../audio/band'
import { engine } from '../audio/engine'
import { chartToTab, stretchAfter, timeChart } from '../game/chart'
import { nextLevel, type Level } from '../game/path/worlds'
import { getProgress, recordRun } from '../game/progress'
import { NORMAL_WINDOWS, ROOKIE_WINDOWS, Scorer, type Grade, type ScoreSummary } from '../game/scorer'
import { keyName } from '../jam/theory'
import { barChordRoots, chartKeyNotes, detectKey } from '../music/key'
import { midiToName, sameNoteForgiving, STRINGS } from '../music/notes'
import { Fretboard, marksForMidi, type Mark } from './Fretboard'
import { Highway, type HighwayState } from './Highway'
import { useCurrentNote, useEngine } from './hooks'

const SPEEDS = [0.5, 0.6, 0.75, 0.9, 1, 1.1]
const BACKINGS: { id: Backing; label: string }[] = [
  { id: 'click', label: '⏱ Click' },
  { id: 'drums', label: '🥁 Drums' },
  { id: 'band', label: '🎸 Full band' },
]
const SOLO_BACKINGS: { id: Backing; label: string }[] = [
  { id: 'click', label: '⏱ Click' },
  { id: 'silent', label: '🤫 Nothing, just me' },
]

interface Props {
  level: Level
  onExit: () => void
  onSetup: () => void
  onLevel: (id: string) => void
  /** Overrides the Path's "next level" (Solo Stage: the next phrase). null = none. */
  next?: { title: string; go: () => void } | null
  exitLabel?: string
  /** Extra controls on the intro screen, under the explainer (Solo Stage: Listen). */
  extra?: ReactNode
}

type Phase =
  | { name: 'intro' }
  | { name: 'playing'; run: number }
  | { name: 'done'; summary: ScoreSummary; xp: number; avgDelta: number | null }

/** Everything that can be changed before a run, between runs and while playing. */
export interface PlaySettings {
  speed: number
  rookie: boolean
  wait: boolean
  backing: Backing
  style: DrumStyle
}

const flag = (key: string, fallback: boolean) => {
  const v = localStorage.getItem(key)
  return v === null ? fallback : v === '1'
}

function SettingsPanel({ s, set, bpm, compact = false, solo = false }: { s: PlaySettings; set: (p: Partial<PlaySettings>) => void; bpm: number; compact?: boolean; solo?: boolean }) {
  return (
    <div className={compact ? 'live-controls' : 'settings-panel'}>
      <div className="row">
        <div className="seg">
          {SPEEDS.map((sp) => (
            <button key={sp} className={sp === s.speed ? 'on' : ''} onClick={() => set({ speed: sp })}>
              {Math.round(sp * 100)}%
            </button>
          ))}
        </div>
        <span className="muted">{Math.round(bpm * s.speed)} BPM</span>
        <label className="check">
          <input type="checkbox" checked={s.wait} onChange={(ev) => set({ wait: ev.target.checked })} /> 🐢 Wait for me
          {!compact && ' (highway stops until you play the note)'}
        </label>
        <label className="check">
          <input type="checkbox" checked={s.rookie} onChange={(ev) => set({ rookie: ev.target.checked })} /> Rookie timing
          {!compact && ' (wider windows)'}
        </label>
      </div>
      <div className="row">
        <div className="seg">
          {(solo ? SOLO_BACKINGS : BACKINGS).map((b) => (
            <button key={b.id} className={b.id === s.backing ? 'on' : ''} onClick={() => set({ backing: b.id })}>
              {b.label}
            </button>
          ))}
        </div>
        {s.backing !== 'click' && s.backing !== 'silent' && (
          <div className="seg">
            {DRUM_STYLES.map((d) => (
              <button key={d.id} className={d.id === s.style ? 'on' : ''} onClick={() => set({ style: d.id })}>
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


export function Play({ level, onExit, onSetup, onLevel, next: nextOverride, exitLabel = 'Map', extra }: Props) {
  const e = useEngine()
  const [settings, setSettings] = useState<PlaySettings>(() => ({
    speed: 1,
    rookie: flag('bh.rookie', true),
    wait: flag('bh.wait', true),
    backing: level.solo ? 'click' : ((localStorage.getItem('bh.backing') as Backing | null) ?? 'drums'),
    style: level.style ?? 'rock',
  }))
  const set = (patch: Partial<PlaySettings>) => {
    if (patch.backing && !level.solo) localStorage.setItem('bh.backing', patch.backing)
    if (patch.wait !== undefined) localStorage.setItem('bh.wait', patch.wait ? '1' : '0')
    if (patch.rookie !== undefined) localStorage.setItem('bh.rookie', patch.rookie ? '1' : '0')
    setSettings((s) => ({ ...s, ...patch }))
  }
  const [phase, setPhase] = useState<Phase>({ name: 'intro' })
  const runs = useRef(0)

  useEffect(() => {
    setPhase({ name: 'intro' })
    setSettings((s) => ({ ...s, style: level.style ?? 'rock' }))
  }, [level.id, level.style])

  const start = async () => {
    await engine.context()
    runs.current++
    setPhase({ name: 'playing', run: runs.current })
  }

  if (phase.name === 'playing') {
    return (
      <Session
        key={phase.run}
        level={level}
        settings={settings}
        set={set}
        onQuit={() => setPhase({ name: 'intro' })}
        onRestart={start}
        onDone={(summary, avgDelta) => {
          const xp = recordRun(level.id, summary)
          setPhase({ name: 'done', summary, xp, avgDelta })
        }}
      />
    )
  }

  if (phase.name === 'done') {
    const { summary: s, xp, avgDelta } = phase
    const pathNext = nextLevel(level.id)
    const next = nextOverride !== undefined ? nextOverride : pathNext && { title: pathNext.title, go: () => onLevel(pathNext.id) }
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
        {s.stars < 2 && !level.solo && <p className="muted">Next level unlocked anyway. Come back for 2★+ when you feel ready — repetition is how it sticks.</p>}
        <section className="card">
          <h2>Play again with…</h2>
          <SettingsPanel s={settings} set={set} bpm={level.chart.bpm} solo={level.solo} />
        </section>
        <div className="row center">
          <button className="primary" onClick={start}>↻ Retry</button>
          {next && <button className="primary" onClick={next.go}>Next: {next.title} →</button>}
          <button className="ghost" onClick={onExit}>{exitLabel}</button>
        </div>
      </div>
    )
  }

  const best = getProgress().levels[level.id]
  return (
    <div className="screen intro">
      <header className="screen-head">
        <button className="ghost" onClick={onExit}>← {exitLabel}</button>
        <h1>{level.solo ? level.title : `${level.id} · ${level.title}`}</h1>
        {best && <span className="stars">{[1, 2, 3].map((i) => <span key={i} className={i <= best.stars ? 'lit' : ''}>★</span>)}</span>}
      </header>
      <section className="card">
        {level.explain.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="tip">💡 {level.tip}</p>
        {extra}
      </section>
      <section className="card">
        <h2>The tab</h2>
        <p className="muted">Each line is a string (G on top, E at the bottom). Numbers are frets; 0 = open string.</p>
        <pre className="tab">{chartToTab(level.chart).join('\n')}</pre>
        {!level.solo && (
          <p className="muted">Key: <b>{keyName(detectKey(chartKeyNotes(level.chart), level.chart.beatsPerBar))}</b> — the band plays chords from this key.</p>
        )}
      </section>
      <section className="card">
        <h2>Settings</h2>
        <p className="muted">You can change all of these while playing too.</p>
        <SettingsPanel s={settings} set={set} bpm={level.chart.bpm} solo={level.solo} />
        {settings.backing !== 'click' && settings.backing !== 'silent' && e.source?.kind === 'mic' && (
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
  settings: PlaySettings
  set: (p: Partial<PlaySettings>) => void
  onDone: (s: ScoreSummary, avgDelta: number | null) => void
  onQuit: () => void
  onRestart: () => void
}

type Feedback = { text: string; cls: string; id: number }

function Session({ level, settings, set, onDone, onQuit, onRestart }: SessionProps) {
  const chart = level.chart
  const hw = useRef<HighwayState>(null!)
  const scorer = useRef<Scorer>(null!)
  const [hud, setHud] = useState({ score: 0, combo: 0, mult: 1, beat: -99, waiting: false })
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [target, setTarget] = useState<Mark[]>([])
  const playing = useCurrentNote()
  const fbId = useRef(0)
  // The run loop reads the latest settings every frame, so they can change mid-run.
  const live = useRef(settings)
  useEffect(() => {
    live.current = settings
  }, [settings])

  useEffect(() => {
    const ctx = engine.ctx!
    let speed = live.current.speed
    const spb = () => 60 / (chart.bpm * speed)
    const countIn = chart.beatsPerBar
    const t0 = ctx.currentTime + 0.6
    const totalBeats = countIn + Math.ceil(chart.lengthBeats)
    // Note times live on a "game clock". In wait mode the game clock stops at an unplayed note;
    // `paused` is how far it lags the audio clock. In timed mode paused stays 0.
    // A tempo change mid-run stretches every time still ahead (notes, beats, band steps).
    const timed = timeChart(chart, t0, chart.bpm * speed, countIn)
    const windowsFor = (rookie: boolean) => (rookie ? ROOKIE_WINDOWS : NORMAL_WINDOWS)
    const sc = new Scorer(timed, windowsFor(live.current.rookie))
    scorer.current = sc
    const outLat = engine.outputLatency()
    const latency = (engine.profile?.latencyMs ?? 0) / 1000
    let paused = 0
    let frozenAudio: number | null = null
    let frozenGame = 0
    const gameNow = () => (frozenAudio !== null ? frozenGame : engine.now() - paused)
    const deltas: number[] = []

    const bus = ctx.createGain()
    bus.connect(ctx.destination)
    const beatTimes = Array.from({ length: totalBeats }, (_, i) => t0 + i * spb())

    // Band: 16th-note steps on the game clock. Count-in is always sticks/clicks.
    const totalSteps = totalBeats * 4
    const stepTimes = Array.from({ length: totalSteps }, (_, i) => t0 + (i * spb()) / 4)
    const bars = Math.ceil(chart.lengthBeats / chart.beatsPerBar)
    const keyNotes = chartKeyNotes(chart)
    const barRoots = barChordRoots(keyNotes, detectKey(keyNotes, chart.beatsPerBar), chart.beatsPerBar, bars)
    const playStep = (step: number, at: number) => {
      const countSteps = countIn * 4
      const { backing, style } = live.current
      if (step >= countSteps && backing === 'silent') return
      if (step < countSteps || backing === 'click') {
        if (step % 4 === 0) engine.click(at, (step / 4) % chart.beatsPerBar === 0, bus)
        return
      }
      const songStep = step - countSteps
      playDrumStep(ctx, style, songStep % 16, at, bus)
      if (backing === 'band' && songStep % 4 === 0) {
        const root = barRoots[Math.floor(songStep / 4 / chart.beatsPerBar)]
        if (root !== null && root !== undefined) playChordStab(ctx, root, at, spb() * 0.85, bus)
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
          const late = ev.time - latency - frozenAudio
          const grade: Grade = late <= sc.windows.perfect ? 'perfect' : 'good'
          sc.hit(next.idx, grade)
          onGrade(next.idx, grade, late <= sc.windows.good ? late : undefined)
          paused += engine.now() - frozenAudio
          frozenAudio = null
        } else say(`You played ${midiToName(ev.midi, false)}, needed ${midiToName(next.midi, false)}`, 'g-wrong')
        return
      }
      const r = sc.onNote(ev.midi, ev.time - latency - paused)
      if (!r) return
      if (r.kind === 'wrong') say(`You played ${r.played}, needed ${r.needed}`, 'g-wrong')
      else onGrade(r.idx, r.grade, r.delta)
    })

    const noteTimes = () => timed.map((n) => n.time)
    const changeSpeed = (to: number, pivot: number) => {
      const factor = speed / to
      speed = to
      const nt = noteTimes()
      stretchAfter(nt, pivot, factor)
      timed.forEach((n, i) => (n.time = nt[i]))
      stretchAfter(beatTimes, pivot, factor)
      hw.current.beatTimes = beatTimes.slice(countIn)
      stretchAfter(stepTimes, pivot, factor)
    }

    let raf = 0
    let lastTarget = -1
    let beatIdx = -1
    let finished = false
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const cfg = live.current
      if (cfg.speed !== speed) changeSpeed(cfg.speed, gameNow())
      sc.windows = windowsFor(cfg.rookie)
      if (!cfg.wait && frozenAudio !== null) {
        // Wait mode switched off while held: let the clock run again.
        paused += engine.now() - frozenAudio
        frozenAudio = null
      }
      const g = gameNow()
      const next = sc.nextUnjudged()
      if (cfg.wait) {
        // Hold the highway when the next note reaches the line unplayed.
        // Freeze with the gem sitting exactly on the hit line (past it, perspective hides it).
        if (frozenAudio === null && next && g >= next.time) {
          frozenGame = next.time
          frozenAudio = engine.now()
          say('Waiting for you…', 'g-wait')
        }
      } else {
        for (const j of sc.tick(g)) onGrade(j.idx, j.grade)
      }
      // The band follows the game clock, so it pauses and resumes with you.
      while (frozenAudio === null && nextStep < totalSteps && stepTimes[nextStep] < g + 0.1) {
        const st = stepTimes[nextStep]
        if (st >= g - 0.02) playStep(nextStep, st + paused)
        nextStep++
      }
      while (beatIdx + 1 < beatTimes.length && beatTimes[beatIdx + 1] <= g - outLat) beatIdx++
      const beat = beatIdx < 0 ? -99 : beatIdx - countIn
      setHud({ score: sc.score, combo: sc.combo, mult: sc.multiplier(), beat, waiting: frozenAudio !== null })
      const nextIdx = next ? next.idx : -1
      if (nextIdx !== lastTarget) {
        lastTarget = nextIdx
        setTarget(next ? [{ string: next.string, fret: next.fret, kind: 'target', label: String(next.fret) }] : [])
      }
      if (!finished && !next && g > beatTimes[beatTimes.length - 1] + spb() + 0.8) {
        finished = true
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
        <button className="ghost" onClick={onQuit} title="Back to the level screen">✕</button>
        <button className="ghost" onClick={onRestart} title="Start this level again from the top">↻ Restart</button>
        <div className="hud-title">{level.title}</div>
        <div className="hud-score">{hud.score.toLocaleString()}</div>
        <div className={`hud-combo ${hud.mult > 1 ? 'hot' : ''}`}>
          {hud.combo} combo {hud.mult > 1 && <b>×{hud.mult}</b>}
        </div>
      </div>
      <SettingsPanel s={settings} set={set} bpm={chart.bpm} compact solo={level.solo} />
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
