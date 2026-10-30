import type { InputProfile, InputSource } from './InputSource'
import { NoteTracker, type NoteEvent, type PitchFrame } from './NoteTracker'
import { detectPitch, rms } from './pitch'
import { loadProfile, saveProfile } from './profiles'

const TARGET_RATE = 12000
const WINDOW = 768
const CHUNK = 128

type Listener<T> = (v: T) => void

/**
 * Owns the AudioContext and the input chain:
 *   source → gain → bass boost → low-pass → capture worklet → pitch → note tracker
 * The source is swappable; nothing here knows whether it is a mic, an interface or a file.
 */
export class AudioEngine {
  ctx: AudioContext | null = null
  source: InputSource | null = null
  profile: InputProfile | null = null
  rate = TARGET_RATE
  lastFrame: PitchFrame | null = null
  error: string | null = null

  private chain: AudioNode[] = []
  private gain: GainNode | null = null
  private shelf: BiquadFilterNode | null = null
  private ring = new Float32Array(WINDOW)
  private ringPos = 0
  private filled = 0
  private scratch = new Float32Array(WINDOW)
  private tracker = new NoteTracker(() => this.profile?.gate ?? 0.01, WINDOW / TARGET_RATE, CHUNK / TARGET_RATE)
  private frameListeners = new Set<Listener<PitchFrame>>()
  private noteListeners = new Set<Listener<NoteEvent>>()
  private statusListeners = new Set<() => void>()
  private version = 0

  async context(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' })
      await this.ctx.audioWorklet.addModule('/capture-worklet.js')
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    return this.ctx
  }

  async connect(source: InputSource) {
    this.disconnect()
    try {
      const ctx = await this.context()
      const profile = loadProfile(source)
      const input = await source.start(ctx, profile)
      const decimate = Math.max(1, Math.round(ctx.sampleRate / TARGET_RATE))
      this.rate = ctx.sampleRate / decimate

      const gain = ctx.createGain()
      const shelf = ctx.createBiquadFilter()
      shelf.type = 'lowshelf'
      shelf.frequency.value = 150
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 1200
      const worklet = new AudioWorkletNode(ctx, 'bh-capture', {
        processorOptions: { decimate, chunk: CHUNK },
      })
      worklet.port.onmessage = (e: MessageEvent<{ samples: Float32Array; time: number }>) =>
        this.onChunk(e.data.samples, e.data.time)

      input.connect(gain).connect(shelf).connect(lowpass).connect(worklet)
      // Worklet output is silent; connecting it keeps the graph pulling audio through it.
      worklet.connect(ctx.destination)

      this.chain = [input, gain, shelf, lowpass, worklet]
      this.gain = gain
      this.shelf = shelf
      this.source = source
      this.error = null
      this.setProfile(profile)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      this.source = null
      this.emitStatus()
    }
  }

  disconnect() {
    this.chain.forEach((n) => n.disconnect())
    this.chain = []
    this.source?.stop()
    this.source = null
    this.filled = 0
    this.tracker.reset()
    this.lastFrame = null
    this.emitStatus()
  }

  setProfile(profile: InputProfile) {
    this.profile = profile
    if (this.gain) this.gain.gain.value = 10 ** (profile.gainDb / 20)
    if (this.shelf) this.shelf.gain.value = profile.bassBoostDb
    if (this.source) saveProfile(this.source, profile)
    this.emitStatus()
  }

  updateProfile(patch: Partial<InputProfile>) {
    if (this.profile) this.setProfile({ ...this.profile, ...patch })
  }

  now(): number {
    return this.ctx?.currentTime ?? 0
  }

  /** Seconds between "scheduled in the audio clock" and "heard through the speakers". */
  outputLatency(): number {
    return this.ctx ? (this.ctx.outputLatency || this.ctx.baseLatency || 0) : 0
  }

  /** Schedules a metronome click on the audio clock. Returns the node so callers can cancel. */
  click(time: number, accent: boolean, dest?: AudioNode): OscillatorNode | null {
    const ctx = this.ctx
    if (!ctx) return null
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.frequency.value = accent ? 1760 : 1320
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.002)
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
    osc.connect(env).connect(dest ?? ctx.destination)
    osc.start(time)
    osc.stop(time + 0.06)
    return osc
  }

  onFrame(fn: Listener<PitchFrame>) {
    this.frameListeners.add(fn)
    return () => void this.frameListeners.delete(fn)
  }

  onNote(fn: Listener<NoteEvent>) {
    this.noteListeners.add(fn)
    return () => void this.noteListeners.delete(fn)
  }

  onStatus(fn: () => void) {
    this.statusListeners.add(fn)
    return () => void this.statusListeners.delete(fn)
  }

  getVersion = () => this.version

  private emitStatus() {
    this.version++
    this.statusListeners.forEach((fn) => fn())
  }

  private onChunk(samples: Float32Array, time: number) {
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.ringPos] = samples[i]
      this.ringPos = (this.ringPos + 1) % WINDOW
    }
    this.filled = Math.min(WINDOW, this.filled + samples.length)
    const level = rms(samples)
    let freq: number | null = null
    let clarity = 0
    if (this.filled === WINDOW && level >= (this.profile?.gate ?? 0.01)) {
      const tail = WINDOW - this.ringPos
      this.scratch.set(this.ring.subarray(this.ringPos), 0)
      this.scratch.set(this.ring.subarray(0, this.ringPos), tail)
      const p = detectPitch(this.scratch, this.rate)
      if (p) {
        freq = p.freq
        clarity = p.clarity
      }
    }
    const frame: PitchFrame = { time, freq, clarity, rms: level }
    this.lastFrame = frame
    this.frameListeners.forEach((fn) => fn(frame))
    for (const ev of this.tracker.push(frame)) this.noteListeners.forEach((fn) => fn(ev))
  }
}

export const engine = new AudioEngine()
