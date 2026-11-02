"""Drop folder: anything put in ~/BassHopper/inbox is imported into the library on its own.

  song.mp3 (+ song.gp5)     one mixed track, optional tab with a similar name; stems via Demucs
  song.gp5 on its own       attaches to the library song with that name (tab arriving later)
  Some Song/ or Some.zip    a real multitrack: files with "bass" in the name are the bass,
                            the rest is the band. A tab inside is used too.

Imported originals move to inbox/imported/, failures to inbox/failed/ with a .txt reason.
"""

import difflib
import logging
import re
import shutil
import threading
import time
import zipfile
from pathlib import Path

import soundfile as sf

from . import importer, library
from .audio import AUDIO_EXT
from .config import inbox_dir
from .tabs.load import TAB_EXT

log = logging.getLogger('basshopper.inbox')

POLL_SEC = 3.0
# A file must sit unchanged this long before it's touched (it may still be downloading).
SETTLE_SEC = 4.0
# A lone audio file waits this long for its tab to show up.
TAB_GRACE_SEC = 20.0
_DONE = ('imported', 'failed')
_BASS = re.compile(r'bass(?!oon)', re.I)
_SKIP = re.compile(r'^(\.|__MACOSX$|\._)')

_stop = threading.Event()
_thread: threading.Thread | None = None
status: dict[str, str] = {}


def _age(p: Path) -> float:
    newest = max((f.stat().st_mtime for f in p.rglob('*')), default=0.0) if p.is_dir() else p.stat().st_mtime
    return time.time() - max(newest, p.stat().st_mtime)


def _files(folder: Path, exts: set[str]) -> list[Path]:
    return sorted(
        f for f in folder.rglob('*')
        if f.is_file() and f.suffix.lower() in exts and not any(_SKIP.match(part) for part in f.parts)
    )


def _extract(zp: Path) -> Path:
    """Unzips only audio and tab files, flattened, so nothing can land outside the folder."""
    out = zp.with_suffix('')
    out.mkdir(exist_ok=True)
    with zipfile.ZipFile(zp) as z:
        for info in z.infolist():
            name = Path(info.filename).name
            if info.is_dir() or _SKIP.match(name) or Path(name).suffix.lower() not in AUDIO_EXT | TAB_EXT:
                continue
            with z.open(info) as src, (out / name).open('wb') as dst:
                shutil.copyfileobj(src, dst)
    zp.unlink()
    return out


def _move(paths: list[Path], where: str, reason: str = '') -> None:
    dest = inbox_dir() / where
    dest.mkdir(exist_ok=True)
    for p in paths:
        if p.exists():
            target = dest / p.name
            if target.exists():
                target = dest / f'{p.stem}-{int(time.time())}{p.suffix}'
            shutil.move(str(p), target)
            if reason:
                target.with_name(target.name + '.txt').write_text(reason + '\n')


def _wait(job) -> None:
    while job.state not in ('done', 'error') and not _stop.is_set():
        time.sleep(0.5)
    if job.state == 'error':
        raise RuntimeError(job.error)


def _tab_of(paths: list[Path]) -> tuple[str, bytes] | None:
    return (paths[0].name, paths[0].read_bytes()) if paths else None


def _readable(p: Path) -> bool:
    try:
        sf.info(str(p))
        return True
    except Exception:
        log.warning('Skipping unreadable track %s', p.name)
        return False


def _import_folder(folder: Path) -> None:
    audio = [f for f in _files(folder, AUDIO_EXT) if _readable(f)]
    if not audio:
        raise ValueError('No readable audio files in this folder')
    tab = _tab_of(_files(folder, TAB_EXT))
    bass = [f for f in audio if _BASS.search(f.stem)]
    if len(audio) == 1 or not bass:
        # Not a multitrack after all: treat the (first) file as a full mix.
        with audio[0].open('rb') as f:
            job = importer.start_import(audio_name=audio[0].name, audio=f, tab=tab, title=folder.name)
            _wait(job)
        return
    band = [f for f in audio if f not in bass]
    _wait(importer.start_import(
        audio_name=folder.name, multitrack={'bass': bass, 'band': band}, tab=tab, title=_title(folder.name),
    ))


def _title(name: str) -> str:
    # "Artist_SongName_Full" style multitrack names → "Artist SongName"
    name = re.sub(r'[_]+', ' ', name)
    return re.sub(r'\s+(full|multitrack|stems?)$', '', name, flags=re.I).strip()


# Words that tab and audio downloads tack onto a song name.
_NOISE = re.compile(
    r'\b(bass|tabs?|guitar ?pro|gp\d?|official|audio|video|lyrics?|hq|hd|remaster(ed)?|'
    r'version|ver|v\d+|feat\.?|ft\.?|explicit|mp3|track|by)\b'
)


def _norm(name: str) -> str:
    name = re.sub(r'[\(\[\{].*?[\)\]\}]', ' ', name.lower())
    name = re.sub(r'^\s*\d{1,2}[\s.\-_]+', ' ', name)  # leading track number
    name = _NOISE.sub(' ', re.sub(r'[_]+', ' ', name))
    return re.sub(r'[^a-z0-9]+', '', name)


def same_song(a: str, b: str) -> bool:
    """Fuzzy: 'Queen - Another One Bites the Dust (Remastered).mp3' ~ 'another one bites the dust bass.gp5'."""
    def forms(n: str) -> set[str]:
        return {_norm(n), _norm(n.split(' - ', 1)[-1])} - {''}

    for x in forms(a):
        for y in forms(b):
            if x == y or difflib.SequenceMatcher(None, x, y).ratio() >= 0.85:
                return True
    return False


class _NoSong(Exception):
    pass


def _attach_lone_tab(tab: Path) -> bool:
    """Attaches a tab with no audio next to it to the best-named song already in the library."""
    songs = [s for s in library.list_songs() if same_song(tab.stem, s['title'])]
    if not songs:
        return False
    songs.sort(key=lambda s: (s.get('hasChart', False), -s.get('createdAt', 0)))
    _, synced = importer.attach_tab(songs[0]['id'], (tab.name, tab.read_bytes()))
    log.info('Attached %s to %s (auto-synced: %s)', tab.name, songs[0]['title'], synced)
    return True


def scan_once() -> None:
    root = inbox_dir()
    for zp in sorted(root.glob('*.zip')):
        if _age(zp) >= SETTLE_SEC:
            try:
                _extract(zp)
            except (zipfile.BadZipFile, OSError) as e:
                _move([zp], 'failed', f'Could not unzip: {e}')

    for entry in sorted(root.iterdir()):
        if _stop.is_set():
            return
        if not entry.exists():
            continue  # already went in with the audio it belongs to
        if entry.name in _DONE or _SKIP.match(entry.name) or _age(entry) < SETTLE_SEC:
            continue
        ext = entry.suffix.lower()
        if entry.is_dir():
            work, files = (lambda e=entry: _import_folder(e)), [entry]
        elif ext in AUDIO_EXT:
            tabs = [t for t in root.iterdir() if t.suffix.lower() in TAB_EXT and same_song(t.stem, entry.stem)]
            if not tabs and _age(entry) < TAB_GRACE_SEC:
                continue

            def work(e: Path = entry, t: list[Path] = tabs[:1]) -> None:
                with e.open('rb') as f:
                    # With a tab, its own title/artist win over a messy file name.
                    _wait(importer.start_import(audio_name=e.name, audio=f, tab=_tab_of(t), title='' if t else _title(e.stem)))

            files = [entry, *tabs[:1]]
        elif ext in TAB_EXT:
            if any(a.suffix.lower() in AUDIO_EXT and same_song(a.stem, entry.stem) for a in root.iterdir()):
                continue  # its audio is here; it goes in with that
            if entry.name in status and status[entry.name].startswith('waiting'):
                if not any(same_song(entry.stem, s['title']) for s in library.list_songs()):
                    continue

            def work(t: Path = entry) -> None:
                if not _attach_lone_tab(t):
                    raise _NoSong

            files = [entry]
        else:
            continue

        status[entry.name] = 'importing'
        log.info('Importing %s from the inbox', entry.name)
        try:
            work()
            _move(files, 'imported')
            status[entry.name] = 'imported'
        except _NoSong:
            status[entry.name] = 'waiting for its song: drop the audio in too'
        except Exception as e:
            log.warning('Inbox import of %s failed: %s', entry.name, e)
            _move(files, 'failed', f'Import failed: {e}')
            status[entry.name] = f'failed: {e}'


def _loop() -> None:
    while not _stop.wait(POLL_SEC):
        try:
            scan_once()
        except Exception:
            log.exception('Inbox scan failed')


def start() -> None:
    global _thread
    inbox_dir().mkdir(parents=True, exist_ok=True)
    _stop.clear()
    _thread = threading.Thread(target=_loop, name='basshopper-inbox', daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()
