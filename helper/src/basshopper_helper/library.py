"""Song library on disk: songs/{id}/song.json, chart.json, audio files."""

import json
import os
import re
import secrets
import shutil
import threading
from pathlib import Path

from .config import songs_dir

STEM_NAMES = ('full', 'bass', 'no_bass', 'drums', 'vocals', 'other')
PUBLIC_FIELDS = ('id', 'title', 'artist', 'durationSec', 'hasChart', 'stems', 'offsetSec')
_ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]{0,80}$')
_lock = threading.Lock()


def new_song_id(title: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:40] or 'song'
    return f'{slug}-{secrets.token_hex(3)}'


def song_dir(song_id: str) -> Path | None:
    if not _ID_RE.match(song_id):
        return None
    return songs_dir() / song_id


def write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, path)


def load_song(song_id: str) -> dict | None:
    d = song_dir(song_id)
    if d is None or not (d / 'song.json').is_file():
        return None
    return json.loads((d / 'song.json').read_text())


def public(song: dict) -> dict:
    return {k: song[k] for k in PUBLIC_FIELDS}


def list_songs() -> list[dict]:
    out = []
    for f in sorted(songs_dir().glob('*/song.json')):
        try:
            out.append(json.loads(f.read_text()))
        except (OSError, json.JSONDecodeError):
            continue
    out.sort(key=lambda s: s.get('createdAt', 0), reverse=True)
    return out


def save_song(song: dict) -> None:
    d = song_dir(song['id'])
    assert d is not None
    with _lock:
        write_json(d / 'song.json', song)


def update_song(song_id: str, changes: dict) -> dict | None:
    with _lock:
        song = load_song(song_id)
        if song is None:
            return None
        song.update(changes)
        write_json(songs_dir() / song_id / 'song.json', song)
        return song


def delete_song(song_id: str) -> bool:
    d = song_dir(song_id)
    if d is None or not d.is_dir():
        return False
    with _lock:
        shutil.rmtree(d)
    return True


def audio_path(song: dict, stem: str) -> Path | None:
    name = song.get('files', {}).get(stem)
    d = song_dir(song['id'])
    if not name or d is None:
        return None
    p = d / name
    return p if p.is_file() else None
