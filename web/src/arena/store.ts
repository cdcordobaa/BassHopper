import type { ScoreSummary } from '../game/scorer'
import type { Difficulty } from './difficulty'

export interface ArenaBest {
  stars: number
  bestAccuracy: number
  bestScore: number
  plays: number
}

export interface ArenaPrefs {
  band: number
  duck: boolean
  speed: number
  difficulty: Difficulty
}

export interface ArenaData {
  songs: Record<string, Partial<Record<Difficulty, ArenaBest>>>
  prefs: ArenaPrefs
}

export const ARENA_KEY = 'bh.arena.v1'

const DEFAULT_PREFS: ArenaPrefs = { band: 0.8, duck: true, speed: 1, difficulty: 'rookie' }

type KV = Pick<Storage, 'getItem' | 'setItem'>

const storage = (): KV | null => (typeof localStorage === 'undefined' ? null : localStorage)

export function loadArena(kv: KV | null = storage()): ArenaData {
  try {
    const raw = kv?.getItem(ARENA_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Partial<ArenaData>
      return { songs: d.songs ?? {}, prefs: { ...DEFAULT_PREFS, ...d.prefs } }
    }
  } catch {
    /* corrupt: start fresh */
  }
  return { songs: {}, prefs: { ...DEFAULT_PREFS } }
}

function saveArena(d: ArenaData, kv: KV | null) {
  kv?.setItem(ARENA_KEY, JSON.stringify(d))
}

/** Stores a finished run; returns the updated best for that song + difficulty. */
export function recordArenaRun(songId: string, difficulty: Difficulty, s: ScoreSummary, kv: KV | null = storage()): ArenaBest {
  const d = loadArena(kv)
  const prev = d.songs[songId]?.[difficulty]
  const best: ArenaBest = {
    stars: Math.max(prev?.stars ?? 0, s.stars),
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, s.accuracy),
    bestScore: Math.max(prev?.bestScore ?? 0, s.score),
    plays: (prev?.plays ?? 0) + 1,
  }
  d.songs[songId] = { ...d.songs[songId], [difficulty]: best }
  saveArena(d, kv)
  return best
}

export function savePrefs(patch: Partial<ArenaPrefs>, kv: KV | null = storage()) {
  const d = loadArena(kv)
  d.prefs = { ...d.prefs, ...patch }
  saveArena(d, kv)
}

export function forgetSong(songId: string, kv: KV | null = storage()) {
  const d = loadArena(kv)
  delete d.songs[songId]
  saveArena(d, kv)
}
