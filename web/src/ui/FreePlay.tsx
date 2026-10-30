import { useEffect, useRef, useState } from 'react'
import { DRUM_STYLES, playDrumStep, type DrumStyle } from '../audio/band'
import { engine } from '../audio/engine'
import { midiToName, positionToMidi, STRINGS, type StringIndex } from '../music/notes'
import { Fretboard, marksForMidi, type Mark } from './Fretboard'
import { useCurrentNote, useEngine, useNoteEvents } from './hooks'

const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

function DrumMachine() {
  const [on, setOn] = useState(false)
  const [bpm, setBpm] = useState(80)
  const [style, setStyle] = useState<DrumStyle | 'click'>('rock')
  const [volume, setVolume] = useState(0.7)
  const busRef = useRef<GainNode | null>(null)

  useEffect(() => {
    if (busRef.current) busRef.current.gain.value = volume
  }, [volume])

  useEffect(() => {
    if (!on) return
    let next = 0
    let step = 0
    let alive = true
    let bus: GainNode | null = null
    engine.context().then((ctx) => {
      if (!alive) return
      bus = ctx.createGain()
      bus.gain.value = volume
      bus.connect(ctx.destination)
      busRef.current = bus
      next = ctx.currentTime + 0.1
    })
    const id = setInterval(() => {
      const ctx = engine.ctx
      if (!ctx || !bus) return
      while (next < ctx.currentTime + 0.2) {
        if (style === 'click') {
          if (step % 4 === 0) engine.click(next, step % 16 === 0, bus)
        } else playDrumStep(ctx, style, step % 16, next, bus)
        next += 60 / bpm / 4
        step++
      }
    }, 25)
    return () => {
      alive = false
      clearInterval(id)
      bus?.disconnect()
      busRef.current = null
    }
    // Volume is applied live through busRef; restarting on volume change would drop the groove.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, bpm, style])

  return (
    <>
      <div className="row">
        <button className={on ? 'primary' : ''} onClick={() => setOn(!on)}>{on ? '■ Stop' : '▶ Start'}</button>
        <div className="seg">
          <button className={style === 'click' ? 'on' : ''} onClick={() => setStyle('click')}>⏱ Click</button>
          {DRUM_STYLES.map((d) => (
            <button key={d.id} className={style === d.id ? 'on' : ''} onClick={() => setStyle(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="sliders">
        <label>
          Tempo <b>{bpm} BPM</b>
          <input type="range" min={40} max={160} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
        </label>
        <label>
          Volume <b>{Math.round(volume * 100)}%</b>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
      </div>
      <p className="muted">Lock in with the kick drum. Try: root note on every kick, then add notes between.</p>
    </>
  )
}

/** Mini-game: a note name appears, find it anywhere on the neck. */
function NoteHunt() {
  const [running, setRunning] = useState(false)
  const [target, setTarget] = useState('E')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem('bh.hunt.best') ?? 0))
  const [timeLeft, setTimeLeft] = useState(60)
  const [found, setFound] = useState<Mark[]>([])
  const startedAt = useRef(0)

  const pick = (prev: string) => {
    let n = prev
    while (n === prev) n = NATURALS[Math.floor(Math.random() * NATURALS.length)]
    return n
  }

  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now()
    const id = setInterval(() => {
      const left = 60 - Math.floor((Date.now() - startedAt.current) / 1000)
      setTimeLeft(left)
      if (left <= 0) setRunning(false)
    }, 200)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    if (!running && score > best) {
      setBest(score)
      localStorage.setItem('bh.hunt.best', String(score))
    }
  }, [running, score, best])

  useNoteEvents((e) => {
    if (!running || e.type !== 'on') return
    if (midiToName(e.midi, false) === target) {
      setScore((s) => s + 1)
      setFound(marksForMidi(e.midi, 'safe'))
      setTarget((t) => pick(t))
    }
  })

  return (
    <div className="hunt">
      {running ? (
        <>
          <div className="hunt-target">
            Find <b>{target}</b>
          </div>
          <div className="row center">
            <span>⏱ {timeLeft}s</span>
            <span>Score {score}</span>
          </div>
          <Fretboard marks={found} compact />
          <p className="muted">Last found note shown on the neck — notice every place it lives.</p>
        </>
      ) : (
        <div className="row">
          <button className="primary" onClick={() => { setScore(0); setTimeLeft(60); setFound([]); setTarget(pick('')); setRunning(true) }}>
            ▶ Start Note Hunt (60s)
          </button>
          <span className="muted">Best: {best}{score > 0 && ` · Last: ${score}`}</span>
        </div>
      )}
    </div>
  )
}

// A full-size neck: the G string's 17th fret is middle C, 24th is G4.
const FREE_FRETS = 24

export function FreePlay({ onBack, onSetup }: { onBack: () => void; onSetup: () => void }) {
  const e = useEngine()
  const midi = useCurrentNote()
  const [trail, setTrail] = useState<number[]>([])
  const [showAll, setShowAll] = useState(false)

  useNoteEvents((ev) => {
    if (ev.type === 'on') setTrail((t) => [...t.slice(-15), ev.midi])
  })

  const allNames: Mark[] = showAll
    ? STRINGS.flatMap((_, s) =>
        Array.from({ length: FREE_FRETS + 1 }, (_, f) => {
          const name = midiToName(positionToMidi(s as StringIndex, f), false)
          return { string: s as StringIndex, fret: f, kind: 'safe' as const, label: name.includes('#') ? '' : name }
        }).filter((m) => m.label),
      )
    : []

  return (
    <div className="screen free">
      <header className="screen-head">
        <button className="ghost" onClick={onBack}>← Home</button>
        <h1>Free Play</h1>
      </header>
      {!e.source && (
        <p className="warn">
          Connect your bass first. <button onClick={onSetup}>Set up input</button>
        </p>
      )}
      <section className="card">
        <div className="big-note">
          {midi !== null ? midiToName(midi) : '·'}
          {midi === 60 && <small> middle C</small>}
        </div>
        <div className="fb-scroll">
          <Fretboard marks={[...allNames, ...marksForMidi(midi, 'played', FREE_FRETS)]} frets={FREE_FRETS} showMiddleC />
        </div>
        <p className="muted">
          Note names carry the piano octave: middle C is C4 (dashed ring, 17th fret on G). Your open E is E1, way down on the piano's left.
        </p>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(ev) => setShowAll(ev.target.checked)} /> Show all natural note names
          </label>
        </div>
        <div className="trail">
          {trail.map((m, i) => (
            <span key={i}>{midiToName(m)}</span>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>🥁 Drum Machine</h2>
        <DrumMachine />
      </section>
      <section className="card">
        <h2>🎯 Note Hunt</h2>
        <NoteHunt />
      </section>
    </div>
  )
}
