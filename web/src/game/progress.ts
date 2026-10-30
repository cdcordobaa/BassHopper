import { useSyncExternalStore } from 'react'
import type { ScoreSummary } from './scorer'

export interface LevelProgress {
  stars: number
  bestScore: number
  bestAccuracy: number
  plays: number
}

export interface Progress {
  xp: number
  levels: Record<string, LevelProgress>
  /** ISO dates (yyyy-mm-dd) with at least one session, for streaks. */
  days: string[]
}

const KEY = 'bh.progress.v1'
const listeners = new Set<() => void>()
let cache: Progress = load()

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { xp: 0, levels: {}, days: [], ...(JSON.parse(raw) as Partial<Progress>) }
  } catch {
    /* fall through */
  }
  return { xp: 0, levels: {}, days: [] }
}

function save(p: Progress) {
  cache = p
  localStorage.setItem(KEY, JSON.stringify(p))
  listeners.forEach((fn) => fn())
}

export function useProgress(): Progress {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => cache,
  )
}

export function getProgress(): Progress {
  return cache
}

const today = () => new Date().toISOString().slice(0, 10)

/** Records a finished run. Returns XP earned. */
export function recordRun(levelId: string, s: ScoreSummary): number {
  const prev = cache.levels[levelId]
  const prevStars = prev?.stars ?? 0
  const earned = 20 + Math.round(s.accuracy * 30) + Math.max(0, s.stars - prevStars) * 100
  save({
    xp: cache.xp + earned,
    days: cache.days.includes(today()) ? cache.days : [...cache.days, today()],
    levels: {
      ...cache.levels,
      [levelId]: {
        stars: Math.max(prevStars, s.stars),
        bestScore: Math.max(prev?.bestScore ?? 0, s.score),
        bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, s.accuracy),
        plays: (prev?.plays ?? 0) + 1,
      },
    },
  })
  return earned
}

export function streak(p: Progress): number {
  const set = new Set(p.days)
  let n = 0
  const d = new Date()
  if (!set.has(today())) d.setDate(d.getDate() - 1)
  while (set.has(d.toISOString().slice(0, 10))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function playerLevel(xp: number): { level: number; into: number; needed: number } {
  let level = 1
  let need = 200
  let rest = xp
  while (rest >= need) {
    rest -= need
    level++
    need = Math.round(need * 1.25)
  }
  return { level, into: rest, needed: need }
}
