import os
from pathlib import Path


def library_dir() -> Path:
    """Read on every call so tests (and the user) can point BASSHOPPER_LIBRARY elsewhere."""
    return Path(os.environ.get('BASSHOPPER_LIBRARY') or Path.home() / 'BassHopper' / 'library')


def songs_dir() -> Path:
    d = library_dir() / 'songs'
    d.mkdir(parents=True, exist_ok=True)
    return d


def inbox_dir() -> Path:
    """Drop folder watched for new songs (see inbox.py)."""
    return Path(os.environ.get('BASSHOPPER_INBOX') or Path.home() / 'BassHopper' / 'inbox')
