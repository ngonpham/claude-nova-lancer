// Landmarks of eras 6–10: Hồ (Tây Đô), Lê sơ (Thăng Long, Lam Kinh), the trade ports (Phố Hiến, Hội An),
// Tây Sơn (Bình Định, the 1789 spring march) and Nguyễn (Huế). Built from primitives with lmkit.js;
// landmark-local space: x lateral (rail u), y up (0 = ground / water), z toward the approaching player.
import * as THREE from 'three';
import { C, box, cyl, cone, sph, torus, lathe, beam, prism, take, B, Cy, vnRoof, mulberry32, lerp } from './lmkit.js';

// ================================================================ private helpers
const PI = Math.PI, HP = PI / 2;
const shade = (hex, f) => { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f); return '#' + c.getHexString(); };
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const pl = (t, k) => {   // piecewise-linear lookup in [[t, v], ...]
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  return k[k.length - 1][1];
};
const rot = (lx, lz, ry) => [lx * Math.cos(ry) + lz * Math.sin(ry), -lx * Math.sin(ry) + lz * Math.cos(ry)];
function put(g, col, em, ry, x, y, z) { if (ry) g.rotateY(ry); g.translate(x, y, z); return C(g, col, em); }
function rbox(w, h, d, x, y, z, ry, col, em) { return put(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), col, em, ry, x, y, z); }
function ell(rx, ry, rz, x, y, z, col, em, ws = 8, hs = 6, rotY = 0) { return put(new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz), col, em, rotY, x, y, z); }
function ico(r, x, y, z, col, sy = 1, em = 0) { return C(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z), col, em); }
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
// tapered cylinder from point a (radius r0) to point b (radius r1)
function rod(a, b, r0, r1, seg, col, em) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1).translate(0, len / 2, 0);
  _q.setFromUnitVectors(_up, _d.normalize());
  return C(g.applyQuaternion(_q).translate(a[0], a[1], a[2]), col, em);
}
// flat disc lying on a surface with normal n
function disc(r, h, seg, p, n, col, em) {
  _d.set(n[0], n[1], n[2]).normalize();
  const g = new THREE.CylinderGeometry(r, r * 1.08, h, seg).rotateY(PI / seg);
  _q.setFromUnitVectors(_up, _d);
  return C(g.applyQuaternion(_q).translate(p[0], p[1], p[2]), col, em);
}
function tris(pos, col, em) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return C(g, col, em); }
const tri2 = (pos, a, b, c) => pos.push(...a, ...b, ...c, ...a, ...c, ...b);
const quad2 = (pos, a, b, c, d) => { tri2(pos, a, b, c); tri2(pos, a, c, d); };
// outline [[x, y]] extruded `depth` along z (centred), then turned by ry and moved to (x, y, z)
function panel(pts, depth, col, em, ry, x, y, z) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps: 1 }).translate(0, 0, -depth / 2);
  return put(g, col, em, ry, x, y, z);
}
// plan polygon [[x, z]] extruded upward by h from y
function slab(pts, h, y, col, em) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]);
  s.closePath();
  return C(new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, steps: 1 }).rotateX(-HP).translate(0, y, 0), col, em);
}
// side profile [[z, y]] extruded along x from x0 to x1
function wedgeX(x0, x1, prof, col, em) {
  const s = new THREE.Shape(); s.moveTo(prof[0][0], prof[0][1]);
  for (let i = 1; i < prof.length; i++) s.lineTo(prof[i][0], prof[i][1]);
  s.closePath();
  return C(new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false, steps: 1 }).rotateY(-HP).translate(x1, 0, 0), col, em);
}
function octo(r, h, x, y, z, col, em, rb = r) { return C(new THREE.CylinderGeometry(r, rb, h, 8).rotateY(PI / 8).translate(x, y + h / 2, z), col, em); }

// ---- masonry: wall with arched (or square-headed) openings, dressed-stone facing and voussoirs
// opening: { cx, a (half width), hs (spring height), rise (arch rise; a = semicircle, 0 = flat lintel) }
const openHalf = (o, y) => y < o.hs ? o.a : (o.rise > 0 && y < o.hs + o.rise ? o.a * Math.sqrt(1 - ((y - o.hs) / o.rise) ** 2) : 0);
function archOutline(x0, x1, H, ops) {
  const pts = [[x0, 0]];
  for (const o of [...ops].sort((p, q) => p.cx - q.cx)) {
    pts.push([o.cx - o.a, 0], [o.cx - o.a, o.hs]);
    const n = o.rise > 0 ? 12 : 1;
    for (let k = 1; k < n; k++) { const th = PI - (k * PI) / n; pts.push([o.cx + o.a * Math.cos(th), o.hs + o.rise * Math.sin(th)]); }
    pts.push([o.cx + o.a, o.hs], [o.cx + o.a, 0]);
  }
  pts.push([x1, 0], [x1, H], [x0, H]);
  return pts;
}
function archWall(x0, x1, H, D, ops, zc, col) { prism(archOutline(x0, x1, H, ops), D, 0, 0, zc, col); }
// courses of blocks on the face plane z = zf (dir = +1 faces +z, -1 faces -z), skipping openings
function ashlar(x0, x1, y0, y1, zf, dir, ch, lmin, lmax, cols, r, ops = [], ring = 0) {
  const T = 0.7, zc = zf + dir * (T / 2 - 0.2);
  for (let y = y0, row = 0; y < y1 - 0.3; y += ch, row++) {
    const yb = Math.min(y1, y + ch);
    let x = x0 - (row % 2 ? lmin * 0.5 : 0);
    while (x < x1) {
      const L = lerp(lmin, lmax, r());
      let segs = [[Math.max(x, x0), Math.min(x1, x + L)]];
      x += L;
      for (const o of ops) {
        const hw = openHalf(o, y);
        if (hw <= 0) continue;
        const l = o.cx - hw - (y >= o.hs && o.rise > 0 ? ring : 0), rr = o.cx + hw + (y >= o.hs && o.rise > 0 ? ring : 0);
        segs = segs.flatMap(([p, q]) => { if (q <= l || p >= rr) return [[p, q]]; const out = []; if (p < l) out.push([p, l]); if (q > rr) out.push([rr, q]); return out; });
      }
      for (const [p, q] of segs) if (q - p > 0.7) box(q - p - 0.28, yb - y - 0.28, T, (p + q) / 2, y + 0.14, zc, pick(r, cols));
    }
  }
}
function voussoirs(o, zf, dir, ring, cols, r, key) {
  const n = Math.max(7, Math.round(o.a * 0.8) | 1), rm = o.a + ring / 2, wv = (PI * rm) / n - 0.3;
  for (let k = 0; k < n; k++) {
    const th = PI - ((k + 0.5) * PI) / n;
    const g = new THREE.BoxGeometry(ring - 0.15, wv, 1.0).rotateZ(th).translate(o.cx + rm * Math.cos(th), o.hs + rm * Math.sin(th), zf + dir * 0.3);
    C(g, k === (n - 1) / 2 ? (key ?? cols[0]) : pick(r, cols));
  }
}

// ---- timber hall with a colonnade and one or two eaves (trùng thiềm), returns the top height
function vhall(x, y, z, w, d, h, o = {}) {
  const colC = o.col ?? '#a8281e', wall = o.wall ?? '#7a3424', roof = o.roof ?? '#7a4030', base = o.base ?? '#9a948a';
  const bh = o.baseH ?? 1.2;
  if (bh > 0) box(w + (o.baseOver ?? 3), bh, d + (o.baseOver ?? 3), x, y, z, base);
  const y0 = y + bh, ins = o.inset ?? 3.2, iw = w - ins, id = d - ins;
  const nb = o.bays ?? Math.max(3, Math.round(w / 5.5)), bw = w / nb;
  if (o.open) {
    if (o.rail !== false) for (const s of [1, -1]) { box(w, 1.1, 0.3, x, y0, z + s * (d / 2 - 0.6), o.railCol ?? colC); box(0.3, 1.1, d, x + s * w / 2, y0, z, o.railCol ?? colC); }
  } else {
    box(iw, h, id, x, y0, z, wall, o.wallEm);
    if (o.doors !== false) for (let i = 0; i < nb; i++) {
      const xx = x - w / 2 + (i + 0.5) * bw;
      if (Math.abs(xx - x) < iw / 2 - 1) box(bw * 0.7, h * 0.8, 0.3, xx, y0, z + id / 2 + 0.12, o.door ?? '#5a2418', o.doorEm);
    }
  }
  const r = o.colR ?? Math.min(0.75, 0.1 * bw + 0.2);
  for (let i = 0; i <= nb; i++) for (const s of [1, -1]) cyl(r, r * 1.1, h, 6, x - w / 2 + i * bw, y0, z + s * (d / 2 - 0.6), colC, o.colEm);
  const nd = Math.max(1, Math.round(d / bw));
  for (let j = 1; j < nd; j++) for (const s of [1, -1]) cyl(r, r * 1.1, h, 6, x + s * (w / 2), y0, z - d / 2 + (j * d) / nd, colC, o.colEm);
  box(w + 0.4, 0.7, d - 0.6, x, y0 + h - 0.7, z, o.beam ?? shade(colC, 0.75));
  const rh = o.rh ?? Math.min(w, d) * 0.3, over = o.over ?? 5;
  let top = y0 + h;
  const roofAt = (rw, rd, h, yy, col) => rw >= rd ? vnRoof(rw, rd, h, x, yy, z, col, { curl: o.curl ?? 0.5, ridge: o.ridge, sag: o.sag, ornament: o.orn })
    : vnRoof(rd, rw, h, x, yy, z, col, { curl: o.curl ?? 0.5, ridge: o.ridge, sag: o.sag, ornament: o.orn, rotY: HP });
  roofAt(w + over, d + over, rh, top, roof);
  if (o.tiers >= 2) {
    const w2 = w * (o.s2 ?? 0.74), d2 = d * (o.s2d ?? 0.62), rh2 = o.rh2 ?? rh, h2 = o.h2 ?? Math.max(h * 0.4, rh * 0.75);
    const yb = top + rh * 0.4;
    box(w2 - 1, h2 + rh * 0.3, d2 - 1, x, yb - rh * 0.3, z, o.wall2 ?? wall);
    const n2 = Math.max(2, Math.round(w2 / bw));
    for (let i = 0; i <= n2; i++) for (const s of [1, -1]) cyl(r * 0.8, r * 0.8, h2, 6, x - w2 / 2 + (i * w2) / n2, yb, z + s * (d2 / 2 - 0.4), colC, o.colEm);
    top = yb + h2;
    roofAt(w2 + over * 0.8, d2 + over * 0.8, rh2, top, o.roof2 ?? roof);
    return top + rh2;
  }
  return top + rh;
}

// ---- trees
function tree(x, z, s, kind, r, y = 0) {
  if (kind === 'pine') {
    cyl(0.3 * s, 0.5 * s, 3 * s, 5, x, y, z, '#5a3e2a');
    for (let k = 0; k < 3; k++) cone((2.7 - k * 0.7) * s, 3.6 * s, 6, x, y + (2.2 + k * 2.1) * s, z, k % 2 ? '#2f5a35' : '#264c2e');
  } else if (kind === 'peach') {
    rod([x, y, z], [x + 0.6 * s, y + 3 * s, z], 0.35 * s, 0.25 * s, 5, '#4a3028');
    rod([x + 0.6 * s, y + 3 * s, z], [x - 1.4 * s, y + 4.6 * s, z + 0.6 * s], 0.22 * s, 0.12 * s, 4, '#4a3028');
    ico(2.4 * s, x + 0.6 * s, y + 5 * s, z, r() > 0.5 ? '#f29ab8' : '#f6b2c8', 0.8, 0.06);
    ico(1.7 * s, x - 1.3 * s, y + 4.6 * s, z + 0.7 * s, '#fbc8d8', 0.85, 0.06);
    ico(1.5 * s, x + 1.8 * s, y + 4.2 * s, z - 0.6 * s, '#ea86a6', 0.85, 0.06);
  } else if (kind === 'palm') {
    rod([x, y, z], [x + 0.8 * s, y + 8 * s, z], 0.35 * s, 0.25 * s, 5, '#7a6248');
    for (let k = 0; k < 6; k++) { const a = (k / 6) * PI * 2; beam([x + 0.8 * s, y + 8 * s, z], [x + 0.8 * s + Math.cos(a) * 3.6 * s, y + 6.8 * s, z + Math.sin(a) * 3.6 * s], 0.9 * s, '#4f8a3a', 0, 0.12 * s); }
  } else {
    cyl(0.35 * s, 0.55 * s, 4 * s, 5, x, y, z, '#5e4430');
    ico(3.2 * s, x, y + 6 * s, z, pick(r, ['#3f7a34', '#4a8338', '#3a6e30']), 1.1);
    ico(2.2 * s, x + 1.1 * s, y + 8.2 * s, z + 0.4 * s, pick(r, ['#56913c', '#4f8a3a']));
  }
}
// rows of trees on a hill backdrop
function forest(x0, x1, z0, z1, n, r, kind, yfn, s0 = 1.6, s1 = 2.6) {
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, r()), z = lerp(z0, z1, r());
    tree(x, z, lerp(s0, s1, r()), kind, r, yfn ? yfn(x, z) - 0.5 : 0);
  }
}
function flag(x, y, z, w, h, col, em = 0.12, dir = 1, ry = 0) {
  const n = 4, pos = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, w0 = Math.sin(t0 * PI * 1.5) * 0.25 * w * t0, w1 = Math.sin(t1 * PI * 1.5) * 0.25 * w * t1;
    const a = [dir * t0 * w, 0, w0], b = [dir * t1 * w, 0, w1], c = [dir * t1 * w, h, w1], d = [dir * t0 * w, h, w0];
    quad2(pos, a, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  put(g, col, em, ry, x, y, z);
}
function lantern(x, y, z, col, s = 1) {
  box(0.08 * s, 0.9 * s, 0.08 * s, x, y + 0.5 * s, z, '#2a1a12');
  sph(0.6 * s, x, y, z, col, 0.9, 1.25, 8, 6);
  cyl(0.3 * s, 0.3 * s, 0.22 * s, 6, x, y + 0.66 * s, z, '#3a2414');
  cyl(0.3 * s, 0.3 * s, 0.22 * s, 6, x, y - 0.88 * s, z, '#3a2414');
}
// stair of n steps rising toward -z, front edge at z0, from y0 to y1 (solid down to y0)
function stairs(x, y0, y1, z0, w, n, run, col) {
  const rise = (y1 - y0) / n;
  for (let k = 0; k < n; k++) box(w, rise * (k + 1), run, x, y0, z0 - (k + 0.5) * run, k % 2 ? col : shade(col, 0.94));
}
// stone dragon balustrade (Lê style): sinuous body on a sloping plinth, head at the bottom (front)
function stoneDragon(x, yA, zA, yB, zB, col, s = 1) {
  const dk = shade(col, 0.82);
  wedgeX(x - 1.2 * s, x + 1.2 * s, [[zA + 1.5 * s, 0], [zA + 1.5 * s, yA + 1.6 * s], [zB, yB + 1.6 * s], [zB, 0]], dk);
  const n = 24, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, amp = (1.25 - 0.7 * t) * s;
    pts.push([x, lerp(yA, yB, t) + (2.6 * s) + amp * Math.sin(t * PI * 7 + 0.9), lerp(zA - 1, zB + 1, t)]);
  }
  for (let i = 0; i < n; i++) {
    const t = i / n;
    rod(pts[i], pts[i + 1], (1.05 - 0.6 * t) * s, (1.05 - 0.6 * (t + 1 / n)) * s, 6, col);
    if (i % 2 === 0 && i < n - 2) cone(0.35 * s * (1 - t * 0.5), 1.2 * s, 4, pts[i][0], pts[i][1] + (0.8 - 0.4 * t) * s, pts[i][2], dk);
  }
  const h = [x, yA + 4.6 * s, zA + 1.2 * s];
  rod(pts[0], h, 1.05 * s, 1.1 * s, 6, col);
  ell(1.5 * s, 1.35 * s, 1.9 * s, h[0], h[1], h[2], col, 0, 7, 5);
  rbox(1.6 * s, 1.0 * s, 2.4 * s, h[0], h[1] - 0.9 * s, h[2] + 1.6 * s, 0, col);            // snout / jaw
  rbox(1.8 * s, 0.6 * s, 1.6 * s, h[0], h[1] + 0.4 * s, h[2] + 1.4 * s, 0, dk);             // upper lip
  for (const sx of [-1, 1]) rod([h[0] + sx * 0.6 * s, h[1] + 1 * s, h[2] - 0.2 * s], [h[0] + sx * 1.0 * s, h[1] + 2.6 * s, h[2] - 1.8 * s], 0.3 * s, 0.1 * s, 4, dk);   // horns
  for (let k = 0; k < 4; k++) cone(0.45 * s, 1.8 * s, 4, h[0], h[1] + 0.5 * s - k * 0.3 * s, h[2] - 1.2 * s - k * 0.7 * s, dk);   // flame mane
  sph(0.75 * s, h[0], h[1] - 0.2 * s, h[2] + 3.1 * s, shade(col, 1.1), 0, 1, 6, 4);       // pearl
}

// ---- hull loft: stern at z = -L/2, bow at +L/2; sec(t) → { w, top, bot }; bands [[a0, a1, col]] (a: 0 keel → 1 gunwale)
function hull(L, sec, bands, deckCol, z0 = 0, nT = 18, nA = 7) {
  const P = (t, a, side) => {
    const s = sec(t), th = a * HP;
    return [side * s.w * Math.pow(Math.sin(th), 0.55), s.bot + (s.top - s.bot) * (1 - Math.cos(th)), z0 + lerp(-L / 2, L / 2, t)];
  };
  for (const [a0, a1, col, em] of bands) {
    const pos = [], na = Math.max(1, Math.round(nA * (a1 - a0)));
    for (let i = 0; i < nT; i++) for (let j = 0; j < na; j++) {
      const t0 = i / nT, t1 = (i + 1) / nT, b0 = lerp(a0, a1, j / na), b1 = lerp(a0, a1, (j + 1) / na);
      for (const sd of [1, -1]) quad2(pos, P(t0, b0, sd), P(t1, b0, sd), P(t1, b1, sd), P(t0, b1, sd));
    }
    tris(pos, col, em);
  }
  const pos = [];
  for (let i = 0; i < nT; i++) { const t0 = i / nT, t1 = (i + 1) / nT; quad2(pos, P(t0, 1, -1), P(t1, 1, -1), P(t1, 1, 1), P(t0, 1, 1)); }
  for (const t of [0, 1]) if (sec(t).w > 0.3) for (let j = 0; j < nA; j++) {   // transoms
    const b0 = j / nA, b1 = (j + 1) / nA;
    quad2(pos, P(t, b0, -1), P(t, b1, -1), P(t, b1, 1), P(t, b0, 1));
  }
  tris(pos, deckCol);
}
// billowed sail (w × h), centre-bottom at (x, y, z), facing ±z then turned by ry
function sail(w, h, x, y, z, ry, bulge, col, em = 0, taper = 0) {
  const g = new THREE.BoxGeometry(w, h, 0.25, 4, 4, 1).translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getY(i) / h;
    p.setX(i, p.getX(i) * (1 - taper * v));
    p.setZ(i, p.getZ(i) + bulge * (1 - u * u) * Math.sin(v * PI));
  }
  return put(g, col, em, ry, x, y, z);
}
// small human figure (rider / rower / soldier)
function person(x, y, z, coat, hat, s = 1, ry = 0, hatKind = 'cone') {
  rbox(0.9 * s, 1.3 * s, 0.6 * s, x, y, z, ry, coat);
  sph(0.38 * s, x, y + 1.6 * s, z, '#c89a74', 0, 1, 6, 4);
  if (hatKind === 'cone') cone(0.7 * s, 0.5 * s, 6, x, y + 1.85 * s, z, hat);
  else cyl(0.4 * s, 0.42 * s, 0.35 * s, 6, x, y + 1.85 * s, z, hat);
}

// ================================================================ ERA 6 · HỒ — TÂY ĐÔ
// Cửa Nam, the South Gate of the Hồ citadel (1397): dressed limestone blocks with three barrel vaults.
function taydo(o = {}) {
  const len = o.len ?? 500, r = mulberry32(o.seed ?? 1397);
  const S = ['#8d9484', '#858d7d', '#979d8c', '#7f8676', '#8a8f7c', '#9ba190', '#7a8272', '#90957f'];
  const core = '#6e7466';
  const GW = 56, GH = 30, D = 30, WH = 20, WD = 18;
  const ops = [{ cx: 0, a: 13, hs: 7, rise: 13 }, { cx: -36, a: 8.5, hs: 5, rise: 8.5 }, { cx: 36, a: 8.5, hs: 5, rise: 8.5 }];
  archWall(-GW, GW, GH, D, ops, 0, core);
  for (const dir of [1, -1]) {
    ashlar(-GW, GW, 0, GH, (dir * D) / 2, dir, 2.5, 3.6, 7.5, S, r, ops, 2.8);
    for (const op of ops) voussoirs(op, (dir * D) / 2, dir, 2.8, S, r, '#a3a894');
  }
  box(GW * 2 + 1.6, 1.0, D + 1.6, 0, GH, 0, '#7c8372');
  // stone-paved approach and moat with a causeway
  box(2 * len + 60, 0.5, 30, 0, -0.32, 52, '#3d6670');
  box(28, 1.0, 34, 0, -0.4, 52, '#83887a');
  box(40, 0.4, 12, 0, 0, 22, '#8c9082');
  // walls of stone facing with an earth rampart behind
  for (const sx of [-1, 1]) {
    const xa = sx > 0 ? GW : -len, xb = sx > 0 ? len : -GW;
    box(xb - xa, WH, WD, (xa + xb) / 2, 0, 0, core);
    box(xb - xa, 0.8, WD + 1, (xa + xb) / 2, WH, 0, '#7c8372');
    const near = sx > 0 ? [GW, 190] : [-190, -GW], far = sx > 0 ? [190, len] : [-len, -190];
    ashlar(near[0], near[1], 0, WH, WD / 2, 1, 2.9, 5, 10, S, r);
    ashlar(far[0], far[1], 0, WH, WD / 2, 1, 3.4, 10, 18, S, r);
    wedgeX(xa, xb, [[-WD / 2, 0], [-WD / 2, WH + 0.6], [-WD / 2 - 6, WH + 0.6], [-WD / 2 - 34, 0]], '#6f7a4a');
    box(xb - xa, 0.4, WD - 2, (xa + xb) / 2, WH + 0.8, 0, '#6a8a44');
  }
  // watch pavilion (vọng lâu) of timber on the gate
  const wood = '#7a3a22';
  vhall(0, GH + 1, 0, 40, 14, 7, { open: true, col: wood, roof: '#6a3c2c', ridge: '#4a2a1e', base: '#7c8372', baseH: 0.8, tiers: 2, rh: 5.5, rh2: 5, s2: 0.62, s2d: 0.7, h2: 4.2, bays: 7, curl: 0.6, railCol: '#5a2c1a' });
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [
      B(-GW, -44.5, 0, GH + 1, -D / 2, D / 2), B(44.5, GW, 0, GH + 1, -D / 2, D / 2),
      B(-27.5, -13, 0, GH + 1, -D / 2, D / 2), B(13, 27.5, 0, GH + 1, -D / 2, D / 2),
      B(-44.5, -27.5, 13.5, GH + 1, -D / 2, D / 2), B(27.5, 44.5, 13.5, GH + 1, -D / 2, D / 2),
      B(-13, 13, 20, GH + 1, -D / 2, D / 2), B(-13, -9.5, 15.5, 20, -D / 2, D / 2), B(9.5, 13, 15.5, 20, -D / 2, D / 2),
      B(-23, 23, GH + 1, GH + 20, -10, 10),
      B(-len, -GW, 0, WH + 1, -WD / 2, WD / 2), B(GW, len, 0, WH + 1, -WD / 2, WD / 2),
    ],
    gates: [{ x0: -13, x1: 13, y0: 0, y1: 20, label: 'CỬA NAM THÀNH TÂY ĐÔ', bonus: 2000 }],
  };
}

// Đàn Nam Giao nhà Hồ: terraces stepping up Đốn Sơn to the square and round altars.
function namgiao(o = {}) {
  const r = mulberry32(o.seed ?? 1402);
  const stone = '#9a9a8c', stone2 = '#8a8a7c', grass = '#6f8f4a';
  ell(150, 46, 70, 0, -6, -150, '#4f6e3a', 0, 10, 6);
  const n = 5, step = 3.2, run = 24, z0 = 50;
  for (let k = 0; k < n; k++) {
    const w = 140 - k * 8, zf = z0 - k * run, zb = -85, h = (k + 1) * step;
    box(w, h, zf - zb, 0, 0, (zf + zb) / 2, k % 2 ? stone2 : stone);
    box(w - 3, 0.3, zf - zb - 3, 0, h, (zf + zb) / 2 - 0.5, k === n - 1 ? '#8e8e80' : grass);
    stairs(0, h - step, h, zf + 6, 14, 5, 1.2, '#a4a496');
    box(10, 0.32, run - 2, 0, h, zf - run / 2, '#a6a698');   // central path (thần đạo)
  }
  const yt = n * step + 0.3;
  box(52, 1.6, 52, 0, yt, -50, '#a8a89a'); box(46, 0.4, 46, 0, yt + 1.6, -50, '#9a9a8c');
  for (const [x, z, w, d] of [[0, -24, 52, 1], [0, -76, 52, 1], [-26, -50, 1, 52], [26, -50, 1, 52]]) box(w, 1.4, d, x, yt + 1.6, z, '#8a8a7c');
  cyl(15, 16, 1.8, 24, 0, yt + 2, -50, '#b0b0a2'); cyl(10, 11, 1.8, 24, 0, yt + 3.8, -50, '#b8b8aa');
  box(3, 1, 3, 0, yt + 5.6, -50, '#8a7a5a');
  // perimeter wall (la thành)
  for (const [x, z, w, d] of [[0, 52, 150, 1.5], [-75, -16, 1.5, 136], [75, -16, 1.5, 136]]) box(w, 2.4, d, x, 0, z, '#8a8678');
  forest(-150, -85, -130, 40, 14, r, 'round', null, 1.6, 2.4);
  forest(85, 150, -130, 40, 14, r, 'round', null, 1.6, 2.4);
  forest(-120, 120, -175, -110, 22, r, 'pine', (x, z) => Math.max(0, -6 + 46 * Math.sqrt(Math.max(0, 1 - (x / 150) ** 2 - ((z + 150) / 70) ** 2))), 1.8, 2.6);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// ================================================================ ERA 7 · LÊ SƠ
// Điện Kính Thiên: great hall on a high terrace, nine-step stair with four stone dragons (1467).
function kinhthien() {
  const stone = '#8c8e80', stoneD = '#767a6c', red = '#a8281e', roof = '#b07a34', ridge = '#7a4a24';
  box(158, 2, 80, 0, 0, -8, stoneD);
  box(150, 10, 72, 0, 2, -8, stone);
  for (let i = 0; i < 30; i++) box(150.2, 0.25, 72.2, 0, 2.5 + (i % 3) * 3.2, -8, shade(stone, 0.9));
  box(150, 0.6, 72, 0, 12, -8, '#9a9a8c');
  // balustrade along the terrace edge
  for (const sx of [-1, 1]) { box(57, 1.4, 0.8, sx * 46.5, 12.6, 27.6, stoneD); box(0.8, 1.4, 72, sx * 75, 12.6, -8, stoneD); }
  // front stair: 9 steps between 4 dragon balustrades
  stairs(0, 0, 12.6, 49, 42, 9, 2.4, '#9a9c8e');
  for (const x of [-20.5, -6.8, 6.8, 20.5]) stoneDragon(x, 0, 49.5, 12.6, 28, '#8f9384', 1.3);
  // side stairs
  for (const sx of [-1, 1]) stairs(sx * 60, 0, 12.6, 49, 10, 9, 2.4, '#9a9c8e');
  // the hall: red columns, ochre-yellow two-tier roof
  const top = vhall(0, 12.6, -14, 112, 46, 14, { col: red, wall: '#8a2a1e', door: '#5a1e14', roof, ridge, base: '#a3a395', baseH: 1.4, tiers: 2, rh: 11, rh2: 12, s2: 0.72, s2d: 0.62, h2: 7, bays: 11, curl: 0.55, colR: 0.85 });
  sph(1.6, 0, top + 0.6, -14, '#d8a838', 0.25, 1, 8, 6);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// Hoàn Kiếm legend: the golden turtle rising from the lake with the sword Thuận Thiên in its mouth.
function ruathan() {
  const bronze = '#a8823a', gold = '#c8a048', skin = '#8a6a30', dark = '#6a4e24';
  const cz = -2, RX = 11, RY = 5.6, RZ = 14;
  ell(RX, RY, RZ, 0, 0, cz, bronze, 0.1, 16, 10);
  const scute = (px, pz, rad) => {
    const u = px / RX, v = (pz - cz) / RZ, q = 1 - u * u - v * v;
    if (q <= 0.02) return;
    const y = RY * Math.sqrt(q);
    disc(rad, 0.7, 6, [px, y, pz], [px / (RX * RX), y / (RY * RY), (pz - cz) / (RZ * RZ)], gold, 0.14);
  };
  for (const z of [-12, -6.5, -1, 4.5, 9.5]) scute(0, z, 2.7);
  for (const sx of [-1, 1]) for (const z of [-9.5, -3.5, 2.5, 8]) scute(sx * 6.2, z, 2.5);
  for (let k = 0; k < 18; k++) { const a = (k / 18) * PI * 2; scute(Math.cos(a) * RX * 0.9, cz + Math.sin(a) * RZ * 0.9, 1.6); }
  // neck, head (raised), sword held crosswise in the jaws
  rod([0, 1.5, 8.5], [0, 7.6, 14.6], 2.8, 2.3, 8, skin, 0.08);
  ell(2.7, 2.3, 3.4, 0, 8.9, 16.4, skin, 0.08, 10, 7);
  ell(2.0, 0.9, 1.8, 0, 7.9, 18.6, dark, 0.05, 8, 5);
  for (const sx of [-1, 1]) sph(0.48, sx * 1.9, 9.9, 17.6, '#1e140a', 0.3, 1, 6, 4);
  box(19, 0.5, 1.4, 4.5, 8.3, 18.6, '#e2f2ff', 0.85);         // blade
  box(0.9, 2.9, 1.9, -5.3, 7.1, 18.6, gold, 0.4);             // guard
  rod([-5.6, 8.55, 18.6], [-9.6, 8.55, 18.6], 0.45, 0.45, 6, '#5a3a1a');
  sph(0.7, -10, 8.55, 18.6, gold, 0.4, 1, 6, 4);
  // flippers paddling, tail
  for (const sx of [-1, 1]) {
    ell(7, 0.9, 2.6, sx * 12, 0.6, 5, skin, 0.06, 8, 4, sx * 0.55);
    ell(4, 0.7, 2.2, sx * 9, 0.3, -14, skin, 0.06, 8, 4, -sx * 0.5);
  }
  rod([0, 0.4, -15], [0, 0.2, -19], 1.1, 0.2, 5, skin, 0.06);
  // ripples
  for (const [R, w] of [[17, 0.25], [21.5, 0.2], [26, 0.15]]) torus(R, w, 0, 0.1, cz, '#b8d8e4', 0.1);
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [Cy(0, cz, 12.5, -2, 6.5), B(-3.2, 3.2, 1, 11.6, 8, 20.4), B(-11, 15, 6.5, 10.2, 17.4, 20)],
    emitters: [{ kind: 'spray', x: 0, y: 1, z: 12, w: 14, rate: 0.6 }],
  };
}

// Văn Miếu: doctoral steles on stone turtles (from 1484) in two roofed rows flanking Thiên Quang well.
function biatiensi(o = {}) {
  const r = mulberry32(o.seed ?? 1484);
  const stone = '#7d8288', stoneD = '#6a6e74', tile = '#6e3a2a', wood = '#6a2c1e';
  box(96, 0.3, 136, 0, 0, 0, '#9a6a4e');
  for (const sx of [-1, 1]) box(16, 0.36, 132, sx * 12 + sx * 0, 0, 0, '#6f9a4a');
  // Thiên Quang well (square pond) with stone rim
  box(38, 0.5, 38, 0, 0, 0, '#3e6a72');
  for (const [x, z, w, d] of [[0, 19.5, 40, 1.2], [0, -19.5, 40, 1.2], [19.5, 0, 1.2, 38], [-19.5, 0, 1.2, 38]]) box(w, 1.4, d, x, 0, z, '#a8a698');
  for (const sx of [-1, 1]) {
    const X = sx * 34;
    box(12, 0.8, 124, X, 0, 0, '#9c9a8e');
    for (let k = 0; k <= 20; k++) for (const s2 of [-1, 1]) cyl(0.3, 0.34, 6.2, 6, X + s2 * 4.8, 0.8, -60 + k * 6, wood);
    box(10.2, 0.5, 121, X, 6.6, 0, shade(wood, 0.8));
    vnRoof(126, 14, 4.2, X, 6.9, 0, tile, { rotY: HP, curl: 0.35, ridge: '#4a2a1e' });
    for (let k = 0; k < 24; k++) {
      const z = -55 + k * 4.8, f = -sx;   // steles face the pond
      ell(1.9, 0.9, 1.4, X, 1.2, z, stoneD, 0, 6, 4);
      box(0.9, 0.7, 0.8, X + f * 2.1, 1.0, z, stoneD);
      box(0.45, 3.4, 2.3, X, 1.6, z, pick(r, [stone, '#828790', '#787e86']));
      box(0.55, 0.45, 2.5, X, 5.0, z, stone);
      put(new THREE.ConeGeometry(1.25, 0.6, 4).rotateY(PI / 4).translate(0, 0.3, 0), stone, 0, 0, X, 5.45, z);
    }
  }
  // old trees along the courtyard
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) tree(sx * 46, -55 + k * 22, 1.6 + r() * 0.5, 'round', r);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// Lam Kinh: chính điện (Quang Đức – Sùng Hiếu – Diên Khánh, chữ Công plan) on a terrace with a 9-step
// dragon stair, the forested Dụ Sơn behind.
function lamkinh(o = {}) {
  const r = mulberry32(o.seed ?? 1433);
  const stone = '#8e9082', lim = '#5a2a1a', tile = '#8a4a32', ridge = '#5a3022';
  // mountain backdrop
  ell(170, 95, 80, 0, -10, -190, '#3f6230', 0, 12, 7);
  ell(90, 70, 60, -110, -10, -150, '#47693a', 0, 10, 6);
  ell(90, 62, 60, 115, -10, -150, '#456a36', 0, 10, 6);
  const hillY = (x, z) => Math.max(0, 85 * Math.sqrt(Math.max(0, 1 - (x / 170) ** 2 - ((z + 190) / 80) ** 2)) - 10);
  forest(-160, 160, -200, -120, 60, r, 'round', hillY, 2.2, 3.2);
  // terraces
  box(150, 3, 110, 0, 0, -20, '#7e8072'); box(120, 4, 84, 0, 3, -26, stone);
  for (const sx of [-1, 1]) box(1, 1.2, 84, sx * 60, 7, -26, '#7a7c6e');
  stairs(0, 0, 3, 41, 30, 3, 2.2, '#9a9c8e');
  stairs(0, 3, 7, 16, 18, 9, 1.6, '#9a9c8e');
  for (const x of [-9.5, 9.5]) stoneDragon(x, 3, 16.5, 7, 2, '#8f9384', 0.75);
  const hp = { col: lim, wall: '#6a3020', door: '#4a2014', roof: tile, ridge, base: '#9a9a8c', baseH: 1, curl: 0.55, colR: 0.7 };
  vhall(0, 7, -8, 64, 18, 8, { ...hp, rh: 7.5, bays: 9 });                 // Quang Đức
  vhall(0, 7, -26, 20, 18, 7, { ...hp, rh: 6, bays: 3, doors: false });   // Sùng Hiếu
  vhall(0, 7, -44, 64, 18, 8, { ...hp, rh: 7.5, bays: 9 });                // Diên Khánh
  // the Ngọc stream and a stone bridge in front
  box(170, 0.4, 10, 0, 0, 62, '#3e6a72');
  box(14, 1.4, 14, 0, 0, 62, '#8a8c7e');
  forest(-150, -80, -40, 60, 10, r, 'round', null, 1.8, 2.6);
  forest(80, 150, -40, 60, 10, r, 'round', null, 1.8, 2.6);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [], fogScale: 0.8 };
}

// ================================================================ ERA 8 · THƯƠNG CẢNG
// Chùa Cầu (Hội An): arched covered bridge with a temple on its north side; fly under the deck.
function chuacau() {
  const wood = '#6a3a22', woodD = '#4a2818', tile = '#5a4840', plaster = '#d8c49a', stone = '#8a8478';
  const deckY = (x) => 20.3 - 0.004 * x * x;
  const N = 16, X = 58;
  for (let i = 0; i < N; i++) {
    const x0 = -X + (2 * X * i) / N, x1 = -X + (2 * X * (i + 1)) / N, y0 = deckY(x0), y1 = deckY(x1);
    beam([x0, y0 - 0.8, 0], [x1, y1 - 0.8, 0], 11, woodD, 0, 1.6);              // deck
    for (const s of [-1, 1]) beam([x0, y0 - 1.85, s * 5.4], [x1, y1 - 1.85, s * 5.4], 0.5, '#7a2e1c', 0, 0.9);   // fascia
    for (const s of [-1, 1]) {
      beam([x0, y0 + 1.2, s * 5.2], [x1, y1 + 1.2, s * 5.2], 0.3, wood, 0, 0.3);   // railing
      beam([x0, y0 + 0.4, s * 5.2], [x1, y1 + 0.4, s * 5.2], 0.25, wood, 0, 0.25);
      cyl(0.32, 0.32, 7.2, 6, x0, y0, s * 5.2, wood);                                 // posts
      // roof slopes (two per bay)
      const pa = [x0, y0 + 7.0, s * 7.2], pb = [x1, y1 + 7.0, s * 7.2], pc = [x1, y1 + 10.2, 0], pd = [x0, y0 + 10.2, 0];
      const pos = []; quad2(pos, pa, pb, pc, pd); tris(pos, tile);
      beam([x0, y0 + 7.0, s * 7.25], [x1, y1 + 7.0, s * 7.25], 0.4, woodD, 0, 0.4);
    }
    beam([x0, y0 + 10.3, 0], [x1, y1 + 10.3, 0], 0.7, '#4a3a34', 0, 0.6);
    for (let k = 1; k < 4; k++) {   // tile rows
      const xx = lerp(x0, x1, k / 4), yy = deckY(xx);
      for (const s of [-1, 1]) beam([xx, yy + 7.05, s * 7.1], [xx, yy + 10.25, 0], 0.22, '#4a3c36', 0, 0.22);
    }
  }
  // end gables with upturned eaves
  for (const sx of [-1, 1]) {
    vnRoof(14, 15, 3.6, sx * 57, deckY(57) + 7, 0, tile, { curl: 0.7, ridge: '#4a3a34', rotY: HP });
    box(2.4, deckY(56), 14, sx * 57, 0, 0, stone);
  }
  // piers outside the gate (stone + timber)
  for (const x of [-46, -32, 32, 46]) { box(4, deckY(x) - 1.2, 12, x, 0, 0, stone); }
  // the temple on the north (-z) side, cantilevered over the river
  const ty = deckY(0) - 0.8;
  box(14, 1.4, 11, 0, ty - 0.6, -10.5, woodD);
  box(12, 6.5, 9, 0, ty + 0.8, -11, '#9a3a26');
  box(5, 4.2, 0.3, 0, ty + 0.8, -6.4, '#3a1e12', 0.25);
  box(5.6, 1.2, 0.25, 0, ty + 5.8, -6.3, '#e0b040', 0.4);
  vnRoof(16, 13, 4.2, 0, ty + 7.3, -11, tile, { curl: 0.8, ridge: '#4a3a34' });
  for (const sx of [-1, 1]) rbox(1.6, 2.4, 1.6, sx * 3.8, ty + 11, -11, PI / 4, '#2f7a5a', 0.1);
  // monkey (west) and dog (east) statues at the ends
  for (const sx of [-1, 1]) for (const s of [-1, 1]) {
    const x = sx * 53, y = deckY(53);
    box(1.0, 0.8, 1.0, x, y, s * 3.8, plaster);
    ell(0.5, 0.75, 0.45, x, y + 1.45, s * 3.8, sx < 0 ? '#c8b088' : '#e0d8c8', 0, 6, 4);
    sph(0.4, x, y + 2.4, s * 3.8 + 0.1, sx < 0 ? '#c8b088' : '#e0d8c8', 0, 1, 6, 4);
  }
  // lanterns under the eaves
  for (let k = -5; k <= 5; k++) { const x = k * 9.5; for (const s of [-1, 1]) lantern(x, deckY(x) + 4.9, s * 7.0, k % 2 ? '#e8362a' : '#f2b832', 1.4); }
  const parts = [{ geo: take(), mat: 'paint' }];
  return {
    parts,
    colliders: [
      B(-22, 22, 16, 31.6, -7.5, 7.5), B(-60, -22, 0, 31, -7.5, 7.5), B(22, 60, 0, 31, -7.5, 7.5),
      B(-8, 8, 16.5, 32, -17.5, -6),
    ],
    gates: [{ x0: -22, x1: 22, y0: 0, y1: 16, label: 'GẦM CHÙA CẦU', bonus: 1800 }],
  };
}

// Hội quán Phúc Kiến: Fujian three-entrance gate with stacked green-glazed roofs and ridge dragons.
function hoiquan() {
  const red = '#b0221a', green = '#3c8c5a', greenD = '#2a6a42', yellow = '#e0b03a', wall = '#e8c870', stone = '#a8a294';
  box(64, 1.0, 16, 0, 0, 0, stone); box(60, 0.6, 14, 0, 1.0, 0, '#b8b2a4');
  stairs(0, 0, 1.6, 10, 14, 3, 0.9, '#b8b2a4');
  const y0 = 1.6;
  // walls between the gates
  for (const sx of [-1, 1]) {
    box(6, 9, 2.6, sx * 12, y0, 0, wall); box(7, 8, 2.6, sx * 26.5, y0, 0, wall);
    sph(1.8, sx * 26.5, y0 + 4.5, 1.35, '#3a2a1a', 0, 0.2, 10, 6);   // round window
    box(6.6, 0.8, 3.2, sx * 12, y0 + 9, 0, greenD); box(7.6, 0.8, 3.2, sx * 26.5, y0 + 8, 0, greenD);
  }
  // red columns
  for (const x of [-21, -15, -9, -4.5, 4.5, 9, 15, 21]) for (const z of [-2.8, 2.8]) cyl(0.5, 0.55, Math.abs(x) < 10 ? 12 : 9, 8, x, y0, z, red);
  // doors and signboard
  box(9, 10, 0.4, 0, y0, -0.2, '#7a1a14'); for (const sx of [-1, 1]) box(5.6, 7.5, 0.4, sx * 18, y0, -0.2, '#7a1a14');
  for (const x of [-2.2, 2.2]) for (const k of [0, 1, 2]) sph(0.3, x, y0 + 2.5 + k * 2.6, 0.1, yellow, 0.2, 1, 6, 4);
  box(8, 1.6, 0.4, 0, y0 + 12.2, 3.2, '#c02a1e', 0.1); box(6.6, 1.0, 0.45, 0, y0 + 12.5, 3.25, yellow, 0.35);
  // beam frames
  box(20, 1.0, 6.4, 0, y0 + 12, 0, red); for (const sx of [-1, 1]) box(13, 0.9, 6.4, sx * 18, y0 + 9, 0, red);
  // stacked roofs: side gates, middle, top (swallow-tail ridges)
  for (const sx of [-1, 1]) vnRoof(15, 9, 3.2, sx * 18, y0 + 9.9, 0, green, { curl: 0.95, ridge: yellow, sag: 0.18 });
  vnRoof(24, 10, 3.6, 0, y0 + 13, 0, green, { curl: 0.95, ridge: yellow, sag: 0.18 });
  box(12, 2.4, 4, 0, y0 + 15.6, 0, red);
  vnRoof(19, 9, 3.6, 0, y0 + 17.8, 0, green, { curl: 1.1, ridge: yellow, sag: 0.2 });
  // ridge ornament: two dragons playing with a pearl
  const ry = y0 + 21.8;
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([sx * lerp(7, 1.4, t), ry + 0.5 + 1.0 * Math.sin(t * PI * 2.2) + t * 0.8, 0]); }
    for (let i = 0; i < 8; i++) rod(pts[i], pts[i + 1], 0.38 - i * 0.02, 0.36 - i * 0.02, 5, i % 2 ? '#3aa070' : yellow, 0.12);
    ell(0.7, 0.6, 0.6, pts[8][0], pts[8][1] + 0.3, 0, yellow, 0.15, 6, 4);
    rod([sx * 7.6, ry - 0.2, 0], [sx * 9.6, ry + 2.2, 0], 0.35, 0.12, 5, '#3aa070', 0.12);   // swallow tail
  }
  sph(0.7, 0, ry + 2.4, 0, '#ff4a2a', 0.6, 1, 8, 6);
  for (const sx of [-1, 1]) rod([sx * 9, y0 + 12.6, 0], [sx * 11.6, y0 + 14.8, 0], 0.3, 0.1, 5, yellow, 0.1);
  // lanterns
  for (const x of [-6, 6]) lantern(x, y0 + 9.5, 3.8, '#e8362a', 1.5);
  for (const x of [-18, 18]) lantern(x, y0 + 7.4, 3.6, '#f2b832', 1.2);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// Hội An shophouses: o.n houses along z (each ~10 wide frontage, 18 deep), ochre walls, yin-yang tile roofs.
function phohoian(o = {}) {
  const n = o.n ?? 12, r = mulberry32(o.seed ?? 1618);
  // street facade toward the rail: local +x (f = 1) or -x, taking a stage rotY into account
  const f = o.face ?? (((o.u ?? 0) > 0 ? -1 : 1) * (Math.cos(o.rotY || 0) < 0 ? -1 : 1));
  const walls = ['#e2b448', '#d9a53c', '#e8c25a', '#d6ac52', '#e0b040', '#cfa048', '#e6bc50', '#d8b060'];
  const woods = ['#5a3820', '#6a4428', '#4e3020'], roofs = ['#5c4034', '#634638', '#54392e', '#6a4a3a'], shut = ['#3e5a52', '#5a3a24', '#4a5a6a', '#6a4a2a'];
  const W = 10, Dd = 18, Ltot = n * W;
  let Hmax = 0;
  for (let i = 0; i < n; i++) {
    const z = Ltot / 2 - W / 2 - i * W;
    const two = r() < 0.65, h1 = 4.8 + r() * 0.8, h2 = two ? 4.0 + r() * 0.6 : 0, H = h1 + h2;
    const wc = pick(r, walls), wd = pick(r, woods), rc = pick(r, roofs), sc = pick(r, shut);
    const wi = W - 0.3, fx = (f * Dd) / 2;
    box(Dd, H, wi, 0, 0, z, wc);
    // ground floor: wooden shopfront boards
    box(0.4, h1 - 1.0, wi - 1.6, fx + f * 0.12, 0.3, z, wd);
    for (let k = -3; k <= 3; k++) box(0.5, h1 - 1.0, 0.16, fx + f * 0.2, 0.3, z + k * 1.15, shade(wd, 0.75));
    box(0.5, 0.5, wi - 1.2, fx + f * 0.2, h1 - 0.8, z, shade(wd, 0.8));
    if (r() < 0.6) { const ow = 2.4 + r() * 1.6; box(0.3, h1 - 1.6, ow, fx + f * 0.42, 0.3, z + (r() - 0.5) * 2, '#ffb868', 0.45); }   // open shop, lamplit
    // pent roof between floors
    const rh = two ? 3.2 : 3.8;
    panel([[fx, h1 + 0.6], [fx + f * 2.6, h1 - 0.5], [fx + f * 2.6, h1 - 0.8], [fx, h1 + 0.3]], wi + 0.2, rc, 0, 0, 0, 0, z);
    if (two) {
      for (const k of [-1, 1]) { box(0.3, 2.4, 2.4, fx + f * 0.1, h1 + 1.0, z + k * 2.4, '#2a1e16'); for (const s of [-1, 1]) box(0.2, 2.4, 1.1, fx + f * 0.2, h1 + 1.0, z + k * 2.4 + s * 1.8, sc); }
      if (r() < 0.5) { box(1.6, 0.25, wi - 1, fx + f * 0.8, h1 + 0.55, z, wd); box(0.12, 1.0, wi - 1, fx + f * 1.55, h1 + 0.8, z, wd); }
    } else box(0.3, 1.0, wi - 2, fx + f * 0.1, h1 + 1.0, z, '#3a2a1e');
    // main gable roof, ridge along z, eaves front and back
    const ov = 1.4, base = H - 0.2;
    panel([[-Dd / 2 - ov, base - 0.6], [Dd / 2 + ov, base - 0.6], [Dd / 2 + ov, base - 0.3], [0, base + rh], [-Dd / 2 - ov, base - 0.3]], wi + 0.4, rc, 0, 0, 0, 0, z);
    for (let k = -4; k <= 4; k++) for (const s of [-1, 1]) beam([s * (Dd / 2 + ov), base - 0.25, z + k * 1.05], [0, base + rh + 0.05, z + k * 1.05], 0.28, shade(rc, 0.8), 0, 0.22);
    box(1.0, 0.5, wi + 0.4, 0, base + rh - 0.1, z, shade(rc, 0.85));
    if (r() < 0.35) { const ye = base + rh * (1 - Dd / 2 / (Dd / 2 + ov)) + 0.5; panel([[-Dd / 2, base - 0.4], [Dd / 2, base - 0.4], [Dd / 2, ye], [0, base + rh + 0.6], [-Dd / 2, ye]], 0.5, wc, 0, 0, 0, 0, z + W / 2 - 0.25); }   // gable firewall
    // silk lanterns
    for (const k of [-1, 1]) if (r() < 0.85) lantern(fx + f * 2.0, h1 - 1.7, z + k * (2.2 + r()), pick(r, ['#e8362a', '#f2b832', '#e8362a', '#ff7a2a']), 1.05);
    Hmax = Math.max(Hmax, base + rh + 0.5);
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-Dd / 2 - 1, Dd / 2 + 1, 0, Hmax, -Ltot / 2, Ltot / 2)] };
}
phohoian.dynamic = true;

// Châu ấn thuyền: Japanese red-seal junk with a high stern castle and battened mat sails.
function chauan() {
  const L = 44;
  const sec = (t) => ({ w: pl(t, [[0, 5.0], [0.3, 6.6], [0.65, 6.2], [0.9, 4.0], [1, 2.4]]), top: pl(t, [[0, 10.5], [0.18, 7.2], [0.55, 5.6], [0.85, 6.6], [1, 8.4]]), bot: pl(t, [[0, 1.4], [0.12, -1.4], [0.5, -2.2], [0.9, -1.0], [1, 2.6]]) });
  hull(L, sec, [[0, 0.55, '#2a2420'], [0.55, 0.82, '#e8e2d0'], [0.82, 1, '#b8302a']], '#8a6a48');
  const yd = (t) => sec(t).top, zt = (t) => lerp(-L / 2, L / 2, t);
  // stern castle (two decks) and bow house
  box(10, 3.2, 9, 0, yd(0.12) - 0.2, zt(0.1), '#b8302a'); box(8.6, 2.6, 7, 0, yd(0.12) + 3.0, zt(0.09), '#e8e2d0');
  for (const x of [-2.6, 0, 2.6]) box(1.4, 1.2, 0.3, x, yd(0.12) + 3.6, zt(0.09) - 3.6, '#2a1a12', 0.25);
  vnRoof(11, 9.6, 2.2, 0, yd(0.12) + 5.6, zt(0.09), '#3a3434', { curl: 0.5, ridge: '#2a2424' });
  box(8, 2.2, 5, 0, yd(0.88) - 0.2, zt(0.86), '#b8302a');
  // rudder, bowsprit
  box(0.6, 7, 3, 0, -1, zt(0) - 1.2, '#3a2a1e');
  rod([0, yd(1) - 0.5, zt(1)], [0, yd(1) + 4.5, zt(1) + 9], 0.35, 0.22, 5, '#4a3424');
  sail(6, 4.5, 0, yd(1) + 1.0, zt(1) + 6, 0, 0.8, '#e8dcc0', 0, 0);
  // masts and junk sails (with battens)
  for (const [t, h, sw, sh, ry] of [[0.52, 30, 15, 20, 0.35], [0.76, 23, 11, 15, 0.45], [0.2, 18, 8, 10, 0.3]]) {
    const z = zt(t), y0 = yd(t) - 0.5;
    rod([0, y0, z], [0, y0 + h, z], 0.55, 0.3, 6, '#5a4028');
    const sy = y0 + h - sh - 2.5;
    sail(sw, sh, 0, sy, z - 0.6, ry, 0.6, '#d8c49a', 0, 0.15);
    for (let k = 0; k <= 5; k++) { const yy = sy + (k / 5) * sh, ww = sw * (1 - 0.15 * (k / 5)); rbox(ww + 0.4, 0.22, 0.45, 0, yy, z - 0.6, ry, '#4a3424'); }
    flag(0, y0 + h - 0.4, z, 5, 0.9, '#d83a2a', 0.15, -1);
  }
  flag(0, yd(0) + 6, zt(0) + 0.5, 2.6, 5.2, '#e8e2d0', 0.1, -1);
  rod([0, yd(0) + 5, zt(0) + 0.5], [0, yd(0) + 12, zt(0) + 0.5], 0.15, 0.12, 4, '#4a3424');
  lantern(0, yd(0) + 7.2, zt(0) - 0.8, '#f2b832', 1.3);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-7, 7, -2, 10, -L / 2, L / 2 + 6), B(-7, 7, 10, 38, -14, 16)] };
}

// VOC merchantman (fluyt / East Indiaman, 1600s) at Phố Hiến: three masts, square sails, high stern.
function galleon() {
  const L = 54;
  const sec = (t) => ({ w: pl(t, [[0, 5.6], [0.15, 7.0], [0.5, 7.6], [0.8, 6.6], [0.95, 3.2], [1, 0.8]]), top: pl(t, [[0, 15.5], [0.16, 14], [0.22, 9.8], [0.68, 8.2], [0.86, 9.6], [1, 10.6]]), bot: pl(t, [[0, 1.5], [0.08, -2.6], [0.5, -3.2], [0.92, -2], [1, 2.2]]) });
  const dark = '#3a2a1e', wood = '#4e3424', ochre = '#c8963a';
  hull(L, sec, [[0, 0.42, dark], [0.42, 0.78, wood], [0.78, 0.86, ochre], [0.86, 1, '#2e5a3a']], '#7a6048');
  const yd = (t) => sec(t).top, zt = (t) => lerp(-L / 2, L / 2, t);
  // gun ports
  for (let k = 0; k < 8; k++) for (const s of [-1, 1]) box(0.3, 0.9, 1.0, s * 7.35, 4.6, zt(0.24 + k * 0.075), '#1e1410');
  // stern: gallery windows, carved trim, big lantern
  const zs = zt(0) - 0.2;
  for (const y of [8.5, 11.6]) for (const x of [-3.4, -1.1, 1.1, 3.4]) box(1.4, 1.6, 0.3, x, y, zs, '#ffd890', 0.45);
  box(11, 0.6, 0.5, 0, 10.6, zs, ochre); box(9, 0.6, 0.5, 0, 13.8, zs, ochre);
  sph(0.9, 0, yd(0) + 2.2, zs + 1, '#ffcf70', 0.8, 1.3, 8, 6);
  rod([0, yd(0), zs + 1], [0, yd(0) + 1.2, zs + 1], 0.15, 0.15, 4, ochre);
  // bowsprit + beakhead
  rod([0, yd(1) - 1.2, zt(1) - 1], [0, yd(1) + 6, zt(1) + 14], 0.45, 0.25, 6, wood);
  beam([0, 5, zt(1) - 1], [0, 6.5, zt(1) + 4], 1.0, ochre, 0, 1.2);
  sail(9, 4.5, 0, yd(1) + 1.5, zt(1) + 9, 0, 0.9, '#ece2c8');
  // masts with square sails, mizzen lateen
  const masts = [[0.74, 34, 17, 0.8], [0.47, 40, 20, 1.0], [0.2, 27, 0, 0]];
  for (const [t, h, sw] of masts) {
    const z = zt(t), y0 = yd(t) - 1;
    rod([0, y0, z], [0, y0 + h, z], 0.75, 0.35, 6, '#5a4030');
    if (sw) {
      for (const [yy, ww, hh] of [[y0 + h * 0.3, sw, h * 0.3], [y0 + h * 0.64, sw * 0.78, h * 0.27]]) {
        rod([-ww / 2 - 1, yy + hh, z + 0.4], [ww / 2 + 1, yy + hh, z + 0.4], 0.3, 0.3, 4, '#3a2a1e');
        sail(ww, hh, 0, yy, z + 0.6, 0, 1.6, '#ece2c8', 0, 0.12);
      }
      box(3.2, 0.5, 3.2, 0, y0 + h * 0.6, z, '#3a2a1e');   // fighting top
      for (const s of [-1, 1]) for (const dz of [-1.6, 0, 1.6]) beam([s * 7.4, yd(t) + 0.3, z + dz], [0, y0 + h * 0.6, z], 0.12, '#2a2018');
    } else {
      rod([0, y0 + 6, z + 8], [0, y0 + 24, z - 9], 0.3, 0.2, 4, '#3a2a1e');
      panel([[8, 0], [-9, 18], [-9, 0.5]], 0.25, '#e6dcc2', 0, HP, 0, y0 + 6.3, z);
    }
  }
  // Prinsenvlag ensign (orange-white-blue) and pennant
  for (const [k, col] of [[0, '#2a4a9a'], [1, '#f0ece0'], [2, '#e8822a']]) flag(0, yd(0) + 3.2 + k * 1.2, zs - 0.4, 5.4, 1.2, col, 0.1, 1, HP);
  rod([0, yd(0), zs - 0.4], [0, yd(0) + 7.4, zs - 0.4], 0.12, 0.1, 4, '#3a2a1e');
  for (const [k, col] of [[0, '#2a4a9a'], [1, '#f0ece0'], [2, '#e8822a']]) flag(0, yd(0.47) + 37.6 + k * 0.5, zt(0.47), 9, 0.5, col, 0.1, 1, HP);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-8, 8, -3, 16, -L / 2, L / 2 + 10), B(-11, 11, 16, 50, -12, 26)] };
}

// Văn Miếu Xích Đằng (Phố Hiến): two-storey bell and drum gate (gác chuông, gác trống), stele houses, halls.
function xichdang(o = {}) {
  const r = mulberry32(o.seed ?? 1697);
  const tile = '#6e3a2a', ridge = '#4a2a1e', wood = '#8a2e1e', plaster = '#d8ccb0', brick = '#a8664a';
  box(64, 0.3, 76, 0, 0, -6, '#a07258');
  // enclosure wall
  for (const [x, z, w, d] of [[-31, -6, 1.2, 76], [31, -6, 1.2, 76], [0, -44, 64, 1.2], [-21, 32, 22, 1.2], [21, 32, 22, 1.2]]) { box(w, 2.8, d, x, 0, z, plaster); box(w + 0.6, 0.4, d + 0.6, x, 2.8, z, tile); }
  // gate tower: masonry lower storey with three arched doors, timber upper storey with bell and drum
  archWall(-10, 10, 8, 7, [{ cx: 0, a: 2.4, hs: 4, rise: 2.4 }, { cx: -6, a: 1.6, hs: 3, rise: 1.6 }, { cx: 6, a: 1.6, hs: 3, rise: 1.6 }], 32, plaster);
  vnRoof(26, 12, 3.2, 0, 8, 32, tile, { curl: 0.6, ridge, ornament: false });
  box(12, 6, 6, 0, 9.4, 32, plaster);
  for (const x of [-5.6, -1.9, 1.9, 5.6]) for (const z of [29.6, 34.4]) cyl(0.32, 0.32, 5.6, 6, x, 9.6, z, wood);
  box(2.6, 3.4, 0.3, -3.2, 10.6, 35.1, '#2a1a12'); box(2.6, 3.4, 0.3, 3.2, 10.6, 35.1, '#2a1a12');
  lathe([[0, 0], [1.2, 0], [1.1, 0.6], [0.9, 1.8], [0.5, 2.2], [0, 2.3]], 10, -3.2, 11.2, 35.3, '#6a5a3a');
  C(new THREE.CylinderGeometry(1.2, 1.2, 1.2, 12).rotateZ(HP).translate(3.2, 12.4, 35.3), '#a83a2a');
  vnRoof(18, 10, 4.4, 0, 15.2, 32, tile, { curl: 0.65, ridge });
  // courtyard: stele houses (văn chỉ) on both sides, frangipani trees
  for (const sx of [-1, 1]) {
    vhall(sx * 20, 0, 6, 8, 26, 4.6, { open: true, rail: false, col: wood, roof: tile, ridge, baseH: 0.6, rh: 2.8, bays: 2, over: 3, orn: false });
    for (let k = 0; k < 5; k++) { box(0.5, 2.6, 1.8, sx * 20, 0.6, -4 + k * 5, '#7d8288'); box(0.6, 0.4, 2.0, sx * 20, 3.2, -4 + k * 5, '#7d8288'); }
    tree(sx * 10, 16, 1.2, 'round', r);
  }
  // Đại bái and Hậu cung
  vhall(0, 0, -14, 30, 12, 5.4, { col: wood, wall: '#8a3a26', roof: tile, ridge, base: '#a8a294', baseH: 1.0, rh: 4.2, bays: 5 });
  vhall(0, 0, -32, 20, 10, 5, { col: wood, wall: '#8a3a26', roof: tile, ridge, base: '#a8a294', baseH: 1.2, rh: 3.8, bays: 3 });
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// ================================================================ ERA 9 · TÂY SƠN
// Cham brick tower pieces: pilastered body with doors (front = +z), Garuda caryatids.
function garuda(x, y, z, s, col, ry = 0) {
  const p = (lx, ly, lz) => { const [a, b] = rot(lx * s, lz * s, ry); return [x + a, y + ly * s, z + b]; };
  rbox(1.4 * s, 2.0 * s, 1.0 * s, ...p(0, 0.8, 0), ry, col);
  ell(0.6 * s, 0.7 * s, 0.6 * s, ...p(0, 3.3, 0.1), col, 0, 6, 4);
  rod(p(0, 3.2, 0.4), p(0, 3.0, 1.3), 0.3 * s, 0.05 * s, 4, shade(col, 0.85));          // beak
  for (const sx of [-1, 1]) {
    rod(p(sx * 0.6, 2.6, 0), p(sx * 2.6, 4.4, -0.2), 0.45 * s, 0.15 * s, 4, shade(col, 0.9));   // wings / raised arms
    rod(p(sx * 0.5, 0.9, 0.2), p(sx * 0.9, 0, 0.9), 0.35 * s, 0.25 * s, 4, col);                // bent legs
  }
}
function chamBody(x, y, z, W, H, col, colD, s = 1) {
  box(W, H, W, x, y, z, col);
  for (let f = 0; f < 4; f++) {
    const ry = (f * PI) / 2;
    for (const u of [-0.42, -0.24, 0.24, 0.42]) { const [a, b] = rot(u * W, W / 2 + 0.2, ry); rbox(W * 0.07, H * 0.94, 0.6, x + a, y + H * 0.03, z + b, ry, colD); }
    // portico (true door on +z, false doors elsewhere) with a flame-shaped pointed arch
    const pw = W * 0.34, ph = H * 0.62, [a, b] = rot(0, W / 2 + 0.6, ry);
    rbox(pw, ph, 1.4, x + a, y, z + b, ry, col);
    const [a2, b2] = rot(0, W / 2 + 0.7, ry);
    panel([[-pw * 0.62, 0], [pw * 0.62, 0], [pw * 0.5, ph * 0.22], [0, ph * 0.52], [-pw * 0.5, ph * 0.22]], 1.6, colD, 0, ry, x + a2, y + ph, z + b2);
    const [a3, b3] = rot(0, W / 2 + 1.42, ry);
    rbox(pw * 0.5, ph * 0.82, 0.12, x + a3, y + 0.2, z + b3, ry, f === 0 ? '#2a140c' : shade(colD, 0.85), f === 0 ? 0.05 : 0);
  }
  box(W + 1.6, H * 0.06 + 0.4, W + 1.6, x, y + H, z, colD);
  box(W + 0.8, H * 0.05 + 0.3, W + 0.8, x, y + H + H * 0.06 + 0.4, z, col);
}
// Tháp Đôi: two 12th-century Cham towers with curved Khmer-influenced roofs and Garuda at the corners.
function thapdoi() {
  const brick = '#a5533a', brickD = '#8e4632', brickL = '#b8664a', grass = '#6f8f4a';
  ell(50, 6, 34, 0, -2.5, 0, grass, 0, 14, 6);
  const towers = [[-15, 15, 45], [15, 13, 40]];
  for (const [x, W, Ht] of towers) {
    const y0 = 2.8;
    box(W + 6, 1.6, W + 6, x, y0 - 1.2, 0, brickD); box(W + 3.5, 1.4, W + 3.5, x, y0 + 0.4, 0, brick);
    const H = Ht * 0.42, yb = y0 + 1.8;
    chamBody(x, yb, 0, W, H, brick, brickD);
    // curved pyramidal roof of receding tiers
    const yr = yb + H + H * 0.11 + 0.7, Hr = Ht - (yr - 0) - 2.6, n = 9;
    let yy = yr;
    for (let k = 0; k < n; k++) {   // bell-shaped (convex) curved pyramid
      const t0 = k / n, t1 = (k + 1) / n, w0 = W * 0.94 * Math.pow(Math.cos(t0 * HP), 0.7), w1 = W * 0.94 * Math.pow(Math.cos(t1 * HP), 0.7), h = Hr / n;
      C(new THREE.CylinderGeometry(Math.max(0.4, w1) * 0.707, w0 * 0.707, h * 0.86, 4, 1).rotateY(PI / 4).translate(x, yy + h * 0.43, 0), k % 2 ? brick : brickL);
      box(w1 + 0.5, h * 0.14, w1 + 0.5, x, yy + h * 0.86, 0, brickD);
      if (k > 0 && k < 5) for (const sx of [-1, 1]) for (const sz of [-1, 1]) cone(0.25 + w1 * 0.04, h * 1.1, 4, x + sx * w1 * 0.47, yy + h, sz * w1 * 0.47, brickD);
      yy += h;
    }
    sph(1.2, x, yy + 0.6, 0, brickL, 0, 1.2, 6, 5); cone(0.6, 2.2, 6, x, yy + 1.4, 0, brickD);
    // Garuda at the corners of the body cornice and the first roof tier
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      garuda(x + sx * (W / 2 + 0.2), yb + H + 1.0, sz * (W / 2 + 0.2), 1.25, '#9a5a42', Math.atan2(sx, sz));
      garuda(x + sx * W * 0.42, yr + Hr / n + 0.2, sz * W * 0.42, 0.8, '#9a5a42', Math.atan2(sx, sz));
    }
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(-15, 0, 11.5, 0, 46), Cy(15, 0, 10, 0, 41)] };
}

// Tháp Cánh Tiên ("Bronze tower"): slender Cham tower with receding tiers and corner finials, in the Hoàng Đế citadel.
function canhtien(o = {}) {
  const r = mulberry32(o.seed ?? 1776);
  const brick = '#a65838', brickD = '#8a4630', brickL = '#b86a48', laterite = '#9a5a3c';
  box(70, 0.3, 70, 0, 0, 0, '#7a8a52');
  for (const [x, z, w, d] of [[-30, -10, 3, 40], [24, -26, 26, 3]]) box(w, 2.4 + r(), d, x, 0, z, laterite);   // citadel wall fragments
  const W = 12.5, y0 = 0.3;
  box(W + 5, 1.4, W + 5, 0, y0, 0, brickD); box(W + 2.6, 1.2, W + 2.6, 0, y0 + 1.4, 0, brick);
  const H = 20, yb = y0 + 2.6;
  chamBody(0, yb, 0, W, H, brick, brickD);
  let yy = yb + H + H * 0.11 + 0.7, w = W * 0.82;
  for (const [h, f] of [[6.8, 0.8], [5.6, 0.8], [4.6, 0.78]]) {
    box(w, h, w, 0, yy, 0, brick);
    for (let k = 0; k < 4; k++) { const ry = (k * PI) / 2, [a, b] = rot(0, w / 2 + 0.3, ry); rbox(w * 0.3, h * 0.7, 0.6, a, yy, b, ry, brickD); }
    box(w + 1.2, 0.8, w + 1.2, 0, yy + h, 0, brickD);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {   // corner miniature towers / finials
      const cx = sx * (w / 2 + 0.2), cz = sz * (w / 2 + 0.2), s = h / 6.8;
      box(1.9 * s, 2.2 * s, 1.9 * s, cx, yy + h + 0.8, cz, brickL); box(1.4 * s, 1.0 * s, 1.4 * s, cx, yy + h + 0.8 + 2.2 * s, cz, brick);
      cone(0.8 * s, 1.6 * s, 4, cx, yy + h + 0.8 + 3.2 * s, cz, brickD);
    }
    yy += h + 0.8; w *= f;
  }
  box(w, 2.2, w, 0, yy, 0, brickL); sph(w * 0.42, 0, yy + 3.2, 0, brick, 0, 1.25, 8, 6); cone(0.7, 2.4, 6, 0, yy + 4.6, 0, brickD);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, 9.5, 0, yy + 7)] };
}

// Hoàng Đế citadel gate (Tây Sơn capital): laterite and brick piers, timber gate tower, red banners.
function hoangde(o = {}) {
  const len = o.len ?? 450, r = mulberry32(o.seed ?? 1776);
  const lat = ['#a65e3c', '#9a5636', '#b06a46', '#8e5034', '#a86040'], latC = '#8a5034', brickC = '#9a4a32', red = '#c8201a';
  const GX = 17, PX = 36, GH = 20, PH = 25, PD = 26, WH = 15, WD = 12;
  for (const sx of [-1, 1]) {
    const xa = sx * GX, xb = sx * PX, xc = (xa + xb) / 2;
    box(PX - GX, PH, PD, xc, 0, 0, latC);
    for (const d of [1, -1]) ashlar(Math.min(xa, xb), Math.max(xa, xb), 0, PH, (d * PD) / 2, d, 2.4, 2.6, 5, lat, r);
    box(PX - GX + 1.2, 1.0, PD + 1.2, xc, PH, 0, brickC);
    for (let k = 0; k < 4; k++) box(2.2, 1.6, 1.6, xc + (k - 1.5) * 4.4, PH + 1, PD / 2 - 0.6, brickC);   // merlons
  }
  // lintel deck and the timber gate tower
  box(2 * GX + 2, PH - GH, PD - 4, 0, GH, 0, '#5a3420');
  for (let k = -3; k <= 3; k++) box(2 * GX + 2, 0.6, 0.6, 0, GH - 0.6, k * 3.4, '#4a2a18');
  box(2 * PX, 1, PD - 2, 0, PH, 0, '#6a3c26');
  const top = vhall(0, PH + 1, 0, 40, 16, 7, { open: true, col: '#7a2a1a', roof: '#7a4030', ridge: '#4a2a1e', baseH: 0, tiers: 2, rh: 5.5, rh2: 5, s2: 0.6, s2d: 0.7, h2: 4, bays: 6, curl: 0.6, railCol: '#5a2414' });
  // walls
  for (const sx of [-1, 1]) {
    const xa = sx > 0 ? PX : -len, xb = sx > 0 ? len : -PX;
    box(xb - xa, WH, WD, (xa + xb) / 2, 0, 0, latC);
    ashlar(xa, xb, 0, WH, WD / 2, 1, 2.6, 7, 15, lat, r);
    box(xb - xa, 0.8, WD + 1, (xa + xb) / 2, WH, 0, brickC);
    for (let x = PX + 30; x < len; x += 60) {
      const X = sx * x;
      rod([X, WH, 4], [X, WH + 13, 4], 0.22, 0.18, 5, '#4a2a1a');
      flag(X, WH + 8.6, 4, 6, 4, red, 0.15, -sx);
    }
  }
  // banners on the gate
  for (const sx of [-1, 1]) for (const z of [-11, 11]) { rod([sx * 30, PH, z], [sx * 30, PH + 18, z], 0.28, 0.2, 5, '#4a2a1a'); flag(sx * 30, PH + 11.5, z, 7.5, 5.5, red, 0.15, sx); }
  rod([0, top, 0], [0, top + 8, 0], 0.25, 0.2, 5, '#4a2a1a'); flag(0, top + 3.5, 0, 6, 4.4, red, 0.15, 1);
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [B(-PX, -GX, 0, PH + 3, -PD / 2, PD / 2), B(GX, PX, 0, PH + 3, -PD / 2, PD / 2), B(-GX, GX, GH, PH + 1, -PD / 2 + 2, PD / 2 - 2), B(-23, 23, PH + 1, top + 1, -10, 10), B(-len, -PX, 0, WH + 1, -WD / 2, WD / 2), B(PX, len, 0, WH + 1, -WD / 2, WD / 2)],
    gates: [{ x0: -GX, x1: GX, y0: 0, y1: GH, label: 'CỔNG HOÀNG ĐẾ THÀNH', bonus: 1800 }],
  };
}

// Tây Sơn war elephants: three armoured elephants with howdahs, riders and red banners on a stone base.
function elephant(x, y, z, s, ry) {
  const grey = '#7a7470', greyD = '#625c58', red = '#b8261c', gold = '#d8a838';
  const p = (lx, ly, lz) => { const [a, b] = rot(lx * s, lz * s, ry); return [x + a, y + ly * s, z + b]; };
  for (const [lx, lz] of [[-1.4, 2.2], [1.4, 2.2], [-1.4, -2.2], [1.4, -2.2]]) rod(p(lx, 0, lz), p(lx, 4.6, lz * 0.95), 0.72 * s, 0.9 * s, 6, greyD);
  ell(2.5 * s, 2.5 * s, 3.8 * s, ...p(0, 5.8, 0), grey, 0, 10, 7, ry);
  ell(1.8 * s, 2.0 * s, 1.7 * s, ...p(0, 6.8, 3.9), grey, 0, 8, 6, ry);
  for (const sx of [-1, 1]) ell(0.3 * s, 2.2 * s, 1.9 * s, ...p(sx * 2.0, 6.5, 3.0), greyD, 0, 6, 4, ry + sx * 0.5);
  const tr = [p(0, 6.2, 5.2), p(0, 4.8, 6.0), p(0, 4.2, 7.0), p(0, 4.8, 7.9), p(0, 6.0, 8.3)];
  for (let i = 0; i < 4; i++) rod(tr[i], tr[i + 1], (0.75 - i * 0.12) * s, (0.63 - i * 0.12) * s, 6, grey);
  for (const sx of [-1, 1]) rod(p(sx * 0.8, 5.4, 5.0), p(sx * 1.0, 5.6, 7.4), 0.28 * s, 0.08 * s, 5, '#f0ead8');
  rod(p(0, 5.8, -3.8), p(0, 3.6, -4.4), 0.2 * s, 0.1 * s, 4, greyD);
  // armour and caparison
  rbox(5.0 * s, 1.0 * s, 5.0 * s, ...p(0, 7.4, -0.3), ry, red);                 // saddle cloth
  for (const sx of [-1, 1]) { rbox(0.2 * s, 2.0 * s, 4.2 * s, ...p(sx * 2.45, 5.8, -0.3), ry, red); rbox(0.25 * s, 0.35 * s, 4.3 * s, ...p(sx * 2.47, 5.6, -0.3), ry, gold, 0.15); }
  rbox(1.6 * s, 1.4 * s, 0.4 * s, ...p(0, 7.0, 5.35), ry, gold, 0.15);          // forehead plate
  // howdah with a soldier, mahout on the neck, banner
  rbox(3.0 * s, 1.5 * s, 3.0 * s, ...p(0, 8.4, -0.6), ry, '#6a3a20');
  rbox(3.2 * s, 0.3 * s, 3.2 * s, ...p(0, 9.9, -0.6), ry, gold, 0.1);
  person(...p(0, 9.0, -0.6), red, '#2a2420', 1.1 * s, ry);
  rod(p(0.6, 9.8, -0.4), p(0.9, 14.5, 1.4), 0.08 * s, 0.06 * s, 4, '#5a4a3a');
  person(...p(0, 8.4, 2.9), '#3a3430', '#2a2420', 0.9 * s, ry);
  rod(p(-1.2, 8.4, -1.8), p(-1.2, 17.5, -1.8), 0.12 * s, 0.1 * s, 5, '#4a2a1a');
  const [fx, fz] = rot(-1.2 * s, -1.8 * s, ry);
  flag(x + fx, y + 13.7 * s, z + fz, 4.6 * s, 3.4 * s, red, 0.15, 1, ry);
}
function voichien() {
  const stone = '#8e8a7e';
  box(44, 2.2, 18, 0, 0, 0, stone); box(46, 0.6, 20, 0, 2.2, 0, shade(stone, 1.1));
  for (const [x, z, ry] of [[-14.5, -1.5, -0.12], [0, 1.5, 0], [14.5, -1.5, 0.12]]) elephant(x, 2.8, z, 1.2, ry);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-23, 23, 0, 3, -10, 10), B(-21, 21, 3, 24, -8, 10)] };
}

// Gò Đống Đa: the burial mound of Spring 1789 with a stone stele pavilion and peach blossoms (Tết).
function dongda(o = {}) {
  const r = mulberry32(o.seed ?? 1789);
  const grass = '#6a8a46', stone = '#9a988a', tile = '#6e4a3a';
  const R = 40, RZ = 34, RH = 17, cy = -2;
  ell(R, RH, RZ, 0, cy, 0, grass, 0, 16, 8);
  const hy = (x, z) => cy + RH * Math.sqrt(Math.max(0, 1 - (x / R) ** 2 - (z / RZ) ** 2));
  // stone stair up the front
  const n = 14, z0 = 33, z1 = 8;
  for (let k = 0; k < n; k++) { const z = lerp(z0, z1, (k + 0.5) / n), y = hy(0, z); box(6, Math.max(0.5, y + 0.4), (z0 - z1) / n + 0.05, 0, 0, z, k % 2 ? stone : shade(stone, 0.94)); }
  // stele pavilion on top
  const yt = hy(0, 0) - 0.6;
  box(14, 1.2, 14, 0, yt, 0, stone);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(1.2, 6, 1.2, sx * 4.6, yt + 1.2, sz * 4.6, '#a8a698');
  box(11, 1.0, 11, 0, yt + 7.2, 0, '#a8a698');
  vnRoof(14, 14, 4.4, 0, yt + 8.2, 0, tile, { curl: 0.6, ridge: '#4a2e22' });
  box(3.4, 4.4, 0.7, 0, yt + 1.2, 0, '#7d8288'); box(3.8, 0.8, 1.0, 0, yt + 5.6, 0, '#7d8288');
  box(4.6, 0.8, 1.6, 0, yt + 1.2, 0, '#6e7278');
  cyl(0.5, 0.6, 1.0, 8, 0, yt + 1.2, 2.6, '#8a6a3a');   // incense bowl
  // peach trees around the mound
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * PI * 2 + 0.2, rr = 0.92 + r() * 0.3;
    const x = Math.cos(a) * R * rr, z = Math.sin(a) * RZ * rr;
    if (Math.abs(x) < 7 && z > 0) continue;
    tree(x, z, 1.2 + r() * 0.5, 'peach', r, Math.max(0, hy(x, z)) - 0.3);
  }
  for (let k = 0; k < 6; k++) { const a = r() * PI * 2, rr = 0.45 + r() * 0.25, x = Math.cos(a) * R * rr, z = Math.sin(a) * RZ * rr; if (Math.abs(x) > 8) tree(x, z, 1.0 + r() * 0.4, 'peach', r, hy(x, z) - 0.4); }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [], emitters: [{ kind: 'smoke', x: 0, y: yt + 2.6, z: 2.6, w: 0.5, rate: 0.06 }] };
}

// ================================================================ ERA 10 · NGUYỄN — HUẾ
const YEL = '#e2b42c', YELD = '#b88a1c', GRN = '#3d8a50', GRND = '#2a6a3c', LACQ = '#a8221a';
// Kinh Thành Huế: Vauban-style brick rampart with bastions and moat; Cửa Thượng Tứ with its vọng lâu.
function kinhthanh(o = {}) {
  const len = o.len ?? 500, r = mulberry32(o.seed ?? 1805);
  const brick = '#7a7266', brickD = '#5e584e', bricks = ['#7a7266', '#736b60', '#81796c', '#6c665c'], moss = '#5a6450';
  const GX = 32, GH = 22, GD = 26, WH = 14, WD = 18;
  const op = { cx: 0, a: 15, hs: 8, rise: 10 };
  archWall(-GX, GX, GH, GD, [op], 0, brick);
  for (const d of [1, -1]) {
    ashlar(-GX, GX, 0, GH, (d * GD) / 2, d, 2.0, 3, 6, bricks, r, [op], 1.4);
    const pts = []; for (let k = 0; k <= 12; k++) { const th = PI - (k * PI) / 12; pts.push([op.a * Math.cos(th), op.hs + op.rise * Math.sin(th)]); }
    for (let k = 0; k < 12; k++) beam([pts[k][0] * 1.06, pts[k][1] + 0.6, (d * GD) / 2 + d * 0.5], [pts[k + 1][0] * 1.06, pts[k + 1][1] + 0.6, (d * GD) / 2 + d * 0.5], 1.2, '#9a9284', 0, 1.2);
  }
  box(10, 3, 0.6, 0, GH - 3.6, GD / 2 + 0.7, '#1e3a6a', 0.1); box(8, 1.6, 0.65, 0, GH - 2.9, GD / 2 + 0.72, YEL, 0.35);   // plaque
  box(2 * GX + 1, 1.0, GD + 1, 0, GH, 0, brickD);
  for (let k = -7; k <= 7; k++) for (const d of [1, -1]) box(2.6, 1.4, 1.0, k * 4.3, GH + 1, d * (GD / 2), brickD);
  // vọng lâu: two storeys, green-glazed lower roof, yellow-glazed upper roof
  const yv = GH + 1;
  box(36, 0.8, 18, 0, yv, 0, '#8a7a68');
  for (const x of [-15, -9, -3, 3, 9, 15]) for (const z of [-7, 7]) cyl(0.45, 0.5, 6.5, 6, x, yv + 0.8, z, LACQ);
  box(28, 5.5, 11, 0, yv + 0.8, 0, '#8a3a26');
  vnRoof(38, 20, 5, 0, yv + 7.3, 0, GRN, { curl: 0.6, ridge: YEL, sag: 0.1 });
  box(20, 5, 10, 0, yv + 9.5, 0, '#8a3a26');
  for (const x of [-9, -3, 3, 9]) for (const z of [-4.6, 4.6]) cyl(0.35, 0.35, 5, 6, x, yv + 9.5, z, LACQ);
  vnRoof(27, 16, 6, 0, yv + 14.5, 0, YEL, { curl: 0.65, ridge: YELD, sag: 0.1 });
  sph(0.9, 0, yv + 21, 0, YEL, 0.3, 1.3, 8, 6);
  // walls, parapet with embrasures, bastions
  for (const sx of [-1, 1]) {
    const xa = sx > 0 ? GX : -len, xb = sx > 0 ? len : -GX, xm = (xa + xb) / 2, L = xb - xa;
    box(L, WH, WD, xm, 0, 0, brick);
    ashlar(xa, xb, 0, WH, WD / 2, 1, 2.8, 8, 16, bricks, r);
    box(L, 2.2, 1.6, xm, WH, WD / 2 - 0.8, brickD);
    for (let x = Math.min(Math.abs(xa), Math.abs(xb)) + 4; x < len; x += 9) box(2.4, 1.0, 1.7, sx * x, WH + 1.4, WD / 2 - 0.8, brick);
    box(L, 0.3, WD - 2, xm, WH, -1, moss);
    wedgeX(xa, xb, [[-WD / 2, 0], [-WD / 2, WH], [-WD / 2 - 24, 0]], '#6a7a48');
    const bx = sx * 250;
    slab([[bx - 30, 9], [bx - 34, 28], [bx, 46], [bx + 34, 28], [bx + 30, 9]], WH, 0, brick);
    slab([[bx - 31, 9], [bx - 35, 28.4], [bx, 47.2], [bx + 35, 28.4], [bx + 31, 9]], 1.6, WH, brickD);
  }
  // moat (Hộ Thành Hào) and the bridge to the gate
  box(2 * len + 60, 0.5, 30, 0, -0.32, 66, '#3a6268');
  box(32, 1.2, 36, 0, -0.4, 66, '#8a8478');
  for (const sx of [-1, 1]) box(1, 1.2, 36, sx * 15.5, 0.8, 66, '#9a9284');
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [
      B(-GX, -15, 0, GH + 2.4, -GD / 2, GD / 2), B(15, GX, 0, GH + 2.4, -GD / 2, GD / 2), B(-15, 15, 18, GH + 2.4, -GD / 2, GD / 2),
      B(-15, -11, 14, 18, -GD / 2, GD / 2), B(11, 15, 14, 18, -GD / 2, GD / 2),
      B(-18, 18, GH + 2.4, GH + 21, -9.5, 9.5),
      B(-len, -GX, 0, WH + 2.4, -WD / 2, WD / 2), B(GX, len, 0, WH + 2.4, -WD / 2, WD / 2),
      B(-284, -216, 0, WH + 1.6, 9, 47), B(216, 284, 0, WH + 1.6, 9, 47),
    ],
    gates: [{ x0: -15, x1: 15, y0: 0, y1: 18, label: 'CỬA THƯỢNG TỨ', bonus: 2000 }],
  };
}

// Kỳ Đài: three brick terraces and the flagpole with the plain yellow imperial banner.
function kydai() {
  const brick = '#7a7266', brickD = '#5e584e', brickL = '#8a8274';
  const lv = [[62, 7.5], [48, 6.5], [36, 6]];
  let y = 0;
  for (const [w, h] of lv) {
    box(w, h, w, 0, y, 0, brick);
    for (let k = 1; k < 3; k++) box(w + 0.2, 0.25, w + 0.2, 0, y + (h * k) / 3, 0, brickD);
    y += h;
    box(w + 0.6, 0.6, w + 0.6, 0, y - 0.6, 0, brickL);
    for (const [px, pz, pw, pd] of [[0, w / 2 - 0.5, w, 1], [0, -w / 2 + 0.5, w, 1], [w / 2 - 0.5, 0, 1, w], [-w / 2 + 0.5, 0, 1, w]]) box(pw, 1.3, pd, px, y, pz, brickL);
    for (let k = -3; k <= 3; k++) box(1.4, 0.6, 1.3, k * (w / 8), y + 1.3, w / 2 - 0.5, brickD);
  }
  stairs(0, 0, 7.5, 40, 10, 8, 1.1, '#8a8274');
  box(6, 3, 0.4, 0, 1.5, 31.2, '#2a2420');   // tunnel door
  box(4, 1, 4, 0, y, 0, brickD);
  rod([0, y, 0], [0, 60, 0], 0.9, 0.35, 8, '#d8d0c0');
  for (const yy of [y + 1, 38]) torus(1.0, 0.25, 0, yy, 0, '#b89a4a');
  sph(0.6, 0, 60.4, 0, YEL, 0.4, 1, 8, 6);
  flag(0.4, 46, 0, 14, 9.5, '#f2c418', 0.18, 1);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-31, 31, 0, y + 1.5, -31, 31), Cy(0, 0, 1.4, y, 61), B(0, 15, 45.5, 56, -2.5, 2.5)] };
}

// Ngọ Môn: U-shaped stone base with five doorways and the Lầu Ngũ Phụng (nine roofs, yellow and green).
function ngomon(o = {}) {
  const r = mulberry32(o.seed ?? 1833);
  const stone = '#77746a', stones = ['#77746a', '#6f6c62', '#7e7b70', '#716e64', '#83806f'], trim = '#9a968a';
  const BH = 20, BX = 62, WX = 86, BD = 15, WZ = 48;
  const ops = [{ cx: 0, a: 15, hs: 16, rise: 0 }, { cx: -34, a: 5, hs: 11, rise: 0 }, { cx: 34, a: 5, hs: 11, rise: 0 }];
  archWall(-BX, BX, BH, 2 * BD, ops, 0, stone);
  for (const d of [1, -1]) ashlar(-BX, BX, 0, BH, d * BD, d, 2.2, 4, 8, stones, r, ops);
  for (const op of ops) for (const d of [1, -1]) {
    box(op.a * 2 + 2.4, 1.2, 1.2, op.cx, op.hs, d * (BD + 0.4), trim);
    for (const sx of [-1, 1]) box(1.2, op.hs, 1.2, op.cx + sx * (op.a + 0.6), 0, d * (BD + 0.4), trim);
  }
  for (const sx of [-1, 1]) {
    const xc = (sx * (BX + WX)) / 2;
    box(WX - BX, BH, WZ + BD, xc, 0, (WZ - BD) / 2, stone);
    ashlar(Math.min(sx * BX, sx * WX), Math.max(sx * BX, sx * WX), 0, BH, WZ, 1, 2.2, 4, 8, stones, r);
    box(10, 11, 1.2, xc, 0, WZ + 0.2, '#2a2620');   // Dịch môn
    box(WX - BX + 1, 1.2, WZ + BD + 1, xc, BH, (WZ - BD) / 2, trim);
  }
  box(2 * BX + 1, 1.2, 2 * BD + 1, 0, BH, 0, trim);
  // parapet
  for (const [x, z, w, d] of [[0, BD, 2 * BX, 0.8], [0, -BD, 2 * WX, 0.8], [-WX, (WZ - BD) / 2, 0.8, WZ + BD], [WX, (WZ - BD) / 2, 0.8, WZ + BD], [-(BX + WX) / 2, WZ, WX - BX, 0.8], [(BX + WX) / 2, WZ, WX - BX, 0.8]]) box(w, 1.4, d, x, BH + 1.2, z, '#a8a294');
  // Lầu Ngũ Phụng
  const y0 = BH + 1.2, wood = '#8a2a1e', panelC = '#c8962e';
  const sect = (x, z, w, d, h, lower, upper, nUp, rh1, rh2) => {
    for (let i = 0; i <= Math.round(w / 4); i++) for (const s of [-1, 1]) cyl(0.4, 0.45, h, 6, x - w / 2 + (i * w) / Math.round(w / 4), y0, z + s * (d / 2 - 0.5), LACQ);
    box(w - 2.4, h, d - 2.4, x, y0, z, wood);
    for (let i = 0; i < Math.round(w / 4); i++) box(2.6, h * 0.55, 0.2, x - w / 2 + 2 + i * 4, y0 + h * 0.2, z + d / 2 - 1.15, panelC, 0.12);
    vnRoof(w + 4, d + 4, rh1, x, y0 + h, z, lower, { curl: 0.6, ridge: lower === YEL ? YELD : GRND, sag: 0.1 });
    if (nUp) {
      box(w * 0.66, 4.6, d * 0.56, x, y0 + h + rh1 * 0.35, z, wood);
      const nu = Math.max(2, Math.round((w * 0.66) / 4.5));
      for (let i = 0; i < nu; i++) box(2.4, 2.2, 0.2, x - w * 0.33 + (w * 0.66 * (i + 0.5)) / nu, y0 + h + rh1 * 0.35 + 1.8, z + d * 0.28 + 0.1, panelC, 0.12);
      vnRoof(w * 0.66 + 4, d * 0.56 + 4, rh2, x, y0 + h + rh1 * 0.35 + 4.6, z, upper, { curl: 0.65, ridge: upper === YEL ? YELD : GRND, sag: 0.1 });
    }
  };
  // centre pavilion: three yellow roofs (lower eave + two upper tiers)
  sect(0, 0, 26, 22, 6.5, YEL, YEL, 1, 5, 6);
  box(10, 3, 7, 0, y0 + 6.5 + 1.75 + 4.6 + 4, 0, wood);
  vnRoof(14, 10, 4, 0, y0 + 6.5 + 1.75 + 4.6 + 6.6, 0, YEL, { curl: 0.7, ridge: YELD });
  sph(0.9, 0, y0 + 6.5 + 1.75 + 4.6 + 11, 0, YEL, 0.35, 1.3, 8, 6);
  for (const sx of [-1, 1]) {
    sect(sx * 31, 0, 30, 22, 6, GRN, GRN, 1, 4.6, 5);      // flanking halls: two green roofs each
    sect(sx * 74, 30, 18, 22, 6, GRN, GRN, 0, 5, 0);       // wing pavilions: one green roof each
    box(16, 6, 16, sx * 74, y0, 8, wood);                  // gallery to the wing
    vnRoof(19, 18, 3.6, sx * 74, y0 + 6, 9, GRN, { curl: 0.4, ridge: GRND, sag: 0.08, ornament: false });
  }
  return {
    parts: [{ geo: take(), mat: 'paint' }],
    colliders: [
      B(-BX, -15, 0, BH + 2.6, -BD, BD), B(15, BX, 0, BH + 2.6, -BD, BD), B(-15, 15, 16, BH + 2.6, -BD, BD),
      B(-WX, -BX, 0, BH + 2.6, -BD, WZ), B(BX, WX, 0, BH + 2.6, -BD, WZ),
      B(-48, 48, BH + 2.6, BH + 26, -13, 13), B(-16, 16, BH + 26, BH + 38, -9, 9),
      B(-WX, -63, BH + 2.6, BH + 14, -3, 43), B(63, WX, BH + 2.6, BH + 14, -3, 43),
    ],
    gates: [{ x0: -15, x1: 15, y0: 0, y1: 16, label: 'NGỌ MÔN', bonus: 2500 }],
  };
}

// Điện Thái Hòa: double-roofed hall (trùng thiềm điệp ốc), yellow glazed tiles, red-lacquered columns
// with gilded dragons, before the Đại Triều Nghi courtyard terraces with rank stones.
function thaihoa() {
  const stone = '#a8a294', stoneD = '#8e897c', gold = '#e0b040';
  // Đại Triều Nghi: two terraces with rank stones (phẩm sơn) either side of the imperial way
  box(110, 1.0, 40, 0, 0, 52, stoneD); box(90, 1.0, 22, 0, 1.0, 38, stone);
  box(12, 1.06, 40, 0, 0, 52, '#b8b2a2'); box(12, 1.06, 22, 0, 1.0, 38, '#c0baa8');
  for (const sx of [-1, 1]) for (let k = 0; k < 9; k++) { const z = k < 5 ? 66 - k * 7 : 46 - (k - 5) * 5.5, yb = k < 5 ? 1 : 2; box(1.2, 1.8, 0.6, sx * 12, yb, z, '#8a8678'); box(1.4, 0.4, 0.8, sx * 12, yb + 1.8, z, '#8a8678'); }
  for (const sx of [-1, 1]) cyl(2.2, 1.6, 2.4, 10, sx * 34, 2, 34, '#6a5a3a');   // bronze vats
  // platform
  box(134, 1.6, 66, 0, 0, -4, stoneD); box(128, 1.6, 60, 0, 1.6, -4, stone);
  stairs(0, 0, 3.2, 27, 30, 4, 1.0, '#b8b2a2');
  const y0 = 3.2;
  // front hall (tiền điện) and main hall (chính điện), roofs joined by a gutter
  for (const [z, d, h, rh, w] of [[16, 16, 8.5, 6.5, 112], [-12, 32, 11, 9.5, 118]]) {
    const nb = 11;
    box(w - 6, h, d - 4, 0, y0, z, '#9a2a1c');
    for (let i = 0; i < nb; i++) box((w / nb) * 0.66, h * 0.8, 0.3, -w / 2 + (i + 0.5) * (w / nb), y0, z + d / 2 - 1.85, '#b8862c', 0.1);
    for (let i = 0; i <= nb; i++) {
      const x = -w / 2 + (i * w) / nb;
      for (const s of [1, -1]) cyl(0.8, 0.85, h, 8, x, y0, z + s * (d / 2 - 0.6), LACQ, 0.04);
      if (z > 0) for (let k = 0; k < 7; k++) { const a = k * 1.1, yy = y0 + 0.8 + k * 1.05; rbox(0.5, 0.45, 1.8, x + Math.cos(a) * 0.82, yy, z + d / 2 - 0.6 + Math.sin(a) * 0.82, a, gold, 0.2); }
    }
    vnRoof(w + 6, d + 6, rh * 0.62, 0, y0 + h, z, YEL, { curl: 0.55, ridge: YELD, sag: 0.1, ornament: false });
    box(w * 0.82, rh * 0.75, d * 0.55, 0, y0 + h + rh * 0.2, z, '#8a2a1c');
    vnRoof(w * 0.82 + 5, d * 0.55 + 5, rh, 0, y0 + h + rh * 0.95, z, YEL, { curl: 0.6, ridge: YELD, sag: 0.1 });
    // ridge ornament: sun disc / gourd at the centre, dragons at the ends
    const ry = y0 + h + rh * 1.95;
    sph(1.1, 0, ry + 1.4, z, gold, 0.35, 1, 8, 6); cone(0.5, 1.6, 6, 0, ry + 2.2, z, gold, 0.3);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) rod([sx * (6 + k * 2.5), ry + 0.4 + (k % 2) * 0.9, z], [sx * (8.5 + k * 2.5), ry + 0.4 + ((k + 1) % 2) * 0.9, z], 0.4, 0.4, 5, GRN, 0.06);
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// Chùa Thiên Mụ: the octagonal seven-storey Phước Duyên tower (1844) on Hà Khê hill, bell pavilion,
// stele pavilion on a turtle (1715) and the temple gate.
function thienmu(o = {}) {
  const r = mulberry32(o.seed ?? 1601);
  const wallC = '#c4a478', eave = '#6a4a3a', tile = '#5e4a3c', stone = '#a8a294', bronze = '#8a6a3a';
  ell(90, 7, 80, 0, -3, -14, '#6a8a46', 0, 14, 6);
  box(64, 1.2, 44, 0, 3.4, 0, stone); box(44, 1.2, 46, 0, 3.4, -44, '#9a9486');
  stairs(0, 0, 4.6, 46, 14, 8, 1.6, '#b0aa9c');
  // Phước Duyên tower
  const y0 = 4.6;
  octo(12, 1.6, 0, y0, 0, '#a09a8c'); octo(10.8, 1.2, 0, y0 + 1.6, 0, stone);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * PI * 2; box(0.5, 1.4, 0.5, Math.cos(a) * 11.6, y0 + 1.6, Math.sin(a) * 11.6, '#b8b2a4'); }
  let y = y0 + 2.8;
  for (let k = 0; k < 7; k++) {
    const t = k / 6, R = lerp(8.4, 5.2, t), h = lerp(7.8, 5.4, t);
    octo(R, h, 0, y, 0, wallC);
    const ap = R * Math.cos(PI / 8);
    for (let f = 0; f < 8; f += 2) {
      const ry = (f * PI) / 4;
      const [a, b] = rot(0, ap + 0.05, ry);
      panel([[-1.1, 0], [1.1, 0], [1.1, h * 0.42], [0, h * 0.62], [-1.1, h * 0.42]], 0.3, '#2e2018', 0, ry, a, y + h * 0.18, b);
      if (f === 0) sph(0.7, a * 0.98, y + h * 0.38, b * 0.98 + 0.3, '#e0b040', 0.35, 1.2, 6, 4);
    }
    C(new THREE.CylinderGeometry(R + 0.4, R + 2.3, 1.3, 8).rotateY(PI / 8).translate(0, y + h + 0.45, 0), eave);
    y += h + 1.1;
  }
  octo(2.6, 1.2, 0, y, 0, bronze);
  C(new THREE.TorusGeometry(1.8, 0.35, 5, 16).translate(0, y + 3.2, 0), bronze, 0.1);
  rod([0, y + 1.2, 0], [0, y + 9.6, 0], 0.7, 0.2, 6, bronze, 0.1);
  sph(0.9, 0, y + 6.4, 0, bronze, 0.1, 1, 8, 6);
  const towerTop = y + 9.6;
  // bell pavilion (east) and stele pavilion with the turtle (west)
  for (const sx of [-1, 1]) {
    const X = sx * 24;
    box(11, 0.8, 11, X, y0, 0, stone);
    for (const a of [-1, 1]) for (const b of [-1, 1]) cyl(0.4, 0.4, 6.5, 6, X + a * 4, y0 + 0.8, b * 4, LACQ);
    vnRoof(13, 13, 3, X, y0 + 7.3, 0, tile, { curl: 0.6, ridge: '#3a2a20', ornament: false });
    box(7.4, 2.6, 7.4, X, y0 + 9.3, 0, '#8a3a26');
    vnRoof(10.5, 10.5, 3.6, X, y0 + 11.8, 0, tile, { curl: 0.65, ridge: '#3a2a20' });
    if (sx > 0) lathe([[0, 0], [2.1, 0], [1.9, 0.6], [1.6, 2.6], [1.0, 3.4], [0.3, 3.6], [0, 3.6]], 12, X, y0 + 2.4, 0, '#5e5236');
    else { ell(2.6, 1.3, 3.4, X, y0 + 1.6, 0, '#7d8288', 0, 8, 5); ell(0.8, 0.7, 1.1, X, y0 + 1.6, 3.6, '#7d8288', 0, 6, 4); box(3.4, 5.4, 0.8, X, y0 + 2.2, 0, '#7d8288'); box(3.8, 0.8, 1.0, X, y0 + 7.4 - 0.2, 0, '#6e7278'); }
  }
  // temple gate (tam quan, two storeys) and the main hall behind
  vhall(0, y0, -32, 22, 8, 6, { open: true, rail: false, col: LACQ, roof: tile, ridge: '#3a2a20', baseH: 0.8, tiers: 2, rh: 3.4, rh2: 3.6, s2: 0.6, s2d: 0.9, h2: 3.2, bays: 3 });
  for (const sx of [-1, 1]) vhall(sx * 15, y0, -32, 6, 6, 4.4, { col: LACQ, wall: '#8a3a26', roof: tile, ridge: '#3a2a20', baseH: 0.8, rh: 2.6, bays: 1, over: 2.6 });
  vhall(0, y0, -58, 36, 16, 6.5, { col: LACQ, wall: '#8a3a26', roof: tile, ridge: '#3a2a20', baseH: 1.0, rh: 5, bays: 7 });
  const hy = (x, z) => -3 + 7 * Math.sqrt(Math.max(0, 1 - (x / 90) ** 2 - ((z + 14) / 80) ** 2));
  forest(-85, -40, -80, 30, 10, r, 'pine', hy, 1.6, 2.2);
  forest(40, 85, -80, 30, 10, r, 'pine', hy, 1.6, 2.2);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [Cy(0, 0, 10, 0, towerTop)] };
}

// Hiển Lâm Các (three storeys) and the Nine Dynastic Urns (Cửu Đỉnh, 1835–37) in front of Thế Miếu.
function hienlam() {
  const stone = '#a8a294', bronze = '#6e5a38', wood = '#8a2a1e';
  box(104, 0.8, 70, 0, 0, 0, '#9a9488');
  // Hiển Lâm Các
  box(34, 2, 26, 0, 0.8, -14, stone);
  stairs(0, 0.8, 2.8, 0, 10, 3, 0.8, '#b0aa9c');
  let y = 2.8;
  for (const [w, d, h, rh, roofC] of [[28, 20, 7.5, 4.5, GRN], [21, 14, 5.4, 4, YEL], [15, 10, 4.6, 4.6, YEL]]) {
    box(w - 3, h, d - 3, 0, y, -14, wood);
    for (let i = 0; i <= Math.round(w / 3.5); i++) for (const s of [-1, 1]) cyl(0.4, 0.42, h, 6, -w / 2 + (i * w) / Math.round(w / 3.5), y, -14 + s * (d / 2 - 0.5), LACQ);
    for (let i = 0; i < Math.round(w / 3.5); i++) box(2.2, h * 0.6, 0.2, -w / 2 + 1.75 + i * 3.5, y + h * 0.2, -14 + d / 2 - 1.4, '#c8962e', 0.1);
    vnRoof(w + 4, d + 4, rh, 0, y + h, -14, roofC, { curl: 0.6, ridge: roofC === YEL ? YELD : GRND, sag: 0.1 });
    y += h + rh * 0.55;
  }
  sph(0.8, 0, y + 2.4, -14, YEL, 0.35, 1.3, 8, 6);
  // the nine urns
  for (let k = 0; k < 9; k++) {
    const x = (k - 4) * 10.5, s = k === 4 ? 1.18 : 1, z = 20;
    box(5.4 * s, 1.2, 5.4 * s, x, 0.8, z, stone);
    const yb = 2.0;
    for (let l = 0; l < 3; l++) { const a = (l / 3) * PI * 2 + 0.5; rod([x + Math.cos(a) * 1.6 * s, yb, z + Math.sin(a) * 1.6 * s], [x + Math.cos(a) * 1.4 * s, yb + 1.6 * s, z + Math.sin(a) * 1.4 * s], 0.32 * s, 0.38 * s, 5, bronze); }
    lathe([[0, 0], [1.9, 0.1], [2.4, 0.9], [2.5, 2.2], [2.2, 3.0], [2.5, 3.2], [2.4, 3.5], [0, 3.4]].map(([a, b]) => [a * s, b * s]), 14, x, yb + 1.2 * s, z, bronze, 0.06);
    for (const sx of [-1, 1]) C(new THREE.TorusGeometry(0.75 * s, 0.18 * s, 4, 10).translate(x + sx * 2.1 * s, yb + 1.2 * s + 4.0 * s, z), bronze, 0.06);
  }
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [] };
}

// Lăng Minh Mạng: Trung Đạo bridge, Minh Lâu on its terraces above the lake, crescent Tân Nguyệt lake,
// Bửu Thành (round wall around the tomb) on a pine hill.
function minhmang(o = {}) {
  const r = mulberry32(o.seed ?? 1841);
  const stone = '#a8a294', stoneD = '#8a8678', water = '#3a6670', grass = '#6a8a46', wood = '#8a2a1e';
  box(150, 0.4, 200, 0, -0.2, -5, grass);
  // Trừng Minh lake and Trung Đạo bridge
  box(150, 0.5, 34, 0, -0.1, 72, water);
  box(8, 2.2, 40, 0, 0, 72, stone);
  for (let k = -4; k <= 4; k++) for (const sx of [-1, 1]) box(0.6, 1.2, 0.6, sx * 3.7, 2.2, 72 + k * 4.6, '#c8c2b2');
  for (const sx of [-1, 1]) box(0.3, 0.4, 40, sx * 3.7, 3.2, 72, '#c8c2b2');
  // Minh Lâu on three terraces (Tam Tài hill)
  for (let k = 0; k < 3; k++) box(48 - k * 9, 2.2, 44 - k * 9, 0, k * 2.2, 26, k % 2 ? stone : stoneD);
  stairs(0, 0, 6.6, 52, 8, 6, 1.4, '#b0aa9c');
  const y0 = 6.6;
  box(16, 1, 16, 0, y0, 26, stone);
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) if (i % 3 === 0 || j % 3 === 0) cyl(0.45, 0.5, 6.5, 6, -6 + i * 4, y0 + 1, 20 + j * 4, LACQ);
  box(9, 6.5, 9, 0, y0 + 1, 26, wood);
  vnRoof(19, 19, 4, 0, y0 + 7.5, 26, YEL, { curl: 0.6, ridge: YELD, sag: 0.1, ornament: false });
  box(9, 4, 9, 0, y0 + 9.5, 26, wood);
  for (const a of [-1, 1]) for (const b of [-1, 1]) cyl(0.35, 0.35, 4, 6, a * 4.2, y0 + 9.5, 26 + b * 4.2, LACQ);
  vnRoof(14, 14, 5, 0, y0 + 13.5, 26, YEL, { curl: 0.65, ridge: YELD, sag: 0.1 });
  sph(0.7, 0, y0 + 19, 26, YEL, 0.35, 1.3, 8, 6);
  // two trụ biểu (Bình Sơn, Thành Sơn)
  for (const sx of [-1, 1]) { box(4, 2, 4, sx * 30, 0, 30, stoneD); box(2.2, 16, 2.2, sx * 30, 2, 30, '#d0c8b4'); box(3, 1, 3, sx * 30, 18, 30, '#b8b0a0'); sph(1.0, sx * 30, 19.8, 30, '#d0c8b4', 0, 1.3, 8, 6); }
  // Tân Nguyệt crescent lake around the front of Bửu Thành, Thông Minh Chính Trực bridge
  const cz = -48, R0 = 30, R1 = 44, a0 = -1.25, a1 = 1.25, pts = [];
  for (let k = 0; k <= 16; k++) { const a = lerp(a0, a1, k / 16); pts.push([Math.sin(a) * R1, cz + Math.cos(a) * R1]); }
  for (let k = 16; k >= 0; k--) { const a = lerp(a0, a1, k / 16); pts.push([Math.sin(a) * R0, cz + Math.cos(a) * R0]); }
  slab(pts, 0.45, -0.1, water);
  box(7, 1.6, 18, 0, 0, cz + 37, stone);
  // Bửu Thành and the tomb mound on the pine hill
  ell(70, 24, 46, 0, -4, -90, '#3e6634', 0, 12, 6);
  const pos = [];
  for (let k = 0; k < 28; k++) { const a = (k / 28) * PI * 2, b = ((k + 1) / 28) * PI * 2; if (Math.abs(Math.sin(a) * 26) < 3 && Math.cos(a) > 0) continue; beam([Math.sin(a) * 26, 2.5, cz + Math.cos(a) * 26], [Math.sin(b) * 26, 2.5, cz + Math.cos(b) * 26], 1.6, '#8a8274', 0, 5); }
  box(6, 6, 2.4, 0, 0, cz + 26, '#8a8274'); box(4, 4.4, 2.6, 0, 0, cz + 26, '#2a2420');
  ell(18, 7, 18, 0, 0, cz, '#4a7a3a', 0, 10, 5);
  forest(-24, 24, cz - 18, cz + 14, 10, r, 'pine', (x, z) => Math.max(0, 7 * Math.sqrt(Math.max(0, 1 - (x / 18) ** 2 - ((z - cz) / 18) ** 2))), 1.4, 1.9);
  forest(-75, 75, -130, -70, 34, r, 'pine', (x, z) => Math.max(0, 24 * Math.sqrt(Math.max(0, 1 - (x / 70) ** 2 - ((z + 90) / 46) ** 2)) - 4), 1.8, 2.6);
  forest(-75, -40, -40, 50, 10, r, 'pine', null, 1.6, 2.2);
  forest(40, 75, -40, 50, 10, r, 'pine', null, 1.6, 2.2);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [], fogScale: 0.8 };
}

// Nguyễn royal dragon boat: carved dragon head and tail, roofed cabin with a yellow canopy, rowers.
function thuyenrong() {
  const L = 34, red = '#b02a20', gold = '#d8a832', green = '#2f7a4a';
  const sec = (t) => ({ w: pl(t, [[0, 0.8], [0.15, 2.6], [0.5, 3.3], [0.85, 2.6], [1, 0.6]]), top: pl(t, [[0, 3.4], [0.15, 2.4], [0.5, 2.1], [0.85, 2.4], [1, 3.2]]), bot: pl(t, [[0, 1.6], [0.15, -0.9], [0.5, -1.1], [0.85, -0.9], [1, 1.6]]) });
  hull(L, sec, [[0, 0.6, '#5a2a1a'], [0.6, 0.86, red], [0.86, 1, gold, 0.12]], '#8a6a48');
  // dragon head (bow, +z) rising on a scaled neck
  const neck = [[0, 2.8, 16.6], [0, 4.6, 18.0], [0, 7.0, 18.6], [0, 8.8, 19.6]];
  for (let i = 0; i < 3; i++) rod(neck[i], neck[i + 1], 1.1 - i * 0.12, 0.98 - i * 0.12, 7, i % 2 ? green : gold, 0.1);
  ell(1.3, 1.1, 1.9, 0, 9.4, 20.6, gold, 0.15, 8, 6);
  box(1.6, 0.6, 2.2, 0, 8.3, 21.4, gold, 0.15);   // jaw (open mouth)
  box(1.7, 0.5, 2.0, 0, 9.4, 22.0, gold, 0.15);
  sph(0.45, 0, 8.95, 22.8, '#ff5a2a', 0.6, 1, 6, 4);   // pearl
  for (const sx of [-1, 1]) {
    rod([sx * 0.5, 10.2, 20.2], [sx * 0.9, 12, 18.6], 0.22, 0.08, 4, gold, 0.15);   // horns
    rod([sx * 0.6, 8.6, 22.3], [sx * 1.6, 7.6, 24.2], 0.1, 0.05, 3, gold, 0.15);   // whiskers
    sph(0.28, sx * 0.9, 9.8, 21.2, '#1a1410', 0.3, 1, 5, 4);
  }
  for (let k = 0; k < 4; k++) cone(0.4, 1.4, 4, 0, 10.2 - k * 0.6, 19.6 - k * 0.6, red);
  // tail (stern, -z)
  const tail = [[0, 3.2, -16.4], [0, 5, -17.6], [0, 7, -17.8], [0, 8.6, -17], [0, 9.6, -15.8]];
  for (let i = 0; i < 4; i++) rod(tail[i], tail[i + 1], 0.8 - i * 0.15, 0.65 - i * 0.15, 6, i % 2 ? green : gold, 0.1);
  panel([[0, 0], [1.6, 2.4], [0.2, 1.6], [-0.6, 3.2], [-0.8, 0.6]], 0.2, red, 0.06, HP, 0, 9.0, -15.6);
  // cabin with the yellow canopy
  box(5.4, 0.4, 12, 0, 2.2, -1, '#6a3a22');
  for (const sx of [-1, 1]) for (const z of [-6.5, -1, 4.5]) cyl(0.18, 0.18, 4.4, 6, sx * 2.5, 2.6, z, red);
  box(4.6, 3.0, 9, 0, 2.6, -2, '#8a2a1c'); box(4.7, 1.2, 9.1, 0, 4.0, -2, '#e8b830', 0.1);
  vnRoof(15, 7.4, 2.4, 0, 7, -1, '#f0c030', { rotY: HP, curl: 0.7, ridge: gold, em: 0.08 });
  rod([0, 2.6, 6.5], [0, 8.6, 6.5], 0.1, 0.08, 4, '#4a2a1a'); cone(1.8, 0.8, 8, 0, 8.4, 6.5, '#f0c030', 0.1);   // parasol
  // rowers in red with oars
  for (let k = 0; k < 9; k++) for (const sx of [-1, 1]) {
    const z = -14 + k * 3.4; if (z > -8.5 && z < 6) continue;
    person(sx * 1.5, 2.1, z, '#c02a1e', '#2a2018', 0.75);
    rod([sx * 1.6, 3.0, z + 0.3], [sx * 5.2, -0.4, z - 1.2], 0.08, 0.08, 4, '#7a5a38');
    box(0.2, 0.08, 0.7, sx * 5.0, -0.25, z - 1.1, '#7a5a38');
  }
  for (let k = 0; k < 6; k++) for (const sx of [-1, 1]) { const z = -6.5 + k * 2.4; person(sx * 2.0, 2.1, z, '#c02a1e', '#2a2018', 0.75); rod([sx * 2.1, 3.0, z + 0.3], [sx * 5.4, -0.4, z - 1.2], 0.08, 0.08, 4, '#7a5a38'); }
  flag(0, 8, -15.6, 3, 2, '#f2c418', 0.15, -1, HP);
  return { parts: [{ geo: take(), mat: 'paint' }], colliders: [B(-4, 4, -2, 10, -18, 24)] };
}

export const BUILDERS_B = {
  // era 6 · Hồ
  taydo, namgiao,
  // era 7 · Lê sơ
  kinhthien, ruathan, biatiensi, lamkinh,
  // era 8 · trade ports
  chuacau, hoiquan, phohoian, chauan, galleon, xichdang,
  // era 9 · Tây Sơn
  thapdoi, canhtien, hoangde, voichien, dongda,
  // era 10 · Nguyễn
  kinhthanh, kydai, ngomon, thaihoa, thienmu, hienlam, minhmang, thuyenrong,
};
