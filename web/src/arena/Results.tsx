import type { ScoreSummary } from '../game/scorer'
import type { Song } from './api'
import { DIFFICULTIES, type Difficulty } from './difficulty'
import { loadArena } from './store'
import './arena.css'

interface Props {
  song: Song
  difficulty: Difficulty
  speed: number
  summary: ScoreSummary
  xp: number
  avgDelta: number | null
  onRetry: () => void
  onSong: () => void
  onLibrary: () => void
}

export function Results({ song, difficulty, speed, summary: s, xp, avgDelta, onRetry, onSong, onLibrary }: Props) {
  const best = loadArena().songs[song.id] ?? {}
  const label = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty
  const tendency =
    avgDelta === null
      ? null
      : Math.abs(avgDelta) < 0.015
        ? 'Your timing is centred. Nice.'
        : `On average you play ${Math.round(Math.abs(avgDelta) * 1000)} ms ${avgDelta > 0 ? 'late' : 'early'}. If it feels right to you, the song sync may be off — nudge it on the song screen.`
  const nextTier = difficulty === 'rookie' ? 'Groove' : difficulty === 'groove' ? 'Full Riff' : null
  return (
    <div className="screen results">
      <h1>{song.title}</h1>
      <p className="muted">
        {label} · {Math.round(speed * 100)}% speed
      </p>
      <div className="stars big">{[1, 2, 3].map((i) => <span key={i} className={i <= s.stars ? 'lit' : ''}>★</span>)}</div>
      <div className="result-grid">
        <div><b>{Math.round(s.accuracy * 100)}%</b>accuracy</div>
        <div><b>{s.score}</b>score</div>
        <div><b>{s.maxCombo}</b>best combo</div>
        <div><b>+{xp}</b>XP</div>
      </div>
      <p className="muted">
        <span className="g-perfect">{s.perfect} perfect</span> · <span className="g-good">{s.good} good</span> · <span className="g-miss">{s.miss} miss</span>
      </p>
      {tendency && <p>{tendency}</p>}
      <div className="arena-tiers center">
        {DIFFICULTIES.map((d) => (
          <span key={d.id} className="arena-tier">
            <span className="muted small">{d.label}</span>
            <span className="stars">{[1, 2, 3].map((i) => <span key={i} className={i <= (best[d.id]?.stars ?? 0) ? 'lit' : ''}>★</span>)}</span>
          </span>
        ))}
      </div>
      {s.stars >= 2 && nextTier && <p>Ready for more? Try {nextTier}.</p>}
      {s.stars < 2 && <p className="muted">Tough one? Drop the speed or loop the hard section.</p>}
      <div className="row center">
        <button className="primary" onClick={onRetry}>↻ Retry</button>
        <button onClick={onSong}>Song settings</button>
        <button className="ghost" onClick={onLibrary}>Library</button>
      </div>
    </div>
  )
}
