// Landmark construction kit shared by the era builders (landmarks_a.js, landmarks_b.js).
// A builder adds coloured primitives with the helpers below, then returns
//   { parts: [{ geo: take(), mat: 'paint' }], colliders, gates, subs, emitters, fogScale }
// in landmark-local space: x = lateral offset (rail u), y = height, z = toward the approaching player.
//   colliders: [B(x0, x1, y0, y1, z0, z1) | Cy(x, z, r, y0, y1)]
//   gates:     [{ x0, x1, y0, y1, label, bonus }] — flying through the plane z = 0 inside one scores a bonus
//   subs:      [{ geo, mat: 'paint', pos: [x, y, z], spin: [ax, ay, az] }] — spinning sub-meshes (built with take())
//   emitters:  [{ kind: 'fire' | 'smoke' | 'falls' | 'spray' | 'spores', x, y, z, w, rate }] — particle sources
//   fogScale:  < 1 thins the fog on very large / distant structures (mountains)
// Every primitive takes (…, col, em): col = hex colour, em = 0..1 self-illumination (lanterns, windows at night).
import * as THREE from 'three';
import { TAU, mulberry32, lerp } from './core.js';
import { mergeColored } from './world.js';

export { TAU, mulberry32, lerp };
const P = [];   // part accumulator for the builder currently running
export const C = (g, col, em = 0) => { P.push([g, col, em]); return g; };
export const box = (w, h, d, x, y, z, col, em) => C(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), col, em);
export const cyl = (rt, rb, h, seg, x, y, z, col, em) => C(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z), col, em);
export const cone = (r, h, seg, x, y, z, col, em) => C(new THREE.ConeGeometry(r, h, seg).translate(x, y + h / 2, z), col, em);
export const sph = (r, x, y, z, col, em, sy = 1, ws = 12, hs = 8) => C(new THREE.SphereGeometry(r, ws, hs).scale(1, sy, 1).translate(x, y, z), col, em);
export const dome = (r, x, y, z, col, em, sy = 1) => C(new THREE.SphereGeometry(r, 14, 7, 0, TAU, 0, Math.PI / 2).scale(1, sy, 1).translate(x, y, z), col, em);
export const torus = (R, r, x, y, z, col, em, rotX = Math.PI / 2, arc = TAU) => C(new THREE.TorusGeometry(R, r, 5, 28, arc).rotateX(rotX).translate(x, y, z), col, em);
export const lathe = (pts, seg, x, y, z, col, em) => C(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg).translate(x, y, z), col, em);
const _o = new THREE.Object3D();
// Square beam from point a to point b (t = width, tz = height)
export function beam(a, b, t, col, em = 0, tz = t) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const len = A.distanceTo(Bv);
  _o.position.copy(A).add(Bv).multiplyScalar(0.5);
  _o.lookAt(Bv);
  _o.updateMatrix();
  return C(new THREE.BoxGeometry(t, tz, len).applyMatrix4(_o.matrix), col, em);
}
// Extruded 2D outline (in the x/y plane), depth along z, centred on z
export function prism(pts, depth, x, y, z, col, em) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps: 1 });
  g.translate(x, y, z - depth / 2);
  return C(g, col, em);
}
export function take() { const g = mergeColored(P); P.length = 0; return g; }
export const B = (x0, x1, y0, y1, z0, z1) => ({ t: 'box', x0, x1, y0, y1, z0, z1 });
export const Cy = (x, z, r, y0, y1) => ({ t: 'cyl', x, z, r, y0, y1 });

// Vietnamese hip roof with sagging slopes and upturned corners (đầu đao).
// w × d = eave footprint, h = height eave → ridge, curl = corner lift (fraction of h). Adds a ridge beam
// and small ornaments at the ridge ends. rotY rotates the roof about its centre.
export function vnRoof(w, d, h, x, y, z, col, opts = {}) {
  const curl = opts.curl ?? 0.45, sag = opts.sag ?? 0.12, ridgeCol = opts.ridge ?? col, rotY = opts.rotY ?? 0;
  const a = w / 2, b = d / 2, r = Math.max(0, a - b * (opts.hip ?? 1));
  const N = 8;
  const pos = [];
  const lift = (t) => curl * h * Math.pow(Math.abs(2 * t - 1), 3);   // t 0..1 along an eave edge
  const tri = (p, q, s) => { pos.push(...p, ...q, ...s, ...p, ...s, ...q); };   // both faces
  const ev = (side, t) => {   // eave point (side 0 front +z, 1 right +x, 2 back -z, 3 left -x), corners pushed out a bit
    const o = 1 + 0.08 * curl * Math.pow(Math.abs(2 * t - 1), 2);
    if (side === 0) return [lerp(-a, a, t) * o, lift(t), b * o];
    if (side === 1) return [a * o, lift(t), lerp(b, -b, t) * o];
    if (side === 2) return [lerp(a, -a, t) * o, lift(t), -b * o];
    return [-a * o, lift(t), lerp(-b, b, t) * o];
  };
  const rd = (side, t) => {   // matching ridge point
    if (side === 0) return [lerp(-r, r, t), h, 0];
    if (side === 1) return [r, h, 0];
    if (side === 2) return [lerp(r, -r, t), h, 0];
    return [-r, h, 0];
  };
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const e0 = ev(side, t0), e1 = ev(side, t1), r0 = rd(side, t0), r1 = rd(side, t1);
      const m = (e, q) => [lerp(e[0], q[0], 0.5), lerp(e[1], q[1], 0.5) - sag * h, lerp(e[2], q[2], 0.5)];
      const m0 = m(e0, r0), m1 = m(e1, r1);
      tri(e0, e1, m1); tri(e0, m1, m0);
      tri(m0, m1, r1); tri(m0, r1, r0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.rotateY(rotY).translate(x, y, z);
  C(g, col, opts.em ?? 0);
  const rl = Math.max(2 * r, 0.4 * Math.min(w, d)) + 0.4;
  const ridge = new THREE.BoxGeometry(rl, h * 0.09 + 0.3, 0.5 + h * 0.06).translate(0, h + 0.1, 0);
  ridge.rotateY(rotY).translate(x, y, z);
  C(ridge, ridgeCol);
  if (opts.ornament !== false) {
    for (const sx of [-1, 1]) {
      const orn = new THREE.ConeGeometry(0.25 + h * 0.07, 0.6 + h * 0.25, 4).translate(sx * rl / 2, h + 0.3 + h * 0.12, 0);
      orn.rotateY(rotY).translate(x, y, z);
      C(orn, ridgeCol);
    }
  }
}

// Building with stacked roofs (chồng diêm): a column-and-wall body plus `tiers` hip roofs.
// Returns the top height. Columns are drawn as a row on the front and back faces.
export function hall(w, d, hBody, x, y, z, o = {}) {
  const wall = o.wall ?? '#b8322a', col = o.col ?? '#8a2a22', roof = o.roof ?? '#6e3a2a', base = o.base ?? '#a89a84', tiers = o.tiers ?? 1;
  box(w + 2, 1.2, d + 2, x, y, z, base);
  box(w * 0.92, hBody, d * 0.86, x, y + 1.2, z, wall, o.em ?? 0);
  const nc = Math.max(2, Math.round(w / 4));
  for (const zz of [d / 2, -d / 2]) for (let i = 0; i <= nc; i++) cyl(0.35, 0.4, hBody, 6, x - w / 2 + (w * i) / nc, y + 1.2, z + zz * 0.98, col);
  let top = y + 1.2 + hBody;
  for (let k = 0; k < tiers; k++) {
    const s = 1 - k * 0.28;
    const rh = (o.roofH ?? Math.min(w, d) * 0.32) * (k ? 0.75 : 1);
    vnRoof((w + 4.5) * s, (d + 4) * s, rh, x, top, z, roof, { curl: o.curl ?? 0.5, ridge: o.ridgeCol });
    top += rh * (k < tiers - 1 ? 0.55 : 1);
    if (k < tiers - 1) { box(w * s * 0.62, rh * 0.5, d * s * 0.56, x, top - rh * 0.05, z, wall); top += rh * 0.45; }
  }
  return top;
}

// Square multi-storey tower (tháp): `n` storeys shrinking upward with a small roof or cornice on each.
export function tower(n, w0, w1, hs, x, y, z, body, cornice, o = {}) {
  let yy = y;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0, w = lerp(w0, w1, t), h = hs * (1 - t * 0.25);
    if (o.oct) cyl(w * 0.54, w * 0.54, h, 8, x, yy, z, body); else box(w, h, w, x, yy, z, body);
    if (o.roofs) vnRoof(w + 2.2, w + 2.2, h * 0.35, x, yy + h, z, cornice, { curl: 0.55, ornament: false, ridge: cornice });
    else box(w + 0.9, h * 0.1, w + 0.9, x, yy + h, z, cornice);
    if (o.arch !== false && w > 3) box(w * 0.3, h * 0.5, 0.3, x, yy + h * 0.18, z + w / 2 + 0.05, o.door ?? '#2a2018');
    yy += h * (o.roofs ? 1.22 : 1.1);
  }
  return yy;
}

// Rammed-earth / brick rampart along a polyline in the x/z plane: [[x, z], ...]
export function rampart(path, h, thick, y, col, topCol) {
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, z0] = path[i], [x1, z1] = path[i + 1];
    beam([x0, y + h / 2, z0], [x1, y + h / 2, z1], thick, col, 0, h);
    if (topCol) beam([x0, y + h + 0.3, z0], [x1, y + h + 0.3, z1], thick * 0.7, topCol, 0, 0.6);
  }
}
