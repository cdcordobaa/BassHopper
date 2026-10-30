export type InputKind = 'mic' | 'interface' | 'file'

/** Per-device tuning. Lives outside the source so every device keeps its own calibration. */
export interface InputProfile {
  /** Input gain in dB. */
  gainDb: number
  /** Low-shelf boost at 150 Hz in dB (helps mics hear the low E). */
  bassBoostDb: number
  /** RMS level below which input counts as silence. */
  gate: number
  /** Measured round-trip delay, subtracted from every detected note. */
  latencyMs: number
  /** Which input channel to read (audio interfaces often put the bass on input 1). */
  channel: 0 | 1
}

/**
 * Anything that can feed bass audio into the engine.
 * Add a new input type by implementing this — nothing downstream changes.
 */
export interface InputSource {
  readonly id: string
  readonly kind: InputKind
  readonly label: string
  start(ctx: AudioContext, profile: InputProfile): Promise<AudioNode>
  stop(): void
  defaultProfile(): InputProfile
}
