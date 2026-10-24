/**
 * Çalma denetimi (transport): gerçek zaman ile eser zamanı arasındaki eşleme.
 *
 * Eser zamanı (song time) saniye cinsindendir ve hız=1 iken gerçek zamanla
 * aynı hızda akar. Hız değiştiğinde, o anki konum sabitlenip ("çapa")
 * yeni hızla devam edilir; böylece atlama olmaz.
 */
export type Clock = () => number;

export class Transport {
  private clock: Clock;
  private anchorReal = 0;
  private anchorSong = 0;
  private _playing = false;
  private _speed = 1;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  get playing(): boolean {
    return this._playing;
  }

  get speed(): number {
    return this._speed;
  }

  /** Saat kaynağını değiştirir (yalnızca dururken güvenli). */
  setClock(clock: Clock): void {
    const song = this.songTime();
    this.clock = clock;
    this.anchorSong = song;
    this.anchorReal = clock();
  }

  now(): number {
    return this.clock();
  }

  /** Verilen gerçek andaki eser zamanı. */
  songTime(real: number = this.clock()): number {
    if (!this._playing) return this.anchorSong;
    return this.anchorSong + (real - this.anchorReal) * this._speed;
  }

  /** Bir eser anının çalınacağı gerçek zaman (çalarken geçerlidir). */
  realTimeOf(song: number): number {
    return this.anchorReal + (song - this.anchorSong) / this._speed;
  }

  play(): void {
    if (this._playing) return;
    this.anchorReal = this.clock();
    this._playing = true;
  }

  pause(): void {
    if (!this._playing) return;
    this.anchorSong = this.songTime();
    this._playing = false;
  }

  seek(song: number): void {
    this.anchorSong = song;
    this.anchorReal = this.clock();
  }

  setSpeed(speed: number): void {
    const s = Math.max(0.1, Math.min(4, speed));
    const now = this.clock();
    this.anchorSong = this.songTime(now);
    this.anchorReal = now;
    this._speed = s;
  }
}
