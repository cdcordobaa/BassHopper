import io
import time

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient
from gpbuild import build_gp5

from basshopper_helper import stems
from basshopper_helper.app import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('BASSHOPPER_LIBRARY', str(tmp_path / 'lib'))
    monkeypatch.setenv('BASSHOPPER_DISABLE_STEMS', '1')
    stems.demucs_available.cache_clear()
    yield TestClient(app)
    stems.demucs_available.cache_clear()


def wav_bytes(seconds: float = 1.5, rate: int = 22050) -> bytes:
    t = np.arange(int(seconds * rate)) / rate
    buf = io.BytesIO()
    sf.write(buf, 0.3 * np.sin(2 * np.pi * 55 * t), rate, format='WAV')
    return buf.getvalue()


GP5 = build_gp5([[(4, [(0, 0, 'n')]), (4, [(1, 2, 'n')]), (2, [])]], tempo=96)


def wait_job(client: TestClient, job_id: str) -> dict:
    for _ in range(200):
        job = client.get(f'/api/jobs/{job_id}').json()
        if job['state'] in ('done', 'error'):
            return job
        time.sleep(0.05)
    raise AssertionError('job did not finish')


def import_song(client: TestClient, with_tab: bool = True, **form) -> str:
    files = {'audio': ('take.wav', wav_bytes(), 'audio/wav')}
    if with_tab:
        files['tab'] = ('riff.gp5', GP5, 'application/octet-stream')
    r = client.post('/api/import', files=files, data=form)
    assert r.status_code == 200, r.text
    job = wait_job(client, r.json()['jobId'])
    assert job['state'] == 'done', job
    assert job['progress'] == 1
    return job['songId']


def test_health(client):
    assert client.get('/api/health').json() == {'ok': True, 'demucs': False}


def test_tab_tracks(client):
    r = client.post('/api/tab/tracks', files={'tab': ('riff.gp5', GP5)})
    assert r.json() == {'tracks': [{'index': 0, 'name': 'Bass', 'strings': 4, 'isBass': True}]}


def test_tab_tracks_rejects_unknown_and_broken(client):
    assert client.post('/api/tab/tracks', files={'tab': ('song.txt', b'hi')}).status_code == 415
    r = client.post('/api/tab/tracks', files={'tab': ('song.gpx', b'BCFZjunkjunk')})
    assert r.status_code == 415
    assert 'export as .gp5 or .gp' in r.json()['detail']


def test_import_list_chart_audio_patch_delete(client):
    song_id = import_song(client, title='My Riff', artist='Me', track='0')

    songs = client.get('/api/songs').json()['songs']
    assert songs == [{
        'id': song_id, 'title': 'My Riff', 'artist': 'Me', 'durationSec': 1.5,
        'hasChart': True, 'stems': ['full'], 'offsetSec': 0.0,
    }]

    chart = client.get(f'/api/songs/{song_id}/chart').json()
    assert chart['id'] == song_id and chart['title'] == 'My Riff'
    assert chart['bpm'] == 96 and chart['tempoMap'] == [{'beat': 0, 'bpm': 96}]
    assert chart['notes'] == [{'t': 0, 'dur': 1, 'string': 0, 'fret': 0}, {'t': 1, 'dur': 1, 'string': 1, 'fret': 2}]
    assert chart['sections'] == [] and chart['droppedNotes'] == 0 and chart['lengthBeats'] == 4

    full = client.get(f'/api/songs/{song_id}/audio/full')
    assert full.status_code == 200 and full.headers['content-type'] == 'audio/wav'
    part = client.get(f'/api/songs/{song_id}/audio/full', headers={'Range': 'bytes=0-99'})
    assert part.status_code == 206 and len(part.content) == 100
    assert client.get(f'/api/songs/{song_id}/audio/bass').status_code == 404
    assert client.get(f'/api/songs/{song_id}/audio/karaoke').status_code == 404

    r = client.patch(f'/api/songs/{song_id}', json={'offsetSec': 0.42, 'title': 'Renamed'})
    assert r.status_code == 200
    assert r.json()['offsetSec'] == 0.42 and r.json()['title'] == 'Renamed'
    assert client.get(f'/api/songs/{song_id}/chart').json()['title'] == 'Renamed'
    assert client.get('/api/songs').json()['songs'][0]['offsetSec'] == 0.42

    assert client.delete(f'/api/songs/{song_id}').json() == {'ok': True}
    assert client.get('/api/songs').json() == {'songs': []}
    assert client.get(f'/api/songs/{song_id}/chart').status_code == 404
    assert client.delete(f'/api/songs/{song_id}').status_code == 404


def test_import_without_tab_has_no_chart(client):
    song_id = import_song(client, with_tab=False)
    song = client.get('/api/songs').json()['songs'][0]
    assert song['title'] == 'take' and song['hasChart'] is False
    assert client.get(f'/api/songs/{song_id}/chart').status_code == 404


def test_import_defaults_title_from_tab(client):
    import_song(client)
    assert client.get('/api/songs').json()['songs'][0]['title'] == 'Test Song'


def test_import_validation(client):
    r = client.post('/api/import', files={'audio': ('notes.txt', b'x')})
    assert r.status_code == 415
    r = client.post('/api/import', files={'audio': ('a.wav', wav_bytes()), 'tab': ('t.gp5', GP5)}, data={'track': '5'})
    assert r.status_code == 400
    r = client.post('/api/import', files={'audio': ('a.wav', wav_bytes()), 'tab': ('t.gpx', b'nope')})
    assert r.status_code == 415
    assert client.get('/api/songs').json() == {'songs': []}  # nothing half-imported left behind


def test_unreadable_audio_fails_job_and_cleans_up(client):
    r = client.post('/api/import', files={'audio': ('broken.wav', b'not audio')})
    job = wait_job(client, r.json()['jobId'])
    assert job['state'] == 'error' and 'duration' in job['error']
    assert client.get('/api/songs').json() == {'songs': []}


def test_unknown_ids(client):
    assert client.get('/api/jobs/nope').status_code == 404
    assert client.get('/api/songs/nope/chart').status_code == 404
    assert client.get('/api/songs/..%2F..%2Fetc/chart').status_code == 404
    assert client.patch('/api/songs/nope', json={'offsetSec': 1}).status_code == 404
