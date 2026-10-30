import type { InputProfile, InputSource } from './InputSource'

const key = (id: string) => `bh.profile.${id}`

export function loadProfile(source: InputSource): InputProfile {
  const raw = localStorage.getItem(key(source.id))
  const base = source.defaultProfile()
  if (!raw) return base
  try {
    return { ...base, ...(JSON.parse(raw) as Partial<InputProfile>) }
  } catch {
    return base
  }
}

export function saveProfile(source: InputSource, profile: InputProfile) {
  localStorage.setItem(key(source.id), JSON.stringify(profile))
}
