// Boss archetype SERPENT — a Vietnamese water dragon possessed by Thời Ảnh's shadow. Its body is a chain simulated
// in rail-relative space so it always reads well from the chase camera.
// Models (cfg.model): 'thuongluong' (river water-serpent, Văn Lang), 'rongly' (Lý-dynasty dragon, Thăng Long),
// 'haclong' (final: Thời Ảnh's black dragon coiled around the golden Nguyễn dragon).
// While possessed the creature's true colours show through an ink-black shadow coat with violet glowing seams.
// Phase 1: shadow growths (turrets) on its back. Phase 2: shadow heart in the mouth + sweeping beam. Phase 3: enraged.
// Defeat PURIFIES it: the shadow peels off from head to tail, the true colours return in a golden flash and the
// freed creature rises into the sky and dissolves into golden light.
import * as THREE from 'three';
import { G, rand, clamp, lerp, damp, TAU, emit, diff, easeOutCubic, easeInOutCubic } from './core.js';
import { railToWorld, mergeGeometries } from './world.js';
import { FX, glow, sparks, splash, addShake, bigFlash } from './fx.js';
import { TARGETS, enemyShot, aimAtPlayer } from './weapons.js';
import { AudioSys } from './audio.js';
import { loft, slab, fin } from './ship.js';
import { POST, patchFog, flashLight } from './gfx.js';

// ============================================================ geometry helpers
const hexS = (w, h, y = 0) => [[w, y], [w * 0.62, y + h], [-w * 0.62, y + h], [-w, y], [-w * 0.7, y - h * 0.8], [w * 0.7, y - h * 0.8]];
// ellipse cross-section (CCW like the ship lofts); `flat` squashes the lower half
const ell = (rx, ry, cy = 0, n = 12, flat = 0) => {
  const a = [];
  for (let i = 0; i < n; i++) { const t = i / n * TAU; let y = Math.sin(t) * ry; if (y < 0) y *= 1 - flat; a.push([Math.cos(t) * rx, cy + y]); }
  return a;
};
const _ya = new THREE.Vector3(0, 1, 0);
const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
// cone with its base at a and its tip at b
function cone(a, b, r, seg = 6) {
  const A = V(a), d = V(b).sub(A), h = d.length();
  const g = new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_ya, d.normalize()));
  return g.translate(A.x, A.y, A.z);
}
// tapered tube along a smooth curve (horns, whiskers, legs, coils)
function taper(pts, r0, r1, segs = 18, rad = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map(V));
  const g = new THREE.TubeGeometry(curve, segs, 1, rad, false);
  const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = lerp(r0, r1, i / segs);
    for (let j = 0; j <= rad; j++) { const k = i * (rad + 1) + j; v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, v.x, v.y, v.z); }
  }
  return g;
}
// flame-tongue fin profile (a → +Z backwards, b → up): three licks streaming back
const FLAME = [[0, 0], [0.4, -0.2], [0.75, 0.15], [1, 0.9], [0.62, 0.55], [0.7, 1.0], [0.38, 0.62], [0.36, 0.95], [0.12, 0.5]];
const flame = (len, h, thick, down = false) => fin(FLAME.map(([a, b]) => [a * len, (down ? -b : b) * h]), thick);
// diamond scale plate lying in XZ, thickness along Y
const scaleGeo = (w, l, t) => slab([[0, -l * 0.45], [w / 2, -l * 0.05], [0, l * 0.55], [-w / 2, -l * 0.05]], t);
// one plate placed on an elliptical body surface at angle a (0 = right side, π/2 = top)
const onBody = (g, a, rx, ry, z, lift = 0) => g.rotateZ(a - Math.PI / 2).translate(Math.cos(a) * (rx + lift), Math.sin(a) * (ry + lift), z);

// ============================================================ palettes
// role: [true colour, true emissive, shadow colour?, shadow emissive?]. Without a shadow colour the part wears the ink coat.
const VIOLET = '#b46bff', EYE_SHADOW = '#ff2f8f', INK = new THREE.Color('#0a0711');
const SHADOW_ROLES = {
  shadow: ['#0b0812', 0, '#0b0812', 0],
  shadow2: ['#16101f', 0, '#16101f', 0],
  sglow: [VIOLET, 1, VIOLET, 1],
  seye: [EYE_SHADOW, 1, EYE_SHADOW, 1],
};
const PALETTES = {
  thuongluong: {
    armor: ['#1d4e40'], scale: ['#2e8272'], scale2: ['#215c54'], plate: ['#4a7346'], belly: ['#b8c08a'],
    fin: ['#2a9c8c'], membrane: ['#4cc0a8'], teeth: ['#ece4cc'], claw: ['#d8d0b0'], horn: ['#a8b88a'], whisker: ['#5aa890'],
    mane: ['#38ad9c'], mane2: ['#2a8a7a'],
    eye: ['#ffc23a', 1, EYE_SHADOW, 0.65], seam: ['#4affd8', 1, VIOLET, 1], mouth: ['#8a2a36', 0.25, '#3a0a3a', 0.4],
  },
  rongly: {
    armor: ['#d4a038'], scale: ['#e8be4c'], scale2: ['#bd8626'], plate: ['#f0c860'], belly: ['#f2dc98'],
    fin: ['#2ea676'], membrane: ['#5ccf9a'], mane: ['#36b882'], mane2: ['#e6a834'], horn: ['#f4d27a'], whisker: ['#f0c860'],
    teeth: ['#f4ecd8'], claw: ['#f4e2a8'],
    eye: ['#7affc8', 1, EYE_SHADOW, 0.65], seam: ['#ffd36a', 1, VIOLET, 1], mouth: ['#c8384a', 0.25, '#3a0a3a', 0.4],
  },
  haclong: {
    armor: ['#dca932'], scale: ['#f2c548'], scale2: ['#c48a1a'], plate: ['#ffd666'], belly: ['#f6e2a0'],
    fin: ['#d4442a'], membrane: ['#f07a3a'], mane: ['#dc4a2c'], mane2: ['#f2b03a'], horn: ['#fff0c4'], whisker: ['#ffd666'],
    teeth: ['#fff6e0'], claw: ['#fff2c8'],
    eye: ['#ffe9a0', 1, EYE_SHADOW, 0.65], seam: ['#ffe080', 1, VIOLET, 1], mouth: ['#b8303a', 0.25, '#3a0a3a', 0.4],
  },
};
let PAL = null;
function buildPalette(model, legacy) {
  const p = { ...PALETTES[model], ...SHADOW_ROLES };
  // optional legacy cfg.palette ({ armor, plate, trim, eye, seam, belly, membrane }) recolours the true form
  if (legacy) {
    const map = { armor: ['armor'], plate: ['plate', 'scale'], trim: ['fin', 'mane', 'horn', 'whisker'], eye: ['eye'], seam: ['seam'], belly: ['belly'], membrane: ['membrane'] };
    for (const k of Object.keys(legacy)) for (const role of map[k] || []) if (p[role]) p[role] = [legacy[k], ...p[role].slice(1)];
  }
  return p;
}

// paint a part: true colour + emissive in color/aEmit, possessed colour + emissive in aShadow
function P(g0, role) {
  const R = PAL[role] || PAL.armor;
  const g = g0.index ? g0.toNonIndexed() : g0.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g.computeVertexNormals();
  const c = new THREE.Color(R[0]), em = R[1] || 0;
  const sc = R[2] ? new THREE.Color(R[2]) : INK.clone().lerp(c, 0.07), se = R[2] ? (R[3] ?? 1) : 0;
  const n = g.attributes.position.count;
  const ca = new Float32Array(n * 3), ea = new Float32Array(n), sa = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; ea[i] = em;
    sa[i * 4] = sc.r; sa[i * 4 + 1] = sc.g; sa[i * 4 + 2] = sc.b; sa[i * 4 + 3] = se;
  }
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(ea, 1));
  g.setAttribute('aShadow', new THREE.BufferAttribute(sa, 4));
  return g;
}
const SIDES = [-1, 1];

// ============================================================ material
// Vertex-coloured standard material. uPurify is a frontier distance from the head: behind it the shadow coat is gone
// (shadow-only parts are dissolved), with a glowing edge. uGold adds the golden glow, uVanish dissolves into light.
function dragonShader(shader, ud) {
  shader.uniforms.uEmitBoost = ud.emit; shader.uniforms.uFlash = ud.flash; shader.uniforms.uTint = ud.tint;
  shader.uniforms.uPurify = ud.purify; shader.uniforms.uHead = ud.head; shader.uniforms.uTime = ud.time;
  shader.uniforms.uGold = ud.gold; shader.uniforms.uVanish = ud.vanish; shader.uniforms.uShadowOnly = ud.shadowOnly; shader.uniforms.uVein = ud.vein;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aEmit;\nattribute vec4 aShadow;\nvarying float vEmit;\nvarying vec4 vShadow;\nvarying vec3 vOP;\nvarying vec3 vWP;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit; vShadow = aShadow; vOP = position; vWP = (modelMatrix * vec4(position, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying float vEmit; varying vec4 vShadow; varying vec3 vOP; varying vec3 vWP;
uniform float uEmitBoost; uniform float uFlash; uniform vec3 uTint;
uniform float uPurify; uniform vec3 uHead; uniform float uTime; uniform float uGold; uniform float uVanish; uniform float uShadowOnly; uniform vec3 uVein;
float lhH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lhN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lhH(i), lhH(i + vec3(1,0,0)), f.x), mix(lhH(i + vec3(0,1,0)), lhH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lhH(i + vec3(0,0,1)), lhH(i + vec3(1,0,1)), f.x), mix(lhH(i + vec3(0,1,1)), lhH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float gCoat = 1.0; float gEdge = 0.0; float gVEdge = 0.0; float gEm = 0.0; float gVein = 0.0; float gDH = 0.0; float gNB = 0.0;`)
    .replace('#include <color_fragment>', `
  float nA = lhN(vOP * 0.42);
  gNB = lhN(vOP * 1.15 + 11.0);
  float nn = nA * 0.6 + gNB * 0.4;
  gDH = distance(vWP, uHead);
  float front = (uPurify - gDH) / 16.0 + (nn - 0.5) * 1.4;
  if (uShadowOnly > 0.5 && uPurify > 0.0 && front > 0.0) discard;
  gCoat = uShadowOnly > 0.5 ? 1.0 : 1.0 - smoothstep(-0.05, 0.05, front);
  gEdge = uPurify > 0.0 ? 1.0 - smoothstep(0.0, 0.2, abs(front)) : 0.0;
  float vz = nn + gNB * 0.25 - (uVanish * 1.45 - 0.12);
  if (uVanish > 0.0 && vz < 0.0) discard;
  gVEdge = uVanish > 0.0 ? 1.0 - smoothstep(0.0, 0.1, vz) : 0.0;
  float thru = (0.05 + 0.24 * smoothstep(0.6, 0.85, gNB)) * (1.0 - vShadow.a);
  vec3 shC = mix(vShadow.rgb, vColor.rgb, thru);
  vec3 baseC = mix(vColor.rgb, shC, gCoat);
  gEm = mix(vEmit, vShadow.a, gCoat);
  gVein = (1.0 - smoothstep(0.0, 0.05, abs(nA - 0.5))) * (1.0 - vShadow.a);
  diffuseColor.rgb *= baseC * mix(uTint, vec3(1.0), gEm);`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, 0.12, gCoat * (1.0 - vShadow.a));
  roughnessFactor = mix(roughnessFactor, 0.6, gCoat * (1.0 - vShadow.a));`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { float ink = gCoat * (1.0 - vShadow.a);
    reflectedLight.indirectSpecular *= 1.0 - 0.75 * ink; reflectedLight.directSpecular *= 1.0 - 0.45 * ink;
    reflectedLight.indirectDiffuse *= 1.0 - 0.4 * ink; }`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  vec3 emC = mix(vColor.rgb, vShadow.rgb, gCoat);
  totalEmissiveRadiance += emC * gEm * uEmitBoost + vec3(uFlash);
  float pulse = 0.5 + 0.5 * sin(uTime * 3.2 + gNB * 7.0 - gDH * 0.07);
  totalEmissiveRadiance += uVein * gVein * (0.3 + 0.9 * pulse) * gCoat;
  totalEmissiveRadiance += mix(vec3(2.8, 1.8, 0.6), vec3(2.2, 1.2, 3.4), uShadowOnly) * gEdge;
  totalEmissiveRadiance += (vColor.rgb * 0.45 + vec3(0.3, 0.2, 0.04)) * uGold * (1.0 - gCoat);
  totalEmissiveRadiance += vec3(3.2, 2.3, 0.9) * gVEdge;`);
}
function dragonMaterial(shadowOnly, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55, ...opts });
  const ud = mat.userData;
  ud.emit = { value: 2.6 }; ud.flash = { value: 0 }; ud.tint = { value: new THREE.Color(1, 1, 1) };
  ud.purify = { value: 0 }; ud.head = { value: new THREE.Vector3() }; ud.time = { value: 0 };
  ud.gold = { value: 0 }; ud.vanish = { value: 0 }; ud.shadowOnly = { value: shadowOnly ? 1 : 0 };
  ud.vein = { value: new THREE.Color(0.85, 0.42, 1.3) };
  patchFog(mat, (shader) => dragonShader(shader, ud));
  return mat;
}

// ============================================================ THUỒNG LUỒNG — river water-serpent, crocodile-like head
function headTL() {
  const parts = [P(loft([
    { z: -16.8, pts: ell(1.5, 0.75, 0.5, 12, 0.6) }, { z: -15, pts: ell(2.4, 1.0, 0.6, 12, 0.6) }, { z: -12.5, pts: ell(2.0, 0.95, 0.6, 12, 0.6) },
    { z: -8.5, pts: ell(2.5, 1.1, 0.65, 12, 0.6) }, { z: -5, pts: ell(3.1, 1.3, 0.75, 12, 0.6) },
    { z: -1, pts: ell(4.0, 2.0, 1.0, 12, 0.6) }, { z: 3, pts: ell(4.8, 2.7, 1.2, 12, 0.6) }, { z: 7.5, pts: ell(4.4, 2.9, 0.9, 12, 0.5) },
  ]), 'armor')];
  parts.push(P(new THREE.BoxGeometry(3.6, 0.2, 14).translate(0, 0.15, -8), 'mouth'));
  for (const s of SIDES) {
    parts.push(P(new THREE.SphereGeometry(0.5, 7, 5).translate(s * 0.65, 1.0, -15.4), 'plate'));                    // nostrils
    parts.push(P(new THREE.SphereGeometry(1.45, 9, 6).scale(1, 0.75, 1.35).translate(s * 2.3, 2.45, -0.6), 'plate')); // raised eye sockets
    parts.push(P(new THREE.SphereGeometry(0.8, 10, 7).translate(s * 2.75, 2.85, -1.3), 'eye'));
    parts.push(P(cone([s * 2.0, 3.3, 0.6], [s * 2.6, 4.4, 3.4], 0.5, 5), 'horn'));                                     // bony brow knobs
    // jagged upper teeth along the long snout
    for (let k = 0; k < 9; k++) {
      const z = -15.6 + k * 1.55, x = lerp(1.05, 2.95, k / 8), h = k % 2 ? 0.9 : 1.6;
      parts.push(P(new THREE.ConeGeometry(0.26, h, 4).rotateX(Math.PI).translate(s * x, 0.2 - h / 2, z), 'teeth'));
    }
    // snout scutes
    for (let k = 0; k < 5; k++) parts.push(P(new THREE.ConeGeometry(0.42, 0.7, 4).translate(s * 0.9, lerp(1.3, 1.85, k / 4) + 0.1, -13 + k * 2.2), 'plate'));
    // glowing lateral line from eye to neck
    parts.push(P(new THREE.BoxGeometry(0.16, 0.16, 8).rotateY(s * 0.12).translate(s * 4.15, 1.3, 3.2), 'seam'));
    // fan-shaped gill fins
    const gill = fin([[0, 0], [1.5, -0.5], [5.5, 0.5], [6.5, 3.6], [4, 5], [1, 3]], 0.25).rotateZ(-s * 1.15).translate(s * 4.0, 1.2, 3.6);
    parts.push(P(gill, 'membrane'));
    for (let k = 0; k < 3; k++) parts.push(P(cone([s * 4.0, 1.2, 3.8 + k * 1.2], [s * (8.4 - k * 0.6), 3.6 + k * 0.8, 6.5 + k * 1.6], 0.22, 4), 'fin'));
    // short barbels
    parts.push(P(taper([[s * 1.2, 0.4, -15.2], [s * 2.6, -0.4, -13.8], [s * 3.6, -1.6, -11.5]], 0.18, 0.05, 8, 4), 'whisker'));
  }
  // paired neck scutes and a small crest fin
  for (let k = 0; k < 4; k++) for (const s of SIDES) parts.push(P(new THREE.ConeGeometry(0.55, 1.1, 4).translate(s * 1.3, 3.7 - k * 0.1, 0.5 + k * 2), 'plate'));
  parts.push(P(fin([[0, 0], [6, 0], [7.2, 2.4], [2.6, 2.1]], 0.3).translate(0, 3.6, 1.2), 'fin'));
  return mergeGeometries(parts);
}
function jawTL() {
  // built with the hinge at the origin (hinge sits at z = +6 in head space)
  const parts = [P(loft([
    { z: -22.3, pts: ell(1.3, 0.5, -0.5, 12) }, { z: -20.5, pts: ell(2.2, 0.62, -0.6, 12) }, { z: -17.5, pts: ell(1.8, 0.65, -0.65, 12) }, { z: -12, pts: ell(2.4, 0.8, -0.8, 12) },
    { z: -5, pts: ell(3.4, 1.1, -1.0, 12) }, { z: 0, pts: ell(4.0, 1.2, -0.8, 12) },
  ]), 'plate')];
  for (const s of SIDES) for (let k = 0; k < 9; k++) {
    const z = -21.3 + k * 1.6, x = lerp(0.95, 2.9, k / 8), h = k % 2 ? 1.5 : 0.8;
    parts.push(P(new THREE.ConeGeometry(0.25, h, 4).translate(s * x, h / 2 - 0.1, z), 'teeth'));
  }
  parts.push(P(new THREE.BoxGeometry(3.4, 0.25, 17).translate(0, -0.15, -11), 'mouth'));
  parts.push(P(new THREE.BoxGeometry(2.6, 0.3, 14).translate(0, -1.75, -9), 'belly'));
  return mergeGeometries(parts);
}
function segTL(kind) {
  const r = 5, parts = [];
  const tail = kind === 'tail';
  parts.push(P(loft(tail
    ? [{ z: -5.9, pts: ell(r * 0.86, r * 0.8, 0, 14, 0.1) }, { z: 0, pts: ell(r * 0.66, r * 0.62, 0, 14, 0.1) }, { z: 6, pts: ell(r * 0.38, r * 0.36, 0, 14, 0.1) }, { z: 12, pts: ell(0.25, 0.25, 0, 14) }]
    : [{ z: -5.9, pts: ell(r * 0.86, r * 0.8, 0, 14, 0.1) }, { z: -2.2, pts: ell(r, r * 0.92, 0, 14, 0.1) }, { z: 2.4, pts: ell(r * 0.97, r * 0.9, 0, 14, 0.1) }, { z: 5.9, pts: ell(r * 0.84, r * 0.78, 0, 14, 0.1) }]), 'armor'));
  const rows = tail ? 2 : 4;
  for (let row = 0; row < rows; row++) {
    const z = -4.2 + row * 2.8, rr = tail ? 0.8 - row * 0.12 : 1;
    for (let j = 0; j < 9; j++) {
      const a = -0.5 + (j + (row % 2) * 0.5) / 9 * (Math.PI + 1.0);
      parts.push(P(onBody(scaleGeo(2.4 * rr, 3.0, 0.35), a, r * 0.95 * rr, r * 0.88 * rr, z, 0.05), (j + row) % 2 ? 'scale' : 'scale2'));
    }
  }
  if (!tail) {
    for (const s of SIDES) for (let k = 0; k < 4; k++) {
      parts.push(P(new THREE.ConeGeometry(0.7, 1.4, 4).translate(s * 1.35, r * 0.9 + 0.5, -4.1 + k * 2.7), 'plate'));    // keeled scutes
      parts.push(P(new THREE.OctahedronGeometry(0.42, 0).scale(1, 1, 1.6).translate(s * r * 0.98, 0.7, -3.8 + k * 2.6), 'seam'));
    }
    parts.push(P(fin([[0, 0], [10, 0], [8.4, 1.7], [1.4, 2.1]], 0.3).translate(0, r * 0.88, -5), 'fin'));
    for (let k = 0; k < 6; k++) parts.push(P(new THREE.BoxGeometry(5.0, 0.5, 1.55).translate(0, -r * 0.82, -4.6 + k * 1.84), 'belly'));
  }
  if (kind === 'fin') for (const s of SIDES) {
    parts.push(P(fin([[0, 0], [2, -0.3], [6, 0.8], [7, 3.6], [4.5, 4.8], [1.4, 2.8]], 0.25).rotateZ(-s * 2.0).translate(s * r * 0.8, -r * 0.4, -2.5), 'membrane'));
    parts.push(P(cone([s * r * 0.8, -r * 0.4, -2.2], [s * (r + 4.6), -r * 0.4 - 2.6, 1.6], 0.3, 4), 'fin'));
  }
  if (tail) {
    parts.push(P(fin([[0, 0], [6, 0], [16, 6.5], [11, 6.2], [3, 2.8]], 0.35).translate(0, r * 0.35, -3), 'fin'));
    parts.push(P(fin([[0, 0], [6, 0], [16, -5.5], [11, -5.4], [3, -2.4]], 0.35).translate(0, -r * 0.3, -3), 'membrane'));
    for (const s of SIDES) parts.push(P(fin([[0, 0], [4, 0], [9, 3.4], [3, 1.6]], 0.25).rotateZ(-s * 1.6).translate(s * r * 0.5, 0, 0), 'fin'));
  }
  return mergeGeometries(parts);
}

// ============================================================ RỒNG LÝ — slender sinuous Lý-dynasty dragon
function headLy() {
  const parts = [P(loft([
    { z: -13.5, pts: ell(1.0, 0.8, 1.5, 12, 0.5) }, { z: -11.5, pts: ell(1.7, 1.1, 1.2, 12, 0.5) }, { z: -7, pts: ell(2.2, 1.25, 1.0, 12, 0.5) },
    { z: -2.5, pts: ell(3.0, 1.9, 1.3, 12, 0.5) }, { z: 2, pts: ell(3.6, 2.5, 1.6, 12, 0.5) }, { z: 6.5, pts: ell(3.0, 2.3, 1.3, 12, 0.4) },
  ]), 'armor')];
  parts.push(P(new THREE.BoxGeometry(3.2, 0.2, 12).translate(0, 0.35, -6), 'mouth'));
  // the long curled upper lip — the Lý dragon's flame-like snout
  parts.push(P(fin([[0, 0], [1.6, 0.2], [1.3, 1.5], [0.1, 2.7], [-1.0, 3.0], [-1.6, 2.2], [-0.8, 2.1], [-0.15, 1.3]], 0.55).translate(0, 1.9, -12.8), 'plate'));
  for (const s of SIDES) {
    parts.push(P(new THREE.SphereGeometry(0.5, 7, 5).translate(s * 0.85, 2.2, -12.4), 'plate'));
    parts.push(P(new THREE.SphereGeometry(0.8, 10, 7).translate(s * 2.4, 2.85, -2.5), 'eye'));
    parts.push(P(flame(4.2, 1.7, 0.3).rotateZ(-s * 0.55).translate(s * 2.2, 3.5, -3.4), 'mane2'));                      // flame brows
    // two slender horns swept back
    parts.push(P(taper([[s * 1.3, 3.6, 0], [s * 2.5, 6.0, 4.5], [s * 2.9, 7.4, 10]], 0.62, 0.1, 12, 6), 'horn'));
    // long whiskers
    parts.push(P(taper([[s * 1.3, 1.0, -11.5], [s * 3.5, 0.2, -9], [s * 6, 1.6, -4], [s * 7.5, 0.4, 3], [s * 8.6, 2.6, 10]], 0.22, 0.05, 22, 5), 'whisker'));
    parts.push(P(taper([[s * 2.6, 0.9, -5], [s * 4.6, -0.6, -2], [s * 5.5, -2.6, 2.5]], 0.16, 0.05, 10, 4), 'whisker'));
    // upper teeth with a pair of fangs
    for (let k = 0; k < 6; k++) { const h = k === 0 ? 1.9 : 0.8; parts.push(P(new THREE.ConeGeometry(k === 0 ? 0.3 : 0.2, h, 4).rotateX(Math.PI).translate(s * lerp(1.2, 2.5, k / 5), 0.45 - h / 2, -11.3 + k * 1.5), 'teeth')); }
    parts.push(P(new THREE.BoxGeometry(0.14, 0.14, 7).rotateY(s * 0.1).translate(s * 3.25, 1.1, 1.5), 'seam'));
    // flame mane streaming back from the crown
    for (let k = 0; k < 6; k++) {
      parts.push(P(flame(7 + k * 0.5, 4.2 - k * 0.3, 0.35).rotateZ(-s * (0.35 + (k % 2) * 0.3)).translate(s * (0.8 + 0.2 * k), 3.0 - k * 0.2, -1.6 + k * 1.6), k % 2 ? 'mane2' : 'mane'));
    }
  }
  parts.push(P(flame(9, 5, 0.4).translate(0, 3.6, -0.5), 'mane'));
  return mergeGeometries(parts);
}
function jawLy() {
  const parts = [P(loft([
    { z: -18, pts: ell(0.8, 0.4, -0.4, 12) }, { z: -14, pts: ell(1.5, 0.55, -0.55, 12) }, { z: -8, pts: ell(2.2, 0.75, -0.75, 12) }, { z: 0, pts: ell(3.2, 1.0, -0.7, 12) },
  ]), 'plate')];
  for (const s of SIDES) for (let k = 0; k < 6; k++) { const h = k === 0 ? 1.6 : 0.7; parts.push(P(new THREE.ConeGeometry(k === 0 ? 0.28 : 0.2, h, 4).translate(s * lerp(0.75, 2.2, k / 5), h / 2 - 0.1, -17.2 + k * 1.6), 'teeth')); }
  parts.push(P(new THREE.BoxGeometry(2.6, 0.25, 14).translate(0, -0.1, -9), 'mouth'));
  // the long curling tongue
  parts.push(P(taper([[0, 0, -8], [0, 0.2, -13], [0, 0.1, -16.5], [0, 1.0, -18.5]], 0.4, 0.12, 12, 6), 'mouth'));
  return mergeGeometries(parts);
}
function segLy(kind) {
  const r = 3.7, parts = [];
  const tail = kind === 'tail';
  parts.push(P(loft(tail
    ? [{ z: -6.3, pts: ell(r * 0.92, r * 0.9, 0, 14, 0.15) }, { z: 0, pts: ell(r * 0.66, r * 0.64, 0, 14, 0.15) }, { z: 6, pts: ell(r * 0.36, r * 0.34, 0, 14) }, { z: 10, pts: ell(0.3, 0.3, 0, 14) }]
    : [{ z: -6.3, pts: ell(r * 0.92, r * 0.9, 0, 14, 0.15) }, { z: -2.4, pts: ell(r, r * 0.95, 0, 14, 0.15) }, { z: 2.4, pts: ell(r * 0.98, r * 0.94, 0, 14, 0.15) }, { z: 6.3, pts: ell(r * 0.9, r * 0.88, 0, 14, 0.15) }]), 'armor'));
  const rows = tail ? 2 : 5;
  for (let row = 0; row < rows; row++) {
    const z = -4.8 + row * 2.4, rr = tail ? 0.85 - row * 0.15 : 1;
    for (let j = 0; j < 10; j++) {
      const a = -0.45 + (j + (row % 2) * 0.5) / 10 * (Math.PI + 0.9);
      parts.push(P(onBody(scaleGeo(1.7 * rr, 2.3, 0.26), a, r * 0.96 * rr, r * 0.92 * rr, z, 0.03), (j + row) % 2 ? 'scale' : 'scale2'));
    }
  }
  if (!tail) {
    // frilled, serrated dorsal ridge
    const teeth = [[0, 0], [12.6, 0]];
    for (let k = 0; k < 7; k++) { const z = 12.6 - k * 1.8; teeth.push([z - 0.25, 2.5 - (k % 2) * 0.5], [z - 1.2, 1.0]); }
    parts.push(P(fin(teeth, 0.3).translate(0, r * 0.88, -6.3), 'fin'));
    for (let k = 0; k < 7; k++) parts.push(P(new THREE.BoxGeometry(3.8, 0.4, 1.45).translate(0, -r * 0.86, -5.4 + k * 1.8), 'belly'));
    for (const s of SIDES) parts.push(P(new THREE.BoxGeometry(0.13, 0.13, 11.5).translate(s * r * 0.99, 0.35, 0), 'seam'));
  }
  if (kind === 'neck') for (const s of SIDES) for (let k = 0; k < 3; k++) {
    parts.push(P(flame(6.5, 3.4 - k * 0.4, 0.3).rotateZ(-s * (0.45 + (k % 2) * 0.25)).translate(s * 0.9, r * 0.75, -5.5 + k * 3.6), k % 2 ? 'mane' : 'mane2'));
  }
  if (kind === 'leg') for (const s of SIDES) {
    // small three-claw leg reaching forward
    const sh = [s * r * 0.7, -r * 0.35, -0.5], el = [s * (r + 1.8), -r * 0.6, 1.2], pw = [s * (r + 2.4), -r * 1.75, -2.4];
    parts.push(P(taper([sh, [s * (r + 1.0), -r * 0.45, 0.9], el], 1.0, 0.6, 8, 6), 'armor'));
    parts.push(P(taper([el, [s * (r + 2.4), -r * 1.2, -0.4], pw], 0.6, 0.4, 8, 6), 'scale'));
    parts.push(P(new THREE.SphereGeometry(0.62, 8, 6).translate(pw[0], pw[1], pw[2]), 'scale2'));
    for (const dx of [-0.65, 0, 0.65]) parts.push(P(cone(pw, [pw[0] + dx * s, pw[1] - 0.9, pw[2] - 1.7], 0.24, 5), 'claw'));
    parts.push(P(flame(3.6, 1.6, 0.25).rotateZ(-s * 0.9).translate(el[0], el[1], el[2] - 0.6), 'mane'));
  }
  if (tail) {
    // flame tail
    parts.push(P(flame(15, 7, 0.4).translate(0, 0.4, 0), 'mane'));
    parts.push(P(flame(13, 5.5, 0.35, true).translate(0, -0.3, 1), 'mane2'));
    for (const s of SIDES) parts.push(P(flame(12, 5, 0.3).rotateZ(-s * 1.2).translate(s * 0.5, 0, 1.5), s > 0 ? 'mane2' : 'mane'));
    parts.push(P(fin([[0, 0], [5, 0], [4, 2.0], [1, 1.6]], 0.25).translate(0, r * 0.7, -6), 'fin'));
  }
  return mergeGeometries(parts);
}

// ============================================================ HẮC LONG — golden Nguyễn dragon held by Thời Ảnh's black dragon
function headNg() {
  const parts = [P(loft([
    { z: -13, pts: ell(2.0, 1.3, 1.4, 12, 0.5) }, { z: -11, pts: ell(2.7, 1.6, 1.4, 12, 0.5) }, { z: -7, pts: ell(2.9, 1.5, 1.1, 12, 0.5) },
    { z: -2, pts: ell(3.9, 2.3, 1.4, 12, 0.5) }, { z: 3, pts: ell(4.7, 3.0, 1.6, 12, 0.5) }, { z: 7.5, pts: ell(4.0, 2.8, 1.3, 12, 0.4) },
  ]), 'armor')];
  parts.push(P(new THREE.BoxGeometry(4.2, 0.2, 13).translate(0, 0.35, -6.5), 'mouth'));
  parts.push(P(new THREE.BoxGeometry(1.0, 0.8, 8).translate(0, 3.0, -8), 'plate'));
  for (const s of SIDES) {
    parts.push(P(new THREE.SphereGeometry(1.15, 9, 7).scale(1, 0.85, 1.1).translate(s * 1.15, 2.55, -12.0), 'plate'));   // bulbous nose
    parts.push(P(new THREE.SphereGeometry(1.0, 10, 8).translate(s * 2.85, 3.25, -2.7), 'eye'));
    parts.push(P(flame(6, 2.4, 0.4).rotateZ(-s * 0.6).translate(s * 2.6, 4.0, -3.8), 'mane'));                          // flame brows
    // branching antlers
    parts.push(P(taper([[s * 1.6, 4.0, 1.5], [s * 3.2, 7.2, 6], [s * 4.6, 9.6, 12]], 0.78, 0.14, 14, 6), 'horn'));
    parts.push(P(taper([[s * 2.6, 6.0, 4.2], [s * 4.4, 8.6, 3.6], [s * 5.5, 10.6, 5.2]], 0.42, 0.1, 8, 5), 'horn'));
    parts.push(P(taper([[s * 3.9, 8.6, 9.2], [s * 5.6, 10.8, 9.6]], 0.3, 0.08, 4, 5), 'horn'));
    // thick whiskers
    parts.push(P(taper([[s * 1.8, 1.6, -12], [s * 5, 0.5, -10], [s * 8, 2.8, -4], [s * 10, 0.5, 4], [s * 11.5, 3.5, 11]], 0.3, 0.06, 24, 5), 'whisker'));
    parts.push(P(flame(5.5, 2.6, 0.3).rotateZ(-s * 1.3).translate(s * 3.9, 0.9, 2.2), 'mane2'));                       // cheek flames
    for (let k = 0; k < 7; k++) { const h = k === 0 ? 2.1 : 0.9; parts.push(P(new THREE.ConeGeometry(k === 0 ? 0.34 : 0.24, h, 4).rotateX(Math.PI).translate(s * lerp(1.6, 3.2, k / 6), 0.45 - h / 2, -11.6 + k * 1.6), 'teeth')); }
    parts.push(P(new THREE.BoxGeometry(0.16, 0.16, 8).rotateY(s * 0.1).translate(s * 4.2, 1.4, 2.2), 'seam'));
    // bushy flame mane
    for (let k = 0; k < 7; k++) {
      parts.push(P(flame(8 + (k % 3), 4.6 - (k % 3) * 0.6, 0.4).rotateZ(-s * (0.3 + (k % 3) * 0.32)).translate(s * (1.0 + 0.25 * k), 3.4 - k * 0.15, -1 + k * 1.4), k % 2 ? 'mane2' : 'mane'));
    }
  }
  parts.push(P(flame(10, 5.5, 0.45).translate(0, 4.0, 0), 'mane'));
  return mergeGeometries(parts);
}
function jawNg() {
  const parts = [P(loft([
    { z: -19, pts: ell(1.4, 0.55, -0.5, 12) }, { z: -15, pts: ell(2.3, 0.75, -0.7, 12) }, { z: -8, pts: ell(2.9, 0.9, -0.9, 12) }, { z: 0, pts: ell(4.0, 1.2, -0.8, 12) },
  ]), 'plate')];
  for (const s of SIDES) for (let k = 0; k < 7; k++) { const h = k === 0 ? 1.8 : 0.8; parts.push(P(new THREE.ConeGeometry(k === 0 ? 0.32 : 0.22, h, 4).translate(s * lerp(1.1, 3.0, k / 6), h / 2 - 0.1, -18.2 + k * 1.7), 'teeth')); }
  parts.push(P(new THREE.BoxGeometry(3.4, 0.25, 15).translate(0, -0.1, -10), 'mouth'));
  // flame beard
  parts.push(P(flame(8, 3.6, 0.4, true).translate(0, -1.6, -12), 'mane'));
  for (const s of SIDES) parts.push(P(flame(7, 3, 0.3, true).rotateZ(s * 0.5).translate(s * 1.2, -1.4, -8), 'mane2'));
  return mergeGeometries(parts);
}
function segNg(kind) {
  const r = 4.6, parts = [];
  const tail = kind === 'tail';
  parts.push(P(loft(tail
    ? [{ z: -6.2, pts: ell(r * 0.88, r * 0.84, 0, 14, 0.12) }, { z: 0, pts: ell(r * 0.66, r * 0.62, 0, 14, 0.12) }, { z: 6, pts: ell(r * 0.38, r * 0.36, 0, 14) }, { z: 10.5, pts: ell(0.3, 0.3, 0, 14) }]
    : [{ z: -6.2, pts: ell(r * 0.88, r * 0.84, 0, 14, 0.12) }, { z: -2.3, pts: ell(r, r * 0.94, 0, 14, 0.12) }, { z: 2.4, pts: ell(r * 0.97, r * 0.92, 0, 14, 0.12) }, { z: 6.2, pts: ell(r * 0.86, r * 0.82, 0, 14, 0.12) }]), 'armor'));
  const rows = tail ? 2 : 4;
  for (let row = 0; row < rows; row++) {
    const z = -4.5 + row * 3.0, rr = tail ? 0.82 - row * 0.14 : 1;
    for (let j = 0; j < 9; j++) {
      const a = -0.5 + (j + (row % 2) * 0.5) / 9 * (Math.PI + 1.0);
      parts.push(P(onBody(scaleGeo(2.5 * rr, 3.3, 0.36), a, r * 0.96 * rr, r * 0.9 * rr, z, 0.05), (j + row) % 2 ? 'scale' : 'scale2'));
    }
  }
  if (!tail) {
    for (const z of [-5.2, -0.8, 3.6]) parts.push(P(fin([[0, 0], [3.6, 0], [4.8, 3.8], [2.2, 1.8]], 0.4).translate(0, r * 0.88, z), 'fin'));
    for (let k = 0; k < 7; k++) parts.push(P(new THREE.BoxGeometry(4.6, 0.45, 1.5).translate(0, -r * 0.85, -5.2 + k * 1.75), 'belly'));
    for (const s of SIDES) parts.push(P(new THREE.BoxGeometry(0.15, 0.15, 11.5).translate(s * r * 0.99, 0.5, 0), 'seam'));
  }
  if (kind === 'neck') for (const s of SIDES) for (let k = 0; k < 3; k++) {
    parts.push(P(flame(7.5, 3.8 - k * 0.4, 0.35).rotateZ(-s * (0.4 + (k % 2) * 0.3)).translate(s * 1.0, r * 0.75, -5.6 + k * 3.6), k % 2 ? 'mane2' : 'mane'));
  }
  if (kind === 'leg') for (const s of SIDES) {
    // imperial five-claw leg
    const sh = [s * r * 0.7, -r * 0.35, -0.5], el = [s * (r + 2.2), -r * 0.6, 1.5], pw = [s * (r + 2.9), -r * 1.8, -2.6];
    parts.push(P(taper([sh, [s * (r + 1.2), -r * 0.45, 1.1], el], 1.3, 0.8, 8, 6), 'armor'));
    parts.push(P(taper([el, [s * (r + 2.9), -r * 1.2, -0.4], pw], 0.8, 0.55, 8, 6), 'scale'));
    parts.push(P(new THREE.SphereGeometry(0.85, 8, 6).translate(pw[0], pw[1], pw[2]), 'scale2'));
    for (const dx of [-1.0, -0.5, 0, 0.5, 1.0]) parts.push(P(cone(pw, [pw[0] + dx * s, pw[1] - 1.1, pw[2] - 1.8 + Math.abs(dx) * 0.5], 0.26, 5), 'claw'));
    parts.push(P(flame(4.6, 2.0, 0.3).rotateZ(-s * 0.9).translate(el[0], el[1], el[2] - 0.6), 'mane'));
  }
  if (tail) {
    parts.push(P(flame(15, 7.5, 0.45).translate(0, 0.4, 0), 'mane'));
    parts.push(P(flame(13, 6, 0.4, true).translate(0, -0.3, 1), 'mane2'));
    for (const s of SIDES) parts.push(P(flame(12, 5.5, 0.35).rotateZ(-s * 1.2).translate(s * 0.5, 0, 1.5), s > 0 ? 'mane2' : 'mane'));
  }
  return mergeGeometries(parts);
}
// Thời Ảnh's black dragon: a helical coil around each segment (two parities → continuous helix)
function coilGeo(par, r) {
  const parts = [], pts = [], gl = [];
  for (let i = 0; i <= 16; i++) {
    const z = -6.6 + i / 16 * 13.2, a = par * Math.PI + i / 16 * Math.PI + 0.35;
    pts.push([Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.08, z]);
    gl.push([Math.cos(a) * (r * 1.12 + 1.15), Math.sin(a) * (r * 1.08 + 1.15), z]);
    if (i === 5 || i === 12) {
      const sp = 1 + (i === 5 ? 3.2 : 2.4);
      parts.push(P(cone([Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.08, z], [Math.cos(a) * (r * 1.12 + sp + 1.6), Math.sin(a) * (r * 1.08 + sp + 1.6), z + 1.6], 0.9, 5), 'shadow2'));
    }
  }
  parts.push(P(taper(pts, 1.55, 1.55, 24, 7), 'shadow'));
  parts.push(P(taper(gl, 0.2, 0.2, 24, 4), 'sglow'));
  return mergeGeometries(parts);
}
// …and its head, clamping its jaws over the golden dragon's crown
function shadowHeadGeo() {
  const parts = [P(loft([
    { z: -15, pts: hexS(0.9, 0.55, 0.5) }, { z: -11, pts: hexS(2.1, 0.9, 0.7) }, { z: -6, pts: hexS(2.9, 1.3, 0.9) },
    { z: -1, pts: hexS(4.2, 2.2, 1.2) }, { z: 4, pts: hexS(4.6, 2.7, 1.3) }, { z: 10, pts: hexS(3.0, 2.0, 0.8) },
  ]), 'shadow')];
  parts.push(P(new THREE.BoxGeometry(3.0, 0.2, 13).translate(0, -0.35, -6.5), 'sglow'));
  const jaw = [P(loft([{ z: -18, pts: hexS(0.9, 0.45, -0.7) }, { z: -11, pts: hexS(2.4, 0.8, -1.0) }, { z: 0, pts: hexS(3.8, 1.1, -0.9) }]), 'shadow')];
  jaw.push(P(new THREE.BoxGeometry(2.6, 0.2, 14).translate(0, -0.25, -8.5), 'sglow'));
  for (const s of SIDES) for (let k = 0; k < 8; k++) {
    const h = k % 2 ? 1.0 : 2.3;
    parts.push(P(new THREE.ConeGeometry(0.3, h, 4).rotateX(Math.PI).translate(s * lerp(0.9, 3.4, k / 7), -0.4 - h / 2, -14 + k * 1.6), 'shadow2'));
    jaw.push(P(new THREE.ConeGeometry(0.28, h, 4).translate(s * lerp(0.8, 3.0, k / 7), -0.2 + h / 2, -17 + k * 1.8), 'shadow2'));
  }
  for (const g of jaw) parts.push(g.rotateX(-0.4).translate(0, -0.6, 5));
  for (const s of SIDES) {
    // brow ridges over slit eyes (two pairs), swept horns, cheek blades, nostril spikes
    parts.push(P(slab([[0, 3], [2.6, 1], [3.4, -3.5], [1.2, -1.5]], 0.6).rotateZ(-s * 0.35).translate(s * 2.6, 3.0, -2.5), 'shadow2'));
    parts.push(P(new THREE.OctahedronGeometry(0.9, 0).scale(1.4, 0.5, 1.8).rotateY(s * 0.35).translate(s * 3.3, 1.9, -2.6), 'seye'));
    parts.push(P(new THREE.OctahedronGeometry(0.55, 0).scale(1.3, 0.45, 1.6).rotateY(s * 0.35).translate(s * 2.4, 1.5, -6.0), 'seye'));
    parts.push(P(taper([[s * 2.0, 3.0, 0.5], [s * 4.6, 6.5, 7], [s * 6.2, 6.4, 15], [s * 6.6, 3.6, 22]], 1.1, 0.08, 18, 6), 'shadow'));
    parts.push(P(taper([[s * 3.2, 2.4, 3], [s * 7.4, 3.6, 7], [s * 10, 2.2, 12]], 0.6, 0.06, 10, 5), 'shadow2'));
    parts.push(P(taper([[s * 3.8, 0.4, 3], [s * 7.0, -0.8, 8], [s * 8.6, -3.2, 13]], 0.55, 0.06, 10, 5), 'shadow2'));
    parts.push(P(new THREE.BoxGeometry(0.18, 0.18, 12).rotateY(s * 0.18).translate(s * 4.0, 1.0, -0.5), 'sglow'));
    parts.push(P(cone([s * 0.7, 1.0, -13.5], [s * 1.6, 2.6, -11], 0.35, 4), 'shadow2'));
  }
  for (let k = 0; k < 6; k++) parts.push(P(cone([0, 2.8 + k * 0.15, -6 + k * 3], [0, 5.6 + (k % 2) * 1.6, -3.5 + k * 3.4], 0.7, 4), 'shadow2'));
  return mergeGeometries(parts);
}

// shadow growths that serve as turrets (barrels point +Z: Object3D.lookAt aims +Z at the target)
function turretGeo() {
  const parts = [
    P(new THREE.CylinderGeometry(2.0, 2.6, 1.2, 7), 'shadow2'),
    P(new THREE.CylinderGeometry(1.7, 1.0, 2.2, 7).translate(0, -1.7, 0), 'shadow'),
    ...[0, 1, 2, 3].map(k => { const a = k / 4 * TAU + 0.4; return P(taper([[Math.cos(a) * 1.8, -0.3, Math.sin(a) * 1.8], [Math.cos(a) * 3.0, -1.2, Math.sin(a) * 3.0], [Math.cos(a) * 3.2, -2.8, Math.sin(a) * 3.2]], 0.45, 0.08, 6, 4), 'shadow2'); }),
    P(new THREE.SphereGeometry(1.8, 9, 5, 0, TAU, 0, Math.PI / 2).translate(0, 0.5, 0), 'shadow'),
    P(new THREE.TorusGeometry(2.0, 0.16, 4, 14).rotateX(Math.PI / 2).translate(0, 0.62, 0), 'sglow'),
    P(new THREE.OctahedronGeometry(0.62, 0).scale(1.3, 0.8, 1).translate(0, 1.3, 1.45), 'seye'),
  ];
  for (const x of [-0.75, 0.75]) parts.push(P(cone([x, 1.2, 0.6], [x * 1.1, 1.3, 4.2], 0.42, 5), 'shadow2'));
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * TAU + 0.6, c = Math.cos(a), s = Math.sin(a);
    parts.push(P(cone([c * 1.2, 0.6, s * 1.2], [c * 2.6, 3.2 + (k % 2) * 1.0, s * 2.6 - 0.8], 0.45, 4), 'shadow'));
  }
  return mergeGeometries(parts);
}

// ============================================================ models
const MODELS = {
  thuongluong: {
    head: headTL, jaw: jawTL, seg: segTL, kinds: { 1: 'fin', 8: 'fin' }, turY: 5.4, emit: 2.4,
    eyes: [[2.75, 2.85, -1.6]], core: [0, -0.45, -5.5], mouth: [0, -1, -15], pearlTo: [0, 1.0, -20], trueEye: [2.6, 1.8, 0.4],
    gold: [0.7, 1.5, 1.2],
  },
  rongly: {
    head: headLy, jaw: jawLy, seg: segLy, kinds: { 0: 'neck', 1: 'leg', 9: 'leg' }, turY: 5.4, emit: 2.6,
    eyes: [[2.35, 2.85, -3.0]], core: [0, -0.4, -5.0], mouth: [0, -0.8, -13], pearlTo: [0, 2.6, -20], trueEye: [0.8, 3, 1.8],
    gold: [1.4, 1.1, 0.4],
  },
  haclong: {
    head: headNg, jaw: jawNg, seg: segNg, kinds: { 0: 'neck', 1: 'leg', 10: 'leg' }, turY: 5.4, emit: 2.6, coil: true, shadowHead: true,
    eyes: [[2.8, 3.25, -3.4]], core: [0, -0.4, -5.0], mouth: [0, -1, -14], pearlTo: [0, 2.2, -21], trueEye: [3, 2.4, 0.9],
    gold: [1.6, 1.2, 0.45],
  },
};
const BODY_R = { thuongluong: 5, rongly: 3.7, haclong: 4.6 };

// ============================================================ Boss
const N = 16;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const PEARL = new THREE.Color(2.6, 2.3, 1.7);

export class SerpentBoss {
  constructor(cfg = {}) {
    this.cfg = cfg;
    this.model = MODELS[cfg.model] ? cfg.model : 'thuongluong';
    const M = this.M = MODELS[this.model];
    PAL = buildPalette(this.model, cfg.palette);
    this.final = !!cfg.final;
    this.TUR = this.final ? [2, 3, 5, 6, 8, 9, 11, 12] : [2, 4, 6, 8, 10, 12];
    this.coreHp = Math.round(150 * (cfg.hp || 1));
    this.turretHp = cfg.turretHp || 10;
    this.sizeK = cfg.scale || 1;
    this.mat = dragonMaterial(false);
    this.smat = dragonMaterial(true, { roughness: 0.3, metalness: 0.4 });
    this.mat.userData.emit.value = M.emit;
    this.smat.userData.emit.value = 3.0;
    this.root = new THREE.Group();
    // head
    this.head = new THREE.Group();
    this.skull = new THREE.Mesh(M.head(), this.mat);
    this.jawPivot = new THREE.Group();
    this.jawPivot.position.set(0, -0.5, 6);
    this.jaw = new THREE.Mesh(M.jaw(), this.mat);
    this.jawPivot.add(this.jaw);
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 4) });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 1), this.coreMat);
    this.core.position.fromArray(M.core);
    this.head.add(this.skull, this.jawPivot, this.core);
    this.skull.castShadow = this.jaw.castShadow = true;
    if (M.shadowHead) {
      this.shead = new THREE.Mesh(shadowHeadGeo(), this.smat);
      this.shead.position.set(0, 6.9, 6.5);
      this.shead.rotation.x = -0.1;
      this.shead.scale.setScalar(1.25);
      this.shead.castShadow = true;
      this.head.add(this.shead);
    }
    this.head.scale.setScalar(1.7 * this.sizeK);
    this.root.add(this.head);
    // body
    const geos = {}, geo = (k) => (geos[k] ||= M.seg(k));
    const coils = M.coil ? [coilGeo(0, BODY_R[this.model]), coilGeo(1, BODY_R[this.model])] : null;
    const gTur = turretGeo();
    this.segs = [];
    for (let i = 0; i < N; i++) {
      const scale = this.sizeK * 1.35 * (i < 3 ? 1.05 - i * 0.02 : lerp(1.0, 0.4, (i - 3) / (N - 3)));
      const kind = i === N - 1 ? 'tail' : (M.kinds[i] || 'body');
      const mesh = new THREE.Mesh(geo(kind), this.mat);
      mesh.scale.setScalar(scale);
      mesh.castShadow = true;
      if (coils) { const c = new THREE.Mesh(coils[i % 2], this.smat); c.castShadow = true; mesh.add(c); }
      this.root.add(mesh);
      const seg = { mesh, scale, pos: new THREE.Vector3(), prevY: 0, turret: null, fire: 0 };
      if (this.TUR.includes(i)) {
        const tm = new THREE.Mesh(gTur, this.smat);
        tm.castShadow = true;
        this.root.add(tm);
        seg.turret = { mesh: tm, hp: this.turretHp, alive: true, pos: new THREE.Vector3(), fireT: rand(1, 3) };
      }
      this.segs.push(seg);
    }
    // rail-relative chain nodes: 0 = head, i+1 = segment i
    this.nodes = [];
    for (let i = 0; i <= N; i++) this.nodes.push({ s: 0, u: 0, v: 0 });
    this.spacing = [];
    for (let i = 0; i < N; i++) this.spacing.push(i === 0 ? 20 : 10.2 * this.segs[i].scale + 1.2);
    this.bodyLen = this.spacing.reduce((a, b) => a + b, 0) + 30 * this.sizeK;
    this.headPos = new THREE.Vector3();
    this.mouthPos = new THREE.Vector3();
    this.mouth2Pos = new THREE.Vector3();
    this.headQuat = new THREE.Quaternion();
    this.eyeCol = new THREE.Color();
    this.buildTargets();
    this.active = false;
  }

  buildTargets() {
    const self = this;
    this.coreT = {
      pos: new THREE.Vector3(), radius: 5.8, alive: true, lockable: true, hittable: false, hp: self.coreHp,
      hit(dmg, p, src) {
        if (!self.active || self.phase === 'dying') return 'none';
        if (self.jawOpen < 0.55) { sparks(p || this.pos, null, 6, [3, 3.5, 4], 25, 1); return 'armor'; }
        this.hp -= dmg * (src === 'bomb' ? 0.6 : 1);
        self.flash = 1;
        emit('bossHit');
        if (this.hp <= 0) { this.hp = 0; self.die(); return 'kill'; }
        return 'hit';
      },
    };
    this.headT = { pos: new THREE.Vector3(), radius: 12, alive: true, lockable: false, hittable: true, hit: () => 'armor' };
    this.segT = this.segs.map((s) => ({ pos: s.pos, radius: 5.5 * s.scale, alive: true, lockable: false, hittable: true, hit: () => 'armor' }));
    this.turT = [];
    for (const s of this.segs) {
      if (!s.turret) continue;
      const tr = s.turret;
      const t = {
        pos: tr.pos, radius: 5.2, alive: true, lockable: true, hittable: true,
        hit(dmg) {
          if (!tr.alive) return 'none';
          tr.hp -= dmg;
          tr.flash = 1;
          emit('bossHit');
          if (tr.hp <= 0) { self.destroyTurret(s); return 'kill'; }
          return 'hit';
        },
      };
      tr.target = t;
      this.turT.push(t);
    }
  }

  get maxHp() { return this.turretHp * this.TUR.length + this.coreHp; }
  get focus() { return this.headPos; }
  botTarget() {
    for (const sg of this.segs) if (sg.turret && sg.turret.alive && sg.pos.y > 0) return sg.turret.pos;
    if (this.jawOpen > 0.5) return this.coreT.pos;
    return this.headPos;
  }
  get hp() { let h = this.coreT.hp; for (const s of this.segs) if (s.turret && s.turret.alive) h += Math.max(0, s.turret.hp); return h; }

  setLook(purify, gold, vanish) {
    for (const m of [this.mat, this.smat]) { m.userData.purify.value = purify; m.userData.gold.value = gold; m.userData.vanish.value = vanish; }
  }

  start() {
    this.active = true;
    this.phase = 'intro'; this.pt = 0; this.t = 0;
    this.jawOpen = 0; this.jawTarget = 0; this.flash = 0;
    this.enraged = false; this.cycle = 0; this.sub = 'approach'; this.subT = 0;
    this.face = 0; this.beamLoop = null; this.chargeLoop = null; this.beamDir = 1; this.beamTick = 0;
    this.missileT = 6; this.diveT = 12; this.diving = 0; this.burstT = 4; this.passDone = false;
    this.roared = false; this.reported = false; this.done = false; this.slowOn = false; this.purT = 0; this.goldDone = false; this.vanishing = false;
    this.purK = 0;
    this.coreT.hp = this.coreHp; this.coreT.alive = true;
    for (const s of this.segs) if (s.turret) { s.turret.hp = this.turretHp; s.turret.alive = true; s.turret.mesh.visible = true; s.turret.target.alive = true; s.turret.flash = 0; }
    for (const s of this.segs) { s.mesh.visible = true; s.burn = 0; s.dead = false; s.mesh.castShadow = true; }
    this.head.visible = true; this.root.visible = true;
    this.skull.castShadow = this.jaw.castShadow = true;
    if (this.shead) this.shead.visible = true;
    this.core.position.fromArray(this.M.core); this.core.scale.setScalar(1); this.core.visible = true;
    this.mat.userData.tint.value.setRGB(1, 1, 1);
    this.mat.userData.emit.value = this.M.emit;
    this.mat.userData.vein.value.setRGB(0.85, 0.42, 1.3);
    this.smat.userData.vein.value.setRGB(0.85, 0.42, 1.3);
    this.setLook(0, 0, 0);
    // start submerged far ahead
    this.hs = 330; this.hu = 0; this.hv = -70;
    for (let i = 0; i <= N; i++) { const n = this.nodes[i]; n.s = 330 + i * 11; n.u = Math.sin(i * 0.5) * 10; n.v = -70 - i * 2; }
    G.scene.add(this.root);
    for (const t of [this.coreT, this.headT, ...this.segT, ...this.turT]) TARGETS.add(t);
    this.segs.forEach(s => { s.prevY = -50; });
    this.headPrevY = -50;
  }

  stop() {
    this.active = false;
    G.scene.remove(this.root);
    for (const t of [this.coreT, this.headT, ...this.segT, ...this.turT]) TARGETS.delete(t);
    if (this.beamLoop) { this.beamLoop.stop(0.2); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.2); this.chargeLoop = null; }
    if (this.slowOn) { G.slowMo = 1; this.slowOn = false; }
  }

  // a shadow growth breaks apart into dark motes and violet sparks
  crumble(seg, big = 1) {
    const tr = seg.turret, p = tr.pos, sc = seg.scale * big;
    tr.alive = false; tr.target.alive = false;
    tr.mesh.visible = false;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU, sp = rand(4, 16) * sc;
      FX.smoke.spawn(p.x + rand(-2, 2) * sc, p.y + rand(-1, 2) * sc, p.z + rand(-2, 2) * sc, Math.cos(a) * sp, rand(2, 14) * sc, Math.sin(a) * sp,
        rand(0.8, 1.6), rand(0.8, 1.8) * sc, 0.2, [0.03, 0.02, 0.05, 0.95], [0.08, 0.04, 0.12, 0], 1, { grav: 16, drag: 0.8, rotV: rand(-3, 3) });
    }
    for (let i = 0; i < 4; i++) FX.smoke.spawn(p.x, p.y + 1, p.z, rand(-3, 3), rand(3, 7), rand(-3, 3), rand(1.4, 2.2), 3 * sc, 11 * sc, [0.05, 0.03, 0.08, 0.7], [0.1, 0.06, 0.15, 0], 1, { fadeIn: 0.05, drag: 1 });
    sparks(p, _v.set(0, 1, 0), 22, [2.4, 0.9, 4.5], 45, 1);
    FX.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.3, 2 * sc, 13 * sc, [1.6, 0.6, 3, 0.7], [0.4, 0.1, 0.8, 0], 3, { rot: 0 });
    flashLight(p, 0xb46bff, 600, 0.3);
  }

  destroyTurret(seg) {
    this.crumble(seg);
    AudioSys.sfx('explodeL');
    addShake(0.35);
    seg.burn = 1;
    emit('bossTurretDown', this.turretsLeft());
    if (this.turretsLeft() === 0) this.enterPhase2();
  }
  turretsLeft() { let n = 0; for (const s of this.segs) if (s.turret && s.turret.alive) n++; return n; }

  enterPhase2() {
    this.phase = 'p2'; this.pt = 0; this.sub = 'weave'; this.subT = 1.5;
    AudioSys.sfx('roar', { pitch: 1.1 });
    addShake(0.5);
    emit('bossPhase', 2);
  }

  // the shadow heart breaks: purification begins
  die() {
    this.phase = 'dying'; this.pt = 0; this.purT = 0;
    this.coreT.alive = false;
    this.jawTarget = 1;
    if (this.beamLoop) { this.beamLoop.stop(0.1); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.1); this.chargeLoop = null; }
    AudioSys.sfx('roar', { pitch: 0.7 });
    AudioSys.sfx('bombBlast', { vol: 0.6, pitch: 0.7 });
    bigFlash(0.75, [0.85, 0.55, 1.1]);
    addShake(0.9);
    G.slowMo = 0.45; this.slowOn = true;
    this.dyS = this.hs; this.dyU = this.hu; this.dyV = clamp(this.hv, 20, 44);
    this.crumbleQ = this.segs.filter(s => s.turret && s.turret.alive);
    this.goldDone = false; this.vanishing = false;
    this.mat.userData.tint.value.setRGB(1, 1, 1);
    sparks(this.coreT.pos, null, 40, [2.6, 1, 5], 60, 1);
    flashLight(this.coreT.pos, 0xd890ff, 2200, 0.6);
    emit('bossDying');
  }

  // ---------------------------------------------------------------- behaviour
  update(dt) {
    if (!this.active || this.done) return;
    this.t += dt; this.pt += dt;
    const P = G.player;
    let ts = this.hs, tu = this.hu, tv = this.hv, faceK = 0;
    const T = this.t;
    switch (this.phase) {
      case 'intro': {
        const k = this.pt;
        if (k < 1.6) { tv = -70; ts = 300; }
        else if (k < 4.2) { const e = easeOutCubic((k - 1.6) / 2.6); tv = lerp(-70, 58, e); ts = 300 - e * 40; tu = Math.sin(k) * 6; }
        else { const e = easeInOutCubic((k - 4.2) / 1.8); tv = lerp(58, 34, e); ts = 260 - e * 20; faceK = 0.4; }
        if (k > 1.2 && !this.roared) { this.roared = true; AudioSys.sfx('roar', { pitch: this.final ? 0.75 : 1 }); addShake(0.8); }
        if (k < 1.6) { // churning water, a violet glow rising from below
          railToWorld(G.rail.d + 300, rand(-30, 30), 0, _v);
          if (Math.random() < 0.6) splash(_v, rand(0.8, 1.8));
          if (Math.random() < 0.5) FX.smoke.spawn(_v.x, 1, _v.z, rand(-2, 2), rand(4, 10), rand(-2, 2), 2, 4, 14, [0.04, 0.02, 0.07, 0.6], [0.1, 0.05, 0.15, 0], 1, { fadeIn: 0.2 });
          addShake(0.02);
        }
        if (k > 6) { this.phase = 'p1'; this.pt = 0; emit('bossPhase', 1); }
        break;
      }
      case 'p1': {
        ts = 178 + 28 * Math.sin(T * 0.37);
        tu = 52 * Math.sin(T * 0.29);
        tv = 34 + 13 * Math.sin(T * 0.47 + 1);
        this.diveT -= dt;
        if (this.diveT <= 0 && this.diving <= 0) { this.diving = 4.2; this.diveT = 15; this.diveU = rand(-50, 50); }
        if (this.diving > 0) {
          this.diving -= dt;
          const k = 1 - this.diving / 4.2;
          tv = k < 0.5 ? lerp(tv, -45, easeInOutCubic(k * 2)) : lerp(-45, tv, easeInOutCubic((k - 0.5) * 2));
          tu = lerp(tu, this.diveU, Math.sin(k * Math.PI));
        }
        faceK = 0.25;
        this.turretFire(dt);
        this.tailMissiles(dt, 9);
        break;
      }
      case 'p2': {
        this.subT -= dt;
        const enr = this.enraged;
        switch (this.sub) {
          case 'weave':
            ts = 185 + 25 * Math.sin(T * 0.5); tu = 55 * Math.sin(T * (enr ? 0.45 : 0.33)); tv = 32 + 12 * Math.sin(T * 0.6);
            this.jawTarget = 0; faceK = 0.2;
            this.tailMissiles(dt, enr ? 5 : 7);
            if (enr) this.ringBursts(dt);
            if (this.subT <= 0) {
              if (enr && !this.passDone && this.cycle % 2 === 1) { this.sub = 'pass'; this.subT = 5.6; this.passSide = P.u > 0 ? -1 : 1; this.passDone = true; AudioSys.sfx('roar', { pitch: 1.2 }); }
              else { this.sub = 'approach'; this.subT = 2.2; }
            }
            break;
          case 'approach':
            ts = damp(this.hs, 128, 2, dt); tu = damp(this.hu, P.u * 0.4, 2, dt); tv = damp(this.hv, clamp(P.v + 8, 18, 46), 2, dt);
            faceK = 1; this.jawTarget = 0.2;
            if (this.subT <= 0) { this.sub = 'charge'; this.subT = enr ? 1.3 : 1.8; this.chargeLoop = AudioSys.loop('beamCharge'); emit('bossCharge'); }
            break;
          case 'charge':
            ts = 128 + Math.sin(T * 2) * 4; tu = damp(this.hu, P.u * 0.5, 1.5, dt); tv = damp(this.hv, clamp(P.v + 6, 18, 46), 1.5, dt);
            faceK = 1; this.jawTarget = 1;
            this.chargeFx(dt);
            if (this.subT <= 0) {
              if (this.chargeLoop) { this.chargeLoop.stop(0.05); this.chargeLoop = null; }
              this.sub = 'beam'; this.subT = enr ? 2.0 : 2.5; this.beamT = 0; this.beamDir = P.u > 0 ? -1 : 1; this.beamLoop = AudioSys.loop('beam'); addShake(0.4);
            }
            break;
          case 'beam':
            ts = 128; tu = this.hu; tv = this.hv; faceK = 1; this.jawTarget = 1;
            this.beamFx(dt);
            if (this.subT <= 0) { if (this.beamLoop) { this.beamLoop.stop(0.15); this.beamLoop = null; } this.sub = 'open'; this.subT = enr ? 2.4 : 3.2; }
            break;
          case 'open':
            ts = 128 + Math.sin(T * 1.5) * 6; tu = damp(this.hu, P.u * 0.3 + Math.sin(T) * 12, 1, dt); tv = damp(this.hv, 26 + Math.sin(T * 1.3) * 6, 1, dt);
            faceK = 1; this.jawTarget = 1;
            if (Math.random() < dt * 1.2) this.mouthSpread();
            if (this.subT <= 0) { this.sub = 'weave'; this.subT = enr ? 3.5 : 5; this.cycle++; }
            break;
          case 'pass': {
            const k = 1 - this.subT / 5.6;
            ts = k < 0.5 ? lerp(230, -70, easeInOutCubic(k * 2)) : lerp(-70, 240, easeInOutCubic((k - 0.5) * 2));
            tu = this.passSide * 62; tv = 20 + Math.sin(k * TAU) * 6; faceK = 0; this.jawTarget = 0.4;
            if (this.subT <= 0) { this.sub = 'weave'; this.subT = 3; this.cycle++; }
            break;
          }
        }
        if (!this.enraged && this.coreT.hp < this.coreHp * (this.cfg.enrageEarly || this.final ? 0.6 : 0.5)) {
          this.enraged = true; this.passDone = false;
          this.mat.userData.tint.value.setRGB(1.35, 0.7, 0.9);
          this.mat.userData.emit.value = this.M.emit * 1.7;
          for (const m of [this.mat, this.smat]) m.userData.vein.value.setRGB(1.5, 0.45, 1.8);
          AudioSys.sfx('roar', { pitch: 1.3 });
          emit('bossPhase', 3);
        }
        break;
      }
      case 'dying': {
        const r = this.purify(dt);
        ts = r[0]; tu = r[1]; tv = r[2]; faceK = 0;
        if (this.done) return;
        break;
      }
    }
    // head motion (critically damped toward the target)
    const k = this.phase === 'intro' ? 3.2 : (this.sub === 'pass' ? 3.5 : 2.2);
    this.hs = damp(this.hs, ts, k, dt); this.hu = damp(this.hu, tu, k, dt); this.hv = damp(this.hv, tv, k, dt);
    this.jawOpen = damp(this.jawOpen, this.jawTarget, 5, dt);
    this.face = damp(this.face, faceK, 3, dt);
    this.simulate(dt);
    this.place(dt);
    this.collide(dt);
  }

  // ---------------------------------------------------------------- purification (real-time sequence, ~6 s)
  purify(dt) {
    const rt = (this.purT += dt > 0 ? G.rdt : 0);   // real time (unaffected by the slow-mo), frozen while paused
    if (this.slowOn && rt > 1.0) { G.slowMo = 1; this.slowOn = false; }
    // any shadow growth left crumbles away
    while (this.crumbleQ.length && rt > 0.1 + (this.TUR.length - this.crumbleQ.length) * 0.08) this.crumble(this.crumbleQ.shift());
    // the shadow peels off from head to tail
    const F = (this.bodyLen + 70) * easeInOutCubic(clamp((rt - 0.3) / 2.0, 0, 1));
    this.purK = clamp(F / 40, 0, 1);
    // golden flash as the true colours return
    if (rt > 2.35 && !this.goldDone) {
      this.goldDone = true;
      bigFlash(0.9, [1, 0.86, 0.5]);
      flashLight(this.headPos, 0xffd27a, 2600, 0.8);
      AudioSys.sfx('extraLife');
      AudioSys.sfx('roar', { pitch: 1.55, vol: 0.7 });
      addShake(0.4);
      this.burstGold(this.headPos, 40, 1.4);
    }
    const gold = rt < 2.35 ? 0.25 * clamp((rt - 0.6) / 1.6, 0, 1) : rt < 2.6 ? lerp(0.25, 1.25, (rt - 2.35) / 0.25) : lerp(1.25, 0.35, clamp((rt - 2.6) / 1.2, 0, 1));
    const vanish = clamp((rt - 4.6) / 1.3, 0, 1);
    this.setLook(F, gold, vanish);
    this.core.visible = vanish < 0.7;
    if (vanish > 0 && !this.vanishing) { this.vanishing = true; for (const s of this.segs) s.mesh.castShadow = false; this.skull.castShadow = this.jaw.castShadow = false; }
    if (rt > 6.0 && !this.reported) {
      this.reported = true; this.done = true;
      this.root.visible = false;
      emit('bossDefeated');
      return [this.hs, this.hu, this.hv];
    }
    // motion: rears and writhes while the shadow is torn off, then rises gracefully into the sky
    this.jawTarget = rt < 2.2 ? 0.9 : 0.12;
    if (rt < 2.5) {
      return [this.dyS + Math.sin(rt * 5) * 3, this.dyU + Math.sin(rt * 3.3) * 7, this.dyV + 14 * easeOutCubic(rt / 1.2)];
    }
    const e = easeInOutCubic(clamp((rt - 2.5) / 3.4, 0, 1));
    return [this.dyS + 80 * e, this.dyU * (1 - e) + Math.sin((rt - 2.5) * 1.5) * 20 * e, this.dyV + 14 + 100 * e];
  }

  burstGold(p, n, sz = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, b = rand(-0.6, 1.2), sp = rand(6, 26) * sz;
      FX.add.spawn(p.x, p.y, p.z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 4, Math.sin(a) * Math.cos(b) * sp, rand(0.8, 1.8), rand(0.8, 1.6) * sz, 0.15,
        [3.2, 2.3, 0.9, 1], [1.6, 0.8, 0.2, 0], 0, { drag: 1.6 });
    }
  }

  simulate(dt) {
    const n = this.nodes;
    n[0].s = this.hs; n[0].u = this.hu; n[0].v = this.hv;
    for (let i = 1; i <= N; i++) {
      const a = n[i - 1], b = n[i];
      b.s += 5 * dt;                          // drift away from the player so the body stays extended
      b.u -= Math.sign(n[0].u || 1) * 4.5 * dt; // …and sweep to the side opposite the head → S-shaped silhouette
      let ds = b.s - a.s, du = b.u - a.u, dv = b.v - a.v;
      const len = Math.sqrt(ds * ds + du * du + dv * dv) || 1;
      const k = this.spacing[i - 1] / len;
      b.s = a.s + ds * k; b.u = a.u + du * k; b.v = a.v + dv * k;
    }
  }

  place(dt) {
    const d = G.rail.d;
    const n = this.nodes;
    const T = this.t;
    const dying = this.phase === 'dying';
    // head
    railToWorld(d + n[0].s, n[0].u, n[0].v, this.headPos);
    for (let i = 1; i <= N; i++) {
      const w = Math.min(1, i / 4);
      const ph = i * 0.55 - T * 2.4;
      const s = this.segs[i - 1];
      railToWorld(d + n[i].s, n[i].u + Math.sin(ph) * 7 * w, n[i].v + Math.sin(ph * 0.8 + 1) * 3.5 * w, s.pos);
    }
    // segment orientation: -Z toward the previous node
    for (let i = 0; i < N; i++) {
      const s = this.segs[i];
      const prev = i === 0 ? this.headPos : this.segs[i - 1].pos;
      _m.lookAt(s.pos, prev, _up);
      s.mesh.quaternion.setFromRotationMatrix(_m);
      s.mesh.position.copy(s.pos);
      if (s.turret) {
        const tr = s.turret;
        tr.pos.set(0, this.M.turY, 0).multiplyScalar(s.scale).applyQuaternion(s.mesh.quaternion).add(s.pos);
        tr.mesh.position.copy(tr.pos);
        tr.mesh.scale.setScalar(s.scale * 1.25);
        tr.mesh.lookAt(G.player.pos);
        tr.flash = Math.max(0, (tr.flash || 0) - dt * 6);
      }
      // water crossing splashes
      if ((s.prevY < 0) !== (s.pos.y < 0)) splash(_v.copy(s.pos).setY(0), 1.6 * s.scale);
      s.prevY = s.pos.y;
      // a wound where a shadow growth was torn out bleeds shadow
      if (!dying && s.burn > 0 && s.pos.y > 0 && Math.random() < dt * 22) {
        _v.set(0, this.M.turY * 0.8, 0).multiplyScalar(s.scale).applyQuaternion(s.mesh.quaternion).add(s.pos);
        FX.smoke.spawn(_v.x + rand(-1.5, 1.5), _v.y, _v.z + rand(-1.5, 1.5), rand(-1, 1), rand(4, 8), rand(1, 4), 1.6, 2, 7, [0.04, 0.02, 0.06, 0.75], [0.09, 0.05, 0.13, 0], 1, { fadeIn: 0.06 });
        FX.add.spawn(_v.x, _v.y, _v.z, rand(-3, 3), rand(5, 12), rand(-3, 3), 0.7, 0.5, 0.1, [2, 0.7, 3.6, 1], [0.6, 0.15, 1.2, 0], 0, { drag: 1 });
      }
    }
    // head orientation: along the neck, blended toward facing the player
    _m.lookAt(this.headPos, _v.copy(this.headPos).add(_v2.subVectors(this.headPos, this.segs[0].pos)), _up);
    _qa.setFromRotationMatrix(_m);
    _m.lookAt(this.headPos, G.player.pos, _up);
    _qb.setFromRotationMatrix(_m);
    this.headQuat.copy(_qa).slerp(_qb, this.face);
    this.head.position.copy(this.headPos);
    this.head.quaternion.copy(this.headQuat);
    if ((this.headPrevY < 0) !== (this.headPos.y < 0)) { splash(_v.copy(this.headPos).setY(0), 3.2); AudioSys.sfx('splash', { vol: 0.8 }); addShake(0.3); }
    this.headPrevY = this.headPos.y;
    // jaw & core
    this.jawPivot.rotation.x = -this.jawOpen * 0.62;
    const pk = dying ? clamp((this.purT - 0.4) / 1.0, 0, 1) : 0;    // shadow heart → pearl
    if (dying) {
      const e = easeInOutCubic(clamp((this.purT - 2.0) / 1.2, 0, 1)); // the pearl floats out before the snout
      this.core.position.set(lerp(this.M.core[0], this.M.pearlTo[0], e), lerp(this.M.core[1], this.M.pearlTo[1], e) + Math.sin(this.purT * 3) * 0.5 * e, lerp(this.M.core[2], this.M.pearlTo[2], e));
      this.core.scale.setScalar(1 + 0.25 * e);
    }
    this.head.updateMatrixWorld(true);
    this.core.getWorldPosition(this.coreT.pos);
    this.mouthPos.fromArray(this.M.mouth).applyMatrix4(this.head.matrixWorld);
    if (this.shead) this.mouth2Pos.set(0, -0.8, -11).applyMatrix4(this.shead.matrixWorld);
    this.headT.pos.copy(this.headPos);
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 10);
    const open = this.jawOpen;
    this.coreMat.color.setRGB(2.2 + 3 * open * pulse + this.flash * 6, 0.35 + 0.8 * open + this.flash * 5, 3 + 3.5 * open * pulse + this.flash * 5).lerp(PEARL, pk);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.userData.flash.value = this.flash * 0.6;
    this.mat.userData.head.value.copy(this.headPos); this.smat.userData.head.value.copy(this.headPos);
    this.mat.userData.time.value = this.smat.userData.time.value = this.t;
    // hittability: parts underwater can't be hit; the freed creature can't be hit at all
    this.coreT.hittable = this.phase !== 'intro' && !dying && this.headPos.y > -2;
    this.coreT.lockable = open > 0.55;
    this.headT.hittable = !dying && this.headPos.y > -2 && open < 0.55;
    for (let i = 0; i < N; i++) {
      const s = this.segs[i];
      this.segT[i].hittable = !dying && !s.dead && s.pos.y > -3;
      if (s.turret) s.turret.target.hittable = s.turret.alive && s.pos.y > -1 && this.phase !== 'intro';
    }
    if (dying) {
      if (pk > 0 && this.core.visible) glow(this.coreT.pos, 6 + 6 * pk, 2.4 * pk + 1, 2.0 * pk + 0.4, 1.2 * pk + 1, 0.9);
    } else if (open > 0.3) glow(this.coreT.pos, 7 * open * pulse, 2.6 * open, 0.5 * open, 3.2 * open, 0.9);
    // eyes glow: red-violet while possessed, the creature's own colour once freed
    const te = this.M.trueEye;
    this.eyeCol.setRGB(lerp(4, te[0], this.purK), lerp(0.5, te[1], this.purK), lerp(2.2, te[2], this.purK));
    const eyeA = dying ? clamp((5.4 - this.purT) / 0.8, 0, 1) : 1;
    for (const e of this.M.eyes) for (const sx of [-1, 1]) {
      _v.set(sx * e[0], e[1], e[2]).applyMatrix4(this.head.matrixWorld);
      glow(_v, 3.4 * this.sizeK, this.eyeCol.r, this.eyeCol.g, this.eyeCol.b, 0.8 * eyeA);
    }
    if (this.shead && this.purK < 0.5) for (const sx of [-1, 1]) {
      _v.set(sx * 3.3, 1.9, -2.9).applyMatrix4(this.shead.matrixWorld);
      glow(_v, 4.2, 4.5, 0.4, 2.4, 0.85 * (1 - this.purK * 2));
    }
    if (dying) this.purifyFx(dt); else this.shadowWisps(dt);
  }

  // trailing shadow wisps and violet motes while possessed
  shadowWisps(dt) {
    let n = (this.final ? 44 : 26) * (this.enraged ? 1.5 : 1) * dt;
    for (; n > 0; n--) {
      if (Math.random() > n) continue;
      const i = (Math.random() * (N + 2)) | 0;
      const head = i >= N;
      const p = head ? this.headPos : this.segs[i].pos, sc = head ? 1.6 * this.sizeK : this.segs[i].scale;
      if (p.y < 1) continue;
      const x = p.x + rand(-4, 4) * sc, y = p.y + rand(-1, 4) * sc, z = p.z + rand(-4, 4) * sc;
      FX.smoke.spawn(x, y, z, rand(-2, 2), rand(2, 6), rand(-2, 2), rand(1.2, 2), 2.5 * sc, 8 * sc, [0.035, 0.02, 0.06, 0.5], [0.08, 0.04, 0.12, 0], 1, { fadeIn: 0.2, drag: 0.6, rotV: rand(-1, 1) });
      FX.add.spawn(x, y, z, rand(-2, 2), rand(3, 8), rand(-2, 2), rand(0.7, 1.2), rand(0.4, 0.8), 0.1, [1.5, 0.5, 2.8, 1], [0.5, 0.1, 1, 0], 0, { drag: 0.8 });
    }
  }

  // the shadow tearing off at the purification frontier, then golden light
  purifyFx(dt) {
    const F = this.mat.userData.purify.value, rt = this.purT, band = 18 * this.sizeK;
    const emitAt = (p, sc, k) => {
      for (let j = 0; j < k; j++) {
        const x = p.x + rand(-5, 5) * sc, y = p.y + rand(-2, 5) * sc, z = p.z + rand(-5, 5) * sc;
        FX.smoke.spawn(x, y, z, rand(-3, 3), rand(9, 20), rand(-3, 3), rand(1.2, 2.2), 3 * sc, 13 * sc, [0.03, 0.015, 0.05, 0.75], [0.09, 0.05, 0.14, 0], 1, { fadeIn: 0.05, drag: 0.9, rotV: rand(-1.5, 1.5) });
        FX.add.spawn(x, y, z, rand(-4, 4), rand(14, 30), rand(-4, 4), rand(0.5, 1), rand(0.4, 0.7), 0.1, [2.4, 0.8, 4.2, 1], [0.8, 0.2, 1.6, 0], 0, { stretch: 0.03, drag: 1.2 });
      }
    };
    if (rt > 0.3 && rt < 2.6) {
      if (F < 45 * this.sizeK) emitAt(this.headPos, 1.6 * this.sizeK, this.shead ? 4 : 2);
      for (const s of this.segs) {
        const dh = s.pos.distanceTo(this.headPos);
        if (Math.abs(dh - F) < band) emitAt(s.pos, s.scale, this.M.coil ? 2 : 1);
      }
    }
    // golden light shed by the freed creature, swelling as it dissolves
    const rate = rt < 2.35 ? 0 : (this.vanishing ? 320 : 60) * dt;
    for (let n = rate; n > 0; n--) {
      if (Math.random() > n) continue;
      const i = (Math.random() * (N + 2)) | 0, head = i >= N;
      const p = head ? this.headPos : this.segs[i].pos, sc = head ? 1.6 * this.sizeK : this.segs[i].scale;
      FX.add.spawn(p.x + rand(-4, 4) * sc, p.y + rand(-4, 4) * sc, p.z + rand(-4, 4) * sc, rand(-3, 3), rand(2, 9), rand(-3, 3), rand(1, 2.2), rand(0.7, 1.5) * (this.vanishing ? 1.3 : 1), 0.1,
        [3.0, 2.2, 0.9, 1], [1.4, 0.7, 0.15, 0], 0, { drag: 0.6 });
    }
    if (rt > 2.35 && rt < 5.8) glow(this.headPos, 26 * this.sizeK, this.M.gold[0] * 0.5, this.M.gold[1] * 0.4, this.M.gold[2] * 0.3, 0.5 * clamp((5.8 - rt) / 1.2, 0, 1));
  }

  collide(dt) {
    const P = G.player;
    if (!P.alive || this.phase === 'intro' || this.phase === 'dying') return;
    const hitR = (p, r) => p.distanceToSquared(P.pos) < (r + 2.4) * (r + 2.4);
    let hit = hitR(this.headPos, 11);
    for (let i = 0; i < N && !hit; i++) if (!this.segs[i].dead && hitR(this.segs[i].pos, 5 * this.segs[i].scale)) hit = true;
    if (hit && P.damage(16)) { P.vu = (P.u > 0 ? 1 : -1) * 30; P.vv = 20; }
  }

  turretFire(dt) {
    for (const s of this.segs) {
      const tr = s.turret;
      if (!tr || !tr.alive || s.pos.y < 0) continue;
      tr.fireT -= dt;
      if (tr.fireT <= 0) {
        tr.fireT = rand(1.7, 2.9) / diff().fire;
        const dist = tr.pos.distanceTo(G.player.pos);
        if (dist > 40 && dist < 600) {
          enemyShot(tr.pos, aimAtPlayer(tr.pos, 150, 0.03), 'orb');
          AudioSys.sfx('enemyShot', { vol: 0.5, pitch: 0.8 });
        }
      }
    }
  }

  tailMissiles(dt, every) {
    this.missileT -= dt;
    if (this.missileT > 0) return;
    this.missileT = every / diff().fire;
    const tail = this.segs[N - 1];
    if (tail.pos.y < 2) return;
    for (let i = 0; i < 2; i++) {
      const v = aimAtPlayer(tail.pos, 70, 0).add(_v.set(rand(-30, 30), 55, rand(-10, 10)));
      enemyShot(tail.pos, v, 'missile', { turn: 1.5, life: 6 });
    }
    AudioSys.sfx('missile');
  }

  ringBursts(dt) {
    this.burstT -= dt;
    if (this.burstT > 0) return;
    this.burstT = rand(2.2, 3.2) / diff().fire;
    const s = this.segs[(Math.random() * 10 + 1) | 0];
    if (s.pos.y < 2 || s.dead) return;
    const base = aimAtPlayer(s.pos, 120, 0);
    const axis = base.clone().normalize();
    const perp = new THREE.Vector3().crossVectors(axis, _up).normalize();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      const off = perp.clone().applyAxisAngle(axis, a).multiplyScalar(26);
      enemyShot(s.pos, base.clone().add(off), 'orb');
    }
    AudioSys.sfx('enemyShot', { pitch: 0.7 });
  }

  mouthSpread() {
    const base = aimAtPlayer(this.mouthPos, 150, 0);
    for (const a of [-0.2, -0.1, 0, 0.1, 0.2]) enemyShot(this.mouthPos, base.clone().applyAxisAngle(_up, a), 'big');
    AudioSys.sfx('enemyShot', { pitch: 0.6 });
  }

  get doubleBeam() { return this.final && this.enraged; }

  chargeFx(dt) {
    const k = 1 - Math.max(0, this.subT) / 1.8;
    const mouths = this.doubleBeam && this.shead ? [this.mouthPos, this.mouth2Pos] : [this.mouthPos];
    for (const mp of mouths) {
      glow(mp, 6 + k * 16, 2.6, 0.6, 4.2, 1);
      glow(mp, 3 + k * 6, 5, 4, 6, 1, 2, this.t * 3);
      if (Math.random() < 0.8) {
        const a = Math.random() * TAU, b = Math.random() * TAU, r = 18;
        _v.set(Math.cos(a) * Math.cos(b) * r, Math.sin(b) * r, Math.sin(a) * Math.cos(b) * r).add(mp);
        FX.add.spawn(_v.x, _v.y, _v.z, (mp.x - _v.x) * 3, (mp.y - _v.y) * 3, (mp.z - _v.z) * 3, 0.33, 0.6, 0.2, [3, 1, 5, 1], [4, 3, 5, 0], 0, { stretch: 0.04 });
      }
    }
    POST.ca = Math.max(POST.ca, 0.004 * k);
  }

  // one sweeping beam from `from`; dir +1 sweeps left→right. Returns true if it touched the player.
  sweepBeam(from, sweep, k) {
    const P = G.player;
    const u = P.u * 0.3 + lerp(-58, 58, sweep > 0 ? k : 1 - k);
    const v = clamp(P.v * 0.8 + 6, 6, 50);
    railToWorld(G.rail.d - 10, u, v, _v);
    const dir = _v2.subVectors(_v, from).normalize();
    const end = _v3.copy(from).addScaledVector(dir, 700);
    const w = 1 + Math.sin(this.t * 60) * 0.08;
    FX.beams.add(from, end, 5.5 * w, 1.9, 0.4, 3.1);
    FX.beams.add(from, end, 1.6 * w, 3, 2.5, 3.8);
    glow(from, 16, 2.6, 0.8, 4, 1);
    // water impact
    if (dir.y < -0.02) {
      const tHit = -from.y / dir.y;
      if (tHit > 0 && tHit < 700) {
        _v.copy(from).addScaledVector(dir, tHit);
        if (Math.random() < 0.7) splash(_v, 0.9);
        glow(_v.setY(1), 14, 2, 0.6, 3, 0.8);
      }
    }
    const seg = _v.copy(P.pos).sub(from);
    const along = seg.dot(dir);
    const perpD = Math.sqrt(Math.max(0, seg.lengthSq() - along * along));
    return along > 0 && perpD < 5.2;
  }

  beamFx(dt) {
    const P = G.player;
    this.beamT += dt;
    const dur = this.enraged ? 2.0 : 2.5;
    const k = clamp(this.beamT / dur, 0, 1);
    let hit = this.sweepBeam(this.mouthPos, this.beamDir, k);
    // final form: the shadow dragon's own maw sweeps a second beam the opposite way
    if (this.doubleBeam && this.shead) hit = this.sweepBeam(this.mouth2Pos, -this.beamDir, k) || hit;
    this.beamTick -= dt;
    if (hit && P.alive && this.beamTick <= 0) {
      this.beamTick = 0.2;
      P.damage(11);
    }
    addShake(0.02);
  }
}
