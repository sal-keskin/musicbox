/**
 * Makinenin 3B parçalarını kuran yardımcılar: sahne, fon, ksilofon, davul seti,
 * nozullar, oluklar, üst güverte, toplama kutusu ve asansör.
 *
 * Malzemeler "gerçekçi ama stilize" bir oyuncak hissi için seçildi:
 * satin ceviz, fırçalanmış pirinç, cilalı renkli tuşlar, saten zil metali,
 * cam bilyeler. Hareket etmeyen parçalar sonradan malzemeye göre birleştirilir.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { DrumPiece } from '../engine/types';
import { barKey, drumKey, gutterY, MARBLE_RADIUS, type BarSpec, type DrumSpec, type Gutter, type MachineLayout, type Vec3 } from './layout';
import { mergeStatic } from './merge';
import { cymbalTexture, drumHeadTexture, glowTexture, marbleTexture, rng, skyTexture, stageTexture, walnutTexture, woodTexture } from './textures';

/**
 * Katmanlar: 0 statik makine (yansır), 1 hareketli cisimler (bilyeler),
 * 2 zemin (yansımaz), 3 saydam/ışıklı efektler (AO ve alan derinliği
 * geçişlerinde yok sayılır, yoksa görünmez geometrileri gölge bırakır).
 */
export const LAYER_DYNAMIC = 1;
export const LAYER_FLOOR = 2;
export const LAYER_FX = 3;

export interface Materials {
  wood: THREE.MeshPhysicalMaterial;
  darkWood: THREE.MeshPhysicalMaterial;
  lightWood: THREE.MeshPhysicalMaterial;
  brass: THREE.MeshPhysicalMaterial;
  polishedBrass: THREE.MeshPhysicalMaterial;
  chrome: THREE.MeshPhysicalMaterial;
  felt: THREE.MeshStandardMaterial;
  shell: THREE.MeshPhysicalMaterial;
  head: THREE.MeshPhysicalMaterial;
  cymbal: THREE.MeshPhysicalMaterial;
  grain: THREE.Texture;
  marble: THREE.MeshPhysicalMaterial;
}

export function createMaterials(): Materials {
  const walnut = walnutTexture(7);
  walnut.repeat.set(1.5, 1);
  const darkWalnut = walnutTexture(21, true);
  const maple = woodTexture('#e2c08f', '#a87a45', 33);
  const grain = woodTexture('#ffffff', '#c9bfb0', 5);
  const satin = { roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.32, metalness: 0 };
  return {
    wood: new THREE.MeshPhysicalMaterial({ map: walnut, ...satin }),
    darkWood: new THREE.MeshPhysicalMaterial({ map: darkWalnut, ...satin, roughness: 0.48 }),
    lightWood: new THREE.MeshPhysicalMaterial({ map: maple, ...satin }),
    // Fırçalanmış pirinç: anizotropi parlamayı fırça izleri boyunca uzatır.
    brass: new THREE.MeshPhysicalMaterial({
      color: 0xd9a64a,
      metalness: 1,
      roughness: 0.34,
      anisotropy: 0.75,
      anisotropyRotation: Math.PI / 2,
    }),
    polishedBrass: new THREE.MeshPhysicalMaterial({ color: 0xe6b55a, metalness: 1, roughness: 0.16, clearcoat: 0.5 }),
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xeef2f7, metalness: 1, roughness: 0.1 }),
    felt: new THREE.MeshStandardMaterial({ color: 0x8e2a3a, roughness: 1 }),
    shell: new THREE.MeshPhysicalMaterial({
      color: 0xd22c48,
      metalness: 0.35,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      sheen: 0.3,
      sheenColor: new THREE.Color(0xff8a9a),
    }),
    head: new THREE.MeshPhysicalMaterial({ map: drumHeadTexture(), roughness: 0.55, sheen: 0.5, sheenRoughness: 0.6, clearcoat: 0.2 }),
    cymbal: new THREE.MeshPhysicalMaterial({
      map: cymbalTexture(),
      color: 0xfff1d6,
      metalness: 1,
      roughness: 0.26,
      anisotropy: 0.85,
      side: THREE.DoubleSide,
    }),
    grain,
    marble: marbleMaterial(false),
  };
}

/**
 * Cam bilye malzemesi. Örnek (instance) rengi camın rengidir; ayrıca yüzün
 * kameraya baktığı yerde güçlenen hafif bir iç ışıma eklenir: ışık camın
 * içinden geçiyormuş gibi.
 */
export function marbleMaterial(transmission: boolean): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    map: marbleTexture(),
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    ior: 1.5,
    iridescence: 0.2,
    transmission: transmission ? 0.7 : 0,
    thickness: transmission ? 0.16 : 0,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
#ifdef USE_INSTANCING_COLOR
float facing = max(dot(normal, normalize(vViewPosition)), 0.0);
totalEmissiveRadiance += vColor * (0.1 + 0.42 * pow(facing, 2.5));
#endif`,
    );
  };
  m.customProgramCacheKey = () => `marble-${transmission}`;
  return m;
}

function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.castShadow = cast;
  o.receiveShadow = receive;
  return o;
}

/** a ve b noktalarını birleştiren silindir. */
function rod(a: Vec3, b: Vec3, radius: number, material: THREE.Material, segments = 12): THREE.Mesh {
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, segments);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return shadowed(mesh);
}

/** a ve b arasında, kesiti w×h olan pahlı kutu kiriş. */
function beam(a: Vec3, b: Vec3, w: number, h: number, material: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = dir.length();
  const geo = new RoundedBoxGeometry(len, h, w, 3, Math.min(w, h) * 0.3);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
  return shadowed(mesh);
}

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, r = 0.035): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), material);
  mesh.position.set(x, y, z);
  return shadowed(mesh);
}

function glowMaterial(color: THREE.ColorRepresentation, intensity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });
}

// ---------------------------------------------------------------------------
// Sahne, fon ve ışık dizileri
// ---------------------------------------------------------------------------

export interface StageVisual {
  group: THREE.Group;
  /** Temas gölgesi pişirilirken gizlenecek zemin parçaları. */
  floorParts: THREE.Object3D[];
  center: THREE.Vector3;
  radius: number;
}

export function buildStage(layout: MachineLayout): StageVisual {
  const g = new THREE.Group();
  const cx = (layout.collector.x + layout.kitX + 2.6) / 2;
  const radius = 14;
  const floorParts: THREE.Object3D[] = [];

  const top = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 128),
    new THREE.MeshPhysicalMaterial({ map: stageTexture(), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.set(cx, 0, 0);
  top.receiveShadow = true;
  const side = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius + 0.35, 0.4, 128, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b1628, roughness: 0.7 }),
  );
  side.position.set(cx, -0.2, 0);
  g.add(top, side);

  // Sahne kenarında sıcak ışık şeridi (bloom ile parlar)
  const rimColor = new THREE.Color(0xff9d4d);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.02, 0.045, 10, 220),
    new THREE.MeshStandardMaterial({ color: 0x3a2412, emissive: rimColor, emissiveIntensity: 1.6 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(cx, 0.01, 0);
  rim.userData.bloom = glowMaterial(rimColor, 0.9);
  g.add(rim);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 64), new THREE.MeshStandardMaterial({ color: 0x15111f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.4, 0);
  ground.receiveShadow = true;
  g.add(ground);

  // Makinenin önüne sıcak bir ışık havuzu: ön plan aydınlık, arka plan karanlık
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 16),
    new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(255,176,110,0.16)', 'rgba(255,176,110,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(cx, 0.008, 2.2);
  pool.userData.bloom = 'hide';
  g.add(pool);

  for (const o of [top, side, ground, pool]) o.layers.set(LAYER_FLOOR);
  floorParts.push(top, side, ground, pool, rim);

  // Fon: arkada kavisli, koyu bir perde
  const backdrop = new THREE.Mesh(
    new THREE.CylinderGeometry(34, 34, 26, 96, 1, true, Math.PI * 0.62, Math.PI * 0.76),
    new THREE.MeshBasicMaterial({ map: skyTexture('#0d0b18', '#1d1730', '#2e2244'), side: THREE.BackSide, fog: false }),
  );
  backdrop.position.set(cx, 11, 6);
  backdrop.userData.bloom = 'hide';
  g.add(backdrop);
  floorParts.push(backdrop);

  // Arka planda yumuşak ışık dizileri: alan derinliğiyle bokeh'e dönüşür
  const bulbs = 120;
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs);
  const r = rng(42);
  const m = new THREE.Matrix4();
  const palette = [0xffb35c, 0xff7aa8, 0x9f8cff, 0x6fd6ff, 0xffe08a];
  for (let i = 0; i < bulbs; i++) {
    const row = i % 3;
    const t = (Math.floor(i / 3) / (bulbs / 3)) * 2 - 1;
    const angle = Math.PI * 0.5 + t * 1.15;
    const dist = 19 + row * 4.5;
    const x = cx + Math.cos(angle) * dist * 1.25;
    const z = -Math.sin(angle) * dist + 3;
    const y = 4.5 + row * 2.2 + Math.cos(t * 9 + row) * 0.6;
    const s = 0.8 + r() * 0.7;
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    bulbMesh.setMatrixAt(i, m);
    const c = new THREE.Color(palette[Math.floor(r() * palette.length)]).multiplyScalar(1.6 + r());
    bulbMesh.setColorAt(i, c);
  }
  bulbMesh.userData.bloom = 'self';
  g.add(bulbMesh);
  floorParts.push(bulbMesh);

  return { group: g, floorParts, center: new THREE.Vector3(cx, 0, 0), radius };
}

// ---------------------------------------------------------------------------
// Ksilofon
// ---------------------------------------------------------------------------

export interface BarVisual {
  spec: BarSpec;
  mesh: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
  /** Parıltı çiziminde kullanılan, vuruşla parlayan malzeme. */
  glow: THREE.MeshBasicMaterial;
  color: THREE.Color;
  baseY: number;
}

export function buildXylophone(layout: MachineLayout, mats: Materials, pickables: THREE.Object3D[]): { group: THREE.Group; bars: Map<number, BarVisual> } {
  const group = new THREE.Group();
  const bars = new Map<number, BarVisual>();

  for (const spec of layout.bars) {
    const color = new THREE.Color().setRGB(...spec.color, THREE.SRGBColorSpace);
    const material = new THREE.MeshPhysicalMaterial({
      color,
      map: mats.grain,
      roughness: 0.28,
      clearcoat: 0.7,
      clearcoatRoughness: 0.08,
      envMapIntensity: 0.55,
      emissive: color,
      emissiveIntensity: 0,
    });
    const bevel = Math.min(0.05, spec.thickness * 0.42);
    const geo = new RoundedBoxGeometry(spec.width, spec.thickness, spec.length, 4, bevel);
    const mesh = shadowed(new THREE.Mesh(geo, material));
    const baseY = spec.top - spec.thickness / 2;
    mesh.position.set(spec.x, baseY, spec.z);
    mesh.userData.targetKey = barKey(spec.midi);
    const glow = new THREE.MeshBasicMaterial({ color: 0x000000 });
    mesh.userData.bloom = glow;
    group.add(mesh);
    pickables.push(mesh);
    bars.set(spec.midi, { spec, mesh, material, glow, color, baseY });
  }

  // Çubukların taşıyıcı rayları (düğüm noktalarında, keçe kaplı)
  for (const sharp of [false, true]) {
    const row = layout.bars.filter((b) => b.sharp === sharp);
    const first = row[0];
    const last = row[row.length - 1];
    for (const node of [0.224, 0.776]) {
      const zOf = (b: BarSpec) => (sharp ? b.z + b.length / 2 - node * b.length : b.z - b.length / 2 + node * b.length);
      const yOf = (b: BarSpec) => b.top - b.thickness - 0.025;
      const a = { x: first.x - 0.22, y: yOf(first), z: zOf(first) };
      const b = { x: last.x + 0.22, y: yOf(last), z: zOf(last) };
      group.add(rod(a, b, 0.028, mats.felt, 8));
      group.add(beam({ ...a, y: a.y - 0.12 }, { ...b, y: b.y - 0.12 }, 0.12, 0.16, mats.wood));
    }
  }

  // Rezonatör boruları (fırçalanmış pirinç)
  const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false);
  const tubes = new THREE.InstancedMesh(tubeGeo, mats.brass, layout.bars.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  layout.bars.forEach((spec, i) => {
    const t = (spec.length - 1.02) / (2.05 - 1.02);
    const len = 0.32 + 1.05 * t;
    const top = spec.top - spec.thickness - 0.22;
    const r = spec.width * (spec.sharp ? 0.34 : 0.38);
    m.compose(new THREE.Vector3(spec.x, top - len / 2, spec.z), q, new THREE.Vector3(r, len, r));
    tubes.setMatrixAt(i, m);
  });
  shadowed(tubes);
  group.add(tubes);

  // Ayaklar ve gergi kirişleri
  const nat = layout.bars.filter((b) => !b.sharp);
  const sh = layout.bars.filter((b) => b.sharp);
  const legY = 1.95;
  const ends = [
    { x: nat[0].x - 0.32, zf: nat[0].length * 0.85, zb: -0.16 - sh[0].length * 0.85 },
    { x: nat[nat.length - 1].x + 0.32, zf: nat[nat.length - 1].length * 0.85, zb: -0.16 - sh[sh.length - 1].length * 0.85 },
  ];
  for (const e of ends) {
    for (const z of [e.zf, e.zb]) {
      group.add(box(0.17, legY, 0.17, mats.darkWood, e.x, legY / 2, z, 0.045));
      group.add(box(0.21, 0.06, 0.21, mats.polishedBrass, e.x, 0.03, z, 0.02));
    }
    group.add(beam({ x: e.x, y: legY, z: e.zf + 0.1 }, { x: e.x, y: legY, z: e.zb - 0.1 }, 0.16, 0.18, mats.wood));
    group.add(beam({ x: e.x, y: 0.35, z: e.zf }, { x: e.x, y: 0.35, z: e.zb }, 0.1, 0.1, mats.darkWood));
  }
  const midX = (ends[0].x + ends[1].x) / 2;
  group.add(beam({ x: ends[0].x, y: 0.35, z: 0 }, { x: ends[1].x, y: 0.35, z: 0 }, 0.12, 0.12, mats.darkWood));
  group.add(box(0.15, 0.35, 0.15, mats.darkWood, midX, 0.175, 0, 0.03));

  mergeStatic(group, (o) => pickables.includes(o));
  return { group, bars };
}

// ---------------------------------------------------------------------------
// Davul seti
// ---------------------------------------------------------------------------

export interface DrumVisual {
  spec: DrumSpec;
  /** Vuruşta zıplayan/titreyen parça. */
  body: THREE.Object3D;
  head?: THREE.Mesh;
  /** Parıltı çiziminde vuruşla parlayan malzeme. */
  glow: THREE.MeshBasicMaterial;
  glowColor: THREE.Color;
  baseTilt: number;
}

function kickHeadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  grad.addColorStop(0, '#fbf7ee');
  grad.addColorStop(1, '#e8dfcd');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#d22c48';
  g.lineWidth = 14;
  g.beginPath();
  g.arc(256, 256, 170, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#d22c48';
  g.font = 'bold 82px "Trebuchet MS", "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('MUSIC', 256, 222);
  g.fillText('BOX', 256, 300);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cymbalGeometry(radius: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.001, 0.0),
    new THREE.Vector2(radius * 0.1, -0.004),
    new THREE.Vector2(radius * 0.2, -0.03),
    new THREE.Vector2(radius * 0.24, -0.045),
    new THREE.Vector2(radius * 0.6, -0.07),
    new THREE.Vector2(radius * 0.97, -0.098),
    new THREE.Vector2(radius, -0.102),
  ];
  return new THREE.LatheGeometry(pts, 72);
}

function tripod(group: THREE.Group, mats: Materials, x: number, z: number, height: number, spread = 0.38): void {
  group.add(rod({ x, y: 0.12, z }, { x, y: height, z }, 0.025, mats.chrome));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    group.add(rod({ x, y: 0.42, z }, { x: x + Math.cos(a) * spread, y: 0.02, z: z + Math.sin(a) * spread }, 0.018, mats.chrome));
  }
}

export function buildDrums(layout: MachineLayout, mats: Materials, pickables: THREE.Object3D[]): { group: THREE.Group; drums: Map<DrumPiece, DrumVisual> } {
  const group = new THREE.Group();
  const drums = new Map<DrumPiece, DrumVisual>();
  const animated: THREE.Object3D[] = [];
  const snareShell = new THREE.MeshPhysicalMaterial({ color: 0xe3e8ee, metalness: 1, roughness: 0.2, anisotropy: 0.6 });
  const headGlowColor = new THREE.Color(1, 0.96, 0.9);
  const cymbalGlowColor = new THREE.Color(1, 0.78, 0.4);

  for (const d of layout.drums) {
    const key = drumKey(d.piece);
    if (!d.cymbal) {
      const body = new THREE.Group();
      body.position.set(d.x, d.top - d.depth / 2, d.z);
      const shellMat = d.piece === 'snare' ? snareShell : mats.shell;
      const shell = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(d.radius, d.radius, d.depth, 56, 1, true), shellMat));
      body.add(shell);
      const headMat = d.piece === 'kick' ? mats.head.clone() : mats.head;
      if (d.piece === 'kick') headMat.map = kickHeadTexture();
      const head = shadowed(new THREE.Mesh(new THREE.CircleGeometry(d.radius * 0.985, 56), headMat));
      head.rotation.x = -Math.PI / 2;
      head.position.y = d.depth / 2 + 0.004;
      const glow = new THREE.MeshBasicMaterial({ color: 0x000000 });
      head.userData.bloom = glow;
      body.add(head);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(d.radius * 0.985, 56), mats.head);
      bottom.rotation.x = Math.PI / 2;
      bottom.position.y = -d.depth / 2;
      body.add(bottom);
      for (const y of [d.depth / 2, -d.depth / 2]) {
        const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(d.radius + 0.008, 0.026, 12, 64), mats.chrome));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = y;
        body.add(rim);
      }
      const lugs = Math.round(6 + d.radius * 4);
      for (let i = 0; i < lugs; i++) {
        const a = (i / lugs) * Math.PI * 2;
        const lug = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.05, Math.min(0.2, d.depth * 0.5), 0.05, 2, 0.018), mats.chrome));
        lug.position.set(Math.cos(a) * (d.radius + 0.02), 0, Math.sin(a) * (d.radius + 0.02));
        body.add(lug);
      }
      shell.userData.targetKey = key;
      head.userData.targetKey = key;
      pickables.push(shell, head);
      group.add(body);
      animated.push(body);
      mergeStatic(body, (o) => pickables.includes(o));

      const bottomY = d.top - d.depth;
      if (d.piece === 'kick') {
        for (const s of [-1, 1]) group.add(rod({ x: d.x + s * d.radius * 0.8, y: bottomY + 0.2, z: d.z + 0.2 }, { x: d.x + s * d.radius * 1.05, y: 0.0, z: d.z + 0.5 }, 0.02, mats.chrome));
      } else if (d.piece === 'tomFloor') {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.3;
          const px = d.x + Math.cos(a) * (d.radius + 0.06);
          const pz = d.z + Math.sin(a) * (d.radius + 0.06);
          group.add(rod({ x: px, y: d.top - 0.1, z: pz }, { x: px + Math.cos(a) * 0.12, y: 0.02, z: pz + Math.sin(a) * 0.12 }, 0.02, mats.chrome));
        }
      } else {
        tripod(group, mats, d.x, d.z, bottomY);
      }
      drums.set(d.piece, { spec: d, body, head, glow, glowColor: headGlowColor, baseTilt: 0 });
    } else {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, d.top, d.z);
      pivot.rotation.x = d.tilt;
      const cym = shadowed(new THREE.Mesh(cymbalGeometry(d.radius), mats.cymbal));
      const glow = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
      cym.userData.bloom = glow;
      pivot.add(cym);
      cym.userData.targetKey = key;
      pickables.push(cym);
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), mats.chrome);
      nut.position.y = 0.02;
      pivot.add(nut);
      group.add(pivot);
      animated.push(pivot);
      if (d.piece === 'hihatClosed') {
        const lower = shadowed(new THREE.Mesh(cymbalGeometry(d.radius), mats.cymbal));
        lower.rotation.x = Math.PI;
        lower.position.set(d.x, d.top - 0.17, d.z);
        group.add(lower);
        lower.userData.targetKey = key;
        pickables.push(lower);
        tripod(group, mats, d.x, d.z, d.top - 0.02, 0.34);
      } else {
        tripod(group, mats, d.x, d.z, d.top - 0.03, 0.45);
      }
      drums.set(d.piece, { spec: d, body: pivot, glow, glowColor: cymbalGlowColor, baseTilt: d.tilt });
    }
  }
  mergeStatic(group, (o) => pickables.includes(o) || animated.includes(o));
  return { group, drums };
}

// ---------------------------------------------------------------------------
// Makine: üst güverte, nozullar, oluklar, toplama kutusu, asansör
// ---------------------------------------------------------------------------

export interface MachineVisual {
  group: THREE.Group;
  /** Asansördeki kovalar ve taşıdıkları bilyeler (zamanla döner). */
  lift: {
    cups: THREE.InstancedMesh;
    marbles: THREE.InstancedMesh;
    bottom: number;
    top: number;
    x: number;
    z: number;
    count: number;
  };
  deckY: number;
}

function marbleGlow(k: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k) });
}

export function buildMachine(layout: MachineLayout, mats: Materials): MachineVisual {
  const group = new THREE.Group();
  const targets = [...layout.targets.values()].filter((t) => t.key !== drumKey('hihatOpen'));
  const keep: THREE.Object3D[] = [];

  // --- Üst güverte -------------------------------------------------------
  const maxNozzle = Math.max(...targets.map((t) => t.nozzle.y));
  const deckBottom = maxNozzle + 0.35;
  const deckH = 0.3;
  const deckY = deckBottom + deckH / 2;
  const x0 = layout.xyloMinX - 0.7;
  const x1 = layout.kitX + 2.75;
  const z0 = -2.05;
  const z1 = 1.75;
  const deck = box(x1 - x0, deckH, z1 - z0, mats.wood, (x0 + x1) / 2, deckY, (z0 + z1) / 2, 0.1);
  deck.castShadow = false;
  keep.push(deck);
  group.add(deck);
  group.add(beam({ x: x0 + 0.05, y: deckY - 0.04, z: z1 + 0.012 }, { x: x1 - 0.05, y: deckY - 0.04, z: z1 + 0.012 }, 0.03, 0.07, mats.polishedBrass));

  // Ortadaki direk yalnızca arkada: önde davulların görüntüsünü kesmesin.
  const posts: [number, number][] = [
    [x0 + 0.25, z0 + 0.25],
    [x0 + 0.25, z1 - 0.25],
    [layout.xyloMaxX + 1.0, z0 + 0.25],
    [x1 - 0.25, z0 + 0.25],
    [x1 - 0.25, z1 - 0.25],
  ];
  for (const [px, pz] of posts) {
    const post = box(0.2, deckBottom, 0.2, mats.darkWood, px, deckBottom / 2, pz, 0.06);
    post.castShadow = false;
    keep.push(post);
    group.add(post);
    group.add(box(0.26, 0.08, 0.26, mats.polishedBrass, px, 0.04, pz, 0.025));
  }

  // --- Nozul boruları ----------------------------------------------------
  const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  const tubes = new THREE.InstancedMesh(tubeGeo, mats.brass, targets.length);
  const collarGeo = new THREE.TorusGeometry(1, 0.32, 12, 28);
  const collarMat = new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0.1, clearcoat: 1 });
  const collars = new THREE.InstancedMesh(collarGeo, collarMat, targets.length);
  const m = new THREE.Matrix4();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const ident = new THREE.Quaternion();
  const tubeR = MARBLE_RADIUS * 1.35;
  targets.forEach((t, i) => {
    const tip = t.nozzle.y + MARBLE_RADIUS * 1.2;
    const len = deckBottom - tip + 0.02;
    m.compose(new THREE.Vector3(t.nozzle.x, tip + len / 2, t.nozzle.z), ident, new THREE.Vector3(tubeR, len, tubeR));
    tubes.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(t.nozzle.x, tip, t.nozzle.z), flat, new THREE.Vector3(tubeR * 1.05, tubeR * 1.05, tubeR * 1.05));
    collars.setMatrixAt(i, m);
    collars.setColorAt(i, new THREE.Color().setRGB(...t.color, THREE.SRGBColorSpace));
  });
  shadowed(tubes);
  shadowed(collars);
  collars.userData.bloom = marbleGlow(0.22); // renkli bilezikler hafifçe ışır
  group.add(tubes, collars);

  // --- Oluklar -------------------------------------------------------------
  for (const g of layout.gutters) group.add(buildGutter(g, mats));

  // --- Toplama kutusu --------------------------------------------------------
  const boxW = 1.15;
  const boxH = 1.2;
  const zMin = Math.min(...layout.gutters.map((g) => g.z)) - 0.4;
  const zMax = Math.max(...layout.gutters.map((g) => g.z)) + 0.4;
  const cx = layout.gutters[0].xLow - boxW / 2 + 0.08;
  const t = 0.07;
  group.add(box(boxW, t, zMax - zMin, mats.darkWood, cx, t / 2, (zMin + zMax) / 2));
  group.add(box(t, boxH, zMax - zMin, mats.wood, cx - boxW / 2, boxH / 2, (zMin + zMax) / 2));
  group.add(box(t, boxH, zMax - zMin, mats.wood, cx + boxW / 2, boxH / 2, (zMin + zMax) / 2));
  group.add(box(boxW, boxH, t, mats.wood, cx, boxH / 2, zMin));
  group.add(box(boxW, boxH, t, mats.wood, cx, boxH / 2, zMax));
  group.add(box(boxW + 0.06, 0.05, 0.05, mats.polishedBrass, cx, boxH, zMax + 0.01, 0.02));

  const sphere = new THREE.SphereGeometry(MARBLE_RADIUS, 16, 12);
  const pileCount = 170;
  const pile = new THREE.InstancedMesh(sphere, mats.marble, pileCount);
  const r = rng(99);
  for (let i = 0; i < pileCount; i++) {
    const px = cx + (r() - 0.5) * (boxW - 0.25);
    const pz = zMin + 0.2 + r() * (zMax - zMin - 0.4);
    const py = 0.1 + r() * 0.35 * (1 - Math.abs(pz - (zMin + zMax) / 2) / ((zMax - zMin) / 2)) + 0.05;
    m.compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().random(), new THREE.Vector3(1, 1, 1));
    pile.setMatrixAt(i, m);
    pile.setColorAt(i, new THREE.Color().setHSL(r(), 0.7, 0.62, THREE.SRGBColorSpace));
  }
  shadowed(pile);
  pile.userData.bloom = marbleGlow(0.12);
  group.add(pile);

  // --- Asansör: bilyeleri kutudan güverteye taşır --------------------------
  const liftX = cx - boxW / 2 - 0.35;
  const liftZ = 0;
  const liftBottom = 0.4;
  const liftTop = deckY + 0.2;
  for (const dz of [-0.2, 0.2]) group.add(rod({ x: liftX, y: 0.05, z: liftZ + dz }, { x: liftX, y: liftTop + 0.3, z: liftZ + dz }, 0.03, mats.brass));
  for (const y of [liftBottom, liftTop]) {
    const wheel = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 10, 36), mats.polishedBrass));
    wheel.position.set(liftX, y, liftZ);
    group.add(wheel);
  }
  group.add(beam({ x: liftX, y: liftTop + 0.3, z: liftZ }, { x: x0 + 0.1, y: deckY + 0.05, z: liftZ }, 0.12, 0.08, mats.brass));
  const cupCount = 18;
  const cups = new THREE.InstancedMesh(new RoundedBoxGeometry(0.2, 0.12, 0.24, 2, 0.035), mats.lightWood, cupCount);
  shadowed(cups);
  group.add(cups);
  const liftMarbles = new THREE.InstancedMesh(sphere, mats.marble, cupCount);
  for (let i = 0; i < cupCount; i++) liftMarbles.setColorAt(i, new THREE.Color().setHSL(r(), 0.75, 0.62, THREE.SRGBColorSpace));
  shadowed(liftMarbles);
  liftMarbles.userData.bloom = marbleGlow(0.3);
  group.add(liftMarbles);

  // --- Güverte üstünde bilye hazneleri (cam fanuslar) ------------------------
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.04,
    transparent: true,
    opacity: 0.18,
    clearcoat: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const hopperXs = [x0 + 1.4, (x0 + x1) / 2 - 1.5, layout.kitX];
  for (const hx of hopperXs) {
    const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.16, 48), mats.polishedBrass));
    base.position.set(hx, deckY + deckH / 2 + 0.08, -0.15);
    group.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.position.set(hx, deckY + deckH / 2 + 0.16, -0.15);
    dome.userData.bloom = 'hide';
    dome.layers.set(LAYER_FX);
    group.add(dome);
    const n = 46;
    const inside = new THREE.InstancedMesh(sphere, mats.marble, n);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 0.4;
      const yy = deckY + deckH / 2 + 0.26 + r() * 0.2 * (1 - rad / 0.45);
      m.compose(new THREE.Vector3(hx + Math.cos(a) * rad, yy, -0.15 + Math.sin(a) * rad), new THREE.Quaternion().random(), new THREE.Vector3(1.1, 1.1, 1.1));
      inside.setMatrixAt(i, m);
      inside.setColorAt(i, new THREE.Color().setHSL(r(), 0.75, 0.62, THREE.SRGBColorSpace));
    }
    inside.userData.bloom = marbleGlow(0.25);
    group.add(inside);
  }

  mergeStatic(group, (o) => keep.includes(o));
  return {
    group,
    lift: { cups, marbles: liftMarbles, bottom: liftBottom, top: liftTop, x: liftX, z: liftZ, count: cupCount },
    deckY,
  };
}

function buildGutter(g: Gutter, mats: Materials): THREE.Group {
  const group = new THREE.Group();
  const R = 0.15;
  const len = Math.hypot(g.xHigh - g.xLow, g.yHigh - g.yLow);
  const geo = new THREE.CylinderGeometry(R, R, len, 32, 1, true, 0, Math.PI);
  geo.rotateZ(-Math.PI / 2);
  const mat = mats.brass.clone();
  mat.side = THREE.DoubleSide;
  const trough = shadowed(new THREE.Mesh(geo, mat));
  const angle = Math.atan2(g.yHigh - g.yLow, g.xHigh - g.xLow);
  const midX = (g.xHigh + g.xLow) / 2;
  trough.position.set(midX, gutterY(g, midX) + R, g.z);
  trough.rotation.z = angle;
  group.add(trough);
  // Oluğun dudakları: iki ince, cilalı pirinç ray
  for (const dz of [-R, R]) {
    group.add(rod({ x: g.xLow, y: g.yLow + R, z: g.z + dz }, { x: g.xHigh, y: g.yHigh + R, z: g.z + dz }, 0.018, mats.polishedBrass, 10));
  }
  const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 20, Math.PI, Math.PI), mat);
  cap.rotation.y = Math.PI / 2;
  cap.position.set(g.xHigh, g.yHigh + R, g.z);
  group.add(cap);
  const steps = Math.max(2, Math.round((g.xHigh - g.xLow) / 2.4));
  for (let i = 0; i <= steps; i++) {
    const x = g.xLow + 0.4 + ((g.xHigh - g.xLow - 0.8) * i) / steps;
    const y = gutterY(g, x);
    group.add(rod({ x, y: 0, z: g.z }, { x, y: y - 0.01, z: g.z }, 0.03, mats.brass, 10));
    group.add(box(0.14, 0.04, 0.14, mats.polishedBrass, x, 0.02, g.z, 0.015));
  }
  return group;
}
