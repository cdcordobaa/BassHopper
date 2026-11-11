import { engine } from '../audio/engine'
import { beatToSec, type Chart } from '../game/chart'
import { positionToMidi } from '../music/notes'

/**
 * Plays a chart on a plucked synth bass so you can hear how it should sound.
 * Returns a stop function; `onEnd` fires when it finishes on its own.
 */
export async function listen(chart: Chart, speed: number, onEnd: () => void): Promise<() => void> {
  const ctx = await engine.context()
  const out = ctx.createGain()
  out.gain.value = 0.5
  out.connect(ctx.destination)
  const t0 = ctx.currentTime + 0.15
  for (const n of chart.notes) {
    const at = t0 + beatToSec(chart, n.t, speed)
    const dur = Math.max(0.08, beatToSec(chart, n.t + n.dur, speed) - beatToSec(chart, n.t, speed)) * 0.92
    pluck(ctx, positionToMidi(n.string, n.fret), at, dur, out)
  }
  const end = t0 + beatToSec(chart, chart.lengthBeats, speed)
  const timer = window.setTimeout(onEnd, (end - ctx.currentTime) * 1000 + 200)
  return () => {
    window.clearTimeout(timer)
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
    window.setTimeout(() => out.disconnect(), 200)
  }
}

function pluck(ctx: AudioContext, midi: number, at: number, dur: number, dest: AudioNode) {
  const hz = 440 * 2 ** ((midi - 69) / 12)
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = hz
  // The filter closes after the attack: the "thump then hum" of a fingered bass.
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 2
  lp.frequency.setValueAtTime(hz * 8, at)
  lp.frequency.exponentialRampToValueAtTime(hz * 2, at + 0.15)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.6, at + 0.008)
  g.gain.exponentialRampToValueAtTime(0.25, at + Math.min(dur, 0.4))
  g.gain.setValueAtTime(0.25, at + dur)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.06)
  osc.connect(lp).connect(g).connect(dest)
  osc.start(at)
  osc.stop(at + dur + 0.08)
}
