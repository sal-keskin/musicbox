/**
 * Hareket ve "neden-sonuç" efektleri:
 *  - Bilye izleri: hızlı giden bilyenin arkasında sönen, ışıklı bir kuyruk
 *  - Nota simgeleri: vuruş noktasından yükselip kaybolan ♪ ♫ işaretleri
 * İkisi de bilyeler gibi durumsuzdur: her kare yalnızca dt'den hesaplanır.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Bilye izleri
// ---------------------------------------------------------------------------

export function createTrails(count: number): THREE.InstancedMesh {
  // Tabanı bilyede, ucu +z yönünde geride kalan koni; uca doğru kararır.
  const geo = new THREE.ConeGeometry(1, 1, 14, 1, true);
  geo.translate(0, 0.5, 0); // taban y=0, uç y=1
  geo.rotateX(Math.PI / 2); // eksen +z
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getZ(i))); // 0 taban, 1 uç
    const k = (1 - t) * (1 - t);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < count; i++) mesh.setColorAt(i, white);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.userData.bloom = 'self';
  return mesh;
}

// ---------------------------------------------------------------------------
// Nota simgeleri (billboard)
// ---------------------------------------------------------------------------

/** 2×2 dokuda dört nota simgesi: ♪ ♫ ♩ ♬ (yazı tipine bağımlı olmadan çizilir). */
function noteAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 6;

  const head = (x: number, y: number) => {
    g.beginPath();
    g.ellipse(x, y, 17, 12, -0.45, 0, Math.PI * 2);
    g.fill();
  };
  const stem = (x: number, y0: number, y1: number) => {
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y1);
    g.stroke();
  };
  const beam = (x0: number, y0: number, x1: number, y1: number) => {
    g.beginPath();
    g.moveTo(x0 - 3, y0);
    g.lineTo(x1 + 3, y1);
    g.lineTo(x1 + 3, y1 + 13);
    g.lineTo(x0 - 3, y0 + 13);
    g.closePath();
    g.fill();
  };

  // ♪ (0,0)
  head(48, 96);
  stem(63, 92, 26);
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(63, 28);
  g.bezierCurveTo(78, 44, 98, 50, 88, 80);
  g.stroke();
  // ♫ (1,0)
  head(128 + 34, 100);
  head(128 + 88, 88);
  stem(128 + 49, 96, 34);
  stem(128 + 103, 84, 22);
  beam(128 + 49, 34, 128 + 103, 22);
  // ♩ (0,1)
  head(56, 128 + 98);
  stem(71, 128 + 94, 128 + 24);
  // ♬ (1,1)
  head(128 + 34, 128 + 104);
  head(128 + 88, 128 + 92);
  stem(128 + 49, 128 + 100, 128 + 32);
  stem(128 + 103, 128 + 88, 128 + 20);
  beam(128 + 49, 128 + 32, 128 + 103, 128 + 20);
  beam(128 + 49, 128 + 52, 128 + 103, 128 + 40);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class NoteSprites {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly offsets: THREE.InstancedBufferAttribute;
  private readonly colors: THREE.InstancedBufferAttribute;
  private readonly params: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor(readonly capacity: number) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.offsets = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.params = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iOffset', this.offsets);
    geo.setAttribute('iColor', this.colors);
    geo.setAttribute('iParams', this.params); // ölçek, simge, dönüş
    geo.instanceCount = 0;
    this.geometry = geo;

    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: noteAtlas() } },
      vertexShader: /* glsl */ `
        attribute vec3 iOffset;
        attribute vec4 iColor;
        attribute vec3 iParams;
        varying vec2 vUv;
        varying vec4 vColor;
        void main() {
          float s = iParams.x;
          float glyph = iParams.y;
          float c = cos(iParams.z), si = sin(iParams.z);
          vec2 p = vec2(c * position.x - si * position.y, si * position.x + c * position.y) * s;
          vec4 mv = modelViewMatrix * vec4(iOffset, 1.0);
          mv.xy += p;
          gl_Position = projectionMatrix * mv;
          vec2 cell = vec2(mod(glyph, 2.0), 1.0 - floor(glyph / 2.0));
          vUv = (uv + cell) * 0.5;
          vColor = iColor;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec4 vColor;
        void main() {
          float a = texture2D(map, vUv).a * vColor.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.userData.bloom = 'self';
  }

  begin(): void {
    this.n = 0;
  }

  push(x: number, y: number, z: number, r: number, g: number, b: number, alpha: number, scale: number, glyph: number, rot: number): void {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    this.offsets.setXYZ(i, x, y, z);
    this.colors.setXYZW(i, r, g, b, alpha);
    this.params.setXYZ(i, scale, glyph, rot);
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    this.offsets.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.params.needsUpdate = true;
  }
}
