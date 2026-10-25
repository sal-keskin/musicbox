#!/usr/bin/env python3
"""
src/library/classics.ts dosyasını kamu malı kaynaklardan üretir.

Kaynaklar (yalnızca veri olarak okunur, hiçbir şey çalıştırılmaz):
  --mutopia  Mutopia Project deposunun ftp/ klasörü (LilyPond kaynakları)
  --music21  music21 paketindeki corpus/ klasörü (MusicXML ve ABC)

Notalar kaynaklardan dönüştürücülerle (ly2abc, mxl2abc) alınır; eşlik ve
davul partileri bu projenin düzenlemesidir.

  python3 scripts/build_classics.py --mutopia ../mutopia/ftp --music21 corpus > src/library/classics.ts
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import ly2abc  # noqa: E402
import mxl2abc  # noqa: E402


def between(text: str, start: str, end: str) -> str:
    i = text.index(start) + len(start)
    return text[i : text.index(end, i)]


def ifemidi(t: str) -> str:
    """\\ifemidi { yazılı } { midi } -> midi sürümü (süslemeler açık yazılmış)."""
    out, i = '', 0
    while (j := t.find('\\ifemidi', i)) >= 0:
        out += t[i:j]
        k = j + len('\\ifemidi')
        blocks = []
        for _ in range(2):
            k = t.index('{', k)
            depth = 0
            for q in range(k, len(t)):
                if t[q] == '{':
                    depth += 1
                elif t[q] == '}':
                    depth -= 1
                    if depth == 0:
                        blocks.append(t[k + 1 : q])
                        k = q + 1
                        break
        out += ' ' + blocks[1] + ' '
        i = k
    return out + t[i:]


def rep(pattern: str, n: int) -> str:
    return ' | '.join([pattern] * n)


# ---------------------------------------------------------------------------
# Türk Marşı — Mutopia KV331_3_RondoAllaTurcaNotes.ly'den aktarıldı
# (righta, rightb, rightaa, rightc, rightf sonu; lefta, leftb, leftaa, leftc)
# ---------------------------------------------------------------------------

def turca() -> str:
    a_rh = """BA^GA | c2z2 dcBc | e2z2 fe^de | ba^ga ba^ga | c'4 a2c'2 |
{ga}b2 [^fa]2 [eg]2 [^fa]2 | {ga}b2 [^fa]2 [eg]2 [^fa]2 | {ga}b2 [^fa]2 [eg]2 [^d^f]2"""
    b_rh = """[eg]2[eg]2 agfe | [Bd]2G2 [ce]2[df]2 | [eg]2[eg]2 agfe | [Bd]4 [Ac]2[Bd]2 |
[ce]2[ce]2 fedc | [^GB]2E2 [Ac]2[Bd]2 | [ce]2[ce]2 fedc | [^GB]4 BA^GA |
c2z2 dcBc | e2z2 fe^de | ba^ga ba^ga | c'2z2 a2b2 | c'2b2 a2^g2 | a2e2 f2d2 | c4 c/B/c/B/c/B/A/B/"""
    c_rh = """[c'c]4 [aA]2[bB]2 | [c'c]2[bB]2 [aA]2[gG]2 | [fF]2[gG]2 [aA]2[bB]2 | [gG]2[eE]2 [aA]2[bB]2 |
[c'c]4 [aA]2[bB]2 | [c'c]2[bB]2 [aA]2[gG]2 | [fF]2[bB]2 [gG]2[eE]2"""
    coda_rh = "[Acea]6 [cc']2 | [Aa]6 [ee']2 | [Aa]6 [cc']2 | [Aa]2[cc']2 [Aa]2[ee']2 | [Aa]4 [Acea]4 | [Acea]4 z4 |]"
    rh = f"""[V:1] |: {a_rh} | e4 :|
|: [ce]2[df]2 | {b_rh} | A4 :|
[K:A] |: [aA]2[bB]2 | {c_rh} | [aA]4 :|
[K:Am] {a_rh} | e4 [ce]2[df]2 |
{b_rh} | A4 [K:A] [aA]2[bB]2 |
{c_rh} |
{coda_rh}"""

    a_lh = """z4 | A,2[CE]2[CE]2[CE]2 | A,2[CE]2[CE]2[CE]2 | A,2[CE]2A,2[CE]2 | A,2[CE]2[CE]2[CE]2 |
E,2[B,E]2[B,E]2[B,E]2 | E,2[B,E]2[B,E]2[B,E]2 | E,2[B,E]2B,,2B,2"""
    b_lh = """C,2C2E,2E2 | G,4z4 | C,2C2E,2E2 | G,4z4 | A,,2A,2C,2C2 | E,4z4 | A,,2A,2C,2C2 | E,4z4 |
A,2[CE]2[CE]2[CE]2 | A,2[CE]2[CE]2[CE]2 | A,2[CE]2A,2[CE]2 | F,2[A,^D]2[A,^D]2[A,^D]2 |
E,2[A,E]2D,2[F,B,]2 | C,2[E,A,]2D,2[F,B,]2 | [E,A,]2[E,A,]2[E,^G,]2[E,^G,]2"""
    stra = '{A,,C,E,}A,2A,2A,2A,2'
    c_lh = f"""{stra} | {stra} | {{D,,F,,A,,}}D,2D,2{{^D,,F,,A,,}}^D,2^D,2 | {{E,,G,,B,,}}E,2E,2E,2E,2 |
{stra} | {stra} | {{D,,F,,A,,}}D,2D,2{{E,,G,,B,,}}E,2E,2"""
    lh = f"""[V:2] |: {a_lh} | E,4 :|
|: z4 | {b_lh} | [A,,A,]4 :|
[K:A] |: z4 | {c_lh} | A,,4 :|
[K:Am] {a_lh} | E,4 z4 |
{b_lh} | [A,,A,]4 [K:A] z4 |
{c_lh} |
{stra} | {stra} | {stra} | {{A,,C,E,}}A,2A,2{{A,,C,E,}}A,2A,2 | A,,4 [A,,C,E,A,]4 | [A,,C,E,A,]4 z4 |]"""

    p = '[Fg]2 g2 [cg]2 g2'
    j1, j2 = '[Fa]4 [Fg]2[Fg]2', '[Fg]2[Fg]2[cg]2[Fg]2'
    jan = f'{j1} | {j2} | {j1} | {j2} | {j1} | {j2} | {j2}'
    dr = f"""[V:3] |: !mp! z4 | {rep(p, 7)} | [Fg]2 g2 :|
|: z4 | {rep(p, 7)} | {p} | {rep(p, 7)} | [Fg]2 g2 :|
|: !f! c2c2 | {jan} | [Fa]4 :|
!mp! z4 | {rep(p, 7)} | {p} |
{rep(p, 7)} | {p} | {rep(p, 7)} | [Fg]2 g2 !f! c2c2 |
{jan} |
[Fa]6 c2 | [Fa]6 c2 | [Fa]6 c2 | [Fa]2c2[Fa]2c2 | [Fa]4 [Fa]4 | [Fa]4 z4 |]"""

    return f"""X:13
T:Türk Marşı
T:(Rondo alla Turca, KV 331)
C:Wolfgang Amadeus Mozart
S:Mutopia Project (kamu malı); ksilofon ve yeniçeri davulu için düzenleme
M:2/4
L:1/16
Q:1/4=124
K:Am
V:1 name="Sağ el"
V:2 name="Sol el"
V:3 name="Yeniçeri davulu" clef=perc
{rh}
{lh}
{dr}
"""


# ---------------------------------------------------------------------------
# The Entertainer — Mutopia JoplinS/entertainer
# ---------------------------------------------------------------------------

def entertainer(m: str) -> str:
    src = open(f'{m}/JoplinS/entertainer/entertainer.ly', encoding='utf-8').read()
    top = src[src.index("top = \\relative c' {") :]
    top1 = top[top.index('{') + 1 : top.index('\\bar "||"')]
    top2 = top[top.index('\\bar "||"') + 9 : top.index('\\key f \\major')]
    bot = src[src.index('bottom = \\relative c {') :]
    bot1 = bot[bot.index('{') + 1 : bot.index('\\bar "||"')]
    bot2 = bot[bot.index('\\bar "||"') + 9 : bot.index('\\key f \\major')]
    kw = dict(key='C', meter='2/4')
    rh = ly2abc.convert(top1, relative="c'", **kw) + '\n' + ly2abc.convert(top2, relative="dis'", **kw)
    lh = ly2abc.convert(bot1, relative='c', **kw) + '\n' + ly2abc.convert(bot2, relative='c', start_duration='8', **kw)
    rh = rh.rstrip().rstrip('|').rstrip() + ' |]'
    lh = lh.rstrip().rstrip('|').rstrip() + ' |]'

    p = '[Fg]2 g2 [cg]2 g2'
    fill = '[Fg]2 g2 c/c/c/c/ e/e/d/d/'
    dr = f"""[V:3] z8 | z8 | z8 | z4 [Fa]2 z2 |
|: !mp! {rep(p, 15)} |[1 {fill} :|[2 {p} ||
|: {rep(p, 15)} |[1 {fill} :|[2 {p} ||
{rep(p, 15)} | [Fa]4 [Fa]2 z2 |]"""
    return f"""X:14
T:The Entertainer
C:Scott Joplin (1902)
S:Mutopia Project (kamu malı, 1902 baskısı)
M:2/4
L:1/16
Q:1/4=88
K:C
V:1 name="Sağ el"
V:2 name="Sol el"
V:3 name="Davul" clef=perc
[V:1] {rh}
[V:2] {lh}
{dr}
"""


# ---------------------------------------------------------------------------
# Maple Leaf Rag — music21 corpus (MusicXML)
# ---------------------------------------------------------------------------

def maple(c: str) -> str:
    r = mxl2abc.convert(f'{c}/joplin/maple_leaf_rag.mxl', '1-35')
    (_, rh), (_, lh) = r['voices']
    # İkinci dönüş işaretleri kaynakta sol çizgide değil; elle eklenir.
    rh = rh.replace(':| [Ec] A [EB]2 [EA]2 z2', ':|[2 [Ec] A [EB]2 [EA]2 z2', 1)
    lh = lh.replace(':| [E,A,C]2 [E,G,D]2 [A,C]2 [=A,,=A,]2', ':|[2 [E,A,C]2 [E,G,D]2 [A,C]2 [=A,,=A,]2', 1)
    p = '[Fg]2 g2 [cg]2 g2'
    dr = f"""[V:3] z2 |: !mp! {rep(p, 15)} |[1 {p} :|[2 {p} |:
{rep(p, 15)} |[1 {p} :|[2 [Fa]2 z2 [Fa]2 z2 |]"""
    return f"""X:15
T:Maple Leaf Rag
C:Scott Joplin (1899)
S:music21 derlemi (kamu malı eser)
M:2/4
L:1/16
Q:1/4=96
K:Ab
V:1 name="Sağ el"
V:2 name="Sol el"
V:3 name="Davul" clef=perc
[V:1] {rh}
[V:2] {lh}
{dr}
"""


# ---------------------------------------------------------------------------
# Sonata facile, KV 545 — music21 corpus (MusicXML)
# ---------------------------------------------------------------------------

def k545(c: str) -> str:
    r = mxl2abc.convert(f'{c}/mozart/k545/movement1_exposition.mxl')
    (_, rh), (_, lh) = r['voices']
    rh = '|: ' + rh.replace('|]', ':|') + '\n[EGc]8 z8 |]'
    lh = '|: ' + lh.replace('|]', ':|') + '\n[C,G,C]8 z8 |]'
    return f"""X:16
T:Sonata facile
T:(Piyano Sonatı No. 16, KV 545 – I. bölüm)
C:Wolfgang Amadeus Mozart
S:music21 derlemi (kamu malı eser)
M:4/4
L:1/16
Q:1/4=126
K:C
V:1 name="Sağ el"
V:2 name="Sol el"
[V:1] {rh}
[V:2] {lh}
"""


# ---------------------------------------------------------------------------
# Eine kleine Nachtmusik — Mutopia MozartWA/KV525 (1. keman + viyolonsel)
# ---------------------------------------------------------------------------

def nachtmusik(m: str) -> str:
    d = f'{m}/MozartWA/KV525/eine-kleine-nachtmusik-mvt1/eine-kleine-nachtmusik-mvt1-lys/'
    v = open(d + 'violin1.ly', encoding='utf-8').read()
    v = between(v, "\\relative g'' {", '<g g,>2~\\sf').replace('\\repeat volta 2 {', '')
    c = open(d + 'cello.ly', encoding='utf-8').read()
    c = between(c, '\\relative g {', 'g8\\sf g g g').replace('\\repeat volta 2 {', '')
    vn = ly2abc.convert(ifemidi(v), relative="g''", key='G', meter='4/4').rstrip().rstrip('|')
    vc = ly2abc.convert(ifemidi(c), relative='g', key='G', meter='4/4').rstrip().rstrip('|')
    return f"""X:17
T:Eine kleine Nachtmusik
T:(KV 525 – I. bölüm, açılış)
C:Wolfgang Amadeus Mozart
S:Mutopia Project (kamu malı)
M:4/4
L:1/16
Q:1/4=132
K:G
V:1 name="1. keman"
V:2 name="Viyolonsel"
[V:1] {vn} | [gG]8 z8 |]
[V:2] {vc} | [G,G,,]8 z8 |]
"""


# ---------------------------------------------------------------------------
# La donna è mobile — music21 corpus (MusicXML)
# ---------------------------------------------------------------------------

def ladonna(c: str) -> str:
    r = mxl2abc.convert(f'{c}/verdi/laDonnaEMobile.mxl')
    (_, rh), (_, lh) = r['voices']
    rh = rh.replace(':|', '|]')
    lh = lh.replace(':|', '|]')
    p = '[Fg]2 g2 g2'
    dr = f"[V:3] z6 | !p! {rep(p, 33)} | [Fa]2 z4 |]"
    return f"""X:18
T:La donna è mobile
T:(Rigoletto)
C:Giuseppe Verdi
S:music21 derlemi (kamu malı eser)
M:3/8
L:1/16
Q:3/8=60
K:Bb
V:1 name="Melodi"
V:2 name="Eşlik"
V:3 name="Davul" clef=perc
[V:1] {rh}
[V:2] {lh}
{dr}
"""


# ---------------------------------------------------------------------------
# Do majör Prelüd, BWV 846 — Mutopia BachJS/BWV846/wtk1-prelude1
# ---------------------------------------------------------------------------

def prelude(m: str) -> str:
    b = open(f'{m}/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.ly', encoding='utf-8').read()
    r = b[b.index("\\transpose c c' {") + len("\\transpose c c' {") : b.index('left = {')]
    r = r[: r.rindex('}')]
    r = r[: r.rindex('}')]
    left = b[b.index('left = {') + len('left = {') :]
    tenor = left[left.index('<<') + 2 : left.index('} \\\\ {')]
    tenor = tenor[tenor.index('{') + 1 :]
    bass = left[left.index('} \\\\ {') + 6 : left.index('} >>')]
    kw = dict(key='C', meter='4/4')
    v1 = ly2abc.convert(r, transpose_octaves=1, **kw)
    v2 = ly2abc.convert(tenor, **kw)
    v3 = ly2abc.convert(bass, **kw)
    end = lambda s: s.rstrip().rstrip('|').rstrip() + ' |]'
    return f"""X:19
T:Do majör Prelüd
T:(Das Wohltemperierte Klavier I, BWV 846)
C:Johann Sebastian Bach
S:Mutopia Project (kamu malı)
M:4/4
L:1/16
Q:1/4=72
K:C
V:1 name="Sağ el"
V:2 name="Tenor"
V:3 name="Bas"
[V:1] {end(v1)}
[V:2] {end(v2)}
[V:3] {end(v3)}
"""


# ---------------------------------------------------------------------------
# Brahms Ninnisi — Mutopia BrahmsJ/LullabyBrahms-C (melodi); eşlik: kaynaktaki akorlar
# ---------------------------------------------------------------------------

def lullaby(m: str) -> str:
    s = open(f'{m}/BrahmsJ/LullabyBrahms-C/LullabyBrahms-C.ly', encoding='utf-8').read()
    notes = between(s[s.index('theNotes') :], '{', '\\bar')
    mel = ly2abc.convert(notes, names='english', relative="c'", transpose=('g', 'c'), transpose_octaves=1, key='C', meter='3/4', partial='1', unit='1/8')
    mel = mel.rstrip().rstrip('|').rstrip()
    # Kaynaktaki akorlar (\transpose g c sonrası): C Em | C Em | C Em | Dm G | Dm G | Dm G7 | G7 |
    # C C7 | F | C | Dm G | C C7 | F | C | Dm Em G7 | C
    C, Em, Dm, G, G7, C7, F = '[C,E,G,]2', '[E,G,B,]2', '[D,F,A,]2', '[G,B,D]2', '[G,B,F]2', '[C,E,_B,]2', '[F,A,C]2'
    bars = [
        f'C,2 {Em} {Em}', f'C,2 {Em} {Em}', f'C,2 {Em} {Em}', f'D,2 {G} {G}', f'D,2 {G} {G}', f'D,2 {G7} {G7}',
        f'G,,2 {G7} {G7}', f'C,2 {C} {C7}', f'F,,2 {F} {F}', f'C,2 {C} {C}', f'D,2 {G} {G}', f'C,2 {C} {C7}',
        f'F,,2 {F} {F}', f'C,2 {C} {C}', f'{Dm} {Em} {G7}', '[C,E,G,C]4',
    ]
    acc = 'z2 | ' + ' | '.join(bars[:4]) + ' |\n' + ' | '.join(bars[4:8]) + ' |\n' + ' | '.join(bars[8:12]) + ' |\n' + ' | '.join(bars[12:]) + ' |]'
    return f"""X:20
T:Brahms Ninnisi
T:(Wiegenlied, op. 49 no. 4)
C:Johannes Brahms
S:Mutopia Project (kamu malı)
M:3/4
L:1/8
Q:1/4=80
K:C
V:1 name="Melodi"
V:2 name="Eşlik"
[V:1] {mel} |]
[V:2] {acc}
"""


# ---------------------------------------------------------------------------
# Halk ezgileri — Ryan's Mammoth Collection (1883) ve fife derlemesi
# ---------------------------------------------------------------------------

def turkey() -> str:
    g = '[Fg]2 [cg]2 [Fg]2 [cg]2'
    return f"""X:21
T:Turkey in the Straw
C:Amerikan halk ezgisi
S:Ryan's Mammoth Collection (1883), "Old Zip Coon"
M:2/4
L:1/16
Q:1/4=112
K:G
V:1 name="Keman"
V:2 name="Bas"
V:3 name="Davul" clef=perc
[V:1] BA | GFGA G2B,C | DEDB, D2GA | B2B2 BAGA | B2A2 A2BA |
GFGA G2B,C | DEDB, D2Bc | BABc dBGA | B2G2 G2 ::
GA | Bcde d2dc | Bcde d2dB | cdef e2ed | cdef e2ef |
gfge edBd | BcBG A2GA | B2BG AGEG | D2G2 G2 :|
[V:2] z2 | G,2[B,D]2D,2[B,D]2 | G,2[B,D]2D,2[B,D]2 | G,2[B,D]2D,2[B,D]2 | D,2[F,A,]2D,2[F,A,]2 |
G,2[B,D]2D,2[B,D]2 | G,2[B,D]2D,2[B,D]2 | G,2[B,D]2D,2[B,D]2 | G,2[B,D]2G,2 ::
z2 | G,2[B,D]2D,2[B,D]2 | G,2[B,D]2D,2[B,D]2 | C,2[E,G,]2C,2[E,G,]2 | C,2[E,G,]2C,2[E,G,]2 |
G,2[B,D]2D,2[B,D]2 | G,2[B,D]2D,2[F,A,]2 | G,2[B,D]2C,2[E,G,]2 | D,2[F,A,]2G,2 :|
[V:3] z2 | !mf! {rep(g, 7)} | [Fg]2 [cg]2 [Fa]2 ::
z2 | {rep(g, 7)} | [Fg]2 [cg]2 [Fa]2 :|
"""


def arkansas() -> str:
    g = '[Fg]2 [cg]2 [Fg]2 [cg]2'
    D = 'D,2[F,A,]2D,2[F,A,]2'
    DA, DG, AD = 'D,2[F,A,]2A,2[CE]2', 'D,2[F,A,]2G,2[B,D]2', 'A,2[CE]2D,2[F,A,]2'
    return f"""X:22
T:Arkansas Traveler
C:Amerikan halk ezgisi
S:Cole's 1000 Fiddle Tunes / Ryan's Mammoth Collection
M:2/4
L:1/16
Q:1/4=112
K:D
V:1 name="Keman"
V:2 name="Bas"
V:3 name="Davul" clef=perc
[V:1] (3A,B,C |: DFED B,2B,2 | A,2A,2 D4 | EEE2 FFF2 | DFED B,2A,2 |
DFED B,2B,2 | A,2A,2 D4 | dcdA BdAG | FEDC D2z2 :|
|: agfa gfeg | fedf edcA | dcdf edeg | fedf e2fg |
agfa gfeg | fedf edcA | dcdA BdAG | FEDC D4 :|
[V:2] z2 |: {D} | {D} | {AD} | {DA} |
{D} | {D} | {DG} | {AD} :|
|: {DA} | {DA} | {DA} | {DA} |
{DA} | {DA} | {DG} | {AD} :|
[V:3] z2 |: !mf! {rep(g, 7)} | [Fg]2 [cg]2 [Fa]2 z2 :|
|: {rep(g, 7)} | [Fg]2 [cg]2 [Fa]4 :|
"""


def haste() -> str:
    D, A, G, AD = 'D,2[F,A,] D,2[F,A,]', 'A,2[CE] A,2[CE]', 'G,2[B,D] G,2[B,D]', 'A,2[CE] D,2[F,A,]'
    j = '[Fg]gg [cg]gg'
    return f"""X:23
T:Haste to the Wedding
C:İrlanda halk ezgisi
S:Ryan's Mammoth Collection (1883)
M:6/8
L:1/8
Q:3/8=104
K:D
V:1 name="Keman"
V:2 name="Bas"
V:3 name="Davul" clef=perc
[V:1] A | AFG Agf | ede fdB | AFA AdF | EFE E2F/G/ |
AFG Aaf | ede fdB | AFA faf | ddd d2 :|
|: f/g/ | afa afa | bgb bag | fga agf | efe efg |
a3 f3 | ede fdB | AFA faf | ddd d2 :|
[V:2] z | {D} | {AD} | {D} | {A} |
{D} | {AD} | {D} | D,2[F,A,] D,2 :|
|: z | {D} | {G} | {D} | {A} |
{D} | {AD} | {D} | D,2[F,A,] D,2 :|
[V:3] z | !mf! {rep(j, 7)} | [Fg]gg [Fa]2 :|
|: z | {rep(j, 7)} | [Fg]gg [Fa]2 :|
"""


def yankee() -> str:
    D, DA, G, GC, A = 'D,[F,A,] D,[F,A,]', 'D,[F,A,] A,[CE]', 'G,[B,D] G,[B,D]', 'G,[B,D] =C,[E,G,]', 'A,[CE] A,[CE]'
    m = '[Fg] [cg] [Fg] [cg]'
    return f"""X:24
T:Yankee Doodle
C:Amerikan halk ezgisi
S:Jack Campin'in fife derlemesi (music21 derlemi)
M:2/4
L:1/8
Q:1/4=116
K:D
V:1 name="Fife"
V:2 name="Bas"
V:3 name="Trampet" clef=perc
[V:1] |: d2 ef | df ec | d2 ef | d2 c2 | d2 ef | gf ed | cA Bc | d2 d2 :|
|: d2 BG | Bd =c2 | A>B AG | FG A2 | d2 BG | Bd =c2 | AB cA | d2 d2 :|
[V:2] |: {D} | {DA} | {D} | {DA} | {D} | {G} | {A} | {D} :|
|: {G} | {GC} | {D} | {D} | {G} | {GC} | {DA} | {D} :|
[V:3] |: !mf! {rep(m, 7)} | [Fa] c/c/ [Fa] z :|
|: {rep(m, 7)} | [Fa] c/c/ [Fa] z :|
"""


# ---------------------------------------------------------------------------
# Dağ Kralının Salonunda — Mutopia GriegE/O46 ile doğrulanmış tema ve ikinci cümle
# ---------------------------------------------------------------------------

def mountain_king() -> str:
    p1 = 'B,C DE FD F2 | ^EC ^E2 =E=C E2 | B,C DE FD FB | AF DF A4'
    p1e = 'B,C DE FD F2 | ^EC ^E2 =E=C E2 | B,C DE FD FB | AF DF [A,A]4'
    p2 = 'F,^G, ^A,B, C^A, C2 | D^A, D2 C^A, C2 | F,^G, ^A,B, C^A, C2 | D^A, D2 C4'
    p2e = 'F,^G, ^A,B, C^A, C2 | D^A, D2 C^A, C2 | F,^G, ^A,B, C^A, C2 | D^A, D2 [C,C]4'
    h1 = 'Bc de fd f2 | ^ec ^e2 =e=c e2 | Bc de fd fb | af df a4'
    h1e = 'Bc de fd f2 | ^ec ^e2 =e=c e2 | Bc de fd fb | af df [Aa]4'
    h2 = 'F^G ^AB c^A c2 | d^A d2 c^A c2 | F^G ^AB c^A c2 | d^A d2 c4'
    h2e = 'F^G ^AB c^A c2 | d^A d2 c^A c2 | F^G ^AB c^A c2 | d^A d2 [Cc]4'
    d1 = '[B,B][Cc] [Dd][Ee] [Ff][Dd] [F2f2] | [^E^e][Cc] [^E2^e2] [=E=e][=C=c] [E2e2] | [B,B][Cc] [Dd][Ee] [Ff][Dd] [Ff][Bb] | [Aa][Ff] [Dd][Ff] [A4a4]'
    d2 = '[F,F][^G,^G] [^A,^A][B,B] [Cc][^A,^A] [C2c2] | [Dd][^A,^A] [D2d2] [Cc][^A,^A] [C2c2] | [F,F][^G,^G] [^A,^A][B,B] [Cc][^A,^A] [C2c2] | [Dd][^A,^A] [D2d2] [C4c4]'
    b1 = 'B,2 F,2 B,2 F,2 | C2 ^G,2 =C2 =G,2 | B,2 F,2 B,2 F,2 | D2 A,2 D2 A,2'
    # İkinci cümlede Fa♯ pedalı; melodideki Re'nin altında Do♯ yerine La♯ (yarım ses sürtüşmesi olmasın)
    b2 = 'F,2 C2 F,2 C2 | F,2 ^A,2 F,2 C2 | F,2 C2 F,2 C2 | F,2 ^A,2 F,4'
    bass16 = f'{b1} |\n{b1} |\n{b2} |\n{b2}'
    t1, t2, t3 = 'A2 z2 A2 z2', '[FA]2 c2 [FA]2 c2', '[Fg][cg] [Fg][cg] [Fg][cg] [Fg][cg]'
    fill = 'c/c/c/c/ e/e/e/e/ d/d/d/d/ A/A/A/A/'
    return f"""X:11
T:Dağ Kralının Salonunda
T:(I Dovregubbens hall)
C:Edvard Grieg (Peer Gynt)
S:Tema Mutopia Project kaynağıyla doğrulandı (kamu malı)
M:4/4
L:1/8
Q:1/4=96
K:Bm
V:1 name="Melodi"
V:2 name="Bas"
V:3 name="Davul" clef=perc
[V:1] !p! {p1} |
{p1e} |
{p2} |
{p2e} |
[Q:1/4=126] !mf! {h1} |
{h1e} |
{h2} |
{h2e} |
[Q:1/4=160] !ff! {d1} |
{d1} |
{d2} |
{d2} |
!fff! [B,DFB]2 z2 [B,DFB]2 z2 | [B,4D4F4B4] z4 |]
[V:2] {bass16} |
{bass16} |
{bass16} |
B,2 z2 B,2 z2 | B,4 z4 |]
[V:3] !p! {rep(t1, 15)} | A2 z2 A2 A2 |
!mf! {rep(t2, 15)} | [FA]2 c2 c/c/c/c/ AA |
!ff! [Fa][cg] [Fg][cg] [Fg][cg] [Fg][cg] | {rep(t3, 14)} | {fill} |
!fff! [Fa]2 z2 [Fa]2 z2 | [Fa]4 z4 |]
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--mutopia', required=True, help='Mutopia deposunun ftp/ klasörü')
    ap.add_argument('--music21', required=True, help='music21 corpus/ klasörü')
    a = ap.parse_args()
    tunes = [
        ('turk-marsi', turca()),
        ('entertainer', entertainer(a.mutopia)),
        ('maple-leaf-rag', maple(a.music21)),
        ('sonata-facile', k545(a.music21)),
        ('nachtmusik', nachtmusik(a.mutopia)),
        ('la-donna-e-mobile', ladonna(a.music21)),
        ('bach-prelud', prelude(a.mutopia)),
        ('brahms-ninnisi', lullaby(a.mutopia)),
        ('turkey-in-the-straw', turkey()),
        ('arkansas-traveler', arkansas()),
        ('haste-to-the-wedding', haste()),
        ('yankee-doodle', yankee()),
    ]
    out = [
        '/**',
        ' * Kamu malı klasikler ve halk ezgileri (ikinci kütüphane).',
        ' *',
        ' * BU DOSYA ÜRETİLİR: scripts/build_classics.py. Notalar Mutopia Project',
        ' * (LilyPond) ve music21 derleminden (MusicXML/ABC) dönüştürülmüştür;',
        ' * eşlik ve davul partileri bu projenin düzenlemesidir.',
        ' */',
        "import type { LibraryTune } from './tunes';",
        '',
        'export const CLASSICS: LibraryTune[] = [',
    ]
    for tid, abc in tunes:
        out.append(f'  {{ id: {json.dumps(tid)}, abc: {json.dumps(abc, ensure_ascii=False)} }},')
    out.append('];')
    out.append('')
    out.append(f'export const MOUNTAIN_KING = {json.dumps(mountain_king(), ensure_ascii=False)};')
    print('\n'.join(out))


if __name__ == '__main__':
    main()
