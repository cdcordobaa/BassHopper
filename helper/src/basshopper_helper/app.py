"""FastAPI app implementing the BassHopper helper API (see helper/README.md)."""

import json
import os
import shutil
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import jobs, library, stems
from .audio import AUDIO_EXT, MEDIA_TYPES, duration_sec
from .stems import SeparationCancelled, demucs_available, separate
from .tabs import TabError, UnsupportedTabError, build_chart, list_tracks, load_score, pick_track
from .tabs.load import TAB_EXT


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    # Without this, Ctrl+C waits for the job thread to finish a Demucs run (minutes on CPU).
    stems.shutdown()
    jobs.shutdown()


app = FastAPI(title='BassHopper helper', lifespan=lifespan)

_extra_origins = [o for o in os.environ.get('BASSHOPPER_CORS_ORIGINS', '').split(',') if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_extra_origins,
    allow_origin_regex=r'^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$',
    allow_methods=['*'],
    allow_headers=['*'],
)


def _tab_error(e: TabError) -> HTTPException:
    return HTTPException(415 if isinstance(e, UnsupportedTabError) else 400, str(e))


def _read_tab(upload: UploadFile):
    name = upload.filename or ''
    if Path(name).suffix.lower() not in TAB_EXT:
        raise HTTPException(415, f'Tab must be one of {", ".join(sorted(TAB_EXT))}')
    try:
        return load_score(upload.file.read(), name)
    except TabError as e:
        raise _tab_error(e) from e


@app.get('/api/health')
def health() -> dict:
    return {'ok': True, 'demucs': demucs_available()}


@app.post('/api/tab/tracks')
def tab_tracks(tab: Annotated[UploadFile, File()]) -> dict:
    return {'tracks': list_tracks(_read_tab(tab))}


@app.post('/api/import')
def import_song(
    audio: Annotated[UploadFile, File()],
    tab: Annotated[UploadFile | None, File()] = None,
    title: Annotated[str, Form()] = '',
    artist: Annotated[str, Form()] = '',
    track: Annotated[str, Form()] = '',
) -> dict:
    audio_ext = Path(audio.filename or '').suffix.lower()
    if audio_ext not in AUDIO_EXT:
        raise HTTPException(415, f'Audio must be one of {", ".join(sorted(AUDIO_EXT))}')

    score, track_index = None, None
    if tab is not None and tab.filename:
        score = _read_tab(tab)
        try:
            wanted = int(track) if track.strip() else None
        except ValueError as e:
            raise HTTPException(400, 'track must be an integer') from e
        try:
            track_index = pick_track(score, wanted)
        except TabError as e:
            raise _tab_error(e) from e

    title = title.strip() or (score.title if score else '') or Path(audio.filename or 'Untitled').stem
    artist = artist.strip() or (score.artist if score else '')
    song_id = library.new_song_id(title)
    d = library.song_dir(song_id)
    assert d is not None
    d.mkdir(parents=True)
    try:
        full = d / f'full{audio_ext}'
        with full.open('wb') as f:
            shutil.copyfileobj(audio.file, f)
        if score is not None and track_index is not None and tab is not None:
            tab.file.seek(0)
            with (d / f'source{Path(tab.filename or "").suffix.lower()}').open('wb') as f:
                shutil.copyfileobj(tab.file, f)
            chart = build_chart(score, track_index, song_id, title)
            library.write_json(d / 'chart.json', chart)
    except Exception:
        shutil.rmtree(d, ignore_errors=True)
        raise

    def work(job: jobs.Job) -> str:
        try:
            job.update('Reading audio', 0.05)
            song = {
                'id': song_id, 'title': title, 'artist': artist,
                'durationSec': round(duration_sec(full), 3),
                'hasChart': (d / 'chart.json').is_file(),
                'stems': ['full'], 'offsetSec': 0.0,
                'files': {'full': full.name}, 'trackIndex': track_index, 'createdAt': time.time(),
            }
            if demucs_available():
                job.update('Separating stems (Demucs)', 0.1)
                try:
                    files = separate(full, d, lambda p: job.update(progress=0.1 + 0.85 * p))
                    song['files'].update(files)
                    song['stems'] = [s for s in library.STEM_NAMES if s in song['files']]
                except SeparationCancelled:
                    raise
                except Exception as e:
                    job.warning = f'Stem separation failed, only the full mix is available: {e}'
            job.update('Saving', 0.97)
            library.save_song(song)
            return song_id
        except Exception:
            shutil.rmtree(d, ignore_errors=True)
            raise

    return {'jobId': jobs.submit(work).id}


@app.get('/api/jobs/{job_id}')
def job_status(job_id: str) -> dict:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, 'No such job')
    return job.to_dict()


@app.get('/api/songs')
def songs() -> dict:
    return {'songs': [library.public(s) for s in library.list_songs()]}


def _song_or_404(song_id: str) -> dict:
    song = library.load_song(song_id)
    if song is None:
        raise HTTPException(404, 'No such song')
    return song


@app.get('/api/songs/{song_id}/chart')
def song_chart(song_id: str) -> dict:
    song = _song_or_404(song_id)
    path = library.songs_dir() / song_id / 'chart.json'
    if not path.is_file():
        raise HTTPException(404, 'This song has no chart (imported without a tab)')
    chart = json.loads(path.read_text())
    chart['id'], chart['title'] = song['id'], song['title']
    return chart


@app.get('/api/songs/{song_id}/audio/{stem}')
def song_audio(song_id: str, stem: str) -> FileResponse:
    if stem not in library.STEM_NAMES:
        raise HTTPException(404, f'Unknown stem "{stem}"')
    path = library.audio_path(_song_or_404(song_id), stem)
    if path is None:
        raise HTTPException(404, f'Stem "{stem}" not available for this song')
    return FileResponse(path, media_type=MEDIA_TYPES.get(path.suffix.lower(), 'application/octet-stream'))


class SongPatch(BaseModel):
    offsetSec: float | None = None
    title: str | None = None
    artist: str | None = None


@app.patch('/api/songs/{song_id}')
def patch_song(song_id: str, body: SongPatch) -> dict:
    _song_or_404(song_id)
    changes = body.model_dump(exclude_none=True)
    if 'title' in changes:
        changes['title'] = changes['title'].strip() or None
        if changes['title'] is None:
            raise HTTPException(400, 'title cannot be empty')
    song = library.update_song(song_id, changes)
    if song is None:
        raise HTTPException(404, 'No such song')
    return library.public(song)


@app.delete('/api/songs/{song_id}')
def delete_song(song_id: str) -> dict:
    if not library.delete_song(song_id):
        raise HTTPException(404, 'No such song')
    return {'ok': True}
