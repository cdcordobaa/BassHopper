from gpbuild import BASS4, BASS5, build_gp5

from basshopper_helper.tabs import build_chart, list_tracks, load_score, pick_track
from basshopper_helper.tabs.chart import expand_repeats
from basshopper_helper.tabs.model import MasterBar


def chart_of(data: bytes, track: int | None = None) -> dict:
    score = load_score(data, 'song.gp5')
    return build_chart(score, pick_track(score, track), 'id', 'T')


def notes(chart: dict) -> list[tuple]:
    return [(n['t'], n['dur'], n['string'], n['fret']) for n in chart['notes']]


def test_ties_extend_instead_of_new_onset():
    c = chart_of(build_gp5([
        [(4, [(0, 3, 'n')]), (4, [(0, 3, 't')]), (2, [(0, 3, 't')])],
        [(4, [(0, 3, 't')]), (4, [(1, 0, 'n')]), (2, [])],
    ]))
    assert notes(c) == [(0, 5, 0, 3), (5, 1, 1, 0)]


def test_rests_dead_notes_and_length():
    c = chart_of(build_gp5([[(4, []), (4, [(2, 2, 'n')]), (4, [(2, 2, 'x')]), (4, [])]]))
    assert notes(c) == [(1, 1, 2, 2)]
    assert c['lengthBeats'] == 4 and c['beatsPerBar'] == 4


def test_dotted_and_triplets():
    trip = {'tuplet': (3, 2)}
    c = chart_of(build_gp5([[
        (4, [(0, 0, 'n')], {'dotted': True}), (8, [(0, 1, 'n')]),
        (8, [(0, 2, 'n')], trip), (8, [(0, 3, 'n')], trip), (8, [(0, 4, 'n')], trip), (4, []),
    ]]))
    ts = [n['t'] for n in c['notes']]
    assert ts[:2] == [0, 1.5]
    assert ts[2:] == [2, round(2 + 1 / 3, 6), round(2 + 2 / 3, 6)]
    assert c['notes'][0]['dur'] == 1.5


def test_tempo_changes_build_tempo_map():
    c = chart_of(build_gp5([
        [(1, [(0, 0, 'n')])],
        [(2, [(0, 0, 'n')]), (2, [(0, 0, 'n')], {'tempo': 150})],
    ], tempo=100))
    assert c['bpm'] == 100
    assert c['tempoMap'] == [{'beat': 0, 'bpm': 100}, {'beat': 6, 'bpm': 150}]


def test_five_string_low_b_transposes_up_an_octave():
    # strings from low: 0=B 1=E 2=A 3=D 4=G
    c = chart_of(build_gp5([[(4, [(0, 0, 'n')]), (4, [(0, 5, 'n')]), (4, [(1, 3, 'n')]), (4, [(4, 2, 'n')])]],
                           tuning=BASS5))
    # low B (MIDI 23) -> B1 (35) = A string fret 2; B fret 5 = E1 = open E; E3 stays; G2 stays
    assert notes(c) == [(0, 1, 1, 2), (1, 1, 0, 0), (2, 1, 0, 3), (3, 1, 3, 2)]
    assert c['droppedNotes'] == 0


def test_out_of_range_notes_are_dropped():
    six = (23, 28, 33, 38, 43, 48)
    c = chart_of(build_gp5([[(4, [(5, 24, 'n')]), (4, [(5, 0, 'n')]), (2, [])]], tuning=six))
    assert c['droppedNotes'] == 1
    assert notes(c) == [(1, 1, 3, 5)]  # high C open = G string fret 5


def test_drop_d_keeps_original_string_when_possible():
    drop_d = (26, 33, 38, 43)
    c = chart_of(build_gp5([[(4, [(0, 0, 'n')]), (4, [(0, 2, 'n')]), (4, [(0, 7, 'n')]), (4, [(1, 5, 'n')])]],
                           tuning=drop_d))
    # low D has no place on E A D G -> octave up on the E string (fret 10)
    assert notes(c) == [(0, 1, 0, 10), (1, 1, 0, 0), (2, 1, 0, 5), (3, 1, 1, 5)]


def test_bass_notated_at_guitar_octave_is_dropped_back():
    c = chart_of(build_gp5([[(1, [(0, 3, 'n')])]], tuning=(40, 45, 50, 55)))
    assert notes(c) == [(0, 4, 0, 3)]


def test_track_listing_and_default_bass_track():
    data = build_gp5(
        [[(1, [(1, 2, 'n')])]],
        name='Bass Guitar',
        extra_tracks=[('Lead Guitar', (40, 45, 50, 55, 59, 64), 29), ('5 String', BASS5, 34)],
    )
    score = load_score(data, 'x.gp5')
    assert list_tracks(score) == [
        {'index': 0, 'name': 'Bass Guitar', 'strings': 4, 'isBass': True},
        {'index': 1, 'name': 'Lead Guitar', 'strings': 6, 'isBass': False},
        {'index': 2, 'name': '5 String', 'strings': 5, 'isBass': True},
    ]
    assert pick_track(score, None) == 0
    assert pick_track(score, 2) == 2


def test_repeats_expand_and_markers_become_sections():
    import guitarpro as gp

    bar = [(1, [(0, 0, 'n')])]
    c = chart_of(build_gp5(
        [bar, bar, bar],
        headers={0: {'marker': gp.Marker(title='Intro')}, 1: {'isRepeatOpen': True, 'repeatClose': 1,
                                                              'marker': gp.Marker(title='Riff')}},
    ))
    assert c['lengthBeats'] == 16
    assert [n['t'] for n in c['notes']] == [0, 4, 8, 12]
    assert c['sections'] == [{'beat': 0, 'name': 'Intro'}, {'beat': 4, 'name': 'Riff'}, {'beat': 8, 'name': 'Riff'}]


def test_expand_repeats_with_alternate_endings():
    bars = [
        MasterBar(),
        MasterBar(repeat_open=True),
        MasterBar(alternatives=0b01, repeat_close=1),
        MasterBar(alternatives=0b10),
        MasterBar(),
        MasterBar(repeat_open=True, repeat_close=2),
    ]
    assert expand_repeats(bars) == [0, 1, 2, 1, 3, 4, 5, 5, 5]


def test_expand_repeats_endings_before_shared_close():
    # alphaTab's repeat-close-alternate-endings fixture: endings 1&3 | 2 | shared bar with close x4
    bars = [
        MasterBar(repeat_open=True), MasterBar(alternatives=0b101), MasterBar(alternatives=0b010),
        MasterBar(repeat_close=3), MasterBar(),
    ]
    assert expand_repeats(bars) == [0, 1, 3, 0, 2, 3, 0, 1, 3, 0, 3, 4]


def test_bare_close_after_endings_repeats_from_after_them():
    bars = [
        MasterBar(repeat_open=True), MasterBar(alternatives=0b01, repeat_close=1), MasterBar(alternatives=0b10),
        MasterBar(), MasterBar(repeat_close=1),
    ]
    assert expand_repeats(bars) == [0, 1, 0, 2, 3, 4, 3, 4]


def test_close_without_open_repeats_from_start():
    assert expand_repeats([MasterBar(), MasterBar(repeat_close=1), MasterBar()]) == [0, 1, 0, 1, 2]


def test_round_trip_track_tuning_default():
    score = load_score(build_gp5([[(1, [])]]), 'x.gp5')
    assert score.tracks[0].tuning == list(BASS4)
