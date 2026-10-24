/**
 * Perküsyon eşlemesi.
 *
 * ABC'de davul partileri `clef=perc` ile işaretlenir. Partideki her nota,
 * bir General MIDI (GM) perküsyon tuşuna eşlenir; GM tuşu da davul setimizdeki
 * bir parçaya (DrumPiece) karşılık gelir.
 *
 * Eşleme `%%percmap <nota> <davul> [kafa]` yönergesiyle değiştirilebilir.
 * Yönerge verilmezse, yaygın davul yazımındaki porte konumları kullanılır:
 *
 *   a  -> crash      g -> kapalı hi-hat   ^g -> açık hi-hat
 *   f  -> ride       e -> tiz tom         d  -> orta tom
 *   c  -> trampet    A -> yer tomu        F  -> bas davul (kick)
 */
import type { DrumPiece } from './types';

/** GM perküsyon isimleri (abcm2ps / abc2midi ile uyumlu). */
export const GM_DRUM_NAMES: Record<string, number> = {
  'acoustic-bass-drum': 35,
  'bass-drum-1': 36,
  'side-stick': 37,
  'acoustic-snare': 38,
  'hand-clap': 39,
  'electric-snare': 40,
  'low-floor-tom': 41,
  'closed-hi-hat': 42,
  'high-floor-tom': 43,
  'pedal-hi-hat': 44,
  'low-tom': 45,
  'open-hi-hat': 46,
  'low-mid-tom': 47,
  'hi-mid-tom': 48,
  'crash-cymbal-1': 49,
  'high-tom': 50,
  'ride-cymbal-1': 51,
  'chinese-cymbal': 52,
  'ride-bell': 53,
  tambourine: 54,
  'splash-cymbal': 55,
  cowbell: 56,
  'crash-cymbal-2': 57,
  'ride-cymbal-2': 59,
  // Kısa takma adlar
  kick: 36,
  bass: 36,
  snare: 38,
  hihat: 42,
  'hi-hat': 42,
  'open-hihat': 46,
  crash: 49,
  ride: 51,
  'tom-high': 50,
  'tom-mid': 47,
  'tom-floor': 41,
};

/** Bir GM perküsyon tuşunu setimizdeki parçaya çevirir. */
export function gmToDrumPiece(key: number): DrumPiece {
  switch (key) {
    case 35:
    case 36:
      return 'kick';
    case 37:
    case 38:
    case 39:
    case 40:
      return 'snare';
    case 42:
    case 44:
    case 54:
      return 'hihatClosed';
    case 46:
      return 'hihatOpen';
    case 41:
    case 43:
      return 'tomFloor';
    case 45:
    case 47:
      return 'tomMid';
    case 48:
    case 50:
      return 'tomHigh';
    case 49:
    case 52:
    case 55:
    case 57:
      return 'crash';
    case 51:
    case 53:
    case 56:
    case 59:
      return 'ride';
    default:
      return key < 41 ? 'kick' : key < 49 ? 'snare' : 'crash';
  }
}

/**
 * Varsayılan eşleme: porte konumunu belirten "doğal" MIDI perdesi -> GM tuşu.
 * Anahtar, notanın donanımsız (fakat açık değiştiricili) MIDI numarasıdır.
 */
export function defaultPercMap(): Map<number, number> {
  const m = new Map<number, number>();
  m.set(81, 49); // a  -> crash
  m.set(80, 46); // ^g -> açık hi-hat
  m.set(79, 42); // g  -> kapalı hi-hat
  m.set(77, 51); // f  -> ride
  m.set(76, 50); // e  -> tiz tom
  m.set(74, 47); // d  -> orta tom
  m.set(72, 38); // c  -> trampet
  m.set(73, 37); // ^c -> trampet kenarı
  m.set(71, 45); // B  -> alçak tom
  m.set(69, 41); // A  -> yer tomu
  m.set(65, 36); // F  -> kick
  m.set(64, 35); // E  -> kick 2
  m.set(62, 44); // D  -> pedal hi-hat
  m.set(84, 57); // c' -> crash 2
  return m;
}

/** "%%percmap" değerinin davul kısmını GM tuşuna çevirir. */
export function resolveDrumName(name: string): number | null {
  const n = name.trim().toLowerCase();
  if (/^\d+$/.test(n)) {
    const v = parseInt(n, 10);
    return v >= 27 && v <= 87 ? v : null;
  }
  return GM_DRUM_NAMES[n] ?? null;
}
