from fractions import Fraction

from basshopper_helper.tabs import build_chart
from basshopper_helper.tabs.model import BeatEv, MasterBar, NoteEv, Score, TrackData


def score_of(*bars: list[BeatEv]) -> Score:
    track = TrackData(name='Bass', tuning=[28, 33, 38, 43], instrument=33, bars=list(bars))
    return Score(master_bars=[MasterBar() for _ in bars], tracks=[track])


def beat(offset: int, dur: int, string: int, fret: int, tie: bool = False) -> BeatEv:
    return BeatEv(Fraction(offset), Fraction(dur), [NoteEv(string, fret, tie=tie)])


def notes(chart: dict) -> list[tuple]:
    return [(n['t'], n['dur'], n['string'], n['fret']) for n in chart['notes']]


def test_tie_extends_note_doubled_in_two_voices():
    # voice 1 and voice 2 both write a half note E string fret 3, then a tied half note
    c = build_chart(score_of([beat(0, 2, 0, 3), beat(0, 2, 0, 3), beat(2, 2, 0, 3, tie=True)]), 0)
    assert notes(c) == [(0, 4, 0, 3)]


def test_ties_after_dropped_note_are_not_counted_again():
    # G string fret 30 is beyond fret 24 in either octave, so it is dropped once, ties and all
    c = build_chart(score_of([beat(0, 2, 3, 30), beat(2, 2, 3, 30, tie=True)], [beat(0, 4, 3, 30, tie=True)]), 0)
    assert notes(c) == [] and c['droppedNotes'] == 1


def test_tie_after_dropped_note_does_not_hide_next_real_note():
    c = build_chart(score_of([beat(0, 2, 3, 30), beat(2, 1, 3, 30, tie=True), beat(3, 1, 3, 2)]), 0)
    assert notes(c) == [(3, 1, 3, 2)] and c['droppedNotes'] == 1
