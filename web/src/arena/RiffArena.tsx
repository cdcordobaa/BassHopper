import { useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { recordRun } from '../game/progress'
import type { ScoreSummary } from '../game/scorer'
import { getChart, patchSong, type Song, type SongChart } from './api'
import { ArenaSession } from './ArenaSession'
import { FreeSession } from './FreeSession'
import { Library } from './Library'
import { Results } from './Results'
import { SongScreen, type ArenaSettings } from './SongScreen'
import { loadArena, recordArenaRun, savePrefs } from './store'
import './arena.css'

type View =
  | { name: 'library' }
  | { name: 'song' }
  | { name: 'play' | 'free'; run: number }
  | { name: 'results'; summary: ScoreSummary; xp: number; avgDelta: number | null }

function initialSettings(): ArenaSettings {
  const p = loadArena().prefs
  return {
    difficulty: p.difficulty,
    speed: p.speed,
    loop: null,
    // On a mic the guide bass would be heard and scored as you, so it starts silent.
    mix: { band: p.band, guide: engine.source?.kind === 'mic' ? 0 : 0.6, duck: p.duck },
  }
}

/** Riff Arena: song library → song setup → play session → results. */
export function RiffArena({ onBack, onSetup }: { onBack: () => void; onSetup: () => void }) {
  const [view, setView] = useState<View>({ name: 'library' })
  const [song, setSong] = useState<Song | null>(null)
  const [chart, setChart] = useState<SongChart | null | undefined>(undefined)
  const [chartError, setChartError] = useState<string | null>(null)
  const [settings, setSettings] = useState<ArenaSettings>(initialSettings)
  const runs = useRef(0)
  const patchTimer = useRef(0)
  const pendingPatch = useRef<{ id: string; offsetSec: number } | null>(null)
  const openId = useRef<string | null>(null)

  const flushPatch = () => {
    clearTimeout(patchTimer.current)
    const p = pendingPatch.current
    pendingPatch.current = null
    if (p) patchSong(p.id, { offsetSec: p.offsetSec }).catch((e: unknown) => console.warn('Could not save sync offset', e))
  }

  // Leaving the arena mid-debounce must still save the nudge.
  useEffect(() => () => flushPatch(), [])

  const open = (s: Song) => {
    openId.current = s.id
    setSong(s)
    setChart(undefined)
    setChartError(null)
    setSettings((st) => ({ ...st, loop: null }))
    setView({ name: 'song' })
    getChart(s.id)
      .then((c) => {
        if (openId.current === s.id) setChart(c)
      })
      .catch((e: unknown) => {
        if (openId.current === s.id) setChartError(e instanceof Error ? e.message : String(e))
      })
  }

  const updateSettings = (patch: Partial<ArenaSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    savePrefs({ band: next.mix.band, duck: next.mix.duck, speed: next.speed, difficulty: next.difficulty })
  }

  const updateOffset = (offsetSec: number) => {
    setSong((s) => (s ? { ...s, offsetSec } : s))
    clearTimeout(patchTimer.current)
    const id = song?.id
    if (!id) return
    pendingPatch.current = { id, offsetSec }
    patchTimer.current = window.setTimeout(flushPatch, 600)
  }

  const go = async (name: 'play' | 'free') => {
    await engine.context()
    runs.current++
    setView({ name, run: runs.current })
  }

  if (view.name === 'library' || !song) {
    return <Library onBack={onBack} onOpen={open} />
  }

  const toSong = () => setView({ name: 'song' })
  const toLibrary = () => setView({ name: 'library' })

  if (view.name === 'play' && chart) {
    return (
      <ArenaSession
        key={view.run}
        song={song}
        chart={chart}
        difficulty={settings.difficulty}
        speed={settings.speed}
        loop={settings.loop}
        mix={settings.mix}
        onOffset={updateOffset}
        onQuit={toSong}
        onDone={(summary, avgDelta) => {
          recordArenaRun(song.id, settings.difficulty, summary)
          const xp = recordRun(`song:${song.id}:${settings.difficulty}`, summary)
          setView({ name: 'results', summary, xp, avgDelta })
        }}
      />
    )
  }

  if (view.name === 'free') {
    return <FreeSession key={view.run} song={song} speed={settings.speed} mix={settings.mix} onQuit={toSong} />
  }

  if (view.name === 'results') {
    return (
      <Results
        song={song}
        difficulty={settings.difficulty}
        speed={settings.speed}
        summary={view.summary}
        xp={view.xp}
        avgDelta={view.avgDelta}
        onRetry={() => void go('play')}
        onSong={toSong}
        onLibrary={toLibrary}
      />
    )
  }

  return (
    <SongScreen
      song={song}
      chart={chart}
      chartError={chartError}
      settings={settings}
      onSettings={updateSettings}
      onOffset={updateOffset}
      onPlay={() => void go('play')}
      onFree={() => void go('free')}
      onBack={toLibrary}
      onSetup={onSetup}
    />
  )
}
