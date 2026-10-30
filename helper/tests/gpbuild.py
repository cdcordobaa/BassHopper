"""Build tiny Guitar Pro 5 files with PyGuitarPro for round-trip tests."""

import io

import guitarpro as gp

BASS4 = (28, 33, 38, 43)  # low -> high
BASS5 = (23, 28, 33, 38, 43)

# A bar is a list of beats: (duration value, [(string_from_low, fret, kind)], extras dict)
# kind: 'n' normal, 't' tie, 'x' dead. An empty note list = rest.


def build_gp5(
    bars: list[list[tuple]],
    tuning: tuple[int, ...] = BASS4,
    tempo: int = 120,
    name: str = 'Bass',
    instrument: int = 33,
    extra_tracks: list[tuple[str, tuple[int, ...], int]] = (),
    headers: dict[int, dict] | None = None,
) -> bytes:
    song = gp.Song()
    song.title, song.artist, song.tempo = 'Test Song', 'Tester', tempo
    for _ in range(len(bars) - 1):
        song.newMeasure()
    track = song.tracks[0]
    _setup_track(track, name, tuning, instrument, 0)
    for tname, ttuning, tinst in extra_tracks:
        t = gp.Track(song, number=len(song.tracks) + 1)
        song.tracks.append(t)
        _setup_track(t, tname, ttuning, tinst, len(song.tracks) - 1)
        for m in t.measures:
            m.voices[0].beats.append(gp.Beat(m.voices[0], duration=gp.Duration(value=1), status=gp.BeatStatus.rest))
    for bi, (measure, spec) in enumerate(zip(track.measures, bars, strict=True)):
        for k, v in (headers or {}).get(bi, {}).items():
            setattr(measure.header, k, v)
        voice = measure.voices[0]
        for beat_spec in spec:
            value, notes = beat_spec[0], beat_spec[1]
            extras = beat_spec[2] if len(beat_spec) > 2 else {}
            dur = gp.Duration(value=value, isDotted=extras.get('dotted', False))
            if 'tuplet' in extras:
                dur.tuplet = gp.Tuplet(*extras['tuplet'])
            beat = gp.Beat(voice, duration=dur, status=gp.BeatStatus.normal if notes else gp.BeatStatus.rest)
            if 'tempo' in extras:
                beat.effect.mixTableChange = gp.MixTableChange(tempo=gp.MixTableItem(value=extras['tempo']))
            for string_low, fret, kind in notes:
                ntype = {'n': gp.NoteType.normal, 't': gp.NoteType.tie, 'x': gp.NoteType.dead}[kind]
                beat.notes.append(gp.Note(beat, value=fret, string=len(tuning) - string_low, type=ntype))
            voice.beats.append(beat)
    buf = io.BytesIO()
    gp.write(song, buf, version=(5, 1, 0))
    return buf.getvalue()


def _setup_track(track, name, tuning, instrument, index):
    track.name = name
    track.channel = gp.MidiChannel(channel=2 * index, effectChannel=2 * index + 1)
    track.strings = [gp.GuitarString(i + 1, v) for i, v in enumerate(reversed(tuning))]
    track.channel.instrument = instrument
