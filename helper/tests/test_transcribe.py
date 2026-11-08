import numpy as np
import pytest
import soundfile as sf

from basshopper_helper.transcribe import OPEN_MIDI, fingering, transcribe

RATE = 22050


def pluck(midi: int, seconds: float) -> np.ndarray:
    """A bass-like note: decaying harmonics, the 2nd stronger than you'd think (as on real basses)."""
    f = 440 * 2 ** ((midi - 69) / 12)
    t = np.arange(int(seconds * RATE)) / RATE
    tone = sum(a * np.sin(2 * np.pi * f * k * t) for k, a in ((1, 1.0), (2, 0.8), (3, 0.4), (4, 0.2)))
    return (0.25 * tone * np.exp(-t * 3) * np.minimum(1, t / 0.004)).astype(np.float32)


# (beat, beats long, midi): a riff with eighths, a rest and a string-crossing line.
RIFF = [(0, 1, 28), (1, 0.5, 31), (1.5, 0.5, 33), (2, 1, 35), (3.5, 0.5, 40),
        (4, 1, 33), (5, 0.5, 45), (5.5, 0.5, 43), (6, 0.5, 40), (6.5, 0.5, 38), (7, 1, 36)]


def render(path, bpm: float, offset: float, bars: int = 8, seed=3):
    period = 60 / bpm
    notes = [(b + 8 * rep, d, m) for rep in range(bars // 2) for b, d, m in RIFF]
    total = offset + (bars * 4 + 2) * period
    rng = np.random.default_rng(seed)
    out = rng.normal(0, 0.003, int(total * RATE)).astype(np.float32)
    for b, d, m in notes:
        i = int((offset + b * period) * RATE)
        p = pluck(m, d * period * 0.95)
        out[i : i + len(p)] += p[: len(out) - i]
    sf.write(str(path), out, RATE)
    return notes


@pytest.mark.parametrize(('bpm', 'offset'), [(100, 1.3), (128, 0.4)])
def test_recovers_a_riff(tmp_path, bpm, offset):
    truth = render(tmp_path / 'bass.flac', bpm, offset)
    chart, off = transcribe(tmp_path / 'bass.flac')
    assert chart['bpm'] == pytest.approx(bpm, rel=0.02)
    period = 60 / chart['bpm']
    got = {}
    for n in chart['notes']:
        got[round((off + n['t'] * period) / (60 / bpm) * 4)] = OPEN_MIDI[n['string']] + n['fret']
    hits = 0
    for b, _, m in truth:
        slot = round((offset / (60 / bpm) + b) * 4)
        if any(got.get(slot + d) == m for d in (-1, 0, 1)):
            hits += 1
    assert hits / len(truth) >= 0.85
    assert len(chart['notes']) <= len(truth) * 1.15  # no flood of ghost notes


def test_fingering_stays_low_and_close():
    path = fingering([28, 31, 33, 35, 36])  # E G A B C
    assert all(f <= 5 for _, f in path)
    assert [OPEN_MIDI[s] + f for s, f in path] == [28, 31, 33, 35, 36]


def test_drums_put_the_beat_where_an_offbeat_bass_line_doesnt(tmp_path):
    offset, period = 0.8, 0.5  # 120 bpm
    rng = np.random.default_rng(5)
    n = int((offset + 34 * period) * RATE)
    bass = rng.normal(0, 0.003, n).astype(np.float32)
    drums = rng.normal(0, 0.003, n).astype(np.float32)
    t = np.arange(int(0.08 * RATE)) / RATE
    kick = (0.8 * np.sin(2 * np.pi * 60 * t) * np.exp(-t * 40)).astype(np.float32)
    for beat in range(32):
        i = int((offset + beat * period) * RATE)
        drums[i : i + len(kick)] += kick
        # Disco-style octaves pushed onto the "and": low E then high E, never on the beat.
        p = pluck(28 if beat % 2 else 40, period * 0.45)
        j = int((offset + (beat + 0.5) * period) * RATE)
        bass[j : j + len(p)] += p
    sf.write(str(tmp_path / 'bass.flac'), bass, RATE)
    sf.write(str(tmp_path / 'drums.flac'), drums, RATE)
    chart, off = transcribe(tmp_path / 'bass.flac', tmp_path / 'drums.flac')
    beats_off = ((off - offset) / period) % 1
    assert min(beats_off, 1 - beats_off) < 0.1  # beat 0 sits on a drum hit, not on the bass notes
    assert all(n['t'] % 1 == 0.5 for n in chart['notes'])


def test_autotab_api(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from test_api import GP5, import_song, wait_job

    from basshopper_helper import library, stems
    from basshopper_helper.app import app

    monkeypatch.setenv('BASSHOPPER_LIBRARY', str(tmp_path / 'lib'))
    monkeypatch.setenv('BASSHOPPER_DISABLE_STEMS', '1')
    stems.demucs_available.cache_clear()
    client = TestClient(app)
    song_id = import_song(client, with_tab=False)
    assert client.post(f'/api/songs/{song_id}/autotab').status_code == 409  # no bass stem yet

    render(library.song_dir(song_id) / 'bass.flac', 110, 0.5)
    song = library.load_song(song_id)
    library.update_song(song_id, {'files': {**song['files'], 'bass': 'bass.flac'}})
    assert client.post(f'/api/songs/{song_id}/autotab?bpm=500').status_code == 422
    r = client.post(f'/api/songs/{song_id}/autotab?bpm=110')
    assert r.status_code == 200
    assert wait_job(client, r.json()['jobId'])['state'] == 'done'
    assert client.get(f'/api/songs/{song_id}/chart').json()['bpm'] == pytest.approx(110, rel=0.02)
    [pub] = client.get('/api/songs').json()['songs']
    assert pub['hasChart'] and pub['autoTab']
    assert client.get(f'/api/songs/{song_id}/chart').json()['notes']

    client.post(f'/api/songs/{song_id}/tab', files={'tab': ('riff.gp5', GP5)})
    assert not client.get('/api/songs').json()['songs'][0]['autoTab']
    assert client.post(f'/api/songs/{song_id}/autotab').status_code == 409  # won't overwrite a real tab
    stems.demucs_available.cache_clear()
