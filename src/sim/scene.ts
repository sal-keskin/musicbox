/**
 * Bilye makinesinin 3B sahnesi. Her karede etkin bilyelerin listesini alır,
 * konumlarını analitik yörüngelerden hesaplar ve vuruş tepkilerini
 * (çubuk parlaması, davul zıplaması, zil sallanması, halka dalgası) çizer.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DrumPiece } from '../engine/types';
import { buildDrums, buildMachine, buildStage, buildXylophone, createMaterials, type BarVisual, type DrumVisual, type MachineVisual } from './build';
import { MARBLE_RADIUS, type MachineLayout, type Target } from './layout';
import { marbleAt, newMarbleState } from './paths';
import { marbleTexture, rng, skyTexture } from './textures';

export interface ActiveMarble {
  target: Target;
  /** Vuruştan bu yana geçen gerçek süre (saniye; vuruştan önce negatif). */
  dt: number;
  velocity: number;
  /** Nota başına sabit tohum (bilyenin duruşu için). */
  seed: number;
  /** Davul bilyeleri çelik, ksilofon bilyeleri renkli camdır. */
  steel: boolean;
}

const MAX_MARBLES = 900;
const MAX_RINGS = 160;
const RING_LIFE = 0.5;

interface Energy {
  energy: number;
  /** En son vuruştan bu yana geçen süre. */
  last: number;
  lastVel: number;
}

export class MachineScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private readonly container: HTMLElement;
  private readonly bars: Map<number, BarVisual>;
  private readonly drums: Map<DrumPiece, DrumVisual>;
  private readonly machine: MachineVisual;
  private readonly pickables: THREE.Object3D[] = [];
  private readonly glass: THREE.InstancedMesh;
  private readonly steel: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  private readonly energies = new Map<string, Energy>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly homeView: { pos: THREE.Vector3; target: THREE.Vector3; dir: THREE.Vector3 };
  /** Kullanıcı kamerayı elle oynattıysa yeniden boyutlandırmada görünüm sıfırlanmaz. */
  private userMoved = false;

  // Kare başına yeniden kullanılan geçici nesneler
  private readonly st = newMarbleState();
  private readonly m4 = new THREE.Matrix4();
  private readonly v3 = new THREE.Vector3();
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = this.scene;
    scene.background = skyTexture('#141225', '#2b2443', '#4a3552');
    scene.fog = new THREE.Fog(0x2a2340, 34, 80);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    // --- Kamera ---------------------------------------------------------
    const cx = (layout.collector.x + layout.kitX + 2.6) / 2;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    const target = new THREE.Vector3(cx + 0.5, 2.9, 0);
    const pos = new THREE.Vector3(cx + 0.8, 7.4, 22.5);
    this.homeView = { pos, target, dir: pos.clone().sub(target).normalize() };
    this.camera.position.copy(this.homeView.pos);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.copy(this.homeView.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 45;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.addEventListener('start', () => (this.userMoved = true));
    this.controls.update();

    // --- Işıklar -------------------------------------------------------------
    scene.add(new THREE.HemisphereLight(0xc9d6ff, 0x3a2a26, 0.55));
    const key = new THREE.DirectionalLight(0xffe0b5, 2.6);
    key.position.set(cx + 5, 15, 11);
    key.target.position.set(cx, 1.5, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -13;
    sc.right = 13;
    sc.top = 10;
    sc.bottom = -10;
    sc.near = 2;
    sc.far = 45;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.1);
    rim.position.set(cx - 8, 9, -12);
    scene.add(rim);
    const fill = new THREE.PointLight(0xff9a6a, 18, 30, 1.6);
    fill.position.set(cx - 9, 4, 6);
    scene.add(fill);

    // --- Makine ---------------------------------------------------------------
    const mats = createMaterials();
    scene.add(buildStage(layout));
    const xylo = buildXylophone(layout, mats, this.pickables);
    scene.add(xylo.group);
    this.bars = xylo.bars;
    const kit = buildDrums(layout, mats, this.pickables);
    scene.add(kit.group);
    this.drums = kit.drums;
    this.machine = buildMachine(layout, mats);
    scene.add(this.machine.group);

    // --- Bilyeler ---------------------------------------------------------------
    const sphere = new THREE.SphereGeometry(MARBLE_RADIUS, 22, 16);
    const glassMat = new THREE.MeshPhysicalMaterial({
      map: marbleTexture(),
      roughness: 0.1,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      sheen: 0.4,
    });
    // Örnek rengini hafif ışıma olarak da ekle: bilyeler karanlıkta parlasın.
    glassMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance += vColor * 0.22;\n#endif',
      );
    };
    this.glass = this.instanced(sphere, glassMat, MAX_MARBLES);
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xe6ecf3, metalness: 1, roughness: 0.12 });
    this.steel = this.instanced(sphere, steelMat, MAX_MARBLES / 3);

    const ringGeo = new THREE.RingGeometry(0.78, 1, 40);
    const ringMat = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.rings = this.instanced(ringGeo, ringMat, MAX_RINGS);
    this.rings.castShadow = false;

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
    this.scene.add(mesh);
    return mesh;
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect >= 1.2 ? 36 : 46;
    this.camera.updateProjectionMatrix();

    // Makinenin tamamını (yaklaşık 20 × 9 birim) sığdıracak uzaklık.
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfWidth = aspect >= 1.2 ? 11.3 : 10;
    const distance = Math.max(18, halfWidth / (tanHalf * aspect), 4.6 / tanHalf);
    this.homeView.pos.copy(this.homeView.target).addScaledVector(this.homeView.dir, distance);
    this.controls.maxDistance = Math.max(45, distance * 1.5);
    if (!this.userMoved) this.resetView();
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

  /**
   * @param marbles  bu karede görünmesi olası bilyeler
   * @param time     dekoratif animasyonlar için serbest akan zaman (saniye)
   */
  update(marbles: Iterable<ActiveMarble>, time: number, idleSpeed = 1): void {
    this.energies.forEach((e) => {
      e.energy = 0;
      e.last = Infinity;
    });

    let ng = 0;
    let ns = 0;
    let nr = 0;
    const st = this.st;

    for (const mb of marbles) {
      const t = mb.target;
      if (mb.dt >= 0 && mb.dt < 1.2) {
        let e = this.energies.get(t.key);
        if (!e) {
          e = { energy: 0, last: Infinity, lastVel: 0 };
          this.energies.set(t.key, e);
        }
        e.energy += mb.velocity * Math.exp(-mb.dt * 7);
        if (mb.dt < e.last) {
          e.last = mb.dt;
          e.lastVel = mb.velocity;
        }
        if (mb.dt < RING_LIFE && nr < MAX_RINGS) {
          const k = mb.dt / RING_LIFE;
          const radius = 0.06 + mb.dt * (t.kind === 'drum' ? 2.2 : 1.1);
          this.v3.set(t.hit.x, t.hit.y - MARBLE_RADIUS + 0.012, t.hit.z);
          this.s3.set(radius, radius, radius);
          this.m4.compose(this.v3, this.flatRing, this.s3);
          this.rings.setMatrixAt(nr, this.m4);
          const fade = (1 - k) * (1 - k) * (0.4 + 0.6 * mb.velocity);
          this.col.setRGB(t.color[0] * fade, t.color[1] * fade, t.color[2] * fade, THREE.SRGBColorSpace);
          this.rings.setColorAt(nr, this.col);
          nr++;
        }
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
      if (!mb.steel) {
        this.col.setRGB(0.25 + t.color[0] * 0.85, 0.25 + t.color[1] * 0.85, 0.25 + t.color[2] * 0.85, THREE.SRGBColorSpace);
        mesh.setColorAt(idx, this.col);
        ng++;
      } else {
        ns++;
      }
    }

    this.commit(this.glass, ng);
    this.commit(this.steel, ns);
    this.commit(this.rings, nr);
    this.applyReactions();
    this.animateLift(time * idleSpeed);
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
      bar.material.emissiveIntensity = energy * 0.75;
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
      const e = this.energies.get(`drum:${piece}`) ?? (piece === 'hihatClosed' ? this.energies.get('drum:hihatOpen') : undefined);
      const open = piece === 'hihatClosed' ? this.energies.get('drum:hihatOpen') : undefined;
      const latest = pickLatest(e, open);
      if (d.spec.cymbal) {
        if (latest) {
          const decay = piece === 'hihatClosed' ? 6 : 2.2;
          const w = latest.lastVel * Math.exp(-latest.last * decay) * Math.sin(latest.last * 18);
          d.body.rotation.x = d.baseTilt + 0.16 * w;
          d.body.rotation.z = 0.06 * w;
          (this.cymbalMaterial(d) as THREE.MeshStandardMaterial).emissiveIntensity = Math.min(0.6, latest.energy * 0.35);
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
          if (d.head) (d.head.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.min(0.5, latest.energy * 0.3);
        } else {
          d.body.scale.set(1, 1, 1);
          d.body.position.y = base;
          if (d.head) (d.head.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
        }
      }
    }
  }

  private cymbalMaterial(d: DrumVisual): THREE.Material {
    const mesh = d.body.children[0] as THREE.Mesh;
    return mesh.material as THREE.Material;
  }

  private animateLift(time: number): void {
    const { cups, bottom, top, x, z, count } = this.machine.lift;
    const height = top - bottom;
    const loop = 2 * height + 2 * Math.PI * 0.22;
    for (let i = 0; i < count; i++) {
      let s = (((time * 0.35 + (i / count) * loop) % loop) + loop) % loop;
      let px = x;
      let py: number;
      let pz = z;
      if (s < height) {
        py = bottom + s;
        pz = z + 0.22;
      } else if ((s -= height) < Math.PI * 0.22) {
        const a = s / 0.22;
        py = top + Math.sin(a) * 0.22;
        pz = z + Math.cos(a) * 0.22;
      } else if ((s -= Math.PI * 0.22) < height) {
        py = top - s;
        pz = z - 0.22;
      } else {
        s -= height;
        const a = s / 0.22 + Math.PI;
        py = bottom + Math.sin(a) * 0.22;
        pz = z + Math.cos(a) * 0.22;
      }
      this.v3.set(px, py, pz);
      this.s3.set(1, 1, 1);
      this.m4.compose(this.v3, this.q.identity(), this.s3);
      cups.setMatrixAt(i, this.m4);
    }
    cups.instanceMatrix.needsUpdate = true;
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

function pickLatest(a?: Energy, b?: Energy): Energy | undefined {
  const va = a && a.last < Infinity ? a : undefined;
  const vb = b && b.last < Infinity ? b : undefined;
  if (va && vb) return va.last <= vb.last ? va : vb;
  return va ?? vb;
}
