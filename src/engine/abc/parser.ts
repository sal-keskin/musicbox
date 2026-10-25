/**
 * ABC notasyonu ayrıştırıcısı.
 *
 * ABC (https://abcnotation.com) düz metin tabanlı, yaygın bir müzik yazım
 * standardıdır. Bu modül ABC 2.1'in çalma için gereken kısmını destekler:
 *
 *  - Başlık alanları: X T C M L Q K V, ayrıca %%percmap ve %%MIDI channel 10
 *  - Notalar, değiştiriciler (^ _ = ^^ __), oktav işaretleri (' ,), süreler
 *  - Akorlar [CEG], bağlar (-), noktalı ritim (> <), üçlemeler ve n'lemeler
 *  - Süsleme notaları {g}, dinamikler !p! !f! ..., vurgu !>! / L, staccato .
 *  - Ölçü çizgileri, tekrarlar |: :| ::, dönüşler [1 [2 |1 :|2
 *  - Satır içi alanlar [K:..] [M:..] [L:..] [Q:..] [V:..]
 *  - Çok sesli yazım (V:), perküsyon partileri (clef=perc)
 *
 * Ayrıştırıcı hatalı girişte asla istisna fırlatmaz; anlayamadığı yerleri
 * atlayıp `warnings` listesine satır/sütun bilgisiyle ekler.
 */
import type { BarIssue, InstrumentId, Meter, NoteEvent, ParseWarning, Score, TempoChange, VoiceInfo } from '../types';
import { accidentalValue, emptyAccidentals, extractVoiceLikeParams, LETTER_STEPS, parseKey, type KeyAccidentals } from './keys';
import { defaultPercMap, gmToDrumPiece, resolveDrumName } from '../percussion';

// ---------------------------------------------------------------------------
// Ara yapılar
// ---------------------------------------------------------------------------

interface PNote {
  pitch: number;
  /** Süre (dörtlük). */
  length: number;
  tie: boolean;
  /** Perküsyon partisinde GM tuşu. */
  gm?: number;
  src: { start: number; end: number };
}

interface NotesElement {
  kind: 'notes';
  /** Ölçü başından itibaren konum (dörtlük). */
  offset: number;
  /** İmlecin ne kadar ilerlediği (dörtlük). */
  advance: number;
  notes: PNote[];
  velocity: number;
  staccato: boolean;
  grace: PNote[];
}

interface RestElement {
  kind: 'rest';
  offset: number;
  advance: number;
}

interface TempoElement {
  kind: 'tempo';
  offset: number;
  qpm: number;
}

type Element = NotesElement | RestElement | TempoElement;

interface Bar {
  elements: Element[];
  /** Ölçü kapanırken geçerli olan ölçü biriminin süresi (dörtlük). */
  expected: number;
  /** Ölçünün toplam süresi (dörtlük). */
  length: number;
  startRepeat: boolean;
  endRepeat: boolean;
  endings: number[] | null;
}

interface VoiceDecl {
  id: string;
  name: string;
  percussion: boolean;
  rawGm: boolean;
  transpose: number;
}

interface VoiceState extends VoiceDecl {
  key: KeyAccidentals;
  unit: number; // L: değeri, birlik nota cinsinden (ör. 1/8)
  meter: Meter;
  bars: Bar[];
  bar: Bar;
  barAcc: Map<string, number>;
  tuplet: { remaining: number; factor: number } | null;
  pendingBroken: number | null;
  lastElement: NotesElement | RestElement | null;
  dynamic: number;
  pendingAccent: boolean;
  pendingStaccato: boolean;
  pendingGrace: PNote[];
  pendingStartRepeat: boolean;
  pendingEndings: number[] | null;
  inEndings: number[] | null;
  percMap: Map<number, number>;
}

const DYNAMICS: Record<string, number> = {
  pppp: 0.18,
  ppp: 0.25,
  pp: 0.34,
  p: 0.44,
  mp: 0.55,
  mf: 0.66,
  f: 0.78,
  ff: 0.88,
  fff: 0.95,
  ffff: 1,
};

const TEMPO_WORDS: Record<string, number> = {
  grave: 40,
  largo: 50,
  lento: 56,
  adagio: 70,
  andante: 92,
  andantino: 100,
  moderato: 112,
  allegretto: 120,
  allegro: 138,
  vivace: 160,
  presto: 180,
  prestissimo: 200,
};

const DEFAULT_VELOCITY = DYNAMICS.mf;
const GRACE_LENGTH = 0.09; // dörtlük cinsinden süsleme notası süresi
const EPS = 1e-6;

// ---------------------------------------------------------------------------
// Dış API
// ---------------------------------------------------------------------------

/** Birden fazla eser içeren bir ABC metnini X: alanlarına göre böler. */
export function splitTunes(text: string): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^X:/.test(line) && current.some((l) => /^X:/.test(l))) {
      parts.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.some((l) => l.trim() !== '')) parts.push(current.join('\n'));
  return parts;
}

/** Bir ABC eserini (ilk X: bloğu) ayrıştırıp çalınabilir bir `Score` üretir. */
export function parseAbc(text: string): Score {
  return new AbcParser(text).parse();
}

// ---------------------------------------------------------------------------
// Ayrıştırıcı
// ---------------------------------------------------------------------------

class AbcParser {
  private readonly text: string;
  private readonly warnings: ParseWarning[] = [];

  private title = '';
  private composer = '';
  private meter: Meter = { num: 4, den: 4 };
  private meterGiven = false;
  private unit: number | null = null;
  private key: KeyAccidentals = emptyAccidentals();
  private keyPercussion = false;
  private keyTranspose = 0;
  private headerTempo: number | null = null;
  private globalPercMap = defaultPercMap();

  private readonly decls = new Map<string, VoiceDecl>();
  private readonly voices = new Map<string, VoiceState>();
  private readonly voiceOrder: string[] = [];
  private current: VoiceState | null = null;

  /** Şu an işlenen satırın metin içindeki başlangıç konumu. */
  private lineOffset = 0;

  constructor(text: string) {
    this.text = text;
  }

  parse(): Score {
    const lines = this.text.split('\n');
    let offset = 0;
    let inHeader = true;
    let seenX = false;

    for (let li = 0; li < lines.length; li++) {
      const rawLine = lines[li].replace(/\r$/, '');
      this.lineOffset = offset;
      offset += lines[li].length + 1;

      const line = rawLine;
      const trimmed = line.trim();

      if (/^X:/.test(trimmed)) {
        if (seenX) break; // Sonraki eser başladı
        seenX = true;
        continue;
      }
      if (trimmed === '') continue;
      if (trimmed.startsWith('%%')) {
        this.directive(trimmed.slice(2), line.indexOf('%%'));
        continue;
      }
      if (trimmed.startsWith('%')) continue;

      const field = /^([A-Za-z]):(.*)$/.exec(line);
      if (field) {
        const [, name, value] = field;
        if (inHeader) {
          if (this.headerField(name, value.trim(), field.index + 2)) inHeader = false;
        } else {
          this.bodyField(name, value.trim(), 2);
        }
        continue;
      }

      if (inHeader) {
        // K: olmadan müziğe geçildi: varsayılanlarla devam et.
        this.warn('K: (tonalite) alanı bulunamadı, Do majör varsayıldı.', 0);
        inHeader = false;
      }
      this.musicLine(line);
    }

    return this.finish();
  }

  // -------------------------------------------------------------------------
  // Başlık ve alanlar
  // -------------------------------------------------------------------------

  /** Başlık alanını işler. Başlık K: ile bittiyse true döner. */
  private headerField(name: string, value: string, col: number): boolean {
    switch (name) {
      case 'T':
        if (!this.title) this.title = value;
        return false;
      case 'C':
        if (!this.composer) this.composer = value;
        return false;
      case 'M':
        this.setGlobalMeter(value, col);
        return false;
      case 'L': {
        const u = parseFraction(value);
        if (u) this.unit = u;
        else this.warn(`Geçersiz L: değeri "${value}"`, col);
        return false;
      }
      case 'Q': {
        const q = this.parseTempo(value, this.unit ?? this.defaultUnit());
        if (q) this.headerTempo = q;
        else this.warn(`Geçersiz Q: (tempo) değeri "${value}"`, col);
        return false;
      }
      case 'V':
        this.declareVoice(value);
        return false;
      case 'I':
        this.directive(value, col);
        return false;
      case 'K': {
        const k = parseKey(value);
        if (k) {
          this.key = k.accidentals;
          this.keyPercussion = k.percussion;
          this.keyTranspose = k.transpose;
        } else {
          this.warn(`Tanınmayan tonalite "${value}", Do majör varsayıldı.`, col);
        }
        return true;
      }
      default:
        return false; // R, O, Z, N, S, B, H, W ... çalmayı etkilemez
    }
  }

  private bodyField(name: string, value: string, col: number): void {
    switch (name) {
      case 'V':
        this.switchVoice(value);
        break;
      case 'K': {
        const vs = this.voice();
        const k = parseKey(value);
        if (k) {
          vs.key = k.accidentals;
          if (k.percussion) vs.percussion = true;
          if (k.transpose) vs.transpose = k.transpose;
        } else this.warn(`Tanınmayan tonalite "${value}"`, col);
        break;
      }
      case 'L': {
        const u = parseFraction(value);
        if (u) this.voice().unit = u;
        else this.warn(`Geçersiz L: değeri "${value}"`, col);
        break;
      }
      case 'M': {
        const m = parseMeter(value);
        if (m) this.voice().meter = m;
        else this.warn(`Geçersiz M: değeri "${value}"`, col);
        break;
      }
      case 'Q': {
        const vs = this.voice();
        const q = this.parseTempo(value, vs.unit);
        if (q) vs.bar.elements.push({ kind: 'tempo', offset: vs.bar.length, qpm: q });
        else this.warn(`Geçersiz Q: değeri "${value}"`, col);
        break;
      }
      case 'I':
        this.directive(value, col);
        break;
      default:
        break; // T, P, w, W, N ... yok sayılır
    }
  }

  private directive(text: string, col: number): void {
    const t = text.trim();
    const percmap = /^percmap\s+(\S+)\s+(\S+)/i.exec(t);
    if (percmap) {
      const pitch = naturalPitchOf(percmap[1]);
      const gm = resolveDrumName(percmap[2]);
      if (pitch === null || gm === null) {
        this.warn(`Anlaşılamayan percmap: "${t}"`, col);
        return;
      }
      const target = this.current ? this.current.percMap : this.globalPercMap;
      target.set(pitch, gm);
      return;
    }
    const channel = /^MIDI\s+channel\s+(\d+)/i.exec(t);
    if (channel && parseInt(channel[1], 10) === 10) {
      if (this.current) {
        this.current.percussion = true;
        this.current.rawGm = true;
      } else {
        this.keyPercussion = true;
      }
    }
    // Diğer yönergeler (%%score, %%MIDI program ...) çalmayı etkilemiyor.
  }

  private setGlobalMeter(value: string, col: number): void {
    const m = parseMeter(value);
    if (m) {
      this.meter = m;
      this.meterGiven = true;
    } else if (/^none$/i.test(value.trim())) {
      this.meterGiven = false;
    } else {
      this.warn(`Geçersiz M: değeri "${value}"`, col);
    }
  }

  private defaultUnit(): number {
    if (!this.meterGiven) return 1 / 8;
    return this.meter.num / this.meter.den < 0.75 ? 1 / 16 : 1 / 8;
  }

  private parseTempo(value: string, unit: number): number | null {
    const words = [...value.matchAll(/"([^"]*)"/g)].map((m) => m[1].toLowerCase());
    const bare = value.replace(/"[^"]*"/g, ' ').trim();

    const full = /((?:\d+\/\d+\s*)+)=\s*(\d+(?:\.\d+)?)/.exec(bare);
    if (full) {
      const beat = full[1]
        .trim()
        .split(/\s+/)
        .map((f) => parseFraction(f) ?? 0)
        .reduce((a, b) => a + b, 0);
      const bpm = parseFloat(full[2]);
      if (beat > 0 && bpm > 0) return bpm * beat * 4;
    }
    const legacy = /^(?:C\d*\s*=\s*)?(\d+(?:\.\d+)?)$/.exec(bare);
    if (legacy) {
      const bpm = parseFloat(legacy[1]);
      if (bpm > 0) return bpm * unit * 4;
    }
    for (const w of words) {
      const first = w.split(/\s+/)[0];
      if (first in TEMPO_WORDS) return TEMPO_WORDS[first];
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Sesler (partiler)
  // -------------------------------------------------------------------------

  private parseVoiceDecl(value: string): VoiceDecl {
    const idMatch = /^\s*(\S+)/.exec(value);
    const id = idMatch ? idMatch[1] : '1';
    let rest = value.slice(idMatch ? idMatch.index + idMatch[0].length : 0);
    const existing = this.decls.get(id);
    const decl: VoiceDecl = existing
      ? { ...existing }
      : { id, name: '', percussion: this.keyPercussion, rawGm: false, transpose: 0 };

    const name = /\b(?:name|nm)\s*=\s*"([^"]*)"/i.exec(rest) ?? /\b(?:name|nm)\s*=\s*(\S+)/i.exec(rest);
    if (name) decl.name = name[1];
    rest = rest.replace(/\b(?:name|nm|subname|snm)\s*=\s*("[^"]*"|\S+)/gi, '');

    const instrument = /\binstrument\s*=\s*"?(\w+)"?/i.exec(rest);
    if (instrument) {
      const v = instrument[1].toLowerCase();
      if (/^(drums?|perc|davul)/.test(v)) decl.percussion = true;
      if (/^(xylo|ksilofon)/.test(v)) decl.percussion = false;
      rest = rest.replace(instrument[0], '');
    }
    const params = { percussion: decl.percussion, transpose: 0 };
    extractVoiceLikeParams(rest, params);
    decl.percussion = params.percussion;
    if (params.transpose) decl.transpose = params.transpose;
    return decl;
  }

  private declareVoice(value: string): void {
    const decl = this.parseVoiceDecl(value);
    this.decls.set(decl.id, decl);
  }

  private switchVoice(value: string): void {
    const decl = this.parseVoiceDecl(value);
    this.decls.set(decl.id, decl);
    const vs = this.voices.get(decl.id);
    if (vs) {
      vs.name = decl.name;
      vs.percussion = decl.percussion;
      vs.transpose = decl.transpose;
      this.current = vs;
    } else {
      this.current = this.createVoice(decl);
    }
  }

  private createVoice(decl: VoiceDecl): VoiceState {
    const bar = newBar();
    const vs: VoiceState = {
      ...decl,
      transpose: decl.transpose || this.keyTranspose,
      key: { ...this.key },
      unit: this.unit ?? this.defaultUnit(),
      meter: { ...this.meter },
      bars: [],
      bar,
      barAcc: new Map(),
      tuplet: null,
      pendingBroken: null,
      lastElement: null,
      dynamic: DEFAULT_VELOCITY,
      pendingAccent: false,
      pendingStaccato: false,
      pendingGrace: [],
      pendingStartRepeat: false,
      pendingEndings: null,
      inEndings: null,
      percMap: new Map(this.globalPercMap),
    };
    this.voices.set(decl.id, vs);
    this.voiceOrder.push(decl.id);
    return vs;
  }

  /** Geçerli ses; hiç V: yoksa ilk tanımlanan ya da "1" adlı sesi açar. */
  private voice(): VoiceState {
    if (this.current) return this.current;
    const firstDecl = this.decls.values().next().value as VoiceDecl | undefined;
    const decl = firstDecl ?? { id: '1', name: '', percussion: this.keyPercussion, rawGm: false, transpose: 0 };
    this.current = this.voices.get(decl.id) ?? this.createVoice(decl);
    return this.current;
  }

  // -------------------------------------------------------------------------
  // Müzik satırı
  // -------------------------------------------------------------------------

  private musicLine(line: string): void {
    let i = 0;
    const n = line.length;

    while (i < n) {
      const c = line[i];
      const rest = line.slice(i);

      if (c === ' ' || c === '\t' || c === '`' || c === '$' || c === '\\' || c === '*') {
        i++;
        continue;
      }
      if (c === '%') break;

      if (c === '"') {
        const end = line.indexOf('"', i + 1);
        i = end < 0 ? n : end + 1;
        continue;
      }
      if (c === '!' || c === '+') {
        const end = line.indexOf(c, i + 1);
        if (end < 0) {
          this.warn(`Kapanmayan süsleme "${c}"`, i);
          i = n;
          continue;
        }
        this.decoration(line.slice(i + 1, end));
        i = end + 1;
        continue;
      }
      if (c === '{') {
        const end = line.indexOf('}', i + 1);
        if (end < 0) {
          this.warn('Kapanmayan süsleme notası grubu "{"', i);
          i = n;
          continue;
        }
        this.graceGroup(line.slice(i + 1, end), i + 1);
        i = end + 1;
        continue;
      }
      if (c === '(') {
        const tup = /^\((\d+)(?::(\d*))?(?::(\d*))?/.exec(rest);
        if (tup) {
          this.startTuplet(parseInt(tup[1], 10), tup[2], tup[3]);
          i += tup[0].length;
        } else i++; // legato bağı: çalmayı etkilemez
        continue;
      }
      if (c === ')') {
        i++;
        continue;
      }
      if (c === '[') {
        const inline = /^\[([A-Za-z]):([^\]]*)\]/.exec(rest);
        if (inline) {
          this.bodyField(inline[1], inline[2].trim(), i);
          i += inline[0].length;
          continue;
        }
        const ending = /^\[(\d+(?:[,-]\d+)*)/.exec(rest);
        if (ending) {
          this.setEnding(ending[1]);
          i += ending[0].length;
          continue;
        }
        if (/^\[\|/.test(rest)) {
          i += this.barline(rest);
          continue;
        }
        i += this.chord(line, i);
        continue;
      }
      if (c === '|' || (c === ':' && /^:+[|\]:[]/.test(rest)) || (c === '.' && rest[1] === '|')) {
        i += this.barline(rest);
        continue;
      }
      if (c === '.') {
        this.voice().pendingStaccato = true;
        i++;
        continue;
      }
      if (c === '>' || c === '<') {
        const m = /^(>+|<+)/.exec(rest)!;
        this.brokenRhythm(m[1]);
        i += m[1].length;
        continue;
      }
      if (c === '-') {
        this.tieLast();
        i++;
        continue;
      }
      if (c === '&') {
        this.warn('Ses bindirme (&) desteklenmiyor, ölçünün kalanı yok sayıldı.', i);
        const bar = line.indexOf('|', i);
        i = bar < 0 ? n : bar;
        continue;
      }

      const note = NOTE_RE.exec(rest);
      if (note) {
        this.singleNote(note, i);
        i += note[0].length;
        continue;
      }
      const restM = /^([zx])(\d*)(\/*)(\d*)/.exec(rest);
      if (restM) {
        this.rest(lengthOf(restM[2], restM[3], restM[4]));
        i += restM[0].length;
        continue;
      }
      const mmRest = /^([ZX])(\d*)/.exec(rest);
      if (mmRest) {
        this.multiMeasureRest(mmRest[2] ? parseInt(mmRest[2], 10) : 1);
        i += mmRest[0].length;
        continue;
      }
      const spacer = /^y(\d*)(\/*)(\d*)/.exec(rest);
      if (spacer) {
        i += spacer[0].length;
        continue;
      }
      if (/[~HIJKLMNOPQRSTUVWYhijklmnopqrstuvw]/.test(c)) {
        // Tek harfli süsleme kısayolları (L = vurgu); diğerleri yok sayılır.
        if (c === 'L') this.voice().pendingAccent = true;
        i++;
        continue;
      }

      this.warn(`Anlaşılamayan karakter "${c}"`, i);
      i++;
    }
  }

  private decoration(name: string): void {
    const vs = this.voice();
    const key = name.trim().toLowerCase();
    if (key in DYNAMICS) vs.dynamic = DYNAMICS[key];
    else if (key === 'accent' || key === '>' || key === 'emphasis' || key === 'sfz' || key === 'sf') vs.pendingAccent = true;
    else if (key === 'staccato') vs.pendingStaccato = true;
  }

  private graceGroup(body: string, col: number): void {
    const vs = this.voice();
    const re = new RegExp(NOTE_RE.source.slice(1), 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const p = this.resolvePitch(vs, m[1] ?? null, m[2], m[3]);
      vs.pendingGrace.push({
        pitch: p.pitch,
        gm: p.gm,
        length: GRACE_LENGTH,
        tie: false,
        src: { start: this.abs(col + m.index), end: this.abs(col + m.index + m[0].length) },
      });
    }
  }

  private startTuplet(p: number, qRaw: string | undefined, rRaw: string | undefined): void {
    const vs = this.voice();
    const compound = vs.meter.num % 3 === 0 && vs.meter.num > 3;
    const defaults: Record<number, number> = { 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 };
    const q = qRaw ? parseInt(qRaw, 10) : (defaults[p] ?? (compound ? 3 : 2));
    const r = rRaw ? parseInt(rRaw, 10) : p;
    if (p > 0 && q > 0 && r > 0) vs.tuplet = { remaining: r, factor: q / p };
  }

  /** Bir süre çarpanına tuplet ve noktalı ritim etkilerini uygular. */
  private applyRhythmModifiers(vs: VoiceState, mult: number): number {
    let m = mult;
    if (vs.tuplet) {
      m *= vs.tuplet.factor;
      vs.tuplet.remaining--;
      if (vs.tuplet.remaining <= 0) vs.tuplet = null;
    }
    if (vs.pendingBroken !== null) {
      m *= vs.pendingBroken;
      vs.pendingBroken = null;
    }
    return m;
  }

  private singleNote(m: RegExpExecArray, col: number): void {
    const vs = this.voice();
    const mult = this.applyRhythmModifiers(vs, lengthOf(m[4], m[5], m[6]));
    const length = mult * vs.unit * 4;
    const p = this.resolvePitch(vs, m[1] ?? null, m[2], m[3]);
    const note: PNote = {
      pitch: p.pitch,
      gm: p.gm,
      length,
      tie: false,
      src: { start: this.abs(col), end: this.abs(col + m[0].length) },
    };
    this.pushNotes(vs, [note], length);
  }

  /** Akor ayrıştırır: [CEG]2 gibi. Tüketilen karakter sayısını döner. */
  private chord(line: string, start: number): number {
    const vs = this.voice();
    const close = line.indexOf(']', start + 1);
    if (close < 0) {
      this.warn('Kapanmayan akor "["', start);
      return line.length - start;
    }
    const body = line.slice(start + 1, close);
    const notes: PNote[] = [];
    let j = 0;
    while (j < body.length) {
      const sub = body.slice(j);
      const nm = NOTE_RE.exec(sub);
      if (nm) {
        const p = this.resolvePitch(vs, nm[1] ?? null, nm[2], nm[3]);
        notes.push({
          pitch: p.pitch,
          gm: p.gm,
          length: lengthOf(nm[4], nm[5], nm[6]),
          tie: false,
          src: { start: this.abs(start + 1 + j), end: this.abs(start + 1 + j + nm[0].length) },
        });
        j += nm[0].length;
        continue;
      }
      const ch = body[j];
      if (ch === '-' && notes.length) notes[notes.length - 1].tie = true;
      else if (ch === '!' || ch === '+') {
        const end = body.indexOf(ch, j + 1);
        if (end > j) {
          this.decoration(body.slice(j + 1, end));
          j = end;
        }
      } else if (ch === '"') {
        const end = body.indexOf('"', j + 1);
        if (end > j) j = end;
      } else if (ch === '.') vs.pendingStaccato = true;
      else if (ch !== ' ' && ch !== ')' && ch !== '(' && !/[~HLMOPSTuv]/.test(ch)) {
        this.warn(`Akor içinde anlaşılamayan karakter "${ch}"`, start + 1 + j);
      }
      j++;
    }
    let consumed = close + 1 - start;
    const after = /^(\d*)(\/*)(\d*)(-?)/.exec(line.slice(close + 1))!;
    consumed += after[0].length;

    if (notes.length === 0) {
      this.warn('Boş akor', start);
      return consumed;
    }
    const outer = this.applyRhythmModifiers(vs, lengthOf(after[1], after[2], after[3]));
    for (const nt of notes) {
      nt.length *= outer * vs.unit * 4;
      if (after[4]) nt.tie = true;
    }
    this.pushNotes(vs, notes, notes[0].length);
    return consumed;
  }

  private pushNotes(vs: VoiceState, notes: PNote[], advance: number): void {
    let velocity = vs.dynamic;
    if (vs.pendingAccent) velocity = Math.min(1, velocity + 0.18);
    const el: NotesElement = {
      kind: 'notes',
      offset: vs.bar.length,
      advance,
      notes,
      velocity,
      staccato: vs.pendingStaccato,
      grace: vs.pendingGrace,
    };
    vs.pendingAccent = false;
    vs.pendingStaccato = false;
    vs.pendingGrace = [];
    vs.bar.elements.push(el);
    vs.bar.length += advance;
    vs.lastElement = el;
  }

  private rest(lengthMult: number): void {
    const vs = this.voice();
    const mult = this.applyRhythmModifiers(vs, lengthMult);
    const advance = mult * vs.unit * 4;
    const el: RestElement = { kind: 'rest', offset: vs.bar.length, advance };
    vs.bar.elements.push(el);
    vs.bar.length += advance;
    vs.lastElement = el;
  }

  private multiMeasureRest(count: number): void {
    const vs = this.voice();
    const barLen = (vs.meter.num / vs.meter.den) * 4;
    for (let k = 0; k < count; k++) {
      vs.bar.elements.push({ kind: 'rest', offset: vs.bar.length, advance: barLen });
      vs.bar.length += barLen;
      if (k < count - 1) this.closeBar(vs, false, false, false);
    }
    vs.lastElement = null;
  }

  private brokenRhythm(symbol: string): void {
    const vs = this.voice();
    const prev = vs.lastElement;
    if (!prev) {
      this.warn(`"${symbol}" öncesinde nota yok`, 0);
      return;
    }
    const n = symbol.length;
    const shrink = 1 / 2 ** n;
    const grow = 2 - shrink;
    const [prevFactor, nextFactor] = symbol[0] === '>' ? [grow, shrink] : [shrink, grow];
    const delta = prev.advance * (prevFactor - 1);
    prev.advance *= prevFactor;
    if (prev.kind === 'notes') for (const nt of prev.notes) nt.length *= prevFactor;
    vs.bar.length += delta;
    vs.pendingBroken = nextFactor;
  }

  private tieLast(): void {
    const vs = this.voice();
    const prev = vs.lastElement;
    if (prev && prev.kind === 'notes') for (const nt of prev.notes) nt.tie = true;
  }

  private setEnding(spec: string): void {
    const vs = this.voice();
    const set = new Set<number>();
    for (const part of spec.split(',')) {
      const range = /^(\d+)-(\d+)$/.exec(part);
      if (range) {
        for (let k = parseInt(range[1], 10); k <= parseInt(range[2], 10); k++) set.add(k);
      } else if (part) set.add(parseInt(part, 10));
    }
    const endings = [...set].sort((a, b) => a - b);
    // Ölçü henüz boşsa doğrudan ona, değilse bir sonrakine uygula.
    if (vs.bar.elements.every((e) => e.kind === 'tempo')) {
      vs.bar.endings = endings;
      vs.inEndings = endings;
    } else {
      vs.pendingEndings = endings;
    }
  }

  /** Ölçü çizgisini işler, tüketilen karakter sayısını döner. */
  private barline(rest: string): number {
    const m = /^(?:\.?(?::*\[?\|+\]?:*|\[\|\]?:*)|:{2,})/.exec(rest);
    if (!m || m[0] === '') return 1;
    const sym = m[0];
    const endRepeat = /^\.?:/.test(sym);
    const startRepeat = /:$/.test(sym);
    const plain = sym === '|' || sym === '.|';

    const vs = this.voice();
    this.closeBar(vs, endRepeat, startRepeat, !plain);

    let consumed = sym.length;
    // Ölçü çizgisini hemen izleyen dönüş numarası: |1  :|2  | [2
    const after = rest.slice(consumed);
    const ending = /^(\s*\[)?(\d+(?:[,-]\d+)*)/.exec(after);
    if (ending && (ending[1] || /^\d/.test(after))) {
      this.setEnding(ending[2]);
      consumed += ending[0].length;
    }
    return consumed;
  }

  /**
   * Geçerli ölçüyü kapatıp yenisini açar.
   * @param endRepeat  kapanan ölçünün sonunda :| var mı
   * @param startRepeat yeni ölçünün başında |: var mı
   * @param terminatesEnding bu çizgi dönüş parantezini bitirir mi (|| :| |] ...)
   */
  private closeBar(vs: VoiceState, endRepeat: boolean, startRepeat: boolean, terminatesEnding: boolean): void {
    const bar = vs.bar;
    if (terminatesEnding) vs.inEndings = null;

    if (bar.elements.some((e) => e.kind !== 'tempo')) {
      if (endRepeat) bar.endRepeat = true;
      bar.expected = meterBeats(vs.meter);
      if (vs.pendingStartRepeat) {
        bar.startRepeat = true;
        vs.pendingStartRepeat = false;
      }
      vs.bars.push(bar);
      vs.bar = newBar();
      if (vs.pendingEndings) {
        vs.inEndings = vs.pendingEndings;
        vs.pendingEndings = null;
      }
      if (vs.inEndings) vs.bar.endings = vs.inEndings;
    } else if (endRepeat && vs.bars.length) {
      // Boş ölçü (ör. satır başındaki :|): işareti önceki ölçüye ait.
      vs.bars[vs.bars.length - 1].endRepeat = true;
    }
    if (startRepeat) vs.pendingStartRepeat = true;
    vs.barAcc.clear();
  }

  // -------------------------------------------------------------------------
  // Perdeler
  // -------------------------------------------------------------------------

  private resolvePitch(
    vs: VoiceState,
    acc: string | null,
    letter: string,
    octMarks: string,
  ): { pitch: number; gm?: number } {
    const upper = letter.toUpperCase();
    let octave = letter === upper ? 4 : 5;
    for (const ch of octMarks) octave += ch === "'" ? 1 : -1;
    const natural = 12 * (octave + 1) + LETTER_STEPS[upper];
    const barKey = upper + octave;

    let alter: number;
    if (acc !== null) {
      alter = accidentalValue(acc);
      vs.barAcc.set(barKey, alter);
    } else if (vs.barAcc.has(barKey)) {
      alter = vs.barAcc.get(barKey)!;
    } else {
      alter = vs.percussion ? 0 : vs.key[upper];
    }

    if (!vs.percussion) return { pitch: natural + alter + vs.transpose };

    const written = natural + alter;
    let gm: number;
    if (vs.percMap.has(written)) gm = vs.percMap.get(written)!;
    else if (vs.rawGm || (written >= 35 && written <= 59)) gm = written;
    else gm = nearestMapped(vs.percMap, written);
    return { pitch: gm, gm };
  }

  // -------------------------------------------------------------------------
  // Sonuç: tekrarları aç, zamanla, olay listesi üret
  // -------------------------------------------------------------------------

  private finish(): Score {
    // Açık kalan ölçüleri kapat.
    for (const id of this.voiceOrder) {
      const vs = this.voices.get(id)!;
      if (vs.bar.elements.some((e) => e.kind !== 'tempo')) {
        if (vs.pendingStartRepeat) vs.bar.startRepeat = true;
        vs.bar.expected = meterBeats(vs.meter);
        vs.bars.push(vs.bar);
        vs.bar = newBar();
      }
    }

    const barIssues: BarIssue[] = [];
    if (this.meterGiven) {
      for (const id of this.voiceOrder) {
        const bars = this.voices.get(id)!.bars;
        const ok = completingBars(bars);
        bars.forEach((bar, idx) => {
          if (idx === 0 || idx === bars.length - 1 || ok.has(idx)) return; // öncü ve son ölçü kısa olabilir
          if (Math.abs(bar.length - bar.expected) > 1e-6) {
            const first = bar.elements.find((e): e is NotesElement => e.kind === 'notes');
            barIssues.push({
              voice: id,
              bar: idx + 1,
              length: bar.length,
              expected: bar.expected,
              offset: first ? first.notes[0].src.start : -1,
            });
          }
        });
      }
    }

    const events: NoteEvent[] = [];
    const tempoPoints: TempoChange[] = [];
    const voiceInfos: VoiceInfo[] = [];
    let barStarts: number[] = [];
    let totalBeats = 0;
    let seq = 0;

    for (const id of this.voiceOrder) {
      const vs = this.voices.get(id)!;
      const order = expandRepeats(vs.bars);
      const instrument: InstrumentId = vs.percussion ? 'drums' : 'xylophone';
      const voiceEvents: NoteEvent[] = [];
      const starts: number[] = [];
      let t = 0;

      order.forEach((barIndex, playIndex) => {
        const bar = vs.bars[barIndex];
        starts.push(t);
        for (const el of bar.elements) {
          const at = t + el.offset;
          if (el.kind === 'tempo') {
            tempoPoints.push({ beat: at, qpm: el.qpm });
            continue;
          }
          if (el.kind !== 'notes') continue;
          el.grace.forEach((g, gi) => {
            const gt = Math.max(0, at - (el.grace.length - gi) * GRACE_LENGTH);
            voiceEvents.push(this.makeEvent(vs, instrument, g, gt, GRACE_LENGTH, el.velocity * 0.75, playIndex, true));
          });
          for (const nt of el.notes) {
            const dur = el.staccato ? nt.length * 0.5 : nt.length;
            const ev = this.makeEvent(vs, instrument, nt, at, dur, el.velocity, playIndex, false);
            (ev as TiedEvent).__tie = nt.tie;
            (ev as TiedEvent).__seq = seq++;
            voiceEvents.push(ev);
          }
        }
        t += bar.length;
      });

      const merged = mergeTies(voiceEvents);
      if (merged.length === 0 && order.length === 0) continue;
      events.push(...merged);
      voiceInfos.push({ id, name: vs.name || defaultVoiceName(id, instrument), instrument, length: t });
      if (barStarts.length === 0) barStarts = starts;
      totalBeats = Math.max(totalBeats, t);
    }

    events.sort((a, b) => a.time - b.time || a.pitch - b.pitch);

    const tempo = buildTempoMap(this.headerTempo ?? 120, tempoPoints);

    return {
      title: this.title || 'İsimsiz',
      composer: this.composer,
      meter: this.meter,
      tempo,
      voices: voiceInfos,
      events,
      barStarts,
      totalBeats,
      warnings: this.warnings,
      barIssues,
    };
  }

  private makeEvent(
    vs: VoiceState,
    instrument: InstrumentId,
    nt: PNote,
    time: number,
    duration: number,
    velocity: number,
    bar: number,
    grace: boolean,
  ): NoteEvent {
    const ev: NoteEvent = {
      voice: vs.id,
      instrument,
      time,
      duration,
      pitch: nt.pitch,
      velocity,
      bar,
      src: nt.src,
    };
    if (grace) ev.grace = true;
    if (nt.gm !== undefined) ev.drum = gmToDrumPiece(nt.gm);
    return ev;
  }

  // -------------------------------------------------------------------------

  private abs(col: number): number {
    return this.lineOffset + col;
  }

  private warn(message: string, col: number): void {
    const before = this.text.slice(0, this.lineOffset);
    const line = before.split('\n').length;
    this.warnings.push({ message, line, col: col + 1, offset: this.lineOffset + col });
  }
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Nota: (değiştirici)(harf)(oktav)(pay)(bölü)(payda) */
const NOTE_RE = /^(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)(\d*)(\/*)(\d*)/;

type TiedEvent = NoteEvent & { __tie?: boolean; __seq?: number };

function newBar(): Bar {
  return { elements: [], expected: 0, length: 0, startRepeat: false, endRepeat: false, endings: null };
}

function lengthOf(num: string, slashes: string, den: string): number {
  const n = num ? parseInt(num, 10) : 1;
  let d = 1;
  if (slashes) {
    d = den ? parseInt(den, 10) * 2 ** (slashes.length - 1) : 2 ** slashes.length;
  }
  return n / d;
}

export function parseFraction(s: string): number | null {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(s);
  if (m) {
    const v = parseInt(m[1], 10) / parseInt(m[2], 10);
    return v > 0 && Number.isFinite(v) ? v : null;
  }
  const whole = /^\s*(\d+)\s*$/.exec(s);
  if (whole) return parseInt(whole[1], 10) || null;
  return null;
}

function meterBeats(m: Meter): number {
  return (m.num / m.den) * 4;
}

export function parseMeter(s: string): Meter | null {
  const t = s.replace(/%.*$/, '').trim();
  if (t === 'C') return { num: 4, den: 4 };
  if (t === 'C|') return { num: 2, den: 2 };
  const m = /^\(?([\d+\s]+)\)?\s*\/\s*(\d+)$/.exec(t);
  if (!m) return null;
  const num = m[1]
    .split('+')
    .map((x) => parseInt(x.trim(), 10) || 0)
    .reduce((a, b) => a + b, 0);
  const den = parseInt(m[2], 10);
  return num > 0 && den > 0 ? { num, den } : null;
}

/** "^g", "F", "c'" gibi bir notanın donanımsız MIDI numarası. */
function naturalPitchOf(token: string): number | null {
  const m = /^(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)$/.exec(token.trim());
  if (!m) return null;
  const upper = m[2].toUpperCase();
  let octave = m[2] === upper ? 4 : 5;
  for (const ch of m[3]) octave += ch === "'" ? 1 : -1;
  return 12 * (octave + 1) + LETTER_STEPS[upper] + (m[1] ? accidentalValue(m[1]) : 0);
}

function nearestMapped(map: Map<number, number>, pitch: number): number {
  let best = 38;
  let bestDist = Infinity;
  for (const [k, v] of map) {
    const d = Math.abs(k - pitch);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

/**
 * Tekrar işaretlerini ve dönüşleri açarak ölçülerin çalınma sırasını üretir.
 */
export function expandRepeats(bars: { startRepeat: boolean; endRepeat: boolean; endings: number[] | null }[]): number[] {
  const order: number[] = [];
  let i = 0;
  let repeatStart = 0;
  let pass = 1;
  let justJumped = false;
  let afterRepeat = false;
  let guard = 0;

  while (i < bars.length && guard++ < 20000) {
    const b = bars[i];
    if (b.startRepeat && !justJumped) {
      repeatStart = i;
      pass = 1;
      afterRepeat = false;
    }
    justJumped = false;

    if (b.endings) {
      if (!b.endings.includes(pass)) {
        i++;
        continue;
      }
    } else if (afterRepeat) {
      pass = 1;
      afterRepeat = false;
      repeatStart = i;
    }

    order.push(i);

    if (b.endRepeat) {
      let passes = 2;
      if (b.endings) {
        passes = Math.max(...b.endings);
        for (let j = i + 1; j < bars.length && bars[j].endings; j++) {
          passes = Math.max(passes, ...bars[j].endings!);
        }
      }
      if (pass < passes) {
        pass++;
        i = repeatStart;
        justJumped = true;
        continue;
      }
      afterRepeat = true;
    }
    i++;
  }
  return order;
}

/**
 * Birbirini tamamlayan kısa ölçüler (halk müziği yazımında yaygın):
 *  - tekrarın sonundaki kısa ölçü + tekrarın başındaki öncü ölçü (|: öncü ... kısa :|)
 *  - art arda gelen iki kısa ölçü (ör. :| işaretinden sonra yeni bölümün öncüsü)
 * Toplamları tam bir ölçü ediyorsa ikisi de hatalı sayılmaz.
 */
function completingBars(bars: { length: number; expected: number; startRepeat: boolean; endRepeat: boolean }[]): Set<number> {
  const ok = new Set<number>();
  const short = (i: number) => bars[i].length < bars[i].expected - 1e-6;
  const sums = (i: number, j: number) => Math.abs(bars[i].length + bars[j].length - bars[i].expected) < 1e-6;
  let repeatStart = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].startRepeat) repeatStart = i;
    if (bars[i].endRepeat && short(i) && short(repeatStart) && sums(i, repeatStart)) {
      ok.add(i);
      ok.add(repeatStart);
    }
    if (bars[i].endRepeat) repeatStart = i + 1;
    if (i + 1 < bars.length && short(i) && short(i + 1) && sums(i, i + 1)) {
      ok.add(i);
      ok.add(i + 1);
    }
  }
  return ok;
}

/** Bağlı (tie) notaları tek bir uzun notada birleştirir. */
function mergeTies(events: NoteEvent[]): NoteEvent[] {
  const sorted = [...(events as TiedEvent[])].sort((a, b) => a.time - b.time || (a.__seq ?? 0) - (b.__seq ?? 0));
  const open = new Map<number, TiedEvent>();
  const out: NoteEvent[] = [];
  for (const ev of sorted) {
    if (ev.grace) {
      out.push(ev);
      continue;
    }
    const pending = open.get(ev.pitch);
    if (pending && Math.abs(pending.time + pending.duration - ev.time) < 1e-4) {
      pending.duration += ev.duration;
      if (!ev.__tie) {
        open.delete(ev.pitch);
        delete pending.__tie;
      }
      continue;
    }
    if (pending) open.delete(ev.pitch);
    if (ev.__tie) open.set(ev.pitch, ev);
    out.push(ev);
  }
  for (const ev of out as TiedEvent[]) {
    delete ev.__tie;
    delete ev.__seq;
  }
  return out;
}

function buildTempoMap(initial: number, points: TempoChange[]): TempoChange[] {
  const sorted = [...points].sort((a, b) => a.beat - b.beat);
  const map: TempoChange[] = [{ beat: 0, qpm: initial }];
  for (const p of sorted) {
    const last = map[map.length - 1];
    if (Math.abs(p.beat - last.beat) < EPS) last.qpm = p.qpm;
    else if (Math.abs(p.qpm - last.qpm) > EPS) map.push({ ...p });
  }
  return map;
}

function defaultVoiceName(id: string, instrument: InstrumentId): string {
  if (instrument === 'drums') return 'Davul';
  return /^\d+$/.test(id) ? `Ses ${id}` : id;
}
