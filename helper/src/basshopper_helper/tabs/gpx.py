"""GP6 .gpx container: a BCFZ-compressed (or plain BCFS) sector filesystem holding score.gpif.

Format as implemented by alphaTab / TuxGuitar: BCFZ is an LZ77 variant over an MSB-first bitstream;
BCFS is a list of 0x1000-byte sectors where file entries (type 2) list the sectors holding their data.
"""

import struct

SECTOR = 0x1000


class GpxError(ValueError):
    pass


class _Bits:
    def __init__(self, data: bytes, pos: int = 0):
        self.data = data
        self.pos = pos  # byte position
        self.bit = 8  # bits already consumed in current byte; 8 = need a new byte
        self.cur = 0

    def read_bit(self) -> int:
        if self.bit == 8:
            if self.pos >= len(self.data):
                raise EOFError
            self.cur = self.data[self.pos]
            self.pos += 1
            self.bit = 0
        value = (self.cur >> (7 - self.bit)) & 1
        self.bit += 1
        return value

    def read_bits(self, n: int) -> int:  # most significant bit first
        v = 0
        for _ in range(n):
            v = (v << 1) | self.read_bit()
        return v

    def read_bits_reversed(self, n: int) -> int:  # least significant bit first
        v = 0
        for i in range(n):
            v |= self.read_bit() << i
        return v


def decompress_bcfz(data: bytes) -> bytes:
    """`data` starts right after the 'BCFZ' magic."""
    if len(data) < 4:
        raise GpxError('truncated BCFZ header')
    expected = struct.unpack_from('<i', data, 0)[0]
    if expected <= 0 or expected > 512 * 1024 * 1024:
        raise GpxError('implausible BCFZ size')
    src = _Bits(data, 4)
    out = bytearray()
    try:
        while len(out) < expected:
            if src.read_bits(1):
                word = src.read_bits(4)
                offset = src.read_bits_reversed(word)
                size = src.read_bits_reversed(word)
                start = len(out) - offset
                if offset <= 0 or start < 0:
                    raise GpxError('corrupt BCFZ back-reference')
                out += out[start:start + min(offset, size)]
            else:
                size = src.read_bits_reversed(2)
                for _ in range(size):
                    out.append(src.read_bits(8))
    except EOFError:
        pass  # alphaTab also tolerates a stream that ends a few bytes early
    return bytes(out)


def read_bcfs(data: bytes) -> dict[str, bytes]:
    """`data` starts right after the 'BCFS' magic."""
    files: dict[str, bytes] = {}
    offset = SECTOR
    while offset + 4 <= len(data):
        if struct.unpack_from('<i', data, offset)[0] == 2:
            raw_name = data[offset + 4:offset + 4 + 127]
            name = raw_name.split(b'\0', 1)[0].decode('utf-8', 'replace')
            size = struct.unpack_from('<i', data, offset + 0x8C)[0]
            ptr = offset + 0x94
            chunks = bytearray()
            while ptr + 4 <= len(data):
                sector = struct.unpack_from('<i', data, ptr)[0]
                if sector == 0:
                    break
                offset = sector * SECTOR
                chunks += data[offset:offset + SECTOR]
                ptr += 4
            files[name] = bytes(chunks[:max(size, 0)])
        offset += SECTOR
    return files


def gpx_files(blob: bytes) -> dict[str, bytes]:
    magic = blob[:4]
    if magic == b'BCFZ':
        inner = decompress_bcfz(blob[4:])
        if inner[:4] != b'BCFS':
            raise GpxError('BCFZ payload is not a BCFS filesystem')
        return read_bcfs(inner[4:])
    if magic == b'BCFS':
        return read_bcfs(blob[4:])
    raise GpxError('not a GP6 container')


def gpx_score_xml(blob: bytes) -> bytes:
    files = gpx_files(blob)
    for name, content in files.items():
        if name.lower().endswith('score.gpif'):
            return content
    raise GpxError('no score.gpif inside the .gpx file')
