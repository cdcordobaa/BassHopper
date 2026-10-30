"""Map notes from any track tuning onto a standard 4-string bass (E1 A1 D2 G2)."""

STANDARD = (28, 33, 38, 43)
MAX_FRET = 24


def is_bass(tuning: list[int], instrument: int | None, name: str, hint: bool = False) -> bool:
    if not tuning:
        return False
    if hint or (instrument is not None and 32 <= instrument <= 39) or 'bass' in name.lower():
        return True
    return len(tuning) <= 6 and min(tuning) <= 36 and max(tuning) <= 50


def effective_tuning(tuning: list[int], bass: bool) -> list[int]:
    # Some files notate bass at guitar octave (E2 A2 D3 G3); drop it back to sounding pitch.
    if bass and tuning and min(tuning) >= 38:
        return [p - 12 for p in tuning]
    return tuning


def string_correspondence(tuning: list[int]) -> list[int | None]:
    """For each original string, the standard string tuned within 2 semitones of it (if any)."""
    out: list[int | None] = []
    for p in tuning:
        best = min(range(4), key=lambda s: abs(STANDARD[s] - p))
        out.append(best if abs(STANDARD[best] - p) <= 2 else None)
    return out


def map_pitch(pitch: int, preferred: int | None, orig_fret: int) -> tuple[int, int] | None:
    """(string, fret) on standard tuning, transposing up an octave if the pitch is below low E."""
    for p in (pitch, pitch + 12):
        cands = [(s, p - STANDARD[s]) for s in range(4) if 0 <= p - STANDARD[s] <= MAX_FRET]
        if not cands:
            continue
        for s, f in cands:
            if s == preferred:
                return s, f
        return min(cands, key=lambda c: (abs(c[1] - orig_fret), c[1]))
    return None
