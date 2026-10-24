/**
 * İleriye bakan ses zamanlayıcısı ("A Tale of Two Clocks" yöntemi).
 *
 * Her ~25 ms'de bir, önümüzdeki kısa pencereye düşen notalar Web Audio
 * saatine göre tam zamanlarıyla planlanır. JavaScript zamanlayıcılarının
 * titremesi böylece sese yansımaz.
 */
import type { TimedNote, Timeline } from '../engine/timeline';
import type { Transport } from '../engine/transport';

export interface NoteSink {
  /** Bir notayı `when` (AudioContext zamanı) anında çal. */
  play(note: TimedNote, when: number): void;
}

export class Scheduler {
  private timeline: Timeline | null = null;
  private index = 0;
  private scheduledUntil = 0;
  private timer: number | null = null;

  constructor(
    private readonly transport: Transport,
    private readonly sink: NoteSink,
    private readonly lookahead = 0.12,
  ) {}

  setTimeline(timeline: Timeline): void {
    this.timeline = timeline;
    this.reset();
  }

  /** Konum ya da durum değiştiğinde planlamayı o andan yeniden başlatır. */
  reset(): void {
    const song = this.transport.songTime();
    this.scheduledUntil = song;
    this.index = this.timeline ? this.timeline.firstIndexAtOrAfter(song) : 0;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  tick(): void {
    const tl = this.timeline;
    const tr = this.transport;
    if (!tl || !tr.playing) return;
    const now = tr.now();
    // Sekme arka plandayken tarayıcı zamanlayıcıları yavaşlatır: pencereyi büyüt.
    const ahead = typeof document !== 'undefined' && document.hidden ? 1.2 : this.lookahead;
    const until = tr.songTime(now + ahead);
    const notes = tl.notes;

    while (this.index < notes.length && notes[this.index].t < until) {
      const note = notes[this.index++];
      if (note.t < this.scheduledUntil - 1e-6) continue;
      const when = tr.realTimeOf(note.t);
      if (when < now - 0.05) continue; // çok geç kalındı, atla
      this.sink.play(note, Math.max(when, now));
    }
    this.scheduledUntil = Math.max(this.scheduledUntil, until);
  }
}
