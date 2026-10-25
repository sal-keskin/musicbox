/**
 * Uygulama: müzik motorunu (ayrıştırıcı + zaman çizelgesi), ses motorunu,
 * zamanlayıcıyı ve 3B sahneyi birbirine bağlar; arayüzü yönetir.
 */
import { fitToRange, noteName, NOTE_NAMES_TR, parseAbc, Timeline, type Score, type TimedNote } from './engine';
import { Transport } from './engine/transport';
import { Scheduler } from './audio/scheduler';
import { SynthEngine } from './audio/synth';
import { buildLayout, barKey, drumKey, XYLO_HIGH, XYLO_LOW, type MachineLayout, type Target } from './sim/layout';
import { BEFORE_HIT } from './sim/paths';
import { MachineScene, type ActiveMarble, type Quality, type QualitySetting } from './sim/scene';
import { LIBRARY, TEMPLATE } from './library/tunes';
import type { DrumPiece } from './engine/types';

const DRUM_NAMES_TR: Record<DrumPiece, string> = {
  kick: 'Bas davul (kick)',
  snare: 'Trampet',
  hihatClosed: 'Hi-hat',
  hihatOpen: 'Açık hi-hat',
  tomHigh: 'Tiz tom',
  tomMid: 'Orta tom',
  tomFloor: 'Yer tomu',
  crash: 'Crash zili',
  ride: 'Ride zili',
};

const STORAGE_DRAFT = 'musicbox.draft';
const STORAGE_QUALITY = 'musicbox.quality';
const QUALITY_NAMES: Record<Quality, string> = { high: 'Yüksek', medium: 'Orta', low: 'Hafif' };
const PREROLL = BEFORE_HIT + 0.25;

interface LiveMarble {
  target: Target;
  hitReal: number;
  velocity: number;
  seed: number;
  steel: boolean;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class App {
  private readonly layout: MachineLayout;
  private readonly scene: MachineScene;
  private readonly transport: Transport;
  private readonly scheduler: Scheduler;
  private synth: SynthEngine | null = null;

  private timeline: Timeline | null = null;
  private loop = true;
  private seeking = false;
  private readonly live: LiveMarble[] = [];
  private readonly pool: ActiveMarble[] = [];
  private marbleVolume = 0.6;
  private lastHud = 0;

  constructor() {
    this.layout = buildLayout();
    this.scene = new MachineScene($('stage'), this.layout);
    this.transport = new Transport(() => performance.now() / 1000);
    this.scheduler = new Scheduler(this.transport, {
      play: (note, when) => this.playNote(note, when),
    });

    this.buildLibrary();
    this.bindUi();
    this.restoreOrLoadFirst();
    requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------
  // Eser yükleme
  // -------------------------------------------------------------------------

  private restoreOrLoadFirst(): void {
    this.loadTune(LIBRARY[0].id, LIBRARY[0].abc);
    try {
      const draft = localStorage.getItem(STORAGE_DRAFT);
      if (draft) this.setEditorStatus([{ cls: '', text: 'Son taslağın kayıtlı.', action: { label: 'Taslağı aç', run: () => this.openDraft(draft) } }]);
    } catch {
      /* depolama kapalı olabilir */
    }
  }

  private openDraft(draft: string): void {
    ($('abc-input') as HTMLTextAreaElement).value = draft;
    this.applyEditor();
  }

  /** ABC metnini ayrıştırıp makineye yükler. Başarılıysa Score döner. */
  private loadTune(id: string, abc: string): Score | null {
    const score = parseAbc(abc);
    if (score.events.length === 0) return null;
    const fitted: Score = { ...score, events: fitToRange(score.events, XYLO_LOW, XYLO_HIGH) };
    const wasPlaying = this.transport.playing;
    this.timeline = new Timeline(fitted);
    this.transport.seek(-PREROLL * this.transport.speed);
    this.scheduler.setTimeline(this.timeline);
    if (!wasPlaying) this.transport.pause();

    this.lastHud = 0; // göstergeleri bir sonraki karede hemen yenile
    $('tune-title').textContent = score.title;
    $('tune-composer').textContent = score.composer || ' ';
    $('ro-meter').textContent = `${score.meter.num}/${score.meter.den}`;
    $('time-total').textContent = formatTime(this.timeline.duration);
    ($('abc-input') as HTMLTextAreaElement).value = abc;
    document.querySelectorAll<HTMLButtonElement>('#tune-list button').forEach((b) => {
      b.setAttribute('aria-current', String(b.dataset.id === id));
    });
    return fitted;
  }

  private buildLibrary(): void {
    const list = $('tune-list');
    for (const tune of LIBRARY) {
      const s = parseAbc(tune.abc);
      const tl = new Timeline(s);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.dataset.id = tune.id;
      const drums = s.voices.some((v) => v.instrument === 'drums');
      b.innerHTML = `<span class="t"></span><span class="c"></span><span class="m"></span>`;
      b.querySelector('.t')!.textContent = s.title;
      b.querySelector('.c')!.textContent = s.composer;
      b.querySelector('.m')!.textContent = `${formatTime(tl.duration)}\n${drums ? 'davullu' : 'ksilofon'}`;
      (b.querySelector('.m') as HTMLElement).style.whiteSpace = 'pre';
      b.addEventListener('click', () => {
        this.loadTune(tune.id, tune.abc);
        this.setEditorStatus([]);
        void this.play();
        if (window.matchMedia('(max-width: 760px)').matches) this.togglePanel('library', false);
      });
      li.appendChild(b);
      list.appendChild(li);
    }
  }

  // -------------------------------------------------------------------------
  // Ses
  // -------------------------------------------------------------------------

  private async ensureAudio(): Promise<SynthEngine> {
    if (!this.synth) {
      this.synth = new SynthEngine();
      const ctx = this.synth.ctx;
      const wasPlaying = this.transport.playing;
      this.transport.pause();
      this.transport.setClock(() => ctx.currentTime);
      if (wasPlaying) this.transport.play();
      this.applyLevels();
      this.scheduler.start();
    }
    await this.synth.resume();
    return this.synth;
  }

  private targetFor(note: TimedNote): Target | undefined {
    if (note.instrument === 'drums') return this.layout.targets.get(drumKey(note.drum ?? 'snare'));
    return this.layout.targets.get(barKey(note.pitch));
  }

  private playNote(note: TimedNote, when: number): void {
    const synth = this.synth;
    const target = this.targetFor(note);
    if (!synth || !target) return;
    if (note.instrument === 'drums') synth.drum(note.drum ?? 'snare', when, note.velocity, target.pan);
    else synth.xylophone(note.pitch, when, note.velocity, target.pan);
    if (this.marbleVolume > 0 && !note.grace) synth.marbleClick(when + target.bounceTime, note.velocity * 0.7, target.pan, note.id);
  }

  private applyLevels(): void {
    const v = (id: string) => Number(($(id) as HTMLInputElement).value) / 100;
    this.marbleVolume = v('vol-marbles');
    this.synth?.setLevels({ master: v('vol-master'), xylophone: v('vol-xylo'), drums: v('vol-drums'), marbles: this.marbleVolume });
  }

  // -------------------------------------------------------------------------
  // Çalma denetimi
  // -------------------------------------------------------------------------

  private async play(): Promise<void> {
    await this.ensureAudio();
    if (!this.timeline) return;
    const song = this.transport.songTime();
    if (song >= this.endTime()) this.transport.seek(-PREROLL * this.transport.speed);
    this.transport.play();
    this.scheduler.reset();
    document.body.classList.add('is-playing', 'has-played');
    $('btn-play').setAttribute('aria-label', 'Duraklat');
  }

  private pause(): void {
    this.transport.pause();
    this.scheduler.reset();
    document.body.classList.remove('is-playing');
    $('btn-play').setAttribute('aria-label', 'Çal');
  }

  private restart(): void {
    this.transport.seek(-PREROLL * this.transport.speed);
    this.scheduler.reset();
  }

  /** Son bilyeler de kaba düşene kadar geçen süre (eser zamanı). */
  private endTime(): number {
    if (!this.timeline) return 0;
    return this.timeline.duration + (this.layout.maxAfterHit + 0.2) * this.transport.speed;
  }

  private liveHit(key: string): void {
    void this.ensureAudio().then((synth) => {
      const target = this.layout.targets.get(key);
      if (!target) return;
      const hitReal = this.transport.now() + BEFORE_HIT;
      const steel = key.startsWith('drum:');
      const velocity = 0.8;
      if (steel) synth.drum(key.slice(5) as DrumPiece, hitReal, velocity, target.pan);
      else synth.xylophone(Number(key.slice(4)), hitReal, velocity, target.pan);
      if (this.marbleVolume > 0) synth.marbleClick(hitReal + target.bounceTime, 0.6, target.pan, this.live.length);
      this.live.push({ target, hitReal, velocity, seed: Math.floor(Math.random() * 1e9), steel });
      document.body.classList.add('has-played');
    });
  }

  // -------------------------------------------------------------------------
  // Kare döngüsü
  // -------------------------------------------------------------------------

  private readonly frame = (): void => {
    requestAnimationFrame(this.frame);
    const tr = this.transport;
    const realNow = this.synth ? this.synth.presentationTime() : tr.now();
    const speed = tr.speed;
    const songNow = tr.songTime(realNow);

    if (tr.playing && this.timeline && songNow > this.endTime()) {
      if (this.loop) this.restart();
      else this.pause();
    }

    let n = 0;
    const tl = this.timeline;
    if (tl) {
      const notes = tl.notes;
      const end = songNow + (BEFORE_HIT + 0.02) * speed;
      for (let i = tl.firstIndexAtOrAfter(songNow - (this.layout.maxAfterHit + 0.1) * speed); i < notes.length && notes[i].t <= end; i++) {
        const note = notes[i];
        const target = this.targetFor(note);
        if (!target) continue;
        const m = this.slot(n++);
        m.target = target;
        m.dt = (songNow - note.t) / speed;
        m.velocity = note.velocity;
        m.seed = note.id * 7919 + 13;
        m.steel = note.instrument === 'drums';
      }
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const lv = this.live[i];
      const dt = realNow - lv.hitReal;
      if (dt > this.layout.maxAfterHit + 0.2) {
        this.live.splice(i, 1);
        continue;
      }
      const m = this.slot(n++);
      m.target = lv.target;
      m.dt = dt;
      m.velocity = lv.velocity;
      m.seed = lv.seed;
      m.steel = lv.steel;
    }

    this.scene.update(this.pool.slice(0, n), performance.now() / 1000);
    this.scene.render();

    const now = performance.now();
    if (now - this.lastHud > 100) {
      this.lastHud = now;
      this.updateHud(songNow, n);
    }
  };

  private slot(i: number): ActiveMarble {
    let m = this.pool[i];
    if (!m) {
      m = { target: undefined as unknown as Target, dt: 0, velocity: 0, seed: 0, steel: false };
      this.pool[i] = m;
    }
    return m;
  }

  private updateHud(songNow: number, marbles: number): void {
    const tl = this.timeline;
    if (!tl) return;
    const t = Math.max(0, Math.min(tl.duration, songNow));
    const bar = tl.barAt(t);
    $('ro-bar').textContent = `${Math.max(1, bar.bar)}/${bar.count}`;
    $('ro-tempo').textContent = `♩ = ${Math.round(tl.tempoAt(t) * this.transport.speed)}`;
    $('ro-marbles').textContent = String(marbles);
    $('time-now').textContent = formatTime(t);
    if (!this.seeking) ($('seek') as HTMLInputElement).value = String(Math.round((t / tl.duration) * 1000));
  }

  // -------------------------------------------------------------------------
  // Arayüz
  // -------------------------------------------------------------------------

  private togglePanel(name: 'library' | 'editor' | 'mixer', force?: boolean): void {
    const panel = $(name);
    const btn = $(`btn-${name}`);
    const show = force ?? panel.hidden;
    panel.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
    // Dar ekranda çekmeceler üst üste biner: biri açılınca diğerini kapat.
    if (show && name !== 'mixer') {
      const other = name === 'library' ? 'editor' : 'library';
      if (window.matchMedia('(max-width: 760px)').matches) {
        $(other).hidden = true;
        $(`btn-${other}`).setAttribute('aria-expanded', 'false');
      }
    }
  }

  private bindUi(): void {
    $('btn-play').addEventListener('click', () => (this.transport.playing ? this.pause() : void this.play()));
    $('btn-restart').addEventListener('click', () => this.restart());
    $('btn-library').addEventListener('click', () => this.togglePanel('library'));
    $('btn-editor').addEventListener('click', () => this.togglePanel('editor'));
    $('btn-mixer').addEventListener('click', () => this.togglePanel('mixer'));
    $('btn-apply').addEventListener('click', () => this.applyEditor());
    $('btn-template').addEventListener('click', () => {
      ($('abc-input') as HTMLTextAreaElement).value = TEMPLATE;
      this.setEditorStatus([{ cls: '', text: 'Şablon yüklendi. Notaları değiştirip Uygula ve çal düğmesine bas.' }]);
    });
    $('btn-view').addEventListener('click', () => this.scene.resetView());
    const quality = $('quality') as HTMLSelectElement;
    const showQuality = (q: Quality) => {
      $('out-quality').textContent = quality.value === 'auto' ? `Otomatik · ${QUALITY_NAMES[q]}` : QUALITY_NAMES[q];
    };
    this.scene.onQualityChange = showQuality;
    let saved: string | null = new URLSearchParams(location.search).get('quality');
    try {
      saved ??= localStorage.getItem(STORAGE_QUALITY);
    } catch {
      /* depolama kapalı olabilir */
    }
    if (saved && ['auto', 'high', 'medium', 'low'].includes(saved)) quality.value = saved;
    this.scene.setQuality(quality.value as QualitySetting);
    showQuality(this.scene.qualityLevel);
    quality.addEventListener('change', () => {
      this.scene.setQuality(quality.value as QualitySetting);
      showQuality(this.scene.qualityLevel);
      try {
        localStorage.setItem(STORAGE_QUALITY, quality.value);
      } catch {
        /* yok say */
      }
    });

    $('chk-orbit').addEventListener('change', (e) => {
      this.scene.controls.autoRotate = (e.target as HTMLInputElement).checked;
      this.scene.controls.autoRotateSpeed = 0.6;
    });
    const loopBtn = $('btn-loop');
    loopBtn.addEventListener('click', () => {
      this.loop = !this.loop;
      loopBtn.setAttribute('aria-pressed', String(this.loop));
    });

    for (const [input, out] of [
      ['vol-master', 'out-master'],
      ['vol-xylo', 'out-xylo'],
      ['vol-drums', 'out-drums'],
      ['vol-marbles', 'out-marbles'],
    ] as const) {
      $(input).addEventListener('input', () => {
        $(out).textContent = ($(input) as HTMLInputElement).value;
        this.applyLevels();
      });
    }

    const speed = $('speed') as HTMLInputElement;
    speed.addEventListener('input', () => {
      const s = Number(speed.value) / 100;
      this.transport.setSpeed(s);
      $('out-speed').textContent = `${s.toFixed(2).replace('.', ',')}×`;
    });

    const seek = $('seek') as HTMLInputElement;
    seek.addEventListener('pointerdown', () => (this.seeking = true));
    seek.addEventListener('input', () => {
      if (!this.timeline) return;
      this.seeking = true;
      const t = (Number(seek.value) / 1000) * this.timeline.duration;
      this.transport.seek(t);
      this.scheduler.reset();
      $('time-now').textContent = formatTime(t);
    });
    seek.addEventListener('change', () => (this.seeking = false));
    seek.addEventListener('pointerup', () => (this.seeking = false));

    const editor = $('abc-input') as HTMLTextAreaElement;
    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.applyEditor();
      }
    });

    window.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('textarea, input, button, select')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.transport.playing) this.pause();
        else void this.play();
      } else if (e.key === 'r' || e.key === 'R') {
        this.restart();
      }
    });

    // Sahnede tıklama: çubuğa/davula bilye düşür. Sürükleme kamerayı döndürür.
    const stage = $('stage');
    let down: { x: number; y: number; t: number } | null = null;
    stage.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    stage.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 400;
      down = null;
      if (moved > 6 || !quick) return;
      const key = this.scene.pick(e.clientX, e.clientY);
      if (key) this.liveHit(key);
    });

    const tip = $('tooltip');
    let pending = false;
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const key = this.scene.pick(e.clientX, e.clientY);
        if (!key) {
          tip.hidden = true;
          stage.style.cursor = '';
          return;
        }
        tip.textContent = describeTarget(key);
        tip.style.left = `${e.clientX}px`;
        tip.style.top = `${e.clientY}px`;
        tip.hidden = false;
        stage.style.cursor = 'pointer';
      });
    });
    stage.addEventListener('pointerleave', () => (tip.hidden = true));
  }

  private applyEditor(): void {
    const text = ($('abc-input') as HTMLTextAreaElement).value;
    const score = this.loadTune('custom', text);
    try {
      localStorage.setItem(STORAGE_DRAFT, text);
    } catch {
      /* yok say */
    }
    if (!score) {
      this.setEditorStatus([{ cls: 'err', text: 'Çalınacak nota bulunamadı. En az bir K: satırı ve notalar olmalı.' }]);
      return;
    }
    const raw = parseAbc(text);
    const msgs: StatusMsg[] = [];
    const voices = raw.voices.map((v) => `${v.name} (${v.instrument === 'drums' ? 'davul' : 'ksilofon'})`).join(', ');
    msgs.push({ cls: 'ok', text: `${raw.events.length} nota, ${raw.barStarts.length} ölçü. Partiler: ${voices}.` });
    const outOfRange = raw.events.filter((e) => e.instrument === 'xylophone' && (e.pitch < XYLO_LOW || e.pitch > XYLO_HIGH)).length;
    if (outOfRange) msgs.push({ cls: 'warn', text: `${outOfRange} nota ksilofonun aralığı (C3–C7) dışındaydı; oktav kaydırılarak çalınıyor.` });
    for (const w of raw.warnings.slice(0, 8)) {
      msgs.push({ cls: 'warn', text: `Satır ${w.line}, sütun ${w.col}: ${w.message}`, action: { label: 'git', run: () => this.focusEditorAt(w.offset) } });
    }
    for (const b of raw.barIssues.slice(0, 8)) {
      const fmt = (x: number) => (Math.round(x * 100) / 100).toString().replace('.', ',');
      msgs.push({
        cls: 'warn',
        text: `${b.voice}. parti, ${b.bar}. ölçü: ${fmt(b.length)} vuruş (beklenen ${fmt(b.expected)}).`,
        action: b.offset >= 0 ? { label: 'git', run: () => this.focusEditorAt(b.offset) } : undefined,
      });
    }
    this.setEditorStatus(msgs);
    void this.play();
  }

  private focusEditorAt(offset: number): void {
    const ta = $('abc-input') as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(offset, offset + 1);
  }

  private setEditorStatus(msgs: StatusMsg[]): void {
    const box = $('editor-status');
    box.replaceChildren();
    for (const m of msgs) {
      const p = document.createElement('p');
      if (m.cls) p.className = m.cls;
      p.textContent = m.text + ' ';
      if (m.action) {
        const b = document.createElement('button');
        b.textContent = m.action.label;
        b.addEventListener('click', m.action.run);
        p.appendChild(b);
      }
      box.appendChild(p);
    }
  }
}

interface StatusMsg {
  cls: '' | 'ok' | 'warn' | 'err';
  text: string;
  action?: { label: string; run: () => void };
}

function describeTarget(key: string): string {
  if (key.startsWith('drum:')) return DRUM_NAMES_TR[key.slice(5) as DrumPiece];
  const midi = Number(key.slice(4));
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES_TR[midi % 12]}${octave} · ${noteName(midi)}`;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
