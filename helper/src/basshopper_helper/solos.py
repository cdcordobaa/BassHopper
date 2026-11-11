"""Solo Stage pieces: solo-bass arrangements stored as JSON files in ~/BassHopper/solos.

  {
    "title": "La Bamba", "artist": "Ritchie Valens", "bpm": 150, "beatsPerBar": 4,
    "about": ["One idea per line, shown before playing."], "tip": "...",
    "step": 1,                           # default note length for the notation, in beats
    "phrases": [{"name": "The riff", "notation": "E0 E0 - E0 | A3*0.5 ...", "tip": "..."}],
    "perform": [0, 1, 0]                 # phrase order for the full performance (default: all, in order)
  }

The notation is the lesson notation the web app parses (see web/src/game/chart.ts). A file that
can't be read is listed with an `error` so it shows up instead of vanishing.
"""

import json

from .config import solos_dir


def _check(piece: dict) -> str | None:
    if not isinstance(piece.get('title'), str) or not piece['title'].strip():
        return 'missing "title"'
    if not isinstance(piece.get('bpm'), int | float) or not 30 <= piece['bpm'] <= 300:
        return '"bpm" must be a number from 30 to 300'
    phrases = piece.get('phrases')
    if not isinstance(phrases, list) or not phrases:
        return 'needs at least one entry in "phrases"'
    if not all(isinstance(p, dict) and isinstance(p.get('notation'), str) for p in phrases):
        return 'every phrase needs a "notation" string'
    order = piece.get('perform', list(range(len(phrases))))
    if not isinstance(order, list) or not all(isinstance(i, int) and 0 <= i < len(phrases) for i in order):
        return '"perform" must list phrase numbers (0 = the first phrase)'
    return None


def list_solos() -> list[dict]:
    d = solos_dir()
    if not d.is_dir():
        return []
    out = []
    for f in sorted(d.glob('*.json')):
        try:
            piece = json.loads(f.read_text())
            problem = _check(piece) if isinstance(piece, dict) else 'not a JSON object'
        except (OSError, ValueError) as e:
            piece, problem = {}, f'could not read it: {e}'
        if problem:
            out.append({'id': f.stem, 'title': f.stem, 'error': f'{f.name}: {problem}'})
        else:
            out.append({**piece, 'id': f.stem})
    return out
