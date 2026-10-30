import { useState } from 'react'
import { RiffArena } from './arena/RiffArena'
import { JamRoom, RiffPlay, type RiffChart } from './jam'
import { findLevel } from './game/path/worlds'
import { FreePlay } from './ui/FreePlay'
import { Home } from './ui/Home'
import { PathMap } from './ui/PathMap'
import { Play } from './ui/Play'
import { Setup } from './ui/Setup'

type Screen =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'path' }
  | { name: 'free' }
  | { name: 'arena' }
  | { name: 'jam' }
  | { name: 'riff'; chart: RiffChart }
  | { name: 'level'; id: string }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const home = () => setScreen({ name: 'home' })
  const setup = () => setScreen({ name: 'setup' })
  const map = () => setScreen({ name: 'path' })
  const openLevel = (id: string) => setScreen({ name: 'level', id })

  switch (screen.name) {
    case 'setup':
      return <Setup onBack={home} />
    case 'path':
      return <PathMap onBack={home} onLevel={openLevel} />
    case 'free':
      return <FreePlay onBack={home} onSetup={setup} />
    case 'arena':
      return <RiffArena onBack={home} onSetup={setup} />
    case 'jam':
      return <JamRoom onBack={home} onSetup={setup} onPlayRiff={(chart) => setScreen({ name: 'riff', chart })} />
    case 'riff':
      return <RiffPlay chart={screen.chart} onExit={() => setScreen({ name: 'jam' })} onSetup={setup} />
    case 'level': {
      const level = findLevel(screen.id)
      if (!level) return <PathMap onBack={home} onLevel={openLevel} />
      return <Play level={level} onExit={map} onSetup={setup} onLevel={openLevel} />
    }
    default:
      return (
        <Home
          go={(s, id) => {
            if (s === 'path' && id) openLevel(id)
            else setScreen({ name: s } as Screen)
          }}
        />
      )
  }
}
