#!/usr/bin/env python3
"""
MusicXML (.musicxml / .xml / sıkıştırılmış .mxl) → ABC dönüştürücü.

Çalma odaklıdır: her parti, aynı anda başlayan notaları akor olarak birleştiren
tek bir "vuruş akışına" indirgenir (ksilofon çubukları zaten kendiliğinden
söndüğü için tutulan iç sesler önemsizdir). Nota yazımı (diyez/bemol seçimi)
MusicXML'den aynen alınır; değiştiriciler tonaliteye ve ölçü içi kurala göre
yazılır.

Kullanım:
  python3 scripts/mxl2abc.py eser.mxl                  # tüm partiler
  python3 scripts/mxl2abc.py eser.mxl --measures 1-16  # ölçü aralığı
  python3 scripts/mxl2abc.py eser.mxl --parts 1,2      # parti seçimi (1'den)

Yalnızca XML okur; dosyanın içindeki hiçbir şeyi çalıştırmaz.
"""
from __future__ import annotations

import argparse
import sys
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from fractions import Fraction as F

SHARP_ORDER = 'FCGDAEB'
STEPS = 'CDEFGAB'


@dataclass
class Note:
    onset: F
    dur: F
    step: str
    alter: int
    octave: int
    tie_start: bool = False
    tie_stop: bool = False
    grace: bool = False
    staff: int = 1

    @property
    def midi(self) -> int:
        return 12 * (self.octave + 1) + [0, 2, 4, 5, 7, 9, 11][STEPS.index(self.step)] + self.alter


@dataclass
class Part:
    name: str
    notes: list[Note] = field(default_factory=list)
    measures: list[tuple[F, F, int]] = field(default_factory=list)  # (başlangıç, uzunluk, numara)
    # Ölçü başına tekrar işaretleri: (önce, sonra), ör. ('|:', ':|') ya da ('[1', '')
    marks: list[tuple[str, str]] = field(default_factory=list)
    fifths: int = 0
    mode: str = 'major'
    beats: int = 4
    beat_type: int = 4
    tempo: float | None = None


def load_root(path: str) -> ET.Element:
    if path.endswith('.mxl'):
        with zipfile.ZipFile(path) as z:
            container = ET.fromstring(z.read('META-INF/container.xml'))
            rootfile = container.find('.//{*}rootfile').get('full-path')
            return ET.fromstring(z.read(rootfile))
    return ET.parse(path).getroot()


def strip_ns(root: ET.Element) -> None:
    for el in root.iter():
        if '}' in el.tag:
            el.tag = el.tag.split('}', 1)[1]


def parse(path: str) -> tuple[str, str, list[Part]]:
    root = load_root(path)
    strip_ns(root)
    title = (root.findtext('work/work-title') or root.findtext('movement-title') or '').strip()
    composer = ''
    for c in root.findall('identification/creator'):
        if c.get('type') == 'composer':
            composer = (c.text or '').strip()
    names = {sp.get('id'): (sp.findtext('part-name') or sp.get('id')).strip() for sp in root.findall('part-list/score-part')}

    parts: list[Part] = []
    for p in root.findall('part'):
        part = Part(names.get(p.get('id'), p.get('id')))
        divisions = 1
        cursor = F(0)
        for m in p.findall('measure'):
            start = cursor
            reach = cursor
            last_onset = cursor
            before, after = '', ''
            for bl in m.findall('barline'):
                rep = bl.find('repeat')
                end = bl.find('ending')
                if bl.get('location') == 'left':
                    if rep is not None and rep.get('direction') == 'forward':
                        before = '|:'
                    if end is not None and end.get('type') == 'start':
                        before += '[' + end.get('number', '1').split(',')[0].strip()
                elif rep is not None and rep.get('direction') == 'backward':
                    after = ':|'
            part.marks.append((before, after))
            for el in m:
                if el.tag == 'attributes':
                    if el.findtext('divisions'):
                        divisions = int(el.findtext('divisions'))
                    if el.find('key/fifths') is not None and not part.notes:
                        part.fifths = int(el.findtext('key/fifths'))
                        part.mode = el.findtext('key/mode') or 'major'
                    if el.find('time/beats') is not None and not part.notes:
                        part.beats = int(el.findtext('time/beats').split('+')[0])
                        part.beat_type = int(el.findtext('time/beat-type'))
                elif el.tag == 'direction':
                    snd = el.find('sound')
                    if snd is not None and snd.get('tempo') and part.tempo is None:
                        part.tempo = float(snd.get('tempo'))
                    pm = el.find('.//metronome/per-minute')
                    if pm is not None and part.tempo is None:
                        try:
                            part.tempo = float(pm.text)
                        except (TypeError, ValueError):
                            pass
                elif el.tag == 'sound' and el.get('tempo') and part.tempo is None:
                    part.tempo = float(el.get('tempo'))
                elif el.tag == 'backup':
                    cursor -= F(int(el.findtext('duration')), divisions)
                elif el.tag == 'forward':
                    cursor += F(int(el.findtext('duration')), divisions)
                    reach = max(reach, cursor)
                elif el.tag == 'note':
                    grace = el.find('grace') is not None
                    chord = el.find('chord') is not None
                    dur = F(0) if grace else F(int(el.findtext('duration') or 0), divisions)
                    onset = last_onset if chord else cursor
                    pitch = el.find('pitch')
                    if pitch is not None:
                        ties = [t.get('type') for t in el.findall('tie')]
                        part.notes.append(
                            Note(
                                onset,
                                dur,
                                pitch.findtext('step'),
                                int(round(float(pitch.findtext('alter') or 0))),
                                int(pitch.findtext('octave')),
                                'start' in ties,
                                'stop' in ties,
                                grace,
                                int(el.findtext('staff') or 1),
                            )
                        )
                    if not chord and not grace:
                        last_onset = cursor
                        cursor += dur
                        reach = max(reach, cursor)
            cursor = reach
            number = int(''.join(ch for ch in (m.get('number') or '0') if ch.isdigit()) or 0)
            part.measures.append((start, reach - start, number))
        parts.append(part)
    return title, composer, parts


def merge_ties(notes: list[Note]) -> list[Note]:
    out: list[Note] = []
    open_: dict[int, Note] = {}
    for n in sorted(notes, key=lambda n: (n.onset, n.grace is False)):
        if n.grace:
            out.append(n)
            continue
        prev = open_.get(n.midi)
        if n.tie_stop and prev is not None and prev.onset + prev.dur == n.onset:
            prev.dur += n.dur
            if not n.tie_start:
                del open_[n.midi]
            continue
        out.append(n)
        if n.tie_start:
            open_[n.midi] = n
    return out


def key_accidentals(fifths: int) -> dict[str, int]:
    acc = {s: 0 for s in STEPS}
    for i in range(abs(fifths)):
        if fifths > 0:
            acc[SHARP_ORDER[i]] = 1
        else:
            acc[SHARP_ORDER[6 - i]] = -1
    return acc


def key_name(fifths: int, mode: str) -> str:
    majors = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
    minors = ['Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m']
    return (minors if mode == 'minor' else majors)[fifths + 7]


def length_str(units: F) -> str:
    if units == 1:
        return ''
    if units.denominator == 1:
        return str(units.numerator)
    if units.numerator == 1 and units.denominator == 2:
        return '/'
    return f'{units.numerator}/{units.denominator}'


class Speller:
    def __init__(self, fifths: int):
        self.key = key_accidentals(fifths)
        self.bar: dict[tuple[str, int], int] = {}

    def new_bar(self) -> None:
        self.bar.clear()

    def name(self, n: Note) -> str:
        current = self.bar.get((n.step, n.octave), self.key[n.step])
        acc = ''
        if n.alter != current:
            acc = {2: '^^', 1: '^', 0: '=', -1: '_', -2: '__'}[n.alter]
            self.bar[(n.step, n.octave)] = n.alter
        if n.octave >= 5:
            letter = n.step.lower() + "'" * (n.octave - 5)
        else:
            letter = n.step + ',' * (4 - n.octave)
        return acc + letter


def voice_abc(part: Part, fifths: int, measures: list[tuple[F, F, int]], unit: F, staff: int | None = None) -> list[str]:
    notes = merge_ties([n for n in part.notes if staff is None or n.staff == staff])
    graces: dict[F, list[Note]] = {}
    hits: dict[F, list[Note]] = {}
    for n in notes:
        (graces if n.grace else hits).setdefault(n.onset, []).append(n)
    onsets = sorted(hits)
    end = measures[-1][0] + measures[-1][1]
    speller = Speller(fifths)
    bars: list[str] = []

    # Her vuruşun süresi: bir sonraki vuruşa (ya da en uzun notanın sonuna) kadar.
    events: list[tuple[F, F, list[Note] | None]] = []
    t = measures[0][0]
    for i, on in enumerate(onsets):
        if on < measures[0][0] or on >= end:
            continue
        if on > t:
            events.append((t, on - t, None))
        nxt = onsets[i + 1] if i + 1 < len(onsets) else end
        longest = max(n.dur for n in hits[on])
        d = min(nxt, end) - on
        if longest < d:
            events.append((on, longest, hits[on]))
            events.append((on + longest, d - longest, None))
        else:
            events.append((on, d, hits[on]))
        t = on + d
    if t < end:
        events.append((t, end - t, None))

    ei = 0
    carry: tuple[F, list[Note] | None] | None = None
    for start, length, _ in measures:
        speller.new_bar()
        stop = start + length
        tokens: list[str] = []
        pending = []
        if carry:
            pending.append((start, carry[0], carry[1], True))
            carry = None
        while ei < len(events) and events[ei][0] < stop:
            pending.append((events[ei][0], events[ei][1], events[ei][2], False))
            ei += 1
        for on, dur, chord, continued in pending:
            seg = min(dur, stop - on)
            rest = dur - seg
            units = seg / unit
            if chord is None:
                tok = 'z' + length_str(units)
            else:
                names = [speller.name(n) for n in sorted(chord, key=lambda n: n.midi)]
                g = graces.get(on)
                prefix = '{' + ''.join(speller.name(x) for x in g) + '}' if g and not continued else ''
                body = names[0] if len(names) == 1 else '[' + ''.join(names) + ']'
                tok = prefix + body + length_str(units)
                if rest > 0:
                    tok += '-'
            tokens.append(tok)
            if rest > 0:
                carry = (rest, chord)
        bars.append(' '.join(tokens) if tokens else 'z' + length_str(length / unit))
    return bars


def convert(path: str, measures_range: str | None = None, parts_sel: str | None = None, unit_str: str = '1/16') -> dict:
    """Dönüştürür; başlık bilgilerini ve ses (parti) gövdelerini döndürür."""
    title, composer, parts = parse(path)
    if parts_sel:
        parts = [parts[int(i) - 1] for i in parts_sel.split(',')]
    ref = parts[0]
    measures = ref.measures
    if measures_range:
        a, b = (int(x) for x in measures_range.split('-'))
        measures = measures[a - 1 : b]
    unit = F(unit_str) * 4  # dörtlük cinsinden
    # Birden çok porteli partiler (piyano) porte başına ayrı ses olur.
    voices: list[tuple[str, Part, int | None]] = []
    for p in parts:
        staves = sorted({n.staff for n in p.notes})
        if len(staves) > 1:
            voices += [(f'{p.name} {s}', p, s) for s in staves]
        else:
            voices.append((p.name, p, None))
    first = ref.measures.index(measures[0])
    marks = ref.marks[first : first + len(measures)]
    bodies = []
    for name, p, staff in voices:
        bars = voice_abc(p, ref.fifths, measures, unit, staff)
        text = ''
        for j, (bar, (before, after)) in enumerate(zip(bars, marks)):
            if before.startswith('|:'):
                text += ' |:' if text else '|:'
                before = before[2:]
            elif text and not text.endswith(':|'):
                text += ' |'
            if before:
                text += before
            text += ' ' + bar
            if after:
                text += ' :|'
            if (j + 1) % 4 == 0:
                text += '\n'
        if not text.rstrip().endswith(':|'):
            text = text.rstrip() + ' |]'
        bodies.append((name, text.replace('\n |', ' |\n').strip()))
    return {
        'title': title,
        'composer': composer,
        'meter': f'{ref.beats}/{ref.beat_type}',
        'unit': unit_str,
        'tempo': ref.tempo,
        'key': key_name(ref.fifths, ref.mode),
        'voices': bodies,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('path')
    ap.add_argument('--measures', help='ölçü aralığı, ör. 1-16 (sıra numarası, 1\'den)')
    ap.add_argument('--parts', help='parti numaraları, ör. 1,2')
    ap.add_argument('--unit', default='1/16', help='L: birimi (varsayılan 1/16)')
    args = ap.parse_args()
    r = convert(args.path, args.measures, args.parts, args.unit)
    print('X:1')
    print(f'T:{r["title"] or "İsimsiz"}')
    if r['composer']:
        print(f'C:{r["composer"]}')
    print(f'M:{r["meter"]}')
    print(f'L:{r["unit"]}')
    if r['tempo']:
        print(f'Q:1/4={round(r["tempo"])}')
    print(f'K:{r["key"]}')
    for i, (name, _) in enumerate(r['voices'], 1):
        print(f'V:{i} name="{name}"')
    for i, (_, body) in enumerate(r['voices'], 1):
        print(f'[V:{i}] {body}')


if __name__ == '__main__':
    sys.exit(main())
