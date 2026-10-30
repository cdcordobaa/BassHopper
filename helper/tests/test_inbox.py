import zipfile

import numpy as np
import pytest
import soundfile as sf
from test_api import GP5

from basshopper_helper import inbox, library, stems

RATE = 22050


def tone(freq: float, seconds: float = 1.0, amp: float = 0.3) -> np.ndarray:
    t = np.arange(int(seconds * RATE)) / RATE
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


@pytest.fixture
def box(tmp_path, monkeypatch):
    monkeypatch.setenv('BASSHOPPER_LIBRARY', str(tmp_path / 'lib'))
    monkeypatch.setenv('BASSHOPPER_INBOX', str(tmp_path / 'inbox'))
    monkeypatch.setenv('BASSHOPPER_DISABLE_STEMS', '1')
    monkeypatch.setattr(inbox, 'SETTLE_SEC', 0)
    monkeypatch.setattr(inbox, 'TAB_GRACE_SEC', 0)
    stems.demucs_available.cache_clear()
    d = tmp_path / 'inbox'
    d.mkdir()
    yield d
    stems.demucs_available.cache_clear()


def test_single_song_with_matching_tab(box):
    sf.write(str(box / 'My Riff.wav'), tone(55), RATE)
    (box / 'My Riff.gp5').write_bytes(GP5)
    inbox.scan_once()
    [song] = library.list_songs()
    assert song['title'] == 'My Riff' and song['hasChart']
    assert sorted(p.name for p in (box / 'imported').iterdir()) == ['My Riff.gp5', 'My Riff.wav']


def test_multitrack_zip_splits_bass_from_band(box):
    folder = box.parent / 'mt'
    folder.mkdir()
    sf.write(str(folder / '01_Kick.wav'), tone(60), RATE)
    sf.write(str(folder / '05_BassDI.wav'), tone(55), RATE)
    sf.write(str(folder / '09_Gtr.wav'), tone(330), RATE)
    with zipfile.ZipFile(box / 'Band_Tune_Full.zip', 'w') as z:
        for f in folder.iterdir():
            z.write(f, f'Band_Tune_Full/{f.name}')
        z.writestr('../evil.wav', b'nope')
    inbox.scan_once()  # unzips
    inbox.scan_once()  # imports the folder
    [song] = library.list_songs()
    assert song['title'] == 'Band Tune'
    assert song['stems'] == ['full', 'bass', 'no_bass']
    d = library.song_dir(song['id'])
    bass, _ = sf.read(str(d / 'bass.flac'))
    band, _ = sf.read(str(d / 'no_bass.flac'))
    full, _ = sf.read(str(d / 'full.flac'))
    assert np.allclose(bass + band, full, atol=2e-4)
    assert not (box.parent / 'evil.wav').exists()


def test_bad_file_goes_to_failed_with_reason(box):
    (box / 'broken.mp3').write_bytes(b'not audio')
    inbox.scan_once()
    assert library.list_songs() == []
    assert (box / 'failed' / 'broken.mp3').exists()
    assert 'failed' in (box / 'failed' / 'broken.mp3.txt').read_text()


def test_waits_for_files_still_downloading(box, monkeypatch):
    monkeypatch.setattr(inbox, 'SETTLE_SEC', 60)
    sf.write(str(box / 'fresh.wav'), tone(55), RATE)
    inbox.scan_once()
    assert library.list_songs() == [] and (box / 'fresh.wav').exists()
