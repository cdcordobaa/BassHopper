import { useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { freqToMidiFloat, midiToName, STRINGS } from '../music/notes'

/** Median-smoothed tuner. Shows note, cents and the nearest open string. */
export function Tuner() {
  const recent = useRef<number[]>([])
  const [freq, setFreq] = useState<number | null>(null)

  useEffect(() => {
    let lastVoiced = 0
    const off = engine.onFrame((f) => {
      if (f.freq && f.clarity > 0.85) {
        recent.current.push(f.freq)
        if (recent.current.length > 7) recent.current.shift()
        lastVoiced = f.time
      } else if (f.time - lastVoiced > 0.4) recent.current = []
    })
    const id = setInterval(() => {
      const r = [...recent.current].sort((a, b) => a - b)
      setFreq(r.length >= 3 ? r[Math.floor(r.length / 2)] : null)
    }, 50)
    return () => {
      off()
      clearInterval(id)
    }
  }, [])

  const midiF = freq ? freqToMidiFloat(freq) : null
  const midi = midiF !== null ? Math.round(midiF) : null
  const cents = midiF !== null && midi !== null ? Math.round((midiF - midi) * 100) : 0
  const inTune = midiF !== null && Math.abs(cents) <= 5
  const open = STRINGS.findIndex((s) => s.midi === midi)

  return (
    <div className={`tuner ${inTune ? 'in-tune' : ''}`}>
      <div className="tuner-note">{midi !== null ? midiToName(midi, false) : '–'}</div>
      <div className="tuner-meta">
        {midi !== null ? `${midiToName(midi)} · ${freq!.toFixed(1)} Hz` : 'Play a string'}
        {open >= 0 && <span className="tuner-open"> · open {STRINGS[open].name} string</span>}
      </div>
      <div className="tuner-scale">
        <div className="tuner-center" />
        {midiF !== null && <div className="tuner-needle" style={{ left: `${50 + cents}%` }} />}
      </div>
      <div className="tuner-hint">
        {midiF === null ? 'Tune to E · A · D · G' : inTune ? 'In tune ✓' : cents < 0 ? `${-cents}¢ flat — tighten` : `${cents}¢ sharp — loosen`}
      </div>
    </div>
  )
}
