"""GP3 / GP4 / GP5 via PyGuitarPro."""

import io
from fractions import Fraction

import guitarpro as gp

from .model import BeatEv, MasterBar, NoteEv, Score, TrackData


def duration_quarters(d: gp.Duration) -> Fraction:
    q = Fraction(4, d.value)
    if d.isDotted:
        q *= Fraction(3, 2)
    return q * Fraction(d.tuplet.times, d.tuplet.enters)


def read_legacy(data: bytes) -> Score:
    song = gp.parse(io.BytesIO(data))
    score = Score(title=song.title or '', artist=song.artist or '', tempo=float(song.tempo or 120))

    for h in song.measureHeaders:
        score.master_bars.append(MasterBar(
            num=h.timeSignature.numerator,
            den=h.timeSignature.denominator.value,
            repeat_open=bool(h.isRepeatOpen),
            # PyGuitarPro normalises this to "number of repeats"; -1 means no closing sign.
            repeat_close=max(h.repeatClose, 1) if h.repeatClose >= 0 else 0,
            alternatives=h.repeatAlternative or 0,
            marker=h.marker.title if h.marker is not None else None,
        ))

    tempo_seen: set[tuple[int, Fraction]] = set()
    for track in song.tracks:
        strings = sorted(track.strings, key=lambda s: s.number)  # number 1 = highest string
        tuning = [] if track.isPercussionTrack else [s.value for s in reversed(strings)]
        td = TrackData(name=track.name, tuning=tuning, instrument=track.channel.instrument)
        for bi, measure in enumerate(track.measures):
            beats: list[BeatEv] = []
            for voice in measure.voices:
                offset = Fraction(0)
                for beat in voice.beats:
                    dur = duration_quarters(beat.duration)
                    mix = beat.effect.mixTableChange
                    if mix is not None and mix.tempo is not None and mix.tempo.value > 0:
                        key = (bi, offset)
                        if key not in tempo_seen and bi < len(score.master_bars):
                            tempo_seen.add(key)
                            score.master_bars[bi].tempos.append((offset, float(mix.tempo.value)))
                    if beat.status == gp.BeatStatus.normal and tuning:
                        notes = [
                            NoteEv(
                                string=len(tuning) - n.string,
                                fret=n.value,
                                tie=n.type == gp.NoteType.tie,
                                dead=n.type == gp.NoteType.dead,
                            )
                            for n in beat.notes
                            if n.type != gp.NoteType.rest and 1 <= n.string <= len(tuning)
                        ]
                        if notes:
                            beats.append(BeatEv(offset=offset, dur=dur, notes=notes))
                    offset += dur
            beats.sort(key=lambda b: b.offset)
            td.bars.append(beats)
        score.tracks.append(td)

    for mb in score.master_bars:
        mb.tempos.sort()
    return score
