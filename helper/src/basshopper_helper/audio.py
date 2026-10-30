"""Audio file helpers: duration probing and stem mixing."""

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

AUDIO_EXT = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'}
MEDIA_TYPES = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.flac': 'audio/flac', '.ogg': 'audio/ogg',
}


def ffmpeg() -> str | None:
    return shutil.which('ffmpeg')


def duration_sec(path: Path) -> float:
    try:
        return float(sf.info(str(path)).duration)
    except Exception:
        pass
    try:
        import mutagen

        f = mutagen.File(str(path))
        if f is not None and f.info and f.info.length:
            return float(f.info.length)
    except Exception:
        pass
    probe = shutil.which('ffprobe')
    if probe:
        r = subprocess.run(
            [probe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(path)],
            capture_output=True, text=True, timeout=60,
        )
        try:
            return float(json.loads(r.stdout)['format']['duration'])
        except Exception:
            pass
    raise ValueError(f'Could not read audio duration of {path.name}; is it a valid audio file?')


def mix_stems(inputs: list[Path], out_dir: Path, name: str) -> Path:
    """Sum stems sample-for-sample (Demucs stems add back up to the original) into FLAC."""
    out = out_dir / f'{name}.flac'
    exe = ffmpeg()
    if exe:
        cmd = [exe, '-y', '-loglevel', 'error']
        for p in inputs:
            cmd += ['-i', str(p)]
        cmd += [
            '-filter_complex', f'amix=inputs={len(inputs)}:normalize=0:duration=longest',
            '-c:a', 'flac', '-sample_fmt', 's16', str(out),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if r.returncode == 0:
            return out
    total: np.ndarray | None = None
    rate = 44100
    for p in inputs:
        data, rate = sf.read(str(p), dtype='float32', always_2d=True)
        if total is None:
            total = data
        else:
            n = max(len(total), len(data))
            total = np.pad(total, ((0, n - len(total)), (0, 0))) + np.pad(data, ((0, n - len(data)), (0, 0)))
    assert total is not None
    sf.write(str(out), np.clip(total, -1.0, 1.0), rate, subtype='PCM_16')
    return out
