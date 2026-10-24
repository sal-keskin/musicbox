/**
 * Müzik motorunun ortak veri modeli.
 *
 * Zaman birimi "vuruş"tur (beat) ve her zaman dörtlük nota (quarter note)
 * cinsindendir: 1 vuruş = 1 dörtlük. Saniyeye çevirme işi `Timeline`'dadır.
 */

export type InstrumentId = 'xylophone' | 'drums';

/** Davul setimizdeki parçalar. GM perküsyon numaraları bunlara eşlenir. */
export type DrumPiece =
  | 'kick'
  | 'snare'
  | 'hihatClosed'
  | 'hihatOpen'
  | 'tomHigh'
  | 'tomMid'
  | 'tomFloor'
  | 'crash'
  | 'ride';

export interface NoteEvent {
  /** Sesin ait olduğu partinin kimliği (ABC'deki V: alanı). */
  voice: string;
  instrument: InstrumentId;
  /** Başlangıç zamanı (dörtlük cinsinden, tekrarlar açıldıktan sonra). */
  time: number;
  /** Süre (dörtlük cinsinden). */
  duration: number;
  /** MIDI nota numarası. Davullarda GM perküsyon tuşu. */
  pitch: number;
  /** 0..1 arası vuruş şiddeti. */
  velocity: number;
  /** Davul notalarında hangi parçanın çalınacağı. */
  drum?: DrumPiece;
  /** Süsleme notası (grace note) mı? */
  grace?: boolean;
  /** Ölçü numarası (0'dan başlar, tekrarlar açıldıktan sonra). */
  bar: number;
  /** Kaynak metindeki konum (editörde vurgulamak için). */
  src: { start: number; end: number };
}

export interface TempoChange {
  /** Değişimin olduğu an (dörtlük cinsinden). */
  beat: number;
  /** Dakikadaki dörtlük sayısı. */
  qpm: number;
}

export interface Meter {
  num: number;
  den: number;
}

export interface VoiceInfo {
  id: string;
  name: string;
  instrument: InstrumentId;
  /** Partinin tekrarlar açıldıktan sonraki uzunluğu (dörtlük). */
  length: number;
}

export interface ParseWarning {
  message: string;
  line: number;
  col: number;
  offset: number;
}

/** Ölçü süresi ölçü birimine (M:) uymayan ölçüler. Yazım hatalarını bulmaya yarar. */
export interface BarIssue {
  voice: string;
  /** Yazıldığı sıradaki ölçü numarası (1'den başlar). */
  bar: number;
  /** Ölçünün süresi (dörtlük). */
  length: number;
  /** Beklenen süre (dörtlük). */
  expected: number;
  /** Ölçünün kaynak metindeki başlangıcı. */
  offset: number;
}

export interface Score {
  title: string;
  composer: string;
  meter: Meter;
  /** Tempo haritası (ilk eleman her zaman beat=0). */
  tempo: TempoChange[];
  voices: VoiceInfo[];
  /** Zamana göre sıralı tüm notalar. */
  events: NoteEvent[];
  /** Her ölçünün başladığı an (ilk partiye göre). */
  barStarts: number[];
  /** Eserin toplam uzunluğu (dörtlük). */
  totalBeats: number;
  warnings: ParseWarning[];
  /** İlk ve son ölçü dışında süresi tutmayan ölçüler. */
  barIssues: BarIssue[];
}
