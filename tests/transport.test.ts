import { describe, expect, it } from 'vitest';
import { Transport } from '../src/engine/transport';

function fakeClock() {
  let t = 100;
  return { clock: () => t, advance: (dt: number) => (t += dt) };
}

describe('Transport', () => {
  it('dururken zaman akmaz, çalarken akar', () => {
    const c = fakeClock();
    const tr = new Transport(c.clock);
    c.advance(5);
    expect(tr.songTime()).toBe(0);
    tr.play();
    c.advance(2);
    expect(tr.songTime()).toBe(2);
    tr.pause();
    c.advance(10);
    expect(tr.songTime()).toBe(2);
    tr.play();
    c.advance(1);
    expect(tr.songTime()).toBe(3);
  });

  it('hız değişimi atlamasız sürer', () => {
    const c = fakeClock();
    const tr = new Transport(c.clock);
    tr.play();
    c.advance(2);
    tr.setSpeed(2);
    expect(tr.songTime()).toBe(2);
    c.advance(1);
    expect(tr.songTime()).toBe(4);
    expect(tr.realTimeOf(6)).toBe(c.clock() + 1);
  });

  it('seek ve negatif başlangıç (bilyelerin düşme payı)', () => {
    const c = fakeClock();
    const tr = new Transport(c.clock);
    tr.seek(-1.5);
    tr.play();
    c.advance(1.5);
    expect(tr.songTime()).toBeCloseTo(0);
  });

  it('saat değişiminde konum korunur', () => {
    const c = fakeClock();
    const tr = new Transport(c.clock);
    tr.seek(7);
    tr.setClock(() => 3);
    expect(tr.songTime()).toBe(7);
    tr.play();
    expect(tr.songTime()).toBe(7);
  });
});
