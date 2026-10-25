#!/usr/bin/env python3
"""
LilyPond nota parçası → ABC (çalma odaklı, sınırlı alt küme).

Mutopia gibi kamu malı kaynaklardaki LilyPond metnini *çalıştırmadan*, düz
metin olarak okur. LilyPond dosyaları Scheme kodu içerebildiği için derleyici
yerine bu okuyucu kullanılır. Desteklenenler:

  - nota adları (nederlands: c d e f g a b, cis es ...; deutsch: h = si, b = si bemol)
  - \\relative <perde> { ... } ve mutlak kip, oktav işaretleri ' ,
  - süreler (4 8. 16 2.. 4*1/2), suslar (r s R), bağlar (~), akorlar <c e g>
  - \\times 2/3 { } / \\tuplet 3/2 { }, \\grace / \\acciaccatura / \\appoggiatura
  - \\repeat unfold n { }, \\repeat volta n { } \\alternative { {..} {..} }
  - << { a } \\\\ { b } >> çok sesliliğinde yalnızca ilk ses alınır

Diğer komutlar (\\clef, \\key, dinamikler, artikülasyonlar, \\markup ...) yok sayılır.
Çıktı yalnızca nota gövdesidir; başlık ve ölçü çizgileri `--meter` ve
`--partial` ile üretilir.

Kullanım:
  python3 scripts/ly2abc.py parca.ly --relative "c'" --meter 2/4 --key Am
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from fractions import Fraction as F

STEPS = 'cdefgab'
SEMI = [0, 2, 4, 5, 7, 9, 11]
SHARP_ORDER = 'FCGDAEB'
KEY_FIFTHS = {
    'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
    'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7,
}
MODE_SHIFT = {'': 0, 'm': -3, 'mix': -1, 'dor': -2}


@dataclass
class Pitch:
    step: int  # 0..6 (c..b)
    alter: int
    octave: int  # LilyPond: c = 0 (C3), c' = 1 (C4)

    def abs_step(self) -> int:
        return self.octave * 7 + self.step

    def sci_octave(self) -> int:
        return self.octave + 3


@dataclass
class Event:
    kind: str  # 'note' | 'rest' | 'bar' (yapı işareti)
    dur: F = F(0)
    pitches: list[Pitch] = field(default_factory=list)
    tie: bool = False
    grace: list[Pitch] = field(default_factory=list)
    mark: str = ''  # '|:' ':|' '[1' '[2' '||'


class Reader:
    def __init__(self, text: str, names: str, relative: Pitch | None):
        self.text = re.sub(r'%\{.*?%\}', ' ', text, flags=re.S)
        self.text = re.sub(r'%[^\n]*', ' ', self.text)
        self.names = names
        self.toks = self.tokenize(self.text)
        self.i = 0
        self.prev: Pitch | None = relative
        self.relative = relative is not None
        self.dur = F(1)  # dörtlük cinsinden
        self.scale = F(1)

    @staticmethod
    def tokenize(s: str) -> list[str]:
        pat = r'''"(?:[^"\\]|\\.)*"|\\[a-zA-Z]+|<<|>>|\\\\|[{}<>~|\[\]()]|[-^_][.>^\-_!+|]|[-^_]\d|[a-zA-Z]+[',]*[!?]?|\d+\.*(?:\*\d+(?:/\d+)?)?|=[',]*|\S'''
        return re.findall(pat, s)

    # --- perdeler -----------------------------------------------------------
    def parse_name(self, tok: str) -> tuple[int, int] | None:
        m = re.fullmatch(r'([a-zA-Z]+)', tok)
        if not m:
            return None
        w = tok
        if self.names == 'deutsch':
            table = {'h': (6, 0), 'b': (6, -1), 'his': (6, 1), 'heses': (6, -2), 'hes': (6, -1)}
            if w in table:
                return table[w]
        base = w[0]
        if base not in STEPS:
            return None
        rest = w[1:]
        alter = 0
        if self.names == 'english':
            table = {'': 0, 's': 1, 'ss': 2, 'x': 2, 'f': -1, 'ff': -2, 'sharp': 1, 'flat': -1}
            if rest in table:
                return STEPS.index(base), table[rest]
            return None
        while rest:
            if rest.startswith('is'):
                alter += 1
                rest = rest[2:]
            elif rest.startswith('es'):
                alter -= 1
                rest = rest[2:]
            elif rest.startswith('s') and base in 'ae':
                alter -= 1
                rest = rest[1:]
            else:
                return None
        return STEPS.index(base), alter

    def resolve(self, step: int, alter: int, marks: str) -> Pitch:
        up = marks.count("'") - marks.count(',')
        if not self.relative:
            return Pitch(step, alter, up)
        prev = self.prev or Pitch(0, 0, 1)
        # prev'e en yakın (en fazla dörtlü) aynı harfli nota
        best = None
        for octv in range(prev.octave - 2, prev.octave + 3):
            cand = Pitch(step, alter, octv)
            d = abs(cand.abs_step() - prev.abs_step())
            if d <= 3 and (best is None or d < abs(best.abs_step() - prev.abs_step())):
                best = cand
        assert best is not None
        best.octave += up
        return best

    # --- okuma --------------------------------------------------------------
    def peek(self) -> str | None:
        return self.toks[self.i] if self.i < len(self.toks) else None

    def take(self) -> str:
        t = self.toks[self.i]
        self.i += 1
        return t

    def duration(self) -> None:
        t = self.peek()
        if t and re.fullmatch(r'\d+\.*(?:\*\d+(?:/\d+)?)?', t):
            self.take()
            m = re.fullmatch(r'(\d+)(\.*)(?:\*(\d+)(?:/(\d+))?)?', t)
            base = F(4, int(m.group(1)))
            d = base
            add = base
            for _ in m.group(2):
                add /= 2
                d += add
            if m.group(3):
                d *= F(int(m.group(3)), int(m.group(4) or 1))
            self.dur = d

    def skip_postfix(self) -> bool:
        """Artikülasyon, parmak numarası, dinamik vb. atlar; bağ (~) varsa True."""
        tie = False
        while True:
            t = self.peek()
            if t is None:
                return tie
            if t == '~':
                tie = True
                self.take()
            elif re.fullmatch(r'[-^_][.>^\-_!+|]|[-^_]\d|[()\[\]]', t):
                self.take()
            elif t in ('-', '^', '_'):
                self.take()
                nxt = self.peek()
                if nxt and (nxt.startswith('\\') or nxt.startswith('"')):
                    self.take()
                    if nxt in ('\\markup',):
                        self.skip_block()
            elif t.startswith('\\') and t[1:] in DYN_ARTIC:
                self.take()
            else:
                return tie

    def skip_scheme(self) -> None:
        """#t, ##f, #'(a . b), #"...", #(fonksiyon ...) gibi bir Scheme değerini atlar."""
        while self.peek() in ('#', "'"):
            self.take()
        t = self.peek()
        if t == '(':
            depth = 0
            while self.peek() is not None:
                tok = self.take()
                if tok == '(':
                    depth += 1
                elif tok == ')':
                    depth -= 1
                    if depth == 0:
                        return
        elif t is not None:
            self.take()

    def skip_block(self) -> None:
        if self.peek() == '{':
            depth = 0
            while self.peek() is not None:
                t = self.take()
                if t == '{':
                    depth += 1
                elif t == '}':
                    depth -= 1
                    if depth == 0:
                        return

    def music(self, out: list[Event], stop: str | None = None) -> None:
        while self.peek() is not None:
            t = self.peek()
            if t == stop:
                self.take()
                return
            if t == '{':
                self.take()
                self.music(out, '}')
                continue
            if t == '}':
                self.take()
                return
            if t == '<<':
                self.take()
                self.polyphony(out)
                continue
            if t == '<':
                self.take()
                self.chord(out)
                continue
            if t == '|' or t in ('~',) or re.fullmatch(r'[()\[\]]', t):
                self.take()
                continue
            if t.startswith('"'):
                self.take()
                continue
            if t.startswith('\\'):
                self.command(out)
                continue
            if t in ('r', 's', 'R'):
                self.take()
                self.duration()
                self.skip_postfix()
                out.append(Event('rest', self.dur * self.scale))
                continue
            core = t.rstrip('!?')
            nm = self.parse_name(re.sub(r"[',]+$", '', core))
            if nm:
                self.take()
                marks = re.search(r"[',]*$", core).group(0)
                if self.peek() and self.peek().startswith('='):
                    self.take()  # oktav denetimi: yok say
                p = self.resolve(nm[0], nm[1], marks)
                self.prev = p
                self.duration()
                tie = self.skip_postfix()
                out.append(Event('note', self.dur * self.scale, [p], tie))
                continue
            self.take()  # tanınmayan işaret

    def chord(self, out: list[Event]) -> None:
        pitches: list[Pitch] = []
        first: Pitch | None = None
        anchor = self.prev
        while self.peek() is not None and self.peek() != '>':
            t = self.take().rstrip('!?')
            nm = self.parse_name(re.sub(r"[',]+$", '', t))
            if nm:
                marks = re.search(r"[',]*$", t).group(0)
                p = self.resolve(nm[0], nm[1], marks)
                self.prev = p
                pitches.append(p)
                if first is None:
                    first = p
        if self.peek() == '>':
            self.take()
        self.prev = first or anchor
        self.duration()
        tie = self.skip_postfix()
        out.append(Event('note', self.dur * self.scale, pitches, tie))

    def polyphony(self, out: list[Event]) -> None:
        voices: list[list[Event]] = [[]]
        start_prev = self.prev
        prev_after_first = None
        while self.peek() is not None and self.peek() != '>>':
            t = self.peek()
            if t == '\\\\':
                self.take()
                if prev_after_first is None:
                    prev_after_first = self.prev
                self.prev = start_prev
                voices.append([])
                continue
            if t == '{':
                self.take()
                self.music(voices[-1], '}')
                continue
            self.music_one(voices[-1])
        if self.peek() == '>>':
            self.take()
        if prev_after_first is not None:
            self.prev = prev_after_first
        out.extend(voices[0])

    def music_one(self, out: list[Event]) -> None:
        t = self.peek()
        if t.startswith('\\'):
            self.command(out)
        else:
            self.take()

    def command(self, out: list[Event]) -> None:
        t = self.take()
        name = t[1:]
        if name == 'relative':
            pitch_tok = self.peek()
            nm = self.parse_name(re.sub(r"[',]+$", '', pitch_tok or ''))
            if nm and pitch_tok != '{':
                self.take()
                marks = re.search(r"[',]*$", pitch_tok).group(0)
                self.prev = Pitch(nm[0], nm[1], marks.count("'") - marks.count(','))
            self.relative = True
        elif name in ('times', 'tuplet'):
            frac = self.take()
            a, b = (int(x) for x in frac.split('/')) if '/' in frac else (int(frac), 1)
            if self.peek() and re.fullmatch(r'\d+\.*', self.peek() or ''):
                self.take()  # \tuplet 3/2 8 { }
            factor = F(a, b) if name == 'times' else F(b, a)
            old = self.scale
            self.scale = old * factor
            self.music(out, None) if self.peek() != '{' else (self.take(), self.music(out, '}'))
            self.scale = old
        elif name in ('grace', 'acciaccatura', 'appoggiatura', 'slashedGrace'):
            tmp: list[Event] = []
            saved = self.dur
            if self.peek() == '{':
                self.take()
                self.music(tmp, '}')
            else:
                self.music_one_note(tmp)
            self.dur = saved
            graces = [p for e in tmp if e.kind == 'note' for p in e.pitches[:1]]
            self.pending_grace = graces
            out.append(Event('bar', mark='grace', pitches=graces))
        elif name == 'repeat':
            kind = self.take()
            n = int(self.take())
            body: list[Event] = []
            if self.peek() == '{':
                self.take()
                self.music(body, '}')
            else:
                self.music_one_note(body)
            if kind in ('unfold', 'percent', 'tremolo'):
                for _ in range(n):
                    out.extend(body)
                return
            alts: list[list[Event]] = []
            if self.peek() == '\\alternative':
                self.take()
                self.take()  # {
                while self.peek() == '{':
                    self.take()
                    alt: list[Event] = []
                    self.music(alt, '}')
                    alts.append(alt)
                if self.peek() == '}':
                    self.take()
            out.append(Event('bar', mark='|:'))
            out.extend(body)
            if alts:
                for k, alt in enumerate(alts, 1):
                    out.append(Event('bar', mark=f'[{k}'))
                    out.extend(alt)
                    out.append(Event('bar', mark=':|' if k < len(alts) else '||'))
            else:
                out.append(Event('bar', mark=':|'))
        elif name in ARG1:
            self.take()
        elif name in ARG2:
            self.take()
            self.take()
        elif name == 'key':
            self.take()
            self.take()
        elif name == 'markup':
            self.skip_block() if self.peek() == '{' else self.take()
        elif name in ('override', 'set', 'tweak'):
            # \set Grob.prop = #değer  |  \override Grob #'prop = #değer
            while self.peek() is not None and self.peek() != '=':
                if self.peek() in ('{', '}', '|', '<'):
                    return
                self.take()
            if self.peek() == '=':
                self.take()
                self.skip_scheme()
        elif name in ('revert', 'unset'):
            while self.peek() is not None and self.peek() not in ('{', '}', '|') and not self.peek().startswith('\\'):
                tok = self.take()
                if '.' not in tok and not tok.startswith('#') and tok not in ("'", '.'):
                    if not re.fullmatch(r'[A-Z][A-Za-z]*', tok):
                        break
        elif name == 'once':
            pass
        else:
            pass  # \voiceOne, \oneVoice, \stemUp, dinamikler ...

    def music_one_note(self, out: list[Event]) -> None:
        t = self.peek()
        if t == '<':
            self.take()
            self.chord(out)
        else:
            before = len(out)
            # tek nota oku
            while self.peek() is not None and len(out) == before:
                tt = self.peek()
                if tt.startswith('\\'):
                    self.command(out)
                elif tt == '{':
                    self.take()
                    self.music(out, '}')
                else:
                    sub: list[Event] = []
                    nm = self.parse_name(re.sub(r"[',]+$", '', tt))
                    if nm or tt in ('r', 's', 'R'):
                        # music() bir sonraki elemanı tüketsin diye geçici bir sınırla çağır
                        save = self.toks
                        self.toks = self.toks[: self.i + 1 + self._postfix_len(self.i + 1)]
                        self.music(sub)
                        self.toks = save
                        out.extend(sub)
                    else:
                        self.take()

    def _postfix_len(self, j: int) -> int:
        n = 0
        while j + n < len(self.toks) and re.fullmatch(r'\d+\.*(?:\*\d+(?:/\d+)?)?|~|[-^_][.>^\-_!+|]|[-^_]\d', self.toks[j + n]):
            n += 1
        return n


DYN_ARTIC = set('p pp ppp mp mf f ff fff sf sfz fz fp rfz cresc decresc dim accent tenuto staccato marcato fermata trill prall mordent turn sfp'.split()) | {'!', '<', '>'}
ARG1 = {'clef', 'time', 'partial', 'bar', 'mark', 'tempo', 'ottava', 'numericTimeSignature', 'change', 'barNumberCheck', 'include', 'transposition', 'skip'}
ARG2: set[str] = set()


def key_accidentals(key: str) -> dict[int, int]:
    m = re.fullmatch(r'([A-G][#b]?)(m|mix|dor)?', key)
    fifths = KEY_FIFTHS[m.group(1)] + MODE_SHIFT[m.group(2) or '']
    acc = {i: 0 for i in range(7)}
    for k in range(abs(fifths)):
        letter = SHARP_ORDER[k] if fifths > 0 else SHARP_ORDER[6 - k]
        acc['CDEFGAB'.index(letter)] = 1 if fifths > 0 else -1
    return acc


def to_abc(events: list[Event], key: str, meter: F, partial: F, unit: F) -> str:
    acc = key_accidentals(key)
    bar_state: dict[tuple[int, int], int] = {}
    out: list[str] = []
    pos = meter - partial if partial else F(0)  # ölçü içindeki konum
    grace: list[Pitch] = []

    def name(p: Pitch) -> str:
        cur = bar_state.get((p.step, p.octave), acc[p.step])
        a = ''
        if p.alter != cur:
            a = {2: '^^', 1: '^', 0: '=', -1: '_', -2: '__'}[p.alter]
            bar_state[(p.step, p.octave)] = p.alter
        o = p.sci_octave()
        letter = 'CDEFGAB'[p.step]
        return a + (letter.lower() + "'" * (o - 5) if o >= 5 else letter + ',' * (4 - o))

    def length(d: F) -> str:
        u = d / unit
        if u == 1:
            return ''
        if u.denominator == 1:
            return str(u.numerator)
        if u == F(1, 2):
            return '/'
        return f'{u.numerator}/{u.denominator}'

    line_bars = 0
    for ev in events:
        if ev.kind == 'bar':
            if ev.mark == 'grace':
                grace = ev.pitches
                continue
            out.append({'|:': '|:', ':|': ':|', '||': '||', '[1': '[1', '[2': '[2', '[3': '[3'}[ev.mark])
            continue
        remaining = ev.dur
        first = True
        while remaining > 0:
            room = meter - pos
            seg = min(remaining, room)
            if ev.kind == 'rest':
                tok = 'z' + length(seg)
            else:
                names = [name(p) for p in ev.pitches]
                body = names[0] if len(names) == 1 else '[' + ''.join(names) + ']'
                g = '{' + ''.join(name(p) for p in grace) + '}' if grace and first else ''
                tok = g + body + length(seg)
                if remaining > seg or ev.tie:
                    tok += '-'
            grace = []
            out.append(tok)
            remaining -= seg
            pos += seg
            first = False
            if pos >= meter:
                pos = F(0)
                bar_state.clear()
                line_bars += 1
                out.append('|\n' if line_bars % 4 == 0 else '|')
    text = ' '.join(out)
    text = re.sub(r'\|\s+:\|', ':|', text)
    text = re.sub(r'\|\s+\|:', '|:', text)
    text = re.sub(r'\|\s+\|\|', '||', text)
    text = re.sub(r'\|\s+\[(\d)', r'|[\1', text)
    text = re.sub(r':\|\s+\[(\d)', r':|[\1', text)
    return text.replace(' \n ', '\n').replace('|\n ', '|\n')


def parse_pitch_token(tok: str, names: str) -> Pitch:
    m = re.fullmatch(r"([a-z]+)([',]*)", tok)
    step, alter = Reader('', names, None).parse_name(m.group(1))
    return Pitch(step, alter, m.group(2).count("'") - m.group(2).count(','))


def convert(
    text: str,
    *,
    relative: str | None = None,
    names: str = 'nederlands',
    key: str = 'C',
    meter: str = '4/4',
    partial: str = '0',
    unit: str = '1/16',
    transpose_octaves: int = 0,
    start_duration: str = '4',
    transpose: tuple[str, str] | None = None,
) -> str:
    rel = parse_pitch_token(relative, names) if relative else None
    reader = Reader(text, names, rel)
    reader.dur = F(4, int(start_duration))
    events: list[Event] = []
    reader.music(events)
    for e in events:
        for p in e.pitches:
            p.octave += transpose_octaves
    if transpose:
        a, b = parse_pitch_token(transpose[0], names), parse_pitch_token(transpose[1], names)
        dsteps = b.abs_step() - a.abs_step()
        semi = lambda p: p.octave * 12 + SEMI[p.step] + p.alter
        dsemi = semi(b) - semi(a)
        for e in events:
            for p in e.pitches:
                old = semi(p)
                n = p.abs_step() + dsteps
                p.octave, p.step = divmod(n, 7)
                p.alter = 0
                p.alter = old + dsemi - semi(p)
    num, den = (int(x) for x in meter.split('/'))
    return to_abc(events, key, F(4 * num, den), F(partial), F(unit) * 4)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('path', help='LilyPond parçası (dosya ya da - ile stdin)')
    ap.add_argument('--relative', help="göreceli kip başlangıç perdesi, ör. c' (verilmezse mutlak)")
    ap.add_argument('--names', default='nederlands', choices=['nederlands', 'deutsch', 'english'])
    ap.add_argument('--transpose', nargs=2, metavar=('FROM', 'TO'), help='diyatonik aktarım, ör. g c')
    ap.add_argument('--key', default='C', help='ABC tonalitesi (yazım için), ör. Am, F, Bb')
    ap.add_argument('--meter', default='4/4')
    ap.add_argument('--partial', default='0', help='öncü ölçü süresi (dörtlük), ör. 1/2')
    ap.add_argument('--unit', default='1/16')
    ap.add_argument('--transpose-octaves', type=int, default=0)
    ap.add_argument('--start-duration', default='4', help='alıntı süre belirtmeden başlıyorsa varsayılan süre, ör. 8')
    args = ap.parse_args()
    text = sys.stdin.read() if args.path == '-' else open(args.path, encoding='utf-8').read()
    print(
        convert(
            text,
            relative=args.relative,
            names=args.names,
            key=args.key,
            meter=args.meter,
            partial=args.partial,
            unit=args.unit,
            transpose_octaves=args.transpose_octaves,
            start_duration=args.start_duration,
            transpose=tuple(args.transpose) if args.transpose else None,
        )
    )


if __name__ == '__main__':
    main()
