"""Auto-tab: turns a song's bass stem into an approximate chart, for songs that have no real tab.

  1. onsets      spectral flux of the low band, peak-picked
  2. tempo       onset autocorrelation for the beat period (60-180 bpm), refined by phase coherence
  3. pitch       McLeod NSDF on the ringing part of each note
  4. grid        onsets and lengths snapped to 16ths, beat 0 on a downbeat
  5. fingering   cheapest path over (string, fret) choices: low frets, little hand movement

The chart runs on the recording's own clock: beat 0 is the first downbeat, at `offsetSec`.
"""

from itertools import pairwise

import numpy as np
import soundfile as sf

SR = 11025
HOP = 110  # ~10 ms
FFT = 512
OPEN_MIDI = (28, 33, 38, 43)  # E1 A1 D2 G2, string 0 = low E (as in charts)
MAX_FRET = 24
MIN_HZ, MAX_HZ = 38.0, 400.0
GRID = 0.25  # beats: 16th notes


def load_mono(path) -> np.ndarray:
    """The file as mono float32 at SR, band-limited by FFT resampling."""
    data, rate = sf.read(str(path), dtype='float32', always_2d=True)
    x = data.mean(axis=1)
    if rate == SR:
        return x
    n_out = round(len(x) * SR / rate)
    spec = np.fft.rfft(x)[: n_out // 2 + 1]
    return (np.fft.irfft(spec, n_out) * (n_out / len(x))).astype(np.float32)


def _frames(x: np.ndarray, size: int, hop: int) -> np.ndarray:
    n = 1 + max(0, (len(x) - size) // hop)
    idx = np.arange(size)[None, :] + hop * np.arange(n)[:, None]
    return x[idx]


def onset_strength(x: np.ndarray) -> np.ndarray:
    """Per hop: how much new low-frequency energy appeared.

    SuperFlux style: each frame is compared with the frequency-smeared maximum of a frame a little
    earlier, so a low note's own wobble (a few cycles per window) doesn't read as a new pluck.
    """
    size = 1024
    pad = np.concatenate([np.zeros(size // 2, np.float32), x, np.zeros(size, np.float32)])
    mag = np.abs(np.fft.rfft(_frames(pad, size, HOP) * np.hanning(size), axis=1))
    lo, hi = int(30 * size / SR), int(1200 * size / SR)
    band = mag[:, lo:hi]
    # Anything 40 dB under the loudest notes is floor, so noise and decay tails can't look like plucks.
    logm = np.log(np.maximum(band, 0.01 * np.percentile(band.max(axis=1), 99) + 1e-9))
    smear = np.maximum(logm, np.maximum(np.roll(logm, 1, axis=1), np.roll(logm, -1, axis=1)))
    lag = 3
    ref = np.concatenate([np.repeat(smear[:1], lag, axis=0), smear[:-lag]])
    flux = np.maximum(logm - ref, 0).sum(axis=1)
    return flux / (np.percentile(flux, 99) or 1)


def pick_onsets(env: np.ndarray, gap: int = 6) -> np.ndarray:
    """Frames of local flux peaks that clearly stand above their surroundings."""
    floor = _running_median(env, 50)  # half a second either side
    peaks = []
    for i in range(1, len(env) - 1):
        if env[i] < floor[i] + 0.12 or env[i] < 0.08:
            continue
        lo, hi = max(0, i - 3), min(len(env), i + 4)
        if env[i] < env[lo:hi].max():
            continue
        if peaks and i - peaks[-1] < gap:
            if env[i] > env[peaks[-1]]:
                peaks[-1] = i
            continue
        peaks.append(i)
    return np.array(peaks, int)


def _running_median(env: np.ndarray, k: int) -> np.ndarray:
    # Median over blocks of k frames, interpolated: plenty for a floor, and fast on long songs.
    n = len(env)
    centers, meds = [], []
    for s in range(0, n, k):
        w = env[max(0, s - k) : s + 2 * k]
        centers.append(s + k / 2)
        meds.append(np.median(w))
    return np.interp(np.arange(n), centers, meds)


def _coherence(t: np.ndarray, w: np.ndarray, bpms: np.ndarray) -> np.ndarray:
    """|weighted mean of e^(2πi·t/period)| per tempo: 1 when every onset sits on that tempo's grid."""
    out = np.empty(len(bpms), complex)
    for i in range(0, len(bpms), 500):
        out[i : i + 500] = np.exp(2j * np.pi * np.outer(bpms[i : i + 500] / 60, t)) @ w
    return out / w.sum()


def estimate_beat(env: np.ndarray, onsets: np.ndarray, bpm_hint: float | None = None) -> tuple[float, int]:
    """(beat period s, beats per bar).

    A tempo is good when the notes fall on its beats, eighths and 16ths alike; that rules out the
    3/2 and 5/4 look-alikes a beat-only measure falls for. A soft prior settles the octave.
    """
    t = onsets * HOP / SR
    w = env[onsets].astype(float)

    def score(bpms: np.ndarray) -> np.ndarray:
        s = sum(np.abs(_coherence(t, w, k * bpms)) for k in (1, 2, 4)) / 3
        centre, width = (bpm_hint, 0.3) if bpm_hint else (110.0, 1.0)
        return s * np.exp(-0.5 * (np.log2(bpms / centre) / width) ** 2)

    coarse = np.arange(55.0, 200.0, 0.05)
    bpm = coarse[int(np.argmax(score(coarse)))]
    fine = np.arange(bpm - 0.06, bpm + 0.06, 0.001)
    bpm = fine[int(np.argmax(score(fine)))]
    # Waltz or not: which bar length the notes repeat at more strongly.
    three, four = np.abs(_coherence(t, w, np.array([bpm / 3, bpm / 4])))
    return 60 / bpm, 3 if three > 1.3 * four else 4


def find_downbeat(
    times: np.ndarray, strength: np.ndarray, period: float, per_bar: int,
    drums: tuple[np.ndarray, np.ndarray] | None = None,
) -> float:
    """Time of the first downbeat (0 <= t < one bar).

    The 16th grid's phase is unambiguous. Which 16th is the beat comes from the drums when
    there's a drum stem (kick and snare sit on the beats; a bass line often doesn't), else from
    the bass. Which beat is the 1 comes from the bass, which leans on it.
    """
    step = period / 4

    def grid(t: np.ndarray, w: np.ndarray) -> complex:
        return complex(np.sum(w * np.exp(2j * np.pi * t / step)) / (w.sum() or 1))

    z = grid(times, strength)
    if drums is not None and len(drums[0]) >= 16 and abs(grid(*drums)) > abs(z):
        z = grid(*drums)  # drums usually sit on the grid more tightly than the bass
    grid0 = (np.angle(z) / (2 * np.pi)) % 1 * step

    def hist(t: np.ndarray, w: np.ndarray, slots: int) -> np.ndarray:
        h = np.zeros(slots)
        np.add.at(h, np.round((t - grid0) / step).astype(int) % slots, w)
        return h

    beat_slot = None
    if drums is not None and len(drums[0]) >= 16:
        h = np.sort(hist(*drums, 4))
        if h[-1] > 1.5 * h[-2]:
            beat_slot = int(np.argmax(hist(*drums, 4)))
    bass = hist(times, strength, 4 * per_bar)
    if beat_slot is None:
        beat_slot = int(np.argmax([bass[k::4].sum() for k in range(4)]))
    down = max(range(per_bar), key=lambda j: bass[beat_slot + 4 * j])
    return (grid0 + (beat_slot + 4 * down) * step) % (per_bar * period)


def nsdf_pitch(seg: np.ndarray) -> tuple[float, float]:
    """(Hz, clarity 0-1) by the McLeod pitch method; (0, 0) when nothing periodic is there."""
    n = len(seg)
    max_tau = min(int(SR / MIN_HZ) + 2, n // 2)
    min_tau = int(SR / MAX_HZ)
    if max_tau <= min_tau + 2:
        return 0.0, 0.0
    seg = seg - seg.mean()
    f = np.fft.rfft(seg, 2 * n)
    r = np.fft.irfft(f * np.conj(f))[:max_tau]
    sq = seg * seg
    cs = np.concatenate([[0.0], np.cumsum(sq)])
    m = np.array([cs[n] - cs[tau] + cs[n - tau] for tau in range(max_tau)])
    nsdf = 2 * r / np.maximum(m, 1e-12)
    # Key maxima: the highest point between each upward zero crossing and the next downward one.
    maxima: list[int] = []
    i = min_tau
    while i < max_tau - 1 and nsdf[i] > 0:
        i += 1
    while i < max_tau - 1:
        while i < max_tau - 1 and nsdf[i] <= 0:
            i += 1
        start = i
        while i < max_tau - 1 and nsdf[i] > 0:
            i += 1
        if i > start:
            maxima.append(start + int(np.argmax(nsdf[start:i])))
    if not maxima:
        return 0.0, 0.0
    top = max(nsdf[k] for k in maxima)
    if top < 0.5:
        return 0.0, float(top)
    tau = next(k for k in maxima if nsdf[k] >= 0.9 * top)
    # Parabolic interpolation for sub-sample period.
    a, b, c = nsdf[tau - 1], nsdf[tau], nsdf[min(tau + 1, max_tau - 1)]
    d = a - 2 * b + c
    shift = 0.5 * (a - c) / d if d else 0.0
    return SR / (tau + shift), float(b)


def _midi(hz: float) -> int:
    return round(69 + 12 * np.log2(hz / 440))


def note_pitch(x: np.ndarray, start: int, end: int) -> tuple[int | None, float]:
    """MIDI note of the stretch x[start:end] (median of short frames), with its clarity."""
    seg = x[start:end]
    size = 900  # ~80 ms: three periods of low E
    if len(seg) < size:
        if len(seg) < 600:
            return None, 0.0
        size = len(seg)
    votes, clar = [], []
    for s in range(0, len(seg) - size + 1, 300):
        hz, c = nsdf_pitch(seg[s : s + size])
        if hz and c >= 0.8:
            votes.append(_midi(hz))
            clar.append(c)
        if len(votes) >= 5:
            break
    if not votes:
        return None, 0.0
    vals, counts = np.unique(votes, return_counts=True)
    return int(vals[int(np.argmax(counts))]), float(np.median(clar))


def fingering(midis: list[int]) -> list[tuple[int, int]]:
    """(string, fret) per note, minimising hand moves and preferring low positions (Viterbi)."""
    if not midis:
        return []

    def options(m: int) -> list[tuple[int, int]]:
        return [(s, m - o) for s, o in enumerate(OPEN_MIDI) if 0 <= m - o <= MAX_FRET]

    def own(c: tuple[int, int]) -> float:
        return 0.08 * c[1] + (0.6 if c[1] > 12 else 0.0)

    def move(a: tuple[int, int], b: tuple[int, int]) -> float:
        if a[1] == 0 or b[1] == 0:  # open strings don't need the fretting hand
            return 0.1 * abs(a[0] - b[0])
        return max(0, abs(a[1] - b[1]) - 3) * 1.0 + 0.1 * abs(a[0] - b[0])

    layers = [options(m) for m in midis]
    cost = [own(c) for c in layers[0]]
    back: list[list[int]] = []
    for prev, cur in pairwise(layers):
        nc, nb = [], []
        for c in cur:
            j = min(range(len(prev)), key=lambda k: cost[k] + move(prev[k], c))
            nc.append(cost[j] + move(prev[j], c) + own(c))
            nb.append(j)
        cost, back = nc, [*back, nb]
    k = int(np.argmin(cost))
    path = [layers[-1][k]]
    for i in range(len(back) - 1, -1, -1):
        k = back[i][k]
        path.append(layers[i][k])
    return path[::-1]


def _clamp(m: int) -> int | None:
    lo, hi = OPEN_MIDI[0], OPEN_MIDI[-1] + MAX_FRET
    while m > hi:
        m -= 12
    if m < lo:
        return None  # below a 4-string's range: likely a kick drum or rumble
    return m


def transcribe(bass_path, drums_path=None, bpm_hint: float | None = None, progress=None) -> tuple[dict, float]:
    """(chart, offsetSec) from a bass stem, with the drum stem (if any) to place the beat."""
    say = progress or (lambda *_: None)
    x = load_mono(bass_path)
    say(0.1)
    env = onset_strength(x)
    onsets = pick_onsets(env)
    if len(onsets) < 8:
        raise ValueError('Could not hear enough bass notes in this song to make a tab')
    say(0.25)
    period, per_bar = estimate_beat(env, onsets, bpm_hint)
    hop_s = HOP / SR
    rms = np.sqrt((_frames(np.concatenate([x, np.zeros(HOP, np.float32)]), HOP, HOP) ** 2).mean(axis=1))
    loud = float(np.percentile(rms[onsets[onsets < len(rms)]], 75)) if len(onsets) else 1.0
    say(0.3)

    raw = []  # (onset sec, end sec, midi, strength)
    for i, f in enumerate(onsets):
        nxt = onsets[i + 1] if i + 1 < len(onsets) else len(rms)
        a = f + 2  # skip the pluck's attack
        b = min(nxt, f + 40)
        peak_rms = rms[f : min(nxt, f + 6)].max() if f < len(rms) else 0
        if peak_rms < 0.06 * loud:
            continue
        midi, clarity = note_pitch(x, a * HOP, b * HOP)
        if midi is None or clarity < 0.8:
            continue
        midi = _clamp(midi)
        if midi is None:
            continue
        # The note ends where it has died away, or where the next one starts.
        tail = rms[f:nxt]
        dead = np.nonzero(tail < 0.2 * peak_rms)[0]
        end = f + (int(dead[0]) if len(dead) else len(tail))
        raw.append((f * hop_s, end * hop_s, midi, float(env[f])))
        if i % 50 == 0:
            say(0.3 + 0.6 * i / len(onsets))
    if len(raw) < 8:
        raise ValueError('Could not hear enough clear bass notes in this song to make a tab')

    # Beat 0 on the downbeat.
    drums = None
    if drums_path is not None:
        denv = onset_strength(load_mono(drums_path))
        don = pick_onsets(denv)
        drums = (don * hop_s, denv[don])
    offset = find_downbeat(np.array([r[0] for r in raw]), np.array([r[3] for r in raw]), period, per_bar, drums)

    slots: dict[float, tuple[float, int, float]] = {}
    for t, end, midi, s in raw:
        bt = round((t - offset) / period / GRID) * GRID
        if bt < 0:
            continue
        dur = max(GRID, round((end - t) / period / GRID) * GRID)
        if bt not in slots or slots[bt][2] < s:
            slots[bt] = (dur, midi, s)
    times = sorted(slots)
    # A note far above everything around it is almost always the 2nd harmonic read as the note.
    midis = [slots[bt][1] for bt in times]
    for i, m in enumerate(midis):
        near = midis[max(0, i - 8) : i] + midis[i + 1 : i + 9]
        if near and m - 12 >= OPEN_MIDI[0] and m > np.median(near) + 14:
            d, _, st = slots[times[i]]
            slots[times[i]] = (d, m - 12, st)
    for i, bt in enumerate(times[:-1]):  # no overlaps
        d, m, s = slots[bt]
        slots[bt] = (min(d, times[i + 1] - bt), m, s)
    pos = fingering([slots[bt][1] for bt in times])
    notes = [
        {'t': _num(bt), 'dur': _num(slots[bt][0]), 'string': st, 'fret': fr}
        for bt, (st, fr) in zip(times, pos, strict=False)
    ]
    bpm = round(60 / period, 3)
    total_beats = (len(x) / SR - offset) / period
    say(1.0)
    chart = {
        'id': '', 'title': '', 'bpm': bpm, 'beatsPerBar': per_bar, 'notes': notes,
        'lengthBeats': _num(max(notes[-1]['t'] + notes[-1]['dur'], int(np.ceil(total_beats / per_bar)) * per_bar)),
        'tempoMap': [{'beat': 0, 'bpm': bpm}], 'sections': [], 'droppedNotes': 0,
        'trackName': 'Auto tab', 'autoTab': True,
    }
    return chart, round(float(offset), 3)


def _num(v: float) -> float | int:
    f = round(float(v), 6)
    return int(f) if f.is_integer() else f
