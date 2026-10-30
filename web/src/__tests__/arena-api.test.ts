import { afterEach, describe, expect, it, vi } from 'vitest'
import { audioUrl, bandStem, getChart, health, listSongs, patchSong, startImport, type Song } from '../arena/api'

function respond(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

const song: Song = { id: 'a b', title: 't', artist: '', durationSec: 1, hasChart: true, stems: ['full'], offsetSec: 0 }

describe('arena api client', () => {
  it('health returns null when the helper is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await health()).toBeNull()
  })

  it('health returns the payload when up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, { ok: true, demucs: false })))
    expect(await health()).toEqual({ ok: true, demucs: false })
  })

  it('lists songs through the proxy path', async () => {
    const f = vi.fn().mockResolvedValue(respond(200, { songs: [song] }))
    vi.stubGlobal('fetch', f)
    expect(await listSongs()).toEqual([song])
    expect(f.mock.calls[0][0]).toBe('/api/songs')
  })

  it('getChart maps 404 to null and surfaces other errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(404, { detail: 'no chart' })))
    expect(await getChart('x')).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(500, { detail: 'boom' })))
    await expect(getChart('x')).rejects.toThrow('boom')
  })

  it('sends import as multipart with optional fields', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(respond(200, { jobId: 'j1' })))
    vi.stubGlobal('fetch', f)
    const audio = new File(['x'], 'song.mp3')
    expect(await startImport({ audio, title: 'T', artist: 'A', track: null })).toBe('j1')
    const fd = f.mock.calls[0][1].body as FormData
    expect(fd.get('title')).toBe('T')
    expect(fd.has('tab')).toBe(false)
    expect(fd.has('track')).toBe(false)
    await startImport({ audio, tab: new File(['y'], 's.gp5'), title: 'T', artist: '', track: 2 })
    const fd2 = f.mock.calls[1][1].body as FormData
    expect(fd2.get('track')).toBe('2')
    expect(fd2.has('tab')).toBe(true)
  })

  it('patches offset as JSON', async () => {
    const f = vi.fn().mockResolvedValue(respond(200, song))
    vi.stubGlobal('fetch', f)
    await patchSong('a b', { offsetSec: 0.12 })
    expect(f.mock.calls[0][0]).toBe('/api/songs/a%20b')
    expect(f.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: '{"offsetSec":0.12}' })
  })

  it('builds stem urls and picks the bass-free mix when present', () => {
    expect(audioUrl('a b', 'no_bass')).toBe('/api/songs/a%20b/audio/no_bass')
    expect(bandStem(song)).toBe('full')
    expect(bandStem({ ...song, stems: ['full', 'bass', 'no_bass'] })).toBe('no_bass')
  })
})
