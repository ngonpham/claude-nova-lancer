// Mounts: the Lạc Hồng squadron rides the sacred creatures (linh vật) of Vietnamese history and legend —
// the Lý-dynasty dragon (rồng), the phượng hoàng, Thánh Gióng's iron horse (ngựa sắt) and the chim Lạc of the
// Đông Sơn bronze drums — each carrying a small time-travelling pilot in a modern flight suit.
// Every mount is ONE skinned mesh (vertex colours + emissive mask through emissiveVertexMaterial / patchFog)
// driven by a small bone rig; animate() only sets bone rotations/offsets and refreshes the tracked points
// (tips, nozzles, guns.nose, fireTips), which follow their bones every frame.
// Coordinate frame: origin = rider seat, creature faces -Z, up +Y.
import * as THREE from 'three';
import { emissiveVertexMaterial } from './world.js';

export const MOUNTS = ['rong', 'phuong', 'ngua', 'chimlac'];

// Pilot colours (time-travel squadron flight suits). glow = the squadron colour used for trails/effects.
export const RIDER_SCHEMES = {
  player: {
    suit: '#b51f28', suit2: '#6e1018', trim: '#e8b84a', helmet: '#e0ac36', helmet2: '#9a6a14', visor: '#3a1e08', visorGlow: '#ffb84a',
    glove: '#2e1c14', boot: '#241812', saddle: '#8e1a18', saddle2: '#e2b04a', glow: '#ffb84a', accent: '#c2242a',
  },
  au: {
    suit: '#e2552a', suit2: '#8e2c14', trim: '#f4c870', helmet: '#efe6d6', helmet2: '#c8402a', visor: '#2a1608', visorGlow: '#ffa060',
    glove: '#3e2216', boot: '#2a1c14', saddle: '#a8301c', saddle2: '#f0c060', glow: '#ffb070', accent: '#ff6a3a', scarf: '#d8181c',
  },
  dong: {
    suit: '#5e5232', suit2: '#3a3220', trim: '#e6d8b6', helmet: '#7c8084', helmet2: '#4e5256', visor: null, goggles: true,
    glove: '#3a2a1a', boot: '#221a12', saddle: '#6a4424', saddle2: '#c89a48', glow: '#ffd890', accent: '#8a6a2a', collar: '#e6d8b6',
  },
  su: {
    suit: '#169a8c', suit2: '#0b5a52', trim: '#e8f6f2', helmet: '#e6eeec', helmet2: '#169a8c', visor: null, glasses: true,
    glove: '#1c3634', boot: '#18221f', saddle: '#155a54', saddle2: '#d8b04a', glow: '#7ffff0', accent: '#1aa898',
  },
};

// Signature colour of each creature (trails, flashes, fire particles).
const MOUNT_GLOW = { rong: '#ffc24a', phuong: '#ff8a3a', ngua: '#ff6a1a', chimlac: '#ffd36a' };
const MOUNT_FIRE = { rong: '#ffcf5a', phuong: '#ff9a3a', ngua: '#ff7a1e', chimlac: '#ffe08a' };

const TAU = Math.PI * 2;
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

// ============================================================ Tracked points (follow their bone every frame)
function tracker(R) {
  const list = [];
  return {
    add(boneName, p) {
      const b = R.bones[boneName];
      if (!b) throw new Error('mounts: unknown bone ' + boneName);
      const v = new THREE.Vector3(p[0], p[1], p[2]);
      list.push({ v, b, off: v.clone().sub(b.userData.abs) });
      return v;
    },
    update() {
      for (const e of list) {
        e.v.copy(e.off);
        for (let b = e.b; b && b.isBone; b = b.parent) { b.updateMatrix(); e.v.applyMatrix4(b.matrix); }
      }
    },
  };
}
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// Orthonormal frame from a length direction U and a rough width direction V (W = thickness normal).
function frameUV(U0, V0) {
  const U = nrm(U0), W = nrm(cross(U, V0)), V = cross(W, U);
  return [U, V, W];
}
// Flat feather / flame / blade: shape pts in (a = along, b = across), placed at `o` with direction U, width V.
function blade(pts, o, U0, V0, thick = 0.035) {
  const [U, V, W] = frameUV(U0, V0);
  return plate(pts, thick, frameMap(o, U, V, W));
}
// Standard feather outline (pointed or rounded tip).
function featherPts(len, wid, round = 0.5) {
  const w = wid / 2;
  return [[0, -w * 0.4], [len * 0.3, -w], [len * 0.86, -w * (0.35 + 0.45 * round)], [len, 0], [len * 0.86, w * (0.35 + 0.45 * round)], [len * 0.3, w], [0, w * 0.4]];
}
// Flame tongue outline (a = along the tongue, b = across): swelling body, tip curling toward +b.
function tonguePts(len, wid, curl = 0.3, n = 4) {
  const F = [], Bk = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = curl * len * t * t, hw = wid / 2 * Math.pow(1 - t, 0.85) * (1 + 0.7 * t * (1 - t));
    if (i === n) { F.push([len, c]); break; }
    F.push([len * t, c - hw]); Bk.push([len * t, c + hw]);
  }
  return [...F, ...Bk.reverse()];
}
// u (0..1) along a spine whose samples are monotonic in z, for a given z.
function uAtZ(sp, z) {
  const S = sp.S, M = sp.M, inc = S[M - 1][2] > S[0][2];
  for (let k = 0; k < M - 1; k++) {
    const a = S[k][2], b = S[k + 1][2];
    if ((inc && z >= a && z <= b) || (!inc && z <= a && z >= b)) return (k + (z - a) / ((b - a) || 1)) / (M - 1);
  }
  return inc === (z > S[M - 1][2]) ? 1 : 0;
}
// Concentric "circle-and-dot" motif (Đông Sơn engraving) lying on a surface with normal n.
function circleDot(R, p, n, r, ringPaint, dotPaint, skin) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n).normalize());
  R.add(new THREE.TorusGeometry(r, r * 0.22, 3, 10).applyQuaternion(q).translate(...p), ringPaint, skin);
  R.add(new THREE.SphereGeometry(r * 0.38, 5, 3).scale(1, 1, 0.5).applyQuaternion(q).translate(...p), dotPaint, skin);
}

// ============================================================ Saddle (lacquer + bronze handle bar)
// o: { cy: body centre height at the seat, r: body radius at the seat, w: body half width, skin }
function addSaddle(R, S, o) {
  const sk = o.skin || 'root', cy = o.cy, r = o.r, w = o.w ?? r;
  const top = cy + r;
  // saddle cloth: hugs the upper half of the back, gold border
  R.add(dome(0, cy, 0.08, w * 1.07, r * 1.08 + 0.02, 0.66, 14), (x, y, z, nx, ny) => (Math.abs(z - 0.08) > 0.55 || ny < 0.22 ? S.saddle2 : S.saddle), sk);
  // seat pad
  R.add(dome(0, top - 0.02, 0.18, 0.34, 0.12, 0.42, 10), (x, y, z, nx, ny) => (ny > 0.55 ? S.saddle : '#2a1a12'), sk);
  // front pommel + handle bar with grips
  const by = top + 0.5, bz = -0.74;
  R.add(ell(0, top + 0.02, -0.5, 0.2, 0.12, 0.16, 8, 5), S.saddle2, sk);
  for (const sx of [-1, 1]) {
    R.add(rod([sx * 0.1, top, -0.5], [sx * 0.14, by, bz], 0.04, 0.035, 5), S.saddle2, sk);
    R.add(rod([sx * 0.16, by, bz], [sx * 0.36, by + 0.02, bz - 0.02], 0.05, 0.05, 6), '#1e1612', sk);
  }
  R.add(rod([-0.16, by, bz], [0.16, by, bz], 0.035, 0.035, 5), S.saddle2, sk);
  R.add(ell(0, by + 0.02, bz, 0.06, 0.06, 0.06, 6, 4), [S.glow, 0.9], sk);
  // stirrups
  for (const sx of [-1, 1]) R.add(ring(sx * (w + 0.12), cy - r * 0.35, -0.3, 0.1, 0.025, 1, 1, 8).rotateX(0), S.saddle2, sk);
  return { handY: by, handZ: bz };
}

// ============================================================ Pilot (time-travel squadron)
function addRider(R, S, o = {}) {
  const W = o.legW ?? 0.66, drop = o.legDrop ?? 1, hy = o.handY ?? 0.5, hz = o.handZ ?? -0.74, hx = 0.26;
  R.bone('rider', o.parent || 'root', [0, 0.12, 0.06]);
  R.bone('riderHead', 'rider', [0, 1.3, -0.16]);
  const sk = 'rider', hd = 'riderHead';
  const SUIT = S.suit, SUIT2 = S.suit2;
  const suitP = (x, y, z, nx, ny, nz) => (Math.abs(x) > 0.2 && Math.abs(x) < 0.27 && y > 0.5 && nx * Math.sign(x) > 0.6 ? S.trim : SUIT);
  // torso (vertical tube: rx = width, ry = depth), leaning slightly forward
  R.add(tube([[0, -0.02, 0.1, 0.24, 0.19], [0, 0.22, 0.08, 0.25, 0.19], [0, 0.5, 0.02, 0.22, 0.17], [0, 0.8, -0.05, 0.27, 0.19],
    [0, 1.0, -0.1, 0.31, 0.19], [0, 1.13, -0.13, 0.25, 0.15], [0, 1.2, -0.14, 0.1, 0.1]], { n: 10, seg: 2, ref: [0, 0, -1] }), suitP, sk);
  R.add(ring(0, 0.36, 0.05, 0.235, 0.04, 1, 0.82, 12), SUIT2, sk);                       // belt
  R.add(ell(0, 0.36, -0.15, 0.06, 0.05, 0.03, 6, 4), [S.trim, 0.3], sk);                    // buckle
  // harness straps
  for (const sx of [-1, 1]) R.add(rod([sx * 0.15, 1.12, -0.24], [sx * 0.05, 0.4, -0.2], 0.03, 0.03, 4), SUIT2, sk);
  for (const sx of [-1, 1]) R.add(rod([sx * 0.15, 1.12, 0.06], [sx * 0.1, 0.42, 0.24], 0.03, 0.03, 4), SUIT2, sk);
  // neck / collar
  R.add(tube([[0, 1.12, -0.14, 0.09, 0.09], [0, 1.36, -0.17, 0.08, 0.08]], { n: 8, seg: 1, ref: [0, 0, -1] }), SUIT2, hd);
  if (S.collar) R.add(ring(0, 1.17, -0.13, 0.14, 0.06, 1, 0.95, 12), S.collar, sk);
  // helmet
  const C = [0, 1.5, -0.19];
  R.add(ell(C[0], C[1], C[2], 0.205, 0.215, 0.235, 11, 7), (x, y, z, nx, ny) => (ny < -0.35 ? S.helmet2 : S.helmet), hd);
  R.add(new THREE.TorusGeometry(0.218, 0.032, 4, 14, Math.PI).rotateY(Math.PI / 2).scale(1, 1, 1.06).translate(C[0], C[1] + 0.005, C[2]), S.helmet2, hd);
  for (const sx of [-1, 1]) R.add(ell(sx * 0.2, C[1] - 0.04, C[2] + 0.02, 0.05, 0.09, 0.09, 6, 4), S.helmet2, hd);
  if (S.visor) {
    const vis = new THREE.SphereGeometry(1, 12, 5, Math.PI * 1.5 - 0.95, 1.9, Math.PI * 0.33, Math.PI * 0.3).scale(0.218, 0.226, 0.248).translate(C[0], C[1] - 0.01, C[2]);
    R.add(vis, (x, y) => (y > C[1] + 0.06 ? [S.visorGlow, 0.55] : [S.visor, 0.12]), hd);
  } else {
    // open face
    R.add(ell(0, C[1] - 0.06, C[2] - 0.13, 0.15, 0.15, 0.12, 8, 6), '#c8906a', hd);
    if (S.goggles) {
      R.add(ring(0, C[1] + 0.1, C[2], 0.215, 0.025, 1, 1.1, 14).rotateX(0), '#2a2420', hd);
      for (const sx of [-1, 1]) {
        R.add(rod([sx * 0.08, C[1] + 0.11, C[2] - 0.2], [sx * 0.08, C[1] + 0.11, C[2] - 0.27], 0.055, 0.055, 7), '#5a4a30', hd);
        R.add(ell(sx * 0.08, C[1] + 0.11, C[2] - 0.275, 0.045, 0.045, 0.01, 7, 3), ['#bfe6f0', 0.5], hd);
      }
    }
    if (S.glasses) {
      for (const sx of [-1, 1]) {
        R.add(new THREE.TorusGeometry(0.045, 0.012, 3, 10).translate(sx * 0.068, C[1] - 0.02, C[2] - 0.255), ['#e8fffa', 0.9], hd);
        R.add(ell(sx * 0.068, C[1] - 0.02, C[2] - 0.252, 0.04, 0.04, 0.008, 7, 3), ['#9ff8ec', 0.7], hd);
      }
      R.add(rod([-0.025, C[1] - 0.02, C[2] - 0.26], [0.025, C[1] - 0.02, C[2] - 0.26], 0.008, 0.008, 3), '#e8fffa', hd);
    }
  }
  // scarf (wrapped round the neck, two tails streaming back)
  if (S.scarf) {
    R.bone('scarf1', 'rider', [0, 1.16, 0.0]);
    R.bone('scarf2', 'scarf1', [0, 1.06, 0.7]);
    R.add(ring(0, 1.18, -0.14, 0.13, 0.055, 1, 1.05, 10), S.scarf, sk);
    for (const [ox, oy, L] of [[0.06, 0, 1.15], [-0.05, -0.06, 0.85]]) {
      R.add(tube([[ox, 1.17 + oy, -0.02, 0.025, 0.07], [ox + 0.02, 1.12 + oy, 0.35, 0.02, 0.075], [ox + 0.06, 1.04 + oy, 0.75, 0.02, 0.07],
        [ox + 0.1, 0.98 + oy, L, 0.015, 0.05]], { n: 5, seg: 3 }), S.scarf, (x, y, z) => chain([['scarf1', -99], ['scarf2', 0.7]], z, 0.3));
    }
  }
  // time engine on the back: bronze-drum sun disc with glowing rings (faces the chase camera)
  R.add(ell(0, 0.76, 0.24, 0.22, 0.27, 0.11, 10, 6), SUIT2, sk);
  R.add(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 18).rotateX(Math.PI / 2).translate(0, 0.78, 0.33), '#b8873a', sk);
  R.add(new THREE.TorusGeometry(0.17, 0.02, 4, 20).translate(0, 0.78, 0.365), [S.glow, 1.3], sk);
  R.add(new THREE.TorusGeometry(0.1, 0.014, 4, 16).translate(0, 0.78, 0.365), [S.trim, 0.7], sk);
  R.add(ell(0, 0.78, 0.37, 0.045, 0.045, 0.02, 7, 4), [S.glow, 2.2], sk);
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6 + Math.PI / 2;
    R.add(spike([Math.cos(a) * 0.045, 0.78 + Math.sin(a) * 0.045, 0.37], [Math.cos(a) * 0.15, 0.78 + Math.sin(a) * 0.15, 0.37], 0.02, 3), [S.glow, 1.0], sk);
  }
  // arms reaching for the handle bar
  for (const sx of [-1, 1]) {
    const SH = [sx * 0.3, 1.0, -0.13], EL = [sx * 0.42, 0.7, -0.4], WR = [sx * hx, hy + 0.02, hz + 0.1];
    R.add(ell(SH[0], SH[1], SH[2], 0.12, 0.11, 0.12, 8, 5), SUIT, sk);
    R.add(tube([[...SH, 0.1, 0.1], [...EL, 0.085, 0.085], [...WR, 0.068, 0.068]], { n: 7, seg: 2 }), (x, y, z) => (z < hz + 0.22 ? S.glove : SUIT), sk);
    R.add(ell(sx * hx, hy, hz, 0.075, 0.08, 0.1, 6, 5), S.glove, sk);
    R.add(ell(SH[0] + sx * 0.03, SH[1] - 0.02, SH[2] - 0.02, 0.06, 0.06, 0.06, 5, 3).scale(1, 1, 0.4), [S.trim, 0.25], sk);
  }
  // legs straddling the creature
  for (const sx of [-1, 1]) {
    const K = [sx * (W + 0.13), -0.16 * drop, -0.48], A = [sx * (W + 0.07), -0.66 * drop, -0.24];
    R.add(tube([[sx * 0.15, 0.06, 0.02, 0.13, 0.13], [sx * (W * 0.72 + 0.1), 0.0, -0.26, 0.13, 0.12], [...K, 0.11, 0.105], [...A, 0.08, 0.08]], { n: 7, seg: 2 }),
      (x, y) => (y < -0.45 * drop ? S.boot : SUIT), sk);
    R.add(ell(sx * (W + 0.07), -0.76 * drop, -0.34, 0.085, 0.09, 0.17, 6, 4), S.boot, sk);
    R.add(ell(sx * (W + 0.07), -0.33 * drop, -0.43, 0.06, 0.06, 0.03, 5, 3), [S.trim, 0.2], sk);   // knee patch
  }
}

// Shared rider animation: leans into bank / boost, braces on brake, bobs with the stroke.
function riderAnim(B, t, s, bob = 0) {
  const r = B.rider; if (!r) return;
  const boost = s.boost || 0, brake = s.brake || 0, bank = s.bank || 0;
  r.rotation.x = -0.3 * boost + 0.14 * brake + bob * 0.05;
  r.rotation.z = bank * 0.22;
  r.position.y = r.userData.rest.y + bob * 0.03;
  B.riderHead.rotation.y = -bank * 0.25;
  B.riderHead.rotation.x = 0.22 * boost - 0.05 * brake;
  if (B.scarf1) {
    B.scarf1.rotation.x = -0.08 + 0.1 * Math.sin(t * 8.3) - 0.12 * boost;
    B.scarf1.rotation.y = 0.18 * Math.sin(t * 5.1) - bank * 0.3;
    B.scarf2.rotation.x = 0.16 * Math.sin(t * 8.3 - 1.4);
    B.scarf2.rotation.y = 0.28 * Math.sin(t * 5.1 - 1.2);
  }
}

// ============================================================ Rồng thời Lý (Lý-dynasty dragon)
// Slender serpentine body in regular S-bends, small three-claw legs, long snout with the upturned lip curl,
// flame crest (mào lửa), swept horns, long whiskers, a glowing pearl under the chin, frilled dorsal ridge and a
// flame tuft at the tail. Flies by undulating — no wings. The pilot sits a third of the way along the body,
// so most of the dragon is seen ahead of / beside the rider from the chase camera.
const RONG_FRONT = [-0.6, -1.85, -3.1, -4.35];                     // neck chain pivots (n0..n3), head at RONG_HZ
const RONG_HZ = -5.6;
const RONG_BZ = [0.9, 2.15, 3.4, 4.65, 5.9, 7.15, 8.4, 9.65];      // tail chain pivots (b0..b7)
function buildRong(R, S, T) {
  const GOLD = '#d9a12a', GOLD2 = '#bb801c', GOLD4 = '#e2ac34', GOLD3 = '#f4c654', RED = '#a3141a', RED2 = '#cf3a1c',
    ORANGE = '#f07a1c', JADE = '#2a9a76', BELLY = '#f2d68e', BELLY2 = '#c8963e', IVORY = '#f6ecd0';
  const Y0 = -0.56;
  const cy = z => (z < -0.5 ? Y0 + 1.15 * sm(-0.5, -5.3, z) : Y0 - 0.02 * Math.max(0, z - 0.6));
  const RK = [[-5.9, 0.36], [-4.6, 0.4], [-2.6, 0.48], [0, 0.55], [1.5, 0.58], [3.5, 0.53], [5.5, 0.44], [7.5, 0.32], [9.2, 0.19], [10.4, 0.09], [11.0, 0.03]];
  const rad = z => {
    if (z <= RK[0][0]) return RK[0][1];
    for (let i = 0; i < RK.length - 1; i++) if (z <= RK[i + 1][0]) return lerp(RK[i][1], RK[i + 1][1], (z - RK[i][0]) / (RK[i + 1][0] - RK[i][0]));
    return RK[RK.length - 1][1];
  };
  // ---- bones
  R.bone('root', null, [0, 0, 0]);
  RONG_FRONT.forEach((z, i) => R.bone('n' + i, i ? 'n' + (i - 1) : 'root', [0, cy(z), z]));
  const hz = RONG_HZ, hy = cy(hz) + 0.04;
  R.bone('head', 'n3', [0, hy, hz]);
  R.bone('jaw', 'head', [0, hy - 0.16, hz - 0.15]);
  const PC = [0, hy - 0.95, hz - 2.35];
  R.bone('pearl', 'head', PC);
  for (const s of ['L', 'R']) {
    const sx = s === 'R' ? 1 : -1;
    R.bone('whisk1' + s, 'head', [sx * 0.2, hy - 0.02, hz - 1.95]);
    R.bone('whisk2' + s, 'whisk1' + s, [sx * 1.3, hy + 0.2, hz - 1.35]);
    R.bone('mane' + s, 'head', [sx * 0.2, hy + 0.3, hz + 0.05]);
  }
  RONG_BZ.forEach((z, i) => R.bone('b' + i, i ? 'b' + (i - 1) : 'root', [0, cy(z), z]));
  const TZ = 10.75, TY = cy(TZ);
  R.bone('tuft', 'b7', [0, TY, TZ]);
  for (const s of ['L', 'R']) {
    const sx = s === 'R' ? 1 : -1;
    R.bone('lf' + s, 'n2', [sx * 0.3, cy(-3.6) - 0.22, -3.6]);
    R.bone('lh' + s, 'b2', [sx * 0.3, cy(4.2) - 0.28, 4.2]);
  }
  const CH = [['head', -99], ['n3', hz], ['n2', -4.35], ['n1', -3.1], ['n0', -1.85], ['root', -0.6], ...RONG_BZ.map((z, i) => ['b' + i, z]), ['tuft', TZ]];
  const bodySkin = (x, y, z) => chain(CH, z, 0.42);
  // ---- paints
  const scales = (z, a) => {
    const row = Math.floor(z * 4.4), col = Math.floor(a * 3.6 + (row & 1) * 0.5), h = hash(row, col, 3);
    return h > 0.66 ? GOLD2 : h > 0.33 ? GOLD : GOLD4;
  };
  const bodyP = (x, y, z, nx, ny) => {
    const a = Math.atan2(ny, Math.abs(nx));
    if (a < -0.95) return fract(z * 2.2) < 0.24 ? BELLY2 : BELLY;
    if (a < -0.66) return RED;
    if (a < -0.52) return GOLD3;
    return scales(z, a);
  };
  // ---- body (neck → tail)
  const keys = [];
  for (let z = -5.85; z < 10.95; z += 0.5) { const r = rad(z); keys.push([0, cy(z), z, r, r * 0.94]); }
  keys.push([0, cy(11.0), 11.0, 0.03, 0.03]);
  R.add(tube(spine(keys, { seg: 2, bot: 0.92 }), { n: 12 }), bodyP, bodySkin);
  // frilled dorsal ridge: little curled flame fins (seat left clear)
  for (let z = -5.2; z < 10.6; z += 0.42) {
    if (z > -1.0 && z < 0.95) continue;
    const r = rad(z), h = 0.12 + r * 0.42, yt = cy(z) + r * 0.94 - 0.07;
    R.add(blade(tonguePts(h, 0.42, 0.55, 2), [0, yt, z - 0.08], [0, 1, 0.25], [0, -0.25, 1], 0.045),
      (x, yy) => (yy - yt > h * 0.6 ? [GOLD3, 0.35] : RED), bodySkin);
  }
  // ---- head
  const K = (dx, dy, dz, rx, ry) => [dx, hy + dy, hz + dz, rx, ry];
  const headP = (x, y, z, nx, ny) => {
    const d = hz - z, a = Math.atan2(ny, Math.abs(nx));
    if (a < -0.7) return BELLY;
    if (d > 1.85) return a > 0.2 ? GOLD3 : GOLD;
    return scales(z * 1.3, a);
  };
  R.add(tube([K(0, -0.02, 0.32, 0.33, 0.35), K(0, 0.1, -0.15, 0.4, 0.4), K(0, 0.1, -0.7, 0.37, 0.32), K(0, 0.0, -1.25, 0.28, 0.24),
    K(0, -0.02, -1.75, 0.25, 0.21), K(0, 0.03, -2.1, 0.25, 0.21), K(0, 0.05, -2.3, 0.11, 0.1)], { n: 12, seg: 3, bot: 0.8 }), headP, 'head');
  // upturned lip curl (the Lý dragon's elegant "trunk")
  R.add(tube([[0, hy + 0.02, hz - 2.1, 0.12, 0.11], [0, hy + 0.12, hz - 2.45, 0.09, 0.085], [0, hy + 0.32, hz - 2.66, 0.07, 0.07], [0, hy + 0.52, hz - 2.6, 0.055, 0.055],
    [0, hy + 0.58, hz - 2.42, 0.04, 0.04], [0, hy + 0.5, hz - 2.32, 0.015, 0.015]], { n: 7, seg: 3, ref: [1, 0, 0] }),
  (x, y, z, nx, ny) => (y > hy + 0.42 ? [GOLD3, 0.3] : GOLD), 'head');
  for (const sx of [-1, 1]) R.add(ell(sx * 0.13, hy + 0.12, hz - 2.15, 0.09, 0.08, 0.11, 7, 5), RED2, 'head');   // nostrils
  // lower jaw, mouth, tongue, teeth
  R.add(tube([K(0, -0.2, 0.05, 0.28, 0.12), K(0, -0.3, -0.8, 0.25, 0.11), K(0, -0.38, -1.6, 0.17, 0.08), K(0, -0.37, -1.95, 0.1, 0.06),
    K(0, -0.32, -2.08, 0.03, 0.03)], { n: 10, seg: 2 }), (x, y, z, nx, ny) => (ny < -0.3 ? BELLY : GOLD), 'jaw');
  R.add(plate([[-0.17, hz - 0.2], [0.17, hz - 0.2], [0.1, hz - 1.9], [-0.1, hz - 1.9]], 0.04, mapXZ(hy - 0.21)), '#5c0a10', 'jaw');
  R.add(tube([[0, hy - 0.22, hz - 0.9, 0.07, 0.03], [0, hy - 0.27, hz - 1.8, 0.06, 0.028], [0, hy - 0.3, hz - 2.3, 0.05, 0.024],
    [0, hy - 0.2, hz - 2.55, 0.035, 0.02], [0, hy - 0.06, hz - 2.5, 0.02, 0.015]], { n: 6, seg: 2, ref: [1, 0, 0] }), '#d8222c', 'jaw');
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = hz - 1.0 - i * 0.3, x = sx * (0.22 - i * 0.025), L = i === 3 ? 0.24 : 0.12;
      R.add(spike([x, hy - 0.1, z], [x, hy - 0.1 - L, z - 0.02], i === 3 ? 0.045 : 0.03, 3), IVORY, 'head');
    }
    // eyes: round and bulging, amber iris, dark pupil
    R.add(ell(sx * 0.28, hy + 0.2, hz - 0.85, 0.13, 0.12, 0.14, 9, 6), ['#ffe7a0', 0.45], 'head');
    R.add(ell(sx * 0.36, hy + 0.21, hz - 0.88, 0.07, 0.075, 0.08, 7, 5), ['#c8501a', 0.4], 'head');
    R.add(ell(sx * 0.405, hy + 0.21, hz - 0.89, 0.035, 0.05, 0.045, 6, 4), '#160604', 'head');
    // brow ridge curling back
    R.add(blade(tonguePts(0.85, 0.2, 0.35, 3), [sx * 0.24, hy + 0.3, hz - 1.1], [sx * 0.15, 0.25, 1], [0, 1, 0], 0.07), RED2, 'head');
    // horns: slender, swept back, jade with gold tips
    R.add(tube([[sx * 0.16, hy + 0.36, hz - 0.5, 0.075, 0.075], [sx * 0.26, hy + 0.6, hz - 0.02, 0.06, 0.06], [sx * 0.34, hy + 0.76, hz + 0.6, 0.045, 0.045],
      [sx * 0.38, hy + 0.98, hz + 0.95, 0.025, 0.025], [sx * 0.38, hy + 1.12, hz + 0.9, 0.008, 0.008]], { n: 6, seg: 3 }),
    (x, y) => (y > hy + 0.9 ? [GOLD3, 0.5] : y < hy + 0.45 ? GOLD : JADE), 'head');
    // whiskers: long, gently S-curved, swept back
    const s = sx > 0 ? 'R' : 'L';
    const P = [[sx * 0.2, hy - 0.02, hz - 1.95], [sx * 0.62, hy + 0.06, hz - 1.9], [sx * 1.3, hy + 0.2, hz - 1.35], [sx * 1.85, hy + 0.05, hz - 0.55],
      [sx * 2.25, hy + 0.25, hz + 0.45], [sx * 2.45, hy + 0.5, hz + 1.2]];
    R.add(tube(P.map((p, i) => [...p, 0.05 - i * 0.0075, 0.05 - i * 0.0075]), { n: 5, seg: 3 }), [GOLD3, 0.4],
      (x) => chain([['whisk1' + s, -99], ['whisk2' + s, 1.3]], Math.abs(x), 0.4));
    // mane: flame tongues flowing back over the neck
    for (let j = 0; j < 3; j++) {
      const L = 1.45 + j * 0.3, o = [sx * (0.2 + j * 0.05), hy + 0.32 - j * 0.14, hz + 0.0 + j * 0.12];
      R.add(blade(tonguePts(L, 0.5 - j * 0.06, 0.32, 5), o, [sx * (0.45 + j * 0.12), 0.32 - j * 0.2, 1], [0, 1, 0.1], 0.04),
        (x, y, z) => { const d = z - o[2]; return d > L * 0.68 ? [GOLD3, 0.55] : d > L * 0.36 ? [ORANGE, 0.3] : RED2; }, 'mane' + s);
    }
  }
  // beard flames under the jaw
  for (const [dz, L] of [[-1.5, 0.55], [-1.05, 0.7], [-0.6, 0.6]]) {
    R.add(blade(tonguePts(L, 0.3, 0.45, 3), [0, hy - 0.36, hz + dz], [0, -1, 0.35], [0, 0.35, 1], 0.04), (x, y) => (y < hy - 0.6 ? [ORANGE, 0.35] : RED2), 'jaw');
  }
  // flame crest (mào lửa): tongues rising from the brow and leaning back over the head
  [[-1.75, 0.5, 0.42], [-1.32, 0.72, 0.48], [-0.88, 0.95, 0.52], [-0.42, 1.1, 0.55], [0.04, 1.0, 0.52], [0.45, 0.78, 0.44]].forEach(([dz, L, w], i) => {
    const base = hy + (dz < -1.2 ? 0.15 : 0.32);
    R.add(blade(tonguePts(L, w, 0.42, 4), [(i & 1 ? 0.012 : -0.012), base, hz + dz], [0, 1, 0.3], [0, -0.3, 1], 0.055),
      (x, y) => { const d = y - base; return d > L * 0.66 ? [GOLD3, 0.7] : d > L * 0.33 ? [ORANGE, 0.4] : RED2; }, 'head');
  });
  // pearl (ngọc) with flame licks
  R.add(ell(...PC, 0.2, 0.2, 0.2, 10, 7), ['#ffd98a', 1.25], 'pearl');
  for (let k = 0; k < 7; k++) {
    const a = k * TAU / 7 + 0.3, d = nrm([Math.cos(a), Math.sin(a), 0.35]);
    R.add(spike([PC[0] + d[0] * 0.15, PC[1] + d[1] * 0.15, PC[2] + d[2] * 0.15], [PC[0] + d[0] * 0.42, PC[1] + d[1] * 0.42 + 0.05, PC[2] + d[2] * 0.42 + 0.12], 0.06, 4), [ORANGE, 1.0], 'pearl');
  }
  // ---- legs: small, held back, three claws, flame tufts at the elbows
  const legP = (x, y, z, nx, ny) => (ny < -0.4 ? BELLY : GOLD);
  for (const s of ['L', 'R']) {
    const sx = s === 'R' ? 1 : -1;
    for (const hind of [false, true]) {
      const z0 = hind ? 4.2 : -3.6, y0 = cy(z0) - (hind ? 0.28 : 0.22), b = (hind ? 'lh' : 'lf') + s;
      const E = [sx * 0.64, y0 - 0.4, z0 + 0.45], W = [sx * 0.68, y0 - 0.62, z0 + 1.2], F = [sx * 0.66, y0 - 0.66, z0 + 1.45];
      R.add(tube([[sx * 0.28, y0 + 0.05, z0, 0.17, 0.17], [...E, 0.12, 0.12], [...W, 0.08, 0.08], [...F, 0.07, 0.06]], { n: 7, seg: 2 }), legP, b);
      for (let k = -1; k <= 1; k++) R.add(spike([F[0] + k * 0.06, F[1], F[2]], [F[0] + k * 0.13, F[1] - 0.06, F[2] + 0.36], 0.04, 3), IVORY, b);
      R.add(blade(tonguePts(0.6, 0.26, 0.4, 3), [E[0], E[1] + 0.05, E[2] - 0.05], [sx * 0.2, 0.3, 1], [0, 1, -0.3], 0.03), (x, y, z) => (z > E[2] + 0.35 ? [ORANGE, 0.4] : RED2), b);
    }
  }
  // ---- tail flame tuft
  const tuftP = (x, y, z) => { const d = z - TZ; return d > 1.0 ? [GOLD3, 0.75] : d > 0.4 ? [ORANGE, 0.45] : RED2; };
  for (const [ay, ax, L, w] of [[0.55, 0, 1.6, 0.5], [-0.5, 0, 1.4, 0.45], [0.05, 0.6, 1.5, 0.42], [0.05, -0.6, 1.5, 0.42], [0.15, 0, 2.0, 0.5]]) {
    R.add(blade(tonguePts(L, w, 0.3 * Math.sign(ay || 1), 4), [0, TY, TZ - 0.3], [ax, ay, 1], [0, 1, 0], 0.045), tuftP, 'tuft');
  }
  // ---- saddle + pilot
  const sd = addSaddle(R, S, { cy: Y0, r: 0.55 });
  addRider(R, S, { legW: 0.6, legDrop: 0.95, handY: sd.handY, handZ: sd.handZ });
  return {
    nozzles: [T.add('b1', [-0.45, cy(2.4) - 0.2, 2.4]), T.add('b1', [0.45, cy(2.4) - 0.2, 2.4])],
    tips: [T.add('whisk2L', [-2.45, hy + 0.5, hz + 1.2]), T.add('whisk2R', [2.45, hy + 0.5, hz + 1.2])],
    guns: { nose: T.add('head', [0, hy - 0.15, hz - 2.6]), left: new THREE.Vector3(-1.2, -0.2, -3.0), right: new THREE.Vector3(1.2, -0.2, -3.0) },
    fireTips: [T.add('pearl', PC), T.add('tuft', [0, TY + 0.25, TZ + 1.6]), T.add('head', [0, hy + 1.15, hz + 0.1])],
    fireKinds: ['pearl', 'tail', 'crest'],
    radius: 4,
  };
}

// ============================================================ Phượng hoàng (Vietnamese phoenix)
// Long elegant neck, flame crest, golden hackles, broad layered wings and very long flowing tail plumes with
// turquoise eyes. Slow powerful wingbeats and long glides.
const PH_TAIL = [0, 1, 2, 3, 4].map(i => ({ i, x0: (i - 2) * 0.1, sp: (i - 2) * 0.14, L: 9.6 - Math.abs(i - 2) * 1.35 }));
function phTailPoint(r, d) {
  const L = r.L;
  return [r.x0 + r.sp * d * (1 + d * 0.02) + 0.22 * Math.sin(d * 0.62 + r.i * 1.3) * sm(0, 3, d), -0.45 - 0.17 * d + 0.0065 * d * d + 0.55 * sm(0.72 * L, L, d), 1.95 + d];
}
function buildPhuong(R, S, T) {
  const RED = '#c4221c', RED2 = '#8a1212', ORANGE = '#f27420', GOLD = '#f2b432', GOLD2 = '#ffd36a', TURQ = '#10a8a2', NAVY = '#123068', BEAK = '#e8b040';
  // ---- bones
  R.bone('root', null, [0, 0, 0]);
  R.bone('neck1', 'root', [0, -0.42, -1.45]);
  R.bone('neck2', 'neck1', [0, 0.3, -2.5]);
  R.bone('head', 'neck2', [0, 1.38, -3.25]);
  R.bone('crest', 'head', [0, 1.72, -3.4]);
  R.bone('tailfan', 'root', [0, -0.45, 1.9]);
  for (const s of ['R', 'L']) {
    const sx = s === 'R' ? 1 : -1;
    R.bone('wing1' + s, 'root', [sx * 0.55, -0.42, 0.6]);
    R.bone('wing2' + s, 'wing1' + s, [sx * 2.7, -0.2, -0.1]);
    R.bone('wing3' + s, 'wing2' + s, [sx * 4.6, -0.04, -0.4]);
  }
  for (const r of PH_TAIL) for (let j = 0; j < 3; j++) R.bone(`p${r.i}_${j}`, j ? `p${r.i}_${j - 1}` : 'root', phTailPoint(r, r.L * j * 0.33));
  // ---- body
  const bodyP = (x, y, z, nx, ny) => {
    if (ny < -0.45) return z < 0.4 ? ORANGE : GOLD;
    if (ny < -0.1 && z < 0) return ORANGE;
    return hash(Math.floor(z * 4), Math.floor(Math.atan2(ny, Math.abs(nx)) * 3), 5) > 0.5 ? RED : '#b01a16';
  };
  R.add(tube([[0, -0.55, -1.75, 0.42, 0.45], [0, -0.6, -1.1, 0.62, 0.66], [0, -0.62, -0.2, 0.7, 0.7], [0, -0.62, 0.8, 0.62, 0.6],
    [0, -0.56, 1.7, 0.42, 0.4], [0, -0.5, 2.35, 0.18, 0.18]], { n: 12, seg: 3, bot: 0.95 }), bodyP, 'root');
  // ---- neck (swan-like S), golden front, red back with hackles
  const neckSkin = (x, y) => chain([['root', -99], ['neck1', -0.42], ['neck2', 0.3], ['head', 1.36]], y, 0.25);
  R.add(tube([[0, -0.5, -1.3, 0.42, 0.44], [0, -0.3, -2.0, 0.32, 0.32], [0, 0.15, -2.48, 0.25, 0.25], [0, 0.75, -2.84, 0.21, 0.21],
    [0, 1.25, -3.12, 0.19, 0.19], [0, 1.45, -3.3, 0.18, 0.18]], { n: 10, seg: 3 }),
  (x, y, z, nx, ny, nz) => { const h = hash(Math.floor(y * 4.5), Math.floor(Math.atan2(nz, nx) * 3), 7) > 0.5; return nz < -0.2 ? (h ? GOLD : '#f6c444') : (h ? RED : '#d8361c'); }, neckSkin);
  for (let j = 0; j < 6; j++) {
    const t = j / 5, y = lerp(1.25, -0.15, t), z = lerp(-3.0, -1.85, t) + 0.16 + t * 0.12;
    for (const sx of [-1, 1]) {
      R.add(blade(tonguePts(0.55 + t * 0.2, 0.26, 0.3, 3), [sx * 0.07, y, z], [sx * 0.2, -0.6, 1], [0, 1, 0.3], 0.03),
        (xx, yy, zz) => (zz - z > 0.45 ? ORANGE : GOLD), neckSkin);
    }
  }
  // ---- head: gold face, hooked beak, turquoise-rimmed eye, wattle, flame crest
  const HC = [0, 1.55, -3.46];
  R.add(ell(...HC, 0.22, 0.24, 0.3, 10, 7), (x, y, z, nx, ny) => (ny > 0.5 ? RED : GOLD), 'head');
  R.add(tube([[0, 1.56, -3.7, 0.1, 0.11], [0, 1.5, -3.96, 0.07, 0.075], [0, 1.42, -4.1, 0.04, 0.04], [0, 1.32, -4.12, 0.02, 0.02], [0, 1.27, -4.08, 0.006, 0.006]],
    { n: 7, seg: 2, ref: [1, 0, 0] }), BEAK, 'head');
  R.add(tube([[0, 1.44, -3.68, 0.08, 0.06], [0, 1.38, -3.9, 0.045, 0.035], [0, 1.36, -3.98, 0.01, 0.01]], { n: 6, seg: 2 }), BEAK, 'head');
  R.add(ell(0, 1.3, -3.66, 0.06, 0.11, 0.07, 6, 5), RED, 'head');
  for (const sx of [-1, 1]) {
    R.add(ell(sx * 0.17, 1.62, -3.58, 0.065, 0.065, 0.07, 7, 5), [TURQ, 0.6], 'head');
    R.add(ell(sx * 0.215, 1.62, -3.6, 0.03, 0.04, 0.04, 5, 4), '#140808', 'head');
    // cheek plumes sweeping back
    R.add(blade(tonguePts(0.75, 0.22, 0.25, 3), [sx * 0.14, 1.5, -3.35], [sx * 0.5, -0.1, 1], [0, 1, 0], 0.03), (x, y, z) => (z > -3.0 ? ORANGE : GOLD), 'head');
  }
  let crestTip = null;
  [[0.25, 0.85, 0.24], [0.6, 1.1, 0.26], [0.98, 0.95, 0.24], [1.3, 0.7, 0.2]].forEach(([th, L, w], i) => {
    const U = [0, Math.cos(th), Math.sin(th)], V = [0, -Math.sin(th), Math.cos(th)], o = [(i & 1 ? 0.01 : -0.01), 1.68, -3.48 + i * 0.05];
    R.add(blade(tonguePts(L, w, 0.38, 4), o, U, V, 0.04), (x, y, z) => (Math.hypot(y - o[1], z - o[2]) > L * 0.62 ? [GOLD2, 0.55] : RED), 'crest');
    const tip = [o[0], o[1] + U[1] * L + V[1] * 0.38 * L, o[2] + U[2] * L + V[2] * 0.38 * L];
    R.add(ell(...tip, 0.07, 0.07, 0.07, 6, 4), [GOLD2, 0.9], 'crest');
    if (i === 1) crestTip = tip;
  });
  // ---- wings: covert sheet + layered feathers
  const Lp = [[0.55, -0.42, 0.3], [1.6, -0.3, -0.05], [2.7, -0.2, -0.25], [3.7, -0.1, -0.5], [4.6, -0.04, -0.6], [5.2, 0.0, -0.58]];
  const Tc = [[0.55, -0.5, 1.5], [1.6, -0.38, 1.4], [2.7, -0.28, 1.1], [3.7, -0.15, 0.45], [4.6, -0.05, -0.05], [5.2, 0.0, -0.58]];
  const at = (arr, x) => {
    let i = 0; while (i < arr.length - 2 && arr[i + 1][0] < x) i++;
    const a = arr[i], b = arr[i + 1], t = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  };
  const wingSkin = s => (x) => {
    const ax = Math.abs(x), w = chain([['wing1' + s, -99], ['wing2' + s, 2.7], ['wing3' + s, 4.6]], ax, 0.5);
    const kb = 1 - sm(0.6, 1.3, ax);
    return kb > 0 ? [['root', kb], ...w.map(e => [e[0], e[1] * (1 - kb)])] : w;
  };
  const featherP = (o, L, cols, emitTip = 0) => (x, y, z) => {
    const d = Math.hypot(Math.abs(x) - Math.abs(o[0]), z - o[2]) / L;
    return d < 0.3 ? cols[0] : d < 0.62 ? cols[1] : d < 0.86 ? cols[2] : (emitTip ? [cols[3], emitTip] : cols[3]);
  };
  for (const s of ['R', 'L']) {
    const sx = s === 'R' ? 1 : -1, sk = wingSkin(s);
    const X = p => [p[0] * sx, p[1], p[2]];
    const part = (g, paint) => R.add(sx > 0 ? g : mirror(g), paint, sk);
    // covert sheet with scalloped rows
    part(sheet(Lp, Tc, { C: 4, step: 0.32, thick: 0.05, camber: (u, c) => [0, -0.12 * Math.sin(Math.PI * c) * (1 - u * 0.5), 0] }),
      (x, y, z, nx, ny, nz, u, c) => (c < 0.16 ? GOLD : (Math.floor(c * 4 + Math.abs(x) * 1.6) & 1) ? GOLD : ORANGE));
    part(tube([[0.5, -0.42, 0.35, 0.22, 0.16], [2.7, -0.2, -0.2, 0.13, 0.1], [4.6, -0.04, -0.58, 0.09, 0.07], [5.25, 0.0, -0.58, 0.04, 0.03]], { n: 7, seg: 3 }), GOLD);
    part(ell(0.75, -0.42, 0.75, 0.36, 0.24, 0.62, 8, 5), RED);
    // secondaries along the trailing edge (tucked under the coverts)
    for (let k = 0; k <= 10; k++) {
      const x = 0.7 + k * 0.36, p = at(Tc, x), o = [p[0], p[1] - 0.045 + (k & 1) * 0.012, p[2] - 0.4];
      const L = 1.75 + 0.15 * Math.sin(k * 0.9);
      part(blade(featherPts(L, 0.52, 0.8), o, [0.06 + k * 0.025, -0.02, 1], [1, 0, 0], 0.03), featherP(o, L, [GOLD, ORANGE, RED, RED2]));
    }
    // primaries fanning from the hand
    const H0 = [4.25, -0.06, -0.15], H1 = [5.15, -0.02, -0.55];
    for (let k = 0; k < 8; k++) {
      const a = 0.14 + k * 0.17, o = [lerp(H1[0], H0[0], k / 7), lerp(H1[1], H0[1], k / 7) - 0.04 - (k & 1) * 0.012, lerp(H1[2], H0[2], k / 7)];
      const L = 2.55 - Math.abs(k - 1.5) * 0.14;
      part(blade(featherPts(L, 0.44, 0.35), o, [Math.cos(a), 0.03, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], 0.03), featherP(o, L, [GOLD, ORANGE, RED, GOLD2], 0.35));
    }
    // upper covert row (top layer)
    for (let k = 0; k < 9; k++) {
      const x = 0.8 + k * 0.45, a = at(Lp, x), b = at(Tc, x), o = [x, lerp(a[1], b[1], 0.3) + 0.06, lerp(a[2], b[2], 0.3)];
      part(blade(featherPts(0.85, 0.5, 0.9), o, [0.1, -0.03, 1], [1, 0, 0], 0.03), featherP(o, 0.85, [GOLD, GOLD, GOLD2, ORANGE]));
    }
  }
  // ---- tail: short fan + long flowing plumes with turquoise eyes
  for (let j = 0; j < 7; j++) {
    const a = (j - 3) * 0.22, o = [Math.sin(a) * 0.12, -0.42 - Math.abs(j - 3) * 0.02, 1.75];
    R.add(blade(featherPts(2.0, 0.5, 0.7), o, [Math.sin(a), -0.12, Math.cos(a)], [Math.cos(a), 0, -Math.sin(a)], 0.03), featherP(o, 2.0, [RED, ORANGE, GOLD, GOLD2]), 'tailfan');
  }
  const eyes = [];
  for (const r of PH_TAIL) {
    const L = r.L, keys = [];
    for (let k = 0; k <= 6; k++) {
      const d = L * k / 6, p = phTailPoint(r, d);
      const w = 0.035 + 0.045 * sm(0, 0.5 * L, d) + 0.05 * sm(0.55 * L, 0.8 * L, d) - 0.11 * sm(0.88 * L, L, d);
      keys.push([...p, Math.max(0.02, w) * 1.41, 0.025]);
    }
    const skin = (x, y, z) => chain([[`p${r.i}_0`, -99], [`p${r.i}_1`, 1.95 + L * 0.33], [`p${r.i}_2`, 1.95 + L * 0.66]], z, 0.6);
    R.add(tube(keys, { n: 4, seg: 3, phase: Math.PI / 4 }), (x, y, z) => { const f = (z - 1.95) / L; return f < 0.18 ? GOLD : f < 0.45 ? ORANGE : f < 0.78 ? RED : RED2; }, skin);
    const e = phTailPoint(r, 0.83 * L);
    R.add(ell(...e, 0.26, 0.035, 0.34, 7, 3), [GOLD2, 0.35], `p${r.i}_2`);
    R.add(ell(e[0], e[1], e[2] - 0.02, 0.18, 0.045, 0.24, 6, 3), [TURQ, 0.45], `p${r.i}_2`);
    R.add(ell(e[0], e[1], e[2] - 0.03, 0.08, 0.055, 0.11, 6, 3), NAVY, `p${r.i}_2`);
    eyes.push(T.add(`p${r.i}_2`, e));
  }
  // tucked legs with golden talons
  for (const sx of [-1, 1]) {
    R.add(tube([[sx * 0.25, -1.0, 0.45, 0.11, 0.11], [sx * 0.3, -1.18, 1.05, 0.07, 0.07], [sx * 0.28, -1.12, 1.45, 0.05, 0.05]], { n: 6, seg: 2 }), '#7a3a1a', 'root');
    for (let k = -1; k <= 1; k++) R.add(spike([sx * 0.28 + k * 0.05, -1.12, 1.45], [sx * 0.28 + k * 0.1, -1.18, 1.75], 0.035, 3), GOLD, 'root');
  }
  // ---- saddle + pilot
  const sd = addSaddle(R, S, { cy: -0.62, r: 0.68, w: 0.7 });
  addRider(R, S, { legW: 0.7, legDrop: 0.85, handY: sd.handY, handZ: sd.handZ });
  const a0 = 0.14, L0 = 2.55 - 1.5 * 0.14;
  const tip = [5.15 + Math.cos(a0) * L0, -0.06 + 0.03 * L0, -0.55 + Math.sin(a0) * L0];
  return {
    nozzles: [T.add('root', [-0.3, -0.6, 2.1]), T.add('root', [0.3, -0.6, 2.1])],
    tips: [T.add('wing3L', [-tip[0], tip[1], tip[2]]), T.add('wing3R', tip)],
    guns: { nose: T.add('head', [0, 1.36, -4.2]), left: new THREE.Vector3(-2.6, -0.2, -0.5), right: new THREE.Vector3(2.6, -0.2, -0.5) },
    fireTips: [...eyes, T.add('crest', crestTip)],
    fireKinds: ['plume', 'plume', 'plume', 'plume', 'plume', 'crest'],
    radius: 4,
  };
}

// ============================================================ Ngựa sắt (Thánh Gióng's iron horse)
// Armoured iron war-horse with bronze rivets and trim, a mane and tail of living fire, glowing eyes and
// fire-breathing nostrils; it gallops through the sky with burning hooves.
const NG_LEGS = { F: -1.65, H: 1.95 };
function buildNgua(R, S, T) {
  const IRON = '#3d4046', IRON2 = '#50555c', IRON3 = '#24262a', BRONZE = '#b07a32', BRONZE2 = '#d8a250';
  const EMBERD = ['#e0380a', 1.0], EMBER = ['#ff7012', 1.25], EMBER2 = ['#ffbe34', 1.45];
  // Gióng's horse is a giant: the beast is modelled at horse scale and enlarged around the seat (the pilot is not)
  const K = 1.2;
  R.mtx = new THREE.Matrix4().makeScale(K, K, K);
  const TK = (b, p) => T.add(b, p.map(v => v * K));
  // ---- bones
  R.bone('root', null, [0, 0, 0]);
  R.bone('neck1', 'root', [0, -0.55, -2.0]);
  R.bone('neck2', 'neck1', [0, 0.45, -2.75]);
  R.bone('head', 'neck2', [0, 1.3, -3.25]);
  R.bone('jaw', 'head', [0, 0.85, -3.55]);
  R.bone('tail1', 'root', [0, -0.6, 2.85]);
  R.bone('tail2', 'tail1', [0, -0.8, 4.0]);
  for (const s of ['L', 'R']) {
    const sx = s === 'R' ? 1 : -1;
    R.bone('F' + s + 'a', 'root', [sx * 0.48, -1.2, NG_LEGS.F]);
    R.bone('F' + s + 'b', 'F' + s + 'a', [sx * 0.5, -2.32, NG_LEGS.F + 0.1]);
    R.bone('H' + s + 'a', 'root', [sx * 0.5, -1.15, NG_LEGS.H]);
    R.bone('H' + s + 'b', 'H' + s + 'a', [sx * 0.53, -2.3, NG_LEGS.H + 0.45]);
  }
  // ---- armoured barrel body: lamellar bands, bronze trim, rivets
  const armP = (x, y, z, nx, ny) => {
    const a = Math.atan2(ny, Math.abs(nx));
    if (a < -0.75) return IRON3;
    if (a < -0.55) return BRONZE;
    return a > 0.6 ? IRON2 : IRON;
  };
  const spB = spine([[0, -1.05, -2.35, 0.55, 0.62], [0, -0.95, -1.75, 0.8, 0.92], [0, -0.92, -0.8, 0.84, 0.95], [0, -0.95, 0.4, 0.8, 0.9],
    [0, -0.88, 1.5, 0.86, 0.92], [0, -0.92, 2.4, 0.72, 0.8], [0, -1.05, 2.95, 0.34, 0.38]], { seg: 3, bot: 0.92 });
  R.add(tube(spB, { n: 12 }), armP, 'root');
  // lamellar bands: bronze hoops with rivets (the saddle cloth covers the middle)
  for (const z of [-1.55, -0.95, 1.05, 1.65, 2.25]) {
    const u = uAtZ(spB, z), k = Math.floor(u * (spB.M - 1)), A = spB.S[k], Bq = spB.S[Math.min(spB.M - 1, k + 1)], f = u * (spB.M - 1) - k;
    const rx = lerp(A[3], Bq[3], f) * 1.02, ry = lerp(A[4], Bq[4], f) * 1.02, cy = lerp(A[1], Bq[1], f);
    R.add(new THREE.TorusGeometry(1, 0.045, 3, 16, Math.PI + 1.3).rotateZ(-0.65).scale(rx, ry, 1).translate(0, cy, z), BRONZE, 'root');
    for (const a of [0.2, 0.75]) for (const sx of [-1, 1]) {
      const p = surf(spB, u, sx > 0 ? a : Math.PI - a, 1.0);
      R.add(ell(p[0], p[1], p[2] + 0.07, 0.045, 0.045, 0.045, 4, 3), BRONZE2, 'root');
    }
  }
  // shoulder and croup armour give the barrel a horse's silhouette
  for (const sx of [-1, 1]) R.add(ell(sx * 0.5, -0.92, -1.55, 0.36, 0.66, 0.6, 9, 6), IRON2, 'root');
  R.add(ell(0, -0.66, 2.05, 0.84, 0.5, 0.95, 12, 6), IRON2, 'root');
  // chest plate (peytral) and Đông Sơn sun discs on the flanks
  R.add(ell(0, -0.95, -2.1, 0.66, 0.78, 0.42, 12, 7), (x, y, z, nx, ny, nz) => (nz > -0.55 || Math.abs(x) > 0.5 ? BRONZE : IRON2), 'root');
  for (const sx of [-1, 1]) {
    const p = surf(spB, uAtZ(spB, 1.55), sx > 0 ? 0.05 : Math.PI - 0.05, 1.0);
    const n = [sx, 0.05, 0];
    R.add(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 14).rotateZ(Math.PI / 2).translate(p[0] + sx * 0.02, p[1], p[2]), BRONZE, 'root');
    circleDot(R, [p[0] + sx * 0.06, p[1], p[2]], n, 0.24, BRONZE2, [BRONZE2, 0.4], 'root');
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8;
      R.add(spike([p[0] + sx * 0.06, p[1] + Math.sin(a) * 0.05, p[2] + Math.cos(a) * 0.05], [p[0] + sx * 0.06, p[1] + Math.sin(a) * 0.17, p[2] + Math.cos(a) * 0.17], 0.025, 3), BRONZE2, 'root');
    }
  }
  // ---- neck + head (armoured), glowing eyes and nostrils
  const neckSkin = (x, y) => chain([['root', -99], ['neck1', -0.55], ['neck2', 0.45], ['head', 1.3]], y, 0.3);
  R.add(tube([[0, -0.72, -1.9, 0.6, 0.85], [0, -0.15, -2.5, 0.42, 0.62], [0, 0.6, -2.95, 0.32, 0.48], [0, 1.2, -3.22, 0.27, 0.38], [0, 1.42, -3.3, 0.22, 0.28]],
    { n: 10, seg: 3 }), (x, y, z, nx, ny, nz) => (nz < -0.55 ? IRON2 : IRON), neckSkin);
  R.add(tube([[0, 1.45, -3.18, 0.2, 0.24], [0, 1.3, -3.45, 0.27, 0.3], [0, 1.0, -3.8, 0.23, 0.26], [0, 0.68, -4.15, 0.18, 0.21], [0, 0.45, -4.42, 0.18, 0.2],
    [0, 0.33, -4.58, 0.15, 0.16], [0, 0.3, -4.66, 0.06, 0.06]], { n: 10, seg: 2 }), (x, y, z, nx, ny, nz) => {
    const a = Math.atan2((ny - nz) * 0.7071, nx) * 180 / Math.PI;
    return y > 0.42 && Math.abs(a - 90) < 18 ? BRONZE : Math.abs(a - 90) < 54 ? IRON2 : IRON;
  }, 'head');
  R.add(tube([[0, 0.85, -3.5, 0.2, 0.14], [0, 0.42, -4.05, 0.15, 0.1], [0, 0.17, -4.42, 0.12, 0.08], [0, 0.13, -4.52, 0.04, 0.04]], { n: 8, seg: 2 }), IRON2, 'jaw');
  R.add(blade([[0, -0.12], [0.75, -0.1], [0.92, 0], [0.75, 0.1], [0, 0.12]], [0, 0.4, -3.95], [0, -0.62, -0.6], [1, 0, 0], 0.05), EMBER, 'jaw');   // fiery mouth
  // chamfron: the face is plated (lighter iron) with a bronze ridge and a crest spike
  R.add(spike([0, 1.55, -3.58], [0, 2.0, -3.86], 0.07, 4), BRONZE2, 'head');
  for (const sx of [-1, 1]) {
    R.add(spike([sx * 0.13, 1.48, -3.2], [sx * 0.2, 1.88, -3.02], 0.075, 4), IRON2, 'head');                     // ears
    R.add(ell(sx * 0.235, 1.12, -3.62, 0.065, 0.075, 0.1, 6, 4), EMBER, 'head');                                  // eyes
    R.add(ell(sx * 0.09, 0.4, -4.64, 0.05, 0.055, 0.04, 6, 4), EMBER2, 'head');                                    // nostrils
    R.add(ring(sx * 0.17, 0.33, -4.32, 0.07, 0.02, 1, 1, 8).rotateX(0), BRONZE2, 'head');                         // bit ring
  }
  // ---- mane of fire (along the crest of the neck) and burning tail
  const flameP = (o, L) => (x, y, z) => { const d = Math.hypot(x - o[0], y - o[1], z - o[2]) / L; return d < 0.32 ? EMBERD : d < 0.7 ? EMBER : EMBER2; };
  const maneTips = [];
  for (let j = 0; j < 8; j++) {
    const t = j / 7, o = [0, lerp(1.6, 0.05, t), lerp(-3.12, -1.75, t) + 0.12 * Math.sin(t * Math.PI)];
    const L = 0.75 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.3)), U = [0, 0.72, 0.7], V = [0, -0.7, 0.72];
    R.add(blade(tonguePts(L, 0.48, 0.4, 3), o, U, V, 0.05), flameP(o, L), neckSkin);
    if (j === 1 || j === 4 || j === 6) maneTips.push([o[0], o[1] + U[1] * L + V[1] * 0.4 * L, o[2] + U[2] * L + V[2] * 0.4 * L]);
    if (j % 2 === 0 && j < 7) for (const sx of [-1, 1]) {
      const o2 = [sx * 0.1, o[1] - 0.05, o[2] + 0.1];
      R.add(blade(tonguePts(L * 0.85, 0.38, 0.35, 3), o2, [sx * 0.6, 0.6, 0.65], [0, -0.7, 0.72], 0.04), flameP(o2, L * 0.85), neckSkin);
    }
  }
  const tailSkin = (x, y, z) => chain([['tail1', -99], ['tail2', 4.0]], z, 0.5);
  R.add(tube([[0, -0.62, 2.8, 0.16, 0.18], [0, -0.72, 3.25, 0.12, 0.13], [0, -0.8, 3.55, 0.06, 0.06]], { n: 7, seg: 2 }), IRON, tailSkin);
  const tailTips = [];
  for (const [ax, ay, L, w, c] of [[0, 0.05, 2.9, 0.62, 0.3], [0.32, -0.12, 2.3, 0.5, -0.3], [-0.32, -0.12, 2.3, 0.5, 0.3], [0.12, 0.3, 2.0, 0.45, 0.35], [-0.12, -0.35, 2.1, 0.45, -0.35]]) {
    const o = [0, -0.72, 3.15];
    R.add(blade(tonguePts(L, w, c, 4), o, [ax, ay, 1], [0, 1, 0], 0.05), flameP(o, L), tailSkin);
    if (ax === 0 && ay > 0) tailTips.push([0, o[1] + ay * L + c * L, o[2] + L]);
    if (ax > 0.2 || ax < -0.2) tailTips.push([o[0] + ax * L * 0.95, o[1] + ay * L * 0.95 + c * L, o[2] + L * 0.95]);
  }
  // ---- four legs: iron greaves, bronze knee bands, burning hooves
  const hooves = [];
  for (const s of ['L', 'R']) for (const fh of ['F', 'H']) {
    const sx = s === 'R' ? 1 : -1, z = NG_LEGS[fh], hind = fh === 'H', a = fh + s + 'a', b = fh + s + 'b';
    const K = hind
      ? [[sx * 0.5, -0.9, z, 0.38, 0.46], [sx * 0.53, -1.65, z + 0.3, 0.27, 0.3], [sx * 0.53, -2.3, z + 0.45, 0.14, 0.16], [sx * 0.53, -2.95, z + 0.3, 0.1, 0.11],
        [sx * 0.53, -3.28, z + 0.2, 0.12, 0.12], [sx * 0.53, -3.52, z + 0.12, 0.15, 0.15], [sx * 0.53, -3.64, z + 0.1, 0.17, 0.16]]
      : [[sx * 0.48, -0.95, z, 0.3, 0.36], [sx * 0.5, -1.7, z + 0.05, 0.22, 0.25], [sx * 0.5, -2.32, z + 0.1, 0.14, 0.16], [sx * 0.5, -2.95, z + 0.05, 0.1, 0.11],
        [sx * 0.5, -3.28, z - 0.02, 0.12, 0.12], [sx * 0.5, -3.52, z - 0.08, 0.15, 0.15], [sx * 0.5, -3.64, z - 0.1, 0.17, 0.16]];
    const ky = K[2][1];
    R.add(tube(K, { n: 8, seg: 2, ref: [0, 0, -1] }), (x, y, zz, nx, ny) => (y < -3.42 ? IRON3 : Math.abs(y - ky) < 0.13 || Math.abs(y + 3.28) < 0.06 ? BRONZE : ny > 0.3 ? IRON2 : IRON),
      (x, y) => chain([[b, -99], [a, ky]], y, 0.25));
    const F = K[6];
    R.add(ell(F[0], -3.69, F[2], 0.15, 0.035, 0.15, 7, 3), EMBER2, b);                                             // burning sole
    const o = [F[0], -3.26, K[4][2] + 0.05];
    R.add(blade(tonguePts(0.6, 0.26, 0.35, 3), o, [sx * 0.1, 0.2, 1], [0, 1, 0], 0.04), flameP(o, 0.6), b);       // fetlock flame
    hooves.push({ b, p: [F[0], -3.7, F[2]] });
  }
  // ---- saddle + reins + pilot
  R.mtx = null;
  const sd = addSaddle(R, S, { cy: -0.93 * K, r: 0.95 * K, w: 0.84 * K });
  addRider(R, S, { legW: 0.84 * K, legDrop: 1.1, handY: sd.handY, handZ: sd.handZ });
  for (const sx of [-1, 1]) {
    const P0 = [sx * 0.17 * K, 0.36 * K, -4.28 * K], P1 = [sx * 0.3 * K, 1.0 * K, -2.95 * K], P2 = [sx * 0.27, sd.handY + 0.02, sd.handZ - 0.05];
    R.add(tube([[...P0, 0.022, 0.022], [...P1, 0.022, 0.022], [...P2, 0.022, 0.022]], { n: 4, seg: 3 }), '#5a3418', (x, y, z) => {
      const t = clamp((z - P0[2]) / (P2[2] - P0[2]), 0, 1);
      return t < 0.5 ? [['head', 1 - t * 2], ['neck2', t * 2]] : [['neck2', 2 - t * 2], ['rider', t * 2 - 1]];
    });
  }
  const hb = hooves.filter(h => h.b[0] === 'H');
  return {
    nozzles: [TK('root', [-0.35, -0.75, 2.9]), TK('root', [0.35, -0.75, 2.9])],
    tips: [TK(hb.find(h => h.b[1] === 'L').b, hb.find(h => h.b[1] === 'L').p), TK(hb.find(h => h.b[1] === 'R').b, hb.find(h => h.b[1] === 'R').p)],
    guns: { nose: TK('head', [0, 0.32, -4.85]), left: new THREE.Vector3(-1.2, -0.5, -2.4), right: new THREE.Vector3(1.2, -0.5, -2.4) },
    fireTips: [TK('head', [-0.09, 0.38, -4.72]), TK('head', [0.09, 0.38, -4.72]), ...maneTips.map(p => TK(p[1] > 1.0 ? 'head' : p[1] > 0.45 ? 'neck2' : 'neck1', p)),
      ...tailTips.slice(0, 2).map(p => TK('tail2', p)), ...hooves.map(h => TK(h.b, h.p))],
    fireKinds: ['nostril', 'nostril', 'mane', 'mane', 'mane', 'tail', 'tail', 'hoof', 'hoof', 'hoof', 'hoof'],
    radius: 4.2,
  };
}

// ============================================================ Chim Lạc (bird of the Đông Sơn bronze drums)
// Long straight beak, long neck, comb-like crest plumes, slender wings of parallel feathers, long legs trailing
// behind; bronze-green patina with gold engraved lines and circle-and-dot motifs, glowing gold eyes.
function buildChimLac(R, S, T) {
  const PAT = '#3e7c68', PAT2 = '#2a5a4c', PAT3 = '#5c9a82', BRZ = '#a8743a', BRZ2 = '#c89448', DARK = '#1c2a24';
  const GOLD = ['#e2b448', 0.3], GOLDB = ['#f2c860', 0.6], GOLDE = ['#ffd060', 1.5];
  // ---- bones
  R.bone('root', null, [0, 0, 0]);
  R.bone('neck1', 'root', [0, -0.42, -1.35]);
  R.bone('neck2', 'neck1', [0, -0.05, -2.25]);
  R.bone('head', 'neck2', [0, 0.72, -3.35]);
  R.bone('crest', 'head', [0, 1.0, -3.5]);
  R.bone('tail', 'root', [0, -0.45, 1.85]);
  for (const s of ['R', 'L']) {
    const sx = s === 'R' ? 1 : -1;
    R.bone('wing1' + s, 'root', [sx * 0.45, -0.4, 0.45]);
    R.bone('wing2' + s, 'wing1' + s, [sx * 2.5, -0.18, -0.1]);
    R.bone('wing3' + s, 'wing2' + s, [sx * 4.4, -0.04, -0.3]);
    R.bone('leg' + s, 'root', [sx * 0.2, -0.85, 0.5]);
  }
  // engraved stripes follow the tube's facets: columns of faces alternate patina / gold line
  const stripes = (nx, ny, top = PAT) => {
    const a = Math.atan2(ny, Math.abs(nx));
    if (a < -0.95) return PAT2;
    const col = Math.floor((a + Math.PI / 2) / (Math.PI / 6));
    return col === 2 || col === 4 ? GOLD : col >= 5 ? top : PAT;
  };
  // ---- body
  R.add(tube([[0, -0.45, -1.55, 0.3, 0.32], [0, -0.5, -0.9, 0.5, 0.52], [0, -0.52, 0, 0.56, 0.55], [0, -0.5, 0.9, 0.46, 0.44],
    [0, -0.45, 1.7, 0.28, 0.26], [0, -0.42, 2.2, 0.12, 0.12]], { n: 12, seg: 3, bot: 0.92 }), (x, y, z, nx, ny) => stripes(nx, ny, PAT3), 'root');
  for (const sx of [-1, 1]) for (const z of [-0.95, -0.25, 0.45, 1.1]) {
    const r = z > 1 ? 0.36 : z < -0.6 ? 0.42 : 0.52;
    circleDot(R, [sx * (r + 0.01), -0.58, z], [sx, -0.15, 0], 0.13, GOLD, GOLDB, 'root');
  }
  // ---- neck with engraved collars
  const neckSkin = (x, y) => chain([['root', -99], ['neck1', -0.42], ['neck2', -0.05], ['head', 0.72]], y, 0.25);
  R.add(tube([[0, -0.42, -1.3, 0.3, 0.32], [0, -0.2, -2.0, 0.2, 0.2], [0, 0.2, -2.6, 0.16, 0.16], [0, 0.6, -3.15, 0.14, 0.15], [0, 0.82, -3.45, 0.15, 0.16]],
    { n: 10, seg: 3 }), (x, y, z, nx, ny, nz) => (nz < -0.5 ? PAT3 : PAT), neckSkin);
  for (const [y, z, r] of [[-0.12, -2.15, 0.2], [0.25, -2.65, 0.165], [0.6, -3.12, 0.145]]) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.62, -0.78));
    R.add(new THREE.TorusGeometry(r, 0.028, 3, 12).applyQuaternion(q).translate(0, y, z), GOLD, neckSkin);
  }
  // ---- head: long straight beak, glowing concentric eyes, crest plumes
  R.add(ell(0, 0.88, -3.62, 0.19, 0.21, 0.3, 10, 7), (x, y, z, nx, ny) => (ny > 0.6 ? PAT3 : PAT), 'head');
  R.add(tube([[0, 0.88, -3.82, 0.12, 0.11], [0, 0.8, -4.6, 0.09, 0.08], [0, 0.7, -5.5, 0.055, 0.05], [0, 0.62, -6.25, 0.025, 0.022], [0, 0.59, -6.5, 0.006, 0.006]],
    { n: 7, seg: 2 }), (x, y, z) => (z < -6.0 ? DARK : z > -4.2 ? GOLD : BRZ2), 'head');
  R.add(tube([[0, 0.76, -3.82, 0.09, 0.06], [0, 0.66, -5.2, 0.05, 0.035], [0, 0.6, -6.15, 0.015, 0.012]], { n: 6, seg: 2 }), BRZ, 'head');
  for (const sx of [-1, 1]) {
    R.add(ell(sx * 0.15, 0.95, -3.7, 0.05, 0.1, 0.1, 6, 5), DARK, 'head');
    circleDot(R, [sx * 0.19, 0.95, -3.7], [sx, 0.1, -0.15], 0.075, GOLDE, GOLDE, 'head');
  }
  let crestTip = null;
  [[0.32, 1.9, 0.2], [0.5, 1.6, 0.18], [0.7, 1.25, 0.17], [0.92, 0.95, 0.15]].forEach(([th, L, w], i) => {
    const U = [0, Math.sin(th), Math.cos(th)], o = [(i & 1 ? 0.012 : -0.012), 1.0, -3.55 + i * 0.05];
    R.add(blade(featherPts(L, w, 0.25), o, U, [0, Math.cos(th), -Math.sin(th)], 0.035), (x, y, z) => (Math.hypot(y - o[1], z - o[2]) > L * 0.75 ? GOLDB : i & 1 ? PAT3 : GOLD), 'crest');
    if (i === 0) crestTip = [o[0], o[1] + U[1] * L, o[2] + U[2] * L];
  });
  // ---- slender wings: engraved covert sheet + comb of long parallel feathers
  const Lp = [[0.45, -0.4, 0.2], [1.5, -0.3, -0.15], [2.5, -0.18, -0.3], [3.5, -0.1, -0.45], [4.4, -0.04, -0.5], [5.0, 0.0, -0.45]];
  const Tc = [[0.45, -0.45, 1.4], [1.5, -0.36, 1.3], [2.5, -0.25, 1.05], [3.5, -0.14, 0.65], [4.4, -0.06, 0.2], [5.0, 0.0, -0.45]];
  const at = (arr, x) => {
    let i = 0; while (i < arr.length - 2 && arr[i + 1][0] < x) i++;
    const a = arr[i], b = arr[i + 1], t = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  };
  const wingSkin = s => (x) => {
    const ax = Math.abs(x), w = chain([['wing1' + s, -99], ['wing2' + s, 2.5], ['wing3' + s, 4.4]], ax, 0.5);
    const kb = 1 - sm(0.5, 1.2, ax);
    return kb > 0 ? [['root', kb], ...w.map(e => [e[0], e[1] * (1 - kb)])] : w;
  };
  const tipP = (o, L, c0, c1) => (x, y, z) => (Math.hypot(Math.abs(x) - Math.abs(o[0]), z - o[2]) > L * 0.8 ? c1 : c0);
  let wingTip = null;
  for (const s of ['R', 'L']) {
    const sx = s === 'R' ? 1 : -1, sk = wingSkin(s);
    const part = (g, paint) => R.add(sx > 0 ? g : mirror(g), paint, sk);
    part(sheet(Lp, Tc, { C: 5, step: 0.3, thick: 0.05, camber: (u, c) => [0, -0.1 * Math.sin(Math.PI * c) * (1 - u * 0.5), 0] }),
      (x, y, z, nx, ny, nz, u, c) => (c < 0.12 ? BRZ2 : (c > 0.3 && c < 0.42) || c > 0.88 ? GOLD : PAT));
    part(tube([[0.45, -0.4, 0.25, 0.18, 0.13], [2.5, -0.18, -0.25, 0.11, 0.08], [4.4, -0.04, -0.48, 0.07, 0.06], [5.05, 0.0, -0.45, 0.03, 0.03]], { n: 6, seg: 3 }), BRZ2);
    // circle-and-dot motifs along the wing
    for (const x of [1.1, 1.85, 2.6, 3.35]) {
      const a = at(Lp, x), b = at(Tc, x), p = [x, lerp(a[1], b[1], 0.62) + 0.045, lerp(a[2], b[2], 0.62)];
      circleDot({ add: (g, paint) => part(g, paint) }, p, [0, 1, 0], 0.17, GOLD, GOLDB, sk);   // mirrored via part()
    }
    // comb of long parallel secondaries
    for (let k = 0; k <= 11; k++) {
      const x = 0.62 + k * 0.33, p = at(Tc, x), o = [p[0], p[1] - 0.04 + (k & 1) * 0.012, p[2] - 0.3];
      const L = 1.45 + 0.12 * Math.sin(k * 1.3);
      part(blade(featherPts(L, 0.3, 0.3), o, [0.03 + k * 0.02, -0.02, 1], [1, 0, 0], 0.03), tipP(o, L, k & 1 ? PAT3 : PAT2, GOLD));
    }
    // long primaries at the hand
    const H0 = [4.1, -0.06, 0.05], H1 = [4.95, -0.02, -0.42];
    for (let k = 0; k < 6; k++) {
      const a = 0.12 + k * 0.2, o = [lerp(H1[0], H0[0], k / 5), lerp(H1[1], H0[1], k / 5) - 0.04 - (k & 1) * 0.012, lerp(H1[2], H0[2], k / 5)];
      const L = 2.5 - k * 0.12;
      part(blade(featherPts(L, 0.32, 0.25), o, [Math.cos(a), 0.02, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], 0.03), tipP(o, L, k & 1 ? PAT3 : PAT, GOLDB));
      if (k === 0 && sx > 0) wingTip = [o[0] + Math.cos(a) * L, o[1] + 0.02 * L, o[2] + Math.sin(a) * L];
    }
  }
  // ---- tail: long straight plumes
  const tailTips = [];
  for (let j = 0; j < 5; j++) {
    const a = (j - 2) * 0.13, o = [Math.sin(a) * 0.1, -0.44 - Math.abs(j - 2) * 0.015, 1.7], L = 3.0 - Math.abs(j - 2) * 0.28;
    R.add(blade(featherPts(L, 0.3, 0.3), o, [Math.sin(a), -0.08, Math.cos(a)], [Math.cos(a), 0, -Math.sin(a)], 0.03),
      (x, y, z) => (Math.hypot(x - o[0], z - o[2]) > L * 0.8 ? GOLDB : j & 1 ? PAT3 : PAT), 'tail');
    if (j === 1 || j === 3) tailTips.push([o[0] + Math.sin(a) * L, o[1] - 0.08 * L, o[2] + Math.cos(a) * L]);
  }
  // ---- long legs trailing behind
  for (const s of ['L', 'R']) {
    const sx = s === 'R' ? 1 : -1, b = 'leg' + s;
    R.add(tube([[sx * 0.2, -0.82, 0.45, 0.13, 0.13], [sx * 0.24, -1.02, 1.1, 0.08, 0.08], [sx * 0.23, -1.0, 2.1, 0.05, 0.05], [sx * 0.22, -0.98, 3.05, 0.045, 0.045],
      [sx * 0.21, -0.97, 3.3, 0.055, 0.05]], { n: 6, seg: 2 }), (x, y, z) => (z < 0.9 ? PAT : BRZ), b);
    for (const z of [1.1, 3.05]) R.add(ring(sx * 0.235, -1.0, z, 0.075, 0.022, 1, 1, 8).rotateX(0), GOLD, b);
    for (let k = -1; k <= 1; k++) R.add(spike([sx * 0.21 + k * 0.05, -0.97, 3.3], [sx * 0.21 + k * 0.14, -1.0, 3.8], 0.03, 3), BRZ2, b);
    R.add(spike([sx * 0.21, -0.97, 3.3], [sx * 0.21, -0.98, 3.05 - 0.1], 0.025, 3), BRZ2, b);
  }
  // ---- saddle + pilot
  const sd = addSaddle(R, S, { cy: -0.52, r: 0.55 });
  addRider(R, S, { legW: 0.56, legDrop: 0.9, handY: sd.handY, handZ: sd.handZ });
  return {
    nozzles: [T.add('root', [-0.25, -0.5, 1.9]), T.add('root', [0.25, -0.5, 1.9])],
    tips: [T.add('wing3L', [-wingTip[0], wingTip[1], wingTip[2]]), T.add('wing3R', wingTip)],
    guns: { nose: T.add('head', [0, 0.59, -6.6]), left: new THREE.Vector3(-2.4, -0.2, -0.3), right: new THREE.Vector3(2.4, -0.2, -0.3) },
    fireTips: [T.add('crest', crestTip), ...tailTips.map(p => T.add('tail', p))],
    fireKinds: ['crest', 'tail', 'tail'],
    radius: 4,
  };
}

// ============================================================ Animation: dragon (travelling S-wave along the whole body)
function rongAnimator(B) {
  let ph = 0, amp = 0.82, lat = 0.8, flare = 0, tuck = 0, turn = 0, cl = 0;
  const e = 0.05;
  return (t, dt, s) => {
    dt = Math.min(dt, 0.1);
    const speed = s.speed ?? 1, boost = s.boost || 0, brake = s.brake || 0, bank = s.bank || 0, climb = s.climb || 0;
    tuck = damp(tuck, boost, 4, dt); flare = damp(flare, brake, 5, dt); turn = damp(turn, bank, 4, dt); cl = damp(cl, climb, 3, dt);
    const f = 0.5 + 0.2 * (speed - 1) + 0.55 * tuck + 0.25 * Math.max(0, cl) + 0.1 * flare;
    ph += dt * f * TAU;
    amp = damp(amp, (0.82 + 0.3 * Math.max(0, cl) + 0.15 * flare) * (1 - 0.45 * tuck) * (1 - 0.5 * Math.max(0, -cl)), 3, dt);
    lat = damp(lat, 0.8 * (1 - 0.5 * tuck) * (1 - 0.3 * Math.max(0, -cl)), 3, dt);
    const k = TAU / 7.0;
    // envelope: zero at the seat, gentler toward the head, growing toward the tail
    const env = z => sm(0.35, 4.0, Math.abs(z)) * (z < 0 ? 0.5 : 1 + z * 0.03);
    const Y = z => amp * env(z) * Math.sin(k * z - ph) - flare * 0.012 * Math.max(0, z) * z + flare * 0.03 * Math.max(0, -z);
    const X = z => lat * env(z) * Math.sin(k * 0.85 * z - ph * 0.85 + 0.8) - turn * 0.012 * z * z;
    const dY = z => (Y(z + e) - Y(z - e)) / (2 * e), dX = z => (X(z + e) - X(z - e)) / (2 * e);
    // tail chain (distal +Z)
    let pv = 0, pl = 0;
    for (let i = 0; i < RONG_BZ.length; i++) {
      const zm = RONG_BZ[i] + 0.62, th = Math.atan(dY(zm)), fi = Math.atan(dX(zm)), b = B['b' + i];
      b.rotation.x = -(th - pv); b.rotation.y = fi - pl;
      pv = th; pl = fi;
    }
    B.tuft.rotation.x = 0.14 * Math.sin(ph * 1.7) * (1 - tuck * 0.5) + flare * 0.3;
    B.tuft.rotation.y = 0.18 * Math.sin(ph * 1.3 + 1) - turn * 0.2;
    // neck chain (distal -Z)
    pv = 0; pl = 0;
    for (let i = 0; i < RONG_FRONT.length; i++) {
      const zm = RONG_FRONT[i] - 0.62, th = Math.atan(-dY(zm)) + cl * 0.03, fi = Math.atan(dX(zm)), b = B['n' + i];
      b.rotation.x = th - pv; b.rotation.y = fi - pl;
      pv = th; pl = fi;
    }
    // the head stays steady, rears on brake and looks into the turn
    B.head.rotation.x = -pv * 0.8 + flare * 0.15 - tuck * 0.06;
    B.head.rotation.y = -pl * 0.6 + turn * 0.22;
    B.jaw.rotation.x = -(0.1 + 0.06 * Math.sin(t * 1.1) + 0.14 * tuck + 0.1 * flare);
    B.pearl.position.y = B.pearl.userData.rest.y + 0.07 * Math.sin(t * 2.3);
    B.pearl.rotation.z = t * 1.4;
    for (const [sd, sx] of [['R', 1], ['L', -1]]) {
      B['whisk1' + sd].rotation.z = sx * (0.1 * Math.sin(t * 2.4 + sx) + 0.05);
      B['whisk2' + sd].rotation.z = sx * 0.22 * Math.sin(t * 2.4 + sx - 1.1);
      B['whisk1' + sd].rotation.y = sx * (-0.06 - tuck * 0.35 + flare * 0.15);
      B['whisk2' + sd].rotation.y = sx * (-0.08 * Math.sin(t * 1.7) - tuck * 0.25);
      B['mane' + sd].rotation.x = 0.07 * Math.sin(t * 6.5 + sx) + 0.08 * tuck;
      B['mane' + sd].rotation.y = sx * (0.05 * Math.sin(t * 4.3) - 0.1 * tuck);
      B['lf' + sd].rotation.x = 0.3 * amp * Math.sin(ph + 1.5) - 0.3 * tuck + 0.8 * flare;
      B['lh' + sd].rotation.x = 0.3 * amp * Math.sin(ph + 3.0) - 0.3 * tuck + 0.6 * flare;
      B['lf' + sd].rotation.z = sx * 0.12 * flare;
    }
    B.root.position.y = B.root.userData.rest.y + 0.04 * amp * Math.sin(ph + 0.5);
    riderAnim(B, t, s, 0.5 * amp * Math.sin(ph + 0.5));
  };
}

// ============================================================ Animation: winged mounts (phượng hoàng, chim Lạc)
function wingAnimator(B, kind) {
  const phx = kind === 'phuong';
  const P = phx ? { f0: 0.6, amp: 0.5, gp: 0.33 } : { f0: 0.68, amp: 0.56, gp: 0.27 };
  let ph = 0, amp = P.amp, gl = 0, tuck = 0, flare = 0, tph = 0, turn = 0, cl = 0;
  return (t, dt, s) => {
    dt = Math.min(dt, 0.1);
    const speed = s.speed ?? 1, boost = s.boost || 0, brake = s.brake || 0, bank = s.bank || 0, climb = s.climb || 0;
    tuck = damp(tuck, boost, 4, dt); flare = damp(flare, brake, 5, dt); turn = damp(turn, bank, 4, dt); cl = damp(cl, climb, 3, dt);
    // long glides every few beats (and whenever diving); climbing / boosting / braking keeps it beating
    const auto = s.glide ?? sm(0.45, 0.8, Math.sin(t * P.gp + 1.0));
    const glT = clamp(Math.max(auto * (1 - Math.max(0, cl) * 1.5), -cl * 1.3), 0, 1) * (1 - boost * 0.8) * (1 - brake);
    gl = damp(gl, glT, 2.2, dt);
    const A = (P.amp + 0.14 * Math.max(0, cl) + 0.05 * boost + 0.1 * brake) * (1 - gl * 0.93);
    amp = damp(amp, A * (1 - 0.35 * tuck), 4, dt);
    const f = P.f0 + 0.3 * Math.max(0, cl) + 0.6 * boost + 0.15 * (speed - 1) + 0.2 * brake;
    ph += dt * f * TAU * (1 - gl * 0.6);
    const w1 = Math.sin(ph + 0.35 * Math.sin(ph));                 // quick, powerful down-stroke
    const w2 = Math.sin(ph - 0.6 + 0.35 * Math.sin(ph - 0.6));
    const w3 = Math.sin(ph - 1.2 + 0.3 * Math.sin(ph - 1.2));
    const dih = 0.07 + gl * 0.05 - tuck * 0.05;
    for (const [sd, sx] of [['R', 1], ['L', -1]]) {
      const a = B['wing1' + sd], b = B['wing2' + sd], c = B['wing3' + sd];
      a.rotation.z = sx * (dih + amp * w1) + turn * 0.06;
      a.rotation.y = sx * (-tuck * 0.3 + flare * 0.12);
      a.rotation.x = flare * 0.3 + amp * 0.12 * Math.cos(ph);
      b.rotation.z = sx * (amp * 0.45 * w2 + gl * 0.03 - tuck * 0.08);
      b.rotation.y = sx * (-tuck * 0.55 + flare * 0.08);
      c.rotation.z = sx * (amp * 0.36 * w3 - gl * 0.05);
      c.rotation.y = sx * (-tuck * 0.45 + flare * 0.22);
      c.rotation.x = amp * 0.22 * Math.cos(ph - 1.2) + flare * 0.25;
    }
    B.root.position.y = B.root.userData.rest.y - amp * 0.2 * Math.sin(ph - 0.5);
    B.root.rotation.x = -cl * 0.04 + flare * 0.06;
    // neck counter-bobs so the head glides level; head looks into the turn
    B.neck1.rotation.x = 0.06 * amp * Math.sin(ph - 1.0) - cl * 0.06 + flare * 0.12 - tuck * 0.12;
    B.neck2.rotation.x = 0.05 * amp * Math.sin(ph - 1.6) + flare * 0.06 - tuck * 0.1;
    B.head.rotation.x = -(B.neck1.rotation.x + B.neck2.rotation.x) * 0.8 + tuck * 0.12;
    B.neck1.rotation.y = turn * 0.12;
    B.neck2.rotation.y = turn * 0.1;
    B.head.rotation.y = turn * 0.25;
    B.crest.rotation.x = 0.06 * Math.sin(t * 5.3) + 0.25 * tuck;
    tph += dt * (0.8 + 0.35 * speed + 0.9 * boost) * TAU;
    if (phx) {
      for (const r of PH_TAIL) for (let j = 0; j < 3; j++) {
        const b = B[`p${r.i}_${j}`], A2 = (0.06 + 0.05 * j) * (1 - 0.5 * tuck) * (1 + flare * 0.5);
        b.rotation.x = A2 * Math.sin(tph - j * 1.1 - r.i * 0.45) + (j === 0 ? 0.04 - flare * 0.25 + cl * 0.1 + amp * 0.05 * Math.sin(ph - 1.5) : 0);
        b.rotation.y = 0.05 * (j + 1) * Math.sin(tph * 0.6 - j * 0.9 + r.i * 1.3) - turn * 0.07 * (j + 1) + (j === 0 ? (r.i - 2) * flare * 0.12 : 0);
      }
      B.tailfan.rotation.x = -flare * 0.3 + 0.04 * Math.sin(ph - 1.2);
    } else {
      B.tail.rotation.x = -flare * 0.3 + 0.05 * Math.sin(ph - 1.3) + cl * 0.06;
      B.tail.rotation.y = 0.04 * Math.sin(tph * 0.5) - turn * 0.1;
      for (const [sd, sx] of [['R', 1], ['L', -1]]) {
        B['leg' + sd].rotation.x = 0.06 * Math.sin(ph - 2.0) + flare * 0.7 - tuck * 0.05;
        B['leg' + sd].rotation.y = sx * 0.03 * Math.sin(tph * 0.7);
      }
    }
    riderAnim(B, t, s, -amp * Math.sin(ph - 0.5));
  };
}

// ============================================================ Animation: iron horse (flying gallop)
function nguaAnimator(B) {
  let ph = 0, flare = 0, tuck = 0, turn = 0, cl = 0, leap = 0, ampK = 1;
  // rotary gallop: hind pair, then fore pair, each slightly staggered
  const off = { FL: 0.0, FR: 0.45, HL: Math.PI + 0.2, HR: Math.PI + 0.65 };
  return (t, dt, s) => {
    dt = Math.min(dt, 0.1);
    const speed = s.speed ?? 1, boost = s.boost || 0, brake = s.brake || 0, bank = s.bank || 0, climb = s.climb || 0;
    tuck = damp(tuck, boost, 4, dt); flare = damp(flare, brake, 5, dt); turn = damp(turn, bank, 4, dt); cl = damp(cl, climb, 3, dt);
    leap = damp(leap, sm(0.2, 0.8, -climb) * (1 - brake), 3, dt);       // diving: stretched "flying leap"
    ampK = damp(ampK, clamp(0.85 + 0.15 * speed + 0.3 * boost + 0.2 * Math.max(0, climb), 0.5, 1.4), 4, dt);
    const f = 1.15 + 0.3 * (speed - 1) + 0.75 * boost + 0.3 * Math.max(0, climb) - 0.25 * brake;
    ph += dt * Math.max(0.4, f) * (1 - leap * 0.6) * TAU;
    for (const sd of ['L', 'R']) for (const fh of ['F', 'H']) {
      const id = fh + sd, a = B[id + 'a'], b = B[id + 'b'], p = ph + off[id];
      let ua, lb;
      if (fh === 'F') {
        ua = 0.3 + 0.85 * ampK * Math.sin(p);                                   // reach forward / sweep back
        lb = -1.6 * ampK * sm(-0.2, 0.8, Math.cos(p));                         // fold the knee while recovering
        ua = lerp(ua, 0.95, leap); lb = lerp(lb, -0.15, leap);
        ua = lerp(ua, 1.0 + 0.25 * Math.sin(p), flare); lb = lerp(lb, -1.5, flare);
      } else {
        ua = -0.3 + 0.75 * ampK * Math.sin(p);
        lb = 0.2 - 1.1 * ampK * sm(-0.2, 0.8, Math.cos(p));
        ua = lerp(ua, -0.85, leap); lb = lerp(lb, 0.25, leap);
        ua = lerp(ua, 0.55, flare); lb = lerp(lb, -0.8, flare);
      }
      a.rotation.x = ua; b.rotation.x = lb;
      a.rotation.z = (sd === 'R' ? 1 : -1) * 0.04 * tuck;
    }
    const bob = Math.sin(ph * 2 - 0.8);
    B.root.position.y = B.root.userData.rest.y + 0.1 * bob * ampK * (1 - leap);
    B.root.rotation.x = 0.045 * Math.sin(ph + 0.4) * ampK * (1 - leap) + flare * 0.12 - leap * 0.05;
    B.neck1.rotation.x = 0.1 * Math.sin(ph + 1.4) * ampK - tuck * 0.18 + flare * 0.25 + leap * -0.1;
    B.neck2.rotation.x = 0.06 * Math.sin(ph + 0.9) * ampK - tuck * 0.1;
    B.head.rotation.x = -(B.neck1.rotation.x + B.neck2.rotation.x) * 0.55 - tuck * 0.15;
    B.neck1.rotation.y = turn * 0.14;
    B.head.rotation.y = turn * 0.28;
    B.jaw.rotation.x = -(0.02 + 0.28 * tuck + 0.05 * Math.max(0, Math.sin(t * 0.9) - 0.6) * 5);
    B.tail1.rotation.x = -0.12 + 0.12 * Math.sin(ph - 1.0) * ampK - tuck * 0.15 + flare * 0.2;
    B.tail2.rotation.x = 0.1 * Math.sin(ph - 1.8) * ampK;
    B.tail1.rotation.y = 0.1 * Math.sin(t * 1.9) - turn * 0.3;
    B.tail2.rotation.y = 0.16 * Math.sin(t * 1.9 - 0.9);
    riderAnim(B, t, s, 1.6 * bob * ampK * (1 - leap));
  };
}

// ============================================================ Public API
// One material per mount (shader programs are shared), so mat.userData.flash / tint can be driven per creature.
function mountMaterial(kind) {
  const opts = kind === 'rong' ? { roughness: 0.42, metalness: 0.32 }
    : kind === 'ngua' ? { roughness: 0.44, metalness: 0.45 }
      : kind === 'chimlac' ? { roughness: 0.5, metalness: 0.35 }
        : { roughness: 0.6, metalness: 0.06 };
  return emissiveVertexMaterial(opts, 2.4);
}

const BUILDERS = { rong: buildRong, phuong: buildPhuong, ngua: buildNgua, chimlac: buildChimLac };
const ANIMATORS = { rong: rongAnimator, phuong: B => wingAnimator(B, 'phuong'), ngua: nguaAnimator, chimlac: B => wingAnimator(B, 'chimlac') };

export function buildMount(kind = 'rong', riderId = 'player') {
  if (!MOUNTS.includes(kind)) kind = 'rong';
  const id = RIDER_SCHEMES[riderId] ? riderId : 'player';
  const S = { ...RIDER_SCHEMES[id], id };
  const R = new Rig(), T = tracker(R);
  const info = BUILDERS[kind](R, S, T);
  const mat = mountMaterial(kind);
  const body = R.build(mat);
  body.geometry.computeBoundingBox();
  const group = new THREE.Group();
  group.name = 'mount-' + kind;
  group.add(body);
  const B = R.bones;
  const anim = ANIMATORS[kind](B);
  const model = {
    kind, rider: id, group, meshes: { body }, mats: { body: mat }, bones: B, skeleton: body.skeleton,
    flames: [], noEngine: true, ground: false,
    scheme: { glow: MOUNT_GLOW[kind], fire: MOUNT_FIRE[kind], rider: S.glow, suit: S.suit, accent: S.accent },
    nozzles: info.nozzles, tips: info.tips, guns: info.guns, fireTips: info.fireTips, fireKinds: info.fireKinds || null,
    radius: info.radius,
    minY: body.geometry.boundingBox.min.y,
    triangles: body.geometry.attributes.position.count / 3,
    animate(t, dt, s = {}) { anim(t, dt, s); T.update(); },
  };
  model.animate(0, 0, { speed: 1 });
  return model;
}
