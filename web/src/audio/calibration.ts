import type { AudioEngine } from './engine'

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/** Listens to silence for `ms` and suggests a gate just above the room noise. */
export function measureNoise(engine: AudioEngine, ms = 2000): Promise<number> {
  const levels: number[] = []
  const off = engine.onFrame((f) => levels.push(f.rms))
  return new Promise((resolve) =>
    setTimeout(() => {
      off()
      const s = levels.sort((a, b) => a - b)
      const p95 = s[Math.floor(s.length * 0.95)] ?? 0.002
      resolve(Math.max(0.002, Math.min(0.08, p95 * 2.5)))
    }, ms),
  )
}

export interface LatencyResult {
  latencyMs: number
  matched: number
  total: number
}

/**
 * Plays a count-in plus `beats` clicks; you pluck open E on each.
 * The median gap between click and detected note is your system latency.
 */
export async function latencyTest(
  engine: AudioEngine,
  onBeat: (beat: number, counting: boolean) => void,
  bpm = 80,
  beats = 8,
): Promise<LatencyResult> {
  const ctx = await engine.context()
  const spb = 60 / bpm
  const countIn = 4
  const t0 = ctx.currentTime + 0.4
  const clicks: number[] = []
  for (let i = 0; i < countIn + beats; i++) {
    const t = t0 + i * spb
    engine.click(t, i % 4 === 0)
    if (i >= countIn) clicks.push(t)
  }
  const onsets: number[] = []
  const off = engine.onNote((e) => e.type === 'on' && onsets.push(e.time))
  const timers = Array.from({ length: countIn + beats }, (_, i) =>
    setTimeout(() => onBeat(i, i < countIn), (t0 - ctx.currentTime + i * spb) * 1000),
  )
  await new Promise((r) => setTimeout(r, (t0 - ctx.currentTime + (countIn + beats) * spb + 0.5) * 1000))
  off()
  timers.forEach(clearTimeout)

  const deltas: number[] = []
  for (const c of clicks) {
    let best: number | null = null
    for (const o of onsets) if (Math.abs(o - c) < 0.3 && (best === null || Math.abs(o - c) < Math.abs(best - c))) best = o
    if (best !== null) deltas.push(best - c)
  }
  return {
    latencyMs: Math.round(Math.max(0, Math.min(0.3, median(deltas))) * 1000),
    matched: deltas.length,
    total: beats,
  }
}

function collectRms(engine: AudioEngine, ms: number): Promise<number[]> {
  const levels: number[] = []
  const off = engine.onFrame((f) => levels.push(f.rms))
  return new Promise((resolve) =>
    setTimeout(() => {
      off()
      resolve(levels.sort((a, b) => a - b))
    }, ms),
  )
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0

export interface AutoLevelResult {
  gainDb: number
  gate: number
  ok: boolean
  message: string
}

const TARGET_PEAK = 0.15

/**
 * Two steps: silence (room noise), then plucking. Sets gain so plucks peak near TARGET_PEAK
 * and the gate between the (re-scaled) noise floor and the playing level.
 */
export async function autoLevel(engine: AudioEngine, onStep: (step: 'silence' | 'play') => void): Promise<AutoLevelResult> {
  const startGain = engine.profile?.gainDb ?? 0
  onStep('silence')
  const noise = pct(await collectRms(engine, 2000), 0.95)
  onStep('play')
  const playing = pct(await collectRms(engine, 3000), 0.9)
  if (playing < noise * 2 || playing < 1e-4) {
    return { gainDb: startGain, gate: engine.profile?.gate ?? 0.01, ok: false, message: "Couldn't hear the bass over the room noise. Move the mic closer to the amp speaker or turn the amp up, then try again." }
  }
  const change = Math.max(-12 - startGain, Math.min(36 - startGain, 20 * Math.log10(TARGET_PEAK / playing)))
  const gainDb = Math.round(startGain + change)
  const scale = 10 ** ((gainDb - startGain) / 20)
  const noiseAfter = noise * scale
  const playAfter = playing * scale
  // Geometric middle between noise and playing, biased toward noise so soft notes still count.
  const gate = Math.max(0.001, Math.min(playAfter * 0.25, Math.sqrt(noiseAfter * 2 * playAfter * 0.1) || playAfter * 0.1))
  const capped = gainDb >= 36 && playAfter < TARGET_PEAK * 0.5
  return {
    gainDb,
    gate,
    ok: true,
    message: capped
      ? `Gain is maxed out and the signal is still quiet. Move the mic closer to the amp or turn the amp up. (gain ${gainDb} dB, gate ${gate.toFixed(4)})`
      : `Levels set: gain ${gainDb} dB, gate ${gate.toFixed(4)}. Now play — the readout below should say "Hearing …".`,
  }
}
