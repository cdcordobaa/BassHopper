"""GPIF XML (Content/score.gpif inside GP7/8 .gp zips, and inside GP6 .gpx containers)."""

import xml.etree.ElementTree as ET
from fractions import Fraction

from .model import BeatEv, MasterBar, NoteEv, Score, TrackData

NOTE_VALUES = {
    'Whole': Fraction(4), 'Half': Fraction(2), 'Quarter': Fraction(1), 'Eighth': Fraction(1, 2),
    '16th': Fraction(1, 4), '32nd': Fraction(1, 8), '64th': Fraction(1, 16),
    '128th': Fraction(1, 32), '256th': Fraction(1, 64),
}

# GPIF tempo automations carry "<bpm> <reference beat>"; convert to quarter-note bpm.
TEMPO_UNIT = {1: Fraction(1, 2), 2: Fraction(1), 3: Fraction(3, 2), 4: Fraction(2), 5: Fraction(3)}


def _text(el: ET.Element | None, path: str, default: str = '') -> str:
    if el is None:
        return default
    found = el.find(path)
    return (found.text or '').strip() if found is not None and found.text is not None else default


def _ids(s: str) -> list[int]:
    return [int(x) for x in s.split()] if s else []


def _by_id(root: ET.Element, container: str, tag: str) -> dict[int, ET.Element]:
    parent = root.find(container)
    if parent is None:
        return {}
    return {int(el.get('id', '-1')): el for el in parent.findall(tag)}


def _rhythm_quarters(el: ET.Element | None) -> Fraction:
    if el is None:
        return Fraction(1)
    q = NOTE_VALUES.get(_text(el, 'NoteValue', 'Quarter'), Fraction(1))
    dot = el.find('AugmentationDot')
    if dot is not None:
        dots = int(dot.get('count', '1'))
        q *= 2 - Fraction(1, 2 ** dots)
    tup = el.find('PrimaryTuplet')
    if tup is not None:
        num, den = int(tup.get('num', '1')), int(tup.get('den', '1'))
        if num > 0 and den > 0:
            q *= Fraction(den, num)
    return q


def _property(note: ET.Element, name: str) -> ET.Element | None:
    for p in note.iter('Property'):
        if p.get('name') == name:
            return p
    return None


def _track_tuning(track: ET.Element) -> list[int]:
    for p in track.iter('Property'):
        if p.get('name') == 'Tuning':
            pitches = _text(p, 'Pitches')
            if pitches:
                return _ids(pitches)
    return []


def _track_program(track: ET.Element) -> int | None:
    for path in ('GeneralMidi/Program', 'Sounds/Sound/MIDI/Program', 'MidiConnection/Program'):
        txt = _text(track, path)
        if txt.isdigit():
            return int(txt)
    return None


def read_gpif(xml: bytes) -> Score:
    root = ET.fromstring(xml)
    score = Score(title=_text(root, 'Score/Title'), artist=_text(root, 'Score/Artist'))

    rhythms = _by_id(root, 'Rhythms', 'Rhythm')
    notes = _by_id(root, 'Notes', 'Note')
    beats = _by_id(root, 'Beats', 'Beat')
    voices = _by_id(root, 'Voices', 'Voice')
    bars = _by_id(root, 'Bars', 'Bar')

    track_els = root.findall('Tracks/Track')
    master_els = root.findall('MasterBars/MasterBar')

    for mb_el in master_els:
        num, _, den = _text(mb_el, 'Time', '4/4').partition('/')
        mb = MasterBar(num=int(num or 4), den=int(den or 4))
        rep = mb_el.find('Repeat')
        if rep is not None:
            mb.repeat_open = rep.get('start') == 'true'
            if rep.get('end') == 'true':
                mb.repeat_close = max(int(rep.get('count', '2')) - 1, 1)
        for n in _ids(_text(mb_el, 'AlternateEndings')):
            if n >= 1:
                mb.alternatives |= 1 << (n - 1)
        section = mb_el.find('Section')
        if section is not None:
            mb.marker = _text(section, 'Text') or _text(section, 'Letter') or None
        score.master_bars.append(mb)

    initial_tempo: float | None = None
    for auto in root.iter('Automation'):
        if _text(auto, 'Type') != 'Tempo':
            continue
        parts = _text(auto, 'Value').split()
        if not parts:
            continue
        bpm = Fraction(parts[0])
        unit = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 2
        bpm *= TEMPO_UNIT.get(unit, Fraction(1))
        bar = int(_text(auto, 'Bar', '0') or 0)
        if not 0 <= bar < len(score.master_bars):
            continue
        mb = score.master_bars[bar]
        ratio = Fraction(_text(auto, 'Position', '0') or '0').limit_denominator(960)
        offset = ratio * mb.length
        if bar == 0 and offset == 0 and initial_tempo is None:
            initial_tempo = float(bpm)
        mb.tempos.append((offset, float(bpm)))
    if initial_tempo is not None:
        score.tempo = initial_tempo
    for mb in score.master_bars:
        mb.tempos.sort()

    # MasterBar/Bars lists one bar per staff, not per track (a grand-staff piano takes two slots).
    first_staff: list[int] = []
    n_staves = 0
    for tr in track_els:
        first_staff.append(n_staves)
        n_staves += max(len(tr.findall('Staves/Staff')), 1)

    for ti, tr in enumerate(track_els):
        tuning = _track_tuning(tr)
        itype = _text(tr, 'InstrumentSet/Type').lower() + ' ' + _text(tr, 'InstrumentSet/Name').lower()
        td = TrackData(
            name=_text(tr, 'Name') or f'Track {ti + 1}',
            tuning=tuning,
            instrument=_track_program(tr),
            bass_hint='bass' in itype,
        )
        for mb_el in master_els:
            bar_ids = _ids(_text(mb_el, 'Bars'))
            slot = first_staff[ti]
            bar_el = bars.get(bar_ids[slot]) if slot < len(bar_ids) else None
            td.bars.append(_read_bar(bar_el, voices, beats, rhythms, notes, len(tuning)) if tuning else [])
        score.tracks.append(td)
    return score


def _read_bar(bar_el, voices, beats, rhythms, notes, n_strings) -> list[BeatEv]:
    out: list[BeatEv] = []
    if bar_el is None:
        return out
    for vid in _ids(_text(bar_el, 'Voices')):
        voice = voices.get(vid)
        if voice is None:
            continue
        offset = Fraction(0)
        for bid in _ids(_text(voice, 'Beats')):
            beat = beats.get(bid)
            if beat is None:
                continue
            if beat.find('GraceNotes') is not None:
                continue  # grace beats steal time from neighbours; not scored onsets
            rhythm = beat.find('Rhythm')
            dur = _rhythm_quarters(rhythms.get(int(rhythm.get('ref', '-1'))) if rhythm is not None else None)
            evs: list[NoteEv] = []
            for nid in _ids(_text(beat, 'Notes')):
                note = notes.get(nid)
                if note is None:
                    continue
                s_prop, f_prop = _property(note, 'String'), _property(note, 'Fret')
                if s_prop is None or f_prop is None:
                    continue
                string, fret = int(_text(s_prop, 'String', '-1')), int(_text(f_prop, 'Fret', '0'))
                if not 0 <= string < n_strings:
                    continue
                tie = note.find('Tie')
                evs.append(NoteEv(
                    string=string,
                    fret=fret,
                    tie=tie is not None and tie.get('destination') == 'true',
                    dead=_property(note, 'Muted') is not None,
                ))
            if evs:
                out.append(BeatEv(offset=offset, dur=dur, notes=evs))
            offset += dur
    out.sort(key=lambda b: b.offset)
    return out
