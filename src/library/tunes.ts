/**
 * Eser kütüphanesi.
 *
 * Tüm eserler kamu malıdır (telif süresi dolmuş klasikler ve halk ezgileri);
 * düzenlemeler bu proje için ksilofon + davul setine göre yazılmıştır.
 * Davul partilerinde varsayılan eşleme kullanılır:
 *   F = bas davul, c = trampet, g = kapalı hi-hat, ^g = açık hi-hat,
 *   a = crash, f = ride, e = tiz tom, d = orta tom, A = yer tomu
 */

export interface LibraryTune {
  id: string;
  abc: string;
}

const ode = `X:1
T:Neşeye Övgü
T:Ode an die Freude
C:Ludwig van Beethoven (9. Senfoni)
M:4/4
L:1/4
Q:1/4=116
K:D
V:1 name="Melodi"
V:2 name="Bas"
V:3 name="Davul" clef=perc
[V:1] f f g a | a g f e | d d e f | f>e e2 |
f f g a | a g f e | d d e f | e>d d2 |
|: e e f d | e f/g/ f d | e f/g/ f e | d e A2 |
f f g a | a g f e | d d e f | e>d d2 :|
[V:2] D2 A,2 | A,2 C2 | D2 A,2 | A,2 E2 |
D2 A,2 | A,2 C2 | D2 A,2 | A,2 D2 |
|: A,2 D2 | A,2 D2 | A,2 C2 | D A, A,2 |
D2 A,2 | A,2 C2 | D2 A,2 | A,2 D2 :|
[V:3] [L:1/8] [Fa]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]c |
[Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g c/c/e/e/ dA |
|: [Fa]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]c |
[Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g c/c/e/e/ dA :|
`;

const furElise = `X:2
T:Für Elise
C:Ludwig van Beethoven
M:3/8
L:1/16
Q:1/8=144
K:Am
V:1 name="Sağ el"
V:2 name="Sol el"
[V:1] e^d |: e^de B=dc | A2 z CEA | B2 z E^GB | c2 z Ee^d |
e^de B=dc | A2 z CEA | B2 z EcB |1 A2 z2 e^d :|2 A2 z Bcd |
e3 Gfe | d3 Fed | c3 Edc | B2 z Eez | ze e'z z^d | ez z^de^d |
e^de B=dc | A2 z CEA | B2 z E^GB | c2 z Ee^d |
e^de B=dc | A2 z CEA | B2 z EcB | A6 |]
[V:2] z2 |: z6 | A,,E,A, z3 | E,,E,^G, z3 | A,,E,A, z3 |
z6 | A,,E,A, z3 | E,,E,^G, z3 |1 A,,E,A, z3 :|2 A,,E,A, z3 |
C,G,C z3 | G,,G,B, z3 | A,,E,A, z3 | E,,E,E z3 | z6 | z6 |
z6 | A,,E,A, z3 | E,,E,^G, z3 | A,,E,A, z3 |
z6 | A,,E,A, z3 | E,,E,^G, z3 | A,,E,A, z3 |]
`;

const korobeiniki = `X:3
T:Korobeyniki
T:(Tetris teması)
C:Rus halk şarkısı
M:4/4
L:1/8
Q:1/4=144
K:Am
V:1 name="Melodi"
V:2 name="Bas"
V:3 name="Davul" clef=perc
[V:1] |: e2 Bc d2 cB | A2 Ac e2 dc | B3 c d2 e2 | c2 A2 A4 |
z d2 f a2 gf | e3 c e2 dc | B2 Bc d2 e2 | c2 A2 A4 :|
e4 c4 | d4 B4 | c4 A4 | ^G4 B4 | e4 c4 | d4 B4 | c2 e2 a4 | ^g8 |
|: e2 Bc d2 cB | A2 Ac e2 dc | B3 c d2 e2 | c2 A2 A4 |
z d2 f a2 gf | e3 c e2 dc | B2 Bc d2 e2 | c2 A2 A4 :|
[V:2] |: E,E E,E E,E E,E | A,A A,A A,A A,A | ^G,^G ^G,^G E,E E,E | A,A A,A A,A B,C |
D,D D,D D,D D,D | C,C C,C C,C C,C | ^G,^G ^G,^G E,E E,E | A,A A,A A,A A,A :|
A,E A,E A,E A,E | ^G,E ^G,E ^G,E ^G,E | A,E A,E A,E A,E | ^G,E ^G,E ^G,E ^G,E |
A,E A,E A,E A,E | ^G,E ^G,E ^G,E ^G,E | A,E A,E A,E A,E | ^G,E ^G,E ^G,E ^G,E |
|: E,E E,E E,E E,E | A,A A,A A,A A,A | ^G,^G ^G,^G E,E E,E | A,A A,A A,A B,C |
D,D D,D D,D D,D | C,C C,C C,C C,C | ^G,^G ^G,^G E,E E,E | A,A A,A A,A A,A :|
[V:3] |: [Fa]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g |
[Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g c/c/c/c/ e/e/d/d/ :|
[Fa]2 [cf]2 [Ff]2 [cf]2 | [Ff]2 [cf]2 [Ff]2 [cf]2 | [Ff]2 [cf]2 [Ff]2 [cf]2 | [Ff]2 [cf]2 [Ff]2 [cf]2 |
[Ff]2 [cf]2 [Ff]2 [cf]2 | [Ff]2 [cf]2 [Ff]2 [cf]2 | [Ff]2 [cf]2 [Ff]2 [cf]2 | [Ff]2 [cf]2 c/c/e/e/ d/d/A/A/ |
|: [Fa]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g |
[Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g c/c/c/c/ e/e/d/d/ :|
`;

const twinkle = `X:4
T:Twinkle Twinkle Little Star
T:(Ah! vous dirai-je, maman)
C:Fransız halk ezgisi
M:4/4
L:1/4
Q:1/4=100
K:C
V:1 name="Melodi"
V:2 name="Eşlik"
V:3 name="Davul" clef=perc
[V:1] c c g g | a a g2 | f f e e | d d c2 |
g g f f | e e d2 | g g f f | e e d2 |
c c g g | a a g2 | f f e e | d d c2 |]
[V:2] [L:1/8] C,G,E,G, C,G,E,G, | F,CA,C C,G,E,G, | F,CA,C C,G,E,G, | G,DB,D C,G,E,G, |
C,G,E,G, F,CA,C | C,G,E,G, G,DB,D | C,G,E,G, F,CA,C | C,G,E,G, G,DB,D |
C,G,E,G, C,G,E,G, | F,CA,C C,G,E,G, | F,CA,C C,G,E,G, | G,DB,D C,4 |]
[V:3] [L:1/8] !mp! [Ff]2 f2 [cf]2 f2 | [Ff]2 f2 [cf]2 f2 | [Ff]2 f2 [cf]2 f2 | [Ff]2 f2 [cf]2 c/c/c |
[Ff]2 f2 [cf]2 f2 | [Ff]2 f2 [cf]2 f2 | [Ff]2 f2 [cf]2 f2 | [Ff]2 f2 [cf]2 c/c/c |
[Ff]2 f2 [cf]2 f2 | [Ff]2 f2 [cf]2 f2 | [Ff]2 f2 [cf]2 f2 | [Fa]8 |]
`;

const jingleBells = `X:5
T:Jingle Bells
C:James Lord Pierpont (1857)
M:4/4
L:1/8
Q:1/4=150
K:G
V:1 name="Melodi"
V:2 name="Bas"
V:3 name="Davul" clef=perc
[V:1] |: b2b2 b4 | b2b2 b4 | b2d'2 g3a | b8 |
c'2c'2 c'3c' | c'2b2 b2bb | b2a2 a2b2 | a4 d'4 |
b2b2 b4 | b2b2 b4 | b2d'2 g3a | b8 |
c'2c'2 c'3c' | c'2b2 b2bb | d'2d'2 c'2a2 | g8 :|
[V:2] |: G,2D2 G,2D2 | G,2D2 G,2D2 | G,2D2 G,2D2 | G,2D2 G,2D2 |
C2G2 C2G2 | G,2D2 G,2D2 | A,2E2 A,2E2 | D,2A,2 D,2A,2 |
G,2D2 G,2D2 | G,2D2 G,2D2 | G,2D2 G,2D2 | G,2D2 G,2D2 |
C2G2 C2G2 | G,2D2 G,2D2 | D,2A,2 D,2A,2 | G,2D2 G,4 :|
[V:3] |: [Fa]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]^g [c^g]g |
[Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g c/c/e/e/ dA |
[Fa]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]^g [c^g]g |
[Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g c/c/e/e/ dA | [Fa]2 g2 [Fa]4 :|
`;

const happyBirthday = `X:6
T:İyi ki Doğdun
T:(Happy Birthday to You)
C:Mildred J. Hill & Patty S. Hill
M:3/4
L:1/8
Q:1/4=104
K:F
V:1 name="Melodi"
V:2 name="Eşlik"
V:3 name="Davul" clef=perc
[V:1] c>c | d2 c2 f2 | e4 c>c | d2 c2 g2 | f4 c>c | c'2 a2 f2 | e2 d2 b>b | a2 f2 g2 | f6 |]
[V:2] z2 | F,2 [A,C]2 [A,C]2 | C,2 [G,B,]2 [G,B,]2 | C,2 [G,B,]2 [G,B,]2 | F,2 [A,C]2 [A,C]2 |
F,2 [A,C]2 [A,C]2 | B,2 [DF]2 [DF]2 | C,2 [A,C]2 [G,B,]2 | F,2 [A,C]2 F,2 |]
[V:3] z2 | F2 g2 g2 | F2 g2 g2 | F2 g2 g2 | F2 g2 c/c/c |
F2 g2 g2 | F2 g2 g2 | F2 g2 c/c/c | [Fa]6 |]
`;

const minuet = `X:7
T:Minuet (Sol majör)
C:Christian Petzold (BWV Anh. 114)
M:3/4
L:1/8
Q:1/4=126
K:G
V:1 name="Sağ el"
V:2 name="Sol el"
[V:1] |: d2 GA Bc | d2 G2 G2 | e2 cd ef | g2 G2 G2 |
c2 dc BA | B2 cB AG | F2 GA BG | A6 |
d2 GA Bc | d2 G2 G2 | e2 cd ef | g2 G2 G2 |
c2 dc BA | B2 cB AG | A2 BA GF | G6 :|
[V:2] |: G,4 A,2 | B,6 | C6 | B,6 |
A,6 | G,6 | D2 B,2 G,2 | D6 |
G,4 A,2 | B,6 | C6 | B,6 |
A,6 | G,6 | D6 | G,6 :|
`;

const canon = `X:8
T:Kanon (Re majör)
C:Johann Pachelbel
M:4/4
L:1/8
Q:1/4=66
K:D
V:1 name="Keman"
V:2 name="Basso continuo"
[V:1] z8 | z8 | f2 e2 d2 c2 | B2 A2 B2 c2 | d2 c2 B2 A2 | G2 F2 G2 E2 |
DFAG FDFE | DB,DA GBAG | [f2a2][e2g2] [d2f2][c2e2] | [B2d2][A2c2] [B2d2][c2e2] |
d'2 c'2 b2 a2 | g2 f2 g2 e2 | dfag fdfe | dBda gbag | [DFAd]8 |]
[V:2] D2 A,2 B,2 F,2 | G,2 D,2 G,2 A,2 | D2 A,2 B,2 F,2 | G,2 D,2 G,2 A,2 |
D2 A,2 B,2 F,2 | G,2 D,2 G,2 A,2 | D2 A,2 B,2 F,2 | G,2 D,2 G,2 A,2 |
D2 A,2 B,2 F,2 | G,2 D,2 G,2 A,2 | D2 A,2 B,2 F,2 | G,2 D,2 G,2 A,2 |
D2 A,2 B,2 F,2 | G,2 D,2 G,2 A,2 | D,8 |]
`;

const greensleeves = `X:9
T:Greensleeves
C:İngiliz halk ezgisi (16. yüzyıl)
M:6/8
L:1/8
Q:3/8=56
K:Am
V:1 name="Melodi"
V:2 name="Eşlik"
[V:1] A |: c2 d e>fe | d2 B G>AB | c2 A A>^GA | B2 ^G E2 A |
c2 d e>fe | d2 B G>AB | c>BA ^G>^FG |1 A3 A2 A :|2 A6 ||
|: g3 g>^fe | d2 B G>AB | c2 A A>^GA | B2 ^G E3 |
g3 g>^fe | d2 B G>AB | c>BA ^G>^FG | A6 :|
[V:2] z |: E,A,C ECA, | D,G,B, DB,G, | E,A,C ECA, | E,^G,B, EB,^G, |
E,A,C ECA, | D,G,B, DB,G, | E,A,C B,^G,E, |1 E,A,C A,3 :|2 E,A,C A,3 ||
|: C,E,G, CG,E, | D,G,B, DB,G, | E,A,C ECA, | E,^G,B, EB,^G, |
C,E,G, CG,E, | D,G,B, DB,G, | E,A,C B,^G,E, | [A,CE]6 :|
`;

const frereJacques = `X:10
T:Frère Jacques
T:(Dört sesli kanon)
C:Fransız halk şarkısı
M:4/4
L:1/4
Q:1/4=112
K:F
V:1 name="1. ses"
V:2 name="2. ses"
V:3 name="3. ses"
V:4 name="Davul" clef=perc
[V:1] f g a f | f g a f | a b c'2 | a b c'2 | c'/d'/c'/b/ a f | c'/d'/c'/b/ a f | f c f2 | f c f2 |
f g a f | f g a f | a b c'2 | a b c'2 | c'/d'/c'/b/ a f | c'/d'/c'/b/ a f | f c f2 | f c f2 |
z4 | z4 | z4 | z4 |]
[V:2] z4 | z4 |
F G A F | F G A F | A B c2 | A B c2 | c/d/c/B/ A F | c/d/c/B/ A F | F C F2 | F C F2 |
F G A F | F G A F | A B c2 | A B c2 | c/d/c/B/ A F | c/d/c/B/ A F | F C F2 | F C F2 |
z4 | z4 |]
[V:3] z4 | z4 | z4 | z4 |
F, G, A, F, | F, G, A, F, | A, B, C2 | A, B, C2 | C/D/C/B,/ A, F, | C/D/C/B,/ A, F, | F, C, F,2 | F, C, F,2 |
F, G, A, F, | F, G, A, F, | A, B, C2 | A, B, C2 | C/D/C/B,/ A, F, | C/D/C/B,/ A, F, | F, C, F,2 | F, C, F,2 |]
[V:4] !mp! [Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g |
[Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g |
[Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g |
[Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] g | [Fg] g [cg] c/c/ | [Fa]4 |]
`;

const mountainKing = `X:11
T:Dağ Kralının Salonunda
T:(I Dovregubbens hall – tema)
C:Edvard Grieg (Peer Gynt)
M:4/4
L:1/8
Q:1/4=92
K:Bm
V:1 name="Melodi"
V:2 name="Bas"
V:3 name="Davul" clef=perc
[V:1] !p! B,C DE FD F2 | ^EC ^E2 =E=C E2 | B,C DE FD FB | AF DF A4 |
B,C DE FD F2 | ^EC ^E2 =E=C E2 | B,C DE FD FB | AF DF A4 |
[Q:1/4=112] !mf! B,C DE FD F2 | ^EC ^E2 =E=C E2 | B,C DE FD FB | AF DF A4 |
B,C DE FD F2 | ^EC ^E2 =E=C E2 | B,C DE FD FB | AF DF A4 |
[Q:1/4=136] !f! Bc de fd f2 | ^ec ^e2 =e=c e2 | Bc de fd fb | af df a4 |
Bc de fd f2 | ^ec ^e2 =e=c e2 | Bc de fd fb | af df a4 |
[Q:1/4=166] !ff! [B,B][Cc] [Dd][Ee] [Ff][Dd] [F2f2] | [^E^e][Cc] [^E2^e2] [=E=e][=C=c] [E2e2] | [B,B][Cc] [Dd][Ee] [Ff][Dd] [Ff][Bb] | [Aa][Ff] [Dd][Ff] [A4a4] |
[B,B][Cc] [Dd][Ee] [Ff][Dd] [F2f2] | [^E^e][Cc] [^E2^e2] [=E=e][=C=c] [E2e2] | [B,B][Cc] [Dd][Ee] [Ff][Dd] [Ff][Bb] | [Aa][Ff] [Dd][Ff] [A4a4] |
!fff! [B,DFB]2 z2 [B,DFB]2 z2 | [B,4D4F4B4] z4 |]
[V:2] B,2 F,2 B,2 F,2 | C2 ^G,2 =C2 =G,2 | B,2 F,2 B,2 F,2 | D2 A,2 D2 A,2 |
B,2 F,2 B,2 F,2 | C2 ^G,2 =C2 =G,2 | B,2 F,2 B,2 F,2 | D2 A,2 D2 A,2 |
B,2 F,2 B,2 F,2 | C2 ^G,2 =C2 =G,2 | B,2 F,2 B,2 F,2 | D2 A,2 D2 A,2 |
B,2 F,2 B,2 F,2 | C2 ^G,2 =C2 =G,2 | B,2 F,2 B,2 F,2 | D2 A,2 D2 A,2 |
B,2 F,2 B,2 F,2 | C2 ^G,2 =C2 =G,2 | B,2 F,2 B,2 F,2 | D2 A,2 D2 A,2 |
B,2 F,2 B,2 F,2 | C2 ^G,2 =C2 =G,2 | B,2 F,2 B,2 F,2 | D2 A,2 D2 A,2 |
B,2 F,2 B,2 F,2 | C2 ^G,2 =C2 =G,2 | B,2 F,2 B,2 F,2 | D2 A,2 D2 A,2 |
B,2 F,2 B,2 F,2 | C2 ^G,2 =C2 =G,2 | B,2 F,2 B,2 F,2 | D2 A,2 D2 A,2 |
B,2 z2 B,2 z2 | B,4 z4 |]
[V:3] !p! A2 z2 A2 z2 | A2 z2 A2 z2 | A2 z2 A2 z2 | A2 z2 A2 z2 |
A2 z2 A2 z2 | A2 z2 A2 z2 | A2 z2 A2 z2 | A2 z2 A2 A2 |
!mf! [FA]2 c2 [FA]2 c2 | [FA]2 c2 [FA]2 c2 | [FA]2 c2 [FA]2 c2 | [FA]2 c2 [FA]2 c2 |
[FA]2 c2 [FA]2 c2 | [FA]2 c2 [FA]2 c2 | [FA]2 c2 [FA]2 c2 | [FA]2 c2 c/c/c/c/ AA |
!f! [Fa]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g |
[Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | c/c/c/c/ e/e/e/e/ d/d/d/d/ A/A/A/A/ |
!ff! [Fa][cg] [Fg][cg] [Fg][cg] [Fg][cg] | [Fg][cg] [Fg][cg] [Fg][cg] [Fg][cg] | [Fg][cg] [Fg][cg] [Fg][cg] [Fg][cg] | [Fg][cg] [Fg][cg] [Fg][cg] [Fg][cg] |
[Fa][cg] [Fg][cg] [Fg][cg] [Fg][cg] | [Fg][cg] [Fg][cg] [Fg][cg] [Fg][cg] | [Fg][cg] [Fg][cg] [Fg][cg] [Fg][cg] | c/c/c/c/ e/e/e/e/ d/d/d/d/ A/A/A/A/ |
!fff! [Fa]2 z2 [Fa]2 z2 | [Fa]4 z4 |]
`;

const marbleRain = `X:12
T:Bilye Yağmuru
C:Musicbox için özgün beste
M:4/4
L:1/8
Q:1/4=112
K:C
V:1 name="Melodi"
V:2 name="Bas"
V:3 name="Davul" clef=perc
[V:1] |: g2 eg c'2 bc' | d'2 bd' g'2 f'e' | e'2 c'e' a2 bc' | d'c' ag f2 a2 |
g2 eg c'2 e'2 | d'2 bg d'2 g'2 | a'2 f'd' c'2 a2 | g'2 f'2 e'2 d'2 :|
a'/e'/c'/a/ e'/c'/a/e/ a2 c'2 | g'/e'/b/g/ e'/b/g/e/ g2 b2 | f'/c'/a/f/ c'/a/f/c/ f2 a2 | g'/d'/b/g/ d'/b/g/d/ g2 b2 |
c''2 b'a' e'2 c'2 | b'2 g'e' b2 e'2 | a'2 f'2 g'2 b'2 | c''8 |
g2 eg c'2 bc' | d'2 bd' g'2 f'e' | e'2 c'e' a2 bc' | d'c' ag f2 a2 |
g2 eg c'2 e'2 | d'2 bg d'2 g'2 | a'2 f'd' c'2 a2 | g'2 f'2 e'2 d'2 |
C/E/G/c/ e/g/c'/e'/ g'/c''/g'/e'/ c'2 | [c'e'g'c'']8 |]
[V:2] |: C,2 G,2 C2 G,2 | B,2 D2 G2 D2 | A,2 E2 A2 E2 | F,2 C2 F2 C2 |
C,2 G,2 C2 G,2 | G,2 D2 G2 D2 | F,2 C2 F2 C2 | G,2 D2 G,2 B,2 :|
A,2 E2 A,2 E2 | E,2 B,2 E,2 B,2 | F,2 C2 F,2 C2 | G,2 D2 G,2 D2 |
A,2 E2 A,2 E2 | E,2 B,2 E,2 B,2 | F,2 C2 G,2 D2 | C,2 G,2 C4 |
C,2 G,2 C2 G,2 | B,2 D2 G2 D2 | A,2 E2 A2 E2 | F,2 C2 F2 C2 |
C,2 G,2 C2 G,2 | G,2 D2 G2 D2 | F,2 C2 F2 C2 | G,2 D2 G,2 B,2 |
C,8 | [C,G,C]8 |]
[V:3] |: [Fa]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]^g |
[Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g c/c/e/e/ d/d/A/A/ :|
[Fa]f [cf]f [Ff][Ff] [cf]f | [Ff]f [cf]f [Ff][Ff] [cf]f | [Ff]f [cf]f [Ff][Ff] [cf]f | [Ff]f [cf]f [Ff][Ff] [cf]f |
[Ff]f [cf]f [Ff][Ff] [cf]f | [Ff]f [cf]f [Ff][Ff] [cf]f | [Ff]f [cf]f [Ff][Ff] [cf]f | [Fa]2 z2 c/c/e/e/ d/d/A/A/ |
[Fa]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]^g |
[Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g [Fg][Fg] [cg]g | [Fg]g [cg]g c/c/e/e/ d/d/A/A/ |
[Fg]g [cg]g c/c/c/c/ e/d/A/A/ | [Fa]8 |]
`;

export const LIBRARY: LibraryTune[] = [
  { id: 'bilye-yagmuru', abc: marbleRain },
  { id: 'korobeiniki', abc: korobeiniki },
  { id: 'nesheye-ovgu', abc: ode },
  { id: 'fur-elise', abc: furElise },
  { id: 'dag-krali', abc: mountainKing },
  { id: 'jingle-bells', abc: jingleBells },
  { id: 'kanon', abc: canon },
  { id: 'greensleeves', abc: greensleeves },
  { id: 'minuet', abc: minuet },
  { id: 'frere-jacques', abc: frereJacques },
  { id: 'twinkle', abc: twinkle },
  { id: 'iyi-ki-dogdun', abc: happyBirthday },
];

/** Editörde boş bir başlangıç için örnek şablon. */
export const TEMPLATE = `X:1
T:Benim Eserim
C:Ben
M:4/4
L:1/8
Q:1/4=120
K:C
V:1 name="Melodi"
V:2 name="Davul" clef=perc
[V:1] c2 e2 g2 c'2 | b2 g2 d'4 | c'2 a2 f2 a2 | g8 |]
[V:2] [Fa]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | c/c/e/e/ d/d/A/A/ [Fa]4 |]
`;
