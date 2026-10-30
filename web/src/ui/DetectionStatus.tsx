import { freqToMidiFloat, midiToName } from '../music/notes'
import { useEngine, useLatestFrame } from './hooks'

/** Live diagnosis of the detection chain: is it loud enough, is the pitch clear, what note. */
export function DetectionStatus() {
  const e = useEngine()
  const f = useLatestFrame()
  const gate = e.profile?.gate ?? 0.01
  let cls = 'idle'
  let text = 'Play a note…'
  if (f && f.rms >= gate * 0.3) {
    if (f.rms < gate) {
      cls = 'bad'
      text = `Too quiet for the gate (${f.rms.toFixed(4)} < ${gate.toFixed(4)}). Turn Gain up, lower the gate, or use Auto-level.`
    } else if (!f.freq || f.clarity < 0.8) {
      cls = 'warn'
      text = `Sound, but no clear pitch (clarity ${f.clarity.toFixed(2)}). Let the note ring; mute other strings; mic closer to the amp.`
    } else {
      cls = 'good'
      text = `Hearing ${midiToName(Math.round(freqToMidiFloat(f.freq)))} · ${f.freq.toFixed(1)} Hz · clarity ${f.clarity.toFixed(2)}`
    }
  }
  return <div className={`detect detect-${cls}`}>{text}</div>
}
