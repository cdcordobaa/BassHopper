import { playerLevel, streak, useProgress } from '../game/progress'
import { ALL_LEVELS } from '../game/path/worlds'
import { isUnlocked } from './PathMap'
import { lastInput, reconnectLast, useEngine } from './hooks'

export function Home({ go }: { go: (screen: 'path' | 'free' | 'setup' | 'arena' | 'jam', levelId?: string) => void }) {
  const e = useEngine()
  const p = useProgress()
  const lvl = playerLevel(p.xp)
  const days = streak(p)
  const last = lastInput()
  const nextUp = ALL_LEVELS.find((l) => isUnlocked(l.id, p) && (p.levels[l.id]?.stars ?? 0) < 2) ?? ALL_LEVELS[ALL_LEVELS.length - 1]

  return (
    <div className="screen home">
      <div className="hero">
        <h1 className="logo">Bass<span>Hopper</span></h1>
        <p className="muted">Your bass. Your path. Turn it up.</p>
      </div>

      {!window.isSecureContext && (
        <p className="warn">
          Opened over Wi-Fi: browsers block the mic and audio engine here. Open <b>http://localhost:{location.port}</b> on the
          computer running BassHopper to play.
        </p>
      )}

      <div className="player">
        <div>
          <b>Level {lvl.level}</b>
          <div className="xpbar"><div style={{ width: `${(lvl.into / lvl.needed) * 100}%` }} /></div>
          <span className="muted small">{lvl.into}/{lvl.needed} XP</span>
        </div>
        <div className="streak">🔥 {days} day{days === 1 ? '' : 's'}</div>
        <div className="input-status">
          {e.source ? (
            <span className="ok">● {e.source.label}</span>
          ) : last ? (
            <button onClick={reconnectLast}>🎸 Connect {last.label}</button>
          ) : (
            <button className="primary" onClick={() => go('setup')}>🎸 Set up your bass</button>
          )}
        </div>
      </div>

      <div className="tiles">
        <button className="tile tile-path" onClick={() => go('path', nextUp.id)}>
          <span className="tile-icon">🗺️</span>
          <b>Continue the Path</b>
          <span>Next: {nextUp.id} · {nextUp.title}</span>
        </button>
        <button className="tile" onClick={() => go('path')}>
          <span className="tile-icon">⭐</span>
          <b>World Map</b>
          <span>All lessons & stars</span>
        </button>
        <button className="tile" onClick={() => go('free')}>
          <span className="tile-icon">🎸</span>
          <b>Free Play</b>
          <span>Fretboard, metronome, Note Hunt</span>
        </button>
        <button className="tile" onClick={() => go('setup')}>
          <span className="tile-icon">🎚️</span>
          <b>Setup & Tuner</b>
          <span>Input, levels, calibration</span>
        </button>
        <button className="tile" onClick={() => go('arena')}>
          <span className="tile-icon">🎤</span>
          <b>Riff Arena</b>
          <span>Play along with real songs</span>
        </button>
        <button className="tile" onClick={() => go('jam')}>
          <span className="tile-icon">🎛️</span>
          <b>Jam Room</b>
          <span>Backing band · record your own riffs</span>
        </button>
      </div>
    </div>
  )
}
