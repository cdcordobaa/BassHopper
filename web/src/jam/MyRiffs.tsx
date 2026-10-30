import { useState } from 'react'
import { riffTab } from './tab'
import { findStyle } from './styles'
import { keyName } from './theory'
import { deleteRiff, renameRiff, type Riff, type RiffChart } from './riffs'

interface Props {
  riffs: Riff[]
  onChange: (riffs: Riff[]) => void
  onPlay: (chart: RiffChart) => void
}

export function MyRiffs({ riffs, onChange, onPlay }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  const commit = () => {
    if (editing) onChange(renameRiff(editing.id, editing.name))
    setEditing(null)
  }

  return (
    <section className="card my-riffs">
      <h2>🎸 My Riffs</h2>
      {riffs.length === 0 && <p className="muted">Nothing saved yet. Jam a little, then hit “Save that riff!”.</p>}
      <ul>
        {riffs.map((r) => {
          const jam = r.chart.jam
          const bars = Math.round(r.chart.lengthBeats / r.chart.beatsPerBar)
          return (
            <li key={r.id}>
              <div className="riff-row">
                {editing?.id === r.id ? (
                  <input
                    autoFocus
                    className="riff-name"
                    value={editing.name}
                    onChange={(e) => setEditing({ id: r.id, name: e.target.value })}
                    onBlur={commit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <button className="ghost riff-title" title="Rename" onClick={() => setEditing({ id: r.id, name: r.name })}>
                    {r.name} ✎
                  </button>
                )}
                <span className="muted small">
                  {jam ? `${keyName({ tonic: jam.tonic, mode: jam.mode })} · ${findStyle(jam.style).name} · ` : ''}
                  {r.chart.bpm} BPM · {bars} bar{bars > 1 ? 's' : ''}
                </span>
                <span className="riff-actions">
                  <button onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide tab' : 'Tab'}</button>
                  <button className="primary" onClick={() => onPlay(r.chart)}>▶ Play</button>
                  <button
                    className="ghost"
                    title="Delete"
                    onClick={() => {
                      if (confirm(`Delete “${r.name}”?`)) onChange(deleteRiff(r.id))
                    }}
                  >
                    🗑
                  </button>
                </span>
              </div>
              {open === r.id && <pre className="tab">{riffTab(r.chart, 4).join('\n')}</pre>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
