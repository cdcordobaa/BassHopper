"""Background import jobs. One worker thread, so heavy Demucs runs never overlap."""

import secrets
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='basshopper-job')
_jobs: dict[str, 'Job'] = {}
_lock = threading.Lock()


@dataclass
class Job:
    id: str
    state: str = 'queued'
    step: str = 'Queued'
    progress: float = 0.0
    song_id: str | None = None
    error: str | None = None
    warning: str | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def update(self, step: str | None = None, progress: float | None = None) -> None:
        with self._lock:
            if step is not None:
                self.step = step
            if progress is not None:
                self.progress = max(0.0, min(1.0, progress))

    def to_dict(self) -> dict:
        with self._lock:
            d: dict = {'state': self.state, 'step': self.step, 'progress': round(self.progress, 3)}
            if self.song_id and self.state == 'done':
                d['songId'] = self.song_id
            if self.error:
                d['error'] = self.error
            if self.warning:
                d['warning'] = self.warning
            return d


def submit(fn) -> Job:
    """fn(job) does the work; it may set job.warning. Returning a song id marks the job done."""
    job = Job(id=secrets.token_hex(8))
    with _lock:
        _jobs[job.id] = job

    def run() -> None:
        job.state = 'running'
        try:
            song_id = fn(job)
            with job._lock:
                job.song_id, job.state, job.progress = song_id, 'done', 1.0
                job.step = 'Done'
        except Exception as e:
            with job._lock:
                job.state, job.error = 'error', str(e) or type(e).__name__
                job.step = 'Failed'

    _pool.submit(run)
    return job


def shutdown() -> None:
    _pool.shutdown(wait=False, cancel_futures=True)


def get(job_id: str) -> Job | None:
    with _lock:
        return _jobs.get(job_id)
