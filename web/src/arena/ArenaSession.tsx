import { useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { beatToSec, type TimedNote } from '../game/chart'
import { NORMAL_WINDOWS, ROOKIE_WINDOWS, Scorer, type Grade, type ScoreSummary } from '../game/scorer'
import { midiToName, positionToMidi, STRINGS } from '../music/notes'
import { Fretboard, marksForMidi, type Mark } from '../ui/Fretboard'
import { Highway, type HighwayState } from '../ui/Highway'
import { useCurrentNote } from '../ui/hooks'
import type { Song, SongChart } from './api'
import { deriveDifficulty, type Difficulty } from './difficulty'
import { SongPlayer } from './player'
import { loopPassOver, tapOffset, type LoopRange } from './sync'
import { OffsetNudge } from './OffsetNudge'
import './arena.css'

export interface Mix {
  band: number
  guide: number
  duck: boolean
}

interface Props {
  song: Song
  chart: SongChart
  difficulty: Difficulty
  speed: number
  loop: LoopRange | null
  mix: Mix
  onOffset: (offsetSec: number) => void
  onDone: (s: ScoreSummary, avgDelta: number | null) => void
  onQuit: () => void
}

type Feedback = { text: string; cls: string; id: number }

interface Hud {
  score: number
  combo: number
  mult: number
  countdown: number
  pass: number
  lastPass: number | null
  paused: boolean
  status: string | null
  tapHint: number | null
  taps: number
}

/** Seconds of song played before the first note (or loop start), so you can find the groove. */
const LEAD_REAL_SEC = 3

export function ArenaSession({ song, chart, difficulty, speed, loop, mix, onOffset, onDone, onQuit }: Props) {
  const hw = useRef<HighwayState>(null!)
  const ctl = useRef<{ nudge: (sec: number) => void; togglePause: () => void; tap: () => void; applyTap: () => void } | null>(null)
  const playerRef = useRef<SongPlayer | null>(null)
  const [hud, setHud] = useState<Hud>({ score: 0, combo: 0, mult: 1, countdown: 0, pass: 1, lastPass: null, paused: false, status: 'Loading audio…', tapHint: null, taps: 0 })
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [target, setTarget] = useState<Mark[]>([])
  const [offsetSec, setOffsetSec] = useState(song.offsetSec)
  const [error, setError] = useState<string | null>(null)
  const [volumes, setVolumes] = useState(mix)
  const playing = useCurrentNote()
  const fbId = useRef(0)

  useEffect(() => {
    const ctx = engine.ctx!
    const played = deriveDifficulty(chart, difficulty)
    const range = loop ?? { name: 'Whole song', startBeat: 0, endBeat: chart.lengthBeats }
    const notes = played.notes.filter((n) => n.t >= range.startBeat && n.t < range.endBeat)
    const noteSec = notes.map((n) => beatToSec(chart, n.t))
    const gridStart = Math.floor(range.startBeat / chart.beatsPerBar) * chart.beatsPerBar
    const gridSec: number[] = []
    for (let b = gridStart; b <= Math.ceil(range.endBeat); b++) gridSec.push(beatToSec(chart, b))
    const endSec = beatToSec(chart, range.endBeat)
    const firstSec = noteSec.length ? noteSec[0] : beatToSec(chart, range.startBeat)

    const player = new SongPlayer(ctx, song, speed, { band: mix.band, guide: mix.guide })
    const bus = ctx.createGain()
    bus.connect(ctx.destination)
    playerRef.current = player
    const outLat = engine.outputLatency()
    const latency = () => (engine.profile?.latencyMs ?? 0) / 1000
    const vnow = () => engine.now() - outLat
    let offset = song.offsetSec
    const toCtx = (sec: number) => player.clock.toCtx(offset + sec)

    const windows = difficulty === 'rookie' ? ROOKIE_WINDOWS : NORMAL_WINDOWS
    const deltas: number[] = []
    const bursts: HighwayState['bursts'] = []
    const beatTimes = gridSec.map(() => 0)
    let timed: TimedNote[] = []
    let sc = new Scorer([], windows)
    let pass = 1
    let lastPass: number | null = null
    let paused = false
    let started = false
    let finished = false
    let restartOnResume = false
    let clicks: OscillatorNode[] = []
    let taps: number[] = []
    let tapHint: number | null = null

    const retime = () => {
      for (let i = 0; i < timed.length; i++) timed[i].time = toCtx(noteSec[i])
      for (let i = 0; i < gridSec.length; i++) beatTimes[i] = toCtx(gridSec[i])
    }

    const say = (text: string, cls: string) => setFeedback({ text, cls, id: ++fbId.current })
    const onGrade = (idx: number, grade: Grade, delta?: number) => {
      if (grade !== 'miss') bursts.push({ string: timed[idx].string, time: vnow(), grade })
      if (bursts.length > 32) bursts.splice(0, bursts.length - 32)
      if (delta !== undefined) deltas.push(delta)
      if (mix.duck) player.duck(grade === 'miss')
      const timing = delta === undefined || Math.abs(delta) < 0.02 ? '' : delta > 0 ? ' · late' : ' · early'
      say(grade === 'miss' ? 'MISS' : grade.toUpperCase() + (grade === 'good' ? timing : ''), `g-${grade}`)
    }

    const cancelClicks = () => {
      for (const c of clicks) c.disconnect()
      clicks = []
    }

    const startPass = () => {
      cancelClicks()
      timed = notes.map((n, idx) => ({ idx, time: 0, midi: positionToMidi(n.string, n.fret), string: n.string, fret: n.fret }))
      sc = new Scorer(timed, windows)
      bursts.length = 0
      player.duck(false)
      const leadSong = Math.max(LEAD_REAL_SEC * speed, beatToSec(chart, chart.beatsPerBar))
      const from = loop ? offset + firstSec - leadSong : Math.min(0, offset + firstSec - leadSong)
      const startAt = player.start(from)
      retime()
      // Count-in clicks only over the silent lead (before the audio itself starts).
      for (let b = -1; b > -16; b--) {
        const t = toCtx(beatToSec(chart, range.startBeat + b))
        if (t >= startAt - 0.01) continue
        if (t < ctx.currentTime + 0.05) break
        const c = engine.click(t, (range.startBeat + b) % chart.beatsPerBar === 0, bus)
        if (c) clicks.push(c)
      }
      hw.current = {
        notes: timed,
        grades: sc.grades,
        now: vnow,
        beatTimes,
        beatsPerBar: chart.beatsPerBar,
        showNames: difficulty === 'rookie',
        bursts,
      }
    }

    const offNote = engine.onNote((ev) => {
      if (ev.type !== 'on' || paused || !started) return
      const r = sc.onNote(ev.midi, ev.time - latency())
      if (!r) return
      if (r.kind === 'wrong') {
        say(`You played ${r.played}, needed ${r.needed}`, 'g-wrong')
        if (mix.duck) player.duck(true)
      } else onGrade(r.idx, r.grade, r.delta)
    })

    ctl.current = {
      nudge: (sec) => {
        offset = Math.round((offset + sec) * 1000) / 1000
        retime()
        setOffsetSec(offset)
        onOffset(offset)
      },
      togglePause: () => {
        if (!started) return
        paused = !paused
        if (paused) {
          // Mid count-in the clicks are already on the audio clock: drop them and redo the lead on resume.
          if (player.starting) {
            restartOnResume = true
            cancelClicks()
          }
          player.pause()
        } else if (restartOnResume) {
          restartOnResume = false
          startPass()
        } else player.resume()
      },
      tap: () => {
        taps = [...taps.slice(-23), engine.now() - outLat]
        const d = tapOffset(taps, beatTimes)
        // Ctx seconds → song seconds.
        tapHint = d === null ? null : Math.round(d * speed * 1000) / 1000
      },
      applyTap: () => {
        if (tapHint === null) return
        const d = tapHint
        taps = []
        tapHint = null
        ctl.current?.nudge(d)
      },
    }

    let raf = 0
    let lastTarget = -1
    let lastZero = NaN
    const finish = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(raf)
      onDone(sc.summary(), deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null)
    }

    const loopFrame = () => {
      raf = requestAnimationFrame(loopFrame)
      const now = engine.now()
      if (!paused) {
        player.sample()
        const zero = player.clock.toCtx(0)
        if (Math.abs(zero - lastZero) > 0.0005) {
          lastZero = zero
          retime()
        }
        for (const j of sc.tick(now - latency())) onGrade(j.idx, j.grade)
      }
      const endAt = toCtx(endSec)
      const over = loop ? loopPassOver(now, latency(), endAt, windows.good) : now - outLat > endAt + 2
      if (!paused && over) {
        if (loop) {
          lastPass = sc.summary().accuracy
          pass++
          startPass()
        } else finish()
      }
      if (!loop && player.band.ended) finish()
      const firstAt = timed.length ? timed[0].time : endAt
      const toFirst = firstAt - (now - outLat)
      setHud({
        score: sc.score,
        combo: sc.combo,
        mult: sc.multiplier(),
        countdown: toFirst > 0 && toFirst < 3.5 && sc.grades[0] === null ? Math.ceil(toFirst) : 0,
        pass,
        lastPass,
        paused,
        status: null,
        tapHint,
        taps: taps.length,
      })
      const nextIdx = sc.grades.findIndex((g) => g === null)
      if (nextIdx !== lastTarget) {
        lastTarget = nextIdx
        const n = timed[nextIdx]
        setTarget(n ? [{ string: n.string, fret: n.fret, kind: 'target', label: String(n.fret) }] : [])
      }
    }

    let alive = true
    player
      .load()
      .then(() => {
        if (!alive) return
        started = true
        startPass()
        raf = requestAnimationFrame(loopFrame)
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))

    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) return
      if (ev.code === 'KeyT') ctl.current?.tap()
      else if (ev.code === 'KeyP' || ev.code === 'Space') {
        ev.preventDefault()
        ctl.current?.togglePause()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      offNote()
      player.dispose()
      playerRef.current = null
      bus.disconnect()
      ctl.current = null
    }
    // A session runs once per mount; the parent remounts with a new key to retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setVol = (k: 'band' | 'guide', v: number) => {
    setVolumes((m) => ({ ...m, [k]: v }))
    if (k === 'band') playerRef.current?.setBand(v)
    else playerRef.current?.setGuide(v)
  }

  const marks: Mark[] = [...target, ...marksForMidi(playing, 'played').slice(0, 2)]
  const guideAvailable = song.stems.includes('bass')

  if (error) {
    return (
      <div className="screen">
        <p className="warn">{error}</p>
        <div className="row center">
          <button className="primary" onClick={onQuit}>Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen play arena-play">
      <div className="hud">
        <button className="ghost" onClick={onQuit} title="Quit">✕</button>
        <button className="ghost" onClick={() => ctl.current?.togglePause()} title="Pause (P)">{hud.paused ? '▶' : '❚❚'}</button>
        <div className="hud-title">
          {song.title}
          {loop && (
            <span className="arena-loop-tag">
              ⟳ {loop.name} · pass {hud.pass}
              {hud.lastPass !== null && ` · last ${Math.round(hud.lastPass * 100)}%`}
            </span>
          )}
        </div>
        <div className="hud-score">{hud.score.toLocaleString()}</div>
        <div className={`hud-combo ${hud.mult > 1 ? 'hot' : ''}`}>
          {hud.combo} combo {hud.mult > 1 && <b>×{hud.mult}</b>}
        </div>
      </div>
      <div className="stage">
        <Highway state={hw} />
        {hud.status && <div className="countin arena-status">{hud.status}</div>}
        {hud.countdown > 0 && <div className="countin">{hud.countdown}</div>}
        {hud.paused && <div className="countin arena-status">Paused</div>}
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
      <div className="arena-controls">
        <label>
          Band <input type="range" min={0} max={1} step={0.01} value={volumes.band} onChange={(ev) => setVol('band', Number(ev.target.value))} />
        </label>
        <label className={guideAvailable ? '' : 'muted'}>
          Guide bass{' '}
          <input type="range" min={0} max={1} step={0.01} value={volumes.guide} disabled={!guideAvailable} onChange={(ev) => setVol('guide', Number(ev.target.value))} />
        </label>
        <OffsetNudge offsetSec={offsetSec} onNudge={(d) => ctl.current?.nudge(d)} />
        <div className="row arena-tap">
          <button onClick={() => ctl.current?.tap()} title="Tap on every beat you hear (T)">Tap beat (T)</button>
          {hud.tapHint !== null ? (
            <button className="primary" onClick={() => ctl.current?.applyTap()}>
              Apply {hud.tapHint > 0 ? '+' : ''}
              {Math.round(hud.tapHint * 1000)} ms
            </button>
          ) : (
            <span className="muted small">{hud.taps ? `${hud.taps} taps…` : 'tap along to sync'}</span>
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
