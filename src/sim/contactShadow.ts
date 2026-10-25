/**
 * Temas gölgeleri: nesnelerin zemine değdiği yerlerde yumuşak, koyu halkalar.
 * Zeminden yukarı bakan dik açılı bir kamerayla derinlik çizilir, iki kez
 * bulanıklaştırılır ve zemine yatırılmış bir düzleme doku olarak giydirilir.
 * Makine hareket etmediği için bu işlem bir kez yapılır ("pişirilir").
 */
import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

export interface ContactShadowOptions {
  center: THREE.Vector3;
  width: number;
  depth: number;
  /** Bu yükseklikten yukarıdaki nesneler gölge bırakmaz. */
  height: number;
  resolution: number;
  darkness: number;
  opacity: number;
  blur: number;
}

export function bakeContactShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, hidden: THREE.Object3D[], o: ContactShadowOptions): THREE.Mesh {
  const aspect = o.width / o.depth;
  const resX = o.resolution;
  const resY = Math.round(o.resolution / aspect);
  const target = new THREE.WebGLRenderTarget(resX, resY);
  const targetBlur = new THREE.WebGLRenderTarget(resX, resY);
  target.texture.generateMipmaps = false;
  targetBlur.texture.generateMipmaps = false;

  const group = new THREE.Group();
  group.position.copy(o.center);

  const planeGeo = new THREE.PlaneGeometry(o.width, o.depth).rotateX(Math.PI / 2);
  const plane = new THREE.Mesh(
    planeGeo,
    new THREE.MeshBasicMaterial({ map: target.texture, opacity: o.opacity, transparent: true, depthWrite: false }),
  );
  plane.renderOrder = 1;
  plane.scale.y = -1; // doku yukarıdan bakınca ters çıkar
  group.add(plane);

  const blurPlane = new THREE.Mesh(planeGeo);
  blurPlane.visible = false;
  group.add(blurPlane);

  const cam = new THREE.OrthographicCamera(-o.width / 2, o.width / 2, o.depth / 2, -o.depth / 2, 0, o.height);
  cam.rotation.x = Math.PI / 2; // yukarı bak
  cam.layers.enableAll();
  group.add(cam);

  const depthMaterial = new THREE.MeshDepthMaterial();
  depthMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.darkness = { value: o.darkness };
    shader.fragmentShader = `uniform float darkness;\n${shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );',
    )}`;
  };
  depthMaterial.depthTest = false;
  depthMaterial.depthWrite = false;

  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
  hBlur.depthTest = vBlur.depthTest = false;

  const blur = (amount: number) => {
    blurPlane.visible = true;
    blurPlane.material = hBlur;
    hBlur.uniforms.tDiffuse.value = target.texture;
    hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(targetBlur);
    renderer.render(blurPlane, cam);
    blurPlane.material = vBlur;
    vBlur.uniforms.tDiffuse.value = targetBlur.texture;
    vBlur.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(target);
    renderer.render(blurPlane, cam);
    blurPlane.visible = false;
  };

  scene.add(group);
  group.updateMatrixWorld(true);
  plane.visible = false;
  const visibility = hidden.map((h) => h.visible);
  hidden.forEach((h) => (h.visible = false));
  const background = scene.background;
  const fog = scene.fog;
  scene.background = null;
  scene.fog = null;
  scene.overrideMaterial = depthMaterial;
  const clearAlpha = renderer.getClearAlpha();
  const clearColor = renderer.getClearColor(new THREE.Color());
  renderer.setClearColor(0x000000, 0);

  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, cam);
  scene.overrideMaterial = null;
  blur(o.blur);
  blur(o.blur * 0.4);

  renderer.setRenderTarget(null);
  renderer.setClearColor(clearColor, clearAlpha);
  scene.background = background;
  scene.fog = fog;
  hidden.forEach((h, i) => (h.visible = visibility[i]));
  plane.visible = true;
  targetBlur.dispose();
  depthMaterial.dispose();
  hBlur.dispose();
  vBlur.dispose();
  group.remove(cam, blurPlane);
  return plane;
}
