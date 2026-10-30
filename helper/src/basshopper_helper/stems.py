"""Optional Demucs (htdemucs, 4 stems) separation, run as a subprocess so torch never loads in the API process."""

import importlib.util
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from collections.abc import Callable
from functools import cache
from pathlib import Path

from .audio import ffmpeg, mix_stems

STEMS = ('bass', 'drums', 'vocals', 'other')
_PCT = re.compile(rb'(\d{1,3})%\|')
# Ctrl+C reaches the demucs child too; those exits mean "stop", not "retry on the next device".
_INTERRUPTS = {-signal.SIGINT, -signal.SIGTERM, -signal.SIGHUP}

_stopping = threading.Event()
_procs: set[subprocess.Popen] = set()
_procs_lock = threading.Lock()


class SeparationCancelled(RuntimeError):
    pass


def shutdown() -> None:
    """Stop any running Demucs and refuse new runs (called when the helper exits)."""
    _stopping.set()
    with _procs_lock:
        for proc in _procs:
            proc.terminate()


@cache
def demucs_available() -> bool:
    if os.environ.get('BASSHOPPER_DISABLE_STEMS'):
        return False
    # Demucs decodes mp3/m4a through ffmpeg; without it only wav would work.
    return importlib.util.find_spec('demucs') is not None and ffmpeg() is not None


def _devices() -> list[str | None]:
    forced = os.environ.get('BASSHOPPER_DEMUCS_DEVICE')
    if forced:
        return [forced]
    if sys.platform == 'darwin' and platform.machine() == 'arm64':
        return ['mps', 'cpu']  # Apple GPU is ~5x faster; cpu is the fallback if an op is unsupported
    return [None]  # let demucs choose (cuda if available, else cpu)


def _run(audio: Path, out: Path, device: str | None, progress: Callable[[float], None]) -> tuple[int, str]:
    cmd = [
        # FLAC, not mp3: mp3 encoder delay would shift stems ~25 ms against the chart offset.
        # clamp, not the default rescale, so stems keep the original level and still sum to the mix.
        sys.executable, '-m', 'demucs.separate', '-n', 'htdemucs', '--flac', '--clip-mode', 'clamp',
        '-o', str(out), '--filename', '{stem}.{ext}', str(audio),
    ]
    if device:
        cmd[-1:-1] = ['-d', device]
    env = {**os.environ, 'PYTHONUNBUFFERED': '1'}
    with _procs_lock:
        if _stopping.is_set():
            return -signal.SIGTERM, 'helper is shutting down'
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env=env)
        _procs.add(proc)
    try:
        assert proc.stderr is not None
        tail = b''
        while chunk := proc.stderr.read(256):
            tail = (tail + chunk)[-4000:]
            hits = _PCT.findall(tail)
            if hits:
                progress(min(int(hits[-1]), 100) / 100)
        return proc.wait(), tail.decode('utf-8', 'replace')
    finally:
        with _procs_lock:
            _procs.discard(proc)


def separate(audio: Path, song_dir: Path, progress: Callable[[float], None]) -> dict[str, str]:
    """Writes bass/drums/vocals/other + no_bass into song_dir. Returns {stem: filename}."""
    with tempfile.TemporaryDirectory(prefix='basshopper-demucs-') as tmp:
        out = Path(tmp)
        err = ''
        for device in _devices():
            code, err = _run(audio, out, device, progress)
            if code == 0:
                break
            if code in _INTERRUPTS or _stopping.is_set():
                raise SeparationCancelled('Demucs was interrupted')
            shutil.rmtree(out / 'htdemucs', ignore_errors=True)
        else:
            last = err.strip().splitlines()[-1:] or ['unknown error']
            raise RuntimeError(f'Demucs failed: {last[0]}')
        files: dict[str, str] = {}
        for stem in STEMS:
            src = out / 'htdemucs' / f'{stem}.flac'
            if not src.exists():
                raise RuntimeError(f'Demucs produced no {stem} stem')
            shutil.move(src, song_dir / src.name)
            files[stem] = src.name
    no_bass = mix_stems([song_dir / files[s] for s in ('drums', 'vocals', 'other')], song_dir, 'no_bass')
    files['no_bass'] = no_bass.name
    return files
