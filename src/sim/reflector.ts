/**
 * Yumuşak zemin yansıması. Sahne, zemine göre aynalanmış bir kameradan düşük
 * çözünürlükte çizilir; zemin düzlemi bu dokuyu bulanıklaştırıp kenarlara
 * doğru soldurarak, gölgeli sahne zemininin üzerine yarı saydam biner.
 *
 * Three.js'teki Reflector'dan farkı: çizimi kendi onBeforeRender'ında değil,
 * kare başında bir kez `update` ile yapar. Böylece bloom ve AO geçişlerinde
 * yeniden tetiklenmez.
 */
import * as THREE from 'three';

const vertexShader = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vReflUv;
varying vec2 vLocal;
void main() {
  vReflUv = textureMatrix * vec4(position, 1.0);
  vLocal = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D tReflection;
uniform vec2 texel;
uniform float strength;
uniform vec3 tint;
varying vec4 vReflUv;
varying vec2 vLocal;
void main() {
  vec2 uv = vReflUv.xy / vReflUv.w;
  // Altın açılı disk örneklemesi: noktasal ışıklar kare değil yuvarlak lekelere dönüşür.
  vec3 c = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 20; i++) {
    float r = sqrt((float(i) + 0.5) / 20.0);
    float a = float(i) * 2.39996;
    vec2 o = vec2(cos(a), sin(a)) * r * 3.2;
    float w = 1.0 - r * 0.6;
    c += min(texture2D(tReflection, uv + o * texel).rgb, vec3(1.6)) * w;
    total += w;
  }
  c /= total;
  float fade = smoothstep(1.0, 0.45, length(vLocal));
  gl_FragColor = vec4(c * tint, strength * fade);
}`;

export class SoftReflector extends THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  readonly target: THREE.WebGLRenderTarget;
  readonly reflectionCamera = new THREE.PerspectiveCamera();
  private readonly textureMatrix = new THREE.Matrix4();
  private resScale = 0.5;

  constructor(geometry: THREE.BufferGeometry, strength = 0.32) {
    const target = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 0 });
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tReflection: { value: target.texture },
        textureMatrix: { value: new THREE.Matrix4() },
        texel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
        strength: { value: strength },
        tint: { value: new THREE.Color(0.95, 0.9, 1.0) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    super(geometry, material);
    this.target = target;
    material.uniforms.textureMatrix.value = this.textureMatrix;
    this.reflectionCamera.layers.set(0); // yalnızca statik makine ve dekor yansır
  }

  setResolution(width: number, height: number, scale: number): void {
    this.resScale = scale;
    const w = Math.max(64, Math.round(width * scale));
    const h = Math.max(64, Math.round(height * scale));
    this.target.setSize(w, h);
    this.material.uniforms.texel.value.set(1 / w, 1 / h);
  }

  get resolutionScale(): number {
    return this.resScale;
  }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const rc = this.reflectionCamera;
    this.updateMatrixWorld();
    const reflectorPos = new THREE.Vector3().setFromMatrixPosition(this.matrixWorld);
    const cameraPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const rotation = new THREE.Matrix4().extractRotation(this.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1).applyMatrix4(rotation);
    const view = new THREE.Vector3().subVectors(reflectorPos, cameraPos);
    if (view.dot(normal) > 0) return; // kamera zeminin altında
    view.reflect(normal).negate().add(reflectorPos);

    rotation.extractRotation(camera.matrixWorld);
    const lookAt = new THREE.Vector3(0, 0, -1).applyMatrix4(rotation).add(cameraPos);
    const target = new THREE.Vector3().subVectors(reflectorPos, lookAt).reflect(normal).negate().add(reflectorPos);

    rc.position.copy(view);
    rc.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    rc.lookAt(target);
    rc.far = camera.far;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse).multiply(this.matrixWorld);

    // Eğik yakın düzlem: zeminin altında kalan her şeyi kırp.
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, reflectorPos).applyMatrix4(rc.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = rc.projectionMatrix;
    const q = new THREE.Vector4(
      (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0],
      (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5],
      -1,
      (1 + pm.elements[10]) / pm.elements[14],
    );
    clip.multiplyScalar(2 / clip.dot(q));
    pm.elements[2] = clip.x;
    pm.elements[6] = clip.y;
    pm.elements[10] = clip.z + 1;
    pm.elements[14] = clip.w;

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, rc);
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.setRenderTarget(prevTarget);
  }
}
