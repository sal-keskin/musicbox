/**
 * Bilye makinesinin 3B sahnesi. Her karede etkin bilyelerin listesini alır,
 * konumlarını analitik yörüngelerden hesaplar ve vuruş tepkilerini çizer:
 * çubuk parlaması, davul zıplaması, zil sallanması, halka dalgası, yükselen
 * nota simgeleri, bilye izleri ve vuruşlarla nabız gibi atan renkli ışıklar.
 *
 * Görünüm: 35 mm eşdeğeri, hafif yüksekten ve soldan bakan üç çeyrek kamera;
 * sıcak tepe ışığı, mor kontur ışığı, yumuşak gölgeler, temas gölgeleri,
 * zemin yansıması, seçici bloom, ortam gölgelemesi ve hafif alan derinliği.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DrumPiece } from '../engine/types';
import {
  buildDrums,
  buildMachine,
  buildStage,
  buildXylophone,
  createMaterials,
  LAYER_DYNAMIC,
  LAYER_FLOOR,
  LAYER_FX,
  marbleMaterial,
  type BarVisual,
  type DrumVisual,
  type MachineVisual,
} from './build';
import { bakeContactShadow } from './contactShadow';
import { createTrails, NoteSprites } from './effects';
import { MARBLE_RADIUS, type MachineLayout, type Target } from './layout';
import { marbleAt, newMarbleState } from './paths';
import { PostFX, type Quality } from './post';
import { SoftReflector } from './reflector';
import { rng, skyTexture } from './textures';

export type { Quality } from './post';
export type QualitySetting = Quality | 'auto';

export interface ActiveMarble {
  target: Target;
  /** Vuruştan bu yana geçen gerçek süre (saniye; vuruştan önce negatif). */
  dt: number;
  velocity: number;
  /** Nota başına sabit tohum (bilyenin duruşu ve efektler için). */
  seed: number;
  /** Davul bilyeleri çelik, ksilofon bilyeleri renkli camdır. */
  steel: boolean;
}

const MAX_MARBLES = 900;
const MAX_RINGS = 160;
const MAX_NOTES = 120;
const RING_LIFE = 0.5;
const NOTE_LIFE = 1.35;
/** 35 mm objektifin tam kare sensördeki dikey görüş açısı. */
const FOV_35MM = 2 * THREE.MathUtils.radToDeg(Math.atan(12 / 35));

interface Energy {
  energy: number;
  /** En son vuruştan bu yana geçen süre. */
  last: number;
  lastVel: number;
}

interface Accent {
  light: THREE.PointLight;
  base: number;
  gain: number;
  keys: string[];
}

export class MachineScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Otomatik kalite kademesi değişince çağrılır. */
  onQualityChange?: (quality: Quality) => void;

  private readonly container: HTMLElement;
  private readonly overlay = new THREE.Scene();
  private readonly post: PostFX;
  private readonly reflector: SoftReflector;
  private readonly key: THREE.DirectionalLight;
  private readonly accents: Accent[] = [];
  private readonly bars: Map<number, BarVisual>;
  private readonly drums: Map<DrumPiece, DrumVisual>;
  private readonly machine: MachineVisual;
  private readonly pickables: THREE.Object3D[] = [];
  private readonly glass: THREE.InstancedMesh;
  private readonly steel: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  private readonly trails: THREE.InstancedMesh;
  private readonly notes: NoteSprites;
  private readonly glassPlain: THREE.MeshPhysicalMaterial;
  private readonly glassTransmissive: THREE.MeshPhysicalMaterial;
  private readonly energies = new Map<string, Energy>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly bounds = new THREE.Box3();
  private readonly homeView: { pos: THREE.Vector3; target: THREE.Vector3; dir: THREE.Vector3 };
  private userMoved = false;

  private qualitySetting: QualitySetting = 'auto';
  private quality: Quality = 'high';
  private frameSamples: number[] = [];
  private lastFrame = 0;

  // Kare başına yeniden kullanılan geçici nesneler
  private readonly st = newMarbleState();
  private readonly st2 = newMarbleState();
  private readonly m4 = new THREE.Matrix4();
  private readonly v3 = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly qSpin = new THREE.Quaternion();
  private readonly qBase = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly col = new THREE.Color();
  private readonly flatRing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

  constructor(container: HTMLElement, layout: MachineLayout) {
    this.container = container;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = this.scene;
    scene.background = skyTexture('#0c0a16', '#191428', '#241c36');
    scene.fog = new THREE.Fog(0x1a1530, 42, 100);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    // --- Makine ---------------------------------------------------------------
    const mats = createMaterials();
    const stage = buildStage(layout);
    scene.add(stage.group);
    const xylo = buildXylophone(layout, mats, this.pickables);
    const kit = buildDrums(layout, mats, this.pickables);
    this.machine = buildMachine(layout, mats);
    scene.add(xylo.group, kit.group, this.machine.group);
    this.bars = xylo.bars;
    this.drums = kit.drums;
    for (const g of [xylo.group, kit.group, this.machine.group]) this.bounds.expandByObject(g);

    // --- Kamera: üç çeyrek, 35 mm ------------------------------------------------
    const center = this.bounds.getCenter(new THREE.Vector3());
    this.camera = new THREE.PerspectiveCamera(FOV_35MM, 1, 0.1, 220);
    this.camera.layers.enable(LAYER_DYNAMIC);
    this.camera.layers.enable(LAYER_FLOOR);
    this.camera.layers.enable(LAYER_FX);
    const target = new THREE.Vector3(center.x + 0.3, center.y - 0.45, center.z);
    const dir = new THREE.Vector3(-0.5, 0.36, 0.79).normalize();
    this.homeView = { pos: target.clone().addScaledVector(dir, 25), target, dir };
    this.camera.position.copy(this.homeView.pos);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.copy(target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.addEventListener('start', () => (this.userMoved = true));
    this.controls.update();

    // --- Işıklar -------------------------------------------------------------
    scene.add(new THREE.HemisphereLight(0x8f88cc, 0x1e1418, 0.35));
    const key = new THREE.DirectionalLight(0xffd6a0, 2.7); // sıcak tepe ışığı, önden-sağdan
    key.position.set(center.x + 5, 17, 8);
    key.target.position.set(center.x, 1.5, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 10;
    sc.bottom = -10;
    sc.near = 2;
    sc.far = 45;
    sc.layers.enableAll();
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 5;
    scene.add(key, key.target);
    this.key = key;
    const rim = new THREE.DirectionalLight(0x8a6bff, 2.4); // soğuk mor kontur
    rim.position.set(center.x - 7, 6, -13);
    scene.add(rim);

    // Renkli vurgu ışıkları: hafif yanarlar, vuruşlarla nabız gibi atarlar.
    const accent = (color: number, x: number, y: number, z: number, base: number, gain: number, keys: string[]) => {
      const light = new THREE.PointLight(color, base, 24, 1.5);
      light.position.set(x, y, z);
      scene.add(light);
      this.accents.push({ light, base, gain, keys });
    };
    accent(0xff4fa3, layout.xyloMinX - 1.5, 4.2, 2.8, 4, 34, ['drum:kick', 'drum:tomFloor']);
    accent(0x45d2ff, layout.kitX + 3.2, 4.8, 1.8, 4, 30, ['drum:snare', 'drum:tomHigh', 'drum:tomMid']);
    accent(0xffb14a, center.x + 1, 4.6, 6.5, 3, 18, ['drum:crash', 'drum:ride', 'drum:hihatOpen']);

    // --- Bilyeler ve efektler ----------------------------------------------------
    const sphere = new THREE.SphereGeometry(MARBLE_RADIUS, 24, 16);
    this.glassPlain = marbleMaterial(false);
    this.glassTransmissive = marbleMaterial(true);
    this.glass = this.instanced(sphere, this.glassPlain, MAX_MARBLES);
    this.glass.userData.bloom = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.4, 0.4) });
    const steelMat = new THREE.MeshPhysicalMaterial({ color: 0xe8edf3, metalness: 1, roughness: 0.1, clearcoat: 0.6 });
    this.steel = this.instanced(sphere, steelMat, MAX_MARBLES / 3);
    this.steel.userData.bloom = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.08, 0.09) });

    const ringMat = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.rings = this.instanced(new THREE.RingGeometry(0.8, 1, 48), ringMat, MAX_RINGS);
    this.rings.castShadow = false;
    this.rings.userData.bloom = 'self';
    this.rings.layers.set(LAYER_FX);

    this.trails = createTrails(MAX_MARBLES);
    this.trails.layers.set(LAYER_FX);
    scene.add(this.trails);
    this.notes = new NoteSprites(MAX_NOTES);
    this.notes.mesh.layers.set(LAYER_FX);
    scene.add(this.notes.mesh);
    this.machine.lift.marbles.layers.set(LAYER_DYNAMIC);
    this.machine.lift.cups.layers.set(LAYER_DYNAMIC);

    // --- Zemin: temas gölgesi (bir kez) ve yumuşak yansıma -----------------------
    const contact = bakeContactShadow(renderer, scene, stage.floorParts, {
      center: new THREE.Vector3(center.x, 0.006, 0),
      width: this.bounds.max.x - this.bounds.min.x + 3,
      depth: this.bounds.max.z - this.bounds.min.z + 3,
      height: 2.4,
      resolution: 1024,
      darkness: 1.5,
      opacity: 0.85,
      blur: 2.6,
    });
    contact.layers.set(LAYER_FLOOR);
    contact.userData.bloom = 'hide';

    this.reflector = new SoftReflector(new THREE.CircleGeometry(stage.radius, 128), 0.24);
    this.reflector.rotation.x = -Math.PI / 2;
    this.reflector.position.set(stage.center.x, 0.004, stage.center.z);
    this.overlay.add(this.reflector);

    this.post = new PostFX(renderer, scene, this.overlay, this.camera, this.reflector);
    const coarse = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
    this.applyQuality(coarse ? 'medium' : 'high');

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) mesh.setColorAt(i, this.col.setRGB(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.layers.set(LAYER_DYNAMIC);
    this.scene.add(mesh);
    return mesh;
  }

  // -------------------------------------------------------------------------
  // Kalite
  // -------------------------------------------------------------------------

  get qualityLevel(): Quality {
    return this.quality;
  }

  setQuality(setting: QualitySetting): void {
    this.qualitySetting = setting;
    this.frameSamples = [];
    if (setting !== 'auto') this.applyQuality(setting);
  }

  private applyQuality(q: Quality): void {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 1.75) : q === 'medium' ? Math.min(dpr, 1.35) : 1);
    const size = q === 'low' ? 1024 : 2048;
    if (this.key.shadow.mapSize.x !== size) {
      this.key.shadow.mapSize.set(size, size);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.glass.material = q === 'high' ? this.glassTransmissive : this.glassPlain;
    this.post.setQuality(q);
    this.resize();
    this.onQualityChange?.(q);
  }

  /** Otomatik kipte, kare süresi uzunsa kaliteyi bir kademe düşür. */
  private monitorPerformance(): void {
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    if (this.qualitySetting !== 'auto' || document.hidden || dt > 250 || dt <= 0) return;
    this.frameSamples.push(dt);
    if (this.frameSamples.length < 90) return;
    const sorted = [...this.frameSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.frameSamples = [];
    if (median > 28 && this.quality !== 'low') this.applyQuality(this.quality === 'high' ? 'medium' : 'low');
  }

  // -------------------------------------------------------------------------
  // Kamera
  // -------------------------------------------------------------------------

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect >= 1.15 ? FOV_35MM : 50;
    this.camera.updateProjectionMatrix();
    this.fitHome(aspect);
    if (!this.userMoved) this.resetView();
  }

  /** Makinenin tamamı (arayüz paneline kalan alanda) görünecek uzaklığı bul. */
  private fitHome(aspect: number): void {
    const cam = new THREE.PerspectiveCamera(this.camera.fov, aspect, 0.1, 500);
    const { target, dir } = this.homeView;
    const b = this.bounds;
    const corners: THREE.Vector3[] = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const portrait = aspect < 1.15;
    const yMin = portrait ? -0.7 : -0.76;
    const yMax = portrait ? 0.6 : 0.86;
    const p = new THREE.Vector3();
    const fits = (d: number) => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      return corners.every((c) => {
        p.copy(c).project(cam);
        return p.z < 1 && Math.abs(p.x) <= 0.96 && p.y >= yMin && p.y <= yMax;
      });
    };
    let lo = 4;
    let hi = 160;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.homeView.pos.copy(target).addScaledVector(dir, hi);
    this.controls.maxDistance = Math.max(60, hi * 1.4);
  }

  resetView(): void {
    this.camera.position.copy(this.homeView.pos);
    this.controls.target.copy(this.homeView.target);
    this.controls.update();
    this.userMoved = false;
  }

  /** Ekrandaki bir noktanın altındaki çubuk/davulun hedef anahtarı. */
  pick(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return hit ? (hit.object.userData.targetKey as string) : null;
  }

  // -------------------------------------------------------------------------
  // Kare güncellemesi
  // -------------------------------------------------------------------------

  /**
   * @param marbles  bu karede görünmesi olası bilyeler
   * @param time     dekoratif animasyonlar için serbest akan zaman (saniye)
   */
  update(marbles: Iterable<ActiveMarble>, time: number): void {
    this.energies.forEach((e) => {
      e.energy = 0;
      e.last = Infinity;
    });

    let ng = 0;
    let ns = 0;
    let nr = 0;
    let nt = 0;
    const st = this.st;
    const notes = this.notes;
    notes.begin();

    for (const mb of marbles) {
      const t = mb.target;
      if (mb.dt >= 0 && mb.dt < 1.4) {
        this.react(mb);
        if (mb.dt < RING_LIFE && nr < MAX_RINGS) {
          const k = mb.dt / RING_LIFE;
          const radius = 0.06 + mb.dt * (t.kind === 'drum' ? 2.2 : 1.1);
          this.v3.set(t.hit.x, t.hit.y - MARBLE_RADIUS + 0.012, t.hit.z);
          this.s3.setScalar(radius);
          this.m4.compose(this.v3, this.flatRing, this.s3);
          this.rings.setMatrixAt(nr, this.m4);
          const fade = (1 - k) * (1 - k) * (0.5 + 0.8 * mb.velocity);
          this.col.setRGB(t.color[0] * fade, t.color[1] * fade, t.color[2] * fade, THREE.SRGBColorSpace);
          this.rings.setColorAt(nr, this.col);
          nr++;
        }
        if (mb.dt < NOTE_LIFE && this.spawnsNote(mb)) this.pushNote(mb);
      }

      marbleAt(t, mb.dt, st);
      if (st.phase === 'pending' || st.phase === 'done' || st.scale <= 0.001) continue;
      const mesh = mb.steel ? this.steel : this.glass;
      const idx = mb.steel ? ns : ng;
      if (idx >= mesh.instanceMatrix.count) continue;

      const r = rng(mb.seed);
      this.euler.set(r() * 6.28, r() * 6.28, r() * 6.28);
      this.qBase.setFromEuler(this.euler);
      this.qSpin.setFromAxisAngle(this.zAxis, st.spin);
      this.q.multiplyQuaternions(this.qSpin, this.qBase);
      this.v3.set(st.pos.x, st.pos.y, st.pos.z);
      this.s3.setScalar(st.scale);
      this.m4.compose(this.v3, this.q, this.s3);
      mesh.setMatrixAt(idx, this.m4);
      const [cr, cg, cb] = t.color;
      if (!mb.steel) {
        this.col.setRGB(0.22 + cr * 0.85, 0.22 + cg * 0.85, 0.22 + cb * 0.85, THREE.SRGBColorSpace);
        mesh.setColorAt(idx, this.col);
        ng++;
      } else {
        ns++;
      }

      // Hareket izi: hızı sonlu farkla bul, hızlıysa arkasına sönen bir kuyruk koy.
      const h = 1 / 90;
      marbleAt(t, mb.dt - h, this.st2);
      if (this.st2.phase !== 'pending' && this.st2.phase !== 'emerge' && nt < MAX_MARBLES) {
        this.vel.set(st.pos.x - this.st2.pos.x, st.pos.y - this.st2.pos.y, st.pos.z - this.st2.pos.z).divideScalar(h);
        const speed = this.vel.length();
        if (speed > 2.2) {
          this.vel.divideScalar(-speed); // kuyruk hareketin tersine
          this.q.setFromUnitVectors(this.zAxis, this.vel);
          const rad = MARBLE_RADIUS * 0.92 * st.scale;
          this.s3.set(rad, rad, Math.min(0.6, speed * 0.05));
          this.m4.compose(this.v3, this.q, this.s3);
          this.trails.setMatrixAt(nt, this.m4);
          const k = mb.steel ? 0.3 : 0.6;
          if (mb.steel) this.col.setRGB(k, k, k * 1.05);
          else this.col.setRGB(cr * k, cg * k, cb * k, THREE.SRGBColorSpace);
          this.trails.setColorAt(nt, this.col);
          nt++;
        }
      }
    }

    this.commit(this.glass, ng);
    this.commit(this.steel, ns);
    this.commit(this.rings, nr);
    this.commit(this.trails, nt);
    notes.end();
    this.applyReactions();
    this.animateLift(time);
  }

  private react(mb: ActiveMarble): void {
    const key = mb.target.key;
    let e = this.energies.get(key);
    if (!e) {
      e = { energy: 0, last: Infinity, lastVel: 0 };
      this.energies.set(key, e);
    }
    e.energy += mb.velocity * Math.exp(-mb.dt * 7);
    if (mb.dt < e.last) {
      e.last = mb.dt;
      e.lastVel = mb.velocity;
    }
  }

  /** Her vuruş simge çıkarmaz: kalabalık olmasın diye tohuma göre seçilir. */
  private spawnsNote(mb: ActiveMarble): boolean {
    const key = mb.target.key;
    if (key === 'drum:hihatClosed' || key === 'drum:ride') return false;
    return mb.seed % (mb.target.kind === 'drum' ? 3 : 2) === 0;
  }

  private pushNote(mb: ActiveMarble): void {
    const t = mb.target;
    const dt = mb.dt;
    const r = rng(mb.seed + 7);
    const drift = (r() - 0.5) * 0.5;
    const appear = Math.min(1, dt / 0.12);
    const fade = Math.pow(1 - dt / NOTE_LIFE, 1.4);
    const grow = 1 - Math.pow(1 - Math.min(1, dt * 5), 3);
    const x = t.hit.x + drift * dt + Math.sin(dt * 4 + r() * 6) * 0.08;
    const y = t.hit.y + 0.2 + dt * 1.15 - dt * dt * 0.15;
    const z = t.hit.z + 0.12;
    const [cr, cg, cb] = t.color;
    const glow = 1.5 + mb.velocity;
    this.col.setRGB(cr * 0.7 + 0.3, cg * 0.7 + 0.3, cb * 0.7 + 0.3, THREE.SRGBColorSpace);
    this.notes.push(x, y, z, this.col.r * glow, this.col.g * glow, this.col.b * glow, appear * fade, 0.26 * grow * (0.8 + 0.4 * mb.velocity), Math.floor(r() * 4), Math.sin(dt * 2.5 + r() * 6) * 0.35);
  }

  private commit(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private applyReactions(): void {
    for (const bar of this.bars.values()) {
      const e = this.energies.get(`bar:${bar.spec.midi}`);
      const energy = e ? Math.min(1.4, e.energy) : 0;
      bar.material.emissiveIntensity = energy * 0.6;
      bar.glow.color.copy(bar.color).multiplyScalar(energy * 1.3);
      if (e && e.last < 1) {
        const w = e.lastVel * Math.exp(-e.last * 9) * Math.cos(e.last * 52);
        bar.mesh.position.y = bar.baseY - 0.028 * w;
        bar.mesh.rotation.z = 0.025 * w;
      } else {
        bar.mesh.position.y = bar.baseY;
        bar.mesh.rotation.z = 0;
      }
    }

    for (const [piece, d] of this.drums) {
      const e = this.energies.get(`drum:${piece}`);
      const open = piece === 'hihatClosed' ? this.energies.get('drum:hihatOpen') : undefined;
      const latest = pickLatest(e, open);
      const energy = latest ? Math.min(1.5, latest.energy) : 0;
      d.glow.color.copy(d.glowColor).multiplyScalar(energy * (d.spec.cymbal ? 0.55 : 0.4));
      if (d.spec.cymbal) {
        if (latest) {
          const decay = piece === 'hihatClosed' ? 6 : 2.2;
          const w = latest.lastVel * Math.exp(-latest.last * decay) * Math.sin(latest.last * 18);
          d.body.rotation.x = d.baseTilt + 0.16 * w;
          d.body.rotation.z = 0.06 * w;
        } else {
          d.body.rotation.x = d.baseTilt;
          d.body.rotation.z = 0;
        }
      } else {
        const base = d.spec.top - d.spec.depth / 2;
        if (latest) {
          const w = latest.lastVel * Math.exp(-latest.last * 11) * Math.cos(latest.last * 40);
          d.body.scale.set(1 + 0.03 * w, 1 - 0.05 * w, 1 + 0.03 * w);
          d.body.position.y = base - 0.02 * w;
        } else {
          d.body.scale.set(1, 1, 1);
          d.body.position.y = base;
        }
      }
    }

    for (const a of this.accents) {
      let pulse = 0;
      for (const k of a.keys) {
        const e = this.energies.get(k);
        if (e) pulse = Math.max(pulse, Math.min(1.2, e.energy));
      }
      a.light.intensity = a.base + a.gain * pulse;
    }
  }

  private animateLift(time: number): void {
    const { cups, marbles, bottom, top, x, z, count } = this.machine.lift;
    const R = 0.22;
    const height = top - bottom;
    const loop = 2 * height + 2 * Math.PI * R;
    for (let i = 0; i < count; i++) {
      let s = (((time * 0.35 + (i / count) * loop) % loop) + loop) % loop;
      let py: number;
      let pz = z;
      const rising = s < height;
      if (rising) {
        py = bottom + s;
        pz = z + R;
      } else if ((s -= height) < Math.PI * R) {
        const a = s / R;
        py = top + Math.sin(a) * R;
        pz = z + Math.cos(a) * R;
      } else if ((s -= Math.PI * R) < height) {
        py = top - s;
        pz = z - R;
      } else {
        s -= height;
        const a = s / R + Math.PI;
        py = bottom + Math.sin(a) * R;
        pz = z + Math.cos(a) * R;
      }
      this.v3.set(x, py, pz);
      this.s3.set(1, 1, 1);
      this.m4.compose(this.v3, this.q.identity(), this.s3);
      cups.setMatrixAt(i, this.m4);
      // Yukarı çıkan kovalar birer bilye taşır.
      this.v3.set(x, py + 0.1, pz);
      this.s3.setScalar(rising ? 1 : 0);
      this.m4.compose(this.v3, this.q, this.s3);
      marbles.setMatrixAt(i, this.m4);
    }
    cups.instanceMatrix.needsUpdate = true;
    marbles.instanceMatrix.needsUpdate = true;
  }

  render(): void {
    this.controls.update();
    this.post.setFocus(this.camera.position.distanceTo(this.controls.target));
    this.post.render();
    this.monitorPerformance();
  }
}

function pickLatest(a?: Energy, b?: Energy): Energy | undefined {
  const va = a && a.last < Infinity ? a : undefined;
  const vb = b && b.last < Infinity ? b : undefined;
  if (va && vb) return va.last <= vb.last ? va : vb;
  return va ?? vb;
}
