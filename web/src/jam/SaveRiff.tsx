import { useEffect, useMemo, useState } from 'react'
import { riffTab } from './tab'
import { quantize, saveWindow, type GridDiv } from './quantize'
import type { JamNote } from './recorder'
import { newRiffId, riffChart, type JamMeta, type Riff } from './riffs'

export interface RiffSnapshot {
  notes: JamNote[]
  nowBeat: number
  bpm: number
  beatsPerBar: number
  meta: Omit<JamMeta, 'startBar'>
  cycleBar: (bar: number) => number
  defaultName: string
}

interface Props {
  snap: RiffSnapshot
  onSave: (riff: Riff) => void
  onCancel: () => void
  onSelection: (sel: { from: number; to: number } | null) => void
}

const BAR_CHOICES = [1, 2, 4]

export function SaveRiff({ snap, onSave, onCancel, onSelection }: Props) {
  const [bars, setBars] = useState(2)
  const [div, setDiv] = useState<GridDiv>(8)
  const [name, setName] = useState(snap.defaultName)

  const win = useMemo(() => saveWindow(snap.nowBeat, bars, snap.beatsPerBar), [snap, bars])
  const chart = useMemo(() => {
    const notes = quantize(snap.notes, win.from, win.to, div)
    const firstBar = Math.round(win.from / snap.beatsPerBar)
    return riffChart({
      id: newRiffId(),
      title: name.trim() || snap.defaultName,
      bpm: snap.bpm,
      beatsPerBar: snap.beatsPerBar,
      bars,
      notes,
      jam: { ...snap.meta, startBar: snap.cycleBar(firstBar) },
    })
  }, [snap, win, div, bars, name])

  useEffect(() => {
    onSelection(win)
    return () => onSelection(null)
  }, [win, onSelection])

  const empty = chart.notes.length === 0
  return (
    <section className="card save-riff">
      <h2>💾 Save that riff!</h2>
      <div className="row">
        <span className="muted">Last</span>
        <div className="seg">
          {BAR_CHOICES.map((b) => (
            <button key={b} className={b === bars ? 'on' : ''} onClick={() => setBars(b)}>
              {b} bar{b > 1 ? 's' : ''}
            </button>
          ))}
        </div>
        <span className="muted">snap to</span>
        <div className="seg">
          <button className={div === 8 ? 'on' : ''} onClick={() => setDiv(8)}>8ths</button>
          <button className={div === 16 ? 'on' : ''} onClick={() => setDiv(16)}>16ths</button>
        </div>
      </div>
      {empty ? (
        <p className="muted">No notes heard in those bars yet — play something and try again, or pick more bars.</p>
      ) : (
        <pre className="tab">{riffTab(chart, 4).join('\n')}</pre>
      )}
      <div className="row">
        <input className="riff-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Riff name" />
        <button className="primary" disabled={empty} onClick={() => onSave({ id: chart.id, name: chart.title, createdAt: Date.now(), chart })}>
          Save to My Riffs
        </button>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  )
}
