import zipfile

import numpy as np
import pytest
import soundfile as sf
from test_api import GP5

from basshopper_helper import inbox, library, stems
from basshopper_helper.inbox import same_song

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
    assert song['title'] == 'Test Song' and song['hasChart']  # the tab's own title beats the file name
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


def test_pairs_tab_and_audio_with_different_names(box):
    sf.write(str(box / 'Some Band - My Riff (Remastered 2011).wav'), tone(55), RATE)
    (box / 'my riff bass tab.gp5').write_bytes(GP5)
    inbox.scan_once()
    [song] = library.list_songs()
    assert song['hasChart']
    assert not any(p.suffix in ('.gp5', '.wav') for p in box.iterdir())


def test_tab_arriving_later_attaches_to_the_song(box):
    sf.write(str(box / 'Lonely Song.wav'), tone(55), RATE)
    inbox.scan_once()
    [song] = library.list_songs()
    assert not song['hasChart']
    (box / 'Lonely Song (Bass).gp5').write_bytes(GP5)
    inbox.scan_once()
    assert library.list_songs()[0]['hasChart']
    assert (box / 'imported' / 'Lonely Song (Bass).gp5').exists()


def test_tab_without_any_song_waits(box):
    (box / 'Nothing Like This.gp5').write_bytes(GP5)
    inbox.scan_once()
    inbox.scan_once()
    assert (box / 'Nothing Like This.gp5').exists()
    assert inbox.status['Nothing Like This.gp5'].startswith('waiting')


@pytest.mark.parametrize(('a', 'b', 'same'), [
    ('Queen - Another One Bites the Dust (Remastered 2011)', 'another one bites the dust bass', True),
    ('01 Come Together', 'The Beatles - Come Together (ver 2)', True),
    ('Hysteria', 'Muse - Hysteria [Bass Tab]', True),
    ('Come Together', 'Get Together', False),
    ('Money', 'Money for Nothing', False),
])
def test_same_song(a, b, same):
    assert same_song(a, b) is same
