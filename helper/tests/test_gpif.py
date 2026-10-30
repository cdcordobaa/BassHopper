import io
import struct
import zipfile

import pytest

from basshopper_helper.tabs import UnsupportedTabError, build_chart, list_tracks, load_score, pick_track
from basshopper_helper.tabs.gpx import SECTOR, decompress_bcfz

# Two tracks (guitar, bass), three master bars: bar 0 "Intro", bar 1 repeated once, tempo 100 -> 90
# halfway through bar 2. Bass notes cover a tie, a dotted quarter, a triplet, a dead note and a rest.
GPIF = b"""<?xml version="1.0" encoding="utf-8"?>
<GPIF>
  <Score><Title><![CDATA[Gpif Song]]></Title><Artist><![CDATA[Band]]></Artist></Score>
  <MasterTrack>
    <Automations>
      <Automation><Type>Tempo</Type><Linear>false</Linear><Bar>0</Bar><Position>0</Position><Value>100 2</Value></Automation>
      <Automation><Type>Tempo</Type><Linear>false</Linear><Bar>2</Bar><Position>0.5</Position><Value>180 1</Value></Automation>
    </Automations>
  </MasterTrack>
  <Tracks>
    <Track id="0"><Name><![CDATA[Guitar]]></Name>
      <Properties><Property name="Tuning"><Pitches>40 45 50 55 59 64</Pitches></Property></Properties>
    </Track>
    <Track id="1"><Name><![CDATA[Fingers]]></Name>
      <InstrumentSet><Name>Electric Bass</Name><Type>electricBass</Type></InstrumentSet>
      <Staves><Staff><Properties><Property name="Tuning"><Pitches>28 33 38 43</Pitches></Property></Properties></Staff></Staves>
    </Track>
  </Tracks>
  <MasterBars>
    <MasterBar><Time>4/4</Time><Bars>0 1</Bars><Section><Letter>A</Letter><Text>Intro</Text></Section></MasterBar>
    <MasterBar><Time>4/4</Time><Repeat start="true" end="true" count="2"/><Bars>0 2</Bars></MasterBar>
    <MasterBar><Time>4/4</Time><Bars>0 3</Bars></MasterBar>
  </MasterBars>
  <Bars>
    <Bar id="0"><Voices>-1 -1 -1 -1</Voices></Bar>
    <Bar id="1"><Voices>0 -1 -1 -1</Voices></Bar>
    <Bar id="2"><Voices>1 -1 -1 -1</Voices></Bar>
    <Bar id="3"><Voices>2 -1 -1 -1</Voices></Bar>
  </Bars>
  <Voices>
    <Voice id="0"><Beats>0 1 2</Beats></Voice>
    <Voice id="1"><Beats>3 4 5 6 7</Beats></Voice>
    <Voice id="2"><Beats>8</Beats></Voice>
  </Voices>
  <Beats>
    <Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>
    <Beat id="1"><Rhythm ref="0"/><Notes>1</Notes></Beat>
    <Beat id="2"><Rhythm ref="1"/></Beat>
    <Beat id="3"><Rhythm ref="2"/><Notes>2</Notes></Beat>
    <Beat id="4"><Rhythm ref="3"/><Notes>3</Notes></Beat>
    <Beat id="5"><Rhythm ref="4"/><Notes>4</Notes></Beat>
    <Beat id="6"><Rhythm ref="4"/><Notes>5</Notes></Beat>
    <Beat id="7"><Rhythm ref="4"/><Notes>6</Notes></Beat>
    <Beat id="8"><Rhythm ref="1"/><Notes>7</Notes></Beat>
  </Beats>
  <Notes>
    <Note id="0"><Tie origin="true" destination="false"/><Properties>
      <Property name="String"><String>0</String></Property><Property name="Fret"><Fret>5</Fret></Property></Properties></Note>
    <Note id="1"><Tie origin="false" destination="true"/><Properties>
      <Property name="String"><String>0</String></Property><Property name="Fret"><Fret>5</Fret></Property></Properties></Note>
    <Note id="2"><Properties>
      <Property name="String"><String>1</String></Property><Property name="Fret"><Fret>2</Fret></Property></Properties></Note>
    <Note id="3"><Properties>
      <Property name="String"><String>1</String></Property><Property name="Fret"><Fret>3</Fret></Property>
      <Property name="Muted"><Enable/></Property></Properties></Note>
    <Note id="4"><Properties>
      <Property name="String"><String>2</String></Property><Property name="Fret"><Fret>0</Fret></Property></Properties></Note>
    <Note id="5"><Properties>
      <Property name="String"><String>2</String></Property><Property name="Fret"><Fret>2</Fret></Property></Properties></Note>
    <Note id="6"><Properties>
      <Property name="String"><String>3</String></Property><Property name="Fret"><Fret>4</Fret></Property></Properties></Note>
    <Note id="7"><Properties>
      <Property name="String"><String>3</String></Property><Property name="Fret"><Fret>7</Fret></Property></Properties></Note>
  </Notes>
  <Rhythms>
    <Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm>
    <Rhythm id="1"><NoteValue>Half</NoteValue></Rhythm>
    <Rhythm id="2"><NoteValue>Quarter</NoteValue><AugmentationDot count="1"/></Rhythm>
    <Rhythm id="3"><NoteValue>Eighth</NoteValue></Rhythm>
    <Rhythm id="4"><NoteValue>Eighth</NoteValue><PrimaryTuplet num="3" den="2"/></Rhythm>
  </Rhythms>
</GPIF>
"""

EXPECTED_NOTES = [
    (0, 2, 0, 5),  # tie: one onset, two beats long
    (4, 1.5, 1, 2), (6, 0.333333, 2, 0), (6.333333, 0.333333, 2, 2), (6.666667, 0.333333, 3, 4),
    (8, 1.5, 1, 2), (10, 0.333333, 2, 0), (10.333333, 0.333333, 2, 2), (10.666667, 0.333333, 3, 4),
    (12, 2, 3, 7),
]


def make_gp(xml: bytes = GPIF) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr('VERSION', '7.0')
        z.writestr('Content/score.gpif', xml)
    return buf.getvalue()


def check_chart(data: bytes, filename: str) -> None:
    score = load_score(data, filename)
    assert list_tracks(score) == [
        {'index': 0, 'name': 'Guitar', 'strings': 6, 'isBass': False},
        {'index': 1, 'name': 'Fingers', 'strings': 4, 'isBass': True},
    ]
    assert score.title == 'Gpif Song' and score.artist == 'Band'
    c = build_chart(score, pick_track(score, None))
    assert [(n['t'], n['dur'], n['string'], n['fret']) for n in c['notes']] == EXPECTED_NOTES
    assert c['lengthBeats'] == 16
    assert c['tempoMap'] == [{'beat': 0, 'bpm': 100}, {'beat': 14, 'bpm': 90}]
    assert c['bpm'] == 100
    assert c['sections'] == [{'beat': 0, 'name': 'Intro'}]


def test_gp7_zip():
    check_chart(make_gp(), 'song.gp')


# --- GP6 .gpx: build a BCFS filesystem and BCFZ-compress it with a tiny reference encoder ---

class BitWriter:
    def __init__(self):
        self.bits: list[int] = []

    def write(self, value: int, n: int) -> None:  # MSB first
        self.bits += [(value >> (n - 1 - i)) & 1 for i in range(n)]

    def write_reversed(self, value: int, n: int) -> None:  # LSB first
        self.bits += [(value >> i) & 1 for i in range(n)]

    def data(self) -> bytes:
        bits = self.bits + [0] * (-len(self.bits) % 8)
        return bytes(int(''.join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8))


def bcfz(raw: bytes) -> bytes:
    """Greedy encoder: back-reference to the previous 64 bytes when a 4+ byte match exists."""
    w, i = BitWriter(), 0
    while i < len(raw):
        best_len, best_off = 0, 0
        for off in range(1, min(i, 63) + 1):
            n = 0
            while n < 63 and n < off and i + n < len(raw) and raw[i - off + n] == raw[i + n]:
                n += 1
            if n > best_len:
                best_len, best_off = n, off
        if best_len >= 4:
            w.write(1, 1)
            w.write(6, 4)
            w.write_reversed(best_off, 6)
            w.write_reversed(best_len, 6)
            i += best_len
        else:
            chunk = raw[i:i + 3]
            w.write(0, 1)
            w.write_reversed(len(chunk), 2)
            for b in chunk:
                w.write(b, 8)
            i += len(chunk)
    return b'BCFZ' + struct.pack('<i', len(raw)) + w.data()


def bcfs(files: dict[str, bytes]) -> bytes:
    sectors = [bytes(SECTOR)]  # sector 0: header, ignored
    for name, content in files.items():
        n_data = -(-len(content) // SECTOR)
        first = len(sectors) + 1
        entry = bytearray(SECTOR)
        struct.pack_into('<i', entry, 0, 2)
        entry[4:4 + len(name)] = name.encode()
        struct.pack_into('<i', entry, 0x8C, len(content))
        for k in range(n_data):
            struct.pack_into('<i', entry, 0x94 + 4 * k, first + k)
        sectors.append(bytes(entry))
        for k in range(n_data):
            sectors.append(content[k * SECTOR:(k + 1) * SECTOR].ljust(SECTOR, b'\0'))
    return b'BCFS' + b''.join(sectors)


def test_bcfz_backreference_roundtrip():
    raw = b'abcabcabcabc-hello-hello-hello' * 5
    assert decompress_bcfz(bcfz(raw)[4:]) == raw


def test_gpx_container():
    fs = bcfs({'misc.xml': b'<x/>' * 300, 'score.gpif': GPIF})
    check_chart(bcfz(fs), 'song.gpx')
    check_chart(fs, 'song.gpx')  # uncompressed BCFS variant


def test_garbage_gpx_is_415_with_export_hint():
    with pytest.raises(UnsupportedTabError, match=r'export as \.gp5 or \.gp'):
        load_score(b'BCFZ\x10\x00\x00\x00garbage', 'song.gpx')
    with pytest.raises(UnsupportedTabError, match='export as'):
        load_score(b'not a tab at all', 'song.gpx')
    with pytest.raises(UnsupportedTabError):
        load_score(b'PK\x03\x04broken', 'song.gp')


def test_multi_staff_track_before_bass_uses_staff_slots():
    # MasterBar/Bars has one id per staff: a 2-staff piano shifts the bass to slot 3, not 2.
    piano = (b'<Track id="1"><Name><![CDATA[Keys]]></Name><Staves>'
             b'<Staff><Properties><Property name="Tuning"><Pitches>40 45 50 55 59 64</Pitches></Property>'
             b'</Properties></Staff><Staff/></Staves></Track>\n    <Track id="2"><Name><![CDATA[Fingers]]>')
    xml = GPIF.replace(b'<Track id="1"><Name><![CDATA[Fingers]]>', piano)
    for bass_bar in (b'1', b'2', b'3'):
        xml = xml.replace(b'<Bars>0 ' + bass_bar + b'</Bars>', b'<Bars>0 0 0 ' + bass_bar + b'</Bars>')
    score = load_score(make_gp(xml), 'song.gp')
    assert [t['name'] for t in list_tracks(score)] == ['Guitar', 'Keys', 'Fingers']
    c = build_chart(score, 2)
    assert [(n['t'], n['dur'], n['string'], n['fret']) for n in c['notes']] == EXPECTED_NOTES
    assert build_chart(score, 1)['notes'] == []
