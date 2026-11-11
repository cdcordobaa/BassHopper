import json

from fastapi.testclient import TestClient

from basshopper_helper.app import app


def test_lists_pieces_and_flags_broken_files(tmp_path, monkeypatch):
    monkeypatch.setenv('BASSHOPPER_SOLOS', str(tmp_path))
    client = TestClient(app)
    assert client.get('/api/solos').json()['solos'] == []

    good = {'title': 'Riff', 'bpm': 100, 'phrases': [{'name': 'A', 'notation': 'E0 E3'}], 'perform': [0, 0]}
    (tmp_path / 'riff.json').write_text(json.dumps(good))
    (tmp_path / 'bad-order.json').write_text(json.dumps({**good, 'perform': [3]}))
    (tmp_path / 'broken.json').write_text('{nope')
    (tmp_path / 'notes.txt').write_text('ignored')

    by_id = {s['id']: s for s in client.get('/api/solos').json()['solos']}
    assert set(by_id) == {'riff', 'bad-order', 'broken'}
    assert by_id['riff']['phrases'][0]['notation'] == 'E0 E3' and 'error' not in by_id['riff']
    assert 'perform' in by_id['bad-order']['error']
    assert 'broken.json' in by_id['broken']['error']
