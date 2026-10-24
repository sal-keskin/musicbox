import { describe, expect, it } from 'vitest';
import { buildLayout, barKey, drumKey, FALL_TIME, MARBLE_RADIUS, XYLO_HIGH, XYLO_LOW, rollTime } from '../src/sim/layout';
import { BEFORE_HIT, marbleAt, newMarbleState } from '../src/sim/paths';

const layout = buildLayout();

describe('yerleşim', () => {
  it('her perde ve davul için hedef var', () => {
    for (let m = XYLO_LOW; m <= XYLO_HIGH; m++) expect(layout.targets.has(barKey(m))).toBe(true);
    for (const p of ['kick', 'snare', 'hihatClosed', 'hihatOpen', 'tomHigh', 'tomMid', 'tomFloor', 'crash', 'ride'] as const) {
      expect(layout.targets.has(drumKey(p))).toBe(true);
    }
  });

  it('doğal çubuklar soldan sağa sıralı ve çakışmıyor', () => {
    const nat = layout.bars.filter((b) => !b.sharp);
    for (let i = 1; i < nat.length; i++) {
      expect(nat[i].x - nat[i - 1].x).toBeGreaterThan(nat[i].width);
    }
  });
});

describe('bilye yörüngesi', () => {
  const st = newMarbleState();
  for (const target of layout.targets.values()) {
    it(`${target.key} sürekli ve vuruş anında hedefte`, () => {
      // dt=0 anında tam vuruş noktası
      marbleAt(target, 0, st);
      expect(st.pos.y).toBeCloseTo(target.hit.y, 6);
      expect(st.pos.x).toBeCloseTo(target.hit.x, 6);

      // düşüş tam FALL_TIME sürer ve nozuldan başlar
      marbleAt(target, -FALL_TIME + 1e-9, st);
      expect(st.pos.y).toBeCloseTo(target.nozzle.y, 4);

      // tüm evreler boyunca büyük sıçramalar yok
      let prev = { ...marbleAt(target, -BEFORE_HIT + 1e-6, st).pos };
      const end = target.bounceTime + rollTime(target) + 0.5;
      for (let dt = -BEFORE_HIT; dt < end; dt += 1 / 240) {
        marbleAt(target, dt, st);
        if (st.phase === 'done' || st.phase === 'pending') continue;
        const d = Math.hypot(st.pos.x - prev.x, st.pos.y - prev.y, st.pos.z - prev.z);
        expect(d).toBeLessThan(0.2);
        prev = { ...st.pos };
      }
      expect(marbleAt(target, end + 1, st).phase).toBe('done');
    });
  }

  it('sıçrama oluğa iner', () => {
    const t = layout.targets.get(barKey(60))!;
    marbleAt(t, t.bounceTime - 1e-9, st);
    expect(st.pos.z).toBeCloseTo(t.gutter.z, 4);
    expect(st.pos.y).toBeCloseTo(t.land.y, 4);
    expect(t.land.y).toBeGreaterThan(t.gutter.yLow + MARBLE_RADIUS - 1e-9);
  });
});
