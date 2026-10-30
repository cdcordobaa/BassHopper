# BassHoper — Design Spec

Date: 2026-10-29
Status: Approved (brainstorming session)

## Goal

A personal, game-style bass learning app. It listens to a real bass (amp + mic now, audio interface later),
teaches solid foundations through a campaign, lets me play real songs on a note highway, and fosters
creativity through a jam room. Single user, local only. No accounts, no distribution of songs.

## Platform

- Web app (TypeScript + React + Vite) in the desktop browser first; tablet later via LAN.
- Local helper (Python + FastAPI) for heavy work: stem separation (Demucs), Guitar Pro import, transcription (basic-pitch), library storage.
- `./start.sh` starts both.

## Milestones

1. **It hears me** — input selection, level meter, tuner, calibration (open strings + latency), live fretboard, The Path worlds 1–3 playable on the highway with scoring.
2. **Rock out** — helper imports MP3 + .gp → stems + chart; song library; Riff Arena with bass-muted mix, miss-dropout, speed slider, loop, auto difficulty tiers (Rookie / Groove / Full Riff).
3. **Jam Room** — generated backing (Tone.js: drums + chords, key/tempo/style), safe-notes fretboard, jam recording, save riffs to "My Riffs" (playable on highway).
4. **Habit** — Daily Groove sessions, streaks, XP, skill stats, auto-transcription fallback, tablet layout.

Out of scope: online, accounts, multiplayer, store.

## Architecture

### Input sources (plug-ins)

```ts
interface InputSource {
  id: string; kind: 'mic' | 'interface' | 'file'; label: string;
  start(ctx: AudioContext): Promise<AudioNode>;
  stop(): void;
  defaultProfile(): InputProfile;
}
```

- `MicInput` (now), `InterfaceInput` (later; same getUserMedia path, processing off), `FileInput` (recorded clips for testing).
- `InputProfile` per device: gain, low-shelf boost, noise gate (RMS threshold), latency offset (ms), per-string calibration. Persisted per device id.
- Everything downstream (profile chain → pitch detector → note events) is source-agnostic.

### Pitch detection

- AudioWorklet captures frames; detection (McLeod Pitch Method) runs on the main thread from ring-buffered frames (~2048 samples @ 48kHz, enough for open E 41.2 Hz).
- Output: `NoteEvent { midi, freq, cents, confidence, time, onset }`. Onset = new stable pitch or RMS jump after silence.
- Octave-error correction against expected chart note; ±40 cents tolerance.

### Chart model (the backbone)

```ts
interface ChartNote { t: number /*beats*/; dur: number; string: 0|1|2|3 /*E A D G*/; fret: number; }
interface Chart { id; title; bpm; beatsPerBar; countInBars; notes: ChartNote[]; }
```

All sources (lessons, Guitar Pro, transcription, my riffs) produce charts. Highway + scorer only consume charts.

### Scoring

- Perfect ±50 ms, Good ±100 ms, else Miss (Rookie doubles windows).
- Pitch match by MIDI number (any string position accepted; position hint shown if different).
- Latency offset from calibration subtracted from detected time.
- Feedback: early/late/wrong-note (shows played vs needed).
- Stars: 1 ≥ 50%, 2 ≥ 75%, 3 ≥ 92% weighted accuracy (Perfect 1.0, Good 0.6).

### The Path

Worlds → Levels → Challenges, defined as data (TS/JSON). 2 stars unlocks next level. Worlds: Hello Bass, Fret Hand, Lock In, Roots, Shapes, Scales, Groove, Read It. M1 ships worlds 1–3.

### Progress

M1: `localStorage`. M2+: `progress.json` in `~/BassHoper/library/` via helper.

## Testing

- Unit tests (Vitest) for pitch detection (synthetic sine/harmonic-rich signals at bass frequencies), note/fret math, scoring.
- FileInput enables replaying recorded bass clips through the full pipeline.
