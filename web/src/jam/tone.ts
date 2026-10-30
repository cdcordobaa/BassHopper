import { engine } from '../audio/engine'

export type ToneLib = typeof import('tone')

/**
 * Loads Tone.js and points it at the engine's AudioContext so backing and input share one
 * clock (scheduled times and note-event times are directly comparable). Idempotent.
 *
 * Importing 'tone' eagerly creates its own AudioContext, so it is imported lazily and that
 * throwaway context is disposed (closed) when we swap in the engine's.
 */
export async function ensureTone(): Promise<ToneLib> {
  const [Tone, ctx] = await Promise.all([import('tone'), engine.context()])
  const current = Tone.getContext()
  if (current.rawContext !== ctx) Tone.setContext(new Tone.Context(ctx), true)
  return Tone
}
