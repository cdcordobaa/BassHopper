import { ALL_LEVELS, WORLDS } from '../game/path/worlds'
import { useProgress, type Progress } from '../game/progress'

export function isUnlocked(id: string, p: Progress): boolean {
  const i = ALL_LEVELS.findIndex((l) => l.id === id)
  if (i <= 0) return true
  return (p.levels[ALL_LEVELS[i - 1].id]?.stars ?? 0) >= 2
}

const UPCOMING = [
  { n: 4, title: 'Roots', teaches: 'Root notes over chord changes' },
  { n: 5, title: 'Shapes', teaches: 'Octaves, fifths, the power shape' },
  { n: 6, title: 'Scales', teaches: 'Pentatonic and blues' },
  { n: 7, title: 'Groove', teaches: 'Syncopation, dead notes, feel' },
  { n: 8, title: 'Read It', teaches: 'Sight-reading tab and notation' },
]

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
        <h2>Coming next</h2>
        <div className="levels">
          {UPCOMING.map((u) => (
            <div key={u.n} className="level-node locked">
              <span className="lv-id">W{u.n}</span>
              <span className="lv-title">{u.title}</span>
              <span className="muted small">{u.teaches}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
