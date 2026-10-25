/**
 * Makinenin yerleşimi: ksilofon çubukları, davullar, nozullar ve oluklar.
 * Burada yalnızca sayısal geometri vardır (Three.js'e bağımlı değildir).
 *
 * Birim: 1 birim ≈ 10 cm. Zemin y=0, sahnenin önü +z yönündedir.
 */
import type { DrumPiece } from '../engine/types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Bilyelerin düştüğü her hedef (çubuk ya da davul). */
export interface Target {
  key: string;
  kind: 'bar' | 'drum';
  /** Bilyenin hedefe değdiği an merkezinin konumu. */
  hit: Vec3;
  /** Nozul ağzındaki bilye merkezi. */
  nozzle: Vec3;
  /** Sıçrayan bilyenin indiği nokta (oluk içinde). */
  land: Vec3;
  /** Sıçrama süresi (saniye). */
  bounceTime: number;
  /** Bilyenin yuvarlanacağı oluk. */
  gutter: Gutter;
  /** Sesin stereo konumu (-1 sol, +1 sağ). */
  pan: number;
  /** RGB renk (0..1). */
  color: [number, number, number];
}

export interface BarSpec {
  midi: number;
  sharp: boolean;
  x: number;
  /** Çubuğun merkezinin z konumu. */
  z: number;
  /** Çubuğun üst yüzeyinin yüksekliği. */
  top: number;
  length: number;
  width: number;
  thickness: number;
  color: [number, number, number];
}

export interface DrumSpec {
  piece: DrumPiece;
  /** Davul/zil merkezinin tabanı (x, z) ve vurulan yüzeyin yüksekliği. */
  x: number;
  z: number;
  top: number;
  radius: number;
  /** Davul gövdesinin yüksekliği (ziller için 0). */
  depth: number;
  cymbal: boolean;
  /** Zilin eğimi (radyan, x ekseni etrafında). */
  tilt: number;
}

/** Eğimli, düz bir oluk: bilyeler `from` ucundan `to` ucuna doğru yuvarlanır. */
export interface Gutter {
  id: string;
  z: number;
  /** Oluğun yüksek (sağ) ucunun x'i ve dibinin yüksekliği. */
  xHigh: number;
  yHigh: number;
  /** Alçak (sol) uç: bilyeler buradan toplama kabına düşer. */
  xLow: number;
  yLow: number;
}

export const MARBLE_RADIUS = 0.095;
export const GRAVITY = 9.8;
/** Bilyenin nozuldan çıkıp hedefe varması (saniye). */
export const FALL_TIME = 0.78;
export const FALL_HEIGHT = 0.5 * GRAVITY * FALL_TIME * FALL_TIME;
/** Nozuldan çıkış (büyüyerek belirme) süresi. */
export const EMERGE_TIME = 0.16;
/** Oluk sonundan kaba düşüş süresi. */
export const DROP_TIME = 0.42;
/** Oluktaki yuvarlanma: başlangıç hızı ve ivme. */
export const ROLL_V0 = 1.1;
export const ROLL_ACC = 2.4;

export const XYLO_LOW = 48; // C3
export const XYLO_HIGH = 96; // C7

const NATURAL_STEPS = new Set([0, 2, 4, 5, 7, 9, 11]);
const BAR_PITCH = 0.31; // doğal çubuklar arası mesafe
const BAR_WIDTH = 0.255;
const NAT_TOP = 2.4;
const SHARP_TOP = 2.62;
const ROW_GAP = 0.16;

/** Perde sınıfına göre gökkuşağı rengi (oyuncak ksilofonlardaki gibi). */
export function pitchColor(midi: number): [number, number, number] {
  const pc = ((midi % 12) + 12) % 12;
  // Do kırmızı, Re turuncu, Mi sarı, Fa yeşil, Sol turkuaz, La mavi, Si mor.
  const hue = [0, 0.04, 0.075, 0.105, 0.14, 0.3, 0.38, 0.47, 0.53, 0.6, 0.68, 0.76][pc];
  const sharp = !NATURAL_STEPS.has(pc);
  return hslToRgb(hue, sharp ? 0.62 : 0.86, sharp ? 0.4 : 0.56);
}

export function isSharp(midi: number): boolean {
  return !NATURAL_STEPS.has(((midi % 12) + 12) % 12);
}

function barLength(midi: number): number {
  const t = (midi - XYLO_LOW) / (XYLO_HIGH - XYLO_LOW);
  return 2.05 * Math.pow(1.02 / 2.05, t);
}

export interface MachineLayout {
  bars: BarSpec[];
  drums: DrumSpec[];
  targets: Map<string, Target>;
  gutters: Gutter[];
  /** Ksilofonun x kapsamı. */
  xyloMinX: number;
  xyloMaxX: number;
  /** Davul setinin merkezi. */
  kitX: number;
  /** Toplama kabının konumu. */
  collector: Vec3;
  /** Bilye yolunun en uzun ömrü (vuruştan sonra, saniye). */
  maxAfterHit: number;
}

export function barKey(midi: number): string {
  return `bar:${midi}`;
}

export function drumKey(piece: DrumPiece): string {
  return `drum:${piece}`;
}

export function buildLayout(): MachineLayout {
  // --- Ksilofon çubukları -----------------------------------------------
  let naturalIndex = 0;
  const naturalCount = countNaturals(XYLO_LOW, XYLO_HIGH);
  const totalWidth = (naturalCount - 1) * BAR_PITCH;
  const x0 = -totalWidth / 2 - 1.6;
  const bars: BarSpec[] = [];
  for (let midi = XYLO_LOW; midi <= XYLO_HIGH; midi++) {
    const sharp = isSharp(midi);
    const length = barLength(midi);
    let x: number;
    if (!sharp) {
      x = x0 + naturalIndex * BAR_PITCH;
      naturalIndex++;
    } else {
      x = x0 + (naturalIndex - 0.5) * BAR_PITCH; // iki doğal çubuğun arası
    }
    // Doğal çubukların arka kenarı z=0'da hizalı, öne doğru uzanır;
    // diyez çubukların ön kenarı arkada ve yukarıda hizalı.
    const z = sharp ? -ROW_GAP - length / 2 : length / 2;
    bars.push({
      midi,
      sharp,
      x,
      z,
      top: sharp ? SHARP_TOP : NAT_TOP,
      length,
      width: sharp ? BAR_WIDTH * 0.92 : BAR_WIDTH,
      thickness: 0.13 - 0.04 * ((midi - XYLO_LOW) / (XYLO_HIGH - XYLO_LOW)),
      color: pitchColor(midi),
    });
  }
  const xyloMinX = x0 - BAR_WIDTH;
  const xyloMaxX = x0 + totalWidth + BAR_WIDTH;

  // --- Davul seti ---------------------------------------------------------
  const kitX = xyloMaxX + 3.0;
  // Sıçrayan bilyeler öne (oluğa) gider; bu yüzden alçak davullar önde,
  // yüksek olanlar arkadadır ki yollar birbirini kesmesin.
  const drums: DrumSpec[] = [
    { piece: 'snare', x: kitX - 1.2, z: 0.55, top: 1.95, radius: 0.46, depth: 0.32, cymbal: false, tilt: 0 },
    { piece: 'kick', x: kitX + 0.05, z: 0.95, top: 1.0, radius: 0.78, depth: 0.95, cymbal: false, tilt: 0 },
    { piece: 'tomFloor', x: kitX + 1.4, z: 0.55, top: 1.7, radius: 0.56, depth: 0.85, cymbal: false, tilt: 0 },
    { piece: 'hihatClosed', x: kitX - 2.1, z: -0.3, top: 2.55, radius: 0.48, depth: 0, cymbal: true, tilt: 0 },
    { piece: 'tomHigh', x: kitX - 0.55, z: -0.55, top: 2.45, radius: 0.36, depth: 0.42, cymbal: false, tilt: 0 },
    { piece: 'tomMid', x: kitX + 0.45, z: -0.55, top: 2.4, radius: 0.42, depth: 0.48, cymbal: false, tilt: 0 },
    { piece: 'crash', x: kitX - 1.35, z: -1.6, top: 3.25, radius: 0.68, depth: 0, cymbal: true, tilt: 0.22 },
    { piece: 'ride', x: kitX + 1.65, z: -1.5, top: 3.0, radius: 0.78, depth: 0, cymbal: true, tilt: 0.18 },
  ];

  // --- Oluklar ------------------------------------------------------------
  const front: Gutter = {
    id: 'front',
    z: 2.45,
    xHigh: kitX + 2.6,
    yHigh: 1.78,
    xLow: xyloMinX - 0.5,
    yLow: 1.32,
  };
  const rear: Gutter = {
    id: 'rear',
    z: -2.55,
    xHigh: xyloMaxX + 0.4,
    yHigh: 1.86,
    xLow: xyloMinX - 0.5,
    yLow: 1.46,
  };
  const gutters = [front, rear];
  const collector: Vec3 = { x: xyloMinX - 1.15, y: 0.55, z: 0 };

  // --- Hedefler -----------------------------------------------------------
  const targets = new Map<string, Target>();
  const fullSpan = front.xHigh - xyloMinX;

  for (const bar of bars) {
    const gutter = bar.sharp ? rear : front;
    const hit: Vec3 = { x: bar.x, y: bar.top + MARBLE_RADIUS, z: bar.z };
    targets.set(barKey(bar.midi), {
      key: barKey(bar.midi),
      kind: 'bar',
      hit,
      nozzle: { x: hit.x, y: hit.y + FALL_HEIGHT, z: hit.z },
      land: landingPoint(gutter, hit.x - 0.12),
      bounceTime: 0.44 + Math.abs(gutter.z - hit.z) * 0.05,
      gutter,
      pan: -0.75 + 1.3 * ((bar.x - xyloMinX) / fullSpan),
      color: bar.color,
    });
  }

  const drumColors: Record<DrumPiece, [number, number, number]> = {
    kick: [0.93, 0.36, 0.42],
    snare: [0.98, 0.93, 0.85],
    tomHigh: [0.35, 0.78, 0.86],
    tomMid: [0.35, 0.72, 0.88],
    tomFloor: [0.4, 0.62, 0.95],
    hihatClosed: [0.98, 0.82, 0.42],
    hihatOpen: [0.98, 0.82, 0.42],
    crash: [1.0, 0.75, 0.35],
    ride: [0.96, 0.78, 0.45],
  };

  for (const d of drums) {
    // Ziller eğik: vuruş noktası merkezden biraz öne kaydırılır.
    const offsetZ = d.cymbal ? d.radius * 0.45 : d.radius * 0.15;
    const hitZ = d.z + offsetZ;
    const hitY = d.top - (d.cymbal ? Math.sin(d.tilt) * offsetZ : 0) + MARBLE_RADIUS;
    const hit: Vec3 = { x: d.x + (d.cymbal ? 0 : -d.radius * 0.1), y: hitY, z: hitZ };
    const target: Target = {
      key: drumKey(d.piece),
      kind: 'drum',
      hit,
      nozzle: { x: hit.x, y: hit.y + FALL_HEIGHT, z: hit.z },
      land: landingPoint(front, hit.x - 0.25),
      bounceTime: 0.5 + Math.abs(front.z - hit.z) * 0.07 + Math.max(0, front.yHigh - hit.y) * 0.08,
      gutter: front,
      pan: -0.75 + 1.3 * ((d.x - xyloMinX) / fullSpan),
      color: drumColors[d.piece],
    };
    targets.set(target.key, target);
    if (d.piece === 'hihatClosed') targets.set(drumKey('hihatOpen'), { ...target, key: drumKey('hihatOpen') });
  }

  let maxAfterHit = 0;
  for (const t of targets.values()) {
    maxAfterHit = Math.max(maxAfterHit, t.bounceTime + rollTime(t) + DROP_TIME);
  }

  return { bars, drums, targets, gutters, xyloMinX, xyloMaxX, kitX, collector, maxAfterHit };
}

function countNaturals(lo: number, hi: number): number {
  let n = 0;
  for (let m = lo; m <= hi; m++) if (!isSharp(m)) n++;
  return n;
}

/** Oluk dibinin x konumundaki yüksekliği. */
export function gutterY(g: Gutter, x: number): number {
  const t = (x - g.xLow) / (g.xHigh - g.xLow);
  return g.yLow + (g.yHigh - g.yLow) * t;
}

function landingPoint(g: Gutter, x: number): Vec3 {
  const cx = Math.min(g.xHigh - 0.2, Math.max(g.xLow + 0.4, x));
  return { x: cx, y: gutterY(g, cx) + MARBLE_RADIUS, z: g.z };
}

export function rollTime(t: Target): number {
  const d = t.land.x - t.gutter.xLow;
  return (-ROLL_V0 + Math.sqrt(ROLL_V0 * ROLL_V0 + 2 * ROLL_ACC * d)) / ROLL_ACC;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
