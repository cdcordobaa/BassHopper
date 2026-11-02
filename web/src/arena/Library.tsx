import { useCallback, useEffect, useState } from 'react'
import { attachTab, deleteSong, health, listSongs, type Health, type Song } from './api'
import { DIFFICULTIES } from './difficulty'
import { fmtDuration } from './format'
import { ImportPanel } from './ImportPanel'
import { forgetSong, loadArena } from './store'
import './arena.css'

type State = { name: 'checking' } | { name: 'offline' } | { name: 'ready'; health: Health; songs: Song[] } | { name: 'error'; message: string }

export function Library({ onBack, onOpen }: { onBack: () => void; onOpen: (song: Song) => void }) {
  const [state, setState] = useState<State>({ name: 'checking' })
  const [confirm, setConfirm] = useState<string | null>(null)
  const [arena, setArena] = useState(loadArena)
  const [tabMsg, setTabMsg] = useState<{ id: string; text: string } | null>(null)

  const refresh = useCallback(async () => {
    const h = await health()
    if (!h) {
      setState({ name: 'offline' })
      return
    }
    try {
      setState({ name: 'ready', health: h, songs: await listSongs() })
    } catch (e) {
      setState({ name: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onImported = useCallback(() => void refresh(), [refresh])

  // Songs dropped into ~/BassHopper/inbox show up without a reload.
  useEffect(() => {
    if (state.name !== 'ready') return
    const id = setInterval(() => {
      listSongs()
        .then((songs) => setState((st) => (st.name === 'ready' && songs.length !== st.songs.length ? { ...st, songs } : st)))
        .catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [state.name])

  const addTab = async (song: Song, file: File) => {
    setTabMsg({ id: song.id, text: 'Reading the tab…' })
    try {
      const { synced } = await attachTab(song.id, file)
      setTabMsg({
        id: song.id,
        text: synced ? 'Tab added and lined up with the recording ✓' : 'Tab added. Use the sync buttons while playing to line it up.',
      })
      await refresh()
    } catch (e) {
      setTabMsg({ id: song.id, text: e instanceof Error ? e.message : String(e) })
    }
  }

  const remove = async (id: string) => {
    setConfirm(null)
    try {
      await deleteSong(id)
      forgetSong(id)
      setArena(loadArena())
      await refresh()
    } catch (e) {
      setState({ name: 'error', message: `Delete failed: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  return (
    <div className="screen arena">
      <header className="screen-head">
        <button className="ghost" onClick={onBack}>← Home</button>
        <h1>🎸 Riff Arena</h1>
        <button className="ghost" onClick={() => void refresh()} title="Refresh">↻</button>
      </header>

      {state.name === 'checking' && <p className="muted">Looking for the helper…</p>}

      {state.name === 'offline' && (
        <section className="card">
          <h2>Helper not running</h2>
          <p>
            Riff Arena needs the local helper for importing songs, stems and your library. Start it with <code>./start.sh</code> from the BassHopper folder, then hit retry.
          </p>
          <button className="primary" onClick={() => void refresh()}>Retry</button>
        </section>
      )}

      {state.name === 'error' && (
        <section className="card">
          <p className="error">{state.message}</p>
          <button onClick={() => void refresh()}>Retry</button>
        </section>
      )}

      {state.name === 'ready' && (
        <>
          <section className="arena-songs">
            {state.songs.length === 0 && <p className="muted">No songs yet — import one below.</p>}
            {state.songs.map((s) => {
              const best = arena.songs[s.id] ?? {}
              return (
                <div key={s.id} className="arena-song card">
                  <button className="arena-song-main" onClick={() => onOpen(s)}>
                    <b>{s.title}</b>
                    <span className="muted">
                      {s.artist || 'Unknown artist'} · {fmtDuration(s.durationSec)}
                    </span>
                    <span className="arena-badges">
                      <span className={s.hasChart ? 'badge on' : 'badge'}>{s.hasChart ? 'tab' : 'no tab'}</span>
                      {s.stems.includes('no_bass') && <span className="badge on">bass muted</span>}
                    </span>
                  </button>
                  {s.hasChart && (
                    <div className="arena-tiers">
                      {DIFFICULTIES.map((d) => (
                        <span key={d.id} className="arena-tier">
                          <span className="muted small">{d.label}</span>
                          <span className="stars">{[1, 2, 3].map((i) => <span key={i} className={i <= (best[d.id]?.stars ?? 0) ? 'lit' : ''}>★</span>)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="row">
                    <button className="primary" onClick={() => onOpen(s)}>{s.hasChart ? 'Play' : 'Play along'}</button>
                    <label className="button ghost" title="Attach a Guitar Pro tab (.gp, .gp5, .gpx…)">
                      📎 {s.hasChart ? 'Replace tab' : 'Add tab'}
                      <input
                        type="file"
                        accept=".gp,.gpx,.gp5,.gp4,.gp3"
                        hidden
                        onChange={(ev) => {
                          const f = ev.target.files?.[0]
                          ev.target.value = ''
                          if (f) void addTab(s, f)
                        }}
                      />
                    </label>
                    {confirm === s.id ? (
                      <>
                        <button className="danger" onClick={() => void remove(s.id)}>Delete for good</button>
                        <button className="ghost" onClick={() => setConfirm(null)}>Keep</button>
                      </>
                    ) : (
                      <button className="ghost" onClick={() => setConfirm(s.id)} title="Delete song">🗑</button>
                    )}
                  </div>
                  {tabMsg?.id === s.id && <p className="muted small">{tabMsg.text}</p>}
                </div>
              )
            })}
            <p className="muted small">
              Tip: drop audio and Guitar Pro tabs into <code>~/BassHopper/inbox</code>. They're paired by name, and a tab
              dropped later attaches to its song.
            </p>
          </section>
          <ImportPanel demucs={state.health.demucs} onImported={onImported} />
        </>
      )}
    </div>
  )
}
