"""Score + chosen track -> SongChart (the web Chart type plus tempoMap / sections / droppedNotes)."""

from dataclasses import dataclass
from fractions import Fraction

from .load import track_tuning
from .model import MasterBar, Score
from .tuning import map_pitch, string_correspondence

MAX_EXPANDED_BARS = 5000


def expand_repeats(bars: list[MasterBar]) -> list[int]:
    """Play order of master bars with simple repeats and alternate endings unrolled."""
    order: list[int] = []
    start, pass_no, i = 0, 1, 0
    total: int | None = None  # passes of the current repeat, known once its closing bar was seen
    jumped = prev_alt = False
    jumps_left: dict[int, int] = {}
    while i < len(bars) and len(order) < MAX_EXPANDED_BARS:
        b = bars[i]
        if b.repeat_open and not jumped:
            start, pass_no, total = i, 1, None
        jumped = False
        if b.alternatives:
            if not (b.alternatives >> (pass_no - 1)) & 1:
                i += 1
                continue
        elif prev_alt and total is not None and pass_no >= total and not b.repeat_close:
            start, pass_no, total = i, 1, None  # came out of the last ending; a later bare close repeats from here
        prev_alt = bool(b.alternatives)
        order.append(i)
        if b.repeat_close > 0:
            if total is None:
                total = b.repeat_close + 1
            left = jumps_left.get(i, b.repeat_close)
            if left > 0:
                jumps_left[i] = left - 1
                pass_no += 1
                i, jumped, prev_alt = start, True, False
                continue
            jumps_left.pop(i, None)
            start, pass_no, total = i + 1, 1, None
        i += 1
    return order


def _num(x: Fraction | float) -> float | int:
    f = round(float(x), 6)
    return int(f) if f.is_integer() else f


@dataclass
class _Rec:
    t: Fraction
    end: Fraction
    string: int
    fret: int


def build_chart(score: Score, track_index: int, chart_id: str = '', title: str = '') -> dict:
    track = score.tracks[track_index]
    tuning = track_tuning(score, track_index)
    prefer = string_correspondence(tuning)

    # Keyed by onset + mapped position so a note written in two voices is one record, and a later
    # tie extends that record. last[source string] is None after a dropped note so its ties are skipped.
    notes: dict[tuple[Fraction, int, int], _Rec] = {}
    last: dict[int, _Rec | None] = {}
    tempo_points: list[tuple[Fraction, float]] = [(Fraction(0), score.tempo)]
    sections: list[dict] = []
    dropped = 0
    t = Fraction(0)

    for bi in expand_repeats(score.master_bars):
        mb = score.master_bars[bi]
        if mb.marker:
            sections.append({'beat': _num(t), 'name': mb.marker})
        for off, bpm in mb.tempos:
            tempo_points.append((t + off, bpm))
        for beat in track.bars[bi] if bi < len(track.bars) else []:
            onset, end = t + beat.offset, t + beat.offset + beat.dur
            for n in beat.notes:
                if n.tie and n.string in last:
                    prev = last[n.string]
                    if prev is not None:
                        prev.end = max(prev.end, end)
                    continue
                if n.dead:
                    last.pop(n.string, None)
                    continue
                mapped = map_pitch(tuning[n.string] + n.fret, prefer[n.string], n.fret)
                if mapped is None:
                    dropped += 1
                    last[n.string] = None
                    continue
                key = (onset, mapped[0], mapped[1])
                rec = notes.get(key)
                if rec is None:
                    rec = notes[key] = _Rec(onset, end, mapped[0], mapped[1])
                else:
                    rec.end = max(rec.end, end)
                last[n.string] = rec
        t += mb.length

    out_notes = [
        {'t': _num(r.t), 'dur': _num(r.end - r.t), 'string': r.string, 'fret': r.fret}
        for r in sorted(notes.values(), key=lambda r: (r.t, r.string))
    ]

    tempo_map: list[dict] = []
    for beat, bpm in sorted(tempo_points, key=lambda p: p[0]):
        bpm = round(bpm, 3)
        if tempo_map and tempo_map[-1]['beat'] == _num(beat):
            tempo_map[-1]['bpm'] = bpm  # a later change at the same spot wins
        elif not tempo_map or tempo_map[-1]['bpm'] != bpm:
            tempo_map.append({'beat': _num(beat), 'bpm': bpm})
    tempo_map = [p for i, p in enumerate(tempo_map) if i == 0 or p['bpm'] != tempo_map[i - 1]['bpm']]

    first = score.master_bars[0]
    return {
        'id': chart_id,
        'title': title or score.title,
        'bpm': tempo_map[0]['bpm'],
        'beatsPerBar': _num(first.length),
        'notes': out_notes,
        'lengthBeats': _num(t),
        'tempoMap': tempo_map,
        'sections': sections,
        'droppedNotes': dropped,
        'trackName': track.name,
    }
