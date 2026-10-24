/**
 * Web Audio ile ses sentezi: ksilofon (modal sentez) ve davul seti.
 * Örnek (sample) dosyası kullanılmaz; her ses osilatör ve gürültüden üretilir.
 */
import type { DrumPiece } from '../engine/types';
import { midiToFreq } from '../engine/timeline';

export interface MixLevels {
  master: number;
  xylophone: number;
  drums: number;
  marbles: number;
}

export class SynthEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly xyloBus: GainNode;
  private readonly drumBus: GainNode;
  private readonly marbleBus: GainNode;
  private readonly reverbSend: GainNode;
  private readonly noise: AudioBuffer;

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    const ctx = this.ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(compressor).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulseResponse(ctx, 2.4, 2.8);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.5;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(reverb).connect(reverbOut).connect(this.master);

    this.xyloBus = this.bus(0.9, 0.32);
    this.drumBus = this.bus(0.75, 0.12);
    this.marbleBus = this.bus(0.35, 0.2);

    this.noise = makeNoise(ctx, 2);
  }

  private bus(level: number, reverbAmount: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.master);
    const send = this.ctx.createGain();
    send.gain.value = reverbAmount;
    g.connect(send).connect(this.reverbSend);
    return g;
  }

  setLevels(levels: Partial<MixLevels>): void {
    const t = this.ctx.currentTime;
    if (levels.master !== undefined) this.master.gain.setTargetAtTime(levels.master, t, 0.03);
    if (levels.xylophone !== undefined) this.xyloBus.gain.setTargetAtTime(levels.xylophone * 0.9, t, 0.03);
    if (levels.drums !== undefined) this.drumBus.gain.setTargetAtTime(levels.drums * 0.75, t, 0.03);
    if (levels.marbles !== undefined) this.marbleBus.gain.setTargetAtTime(levels.marbles * 0.35, t, 0.03);
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Ekrandaki görüntüyle eşleşen ses zamanı (çıkış gecikmesi düşülmüş). */
  presentationTime(): number {
    const ctx = this.ctx;
    if (typeof ctx.getOutputTimestamp === 'function') {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
        return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      }
    }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  // -------------------------------------------------------------------------
  // Ksilofon
  // -------------------------------------------------------------------------

  /**
   * Bir ksilofon çubuğuna bilye çarpması. Çubuk modları 1 : 3 : 6.25 : 10.6
   * oranlarına yakın ayarlanır (gerçek ksilofonun on ikili ayarı); her mod
   * kendi hızıyla söner. Bilyenin çarpması kısa, parlak bir tık sesi ekler.
   */
  xylophone(midi: number, when: number, velocity: number, pan = 0): void {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const v = Math.max(0.05, Math.min(1, velocity));
    const out = this.voiceOut(this.xyloBus, pan);
    const nyquist = ctx.sampleRate / 2 - 500;

    // Pes çubuklar daha uzun tınlar.
    const ring = clamp(2.1 * Math.pow(261.6 / f, 0.55), 0.28, 2.6);
    const brightness = 0.55 + 0.45 * v;
    const modes: [number, number, number][] = [
      [1, 1, ring],
      [3.0, 0.24 * brightness, ring * 0.32],
      [6.27, 0.075 * brightness, ring * 0.14],
      [10.6, 0.035 * brightness, ring * 0.07],
    ];
    const level = 0.1 + 0.32 * Math.pow(v, 1.4);
    let stopAt = when;

    for (const [ratio, amp, decay] of modes) {
      const freq = f * ratio;
      if (freq > nyquist) continue;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(level * amp, when + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      osc.connect(g).connect(out);
      osc.start(when);
      osc.stop(when + decay + 0.02);
      stopAt = Math.max(stopAt, when + decay);
    }

    // Rezonatör borusu: temel frekansta yumuşak, biraz gecikmeli bir gövde.
    const res = ctx.createOscillator();
    res.frequency.value = f;
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0, when);
    rg.gain.linearRampToValueAtTime(level * 0.35, when + 0.025);
    rg.gain.exponentialRampToValueAtTime(0.0001, when + ring * 1.25);
    res.connect(rg).connect(out);
    res.start(when);
    res.stop(when + ring * 1.25 + 0.02);

    // Bilyenin çubuğa çarpma tıkırtısı.
    this.noiseBurst(out, when, 0.012, 'bandpass', Math.min(f * 5, 9000), 1.4, level * 0.5);
    this.release(out, Math.max(stopAt, when + ring * 1.25) + 0.1);
  }

  // -------------------------------------------------------------------------
  // Davullar
  // -------------------------------------------------------------------------

  drum(piece: DrumPiece, when: number, velocity: number, pan = 0): void {
    const v = Math.max(0.05, Math.min(1, velocity));
    const out = this.voiceOut(this.drumBus, pan);
    const level = 0.25 + 0.75 * Math.pow(v, 1.3);
    let end = when + 0.5;
    switch (piece) {
      case 'kick':
        end = this.kick(out, when, level);
        break;
      case 'snare':
        end = this.snare(out, when, level);
        break;
      case 'hihatClosed':
        end = this.cymbal(out, when, level * 0.55, 0.06, 7500);
        break;
      case 'hihatOpen':
        end = this.cymbal(out, when, level * 0.5, 0.42, 7000);
        break;
      case 'crash':
        end = this.cymbal(out, when, level * 0.6, 1.9, 4800);
        break;
      case 'ride':
        end = this.ride(out, when, level);
        break;
      case 'tomHigh':
        end = this.tom(out, when, level, 210, 0.38);
        break;
      case 'tomMid':
        end = this.tom(out, when, level, 158, 0.45);
        break;
      case 'tomFloor':
        end = this.tom(out, when, level, 108, 0.6);
        break;
    }
    this.release(out, end + 0.1);
  }

  private kick(out: AudioNode, t: number, level: number): number {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level * 1.1, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.6);
    this.noiseBurst(out, t, 0.006, 'lowpass', 2800, 0.7, level * 0.35);
    return t + 0.6;
  }

  private snare(out: AudioNode, t: number, level: number): number {
    const ctx = this.ctx;
    for (const [freq, amp, decay] of [
      [185, 0.5, 0.11],
      [330, 0.25, 0.06],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 1.15, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
      const g = ctx.createGain();
      g.gain.setValueAtTime(level * amp, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + decay);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + decay + 0.02);
    }
    this.noiseBurst(out, t, 0.22, 'highpass', 1100, 0.6, level * 0.7, true);
    return t + 0.3;
  }

  private tom(out: AudioNode, t: number, level: number, freq: number, decay: number): number {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level * 0.9, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.02);
    this.noiseBurst(out, t, 0.05, 'bandpass', freq * 6, 0.9, level * 0.2);
    return t + decay;
  }

  /** 808 tarzı metalik zil: kare dalgalardan oluşan uyumsuz bir küme + gürültü. */
  private cymbal(out: AudioNode, t: number, level: number, decay: number, cutoff: number): number {
    const ctx = this.ctx;
    const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
    const base = 40;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = cutoff;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = cutoff * 1.4;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level * 0.55, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    for (const r of ratios) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = base * r * 2.7;
      osc.connect(bp);
      osc.start(t);
      osc.stop(t + decay + 0.02);
    }
    bp.connect(hp).connect(g).connect(out);
    this.noiseBurst(out, t, decay * 0.8, 'highpass', cutoff * 0.9, 0.5, level * 0.45, true);
    return t + decay;
  }

  private ride(out: AudioNode, t: number, level: number): number {
    const ctx = this.ctx;
    const end = this.cymbal(out, t, level * 0.35, 1.2, 5500);
    // Zil kubbesinin çan tonu
    for (const [f, a] of [
      [2350, 0.1],
      [3470, 0.05],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(level * a, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.72);
    }
    return end;
  }

  // -------------------------------------------------------------------------
  // Bilye sesleri
  // -------------------------------------------------------------------------

  /** Bilyenin oluğa düşmesi: küçük, camsı bir tık. */
  marbleClick(when: number, velocity: number, pan = 0, pitchSeed = 0): void {
    const ctx = this.ctx;
    const out = this.voiceOut(this.marbleBus, pan);
    const f = 2600 + (pitchSeed % 7) * 230;
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    const g = ctx.createGain();
    const level = 0.05 + 0.08 * velocity;
    g.gain.setValueAtTime(level, when);
    g.gain.exponentialRampToValueAtTime(0.0005, when + 0.05);
    osc.connect(g).connect(out);
    osc.start(when);
    osc.stop(when + 0.06);
    this.noiseBurst(out, when, 0.008, 'highpass', 4000, 0.7, level * 0.6);
    this.release(out, when + 0.15);
  }

  // -------------------------------------------------------------------------
  // Yardımcılar
  // -------------------------------------------------------------------------

  private voiceOut(bus: AudioNode, pan: number): AudioNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p).connect(bus);
    } else {
      g.connect(bus);
    }
    return g;
  }

  /** Sesin bitiminde düğümü grafikten çıkarır (bellek sızıntısını önler). */
  private release(node: AudioNode, at: number): void {
    const delay = Math.max(0, at - this.ctx.currentTime) * 1000 + 50;
    window.setTimeout(() => node.disconnect(), delay);
  }

  private noiseBurst(
    out: AudioNode,
    t: number,
    duration: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    level: number,
    exponential = false,
  ): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = Math.min(freq, ctx.sampleRate / 2 - 100);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    if (exponential) g.gain.exponentialRampToValueAtTime(0.0005, t + duration);
    else g.gain.linearRampToValueAtTime(0, t + duration);
    src.connect(filter).connect(g).connect(out);
    const offset = Math.random() * (this.noise.duration - duration - 0.01);
    src.start(t, Math.max(0, offset), duration + 0.01);
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Üstel sönümlü stereo gürültüden yapay bir oda yankısı. */
function makeImpulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  const preDelay = Math.floor(ctx.sampleRate * 0.012);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = preDelay; i < length; i++) {
      const tNorm = (i - preDelay) / (length - preDelay);
      // Zamanla kararan (alçak geçiren) gürültü: yankı kuyruğu yumuşasın.
      const white = Math.random() * 2 - 1;
      const k = 0.15 + 0.8 * tNorm;
      lp = lp * k + white * (1 - k);
      data[i] = lp * Math.pow(1 - tNorm, decay) * (1.6 - tNorm);
    }
  }
  return buf;
}
