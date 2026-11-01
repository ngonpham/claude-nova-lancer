// GLB models made in Higgsfield 3D Jutsu (lachong/assets/models/*.glb, embedded at build time).
// loadModels() parses them once at boot; bakePart() turns a named node (and its children) into one
// flat-shaded BufferGeometry with the vertex attributes the game's materials expect:
//   position, normal, color (material base colour), aEmit (0..1, from the emissive colour).
// glTF is Y-up, metres; Blender's -Y (front view) becomes glTF +Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAW from 'virtual:models';

export const MODELS = {};          // name → THREE.Group (the glTF scene)

export async function loadModels() {
  const loader = new GLTFLoader();
  for (const [name, bytes] of Object.entries(RAW)) {
    try {
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await loader.parseAsync(buf, '');
      gltf.scene.updateMatrixWorld(true);
      MODELS[name] = gltf.scene;
    } catch (e) { console.warn('model ' + name + ' failed to load', e); }
  }
}

export const hasModel = (name) => !!MODELS[name];

// Find a node by exact name inside a model.
export function findNode(model, node) {
  const root = MODELS[model];
  return root ? root.getObjectByName(node) : null;
}

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _c = new THREE.Color(), _e = new THREE.Color();
// Bake node `node` of `model` (with all its descendant meshes) into one geometry expressed in that node's
// own local frame (so it can be placed on a pivot at the node's rest transform). Returns
// { geo, position, quaternion, scale } — the node's rest transform relative to its parent — or null.
// opts.space = 'model' bakes in model-root space instead (position etc. are then identity).
export function bakePart(model, node, opts = {}) {
  const n = findNode(model, node);
  if (!n) return null;
  const root = MODELS[model];
  root.updateMatrixWorld(true);
  _inv.copy(opts.space === 'model' ? root.matrixWorld : n.matrixWorld).invert();
  const geos = [];
  n.traverse((o) => {
    if (!o.isMesh || (opts.skip && opts.skip(o))) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    _m.multiplyMatrices(_inv, o.matrixWorld);
    g.applyMatrix4(_m);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const cnt = g.attributes.position.count;
    const col = new Float32Array(cnt * 3), em = new Float32Array(cnt);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: cnt, materialIndex: 0 }];
    for (const gr of groups) {
      const mt = mats[gr.materialIndex] || mats[0];
      _c.copy(mt.color || _c.set(1, 1, 1));
      _e.copy(mt.emissive || _e.set(0, 0, 0)).multiplyScalar(mt.emissiveIntensity ?? 1);
      const ev = Math.min(1, Math.max(_e.r, _e.g, _e.b));
      if (ev > 0.05) _c.lerp(_e, 0.5);
      // existing vertex colours (COLOR_0) multiply the base colour
      const vc = g.attributes.color;
      for (let i = gr.start; i < gr.start + gr.count && i < cnt; i++) {
        let r = _c.r, gg = _c.g, b = _c.b;
        if (vc) { r *= vc.getX(i); gg *= vc.getY(i); b *= vc.getZ(i); }
        col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b; em[i] = ev;
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('aEmit', new THREE.BufferAttribute(em, 1));
    geos.push(out);
  });
  if (!geos.length) return null;
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), em = new Float32Array(total);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); em.set(g.attributes.aEmit.array, o);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aEmit', new THREE.BufferAttribute(em, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  if (opts.space === 'model') return { geo, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) };
  return { geo, position: n.position.clone(), quaternion: n.quaternion.clone(), scale: n.scale.clone() };
}
