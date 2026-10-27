// Landmarks of eras 1–5: Văn Lang (Phong Châu), Âu Lạc (Cổ Loa), Đại Cồ Việt (Hoa Lư), Lý (Thăng Long), Trần.
// Built from the primitives in lmkit.js; see that file for the builder contract and coordinate frame
// (x = lateral, y = up from ground/water, z = toward the approaching player who flies toward -z through z = 0).
import * as THREE from 'three';
import { TAU, mulberry32, lerp, C, box, cyl, cone, sph, torus, lathe, beam, prism, take, B, Cy, vnRoof } from './lmkit.js';

// ============================================================ private helpers
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (a, b, t) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u); };
const out = (cols = [], gates = [], extra = {}) => ({ parts: [{ geo: take(), mat: 'paint' }], colliders: cols, gates, ...extra });

// Triangle soup with an "outward" hint: the triangle is flipped if its normal points away from the hint.
function tri(arr, a, b, c, h) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (h && nx * h[0] + ny * h[1] + nz * h[2] < 0) arr.push(...a, ...c, ...b); else arr.push(...a, ...b, ...c);
}
const quad = (arr, a, b, c, d, h) => { tri(arr, a, b, c, h); tri(arr, a, c, d, h); };
function soup(arr, col, em = 0) {
  if (!arr.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  C(g, col, em);
}
const ico = (r, x, y, z, col, em = 0, sy = 1) => C(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z), col, em);
// Flat relief cut from a 2D outline (shape x → world x, shape y → world -z), `t` thick, lying on y; rotated by rot about y.
function flat(pts, t, x, y, z, rot, col, em = 0) {
  const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, steps: 1, curveSegments: 4 });
  g.rotateX(-Math.PI / 2).rotateY(rot).translate(x, y, z);
  return C(g, col, em);
}
// Sweep a closed 2D profile [[n, y], …] along a path [[x, z, nx, nz], …] (n = offset along the path normal).
// segCols[j] colours profile edge j (null = skip). Optional end caps.
function sweep(path, prof, segCols, o = {}) {
  const bk = segCols.map(() => []);
  let cn = 0, cy = 0;
  for (const [n, y] of prof) { cn += n; cy += y; }
  cn /= prof.length; cy /= prof.length;
  const P = (i, j) => { const [x, z, nx, nz] = path[i], [n, y] = prof[j]; return [x + nx * n, y, z + nz * n]; };
  for (let i = 0; i < path.length - 1; i++) {
    const nx = (path[i][2] + path[i + 1][2]) / 2, nz = (path[i][3] + path[i + 1][3]) / 2;
    for (let j = 0; j < prof.length - 1; j++) {
      if (!segCols[j]) continue;
      const mn = (prof[j][0] + prof[j + 1][0]) / 2 - cn, my = (prof[j][1] + prof[j + 1][1]) / 2 - cy;
      quad(bk[j], P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), o.up ? [0, 1, 0] : [nx * mn, my, nz * mn]);
    }
  }
  segCols.forEach((c, j) => c && soup(bk[j], c, o.em || 0));
  if (o.caps) {
    const cap = [];
    for (const [i, i2, sgn] of [[0, 1, -1], [path.length - 1, path.length - 2, -1]]) {
      const tx = path[i2][0] - path[i][0], tz = path[i2][1] - path[i][1];
      for (let j = 1; j < prof.length - 2; j++) tri(cap, P(i, 0), P(i, j), P(i, j + 1), [sgn * tx, 0, sgn * tz]);
    }
    soup(cap, o.capCol || segCols.find(Boolean));
  }
}
// Arc of radius R centred at (0, cz): angle th measured from +z toward +x. Normal points outward.
function arcPath(R, cz, th0, th1, n) {
  const p = [];
  for (let i = 0; i <= n; i++) { const th = lerp(th0, th1, i / n); p.push([R * Math.sin(th), cz + R * Math.cos(th), Math.sin(th), Math.cos(th)]); }
  return p;
}

// Gilded / painted trim along the eaves and hips of a vnRoof with the same parameters.
function roofTrim(w, d, h, x, y, z, col, em = 0, o = {}) {
  const curl = o.curl ?? 0.45, sag = o.sag ?? 0.12, rotY = o.rotY ?? 0, th = o.t ?? Math.max(0.3, h * 0.055);
  const a = w / 2, b = d / 2, r = Math.max(0, a - b);
  const lift = (t) => curl * h * Math.pow(Math.abs(2 * t - 1), 3);
  const ev = (side, t) => {
    const f = 1 + 0.08 * curl * Math.pow(Math.abs(2 * t - 1), 2);
    if (side === 0) return [lerp(-a, a, t) * f, lift(t), b * f];
    if (side === 1) return [a * f, lift(t), lerp(b, -b, t) * f];
    if (side === 2) return [lerp(a, -a, t) * f, lift(t), -b * f];
    return [-a * f, lift(t), lerp(-b, b, t) * f];
  };
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const W = (p) => [x + p[0] * cs + p[2] * sn, y + p[1] + th * 0.3, z - p[0] * sn + p[2] * cs];
  for (let side = 0; side < 4; side++) for (let i = 0; i < 8; i++) beam(W(ev(side, i / 8)), W(ev(side, (i + 1) / 8)), th, col, em);
  for (const [cx, cz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    const e = ev(cz > 0 ? 0 : 2, cz > 0 ? (cx < 0 ? 0 : 1) : (cx > 0 ? 0 : 1)), rd = [cx * r, h, 0];
    const m = [lerp(e[0], rd[0], 0.5), lerp(e[1], rd[1], 0.5) - sag * h, lerp(e[2], rd[2], 0.5)];
    beam(W(e), W(m), th, col, em); beam(W(m), W(rd), th, col, em);
  }
}

// Hall with columns all round, wall core, doors and 1–2 roof tiers. o.rot = true turns the long axis to z
// (façade facing +x). Returns the ridge height.
function vhall(w, d, hb, x, y, z, o = {}) {
  const r90 = !!o.rot, rs = o.rot === -1 ? -1 : 1;
  const M = (lx, lz) => (r90 ? [x + rs * lz, z - rs * lx] : [x + lx, z + lz]);
  const bx = (lw, h, ld, lx, ly, lz, col, em) => { const [wx, wz] = M(lx, lz); return r90 ? box(ld, h, lw, wx, ly, wz, col, em) : box(lw, h, ld, wx, ly, wz, col, em); };
  const wall = o.wall ?? '#a8322a', colC = o.col ?? '#6a2a1e', roof = o.roof ?? '#6e3a2a', base = o.base ?? '#a89a84', door = o.door ?? '#4a2418';
  const bh = o.baseH ?? 1.2, tiers = o.tiers ?? 1, cr = o.colR ?? Math.max(0.3, Math.min(w, d) * 0.022);
  if (bh > 0) bx(w + 3, bh, d + 3, 0, y, 0, base);
  const y1 = y + bh;
  bx(w - 1.2, hb, d - 2.2, 0, y1, 0, wall, o.wallEm ?? 0);
  const nb = o.bays ?? Math.max(3, Math.round(w / 4.5) | 1), bw = w / nb;
  for (let i = 0; i <= nb; i++) for (const s of [-1, 1]) { const [wx, wz] = M(-w / 2 + i * bw, s * d / 2); cyl(cr, cr * 1.1, hb, 6, wx, y1, wz, colC, o.colEm ?? 0); }
  const nd = Math.max(1, Math.round(d / 4.5));
  for (let j = 1; j < nd; j++) for (const s of [-1, 1]) { const [wx, wz] = M(s * w / 2, -d / 2 + (d * j) / nd); cyl(cr, cr * 1.1, hb, 6, wx, y1, wz, colC, o.colEm ?? 0); }
  const nDoor = o.doors ?? Math.min(nb, 3 + 2 * (nb > 6));
  for (let i = 0; i < nDoor; i++) bx(bw * 0.66, hb * 0.72, 0.3, (i - (nDoor - 1) / 2) * bw, y1, d / 2 - 1.05, door);
  for (const s of [-1, 1]) bx(w + 0.4, Math.max(0.5, hb * 0.08), 0.6, 0, y1 + hb * 0.92, s * d / 2, colC, o.colEm ?? 0);
  let top = y1 + hb, ridge = top;
  for (let k = 0; k < tiers; k++) {
    const s = 1 - k * 0.3, eave = o.eave ?? 5;
    const rw = (w + eave) * s, rd = (d + eave * 0.9) * s, rh = (o.roofH ?? Math.min(w, d) * 0.36) * (k ? 0.82 : 1);
    vnRoof(rw, rd, rh, x, top, z, roof, { curl: o.curl ?? 0.5, ridge: o.ridgeCol ?? roof, rotY: r90 ? (rs * Math.PI) / 2 : 0, em: o.roofEm ?? 0, ornament: o.ornament });
    if (o.trim) roofTrim(rw, rd, rh, x, top, z, o.trim, o.trimEm ?? 0, { curl: o.curl ?? 0.5, rotY: r90 ? (rs * Math.PI) / 2 : 0 });
    ridge = top + rh;
    if (k < tiers - 1) {
      const ub = rh * 0.85;
      bx(w * s * 0.62, ub, d * s * 0.5, 0, top + rh * 0.4, 0, wall, o.wallEm ?? 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [wx, wz] = M(sx * w * s * 0.31, sz * d * s * 0.25); cyl(cr * 0.8, cr * 0.8, ub, 5, wx, top + rh * 0.4, wz, colC, o.colEm ?? 0); }
      top += rh * 1.25;
    }
  }
  return ridge;
}

// Đông Sơn saddle roof (as engraved on bronze drums): long axis x, ridge sagging in the middle and sweeping up
// beyond the eaves at both ends; gables lean outward. y = eave level. Optional Lạc-bird finials at the ridge ends.
function saddleRoof(x, y, z, o) {
  const le = o.le, lr = o.lr, d = o.d, hm = o.hm, he = o.he, N = o.N ?? 12, lift = o.lift ?? 1.2;
  const top = [], under = [];
  const pt = (t, side) => {
    const s = 2 * t - 1;
    if (side === 0) return [x + s * lr / 2, y + hm + (he - hm) * Math.pow(Math.abs(s), 2.2), z];
    return [x + s * le / 2, y + lift * s * s, z + side * d / 2];
  };
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    for (const side of [1, -1]) {
      const r0 = pt(t0, 0), r1 = pt(t1, 0), e0 = pt(t0, side), e1 = pt(t1, side);
      quad(top, r0, e0, e1, r1, [0, 1, side]);
      quad(under, r0, e0, e1, r1, [0, -1, -side]);
    }
  }
  for (const s of [-1, 1]) {
    const t = s < 0 ? 0 : 1;
    tri(top, pt(t, 0), pt(t, 1), pt(t, -1), [s, 0.3, 0]);
    tri(under, pt(t, 0), pt(t, 1), pt(t, -1), [-s, -0.3, 0]);
  }
  soup(top, o.col); soup(under, o.under ?? o.col);
  const eb = o.edge ?? o.under ?? o.col, th = o.edgeT ?? 0.5;
  for (const side of [1, -1]) for (let i = 0; i < N; i++) beam(pt(i / N, side), pt((i + 1) / N, side), th, eb);
  for (let i = 0; i < N; i++) beam(pt(i / N, 0), pt((i + 1) / N, 0), th * 1.6, eb);
  if (o.ribs) for (let i = 1; i < o.ribs; i++) { const t = i / o.ribs; for (const side of [1, -1]) { const r = pt(t, 0), e = pt(t, side); beam([r[0], r[1] + 0.15, r[2]], [e[0], e[1] + 0.25, e[2] + side * 0.1], th * 0.8, eb); } }
  if (o.finial) for (const s of [-1, 1]) birdHead(pt(s < 0 ? 0 : 1, 0), s, o.finial, o.fcol ?? eb, o.fcol ?? eb);
}

// Curled neck and head of a Lạc bird (long beak, crest) rising from p0, facing ±x (sx).
function birdHead(p0, sx, s, col, beakCol) {
  const pts = [[0, 0], [1.3, 1.2], [1.8, 2.8], [1.4, 4.3], [0.6, 5.0]].map(([a, b]) => [p0[0] + sx * a * s, p0[1] + b * s, p0[2]]);
  for (let i = 0; i < pts.length - 1; i++) beam(pts[i], pts[i + 1], (1 - i * 0.14) * s * 0.85, col);
  const hd = pts[pts.length - 1];
  sph(0.72 * s, hd[0], hd[1], hd[2], col, 0, 0.85, 8, 5);
  beam(hd, [hd[0] + sx * 3.4 * s, hd[1] - 0.6 * s, hd[2]], 0.3 * s, beakCol ?? col);
  beam([hd[0], hd[1] + 0.3 * s, hd[2]], [hd[0] - sx * 1.6 * s, hd[1] + 1.7 * s, hd[2]], 0.22 * s, col);
}
// Curled bird tail rising from p0 toward ±x (sx): a scroll curling back over the boat.
function birdTail(p0, sx, s, col) {
  const pts = [[0, 0], [1.6, 1.4], [2.4, 3.4], [2.1, 5.4], [1.1, 6.6], [-0.1, 6.6], [-0.7, 5.8]].map(([a, b]) => [p0[0] + sx * a * s, p0[1] + b * s, p0[2]]);
  for (let i = 0; i < pts.length - 1; i++) beam(pts[i], pts[i + 1], (1 - i * 0.12) * s * 0.85, col);
  const e = pts[3];
  for (const k of [-1, 0, 1]) beam(e, [e[0] + sx * 2.6 * s, e[1] + (1.2 + k * 1.1) * s, e[2] + k * 0.5 * s], 0.25 * s, col);
}

// Long-axis-x hull (dugout or plank junk). Returns top(x) so decks and crew can be placed.
function hull(L, W, Dp, cx, y0, cz, o = {}) {
  const N = 18, sf = o.sheerF ?? 1, sa = o.sheerA ?? 1, pw = o.pw ?? 2.4;
  const shell = [], deck = [], st = [];
  const topAt = (s) => y0 + (s > 0 ? sf : sa) * s * s;
  for (let i = 0; i <= N; i++) {
    const s = -1 + (2 * i) / N;
    const hw = Math.max(0.06, (W / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), pw)), 0.55));
    const top = topAt(s), keel = top - Dp * (1 - Math.pow(Math.abs(s), 3)) - 0.15;
    const xx = cx + (s * L) / 2;
    st.push([[xx, top, cz + hw], [xx, lerp(top, keel, 0.7), cz + hw * 0.8], [xx, keel, cz], [xx, lerp(top, keel, 0.7), cz - hw * 0.8], [xx, top, cz - hw]]);
  }
  for (let i = 0; i < N; i++) {
    const a = st[i], b = st[i + 1];
    for (let j = 0; j < 4; j++) {
      const my = (a[j][1] + a[j + 1][1]) / 2 - (a[0][1] + a[2][1]) / 2, mz = (a[j][2] + a[j + 1][2]) / 2 - cz;
      quad(shell, a[j], b[j], b[j + 1], a[j + 1], [0, my, mz]);
    }
    const dk = (p) => [p[0], p[1] - (o.deckDrop ?? 0.35), p[2]];
    quad(deck, dk(a[0]), dk(b[0]), dk(b[4]), dk(a[4]), [0, 1, 0]);
  }
  soup(shell, o.col ?? '#5a3a24'); soup(deck, o.deck ?? '#7a5634');
  for (const k of [0, 4]) for (let i = 0; i < N; i++) beam(st[i][k], st[i + 1][k], o.rail ?? 0.35, o.railCol ?? o.col ?? '#5a3a24');
  return (x) => topAt(Math.max(-1, Math.min(1, ((x - cx) * 2) / L)));
}

// Seated / standing figure with a feathered headdress (Đông Sơn warrior / rower).
function warrior(x, y, z, o = {}) {
  const s = o.s ?? 1, skin = '#8a5a3a', cloth = o.cloth ?? '#6a4a2a', plume = o.plume ?? '#e9dfc4';
  const bh = (o.stand ? 1.6 : 1.0) * s;
  box(0.7 * s, bh, 0.55 * s, x, y, z, cloth);
  sph(0.34 * s, x, y + bh + 0.3 * s, z, skin, 0, 1, 6, 4);
  beam([x, y + bh + 0.5 * s, z], [x - 0.9 * s, y + bh + 2.2 * s, z], 0.16 * s, plume, 0, 0.7 * s);
  beam([x, y + bh + 0.5 * s, z], [x - 0.4 * s, y + bh + 2.0 * s, z + 0.25 * s], 0.12 * s, plume, 0, 0.5 * s);
}

// Polar height-field hill/mountain: smooth bell or peak profile + sine noise. Adds the mesh and returns h(x, z).
function hillMesh(o) {
  const R = o.R, H = o.H, pl = o.plateau ?? 0, rough = o.rough ?? 0.1, ax = o.ax ?? 1, az = o.az ?? 1;
  const rnd = mulberry32(o.seed ?? 1);
  const waves = [];
  for (let i = 0; i < 8; i++) { const th = rnd() * TAU; waves.push({ f: ((0.7 + rnd() * 0.9) * (1 + i * 0.85) * TAU) / R, a: 1 / (1 + i * 0.6), c: Math.cos(th), s: Math.sin(th), p: rnd() * TAU }); }
  const asum = waves.reduce((s, w) => s + w.a, 0);
  const noise = (x, z) => waves.reduce((s, w) => s + w.a * Math.sin(w.f * (x * w.c + z * w.s) + w.p), 0) / asum;
  const prof = o.prof ?? ((u) => 0.5 * (1 + Math.cos(Math.PI * u)));
  const h = (x, z) => {
    const t = Math.hypot(x / ax, z / az) / R;
    if (t >= 1) return 0;
    if (t <= pl) return H;
    const u = (t - pl) / (1 - pl);
    return H * prof(u) + rough * H * 2 * noise(x, z) * smooth(pl, pl + 0.12, t) * (1 - u) * Math.min(1, u * 4 + 0.2);
  };
  const NR = o.rings ?? 18, NA = o.seg ?? 40;
  const ts = [0];
  for (let i = 1; i <= NR; i++) ts.push(i <= 2 ? (pl * i) / 2 : pl + (1 - pl) * Math.pow((i - 2) / (NR - 2), 1.1));
  const V = (t, k) => { const a = (k / NA) * TAU, xx = R * t * ax * Math.cos(a), zz = R * t * az * Math.sin(a); return [xx, t >= 1 ? 0 : h(xx, zz), zz]; };
  const gl = o.greens, bk = gl.map(() => []), rock = [], cr = mulberry32((o.seed ?? 1) + 99);
  const put = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nyn = Math.abs(ny) / Math.hypot(nx, ny, nz), cy = (a[1] + b[1] + c[1]) / 3;
    const isRock = o.rockCol && (nyn < (o.rockSlope ?? 0.55) || cy > (o.rockAbove ?? 1e9));
    tri(isRock ? rock : bk[Math.floor(cr() * gl.length)], a, b, c, [0, 1, 0]);
  };
  for (let i = 0; i < NR; i++) for (let k = 0; k < NA; k++) {
    const a = V(ts[i], k), b = V(ts[i], k + 1), c = V(ts[i + 1], k + 1), d = V(ts[i + 1], k);
    if (i === 0) put(a, c, d); else { put(a, b, c); put(a, c, d); }
  }
  const skirt = [];
  for (let k = 0; k < NA; k++) {
    const a = V(1, k), b = V(1, k + 1), c = V(1.04, k + 1), d = V(1.04, k);
    c[1] = d[1] = -4;
    quad(skirt, a, b, c, d, [0, 1, 0]);
  }
  gl.forEach((c, i) => soup(bk[i], c));
  soup(rock, o.rockCol ?? gl[0]); soup(skirt, gl[0]);
  return h;
}

// Limestone karst tower: steep column(s) with stepped ledges, dark rain streaks and green tufts.
// Adds geometry; returns collider list.
function karstGeo(cx, cz, h, r, seed) {
  const rnd = mulberry32(seed);
  const rockA = [], rockB = [], streak = [], green = [], green2 = [];
  const cols = [];
  const lumps = [[0, 0, h, r]];
  const nl = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < nl; i++) {
    const a = rnd() * TAU, d = r * (0.45 + rnd() * 0.35);
    lumps.push([Math.cos(a) * d, Math.sin(a) * d, h * (0.4 + rnd() * 0.35), r * (0.45 + rnd() * 0.25)]);
  }
  for (const [lx, lz, lh, lr] of lumps) {
    const NA = 16;
    const p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
    const colN = Array.from({ length: NA }, (_, k) => { const a = (k / NA) * TAU; return 1 + 0.16 * Math.sin(2 * a + p1) + 0.1 * Math.sin(3 * a + p2) + 0.07 * Math.sin(5 * a + p3) + (rnd() - 0.5) * 0.1; });
    const streaks = new Set();
    for (let k = 0; k < NA; k++) if (rnd() < 0.35) streaks.add(k);
    const stTop = Array.from({ length: NA }, () => 0.5 + rnd() * 0.4);
    // rings: steady climb with occasional stepped ledges
    const rings = [];
    let y = -6, sc = 1.04, ox = 0, oz = 0;
    const dy = (lh + 6) / 11;
    while (y < lh * 0.97) {
      const t = (y + 6) / (lh + 6);
      let dome = t > 0.7 ? Math.sqrt(Math.max(0.02, 1 - Math.pow((t - 0.7) / 0.3, 2))) : 1;
      rings.push({ y, s: sc * dome, ox, oz, t });
      if (t > 0.2 && t < 0.75 && rnd() < 0.3) { sc *= 0.84 + rnd() * 0.06; rings.push({ y: y + lh * 0.012, s: sc * dome, ox, oz, t }); }
      sc *= 0.975 + rnd() * 0.02;
      ox += (rnd() - 0.5) * lr * 0.06; oz += (rnd() - 0.5) * lr * 0.06;
      y += dy * (0.8 + rnd() * 0.4);
    }
    const ring = rings.map((R0) => {
      const pts = [];
      for (let k = 0; k < NA; k++) {
        const a = (k / NA) * TAU, rr = lr * R0.s * colN[k] * (0.95 + rnd() * 0.1);
        pts.push([cx + lx + R0.ox + Math.cos(a) * rr, R0.y + (R0.y > 0 ? (rnd() - 0.5) * lh * 0.02 : 0), cz + lz + R0.oz + Math.sin(a) * rr]);
      }
      return { pts, cx: cx + lx + R0.ox, cz: cz + lz + R0.oz, t: R0.t };
    });
    const NH = ring.length - 1;
    const last = ring[NH];
    const apex = [last.cx + (rnd() - 0.5) * lr * 0.2, lh, last.cz + (rnd() - 0.5) * lr * 0.2];
    const put = (a, b, c, j, k) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = (a[0] + b[0] + c[0]) / 3, mz = (a[2] + b[2] + c[2]) / 3, rg = ring[Math.min(j, NH)];
      const hint = [mx - rg.cx, 0.2, mz - rg.cz];
      if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nyn = ny / Math.hypot(nx, ny, nz), t = rg.t;
      let bkt;
      if (nyn > 0.55 && rnd() < 0.9) bkt = rnd() < 0.5 ? green : green2;
      else if (t > 0.8 && rnd() < 0.55) bkt = rnd() < 0.6 ? green : green2;
      else if (streaks.has(k) && t < stTop[k] && t > 0.05) bkt = streak;
      else bkt = rnd() < 0.72 ? rockA : rockB;
      tri(bkt, a, b, c, hint);
    };
    for (let j = 0; j < NH; j++) for (let k = 0; k < NA; k++) {
      const a = ring[j].pts[k], b = ring[j].pts[(k + 1) % NA], c = ring[j + 1].pts[(k + 1) % NA], d = ring[j + 1].pts[k];
      put(a, b, c, j, k); put(a, c, d, j, k);
    }
    for (let k = 0; k < NA; k++) put(last.pts[k], last.pts[(k + 1) % NA], apex, NH, k);
    // shrubs clinging to the crown
    for (let i = 0; i < 14; i++) {
      const j = Math.floor(NH * (0.45 + rnd() * 0.45)), k = Math.floor(rnd() * NA), p = ring[j].pts[k];
      ico(lr * (0.09 + rnd() * 0.07), p[0], p[1], p[2], rnd() < 0.5 ? '#41682f' : '#55803a', 0, 0.7);
    }
    cols.push(Cy(cx + lx, cz + lz, lr * 0.95, -6, lh * 0.6), Cy(last.cx, last.cz, lr * 0.7, lh * 0.6, lh));
  }
  soup(rockA, '#cdcabe'); soup(rockB, '#b2aea2'); soup(streak, '#5d5c55'); soup(green, '#4c7636'); soup(green2, '#67893f');
  return cols;
}

// ============================================================ ERA 1 — VĂN LANG (Phong Châu)

// Mount Nghĩa Lĩnh: forested hill with the three Hùng temples (Hạ, Trung, Thượng) on the stair up its face.
function nghialinh(o = {}) {
  const R = o.R ?? 250, H = o.h ?? 150, rnd = mulberry32(o.seed ?? 11);
  const hf = hillMesh({ R, H, seed: o.seed ?? 11, plateau: 0.085, rough: 0.09, greens: ['#4a7a38', '#3e6c32', '#58873e', '#6a9444'] });
  const stairX = (u) => 9 * Math.sin(u * 8) * (1 - u);
  const st = [];
  for (let i = 0; i <= 56; i++) { const u = i / 56, zz = lerp(R * 0.98, R * 0.075, u), xx = stairX(u); st.push([xx, hf(xx, zz) + 0.7, zz, u]); }
  for (let i = 0; i < st.length - 1; i++) {
    beam(st[i], st[i + 1], 5, '#b8b09e', 0, 1.8);
    if (i % 4 === 0) for (const s of [-1, 1]) box(0.6, 1.4, 0.6, st[i][0] + s * 3, st[i][1], st[i][2], '#8f8878');
  }
  // trees, kept off the stair and the summit
  const greens = ['#355e2a', '#3f6c30', '#4b7a34', '#2f5226'];
  for (let i = 0, n = 0; n < 420 && i < 4000; i++) {
    const a = rnd() * TAU, t = 0.11 + Math.sqrt(rnd()) * 0.86, x = Math.cos(a) * t * R, z = Math.sin(a) * t * R;
    if (z > 0 && Math.abs(x - stairX(1 - z / R)) < 9) continue;
    const rr = 4.5 + rnd() * 5, y = hf(x, z);
    ico(rr, x, y + rr * 0.45, z, greens[n % 4], 0, 1.15); n++;
    if (rnd() < 0.35) ico(rr * 0.7, x + rr * 0.6, y + rr * 0.9, z - rr * 0.3, greens[(n + 1) % 4], 0, 1.1);
  }
  // Đền Hạ and Đền Trung on the way up, Đền Thượng on the summit
  const shrine = (u, w, d, side) => {
    const zz = lerp(R * 0.98, R * 0.075, u), xx = stairX(u) + side * (w / 2 + 5), y = hf(xx, zz);
    box(w + 6, 6, d + 6, xx, y - 5.4, zz, '#9a9282');
    vhall(w, d, 3.6, xx, y + 0.6, zz, { wall: '#c8b48c', col: '#5a3424', roof: '#6c4634', base: '#a39a88', bays: 3, doors: 3 });
  };
  shrine(0.18, 12, 7, 1); shrine(0.55, 11, 7, -1);
  box(40, 6, 32, 0, H - 5.6, 0, '#9a9282');
  vhall(24, 13, 6, 0, H + 0.4, -4, { wall: '#c9b48e', col: '#5a3424', roof: '#6a4634', base: '#a39a88', bays: 5, tiers: 1, roofH: 6 });
  for (const s of [-1, 1]) { box(2, 8, 2, s * 6, H + 0.4, 12, '#b8ad98'); box(2.8, 1.2, 2.8, s * 6, H + 8.4, 12, '#8a8274'); }   // gate pillars
  box(1.8, 6, 1.8, 15, H + 0.4, 8, '#a8a294');   // stone oath pillar of Thục Phán (cột đá thề)
  return out([Cy(0, 0, R * 0.82, -4, H * 0.28), Cy(0, 0, R * 0.55, H * 0.28, H * 0.62), Cy(0, 0, R * 0.3, H * 0.62, H + 16)], [], { fogScale: 0.7 });
}

// Royal stilt house (nhà sàn) of the Đông Sơn drums: boat-shaped saddle roof with Lạc-bird finials.
function nhasan(o = {}) {
  const big = o.big ?? true;
  const s = big ? 1 : 20 / 70;
  const L = 70 * s, D = 18 * s, fy = big ? 15 : 4;
  const post = '#4e3524', wood = '#6e4c30', wallC = '#a88c5a', thatch = '#b08a4c', thatchU = '#6e5432';
  // posts: big house keeps the middle bays clear to fly under
  const xs = big ? [-35, -29.5, -24, 24, 29.5, 35] : Array.from({ length: 6 }, (_, i) => -L / 2 + (L * i) / 5);
  for (const x of xs) for (const z of [-D / 2 + 1 * s, 0, D / 2 - 1 * s]) cyl(0.65 * s + 0.1, 0.75 * s + 0.1, fy - 0.8 * s, 6, x, 0, z, post);
  if (big) for (const sx of [-1, 1]) for (const z of [-D / 2 + 1, D / 2 - 1]) { beam([sx * 24, 2, z], [sx * 29.5, 12.5, z], 0.5, post); beam([sx * 35, 2, z], [sx * 29.5, 12.5, z], 0.5, post); }
  for (const z of [-D / 2 + 1 * s, 0, D / 2 - 1 * s]) box(L + 1, 0.8 * s, 1 * s, 0, fy - 1.6 * s, z, wood);    // girders
  box(L + 2 * s, 0.8 * s, D, 0, fy - 0.8 * s, 0, '#7e5a38');                                        // floor
  const wh = 3.4 * s;
  box(L - 6 * s, wh, D - 5 * s, 0, fy, 0, wallC);
  for (let i = 0; i <= 10; i++) box(0.4 * s, wh, 0.4 * s, -L / 2 + 3 * s + ((L - 6 * s) * i) / 10, fy, (D - 5 * s) / 2 + 0.1, wood);
  box(L - 2 * s, 0.35 * s, 0.35 * s, 0, fy + 1.1 * s, D / 2 - 0.4 * s, wood);   // veranda rail
  saddleRoof(0, fy + wh, 0, { le: L + 2 * s, lr: L * 1.22, d: D + 5 * s, hm: 10.5 * s, he: 19 * s, col: thatch, under: thatchU, edge: '#7a5a34', edgeT: 0.55 * s + 0.1, lift: 2.2 * s, finial: 2.1 * s + 0.3, fcol: '#5a3e26', ribs: 9 });
  // ladder to the veranda
  const lx = L / 2 - 6 * s, lz0 = D / 2 + fy * 0.35, lz1 = D / 2 - 0.2;
  for (const dx of [-1.1 * s, 1.1 * s]) beam([lx + dx, 0, lz0], [lx + dx, fy, lz1], 0.35 * s + 0.05, wood);
  const nr = Math.round(fy / 1.2);
  for (let i = 1; i < nr; i++) { const t = i / nr; beam([lx - 1.1 * s, t * fy, lerp(lz0, lz1, t)], [lx + 1.1 * s, t * fy, lerp(lz0, lz1, t)], 0.22 * s + 0.05, wood); }
  if (!big) return out();
  return out(
    [B(-37, 37, 15.2, 38, -12, 12), B(-44, 44, 30, 47, -2.5, 2.5), B(-36.5, -23.2, 0, 15.2, -9, 9), B(23.2, 36.5, 0, 15.2, -9, 9), B(lx - 2, lx + 2, 0, 15, 9, lz0 + 1)],
    [{ x0: -20, x1: 20, y0: 2, y1: 13, label: 'DƯỚI NHÀ SÀN', bonus: 1500 }],
  );
}

// Giant Ngọc Lũ-style bronze drum as a ceremonial platform (Ø 60, 22 tall).
function trongdong(o = {}) {
  const bronze = '#55735a', bronze2 = '#4a6650', face = '#61806a', gold = '#d6b24c';
  lathe([[30.5, 0], [29, 1.2], [26.5, 4.5], [25.2, 8], [24.8, 11], [25.8, 13.5], [28, 16.5], [29.4, 19], [29.3, 20.6], [28.6, 21.2]], 48, 0, 0, 0, bronze);
  cyl(31, 31, 0.8, 64, 0, 21.2, 0, face);                     // tympanum
  // body bands and the vertical panels of the waist
  for (const [y, r] of [[13.6, 25.9], [16.6, 28.1], [19.1, 29.45], [1.3, 29]]) torus(r, 0.32, 0, y, 0, gold, 0.15);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; box(0.5, 4.6, 0.5, Math.cos(a) * 25.1, 8.4, Math.sin(a) * 25.1, gold, 0.12); }
  // four pairs of handles at the shoulder
  for (let k = 0; k < 4; k++) for (const da of [-0.06, 0.06]) {
    const a = (k / 4) * TAU + Math.PI / 4 + da, c = Math.cos(a), s = Math.sin(a);
    beam([c * 28.3, 17, s * 28.3], [c * 30.6, 15.6, s * 30.6], 0.6, bronze2); beam([c * 30.6, 15.6, s * 30.6], [c * 27.2, 12.4, s * 27.2], 0.6, bronze2);
  }
  // tympanum: 14-ray star, concentric relief rings
  const yt = 22;
  const star = [];
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU, r = i % 2 ? 2.2 : 6.6; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
  flat(star, 0.45, 0, yt, 0, 0, gold, 0.5);
  cyl(1.6, 1.6, 0.6, 14, 0, yt, 0, gold, 0.5);
  const ring = (r, w = 0.5, col = gold, em = 0.18) => lathe([[r + w / 2, 0], [r + w / 2, 0.3], [r - w / 2, 0.3], [r - w / 2, 0]], 64, 0, yt - 0.02, 0, col, em);
  for (const r of [7.4, 8.4, 10.6, 11.4, 16.6, 17.4, 18.8, 24.6, 25.4, 29.6]) ring(r);
  // band of dots and band of circle-and-tangent motifs
  for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; cyl(0.35, 0.35, 0.3, 6, Math.cos(a) * 9.5, yt, Math.sin(a) * 9.5, gold, 0.2); }
  for (let k = 0; k < 30; k++) { const a = (k / 30) * TAU; lathe([[1.05, 0], [1.05, 0.28], [0.7, 0.28], [0.7, 0]], 10, Math.cos(a) * 27.5, yt - 0.02, Math.sin(a) * 27.5, gold, 0.18); }
  // feathered dancers between houses (middle band)
  const dancer = [[-0.5, 0], [0.5, 0], [0.35, 1.6], [1.5, 3.4], [0.4, 2.7], [0, 3.8], [-0.5, 2.7], [-1.6, 3.4], [-0.35, 1.6]];
  const house = [[-1.6, 0], [1.6, 0], [1.6, 1.2], [3.2, 3.0], [0, 2.0], [-3.2, 3.0], [-1.6, 1.2]];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU, r = 12.3, sh = k % 4 === 0 ? house : dancer;
    flat(sh, 0.3, Math.cos(a) * r, yt, -Math.sin(a) * r, a - Math.PI / 2, gold, 0.25);
  }
  // eighteen flying Lạc birds, long beaks and crests, circling the face
  const bird = [[3.0, 0.15], [1.7, 0.35], [0.5, -0.45], [-1.4, -0.5], [-2.6, -0.35], [-3.3, 0], [-3.4, 0.6], [-2.2, 0.35], [-0.9, 0.5], [-1.4, 2.4], [0.6, 0.6], [1.1, 0.9], [0.9, 1.6], [1.6, 0.95], [2.0, 0.6]];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU, r = 21.2;
    flat(bird.map(([u, v]) => [u * 1.15, v * 1.15 - 0.5]), 0.35, Math.cos(a) * r, yt, -Math.sin(a) * r, a + Math.PI / 2, gold, 0.3);
  }
  // four frogs on the rim, facing counter-clockwise
  if (o.frogs !== false) for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4, c = Math.cos(a), s = Math.sin(a), fx = c * 27.4, fz = -s * 27.4;
    const fwd = [-s, 0, -c];   // tangent (counter-clockwise seen from above)
    const at = (f, side, up) => [fx + fwd[0] * f + c * side, yt + up, fz + fwd[2] * f - s * side];
    sph(1.9, ...at(0, 0, 1.1), bronze2, 0, 0.62, 10, 6);
    sph(1.15, ...at(1.9, 0, 1.5), bronze2, 0, 0.7, 8, 5);
    for (const side of [-1, 1]) {
      sph(0.38, ...at(2.3, side * 0.7, 2.1), gold, 0.3, 1, 6, 4);
      beam(at(-0.8, side * 1.4, 1.0), at(-1.6, side * 2.2, 0.3), 0.6, bronze2);
      beam(at(1.0, side * 1.3, 0.9), at(1.8, side * 1.8, 0.2), 0.5, bronze2);
    }
  }
  return out([Cy(0, 0, 31.5, 0, 25.5)], [{ x0: -28, x1: 28, y0: 26, y1: 200, over: true, label: 'BAY TRÊN MẶT TRỐNG ĐỒNG', bonus: 1000 }]);
}

// Lạc Việt war canoe: dugout with bird-head prow, curled stern, feathered rowers, drum and fighting platform.
function thuyenlac(o = {}) {
  const wood = '#4e3422', paint = '#6a4228';
  const topAt = hull(40, 4.4, 2.2, 0, 1.3, 0, { col: wood, deck: '#7a5634', sheerF: 1.6, sheerA: 1.3, pw: 3, rail: 0.3 });
  birdHead([20, topAt(20) - 0.2, 0], 1, 1.6, paint, '#c9a24a');
  birdTail([-20, topAt(-20) - 0.2, 0], -1, 1.5, paint);
  // fighting platform with a bronze drum and standing warriors
  box(7, 0.8, 3.6, 3, topAt(3), 0, '#7e5a38');
  for (const [x, z] of [[0, -1.5], [0, 1.5], [6, -1.5], [6, 1.5]]) cyl(0.15, 0.15, 3.2, 4, x, topAt(3), z, wood);
  const py = topAt(3) + 0.8;
  cyl(1.0, 1.1, 1.3, 12, 1.2, py, 0, '#57765c'); cyl(1.05, 1.05, 0.12, 12, 1.2, py + 1.3, 0, '#c9a24a', 0.2);
  for (const [x, z] of [[3.8, -0.9], [5.2, 0.8]]) { warrior(x, py, z, { stand: true, s: 1.35, cloth: '#5a3a24' }); beam([x + 0.3, py, z + 0.2], [x + 1.4, py + 4.6, z + 0.2], 0.12, '#3a2a1a'); }
  // rowers with paddles, two files
  for (let i = 0; i < 9; i++) for (const side of [-1, 1]) {
    const x = -15 + i * 2.1 + (i > 4 ? 7.5 : 0), y = topAt(x) - 0.3, z = side * 0.9;
    if (x > 17) continue;
    warrior(x, y, z, { s: 1.2 });
    beam([x + 0.3, y + 1.0, side * 1.3], [x - 0.9, -0.3, side * 3.2], 0.13, '#3a2a1a');
    box(0.2, 0.05, 0.6, x - 0.9, -0.35, side * 3.3, '#3a2a1a');
  }
  return out([B(-21, 21, -1, 5.5, -2.6, 2.6), B(18, 26, 0, topAt(20) + 7, -1.5, 1.5), B(-26, -18, 0, topAt(-20) + 10, -1.5, 1.5)]);
}

// ============================================================ ERA 2 — ÂU LẠC (Cổ Loa)

// Small timber watchtower (4 posts, platform, thatch roof) on the rampart.
function watchtower(x, y, z, s = 1) {
  const wood = '#5a3e28';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam([x + sx * 3 * s, y - 1, z + sz * 3 * s], [x + sx * 2.4 * s, y + 11 * s, z + sz * 2.4 * s], 0.5 * s, wood);
  box(6.6 * s, 0.5 * s, 6.6 * s, x, y + 7.5 * s, z, '#6e5034');
  for (const sz of [-1, 1]) box(6.6 * s, 1.2 * s, 0.25 * s, x, y + 8 * s, z + sz * 3.2 * s, wood);
  saddleRoof(x, y + 11 * s, z, { le: 7 * s, lr: 9.5 * s, d: 7.5 * s, hm: 3.2 * s, he: 4.6 * s, col: '#a9864c', under: '#6e5432', edgeT: 0.25 * s, lift: 0.4 * s, N: 6 });
}

// One ring of Cổ Loa's rammed-earth ramparts crossing the rail, with palisade, watchtowers, moat and a gate tower.
function coloa(o = {}) {
  const R = o.R ?? 420, span = o.span ?? 600, label = o.label ?? 'CỔNG THÀNH CỔ LOA';
  const thMax = Math.min(span / R, 1.5), thG = Math.asin(22 / R);
  const earth = '#8d6c45', earth2 = '#7c5e3c', top = '#7f8a4a', wood = '#5a3e28';
  const prof = [[15, -2], [5, 22], [-5, 22], [-15, -2]];
  const cols = [];
  for (const sgn of [-1, 1]) {
    const n = Math.ceil(((thMax - thG) * R) / 14);
    const path = arcPath(R, -R, sgn * thG, sgn * thMax, n);
    path[0] = [sgn * 22, 0, 0, 1];   // vertical cut at the gate
    if (sgn < 0) path.reverse();
    sweep(path, prof, [earth, top, earth2], { caps: true, capCol: earth2 });
    // palisade along the outer edge of the crest, with sharpened stakes
    sweep(path, [[4.6, 21.5], [4.6, 25], [4.0, 25], [4.0, 21.5]], [wood, wood, wood], {});
    const pp = sgn < 0 ? [...path].reverse() : path;
    for (let i = 0; i < pp.length - 1; i++) {
      const [x0, z0, nx, nz] = pp[i], [x1, z1] = pp[i + 1];
      if (Math.abs(x0) < 320) for (let k = 0; k < 5; k++) { const t = k / 5; cone(0.32, 1.6, 4, lerp(x0, x1, t) + nx * 4.3, 25, lerp(z0, z1, t) + nz * 4.3, '#6a4a30'); }
      if (i > 2 && i % 7 === 3) watchtower(x0, 22, z0);
      if (Math.abs(x0) < 200) {
        const xs = [x0 + nx * 15, x0 - nx * 15, x1 + nx * 15, x1 - nx * 15], zs = [z0 + nz * 15, z0 - nz * 15, z1 + nz * 15, z1 - nz * 15];
        cols.push(B(Math.min(...xs), Math.max(...xs), -2, i > 2 && i % 7 === 3 ? 38 : 25.5, Math.min(...zs), Math.max(...zs)));
      }
    }
    // moat outside the rampart
    const mp = arcPath(R, -R, sgn * 0.0, sgn * thMax, n + 2);
    sweep(mp, [[48, 0.15], [18, 0.15]], ['#26352f'], { up: true });
    sweep(mp, [[49.5, -1], [48, 0.35], [18, 0.35], [16.5, -1]], ['#6d5a3a', null, '#6d5a3a'], {});
  }
  // wooden bridge over the moat
  box(12, 0.8, 34, 0, 1.2, R * 0 + 33, '#6e5034');
  for (const z of [20, 33, 46]) for (const x of [-5, 5]) cyl(0.4, 0.4, 1.4, 5, x, -0.2, z, wood);
  // gate: timber-faced jambs, posts and a gate tower bridging the opening at y 25+
  for (const s of [-1, 1]) {
    box(1.2, 22, 22, s * 22.6, 0, 0, '#6a4a2e');
    for (const z of [-8, 0, 8]) cyl(0.9, 1.0, 26, 6, s * 23.4, 0, z, '#4e3524');
  }
  box(62, 2.4, 18, 0, 25, 0, '#6e5034');
  for (const x of [-26, -13, 0, 13, 26]) box(1.2, 1.6, 18.4, x, 23.6, 0, '#4e3524');
  box(38, 7.5, 12, 0, 27.4, 0, '#8a6a44');
  for (let i = 0; i <= 8; i++) for (const z of [-6.2, 6.2]) box(0.6, 7.5, 0.6, -19 + i * 4.75, 27.4, z, '#4e3524');
  for (const z of [-8.6, 8.6]) box(60, 1.1, 0.4, 0, 28.6, z, '#4e3524');
  saddleRoof(0, 34.9, 0, { le: 42, lr: 56, d: 17, hm: 7.5, he: 11.5, col: '#ad8a4c', under: '#6e5432', edgeT: 0.5, lift: 0.9, finial: 1.3, fcol: '#4e3524' });
  for (const s of [-1, 1]) { cyl(0.18, 0.18, 9, 4, s * 30, 27.4, 7, '#3a2a1a'); box(0.15, 3, 4.4, s * 30, 33.2, 9.2, '#b03a2a'); }
  cols.push(B(-31, 31, 24.6, 47, -9.5, 9.5), B(-58, 58, 34, 52, -2.5, 2.5));
  return out(cols, [{ x0: -19, x1: 19, y0: 0, y1: 22.4, label, bonus: 1800 }]);
}
coloa.dynamic = true;

// Đền Thượng (An Dương Vương temple) with Giếng Ngọc in its round pond, a banyan tree and a three-door gate.
function denthuong() {
  const plaster = '#d2c4a2', wood = '#6a2a1e', roof = '#7a4a34', stone = '#a8a090';
  box(72, 0.5, 74, 0, 0, -4, '#b6aa90');
  for (const [w, d, x, z] of [[72, 1, 0, 33], [72, 1, 0, -41], [1, 74, -36, -4], [1, 74, 36, -4]]) box(w, 2.4, d, x, 0, z, '#c8b896');
  // tam quan: high central gate flanked by two lower ones
  box(10, 7, 4, 0, 0.5, 33, plaster); box(5, 5.5, 4.2, 0, 0.5, 33, '#3a2418');
  vnRoof(13.5, 6.5, 3.6, 0, 7.5, 33, roof, { curl: 0.6 });
  for (const s of [-1, 1]) { box(7, 5.2, 3.6, s * 9.5, 0.5, 33, plaster); box(3.2, 4, 3.8, s * 9.5, 0.5, 33, '#3a2418'); vnRoof(9.5, 5.8, 2.8, s * 9.5, 5.7, 33, roof, { curl: 0.6 }); }
  for (const s of [-1, 1]) { box(1.8, 10, 1.8, s * 15.5, 0.5, 34, plaster); cone(1.4, 2, 4, s * 15.5, 10.5, 34, plaster); }
  // Giếng Ngọc: round well in a round pond
  cyl(10, 10, 0.4, 28, 0, 0.3, 15, '#9a8f7a');
  cyl(9, 9, 0.5, 28, 0, 0.32, 15, '#2f5a5a');
  lathe([[2.6, 0], [2.6, 1.4], [1.8, 1.4], [1.8, 0.6]], 16, 0, 0.5, 15, stone);
  cyl(1.85, 1.85, 0.5, 16, 0, 1.0, 15, '#10262a');
  box(1.4, 0.4, 7, 0, 0.6, 21, stone);
  // bái đường + hậu cung
  vhall(30, 11, 5.6, 0, 0.5, -4, { wall: plaster, col: wood, roof, base: stone, bays: 7, roofH: 5 });
  box(8, 4, 6, 0, 1.7, -12, plaster); vnRoof(10, 7, 2.6, 0, 5.7, -12, roof, { curl: 0.4, ornament: false });
  vhall(22, 10, 5.2, 0, 0.5, -20, { wall: plaster, col: wood, roof, base: stone, bays: 5, roofH: 4.8 });
  // banyan (cây đa) with aerial roots
  const bx = 24, bz = 14;
  cyl(2.2, 3.6, 10, 8, bx, 0, bz, '#5a4a3a');
  for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; beam([bx + Math.cos(a) * 2, 3, bz + Math.sin(a) * 2], [bx + Math.cos(a) * 5.5, 0, bz + Math.sin(a) * 5.5], 1.1, '#5a4a3a'); }
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.3; beam([bx, 9, bz], [bx + Math.cos(a) * 9, 13, bz + Math.sin(a) * 9], 1.2, '#5a4a3a'); beam([bx + Math.cos(a) * 8, 12.5, bz + Math.sin(a) * 8], [bx + Math.cos(a) * 8, 0, bz + Math.sin(a) * 8], 0.4, '#6a5a48'); }
  const rr = mulberry32(5);
  for (let k = 0; k < 9; k++) { const a = rr() * TAU, d = rr() * 9; ico(5.5 + rr() * 3, bx + Math.cos(a) * d, 15 + rr() * 5, bz + Math.sin(a) * d, k % 3 ? '#3c6a32' : '#4d7a3a', 0, 0.75); }
  return out([B(-17, 17, 0, 18, -27, 3), Cy(bx, bz, 10, 0, 24)]);
}

// Crossbow watchtower: tall log tower carrying the giant repeating crossbow (nỏ liên châu) and a banner.
function chonno() {
  const wood = '#5a3e28', dark = '#43301e', rope = '#a8925e';
  const P = (sx, sz, y) => [sx * lerp(6, 4, y / 33), y, sz * lerp(6, 4, y / 33)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(P(sx, sz, -1), P(sx, sz, 34), 1.4, wood);
  const sides = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
  for (const y of [6, 16, 26, 33]) for (const [a, b] of sides) { beam(P(a[0], a[1], y), P(b[0], b[1], y), 0.8, dark); for (const q of [a]) box(1.7, 0.6, 1.7, ...P(q[0], q[1], y - 0.3), rope); }
  for (const [y0, y1] of [[6, 16], [16, 26]]) for (const [a, b] of sides) beam(P(a[0], a[1], y0), P(b[0], b[1], y1), 0.5, dark);
  // ladder up the back
  for (const dx of [-0.8, 0.8]) beam([dx, 0, -8.5], [dx, 34, -4.4], 0.3, dark);
  for (let i = 1; i < 26; i++) { const t = i / 26; beam([-0.8, t * 34, lerp(-8.5, -4.4, t)], [0.8, t * 34, lerp(-8.5, -4.4, t)], 0.18, dark); }
  // platform with a log parapet and a small thatched shelter at the back
  box(14, 1, 14, 0, 33.6, 0, '#6e5034');
  for (const [w, d, x, z] of [[14, 0.6, 0, -6.8], [0.6, 14, 6.8, 0], [0.6, 14, -6.8, 0]]) box(w, 1.8, d, x, 34.6, z, wood);
  for (const sx of [-1, 1]) for (const z of [-6.5, -1.5]) cyl(0.3, 0.3, 6, 5, sx * 6.4, 34.6, z, wood);
  saddleRoof(0, 40.6, -4, { le: 15, lr: 19, d: 7.5, hm: 2.6, he: 4.4, col: '#a9864c', under: '#6e5432', edgeT: 0.3, lift: 0.4, N: 6 });
  // the giant crossbow on its pivot, aimed out over the approach and tilted slightly up
  const cy = 37;
  cyl(0.8, 1.0, cy - 34.6, 6, 0, 34.6, 3, dark);
  const S = (z, dy = 0) => [0, cy + (z + 4) * 0.08 + dy, z];
  beam(S(-4), S(15), 1.4, '#6a4428', 0, 1.2);
  const bow = [-11, -8, -5, -2, 0, 2, 5, 8, 11].map((x) => [x, 13 - (x * x) / 40]);
  for (let i = 0; i < bow.length - 1; i++) beam([bow[i][0], S(bow[i][1])[1] + 0.3, bow[i][1]], [bow[i + 1][0], S(bow[i + 1][1])[1] + 0.3, bow[i + 1][1]], 1.1 - Math.abs(i - 3.5) * 0.1, '#3e2a1a', 0, 0.9);
  for (const sx of [-1, 1]) beam([sx * 11, S(10)[1] + 0.3, 10], [0, S(1)[1] + 0.5, 1], 0.18, '#e2d8bc');
  box(3.2, 1.4, 4.4, 0, S(3)[1] + 0.6, 3, '#5a3a24');                                  // bolt magazine
  for (const dx of [-0.9, 0, 0.9]) {
    beam([dx, S(1)[1] + 1.05, 1], [dx, S(17)[1] + 1.05, 17], 0.35, '#8a6a42');
    C(new THREE.ConeGeometry(0.45, 1.8, 4).rotateX(Math.PI / 2 - 0.08).translate(dx, S(17.9)[1] + 1.05, 17.9), '#c9a24a', 0.3);
  }
  // banner
  cyl(0.25, 0.3, 18, 5, -6.4, 34.6, 6.4, dark);
  box(0.15, 4, 7, -6.4, 47.5, 10, '#b0302a');
  return out([B(-7.5, 7.5, 0, 46, -9.5, 7.5), B(-12, 12, 35, 41, 7.5, 19.5), Cy(-6.4, 6.4, 1, 35, 53), B(-6.6, -6.2, 47, 52, 6.4, 13.6)]);
}

// ============================================================ ERA 3 — ĐẠI CỒ VIỆT (Hoa Lư)

// One limestone karst tower. o.h height, o.r radius, o.seed.
function karst(o = {}) {
  const h = o.h ?? 120, r = o.r ?? 45;
  const cols = karstGeo(0, 0, h, r, o.seed ?? 1);
  return out(cols, [], h > 150 ? { fogScale: 0.75 } : {});
}
karst.dynamic = true;

// Hoa Lư rampart linking two karst peaks, with a gate-house spanning the opening.
function hoaluwall(o = {}) {
  const ph = o.h ?? 140, pr = o.r ?? 48, seed = o.seed ?? 968;
  const cols = [...karstGeo(-130, -6, ph, pr, seed), ...karstGeo(130, 4, ph * 0.9, pr, seed + 17)];
  const brick = '#8f5a40', earth = '#7e6a4c', walk = '#9a8a6a';
  const prof = [[7.5, -2], [5.5, 24], [-5.5, 24], [-7.5, -2]];
  for (const s of [-1, 1]) {
    const path = [[s * 18, 0, 0, 1], [s * 60, 0, 0, 1], [s * 112, s * 2, 0, 1]];
    if (s < 0) path.reverse();
    sweep(path, prof, [brick, walk, earth], { caps: true, capCol: brick });
    for (let x = 20; x < 108; x += 4) for (const z of [-4.9, 4.9]) box(2.2, 2, 1.1, s * x, 24, z, '#844e36');
    cols.push(B(s < 0 ? -112 : 18, s < 0 ? -18 : 112, -2, 26.2, -8, 8));
    // brick facing courses on the front face
    for (const y of [6, 12, 18]) box(92, 0.35, 0.3, s * 64, y, 7.5 - (y / 26) * 2.1 + 0.1, '#7a4632');
  }
  // gate-house: timber deck on the wall heads, pavilion with a curved tiled roof
  box(50, 3, 17, 0, 24, 0, '#6e4a30');
  for (const s of [-1, 1]) { box(2.4, 24, 15, s * 19.2, 0, 0, '#7a4632'); box(0.6, 3.2, 17.4, s * 24.6, 24, 0, '#4a2e1e'); }
  box(52, 1.2, 1, 0, 27, 8.2, '#4a2e1e'); box(52, 1.2, 1, 0, 27, -8.2, '#4a2e1e');
  vhall(32, 11, 6.5, 0, 27, 0, { wall: '#9a3a2a', col: '#5a2a1c', roof: '#6c3a28', base: '#7a6a54', baseH: 0.6, bays: 7, roofH: 6, curl: 0.42 });
  for (const s of [-1, 1]) { cyl(0.2, 0.2, 10, 4, s * 23, 27, 7, '#3a2a1a'); box(0.15, 3.4, 5, s * 23, 33.2, 9.6, '#c43a2a'); }
  cols.push(B(-25.5, 25.5, 24, 48, -10, 10));
  return out(cols, [{ x0: -16, x1: 16, y0: 0, y1: 21.6, label: 'CỔNG THÀNH HOA LƯ', bonus: 2000 }], ph > 150 ? { fogScale: 0.75 } : {});
}

// Temple of King Đinh Tiên Hoàng: gate, pillar gate, stone dragon bed, front hall and main sanctuary.
function dendinh() {
  const wood = '#3e2618', panel = '#5c3a26', roof = '#6a4030', stone = '#a49c8c', paving = '#b3a88f';
  box(88, 0.5, 104, 0, 0, -6, paving);
  for (const [w, d, x, z] of [[88, 1.2, 0, 46], [88, 1.2, 0, -58], [1.2, 104, -44, -6], [1.2, 104, 44, -6]]) box(w, 3, d, x, 0, z, '#bba98a');
  // Ngọ môn: brick gate with an arched door and curved roof
  box(18, 8, 6, 0, 0.5, 46, '#b39a78'); box(5, 5.6, 6.4, 0, 0.5, 46, '#2a1c14');
  vnRoof(22, 9, 4, 0, 8.5, 46, roof, { curl: 0.55 });
  // nghi môn: four square pillars topped by lanterns
  for (const x of [-11, -4, 4, 11]) { box(2, 9, 2, x, 0.5, 30, '#c2b490'); box(2.8, 1.6, 2.8, x, 9.5, 30, '#8a7a5a'); cone(1.2, 1.6, 4, x, 11.1, 30, '#8a7a5a'); }
  // sập long sàng: the stone dragon bed with two coiled dragons
  box(12, 1.6, 6, 0, 0.5, 13, stone); box(10.5, 0.6, 4.8, 0, 2.1, 13, '#b8b0a0');
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([s * lerp(0.6, 4.8, t), 2.9 + 0.5 * Math.sin(t * 9), 13 + 1.6 * Math.cos(t * 7) * (s)]); }
    for (let i = 0; i < 10; i++) beam(pts[i], pts[i + 1], 0.7 - i * 0.04, '#cfc8b8');
    sph(0.8, pts[10][0], pts[10][1] + 0.4, pts[10][2], '#cfc8b8', 0, 1, 6, 4);
  }
  // bái đường (front hall), thiêu hương link, chính cung (sanctuary)
  vhall(38, 12, 6.2, 0, 0.5, -2, { wall: panel, col: wood, roof, base: stone, bays: 7, roofH: 6.2, door: '#2e1a10' });
  box(10, 5, 7, 0, 1.7, -12, panel); vnRoof(12, 8, 3, 0, 6.7, -12, roof, { curl: 0.35, ornament: false });
  vhall(26, 12, 6.6, 0, 0.5, -22, { wall: panel, col: wood, roof, base: stone, bays: 5, roofH: 6.4, door: '#2e1a10' });
  for (const s of [-1, 1]) vhall(12, 8, 4.6, s * 30, 0.5, -10, { wall: '#c8b896', col: wood, roof, base: stone, bays: 3, rot: -s, roofH: 4 });
  const rr = mulberry32(9);
  for (const [x, z] of [[-30, 34], [30, 34], [-34, 12], [34, 12], [-30, -44], [30, -44]]) ico(5 + rr() * 2, x, 6, z, '#3f6a32', 0, 1.2);
  return out([B(-22, 22, 0, 20, -30, 6), B(-10, 10, 0, 15, 42, 50)]);
}

// Octagonal stone sutra pillar (cột kinh Phật, 973) on a lotus base.
function cotkinh() {
  const st = '#d6d1c3', st2 = '#c4beb0', ink = '#aaa596';
  cyl(6.4, 6.8, 1.6, 8, 0, 0, 0, st2);
  lathe([[5.6, 0], [6.2, 1.2], [5.8, 2.6], [4.4, 3.6], [3.3, 4.0]], 16, 0, 1.6, 0, st);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    C(new THREE.SphereGeometry(1.25, 6, 4).scale(1, 1.6, 0.42).rotateZ(0).rotateY(Math.PI / 2 - a).translate(Math.cos(a) * 5.1, 3.5, Math.sin(a) * 5.1), st2);
  }
  const r = 2.9, y0 = 5.4, sh = 20.6;
  cyl(r, r, sh, 8, 0, y0, 0, st);
  const ap = r * Math.cos(Math.PI / 8);
  for (let f = 0; f < 8; f++) {
    const th = Math.PI / 8 + (f * Math.PI) / 4;
    for (let l = 0; l < 4; l++) for (let m = 0; m < 16; m++) if ((l * 7 + m * 3 + f) % 11) C(new THREE.BoxGeometry(0.28, 0.7, 0.06).translate(-0.72 + l * 0.48, y0 + 2 + m * 1.05, ap + 0.02).rotateY(th), ink);
    C(new THREE.BoxGeometry(2.3, 0.3, 0.1).translate(0, y0 + 1.2, ap + 0.03).rotateY(th), ink);
  }
  cyl(3.7, 2.9, 1.4, 8, 0, y0 + sh, 0, st2);
  cyl(3.9, 3.9, 0.7, 8, 0, y0 + sh + 1.4, 0, st);
  lathe([[2.4, 0], [2.2, 0.9], [1.4, 1.6], [0.5, 2.2], [0, 2.4]], 8, 0, y0 + sh + 2.1, 0, st2);
  return out([Cy(0, 0, 6.6, 0, 6), Cy(0, 0, 4, 6, 31)]);
}

// Lê Đại Hành's gilded palace (Điện Bách Bảo Thiên Tuế, 1005) on a high stone terrace.
function cungvang() {
  const stone = '#b4ab98', stone2 = '#a39a86', gold = '#e0b440', red = '#9c2a20', roof = '#6c3424', silver = '#c8ccd0';
  box(88, 3, 52, 0, 0, 0, stone2); box(80, 3, 46, 0, 3, 0, stone); box(72, 2.6, 40, 0, 6, 0, stone2);
  for (let i = 0; i < 9; i++) box(16, 8.6 - i * 0.95, 1.6, 0, 0, 20 + 0.8 + i * 1.6, i % 2 ? stone : stone2);
  for (const s of [-1, 1]) { beam([s * 8.6, 9.2, 20.5], [s * 8.6, 1.2, 35], 1.2, '#cfc6b0'); sph(1.1, s * 8.6, 1.8, 35, gold, 0.25, 1, 8, 5); }
  const rg = vhall(50, 24, 11.5, 0, 8.6, -2, { wall: red, col: gold, colEm: 0.25, roof, base: '#c7bfae', tiers: 2, roofH: 8.6, trim: gold, trimEm: 0.25, ridgeCol: gold, bays: 9, door: '#5a1e14', curl: 0.55 });
  // golden ridge ornaments: phoenix horns at the ends, a flaming pearl in the middle
  sph(1.3, 0, rg + 1.6, -2, gold, 0.4, 1, 8, 6);
  // silver-tiled side pavilions (Điện Phong Lưu was roofed with silver tiles)
  for (const s of [-1, 1]) vhall(13, 12, 7, s * 35, 8.6, 4, { wall: red, col: gold, colEm: 0.2, roof: silver, roofEm: 0.08, ridgeCol: gold, trim: gold, trimEm: 0.2, base: '#c7bfae', bays: 3, roofH: 5, curl: 0.55 });
  return out([B(-44, 44, 0, 9, -26, 26), B(-34, 34, 9, 46, -18, 14)]);
}

// ============================================================ ERA 4 — LÝ (Thăng Long)

// One Pillar Pagoda (Diên Hựu, 1049): square shrine on a single stone column in a square lotus pond.
function motcot() {
  const brick = '#9a5a40', water = '#3a5a4c', wood = '#6a2a1e', roof = '#7a3e2c';
  box(84, 0.6, 84, 0, -0.4, 0, '#7a6a52');
  box(80, 0.3, 80, 0, 0.1, 0, water);
  for (const [w, d, x, z] of [[84, 2, 0, 41], [84, 2, 0, -41], [2, 80, 41, 0], [2, 80, -41, 0]]) {
    box(w, 1.4, d, x, 0, z, brick);
    box(w, 0.4, d + 0.2, x, 2.6, z, brick);
    const n = Math.round(Math.max(w, d) / 4);
    for (let i = 0; i <= n; i++) { const t = i / n - 0.5; box(1.2, 1.4, 1.2, x + (w > d ? t * w : 0), 1.4, z + (w > d ? 0 : t * d), brick); }
  }
  // lotus pads and a few flowers
  const rr = mulberry32(1049);
  for (let i = 0; i < 70; i++) {
    const x = (rr() - 0.5) * 74, z = (rr() - 0.5) * 74;
    if (Math.hypot(x, z) < 7 || (Math.abs(z) < 4 && x > 0)) continue;
    cyl(1.2 + rr() * 1.6, 1.2 + rr() * 1.6, 0.15, 7, x, 0.25, z, rr() < 0.5 ? '#4f8a3a' : '#3f7a34');
    if (rr() < 0.18) cone(0.6, 1.2, 5, x + 0.6, 0.4, z, '#f0a0b8', 0.15);
  }
  // the stone pillar and the lotus-like timber frame supporting the shrine
  cyl(2.9, 3.1, 13.2, 12, 0, 0, 0, '#a8a294');
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; beam([Math.cos(a) * 1.8, 9.6, Math.sin(a) * 1.8], [Math.cos(a) * 7.4, 13.2, Math.sin(a) * 7.4], 0.55, wood); }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; beam([Math.cos(a) * 2.2, 11, Math.sin(a) * 2.2], [Math.cos(a) * 10.4, 13.2, Math.sin(a) * 10.4], 0.6, wood); }
  box(17, 0.9, 17, 0, 13.2, 0, '#5a2a1a');
  for (const [w, d, x, z] of [[17, 0.3, 0, 8.3], [17, 0.3, 0, -8.3], [0.3, 17, 8.3, 0], [0.3, 17, -8.3, 0]]) box(w, 0.3, d, x, 15.4, z, wood);
  for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) { const t = -8.3 + (16.6 * i) / 6; box(0.3, 1.3, 0.3, t, 14.1, s * 8.3, wood); box(0.3, 1.3, 0.3, s * 8.3, 14.1, t, wood); }
  box(12, 6.2, 12, 0, 14.1, 0, '#9a3a2a');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.35, 0.35, 6.2, 6, sx * 6.6, 14.1, sz * 6.6, wood);
  for (const [w, d, x, z] of [[5, 0.3, 0, 6.05], [0.3, 5, 6.05, 0], [0.3, 5, -6.05, 0], [5, 0.3, 0, -6.05]]) box(w, 4.6, d, x, 14.1, z, '#3a1a12');
  vnRoof(20, 20, 7, 0, 20.3, 0, roof, { curl: 0.7, sag: 0.16 });
  roofTrim(20, 20, 7, 0, 20.3, 0, '#5a2a1c', 0, { curl: 0.7, sag: 0.16, t: 0.45 });
  // ridge: two dragons facing the moon
  sph(0.9, 0, 28.2, 0, '#e0c060', 0.35, 1, 8, 6);
  for (const s of [-1, 1]) { beam([s * 1.2, 27.7, 0], [s * 2.6, 28.6, 0], 0.5, '#8a6a3a'); beam([s * 2.6, 28.6, 0], [s * 3.6, 27.6, 0], 0.4, '#8a6a3a'); }
  // the stair from a brick causeway up to the shrine
  box(18, 1, 5, 32, 0, 0, brick);
  for (let i = 0; i < 12; i++) box(1.2, 1.2 + i * 1.08, 4.2, 22 - i * 1.15, 0, 0, i % 2 ? '#a8664a' : brick);
  for (const s of [-1, 1]) beam([22.6, 2.2, s * 2.3], [8.8, 15.4, s * 2.3], 0.35, '#7a3a2a');
  return out([Cy(0, 0, 3.3, 0, 13), B(-10.5, 10.5, 9.5, 29, -10.5, 10.5), B(8, 23, 0, 15, -2.6, 2.6)]);
}

// Báo Thiên tower (1057): 12 brick storeys with small tiled roofs and a bronze-gold finial.
function baothien() {
  const brick = '#a65a3c', brick2 = '#97503a', roof = '#6c3a2a', stone = '#a49c8a';
  box(26, 2.6, 26, 0, 0, 0, stone); box(22, 1.2, 22, 0, 2.6, 0, '#b4ac9a');
  let y = 3.8;
  const n = 12;
  const cols = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), w = lerp(18, 7.2, t), h = lerp(8.4, 4.8, t);
    box(w, h, w, 0, y, 0, i % 2 ? brick2 : brick);
    for (let f = 0; f < 4; f++) {
      const a = (f * Math.PI) / 2;
      C(new THREE.BoxGeometry(w * 0.26, h * 0.5, 0.3).translate(0, y + h * 0.18 + h * 0.25, w / 2 + 0.05).rotateY(a), '#2e1c14');
      C(new THREE.CylinderGeometry(w * 0.13, w * 0.13, 0.3, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(0, y + h * 0.68, w / 2 + 0.05).rotateY(a), '#2e1c14');
    }
    box(w + 1.2, 0.5, w + 1.2, 0, y + h, 0, '#b8a690');
    vnRoof(w + 3.2, w + 3.2, h * 0.32, 0, y + h + 0.4, 0, roof, { curl: 0.55, ornament: false });
    cols.push(B(-w / 2 - 1.6, w / 2 + 1.6, y, y + h + h * 0.4, -w / 2 - 1.6, w / 2 + 1.6));
    y += h + h * 0.22;
  }
  const gold = '#c9a24a';
  lathe([[2.2, 0], [2.6, 1.2], [1.6, 2.6], [1.9, 3.6], [1.0, 5], [1.3, 6], [0.4, 8.4], [0, 10]], 10, 0, y, 0, gold, 0.3);
  cols.push(Cy(0, 0, 3, y, y + 10.5), B(-13, 13, 0, 4, -13, 13));
  return out(cols, [], { fogScale: 0.8 });
}

// Lý imperial hall (Điện Càn Nguyên / Thiên An) on a raised platform with dragon balustrades and flanking halls.
function canguyen() {
  const stone = '#b3a994', stone2 = '#a29884', red = '#a33a28', ochre = '#c8963c', roof = '#7a3a2a', wood = '#6a2418';
  box(140, 0.6, 96, 0, 0, 0, '#b8ae98');
  box(100, 4, 50, 0, 0.6, -6, stone2); box(92, 3, 44, 0, 4.6, -6, stone);
  // central stair with Lý dragons undulating down the balustrades
  for (let i = 0; i < 10; i++) box(18, 7.6 - i * 0.74, 1.4, 0, 0.6, 19 + i * 1.4, i % 2 ? stone : stone2);
  for (const s of [-1, 1]) {
    box(1.6, 3.2, 15, s * 9.8, 0.6, 25.5, stone2);
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([s * 9.8 + 0.6 * Math.sin(t * 12), lerp(8.6, 3, t) + 0.7 * Math.sin(t * 15), lerp(18.6, 32, t)]); }
    for (let i = 0; i < 14; i++) beam(pts[i], pts[i + 1], lerp(0.5, 1.1, i / 14), '#cfc6b0');
    const hd = pts[14];
    box(1.3, 1.6, 2.2, hd[0], hd[1] - 0.4, hd[2] + 0.6, '#cfc6b0');
    beam([hd[0], hd[1] + 1.2, hd[2] + 0.2], [hd[0], hd[1] + 2.6, hd[2] - 1.3], 0.35, '#cfc6b0');
  }
  vhall(64, 26, 13, 0, 7.6, -6, { wall: red, col: wood, roof, base: '#c2b8a2', tiers: 2, roofH: 9, bays: 11, door: '#4a1810', curl: 0.55, ridgeCol: '#5a2a1e' });
  // dragon ridge ornaments and a row of bodhi-leaf tiles
  const ry = 7.6 + 1.2 + 13 + 9 * 1.25 + 9 * 0.82;
  for (let i = -6; i <= 6; i++) cone(0.8, 1.6, 4, i * 2.4, ry + 0.3, -6, '#8a4a30');
  for (const s of [-1, 1]) {
    const x0 = s * 16;
    beam([x0, ry + 0.4, -6], [x0 + s * 1.6, ry + 3.4, -6], 0.8, '#5a2a1e'); beam([x0 + s * 1.6, ry + 3.4, -6], [x0 - s * 1.0, ry + 4.8, -6], 0.6, '#5a2a1e');
    beam([x0 - s * 1.0, ry + 4.8, -6], [x0 - s * 3.4, ry + 4.2, -6], 0.4, '#5a2a1e');
  }
  sph(1.2, 0, ry + 1.6, -6, '#e0c060', 0.3, 1, 8, 6);
  // flanking halls on lower platforms
  for (const s of [-1, 1]) {
    box(28, 2.4, 24, s * 58, 0.6, 2, stone2);
    vhall(24, 16, 8, s * 58, 3, 2, { wall: ochre, col: wood, roof, base: '#c2b8a2', bays: 5, roofH: 6, curl: 0.5, rot: -s });
  }
  return out([B(-50, 50, 0, 8, -31, 19), B(-36, 36, 8, 47, -24, 12), B(-72, -44, 0, 20, -12, 16), B(44, 72, 0, 20, -12, 16)]);
}

// Temple of Literature (Văn Miếu, 1070): walled courtyards, Thiên Quang well-pond, Đại Thành gate and hall.
function vanmieu() {
  const wallC = '#c4ad84', wood = '#5a2418', roof = '#6c3a2a', stone = '#a49a86', paving = '#b8ae96';
  box(64, 0.4, 116, 0, 0, -4, '#7a8a52');
  for (const [w, d, x, z] of [[64, 1.4, 0, 54], [64, 1.4, 0, -62], [1.4, 116, -32, -4], [1.4, 116, 32, -4]]) { box(w, 3.4, d, x, 0, z, wallC); box(w + 0.6, 0.6, d + 0.6, x, 3.4, z, roof); }
  box(8, 5, 2.4, 0, 0, 54, wallC); box(4, 4, 2.6, 0, 0, 54, '#2a1810'); vnRoof(10, 4, 2, 0, 5, 54, roof, { curl: 0.5 });
  // Thiên Quang Tỉnh: the square well-pond
  box(26, 0.7, 26, 0, 0, 30, stone); box(22, 0.5, 22, 0, 0.3, 30, '#2f5a5a');
  for (const [w, d, x, z] of [[26, 1.2, 0, 42.4], [26, 1.2, 0, 17.6], [1.2, 26, 12.4, 30], [1.2, 26, -12.4, 30]]) box(w, 1.4, d, x, 0, z, '#c8bea8');
  const rr = mulberry32(1070);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) ico(3.6 + rr() * 1.5, s * (22 + rr() * 4), 6 + rr() * 2, 46 - i * 9, i % 2 ? '#3f6a32' : '#4d7a3a', 0, 1.2);
  // dividing wall with Đại Thành gate (three doors under one roof)
  for (const s of [-1, 1]) { box(18, 3.4, 1.2, s * 23, 0, 8, wallC); box(18.6, 0.6, 1.8, s * 23, 3.4, 8, roof); }
  box(28, 7, 6, 0, 0.4, 8, '#b84a32');
  for (const x of [-8, 0, 8]) box(x ? 4 : 5, x ? 5 : 5.8, 6.2, x, 0.4, 8, '#2a1810');
  vnRoof(32, 9, 4.6, 0, 7.4, 8, roof, { curl: 0.5 });
  // Đại Thành courtyard with the side halls, Đại bái đường and Thượng điện
  box(60, 0.3, 56, 0, 0.4, -32, paving);
  for (const s of [-1, 1]) vhall(30, 7, 4.2, s * 24, 0.4, -20, { wall: '#b84a32', col: wood, roof, base: stone, bays: 7, roofH: 3.4, rot: -s });
  vhall(40, 12, 6.4, 0, 0.6, -30, { wall: '#b84a32', col: wood, roof, base: stone, bays: 9, roofH: 6, curl: 0.5 });
  vhall(36, 12, 6.4, 0, 0.6, -48, { wall: '#b84a32', col: wood, roof, base: stone, bays: 9, roofH: 6, curl: 0.5 });
  return out([B(-22, 22, 0, 20, -56, -22), B(-16, 16, 0, 13, 4, 12)]);
}

// Đoan Môn-style citadel gate across the rail: five arched doorways, a pavilion on top, walls to ±o.len.
function doanmon(o = {}) {
  const cols = [];
  const len = o.len ?? 500, brick = '#86624a', brick2 = '#7a5640', stone = '#a49a88';
  const arches = [[0, 15, 18, 5], [34, 10, 13, 4], [-34, 10, 13, 4], [59, 7, 10, 3], [-59, 7, 10, 3]].sort((a, b) => a[0] - b[0]);
  const pts = [[-75, 0]];
  for (const [cx, hw, sp, rise] of arches) {
    pts.push([cx - hw, 0], [cx - hw, sp]);
    for (let k = 1; k < 10; k++) { const a = Math.PI - (k / 10) * Math.PI; pts.push([cx + hw * Math.cos(a), sp + rise * Math.sin(a)]); }
    pts.push([cx + hw, sp], [cx + hw, 0]);
  }
  pts.push([75, 0], [75, 30], [-75, 30]);
  prism(pts, 26, 0, 0, 0, brick);
  // stone plinth on the piers, door frames, string course
  for (const [x0, x1] of [[-75, -66], [-52, -44], [-24, -15], [15, 24], [44, 52], [66, 75]]) box(x1 - x0 + 0.8, 3, 26.8, (x0 + x1) / 2, 0, 0, stone);
  box(151.6, 1, 27, 0, 26, 0, brick2);
  for (let x = -73; x <= 73; x += 5) for (const z of [-12.6, 12.6]) box(2.6, 2.4, 0.9, x, 30, z, brick2);
  box(150, 0.4, 25, 0, 30, 0, '#9a8a72');
  // pavilion on top
  vhall(56, 15, 7.2, 0, 30.4, 0, { wall: '#a33a28', col: '#6a2418', roof: '#7a3e2c', base: '#9a8a72', tiers: 2, roofH: 6.2, bays: 11, door: '#4a1810', curl: 0.55, baseH: 0.8 });
  // citadel walls running out on both sides
  for (const s of [-1, 1]) {
    const x0 = s * 75, x1 = s * len, cx = (x0 + x1) / 2, L = Math.abs(x1 - x0);
    box(L, 16, 9, cx, 0, 0, brick); box(L, 1.4, 11, cx, 0, 0, stone);
    for (let x = 78; x < len; x += 5) for (const z of [-4.2, 4.2]) box(2.4, 2, 0.8, s * x, 16, z, brick2);
    cols.push(B(Math.min(x0, x1), Math.max(x0, x1), 0, 18, -5.5, 5.5));
  }
  cols.push(
    B(-75, -44, 0, 33, -13.5, 13.5), B(44, 75, 0, 33, -13.5, 13.5), B(-24, -15, 0, 33, -13.5, 13.5), B(15, 24, 0, 33, -13.5, 13.5),
    B(-15, 15, 21, 33, -13.5, 13.5), B(-44, -24, 15, 33, -13.5, 13.5), B(24, 44, 15, 33, -13.5, 13.5), B(-31, 31, 33, 60, -12, 12),
  );
  return out(cols, [
    { x0: -12.5, x1: 12.5, y0: 0, y1: 18, label: 'ĐOAN MÔN', bonus: 2000 },
    { x0: 26.5, x1: 41.5, y0: 0, y1: 12.5, label: 'ĐOAN MÔN · CỬA BÊN', bonus: 2500 },
    { x0: -41.5, x1: -26.5, y0: 0, y1: 12.5, label: 'ĐOAN MÔN · CỬA BÊN', bonus: 2500 },
  ]);
}

// ============================================================ ERA 5 — TRẦN

// Phổ Minh tower (1305): 14 brick storeys on a stone lotus base.
function phominh() {
  const brick = '#9a4a32', brick2 = '#8a412c', stone = '#a8a294', stone2 = '#bab4a6';
  box(19.5, 2.2, 19.5, 0, 0, 0, stone); box(17, 2.6, 17, 0, 2.2, 0, stone2);
  for (const [w, y] of [[19.5, 1.6], [17, 4.2]]) for (let f = 0; f < 4; f++) for (let i = 0; i < 7; i++) {
    const t = (i - 3) * (w / 7.6);
    C(new THREE.SphereGeometry(0.85, 6, 4).scale(1, 1.3, 0.45).translate(t, y, w / 2 + 0.1).rotateY((f * Math.PI) / 2), '#c8c2b2');
  }
  let y = 4.8;
  const n = 14, cols = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), w = lerp(13, 5.2, t), h = i === 0 ? 7 : lerp(4.0, 2.6, t);
    box(w, h, w, 0, y, 0, i % 2 ? brick2 : brick);
    if (i === 0 || i % 3 === 1) for (let f = 0; f < 4; f++) C(new THREE.BoxGeometry(w * 0.3, h * 0.55, 0.3).translate(0, y + h * 0.15 + h * 0.275, w / 2 + 0.05).rotateY((f * Math.PI) / 2), '#2a1a12');
    box(w + 0.9, 0.45, w + 0.9, 0, y + h, 0, brick2); box(w + 1.6, 0.45, w + 1.6, 0, y + h + 0.45, 0, '#a85a3c');
    y += h + 0.9;
  }
  lathe([[1.8, 0], [2.2, 0.8], [1.4, 1.8], [1.6, 2.6], [0.6, 4], [0, 5.2]], 10, 0, y, 0, '#8a6a4a');
  cols.push(B(-10, 10, 0, 12, -10, 10), B(-7.5, 7.5, 12, 40, -7.5, 7.5), B(-5.2, 5.2, 40, y + 5.5, -5.2, 5.2));
  return out(cols);
}

// Thiên Trường palace complex (Tức Mặc): moat, bridge, gate, halls around a courtyard.
function thientruong() {
  const wall = '#a8402c', wood = '#5a2418', roof = '#6c3a28', stone = '#a49c88', water = '#2c4a48';
  box(130, 0.4, 124, 0, -0.2, -4, '#7a8450');
  // moat ring with stone banks
  for (const [w, d, x, z] of [[124, 10, 0, 49], [124, 10, 0, -57], [10, 96, -57, -4], [10, 96, 57, -4]]) { box(w, 0.3, d, x, 0, z, water); }
  for (const [w, d, x, z] of [[104, 2, 0, 43], [104, 2, 0, -51], [2, 96, -51, -4], [2, 96, 51, -4]]) box(w, 3, d, x, 0, z, '#bca888');
  // bridge and gate building
  box(10, 1.2, 14, 0, 0.8, 50, stone);
  for (const s of [-1, 1]) box(0.6, 1, 14, s * 4.8, 2, 50, '#8a8272');
  box(22, 7.5, 7, 0, 0, 43, wall); box(6, 6, 7.4, 0, 0, 43, '#2a1810');
  vnRoof(26, 10, 5, 0, 7.5, 43, roof, { curl: 0.55 });
  box(96, 0.3, 90, 0, 0, -4, '#b3a88f');
  // Trùng Quang palace (main hall) and the side halls
  vhall(44, 16, 8, 0, 0.3, -32, { wall, col: wood, roof, base: stone, tiers: 2, roofH: 6.6, bays: 9, curl: 0.55 });
  for (const s of [-1, 1]) vhall(30, 10, 6, s * 34, 0.3, -2, { wall, col: wood, roof, base: stone, bays: 7, roofH: 4.6, rot: -s });
  vhall(24, 10, 6, 0, 0.3, 14, { wall: '#b8743c', col: wood, roof, base: stone, bays: 5, roofH: 4.6 });
  const rr = mulberry32(1239);
  for (const [x, z] of [[-18, 30], [18, 30], [-42, 32], [42, 32], [-40, -46], [40, -46]]) ico(4.4 + rr() * 1.6, x, 5.5, z, '#3f6a32', 0, 1.2);
  return out([B(-26, 26, 0, 30, -44, -20), B(-12, 12, 0, 16, 39, 47)]);
}

// Bạch Đằng stake field (1288): ironwood stakes leaning toward the sea, with a clear slalom corridor |x| < 18.
function baicoc(o = {}) {
  const rnd = mulberry32(o.seed ?? 1288), W = o.w ?? 240, lean = o.lean ?? 1;
  const cols = [], wood = '#3e2b1e', tip = '#6e4e34', wet = '#22180f';
  for (let row = 0; row < 6; row++) {
    const z0 = -55 + row * 22 + (rnd() - 0.5) * 6;
    for (let x = -W; x <= W; x += 6 + rnd() * 6) {
      const xx = x + (rnd() - 0.5) * 3, zz = z0 + (rnd() - 0.5) * 8;
      if (Math.abs(xx) < 20 || rnd() < 0.15) continue;
      const hv = 4 + rnd() * 5, ang = 0.32 + rnd() * 0.3, rb = 0.55 + rnd() * 0.3, len = (hv + 3) / Math.cos(ang);
      const sx = (rnd() - 0.5) * 0.12;
      const g = (rt, rbb, l, y0) => new THREE.CylinderGeometry(rt, rbb, l, 5).translate(0, y0 + l / 2, 0).rotateZ(sx).rotateX(ang * lean).translate(xx, -3, zz);
      C(g(rb * 0.85, rb, 3.6, 0), wet);
      C(g(rb * 0.35, rb * 0.85, len - 5.4, 3.6), wood);
      C(g(0.04, rb * 0.35, 1.8, len - 1.8), tip);
      if (Math.abs(xx) < 60) {
        const dz = Math.sin(ang) * lean;
        cols.push(Cy(xx, zz + dz * 3.5, rb + 0.6, -1, hv * 0.5), Cy(xx, zz + dz * (len * 0.75), rb + 0.4, hv * 0.5, hv + 0.3));
      }
    }
  }
  return out(cols, [{ x0: -16, x1: 16, y0: 0, y1: 14, label: 'LUỒN QUA BÃI CỌC', bonus: 1500 }]);
}
baicoc.dynamic = true;

// Yên Tử: forested sacred mountain with clouds at its waist, Chùa Đồng on the summit and the Huệ Quang stupa garden.
function yentu(o = {}) {
  const R = o.R ?? 330, H = o.h ?? 260, ax = 1.25, az = 0.9, pl = 0.04, stY = H * 0.36, pe = 1.3;
  const hf = hillMesh({ R, H, ax, az, seed: o.seed ?? 1299, plateau: pl, rough: 0.11, rings: 22, seg: 44, prof: (u) => Math.pow(1 - u, pe) * (1 - 0.12 * Math.sin(u * Math.PI)), greens: ['#2f5a2c', '#386630', '#2a4e28', '#45723a'], rockCol: '#8a8a7e', rockSlope: 0.5, rockAbove: H * 0.88 });
  const rnd = mulberry32((o.seed ?? 1299) + 5);
  // pines and broadleaf trees
  for (let i = 0, n = 0; n < 260 && i < 3000; i++) {
    const a = rnd() * TAU, t = 0.07 + Math.sqrt(rnd()) * 0.9, x = Math.cos(a) * t * R * ax, z = Math.sin(a) * t * R * az, y = hf(x, z);
    if (y > H * 0.86) continue;
    if (Math.abs(x) < 34 && z > 0 && Math.abs(y - stY) < 16) continue;
    if (rnd() < 0.55) { const hh = 9 + rnd() * 8; cone(hh * 0.32, hh, 6, x, y - 1, z, n % 2 ? '#24482a' : '#2e5532'); cone(hh * 0.22, hh * 0.6, 6, x, y + hh * 0.55, z, '#24482a'); }
    else ico(5 + rnd() * 5, x, y + 3, z, n % 3 ? '#3a6a32' : '#4a7a3a', 0, 1.1);
    n++;
  }
  // Huệ Quang stupa garden on a terrace part way up the +z face
  let sz = R * az * 0.95;
  while (sz > 10 && hf(0, sz) < stY) sz -= 2;
  box(56, 10, 30, 0, stY - 9.6, sz + 4, '#8a8274');
  lathe([[3.6, 0], [3.6, 3], [3, 3.4], [3, 6], [3.8, 7], [3.2, 8.4], [2, 10.4], [0.6, 12.6], [0, 14]], 8, 0, stY + 0.4, sz + 2, '#a8a396');
  const rr = mulberry32(1308);
  for (let i = 0; i < 12; i++) {
    const x = (i - 5.5) * 4.4 + (rr() - 0.5), z = sz + 4 + (i % 2 ? 6 : -4) + (rr() - 0.5) * 2;
    if (Math.abs(x) < 5) continue;
    const ns = 3 + Math.floor(rr() * 3), w0 = 2.4 + rr() * 0.8;
    let yy = stY + 0.4;
    for (let k = 0; k < ns; k++) { const w = w0 * (1 - k * 0.16), h = 2 - k * 0.2; box(w, h, w, x, yy, z, rr() < 0.5 ? '#8f8678' : '#8a6a54'); box(w + 0.5, 0.3, w + 0.5, x, yy + h, z, '#7a7266'); yy += h + 0.3; }
    cone(0.6, 1.6, 6, x, yy, z, '#7a7266');
  }
  // Chùa Đồng on the summit
  box(30, 6, 24, 0, H - 5.6, 0, '#8a8274');
  vhall(13, 9, 4.6, 0, H + 0.4, 0, { wall: '#8a6232', col: '#6e4a24', roof: '#9a7038', roofEm: 0.12, ridgeCol: '#b88a40', base: '#a49c8a', bays: 3, roofH: 4, curl: 0.6, door: '#4a3018' });
  // clouds hugging the waist
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * TAU + rnd() * 0.1, cy = H * (0.5 + rnd() * 0.12);
    const u = 1 - Math.pow(cy / H, 1 / pe), t = pl + (1 - pl) * u + 0.02;
    const x = Math.cos(a) * t * R * ax, z = Math.sin(a) * t * R * az;
    if (z > 0 && Math.abs(x) < 60) continue;
    sph(16 + rnd() * 12, x, cy, z, '#f4f4f8', 0.1, 0.42, 9, 6);
  }
  return out([Cy(0, 0, R * 0.8, -4, H * 0.22), Cy(0, 0, R * 0.5, H * 0.22, H * 0.55), Cy(0, 0, R * 0.24, H * 0.55, H + 14)], [], { fogScale: 0.6 });
}

// Trần war junk: two-deck oared warship with a raised stern castle, a battened sail and red banners.
function thuyentran() {
  const wood = '#5a3a24', dark = '#3e2818', red = '#b8302a', mat = '#c9a86a';
  const topAt = hull(40, 9, 3.2, 0, 2.6, 0, { col: wood, deck: '#86603a', sheerF: 1.8, sheerA: 3.2, pw: 2.6, rail: 0.45, railCol: '#7a2a1e' });
  box(30, 1.6, 7.6, -1, 1.2, 0, '#6a4428');                // oar deck strake
  for (let i = 0; i < 12; i++) for (const s of [-1, 1]) { const x = -14 + i * 2.4; beam([x, 2.2, s * 3.9], [x - 1.2, -0.2, s * 10], 0.22, dark); }
  // upper deck house with arched mat roof
  box(18, 2.2, 6, 0, topAt(0) - 0.3, 0, '#7a5634');
  const arch = new THREE.CylinderGeometry(3.4, 3.4, 18, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.75, 1).translate(0, topAt(0) + 1.9, 0);
  C(arch, mat); C(arch.clone().scale(1, 1, -1), '#8a6a40');
  for (let i = 0; i <= 6; i++) torus(3.45, 0.12, -9 + i * 3, topAt(0) + 1.9, 0, dark, 0, 0, Math.PI);
  // stern castle
  const sy = topAt(-16);
  box(9, 4.2, 8, -16.5, sy - 2.2, 0, '#7a4a2c');
  for (const z of [-3.9, 3.9]) box(9, 1.1, 0.3, -16.5, sy + 2, z, '#7a2a1e');
  vnRoof(8, 7, 2.4, -17.5, sy + 4.3, 0, '#6a3a28', { curl: 0.5, ornament: false });
  for (const [x, z] of [[-14, -3], [-14, 3], [-21, -3], [-21, 3]]) cyl(0.2, 0.2, 2.6, 4, x, sy + 2, z, dark);
  beam([-19.5, sy - 3, 0], [-23.5, -1.5, 0], 0.7, dark); box(0.4, 3.6, 2.4, -23.3, -2.2, 0, dark);   // rudder
  // mast and battened lug sail
  cyl(0.35, 0.45, 18, 6, 6, topAt(6), 0, dark);
  const sb = topAt(6) + 5.5;
  box(0.2, 10, 9, 6.4, sb, 1.2, mat);
  for (let k = 0; k <= 5; k++) box(0.3, 0.25, 9.4, 6.5, sb + k * 2, 1.2, '#5a4026');
  // eyes on the bow and red banners
  for (const s of [-1, 1]) { cyl(0.55, 0.55, 0.15, 10, 17.5, topAt(17.5) - 1.2, s * 1.8, '#f0ead8'); }
  for (const s of [-1, 1]) C(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 8).rotateX(Math.PI / 2).translate(17.6, topAt(17.5) - 1.0, s * 2.0), '#1a1410');
  for (const [x, z, h] of [[-20, 0, 9], [13, 2.5, 7], [13, -2.5, 7], [-8, 3, 6], [-8, -3, 6]]) {
    const yb = topAt(x);
    cyl(0.12, 0.12, h, 4, x, yb, z, dark);
    box(2.6, 1.6, 0.1, x - 1.3, yb + h - 1.7, z, red, 0.12);
  }
  return out([B(-24, 22, -1, 8, -5, 5), B(-21, -12, 8, 16, -4, 4), B(5, 7.5, 8, topAt(6) + 18, -4, 6)]);
}

export const BUILDERS_A = {
  // Văn Lang
  nghialinh, nhasan, trongdong, thuyenlac,
  // Âu Lạc
  coloa, denthuong, chonno,
  // Hoa Lư
  karst, hoaluwall, dendinh, cotkinh, cungvang,
  // Lý
  motcot, baothien, canguyen, vanmieu, doanmon,
  // Trần
  phominh, thientruong, baicoc, yentu, thuyentran,
};
