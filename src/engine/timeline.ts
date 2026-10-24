/**
 * Zaman çizelgesi: `Score`'daki vuruş (dörtlük) zamanlarını tempo haritasına
 * göre saniyeye çevirir ve çalmaya hazır, sıralı bir nota listesi sunar.
 */
import type { NoteEvent, Score, TempoChange } from './types';

export interface TimedNote extends NoteEvent {
  /** Benzersiz sıra numarası. */
  id: number;
  /** Başlangıç (saniye, hız=1). */
  t: number;
  /** Süre (saniye, hız=1). */
  d: number;
}

interface TempoSegment {
  beat: number;
  sec: number;
  qpm: number;
}

export class Timeline {
  readonly score: Score;
  readonly notes: TimedNote[];
  /** Eserin toplam süresi (saniye). */
  readonly duration: number;
  private readonly segments: TempoSegment[];
  private readonly barSecs: number[];

  constructor(score: Score) {
    this.score = score;
    this.segments = buildSegments(score.tempo);
    this.notes = score.events.map((ev, id) => {
      const t = this.beatToSec(ev.time);
      return { ...ev, id, t, d: this.beatToSec(ev.time + ev.duration) - t };
    });
    this.notes.sort((a, b) => a.t - b.t || a.id - b.id);
    this.notes.forEach((n, i) => (n.id = i));
    this.barSecs = score.barStarts.map((b) => this.beatToSec(b));
    const lastNoteEnd = this.notes.reduce((m, n) => Math.max(m, n.t + Math.min(n.d, 2)), 0);
    this.duration = Math.max(this.beatToSec(score.totalBeats), lastNoteEnd);
  }

  beatToSec(beat: number): number {
    const seg = this.segmentByBeat(beat);
    return seg.sec + ((beat - seg.beat) * 60) / seg.qpm;
  }

  secToBeat(sec: number): number {
    let seg = this.segments[0];
    for (const s of this.segments) {
      if (s.sec <= sec) seg = s;
      else break;
    }
    return seg.beat + ((sec - seg.sec) * seg.qpm) / 60;
  }

  /** Verilen andaki tempo (dakikadaki dörtlük). */
  tempoAt(sec: number): number {
    let q = this.segments[0].qpm;
    for (const s of this.segments) {
      if (s.sec <= sec) q = s.qpm;
      else break;
    }
    return q;
  }

  /** Verilen anın kaçıncı ölçüde olduğu (1'den başlar) ve ölçü sayısı. */
  barAt(sec: number): { bar: number; count: number } {
    const bars = this.barSecs;
    if (bars.length === 0) return { bar: 0, count: 0 };
    let lo = 0;
    let hi = bars.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bars[mid] <= sec + 1e-9) lo = mid;
      else hi = mid - 1;
    }
    return { bar: lo + 1, count: bars.length };
  }

  /** Başlangıcı [from, to) aralığında olan ilk notanın indeksi. */
  firstIndexAtOrAfter(sec: number): number {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid].t < sec) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private segmentByBeat(beat: number): TempoSegment {
    let seg = this.segments[0];
    for (const s of this.segments) {
      if (s.beat <= beat) seg = s;
      else break;
    }
    return seg;
  }
}

function buildSegments(tempo: TempoChange[]): TempoSegment[] {
  const segs: TempoSegment[] = [];
  let sec = 0;
  let prev: TempoChange | null = null;
  for (const tc of tempo.length ? tempo : [{ beat: 0, qpm: 120 }]) {
    if (prev) sec += ((tc.beat - prev.beat) * 60) / prev.qpm;
    segs.push({ beat: tc.beat, sec, qpm: tc.qpm });
    prev = tc;
  }
  return segs;
}

/**
 * Perdeli partileri bir enstrümanın aralığına sığdırır:
 * önce her parti için en uygun oktav kaydırması seçilir, kalan taşan
 * notalar da tek tek oktav katlanarak aralığa alınır.
 */
export function fitToRange(events: NoteEvent[], low: number, high: number): NoteEvent[] {
  const byVoice = new Map<string, NoteEvent[]>();
  for (const ev of events) {
    if (ev.instrument !== 'xylophone') continue;
    const list = byVoice.get(ev.voice) ?? [];
    list.push(ev);
    byVoice.set(ev.voice, list);
  }
  const shiftFor = new Map<string, number>();
  for (const [voice, list] of byVoice) {
    let best = 0;
    let bestScore = -Infinity;
    for (let oct = -3; oct <= 3; oct++) {
      const s = oct * 12;
      let inside = 0;
      for (const ev of list) if (ev.pitch + s >= low && ev.pitch + s <= high) inside++;
      const score = inside - Math.abs(oct) * 0.01; // eşitlikte küçük kaydırmayı seç
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    shiftFor.set(voice, best);
  }
  return events.map((ev) => {
    if (ev.instrument !== 'xylophone') return ev;
    let p = ev.pitch + (shiftFor.get(ev.voice) ?? 0);
    while (p < low) p += 12;
    while (p > high) p -= 12;
    return p === ev.pitch ? ev : { ...ev, pitch: p };
  });
}

export const NOTE_NAMES_TR = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
