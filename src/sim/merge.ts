/**
 * Hareket etmeyen parçaları malzemeye göre tek ağda birleştirir.
 * Makine yüzlerce küçük parçadan (ayak, kulak, çember, çubuk...) oluşur;
 * birleştirince çizim çağrısı sayısı yüzlerden onlara iner ve son işleme
 * efektlerine (yansıma, bloom, AO) performans payı kalır.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * @param root    birleştirilecek alt ağaç
 * @param isKept  ayrı kalması gereken nesneler (seçilebilen, hareket eden);
 *                bunların alt nesnelerine de dokunulmaz
 */
export function mergeStatic(root: THREE.Object3D, isKept: (o: THREE.Object3D) => boolean): void {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; cast: boolean; receive: boolean; layers: number }>();
  const removed: THREE.Mesh[] = [];
  const local = new THREE.Matrix4();

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || o === root) return;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (isKept(p)) return;
    const material = mesh.material;
    if (Array.isArray(material) || material.transparent || mesh.userData.bloom) return;

    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    g.morphAttributes = {};
    local.multiplyMatrices(rootInverse, mesh.matrixWorld);
    g.applyMatrix4(local);

    let bucket = buckets.get(material);
    if (!bucket) {
      bucket = { geometries: [], cast: false, receive: false, layers: mesh.layers.mask };
      buckets.set(material, bucket);
    }
    bucket.geometries.push(g);
    bucket.cast ||= mesh.castShadow;
    bucket.receive ||= mesh.receiveShadow;
    removed.push(mesh);
  });

  for (const mesh of removed) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  for (const [material, bucket] of buckets) {
    const merged = mergeGeometries(bucket.geometries, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    mesh.layers.mask = bucket.layers;
    root.add(mesh);
    for (const g of bucket.geometries) g.dispose();
  }
}
