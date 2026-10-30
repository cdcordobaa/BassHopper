const STEPS = [-0.05, -0.01, 0.01, 0.05]

/** Moves the chart against the audio. Positive offset = notes arrive later. */
export function OffsetNudge({ offsetSec, onNudge }: { offsetSec: number; onNudge: (deltaSec: number) => void }) {
  return (
    <div className="arena-nudge" title="If notes reach the line before you hear them in the song, move them later">
      <span className="muted small">Sync</span>
      {STEPS.map((d) => (
        <button key={d} onClick={() => onNudge(d)}>
          {d > 0 ? '+' : '−'}
          {Math.abs(d * 1000)}
        </button>
      ))}
      <b className="arena-offset">{Math.round(offsetSec * 1000)} ms</b>
    </div>
  )
}
