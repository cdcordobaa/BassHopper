import { useEffect, useState } from 'react'
import { getJob, jobLost, startImport, tabTracks, type Job, type TabTrack } from './api'

const AUDIO_ACCEPT = '.mp3,.wav,.m4a,.flac,audio/*'
const TAB_ACCEPT = '.gp3,.gp4,.gp5,.gpx,.gp'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Guess "Artist - Title" from a file name. */
function guessNames(file: File): { title: string; artist: string } {
  const base = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim()
  const m = /^(.+?)\s+-\s+(.+)$/.exec(base)
  return m ? { artist: m[1], title: m[2] } : { artist: '', title: base }
}

export function ImportPanel({ demucs, onImported }: { demucs: boolean; onImported: (songId: string) => void }) {
  const [audio, setAudio] = useState<File | null>(null)
  const [tab, setTab] = useState<File | null>(null)
  const [tracks, setTracks] = useState<TabTrack[] | null>(null)
  const [track, setTrack] = useState<number | null>(null)
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [formKey, setFormKey] = useState(0)

  const pickAudio = (f: File | null) => {
    setAudio(f)
    if (f) {
      const g = guessNames(f)
      if (!title) setTitle(g.title)
      if (!artist) setArtist(g.artist)
    }
  }

  const pickTab = async (f: File | null) => {
    setTab(f)
    setTracks(null)
    setTrack(null)
    setError(null)
    if (!f) return
    setLoadingTracks(true)
    try {
      const ts = await tabTracks(f)
      setTracks(ts)
      setTrack((ts.find((t) => t.isBass) ?? ts[0])?.index ?? null)
    } catch (e) {
      setError(`Couldn't read that tab: ${errText(e)}`)
    } finally {
      setLoadingTracks(false)
    }
  }

  const submit = async () => {
    if (!audio || uploading) return
    setError(null)
    setUploading(true)
    try {
      const id = await startImport({ audio, tab, title: title.trim() || audio.name, artist: artist.trim(), track: tab ? track : null })
      setJob({ state: 'queued', step: 'Uploading done, waiting to start…', progress: 0 })
      setJobId(id)
    } catch (e) {
      setError(`Import failed: ${errText(e)}`)
    } finally {
      setUploading(false)
    }
  }

  const dismiss = () => {
    setJobId(null)
    setJob(null)
  }

  useEffect(() => {
    if (!jobId) return
    let alive = true
    let timer = 0
    let failures = 0
    const poll = async () => {
      try {
        const j = await getJob(jobId)
        if (!alive) return
        failures = 0
        setJob(j)
        setError(null)
        if (j.state === 'done') {
          setJobId(null)
          setAudio(null)
          setTab(null)
          setTracks(null)
          setTitle('')
          setArtist('')
          setFormKey((k) => k + 1)
          if (j.songId) onImported(j.songId)
          return
        }
        if (j.state === 'error') {
          setJobId(null)
          setError(j.error || 'Import failed')
          return
        }
      } catch (e) {
        if (!alive) return
        failures++
        if (jobLost(e, failures)) {
          setJobId(null)
          setJob(null)
          setError(`Lost track of the import: ${errText(e)}. Refresh the library to see if it finished.`)
          return
        }
        setError(`Having trouble reaching the helper (${errText(e)}), retrying…`)
      }
      timer = window.setTimeout(poll, 800)
    }
    void poll()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [jobId, onImported])

  const busy = jobId !== null || uploading
  return (
    <section className="card arena-import">
      <h2>Import a song</h2>
      <p className="muted small">
        Audio is required. Add a Guitar Pro file to get a playable chart; without one you can still play along freely.
        {!demucs && ' Stem separation isn\'t available, so the original bass stays in the mix.'}
      </p>
      <div className="arena-form" key={formKey}>
        <label>
          <span>Audio</span>
          <input type="file" accept={AUDIO_ACCEPT} disabled={busy} onChange={(ev) => pickAudio(ev.target.files?.[0] ?? null)} />
        </label>
        <label>
          <span>Guitar Pro (optional)</span>
          <input type="file" accept={TAB_ACCEPT} disabled={busy} onChange={(ev) => void pickTab(ev.target.files?.[0] ?? null)} />
        </label>
        {loadingTracks && <p className="muted small">Reading tracks…</p>}
        {tracks && (
          <label>
            <span>Bass track</span>
            <select value={track ?? ''} disabled={busy} onChange={(ev) => setTrack(Number(ev.target.value))}>
              {tracks.map((t) => (
                <option key={t.index} value={t.index}>
                  {t.name || `Track ${t.index + 1}`} · {t.strings} strings{t.isBass ? ' · bass' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {tracks && tracks.length > 0 && !tracks.some((t) => t.isBass) && <p className="warn small">No track is marked as bass — pick the one that is.</p>}
        <label>
          <span>Title</span>
          <input type="text" value={title} disabled={busy} onChange={(ev) => setTitle(ev.target.value)} />
        </label>
        <label>
          <span>Artist</span>
          <input type="text" value={artist} disabled={busy} onChange={(ev) => setArtist(ev.target.value)} />
        </label>
      </div>
      <div className="row">
        <button className="primary" disabled={!audio || busy || loadingTracks} onClick={() => void submit()}>
          {uploading ? 'Uploading…' : busy ? 'Importing…' : 'Import'}
        </button>
        {jobId !== null && (
          <button className="ghost" onClick={dismiss} title="Stop watching this import (it keeps running in the helper)">
            Dismiss
          </button>
        )}
        {job && (busy || job.state === 'done') && (
          <div className="arena-progress">
            <div className="arena-bar">
              <div style={{ width: `${Math.round(Math.min(1, Math.max(0, job.progress)) * 100)}%` }} />
            </div>
            <span className="muted small">
              {job.state === 'done' ? 'Done! Added to your library.' : `${job.step || job.state} · ${Math.round(job.progress * 100)}%`}
            </span>
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
