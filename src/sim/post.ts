/**
 * Son işleme hattı ve kalite kademeleri.
 *
 *   Yüksek: yansıma + ortam gölgelemesi (GTAO) + seçici bloom + alan derinliği
 *   Orta:   yansıma + seçici bloom
 *   Hafif:  doğrudan çizim (efekt yok)
 *
 * Seçici bloom: sahne bir kez daha, her nesne kendi "parıltı malzemesiyle"
 * (çoğu siyah) çizilir; yalnızca ışık saçması gereken şeyler (bilyeler, vuruş
 * halkaları, notalar, parlayan çubuklar, sahne kenarı) renkli kalır. Bu
 * görüntü bulanıklaştırılıp asıl görüntünün üstüne eklenir.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import type { SoftReflector } from './reflector';
import { LAYER_FX } from './build';

export type Quality = 'high' | 'medium' | 'low';

/** `userData.bloom` değeri: bir malzeme ya da parıltı çiziminde gizle. */
export type BloomSetting = THREE.Material | 'hide' | 'self';

const MixShader = {
  uniforms: {
    baseTexture: { value: null as THREE.Texture | null },
    bloomTexture: { value: null as THREE.Texture | null },
    vignette: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(baseTexture, vUv);
      vec3 bloom = texture2D(bloomTexture, vUv).rgb;
      float v = smoothstep(1.15, 0.3, length((vUv - 0.5) * vec2(1.25, 1.6)));
      gl_FragColor = vec4((base.rgb + bloom) * mix(1.0 - vignette, 1.0, v), base.a);
    }`,
};

export class PostFX {
  quality: Quality = 'high';

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  /** AO ve alan derinliği için, saydam efektleri görmeyen kamera kopyası. */
  private readonly fxCamera: THREE.PerspectiveCamera;
  private readonly reflector: SoftReflector;

  private readonly bloomComposer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly composer: EffectComposer;
  private readonly overlayPass: RenderPass;
  private readonly gtao: GTAOPass;
  private readonly bokeh: BokehPass;
  private readonly black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly swaps: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  private readonly hidden: THREE.Object3D[] = [];
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, overlay: THREE.Scene, camera: THREE.PerspectiveCamera, reflector: SoftReflector) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.fxCamera = camera.clone();
    this.reflector = reflector;

    const rtOptions = { type: THREE.HalfFloatType };
    this.bloomComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, rtOptions));
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(scene, camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.0);
    this.bloomComposer.addPass(this.bloomPass);

    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { ...rtOptions, samples: 4 }));
    this.composer.addPass(new RenderPass(scene, camera));
    this.overlayPass = new RenderPass(overlay, camera);
    this.overlayPass.clear = false;
    this.composer.addPass(this.overlayPass);

    this.gtao = new GTAOPass(scene, this.fxCamera, 256, 256);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.gtao);

    const mix = new ShaderPass(new THREE.ShaderMaterial({ ...MixShader, uniforms: THREE.UniformsUtils.clone(MixShader.uniforms) }), 'baseTexture');
    mix.material.uniforms.bloomTexture.value = this.bloomComposer.renderTarget2.texture;
    mix.needsSwap = true;
    this.composer.addPass(mix);

    this.bokeh = new BokehPass(scene, this.fxCamera, { focus: 22, aperture: 0.00045, maxblur: 0.01 });
    this.composer.addPass(this.bokeh);
    this.composer.addPass(new OutputPass());

    this.setQuality('high');
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.gtao.enabled = q === 'high';
    this.bokeh.enabled = q === 'high';
    this.reflector.visible = q !== 'low';
    this.renderer.shadowMap.needsUpdate = true;
    this.setSize(this.width, this.height, this.pixelRatio);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    // Bloom yarı çözünürlükte yeterli (zaten bulanık).
    this.bloomComposer.setPixelRatio(pixelRatio * 0.5);
    this.bloomComposer.setSize(width, height);
    this.reflector.setResolution(width * pixelRatio, height * pixelRatio, this.quality === 'high' ? 0.6 : 0.45);
  }

  /** Bokeh odak uzaklığını kameranın baktığı noktaya ayarla. */
  setFocus(distance: number): void {
    (this.bokeh.uniforms as Record<string, THREE.IUniform>).focus.value = distance;
  }

  render(): void {
    const { renderer, scene, camera } = this;
    if (this.quality === 'low') {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    this.fxCamera.copy(camera);
    this.fxCamera.layers.mask = camera.layers.mask;
    this.fxCamera.layers.disable(LAYER_FX);
    this.fxCamera.updateMatrixWorld();
    if (this.reflector.visible) this.reflector.update(renderer, scene, camera);
    this.renderBloom();
    this.composer.render();
  }

  private renderBloom(): void {
    const { scene } = this;
    this.swaps.length = 0;
    this.hidden.length = 0;
    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const setting = mesh.userData.bloom as BloomSetting | undefined;
      if (setting === 'self') return;
      if (setting === 'hide') {
        this.hidden.push(mesh);
        return;
      }
      this.swaps.push({ mesh, material: mesh.material });
      mesh.material = setting ?? this.black;
    });
    for (const h of this.hidden) h.visible = false;
    const background = scene.background;
    const fog = scene.fog;
    scene.background = null;
    scene.fog = null;
    const shadowAuto = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;

    this.bloomComposer.render();

    this.renderer.shadowMap.autoUpdate = shadowAuto;
    scene.background = background;
    scene.fog = fog;
    for (const h of this.hidden) h.visible = true;
    for (const s of this.swaps) s.mesh.material = s.material;
  }
}
