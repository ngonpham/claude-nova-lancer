// Mounts: procedural low-poly beasts of Pandora (direhorse, mountain banshee, great leonopteryx, thanator,
// skimwing) and their Na'vi riders. Every mount is ONE skinned mesh (vertex colours + emissive mask through
// emissiveVertexMaterial / patchFog) driven by a small bone rig; animate() only sets bone rotations/offsets.
// Coordinate frame: origin = rider seat, beast faces -Z, up +Y.
import * as THREE from 'three';
import { emissiveVertexMaterial } from './world.js';

export const MOUNTS = ['pali', 'ikran', 'toruk', 'thanator', 'skimwing'];

// Per-rider colours: beast variant (skin / pattern / accent / membrane / belly / dark / glow) + rider ornaments.
export const RIDER_SCHEMES = {
  jake: {
    skin: '#1d4cb4', pattern: '#f8c41c', accent: '#ff6414', membrane: '#2a62cc', belly: '#9fb8e0', dark: '#0a1636', glow: '#7ff2ff',
    beads: '#36d2ff', band: null, feather: null, necklace: null, cloth: '#5c3f27', armband: '#36d2ff', scale: 1,
  },
  neytiri: {
    skin: '#6a2690', pattern: '#f6d238', accent: '#1cc6b2', membrane: '#9030b0', belly: '#c8a6dc', dark: '#220c3a', glow: '#a8f4ff',
    beads: '#ff6a2a', band: null, feather: '#f4ead0', necklace: '#ff7a36', cloth: '#6e4a2c', armband: '#ff7a36', braids: true, scale: 0.97,
  },
  tsutey: {
    skin: '#d4461a', pattern: '#121216', accent: '#f6a81e', membrane: '#e4621c', belly: '#f2b48e', dark: '#2a0c06', glow: '#9cf6ff',
    beads: '#ece4cc', band: '#c4301a', feather: '#ece4cc', necklace: '#ece4cc', cloth: '#4a3020', armband: '#c4301a', crest: true, scale: 1.03,
  },
  neteyam: {
    skin: '#167870', pattern: '#eab43a', accent: '#2848a8', membrane: '#22988a', belly: '#a6dacb', dark: '#08282a', glow: '#8ffff0',
    beads: '#f4f4f0', band: '#1cb8a8', feather: null, necklace: '#f4f4f0', cloth: '#5a4030', armband: '#1cb8a8', scale: 0.94,
  },
};

const TAU = Math.PI * 2;
const GLOW = '#56e4f4';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const fract = v => v - Math.floor(v);
const hash = (x, y, z) => fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);

// ============================================================ Rig: geometry accumulator + skeleton
const colCache = new Map();
function col(hex) { let c = colCache.get(hex); if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); } return c; }

class Rig {
  constructor() {
    this.bones = {}; this.list = [];
    this.P = []; this.N = []; this.C = []; this.E = []; this.SI = []; this.SW = [];
    this.mtx = null;
  }
  // Bone at model-space point p (transformed by the current mtx); rest rotation is always identity.
  bone(name, parent, p) {
    const b = new THREE.Bone();
    b.name = name;
    const abs = new THREE.Vector3(p[0], p[1], p[2]);
    if (this.mtx) abs.applyMatrix4(this.mtx);
    b.userData.abs = abs;
    const par = parent ? this.bones[parent] : null;
    if (par) { b.position.copy(abs).sub(par.userData.abs); par.add(b); } else b.position.copy(abs);
    b.userData.rest = b.position.clone();
    this.list.push(b);
    this.bones[name] = b;
    b.userData.i = this.list.length - 1;
    return b;
  }
  // paint: '#hex' | ['#hex', emit] | fn(x,y,z,nx,ny,nz,u,v) → one of those (evaluated per triangle, untransformed coords)
  // skin: 'bone' | fn(x,y,z) → [[bone, w], ...] (per vertex, untransformed coords)
  add(g0, paint, skin = 'root') {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    let gt = g;
    if (this.mtx) { gt = g.clone(); gt.applyMatrix4(this.mtx); }
    const P = g.attributes.position, Pt = gt.attributes.position, Nt = gt.attributes.normal;
    const UV = g.userData.puv ? g.attributes.uv : null;
    for (let i = 0; i + 2 < P.count; i += 3) {
      const ax = P.getX(i), ay = P.getY(i), az = P.getZ(i);
      const bx = P.getX(i + 1), by = P.getY(i + 1), bz = P.getZ(i + 1);
      const cx = P.getX(i + 2), cy = P.getY(i + 2), cz = P.getZ(i + 2);
      let r = paint;
      if (typeof paint === 'function') {
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const u = UV ? (UV.getX(i) + UV.getX(i + 1) + UV.getX(i + 2)) / 3 : 0;
        const v = UV ? (UV.getY(i) + UV.getY(i + 1) + UV.getY(i + 2)) / 3 : 0;
        r = paint((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, nx, ny, nz, u, v);
      }
      let hex = r, em = 0;
      if (Array.isArray(r)) { hex = r[0]; em = r[1]; }
      const c = col(hex);
      for (let j = 0; j < 3; j++) {
        const q = i + j;
        this.P.push(Pt.getX(q), Pt.getY(q), Pt.getZ(q));
        this.N.push(Nt.getX(q), Nt.getY(q), Nt.getZ(q));
        this.C.push(c.r, c.g, c.b);
        this.E.push(em);
        this.pushSkin(typeof skin === 'string' ? [[skin, 1]] : skin(P.getX(q), P.getY(q), P.getZ(q)));
      }
    }
  }
  pushSkin(w) {
    const arr = w.filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let tot = 0;
    for (const e of arr) tot += e[1];
    for (let k = 0; k < 4; k++) {
      const e = arr[k];
      if (e) {
        const b = this.bones[e[0]];
        if (!b) throw new Error('mounts: unknown bone ' + e[0]);
        this.SI.push(b.userData.i); this.SW.push(e[1] / tot);
      } else { this.SI.push(0); this.SW.push(0); }
    }
  }
  build(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.E, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    const mesh = new THREE.SkinnedMesh(g, mat);
    for (const b of this.list) if (!b.parent) mesh.add(b);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.list));
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    g.computeBoundingSphere();
    return mesh;
  }
}

// Blend between consecutive bones along a coordinate: list = [[bone, from], ...] (from ascending), h = half blend width.
function chain(list, v, h = 0.35) {
  let i = 0;
  while (i + 1 < list.length && v >= list[i + 1][1]) i++;
  if (i + 1 < list.length) {
    const b = list[i + 1][1];
    if (v > b - h) { const t = sm(b - h, b + h, v); return [[list[i][0], 1 - t], [list[i + 1][0], t]]; }
  }
  if (i > 0) {
    const b = list[i][1];
    if (v < b + h) { const t = sm(b - h, b + h, v); return [[list[i - 1][0], 1 - t], [list[i][0], t]]; }
  }
  return [[list[i][0], 1]];
}

// ============================================================ Geometry primitives
function crv(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return b.map((_, i) => 0.5 * (2 * b[i] + (-a[i] + c[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t2 + (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * t3));
}

// Catmull-Rom spine with per-sample frames. keys: [x, y, z, rx, ry]; rx = sideways radius, ry = "up" radius.
function spine(keys, o = {}) {
  const seg = o.seg || 3, ref = new THREE.Vector3(...(o.ref || [0, 1, 0]));
  const S = [], K = keys.length;
  for (let i = 0; i < K - 1; i++) {
    const a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(K - 1, i + 2)];
    for (let s = 0; s < seg; s++) S.push(crv(a, b, c, d, s / seg));
  }
  S.push(keys[K - 1].slice());
  const M = S.length, F = [];
  for (let k = 0; k < M; k++) {
    const p0 = S[Math.max(0, k - 1)], p1 = S[Math.min(M - 1, k + 1)];
    const T = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
    const side = new THREE.Vector3().crossVectors(T, ref);
    if (side.lengthSq() < 1e-5) side.crossVectors(T, new THREE.Vector3(1, 0, 0));
    side.normalize();
    F.push({ side, up: new THREE.Vector3().crossVectors(side, T) });
  }
  return { S, F, M, top: o.top ?? 1, bot: o.bot ?? 1, prof: o.prof };
}
// Point on a spine's surface: u = 0..1 along, a = angle (0 = side, PI/2 = up), lift = radial scale.
function surf(sp, u, a, lift = 1) {
  const kf = clamp(u, 0, 1) * (sp.M - 1), k = Math.min(sp.M - 2, Math.floor(kf)), t = kf - k;
  const A = sp.S[k], B = sp.S[k + 1], fa = sp.F[k], fb = sp.F[k + 1];
  const ca = Math.cos(a), sa = Math.sin(a);
  const rx = lerp(A[3], B[3], t) * lift, ry = lerp(A[4], B[4], t) * lift * (sa > 0 ? sp.top : sp.bot);
  const out = [];
  for (const [i, ax] of [[0, 'x'], [1, 'y'], [2, 'z']]) {
    out.push(lerp(A[i], B[i], t) + lerp(fa.side[ax], fb.side[ax], t) * ca * rx + lerp(fa.up[ax], fb.up[ax], t) * sa * ry);
  }
  return out;
}
// Smooth tube along a spine.
function tube(keys, o = {}) {
  const n = o.n || 10, ph = o.phase ?? 0;
  const sp = keys.S ? keys : spine(keys, o);
  const { S, F, M, top, bot } = sp;
  const pos = [], idx = [];
  for (let k = 0; k < M; k++) {
    const { side, up } = F[k];
    const s = S[k], rx = Math.max(0, s[3]), ry0 = Math.max(0, s[4]);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ph, ca = Math.cos(a), sa = Math.sin(a);
      const f = sp.prof ? sp.prof(a, k / (M - 1)) : 1;
      const ry = ry0 * (sa > 0 ? top : bot);
      pos.push(s[0] + (side.x * ca * rx + up.x * sa * ry) * f, s[1] + (side.y * ca * rx + up.y * sa * ry) * f, s[2] + (side.z * ca * rx + up.z * sa * ry) * f);
    }
  }
  for (let k = 0; k < M - 1; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b = (k + 1) * n + i, c = k * n + (i + 1) % n, d = (k + 1) * n + (i + 1) % n;
    idx.push(a, b, c, c, b, d);
  }
  const s0 = S[0], s1 = S[M - 1];
  if (s0[3] > 1e-3 || s0[4] > 1e-3) {
    const ci = pos.length / 3; pos.push(s0[0], s0[1], s0[2]);
    for (let i = 0; i < n; i++) idx.push(ci, i, (i + 1) % n);
  }
  if (s1[3] > 1e-3 || s1[4] > 1e-3) {
    const ci = pos.length / 3, e = (M - 1) * n; pos.push(s1[0], s1[1], s1[2]);
    for (let i = 0; i < n; i++) idx.push(ci, e + (i + 1) % n, e + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}
// Bioluminescent dots on a spine surface, mirrored left/right. list: [[u, a], ...] with a in (-PI/2, PI/2].
function dots(R, sp, list, r, skin, paint = [GLOW, 0.6]) {
  for (const [u, a, rr] of list) for (const aa of a > Math.PI / 2 - 1e-3 ? [a] : [a, Math.PI - a]) {
    const p = surf(sp, u, aa, 1.0);
    const q = rr ?? r;
    R.add(ell(p[0], p[1], p[2], q, q, q, 5, 4), paint, skin);
  }
}

// Push triangle a,b,c (arrays) so that its normal points along `want`.
function triP(out, a, b, c, want) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * want[0] + ny * want[1] + nz * want[2] < 0) out.push(...a, ...c, ...b); else out.push(...a, ...b, ...c);
}
const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function geoFrom(pos, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) { g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.userData.puv = true; }
  g.computeVertexNormals();
  return g;
}

// Flat polygon plate: pts are 2D [a, b]; map(a, b, w) → [x, y, z] (w = thickness direction).
function plate(pts, thick, map) {
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []);
  const out = [], h = thick / 2;
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
  for (const [i, j, k] of tris) {
    const A = pts[i], B = pts[j], C = pts[k];
    const ca = (A[0] + B[0] + C[0]) / 3, cb = (A[1] + B[1] + C[1]) / 3;
    const wd = v3sub(map(ca, cb, 1), map(ca, cb, 0));
    triP(out, map(A[0], A[1], h), map(B[0], B[1], h), map(C[0], C[1], h), wd);
    triP(out, map(A[0], A[1], -h), map(B[0], B[1], -h), map(C[0], C[1], -h), [-wd[0], -wd[1], -wd[2]]);
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const on = area > 0 ? [dy, -dx] : [-dy, dx];
    const ma = (p[0] + q[0]) / 2, mb = (p[1] + q[1]) / 2;
    const want = v3sub(map(ma + on[0] * 0.01, mb + on[1] * 0.01, 0), map(ma, mb, 0));
    const a = map(p[0], p[1], h), b = map(q[0], q[1], h), c = map(q[0], q[1], -h), d = map(p[0], p[1], -h);
    triP(out, a, b, c, want); triP(out, a, c, d, want);
  }
  return geoFrom(out);
}
const mapZY = (x0 = 0) => (a, b, w) => [x0 + w, b, a];         // vertical fin in YZ plane (a = z, b = y)
const mapXZ = (y0 = 0) => (a, b, w) => [a, y0 + w, b];         // horizontal plate (a = x, b = z)
function frameMap(o, U, V, W) {                                  // general frame
  return (a, b, w) => [o[0] + U[0] * a + V[0] * b + W[0] * w, o[1] + U[1] * a + V[1] * b + W[1] * w, o[2] + U[2] * a + V[2] * b + W[2] * w];
}

// Membrane between a leading edge L and trailing edge T (point lists sorted by coordinate `axis`).
// Builds a two-sided grid; uv = (span 0..1, chord 0..1) for painting.
function sheet(Lp, Tp, o = {}) {
  const ax = o.axis ?? 0, C = o.C ?? 4, step = o.step ?? 0.4, th = (o.thick ?? 0.05) / 2;
  const nd = o.nd || [0, 1, 0];
  const v0 = Math.max(Lp[0][ax], Tp[0][ax]), v1 = Math.min(Lp[Lp.length - 1][ax], Tp[Tp.length - 1][ax]);
  const brk = [...new Set([...Lp, ...Tp].map(p => p[ax]).filter(v => v >= v0 && v <= v1).concat([v0, v1]))].sort((a, b) => a - b);
  const xs = [];
  for (let i = 0; i < brk.length - 1; i++) {
    const n = Math.max(1, Math.ceil((brk[i + 1] - brk[i]) / step));
    for (let k = 0; k < n; k++) xs.push(lerp(brk[i], brk[i + 1], k / n));
  }
  xs.push(v1);
  const lin = (arr, v) => {
    let i = 0;
    while (i < arr.length - 2 && arr[i + 1][ax] < v) i++;
    const a = arr[i], b = arr[i + 1], t = clamp((v - a[ax]) / ((b[ax] - a[ax]) || 1), 0, 1);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  };
  const G = xs.map((v, si) => {
    const L = lin(Lp, v), T = lin(Tp, v), s = (v - v0) / (v1 - v0);
    const row = [];
    for (let ci = 0; ci <= C; ci++) {
      const c = ci / C;
      const p = [lerp(L[0], T[0], c), lerp(L[1], T[1], c), lerp(L[2], T[2], c)];
      if (o.camber) { const d = o.camber(s, c); p[0] += d[0]; p[1] += d[1]; p[2] += d[2]; }
      row.push({ p, s, c });
    }
    return row;
  });
  const pos = [], uv = [];
  const push = (a, b, c, sgn) => {
    const off = q => [q.p[0] + nd[0] * th * sgn, q.p[1] + nd[1] * th * sgn, q.p[2] + nd[2] * th * sgn];
    const A = off(a), B = off(b), Cc = off(c);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-12) return;
    const flip = (nx * nd[0] + ny * nd[1] + nz * nd[2]) * sgn < 0;
    const order = flip ? [[A, a], [Cc, c], [B, b]] : [[A, a], [B, b], [Cc, c]];
    for (const [P, q] of order) { pos.push(...P); uv.push(q.s, q.c); }
  };
  for (let i = 0; i < G.length - 1; i++) for (let j = 0; j < C; j++) {
    const a = G[i][j], b = G[i + 1][j], c = G[i][j + 1], d = G[i + 1][j + 1];
    for (const sgn of [1, -1]) { push(a, b, c, sgn); push(c, b, d, sgn); }
  }
  return geoFrom(pos, uv);
}

function ell(x, y, z, rx, ry, rz, ws = 10, hs = 7) {
  return new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz).translate(x, y, z);
}
function dome(x, y, z, rx, ry, rz, ws = 10) {
  return new THREE.SphereGeometry(1, ws, 4, 0, TAU, 0, Math.PI / 2).scale(rx, ry, rz).translate(x, y, z);
}
const _qa = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3();
function spike(from, to, r, segs = 5) {
  _va.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = _va.length();
  const g = new THREE.ConeGeometry(r, len, segs, 1).translate(0, len / 2, 0);
  _qa.setFromUnitVectors(_vb.set(0, 1, 0), _va.normalize());
  g.applyQuaternion(_qa).translate(from[0], from[1], from[2]);
  return g;
}
function rod(from, to, r0, r1 = r0, n = 6) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const ref = Math.abs(d[1]) > 0.9 * Math.hypot(...d) ? [0, 0, -1] : [0, 1, 0];
  return tube([[...from, r0, r0], [...to, r1, r1]], { n, seg: 1, ref });
}
function ring(x, y, z, r, tube, sx = 1, sz = 1, segs = 12) {
  return new THREE.TorusGeometry(r, tube, 4, segs).rotateX(Math.PI / 2).scale(sx, 1, sz).translate(x, y, z);
}
// Mirror across X (fixes winding).
function mirror(g0) {
  const g = (g0.index ? g0.toNonIndexed() : g0).clone();
  g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k], s = a.itemSize, arr = a.array;
    for (let i = 0; i + 2 < a.count; i += 3) for (let c = 0; c < s; c++) {
      const t = arr[(i + 1) * s + c]; arr[(i + 1) * s + c] = arr[(i + 2) * s + c]; arr[(i + 2) * s + c] = t;
    }
  }
  g.userData = { ...g0.userData };
  return g;
}
// Add a right-side part and its mirror; skin(side) returns the skin spec for 'R' / 'L'.
function sym(R, g, paint, skin) {
  R.add(g, paint, typeof skin === 'function' ? skin('R') : skin);
  R.add(mirror(g), paint, typeof skin === 'function' ? skin('L') : skin);
}

// ============================================================ Na'vi rider
function addRider(R, id, o = {}) {
  const S = RIDER_SCHEMES[id] || RIDER_SCHEMES.jake;
  const sc = S.scale || 1, W = o.legW ?? 0.8, drop = o.legDrop ?? 1;
  const prev = R.mtx;
  R.mtx = new THREE.Matrix4().makeScale(sc, sc, sc);
  R.bone('rider', o.parent || 'root', [0, 0.15, 0.05]);
  R.bone('riderHead', 'rider', [0, 1.8, -0.04]);
  const SKIN = '#3f86d6', STR = '#2a5ca8', HAIR = '#121016', DOT = [GLOW, 0.6];
  const body = (x, y, z) => (Math.sin(y * 9 + Math.abs(x) * 7 + Math.sin(z * 5) * 1.2) > 0.72 ? STR : SKIN);
  const skin = 'rider', head = 'riderHead';
  // torso (vertical tube: rx = width, ry = depth)
  R.add(tube([[0, -0.02, 0.08, 0.27, 0.2], [0, 0.3, 0.06, 0.27, 0.19], [0, 0.7, 0.02, 0.2, 0.15], [0, 1.08, -0.02, 0.29, 0.18],
    [0, 1.42, -0.04, 0.37, 0.19], [0, 1.6, -0.04, 0.34, 0.16], [0, 1.72, -0.03, 0.13, 0.11]], { n: 10, ref: [0, 0, -1] }), body, skin);
  R.add(tube([[0, 1.66, -0.03, 0.1, 0.1], [0, 2.08, -0.06, 0.085, 0.085]], { n: 8, seg: 1, ref: [0, 0, -1] }), SKIN, head);
  // head
  R.add(tube([[0, 2.28, 0.17, 0.05, 0.05], [0, 2.29, 0.09, 0.17, 0.19], [0, 2.26, -0.07, 0.18, 0.21], [0, 2.16, -0.19, 0.15, 0.16],
    [0, 2.04, -0.25, 0.1, 0.1], [0, 1.96, -0.27, 0.04, 0.04]], { n: 10, seg: 2 }), (x, y, z) => (z < -0.12 && y > 2.08 && Math.abs(x) < 0.05 ? STR : SKIN), head);
  for (const sx of [-1, 1]) {
    R.add(ell(sx * 0.085, 2.24, -0.205, 0.05, 0.034, 0.03, 6, 4), ['#f2c838', 0.6], head);
    R.add(spike([sx * 0.16, 2.27, 0.03], [sx * 0.29, 2.43, 0.13], 0.045, 4).scale(1, 1, 0.6).translate(0, 0, 0.02), SKIN, head);
    R.add(ell(sx * 0.2, 1.6, 0.14, 0.03, 0.03, 0.03, 4, 3), DOT, skin);
    R.add(ell(sx * 0.26, 1.5, 0.12, 0.025, 0.025, 0.025, 4, 3), DOT, skin);
  }
  // hair: cap + long braid down the back
  R.add(ell(0, 2.33, 0.06, 0.2, 0.17, 0.21, 10, 6), HAIR, head);
  R.add(tube([[0, 2.34, 0.2, 0.08, 0.08], [0, 2.12, 0.32, 0.075, 0.075], [0, 1.7, 0.33, 0.07, 0.065], [0, 1.2, 0.29, 0.06, 0.055],
    [0.02, 0.78, 0.26, 0.045, 0.04], [0.03, 0.48, 0.24, 0.02, 0.02]], { n: 6, seg: 2, ref: [0, 0, -1] }), HAIR, skin);
  for (const y of [1.9, 1.45, 1.0]) R.add(ring(0.0 + (y < 1.1 ? 0.02 : 0), y, y > 1.6 ? 0.325 : 0.31, 0.075, 0.03, 1, 1, 8), [S.beads, 0.25], skin);
  if (S.braids) for (const sx of [-1, 1]) {
    R.add(tube([[sx * 0.17, 2.3, 0.05, 0.035, 0.035], [sx * 0.22, 1.95, 0.14, 0.03, 0.03], [sx * 0.24, 1.6, 0.16, 0.02, 0.02]], { n: 5, seg: 2, ref: [0, 0, -1] }), HAIR, head);
    R.add(ell(sx * 0.24, 1.62, 0.16, 0.035, 0.05, 0.035, 6, 4), [S.beads, 0.3], head);
  }
  if (S.band) R.add(ring(0, 2.33, 0.02, 0.218, 0.038, 1, 1.1, 14), [S.band, 0.15], head);
  if (S.crest) {
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.32, c = i % 2 ? S.feather : S.band;
      const U = [Math.sin(a), Math.cos(a), 0.25], V = [Math.cos(a), -Math.sin(a), 0];
      R.add(plate([[0, 0], [0.2, 0.06], [0.5 - Math.abs(i - 2) * 0.08, 0], [0.2, -0.06]], 0.025, frameMap([Math.sin(a) * 0.12, 2.42, 0.14], U, V, [0, 0, 1])), c, head);
    }
    R.add(plate([[0, 0], [0.05, -0.18], [0, -0.38], [-0.05, -0.18]], 0.02, frameMap([0.05, 1.95, 0.36], [1, 0, 0], [0, 1, 0.1], [0, 0, 1])), S.band, skin);
  }
  if (S.feather && !S.crest) R.add(plate([[0, 0], [0.05, -0.22], [0, -0.42], [-0.05, -0.22]], 0.02, frameMap([0.2, 2.3, 0.1], [0.3, 0, 0.9], [0.15, 1, 0.1], [1, 0, 0])), S.feather, head);
  // arms: left holds the bow forward, right draws the string
  const arm = (k) => R.add(tube(k, { n: 7, seg: 2 }), body, skin);
  arm([[-0.33, 1.56, -0.04, 0.1, 0.1], [-0.47, 1.48, -0.45, 0.085, 0.085], [-0.48, 1.46, -0.84, 0.07, 0.07], [-0.47, 1.46, -0.97, 0.06, 0.06]]);
  arm([[0.33, 1.56, -0.04, 0.1, 0.1], [0.55, 1.6, 0.2, 0.085, 0.085], [0.22, 1.62, -0.06, 0.07, 0.07], [-0.06, 1.6, -0.14, 0.06, 0.06]]);
  R.add(ell(-0.47, 1.46, -1.04, 0.07, 0.085, 0.075, 6, 5), SKIN, skin);
  R.add(ell(-0.1, 1.6, -0.17, 0.07, 0.08, 0.07, 6, 5), SKIN, skin);
  for (const sx of [-1, 1]) {
    R.add(ell(sx * 0.33, 1.57, -0.04, 0.13, 0.12, 0.13, 8, 5), body, skin);

  }
  R.add(new THREE.TorusGeometry(0.095, 0.025, 4, 8).translate(-0.41, 1.52, -0.27), [S.armband, 0.2], skin);
  // quiver on the back (diagonal), with fletchings
  R.add(rod([-0.12, 0.55, 0.3], [0.3, 1.75, 0.34], 0.09, 0.1, 6), (x, y) => (y > 1.6 || (y > 0.95 && y < 1.05) ? S.armband : '#6a4426'), skin);
  for (const [ox, oz] of [[0, 0], [0.06, 0.05], [-0.05, 0.04]]) R.add(plate([[0, 0], [0.18, 0.04], [0.24, 0.12], [0.04, 0.1]], 0.015, frameMap([0.3 + ox, 1.72, 0.34 + oz], [0.33, 0.94, 0], [-0.94, 0.33, 0], [0, 0, 1])), S.feather || '#e8e2d2', skin);
  // bow + string + arrow
  const bowK = [[-0.33, 0.3, -0.74, 0.03, 0.03], [-0.41, 0.88, -0.98, 0.042, 0.042], [-0.47, 1.46, -1.08, 0.055, 0.055], [-0.55, 2.04, -0.98, 0.042, 0.042], [-0.63, 2.62, -0.74, 0.03, 0.03]];
  R.add(tube(bowK, { n: 6, seg: 3 }), (x, y) => (Math.abs(y - 1.46) < 0.14 ? S.accent ?? '#d0a040' : Math.abs(y - 1.46) > 1.0 ? S.beads : '#6a4424'), skin);
  R.add(rod([-0.63, 2.62, -0.74], [-0.12, 1.6, -0.15], 0.012, 0.012, 3), '#e8e2d2', skin);
  R.add(rod([-0.33, 0.3, -0.74], [-0.12, 1.6, -0.15], 0.012, 0.012, 3), '#e8e2d2', skin);
  R.add(rod([-0.1, 1.6, -0.1], [-0.55, 1.5, -1.75], 0.02, 0.02, 4), '#3a2a1a', skin);
  R.add(spike([-0.55, 1.5, -1.75], [-0.6, 1.49, -1.95], 0.04, 4), ['#d8e0e4', 0.15], skin);
  R.add(plate([[0, 0], [0.22, 0.02], [0.3, 0.09], [0.06, 0.08]], 0.01, frameMap([-0.12, 1.6, -0.12], [-0.26, -0.06, -0.96], [0, 1, 0], [1, 0, 0])), S.feather || S.beads, skin);
  // legs straddling the beast
  for (const sx of [-1, 1]) {
    R.add(tube([[sx * 0.15, 0.1, 0.0, 0.13, 0.13], [sx * (W * 0.7 + 0.12), 0.0, -0.3, 0.13, 0.12], [sx * (W + 0.12), -0.38 * drop, -0.48, 0.11, 0.1],
      [sx * (W + 0.1), -0.85 * drop, -0.22, 0.08, 0.08], [sx * (W + 0.04), -1.22 * drop, 0.0, 0.06, 0.06]], { n: 7, seg: 2 }), body, skin);
    R.add(ell(sx * (W + 0.04), -1.3 * drop, 0.1, 0.07, 0.06, 0.16, 6, 4), SKIN, skin);
  }
  // loincloth, belt, necklace
  R.add(ring(0, 0.3, 0.05, 0.27, 0.04, 1, 0.78, 12), S.cloth, skin);
  R.add(plate([[-0.17, 0], [0.17, 0], [0.12, -0.42], [-0.12, -0.42]], 0.03, frameMap([0, 0.3, 0.25], [1, 0, 0], [0, 0.85, 0.5], [0, -0.5, 0.85])), S.cloth, skin);
  R.add(plate([[-0.14, 0], [0.14, 0], [0.1, -0.3], [-0.1, -0.3]], 0.03, frameMap([0, 0.3, -0.16], [1, 0, 0], [0, 0.6, 0.8], [0, -0.8, 0.6])), S.cloth, skin);
  if (S.necklace) R.add(ring(0, 1.64, -0.06, 0.17, 0.028, 1, 0.9, 12).rotateX(0), [S.necklace, 0.2], skin);
  R.mtx = prev;
  const k = sc;
  return { nose: new THREE.Vector3(-0.6 * k, 1.49 * k + 0.15, -1.95 * k) };
}

// ============================================================ Flyers: ikran (mountain banshee) & toruk (great leonopteryx)
function buildFlyer(R, toruk, S) {
  const k = toruk ? 1.55 : 1, bw = toruk ? 1.32 : 1, dz = toruk ? 0.55 : 0, dy = toruk ? -0.22 : 0;
  R.mtx = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(0, dy, dz));
  const C = toruk
    ? { skin: '#c8301a', pattern: '#141012', accent: '#ffc02a', membrane: '#f27a1a', belly: '#f0a050', dark: '#1a0806', blue: '#2a50c8' }
    : S;
  // ---- bones
  R.bone('root', null, [0, -dy, -dz]);
  R.bone('neck', 'root', [0, -0.5, -1.25]);
  const hz = toruk ? -2.55 : -3.05, hy = toruk ? -0.25 : -0.15;
  R.bone('head', 'neck', [0, hy, hz]);
  R.bone('jaw', 'head', [0, hy - 0.15, hz - 0.1]);
  R.bone('tail1', 'root', [0, -0.6, 3.0]);
  R.bone('tail2', 'tail1', [0, -0.52, 4.6]);
  R.bone('tail3', 'tail2', [0, -0.45, 6.0]);
  for (const s of ['R', 'L']) {
    const sx = s === 'R' ? 1 : -1;
    R.bone('wing1' + s, 'root', [sx * 0.55, -0.42, -0.25]);
    R.bone('wing2' + s, 'wing1' + s, [sx * 3.1, -0.24, -0.7]);
    R.bone('rwing' + s, 'root', [sx * 0.45, -0.6, 2.35]);
  }
  // ---- paints
  const bodyP = (x, y, z, nx, ny) => {
    if (ny < -0.45) return C.belly;
    if (toruk) {
      const band = fract(z * 0.62 + Math.abs(x) * 0.25);
      if (ny > -0.1 && band < 0.24) return C.pattern;
      if (ny > 0.55 && band > 0.5 && band < 0.6) return C.accent;
      return C.skin;
    }
    const band = fract(z * 0.9 + Math.abs(x) * 0.45);
    if (ny > -0.15 && band < 0.3) return C.pattern;
    return C.skin;
  };
  // ---- body, neck, tail
  const B = (x, y, z, rx, ry) => [x, y, z, rx * bw, ry * bw];
  const spBody = spine([B(0, -0.45, -1.55, 0.36, 0.38), B(0, -0.55, -0.85, 0.6, 0.6), B(0, -0.68, 0.2, 0.78, 0.7), B(0, -0.72, 1.3, 0.68, 0.6),
    B(0, -0.66, 2.4, 0.48, 0.44), B(0, -0.6, 3.25, 0.3, 0.29)], { seg: 3, bot: 0.92 });
  const bodySkin = (x, y, z) => (z > 2.4 ? chain([['root', -99], ['tail1', 3.0]], z, 0.4) : [['root', 1]]);
  R.add(tube(spBody, { n: 12 }), bodyP, bodySkin);
  dots(R, spBody, [[0.3, 0.15], [0.42, 0.1], [0.54, 0.05], [0.66, 0.0], [0.78, -0.05], [0.9, -0.1]], 0.075, bodySkin);
  const nz = toruk ? 0.82 : 1;
  const spNeck = spine([B(0, -0.47, -1.15, 0.4, 0.42), B(0, -0.4, -1.15 - 0.75 * nz, 0.3, 0.33), B(0, (-0.4 + hy) / 2 - 0.05, -1.15 - 1.45 * nz, 0.25, 0.28), B(0, hy - 0.02, hz - 0.1, 0.24, 0.27)], { seg: 3 });
  const neckSkin = (x, y, z) => chain([['head', -99], ['neck', hz + 0.35], ['root', -1.3]], z, 0.3);
  R.add(tube(spNeck, { n: 10 }), bodyP, neckSkin);
  dots(R, spNeck, [[0.2, 0.3], [0.45, 0.3], [0.7, 0.3]], 0.06, neckSkin);
  const spTail = spine([B(0, -0.6, 3.0, 0.32, 0.3), B(0, -0.55, 4.2, 0.21, 0.19), B(0, -0.48, 5.4, 0.13, 0.12), B(0, -0.43, 6.6, 0.08, 0.07), B(0, -0.41, 7.6, 0.03, 0.03)], { seg: 3 });
  const tailSkin = (x, y, z) => chain([['tail1', -99], ['tail2', 4.6], ['tail3', 6.0]], z, 0.45);
  R.add(tube(spTail, { n: 8 }), bodyP, tailSkin);
  dots(R, spTail, [[0.15, Math.PI / 2], [0.32, Math.PI / 2], [0.5, Math.PI / 2]], 0.055, tailSkin);
  // tail fin (vertical keel)
  const tfin = [[6.0, -0.38], [6.75, 0.3], [7.25, 0.45], [7.95, -0.38], [7.3, -0.98], [6.7, -0.85]];
  R.add(plate(tfin, 0.05, mapZY(0)), (x, y, z) => (z > 7.55 ? [GLOW, 0.8] : fract(z * 1.6) < 0.45 ? C.pattern : C.accent), 'tail3');
  // spinal ridge
  for (let i = 0; i < 7; i++) {
    const z = 0.8 + i * 0.55, y = -0.68 + 0.68 * bw - i * 0.05 - (i > 3 ? 0.08 : 0);
    R.add(spike([0, y - 0.05, z], [0, y + 0.2, z + 0.3], 0.07, 4), i % 2 ? C.pattern : C.accent, z > 2.9 ? 'tail1' : 'root');
  }
  // hind legs tucked back under the tail
  for (const sx of [-1, 1]) {
    R.add(tube([[sx * 0.35, -0.95, 2.2, 0.2, 0.2], [sx * 0.48, -1.18, 2.85, 0.14, 0.13], [sx * 0.44, -1.12, 3.55, 0.08, 0.08], [sx * 0.42, -1.08, 3.85, 0.06, 0.06]], { n: 7, seg: 2 }), C.skin, 'root');
    for (const ox of [-0.08, 0.08]) R.add(spike([sx * 0.42 + ox, -1.08, 3.85], [sx * 0.42 + ox * 1.6, -1.15, 4.15], 0.035, 4), '#e8dcc0', 'root');
  }
  // ---- head
  if (toruk) torukHead(R, [0, hy, hz], C); else ikranHead(R, [0, hy, hz], C);
  // ---- front wings
  const Sh = [0.55, -0.42, -0.25], El = [3.1, -0.24, -0.72], Wr = [4.7, -0.13, -0.45], Tp = [7.0, -0.05, 1.2];
  const Lp = [[0.62, -0.46, -0.1], El, Wr, Tp];
  const Tr = toruk
    ? [[0.6, -0.62, 2.25], [2.0, -0.42, 2.0], [3.3, -0.3, 2.65], [4.5, -0.2, 2.1], [5.5, -0.12, 2.35], [6.3, -0.08, 1.75], Tp]
    : [[0.6, -0.62, 2.15], [2.2, -0.42, 1.85], [3.4, -0.3, 2.45], [4.6, -0.2, 1.9], [5.6, -0.12, 2.15], [6.4, -0.07, 1.55], Tp];
  const wingSkin = s => (x, y, z) => {
    const ax = Math.abs(x);
    const w = chain([['wing1' + s, -99], ['wing2' + s, 3.0]], ax, 0.6);
    const kb = 1 - sm(0.62, 1.5, ax);   // root stays glued to the flank
    return kb > 0 ? [['root', kb], ...w.map(e => [e[0], e[1] * (1 - kb)])] : w;
  };
  const memP = (x, y, z, nx, ny, nz, s, c) => {
    const ax = Math.abs(x);
    if (c > 0.9) return C.dark;
    if (c < 0.13) return C.skin;
    if (toruk) {
      const b = fract(ax * 0.48 + 0.15);
      if (b < 0.15) return C.pattern;
      if (ax < 1.7 && c > 0.25 && c < 0.7) return C.blue;
      return c < 0.42 ? C.skin : c < 0.72 ? C.membrane : C.accent;
    }
    const b = fract(ax * 0.55 + 0.1);
    if (b < 0.22) return C.pattern;
    if (b < 0.3) return C.accent;
    if (c > 0.74) return C.dark2 || C.skin;
    return C.membrane;
  };
  const memT = (...a) => { const r = memP(...a); return Array.isArray(r) ? r : [r, 0.09]; };
  const mem = sheet(Lp, Tr, { C: 5, step: 0.36, thick: 0.05, camber: (s, c) => [0, -0.16 * Math.sin(Math.PI * c) * (1 - s * 0.6) + 0.05 * s, 0] });
  sym(R, mem, memT, wingSkin);
  const armP = (x) => (fract(Math.abs(x) * 0.55 + 0.1) < 0.22 ? C.pattern : C.skin);
  sym(R, tube([[...Sh, 0.24, 0.18], [...El, 0.15, 0.12], [...Wr, 0.12, 0.1], [5.9, -0.09, 0.4, 0.07, 0.06], [...Tp, 0.015, 0.015]], { n: 7, seg: 3 }), armP, wingSkin);
  // struts (wing fingers) + wrist claw + shoulder muscle
  for (const end of [Tr[2], Tr[4]]) sym(R, rod([Wr[0], Wr[1] + 0.03, Wr[2]], [end[0], end[1] + 0.03, end[2]], 0.06, 0.02, 4), C.dark, wingSkin);
  sym(R, rod([El[0], El[1] + 0.02, El[2]], [Tr[1][0], Tr[1][1] + 0.03, Tr[1][2]], 0.05, 0.02, 4), C.dark, wingSkin);
  sym(R, spike([Wr[0], Wr[1], Wr[2]], [Wr[0] + 0.05, Wr[1] - 0.1, Wr[2] - 0.45], 0.07, 4), '#e8dcc0', wingSkin);
  sym(R, ell(0.62, -0.42, 0.0, 0.3, 0.26, 0.6, 8, 6), C.skin, wingSkin);
  // glowing dots along the wing arm
  for (const t of [0.18, 0.32, 0.46, 0.6, 0.74]) {
    const p = [lerp(El[0], Tp[0], t), lerp(El[1], Tp[1], t) + 0.1, lerp(El[2], Tp[2], t) + 0.12];
    sym(R, ell(p[0], p[1], p[2], 0.06, 0.05, 0.06, 5, 4), [GLOW, 1], wingSkin);
  }
  // ---- rear wings
  const rL = [[0.45, -0.6, 2.35], [1.6, -0.5, 2.45], [2.9, -0.42, 3.1]], rT = [[0.4, -0.62, 3.55], [1.7, -0.5, 3.65], [2.9, -0.42, 3.1]];
  const rSkin = s => (x) => { const kb = 1 - sm(0.45, 1.0, Math.abs(x)); return [['root', kb], ['rwing' + s, 1 - kb]]; };
  sym(R, sheet(rL, rT, { C: 3, step: 0.4, thick: 0.045 }), (x, y, z, nx, ny, nz, s, c) => (c < 0.15 ? C.skin : c > 0.85 ? C.dark : fract(Math.abs(x) * 0.8) < 0.3 ? C.pattern : C.membrane), rSkin);
  sym(R, tube([[0.45, -0.58, 2.35, 0.12, 0.1], [1.6, -0.48, 2.45, 0.07, 0.06], [2.9, -0.42, 3.1, 0.015, 0.015]], { n: 6, seg: 2 }), C.skin, rSkin);
  R.mtx = null;
  // rider sits at the neck base
  const g = addRider(R, S.id, { legW: toruk ? 0.95 : 0.66, legDrop: toruk ? 1.05 : 0.9 });
  const v = (x, y, z) => new THREE.Vector3(x, y + dy, z + dz).multiplyScalar(k);
  return {
    nozzles: [v(-0.32, -0.62, 3.1), v(0.32, -0.62, 3.1)],
    tips: [v(-7.0, -0.05, 1.2), v(7.0, -0.05, 1.2)],
    guns: { nose: g.nose, left: v(-2.4, -0.28, -0.7), right: v(2.4, -0.28, -0.7) },
    radius: toruk ? 5 : 4,
  };
}

function ikranHead(R, H, C) {
  const [hx, hy, hz] = H;
  const K = (x, y, z, rx, ry) => [hx + x, hy + y, hz + z, rx, ry];
  const headP = (x, y, z, nx, ny) => {
    const d = hz - z;                      // distance forward of head base
    if (d > 2.25) return '#e6dcc4';        // bony beak tip
    if (ny > 0.35 && fract(d * 1.7) < 0.35) return C.pattern;
    if (ny < -0.4) return C.belly;
    return C.skin;
  };
  R.add(tube([K(0, 0.05, 0.2, 0.2, 0.22), K(0, 0.13, -0.25, 0.3, 0.31), K(0, 0.1, -0.75, 0.24, 0.26), K(0, 0.0, -1.4, 0.15, 0.17),
    K(0, -0.1, -2.1, 0.08, 0.09), K(0, -0.17, -2.85, 0.015, 0.02)], { n: 10, seg: 3, bot: 0.75 }), headP, 'head');
  R.add(tube([K(0, -0.16, -0.05, 0.19, 0.1), K(0, -0.25, -0.9, 0.14, 0.08), K(0, -0.3, -1.8, 0.075, 0.05), K(0, -0.3, -2.5, 0.015, 0.015)],
    { n: 8, seg: 3 }), (x, y, z) => (hz - z > 2.0 ? '#e6dcc4' : C.belly), 'jaw');
  // backward-swept crest + chin keel
  R.add(plate([[-1.25, 0.12], [-0.55, 0.6], [0.25, 0.8], [1.2, 0.62], [0.45, 0.32], [-0.2, 0.2]].map(p => [hz + p[0], hy + p[1]]), 0.07, mapZY(0)),
    (x, y, z) => { const d = z - hz; if (d > 0.9) return C.accent; return fract(d * 1.6) < 0.4 ? C.pattern : C.skin; }, 'head');
  R.add(plate([[-1.55, -0.28], [-2.2, -0.3], [-2.0, -0.62], [-1.75, -0.52]].map(p => [hz + p[0], hy + p[1]]), 0.06, mapZY(0)), C.accent, 'jaw');
  for (const sx of [-1, 1]) {
    R.add(ell(hx + sx * 0.23, hy + 0.14, hz - 0.5, 0.06, 0.06, 0.08, 6, 4), ['#ffe040', 0.7], 'head');
    R.add(ell(hx + sx * 0.18, hy + 0.07, hz - 0.78, 0.04, 0.04, 0.05, 6, 4), ['#ffe040', 0.7], 'head');
    for (let i = 0; i < 6; i++) {
      const z = hz - 0.65 - i * 0.28, x = sx * (0.15 - i * 0.017), y = hy - 0.12 - i * 0.03;
      R.add(spike([x, y + 0.02, z], [x, y - 0.13, z - 0.03], 0.03, 3), '#f4eedc', 'head');
    }
    // glowing cheek dots
    R.add(ell(hx + sx * 0.25, hy - 0.02, hz - 0.2, 0.05, 0.05, 0.05, 5, 4), [GLOW, 1], 'head');
  }
}

function torukHead(R, H, C) {
  const [hx, hy, hz] = H;
  const K = (x, y, z, rx, ry) => [hx + x, hy + y, hz + z, rx, ry];
  const headP = (x, y, z, nx, ny) => {
    const d = hz - z;
    if (d > 2.5) return '#2a1e1a';
    if (ny > 0.3 && fract(d * 1.3) < 0.3) return C.pattern;
    if (ny > 0.3 && fract(d * 1.3) < 0.42) return C.blue;
    if (ny < -0.4) return C.accent;
    return C.skin;
  };
  R.add(tube([K(0, 0.0, 0.25, 0.3, 0.32), K(0, 0.15, -0.25, 0.44, 0.42), K(0, 0.12, -0.95, 0.36, 0.33), K(0, -0.02, -1.75, 0.24, 0.22),
    K(0, -0.12, -2.5, 0.14, 0.12), K(0, -0.2, -3.05, 0.03, 0.03)], { n: 10, seg: 3, bot: 0.7 }), headP, 'head');
  // massive lower jaw
  R.add(tube([K(0, -0.22, 0.0, 0.32, 0.16), K(0, -0.38, -0.9, 0.28, 0.17), K(0, -0.42, -1.9, 0.18, 0.12), K(0, -0.38, -2.75, 0.04, 0.04)],
    { n: 8, seg: 3 }), (x, y, z, nx, ny) => (hz - z > 2.4 ? '#2a1e1a' : ny < -0.5 ? (fract((hz - z) * 1.3) < 0.3 ? C.pattern : C.accent) : fract((hz - z) * 1.3) < 0.3 ? C.pattern : C.skin), 'jaw');
  // great sail crest sweeping back over the neck
  const crest = [[-1.5, 0.2], [-0.85, 0.7], [-0.1, 1.15], [0.75, 1.38], [1.45, 1.22], [1.05, 0.8], [0.45, 0.45], [-0.2, 0.28]];
  R.add(plate(crest.map(p => [hz + p[0], hy + p[1]]), 0.08, mapZY(0)), (x, y, z) => {
    const d = z - hz, b = fract(d * 1.5 - (y - hy) * 0.9);
    if (y - hy > 1.12) return C.pattern;
    if (b < 0.3) return C.pattern;
    if (b < 0.4) return C.blue;
    return y - hy > 0.65 ? C.skin : C.accent;
  }, 'head');
  // chin keel
  R.add(plate([[-1.6, -0.4], [-2.5, -0.38], [-2.3, -0.85], [-1.95, -0.8]].map(p => [hz + p[0], hy + p[1]]), 0.07, mapZY(0)), (x, y) => (y - hy < -0.7 ? C.pattern : C.skin), 'jaw');
  for (const sx of [-1, 1]) {
    R.add(ell(hx + sx * 0.36, hy + 0.18, hz - 0.62, 0.08, 0.07, 0.1, 6, 4), ['#ffe040', 0.8], 'head');
    R.add(ell(hx + sx * 0.3, hy + 0.1, hz - 0.95, 0.05, 0.05, 0.06, 6, 4), ['#ffe040', 0.8], 'head');
    for (let i = 0; i < 7; i++) {
      const z = hz - 0.75 - i * 0.28, x = sx * (0.22 - i * 0.02), y = hy - 0.14 - i * 0.02;
      R.add(spike([x, y + 0.02, z], [x, y - 0.2, z - 0.04], 0.045, 3), '#f4eedc', 'head');
    }
    // cheek horns
    R.add(spike([sx * 0.35, hy + 0.05, hz + 0.05], [sx * 0.75, hy + 0.1, hz + 0.75], 0.09, 4), C.dark, 'head');
    R.add(ell(hx + sx * 0.38, hy - 0.05, hz - 0.3, 0.06, 0.06, 0.06, 5, 4), [GLOW, 1], 'head');
  }
}

// ============================================================ Pali (direhorse)
function buildPali(R, S) {
  const HIDE = '#34485f', STRIPE = '#78acd8', PLATE = '#46596f', BELLY = '#45536a', HOOF = '#16181e';
  R.bone('root', null, [0, 0, 0]);
  R.bone('neck1', 'root', [0, -0.55, -1.85]);
  R.bone('neck2', 'neck1', [0, 0.75, -3.05]);
  R.bone('head', 'neck2', [0, 2.0, -3.85]);
  R.bone('tail', 'root', [0, -0.75, 3.45]);
  R.bone('antL', 'head', [-0.11, 2.36, -3.8]);
  R.bone('antR', 'head', [0.11, 2.36, -3.8]);
  const LZ = [-1.35, -0.05, 2.45];
  for (const s of ['L', 'R']) for (let i = 0; i < 3; i++) {
    const sx = s === 'R' ? 1 : -1, hind = i === 2;
    R.bone(`${s}${i}a`, 'root', [sx * 0.6, -1.05, LZ[i]]);
    R.bone(`${s}${i}b`, `${s}${i}a`, [sx * 0.64, -2.9, LZ[i] + (hind ? 0.45 : 0.12)]);
  }
  const hideP = (x, y, z, nx, ny) => {
    if (ny < -0.6) return BELLY;
    const s = Math.sin(z * 2.5 + y * 1.1 + Math.abs(x) * 0.6);
    if (s > 0.72 && y > -1.7 && z < 3.0) return STRIPE;
    return HIDE;
  };
  // barrel body
  const spBody = spine([[0, -0.95, -2.2, 0.35, 0.45], [0, -0.82, -1.55, 0.7, 0.92], [0, -0.78, -0.4, 0.8, 0.97], [0, -0.8, 0.9, 0.78, 0.93],
    [0, -0.66, 2.2, 0.8, 0.93], [0, -0.75, 3.2, 0.58, 0.68], [0, -0.95, 3.62, 0.18, 0.2]], { seg: 3, bot: 0.92 });
  R.add(tube(spBody, { n: 12 }), hideP, 'root');
  dots(R, spBody, [[0.2, -0.25], [0.3, -0.3], [0.4, -0.3], [0.5, -0.3], [0.6, -0.28], [0.7, -0.25], [0.35, 0.25, 0.06], [0.55, 0.25, 0.06]], 0.075, 'root');
  // neck (long, slender, arching up) + head
  const spNeck = spine([[0, -0.75, -1.65, 0.52, 0.64], [0, -0.1, -2.45, 0.38, 0.46], [0, 0.75, -3.1, 0.3, 0.35], [0, 1.55, -3.55, 0.25, 0.28], [0, 2.08, -3.82, 0.22, 0.24]], { seg: 3 });
  const neckSkin = (x, y) => chain([['root', -99], ['neck1', -0.45], ['neck2', 0.7], ['head', 1.9]], y, 0.35);
  R.add(tube(spNeck, { n: 10 }), hideP, neckSkin);
  dots(R, spNeck, [[0.25, 0.1], [0.4, 0.1], [0.55, 0.1], [0.7, 0.1], [0.85, 0.1]], 0.06, neckSkin);
  const headP = (x, y, z, nx, ny) => (ny > 0.4 && fract(z * 4) < 0.4 ? STRIPE : y < 1.25 ? '#1e2a3a' : HIDE);
  R.add(tube([[0, 2.32, -3.62, 0.12, 0.12], [0, 2.16, -3.9, 0.24, 0.27], [0, 1.86, -4.3, 0.2, 0.22], [0, 1.46, -4.75, 0.14, 0.16],
    [0, 1.15, -5.05, 0.1, 0.12], [0, 1.0, -5.18, 0.04, 0.05]], { n: 10, seg: 2 }), headP, 'head');
  R.add(dome(0, 2.22, -4.0, 0.22, 0.14, 0.32, 8), PLATE, 'head');
  for (const sx of [-1, 1]) {
    R.add(ell(sx * 0.2, 2.08, -4.05, 0.05, 0.045, 0.06, 6, 4), ['#ffd040', 0.6], 'head');
    R.add(ell(sx * 0.17, 1.93, -4.25, 0.035, 0.035, 0.045, 6, 4), ['#ffd040', 0.6], 'head');
    R.add(ell(sx * 0.15, 1.6, -4.55, 0.04, 0.04, 0.04, 5, 4), [GLOW, 1], 'head');
  }
  // antennae (queues): curved tendrils with feathery leaflets and glowing tips
  for (const s of ['L', 'R']) {
    const sx = s === 'R' ? 1 : -1;
    const keys = [[sx * 0.11, 2.36, -3.8], [sx * 0.22, 2.9, -3.3], [sx * 0.3, 3.05, -2.45], [sx * 0.32, 2.7, -1.6], [sx * 0.3, 2.2, -1.05]];
    R.add(tube(keys.map((p, i) => [...p, 0.05 - i * 0.008, 0.05 - i * 0.008]), { n: 5, seg: 4 }), '#1c2636', 'ant' + s);
    const curve = new THREE.CatmullRomCurve3(keys.map(p => new THREE.Vector3(...p)));
    for (let i = 1; i <= 12; i++) {
      const t = i / 12.5, p = curve.getPoint(t), tg = curve.getTangent(t);
      const lat = new THREE.Vector3(sx, 0, 0).addScaledVector(tg, -tg.x * sx).normalize();
      const len = 0.16 + Math.sin(t * Math.PI) * 0.12;
      const W = new THREE.Vector3().crossVectors(tg, lat);
      R.add(plate([[0, 0], [len * 0.6, 0.06], [len, -0.06], [len * 0.4, -0.05]], 0.02,
        frameMap([p.x, p.y, p.z], [lat.x * 0.9 + tg.x * 0.4, lat.y * 0.9 + tg.y * 0.4, lat.z * 0.9 + tg.z * 0.4], [tg.x, tg.y, tg.z], [W.x, W.y, W.z])),
      i > 9 ? [GLOW, 0.6] : i % 3 === 0 ? ['#7fd8ff', 0.3] : '#8fb6d8', 'ant' + s);
    }
    R.add(ell(...keys[4], 0.07, 0.07, 0.07, 6, 4), [GLOW, 0.8], 'ant' + s);
  }
  // armour plates along the spine (behind the seat) and the neck crest
  for (let i = 0; i < 5; i++) {
    const z = 0.65 + i * 0.68, y = i < 4 ? 0.12 - i * 0.02 : -0.05;
    R.add(dome(0, y, z, 0.62 - i * 0.04, 0.2, 0.42, 10), (x, yy) => (yy - y < 0.06 ? STRIPE : PLATE), 'root');
  }
  for (let i = 0; i < 4; i++) {
    const t = 0.15 + i * 0.22, z = lerp(-1.95, -3.6, t), y = lerp(-0.1, 2.15, t) + 0.15;
    R.add(spike([0, y, z], [0, y + 0.22, z + 0.35], 0.12, 4), STRIPE, i < 2 ? 'neck1' : 'neck2');
  }
  // harness band at the neck base
  R.add(new THREE.TorusGeometry(0.5, 0.06, 4, 14).scale(1, 1.15, 1).rotateX(0.75).translate(0, -0.35, -1.95), S.accent, 'neck1');
  // tail
  R.add(tube([[0, -0.7, 3.4, 0.16, 0.18], [0, -1.05, 3.95, 0.12, 0.13], [0, -1.6, 4.35, 0.08, 0.1], [0, -2.15, 4.5, 0.05, 0.02]], { n: 7, seg: 3 }), hideP, 'tail');
  // six legs
  for (const s of ['L', 'R']) for (let i = 0; i < 3; i++) {
    const sx = s === 'R' ? 1 : -1, z = LZ[i], hind = i === 2;
    const kz = z + (hind ? 0.45 : 0.12);
    const legP = (x, y) => (y < -4.55 ? HOOF : Math.sin(y * 3.2) > 0.75 && y > -4.2 ? STRIPE : HIDE);
    R.add(tube([[sx * 0.55, -0.85, z, 0.32, 0.4], [sx * 0.6, -1.6, z + (hind ? 0.25 : 0.04), 0.26, 0.3], [sx * 0.63, -2.35, kz - 0.02, 0.16, 0.17],
      [sx * 0.64, -2.9, kz, 0.12, 0.13], [sx * 0.64, -3.6, z + 0.06, 0.085, 0.09], [sx * 0.64, -4.45, z - 0.02, 0.075, 0.08],
      [sx * 0.64, -4.72, z - 0.07, 0.11, 0.12], [sx * 0.64, -4.92, z - 0.1, 0.14, 0.13]], { n: 8, seg: 2, ref: [0, 0, -1] }), legP,
    (x, y) => chain([[`${s}${i}b`, -99], [`${s}${i}a`, -2.85]], y, 0.25));
  }
  const g = addRider(R, S.id, { legW: 0.78, legDrop: 1 });
  return {
    nozzles: [new THREE.Vector3(-0.45, -0.5, 3.3), new THREE.Vector3(0.45, -0.5, 3.3)],
    tips: [new THREE.Vector3(-0.85, -0.8, 0.6), new THREE.Vector3(0.85, -0.8, 0.6)],
    guns: { nose: g.nose, left: new THREE.Vector3(-1.0, 0.4, -1.4), right: new THREE.Vector3(1.0, 0.4, -1.4) },
    radius: 3.6, footY: -4.95,
  };
}

// ============================================================ Thanator (palulukan)
function buildThanator(R, S) {
  const HIDE = '#17181f', STR = '#303a50', PLATE = '#2c303c', EDGE = '#5a6684', PIT = ['#4cc4ff', 0.75];
  R.bone('root', null, [0, 0, 0]);
  R.bone('hips', 'root', [0, -0.75, 1.2]);
  R.bone('neck', 'root', [0, -0.75, -1.9]);
  R.bone('head', 'neck', [0, -0.5, -2.65]);
  R.bone('jaw', 'head', [0, -0.85, -2.85]);
  R.bone('tail1', 'hips', [0, -0.6, 3.1]);
  R.bone('tail2', 'tail1', [0, -0.5, 4.6]);
  R.bone('tail3', 'tail2', [0, -0.36, 6.0]);
  const LZ = [-1.35, -0.05, 2.3];
  for (const s of ['L', 'R']) for (let i = 0; i < 3; i++) {
    const sx = s === 'R' ? 1 : -1, hind = i === 2;
    R.bone(`${s}${i}a`, hind ? 'hips' : 'root', [sx * 0.65, -1.0, LZ[i]]);
    R.bone(`${s}${i}b`, `${s}${i}a`, [sx * 0.76, -2.35, LZ[i] + (hind ? 0.4 : 0.08)]);
  }
  const hideP = (x, y, z, nx, ny) => {
    const s = Math.sin(z * 2.6 + Math.abs(x) * 1.2 + y * 0.8);
    return s > 0.68 && ny > -0.5 ? STR : HIDE;
  };
  const bodySkin = (x, y, z) => chain([['root', -99], ['hips', 0.9]], z, 0.65);
  const spBody = spine([[0, -0.8, -2.1, 0.58, 0.62], [0, -0.85, -1.35, 0.95, 0.98], [0, -0.8, -0.2, 0.94, 0.92], [0, -0.8, 1.0, 0.7, 0.72],
    [0, -0.7, 2.2, 0.84, 0.85], [0, -0.72, 3.0, 0.56, 0.56], [0, -0.68, 3.4, 0.22, 0.22]], { seg: 3, bot: 0.9 });
  R.add(tube(spBody, { n: 12 }), hideP, bodySkin);
  dots(R, spBody, [[0.12, -0.15], [0.2, -0.2], [0.28, -0.22], [0.36, -0.22], [0.5, -0.2], [0.6, -0.18], [0.68, -0.15], [0.76, -0.12]], 0.07, bodySkin, PIT);
  const neckSkin = (x, y, z) => chain([['head', -99], ['neck', -2.55], ['root', -1.75]], z, 0.25);
  R.add(tube([[0, -0.8, -1.7, 0.66, 0.7], [0, -0.7, -2.3, 0.54, 0.58], [0, -0.58, -2.75, 0.48, 0.52]], { n: 10, seg: 2 }), hideP, neckSkin);
  // back armour ridge
  for (let i = 0; i < 9; i++) {
    const z = -1.1 + i * 0.5, y = (z < 1.0 ? 0.1 : 0.0) + (i === 0 ? -0.05 : 0);
    if (Math.abs(z) < 0.45) continue;   // leave the seat clear
    R.add(dome(0, y - 0.05, z, 0.34, 0.15, 0.3, 8), (xx, yy) => (yy - y > 0.0 ? PLATE : EDGE), z > 0.9 ? 'hips' : 'root');
  }
  // armoured head: broad skull, heavy jaw
  const skullP = (x, y, z, nx, ny) => (ny > 0.55 ? PLATE : HIDE);
  const spSkull = spine([[0, -0.4, -2.45, 0.5, 0.52], [0, -0.3, -3.0, 0.64, 0.56], [0, -0.42, -3.6, 0.52, 0.42], [0, -0.58, -4.1, 0.36, 0.28],
    [0, -0.68, -4.45, 0.2, 0.16], [0, -0.72, -4.6, 0.07, 0.06]], { seg: 3, top: 0.85, bot: 0.6 });
  R.add(tube(spSkull, { n: 10 }), skullP, 'head');
  dots(R, spSkull, [[0.3, -0.05], [0.42, -0.1], [0.54, -0.12], [0.66, -0.12]], 0.045, 'head', PIT);
  R.add(tube([[0, -0.88, -2.75, 0.42, 0.22], [0, -0.96, -3.5, 0.34, 0.18], [0, -0.95, -4.15, 0.22, 0.13], [0, -0.92, -4.5, 0.08, 0.06]], { n: 8, seg: 3 }), HIDE, 'jaw');
  R.add(plate([[-0.28, -2.85], [0.28, -2.85], [0.18, -4.3], [-0.18, -4.3]], 0.04, mapXZ(-0.8)), '#8a1c26', 'jaw');
  for (let i = 0; i < 3; i++) R.add(dome(0, -0.06 - i * 0.08, -2.85 - i * 0.5, 0.56 - i * 0.1, 0.17, 0.42, 8), (x, y, z, nx, ny) => (ny > 0.75 ? PLATE : EDGE), 'head');
  for (const sx of [-1, 1]) {
    R.add(spike([sx * 0.42, -0.18, -2.95], [sx * 0.72, -0.1, -2.3], 0.11, 4), EDGE, 'head');   // brow horn
    R.add(ell(sx * 0.42, -0.3, -3.35, 0.08, 0.055, 0.09, 6, 4), ['#a8e8ff', 1.3], 'head');
    R.add(ell(sx * 0.36, -0.38, -3.62, 0.055, 0.045, 0.065, 6, 4), ['#a8e8ff', 1.3], 'head');
    for (let i = 0; i < 5; i++) {
      const z = -3.25 - i * 0.26, x = sx * (0.34 - i * 0.04);
      R.add(spike([x, -0.6, z], [x, -0.84 - (i === 0 ? 0.14 : 0), z - 0.02], 0.04 + (i === 0 ? 0.025 : 0), 3), '#ece6d4', 'head');
      R.add(spike([x * 0.92, -0.86, z + 0.05], [x * 0.92, -0.64, z + 0.03], 0.035, 3), '#ece6d4', 'jaw');
    }
  }
  // sensory quill fan behind the head (each quill has its own bone; it folds back along the neck)
  const NQ = 9, fanC = [0, -0.35, -2.4];
  for (let i = 0; i < NQ; i++) {
    const a = lerp(-1.95, 1.95, i / (NQ - 1));
    const r = [Math.sin(a), Math.cos(a), 0];
    const base = [fanC[0] + r[0] * 0.42, fanC[1] + r[1] * 0.42, fanC[2]];
    R.bone('q' + i, 'head', base);
    const L = 1.25 + Math.cos(a) * 0.6;
    const U = [r[0], r[1], 0.3], tl = Math.hypot(...U); U[0] /= tl; U[1] /= tl; U[2] /= tl;
    const V = [Math.cos(a), -Math.sin(a), 0];
    const Wv = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
    R.add(plate([[0, -0.11], [L * 0.55, -0.17], [L, 0], [L * 0.55, 0.17], [0, 0.11]], 0.04, frameMap(base, U, V, Wv)),
      (x, y, z) => { const d = Math.hypot(x - base[0], y - base[1], z - base[2]); return d > L * 0.8 ? PIT : d > L * 0.42 && d < L * 0.58 ? '#3a5cb0' : '#1c1e28'; }, 'q' + i);
  }
  // tail
  const spTail = spine([[0, -0.65, 3.0, 0.32, 0.32], [0, -0.55, 4.1, 0.2, 0.2], [0, -0.45, 5.2, 0.14, 0.14], [0, -0.35, 6.3, 0.1, 0.1], [0, -0.3, 7.2, 0.06, 0.06], [0, -0.28, 7.6, 0.02, 0.02]], { seg: 3 });
  const tailSkin = (x, y, z) => chain([['hips', -99], ['tail1', 3.0], ['tail2', 4.6], ['tail3', 6.0]], z, 0.45);
  R.add(tube(spTail, { n: 8 }), (x, y, z) => (fract(z * 1.2) < 0.28 ? STR : HIDE), tailSkin);
  dots(R, spTail, [[0.2, Math.PI / 2], [0.4, Math.PI / 2], [0.6, Math.PI / 2], [0.8, Math.PI / 2]], 0.05, tailSkin, PIT);
  // six legs (muscular feline)
  for (const s of ['L', 'R']) for (let i = 0; i < 3; i++) {
    const sx = s === 'R' ? 1 : -1, z = LZ[i], hind = i === 2;
    const kz = z + (hind ? 0.4 : 0.08), a = `${s}${i}a`, b = `${s}${i}b`;
    R.add(tube([[sx * 0.58, -0.7, z + (hind ? -0.1 : 0), 0.46, 0.55], [sx * 0.7, -1.55, z + (hind ? 0.3 : 0.1), 0.36, 0.42], [sx * 0.76, -2.35, kz, 0.24, 0.26],
      [sx * 0.76, -3.2, z - 0.02, 0.18, 0.19], [sx * 0.77, -3.62, z - 0.12, 0.2, 0.17]], { n: 9, seg: 2, ref: [0, 0, -1] }), hideP,
    (x, y) => chain([[b, -99], [a, -2.3]], y, 0.3));
    R.add(ell(sx * 0.77, -3.76, z - 0.3, 0.28, 0.14, 0.4, 8, 5), HIDE, b);
    for (const ox of [-0.13, 0, 0.13]) R.add(spike([sx * 0.77 + ox, -3.8, z - 0.62], [sx * 0.77 + ox * 1.2, -3.92, z - 0.88], 0.045, 3), '#d8d2c4', b);
  }
  const g = addRider(R, S.id, { legW: 0.88, legDrop: 1 });
  return {
    nozzles: [new THREE.Vector3(-0.5, -0.5, 3.1), new THREE.Vector3(0.5, -0.5, 3.1)],
    tips: [new THREE.Vector3(-0.95, -0.75, 0.6), new THREE.Vector3(0.95, -0.75, 0.6)],
    guns: { nose: g.nose, left: new THREE.Vector3(-1.1, 0.2, -1.6), right: new THREE.Vector3(1.1, 0.2, -1.6) },
    radius: 3.6, footY: -3.92,
  };
}

// ============================================================ Skimwing
function buildSkimwing(R, S) {
  const TOP = '#3d6e8c', SPOT = '#1d3a52', BELLY = '#d4dee2', FIN = '#e4572a', BAND = '#f6c64a', RIB = '#4a1610';
  const dy = -0.3;
  R.mtx = new THREE.Matrix4().makeTranslation(0, dy, 0);
  R.bone('root', null, [0, -dy, 0]);
  R.bone('head', 'root', [0, -0.6, -1.75]);
  R.bone('jaw', 'head', [0, -0.8, -2.1]);
  R.bone('tail1', 'root', [0, -0.66, 2.3]);
  R.bone('tail2', 'tail1', [0, -0.7, 3.6]);
  R.bone('tail3', 'tail2', [0, -0.78, 4.8]);
  R.bone('sail', 'root', [0, 0.0, 0.8]);
  for (const s of ['R', 'L']) {
    const sx = s === 'R' ? 1 : -1;
    R.bone('fin1' + s, 'root', [sx * 0.55, -0.72, 0.2]);
    R.bone('fin2' + s, 'fin1' + s, [sx * 2.6, -0.6, 0.4]);
  }
  const bodyP = (x, y, z, nx, ny) => {
    if (ny < -0.3) return BELLY;
    if (ny > -0.1 && hash(Math.round(x * 2.2), Math.round(y * 2.2), Math.round(z * 2.2)) > 0.74) return SPOT;
    return TOP;
  };
  const tailSkin = (x, y, z) => chain([['root', -99], ['tail1', 2.3], ['tail2', 3.6], ['tail3', 4.8]], z, 0.45);
  const bodySkin = (x, y, z) => (z < -1.6 ? chain([['head', -99], ['root', -1.6]], z, 0.25) : tailSkin(x, y, z));
  const spBody = spine([[0, -0.68, -2.0, 0.5, 0.52], [0, -0.6, -1.05, 0.8, 0.86], [0, -0.58, 0.3, 0.86, 0.9], [0, -0.62, 1.6, 0.7, 0.74], [0, -0.66, 2.6, 0.48, 0.52],
    [0, -0.7, 3.5, 0.33, 0.37], [0, -0.75, 4.4, 0.21, 0.24], [0, -0.8, 5.3, 0.11, 0.13], [0, -0.82, 5.85, 0.04, 0.05]], { seg: 3, bot: 0.85 });
  R.add(tube(spBody, { n: 12 }), bodyP, bodySkin);
  dots(R, spBody, [0.1, 0.17, 0.24, 0.31, 0.38, 0.45, 0.52, 0.59, 0.66, 0.73].map(u => [u, -0.05]), 0.07, bodySkin);
  dots(R, spBody, [[0.2, 0.75, 0.06], [0.45, 0.8, 0.06], [0.6, 0.85, 0.05]], 0.06, bodySkin);
  // head: long toothy snout
  R.add(tube([[0, -0.6, -1.7, 0.46, 0.5], [0, -0.52, -2.4, 0.36, 0.37], [0, -0.58, -3.2, 0.2, 0.19], [0, -0.66, -4.05, 0.1, 0.09], [0, -0.7, -4.55, 0.025, 0.025]],
    { n: 10, seg: 3, bot: 0.7 }), (x, y, z, nx, ny) => (ny < -0.3 ? BELLY : ny > 0.4 && fract(z * 2.5) < 0.35 ? SPOT : TOP), 'head');
  R.add(tube([[0, -0.82, -2.1, 0.26, 0.14], [0, -0.86, -3.1, 0.16, 0.1], [0, -0.85, -4.1, 0.07, 0.05], [0, -0.84, -4.55, 0.02, 0.02]], { n: 8, seg: 3 }), BELLY, 'jaw');
  for (const sx of [-1, 1]) {
    R.add(ell(sx * 0.3, -0.42, -2.35, 0.1, 0.09, 0.11, 7, 5), ['#ffc838', 0.6], 'head');
    R.add(spike([sx * 0.22, -0.3, -2.0], [sx * 0.42, -0.1, -1.2], 0.08, 4), FIN, 'head');
    for (let i = 0; i < 7; i++) {
      const z = -2.6 - i * 0.26, x = sx * (0.18 - i * 0.018);
      R.add(spike([x, -0.72, z], [x, -0.86, z - 0.03], 0.025, 3), '#f2eee0', 'head');
    }
  }
  // dorsal sail with spines
  const sailPts = [[0.7, 0.0], [0.95, 1.5], [1.45, 2.05], [2.05, 1.8], [2.65, 1.3], [3.15, 0.55], [3.25, -0.2], [0.75, -0.15]];
  R.add(plate(sailPts, 0.05, mapZY(0)), (x, y, z) => (y > 1.65 ? RIB : fract(z * 1.1 - y * 0.25) < 0.3 ? BAND : FIN), 'sail');
  for (let i = 0; i < 5; i++) {
    const z = 0.85 + i * 0.55, h = [1.55, 2.1, 1.85, 1.35, 0.65][i];
    R.add(rod([0, -0.1, z], [0, h, z + 0.25], 0.06, 0.02, 4), RIB, 'sail');
  }
  // pectoral fin-wings (wave in two segments)
  const Lp = [[0.55, -0.7, -0.6], [2.5, -0.55, -0.75], [4.0, -0.5, -0.3], [5.0, -0.5, 0.6]];
  const Tp = [[0.55, -0.8, 1.3], [2.2, -0.65, 1.8], [3.4, -0.58, 1.65], [4.3, -0.53, 1.5], [5.0, -0.5, 0.6]];
  const finSkin = s => (x) => {
    const ax = Math.abs(x), kb = 1 - sm(0.55, 1.1, ax);
    const w = chain([['fin1' + s, -99], ['fin2' + s, 2.6]], ax, 0.7);
    return [['root', kb], ...w.map(e => [e[0], e[1] * (1 - kb)])];
  };
  sym(R, sheet(Lp, Tp, { C: 5, step: 0.35, thick: 0.05, camber: (s, c) => [0, -0.1 * Math.sin(Math.PI * c), 0] }), (x, y, z, nx, ny, nz, s, c) => {
    const ax = Math.abs(x);
    if (c > 0.88) return RIB;
    if (c < 0.12) return TOP;
    return fract(ax * 0.7) < 0.28 ? BAND : FIN;
  }, finSkin);
  for (const t of [0.25, 0.5, 0.75]) {
    const e = [lerp(Lp[2][0], Tp[2][0], t), -0.58, lerp(Lp[2][2] + 0.4, Tp[3][2], t)];
    sym(R, rod([0.6, -0.68, 0.3], [e[0] + t * 0.8, e[1] + 0.03, e[2]], 0.05, 0.015, 4), RIB, finSkin);
  }
  sym(R, tube([[0.55, -0.68, -0.55, 0.14, 0.1], [2.5, -0.53, -0.72, 0.09, 0.07], [4.0, -0.48, -0.28, 0.06, 0.05], [5.0, -0.49, 0.6, 0.015, 0.015]], { n: 6, seg: 2 }), TOP, finSkin);
  // pelvic fins + flat tail fluke + ventral skimming blade
  sym(R, plate([[0.3, 1.5], [1.2, 2.4], [1.1, 2.75], [0.25, 2.3]], 0.04, mapXZ(-1.0)), FIN, 'root');
  R.add(plate([[0, 5.15], [1.45, 6.35], [1.55, 6.8], [0.65, 6.35], [0, 6.2], [-0.65, 6.35], [-1.55, 6.8], [-1.45, 6.35]], 0.06, mapXZ(-0.82)),
    (x, y, z) => (z > 6.45 ? RIB : fract(Math.abs(x) * 1.6) < 0.35 ? BAND : FIN), 'tail3');
  R.add(plate([[4.1, -0.85], [5.0, -0.85], [5.55, -1.75], [5.2, -1.8]], 0.04, mapZY(0)), FIN, 'tail2');
  for (const t of [0.2, 0.4, 0.6, 0.8]) sym(R, ell(lerp(0.9, 4.6, t), -0.52 + t * 0.05, lerp(-0.62, 0.15, t * t) + 0.12, 0.06, 0.05, 0.06, 5, 4), [GLOW, 1], finSkin);
  R.mtx = null;
  const g = addRider(R, S.id, { legW: 0.8, legDrop: 0.85 });
  return {
    nozzles: [new THREE.Vector3(-0.3, -0.7 + dy, 3.0), new THREE.Vector3(0.3, -0.7 + dy, 3.0)],
    tips: [new THREE.Vector3(-5.0, -0.5 + dy, 0.6), new THREE.Vector3(5.0, -0.5 + dy, 0.6)],
    guns: { nose: g.nose, left: new THREE.Vector3(-2.5, -0.55 + dy, -0.7), right: new THREE.Vector3(2.5, -0.55 + dy, -0.7) },
    radius: 4,
  };
}

// ============================================================ Animation
function flyerAnimator(B, toruk) {
  let ph = 0, amp = 0.5, tuck = 0, flare = 0, gl = 0, tailT = 0;
  const kf = toruk ? 0.58 : 1;
  return (t, dt, s) => {
    dt = Math.min(dt, 0.1);
    const climb = s.climb || 0, boost = s.boost || 0, brake = s.brake || 0, bank = s.bank || 0, speed = s.speed ?? 1;
    const glide = clamp(Math.max(s.glide || 0, -climb * 1.3), 0, 1) * (1 - boost * 0.7);
    gl = damp(gl, glide, 4, dt);
    const A = (0.42 + 0.34 * Math.max(0, climb) + 0.1 * boost + 0.12 * brake) * (1 - gl * 0.92) * (toruk ? 1.05 : 1);
    amp = damp(amp, A * (1 - 0.45 * tuck), 5, dt);
    tuck = damp(tuck, boost, 4, dt);
    flare = damp(flare, brake, 5, dt);
    const f = (1.15 + 0.55 * Math.max(0, climb) + 0.8 * boost + 0.3 * (speed - 1) + 0.25 * brake) * kf;
    ph += dt * f * TAU;
    const w = Math.sin(ph + 0.35 * Math.sin(ph));       // fast downstroke, slower upstroke
    const w2 = Math.sin(ph - 0.9 + 0.35 * Math.sin(ph - 0.9));
    const dih = 0.1 + gl * 0.08 - tuck * 0.05;
    for (const [side, sx] of [['R', 1], ['L', -1]]) {
      const a = B['wing1' + side], b = B['wing2' + side], r = B['rwing' + side];
      a.rotation.z = sx * (dih + amp * w * 0.85) + bank * 0.06;
      a.rotation.y = sx * (-tuck * 0.5 + flare * 0.18);
      a.rotation.x = flare * 0.35 + amp * 0.18 * Math.cos(ph);
      b.rotation.z = sx * (amp * 0.55 * w2 - tuck * 0.12 + gl * 0.06);
      b.rotation.y = sx * (-tuck * 0.75);
      r.rotation.z = sx * (0.05 + amp * 0.5 * Math.sin(ph - 1.3)) + bank * 0.05;
      r.rotation.y = sx * (-tuck * 0.35);
    }
    B.root.position.y = B.root.userData.rest.y - amp * 0.14 * Math.sin(ph - 0.6) * (toruk ? 1.6 : 1);
    B.root.rotation.x = -climb * 0.04;
    tailT += dt * (1.5 + boost) * kf;
    B.neck.rotation.x = -climb * 0.12 + amp * 0.05 * Math.sin(ph - 1.5) + flare * 0.1;
    B.neck.rotation.y = bank * 0.12;
    B.head.rotation.x = -B.neck.rotation.x * 0.7;
    B.head.rotation.y = bank * 0.2;
    B.jaw.rotation.x = 0.04 + boost * 0.3 + Math.max(0, Math.sin(t * 0.7) - 0.85) * 1.2;
    B.tail1.rotation.y = Math.sin(tailT * 1.7) * 0.07 + bank * 0.12;
    B.tail2.rotation.y = Math.sin(tailT * 1.7 - 0.8) * 0.1 + bank * 0.07;
    B.tail3.rotation.y = Math.sin(tailT * 1.7 - 1.6) * 0.14;
    B.tail1.rotation.x = 0.05 * Math.sin(ph + 1.2) * amp + flare * 0.25 - climb * 0.08;
    B.tail2.rotation.x = flare * 0.15 - climb * 0.05;
    riderAnim(B, t, s, 0.6 * amp * Math.sin(ph - 0.6));
  };
}

function riderAnim(B, t, s, bob = 0) {
  const r = B.rider; if (!r) return;
  r.rotation.x = -0.28 * (s.boost || 0) + 0.12 * (s.brake || 0) + bob * 0.06;
  r.rotation.z = (s.bank || 0) * 0.14;
  if (B.riderHead) { B.riderHead.rotation.y = -(s.bank || 0) * 0.15; B.riderHead.rotation.x = 0.2 * (s.boost || 0); }
}

function walkerAnimator(B, kind) {
  const than = kind === 'thanator';
  let ph = 0, leap = 0, flareK = 0, ampK = 1;
  // pali: alternating tripods; thanator: bounding gallop (pairs offset front→hind)
  const off = than
    ? { L0: 0, R0: 0.35, L1: -1.0, R1: -0.7, L2: -2.4, R2: -2.1 }
    : { L0: 0, R1: 0, L2: 0, R0: Math.PI, L1: Math.PI, R2: Math.PI };
  return (t, dt, s) => {
    dt = Math.min(dt, 0.1);
    const speed = s.speed ?? 1, boost = s.boost || 0, brake = s.brake || 0, climb = s.climb || 0, bank = s.bank || 0;
    const f = (than ? 1.25 : 1.45) + 0.85 * (speed - 0.5) + boost * 0.6 - brake * 0.4;
    ph += dt * Math.max(0.3, f) * TAU;
    leap = damp(leap, sm(0.15, 0.7, Math.abs(climb)), 5, dt);
    ampK = damp(ampK, clamp(0.55 + speed * 0.35 + boost * 0.25 - brake * 0.35, 0.3, 1.25), 4, dt);
    const sw = (than ? 0.62 : 0.55) * ampK, kn = (than ? 1.0 : 1.15) * ampK;
    for (const s2 of ['L', 'R']) for (let i = 0; i < 3; i++) {
      const id = s2 + i, a = B[id + 'a'], b = B[id + 'b'], p = ph + off[id], hind = i === 2;
      let ua = sw * Math.sin(p) + brake * 0.25 * (hind ? -0.5 : 1);
      let lb = -kn * Math.max(0, Math.cos(p)) * (hind ? 0.8 : 1);
      if (hind) lb = -lb * 0.45;   // hock bends the other way
      const la = hind ? -0.75 : 0.95 - i * 0.2, ll = hind ? 0.4 : -1.4;
      a.rotation.x = lerp(ua, la, leap);
      b.rotation.x = lerp(lb, ll, leap);
      a.rotation.z = 0;
    }
    const bob = than ? 0.22 * Math.sin(2 * ph - 0.6) : 0.16 * Math.cos(2 * ph);
    B.root.position.y = B.root.userData.rest.y + bob * ampK * (1 - leap) + leap * 0.25;
    B.root.rotation.x = (than ? 0.05 : 0.035) * Math.sin(ph) * ampK - climb * 0.12 * leap;
    B.root.rotation.z = -bank * 0.06;
    if (than) {
      B.hips.rotation.x = -0.14 * Math.sin(ph + 0.8) * ampK;
      flareK = damp(flareK, Math.max(boost, s.flare || 0, Math.max(0, Math.sin(t * 0.35) - 0.9) * 10), 5, dt);
      for (let i = 0; B['q' + i]; i++) {
        const q = B['q' + i], a = lerp(-1.95, 1.95, i / 8);
        const fold = lerp(1.05, 0.0, flareK) + Math.sin(t * 6 + i) * 0.03 * flareK;
        q.quaternion.setFromAxisAngle(new THREE.Vector3(Math.cos(a), -Math.sin(a), 0), fold);
      }
      B.jaw.rotation.x = 0.06 + flareK * 0.4;
      B.neck.rotation.x = 0.06 * Math.sin(ph * 2) - flareK * 0.1;
      B.head.rotation.x = -B.neck.rotation.x * 0.8;
      B.head.rotation.y = bank * 0.3;
      B.tail1.rotation.x = 0.04 + 0.08 * Math.sin(ph - 0.5) * ampK + leap * 0.2;
      B.tail2.rotation.x = -0.04 + 0.1 * Math.sin(ph - 1.3) * ampK;
      B.tail3.rotation.x = -0.06 + 0.14 * Math.sin(ph - 2.1) * ampK;
      B.tail1.rotation.y = 0.12 * Math.sin(t * 1.3) + bank * 0.25;
      B.tail2.rotation.y = 0.16 * Math.sin(t * 1.3 - 0.8);
      B.tail3.rotation.y = 0.22 * Math.sin(t * 1.3 - 1.6);
    } else {
      B.neck1.rotation.x = 0.07 * Math.sin(ph * 2 + 1.0) * ampK - brake * 0.12 + leap * -0.15;
      B.neck2.rotation.x = 0.05 * Math.sin(ph * 2 + 0.4) * ampK;
      B.head.rotation.x = -(B.neck1.rotation.x + B.neck2.rotation.x) * 0.7;
      B.neck1.rotation.y = bank * 0.12;
      B.head.rotation.y = bank * 0.25;
      const ant = 0.12 * Math.sin(ph * 2 - 1.6) * ampK - boost * 0.15;
      B.antL.rotation.x = ant; B.antR.rotation.x = ant;
      B.antL.rotation.z = 0.05 * Math.sin(t * 2.1); B.antR.rotation.z = -0.05 * Math.sin(t * 2.3);
      B.tail.rotation.x = -0.2 * boost + 0.1 * Math.sin(ph * 2);
      B.tail.rotation.y = 0.15 * Math.sin(t * 2) + bank * 0.3;
    }
    riderAnim(B, t, s, bob * 2);
  };
}

function skimAnimator(B) {
  let ph = 0, ph2 = 0, gl = 0, tuck = 0;
  return (t, dt, s) => {
    dt = Math.min(dt, 0.1);
    const speed = s.speed ?? 1, boost = s.boost || 0, brake = s.brake || 0, bank = s.bank || 0, climb = s.climb || 0;
    const autoGlide = Math.sin(t * 0.42) > 0.55 ? 1 : 0;
    gl = damp(gl, clamp(Math.max(s.glide ?? autoGlide, -climb), 0, 1) * (1 - boost * 0.5), 3, dt);
    tuck = damp(tuck, boost, 4, dt);
    ph += dt * (1.7 + 0.8 * speed + boost * 1.4) * TAU;
    ph2 += dt * (1.1 + 0.3 * speed + boost * 0.6 + Math.max(0, climb) * 0.6) * (1 - gl * 0.85) * TAU;
    const A = (0.34 + Math.max(0, climb) * 0.16) * (1 - gl);
    for (const [side, sx] of [['R', 1], ['L', -1]]) {
      B['fin1' + side].rotation.z = sx * (0.14 + gl * 0.02 + A * Math.sin(ph2)) + bank * 0.05;
      B['fin1' + side].rotation.y = sx * (-tuck * 0.45 + brake * 0.15);
      B['fin1' + side].rotation.x = brake * 0.3;
      B['fin2' + side].rotation.z = sx * (A * 0.8 * Math.sin(ph2 - 1.0) - tuck * 0.1 + gl * 0.05);
    }
    const ta = 0.11 + boost * 0.05;
    B.tail1.rotation.y = ta * Math.sin(ph) + bank * 0.2;
    B.tail2.rotation.y = ta * 1.5 * Math.sin(ph - 0.9);
    B.tail3.rotation.y = ta * 2.1 * Math.sin(ph - 1.8);
    B.tail1.rotation.x = 0.05 * Math.sin(ph2) * (1 - gl) - climb * 0.06;
    B.head.rotation.y = -ta * 0.4 * Math.sin(ph) + bank * 0.2;
    B.head.rotation.x = 0.03 * Math.sin(ph2 + 1);
    B.jaw.rotation.x = 0.04 + boost * 0.2;
    B.sail.rotation.x = tuck * 0.55 + 0.03 * Math.sin(ph);
    B.root.position.y = B.root.userData.rest.y + 0.09 * Math.sin(ph2 + 0.6) * (1 - gl);
    B.root.rotation.z = -0.03 * Math.sin(ph);
    riderAnim(B, t, s, 0.1 * Math.sin(ph2 + 0.6));
  };
}

// ============================================================ Public API
// One material per mount (shader programs are shared), so mat.userData.flash / tint can be driven per beast.
function mountMaterial(kind) {
  const opts = kind === 'thanator' ? { roughness: 0.42, metalness: 0.15 } : kind === 'skimwing' ? { roughness: 0.5, metalness: 0.05 } : { roughness: 0.62, metalness: 0.05 };
  return emissiveVertexMaterial(opts, 2.4);
}

export function buildMount(kind = 'ikran', riderId = 'jake') {
  if (!MOUNTS.includes(kind)) kind = 'ikran';
  const S = { ...(RIDER_SCHEMES[riderId] || RIDER_SCHEMES.jake), id: RIDER_SCHEMES[riderId] ? riderId : 'jake' };
  const R = new Rig();
  let info;
  if (kind === 'ikran') info = buildFlyer(R, false, S);
  else if (kind === 'toruk') info = buildFlyer(R, true, S);
  else if (kind === 'pali') info = buildPali(R, S);
  else if (kind === 'thanator') info = buildThanator(R, S);
  else info = buildSkimwing(R, S);
  const mat = mountMaterial(kind);
  const body = R.build(mat);
  const group = new THREE.Group();
  group.name = 'mount-' + kind;
  group.add(body);
  const B = R.bones;
  const anim = kind === 'ikran' || kind === 'toruk' ? flyerAnimator(B, kind === 'toruk')
    : kind === 'skimwing' ? skimAnimator(B) : walkerAnimator(B, kind);
  const glow = kind === 'toruk' ? '#ffb84a' : kind === 'thanator' ? '#5ec8ff' : S.glow;
  const model = {
    kind, rider: S.id, group, meshes: { body }, mats: { body: mat }, bones: B, skeleton: body.skeleton,
    flames: [], noEngine: true, ground: kind === 'pali' || kind === 'thanator',
    scheme: { glow, skin: S.skin, pattern: S.pattern, accent: S.accent },
    nozzles: info.nozzles, tips: info.tips, guns: info.guns, radius: info.radius,
    footY: info.footY ?? null,
    triangles: body.geometry.attributes.position.count / 3,
    animate(t, dt, s = {}) { anim(t, dt, s); },
  };
  model.animate(0, 0, { speed: 1 });
  return model;
}
