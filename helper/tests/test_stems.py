import os
import shutil
import signal
import subprocess
import threading
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from basshopper_helper import audio, stems
from basshopper_helper.app import app

RATE = 22050


def tone(freq: float, seconds: float = 1.0) -> np.ndarray:
    t = np.arange(int(seconds * RATE)) / RATE
    mono = 0.2 * np.sin(2 * np.pi * freq * t).astype(np.float32)
    return np.stack([mono, mono], axis=1)


@pytest.mark.parametrize('use_ffmpeg', [True, False])
def test_mix_stems_sums_sources(tmp_path, monkeypatch, use_ffmpeg):
    if use_ffmpeg and not shutil.which('ffmpeg'):
        pytest.skip('ffmpeg not installed')
    if not use_ffmpeg:
        monkeypatch.setattr(audio, 'ffmpeg', lambda: None)
    parts = []
    for i, f in enumerate((110, 220, 440)):
        p = tmp_path / f's{i}.flac'
        sf.write(str(p), tone(f), RATE)
        parts.append(p)
    out = audio.mix_stems(parts, tmp_path, 'no_bass')
    assert out.name == 'no_bass.flac'
    mixed, rate = sf.read(str(out), dtype='float32')
    expected = tone(110) + tone(220) + tone(440)
    assert rate == RATE and mixed.shape == expected.shape
    assert np.max(np.abs(mixed - expected)) < 1e-3


def fake_demucs(audio_path: Path, out: Path, device, progress):
    progress(0.5)
    d = out / 'htdemucs'
    d.mkdir(parents=True)
    for i, stem in enumerate(stems.STEMS):
        sf.write(str(d / f'{stem}.flac'), tone(100 + 50 * i), RATE)
    progress(1.0)
    return 0, ''


def test_import_with_stems_pipeline(tmp_path, monkeypatch):
    monkeypatch.setenv('BASSHOPPER_LIBRARY', str(tmp_path / 'lib'))
    monkeypatch.setattr(stems, '_run', fake_demucs)
    monkeypatch.setattr('basshopper_helper.importer.demucs_available', lambda: True)
    from test_api import wait_job, wav_bytes

    client = TestClient(app)
    r = client.post('/api/import', files={'audio': ('a.wav', wav_bytes())})
    job = wait_job(client, r.json()['jobId'])
    assert job['state'] == 'done' and 'warning' not in job
    song = client.get('/api/songs').json()['songs'][0]
    assert song['stems'] == ['full', 'bass', 'no_bass', 'drums', 'vocals', 'other']
    for stem in song['stems']:
        res = client.get(f"/api/songs/{song['id']}/audio/{stem}")
        assert res.status_code == 200
    assert client.get(f"/api/songs/{song['id']}/audio/bass").headers['content-type'] == 'audio/flac'


def test_failed_separation_still_imports_full_mix(tmp_path, monkeypatch):
    monkeypatch.setenv('BASSHOPPER_LIBRARY', str(tmp_path / 'lib'))
    monkeypatch.setattr(stems, '_run', lambda *a: (1, 'boom\nRuntimeError: out of memory'))
    monkeypatch.setattr('basshopper_helper.importer.demucs_available', lambda: True)
    from test_api import wait_job, wav_bytes

    client = TestClient(app)
    job = wait_job(client, client.post('/api/import', files={'audio': ('a.wav', wav_bytes())}).json()['jobId'])
    assert job['state'] == 'done' and 'out of memory' in job['warning']
    assert client.get('/api/songs').json()['songs'][0]['stems'] == ['full']


@pytest.mark.skipif(not os.environ.get('BASSHOPPER_TEST_DEMUCS'), reason='set BASSHOPPER_TEST_DEMUCS=1 to run real Demucs')
def test_real_demucs(tmp_path):
    stems.demucs_available.cache_clear()
    if not stems.demucs_available():
        pytest.skip('demucs not installed')
    src = tmp_path / 'in.wav'
    sf.write(str(src), tone(55, 4.0) + tone(880, 4.0), RATE)
    song_dir = tmp_path / 'song'
    song_dir.mkdir()
    files = stems.separate(src, song_dir, lambda p: None)
    assert set(files) == {'bass', 'drums', 'vocals', 'other', 'no_bass'}
    assert all((song_dir / f).is_file() for f in files.values())


def test_interrupted_demucs_does_not_fall_back_to_cpu(tmp_path, monkeypatch):
    calls = []

    def interrupted(audio_path, out, device, progress):
        calls.append(device)
        return -signal.SIGINT, 'KeyboardInterrupt'

    monkeypatch.setattr(stems, '_devices', lambda: ['mps', 'cpu'])
    monkeypatch.setattr(stems, '_run', interrupted)
    with pytest.raises(stems.SeparationCancelled):
        stems.separate(tmp_path / 'a.wav', tmp_path, lambda p: None)
    assert calls == ['mps']


def test_real_failure_still_falls_back_to_cpu(tmp_path, monkeypatch):
    calls = []

    def mps_fails(audio_path, out, device, progress):
        calls.append(device)
        return (1, 'unsupported op') if device == 'mps' else fake_demucs(audio_path, out, device, progress)

    monkeypatch.setattr(stems, '_devices', lambda: ['mps', 'cpu'])
    monkeypatch.setattr(stems, '_run', mps_fails)
    files = stems.separate(tmp_path / 'a.wav', tmp_path, lambda p: None)
    assert calls == ['mps', 'cpu'] and 'no_bass' in files


def test_shutdown_terminates_running_demucs_and_blocks_new_runs(tmp_path, monkeypatch):
    monkeypatch.setattr(stems, '_stopping', threading.Event())
    started = threading.Event()
    real_popen = subprocess.Popen

    def popen(cmd, **kw):
        proc = real_popen(['/bin/sleep', '30'], **kw)
        started.set()
        return proc

    monkeypatch.setattr(subprocess, 'Popen', popen)
    result: list = []
    t = threading.Thread(target=lambda: result.append(stems._run(tmp_path / 'a.wav', tmp_path, 'mps', lambda p: None)))
    t.start()
    assert started.wait(5)
    stems.shutdown()
    t.join(5)
    assert not t.is_alive() and result[0][0] == -signal.SIGTERM
    assert stems._run(tmp_path / 'a.wav', tmp_path, 'cpu', lambda p: None)[0] == -signal.SIGTERM
