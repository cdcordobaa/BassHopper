"""Creating songs in the library. Shared by the upload API and the drop folder."""

import shutil
import time
from pathlib import Path
from typing import BinaryIO

import numpy as np
import soundfile as sf

from . import jobs, library
from .audio import duration_sec
from .stems import SeparationCancelled, demucs_available, separate
from .tabs import build_chart, load_score, pick_track

# Real multitracks are raw, unmixed: summing them can clip, so the mix is scaled to this peak.
_PEAK = 0.89


def file_tags(path: Path) -> tuple[str, str]:
    """(title, artist) from an audio file's tags, blank when missing."""
    try:
        import mutagen

        f = mutagen.File(str(path), easy=True)
        tags = (f.tags or {}) if f is not None else {}

        def first(key: str) -> str:
            return str((tags.get(key) or [''])[0]).strip()

        return first('title'), first('artist')
    except Exception:
        return '', ''


def read_tab(data: bytes, name: str, track: int | None):
    """Parses a tab and picks its bass track. Raises TabError."""
    score = load_score(data, name)
    return score, pick_track(score, track)


def start_import(
    *,
    audio_name: str,
    audio: BinaryIO | None = None,
    multitrack: dict[str, list[Path]] | None = None,
    tab: tuple[str, bytes] | None = None,
    track: int | None = None,
    title: str = '',
    artist: str = '',
) -> jobs.Job:
    """Copies the files into a new song folder and queues the slow part (stems) as a job.

    Give either `audio` (one mixed file, stems via Demucs) or `multitrack`
    ({'bass': [...], 'band': [...]} files of a real multitrack, mixed here, no Demucs needed).
    Raises TabError for a bad tab before anything is written.
    """
    score, track_index = read_tab(tab[1], tab[0], track) if tab else (None, None)
    title = title.strip() or (score.title if score else '') or Path(audio_name or 'Untitled').stem
    artist = artist.strip() or (score.artist if score else '')
    song_id = library.new_song_id(title)
    d = library.song_dir(song_id)
    assert d is not None
    d.mkdir(parents=True)
    full: Path | None = None
    try:
        if audio is not None:
            full = d / f'full{Path(audio_name).suffix.lower()}'
            with full.open('wb') as f:
                shutil.copyfileobj(audio, f)
        if score is not None and track_index is not None and tab is not None:
            (d / f'source{Path(tab[0]).suffix.lower()}').write_bytes(tab[1])
            library.write_json(d / 'chart.json', build_chart(score, track_index, song_id, title))
    except Exception:
        shutil.rmtree(d, ignore_errors=True)
        raise

    def work(job: jobs.Job) -> str:
        try:
            files: dict[str, str]
            if multitrack is not None:
                job.update('Mixing the multitrack', 0.1)
                files = mix_multitrack(multitrack, d)
            else:
                assert full is not None
                files = {'full': full.name}
            tag_artist = file_tags(d / files['full'])[1] if full is not None and not artist else ''
            song = {
                'id': song_id, 'title': title, 'artist': artist or tag_artist,
                'durationSec': round(duration_sec(d / files['full']), 3),
                'hasChart': (d / 'chart.json').is_file(),
                'stems': ['full'], 'offsetSec': 0.0,
                'files': files, 'trackIndex': track_index, 'createdAt': time.time(),
            }
            if multitrack is None and demucs_available():
                job.update('Separating stems (Demucs)', 0.1)
                try:
                    files.update(separate(d / files['full'], d, lambda p: job.update(progress=0.1 + 0.85 * p)))
                except SeparationCancelled:
                    raise
                except Exception as e:
                    job.warning = f'Stem separation failed, only the full mix is available: {e}'
            song['stems'] = [s for s in library.STEM_NAMES if s in files]
            job.update('Saving', 0.97)
            library.save_song(song)
            return song_id
        except Exception:
            shutil.rmtree(d, ignore_errors=True)
            raise

    return jobs.submit(work)


def _sum(paths: list[Path]) -> tuple[np.ndarray | None, int]:
    total: np.ndarray | None = None
    rate = 0
    for p in paths:
        data, r = sf.read(str(p), dtype='float32', always_2d=True)
        if rate and r != rate:
            raise ValueError(f'{p.name} is {r} Hz but the other tracks are {rate} Hz')
        rate = r
        if data.shape[1] == 1:
            data = np.repeat(data, 2, axis=1)
        data = data[:, :2]
        if total is None:
            total = data
        else:
            n = max(len(total), len(data))
            total = np.pad(total, ((0, n - len(total)), (0, 0))) + np.pad(data, ((0, n - len(data)), (0, 0)))
    return total, rate


def mix_multitrack(parts: dict[str, list[Path]], d: Path) -> dict[str, str]:
    """Writes full / bass / no_bass FLACs from a multitrack's bass files and everything else."""
    bass, rate_b = _sum(parts.get('bass', []))
    band, rate_o = _sum(parts.get('band', []))
    if bass is None and band is None:
        raise ValueError('The multitrack has no audio files')
    if bass is not None and band is not None and rate_b != rate_o:
        raise ValueError('Bass and band tracks have different sample rates')
    rate = rate_b or rate_o
    n = max(len(x) for x in (bass, band) if x is not None)

    def pad(x: np.ndarray | None) -> np.ndarray:
        return np.zeros((n, 2), np.float32) if x is None else np.pad(x, ((0, n - len(x)), (0, 0)))

    bass, band = pad(bass), pad(band)
    full = bass + band
    gain = _PEAK / max(float(np.abs(full).max()), 1e-9)
    files = {}
    for name, data in (('full', full), ('bass', bass), ('no_bass', band)):
        if name != 'full' and not np.any(data):
            continue
        sf.write(str(d / f'{name}.flac'), np.clip(data * gain, -1, 1), rate, subtype='PCM_16')
        files[name] = f'{name}.flac'
    return files
