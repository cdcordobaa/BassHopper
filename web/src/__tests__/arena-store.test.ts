import { describe, expect, it } from 'vitest'
import { ARENA_KEY, forgetSong, loadArena, recordArenaRun, savePrefs } from '../arena/store'
import type { ScoreSummary } from '../game/scorer'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

const run = (stars: 0 | 1 | 2 | 3, accuracy: number, score = 100): ScoreSummary => ({ perfect: 0, good: 0, miss: 0, total: 1, accuracy, stars, score, maxCombo: 0 })

describe('arena store', () => {
  it('keeps the best stars per song and difficulty', () => {
    const kv = memory()
    recordArenaRun('s1', 'rookie', run(2, 0.8), kv)
    recordArenaRun('s1', 'rookie', run(1, 0.6, 500), kv)
    recordArenaRun('s1', 'full', run(1, 0.55), kv)
    const d = loadArena(kv)
    expect(d.songs.s1.rookie).toEqual({ stars: 2, bestAccuracy: 0.8, bestScore: 500, plays: 2 })
    expect(d.songs.s1.full?.stars).toBe(1)
    expect(kv.m.has(ARENA_KEY)).toBe(true)
  })

  it('stores prefs and survives corrupt data', () => {
    const kv = memory()
    kv.setItem(ARENA_KEY, '{nope')
    expect(loadArena(kv).prefs.difficulty).toBe('rookie')
    savePrefs({ speed: 0.75 }, kv)
    expect(loadArena(kv).prefs).toMatchObject({ speed: 0.75, duck: true })
  })

  it('forgets deleted songs', () => {
    const kv = memory()
    recordArenaRun('s1', 'groove', run(3, 1), kv)
    forgetSong('s1', kv)
    expect(loadArena(kv).songs.s1).toBeUndefined()
  })
})
