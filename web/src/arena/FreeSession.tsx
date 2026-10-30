import { useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { midiToName } from '../music/notes'
import { Fretboard, marksForMidi } from '../ui/Fretboard'
import { useCurrentNote, useNoteEvents } from '../ui/hooks'
import type { Song } from './api'
import type { Mix } from './ArenaSession'
import { SongPlayer } from './player'
import './arena.css'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** No chart yet: play along to the band mix while the neck shows what you're playing. */
export function FreeSession({ song, speed, mix, onQuit }: { song: Song; speed: number; mix: Mix; onQuit: () => void }) {
  const player = useRef<SongPlayer | null>(null)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(song.durationSec)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [volumes, setVolumes] = useState(mix)
  const [trail, setTrail] = useState<number[]>([])
  const midi = useCurrentNote()

  useNoteEvents((ev) => {
    if (ev.type === 'on') setTrail((t) => [...t.slice(-23), ev.midi])
  })

  useEffect(() => {
    const p = new SongPlayer(engine.ctx!, song, speed, { band: mix.band, guide: mix.guide })
    player.current = p
    let alive = true
    p.load()
      .then(() => {
        if (!alive) return
        setDur(p.duration || song.durationSec)
        p.start(0)
        setPlaying(true)
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    const id = setInterval(() => {
      setPos(p.band.currentTime)
      setPlaying(p.playing)
    }, 200)
    return () => {
      alive = false
      clearInterval(id)
      p.dispose()
      player.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = () => {
    const p = player.current
    if (!p) return
    if (p.playing) p.pause()
    else if (p.band.ended) p.start(0)
    else p.resume()
    setPlaying(p.playing)
  }

  const setVol = (k: 'band' | 'guide', v: number) => {
    setVolumes((m) => ({ ...m, [k]: v }))
    if (k === 'band') player.current?.setBand(v)
    else player.current?.setGuide(v)
  }

  return (
    <div className="screen free">
      <header className="screen-head">
        <button className="ghost" onClick={onQuit}>← Back</button>
        <h1>{song.title} · play along</h1>
      </header>
      {error && <p className="warn">{error}</p>}
      <section className="card">
        <p className="muted">
          {song.hasChart
            ? "Play-along mode: no scoring — just jam with the song and watch where your notes land."
            : "No tab for this song yet, so there's no scoring — just jam along and watch where your notes land. Automatic transcription arrives in a later update."}
        </p>
        <div className="row arena-transport">
          <button className="primary" onClick={toggle} disabled={!!error}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
          <input
            type="range"
            min={0}
            max={Math.max(1, dur)}
            step={0.1}
            value={pos}
            onChange={(ev) => {
              player.current?.seek(Number(ev.target.value))
              setPos(Number(ev.target.value))
            }}
          />
          <span className="arena-time">{fmt(pos)} / {fmt(dur)}</span>
          <span className="muted">{Math.round(speed * 100)}%</span>
        </div>
        <div className="arena-controls">
          <label>
            Band <input type="range" min={0} max={1} step={0.01} value={volumes.band} onChange={(ev) => setVol('band', Number(ev.target.value))} />
          </label>
          {song.stems.includes('bass') && (
            <label>
              Guide bass <input type="range" min={0} max={1} step={0.01} value={volumes.guide} onChange={(ev) => setVol('guide', Number(ev.target.value))} />
            </label>
          )}
        </div>
      </section>
      <section className="card">
        <div className="big-note">{midi !== null ? midiToName(midi, false) : '·'}</div>
        <Fretboard marks={marksForMidi(midi, 'played')} />
        <div className="trail">
          {trail.map((m, i) => (
            <span key={i}>{midiToName(m, false)}</span>
          ))}
        </div>
      </section>
    </div>
  )
}
