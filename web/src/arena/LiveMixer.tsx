import { useEffect, useState, type RefObject } from 'react'
import type { Mix } from './ArenaSession'
import type { SongPlayer } from './player'

type Part = 'band' | 'guide'
const DEFAULT: Record<Part, number> = { band: 0.8, guide: 0.6 }

/** Band and guide-bass volume while playing, each with an on/off toggle (keys M and G). */
export function LiveMixer({ mix, player, guideAvailable }: { mix: Mix; player: RefObject<SongPlayer | null>; guideAvailable: boolean }) {
  // A part that starts at 0 counts as off; switching it on brings it back at a usable level.
  const [vol, setVol] = useState({ band: mix.band || DEFAULT.band, guide: mix.guide || DEFAULT.guide })
  const [on, setOn] = useState({ band: mix.band > 0, guide: mix.guide > 0 })

  const apply = (k: Part, v: number) => (k === 'band' ? player.current?.setBand(v) : player.current?.setGuide(v))
  const change = (k: Part, v: number) => {
    setVol((m) => ({ ...m, [k]: v }))
    setOn((o) => ({ ...o, [k]: v > 0 }))
    apply(k, v)
  }
  const toggle = (k: Part) => {
    if (k === 'guide' && !guideAvailable) return
    const next = !on[k]
    setOn({ ...on, [k]: next })
    apply(k, next ? vol[k] : 0)
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement && ev.target.type === 'text') return
      if (ev.code === 'KeyM') toggle('band')
      else if (ev.code === 'KeyG') toggle('guide')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const part = (k: Part, label: string, key: string, disabled = false) => (
    <span className={`mix-part ${disabled ? 'muted' : ''}`}>
      <button className={`mix-toggle ${on[k] ? 'on' : ''}`} disabled={disabled} onClick={() => toggle(k)} title={`Turn ${label.toLowerCase()} ${on[k] ? 'off' : 'on'} (${key})`}>
        {on[k] ? '🔊' : '🔇'} {label}
      </button>
      <input type="range" min={0} max={1} step={0.01} disabled={disabled} value={on[k] ? vol[k] : 0} onChange={(ev) => change(k, Number(ev.target.value))} />
    </span>
  )

  return (
    <>
      {part('band', 'Music', 'M')}
      {part('guide', 'Guide bass', 'G', !guideAvailable)}
    </>
  )
}
