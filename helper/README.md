# BassHopper helper

Local Python service for the web app: Guitar Pro import, Demucs stem separation, song library.
FastAPI on `http://127.0.0.1:8765` (the Vite dev server proxies `/api` here).

```sh
./run.sh                      # start (uv creates .venv on first run)
BASSHOPPER_STEMS=1 ./run.sh    # also install the optional Demucs extra (torch, ~700 MB)
uv run pytest                 # tests (BASSHOPPER_TEST_DEMUCS=1 adds a real Demucs run)
```

## Environment

| var | default | |
|---|---|---|
| `BASSHOPPER_LIBRARY` | `~/BassHopper/library` | songs live in `songs/{id}/` (`song.json`, `chart.json`, audio, original tab) |
| `BASSHOPPER_HOST` / `BASSHOPPER_PORT` | `127.0.0.1` / `8765` | `BASSHOPPER_HOST=0.0.0.0` for LAN/tablet |
| `BASSHOPPER_DEMUCS_DEVICE` | `mps` then `cpu` on Apple Silicon | e.g. `cpu`, `cuda` |
| `BASSHOPPER_DISABLE_STEMS` | unset | force "full mix only" even if Demucs is installed |
| `BASSHOPPER_CORS_ORIGINS` | localhost on any port | comma-separated extra origins |

## API

| | |
|---|---|
| `GET /api/health` | `{ok, demucs}` |
| `POST /api/tab/tracks` (multipart `tab`) | `{tracks:[{index,name,strings,isBass}]}` |
| `POST /api/import` (multipart `audio`, opt. `tab`, `title`, `artist`, `track`) | `{jobId}` — tab is parsed synchronously, so bad tabs fail here with 400/415 |
| `GET /api/jobs/{id}` | `{state, step, progress, songId?, error?, warning?}` (`warning` = stems failed, full mix still imported) |
| `GET /api/songs` | `{songs:[{id,title,artist,durationSec,hasChart,stems,offsetSec}]}` |
| `GET /api/songs/{id}/chart` | SongChart, 404 without a tab |
| `GET /api/songs/{id}/audio/{stem}` | `full` (original upload) always; `bass drums vocals other no_bass` (FLAC) after separation. Range requests supported |
| `PATCH /api/songs/{id}` | `{offsetSec?, title?, artist?}` → song |
| `DELETE /api/songs/{id}` | `{ok:true}` |

SongChart = the web `Chart` (`id title bpm beatsPerBar notes lengthBeats`, beats are quarter notes) plus
`tempoMap [{beat,bpm}]` (beat 0 always present), `sections [{beat,name}]` (GP markers, repeated
sections appear once per pass), `droppedNotes`, `trackName`.

## Tab import notes

- `.gp3/.gp4/.gp5` via PyGuitarPro; `.gp` (GP7/8 zip) and `.gpx` (GP6 BCFZ/BCFS container) via our own GPIF reader.
  The `.gpx` decompressor follows alphaTab's implementation and is tested against a reference encoder, not yet
  against real GP6 files. Anything unreadable returns 415 "export as .gp5 or .gp from Guitar Pro / TuxGuitar / MuseScore".
- Ties extend the previous note; dead notes and grace notes are not onsets; repeats and alternate endings are
  unrolled (D.S./D.C./coda jumps are not); time signature changes affect bar length but `beatsPerBar` is the first bar's.
- Notes are remapped onto standard E A D G (string 0 = low E), preferring the original string. Below low E
  (5-string low B, drop D) they go up an octave; anything still out of reach (> fret 24) is dropped and counted.
  Bass tracks written at guitar octave (lowest string ≥ D2) are shifted down an octave first.
- Stems are FLAC (no mp3 encoder delay, so they stay sample-aligned with each other and the chart offset).
  `no_bass` = drums + vocals + other, mixed with ffmpeg (numpy/soundfile fallback).
