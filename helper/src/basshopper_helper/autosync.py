"""Lines a tab up with its recording: finds the chart offset that best matches the bass stem's plucks.

The web plays note `i` at audio time `offsetSec + noteSec[i]`, so the offset is the lag where
the chart's note onsets and the bass track's energy onsets line up best.
"""

import numpy as np
import soundfile as sf

HOP = 0.01  # seconds per envelope frame
SEARCH = (-10.0, 90.0)  # offsets tried, seconds (a long intro before the tab starts is common)
MIN_Z = 5.0  # how far above the typical correlation the best match must stand to be trusted


def beat_to_sec(chart: dict, beat: float) -> float:
    """Same as beatToSec in web/src/game/chart.ts."""
    tm = chart.get('tempoMap') or []
    if not tm:
        return beat * 60 / chart['bpm']
    sec, frm, bpm = 0.0, 0.0, tm[0]['bpm']
    for p in tm[1:]:
        if p['beat'] >= beat:
            break
        sec += (p['beat'] - frm) * 60 / bpm
        frm, bpm = p['beat'], p['bpm']
    return sec + (beat - frm) * 60 / bpm


def onset_envelope(path) -> np.ndarray:
    """Rises in loudness every HOP seconds: big where a note is plucked."""
    data, rate = sf.read(str(path), dtype='float32', always_2d=True)
    mono = data.mean(axis=1)
    hop = int(rate * HOP)
    n = len(mono) // hop
    if n < 2:
        return np.zeros(0, np.float32)
    energy = np.sqrt((mono[: n * hop].reshape(n, hop) ** 2).mean(axis=1))
    log = np.log10(energy + 1e-4)
    rise = np.maximum(np.diff(log, prepend=log[0]), 0)
    return rise / (rise.max() or 1)


def find_offset(chart: dict, bass_path) -> tuple[float, float] | None:
    """(offsetSec, confidence z-score), or None when no trustworthy match exists."""
    env = onset_envelope(bass_path)
    times = np.array([beat_to_sec(chart, n['t']) for n in chart.get('notes', [])])
    if len(env) < 100 or len(times) < 8:
        return None
    frames = np.round(times / HOP).astype(int)
    imp = np.zeros(frames.max() + 5, np.float32)
    # What a pluck looks like in the envelope: a low note's loudness builds over 2-3 frames
    # (one cycle of low E is 24 ms), so the rise peaks just after the note starts.
    for d, w in ((-1, 0.2), (0, 0.6), (1, 1.0), (2, 1.0), (3, 0.5), (4, 0.2)):
        np.add.at(imp, np.clip(frames + d, 0, len(imp) - 1), w)

    size = len(env) + len(imp)
    corr = np.fft.irfft(np.fft.rfft(env, size) * np.conj(np.fft.rfft(imp, size)), size)
    lags = np.arange(int(SEARCH[0] / HOP), int(SEARCH[1] / HOP) + 1)
    lags = lags[(lags > -len(imp)) & (lags < len(env))]
    vals = corr[lags % size]
    best = int(np.argmax(vals))
    z = float((vals[best] - vals.mean()) / (vals.std() or 1))
    if z < MIN_Z:
        return None
    return round(float(lags[best]) * HOP, 3), round(z, 1)
