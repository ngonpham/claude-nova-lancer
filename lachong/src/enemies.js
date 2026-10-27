// Enemies: THỜI ẢNH's shadow beasts (ảnh thú) — procedural models, rail-space movement patterns,
// firing behaviours and the enemy manager. Every beast is ink-black shadow laced with glowing violet
// seams; wings, tails and wisps are animated in the vertex shader (one draw call per beast).
import * as THREE from 'three';
import { G, rand, clamp, lerp, damp, TAU, emit, diff, easeOutCubic, easeInOutCubic, after } from './core.js';
import { railFrame, railToWorld, groundHeight, mergeGeometries } from './world.js';
import { FX, glow, sparks, addShake, splash } from './fx.js';
import { patchFog, flashLight } from './gfx.js';
import { TARGETS, enemyShot, aimAtPlayer } from './weapons.js';
import { AudioSys } from './audio.js';
import { loft, slab, fin, mirrorX } from './ship.js';

// ============================================================ Model helpers
export function paint(g0, hex, em = 0) {
  const g = g0.index ? g0.toNonIndexed() : g0.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g.computeVertexNormals();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const ca = new Float32Array(n * 3), ea = new Float32Array(n);
  for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; ea[i] = em; }
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(ea, 1));
  return g;
}
export const diamond = (w, h, y = 0) => [[w, y], [0, y + h], [-w, y], [0, y - h]];
const hexSect = (w, h, y = 0) => [[w, y], [w * 0.5, y + h], [-w * 0.5, y + h], [-w, y], [-w * 0.5, y - h], [w * 0.5, y - h]];

// Beast paint: paint() plus an aAnim attribute (x = wing-flap weight, y = tail/wisp sway weight).
function bp(g, hex, em = 0, anim = null) {
  const out = paint(g, hex, em);
  const p = out.attributes.position, n = p.count;
  const a = new Float32Array(n * 2);
  if (anim) for (let i = 0; i < n; i++) { const r = anim(p.getX(i), p.getY(i), p.getZ(i)); a[i * 2] = r[0]; a[i * 2 + 1] = r[1]; }
  out.setAttribute('aAnim', new THREE.BufferAttribute(a, 2));
  return out;
}
const bsym = (g, hex, em = 0, anim = null) => [bp(g, hex, em, anim), bp(mirrorX(g), hex, em, anim)];
const flapW = (root, span) => (x) => [clamp((Math.abs(x) - root) / span, 0, 1), 0];
const swayZ = (z0, len, k = 1) => (x, y, z) => [0, clamp((z - z0) / len, 0, 1) * k];
const swayY = (y0, len, k = 1) => (x, y) => [0, clamp((y0 - y) / len, 0, 1) * k];
const ell = (rx, ry, rz, x, y, z, ws = 8, hs = 6) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz).translate(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _qq = new THREE.Quaternion();
// Cone from base point a to apex b
function spike(a, b, r, seg = 5) {
  _a.set(...a); _b.set(...b);
  const d = _b.clone().sub(_a), len = d.length();
  const g = new THREE.ConeGeometry(r, len, seg).translate(0, len / 2, 0);
  g.applyQuaternion(_qq.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(_a.x, _a.y, _a.z);
}
// Thin glowing seam/bone between two points
function bone(a, b, w = 0.08) {
  _a.set(...a); _b.set(...b);
  const d = _b.clone().sub(_a), len = d.length();
  const g = new THREE.BoxGeometry(w, w, len);
  g.applyQuaternion(_qq.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  return g.translate((_a.x + _b.x) / 2, (_a.y + _b.y) / 2, (_a.z + _b.z) / 2);
}
// Wing polygon in slab space ([x, forward]) → bone endpoints in model space
const wp = (p, y = 0) => [p[0], y, -p[1]];

// Palette
const INK = '#110d17', INK2 = '#1b1324', MEMB = '#221730', VIO = '#b46bff', VIO2 = '#7c3fd6', EYE = '#ff2e8a', WISP = '#6a32b8';
const STONE = '#a29ca8', STONE2 = '#7c7684';

// Trailing shadow wisp (cone pointing back along +Z), swaying more toward its tip
function wisp(x, y, z, len, r, k = 1, dy = 0) {
  return bp(spike([x, y, z], [x * 1.25, y + dy, z + len], r, 4), WISP, 0.35, swayZ(z, len, k));
}

// ---- quạ bóng (dart): shadow crow with ragged, fingered wings
function modelCrow() {
  const wing = slab([[0.35, 0.75], [1.6, 0.85], [3.0, 0.3], [3.9, -0.35], [3.35, -0.75], [3.5, -1.15], [2.9, -1.0], [2.85, -1.6], [2.3, -1.2], [2.05, -1.8], [1.55, -1.3], [1.1, -1.75], [0.7, -1.2], [0.35, -1.1]], 0.1).translate(0, 0.12, 0);
  const tail = slab([[0.22, -1.2], [1.0, -3.05], [0.55, -2.85], [0.3, -3.3], [0, -2.95], [-0.3, -3.3], [-0.55, -2.85], [-1.0, -3.05], [-0.22, -1.2]], 0.09).translate(0, 0.05, 0);
  const F = flapW(0.3, 3.6);
  return mergeGeometries([
    bp(ell(0.55, 0.5, 1.45, 0, 0, 0.15), INK),
    bp(ell(0.46, 0.44, 0.55, 0, 0.2, -1.5), INK),
    bp(spike([0, 0.14, -1.9], [0, 0.02, -3.05], 0.2, 4), INK2),
    bp(spike([0, 0.36, -1.15], [0, 0.66, 0.2], 0.14, 3), INK2), // ruffled crest
    ...[-1, 1].map(s => bp(ell(0.12, 0.09, 0.1, s * 0.31, 0.32, -1.82), EYE, 1)),
    ...bsym(wing, MEMB, 0, F),
    ...bsym(bone(wp([0.35, 0.75], 0.2), wp([3.0, 0.3], 0.2), 0.09), VIO, 1, F),
    ...bsym(bone(wp([1.6, 0.85], 0.19), wp([2.85, -1.6], 0.19), 0.06), VIO2, 1, F),
    bp(tail, MEMB),
    wisp(0.3, 0.05, 2.6, 2.6, 0.15, 1.2), wisp(-0.3, 0.05, 2.6, 2.6, 0.15, 1.2), wisp(0, 0.15, 2.8, 3.2, 0.12, 1.4, 0.3),
  ]);
}

// ---- dơi bóng (interceptor): shadow bat with membrane wings on glowing finger bones
function modelBat() {
  const W = [[0.3, 0.45], [1.55, 1.05], [3.3, -0.1], [2.85, -0.6], [2.55, -1.85], [2.05, -1.15], [1.45, -2.25], [1.05, -1.35], [0.3, -1.05]];
  const wing = slab(W, 0.06).translate(0, 0.1, 0);
  const F = flapW(0.25, 3.1);
  const wrist = wp(W[1], 0.15);
  return mergeGeometries([
    bp(ell(0.48, 0.44, 1.05, 0, 0, 0.15), INK),
    bp(ell(0.42, 0.4, 0.44, 0, 0.14, -1.0), INK),
    bp(spike([0, 0.06, -1.3], [0, -0.04, -1.85], 0.18, 4), INK2),
    ...[-1, 1].map(s => bp(spike([s * 0.24, 0.42, -1.0], [s * 0.55, 1.35, -0.85], 0.18, 4), INK2)),
    ...[-1, 1].map(s => bp(ell(0.11, 0.08, 0.08, s * 0.19, 0.26, -1.36), EYE, 1)),
    ...[-1, 1].map(s => bp(spike([s * 0.1, -0.12, -1.45], [s * 0.1, -0.42, -1.5], 0.04, 3), '#e9d6ff', 0.6)),
    ...bsym(wing, MEMB, 0, F),
    ...bsym(bone(wp(W[0], 0.15), wrist, 0.1), VIO, 1, F),
    ...[W[2], W[4], W[6]].flatMap(t => bsym(bone(wrist, wp(t, 0.15), 0.07), VIO, 1, F)),
    ...[-1, 1].map(s => bp(spike([s * 0.2, -0.2, 1.0], [s * 0.35, -0.5, 1.6], 0.09, 3), INK2)),
    wisp(0.2, 0, 1.15, 2.4, 0.13, 1.2), wisp(-0.2, 0, 1.15, 2.4, 0.13, 1.2),
  ]);
}

// ---- đại bàng bóng (raptor): broad-winged shadow eagle with a glowing chest core
function modelEagle() {
  const W = [[0.6, 1.2], [2.5, 1.35], [4.1, 0.55], [4.95, -0.15], [4.45, -0.5], [4.85, -0.95], [4.15, -0.95], [4.35, -1.5], [3.65, -1.35], [3.65, -1.95], [3.0, -1.7], [2.35, -2.05], [1.5, -1.65], [0.6, -1.5]];
  const wing = slab(W, 0.16).translate(0, 0.25, 0);
  const tail = slab([[0.3, -1.6], [1.25, -3.9], [0.6, -3.7], [0.3, -4.05], [0, -3.75], [-0.3, -4.05], [-0.6, -3.7], [-1.25, -3.9], [-0.3, -1.6]], 0.14).translate(0, 0.1, 0);
  const F = flapW(0.5, 4.5);
  const brow = slab([[0.08, 0.15], [0.62, 0.05], [0.55, -0.2], [0.08, -0.05]], 0.12);
  return mergeGeometries([
    bp(ell(0.85, 0.78, 2.0, 0, 0, 0.3), INK),
    bp(ell(0.72, 0.72, 0.9, 0, -0.15, -0.95), INK),
    bp(ell(0.55, 0.55, 0.72, 0, 0.38, -2.0), INK),
    bp(spike([0, 0.38, -2.4], [0, 0.18, -3.3], 0.28, 4), INK2),
    bp(spike([0, 0.15, -3.15], [0, -0.25, -3.25], 0.12, 3), INK2),
    ...[-1, 1].map(s => bp(ell(0.13, 0.11, 0.12, s * 0.36, 0.5, -2.42), EYE, 1)),
    ...bsym(brow.clone().rotateZ(-0.25).translate(0.0, 0.66, -2.42), INK2),
    // chest core + its cracks
    bp(ell(0.44, 0.44, 0.3, 0, -0.3, -1.68, 10, 8), VIO, 1),
    ...[[0.7, 0.35], [-0.7, 0.35], [0.5, -0.6], [-0.5, -0.6], [0, 0.65]].map(([x, y]) => bp(bone([0, -0.3, -1.75], [x, -0.3 + y, -1.3 + Math.abs(x) * 0.3], 0.07), VIO, 1)),
    // glowing spine seam (visible from behind while it holds station)
    bp(bone([0, 0.8, -0.8], [0, 0.72, 1.6], 0.12), VIO, 1),
    ...bsym(wing, MEMB, 0, F),
    ...bsym(bone(wp(W[0], 0.36), wp(W[3], 0.36), 0.12), VIO, 1, F),
    ...[W[6], W[9], W[11]].flatMap(t => bsym(bone(wp([2.5, 1.0], 0.35), wp(t, 0.35), 0.07), VIO2, 1, F)),
    bp(tail, MEMB),
    ...[-1, 1].map(s => bp(spike([s * 0.4, -0.6, -0.2], [s * 0.45, -1.4, -0.5], 0.14, 4), INK2)),
    wisp(0.45, 0.1, 3.4, 3.2, 0.18, 1.3), wisp(-0.45, 0.1, 3.4, 3.2, 0.18, 1.3), wisp(0, 0.2, 3.7, 3.8, 0.15, 1.5, 0.4),
  ]);
}

// ---- ma trơi (drone): will-o'-the-wisp — violet flame orb behind a dark mask face
function modelWisp() {
  const mask = ell(0.95, 1.12, 0.5, 0, -0.08, -1.12, 12, 8);
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3, x = Math.cos(a) * 0.75, y = Math.sin(a) * 0.75 + 0.2;
    flames.push(bp(spike([x, y, 0.4], [x * 1.6, y * 1.4 + 1.2, 2.9 + (i % 2) * 0.8], 0.42, 5), '#7a35e0', 0.4, swayZ(0.2, 3, 1.3)));
  }
  return mergeGeometries([
    bp(new THREE.SphereGeometry(1.32, 12, 8), '#7a2cff', 0.5),
    bp(new THREE.SphereGeometry(0.8, 8, 6).translate(0, 0.15, 0.75), '#e6c4ff', 0.8),
    ...flames,
    bp(mask, INK),
    bp(spike([0, 0.85, -1.3], [0, 1.85, -0.9], 0.2, 4), INK), // brow horn
    ...[-1, 1].map(s => bp(ell(0.27, 0.11, 0.1, 0, 0, 0).rotateZ(s * 0.4).translate(s * 0.36, 0.2, -1.58), EYE, 1)),
    bp(ell(0.4, 0.07, 0.1, 0, -0.42, -1.55), EYE, 0.9),
    ...[-0.24, 0, 0.24].map(x => bp(spike([x, -0.37, -1.6], [x, -0.55, -1.56], 0.05, 3), INK)),
  ]);
}

// ---- hạt bóng (mine): spiky shadow seed pod split by pulsing violet seams
function modelPod() {
  const parts = [bp(new THREE.IcosahedronGeometry(1.75, 1), INK2), bp(new THREE.SphereGeometry(1.25, 8, 6), VIO, 1)];
  for (const r of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) parts.push(bp(new THREE.TorusGeometry(1.78, 0.1, 4, 20).rotateX(r[0]).rotateY(r[1]), VIO, 1));
  const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position, seen = new Set();
  for (let i = 0; i < ico.count; i++) {
    const d = new THREE.Vector3(ico.getX(i), ico.getY(i), ico.getZ(i)).normalize();
    const k = d.toArray().map(v => v.toFixed(2)).join(); if (seen.has(k)) continue; seen.add(k);
    parts.push(bp(spike(d.clone().multiplyScalar(1.45).toArray(), d.clone().multiplyScalar(3.25).toArray(), 0.34, 4), INK));
    parts.push(bp(spike(d.clone().multiplyScalar(2.75).toArray(), d.clone().multiplyScalar(3.3).toArray(), 0.09, 3), EYE, 1));
  }
  return mergeGeometries(parts);
}

// ---- đèn ma (carrier): floating ghost-lantern beast; one eye and a torn grin peer out of the paper
function modelLantern() {
  const prof = [[0.01, -1.95], [0.95, -1.82], [1.7, -1.2], [2.05, -0.25], [2.0, 0.6], [1.62, 1.4], [0.95, 1.85], [0.01, 1.92]].map(([r, y]) => new THREE.Vector2(r, y));
  const paperR = (y) => { for (let i = 0; i < prof.length - 1; i++) { const a = prof[i], b = prof[i + 1]; if (y >= a.y && y <= b.y) return lerp(a.x, b.x, (y - a.y) / (b.y - a.y)); } return 0; };
  const parts = [bp(new THREE.LatheGeometry(prof, 12), '#5e2aa8', 0.75)];
  for (const y of [-1.2, -0.45, 0.35, 1.15]) parts.push(bp(new THREE.TorusGeometry(paperR(y) + 0.03, 0.07, 4, 16).rotateX(Math.PI / 2).translate(0, y, 0), INK));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; parts.push(bp(bone([Math.cos(a) * 0.95, -1.82, Math.sin(a) * 0.95], [Math.cos(a) * 2.07, -0.25, Math.sin(a) * 2.07], 0.06), INK)); }
  parts.push(
    bp(new THREE.CylinderGeometry(1.05, 0.95, 0.45, 10).translate(0, 2.05, 0), INK),
    bp(new THREE.CylinderGeometry(0.95, 1.05, 0.4, 10).translate(0, -2.0, 0), INK),
    bp(new THREE.TorusGeometry(0.65, 0.09, 4, 10, Math.PI).translate(0, 2.25, 0), INK2),
    // the shadow creature looking out: one huge eye and a ragged grin torn through the paper
    bp(ell(0.82, 0.6, 0.3, 0, 0.6, -1.85, 10, 8), INK),
    bp(ell(0.42, 0.42, 0.2, 0, 0.6, -2.02, 10, 6), EYE, 1),
    bp(ell(0.12, 0.3, 0.1, 0, 0.6, -2.17), '#1a0610', 0),
    bp(ell(1.25, 0.42, 0.35, 0, -0.55, -1.7, 10, 6), INK),
    ...[-0.85, -0.42, 0, 0.42, 0.85].map((x, i) => bp(spike([x, -0.25 - (i % 2) * 0.1, -2.0 + Math.abs(x) * 0.12], [x * 0.98, -0.62, -2.05 + Math.abs(x) * 0.12], 0.13, 3), '#f2e2ff', 0.7)),
    bp(ell(0.32, 0.12, 0.42, 0, -0.85, -2.0), EYE, 0.8), // tongue
    // tattered tassels and a cord to the carried power-up
    ...[[0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]].map(([x, z]) => bp(spike([x, -2.15, z], [x * 1.3, -4.3, z * 1.3], 0.16, 4), WISP, 0.4, swayY(-2.15, 2.2, 0.9))),
    bp(bone([0, -2.1, 0], [0, -2.75, 0], 0.07), INK2),
  );
  // the creature's claws pressing against the paper from inside
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const y = 0.15 - i * 0.32, a = sx * (1.15 + i * 0.12);
    const r = paperR(y) + 0.02, r2 = paperR(y - 0.55) + 0.02;
    parts.push(bp(spike([Math.sin(a) * r, y, -Math.cos(a) * r], [Math.sin(a + sx * 0.25) * r2, y - 0.55, -Math.cos(a + sx * 0.25) * r2], 0.09, 3), INK));
  }
  return mergeGeometries(parts);
}

// ---- cá đuối bóng (gunship): colossal shadow manta, rippling wings, whip tail, glowing gills
function modelManta() {
  const W = [[2.6, 8.6], [6.0, 5.4], [9.4, 1.8], [11.6, -0.7], [10.3, -1.7], [7.4, -3.2], [4.8, -5.6], [2.6, -7.2]];
  const wing = slab(W, 0.55).translate(0, 0.15, 0);
  const lobe = slab([[0.9, 10.6], [1.6, 13.9], [2.5, 14.1], [2.6, 12.6], [2.3, 10.2]], 0.35).translate(0, -0.35, 0);
  const F = flapW(2.2, 9.6);
  const body = loft([
    { z: -11.5, pts: hexSect(1.6, 0.6) }, { z: -9, pts: hexSect(3.4, 1.5) }, { z: -3, pts: hexSect(4.0, 2.0) }, { z: 3.5, pts: hexSect(3.4, 1.7) }, { z: 8.5, pts: hexSect(1.6, 0.9) }, { z: 10.5, pts: hexSect(0.5, 0.4) },
  ]);
  const parts = [bp(body, INK), ...bsym(wing, MEMB, 0, F), ...bsym(lobe, INK2)];
  // violet veins along the wings (flap with them)
  parts.push(...bsym(bone(wp(W[0], 0.5), wp(W[3], 0.5), 0.22), VIO, 1, F));
  parts.push(...bsym(bone(wp([3.5, 2.5], 0.48), wp(W[3], 0.48), 0.14), VIO2, 1, F));
  parts.push(...bsym(bone(wp([3.0, -2.0], 0.46), wp(W[5], 0.46), 0.14), VIO2, 1, F));
  // eyes, gills on the belly (seen from below as it crosses overhead), spine of thorns
  parts.push(...[-1, 1].map(s => bp(ell(0.5, 0.36, 0.5, s * 2.95, 0.55, -9.0), EYE, 1)));
  parts.push(...[-1, 1].map(s => bp(ell(0.7, 0.18, 0.5, s * 2.95, 1.0, -8.7), INK2)));
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) parts.push(bp(bone([s * 1.4, -1.75, -6.6 + i * 1.05], [s * 2.7, -1.45, -6.9 + i * 1.05], 0.16), VIO, 1));
  parts.push(bp(ell(1.1, 0.4, 1.3, 0, -1.6, 1.5, 10, 6), VIO, 1)); // belly core
  for (let i = 0; i < 6; i++) parts.push(bp(spike([0, 1.65 - i * 0.08, -5.5 + i * 2.3], [0, 2.9 - i * 0.12, -4.4 + i * 2.3], 0.42, 4), INK2));
  parts.push(bp(bone([0, 1.95, -8.5], [0, 1.4, 8.0], 0.2), VIO, 1));
  // whip tail with a barb, and shadow wisps peeling off the wingtips
  parts.push(bp(spike([0, 0, 9.5], [0, 0.2, 26], 0.55, 5), INK, 0, swayZ(9.5, 16.5, 2.4)));
  parts.push(bp(spike([0, 0.4, 11], [0, 1.6, 14], 0.35, 4), VIO2, 1, swayZ(9.5, 16.5, 2.4)));
  for (const s of [-1, 1]) parts.push(bp(spike([s * 10.6, 0.15, -0.6], [s * 12.6, 0.4, 5.5], 0.38, 4), WISP, 0.35, (x, y, z) => [flapW(2.2, 9.6)(x)[0], clamp((z + 0.6) / 6, 0, 1) * 1.5]));
  return mergeGeometries(parts);
}

// ---- tượng cóc đá (turret): corrupted stone toad on a temple plinth — its maw is the gun
function modelPlinth(w = 5.2) {
  return mergeGeometries([
    bp(new THREE.BoxGeometry(w, 1.3, w).translate(0, 0.65, 0), STONE2),
    bp(new THREE.BoxGeometry(w * 0.82, 1.0, w * 0.82).translate(0, 1.8, 0), STONE),
    bp(new THREE.BoxGeometry(w * 0.9, 0.18, w * 0.9).translate(0, 2.35, 0), STONE2),
    ...[0, 1, 2, 3].map(i => bp(new THREE.BoxGeometry(w * 0.84, 0.12, 0.12).translate(0, 1.35, w * 0.42).rotateY(i * Math.PI / 2), VIO, 0.9)),
  ]);
}
function modelToad() {
  return mergeGeometries([
    bp(ell(1.75, 1.1, 1.9, 0, 0.95, 0.25, 10, 7), STONE),
    bp(ell(1.55, 0.82, 1.15, 0, 1.15, -1.25, 10, 6), STONE),
    bp(ell(1.25, 0.24, 0.6, 0, 0.8, -1.95, 10, 6), VIO, 1),           // glowing maw (muzzle)
    bp(ell(0.5, 0.2, 0.32, 0, 0.82, -2.3), '#ffd6f4', 1),                // charge in the throat
    ...[-1, 1].flatMap(s => [
      bp(ell(0.46, 0.44, 0.46, s * 0.85, 1.8, -1.35), STONE),
      bp(ell(0.2, 0.18, 0.14, s * 0.9, 1.88, -1.74), EYE, 1),
      bp(ell(0.42, 0.62, 0.62, s * 1.25, 0.35, -1.25), STONE2),        // fore legs
      bp(ell(0.65, 0.5, 0.95, s * 1.6, 0.45, 0.95), STONE2),            // haunches
    ]),
    ...[[0.7, 1.95, 0.4], [-0.6, 1.95, 0.9], [0.1, 2.05, 0.1], [1.05, 1.55, 1.2], [-1.1, 1.65, -0.1], [0.4, 1.8, 1.4]].map(([x, y, z]) => bp(ell(0.17, 0.12, 0.17, x, y, z), VIO, 0.8)),
  ]);
}

// ---- tượng nghê đá (aagun): stone guardian-dog bust whose head swivels; flak spits from its fanged jaws
function modelNgheBase() {
  return mergeGeometries([
    modelPlinth(4.8),
    bp(new THREE.CylinderGeometry(1.25, 1.5, 0.6, 8).translate(0, 2.65, 0), STONE2),
  ]);
}
function modelNgheHead() {
  const parts = [
    bp(ell(1.4, 1.2, 1.35, 0, 1.25, 0.1, 10, 7), STONE),
    bp(ell(1.15, 0.5, 0.9, 0, 1.6, -1.2), STONE),                      // upper jaw / snout
    bp(ell(1.05, 0.35, 0.8, 0, 0.55, -1.15), STONE),                   // lower jaw
    bp(ell(0.95, 0.32, 0.55, 0, 1.08, -1.6, 10, 6), VIO, 1),           // glowing throat
    ...[-0.75, -0.25, 0.25, 0.75].map(x => bp(spike([x, 1.25, -1.6], [x, 1.12, -2.75], 0.17, 5), STONE2)),
    ...[-0.75, -0.25, 0.25, 0.75].map(x => bp(ell(0.1, 0.1, 0.1, x, 1.12, -2.72), '#ffd6f4', 1)),
    bp(spike([0, 2.2, -0.4], [0, 3.1, 0.6], 0.3, 4), STONE2),           // horn
  ];
  for (const s of [-1, 1]) {
    parts.push(bp(ell(0.22, 0.2, 0.16, s * 0.58, 1.95, -1.3), EYE, 1));
      }
  parts.push(...bsym(slab([[0.1, 0.2], [0.8, 0.05], [0.75, -0.25], [0.1, -0.1]], 0.2).rotateZ(-0.3).translate(0, 2.2, -1.25), STONE2));
  // mane of stone curls framing the face
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * (-0.15 + i / 10 * 1.3);
    parts.push(bp(ell(0.48, 0.48, 0.42, Math.cos(a) * 1.45, 1.25 + Math.sin(a) * 1.3, 0.55), i % 2 ? STONE2 : STONE));
  }
  return mergeGeometries(parts);
}

const GEO = {};
function geo(name) {
  if (!GEO[name]) GEO[name] = ({ dart: modelCrow, interceptor: modelBat, raptor: modelEagle, drone: modelWisp, mine: modelPod, carrier: modelLantern, gunship: modelManta, turretBase: () => modelPlinth(5.2), turretHead: modelToad, aaBase: modelNgheBase, aaHead: modelNgheHead })[name]();
  return GEO[name];
}

// Carried power-up shown dangling under the ghost lantern (same shapes/colours as the item props)
const CARRY = {
  laser: { color: '#46ff7a', glow: [0.5, 3, 1], g: () => new THREE.OctahedronGeometry(0.85) },
  bomb: { color: '#ff5a2a', glow: [3, 1, 0.4], g: () => new THREE.CapsuleGeometry(0.55, 0.9, 3, 8).rotateZ(Math.PI / 2) },
  shield: { color: '#46b8ff', glow: [0.6, 1.6, 3.4], g: () => new THREE.IcosahedronGeometry(0.8, 0) },
};
function carryMesh(kind) {
  const C = CARRY[kind] || CARRY.laser;
  if (!C.mesh) {
    C.mat = new THREE.MeshStandardMaterial({ color: C.color, emissive: C.color, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.2 });
    patchFog(C.mat);
    C.geo = C.g();
  }
  return new THREE.Mesh(C.geo, C.mat);
}

// ============================================================ Shadow-beast material
// Vertex-coloured standard material + emissive mask (aEmit), hit flash, stage tint, violet rim light,
// procedural glowing vein network and vertex-shader wing flap / tail sway (aAnim).
function beastMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.08, ...opts });
  const U = mat.userData;
  U.emit = { value: 3.2 }; U.flash = { value: 0 }; U.tint = { value: new THREE.Color(1, 1, 1) };
  U.phase = { value: 0 }; U.amp = { value: 0 }; U.time = { value: 0 };
  U.rim = { value: new THREE.Color(0.55, 0.22, 1.0) }; U.vein = { value: new THREE.Vector4(0.6, 0.3, 1.0, 1) };
  const extra = (shader) => {
    const u = mat.userData;
    Object.assign(shader.uniforms, { uEmitBoost: u.emit, uFlash: u.flash, uTint: u.tint, uPhase: u.phase, uAmp: u.amp, uTime: u.time, uRim: u.rim, uVein: u.vein });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aEmit; attribute vec2 aAnim; varying float vEmit; varying vec3 vObjP;
uniform float uPhase; uniform float uAmp; uniform float uTime;
float flapAng(vec3 p) { return uAmp * sin(uPhase - aAnim.x * 1.2) * aAnim.x * sign(p.x); }
vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
if (aAnim.x > 0.0) objectNormal.xy = rot2(objectNormal.xy, flapAng(position));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vEmit = aEmit; vObjP = position;
if (aAnim.x > 0.0) transformed.xy = rot2(transformed.xy, flapAng(position));
if (aAnim.y > 0.0) {
  transformed.x += aAnim.y * sin(uTime * 5.0 - position.z * 0.8 - position.y * 0.6) * 0.55;
  transformed.y += aAnim.y * cos(uTime * 3.7 - position.z * 0.6 + position.x * 0.5) * 0.4;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vEmit; varying vec3 vObjP; uniform float uEmitBoost; uniform float uFlash; uniform vec3 uTint;
uniform float uTime; uniform vec3 uRim; uniform vec4 uVein;`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(uTint, vec3(1.0), vEmit);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vColor.rgb * vEmit * uEmitBoost + vec3(uFlash);
{
  float dark = 1.0 - clamp(vEmit, 0.0, 1.0);
  float fr = 1.0 - abs(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance += uRim * (fr * fr) * (fr * fr) * dark;
  vec3 q = vObjP * uVein.w;
  float n = sin(q.x * 2.3 + sin(q.z * 1.7 + q.y * 1.3) * 1.9) + 0.85 * sin(q.z * 2.1 + sin(q.x * 1.5 - q.y * 2.2) * 1.7);
  float fw = fwidth(n) + 1e-4;
  float ln = (1.0 - smoothstep(0.0, 0.08 + fw, abs(n))) * min(1.0, 0.2 / fw);
  float pulse = 0.6 + 0.4 * sin(uTime * 2.6 + q.z * 0.9 + q.x * 0.6);
  totalEmissiveRadiance += uVein.xyz * ln * pulse * dark;
}`);
  };
  patchFog(mat, extra);
  return mat;
}

// Per-role look: wing-beat rate/amplitude, rim and vein strength, eye/core glow points (model space),
// and where the trailing shadow wisps peel off.
const LOOK = {
  dart:        { rate: 9.5, amp: 0.55, rim: 0.7, vein: 1.0, vf: 1.2, eyes: [[0.31, 0.32, -1.9]], eyeSize: 1.1, wisp: [0, 0.1, 3.4], wispT: 0.11 },
  interceptor: { rate: 15, amp: 0.7, rim: 0.7, vein: 1.0, vf: 1.2, eyes: [[0.19, 0.26, -1.42]], eyeSize: 1.0, wisp: [0, 0, 2.6], wispT: 0.11 },
  raptor:      { rate: 4.6, amp: 0.38, rim: 0.7, vein: 1.0, vf: 1.0, eyes: [[0.36, 0.5, -2.5]], eyeSize: 1.2, core: [[0, -0.3, -1.85], 4.2], wisp: [0, 0.1, 4.5], wispT: 0.09 },
  drone:       { rate: 0, amp: 0, rim: 0.6, vein: 0.5, vf: 1.5, core: [[0, 0, -1.4], 7.5], coreA: 0.9, wisp: [0, 1.0, 2.6], wispT: 0.14 },
  mine:        { rate: 0, amp: 0, rim: 0.7, vein: 0.9, vf: 1.4, core: [[0, 0, 0], 4.5] },
  carrier:     { rate: 0, amp: 0, rim: 0.7, vein: 0.6, vf: 1.4, eyes: [[0, 0.6, -2.1]], eyeSize: 2.2, mono: true, wisp: [0, -3.4, 0], wispT: 0.16 },
  gunship:     { rate: 1.8, amp: 0.34, rim: 0.7, vein: 1.1, vf: 0.45, eyes: [[2.95, 0.55, -9.4]], eyeSize: 3.2, core: [[0, -1.9, 1.5], 7], wisp: [0, 0, 14], wispT: 0.05 },
  turret:      { rate: 0, amp: 0, rim: 0.2, vein: 1.1, vf: 0.6, stone: true },
  aagun:       { rate: 0, amp: 0, rim: 0.2, vein: 1.1, vf: 0.6, stone: true },
};

// Death: the shadow tears apart — violet flash, ink billows that cool to black, violet sparks, rising wisps.
const _d = new THREE.Vector3();
function randDir(out) { const u = Math.random() * 2 - 1, a = Math.random() * TAU, s = Math.sqrt(1 - u * u); return out.set(s * Math.cos(a), u, s * Math.sin(a)); }
function shadowBurst(pos, size, vel, stone) {
  const s = size, rs = Math.sqrt(size);
  const vx = vel ? vel.x * 0.3 : 0, vy = vel ? vel.y * 0.3 : 0, vz = vel ? vel.z * 0.3 : 0;
  FX.add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.1 * rs + 0.06, 3 * s, 11 * s, [1.6, 0.8, 3.8, 1], [0.5, 0.15, 1.5, 0], 0);
  const nf = Math.round(7 * s) + 2;
  for (let i = 0; i < nf; i++) {
    randDir(_d);
    const sp = rand(2.5, 10) * rs, o = rand(0, 1.3) * s;
    FX.smoke.spawn(pos.x + _d.x * o, pos.y + _d.y * o, pos.z + _d.z * o, _d.x * sp + vx, _d.y * sp + 2 + vy, _d.z * sp + vz,
      rand(0.8, 1.3) * rs, rand(2.3, 3.6) * s, rand(6.5, 10) * s,
      stone ? [1.2, 0.6, 2.2, 1] : [1.1, 0.3, 3.0, 1], [0.03, 0.02, 0.05, 0], 1, { rotV: rand(-1.5, 1.5), drag: 2.4, cpow: 0.45 });
  }
  const nh = Math.round(2 * s) + 1;
  for (let i = 0; i < nh; i++) {
    randDir(_d);
    FX.add.spawn(pos.x + _d.x * s, pos.y + _d.y * s, pos.z + _d.z * s, _d.x * 4, _d.y * 4 + 2, _d.z * 4, rand(0.25, 0.4) * rs, 2 * s, 5 * s, [1.5, 0.3, 2.6, 0.8], [0.4, 0.05, 0.8, 0], 1, { rotV: rand(-2, 2), drag: 2 });
  }
  const ns = Math.round(13 * s);
  for (let i = 0; i < ns; i++) {
    randDir(_d);
    const sp = rand(25, 70) * rs;
    FX.add.spawn(pos.x, pos.y, pos.z, _d.x * sp, _d.y * sp, _d.z * sp, rand(0.3, 0.8), rand(0.22, 0.4) * rs, 0.08,
      [2.2, 1.2, 6.5, 1], [0.8, 0.2, 2.6, 0], 0, { stretch: 0.05, drag: 1.6, grav: 6 });
  }
  const nsm = Math.round(5 * s);
  for (let i = 0; i < nsm; i++) {
    randDir(_d);
    const sp = rand(2, 6) * rs;
    FX.smoke.spawn(pos.x + _d.x * s, pos.y + _d.y * s, pos.z + _d.z * s, _d.x * sp, _d.y * sp + 4, _d.z * sp,
      rand(1.6, 2.8) * rs, 4 * s, rand(12, 17) * s, stone ? [0.22, 0.2, 0.24, 0.7] : [0.06, 0.04, 0.09, 0.75], stone ? [0.35, 0.33, 0.37, 0] : [0.16, 0.11, 0.22, 0], 1, { fadeIn: 0.3, drag: 1.1, rotV: rand(-0.6, 0.6) });
  }
  FX.add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.35, 1.5 * s, 16 * s, [1.0, 0.5, 1.6, 0.6], [0.35, 0.1, 0.6, 0], 3, { rot: 0 });
  if (stone) for (let i = 0, n = Math.round(5 * s); i < n; i++) {
    randDir(_d);
    FX.debris.spawn(pos, _b.set(_d.x * rand(12, 30) * rs, Math.abs(_d.y) * rand(10, 28) * rs + 6, _d.z * rand(12, 30) * rs), rand(0.4, 0.9) * rs, false);
  }
  flashLight(pos, 0xb46bff, 900 * s, 0.22 + 0.1 * rs);
  const dist = G.camera.position.distanceTo(pos);
  addShake(clamp(0.5 * s / Math.max(1, dist / 30), 0, 0.8));
  if (pos.y < 6) splash(pos, s * 0.8);
}

// ============================================================ Definitions
export const DEFS = {
  dart:        { hp: 1,  r: 4.6, scale: 1.4,  score: 100,  hits: 1, expl: 1.1, fire: { rate: 0.3, kind: 'orb', speed: 170 }, sfx: 'explodeS' },
  interceptor: { hp: 2,  r: 4.6, scale: 1.35, score: 150,  hits: 1, expl: 1.1, fire: { rate: 0.45, kind: 'laser', speed: 240 }, sfx: 'explodeS' },
  raptor:      { hp: 5,  r: 6.4, scale: 1.3,  score: 300,  hits: 1, expl: 1.8, fire: { rate: 0.65, kind: 'spread3', speed: 155 }, sfx: 'explodeM' },
  drone:       { hp: 1,  r: 3.8, scale: 1.4,  score: 50,   hits: 1, expl: 0.8, fire: null, sfx: 'explodeS' },
  mine:        { hp: 2,  r: 3.6, scale: 1.2,  score: 100,  hits: 1, expl: 1.3, fire: null, sfx: 'explodeM', proximity: 11 },
  carrier:     { hp: 4,  r: 4.8, scale: 1.3,  score: 300,  hits: 1, expl: 1.4, fire: null, sfx: 'explodeM' },
  gunship:     { hp: 38, r: 13,  scale: 1.2,  score: 2000, hits: 5, expl: 4.2, fire: { rate: 1.1, kind: 'spread5', speed: 130 }, sfx: 'explodeL' },
  turret:      { hp: 3,  r: 4.2, scale: 1.2,  score: 200,  hits: 1, expl: 1.4, fire: { rate: 0.55, kind: 'burst', speed: 175 }, sfx: 'explodeM', ground: true },
  aagun:       { hp: 4,  r: 4.4, scale: 1.2,  score: 300,  hits: 1, expl: 1.5, fire: { rate: 0.75, kind: 'flak', speed: 170 }, sfx: 'explodeM', ground: true },
};

// ============================================================ Patterns (rail space: s = distance, u = lateral, v = height)
const PAT = {
  // Fly head-on toward the player, weaving
  approach(e, dt) {
    const P = e.P;
    e.s -= (P.speed ?? 40) * dt;
    e.u = (P.u ?? 0) + (P.au ?? 0) * Math.sin(e.t * (P.fu ?? 1.2) + (P.ph ?? 0));
    e.v = (P.v ?? 20) + (P.av ?? 0) * Math.sin(e.t * (P.fv ?? 1.5) + (P.ph ?? 0) * 1.3);
  },
  // Enter from far ahead, hold a distance ahead of the player while drifting, then leave
  hold(e, dt) {
    const P = e.P;
    const dist = P.dist ?? 140, enter = P.enter ?? 2.2, stay = P.stay ?? 7;
    const tgt = G.rail.d + dist;
    if (e.t < enter) e.s = lerp(e.sEnter, tgt, easeOutCubic(e.t / enter));
    else if (e.t < enter + stay) e.s = tgt + Math.sin(e.t * 0.7 + (P.ph ?? 0)) * 12;
    else { e.s += (G.rail.speed + 70) * dt; e.v += 22 * dt; }
    e.u = (P.u ?? 0) + (P.au ?? 18) * Math.sin(e.t * (P.fu ?? 0.8) + (P.ph ?? 0));
    e.v = e.t < enter + stay ? (P.v ?? 22) + (P.av ?? 8) * Math.sin(e.t * (P.fv ?? 1.1) + (P.ph ?? 0) * 2) : e.v;
    if (e.t >= enter + stay + 6) e.remove();
  },
  // Start behind the camera, overtake the player, then turn and hold
  behind(e, dt) {
    const P = e.P;
    const rel = P.rel ?? 70;
    if (e.phase === 0) {
      e.s = G.rail.d - 45 + rel * e.t;
      e.u = lerp(P.u0 ?? 0, P.u ?? 0, clamp(e.t / 2.5, 0, 1));
      e.v = lerp(P.v0 ?? 30, P.v ?? 22, clamp(e.t / 2.5, 0, 1));
      if (e.s > G.rail.d + (P.dist ?? 120)) { e.phase = 1; e.t0 = e.t; }
    } else {
      const k = e.t - e.t0;
      e.s = G.rail.d + (P.dist ?? 120) + Math.sin(k * 0.8) * 10;
      e.u = (P.u ?? 0) + 16 * Math.sin(k * 0.9 + (P.ph ?? 0));
      e.v = (P.v ?? 22) + 6 * Math.sin(k * 1.3 + (P.ph ?? 0));
      if (k > (P.stay ?? 6)) { e.s += 200 * (k - (P.stay ?? 6)); e.v += 30 * dt; }
      if (k > (P.stay ?? 6) + 3) e.remove();
    }
  },
  // Cross the screen laterally at a fixed distance ahead
  cross(e, dt) {
    const P = e.P;
    e.s = G.rail.d + (P.dist ?? 160) - (P.close ?? 0) * e.t;
    e.u = (P.u0 ?? -90) + (P.su ?? 30) * e.t;
    e.v = (P.v ?? 22) + (P.av ?? 6) * Math.sin(e.t * 2 + (P.ph ?? 0));
    if (Math.abs(e.u) > 140 && e.t > 2) e.remove();
  },
  // World-stationary (turrets, mines, props)
  fixed(e, dt) {
    const P = e.P;
    if (P.bob) e.v = P.v + Math.sin(e.t * 1.6 + (P.ph ?? 0)) * P.bob;
  },
  // Dive from high above, sweep down past the player's altitude, then climb away
  dive(e, dt) {
    const P = e.P;
    e.s -= (P.speed ?? 30) * dt;
    const k = e.t / (P.dur ?? 4);
    e.v = lerp(P.v0 ?? 90, P.v ?? 15, Math.sin(Math.min(1, k) * Math.PI * 0.5)) + (k > 1 ? (k - 1) * 60 : 0);
    e.u = (P.u ?? 0) + (P.au ?? 10) * Math.sin(e.t * 1.2 + (P.ph ?? 0));
  },
  // Ring formation spinning around a centre that holds ahead of the player
  circle(e, dt) {
    const P = e.P;
    const dist = P.dist ?? 170, enter = P.enter ?? 2.5, stay = P.stay ?? 8;
    const tgt = G.rail.d + dist;
    const cs = e.t < enter ? lerp(e.sEnter, tgt, easeOutCubic(e.t / enter)) : (e.t < enter + stay ? tgt : tgt + (e.t - enter - stay) * 150);
    const rr = (P.r ?? 16) * (0.6 + 0.4 * Math.min(1, e.t / enter));
    const a = (P.a0 ?? 0) + e.t * (P.spin ?? 1.4);
    e.s = cs;
    e.u = (P.u ?? 0) + Math.cos(a) * rr;
    e.v = (P.v ?? 24) + Math.sin(a) * rr;
    if (e.t > enter + stay + 3) e.remove();
  },
  // Follow a moving anchor (e.g. chasing a wingman)
  chase(e, dt) {
    const P = e.P, A = P.anchor;
    if (!A || A.gone) { e.s += 160 * dt; e.v += 20 * dt; if (e.t > 12) e.remove(); return; }
    e.s = damp(e.s, A.s - (P.back ?? 18), 3, dt);
    e.u = damp(e.u, A.u + (P.ou ?? 0) + Math.sin(e.t * 2 + (P.ph ?? 0)) * 3, 3, dt);
    e.v = damp(e.v, A.v + (P.ov ?? 0) + Math.cos(e.t * 1.7 + (P.ph ?? 0)) * 2, 3, dt);
  },
  // Slow flyby across the path (gunship)
  flyby(e, dt) {
    const P = e.P;
    const enter = P.enter ?? 3;
    const tgt = G.rail.d + (P.dist ?? 220);
    e.s = e.t < enter ? lerp(e.sEnter, tgt, easeOutCubic(e.t / enter)) : tgt - (e.t - enter) * (P.close ?? 4);
    e.u = (P.u0 ?? 60) + (P.su ?? -9) * e.t;
    e.v = (P.v ?? 34) + Math.sin(e.t * 0.6) * 5;
    if (e.t > (P.life ?? 22)) { e.s += 120 * (e.t - (P.life ?? 22)); }
    if (e.t > (P.life ?? 22) + 4) e.remove();
  },
};

// ============================================================ Enemy
const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _w = new THREE.Vector3();

export const enemies = [];
const pools = new Map();

export class Enemy {
  constructor(type) {
    this.type = type;
    this.def = DEFS[type];
    this.look = LOOK[type];
    this.mat = beastMaterial(this.look.stone ? { roughness: 0.92, metalness: 0 } : {});
    const U = this.mat.userData;
    U.amp.value = this.look.amp;
    U.rim.value.setRGB(0.55, 0.22, 1.0).multiplyScalar(this.look.rim);
    U.vein.value.set(0.6 * this.look.vein, 0.3 * this.look.vein, 1.0 * this.look.vein, this.look.vf);
    this.root = new THREE.Group();
    if (type === 'turret' || type === 'aagun') {
      this.base = new THREE.Mesh(geo(type === 'turret' ? 'turretBase' : 'aaBase'), this.mat);
      this.head = new THREE.Mesh(geo(type === 'turret' ? 'turretHead' : 'aaHead'), this.mat);
      this.head.position.y = 2.4;
      this.root.add(this.base, this.head);
      this.base.castShadow = this.head.castShadow = true;
    } else {
      this.mesh = new THREE.Mesh(geo(type), this.mat);
      this.mesh.castShadow = true;
      this.root.add(this.mesh);
    }
    this.root.scale.setScalar(this.def.scale || 1);
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.radius = this.def.r;
  }

  spawn(pattern, P, opts = {}) {
    this.pattern = PAT[pattern];
    this.patternName = pattern;
    this.P = P;
    this.t = 0; this.phase = 0; this.t0 = 0;
    this.hp = Math.ceil(this.def.hp * (opts.hpMul ?? 1) * (this.def.hp > 1 ? (G.stageHp || 1) : 1));
    this.maxHp = this.hp;
    this.alive = true; this.hittable = true; this.lockable = true;
    this.s = P.s ?? (G.rail.d + (P.ahead ?? 600));
    this.sEnter = this.s;
    this.u = P.u ?? P.u0 ?? 0;
    this.v = P.v ?? P.v0 ?? 20;
    this.carry = opts.carry || null;
    this.group = opts.group || null;
    this.fireT = rand(0.6, 1.6) / (this.def.fire ? this.def.fire.rate * diff().fire : 1);
    this.noFire = !!opts.noFire;
    this.bank = 0;
    this.flash = 0;
    this.onDeath = opts.onDeath || null;
    this.credit = opts.credit ?? true;
    if (this.credit && G.run && G.state === 'play') G.run.spawned = (G.run.spawned || 0) + this.def.hits;
    this.mat.userData.flash.value = 0;
    this.mat.userData.emit.value = 3.2;
    this.mat.userData.phase.value = rand(0, TAU);
    this.wispT = rand(0, 0.2);
    if (G.enemyTint) this.mat.userData.tint.value.copy(G.enemyTint);
    if (this.carryMesh) { this.root.remove(this.carryMesh); this.carryMesh = null; }
    if (this.type === 'carrier' && this.carry) { this.carryMesh = carryMesh(this.carry); this.carryMesh.position.set(0, -3.4, 0); this.root.add(this.carryMesh); }
    this.first = true;
    this.pattern(this, 0);
    this.place();
    this.prev.copy(this.pos);
    G.scene.add(this.root);
    TARGETS.add(this);
    enemies.push(this);
    if (this.group) this.group.members++;
    return this;
  }

  place() {
    if (this.def.ground) {
      railToWorld(this.s, this.u, 0, this.pos);
      if (this.P.onGround !== false) this.pos.y = Math.max(groundHeight(this.pos.x, this.pos.z), this.P.minY ?? -99);
      else this.pos.y = this.v;
    } else {
      railToWorld(this.s, this.u, this.v, this.pos);
      const gh = groundHeight(this.pos.x, this.pos.z);
      const minY = Math.max(gh + 4, 3);
      if (this.pos.y < minY) { this.pos.y = minY; this.v = minY; }
    }
  }

  update(dt) {
    this.t += dt;
    this.prev.copy(this.pos);
    this.pattern(this, dt);
    if (!this.alive) return;
    this.place();
    if (dt > 0) this.vel.subVectors(this.pos, this.prev).multiplyScalar(1 / dt);
    this.root.position.copy(this.pos);
    this.orient(dt);
    // hit flash
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.userData.flash.value = this.flash * 2.2;
    if (this.type === 'mine') { this.mat.userData.emit.value = 2 + Math.sin(this.t * 8) * 1.8; this.root.rotation.x += dt * 0.7; this.root.rotation.y += dt * 1.1; }
    this.animate(dt);
    // behaviour
    const P = G.player;
    const toP = _v.subVectors(P.pos, this.pos);
    const dist = toP.length();
    if (this.def.proximity && P.alive && dist < this.def.proximity) { P.damage(12); this.kill('self'); return; }
    // collide with player (chasers overtaking from behind the camera can't be seen, so they don't ram)
    const unseen = this.patternName === 'chase' && this.s < G.rail.d + 10;
    if (P.alive && !this.def.ground && !unseen && dist < this.radius + 2.2 && this.type !== 'gunship') {
      if (P.damage(14)) { this.hit(99, this.pos, 'ram'); return; }
    } else if (P.alive && this.type === 'gunship' && dist < this.radius) { P.damage(18); }
    this.tryFire(dt, dist);
    // despawn when well behind the camera (chasers start back there with the wingman they're tailing)
    if (this.s < G.rail.d - (this.patternName === 'chase' ? 200 : 60) && this.t > 1) this.remove();
    // damaged heavies bleed shadow and violet embers
    if (this.maxHp > 2 && this.hp <= this.maxHp * 0.5 && !this.def.ground) {
      this.smokeT = (this.smokeT || 0) - dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.05;
        const k = this.def.scale || 1;
        FX.smoke.spawn(this.pos.x, this.pos.y, this.pos.z, rand(-1, 1), rand(1, 3), rand(-1, 1), 1.2, 1.2 * k, 4.5 * k, [0.07, 0.05, 0.1, 0.65], [0.2, 0.15, 0.26, 0], 1, { fadeIn: 0.05 });
        if (Math.random() < 0.3) FX.smoke.spawn(this.pos.x, this.pos.y, this.pos.z, 0, 0, 0, 0.3, 1.2 * k, 2.2 * k, [2.2, 0.8, 3.6, 0.9], [0.15, 0.05, 0.2, 0], 1, { cpow: 0.5 });
      }
    }
  }

  // Wing beats, tail sway, glowing eyes/cores and the shadow wisps peeling off the beast.
  animate(dt) {
    const L = this.look, U = this.mat.userData, k = this.def.scale || 1;
    U.time.value = this.t;
    if (L.rate) {
      // beat harder while climbing, glide a little while diving
      const climb = clamp(this.vel.y / 30, -0.6, 0.8);
      U.phase.value += dt * L.rate * (1 + climb * 0.5);
      U.amp.value = L.amp * (1 + climb * 0.35);
    }
    if (this.type === 'carrier') {
      if (this.carryMesh) { this.carryMesh.rotation.y += dt * 2.2; this.carryMesh.position.y = -3.4 + Math.sin(this.t * 3) * 0.15; }
      const c = (CARRY[this.carry] || CARRY.laser).glow;
      glow(this.toWorld(0, -3.4, 0), 6 + Math.sin(this.t * 6) * 1, c[0], c[1], c[2], 0.65);
    }
    const camD = G.camera.position.distanceToSquared(this.pos);
    if (camD > 900 * 900) return;
    if (L.eyes) for (const e of L.eyes) {
      const fl = 0.8 + 0.2 * Math.sin(this.t * 9 + e[0]);
      glow(this.toWorld(e[0], e[1], e[2] - 0.15), L.eyeSize * k * fl, 3.2, 0.5, 1.8, 0.9);
      if (!L.mono) glow(this.toWorld(-e[0], e[1], e[2] - 0.15), L.eyeSize * k * fl, 3.2, 0.5, 1.8, 0.9);
    }
    if (L.core) {
      const c = L.core, pul = this.type === 'mine' ? U.emit.value / 3.2 : 0.85 + 0.15 * Math.sin(this.t * 5);
      glow(this.toWorld(c[0][0], c[0][1], c[0][2]), c[1] * k * pul, 1.4, 0.6, 2.6, L.coreA ?? 0.55);
    }
    if (L.wisp && camD < 450 * 450) {
      this.wispT -= dt;
      if (this.wispT <= 0) {
        this.wispT = L.wispT * rand(0.7, 1.3);
        const w = this.toWorld(L.wisp[0] + rand(-0.4, 0.4), L.wisp[1], L.wisp[2]);
        const big = this.type === 'gunship' ? 2.4 : 1;
        FX.smoke.spawn(w.x, w.y, w.z, rand(-1, 1), rand(0.5, 2.5), rand(-1, 1), rand(0.6, 0.9) * (big > 1 ? 1.2 : 1), 0.6 * k * big, 2.6 * k * big, [0.07, 0.035, 0.12, 0.5], [0.22, 0.1, 0.36, 0], 1, { fadeIn: 0.15, drag: 1.2, rotV: rand(-1, 1) });
        if (Math.random() < 0.35) FX.add.spawn(w.x, w.y, w.z, rand(-2, 2), rand(1, 4), rand(-2, 2), rand(0.4, 0.7), 0.35 * k * big, 0.05, [1.6, 0.7, 3.2, 1], [0.6, 0.2, 1.2, 0], 0, { drag: 1 });
      }
    }
  }

  toWorld(x, y, z) {
    const k = this.def.scale || 1;
    return _w.set(x * k, y * k, z * k).applyQuaternion(this.root.quaternion).add(this.root.position);
  }

  orient(dt) {
    if (this.def.ground) {
      // turret heads track the player
      const P = G.player;
      _v.subVectors(P.pos, this.pos);
      const yaw = Math.atan2(-_v.x, -_v.z);
      this.head.rotation.y = yaw;
      this.head.rotation.x = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)) * 0.5, -0.1, 0.7);
      return;
    }
    if (this.type === 'drone' || this.type === 'carrier') {
      // the wisp stares at the player; the lantern turns its eye to the player, bobbing and swaying
      const C = G.camera.position;
      _v2.copy(C); if (this.type === 'carrier') _v2.y = this.pos.y;
      _m.lookAt(this.pos, _v2, _up);
      this.quat.setFromRotationMatrix(_m);
      if (this.type === 'carrier') this.quat.multiply(_q.setFromAxisAngle(_v2.set(0, 0, 1), Math.sin(this.t * 1.7) * 0.12));
      else this.quat.multiply(_q.setFromAxisAngle(_v2.set(0, 0, 1), Math.sin(this.t * 2.3) * 0.2));
      this.root.quaternion.copy(this.quat);
      return;
    }
    const sp = this.vel.length();
    if (sp < 0.5) return;
    _f.copy(this.vel).multiplyScalar(1 / sp);
    // bank from lateral acceleration
    railFrame(this.s, _p, null, _r);
    const lat = (this.vel.x * _r.x + this.vel.z * _r.z);
    this.bank = damp(this.bank, clamp(-lat / 40, -1.1, 1.1) * Math.sign(-_f.z || 1), 4, dt);
    _m.lookAt(_v2.set(0, 0, 0), _f, _up);
    _q.setFromRotationMatrix(_m);
    const target = _q.multiply(new THREE.Quaternion().setFromAxisAngle(_v2.set(0, 0, 1), this.bank));
    // lookAt makes -Z?  Object3D.lookAt semantics: matrix.lookAt(eye, target) makes +Z point from target to eye.
    if (this.first) { this.quat.copy(target); this.first = false; }
    else this.quat.slerp(target, clamp(dt * 8, 0, 1));
    this.root.quaternion.copy(this.quat);
  }

  tryFire(dt, dist) {
    const F = this.def.fire;
    if (!F || this.noFire || !G.player.alive) return;
    if (this.s < G.rail.d + 25 || dist > 650 || dist < 45) return;
    this.fireT -= dt;
    if (this.fireT > 0) return;
    this.fireT = rand(0.7, 1.3) / (F.rate * diff().fire);
    const muzzle = _p.copy(this.pos);
    switch (F.kind) {
      case 'orb': enemyShot(muzzle, aimAtPlayer(muzzle, F.speed, 0.03), 'orb'); break;
      case 'laser': enemyShot(muzzle, aimAtPlayer(muzzle, F.speed, 0.02), 'laser'); break;
      case 'spread3': {
        const base = aimAtPlayer(muzzle, F.speed, 0);
        for (const a of [-0.13, 0, 0.13]) enemyShot(muzzle, base.clone().applyAxisAngle(_up, a), 'orb');
        break;
      }
      case 'spread5': {
        const base = aimAtPlayer(muzzle, F.speed, 0);
        for (const a of [-0.3, -0.15, 0, 0.15, 0.3]) enemyShot(muzzle, base.clone().applyAxisAngle(_up, a), 'orb');
        if (Math.random() < 0.5) enemyShot(muzzle, aimAtPlayer(muzzle, 90, 0).setY(40), 'missile', { turn: 1.4 });
        break;
      }
      case 'burst': {
        const head = _v2.copy(this.pos); head.y += 3.8;
        const hp = head.clone();
        for (let i = 0; i < 3; i++) after(i * 0.12, () => { if (this.alive && G.player.alive) enemyShot(hp, aimAtPlayer(hp, F.speed, 0.025), 'laser'); });
        break;
      }
      case 'flak': {
        const head = _v2.copy(this.pos); head.y += 4.3;
        const P = G.player;
        const fuse = clamp(dist / F.speed, 0.5, 3);
        const lead = _v.copy(P.pos).addScaledVector(P.railFwd, G.rail.speed * fuse).add(_r.set(rand(-9, 9), rand(-5, 7), rand(-9, 9)));
        const vel = lead.sub(head).multiplyScalar(1 / fuse);
        enemyShot(head, vel, 'flak', { fuse });
        break;
      }
    }
    AudioSys.sfx('enemyShot', { vol: 0.55, pan: clamp((this.pos.x - G.camera.position.x) / 60, -1, 1) });
  }

  // Target interface
  hit(dmg, point, source) {
    if (!this.alive) return 'none';
    this.hp -= dmg;
    this.flash = 1;
    if (this.hp <= 0) { this.kill(source); return 'kill'; }
    return 'hit';
  }

  kill(source) {
    if (!this.alive) return;
    this.alive = false;
    shadowBurst(this.pos, this.def.expl, this.vel, !!this.look.stone);
    AudioSys.sfx(this.def.sfx, { pan: clamp((this.pos.x - G.camera.position.x) / 60, -1, 1) });
    const credited = source !== 'self' && source !== 'wingman' && this.credit;
    if (credited) emit('enemyKilled', this, source);
    if (this.carry) emit('dropItem', this.carry, this.pos.clone(), this.s, this.u, this.v);
    if (this.group) { this.group.killed++; if (credited) this.group.byPlayer++; if (this.group.killed >= this.group.members && this.group.onClear) this.group.onClear(this.group); }
    if (this.onDeath) this.onDeath(this, source);
    this.cleanup();
  }

  remove() {
    if (!this.alive && !this.root.parent) return;
    this.alive = false;
    if (this.group) { this.group.gone = (this.group.gone || 0) + 1; }
    this.cleanup();
  }

  cleanup() {
    TARGETS.delete(this);
    G.scene.remove(this.root);
    const i = enemies.indexOf(this);
    if (i >= 0) enemies.splice(i, 1);
    if (!pools.has(this.type)) pools.set(this.type, []);
    pools.get(this.type).push(this);
  }
}

export function spawnEnemy(type, pattern, P, opts) {
  const pool = pools.get(type);
  const e = pool && pool.length ? pool.pop() : new Enemy(type);
  return e.spawn(pattern, P, opts);
}

export function makeGroup(onClear) { return { members: 0, killed: 0, byPlayer: 0, onClear }; }

export function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.alive) e.update(dt);
  }
}

export function clearEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) enemies[i].remove();
  enemies.length = 0;
}

// Pre-build geometry/programs so the first spawn doesn't hitch.
export function warmEnemies() {
  for (const t of Object.keys(DEFS)) {
    const e = new Enemy(t);
    if (!pools.has(t)) pools.set(t, []);
    pools.get(t).push(e);
    e.root.position.set(0, -500, 0);
    G.scene.add(e.root);
  }
  // compile the carried power-up's material too (spawn() swaps it for the real cargo)
  const c = pools.get('carrier')[0];
  c.carryMesh = carryMesh('laser');
  c.root.add(c.carryMesh);
}
export function unwarmEnemies() {
  for (const [, list] of pools) for (const e of list) G.scene.remove(e.root);
}

// ============================================================ Formation helpers for the level script
export function wave(type, pattern, n, fn, opts = {}) {
  const group = makeGroup(opts.onClear);
  const list = [];
  for (let i = 0; i < n; i++) {
    const P = fn(i, n);
    list.push(spawnEnemy(type, pattern, P, { ...opts, group, carry: opts.carryIndex === i ? opts.carry : null }));
  }
  group.list = list;
  return group;
}
