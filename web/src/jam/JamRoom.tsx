import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { midiToName } from '../music/notes'
import { useCurrentNote, useEngine, useNoteEvents } from '../ui/hooks'
import { Backing, BEATS_PER_BAR, defaultOptions, type BackingOptions, type BeatInfo } from './backing'
import { JamControls } from './JamControls'
import { JamNeck } from './JamNeck'
import { MyRiffs } from './MyRiffs'
import { nextPrompt, PROMPTS } from './prompts'
import { JamRecorder } from './recorder'
import { addRiff, loadRiffs, type Riff, type RiffChart } from './riffs'
import { RiffPlay } from './RiffPlay'
import { FIT_COLORS, FIT_TEXT } from './fit'
import { RollStrip, type RollState } from './RollStrip'
import { SaveRiff, type RiffSnapshot } from './SaveRiff'
import { findStyle } from './styles'
import { findProgression, keyName, noteFit, prefersFlats, scalePcs, type Key, type NoteFit, type ScaleId } from './theory'
import { ensureTone } from './tone'
import './jam.css'

interface Props {
  onBack: () => void
  onSetup: () => void
  /** Opens a saved riff on the highway. If omitted, the Jam Room plays it itself. */
  onPlayRiff?: (chart: RiffChart) => void
}

const PROMPT_EVERY_BARS = 8

export function JamRoom({ onBack, onSetup, onPlayRiff }: Props) {
  const e = useEngine()
  const [opts, setOpts] = useState<BackingOptions>(() => defaultOptions('rock'))
  const [scale, setScale] = useState<ScaleId>(() => findProgression(defaultOptions('rock').progressionId)!.scale)
  const [running, setRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [info, setInfo] = useState<BeatInfo | null>(null)
  const [fit, setFit] = useState<{ fit: NoteFit; name: string; id: number } | null>(null)
  const [prompt, setPrompt] = useState(0)
  const [snap, setSnap] = useState<RiffSnapshot | null>(null)
  const [riffs, setRiffs] = useState<Riff[]>(() => loadRiffs())
  const [playing, setPlaying] = useState<RiffChart | null>(null)
  const current = useCurrentNote()

  const [backing] = useState(() => new Backing(defaultOptions('rock')))
  const [recorder] = useState(() => new JamRecorder(BEATS_PER_BAR * 32))
  const fitId = useRef(0)
  const lastBeat = useRef(0)
  const selection = useRef<RollState['selection']>(null)

  const mode = findProgression(opts.progressionId)?.mode ?? 'major'
  const key: Key = { tonic: opts.tonic, mode }
  const flats = prefersFlats(key)
  const scaleNotes = useMemo(() => scalePcs(opts.tonic, scale), [opts.tonic, scale])
  const harmony = info ?? { ...backing.harmonyAt(0), bar: 0, beat: 0, counting: false, time: 0 }
  const visualNow = () => engine.now() - engine.outputLatency()

  // Live view of the jam for the canvas strip, read every animation frame.
  const roll = useRef<RollState>(null!)
  useEffect(() => {
    roll.current = {
      notes: () => recorder.notes,
      nowBeat: () => (backing.running && backing.grid ? backing.grid.beatAt(engine.now() - engine.outputLatency()) : null),
      lastBeat: lastBeat.current,
      beatsPerBar: BEATS_PER_BAR,
      chordName: (bar) => backing.harmonyAt(bar).chord.name,
      fit: (midi, bar) => noteFit(midi, backing.harmonyAt(bar).chord, scaleNotes),
      selection: selection.current,
    }
  })

  useEffect(() => () => backing.dispose(), [backing])

  // Beat/chord display from the band's draw callbacks; the creative prompt rotates every few bars.
  useEffect(
    () =>
      backing.onBeat((b) => {
        setInfo(b)
        if (!b.counting && b.beat === 0 && b.bar > 0 && b.bar % PROMPT_EVERY_BARS === 0) setPrompt((p) => nextPrompt(p))
      }),
    [backing],
  )

  useNoteEvents((ev) => {
    const b = backing
    if (!b.running || !b.grid) return
    const latency = (engine.profile?.latencyMs ?? 0) / 1000
    const beat = b.grid.beatAt(ev.time - latency)
    if (ev.type === 'off') {
      recorder.off(beat)
      return
    }
    recorder.on(ev.midi, beat)
    const h = b.harmonyAt(Math.floor(beat / BEATS_PER_BAR))
    setFit({ fit: noteFit(ev.midi, h.chord, scaleNotes), name: midiToName(ev.midi, false), id: ++fitId.current })
  })

  const change = (patch: Partial<BackingOptions>, nextScale?: ScaleId) => {
    backing.update(patch)
    setOpts(backing.options)
    if (nextScale) setScale(nextScale)
    if (!backing.running) setInfo(null)
  }

  const start = async () => {
    if (starting) return
    setStarting(true)
    try {
      await ensureTone()
      recorder.clear()
      setSnap(null)
      await backing.start()
      setRunning(backing.running)
    } finally {
      setStarting(false)
    }
  }

  const stop = () => {
    const b = backing
    if (b.grid) lastBeat.current = b.grid.beatAt(visualNow())
    recorder.off(lastBeat.current)
    if (roll.current) roll.current.lastBeat = lastBeat.current
    b.stop()
    setRunning(false)
    setInfo(null)
  }

  const openSave = () => {
    const b = backing
    const nowBeat = b.running && b.grid ? b.grid.beatAt(visualNow()) : lastBeat.current
    const style = findStyle(opts.style)
    setSnap({
      notes: recorder.snapshot(nowBeat),
      nowBeat,
      bpm: b.grid?.bpm ?? opts.bpm,
      beatsPerBar: BEATS_PER_BAR,
      meta: { style: opts.style, progressionId: opts.progressionId, tonic: opts.tonic, mode, scale, barsPerChord: opts.barsPerChord },
      cycleBar: (bar) => b.cycleBar(bar),
      defaultName: `${keyName(key)} ${style.name.toLowerCase()} riff #${riffs.length + 1}`,
    })
  }

  const setSelection = useCallback((sel: RollState['selection']) => {
    selection.current = sel
    if (roll.current) roll.current.selection = sel
  }, [])

  const playRiff = (chart: RiffChart) => {
    if (running) stop()
    if (onPlayRiff) onPlayRiff(chart)
    else setPlaying(chart)
  }

  if (playing) return <RiffPlay chart={playing} onExit={() => setPlaying(null)} onSetup={onSetup} />

  const p = PROMPTS[prompt]
  const counting = running && harmony.counting
  const playedFit = current === null ? null : noteFit(current, harmony.chord, scaleNotes)

  return (
    <div className="screen jam">
      <header className="screen-head">
        <button className="ghost" onClick={onBack}>← Home</button>
        <h1>Jam Room</h1>
        <span className="muted">{keyName(key)} · {findStyle(opts.style).name}</span>
      </header>

      {!e.source && (
        <p className="warn">
          No input connected — the band will play, but it can't hear you. <button onClick={onSetup}>Set up input</button>
        </p>
      )}

      <JamControls opts={opts} scale={scale} onChange={change} onScale={setScale} />

      <section className="card jam-stage">
        <div className="chord-now">
          <div className="muted small">{counting ? 'count-in' : 'now'}</div>
          <div className="chord-name">{harmony.chord.name}</div>
          <div className="muted">{harmony.chord.roman}</div>
        </div>
        <div className="beats">
          {Array.from({ length: BEATS_PER_BAR }, (_, i) => (
            <span key={i} className={running && harmony.beat === i ? (counting ? 'on count' : 'on') : ''}>
              {counting ? i + 1 : ''}
            </span>
          ))}
        </div>
        <div className="chord-next">
          <div className="muted small">next</div>
          <div className="chord-name small-chord">{harmony.barsToNext === null ? '—' : harmony.next.name}</div>
          <div className="muted small">
            {harmony.barsToNext === null ? 'one-chord vamp' : `in ${harmony.barsToNext} bar${harmony.barsToNext > 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="jam-go">
          {running ? (
            <button className="primary huge" onClick={stop}>■ Stop</button>
          ) : (
            <button className="primary huge" onClick={start} disabled={starting}>▶ Jam</button>
          )}
        </div>
      </section>

      <section className="card jam-prompt">
        <div>
          <b>💡 {p.title}</b>
          <p className="muted">{p.hint}</p>
        </div>
        <button className="ghost" onClick={() => setPrompt(nextPrompt(prompt))}>Another idea →</button>
      </section>

      <section className="card jam-neck-card">
        <div className="jam-feedback">
          {fit ? (
            <span key={fit.id} className={`fit fit-${fit.fit}`} style={{ color: FIT_COLORS[fit.fit] }}>
              <b>{fit.name}</b> {FIT_TEXT[fit.fit]}
            </span>
          ) : (
            <span className="muted">Any lit note sounds good. Pink = root, purple = chord tones, green = the scale.</span>
          )}
        </div>
        <JamNeck scale={scaleNotes} chord={harmony.chord} played={current} playedFit={playedFit} flats={flats} />
        <div className="legend">
          <span style={{ color: FIT_COLORS.root }}>● root</span>
          <span style={{ color: FIT_COLORS.chord }}>● chord tones</span>
          <span style={{ color: FIT_COLORS.scale }}>● {scale === 'major' || scale === 'minor' ? 'scale' : 'safe scale'}</span>
          <span>○ what you're playing</span>
        </div>
      </section>

      <section className="card">
        <div className="row roll-head">
          <h2>Your last 8 bars</h2>
          <span className="muted small">Everything you play while the band runs is recorded.</span>
          <button className="primary save-btn" onClick={openSave} disabled={recorder.notes.length === 0 && !running}>
            💾 Save that riff!
          </button>
        </div>
        <RollStrip state={roll} />
      </section>

      {snap && (
        <SaveRiff
          snap={snap}
          onSelection={setSelection}
          onCancel={() => setSnap(null)}
          onSave={(riff) => {
            setRiffs(addRiff(riff))
            setSnap(null)
          }}
        />
      )}

      <MyRiffs riffs={riffs} onChange={setRiffs} onPlay={playRiff} />
    </div>
  )
}
