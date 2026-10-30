# BassHopper

A personal, game-style app for learning electric bass. It listens to your real bass (amp + mic for now,
audio interface later), shows the notes coming at you on a highway, and scores your timing and pitch.
It runs on your own computer only: no accounts, nothing uploaded.

- **The Path**: short lessons in worlds (Hello Bass, Fret Hand, Lock In) that build the basics.
- **Riff Arena**: import a real song plus its Guitar Pro tab and play the bass line with the band.
- **Jam Room**: a generated backing band (drums and chords). Jam, record and save your own riffs.
- **Free Play**: live fretboard, metronome, Note Hunt.

## Start it

You need [Node.js](https://nodejs.org) 20+ and [uv](https://docs.astral.sh/uv/)
(`curl -LsSf https://astral.sh/uv/install.sh | sh`). Then:

```sh
./start.sh
```

The first run installs everything (a minute or two). The app opens in your browser at
<http://localhost:5180>. Press **Ctrl+C** in the terminal to stop it.

`start.sh` also prints a "Tablet (Wi-Fi)" address. The page opens on a tablet, but browsers only allow
the microphone (and the audio engine's AudioWorklet) on `localhost` or HTTPS, so lessons, Jam Room and
Riff Arena won't make sound or hear you there. Play from the computer for now (tablet support is planned for Milestone 4).

If the song helper can't start (see `helper/helper.log`), the rest of the app still works. Only Riff Arena
import needs it.

## Your first session

1. **Setup & Tuner**: pick **🎤 Amp + Mic** and allow microphone access. Put the mic close to the amp
   speaker at a moderate volume.
2. **Levels**: pluck a string and use **Auto-level** (or the Gain slider) until the meter moves well
   without hitting red. The status line should say "Hearing E1…" while a note rings.
3. **Tune up** with the tuner, string by string: E A D G.
4. **Calibrate**: run **Measure room noise** (stay quiet), then the **Latency test** (pluck the open E on
   "PLUCK E!"). This lines up the game's timing with your setup.
5. Back on Home, hit **Continue the Path** to start World 1, **Hello Bass**. Any finished level unlocks the
   next one. Stars come from accuracy.

Do the Setup once. After that, Home offers a one-click **Connect** for your last input.

## Add a song (Riff Arena)

You need two files:

- **Audio**: mp3, wav, m4a or flac of the song.
- **Tab**: a Guitar Pro file (`.gp`, `.gpx`, `.gp5`, `.gp4`, `.gp3`) with a bass track. You can find these
  on Ultimate Guitar (filter by type "Guitar Pro") or GProTab.net. You can also make or convert one with
  the free [TuxGuitar](https://www.tuxguitar.app) or [MuseScore](https://musescore.org)
  (export as `.gp5` / `.gp`).

In **Riff Arena**, use **Import a song**: pick both files, choose the bass track if it asks, and wait for the
import to finish. If the notes feel early or late, use the offset nudge on the song screen. It is saved per song.

**Stems (optional).** With [Demucs](https://github.com/facebookresearch/demucs) installed, imports are split
into bass / drums / vocals / other, so you can play with the bass taken out of the mix. Without it you get
the full mix. To install it (about 700 MB, one time):

```sh
BASSHOPPER_STEMS=1 ./start.sh
```

Songs live in `~/BassHopper/library` (set `BASSHOPPER_LIBRARY` to change it). They never leave your machine.

## Headphones tip

With a mic, the app hears your speakers too: band audio, the click, the jam backing. That can be scored
as you playing. Use headphones for the song or backing, or keep it quiet next to a louder amp. Riff Arena
starts the guide bass muted on a mic for this reason.

## Adding an audio interface later

Plug the bass into the interface's instrument (Hi-Z) input and connect the interface to the computer.
Go to **Setup & Tuner → 🔌 Audio Interface**, pick the device, and choose **Input 1 / Input 2** for the
channel your bass is on. Then redo levels and the **Latency test**, because the timing changes from the mic setup.
An interface is cleaner and doesn't pick up your speakers.

## Project layout

```
start.sh          starts helper + web app together
web/              the app (Vite + React + TypeScript)
  src/audio/      input, pitch detection, metronome, calibration
  src/game/       charts, scoring, progress, The Path lessons
  src/ui/         Home, Setup, Tuner, Path, Play, Free Play, highway, fretboard
  src/arena/      Riff Arena (library, import, song play)
  src/jam/        Jam Room (backing band, recording, My Riffs)
helper/           local Python service (FastAPI): Guitar Pro import, Demucs stems, song library
docs/             design spec
```

Checks: `cd web && npx tsc -b && npx vitest run`, `cd helper && uv run pytest`.

## Roadmap

- [x] **M1 It hears me**: input, tuner, calibration, fretboard, The Path worlds 1–3
- [x] **M2 Rock out**: song import (tab + stems), Riff Arena with difficulty tiers, speed and loops
- [x] **M3 Jam Room**: generated backing, safe-notes fretboard, record and save riffs
- [ ] **M4 Habit**: Daily Groove sessions, skill stats, auto-transcription when there's no tab
  (basic-pitch), tablet layout
