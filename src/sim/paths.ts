/**
 * Bilye yörüngeleri. Her bilyenin konumu, notanın vuruş anına göre geçen
 * süreden (dt) analitik olarak hesaplanır; durum tutulmaz. Böylece ileri/geri
 * sarma, duraklatma ve hız değişimi kendiliğinden doğru çalışır.
 *
 *   dt < -FALL-EMERGE : henüz yok
 *   belirme           : nozulun ağzında büyür
 *   düşme             : serbest düşüş, dt = 0 anında hedefe değer
 *   sıçrama           : hedeften oluğa balistik yay
 *   yuvarlanma        : eğimli olukta hızlanarak kayar
 *   düşüş             : oluğun ucundan toplama kutusuna
 */
import {
  DROP_TIME,
  EMERGE_TIME,
  FALL_TIME,
  GRAVITY,
  MARBLE_RADIUS,
  ROLL_ACC,
  ROLL_V0,
  gutterY,
  rollTime,
  type Target,
  type Vec3,
} from './layout';

export type MarblePhase = 'pending' | 'emerge' | 'fall' | 'bounce' | 'roll' | 'drop' | 'done';

export interface MarbleState {
  phase: MarblePhase;
  pos: Vec3;
  scale: number;
  /** z ekseni etrafında dönüş açısı (yuvarlanma). */
  spin: number;
}

export function newMarbleState(): MarbleState {
  return { phase: 'pending', pos: { x: 0, y: 0, z: 0 }, scale: 0, spin: 0 };
}

/** Bilyenin hedefe değmesinden önceki görünür süre. */
export const BEFORE_HIT = FALL_TIME + EMERGE_TIME;

export function marbleAt(target: Target, dt: number, out: MarbleState): MarbleState {
  const p = out.pos;
  const { nozzle, hit, land } = target;

  if (dt < -BEFORE_HIT) {
    out.phase = 'pending';
    out.scale = 0;
    return out;
  }

  if (dt < -FALL_TIME) {
    const k = (dt + BEFORE_HIT) / EMERGE_TIME; // 0..1
    const e = 1 - (1 - k) * (1 - k);
    out.phase = 'emerge';
    p.x = nozzle.x;
    p.y = nozzle.y + (1 - e) * MARBLE_RADIUS * 1.6;
    p.z = nozzle.z;
    out.scale = 0.35 + 0.65 * e;
    out.spin = 0;
    return out;
  }

  if (dt < 0) {
    const tau = dt + FALL_TIME;
    out.phase = 'fall';
    p.x = nozzle.x;
    p.y = nozzle.y - 0.5 * GRAVITY * tau * tau;
    p.z = nozzle.z;
    out.scale = 1;
    out.spin = 0;
    return out;
  }

  const T = target.bounceTime;
  if (dt < T) {
    // p(t) = hit + v0 t - ½ g t²,  p(T) = land
    const vx = (land.x - hit.x) / T;
    const vz = (land.z - hit.z) / T;
    const vy = (land.y - hit.y + 0.5 * GRAVITY * T * T) / T;
    out.phase = 'bounce';
    p.x = hit.x + vx * dt;
    p.y = hit.y + vy * dt - 0.5 * GRAVITY * dt * dt;
    p.z = hit.z + vz * dt;
    out.scale = 1;
    out.spin = dt * 9;
    return out;
  }

  const g = target.gutter;
  const rollT = rollTime(target);
  const tr = dt - T;
  if (tr < rollT) {
    const dist = ROLL_V0 * tr + 0.5 * ROLL_ACC * tr * tr;
    out.phase = 'roll';
    p.x = land.x - dist;
    // Oluğa düşerken küçük, sönümlü sekmeler.
    const hop = 0.07 * Math.exp(-tr / 0.09) * Math.abs(Math.sin((tr * Math.PI) / 0.085));
    p.y = gutterY(g, p.x) + MARBLE_RADIUS + hop;
    p.z = g.z;
    out.scale = 1;
    out.spin = T * 9 + dist / MARBLE_RADIUS;
    return out;
  }

  const td = tr - rollT;
  if (td < DROP_TIME) {
    const vx = ROLL_V0 + ROLL_ACC * rollT;
    const x0 = g.xLow;
    out.phase = 'drop';
    p.x = x0 - vx * 0.55 * td;
    p.y = g.yLow + MARBLE_RADIUS - 0.5 * GRAVITY * td * td;
    p.z = g.z;
    const k = td / DROP_TIME;
    out.scale = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    const rolled = land.x - g.xLow;
    out.spin = T * 9 + rolled / MARBLE_RADIUS + (vx * td) / MARBLE_RADIUS;
    return out;
  }

  out.phase = 'done';
  out.scale = 0;
  return out;
}

/** Bilyenin oluğa ilk değdiği an (vuruştan sonra). */
export function landingDelay(target: Target): number {
  return target.bounceTime;
}
