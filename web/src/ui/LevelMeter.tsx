import { useLatestFrame, useEngine } from './hooks'

const toPct = (rms: number) => Math.max(0, Math.min(100, ((20 * Math.log10(rms + 1e-6) + 60) / 60) * 100))

export function LevelMeter() {
  const frame = useLatestFrame()
  const e = useEngine()
  const level = frame?.rms ?? 0
  const gate = e.profile?.gate ?? 0.01
  return (
    <div className="meter" title="Input level. The white line is the noise gate.">
      <div className={`meter-fill ${level > 0.7 ? 'clip' : ''}`} style={{ width: `${toPct(level)}%` }} />
      <div className="meter-gate" style={{ left: `${toPct(gate)}%` }} />
    </div>
  )
}
