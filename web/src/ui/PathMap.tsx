import { ALL_LEVELS, WORLDS } from '../game/path/worlds'
import { useProgress, type Progress } from '../game/progress'

export function isUnlocked(id: string, p: Progress): boolean {
  const i = ALL_LEVELS.findIndex((l) => l.id === id)
  if (i <= 0) return true
  // Finishing a level (any score) unlocks the next: progress should never block practice.
  return (p.levels[ALL_LEVELS[i - 1].id]?.plays ?? 0) >= 1
}

export function PathMap({ onBack, onLevel }: { onBack: () => void; onLevel: (id: string) => void }) {
  const p = useProgress()
  return (
    <div className="screen path">
      <header className="screen-head">
        <button className="ghost" onClick={onBack}>← Home</button>
        <h1>The Path</h1>
      </header>
      {WORLDS.map((w) => {
        const stars = w.levels.reduce((a, l) => a + (p.levels[l.id]?.stars ?? 0), 0)
        return (
          <section key={w.id} className="world">
            <div className="world-head">
              <h2>World {w.number} · {w.title}</h2>
              <span className="muted">{w.teaches}</span>
              <span className="world-stars">★ {stars}/{w.levels.length * 3}</span>
            </div>
            <div className="levels">
              {w.levels.map((l) => {
                const open = isUnlocked(l.id, p)
                const st = p.levels[l.id]?.stars ?? 0
                return (
                  <button key={l.id} className={`level-node ${l.boss ? 'boss' : ''} ${open ? '' : 'locked'} ${st ? 'cleared' : ''}`} disabled={!open} onClick={() => onLevel(l.id)}>
                    <span className="lv-id">{open ? l.id : '🔒'}</span>
                    <span className="lv-title">{l.title.replace('BOSS: ', '')}</span>
                    {l.boss && <span className="lv-boss">BOSS</span>}
                    <span className="stars">{[1, 2, 3].map((i) => <span key={i} className={i <= st ? 'lit' : ''}>★</span>)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      <section className="world upcoming">
        <h2>After the Path</h2>
        <p className="muted">Finished World {WORLDS.length}? Take it to <b>Riff Arena</b> and play real songs, or make up your own lines in the <b>Jam Room</b>.</p>
      </section>
    </div>
  )
}
