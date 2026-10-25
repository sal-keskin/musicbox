import { describe, expect, it } from 'vitest';
import { parseAbc, splitTunes, expandRepeats } from '../src/engine';

const tune = (body: string, header = 'M:4/4\nL:1/8\nK:C') => `X:1\nT:Test\n${header}\n${body}`;
const pitches = (abc: string, header?: string) => parseAbc(tune(abc, header)).events.map((e) => e.pitch);
const times = (abc: string, header?: string) => parseAbc(tune(abc, header)).events.map((e) => e.time);
const durs = (abc: string, header?: string) => parseAbc(tune(abc, header)).events.map((e) => e.duration);

describe('perdeler', () => {
  it('oktav ve harfler', () => {
    expect(pitches('C D E F G A B c d e')).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74, 76]);
    expect(pitches("C, c' c'' A,,")).toEqual([48, 84, 96, 45]);
  });

  it('değiştiriciler ölçü boyunca geçerli, ölçü çizgisinde sıfırlanır', () => {
    expect(pitches('^F F _B B =B | F B')).toEqual([66, 66, 70, 70, 71, 65, 71]);
    // değiştirici yalnızca aynı oktavdaki notayı etkiler
    expect(pitches('^F f')).toEqual([66, 77]);
    expect(pitches('^^C __E')).toEqual([62, 62]);
  });

  it('donanım (tonalite) uygulanır', () => {
    expect(pitches('F c f', 'L:1/8\nK:G')).toEqual([66, 72, 78]);
    expect(pitches('B E A', 'L:1/8\nK:Eb')).toEqual([70, 63, 68]);
    expect(pitches('F C G', 'L:1/8\nK:Am')).toEqual([65, 60, 67]);
    expect(pitches('F C G', 'L:1/8\nK:Em')).toEqual([66, 60, 67]);
    expect(pitches('F C', 'L:1/8\nK:D mix')).toEqual([66, 60]);
    expect(pitches('B F', 'L:1/8\nK:G dor')).toEqual([70, 65]);
    expect(pitches('=F F', 'L:1/8\nK:G')).toEqual([65, 65]);
    expect(pitches('G c', 'L:1/8\nK:C ^g')).toEqual([68, 72]);
  });

  it('satır içi tonalite değişimi', () => {
    expect(pitches('F [K:G] F | F')).toEqual([65, 66, 66]);
  });
});

describe('süreler ve ritim', () => {
  it('L: birimine göre süreler', () => {
    expect(durs('C C2 C/2 C/ C// C3/2')).toEqual([0.5, 1, 0.25, 0.25, 0.125, 0.75]);
    expect(durs('C C2', 'L:1/4\nK:C')).toEqual([1, 2]);
  });

  it('varsayılan L: ölçü 3/4\'ten küçükse 1/16', () => {
    expect(durs('C', 'M:2/4\nK:C')).toEqual([0.25]);
    expect(durs('C', 'M:3/4\nK:C')).toEqual([0.5]);
  });

  it('notalar art arda dizilir', () => {
    expect(times('C D2 E/2 F')).toEqual([0, 0.5, 1.5, 1.75]);
  });

  it('noktalı ritim > ve <', () => {
    expect(durs('C>D E<F G>>A')).toEqual([0.75, 0.25, 0.25, 0.75, 0.875, 0.125]);
    expect(times('C>D E')).toEqual([0, 0.75, 1]);
  });

  it('üçleme ve n\'lemeler', () => {
    const d = durs('(3CDE F');
    expect(d[0]).toBeCloseTo(1 / 3);
    expect(d[3]).toBeCloseTo(0.5);
    const t = times('(3CDE F');
    expect(t[3]).toBeCloseTo(1);
    const q = durs('(5CDEFG', 'M:4/4\nL:1/16\nK:C');
    expect(q.reduce((a, b) => a + b, 0)).toBeCloseTo(0.5);
    const tri = durs('(3:2:2C2D', 'L:1/8\nK:C');
    expect(tri[0] + tri[1]).toBeCloseTo(1);
  });

  it('akorlar aynı anda çalar ve imleci ilk notanın süresi kadar ilerletir', () => {
    const s = parseAbc(tune('[CEG]2 c'));
    expect(s.events.filter((e) => e.time === 0).map((e) => e.pitch)).toEqual([60, 64, 67]);
    expect(s.events.find((e) => e.pitch === 72)!.time).toBe(1);
    const s2 = parseAbc(tune('[C2E2G2] c'));
    expect(s2.events.find((e) => e.pitch === 72)!.time).toBe(1);
  });

  it('bağlar (tie) birleştirilir', () => {
    const s = parseAbc(tune('C2-C2 D | E4- | E2 F2'));
    expect(s.events.map((e) => [e.pitch, e.time, e.duration])).toEqual([
      [60, 0, 2],
      [62, 2, 0.5],
      [64, 2.5, 3],
      [65, 5.5, 1],
    ]);
  });

  it('suslar zamanı ilerletir', () => {
    expect(times('C z D z2 E')).toEqual([0, 1, 2.5]);
  });

  it('çok ölçülük sus', () => {
    expect(times('Z2 | C')).toEqual([8]);
  });

  it('süsleme notaları ana notadan hemen önce çalar', () => {
    const s = parseAbc(tune('C2 {g}A2'));
    const grace = s.events.find((e) => e.grace)!;
    expect(grace.pitch).toBe(79);
    expect(grace.time).toBeLessThan(1);
    expect(s.events.find((e) => e.pitch === 69)!.time).toBe(1);
  });
});

describe('tekrarlar', () => {
  it('basit tekrar', () => {
    expect(pitches('|: C D :| E')).toEqual([60, 62, 60, 62, 64]);
  });

  it('1. ve 2. dönüşler', () => {
    expect(pitches('|: C |1 D :|2 E || F')).toEqual([60, 62, 60, 64, 65]);
    expect(pitches('|: C | [1 D :| [2 E |] F')).toEqual([60, 62, 60, 64, 65]);
  });

  it('başında |: olmayan tekrar baştan döner', () => {
    expect(pitches('C | D :| E')).toEqual([60, 62, 60, 62, 64]);
  });

  it(':: iki bölümü bağlar', () => {
    expect(pitches('|: C :: D :|')).toEqual([60, 60, 62, 62]);
  });

  it('üç dönüş', () => {
    expect(pitches('|: C |1 D :|2 E :|3 F |]')).toEqual([60, 62, 60, 64, 60, 65]);
  });

  it('çok satırlı dönüşler', () => {
    const abc = '|: C D | E F |1 G A :|\n|2 B c |]';
    expect(pitches(abc)).toEqual([60, 62, 64, 65, 67, 69, 60, 62, 64, 65, 71, 72]);
  });

  it('expandRepeats sırası', () => {
    const b = (s = false, e = false, endings: number[] | null = null) => ({ startRepeat: s, endRepeat: e, endings });
    expect(expandRepeats([b(true), b(false, false, [1]), b(false, true, [1]), b(false, false, [2]), b()])).toEqual([
      0, 1, 2, 0, 3, 4,
    ]);
  });

  it('tekrar sonrası zamanlar kesintisiz', () => {
    expect(times('|: C2 D2 :| E4')).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('başlık ve tempo', () => {
  it('başlık alanları', () => {
    const s = parseAbc('X:1\nT:Neşeye Övgü\nT:Alt başlık\nC:L. v. Beethoven\nM:3/4\nK:D\nD');
    expect(s.title).toBe('Neşeye Övgü');
    expect(s.composer).toBe('L. v. Beethoven');
    expect(s.meter).toEqual({ num: 3, den: 4 });
  });

  it('Q: biçimleri', () => {
    expect(parseAbc('X:1\nQ:1/4=90\nK:C\nC').tempo[0].qpm).toBe(90);
    expect(parseAbc('X:1\nM:6/8\nQ:3/8=60\nK:C\nC').tempo[0].qpm).toBe(90);
    expect(parseAbc('X:1\nQ:"Allegro" 1/2=70\nK:C\nC').tempo[0].qpm).toBe(140);
    expect(parseAbc('X:1\nL:1/8\nQ:200\nK:C\nC').tempo[0].qpm).toBe(100);
    expect(parseAbc('X:1\nQ:"Andante"\nK:C\nC').tempo[0].qpm).toBe(92);
    expect(parseAbc('X:1\nK:C\nC').tempo[0].qpm).toBe(120);
  });

  it('satır içi tempo değişimi tempo haritasına eklenir', () => {
    const s = parseAbc('X:1\nM:4/4\nL:1/4\nQ:1/4=60\nK:C\nC D E F | [Q:1/4=120] G A B c |');
    expect(s.tempo).toEqual([
      { beat: 0, qpm: 60 },
      { beat: 4, qpm: 120 },
    ]);
  });

  it('M:C ve M:C|', () => {
    expect(parseAbc('X:1\nM:C\nK:C\nC').meter).toEqual({ num: 4, den: 4 });
    expect(parseAbc('X:1\nM:C|\nK:C\nC').meter).toEqual({ num: 2, den: 2 });
  });
});

describe('çok seslilik ve perküsyon', () => {
  it('V: ile ayrı partiler aynı anda başlar', () => {
    const s = parseAbc('X:1\nL:1/4\nV:1\nV:2\nK:C\nV:1\nC D E F|\nV:2\nC, D, E, F,|');
    expect(s.voices.map((v) => v.id)).toEqual(['1', '2']);
    const v2 = s.events.filter((e) => e.voice === '2');
    expect(v2.map((e) => e.time)).toEqual([0, 1, 2, 3]);
    expect(v2.map((e) => e.pitch)).toEqual([48, 50, 52, 53]);
  });

  it('satır içi [V:] geçişi', () => {
    const s = parseAbc('X:1\nL:1/4\nK:C\n[V:1] C D | [V:2] E F |');
    expect(s.events.filter((e) => e.voice === '2').map((e) => e.time)).toEqual([0, 1]);
  });

  it('clef=perc partisi varsayılan davul eşlemesini kullanır', () => {
    const s = parseAbc('X:1\nL:1/8\nV:D clef=perc\nK:C\nV:D\nF c g ^g a e d A');
    expect(s.voices[0].instrument).toBe('drums');
    expect(s.events.map((e) => e.drum)).toEqual([
      'kick',
      'snare',
      'hihatClosed',
      'hihatOpen',
      'crash',
      'tomHigh',
      'tomMid',
      'tomFloor',
    ]);
  });

  it('%%percmap eşlemeyi değiştirir', () => {
    const s = parseAbc('X:1\nL:1/8\n%%percmap C bass-drum-1\n%%percmap D 38\nV:D perc\nK:C\nV:D\nC D');
    expect(s.events.map((e) => e.drum)).toEqual(['kick', 'snare']);
  });

  it('instrument=drums uzantısı', () => {
    const s = parseAbc('X:1\nL:1/8\nV:Davul instrument=drums\nK:C\nV:Davul\n[Fg] c');
    expect(s.events.map((e) => e.drum)).toEqual(['kick', 'hihatClosed', 'snare']);
  });

  it('perküsyon partisinde tonalite yok sayılır', () => {
    const s = parseAbc('X:1\nL:1/8\nV:D clef=perc\nK:D\nV:D\nc');
    expect(s.events[0].drum).toBe('snare');
  });
});

describe('dayanıklılık', () => {
  it('anlaşılamayan karakterlerde uyarı verir ama devam eder', () => {
    const s = parseAbc(tune('C # D'));
    expect(s.events.map((e) => e.pitch)).toEqual([60, 62]);
    expect(s.warnings.length).toBe(1);
    expect(s.warnings[0].line).toBe(6);
  });

  it('akor sembolleri, süslemeler, bağlar yok sayılır', () => {
    expect(pitches('"Am" !trill! (A B) ~c "^text" d')).toEqual([69, 71, 72, 74]);
  });

  it('dinamikler şiddeti etkiler', () => {
    const s = parseAbc(tune('!p! C !f! D !>! E E'));
    const v = s.events.map((e) => e.velocity);
    expect(v[0]).toBeLessThan(v[1]);
    expect(v[2]).toBeGreaterThan(v[1]);
    expect(v[3]).toBe(v[1]);
  });

  it('kaynak konumları kaydedilir', () => {
    const text = tune('C D');
    const s = parseAbc(text);
    expect(text.slice(s.events[1].src.start, s.events[1].src.end)).toBe('D');
  });

  it('boş girdi', () => {
    const s = parseAbc('');
    expect(s.events).toEqual([]);
    expect(s.totalBeats).toBe(0);
  });

  it('splitTunes', () => {
    expect(splitTunes('X:1\nK:C\nC\n\nX:2\nK:C\nD').length).toBe(2);
  });

  it('ölçü başlangıçları', () => {
    const s = parseAbc(tune('C2 D2 E2 F2 | G8 | c8 |'));
    expect(s.barStarts).toEqual([0, 4, 8]);
    expect(s.totalBeats).toBe(12);
  });
});

describe('ölçü denetimi', () => {
  it('tekrarın öncüsünü tamamlayan kısa son ölçü hata sayılmaz', () => {
    const s = parseAbc('X:1\nM:2/4\nL:1/16\nK:C\n|: BAGA | c2z2 dcBc | e4 :|\n|: cdef | g8 | e4 :|\nc8 |]');
    expect(s.barIssues).toEqual([]);
  });

  it('art arda iki kısa ölçü bir ölçü ediyorsa hata sayılmaz', () => {
    const s = parseAbc('X:1\nM:2/4\nL:1/16\nK:C\nc8 | e4 :| BAGA | c8 | c8 |]');
    expect(s.barIssues).toEqual([]);
  });

  it('gerçekten eksik ölçü yine bildirilir', () => {
    const s = parseAbc('X:1\nM:2/4\nL:1/16\nK:C\nc8 | e6 | c8 | c8 |]');
    expect(s.barIssues.map((b) => b.bar)).toEqual([2]);
  });
});
