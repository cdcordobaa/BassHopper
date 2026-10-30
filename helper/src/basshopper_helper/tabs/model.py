"""Format-neutral score model shared by the GP3-5 and GPIF (GP6/7/8) readers.

Positions and durations are Fractions of a quarter note so dotted notes and tuplets stay exact.
"""

from dataclasses import dataclass, field
from fractions import Fraction


@dataclass
class NoteEv:
    string: int  # 0 = lowest string of the track's own tuning
    fret: int
    tie: bool = False  # continuation of the previous note on this string, not a new onset
    dead: bool = False


@dataclass
class BeatEv:
    offset: Fraction  # from the start of the bar, in quarter notes
    dur: Fraction
    notes: list[NoteEv] = field(default_factory=list)


@dataclass
class MasterBar:
    num: int = 4
    den: int = 4
    repeat_open: bool = False
    repeat_close: int = 0  # how many times to jump back; 0 = no repeat sign
    alternatives: int = 0  # bitmask of the passes this bar is played on (bit 0 = 1st pass)
    marker: str | None = None
    tempos: list[tuple[Fraction, float]] = field(default_factory=list)  # (offset in bar, quarter bpm)

    @property
    def length(self) -> Fraction:
        return Fraction(4 * self.num, self.den)


@dataclass
class TrackData:
    name: str
    tuning: list[int]  # MIDI pitches, lowest string first; empty for drum tracks
    instrument: int | None = None  # General MIDI program if known
    bass_hint: bool = False  # the file itself says this is a bass instrument
    bars: list[list[BeatEv]] = field(default_factory=list)  # one list per master bar


@dataclass
class Score:
    title: str = ''
    artist: str = ''
    tempo: float = 120.0
    master_bars: list[MasterBar] = field(default_factory=list)
    tracks: list[TrackData] = field(default_factory=list)
