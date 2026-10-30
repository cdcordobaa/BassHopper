"""Detect the Guitar Pro flavour of an upload and turn it into a Score."""

import io
import zipfile
from pathlib import Path

from .gp_legacy import read_legacy
from .gpif import read_gpif
from .gpx import GpxError, gpx_score_xml
from .model import Score
from .tuning import effective_tuning, is_bass

LEGACY_EXT = {'.gp3', '.gp4', '.gp5'}
TAB_EXT = LEGACY_EXT | {'.gp', '.gpx'}
EXPORT_HINT = 'export as .gp5 or .gp from Guitar Pro / TuxGuitar / MuseScore'


class TabError(ValueError):
    """The file is a tab format we know but its content is unusable (400)."""


class UnsupportedTabError(TabError):
    """We cannot read this file type (415)."""


def load_score(data: bytes, filename: str = '') -> Score:
    ext = Path(filename).suffix.lower()
    if ext and ext not in TAB_EXT:
        raise UnsupportedTabError(f'Unsupported tab file type "{ext}"; {EXPORT_HINT}')
    try:
        if data[:2] == b'PK':
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                name = next((n for n in z.namelist() if n.lower().endswith('score.gpif')), None)
                if name is None:
                    raise UnsupportedTabError(f'No Content/score.gpif in this .gp file; {EXPORT_HINT}')
                score = read_gpif(z.read(name))
        elif data[:4] in (b'BCFZ', b'BCFS'):
            score = read_gpif(gpx_score_xml(data))
        elif ext in ('.gp', '.gpx'):
            raise UnsupportedTabError(f'Unrecognised {ext} file; {EXPORT_HINT}')
        else:
            score = read_legacy(data)
    except TabError:
        raise
    except (GpxError, zipfile.BadZipFile) as e:
        raise UnsupportedTabError(f'Could not read this Guitar Pro file ({e}); {EXPORT_HINT}') from e
    except Exception as e:  # PyGuitarPro / XML errors surface as many types
        raise UnsupportedTabError(f'Could not parse tab ({type(e).__name__}: {e}); {EXPORT_HINT}') from e
    if not score.master_bars:
        raise TabError('Tab has no bars')
    return score


def track_is_bass(score: Score, index: int) -> bool:
    t = score.tracks[index]
    return is_bass(t.tuning, t.instrument, t.name, t.bass_hint)


def list_tracks(score: Score) -> list[dict]:
    return [
        {'index': i, 'name': t.name, 'strings': len(t.tuning), 'isBass': track_is_bass(score, i)}
        for i, t in enumerate(score.tracks)
    ]


def pick_track(score: Score, index: int | None) -> int:
    if index is not None:
        if not 0 <= index < len(score.tracks):
            raise TabError(f'Track {index} does not exist (tab has {len(score.tracks)} tracks)')
        if not score.tracks[index].tuning:
            raise TabError(f'Track {index} is a drum track')
        return index
    for i in range(len(score.tracks)):
        if track_is_bass(score, i):
            return i
    for i, t in enumerate(score.tracks):
        if t.tuning:
            return i
    raise TabError('Tab has no stringed tracks')


def track_tuning(score: Score, index: int) -> list[int]:
    return effective_tuning(score.tracks[index].tuning, track_is_bass(score, index))
