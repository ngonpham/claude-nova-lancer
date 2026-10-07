// Landmarks of the ten capitals, built procedurally from primitives (no assets).
// Each builder returns { parts, colliders, gates, subs, fogScale } in landmark-local space:
//   x = lateral offset (rail u), y = height, z = toward the approaching player (rail s decreases with +z).
//   parts:     [{ geo, mat: 'paint' | 'glass' }] — geometries carry vertex colours (+ aEmit)
//   colliders: [{ t: 'box', x0, x1, y0, y1, z0, z1 } | { t: 'cyl', x, z, r, y0, y1 }]
//   gates:     [{ x0, x1, y0, y1, label, bonus }] — flying through the plane z = 0 inside one scores a bonus
//   subs:      [{ geo, mat, pos: [x,y,z], spin: [ax,ay,az] }] — animated sub-meshes (e.g. a Ferris wheel)
// Landmarks are scenery to protect: they are never destroyed and never targeted.
import * as THREE from 'three';
import { TAU, mulberry32, lerp } from './core.js';
import { mergeColored, terrainHeight, railToWorld } from './world.js';

// ------------------------------------------------------------ primitive helpers
const P = [];   // part accumulator for the builder currently running
const C = (g, col, em = 0) => { P.push([g, col, em]); return g; };
const box = (w, h, d, x, y, z, col, em) => C(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), col, em);
const cyl = (rt, rb, h, seg, x, y, z, col, em) => C(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z), col, em);
const cone = (r, h, seg, x, y, z, col, em) => C(new THREE.ConeGeometry(r, h, seg).translate(x, y + h / 2, z), col, em);
const sph = (r, x, y, z, col, em, sy = 1, ws = 12, hs = 8) => C(new THREE.SphereGeometry(r, ws, hs).scale(1, sy, 1).translate(x, y, z), col, em);
const dome = (r, x, y, z, col, em, sy = 1) => C(new THREE.SphereGeometry(r, 14, 7, 0, TAU, 0, Math.PI / 2).scale(1, sy, 1).translate(x, y, z), col, em);
const torus = (R, r, x, y, z, col, em, rotX = Math.PI / 2) => C(new THREE.TorusGeometry(R, r, 5, 28).rotateX(rotX).translate(x, y, z), col, em);
const lathe = (pts, seg, x, y, z, col, em) => C(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg).translate(x, y, z), col, em);
const _o = new THREE.Object3D();
function beam(a, b, t, col, em = 0, tz = t) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  _o.position.copy(A).add(B).multiplyScalar(0.5);
  _o.lookAt(B);
  _o.updateMatrix();
  return C(new THREE.BoxGeometry(t, tz, len).applyMatrix4(_o.matrix), col, em);
}
function take() { const g = mergeColored(P); P.length = 0; return g; }
const B = (x0, x1, y0, y1, z0, z1) => ({ t: 'box', x0, x1, y0, y1, z0, z1 });
const Cy = (x, z, r, y0, y1) => ({ t: 'cyl', x, z, r, y0, y1 });

// Star/fluted cross-section: modulate the radius of a cylinder's ring vertices.
function fluted(rt, rb, h, seg, depth, x, y, z, col, em) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), pz = p.getZ(i);
    const a = Math.atan2(pz, px);
    const k = 1 - depth * (0.5 + 0.5 * Math.cos(a * seg / 2));
    if (Math.hypot(px, pz) > 0.01) p.setXYZ(i, px * k, p.getY(i), pz * k);
  }
  g.translate(x, y + h / 2, z);
  return C(g, col, em);
}

// ============================================================ HÀ NỘI
function longbien() {
  const steel = '#5b3a2e', dark = '#3a2822', stone = '#8a8070';
  const piers = [-300, -185, -62, 62, 185, 300];
  for (const x of piers) { box(9, 34, 16, x, -14, 0, stone); box(11, 2, 18, x, 18, 0, dark); }
  box(610, 3, 13, 0, 17.5, 0, '#4a4440');
  for (const z of [-3.2, 3.2]) box(610, 0.5, 0.8, 0, 20.6, z, '#2a2624');
  const cols = [];
  for (let i = 0; i < piers.length - 1; i++) {
    const a = piers[i], b = piers[i + 1];
    const n = Math.max(6, Math.round((b - a) / 13));
    const pts = [];
    for (let k = 0; k <= n; k++) { const t = k / n; pts.push([lerp(a, b, t), 21 + 18 * Math.sin(Math.PI * t)]); }
    for (const z of [-6, 6]) {
      for (let k = 0; k < n; k++) {
        beam([pts[k][0], pts[k][1], z], [pts[k + 1][0], pts[k + 1][1], z], 1.3, steel);          // top chord
        beam([pts[k][0], 21, z], [pts[k + 1][0], 21, z], 1.3, steel);                            // bottom chord
        beam([pts[k][0], 21, z], [pts[k][0], pts[k][1], z], 0.8, steel);                         // vertical
        beam([pts[k][0], 21, z], [pts[k + 1][0], pts[k + 1][1], z], 0.6, dark);                  // diagonal
      }
    }
    for (let k = 1; k < n; k += 2) beam([pts[k][0], pts[k][1], -6], [pts[k][0], pts[k][1], 6], 0.7, dark);
    const w = (b - a) / 3;
    for (let j = 0; j < 3; j++) cols.push(B(a + j * w, a + (j + 1) * w, 16.5, 21 + 18 * Math.sin(Math.PI * (j + 0.5) / 3) + 1, -7, 7));
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: cols, gates: [{ x0: -60, x1: 60, y0: 0, y1: 16, label: 'GẦM CẦU LONG BIÊN', bonus: 1500 }] };
}

function thaprua() {
  sph(15, 0, 0, 0, '#5d8a3a', 0, 0.22);
  cyl(10, 12, 1.2, 10, 0, -0.4, 0, '#8a7a5a');
  const wall = '#d9cba6', trim = '#a89870', roofC = '#8a5a3a';
  box(9, 7, 7, 0, 2, 0, wall); box(10, 0.8, 8, 0, 9, 0, trim);
  box(7, 5, 5.6, 0, 9.8, 0, wall); box(8, 0.7, 6.6, 0, 14.8, 0, trim);
  box(5, 4, 4.2, 0, 15.5, 0, wall); box(6, 0.6, 5.2, 0, 19.5, 0, trim);
  cone(3.4, 3, 4, 0, 20.1, 0, roofC);
  for (const y of [3.5, 10.8]) for (const x of [-2.4, 0, 2.4]) box(1.2, 2.6, 0.3, x, y, 3.55, '#3a3028');
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, 6, -2, 24)] };
}

function thehuc() {
  const red = '#c4282a';
  const n = 14;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const y0 = 3 + Math.sin(Math.PI * t0) * 7, y1 = 3 + Math.sin(Math.PI * t1) * 7;
    beam([t0 * 70, y0, 0], [t1 * 70, y1, 0], 1, red, 0, 4);
    beam([t0 * 70, y0 + 1.6, 2], [t1 * 70, y1 + 1.6, 2], 0.3, red);
    beam([t0 * 70, y0 + 1.6, -2], [t1 * 70, y1 + 1.6, -2], 0.3, red);
    if (k % 2 === 0) for (const z of [-2, 2]) beam([t0 * 70, -2, z], [t0 * 70, y0, z], 0.5, red);
  }
  sph(16, 82, 0, 0, '#5d8a3a', 0, 0.22);
  box(14, 6, 10, 84, 1, 0, '#c9b28a');
  C(new THREE.CylinderGeometry(4, 11, 4, 4).rotateY(Math.PI / 4).scale(1.3, 1, 1).translate(84, 9, 0), '#4a5a4a');
  box(10, 2, 7, 6, 0, -4, '#c4282a', 0.3);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

function landmark72() {
  box(70, 24, 50, 0, 0, 0, '#c8ccd2');
  box(26, 230, 32, 0, 0, 0, '#9fb2c6');
  cyl(13, 13, 230, 16, 0, 0, 16, '#9fb2c6'); cyl(13, 13, 230, 16, 0, 0, -16, '#9fb2c6');
  const g1 = take();
  box(30, 8, 50, 0, 230, 0, '#dfe6ee', 0.15); cone(2, 30, 6, 0, 238, 0, '#d0d4da');
  return { parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }], colliders: [B(-35, 35, 0, 270, -32, 32)], fogScale: 0.6 };
}

function lotte() {
  box(60, 30, 50, 0, 0, 0, '#c2b8a8');
  box(30, 170, 30, 0, 30, 0, '#8ea0b4');
  box(36, 18, 36, 0, 200, 0, '#8ea0b4');
  const g1 = take();
  box(38, 2, 38, 0, 218, 0, '#e8eef4', 0.3); cyl(1, 1, 24, 6, 0, 220, 0, '#cfd3d8');
  return { parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }], colliders: [B(-30, 30, 0, 245, -25, 25)], fogScale: 0.65 };
}

function cotco() {
  const s = '#8f7a62', s2 = '#a8927a';
  box(34, 7, 34, 0, 0, 0, s); box(26, 7, 26, 0, 7, 0, s2); box(18, 7, 18, 0, 14, 0, s);
  cyl(4.2, 5, 26, 8, 0, 21, 0, s2);
  for (let k = 0; k < 4; k++) box(1.2, 1.6, 0.4, 0, 26 + k * 5, 4.6, '#2e2620');
  cyl(6, 6, 4, 8, 0, 47, 0, s); cone(6.5, 3, 8, 0, 51, 0, '#7a3a2a');
  cyl(0.4, 0.4, 16, 5, 0, 54, 0, '#d8d4c8');
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-17, 17, 0, 21, -17, 17), Cy(0, 0, 7, 0, 70)] };
}

// ============================================================ BANGKOK
function prangGeo(s, x, z, base) {
  const white = '#ece4d4', tile = '#c9a86a';
  box(30 * s, 8 * s, 30 * s, x, base, z, '#d8cfbc'); box(23 * s, 8 * s, 23 * s, x, base + 8 * s, z, white); box(17 * s, 7 * s, 17 * s, x, base + 16 * s, z, '#d8cfbc');
  const pr = [[9, 0], [8.6, 10], [7.6, 22], [6.6, 32], [5.4, 42], [4.0, 52], [2.6, 60], [1.3, 66], [0.4, 74], [0, 76]].map(([r, h]) => [r * s, h * s]);
  lathe(pr, 8, x, base + 23 * s, z, white);
  for (let k = 0; k < 6; k++) torus((8.4 - k * 1.2) * s, 0.5 * s, x, base + (25 + k * 8) * s, z, k % 2 ? tile : '#5aa0a0');
}
function watarun() {
  prangGeo(1.25, 0, 0, 0);
  for (const [dx, dz] of [[-38, -38], [38, -38], [-38, 38], [38, 38]]) prangGeo(0.48, dx, dz, 0);
  box(110, 3, 110, 0, -2, 0, '#d4cab4');
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, 20, 0, 130)] };
}

function thaiHall(x, z, w, d, tiers, h) {
  box(w + 6, 4, d + 6, x, 0, z, '#f0ebe0');
  box(w, h, d, x, 4, z, '#f4efe6');
  for (let k = 0; k < tiers; k++) {
    const sc = 1 - k * 0.22;
    const roof = new THREE.CylinderGeometry(0.15, 0.62, 0.55, 4, 1).rotateY(Math.PI / 4).scale(w * 1.15 * sc * 1.414, h * 0.9, d * 1.15 * sc * 1.414);
    C(roof.translate(x, 4 + h + k * h * 0.35 + h * 0.25, z), k % 2 ? '#2f7a4a' : '#c45a22');
  }
  cone(1, h * 0.9, 4, x, 4 + h + tiers * h * 0.35, z, '#e8b830', 0.3);
}
function chedi(x, z, s) {
  lathe([[6, 0], [6.2, 3], [5, 6], [5.6, 10], [5.2, 16], [3.2, 22], [1.4, 26], [1.2, 30], [0.5, 40], [0, 44]].map(([r, h]) => [r * s, h * s]), 12, x, 0, z, '#e8b830', 0.25);
}
function grandpalace() {
  box(200, 9, 6, 0, 0, 70, '#f2ede2'); box(200, 9, 6, 0, 0, -70, '#f2ede2');
  thaiHall(-40, 0, 40, 22, 3, 16); thaiHall(30, 30, 26, 18, 2, 12); thaiHall(36, -26, 30, 16, 3, 13);
  chedi(-10, -40, 1.4); chedi(70, 0, 1.1); chedi(-78, 34, 1.0);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

function rama8() {
  const white = '#e8e8e4', pyl = '#d8d2c4';
  box(660, 3, 16, 0, 18, 0, '#9a9890'); box(660, 1.2, 1, 0, 21, 7.5, '#5a5a58'); box(660, 1.2, 1, 0, 21, -7.5, '#5a5a58');
  for (const x of [-260, -150, 230, 300]) box(8, 32, 12, x, -14, 0, '#8a8478');
  const ax = 95;
  beam([ax - 22, -10, 0], [ax, 150, 0], 5, pyl); beam([ax + 22, -10, 0], [ax, 150, 0], 5, pyl);
  box(6, 30, 6, ax, 150, 0, pyl); box(8, 2, 8, ax, 180, 0, '#ff5a3a', 0.8);
  for (let k = 0; k < 16; k++) {
    const t = (k + 1) / 16;
    const y = 150 + 26 * t;
    beam([ax, y, -1.5], [ax - 30 - t * 300, 20, -6.5], 0.35, white);
    beam([ax, y, 1.5], [ax - 30 - t * 300, 20, 6.5], 0.35, white);
    if (k % 2 === 0) { beam([ax, y, -1.5], [ax + 30 + t * 170, 20, -6.5], 0.35, white); beam([ax, y, 1.5], [ax + 30 + t * 170, 20, 6.5], 0.35, white); }
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-330, 330, 16.5, 23, -8.5, 8.5), B(ax - 30, ax + 30, -10, 200, -4, 4)], gates: [{ x0: -60, x1: 60, y0: 0, y1: 16, label: 'GẦM CẦU RAMA VIII', bonus: 1500 }] };
}

function mahanakhon() {
  box(30, 250, 30, 0, 0, 0, '#a8b6c4');
  const g1 = take();
  const r = mulberry32(42);
  for (let k = 0; k < 60; k++) {
    const y = 20 + k * 3.8, a = k * 0.42;
    const side = (k * 7) % 4;
    const off = 14 + r() * 2;
    const s = 3 + r() * 3;
    const x = Math.cos(a) * 6, z = Math.sin(a) * 6;
    const px = side === 0 ? off : side === 1 ? -off : x, pz = side === 2 ? off : side === 3 ? -off : z;
    box(s, 3.6, s, px, y, pz, r() > 0.5 ? '#3a4048' : '#d8dee6', 0.05);
  }
  return { parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }], colliders: [B(-20, 20, 0, 260, -20, 20)], fogScale: 0.6 };
}

// ============================================================ KUALA LUMPUR
function petronasTower(x) {
  const g = '#c3c9d1';
  fluted(11, 11.5, 130, 16, 0.16, x, 0, 0, g);
  fluted(9.6, 10.6, 30, 16, 0.16, x, 130, 0, g);
  fluted(8.2, 9.2, 25, 16, 0.16, x, 160, 0, g);
  fluted(6.6, 7.8, 20, 16, 0.16, x, 185, 0, g);
  fluted(5, 6.2, 13, 16, 0.16, x, 205, 0, g);
}
function petronas() {
  const xs = [-27, 27];
  for (const x of xs) petronasTower(x);
  const g1 = take();
  for (const x of xs) {
    cyl(13, 13, 6, 16, x, 0, 0, '#9aa0a8');
    for (let k = 0; k < 8; k++) torus(10.6 - k * 0.6, 0.35, x, 20 + k * 26, 0, '#e8eef6', 0.15);
    cyl(4.2, 5, 6, 12, x, 218, 0, '#d8dce2'); cyl(2.6, 3.6, 8, 12, x, 224, 0, '#e2e6ea');
    cone(1.5, 48, 8, x, 232, 0, '#eef2f6', 0.2);
    for (const y of [236, 246, 256]) torus(1.4, 0.4, x, y, 0, '#ffffff', 0.4);
    box(2, 2, 2, x, 280, 0, '#ff3a2a', 1);
  }
  box(32, 6, 6, 0, 63.5, 0, '#aab2bc'); box(32, 0.6, 6.4, 0, 69.6, 0, '#e8f0ff', 0.6);
  for (const s of [-1, 1]) { beam([s * 12, 63.5, -2], [s * 17.5, 47, -2], 1.3, '#9aa2ac'); beam([s * 12, 63.5, 2], [s * 17.5, 47, 2], 1.3, '#9aa2ac'); }
  return {
    parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }],
    colliders: [Cy(-27, 0, 12.5, 0, 290), Cy(27, 0, 12.5, 0, 290), B(-16.5, 16.5, 62.5, 71, -4, 4), B(-18, -9.5, 46, 64, -4, 4), B(9.5, 18, 46, 64, -4, 4)],
    gates: [{ x0: -14, x1: 14, y0: 0, y1: 62, label: 'XUYÊN THÁP ĐÔI', bonus: 2000 }, { x0: -14, x1: 14, y0: 71, y1: 99, label: 'TRÊN CẦU NỐI', bonus: 2000 }],
  };
}

function kltower() {
  lathe([[150, 0], [140, 8], [110, 22], [70, 34], [30, 40], [0, 42]], 16, 0, -4, 0, '#3e6a32');
  cyl(4.2, 5.5, 130, 10, 0, 36, 0, '#d8d8d2');
  lathe([[5, 0], [12, 4], [14.5, 10], [14, 18], [10, 23], [6, 26]], 16, 0, 166, 0, '#cfd6de');
  torus(14.6, 0.6, 0, 176, 0, '#ffe2a0', 0.6);
  cyl(1.2, 2.4, 50, 6, 0, 192, 0, '#e8e8e4'); box(2, 2, 2, 0, 242, 0, '#ff3a2a', 1);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [], fogScale: 0.6 };
}

function merdeka() {
  const lv = 9;
  for (let k = 0; k < lv; k++) {
    const t = k / lv;
    const g = new THREE.CylinderGeometry(lerp(26, 9, (k + 1) / lv), lerp(26, 9, t), 34, 4, 1).rotateY(Math.PI / 4 + k * 0.08).translate(0, 17 + k * 34, 0);
    C(g, '#7f9ab4');
  }
  const g1 = take();
  cone(6, 70, 4, 0, lv * 34, 0, '#b8c8d8', 0.1); box(2, 2, 2, 0, lv * 34 + 70, 0, '#ff3a2a', 1);
  return { parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }], colliders: [], fogScale: 0.45 };
}

// ============================================================ SINGAPORE
function mbs() {
  const xs = [-70, 0, 70];
  for (const x of xs) {
    const a = new THREE.BoxGeometry(17, 140, 10).translate(0, 70, 0).rotateX(0.07).translate(x, 0, -8);
    const b = new THREE.BoxGeometry(17, 140, 10).translate(0, 70, 0).rotateX(-0.07).translate(x, 0, 8);
    C(a, '#a9bccc'); C(b, '#a9bccc');
  }
  const g1 = take();
  const deck = new THREE.BoxGeometry(270, 6, 28).translate(15, 143, 0);
  C(deck, '#e8ecef');
  box(40, 3, 30, 160, 140.5, 0, '#e8ecef');
  for (let k = 0; k < 30; k++) box(1, 0.6, 1, -110 + k * 9, 146.5, 13, '#a0f0ff', 1);
  for (const x of xs) cone(4, 4, 6, x, 146, 0, '#2f7a4a');
  return {
    parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }],
    colliders: [...xs.map(x => B(x - 9.5, x + 9.5, 0, 150, -18, 18)), B(-120, 180, 139, 150, -15, 15)],
    gates: [{ x0: -61, x1: -9, y0: 0, y1: 138, label: 'XUYÊN MARINA BAY SANDS', bonus: 1500 }, { x0: 9, x1: 61, y0: 0, y1: 138, label: 'XUYÊN MARINA BAY SANDS', bonus: 1500 }],
  };
}

function supertree(x, z, h) {
  const trunk = '#5a3a5a';
  cyl(1.6, 3, h * 0.74, 7, x, 0, z, trunk);
  const cy0 = h * 0.72;
  cyl(12, 2, h * 0.28, 12, x, cy0, z, '#4a2e52');
  torus(12, 0.6, x, h, z, '#ff4fd8', 0.9);
  torus(7, 0.5, x, h - 4, z, '#a06bff', 0.9);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU;
    beam([x + Math.cos(a) * 2, cy0, z + Math.sin(a) * 2], [x + Math.cos(a) * 12, h, z + Math.sin(a) * 12], 0.6, '#7a4a8a', 0.2);
  }
  for (let k = 0; k < 10; k++) box(0.6, 0.6, 0.6, x + Math.cos(k) * 2.3, h * 0.1 + k * h * 0.06, z + Math.sin(k) * 2.3, '#ff8ae0', 1);
}
function grove(o) {
  const trees = o.trees || [[-30, 0, 70], [0, -40, 55], [28, 30, 62], [52, -20, 80], [-60, 40, 50]];
  for (const [x, z, h] of trees) supertree(x, z, h);
  const cols = [];
  for (const [x, z, h] of trees) { cols.push(Cy(x, z, 3.4, 0, h * 0.74)); cols.push(Cy(x, z, 12, h * 0.72, h + 1)); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: cols };
}

function flyer() {
  box(14, 18, 50, 0, 0, 0, '#d0d6dc');
  for (const s of [-1, 1]) { beam([0, 0, s * 30], [0, 92, s * 4], 3, '#e0e4e8'); }
  const support = take();
  torus(75, 1.4, 0, 0, 0, '#e8eef4', 0.15, 0);
  torus(73, 0.6, 0, 0, 0, '#5ff0ff', 0.9, 0);
  for (let k = 0; k < 28; k++) {
    const a = k / 28 * TAU;
    beam([0, 0, 0], [Math.cos(a) * 74, Math.sin(a) * 74, 0], 0.35, '#c8d0d8');
    box(5, 4, 3, Math.cos(a) * 77, Math.sin(a) * 77 - 2, 0, '#bfefff', 0.5);
  }
  cyl(4, 4, 6, 12, 0, -3, 0, '#c8d0d8');
  const wheel = take();
  return { parts: [{ geo: support, mat: 'paint' }], subs: [{ geo: wheel, mat: 'paint', pos: [0, 96, 0], spin: [0, 0, 0.05] }], colliders: [] };
}

// ============================================================ JAKARTA
function monas() {
  box(48, 5, 48, 0, 0, 0, '#d8d2c2');
  C(new THREE.CylinderGeometry(27, 17, 11, 4, 1).rotateY(Math.PI / 4).translate(0, 10.5, 0), '#ece8dc');
  C(new THREE.CylinderGeometry(3.4, 6.2, 95, 4, 1).rotateY(Math.PI / 4).translate(0, 16 + 47.5, 0), '#f0ece2');
  box(10, 3, 10, 0, 111, 0, '#e2ddd0');
  lathe([[3, 0], [4.6, 2], [3.4, 6], [4.2, 9], [2.4, 13], [1.4, 16], [0, 19]], 10, 0, 114, 0, '#f2c23a', 0.55);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-24, 24, 0, 17, -24, 24), Cy(0, 0, 6, 0, 134)] };
}

function wisma46() {
  box(26, 170, 26, 0, 0, 0, '#7f98b0');
  const g1 = take();
  C(new THREE.CylinderGeometry(0.6, 15, 34, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.5).translate(0, 187, 0), '#c8d4e0');
  cyl(0.6, 0.6, 30, 5, 0, 204, 0, '#e0e4e8'); box(2, 2, 2, 0, 234, 0, '#ff3a2a', 1);
  return { parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }], colliders: [B(-15, 15, 0, 236, -15, 15)], fogScale: 0.6 };
}

// ============================================================ MANILA
function jonesbridge() {
  const stone = '#d8d0c0', dark = '#a89c88';
  box(400, 4, 16, 0, 11.5, 0, stone);
  box(400, 2.4, 0.8, 0, 15.5, 7.6, dark); box(400, 2.4, 0.8, 0, 15.5, -7.6, dark);
  const piers = [-170, -100, -34, 34, 100, 170];
  for (const x of piers) { box(6, 24, 18, x, -12, 0, dark); box(7, 4, 2, x, 15.5, 8.5, stone); box(7, 4, 2, x, 15.5, -8.5, stone); }
  for (let i = 0; i < piers.length - 1; i++) {
    const a = piers[i] + 3, b = piers[i + 1] - 3, cx = (a + b) / 2, r = (b - a) / 2;
    for (const z of [-7.6, 7.6]) C(new THREE.TorusGeometry(r, 1.1, 4, 20, Math.PI).scale(1, 11.5 / r, 1).translate(cx, 0, z), dark);
  }
  for (let x = -190; x <= 190; x += 19) for (const z of [-8, 8]) { cyl(0.3, 0.4, 7, 5, x, 15.5, z, '#2a2a2a'); sph(0.9, x, 23, z, '#fff2c8', 0.9); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-200, 200, 10.5, 18, -9, 9), ...piers.map(x => B(x - 3.5, x + 3.5, -12, 12, -9, 9))], gates: [{ x0: -30, x1: 30, y0: 0, y1: 10, label: 'GẦM CẦU JONES', bonus: 1500 }] };
}

function intramuros() {
  const st = '#8e7f66', st2 = '#a8977a', moss = '#5f7a40';
  box(386, 26, 16, -207, 0, 0, st); box(386, 26, 16, 207, 0, 0, st);
  box(28, 7, 16, 0, 19, 0, st2);
  for (let x = -390; x <= 390; x += 8) if (Math.abs(x) > 16) box(4, 3, 16.4, x, 26, 0, st2);
  for (const x of [-70, 70, -180, 180]) { C(new THREE.CylinderGeometry(18, 20, 30, 5, 1).translate(x, 15, -10), st2); box(30, 1, 30, x, 30, -10, moss); }
  box(36, 32, 6, 0, 0, 8.5, st2); box(16, 4, 6.5, 0, 32, 8.5, '#c9b896');
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [B(-400, -14, 0, 29, -9, 12), B(14, 400, 0, 29, -9, 12), B(-14, 14, 19, 36, -9, 12)],
    gates: [{ x0: -13, x1: 13, y0: 0, y1: 18, label: 'CỔNG INTRAMUROS', bonus: 1500 }],
  };
}

function cargoship() {
  const hull = new THREE.BoxGeometry(26, 14, 150).translate(0, 2, 0);
  C(hull, '#2f4a6a');
  box(26.2, 2, 150.2, 0, -5, 0, '#8a2a2a');
  const r = mulberry32(7);
  for (let k = 0; k < 9; k++) for (let j = 0; j < 3; j++) box(7.6, 5 + (r() * 3 | 0) * 2.6, 13, -8.4 + j * 8.4, 9, -55 + k * 14, ['#c84a32', '#3a7a5a', '#d8a83a', '#3a5aa0', '#e8e4d8'][(r() * 5) | 0]);
  box(22, 18, 14, 0, 9, 62, '#f0ece4'); box(23, 1, 15, 0, 22, 62, '#ffd890', 0.4);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// ============================================================ NEW DELHI
function indiagate() {
  const sand = '#c9a37a', light = '#dcc09a', dark = '#a8805a';
  for (const s of [-1, 1]) {
    box(19, 46, 20, s * 23.5, 0, 0, sand);
    for (let k = 0; k < 5; k++) box(19.4, 0.8, 20.4, s * 23.5, 6 + k * 8, 0, light);
    box(8, 26, 0.6, s * 23.5, 10, 10.1, dark);
  }
  box(66, 20, 20, 0, 46, 0, sand);
  box(68, 2, 22, 0, 46, 0, light); box(70, 2.4, 23, 0, 64, 0, light);
  box(40, 6, 14, 0, 66.4, 0, sand);
  cyl(7, 8, 4, 16, 0, 72.4, 0, light); dome(6, 0, 76, 0, sand, 0, 0.5);
  C(new THREE.TorusGeometry(14, 1.6, 4, 20, Math.PI).translate(0, 32, 10.2), light);
  C(new THREE.TorusGeometry(14, 1.6, 4, 20, Math.PI).translate(0, 32, -10.2), light);
  box(40, 1.2, 0.4, 0, 52, 10.2, '#6a4a2a');
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [B(-34, -13.5, 0, 66, -10.5, 10.5), B(13.5, 34, 0, 66, -10.5, 10.5), B(-34, 34, 44.5, 80, -10.5, 10.5)],
    gates: [{ x0: -13, x1: 13, y0: 0, y1: 44, label: 'XUYÊN CỔNG ẤN ĐỘ', bonus: 2000 }],
  };
}

function qutub() {
  const red = '#a5543a', buff = '#d8c09a';
  const levels = [[8, 6.6, 30], [6.6, 5.4, 24], [5.4, 4.4, 18], [4.4, 3.6, 12], [3.6, 3.0, 10]];
  let y = 0;
  levels.forEach(([rb, rt, h], k) => {
    fluted(rt, rb, h, 24, 0.12, 0, y, 0, k >= 3 ? buff : red);
    torus(rt + 1.2, 0.8, 0, y + h, 0, buff);
    y += h + 0.6;
  });
  dome(3, 0, y, 0, buff, 0, 0.8);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, 9, 0, y + 4)] };
}

function humayun() {
  const red = '#a4553e', marble = '#efe9dc';
  box(110, 10, 110, 0, 0, 0, red);
  for (let k = -4; k <= 4; k++) for (const z of [-55.1, 55.1]) box(8, 6, 0.4, k * 12, 2, z, '#3a2420');
  box(56, 34, 56, 0, 10, 0, red);
  for (const s of [-1, 1]) box(16, 24, 0.6, s * 16, 12, 28.1, marble);
  box(18, 28, 0.6, 0, 12, 28.1, '#3a2a24');
  cyl(14, 14, 10, 16, 0, 44, 0, marble);
  sph(16, 0, 56, 0, marble, 0, 1.1, 18, 10);
  cone(1.2, 10, 6, 0, 72, 0, '#d8b048', 0.3);
  for (const [x, z] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) { cyl(5, 5, 6, 8, x, 44, z, red); dome(4.4, x, 50, z, marble); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// ============================================================ BEIJING
function cnRoof(x, y, z, w, d, h, col) {
  C(new THREE.CylinderGeometry(0.3, 0.75, 1, 4, 1).rotateY(Math.PI / 4).scale(w * 1.41, h, d * 1.41).translate(x, y + h / 2, z), col);
  box(w * 0.55, h * 0.18, 1.2, x, y + h, z, col);
}
function wumen() {
  const red = '#a3302a', yellow = '#e2b030', white = '#e6e2d8';
  box(130, 20, 34, 0, 0, 0, red);
  box(132, 1.5, 36, 0, 20, 0, white);
  box(70, 14, 22, 0, 21.5, 0, red);
  cnRoof(0, 35, 0, 82, 30, 7, yellow); cnRoof(0, 42, 0, 64, 24, 7, yellow);
  for (const s of [-1, 1]) { box(18, 10, 18, s * 54, 21.5, 0, red); cnRoof(s * 54, 31.5, 0, 24, 24, 6, yellow); }
  box(18, 13, 0.6, 0, 0, 17.1, '#1e1414'); box(18, 13, 0.6, 0, 0, -17.1, '#1e1414');
  for (const s of [-1, 1]) box(8, 9, 0.6, s * 26, 0, 17.1, '#1e1414');
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [B(-65, -9.5, 0, 21.5, -17, 17), B(9.5, 65, 0, 21.5, -17, 17), B(-9.5, 9.5, 13, 21.5, -17, 17), B(-45, 45, 21.5, 52, -16, 16), B(-65, 65, 21.5, 38, -11, 11)],
    gates: [{ x0: -9, x1: 9, y0: 0, y1: 12.5, label: 'XUYÊN NGỌ MÔN', bonus: 2500 }],
  };
}

function taihedian() {
  const white = '#e8e4da', red = '#a3302a', yellow = '#e2b030';
  box(120, 5, 80, 0, 0, 0, white); box(104, 5, 68, 0, 5, 0, white); box(90, 5, 56, 0, 10, 0, white);
  box(70, 18, 34, 0, 15, 0, red);
  cnRoof(0, 33, 0, 84, 46, 8, yellow); cnRoof(0, 41, 0, 66, 34, 9, yellow);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

function templeofheaven() {
  const white = '#ecebe6', blue = '#2a4a8c', red = '#a3302a';
  cyl(42, 44, 3, 32, 0, 0, 0, white); cyl(34, 36, 3, 32, 0, 3, 0, white); cyl(26, 28, 3, 32, 0, 6, 0, white);
  cyl(14, 14, 10, 24, 0, 9, 0, red);
  cone(19, 7, 24, 0, 19, 0, blue); cyl(11, 11, 5, 24, 0, 24, 0, red);
  cone(15, 6, 24, 0, 29, 0, blue); cyl(8, 8, 4, 24, 0, 33, 0, red);
  cone(11, 7, 24, 0, 37, 0, blue); sph(1.8, 0, 45, 0, '#e8b830', 0.4); cone(0.8, 4, 6, 0, 46, 0, '#e8b830', 0.4);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

function cctv() {
  const glass = '#5a6470';
  const lean = (g, dir) => { g.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, dir * 0.1, 0, 0, 0)); return g; };
  C(lean(new THREE.BoxGeometry(38, 165, 40).translate(-45, 82.5, 0), 1), glass);
  C(lean(new THREE.BoxGeometry(38, 165, 40).translate(45, 82.5, 0), -1), glass);
  box(128, 28, 44, 0, 0, 0, glass);
  box(110, 30, 44, 0, 160, 0, glass);
  box(60, 30, 44, -40, 160, 0, glass);
  const g1 = take();
  for (let k = 0; k < 12; k++) { beam([-64 + k * 4, 28, 20.5], [-64 + k * 4 + 16, 190, 20.5], 0.5, '#b8c0c8'); beam([64 - k * 4, 28, 20.5], [64 - k * 4 - 16, 190, 20.5], 0.5, '#b8c0c8'); }
  return {
    parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }],
    colliders: [B(-70, -20, 0, 192, -22, 22), B(20, 70, 0, 192, -22, 22), B(-70, 70, 0, 29, -22, 22), B(-70, 70, 158, 192, -22, 22)],
    gates: [{ x0: -19, x1: 19, y0: 30, y1: 157, label: 'XUYÊN THÁP CCTV', bonus: 2000 }],
  };
}

function greatwall(o) {
  const st = '#8f8676', st2 = '#a59c8a';
  const s = o.s, uOff = o.u || 0;
  const pts = [];
  const tmp = new THREE.Vector3();
  for (let x = -720; x <= 720; x += 16) {
    railToWorld(s, uOff + x, 0, tmp);
    pts.push([x, Math.max(1.5, terrainHeight(tmp.x, tmp.z)), Math.sin(x * 0.01) * 18]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1];
    beam([x0, y0 + 4, z0], [x1, y1 + 4, z1], 7, st, 0, 11);
    beam([x0, y0 + 10.3, z0 + 3.2], [x1, y1 + 10.3, z1 + 3.2], 1.2, st2, 0, 2);
    beam([x0, y0 + 10.3, z0 - 3.2], [x1, y1 + 10.3, z1 - 3.2], 1.2, st2, 0, 2);
    if (i % 9 === 4) { box(15, 16, 15, x0, y0 - 2, z0, st2); C(new THREE.CylinderGeometry(4, 11, 5, 4).rotateY(Math.PI / 4).translate(x0, y0 + 16.5, z0), '#5a5248'); }
  }
  const cols = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0, z0] = pts[i], [x1, y1] = pts[i + 1];
    if (Math.abs(x0) > 80) continue;
    cols.push(B(x0, x1, -10, Math.max(y0, y1) + 11.5, z0 - 6, z0 + 6));
    if (i % 9 === 4) cols.push(B(x0 - 7.5, x0 + 7.5, -10, y0 + 19, z0 - 8, z0 + 8));
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: cols, gates: [{ x0: -50, x1: 50, y0: 0, y1: 99, label: 'VƯỢT VẠN LÝ TRƯỜNG THÀNH', bonus: 1000, over: true }] };
}

// ============================================================ SEOUL
function namsan() {
  lathe([[220, 0], [190, 14], [140, 40], [90, 62], [40, 76], [0, 80]], 18, 0, -6, 0, '#2e4a34');
  cyl(4, 6, 20, 10, 0, 72, 0, '#d8d8d8');
  cyl(3, 3.6, 70, 10, 0, 92, 0, '#e4e4e2');
  lathe([[3.5, 0], [11, 3], [12, 10], [11, 16], [4, 19]], 16, 0, 150, 0, '#dfe2e6');
  torus(12.1, 0.6, 0, 156, 0, '#8fd8ff', 0.8); torus(11.2, 0.5, 0, 162, 0, '#ff9ad8', 0.8);
  cyl(1, 2.2, 60, 6, 0, 169, 0, '#ececec');
  box(2, 2, 2, 0, 229, 0, '#ff3a2a', 1);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [], fogScale: 0.55 };
}

function lotteworld() {
  C(new THREE.CylinderGeometry(7, 26, 330, 4, 8).rotateY(Math.PI / 4).translate(0, 165, 0), '#b8c8d6');
  const g1 = take();
  for (const s of [-1, 1]) C(new THREE.CylinderGeometry(0.5, 4, 40, 4).rotateY(Math.PI / 4).translate(s * 3.5, 345, 0), '#e8eef4', 0.15);
  box(2, 2, 2, 0, 366, 0, '#ff3a2a', 1);
  return { parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }], colliders: [], fogScale: 0.45 };
}

function banpo() {
  const c = '#c4c2bc';
  box(680, 4, 22, 0, 13, 0, c); box(680, 1.6, 1, 0, 17, 10.6, '#7a7a78'); box(680, 1.6, 1, 0, 17, -10.6, '#7a7a78');
  box(680, 2, 18, 0, 3.5, 0, '#a8a6a0');
  const piers = [-315, -225, -135, -45, 45, 135, 225, 315];
  for (const x of piers) box(5, 26, 16, x, -12, 0, '#9a9890');
  for (let x = -330; x <= 330; x += 6) for (const z of [-11.4, 11.4]) box(0.8, 0.8, 0.8, x, 12.6, z, '#9af', 0.8);
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [B(-340, 340, 11.8, 18, -11.5, 11.5), B(-340, 340, 2.5, 6, -9.5, 9.5), ...piers.map(x => B(x - 3, x + 3, -12, 14, -9, 9))],
    gates: [{ x0: -42, x1: 42, y0: 6, y1: 11.5, label: 'GIỮA HAI TẦNG CẦU BANPO', bonus: 2500 }],
    fountain: { x0: -330, x1: 330, y: 12, z: 11.6 },
  };
}

function gwanghwamun() {
  const st = '#c8bfae', red = '#8a2e26', green = '#3e6a52', roof = '#4a4e52';
  box(90, 15, 24, 0, 0, 0, st);
  for (const x of [-22, 0, 22]) box(9, 10, 0.6, x, 0, 12.1, '#2a2420');
  box(56, 10, 16, 0, 15, 0, red); box(57, 2, 17, 0, 23, 0, green);
  cnRoof(0, 25, 0, 70, 26, 7, roof); box(44, 6, 12, 0, 32, 0, red); cnRoof(0, 37, 0, 58, 20, 6, roof);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// ============================================================ TOKYO
function rainbowbridge() {
  const w = '#eef0f2';
  box(820, 7, 24, 0, 31, 0, '#c8ccd0'); box(820, 3, 24, 0, 24, 0, '#a8acb0');
  box(820, 1.4, 1, 0, 39, 11.6, '#7a7e84'); box(820, 1.4, 1, 0, 39, -11.6, '#7a7e84');
  for (const s of [-1, 1]) {
    const tx = s * 78;
    for (const z of [-11, 11]) box(7, 160, 6, tx, -14, z, w);
    for (const y of [50, 95, 135]) box(7, 5, 28, tx, y, 0, w);
    box(10, 4, 30, tx, 146, 0, w);
  }
  const N = 24;
  const cab = (x) => { const t = x / 78; return 50 + 92 * t * t; };
  for (const z of [-11, 11]) {
    for (let k = 0; k < N; k++) {
      const x0 = -78 + k * 156 / N, x1 = x0 + 156 / N;
      beam([x0, cab(x0) + 4, z], [x1, cab(x1) + 4, z], 1.1, w, 0.15);
      if (k > 0) beam([x0, 38, z], [x0, cab(x0) + 4, z], 0.25, w);
    }
    for (const s of [-1, 1]) {
      beam([s * 78, 146, z], [s * 260, 40, z], 1.1, w, 0.15);
      for (let k = 1; k < 8; k++) { const x = s * (78 + k * 22); const y = 146 - (146 - 40) * (k * 22) / 182; beam([x, 38, z], [x, y, z], 0.25, w); }
    }
  }
  for (let x = -400; x <= 400; x += 16) for (const z of [-12.2, 12.2]) box(0.7, 0.7, 0.7, x, 30.4, z, '#ffffff', 0.9);
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [B(-420, 420, 23, 39, -12.5, 12.5), B(-84, -72, -14, 160, -14, 14), B(72, 84, -14, 160, -14, 14)],
    gates: [{ x0: -70, x1: 70, y0: 0, y1: 22, label: 'GẦM CẦU CẦU VỒNG', bonus: 1500 }],
  };
}

function tokyotower() {
  const red = '#e8502a', white = '#f2f0ea';
  const prof = (y) => 32 * Math.pow(1 - y / 230, 2.2) + 2.2;
  const L = 14;
  for (let k = 0; k < L; k++) {
    const y0 = k * 220 / L, y1 = (k + 1) * 220 / L;
    const r0 = prof(y0), r1 = prof(y1);
    const col = Math.floor(k / 1) % 2 ? white : red;
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) beam([sx * r0, y0, sz * r0], [sx * r1, y1, sz * r1], 1.4 + (1 - k / L) * 1.6, col);
    for (const [ax, az, bx, bz] of [[1, 1, -1, 1], [-1, 1, -1, -1], [-1, -1, 1, -1], [1, -1, 1, 1]]) {
      beam([ax * r0, y0, az * r0], [bx * r1, y1, bz * r1], 0.5, col);
      beam([bx * r0, y0, bz * r0], [ax * r1, y1, az * r1], 0.5, col);
      beam([ax * r1, y1, az * r1], [bx * r1, y1, bz * r1], 0.6, col);
    }
  }
  box(26, 10, 26, 0, 100, 0, white); box(27, 1, 27, 0, 104, 0, '#ffe8b0', 0.6);
  box(10, 6, 10, 0, 180, 0, white);
  cyl(0.8, 1.6, 50, 6, 0, 220, 0, red); box(2, 2, 2, 0, 270, 0, '#ff3a2a', 1);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [], fogScale: 0.55 };
}

function skytree() {
  C(new THREE.CylinderGeometry(7, 20, 300, 12, 6).translate(0, 150, 0), '#dfe6ee');
  const g1 = take();
  cyl(17, 15, 14, 16, 0, 220, 0, '#eef2f6'); torus(17.2, 0.6, 0, 227, 0, '#7fd8ff', 0.8);
  cyl(11, 10, 9, 16, 0, 300, 0, '#eef2f6'); torus(11.2, 0.5, 0, 304, 0, '#c89aff', 0.8);
  cyl(2, 4, 120, 8, 0, 309, 0, '#e8ecf0'); box(2, 2, 2, 0, 430, 0, '#ff3a2a', 1);
  return { parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }], colliders: [], fogScale: 0.4 };
}

function fuji() {
  const pts = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push([1700 * Math.pow(1 - t, 1.6) + 70 * (1 - t) + 60, t * 920]); }
  pts.push([0, 930]);
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 40).toNonIndexed();
  g.computeVertexNormals();
  const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), em = new Float32Array(n);
  const snow = new THREE.Color('#f4f6fa'), rock = new THREE.Color('#4a5268'), c = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const line = 560 + 60 * Math.sin(a * 7) + 40 * Math.sin(a * 13 + 1);
    c.copy(y > line ? snow : rock);
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(em, 1));
  g.deleteAttribute('uv');
  g.translate(0, -20, 0);
  return { parts: [{ geo: g, mat: 'paint' }], colliders: [], fogScale: 0.22 };
}

// Generic obstacle tower for city corridors (glass skyscraper with a rooftop beacon)
function skyscraper(o) {
  const h = o.h ?? 90, w = o.w ?? 16;
  box(w, h, w, 0, 0, 0, o.col || '#8ea2b6');
  const g1 = take();
  box(w + 1, 2, w + 1, 0, h, 0, '#dfe4ea', 0.15); cyl(0.4, 0.5, 10, 5, 0, h + 2, 0, '#ccc'); box(1.4, 1.4, 1.4, 0, h + 12, 0, '#ff3a2a', 1);
  return { parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }], colliders: [B(-w / 2 - 0.5, w / 2 + 0.5, -5, h + 3, -w / 2 - 0.5, w / 2 + 0.5)] };
}

export const BUILDERS = {
  longbien, thaprua, thehuc, landmark72, lotte, cotco,
  watarun, grandpalace, rama8, mahanakhon,
  petronas, kltower, merdeka,
  mbs, grove, flyer,
  monas, wisma46,
  jonesbridge, intramuros, cargoship,
  indiagate, qutub, humayun,
  wumen, taihedian, templeofheaven, cctv, greatwall,
  namsan, lotteworld, banpo, gwanghwamun,
  rainbowbridge, tokyotower, skytree, fuji,
  skyscraper,
};

// Builders whose geometry depends only on the name are cached (the Great Wall follows the terrain).
const cache = new Map();
export function buildLandmark(name, o) {
  if (name === 'greatwall' || name === 'grove' || name === 'skyscraper') return BUILDERS[name](o);
  if (!cache.has(name)) cache.set(name, BUILDERS[name](o));
  return cache.get(name);
}
