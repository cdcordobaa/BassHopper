import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { engine } from '../audio/engine'
import type { NoteEvent, PitchFrame } from '../audio/NoteTracker'
import { createDeviceSource } from '../audio/sources'
import type { InputKind } from '../audio/InputSource'

/** Re-renders whenever the engine's connection or profile changes. */
export function useEngine() {
  useSyncExternalStore((fn) => engine.onStatus(fn), engine.getVersion)
  return engine
}

/** Latest pitch frame, sampled once per animation frame. */
export function useLatestFrame(): PitchFrame | null {
  const [frame, setFrame] = useState<PitchFrame | null>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      setFrame(engine.lastFrame)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return frame
}

/** The note currently ringing (from the tracker), or null. */
export function useCurrentNote(): number | null {
  const [midi, setMidi] = useState<number | null>(null)
  useNoteEvents((e) => setMidi(e.type === 'on' ? e.midi : null))
  return midi
}

export function useNoteEvents(fn: (e: NoteEvent) => void) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => engine.onNote((e) => ref.current(e)), [])
}

interface LastInput {
  kind: Exclude<InputKind, 'file'>
  deviceId?: string
  label: string
}

const LAST_KEY = 'bh.lastInput'

export function rememberInput(i: LastInput) {
  localStorage.setItem(LAST_KEY, JSON.stringify(i))
}

export function lastInput(): LastInput | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as LastInput | null
  } catch {
    return null
  }
}

export async function reconnectLast(): Promise<boolean> {
  const last = lastInput()
  if (!last) return false
  await engine.connect(createDeviceSource(last.kind, last.deviceId, last.label))
  return engine.source !== null
}
