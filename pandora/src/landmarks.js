// Landmarks of Pandora, built procedurally from primitives (no assets).
// Each builder returns { parts, colliders, gates, subs, fogScale } in landmark-local space:
//   x = lateral offset (rail u), y = height, z = toward the approaching player (rail s decreases with +z).
//   parts:     [{ geo, mat: 'paint' | 'glass' }] — geometries carry vertex colours (+ aEmit)
//   colliders: [{ t: 'box', x0, x1, y0, y1, z0, z1 } | { t: 'cyl', x, z, r, y0, y1 }]
//   gates:     [{ x0, x1, y0, y1, label, bonus }] — flying through the plane z = 0 inside one scores a bonus
//   subs:      [{ geo, mat, pos: [x,y,z], spin: [ax,ay,az] }] — animated sub-meshes (e.g. a Ferris wheel)
//   emitters:  [{ kind: 'fire' | 'smoke' | 'falls' | 'spray' | 'spores', x, y, z, w, rate }] — particle sources
// Landmarks are scenery (and sacred places to protect): they are never destroyed and never targeted.
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


const r0 = mulberry32(2154);
const rnd = () => r0();
const GLOW = '#6fe6ff', GLOW2 = '#c58aff';

// Glowing spot scatter on a cylinder surface
function spots(n, x, z, rad, y0, y1, col = GLOW) {
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU, y = lerp(y0, y1, rnd());
    box(0.8, 0.8, 0.8, x + Math.cos(a) * rad, y, z + Math.sin(a) * rad, rnd() > 0.25 ? col : GLOW2, 1);
  }
}

// ============================================================ Rainforest
// Hometree: the Omaticaya clan's colossal home — a cluster of fused trunks with lit hollows inside.
function hometree(o) {
  const burnt = !!o.burning;
  const bark = burnt ? '#3a302a' : '#5c5044', bark2 = burnt ? '#2a221e' : '#4a4038';
  fluted(30, 46, 300, 18, 0.22, 0, -4, 0, bark);
  fluted(16, 24, 230, 12, 0.2, 34, -4, 18, bark2);
  fluted(14, 22, 250, 12, 0.2, -30, -4, -20, bark2);
  for (let k = 0; k < 9; k++) {   // buttress root arches
    const a = k / 9 * TAU;
    C(new THREE.TorusGeometry(26, 5, 5, 12, Math.PI).rotateY(a).translate(Math.cos(a) * 48, -2, Math.sin(a) * 48), bark2);
  }
  for (let k = 0; k < 14; k++) { const a = rnd() * TAU, y = 20 + rnd() * 200; box(5, 7, 5, Math.cos(a) * 44, y, Math.sin(a) * 44, burnt ? '#ff6a2a' : '#ffc070', 1); }   // lit hollows
  spots(60, 0, 0, 46, 5, 260);
  if (!burnt) {
    cyl(30, 130, 26, 14, 0, 270, 0, '#2f6a4e'); cyl(20, 95, 22, 12, 25, 300, 10, '#3a7f58'); cyl(18, 70, 20, 10, -30, 250, -15, '#2a5e46');
  } else {
    cyl(30, 110, 14, 10, 0, 270, 0, '#2a2a22');
  }
  for (let k = 0; k < 30; k++) { const a = rnd() * TAU, d = 40 + rnd() * 80, L = 30 + rnd() * 80; box(1, L, 1, Math.cos(a) * d, 270 - L, Math.sin(a) * d, '#3a6a40'); }
  const emitters = burnt ? [
    { kind: 'fire', x: 0, y: 120, z: 0, w: 40, rate: 6 }, { kind: 'fire', x: 30, y: 200, z: 15, w: 30, rate: 4 }, { kind: 'fire', x: -25, y: 60, z: -20, w: 30, rate: 4 },
    { kind: 'smoke', x: 0, y: 260, z: 0, w: 60, rate: 3 },
  ] : [];
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, 50, -10, 330), Cy(0, 0, 130, 255, 330)], emitters, fogScale: 0.6 };
}

// Tree of Souls: a vast willow whose hanging tendrils glow pink and violet — the most sacred place of the clan.
function soultree(o) {
  fluted(5, 9, 40, 9, 0.2, 0, 0, 0, '#5a4a52');
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; beam([0, 36, 0], [Math.cos(a) * 30, 52, Math.sin(a) * 30], 3, '#5a4a52'); }
  dome(40, 0, 44, 0, '#4a3a5a', 0, 0.35);
  for (let k = 0; k < 140; k++) {
    const a = rnd() * TAU, d = 8 + Math.sqrt(rnd()) * 36, top = 44 + Math.sqrt(Math.max(0, 1 - (d / 40) ** 2)) * 14, len = top - 1 - rnd() * 6;
    box(0.35, len, 0.35, Math.cos(a) * d, top - len, Math.sin(a) * d, rnd() > 0.4 ? '#ff7ae0' : '#b07aff', 1);
  }
  for (let k = 0; k < 20; k++) { const a = rnd() * TAU; beam([0, 1, 0], [Math.cos(a) * (20 + rnd() * 30), 0.5, Math.sin(a) * (20 + rnd() * 30)], 1.4, '#ff9af0', 0.8); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, 41, 0, 62)], emitters: [{ kind: 'spores', x: 0, y: 30, z: 0, w: 60, rate: 3 }] };
}

// A giant rainforest trunk standing in the flight path
function trunk(o) {
  const h = o.h ?? 150, r = o.r ?? 7;
  fluted(r * 0.7, r, h, 10, 0.18, 0, -3, 0, '#5a5048');
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3; C(new THREE.ConeGeometry(r * 0.55, 18, 3).scale(0.5, 1, 1.7).rotateY(-a).translate(Math.cos(a) * r * 1.1, 6, Math.sin(a) * r * 1.1), '#4a4038'); }
  cyl(6, 46, 10, 12, 0, h - 14, 0, '#2f6a4e'); cyl(5, 32, 9, 10, 6, h - 2, 4, '#3a7f58');
  spots(26, 0, 0, r * 0.95, 3, h - 20);
  for (let k = 0; k < 12; k++) { const a = rnd() * TAU, d = 14 + rnd() * 28, L = 14 + rnd() * 40; box(0.6, L, 0.6, Math.cos(a) * d, h - 14 - L, Math.sin(a) * d, '#3a6a40'); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, r + 1, -5, h - 16)] };
}

// A great arching root spanning the trail — ride (or fly) underneath it
function rootarch(o) {
  const R = o.R ?? 34;
  C(new THREE.TorusGeometry(R, 5.5, 7, 22, Math.PI).translate(0, 0, 0), '#4e443a');
  C(new THREE.TorusGeometry(R + 0.4, 5.9, 5, 22, Math.PI).scale(1, 1, 0.35).translate(0, 1.4, 0), '#3a7a4c');
  for (let k = 0; k < 20; k++) { const a = rnd() * Math.PI; box(0.9, 0.9, 0.9, Math.cos(a) * (R + 4.5), Math.sin(a) * (R + 4.5), (rnd() - 0.5) * 6, rnd() > 0.3 ? GLOW : GLOW2, 1); }
  for (let k = 0; k < 10; k++) { const a = 0.4 + rnd() * 2.3, L = 4 + rnd() * 10; box(0.4, L, 0.4, Math.cos(a) * R, Math.sin(a) * R - L, (rnd() - 0.5) * 4, '#3a6a40'); }
  const cols = [];
  for (let k = 0; k < 10; k++) {
    const a0 = k / 10 * Math.PI, a1 = (k + 1) / 10 * Math.PI;
    const xs = [Math.cos(a0) * R, Math.cos(a1) * R], ys = [Math.sin(a0) * R, Math.sin(a1) * R];
    cols.push(B(Math.min(...xs) - 5.5, Math.max(...xs) + 5.5, Math.min(...ys) - 5.5, Math.max(...ys) + 5.5, -6, 6));
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: cols, gates: [{ x0: -R + 7, x1: R - 7, y0: 0, y1: R - 7, label: 'DƯỚI VÒM RỄ', bonus: 1000 }] };
}

// The sacred willow grove the RDA bulldozers come to destroy
function shrine(o) {
  fluted(2.5, 4, 16, 7, 0.2, 0, 0, 0, '#6a5a50');
  dome(14, 0, 15, 0, '#4a3a5a', 0, 0.4);
  for (let k = 0; k < 60; k++) { const a = rnd() * TAU, d = 3 + Math.sqrt(rnd()) * 13, len = 10 + rnd() * 6; box(0.25, len, 0.25, Math.cos(a) * d, 19 - len, Math.sin(a) * d, rnd() > 0.4 ? '#ff7ae0' : '#b07aff', 1); }
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; box(2.4, 3 + rnd() * 3, 2.4, Math.cos(a) * 20, 0, Math.sin(a) * 20, '#8a8478'); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, 15, 0, 22)], emitters: [{ kind: 'spores', x: 0, y: 10, z: 0, w: 20, rate: 1 }] };
}

// ============================================================ Floating mountains
function rockIsland(rad, x, y, z, falls) {
  const g = new THREE.ConeGeometry(rad, rad * 1.8, 11, 5).rotateX(Math.PI).translate(0, -rad * 0.9, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i), pz = p.getZ(i); const k = 1 + 0.16 * Math.sin(px * 0.3 + pz * 0.21 + py * 0.17); p.setXYZ(i, px * k, py, pz * k); }
  C(g.translate(x, y, z), '#8c867c');
  cyl(rad * 1.04, rad, rad * 0.08, 12, x, y - rad * 0.04, z, '#3f7a4a');
  for (let k = 0; k < Math.round(rad / 6); k++) { const a = rnd() * TAU, d = rnd() * rad * 0.7, h = rad * (0.3 + rnd() * 0.3); cyl(0.4, 0.8, h, 5, x + Math.cos(a) * d, y, z + Math.sin(a) * d, '#5a4a40'); C(new THREE.IcosahedronGeometry(h * 0.35, 0).scale(1.3, 0.8, 1.3).translate(x + Math.cos(a) * d, y + h, z + Math.sin(a) * d), k % 2 ? '#2f6a4e' : '#3a7f58'); }
  for (let k = 0; k < Math.round(rad / 3); k++) { const a = rnd() * TAU, d = rad * (0.6 + rnd() * 0.35), L = rad * (0.4 + rnd() * 1.4); box(0.4, L, 0.4, x + Math.cos(a) * d, y - L, z + Math.sin(a) * d, '#3a6a40'); }
  spots(Math.round(rad / 2), x, z, rad * 0.8, y - rad * 0.8, y - 2);
  if (falls) return { kind: 'falls', x: x + rad * 0.9, y: y - 1, z, w: rad * 0.3, rate: 3 };
  return null;
}
// One floating mountain (o.r radius, o.y top height)
function floatrock(o) {
  const rad = o.r ?? 30, y = o.y ?? 60;
  const em = rockIsland(rad, 0, y, 0, o.falls !== false);
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [Cy(0, 0, rad * 1.02, y - rad * 0.45, y + rad * 0.5), Cy(0, 0, rad * 0.62, y - rad * 1.0, y - rad * 0.45), Cy(0, 0, rad * 0.3, y - rad * 1.6, y - rad * 1.0)],
    emitters: em ? [em] : [],
  };
}
// Two floating mountains joined by a hanging root bridge — fly under the vines
function vinebridge(o) {
  const gap = o.gap ?? 40, rad = o.r ?? 34, y = o.y ?? 90;
  const e1 = rockIsland(rad, -(gap + rad), y, 0, true), e2 = rockIsland(rad * 0.9, gap + rad * 0.9, y + 8, 0, false);
  for (let k = 0; k < 3; k++) {
    const N = 16;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const x0 = lerp(-gap - 4, gap + 4, t0), x1 = lerp(-gap - 4, gap + 4, t1);
      const sag = (t) => y - 6 - Math.sin(Math.PI * t) * (18 + k * 6);
      beam([x0, sag(t0), -3 + k * 3], [x1, sag(t1), -3 + k * 3], 1.6, '#4a5a3a');
    }
  }
  const cols = [Cy(-(gap + rad), 0, rad, y - rad * 1.6, y + rad * 0.5), Cy(gap + rad * 0.9, 0, rad * 0.9, y + 8 - rad * 1.5, y + 8 + rad * 0.5)];
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8, x = lerp(-gap - 4, gap + 4, t), yy = y - 6 - Math.sin(Math.PI * t) * 24;
    cols.push(B(x - gap / 8 - 1, x + gap / 8 + 1, yy - 3, yy + 4 + Math.sin(Math.PI * t) * 12, -6, 6));
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: cols, emitters: [e1, e2].filter(Boolean), gates: [{ x0: -gap, x1: gap, y0: 0, y1: y - 40, label: 'DƯỚI CẦU DÂY LEO', bonus: 1500 }] };
}
// A cluster of small drifting rocks (the Flux Vortex)
function fluxrocks(o) {
  const cols = [];
  const n = o.n ?? 7;
  for (let k = 0; k < n; k++) {
    const x = (rnd() * 2 - 1) * 44, y = 8 + rnd() * 46, z = (rnd() * 2 - 1) * 60, rad = 5 + rnd() * 7;
    if (Math.abs(x) < 10 && y > 18 && y < 40) continue;   // always leave a hole through the middle
    rockIsland(rad, x, y, z, false);
    cols.push(Cy(x, z, rad * 1.02, y - rad * 0.5, y + rad * 0.4), Cy(x, z, rad * 0.55, y - rad * 1.2, y - rad * 0.5));
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: cols };
}
// Tall stone spire (Toruk's perch)
function spire(o) {
  const h = o.h ?? 180;
  fluted(6, 22, h, 9, 0.25, 0, -40, 0, '#8a8478');
  cone(8, 26, 9, 0, h - 40, 0, '#7a746a');
  for (let k = 0; k < 16; k++) { const a = rnd() * TAU, y = rnd() * h - 40, L = 10 + rnd() * 30; box(0.6, L, 0.6, Math.cos(a) * (20 - y * 0.08), y - L, Math.sin(a) * (20 - y * 0.08), '#3a6a40'); }
  C(new THREE.IcosahedronGeometry(10, 0).scale(1.3, 0.6, 1.3).translate(0, h - 16, 0), '#3f7a4a');
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, 19, -40, h * 0.4), Cy(0, 0, 13, h * 0.4, h - 10)], fogScale: 0.7 };
}

// ============================================================ RDA
function hellsgate(o) {
  const grey = '#7a7e86', dark = '#3a3e46', yel = '#e8b830';
  for (let k = 0; k < 12; k++) box(30, 18, 2, -150 + k * 28, 0, 70, dark);
  for (let k = 0; k < 4; k++) { box(6, 34, 6, -150 + k * 100, 0, 70, grey); box(10, 4, 10, -150 + k * 100, 34, 70, dark); box(2, 2, 2, -150 + k * 100, 39, 70, '#ff3a2a', 1); }
  box(80, 26, 50, -60, 0, 0, grey); C(new THREE.CylinderGeometry(25, 25, 80, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(-60, 26, 0), grey);
  box(60, 14, 40, 60, 0, -10, '#8a8e96'); box(40, 40, 30, 130, 0, 10, '#6a6e76'); box(44, 2, 34, 130, 40, 10, '#e8f0ff', 0.4);
  for (let k = 0; k < 6; k++) box(14, 0.4, 14, -100 + k * 40, 0.3, -60, yel);
  cyl(2, 2, 40, 6, 170, 0, -40, grey); box(14, 2, 2, 170, 40, -40, '#ff3a2a', 1);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [], fogScale: 0.8 };
}
function dozerYard(o) {
  const y1 = '#d8a020', y2 = '#b8801a', dk = '#2a2a2a';
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 26, z = (rnd() - 0.5) * 30;
    box(16, 7, 22, x, 2, z, y1); box(10, 6, 8, x, 9, z + 3, y2); box(18, 4, 24, x, 0, z, dk);
    box(20, 7, 2, x, 0.5, z - 13, '#9a9a9a');
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}
// A straight section of railway along the rail (o.len long)
function railway(o) {
  const len = o.len ?? 420;
  box(9, 1.2, len, 0, -0.4, -len / 2 + 10, '#6a645a');
  for (let z = 10; z > -len + 10; z -= 4) box(7, 0.5, 1.2, 0, 0.7, z, '#4a3a2a');
  for (const x of [-2.2, 2.2]) box(0.5, 0.6, len, x, 1.1, -len / 2 + 10, '#9aa0a8');
  for (let z = 0; z > -len; z -= 60) for (const x of [-7, 7]) { box(0.5, 8, 0.5, x, 0, z, '#5a5e66'); box(1, 0.6, 1, x, 8, z, '#ffb84a', 1); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// ============================================================ The reef (Metkayina)
function marui(o) {
  const weave = '#c8b080', weave2 = '#a88a5a';
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * TAU * 0.8, d = 60 + (k % 3) * 18, x = Math.cos(a) * d, z = Math.sin(a) * d;
    for (const sx of [-3, 3]) box(0.8, 10, 0.8, x + sx, -6, z, '#6a5a40');
    sph(7, x, 8, z, k % 2 ? weave : weave2, 0, 0.75, 10, 6);
    box(3, 3, 0.4, x, 5, z + 6.5, '#ffd890', 0.6);
    if (k) { const a2 = (k - 1) / 14 * TAU * 0.8, d2 = 60 + ((k - 1) % 3) * 18; beam([Math.cos(a2) * d2, 3, Math.sin(a2) * d2], [x, 3, z], 1.6, '#8a6a40', 0, 0.4); }
  }
  for (let k = 0; k < 8; k++) { const a = rnd() * TAU, d = 20 + rnd() * 40; cyl(0.5, 0.8, 18, 5, Math.cos(a) * d, 0, Math.sin(a) * d, '#7a5a3a'); C(new THREE.IcosahedronGeometry(6, 0).scale(1.3, 0.6, 1.3).translate(Math.cos(a) * d, 19, Math.sin(a) * d), '#3f8a50'); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}
function mangrove(o) {
  for (let k = 0; k < 9; k++) {
    const x = (rnd() - 0.5) * 80, z = (rnd() - 0.5) * 60, h = 14 + rnd() * 10;
    cyl(0.8, 1.2, h, 6, x, 4, z, '#6a5a48');
    for (let j = 0; j < 6; j++) { const a = j / 6 * TAU; beam([x, 6, z], [x + Math.cos(a) * 6, -3, z + Math.sin(a) * 6], 0.5, '#5a4a3a'); }
    C(new THREE.IcosahedronGeometry(h * 0.45, 0).scale(1.4, 0.6, 1.4).translate(x, 4 + h, z), k % 2 ? '#2f7a50' : '#3f8a5a');
    box(0.6, 0.6, 0.6, x + 2, 6 + h * 0.6, z, GLOW, 1);
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}
// Tulkun — a great whale-like sapient being, here a friend: surfacing beside the squadron
function tulkun(o) {
  const skin = '#5a6a7a', belly = '#c8ccd0', mark = '#e8d8a0';
  const body = new THREE.LatheGeometry([[0, -60], [6, -54], [12, -40], [15, -20], [15, 0], [13, 20], [9, 40], [5, 52], [3, 58], [0, 60]].map(([r, y]) => new THREE.Vector2(r, y)), 14).rotateX(Math.PI / 2).scale(1.05, 0.8, 1);
  C(body, skin);
  C(new THREE.SphereGeometry(13, 10, 6, 0, TAU, Math.PI / 2, Math.PI / 2).scale(1.05, 0.5, 3).translate(0, -1, -5), belly);
  for (const s of [-1, 1]) { C(new THREE.BoxGeometry(24, 1.6, 9).translate(s * 20, -4, -18).rotateZ(s * 0.25), skin); C(new THREE.BoxGeometry(20, 1.4, 10).rotateY(s * 0.4).translate(s * 10, 0, 62), skin); }
  for (let k = 0; k < 8; k++) box(0.6, 0.4, 6, 4 - k * 1.1, 11.8, -38 + k * 8, mark);
  for (let k = 0; k < 5; k++) box(10 - k, 1.4, 0.8, 0, 12.2, -48 + k * 4, '#3a4a5a');
  sph(1.4, 9, 4, -46, '#1a2028'); sph(1.4, -9, 4, -46, '#1a2028');
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [], emitters: [{ kind: 'spray', x: 0, y: 12, z: -42, w: 3, rate: 1 }] };
}
function seacliff(o) {
  const h = o.h ?? 110;
  box(60, h + 40, 220, 0, -40, 0, '#7a7468');
  for (let k = 0; k < 10; k++) C(new THREE.IcosahedronGeometry(14 + rnd() * 10, 0).translate((rnd() - 0.5) * 40, h + rnd() * 8, (rnd() - 0.5) * 200), k % 2 ? '#3f8a50' : '#2f7a4a');
  for (let k = 0; k < 14; k++) { const L = 20 + rnd() * 50; box(0.8, L, 0.8, -30.5, h - L, (rnd() - 0.5) * 200, '#3a6a40'); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [], emitters: [{ kind: 'falls', x: -31, y: h, z: 30, w: 8, rate: 4 }, { kind: 'falls', x: -31, y: h - 10, z: -50, w: 6, rate: 3 }], fogScale: 0.8 };
}

// Generic obstacle tower for city corridors (glass skyscraper with a rooftop beacon)
function skyscraper(o) {
  const h = o.h ?? 90, w = o.w ?? 16;
  box(w, h, w, 0, 0, 0, o.col || '#8ea2b6');
  const g1 = take();
  box(w + 1, 2, w + 1, 0, h, 0, '#dfe4ea', 0.15); cyl(0.4, 0.5, 10, 5, 0, h + 2, 0, '#ccc'); box(1.4, 1.4, 1.4, 0, h + 12, 0, '#ff3a2a', 1);
  return { parts: [{ geo: g1, mat: 'glass' }, { geo: take(), mat: 'paint' }], colliders: [B(-w / 2 - 0.5, w / 2 + 0.5, -5, h + 3, -w / 2 - 0.5, w / 2 + 0.5)] };
}

// Polyphemus — the banded gas giant Pandora orbits, hanging huge in the sky (far away, nearly fog-free)
function polyphemus(o) {
  const g = new THREE.SphereGeometry(900, 40, 24).toNonIndexed();
  const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), em = new Float32Array(n);
  const bands = ['#8ab8e0', '#d8e8f4', '#6a98c8', '#b8d4ec', '#4a78b0', '#e8f0f8'].map(c => new THREE.Color(c));
  for (let i = 0; i < n; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 / 900;
    const b = bands[Math.abs(Math.floor(y * 9 + Math.sin(y * 23) * 0.6)) % bands.length];
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = b.r; col[(i + j) * 3 + 1] = b.g; col[(i + j) * 3 + 2] = b.b; em[i + j] = 0.18; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEmit', new THREE.BufferAttribute(em, 1));
  g.deleteAttribute('uv');
  g.rotateZ(0.25);
  return { parts: [{ geo: g, mat: 'paint' }], colliders: [], fogScale: 0.04 };
}

export const BUILDERS = {
  polyphemus,
  hometree, soultree, trunk, rootarch, shrine,
  floatrock, vinebridge, fluxrocks, spire,
  hellsgate, dozerYard, railway,
  marui, mangrove, tulkun, seacliff,
  skyscraper,
};

// Builders whose geometry depends only on the name are cached (the Great Wall follows the terrain).
const cache = new Map();
export function buildLandmark(name, o) {
  // geometry that depends on per-placement options is rebuilt; the rest is cached by name + options
  const key = name + JSON.stringify({ r: o.r, y: o.y, h: o.h, R: o.R, gap: o.gap, len: o.len, burning: o.burning, n: o.n, falls: o.falls });
  if (name === 'fluxrocks' || name === 'skyscraper') return BUILDERS[name](o);
  if (!cache.has(key)) cache.set(key, BUILDERS[name](o));
  return cache.get(key);
}
