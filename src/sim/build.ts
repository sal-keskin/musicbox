/**
 * Makinenin 3B parçalarını kuran yardımcılar: sahne zemini, ksilofon,
 * davul seti, nozullar, oluklar, üst güverte ve toplama kutusu.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { DrumPiece } from '../engine/types';
import { barKey, drumKey, gutterY, MARBLE_RADIUS, type BarSpec, type DrumSpec, type Gutter, type MachineLayout, type Vec3 } from './layout';
import { cymbalTexture, drumHeadTexture, glowTexture, rng, woodTexture } from './textures';

export interface Materials {
  wood: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  lightWood: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  felt: THREE.MeshStandardMaterial;
  shell: THREE.MeshPhysicalMaterial;
  head: THREE.MeshStandardMaterial;
  cymbal: THREE.MeshStandardMaterial;
  grain: THREE.Texture;
}

export function createMaterials(): Materials {
  const woodMap = woodTexture('#b9824f', '#6b3d1c', 7);
  woodMap.repeat.set(2, 1);
  const darkMap = woodTexture('#7a4a2a', '#3a1d0c', 21);
  const lightMap = woodTexture('#d9b285', '#9c6b3c', 33);
  const grain = woodTexture('#ffffff', '#b9ad9c', 5);
  return {
    wood: new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.55, metalness: 0 }),
    darkWood: new THREE.MeshStandardMaterial({ map: darkMap, roughness: 0.6, metalness: 0 }),
    lightWood: new THREE.MeshStandardMaterial({ map: lightMap, roughness: 0.5, metalness: 0 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd8a64c, metalness: 1, roughness: 0.27 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe9eef4, metalness: 1, roughness: 0.16 }),
    felt: new THREE.MeshStandardMaterial({ color: 0x9a2f3c, roughness: 1 }),
    shell: new THREE.MeshPhysicalMaterial({
      color: 0xd8344f,
      roughness: 0.3,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    }),
    head: new THREE.MeshStandardMaterial({ map: drumHeadTexture(), roughness: 0.75, emissive: 0xffffff, emissiveIntensity: 0 }),
    cymbal: new THREE.MeshStandardMaterial({
      map: cymbalTexture(),
      color: 0xffffff,
      metalness: 0.85,
      roughness: 0.3,
      side: THREE.DoubleSide,
      emissive: 0xffc861,
      emissiveIntensity: 0,
    }),
    grain,
  };
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

/** a ve b arasında, kesiti w×h olan kutu kiriş. */
function beam(a: Vec3, b: Vec3, w: number, h: number, material: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = dir.length();
  const geo = new RoundedBoxGeometry(len, h, w, 2, Math.min(w, h) * 0.25);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
  return shadowed(mesh);
}

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, r = 0.03): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), material);
  mesh.position.set(x, y, z);
  return shadowed(mesh);
}

// ---------------------------------------------------------------------------
// Sahne zemini
// ---------------------------------------------------------------------------

export function buildStage(layout: MachineLayout): THREE.Group {
  const g = new THREE.Group();
  const cx = (layout.collector.x + layout.kitX + 2.6) / 2;

  const stageMat = new THREE.MeshStandardMaterial({ color: 0x3b3552, roughness: 0.92 });
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(14, 14.4, 0.4, 96), stageMat);
  stage.position.set(cx, -0.2, 0);
  stage.receiveShadow = true;
  g.add(stage);

  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8a64c, metalness: 1, roughness: 0.35 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(14.2, 0.06, 8, 160), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(cx, 0.0, 0);
  g.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(80, 64),
    new THREE.MeshStandardMaterial({ color: 0x1e1a2c, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.4, 0);
  ground.receiveShadow = true;
  g.add(ground);

  // Makinenin altına sıcak bir ışık lekesi
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 12),
    new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(255,190,120,0.33)', 'rgba(255,190,120,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(cx, 0.012, 0.6);
  g.add(glow);
  return g;
}

// ---------------------------------------------------------------------------
// Ksilofon
// ---------------------------------------------------------------------------

export interface BarVisual {
  spec: BarSpec;
  mesh: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
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
      roughness: 0.34,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      emissive: color,
      emissiveIntensity: 0,
    });
    const geo = new RoundedBoxGeometry(spec.width, spec.thickness, spec.length, 2, Math.min(0.035, spec.thickness * 0.4));
    const mesh = shadowed(new THREE.Mesh(geo, material));
    const baseY = spec.top - spec.thickness / 2;
    mesh.position.set(spec.x, baseY, spec.z);
    mesh.userData.targetKey = barKey(spec.midi);
    group.add(mesh);
    pickables.push(mesh);
    bars.set(spec.midi, { spec, mesh, material, baseY });
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
      // Rayın altındaki ahşap kiriş
      group.add(beam({ ...a, y: a.y - 0.12 }, { ...b, y: b.y - 0.12 }, 0.12, 0.16, mats.wood));
    }
  }

  // Rezonatör boruları (pirinç)
  const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false);
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
  tubes.castShadow = true;
  tubes.receiveShadow = true;
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
    for (const z of [e.zf, e.zb]) group.add(box(0.17, legY, 0.17, mats.darkWood, e.x, legY / 2, z, 0.04));
    group.add(beam({ x: e.x, y: legY, z: e.zf + 0.1 }, { x: e.x, y: legY, z: e.zb - 0.1 }, 0.16, 0.18, mats.wood));
    group.add(beam({ x: e.x, y: 0.35, z: e.zf }, { x: e.x, y: 0.35, z: e.zb }, 0.1, 0.1, mats.darkWood));
  }
  const midX = (ends[0].x + ends[1].x) / 2;
  group.add(beam({ x: ends[0].x, y: 0.35, z: 0 }, { x: ends[1].x, y: 0.35, z: 0 }, 0.12, 0.12, mats.darkWood));
  group.add(box(0.15, 0.35, 0.15, mats.darkWood, midX, 0.175, 0, 0.03));

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
  /** Zil eksen dönüşü için. */
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
  g.strokeStyle = '#d8344f';
  g.lineWidth = 14;
  g.beginPath();
  g.arc(256, 256, 170, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#d8344f';
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
    new THREE.Vector2(radius, -0.1),
  ];
  return new THREE.LatheGeometry(pts, 64);
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
  const snareShell = new THREE.MeshStandardMaterial({ color: 0xdfe5ec, metalness: 1, roughness: 0.22 });

  for (const d of layout.drums) {
    const key = drumKey(d.piece);
    if (!d.cymbal) {
      const body = new THREE.Group();
      body.position.set(d.x, d.top - d.depth / 2, d.z);
      const shellMat = d.piece === 'snare' ? snareShell : mats.shell;
      const shell = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(d.radius, d.radius, d.depth, 48, 1, true), shellMat));
      body.add(shell);
      const headMat = d.piece === 'kick' ? mats.head.clone() : mats.head;
      if (d.piece === 'kick') headMat.map = kickHeadTexture();
      const head = shadowed(new THREE.Mesh(new THREE.CircleGeometry(d.radius * 0.985, 48), headMat));
      head.rotation.x = -Math.PI / 2;
      head.position.y = d.depth / 2 + 0.004;
      body.add(head);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(d.radius * 0.985, 48), mats.head);
      bottom.rotation.x = Math.PI / 2;
      bottom.position.y = -d.depth / 2;
      body.add(bottom);
      for (const y of [d.depth / 2, -d.depth / 2]) {
        const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(d.radius + 0.008, 0.026, 10, 56), mats.chrome));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = y;
        body.add(rim);
      }
      // Gerdirme kulakları
      const lugs = Math.round(6 + d.radius * 4);
      for (let i = 0; i < lugs; i++) {
        const a = (i / lugs) * Math.PI * 2;
        const lug = new THREE.Mesh(new RoundedBoxGeometry(0.05, Math.min(0.2, d.depth * 0.5), 0.05, 1, 0.015), mats.chrome);
        lug.position.set(Math.cos(a) * (d.radius + 0.02), 0, Math.sin(a) * (d.radius + 0.02));
        body.add(lug);
      }
      shell.userData.targetKey = key;
      head.userData.targetKey = key;
      pickables.push(shell, head);
      group.add(body);

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
      drums.set(d.piece, { spec: d, body, head, baseTilt: 0 });
    } else {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, d.top, d.z);
      pivot.rotation.x = d.tilt;
      const cym = shadowed(new THREE.Mesh(cymbalGeometry(d.radius), mats.cymbal));
      pivot.add(cym);
      cym.userData.targetKey = key;
      pickables.push(cym);
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mats.chrome);
      nut.position.y = 0.02;
      pivot.add(nut);
      group.add(pivot);
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
      drums.set(d.piece, { spec: d, body: pivot, baseTilt: d.tilt });
    }
  }
  return { group, drums };
}

// ---------------------------------------------------------------------------
// Makine: üst güverte, nozullar, oluklar, toplama kutusu
// ---------------------------------------------------------------------------

export interface MachineVisual {
  group: THREE.Group;
  /** Asansördeki kovalar (zamanla döner). */
  lift: { cups: THREE.InstancedMesh; bottom: number; top: number; x: number; z: number; count: number };
  deckY: number;
}

export function buildMachine(layout: MachineLayout, mats: Materials): MachineVisual {
  const group = new THREE.Group();
  const targets = [...layout.targets.values()].filter((t) => t.key !== drumKey('hihatOpen'));

  // --- Üst güverte -------------------------------------------------------
  const maxNozzle = Math.max(...targets.map((t) => t.nozzle.y));
  const deckBottom = maxNozzle + 0.35;
  const deckH = 0.3;
  const deckY = deckBottom + deckH / 2;
  const x0 = layout.xyloMinX - 0.7;
  const x1 = layout.kitX + 2.75;
  const z0 = -2.05;
  const z1 = 1.75;
  const deck = box(x1 - x0, deckH, z1 - z0, mats.wood, (x0 + x1) / 2, deckY, (z0 + z1) / 2, 0.08);
  deck.castShadow = false;
  group.add(deck);
  // Güverte kenarında pirinç şerit
  group.add(beam({ x: x0, y: deckY - 0.05, z: z1 + 0.01 }, { x: x1, y: deckY - 0.05, z: z1 + 0.01 }, 0.03, 0.06, mats.brass));

  // Direkler
  // Ortadaki direk yalnızca arkada: önde davulların görüntüsünü kesmesin.
  const posts: [number, number][] = [
    [x0 + 0.25, z0 + 0.25],
    [x0 + 0.25, z1 - 0.25],
    [layout.xyloMaxX + 1.0, z0 + 0.25],
    [x1 - 0.25, z0 + 0.25],
    [x1 - 0.25, z1 - 0.25],
  ];
  for (const [px, pz] of posts) {
    const post = box(0.2, deckBottom, 0.2, mats.darkWood, px, deckBottom / 2, pz, 0.05);
    post.castShadow = false;
    group.add(post);
  }

  // --- Nozul boruları ----------------------------------------------------
  const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
  const tubes = new THREE.InstancedMesh(tubeGeo, mats.brass, targets.length);
  const collarGeo = new THREE.TorusGeometry(1, 0.32, 10, 24);
  const collarMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 });
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
  tubes.castShadow = true;
  collars.castShadow = true;
  group.add(tubes, collars);

  // --- Oluklar -------------------------------------------------------------
  for (const g of layout.gutters) group.add(buildGutter(g, mats));

  // --- Toplama kutusu --------------------------------------------------------
  const c = layout.collector;
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
  // Kutunun içindeki bilye yığını
  const pileCount = 160;
  const pile = new THREE.InstancedMesh(new THREE.SphereGeometry(MARBLE_RADIUS, 14, 10), new THREE.MeshPhysicalMaterial({ roughness: 0.15, clearcoat: 1 }), pileCount);
  const r = rng(99);
  for (let i = 0; i < pileCount; i++) {
    const px = cx + (r() - 0.5) * (boxW - 0.25);
    const pz = zMin + 0.2 + r() * (zMax - zMin - 0.4);
    const py = 0.1 + r() * 0.35 * (1 - Math.abs(pz - (zMin + zMax) / 2) / ((zMax - zMin) / 2)) + 0.05;
    m.compose(new THREE.Vector3(px, py, pz), ident, new THREE.Vector3(1, 1, 1));
    pile.setMatrixAt(i, m);
    const hue = r();
    pile.setColorAt(i, new THREE.Color().setHSL(hue, 0.7, 0.6, THREE.SRGBColorSpace));
  }
  pile.castShadow = true;
  group.add(pile);
  void c;

  // --- Asansör (dekoratif): bilyeleri kutudan güverteye taşır ------------
  const liftX = cx - boxW / 2 - 0.35;
  const liftZ = 0;
  const liftBottom = 0.4;
  const liftTop = deckY + 0.2;
  for (const dz of [-0.2, 0.2]) group.add(rod({ x: liftX, y: 0.05, z: liftZ + dz }, { x: liftX, y: liftTop + 0.3, z: liftZ + dz }, 0.03, mats.brass));
  for (const y of [liftBottom, liftTop]) {
    const wheel = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 32), mats.brass));
    wheel.position.set(liftX, y, liftZ);
    group.add(wheel);
  }
  group.add(beam({ x: liftX, y: liftTop + 0.3, z: liftZ }, { x: x0 + 0.1, y: deckY + 0.05, z: liftZ }, 0.12, 0.08, mats.brass));
  const cupCount = 18;
  const cups = new THREE.InstancedMesh(new RoundedBoxGeometry(0.2, 0.12, 0.24, 2, 0.03), mats.lightWood, cupCount);
  cups.castShadow = true;
  group.add(cups);

  // Güverte üstünde bilye hazneleri (cam fanuslar)
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.05,
    transmission: 0,
    transparent: true,
    opacity: 0.22,
    clearcoat: 1,
    depthWrite: false,
  });
  const hopperXs = [x0 + 1.4, (x0 + x1) / 2 - 1.5, layout.kitX];
  const marbleMat = new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1 });
  for (const hx of hopperXs) {
    const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.16, 40), mats.brass));
    base.position.set(hx, deckY + deckH / 2 + 0.08, -0.15);
    group.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.position.set(hx, deckY + deckH / 2 + 0.16, -0.15);
    group.add(dome);
    const n = 40;
    const inside = new THREE.InstancedMesh(new THREE.SphereGeometry(MARBLE_RADIUS * 1.1, 12, 8), marbleMat, n);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 0.4;
      const yy = deckY + deckH / 2 + 0.26 + r() * 0.2 * (1 - rad / 0.45);
      m.compose(new THREE.Vector3(hx + Math.cos(a) * rad, yy, -0.15 + Math.sin(a) * rad), ident, new THREE.Vector3(1, 1, 1));
      inside.setMatrixAt(i, m);
      inside.setColorAt(i, new THREE.Color().setHSL(r(), 0.75, 0.6, THREE.SRGBColorSpace));
    }
    group.add(inside);
  }

  return { group, lift: { cups, bottom: liftBottom, top: liftTop, x: liftX, z: liftZ, count: cupCount }, deckY };
}

function buildGutter(g: Gutter, mats: Materials): THREE.Group {
  const group = new THREE.Group();
  const R = 0.15;
  const len = Math.hypot(g.xHigh - g.xLow, g.yHigh - g.yLow);
  const geo = new THREE.CylinderGeometry(R, R, len, 28, 1, true, 0, Math.PI);
  geo.rotateZ(-Math.PI / 2);
  const mat = mats.brass.clone();
  mat.side = THREE.DoubleSide;
  mat.roughness = 0.35;
  const trough = shadowed(new THREE.Mesh(geo, mat));
  const angle = Math.atan2(g.yHigh - g.yLow, g.xHigh - g.xLow);
  const midX = (g.xHigh + g.xLow) / 2;
  trough.position.set(midX, gutterY(g, midX) + R, g.z);
  trough.rotation.z = angle;
  group.add(trough);
  // Kapalı yüksek uç
  const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 20, Math.PI, Math.PI), mat);
  cap.rotation.y = Math.PI / 2;
  cap.position.set(g.xHigh, g.yHigh + R, g.z);
  group.add(cap);
  // Destek ayakları
  const steps = Math.max(2, Math.round((g.xHigh - g.xLow) / 2.4));
  for (let i = 0; i <= steps; i++) {
    const x = g.xLow + 0.4 + ((g.xHigh - g.xLow - 0.8) * i) / steps;
    const y = gutterY(g, x);
    group.add(rod({ x, y: 0, z: g.z }, { x, y: y - 0.01, z: g.z }, 0.03, mats.brass, 8));
  }
  return group;
}
