import numpy as np
import pytest
import soundfile as sf

from basshopper_helper.autosync import beat_to_sec, find_offset

RATE = 22050


def chart_with(beats: list[float], bpm: float = 100, tempo_map=None) -> dict:
    c = {'bpm': bpm, 'notes': [{'t': b, 'dur': 0.5, 'string': 0, 'fret': 0} for b in beats]}
    if tempo_map:
        c['tempoMap'] = tempo_map
    return c


def render(chart: dict, offset: float, seconds: float, path, extra_noise=0.02, seed=1) -> None:
    """A fake bass stem: decaying plucks at each note's time + offset, plus noise and a few stray notes."""
    rng = np.random.default_rng(seed)
    out = rng.normal(0, extra_noise, int(seconds * RATE)).astype(np.float32)
    t = np.arange(int(0.4 * RATE)) / RATE
    pluck = (0.5 * np.sin(2 * np.pi * 55 * t) * np.exp(-t * 8)).astype(np.float32)
    times = [beat_to_sec(chart, n['t']) + offset for n in chart['notes']]
    times += list(rng.uniform(0, seconds, 6))  # ghost notes the tab doesn't have
    for s in times:
        i = int(s * RATE)
        if 0 <= i < len(out):
            seg = out[i : i + len(pluck)]
            seg += pluck[: len(seg)]
    sf.write(str(path), out, RATE)


# A riff that isn't perfectly regular, repeated 8 times (like most real bass parts).
RIFF = [0, 0.5, 1.5, 2, 3, 3.5]
BEATS = [bar * 4 + b for bar in range(8) for b in RIFF]


@pytest.mark.parametrize('offset', [0.0, 3.27, 12.5, -1.2])
def test_finds_offset(tmp_path, offset):
    chart = chart_with(BEATS)
    render(chart, offset, 40, tmp_path / 'bass.flac')
    found = find_offset(chart, tmp_path / 'bass.flac')
    assert found is not None
    assert found[0] == pytest.approx(offset, abs=0.03)


def test_follows_tempo_changes(tmp_path):
    chart = chart_with(BEATS, tempo_map=[{'beat': 0, 'bpm': 100}, {'beat': 16, 'bpm': 130}])
    render(chart, 4.0, 40, tmp_path / 'bass.flac')
    assert find_offset(chart, tmp_path / 'bass.flac')[0] == pytest.approx(4.0, abs=0.03)


def test_refuses_to_guess_on_unrelated_audio(tmp_path):
    chart = chart_with(BEATS)
    other = chart_with([b * 1.37 + 0.3 for b in range(40)], bpm=77)
    render(other, 0, 40, tmp_path / 'bass.flac', extra_noise=0.05)
    found = find_offset(chart, tmp_path / 'bass.flac')
    assert found is None or abs(found[0]) > 0.5  # either no answer or not a confident false 0


def test_beat_to_sec_matches_web():
    c = chart_with([], bpm=120, tempo_map=[{'beat': 0, 'bpm': 120}, {'beat': 4, 'bpm': 60}])
    assert beat_to_sec(c, 4) == 2
    assert beat_to_sec(c, 6) == 4
