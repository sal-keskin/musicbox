/**
 * ABC'deki K: (tonalite) alanını çözer ve her nota harfi için
 * donanım değiştirici (diyez/bemol) değerini üretir.
 */

/** Harf -> kromatik adım (C=0). */
export const LETTER_STEPS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Majör tonların donanımındaki diyez sayısı (bemoller negatif). */
const MAJOR_SHARPS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  // Enharmonik/teorik tonlar: en yakın karşılık
  'G#': 8, 'D#': 9, 'A#': 10, 'E#': 11, 'B#': 12, Fb: -8,
};

/** Modların aynı tonik üzerindeki majöre göre diyez farkı. */
const MODE_OFFSETS: Record<string, number> = {
  maj: 0, ion: 0, '': 0,
  min: -3, m: -3, aeo: -3,
  dor: -2, phr: -4, lyd: 1, mix: -1, loc: -5,
};

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Harf başına kromatik kaydırma (-2..+2). */
export type KeyAccidentals = Record<string, number>;

export interface KeyInfo {
  accidentals: KeyAccidentals;
  /** clef=perc gibi bir ifade varsa perküsyon partisi. */
  percussion: boolean;
  /** "transpose=" veya "octave=" ile gelen yarım ses kaydırması. */
  transpose: number;
}

export function emptyAccidentals(): KeyAccidentals {
  return { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
}

function accidentalsForSharps(count: number): KeyAccidentals {
  const acc = emptyAccidentals();
  if (count > 0) {
    for (let i = 0; i < count; i++) acc[SHARP_ORDER[i % 7]] += 1;
  } else if (count < 0) {
    for (let i = 0; i < -count; i++) acc[FLAT_ORDER[i % 7]] -= 1;
  }
  return acc;
}

/**
 * Bir K: değerini çözer. Örnekler: "C", "Am", "F#m", "Bb", "Dmix",
 * "G dorian", "D ^c", "none", "C clef=perc".
 * Tanınmayan bir ifade gelirse `null` döner (çağıran uyarı verir).
 */
export function parseKey(raw: string): KeyInfo | null {
  let text = raw.replace(/%.*$/, '').trim();
  const info: KeyInfo = { accidentals: emptyAccidentals(), percussion: false, transpose: 0 };

  // Anahtar=değer biçimindeki parametreleri ayıkla (clef=, transpose=, octave= ...)
  text = extractVoiceLikeParams(text, info);

  if (text === '' || /^none$/i.test(text)) return info;
  if (/^H[Pp]/.test(text)) return info; // Gayda tonları: donanımsız kabul et

  const m = /^([A-G])([#b]?)\s*([A-Za-z]*)\s*(.*)$/.exec(text);
  if (!m) return null;
  const tonic = m[1] + m[2];
  const modeWord = m[3].toLowerCase();
  const rest = m[4];

  const modeKey = modeWord === 'm' ? 'm' : modeWord.slice(0, 3);
  if (!(modeKey in MODE_OFFSETS)) return null;
  if (!(tonic in MAJOR_SHARPS)) return null;

  const sharps = MAJOR_SHARPS[tonic] + MODE_OFFSETS[modeKey];
  info.accidentals = accidentalsForSharps(Math.max(-7, Math.min(7, sharps)));

  // Açık değiştiriciler: "^f _b =c"
  const explicit = /(\^\^|\^|__|_|=)([A-Ga-g])/g;
  let em: RegExpExecArray | null;
  while ((em = explicit.exec(rest))) {
    info.accidentals[em[2].toUpperCase()] = accidentalValue(em[1]);
  }
  return info;
}

/**
 * K: ve V: alanlarında ortak kullanılan parametreleri okur ve metinden siler.
 */
export function extractVoiceLikeParams(text: string, info: { percussion: boolean; transpose: number }): string {
  return text
    .replace(/\b(clef|transpose|octave|middle|stafflines|staffscale|m)\s*=\s*("[^"]*"|\S+)/gi, (_all, key: string, value: string) => {
      const k = key.toLowerCase();
      const v = value.replace(/"/g, '').toLowerCase();
      if (k === 'clef' && v.startsWith('perc')) info.percussion = true;
      if (k === 'transpose') info.transpose += parseInt(v, 10) || 0;
      if (k === 'octave') info.transpose += 12 * (parseInt(v, 10) || 0);
      return '';
    })
    .replace(/\bperc(ussion)?\b/i, () => {
      info.percussion = true;
      return '';
    })
    .replace(/\b(treble|bass|alto|tenor)\d?\b/gi, '')
    .trim();
}

export function accidentalValue(symbol: string): number {
  switch (symbol) {
    case '^^':
      return 2;
    case '^':
      return 1;
    case '__':
      return -2;
    case '_':
      return -1;
    default:
      return 0;
  }
}
