import { beforeEach, describe, expect, it, vi } from 'vitest'

const intervals = new Set<number>()
let nextId = 1

function node(): Record<string, unknown> {
  const n: Record<string, unknown> = {
    volume: { value: 0 },
    gain: { rampTo: () => {} },
    frequency: { value: 0 },
    dispose: () => {},
    set: () => {},
    releaseAll: () => {},
    triggerAttackRelease: () => {},
  }
  n.connect = () => n
  n.toDestination = () => n
  return n
}

const fakeTone = {
  Gain: function () { return node() },
  Filter: function () { return node() },
  MembraneSynth: function () { return node() },
  NoiseSynth: function () { return node() },
  MetalSynth: function () { return node() },
  PolySynth: function () { return node() },
  Synth: function () { return node() },
  Frequency: () => ({ toFrequency: () => 440 }),
  getDraw: () => ({ schedule: () => {}, cancel: () => {} }),
  getContext: () => ({
    setInterval: () => {
      const id = nextId++
      intervals.add(id)
      return id
    },
    clearInterval: (id: number) => void intervals.delete(id),
  }),
}

vi.mock('../jam/tone', () => ({ ensureTone: () => new Promise((r) => setTimeout(() => r(fakeTone), 0)) }))
vi.mock('../audio/engine', () => ({ engine: { ctx: { currentTime: 0 }, outputLatency: () => 0 } }))

const { Backing, defaultOptions } = await import('../jam/backing')

describe('Backing start cancellation', () => {
  beforeEach(() => intervals.clear())

  it('runs normally when not interrupted', async () => {
    const b = new Backing(defaultOptions('rock'))
    await b.start()
    expect(b.running).toBe(true)
    expect(intervals.size).toBe(1)
    b.stop()
    expect(intervals.size).toBe(0)
  })

  it('dispose during a pending start leaves nothing running (StrictMode remount)', async () => {
    const b = new Backing(defaultOptions('rock'))
    const p = b.start()
    b.dispose()
    await p
    expect(b.running).toBe(false)
    expect(intervals.size).toBe(0)
  })

  it('double start then stop leaves no scheduler behind', async () => {
    const b = new Backing(defaultOptions('rock'))
    const p1 = b.start()
    const p2 = b.start()
    await Promise.all([p1, p2])
    expect(intervals.size).toBe(1)
    b.stop()
    expect(intervals.size).toBe(0)
  })

  it('stop during a pending start cancels it', async () => {
    const b = new Backing(defaultOptions('rock'))
    const p = b.start()
    b.stop()
    await p
    expect(b.running).toBe(false)
    expect(intervals.size).toBe(0)
  })
})
