import { audioUrl, bandStem, hasGuide, type Song, type Stem } from './api'
import { ClockEstimator, stemSeekTarget } from './sync'

const DUCK_RATIO = 0.12
const RESYNC_EVERY = 1.5
const MAX_STEM_DRIFT = 0.04

function makeElement(url: string, rate: number): HTMLAudioElement {
  const el = new Audio()
  el.preload = 'auto'
  el.preservesPitch = true
  el.src = url
  el.playbackRate = rate
  el.defaultPlaybackRate = rate
  return el
}

function whenReady(el: HTMLAudioElement, timeoutMs = 20000): Promise<void> {
  if (el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = (err?: string) => {
      clearTimeout(timer)
      el.removeEventListener('canplaythrough', ok)
      el.removeEventListener('error', bad)
      if (err) reject(new Error(err))
      else resolve()
    }
    const ok = () => done()
    const bad = () => done(`Could not load audio (${el.error?.message || 'is the helper running?'})`)
    // Browsers defer media loading in hidden tabs, so only time out while the page is visible.
    const expire = () => {
      if (document.hidden) timer = setTimeout(expire, timeoutMs)
      else done('Audio took too long to load')
    }
    let timer = setTimeout(expire, timeoutMs)
    el.addEventListener('canplaythrough', ok)
    el.addEventListener('error', bad)
  })
}

/**
 * Plays a song's band mix (and optionally its bass stem as a guide) through the engine's
 * AudioContext, so clicks, scoring and audio share one clock. The band element is the master;
 * its position is tracked by a ClockEstimator to map song seconds to ctx time.
 */
export class SongPlayer {
  readonly band: HTMLAudioElement
  readonly guide: HTMLAudioElement | null
  readonly clock = new ClockEstimator()
  readonly rate: number
  private ctx: AudioContext
  private nodes: AudioNode[] = []
  private bandGain: GainNode
  private guideGain: GainNode | null = null
  private guideLevel = 0
  private ducked = false
  private lastResync = 0
  private startTimer = 0
  private startPending = false
  private disposed = false
  // How long the guide's last resync seek took (ctx seconds); the band moves on meanwhile.
  private guideSeekCost = 0
  private guideSeekAt: number | null = null
  // currentTime sits still for a few frames after play()/seek; those samples would skew the clock.
  private heldAt: number | null = null

  constructor(ctx: AudioContext, song: Song, rate: number, opts: { band: number; guide: number; bandStem?: Stem }) {
    this.ctx = ctx
    this.rate = rate
    const bus = ctx.createGain()
    bus.connect(ctx.destination)
    this.band = makeElement(audioUrl(song.id, opts.bandStem ?? bandStem(song)), rate)
    this.bandGain = ctx.createGain()
    this.bandGain.gain.value = opts.band
    const bandSrc = ctx.createMediaElementSource(this.band)
    bandSrc.connect(this.bandGain).connect(bus)
    this.nodes.push(bus, bandSrc, this.bandGain)

    if (hasGuide(song)) {
      this.guide = makeElement(audioUrl(song.id, 'bass'), rate)
      this.guideGain = ctx.createGain()
      this.guideLevel = opts.guide
      this.guideGain.gain.value = opts.guide
      const guideSrc = ctx.createMediaElementSource(this.guide)
      guideSrc.connect(this.guideGain).connect(bus)
      this.nodes.push(guideSrc, this.guideGain)
      this.guide.addEventListener('seeked', () => {
        if (this.guideSeekAt === null) return
        this.guideSeekCost = this.ctx.currentTime - this.guideSeekAt
        this.guideSeekAt = null
      })
    } else {
      this.guide = null
    }
  }

  private get elements(): HTMLAudioElement[] {
    return this.guide ? [this.band, this.guide] : [this.band]
  }

  load(): Promise<void> {
    return Promise.all(this.elements.map((el) => whenReady(el))).then(() => undefined)
  }

  get duration(): number {
    return Number.isFinite(this.band.duration) ? this.band.duration : 0
  }

  get playing(): boolean {
    return !this.band.paused
  }

  /** True during the silent lead of start(): audio is scheduled but hasn't begun. */
  get starting(): boolean {
    return this.startPending
  }

  /**
   * Starts from song second `fromSec`. A negative value means "silence first": playback begins
   * at 0 after -fromSec song-seconds. Returns the ctx time at which playback should begin.
   */
  start(fromSec: number): number {
    clearTimeout(this.startTimer)
    this.elements.forEach((el) => el.pause())
    const seekTo = Math.max(0, fromSec)
    const delay = Math.max(0, -fromSec) / this.rate
    this.elements.forEach((el) => (el.currentTime = seekTo))
    const startAt = this.ctx.currentTime + delay
    // Provisional mapping until real position samples arrive.
    this.clock.reset(this.rate, startAt - seekTo / this.rate)
    this.heldAt = seekTo
    const go = () => {
      this.startPending = false
      if (this.disposed) return
      this.elements.forEach((el) => void el.play().catch(() => undefined))
    }
    this.guideSeekAt = null
    if (delay > 0) {
      this.startPending = true
      this.startTimer = window.setTimeout(go, delay * 1000)
    } else go()
    return startAt
  }

  pause() {
    clearTimeout(this.startTimer)
    this.startPending = false
    this.elements.forEach((el) => el.pause())
  }

  resume() {
    const pos = this.band.currentTime
    this.guideSeekAt = null
    if (this.guide) this.guide.currentTime = pos
    this.clock.reset(this.rate, this.ctx.currentTime - pos / this.rate)
    this.heldAt = pos
    this.elements.forEach((el) => void el.play().catch(() => undefined))
  }

  seek(sec: number) {
    const t = Math.max(0, Math.min(sec, this.duration || sec))
    this.guideSeekAt = null
    this.elements.forEach((el) => (el.currentTime = t))
    this.clock.reset(this.rate, this.ctx.currentTime - t / this.rate)
    this.heldAt = t
  }

  /** Call once per animation frame while playing. */
  sample() {
    const el = this.band
    if (el.paused || el.seeking || el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return
    if (this.heldAt !== null) {
      if (el.currentTime === this.heldAt) return
      this.heldAt = null
    }
    this.clock.push(this.ctx.currentTime, el.currentTime)
    const g = this.guide
    if (g && this.ctx.currentTime - this.lastResync > RESYNC_EVERY) {
      this.lastResync = this.ctx.currentTime
      if (!g.seeking && Math.abs(g.currentTime - el.currentTime) > MAX_STEM_DRIFT) {
        this.guideSeekAt = this.ctx.currentTime
        g.currentTime = stemSeekTarget(el.currentTime, this.guideSeekCost, this.rate)
      }
    }
  }

  setBand(v: number) {
    this.bandGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
  }

  setGuide(v: number) {
    this.guideLevel = v
    this.applyGuide()
  }

  /** Miss-dropout: the guide bass fades while you're missing, returns when you hit. */
  duck(on: boolean) {
    if (on === this.ducked) return
    this.ducked = on
    this.applyGuide()
  }

  private applyGuide() {
    this.guideGain?.gain.setTargetAtTime(this.guideLevel * (this.ducked ? DUCK_RATIO : 1), this.ctx.currentTime, 0.03)
  }

  dispose() {
    this.disposed = true
    this.startPending = false
    clearTimeout(this.startTimer)
    for (const el of this.elements) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    this.nodes.forEach((n) => n.disconnect())
  }
}
