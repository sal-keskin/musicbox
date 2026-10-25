import { describe, expect, it } from 'vitest';
import { parseAbc, Timeline, fitToRange } from '../src/engine';
import { LIBRARY, TEMPLATE } from '../src/library/tunes';

const XYLO_LOW = 48; // C3
const XYLO_HIGH = 96; // C7

describe('eser kütüphanesi', () => {
  for (const tune of [...LIBRARY, { id: 'template', abc: TEMPLATE }]) {
    describe(tune.id, () => {
      const score = parseAbc(tune.abc);

      it('uyarısız ayrıştırılır', () => {
        expect(score.warnings).toEqual([]);
        expect(score.events.length).toBeGreaterThan(10);
        expect(score.title).not.toBe('İsimsiz');
      });

      it('her ölçünün süresi ölçü birimine uyar', () => {
        const issues = score.barIssues.map((b) => `${b.voice}:${b.bar} ${b.length}/${b.expected}`);
        expect(issues).toEqual([]);
      });

      it('tüm partiler aynı uzunlukta', () => {
        const lengths = score.voices.map((v) => `${v.id}=${v.length}`);
        const expected = score.voices.map((v) => `${v.id}=${score.totalBeats}`);
        expect(lengths).toEqual(expected);
        expect(new Timeline(score).duration).toBeGreaterThan(5);
      });

      it('ksilofon aralığına sığdırılabilir', () => {
        const fitted = fitToRange(score.events, XYLO_LOW, XYLO_HIGH);
        for (const ev of fitted) {
          if (ev.instrument === 'xylophone') {
            expect(ev.pitch).toBeGreaterThanOrEqual(XYLO_LOW);
            expect(ev.pitch).toBeLessThanOrEqual(XYLO_HIGH);
          } else {
            expect(ev.drum).toBeDefined();
          }
        }
      });
    });
  }

  it('kimlikler benzersiz', () => {
    const ids = LIBRARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Timeline', () => {
  it('tempo değişimlerini saniyeye doğru çevirir', () => {
    const s = parseAbc('X:1\nM:4/4\nL:1/4\nQ:1/4=60\nK:C\nC D E F | [Q:1/4=120] G A B c |');
    const tl = new Timeline(s);
    expect(tl.notes.map((n) => n.t)).toEqual([0, 1, 2, 3, 4, 4.5, 5, 5.5]);
    expect(tl.secToBeat(4.5)).toBeCloseTo(5);
    expect(tl.tempoAt(4.2)).toBe(120);
    expect(tl.barAt(4.6)).toEqual({ bar: 2, count: 2 });
    expect(tl.duration).toBeCloseTo(6);
  });

  it('firstIndexAtOrAfter ikili arama', () => {
    const s = parseAbc('X:1\nL:1/4\nQ:1/4=60\nK:C\nC D E F');
    const tl = new Timeline(s);
    expect(tl.firstIndexAtOrAfter(0)).toBe(0);
    expect(tl.firstIndexAtOrAfter(1.5)).toBe(2);
    expect(tl.firstIndexAtOrAfter(10)).toBe(4);
  });

  it('Mountain King hızlanır', () => {
    const s = parseAbc(LIBRARY.find((t) => t.id === 'dag-krali')!.abc);
    expect(s.tempo.map((t) => t.qpm)).toEqual([96, 126, 160]);
  });

  it('tekrarlar açıldığında Für Elise\'in ölçü sayısı doğru', () => {
    const s = parseAbc(LIBRARY.find((t) => t.id === 'fur-elise')!.abc);
    // öncü + 8 + 8 (tekrar) + 6 (B) + 8 (A')
    expect(s.barStarts.length).toBe(1 + 8 + 8 + 6 + 8);
  });
});
