import type { Chart } from '../game/chart'

// Relative so requests go through the Vite proxy: same origin keeps createMediaElementSource audible (no CORS taint).
const BASE = '/api'

export type Stem = 'full' | 'bass' | 'no_bass' | 'drums' | 'vocals' | 'other'

export interface Health {
  ok: boolean
  demucs: boolean
}

export interface TabTrack {
  index: number
  name: string
  strings: number
  isBass: boolean
}

export interface Song {
  id: string
  title: string
  artist: string
  durationSec: number
  hasChart: boolean
  stems: string[]
  offsetSec: number
}

export interface Job {
  state: 'queued' | 'running' | 'done' | 'error'
  step: string
  progress: number
  songId?: string
  error?: string
}

export type SongChart = Chart & {
  tempoMap: { beat: number; bpm: number }[]
  sections: { beat: number; name: string }[]
  droppedNotes?: number
}

export interface ImportRequest {
  audio: File
  tab?: File | null
  title: string
  artist: string
  track?: number | null
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init)
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { detail?: unknown; error?: unknown }
      const detail = body.detail ?? body.error
      if (detail) msg = typeof detail === 'string' ? detail : JSON.stringify(detail)
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Resolves null (never throws) when the helper isn't reachable. */
export async function health(): Promise<Health | null> {
  try {
    const h = await call<Health>('/health')
    return h?.ok ? h : null
  } catch {
    return null
  }
}

export async function listSongs(): Promise<Song[]> {
  return (await call<{ songs: Song[] }>('/songs')).songs
}

export async function tabTracks(tab: File): Promise<TabTrack[]> {
  const fd = new FormData()
  fd.append('tab', tab)
  return (await call<{ tracks: TabTrack[] }>('/tab/tracks', { method: 'POST', body: fd })).tracks
}

export async function startImport(req: ImportRequest): Promise<string> {
  const fd = new FormData()
  fd.append('audio', req.audio)
  if (req.tab) fd.append('tab', req.tab)
  fd.append('title', req.title)
  fd.append('artist', req.artist)
  if (req.track !== null && req.track !== undefined) fd.append('track', String(req.track))
  return (await call<{ jobId: string }>('/import', { method: 'POST', body: fd })).jobId
}

/** Adds or replaces a song's tab; the helper lines it up with the recording when it can. */
export async function attachTab(songId: string, tab: File): Promise<{ song: Song; synced: boolean }> {
  const fd = new FormData()
  fd.append('tab', tab)
  return call<{ song: Song; synced: boolean }>(`/songs/${encodeURIComponent(songId)}/tab`, { method: 'POST', body: fd })
}

export function getJob(jobId: string): Promise<Job> {
  return call<Job>(`/jobs/${encodeURIComponent(jobId)}`)
}

/** Null when the song has no tab (404). */
export async function getChart(songId: string): Promise<SongChart | null> {
  try {
    return await call<SongChart>(`/songs/${encodeURIComponent(songId)}/chart`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export function patchSong(songId: string, patch: Partial<Pick<Song, 'offsetSec' | 'title' | 'artist'>>): Promise<Song> {
  return call<Song>(`/songs/${encodeURIComponent(songId)}`, json('PATCH', patch))
}

export async function deleteSong(songId: string): Promise<void> {
  await call<unknown>(`/songs/${encodeURIComponent(songId)}`, { method: 'DELETE' })
}

export function audioUrl(songId: string, stem: Stem): string {
  return `${BASE}/songs/${encodeURIComponent(songId)}/audio/${stem}`
}

/** The backing track: the bass-free mix when stems exist, otherwise the full song. */
export function bandStem(song: Song): Stem {
  return song.stems.includes('no_bass') ? 'no_bass' : 'full'
}

export function hasGuide(song: Song): boolean {
  return song.stems.includes('bass')
}

/** Consecutive failed polls after which an import job is given up on. */
export const MAX_POLL_FAILURES = 5

/** True when polling a job should stop: the helper forgot it (404) or it keeps failing. */
export function jobLost(err: unknown, failures: number): boolean {
  return (err instanceof ApiError && err.status === 404) || failures >= MAX_POLL_FAILURES
}
