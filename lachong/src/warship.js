// Boss archetype WARSHIP — a flying sacred beast (linh vật) held by THỜI ẢNH's shadow. It swims through the air
// ahead of the squadron, head toward the player:
//   'kimquy'  (Cổ Loa)   Kim Quy — the golden turtle who helped An Dương Vương raise Cổ Loa and gave the claw
//                         for the magic crossbow: a domed shell of hexagonal scutes, rowing flippers, long neck.
//   'kinhngu' (Bạch Đằng) Kình ngư / Cá Ông — the whale coastal Vietnam reveres as guardian of the sea:
//                         slate-blue back, pale grooved throat, long barnacled flippers, beating flukes.
//   'cachep'  (Hội An)   the carp leaping the Vũ Môn gate into a dragon: big red-gold scales, flowing fins,
//                         long whiskers, budding antlers and a mane.
// While possessed the true colours show only faintly through an ink-black coat with violet seams and red-violet
// eyes; shadow growths (turrets) cling to its back and shadow wisps trail it.
// Phase 1: the shadow growths fire + volleys from the fins + homing shadow-bolts. Phase 2: the mouth opens on the
// possessed heart (the core), which charges and sweeps a beam; the heart is only vulnerable while the mouth is open.
// Enraged (heart < 50%): faster cycles, ring bursts, drone launches.
// When the heart breaks the beast is PURIFIED, not killed: the shadow peels off from the heart outward, its true
// colours return in a golden flash, and the freed creature turns, swims up and away and dissolves into light.
import * as THREE from 'three';
import { G, rand, clamp, lerp, damp, TAU, emit, diff, easeOutCubic, easeInOutCubic } from './core.js';
import { railFrame, railToWorld, emissiveVertexMaterial, mergeGeometries } from './world.js';
import { FX, glow, sparks, addShake, bigFlash } from './fx.js';
import { TARGETS, enemyShot, aimAtPlayer } from './weapons.js';
import { AudioSys } from './audio.js';
import { loft, slab, fin, mirrorX } from './ship.js';
import { paint, wave } from './enemies.js';
import { POST } from './gfx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const _up = new THREE.Vector3(0, 1, 0);

// Highest turret mount (ship-space y) per hardpoint index — the original battleship's deck heights.
const HP_MAX_Y = [12.5, 12.5, 15, 4.5, 4.5, 9.5, 9.5, 18];

// ============================================================ geometry helpers
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mir = (g, side) => (side < 0 ? mirrorX(g) : g);
// ring of points (CCW seen from +Z), separate top / bottom radii
function ringTB(rx, ryT, ryB, cy = 0, n = 16) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, s = Math.sin(a); pts.push([Math.cos(a) * rx, cy + s * (s > 0 ? ryT : ryB)]); }
  return pts;
}
// half sections for jaws: the closing edge is the flat mouth line (y = 0)
const arcTop = (rx, ry, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = i / n * Math.PI; return [Math.cos(a) * rx, Math.sin(a) * ry]; });
const arcBot = (rx, ry, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = Math.PI + i / n * Math.PI; return [Math.cos(a) * rx, Math.sin(a) * ry]; });
function ell(rx, ry, rz, ws = 18, hs = 10, part = null) {
  const g = part === 'top' ? new THREE.SphereGeometry(1, ws, hs, 0, TAU, 0, Math.PI / 2)
    : part === 'bot' ? new THREE.SphereGeometry(1, ws, hs, 0, TAU, Math.PI / 2, Math.PI / 2)
      : new THREE.SphereGeometry(1, ws, hs);
  return g.scale(rx, ry, rz);
}
function orient(g, x, y, z, n, spin = 0) {
  if (spin) g.rotateY(spin);
  _q.setFromUnitVectors(UP, _n.copy(n).normalize());
  g.applyQuaternion(_q);
  return g.translate(x, y, z);
}
const hexPlate = (r, h = 1.4) => new THREE.CylinderGeometry(r * 0.8, r, h, 6).translate(0, h / 2 - 0.2, 0);
const ringSeam = (r, tube = 0.3, seg = 6) => new THREE.TorusGeometry(r, tube, 3, seg).rotateX(Math.PI / 2).rotateY(seg === 6 ? Math.PI / 6 : 0);
const tube = (pts, r, segs = 16) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, 3, false);
// horizontal plate from an (x, z) planform
const plate = (pts, thick, bevel = 0) => slab(pts.map(([x, z]) => [x, -z]), thick, bevel);
// tapered paddle (flipper) along +X from stations [x, zLead, zTrail, thickness, yOff]
function paddle(st, n = 10) {
  const secs = st.map(([x, zl, zt, t, y0 = 0]) => {
    const c = -(zl + zt) / 2, h = Math.max(0.3, (zl - zt) / 2), pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push([c + Math.cos(a) * h, y0 + Math.sin(a) * t * (Math.cos(a) > 0 ? 0.8 : 1)]); }
    return { z: x, pts };
  });
  return loft(secs).rotateY(Math.PI / 2);
}
// vertical plate from a (z, y) profile (thickness along X)
const vplate = (pts, thick) => fin(pts, thick);
// a straight rod between two points
function rod(a, b, r0, r1 = r0, seg = 5) {
  const d = _v.subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg).translate(0, L / 2, 0);
  _q.setFromUnitVectors(UP, d.normalize());
  g.applyQuaternion(_q);
  return g.translate(a.x, a.y, a.z);
}
// Catmull-Rom resampling of [z, rx, ryT, ryB, cy] keys (head first) into a dense profile
function profile(keys, per = 4) {
  const out = [];
  const K = (i) => keys[clamp(i, 0, keys.length - 1)];
  const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < keys.length - 1; i++) {
    for (let s = 0; s < per; s++) {
      const t = s / per, row = [];
      for (let j = 0; j < 5; j++) row.push(cr(K(i - 1)[j], K(i)[j], K(i + 1)[j], K(i + 2)[j], t));
      out.push(row);
    }
  }
  out.push(keys[keys.length - 1].slice());
  return out;
}
function secAt(P, z) {
  if (z >= P[0][0]) return P[0];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (z <= a[0] && z >= b[0]) { const t = (a[0] - z) / (a[0] - b[0] || 1); return a.map((v, j) => lerp(v, b[j], t)); }
  }
  return P[P.length - 1];
}
// loft of the profile between zLo..zHi, expressed relative to a pivot at zPiv
function bodyLoft(P, zLo, zHi, zPiv, n = 18, step = 4) {
  const secs = [];
  const cnt = Math.max(2, Math.ceil((zHi - zLo) / step));
  for (let i = 0; i <= cnt; i++) {
    const z = lerp(zLo, zHi, i / cnt), s = secAt(P, z);
    secs.push({ z: z - zPiv, pts: ringTB(Math.max(0.2, s[1]), Math.max(0.2, s[2]), Math.max(0.2, s[3]), s[4], n) });
  }
  return loft(secs);
}
// point on a profile's surface at angle a (0 = right flank, π/2 = top) and its outward normal
function surf(P, z, a, out, nOut) {
  const s = secAt(P, z), sn = Math.sin(a), ry = sn > 0 ? s[2] : s[3];
  out.set(Math.cos(a) * s[1], s[4] + sn * ry, z);
  const s2 = secAt(P, z - 1.5), s1 = secAt(P, z + 1.5);
  const drx = (s1[1] - s2[1]) / 3;
  nOut.set(Math.cos(a) / s[1], sn / ry, -drx / Math.max(1, s[1])).normalize();
  return out;
}

// ============================================================ shadow coat
// Each vertex carries its true colour/emission and its possessed colour/emission; purification blends them with
// a front that spreads from the heart outward (per-vertex sweep value).
class Coat {
  constructor(S) { this.S = S; this.items = []; }
  add(g, hex, em, shex, sem, grad = null) {
    // S.glowT: a model's true skin glows faintly once purified (the carp shines like a lantern)
    if (shex == null && !em) em = this.S.glowT || 0;
    this.items.push({ g, c: new THREE.Color(hex), em, s: shex == null ? null : new THREE.Color(shex), sem, grad });
    return this;
  }
  skin(g, hex, em = 0) { return this.add(g, hex, em, null, 0); }
  // two-tone skin: hex above yMid, hex2 below (blended over ±blend)
  grad(g, hex, hex2, yMid, blend = 2) { return this.add(g, hex, 0, null, 0, { c2: new THREE.Color(hex2), yMid, blend }); }
  seam(g, hex, em = 0.35, sem = 0.5) { return this.add(g, hex, em, this.S.seam, sem); }
  eye(g, hex, em = 0.9) { return this.add(g, hex, em, this.S.eye, 0.8); }
  inner(g, hex, em = 0) { return this.add(g, hex, em, '#3a0a2c', 0.55); }
  build() {
    const geos = [], tc = [], sc = [], te = [], se = [];
    const S = this.S, sh = new THREE.Color(), tcol = new THREE.Color();
    for (const it of this.items) {
      const g = it.g.index ? it.g.toNonIndexed() : it.g.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      g.computeVertexNormals();
      const pos = g.attributes.position, n = pos.count;
      for (let i = 0; i < n; i++) {
        tcol.copy(it.c);
        if (it.grad) { const y = pos.getY(i), k = clamp((y - it.grad.yMid) / (2 * it.grad.blend) + 0.5, 0, 1); tcol.lerpColors(it.grad.c2, it.c, k * k * (3 - 2 * k)); }
        if (it.s) sh.copy(it.s); else sh.copy(S.ink).lerp(tcol, S.show);
        tc.push(tcol.r, tcol.g, tcol.b); sc.push(sh.r, sh.g, sh.b); te.push(it.em); se.push(it.sem);
      }
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aEmit', new THREE.BufferAttribute(new Float32Array(n), 1));
      geos.push(g);
    }
    const out = mergeGeometries(geos);
    for (const k of ['color', 'aEmit']) out.attributes[k].setUsage(THREE.DynamicDrawUsage);
    out.userData = { tc: Float32Array.from(tc), sc: Float32Array.from(sc), te: Float32Array.from(te), se: Float32Array.from(se), sw: null };
    return out;
  }
}

// ============================================================ rig
class Rig {
  constructor(ship, mat, S) { this.mat = mat; this.S = S; this.g = { ship }; this.meshes = []; }
  grp(key, parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); this.g[parent].add(g); this.g[key] = g; return g; }
  coat() { return new Coat(this.S); }
  mesh(parent, coat) { const m = new THREE.Mesh(coat.build(), this.mat); m.castShadow = true; this.g[parent].add(m); this.meshes.push(m); return m; }
  pt(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); this.g[parent].add(o); return o; }
}

// ============================================================ KIM QUY — golden turtle
const PAL_KIMQUY = {
  border: '#6e4318', scute: '#e0aa3e', scute2: '#cf9632', ring: '#ffd66a', skin: '#b98436', skin2: '#8a5a24', belly: '#ecd290',
  claw: '#ffe08a', beak: '#d6ad52', eyeT: '#ffb630', mouth: '#7a2a24', core: '#ff3a7a', metal: 0.5, rough: 0.38,
};
function buildKimQuy(R, C) {
  const D = { cx: 0, cy: 1, cz: -10, rx: 34, ry: 16, rz: 42 };
  const domeY = (x, z) => D.cy + D.ry * Math.sqrt(Math.max(0, 1 - (x / D.rx) ** 2 - ((z - D.cz) / D.rz) ** 2));
  const domeN = (x, y, z) => V(x / D.rx ** 2, (y - D.cy) / D.ry ** 2, (z - D.cz) / D.rz ** 2).normalize();
  R.grp('body', 'ship');
  // ---- carapace: dark bronze dome under raised golden hexagonal scutes with glowing borders
  const sh = R.coat();
  sh.skin(ell(D.rx, D.ry, D.rz, 40, 14, 'top').translate(D.cx, D.cy, D.cz), C.border);
  const scute = (x, z, r, rings, col) => {
    const y = domeY(x, z), n = domeN(x, y, z);
    sh.skin(orient(hexPlate(r, 1.5), x, y, z, n), col);
    sh.seam(orient(ringSeam(r * 1.02, 0.32), x, y + 0.05, z, n), C.ring, 0.45);
    if (rings) sh.seam(orient(ringSeam(r * 0.5, 0.22).translate(0, 1.32, 0), x, y, z, n), C.ring, 0.3);
  };
  for (const b of [0.62, 0.3, -0.02, -0.34, -0.64]) scute(0, D.cz + b * D.rz, 7.2, true, C.scute);
  for (const sx of [-1, 1]) for (const b of [0.48, 0.16, -0.16, -0.48]) scute(sx * 0.5 * D.rx, D.cz + b * D.rz, 7.4, true, C.scute2);
  for (let i = 0; i < 30; i++) {
    const th = i / 30 * TAU;
    if (Math.abs(th - Math.PI / 2) < 0.22) continue;   // the neck
    scute(0.92 * D.rx * Math.cos(th), D.cz + 0.92 * D.rz * Math.sin(th), 4.0, false, i % 2 ? C.scute : C.scute2);
  }
  R.mesh('body', sh);
  // ---- plastron (belly) with its seams, and the stub tail
  const pl = R.coat();
  pl.skin(ell(D.rx * 0.93, 4.5, D.rz * 0.93, 30, 6, 'bot').translate(0, 1.2, D.cz), C.belly);
  for (const z of [-34, -18, -2, 14]) pl.seam(new THREE.BoxGeometry(44, 0.5, 0.6).translate(0, -3.4, z), C.skin2, 0);
  pl.seam(new THREE.BoxGeometry(0.6, 0.5, 64).translate(0, -3.6, D.cz), C.skin2, 0);
  pl.skin(new THREE.ConeGeometry(3.2, 11, 6).rotateX(-Math.PI / 2).translate(0, 1, -55), C.skin);
  R.mesh('body', pl);
  // ---- neck → head; the jaws hinge at the back of the mouth, the heart (core) sits between them
  R.grp('neck', 'body', 0, 2, 26);
  const nk = R.coat();
  nk.grad(loft([{ z: -8, pts: ringTB(8.8, 7.8, 7.8, 0) }, { z: 3, pts: ringTB(7.8, 6.8, 6.9, 0.2) }, { z: 11, pts: ringTB(6.9, 6.0, 6.2, 0) }, { z: 19, pts: ringTB(6.6, 5.8, 6.0, -0.4) }]), C.skin, C.belly, -2.5, 2.5);
  for (const z of [1, 7, 13]) nk.seam(new THREE.TorusGeometry(1, 0.28, 3, 14).scale(7.6 - z * 0.08, 6.6 - z * 0.06, 1).translate(0, 0.1, z), C.skin2, 0);
  for (const [x, z, r] of [[0, 2, 3.2], [-3.2, 8, 2.6], [3.2, 8, 2.6], [0, 13, 2.6]]) nk.skin(orient(hexPlate(r, 0.8), x, 6.4 - z * 0.06, z, V(x * 0.06, 1, 0)), C.scute2);
  R.mesh('neck', nk);
  R.grp('head', 'neck', 0, -0.5, 18);
  R.grp('jawU', 'head', 0, -1.5, -2);
  R.grp('jawL', 'head', 0, -1.5, -2);
  const hu = R.coat();
  hu.skin(loft([{ z: -3, pts: arcTop(7.2, 7.6) }, { z: 4, pts: arcTop(7.7, 7.9) }, { z: 10, pts: arcTop(7.1, 6.8) }, { z: 15, pts: arcTop(5.4, 4.9) }, { z: 18, pts: arcTop(3.4, 2.8) }, { z: 19.8, pts: arcTop(1.5, 1.1) }]), C.skin);
  hu.skin(new THREE.ConeGeometry(1.7, 3.6, 5).rotateX(Math.PI).translate(0, -0.6, 19.4), C.beak);   // hooked beak
  hu.inner(new THREE.CylinderGeometry(1, 1, 0.3, 14).scale(6.6, 1, 8.4).translate(0, -0.25, 9), C.mouth);
  for (const [x, y, z, r] of [[0, 7.6, 4, 3.4], [-3.6, 6.9, 6.5, 2.2], [3.6, 6.9, 6.5, 2.2], [0, 6.8, 10, 2.6], [-4.4, 6.4, 1.2, 2.4], [4.4, 6.4, 1.2, 2.4]]) {
    const n = V(x * 0.12, 1, (z - 6) * 0.05);
    hu.skin(orient(hexPlate(r, 0.7), x, y, z, n), C.scute);
    hu.seam(orient(ringSeam(r, 0.2), x, y + 0.1, z, n), C.ring, 0.4);
  }
  const eyes = [];
  for (const sx of [-1, 1]) {
    hu.eye(new THREE.SphereGeometry(1.8, 10, 8).translate(sx * 6.1, 3.2, 9), C.eyeT, 0.9);
    hu.seam(new THREE.TorusGeometry(2.1, 0.3, 3, 10).rotateY(Math.PI / 2 - sx * 0.25).translate(sx * 6.0, 3.2, 9), C.skin2, 0);
    hu.skin(new THREE.BoxGeometry(1.2, 0.9, 5).rotateZ(sx * 0.4).translate(sx * 5.6, 5.2, 9), C.skin2);   // brow
    eyes.push(R.pt('jawU', sx * 6.9, 3.2, 9));
  }
  R.mesh('jawU', hu);
  const hl = R.coat();
  hl.grad(loft([{ z: -3, pts: arcBot(6.9, 6.0) }, { z: 4, pts: arcBot(7.3, 6.4) }, { z: 10, pts: arcBot(6.7, 5.6) }, { z: 15, pts: arcBot(4.9, 3.7) }, { z: 18.8, pts: arcBot(2.4, 1.6) }]), C.skin, C.belly, -3, 1.5);
  hl.inner(new THREE.CylinderGeometry(1, 1, 0.3, 14).scale(6.2, 1, 8).translate(0, 0.25, 8.5), C.mouth);
  R.mesh('jawL', hl);
  // ---- flippers (Kim Quy's golden claw on the leading edge)
  const flip = (key, side, x, y, z, big) => {
    R.grp(key, 'body', x, y, z);
    const c = R.coat();
    const st = big ? [[-2, 7, -8, 3], [7, 10.5, -9, 2.7], [16, 11, -9.5, 2.2], [25, 7.5, -10.5, 1.7], [32, 2, -11, 1.3], [37, -4, -11.5, 0.9], [40, -9.5, -12, 0.4]]
      : [[-2, 4, -3.5, 2.4], [8, 4.6, -6.5, 2], [16, 1.5, -9, 1.4], [21.5, -6.5, -9.8, 0.5]];
    c.grad(mir(paddle(st), side), C.skin, C.belly, -0.4, 0.8);
    const veins = big ? [[[3, 2, 2], [15, 1.8, 3], [27, 1.4, -1], [38, 0.8, -8]], [[3, 2, -4], [14, 1.8, -4], [26, 1.4, -6]]] : [[[3, 1.3, 0], [12, 1.3, -2], [19, 1.1, -7]]];
    for (const v of veins) c.seam(mir(tube(v.map(([a, b, d]) => V(a, b, d)), 0.32, 10), side), C.ring, 0.3);
    for (const [a, d, r] of big ? [[9, 1.5, 2.8], [19, 1.5, 2.6], [28, -2.5, 2.2], [8, -4.5, 2.4], [18, -5, 2.2]] : [[8, 0, 2.2], [15, -4, 1.8]]) c.skin(mir(hexPlate(r, 0.6).translate(a, 0.9, d), side), C.scute2);
    if (big) {
      c.seam(mir(new THREE.ConeGeometry(1.2, 6, 5).rotateX(Math.PI / 2).rotateY(0.5).translate(15, 0.2, 13.2), side), C.claw, 0.7);   // the claw
      c.seam(mir(new THREE.ConeGeometry(0.8, 3.6, 5).rotateX(Math.PI / 2).rotateY(0.7).translate(24, 0, 10.4), side), C.claw, 0.5);
    }
    R.mesh(key, c);
    return R.g[key];
  };
  const fl = [flip('flL', -1, -24, -1, 18, true), flip('flR', 1, 24, -1, 18, true)];
  const fr = [flip('frL', -1, -21, -1, -40, false), flip('frR', 1, 21, -1, -40, false)];
  // hardpoints on the shell
  const hard = [[-13, 16], [13, 16], [0, -29], [-30, -6], [30, -6], [-22, -32], [22, -32], [0, -46]].map(([x, z], i) => {
    const y = domeY(x, z);
    return { part: 'body', p: V(x, Math.min(y + 0.6, HP_MAX_Y[i]), z), n: domeN(x, y, z) };
  });
  return {
    hard, core: { part: 'head', p: V(0, -1.5, 6), r: 4 }, eyes,
    guns: [R.pt('flL', -39, 0, -10), R.pt('flR', 39, 0, -10)],
    missiles: [R.pt('body', -10, 12, -30), R.pt('body', 10, 12, -30)],
    wisps: [R.pt('flL', -40, 0, -11), R.pt('flR', 40, 0, -11), R.pt('frL', -21, 0, -8), R.pt('frR', 21, 0, -8), R.pt('body', 0, 2, -58), R.pt('body', -30, 5, -26), R.pt('body', 30, 5, -26), R.pt('body', 0, 12, -24)],
    colliders: [[0, 0, 50, 8], [0, 6, 14, 16], [0, 6, -16, 18], [0, 5, -40, 13], [-22, 4, -8, 13], [22, 4, -8, 13], [-38, 0, 16, 8], [38, 0, 16, 8]],
    swimRate: 1.5,
    animate(g, w, T, open) {
      const s = Math.sin(w), c = Math.cos(w);
      g.body.position.y = -0.6 * s;
      g.body.rotation.x = 0.035 * c;
      fl.forEach((f, i) => { const sd = i ? 1 : -1; f.rotation.set(0.22 * c, sd * (0.12 - 0.34 * c), sd * (0.08 + 0.46 * s)); });
      fr.forEach((f, i) => { const sd = i ? 1 : -1; f.rotation.set(0, sd * (0.2 * s), sd * (-0.05 - 0.2 * s)); });
      g.neck.rotation.set(0.05 * Math.sin(w + 1) - 0.06 * open, 0.1 * Math.sin(T * 0.45), 0);
      g.head.rotation.set(0.04 * Math.sin(w + 2) + 0.04 * open, -0.05 * Math.sin(T * 0.45), 0);
      g.jawU.rotation.x = -0.5 * open;
      g.jawL.rotation.x = 0.42 * open;
    },
  };
}

// ============================================================ KÌNH NGƯ — Cá Ông, the guardian whale
const PAL_KINHNGU = {
  back: '#4b5e71', flank: '#6a7d8e', belly: '#dfe5e8', groove: '#9aa8b2', fin: '#8f9eaa', barn: '#c2bead', barn2: '#8f8b7d',
  seamT: '#cfeaff', eyeT: '#e6f6ff', mouth: '#8a4050', baleen: '#2e2b2a', core: '#ff3a7a', metal: 0.12, rough: 0.5,
};
function buildKinhNgu(R, C) {
  const P = profile([[36, 13.5, 8.6, 10.5, 0], [26, 15.5, 10.5, 12.5, 0], [12, 17, 12, 13, 0], [-4, 16.5, 12, 11.5, 0.4], [-20, 14, 11, 9.5, 0.8],
    [-36, 10, 9, 7, 1.2], [-50, 6, 7, 5, 1.6], [-62, 3.4, 5, 3.6, 1.8], [-72, 2.2, 3, 2.4, 1.8]], 4);
  R.grp('body', 'ship');
  const top = (x, z) => { const s = secAt(P, z); return s[4] + s[2] * Math.sqrt(Math.max(0, 1 - (x / s[1]) ** 2)); };
  const topN = (x, z) => { const s = secAt(P, z), y = top(x, z) - s[4]; return V(x / s[1] ** 2, y / s[2] ** 2, 0).normalize(); };
  const barnacles = (c, part, x, y, z, n, rad, count = 9) => {
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + rand(-0.2, 0.2), r = rand(0.35, 1) * rad, h = rand(0.8, 1.6);
      const g = new THREE.CylinderGeometry(rand(0.4, 0.6), rand(0.8, 1.1), h, 6).translate(0, h / 2 - 0.3, 0);
      _v2.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      c.skin(orient(g.translate(_v2.x, 0, _v2.z), x, y, z, n), i % 3 ? C.barn : C.barn2);
    }
  };
  // ---- body: slate back, pale belly, throat grooves (ventral pleats) running back from the jaw
  const b = R.coat();
  b.grad(bodyLoft(P, -22, 36, 0), C.back, C.belly, -4, 3);
  for (let i = -4; i <= 4; i++) {
    const x0 = i * 2.6, pts = [];
    for (let z = 34; z >= 4; z -= 5) { const s = secAt(P, z), k = Math.max(0, 1 - (x0 / s[1]) ** 2); pts.push(V(x0, s[4] - s[3] * Math.sqrt(k) - 0.1, z)); }
    b.seam(tube(pts, 0.32, 10), C.groove, 0);
  }
  b.seam(new THREE.CylinderGeometry(1, 1, 0.6, 8).scale(0.9, 1, 1.9).translate(-1.3, top(-1.3, 22) - 0.1, 22), C.back, 0);   // blowholes
  b.seam(new THREE.CylinderGeometry(1, 1, 0.6, 8).scale(0.9, 1, 1.9).translate(1.3, top(1.3, 22) - 0.1, 22), C.back, 0);
  const eyes = [];
  for (const sx of [-1, 1]) {
    b.eye(new THREE.SphereGeometry(1.3, 8, 6).translate(sx * 13.6, -2.2, 31), C.eyeT, 0.7);
    b.seam(new THREE.TorusGeometry(1.8, 0.28, 3, 10).rotateY(Math.PI / 2).translate(sx * 13.5, -2.2, 31), C.flank, 0);
    eyes.push(R.pt('body', sx * 14.2, -2.2, 31));
  }
  for (const [x, z] of [[-6, 28], [7, 32], [-11, 10], [12, 4], [-4, -12]]) barnacles(b, 'body', x, top(x, z) - 0.2, z, topN(x, z), 2.2, 6);
  R.mesh('body', b);
  // ---- tail: three segments that beat up and down, then the flukes
  R.grp('tail1', 'body', 0, 0, -20);
  const t1 = R.coat();
  t1.grad(bodyLoft(P, -44, -18, -20), C.back, C.belly, -3, 3);
  t1.skin(vplate([[4, 0], [-7, 0], [-10, 4.6], [-6, 5.4]], 2.2).translate(0, top(0, -30) - 1, -10), C.back);   // small dorsal fin
  R.mesh('tail1', t1);
  R.grp('tail2', 'tail1', 0, 0, -22);
  const t2 = R.coat();
  t2.grad(bodyLoft(P, -66, -40, -42), C.back, C.belly, -1.5, 2.5);
  t2.skin(vplate([[2, -1], [-22, -0.5], [-22, 1.5], [2, 3.6]], 1.6).translate(0, top(0, -52) - 0.4, 0), C.back);   // keel ridge
  R.mesh('tail2', t2);
  R.grp('fluke', 'tail2', 0, 1.8, -22);
  const fk = R.coat();
  const half = [[0, 2], [6, -0.6], [16, -3.2], [26, -5.4], [31, -9.6], [28, -12], [19, -10.6], [9, -9.4], [2, -11.4], [0, -10.2]];
  const flk = [...half, ...half.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
  fk.grad(plate(flk, 1.8, 0.4), C.back, C.belly, -0.2, 0.6);
  fk.skin(bodyLoft(P, -74, -62, -64), C.back);
  for (const sx of [-1, 1]) fk.seam(tube([V(sx * 2, 1.2, -2), V(sx * 12, 1.1, -5), V(sx * 22, 1, -7), V(sx * 29, 0.9, -9.6)], 0.3, 8), C.seamT, 0.25);
  R.mesh('fluke', fk);
  // ---- head: rostrum with tubercles + baleen; the lower jaw drops open on the heart
  R.grp('jawU', 'body', 0, -1, 30);
  R.grp('jawL', 'body', 0, -1, 30);
  const ju = R.coat();
  const UK = [[0, 13.6, 9.6], [8, 13, 8.8], [16, 11.5, 7.2], [24, 9, 5], [30, 6, 3], [34, 3, 1.6], [35.5, 1.2, 0.8]];
  ju.skin(loft(UK.map(([z, rx, ry]) => ({ z, pts: arcTop(rx, ry, 12) }))), C.back);
  ju.inner(new THREE.CylinderGeometry(1, 1, 0.3, 16).scale(11.5, 1, 15).translate(0, -0.25, 16), C.baleen);
  for (let z = 3; z <= 30; z += 2.2) {
    const k = clamp(1 - z / 36, 0.1, 1), rx = lerp(1.6, 13.4, k);
    for (const sx of [-1, 1]) ju.inner(new THREE.BoxGeometry(0.5, 3.2, 1.6).translate(sx * (rx - 1.4), -1.4, z), C.baleen);
  }
  for (const [x, z] of [[0, 30], [-2.6, 26], [2.6, 26], [0, 22], [-4, 20], [4, 20], [-2.4, 16], [2.4, 16], [-5.4, 13], [5.4, 13], [0, 11], [-7, 6], [7, 6]]) {
    const rz = clamp(z, 0, 35.5), k = UK.findIndex(r => r[0] >= rz), a = UK[Math.max(0, k - 1)], c = UK[Math.max(0, k)];
    const t = c[0] === a[0] ? 0 : (rz - a[0]) / (c[0] - a[0]), rx = lerp(a[1], c[1], t), ry = lerp(a[2], c[2], t);
    const y = ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
    ju.skin(new THREE.SphereGeometry(0.9, 6, 4, 0, TAU, 0, Math.PI / 2).translate(x, y - 0.15, z), C.flank);
  }
  R.mesh('jawU', ju);
  const jl = R.coat();
  jl.skin(loft([[0, 13.6, 9.5], [8, 13.4, 9.6], [16, 12.4, 8.6], [24, 10.5, 6.6], [30, 7.5, 4.2], [34.5, 4, 2], [36.5, 1.5, 0.8]].map(([z, rx, ry]) => ({ z, pts: arcBot(rx, ry, 12) }))), C.belly);
  jl.inner(new THREE.CylinderGeometry(1, 1, 0.3, 16).scale(11.5, 1, 15).translate(0, 0.25, 15), C.mouth);
  for (let i = -4; i <= 4; i++) {
    const x0 = i * 2.6, pts = [];
    for (let z = 1; z <= 33; z += 4) { const k = clamp(z / 37, 0, 1), rx = lerp(13.6, 1.5, k * k), ry = lerp(9.6, 1, k * k); pts.push(V(x0 * rx / 13.6, -ry * Math.sqrt(Math.max(0, 1 - (x0 / 13.6) ** 2)) - 0.05, z)); }
    jl.seam(tube(pts, 0.3, 10), C.groove, 0);
  }
  barnacles(jl, 'jawL', 0, -8.6, 22, V(0, -1, 0.3), 2.6, 7);
  R.mesh('jawL', jl);
  // ---- long humpback flippers (scalloped leading edge, barnacles)
  const fins = [];
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'pfL' : 'pfR';
    R.grp(key, 'body', side * 14, -7, 20);
    const c = R.coat();
    const st = [[-2, 5, -4, 2.4], [6, 4, -5, 2.2], [12, 1.8, -7, 2], [17, -0.6, -8.2, 1.8], [22, -2.6, -10, 1.6], [27, -5.4, -12.4, 1.4], [32, -8.6, -14.6, 1.2], [37, -11.6, -17, 1], [42, -15.4, -19.6, 0.8], [46.5, -19.6, -22, 0.4]];
    c.grad(mir(paddle(st), side), C.fin, C.belly, -0.2, 0.6);
    for (const [x, z] of [[9, 3.2], [15, 0.6], [20, -1.4], [25, -4], [30, -7], [35, -10], [40, -13.4]]) c.skin(mir(new THREE.SphereGeometry(1.2, 6, 4).scale(1.1, 0.8, 1).translate(x, 0, z), side), C.fin);   // tubercles
    c.seam(mir(tube([V(2, 1.1, 0), V(14, 1.1, -3), V(28, 1, -9), V(42, 0.8, -17.5)], 0.3, 10), side), C.seamT, 0.25);
    barnacles(c, key, side * 30, 1, -7.5, V(0, 1, 0), 2.2, 6);
    barnacles(c, key, side * 40, 0.8, -15, V(0, 1, 0), 1.6, 4);
    R.mesh(key, c);
    fins.push(R.g[key]);
  }
  const hard = [
    { part: 'body', p: V(-8, Math.min(top(-8, 24) + 0.4, HP_MAX_Y[0]), 24), n: topN(-8, 24) },
    { part: 'body', p: V(8, Math.min(top(8, 24) + 0.4, HP_MAX_Y[1]), 24), n: topN(8, 24) },
    { part: 'body', p: V(0, Math.min(top(0, 4) + 0.4, HP_MAX_Y[2]), 4), n: topN(0, 4) },
    { part: 'pfL', p: V(-15, 1.2, -4), n: V(0, 1, 0) },
    { part: 'pfR', p: V(15, 1.2, -4), n: V(0, 1, 0) },
    { part: 'body', p: V(-10, Math.min(top(-10, -14) + 0.4, HP_MAX_Y[5]), -14), n: topN(-10, -14) },
    { part: 'body', p: V(10, Math.min(top(10, -14) + 0.4, HP_MAX_Y[6]), -14), n: topN(10, -14) },
    { part: 'tail1', p: V(0, top(0, -32) + 0.2, -12), n: V(0, 1, 0.1) },
  ];
  // barnacle plates under every turret
  const bp = R.coat();
  for (const h of hard.filter(h => h.part === 'body')) barnacles(bp, 'body', h.p.x, h.p.y - 0.6, h.p.z, h.n, 3.4, 10);
  R.mesh('body', bp);
  for (const [i, f] of fins.entries()) { const c = R.coat(); const h = hard[3 + i]; barnacles(c, f, h.p.x, h.p.y - 0.8, h.p.z, h.n, 3.2, 9); R.mesh(i ? 'pfR' : 'pfL', c); }
  return {
    hard, core: { part: 'body', p: V(0, 0, 50), r: 4 }, eyes,
    guns: [R.pt('pfL', -46, 0, -21), R.pt('pfR', 46, 0, -21)],
    missiles: [R.pt('body', -1.3, 12, 22), R.pt('body', 1.3, 12, 22)],
    wisps: [R.pt('fluke', -29, 0, -10), R.pt('fluke', 29, 0, -10), R.pt('pfL', -46, 0, -21), R.pt('pfR', 46, 0, -21), R.pt('tail1', 0, 13, -16), R.pt('body', 0, 12, 22), R.pt('body', 0, -10, 0)],
    colliders: [[0, -2, 48, 11], [0, 0, 26, 14], [0, 0, 6, 15], [0, 0, -14, 13], [0, 1, -36, 9], [0, 2, -60, 7], [-32, -10, 10, 7], [32, -10, 10, 7]],
    swimRate: 1.25,
    animate(g, w, T, open) {
      const s = Math.sin(w);
      g.body.position.y = 1.4 * Math.sin(w + 2.2);
      g.body.rotation.x = 0.025 * Math.sin(w + 0.6);
      g.tail1.rotation.x = 0.09 * s;
      g.tail2.rotation.x = 0.16 * Math.sin(w - 0.9);
      g.fluke.rotation.x = 0.3 * Math.sin(w - 1.8);
      fins.forEach((f, i) => { const sd = i ? 1 : -1; f.rotation.set(0.1 * Math.sin(w * 0.5 + 1), sd * (0.12 * Math.sin(w * 0.5)), sd * (-0.28 + 0.2 * Math.sin(w * 0.5 + 0.4))); });
      g.jawL.rotation.x = 0.5 * open;
      g.jawU.rotation.x = -0.1 * open;
    },
  };
}

// ============================================================ CÁ CHÉP HÓA RỒNG — the carp becoming a dragon
const PAL_CACHEP = {
  scale: '#e4562a', scale2: '#f27a30', back: '#b8361c', belly: '#ffd27a', edge: '#ffcf55', fin: '#ff6a2c', finTip: '#ffcd62', whisker: '#ffd86a',
  antler: '#ecc77e', mane: '#d8342a', eyeT: '#ffd040', pupil: '#1a0d08', head: '#e8622c', mouth: '#6a1a22', gill: '#ff6a5a', core: '#ff3a7a', metal: 0.3, rough: 0.36,
};
function buildCaChep(R, C) {
  const P = profile([[44, 10.6, 10.2, 10, 0], [36, 12.5, 13.5, 12.5, 0], [24, 13.8, 15.4, 13.5, 0], [10, 14, 15.8, 13.8, 0], [-6, 13, 14.6, 12.6, 0], [-20, 11, 12.5, 10.5, 0],
    [-34, 8, 9.5, 7.6, 0], [-46, 5, 6.6, 5, 0], [-56, 3.2, 5, 3.6, 0], [-62, 2.6, 5.4, 4, 0]], 4);
  R.grp('body', 'ship');
  R.S.glowT = 0.1;
  const top = (x, z) => { const s = secAt(P, z); return s[4] + s[2] * Math.sqrt(Math.max(0, 1 - (x / s[1]) ** 2)); };
  const scales = (c, zA, zB, zPiv, step) => {
    let col = 0;
    for (let z = zA; z > zB; z -= step, col++) {
      for (let k = 0; k < 8; k++) {
        const a = -1.2 + k * 0.33 + (col % 2 ? 0.165 : 0);
        if (a > 1.32) continue;
        for (const sd of [-1, 1]) {
          const s = secAt(P, z), r = 3.3 * clamp(s[1] / 13, 0.45, 1.05);
          surf(P, z, sd > 0 ? a : Math.PI - a, _p, _n);
          _n.z -= 0.45; _n.normalize();   // scales overlap toward the tail
          const yk = Math.sin(a), colr = yk > 0.75 ? C.back : yk < -0.55 ? C.belly : (col + k) % 2 ? C.scale : C.scale2;
          c.skin(orient(new THREE.CylinderGeometry(r, r, 0.55, 10), _p.x, _p.y, _p.z - zPiv, _n).translate(_n.x * 0.3, _n.y * 0.3, _n.z * 0.3), colr);
          c.seam(orient(ringSeam(r * 0.97, 0.17, 10).translate(0, 0.3, 0), _p.x, _p.y, _p.z - zPiv, _n).translate(_n.x * 0.3, _n.y * 0.3, _n.z * 0.3), C.edge, 0.16, 0.14);
        }
      }
    }
  };
  // ---- body with big scales (red back, orange-gold flanks, gold belly)
  const b = R.coat();
  b.grad(bodyLoft(P, -22, 44, 0, 18, 4), C.scale, C.belly, -6, 4);
  scales(b, 36, -21, 0, 5.4);
  // gills: glowing slits under the gill covers
  for (const sd of [-1, 1]) b.inner(new THREE.CylinderGeometry(1, 1, 0.4, 12, 1, false, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 9, 7).translate(sd * 12.3, 0, 36.5), C.gill, 0.2);
  // mane: flame-like spines behind the head
  for (let i = 0; i < 7; i++) {
    const z = 40 - i * 2.4, y = top(0, z), h = 6.5 - i * 0.6;
    b.seam(new THREE.ConeGeometry(1.4, h, 4).translate(0, h / 2, 0).rotateX(-0.9).translate(0, y - 0.6, z), C.mane, 0.15);
    for (const sd of [-1, 1]) b.seam(new THREE.ConeGeometry(1, h * 0.7, 4).translate(0, h * 0.35, 0).rotateX(-1.0).rotateZ(-sd * 0.7).translate(sd * 4.5, top(sd * 4.5, z) - 0.6, z), C.mane, 0.15);
  }
  R.mesh('body', b);
  // ---- tail segments sweep side to side
  R.grp('tail1', 'body', 0, 0, -20);
  const t1 = R.coat();
  t1.grad(bodyLoft(P, -42, -18, -20), C.scale, C.belly, -4, 3);
  scales(t1, -24.4, -41, -20, 5.4);
  t1.seam(vplate([[0, 0], [-10, 0], [-12, -9], [-8, -7], [-4, -8.6], [0, -5]], 0.9).translate(0, -secAt(P, -28)[3] + 1, -6), C.fin, 0.12);   // anal fin
  R.mesh('tail1', t1);
  R.grp('tail2', 'tail1', 0, 0, -20);
  const t2 = R.coat();
  t2.grad(bodyLoft(P, -62, -38, -40), C.scale, C.belly, -2.5, 2.5);
  scales(t2, -43, -55, -40, 5);
  R.mesh('tail2', t2);
  // ---- caudal fin: two flowing panels
  R.grp('cf1', 'tail2', 0, 0, -20);
  const c1 = R.coat();
  c1.grad(vplate([[2, -4.6], [2, 5], [-13, 13.6], [-13, -12.4]], 1), C.fin, C.finTip, 0, 30);
  for (const y of [-9, -4, 0, 4, 9]) c1.seam(tube([V(0, y * 0.45, 1), V(0, y * 0.9, -6.5), V(0, y * 1.32, -13)], 0.26, 6), C.finTip, 0.3);
  R.mesh('cf1', c1);
  R.grp('cf2', 'cf1', 0, 0, -12.5);
  const c2 = R.coat();
  const lobe = [[0.5, 13.8], [-6, 18], [-13, 23], [-19, 27.5], [-22, 27], [-18, 20], [-14, 12], [-10.5, 5], [-8.4, 0], [-10.5, -5], [-14, -11], [-18, -18], [-21, -25], [-17, -25.5], [-11, -20], [-5, -15], [0.5, -13]];
  c2.grad(vplate(lobe, 0.8), C.fin, C.finTip, 0, 18);
  for (const [ty, tz] of [[26, -20], [18, -16], [9, -12], [-9, -12], [-17, -16], [-24, -19]]) c2.seam(tube([V(0, ty * 0.42, 0.5), V(0, ty * 0.75, tz * 0.55), V(0, ty * 0.98, tz * 0.95)], 0.24, 6), C.finTip, 0.3);
  R.mesh('cf2', c2);
  // ---- dorsal fin: three panels that ripple
  const dors = [];
  const H = [11, 10.5, 9, 6.5];
  for (let i = 0; i < 3; i++) {
    const z0 = 13 - i * 13, key = 'df' + i;
    R.grp(key, 'body', 0, top(0, z0) - 1.2, z0);
    const c = R.coat();
    const dy = top(0, z0 - 13) - top(0, z0);
    c.grad(vplate([[0.5, 0], [0.5, H[i]], [-4, H[i] + 1.2], [-7, H[i] - 0.4], [-10, (H[i] + H[i + 1]) / 2 + dy * 0.7 + 1], [-13.5, H[i + 1] + dy], [-13.5, dy], [0.5, -1]], 0.8), C.fin, C.finTip, 7, 6);
    for (const k of [0, 0.33, 0.66]) { const z = -k * 13; c.seam(tube([V(0, 0.4 + dy * k, z), V(0, H[i] * 0.6 + dy * k, z - 1.5), V(0, H[i] + dy * k * 0.9 - k * 1.5, z - 3)], 0.24, 6), C.finTip, 0.3); }
    R.mesh(key, c);
    dors.push(R.g[key]);
  }
  // ---- pectoral & pelvic fins: long flowing fins in two panels
  const pecs = [], pecs2 = [], pelv = [];
  for (const side of [-1, 1]) {
    const k1 = side < 0 ? 'pfL' : 'pfR', k2 = k1 + '2';
    R.grp(k1, 'body', side * 11.5, -7.5, 30);
    const a = R.coat();
    a.grad(mir(plate([[0, 3], [7, 2], [13, -4], [14, -9], [6, -8], [0, -3]], 0.9), side), C.fin, C.finTip, -2, 4);
    a.seam(mir(tube([V(1, 0.5, 0), V(7, 0.5, -2.5), V(13, 0.5, -7)], 0.24, 6), side), C.finTip, 0.3);
    R.mesh(k1, a);
    R.grp(k2, k1, side * 12, 0, -8);
    const a2 = R.coat();
    a2.grad(mir(plate([[-6, 0], [2, 1.5], [7, -4], [10, -13], [6, -18], [1, -13], [-4, -6]], 0.8), side), C.fin, C.finTip, -2, 4);
    for (const [x, z] of [[9, -12], [5, -16]]) a2.seam(mir(tube([V(0, 0.5, 0), V(x * 0.6, 0.5, z * 0.5), V(x, 0.5, z)], 0.22, 6), side), C.finTip, 0.3);
    R.mesh(k2, a2);
    pecs.push(R.g[k1]); pecs2.push(R.g[k2]);
    const k3 = side < 0 ? 'pvL' : 'pvR';
    R.grp(k3, 'body', side * 6, -12.5, 2);
    const pv = R.coat();
    pv.grad(mir(plate([[0, 2], [5, 0], [9, -8], [6, -11], [1, -6]], 0.7), side), C.fin, C.finTip, -2, 3);
    R.mesh(k3, pv);
    pelv.push(R.g[k3]);
  }
  // ---- gill covers (open with the mouth)
  const gills = [];
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'gL' : 'gR';
    R.grp(key, 'body', side * 12.2, -0.5, 40);
    const c = R.coat();
    c.skin(mir(new THREE.CylinderGeometry(1, 1, 0.7, 14, 1, false, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 10.5, 9).translate(0.4, 0, 0), side), C.head);
    c.seam(mir(new THREE.TorusGeometry(1, 0.035, 3, 14, Math.PI).rotateY(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 10.5, 9).translate(0.8, 0, 0), side), C.edge, 0.45);
    R.mesh(key, c);
    gills.push(R.g[key]);
  }
  // ---- head: upper (eyes, antlers, whiskers) and lower jaw, hinged at the gills
  R.grp('jawU', 'body', 0, 0, 40);
  R.grp('jawL', 'body', 0, 0, 40);
  const hu = R.coat();
  hu.skin(loft([[-1, 11, 10.4], [7, 10, 9.4], [13, 8.4, 7.4], [18, 6, 4.8], [21.5, 3.5, 2.6], [23, 1.6, 1.2]].map(([z, rx, ry]) => ({ z, pts: arcTop(rx, ry, 12) }))), C.head);
  hu.inner(new THREE.CylinderGeometry(1, 1, 0.3, 14).scale(8.6, 1, 10.5).translate(0, -0.25, 10.5), C.mouth);
  hu.seam(new THREE.TorusGeometry(1, 0.08, 3, 16, Math.PI).scale(3.4, 2.4, 1).translate(0, 0.1, 22.4), C.edge, 0.4);   // lip
  const eyes = [];
  for (const sx of [-1, 1]) {
    hu.eye(new THREE.SphereGeometry(2.5, 12, 8).translate(sx * 7.6, 4.4, 10.5), C.eyeT, 0.8);
    hu.skin(new THREE.SphereGeometry(1.25, 8, 6).translate(sx * 9.6, 4.5, 11.2), C.pupil);
    hu.seam(new THREE.TorusGeometry(2.7, 0.3, 3, 12).rotateY(Math.PI / 2 - sx * 0.35).translate(sx * 7.9, 4.4, 10.6), C.edge, 0.5);
    eyes.push(R.pt('jawU', sx * 10, 4.5, 11.2));
    // budding antlers
    const r0 = V(sx * 3.2, 8.6, 5), r1 = V(sx * 5.2, 15.5, 1), r2 = V(sx * 6.8, 19.5, -2.5), t1 = V(sx * 3.6, 16.5, 6), t2 = V(sx * 8.6, 17, 3);
    hu.seam(rod(r0, r1, 0.95, 0.7), C.antler, 0.25);
    hu.seam(rod(r1, r2, 0.7, 0.3), C.antler, 0.25);
    hu.seam(rod(_v2.lerpVectors(r0, r1, 0.6).clone(), t1, 0.5, 0.2), C.antler, 0.25);
    hu.seam(rod(r1.clone(), t2, 0.5, 0.2), C.antler, 0.25);
    // dragon brow ridge
    hu.seam(new THREE.ConeGeometry(0.9, 5, 4).rotateX(-1.2).rotateZ(-sx * 0.4).translate(sx * 6.4, 7.6, 12.5), C.mane, 0.15);
  }
  R.mesh('jawU', hu);
  const hl = R.coat();
  hl.grad(loft([[-1, 10.6, 10], [7, 9.6, 9], [13, 8, 6.6], [18, 5.6, 4], [22, 3, 1.8], [23.5, 1.4, 0.8]].map(([z, rx, ry]) => ({ z, pts: arcBot(rx, ry, 12) }))), C.head, C.belly, -4, 2);
  hl.inner(new THREE.CylinderGeometry(1, 1, 0.3, 14).scale(8.2, 1, 10).translate(0, 0.25, 10), C.mouth);
  for (let i = 0; i < 5; i++) hl.seam(new THREE.ConeGeometry(0.9, 5 - i * 0.5, 4).translate(0, -(5 - i * 0.5) / 2, 0).rotateX(0.7).translate((i % 2 ? 1 : -1) * i * 0.9, -8.6 + i * 0.6, 12 - i * 2.8), C.mane, 0.15);   // beard
  R.mesh('jawL', hl);
  // whiskers: chains of segments that sway with a lag
  const whisk = [];
  const whisker = (side, x, y, z, n, len, r0, rest) => {
    let parent = 'jawU';
    const chain = [];
    for (let i = 0; i < n; i++) {
      const key = `wk${side}${x}${i}`;
      R.grp(key, parent, i ? 0 : side * x, i ? 0 : y, i ? len : z);
      const c = R.coat();
      const r = lerp(r0, r0 * 0.35, i / n);
      c.seam(new THREE.CylinderGeometry(r * 0.75, r, len + 0.3, 5).rotateX(Math.PI / 2).translate(0, 0, len / 2), C.whisker, 0.45);
      R.mesh(key, c);
      chain.push(R.g[key]);
      parent = key;
    }
    whisk.push({ chain, side, rest });
    return chain[n - 1];
  };
  const wt = [whisker(-1, 4.4, -0.6, 20.5, 5, 5.6, 0.55, [0.25, -0.6]), whisker(1, 4.4, -0.6, 20.5, 5, 5.6, 0.55, [0.25, -0.6]),
    whisker(-1, 6.4, -1.4, 16, 3, 3.6, 0.42, [0.5, -1.0]), whisker(1, 6.4, -1.4, 16, 3, 3.6, 0.42, [0.5, -1.0])];
  const hard = [
    { part: 'body', p: V(-8.5, Math.min(top(-8.5, 32) + 0.3, HP_MAX_Y[0]), 32), n: V(-0.5, 1, 0.1) },
    { part: 'body', p: V(8.5, Math.min(top(8.5, 32) + 0.3, HP_MAX_Y[1]), 32), n: V(0.5, 1, 0.1) },
    { part: 'body', p: V(0, Math.min(top(0, 18) + 0.2, HP_MAX_Y[2]), 18), n: V(0, 1, 0.05) },
    { part: 'body', p: surf(P, 6, Math.PI - 0.12, V(), _n).clone(), n: _n.clone() },
    { part: 'body', p: surf(P, 6, 0.12, V(), _n).clone(), n: _n.clone() },
    { part: 'body', p: V(-9, Math.min(top(-9, -16) + 0.3, HP_MAX_Y[5]), -16), n: V(-0.6, 1, 0) },
    { part: 'body', p: V(9, Math.min(top(9, -16) + 0.3, HP_MAX_Y[6]), -16), n: V(0.6, 1, 0) },
    { part: 'tail1', p: V(0, top(0, -30) + 0.2, -10), n: V(0, 1, 0) },
  ];
  return {
    hard, core: { part: 'body', p: V(0, 0, 50), r: 4 }, eyes,
    guns: [R.pt('pfL2', -9, 0, -15), R.pt('pfR2', 9, 0, -15)],
    missiles: [R.pt('df0', 0, 12, -2), R.pt('df1', 0, 11, -2)],
    wisps: [R.pt('cf2', 0, 27, -21), R.pt('cf2', 0, -25, -19), R.pt('pfL2', -8, 0, -16), R.pt('pfR2', 8, 0, -16), R.pt('df1', 0, 10, -6), ...wt],
    colliders: [[0, 0, 50, 10], [0, 0, 30, 14], [0, 0, 8, 15], [0, 0, -14, 13], [0, 0, -36, 8], [0, 0, -60, 9]],
    swimRate: 2.0,
    animate(g, w, T, open) {
      g.body.rotation.y = -0.03 * Math.sin(w);
      g.body.position.y = 0.8 * Math.sin(w * 0.5);
      g.tail1.rotation.y = 0.1 * Math.sin(w - 0.4);
      g.tail2.rotation.y = 0.18 * Math.sin(w - 1.2);
      g.cf1.rotation.y = 0.26 * Math.sin(w - 2.0);
      g.cf2.rotation.y = 0.3 * Math.sin(w - 2.7);
      dors.forEach((d, i) => { d.rotation.z = 0.07 * Math.sin(w - i * 0.7); });
      pecs.forEach((p, i) => { const sd = i ? 1 : -1; p.rotation.set(0.1 * Math.sin(w * 0.8), sd * 0.1 * Math.sin(w * 0.8 + 1), sd * (-0.32 + 0.22 * Math.sin(w * 0.8))); });
      pecs2.forEach((p, i) => { const sd = i ? 1 : -1; p.rotation.set(0, sd * 0.2 * Math.sin(w * 0.8 - 1.2), sd * 0.18 * Math.sin(w * 0.8 - 1)); });
      pelv.forEach((p, i) => { const sd = i ? 1 : -1; p.rotation.set(0, 0, sd * (-0.4 + 0.15 * Math.sin(w + i))); });
      gills.forEach((p, i) => { const sd = i ? 1 : -1; p.rotation.y = -sd * (0.06 * Math.sin(w * 1.3) + 0.75 * open); });
      for (const wk of whisk) wk.chain.forEach((s, i) => {
        s.rotation.x = (i ? 0.16 : wk.rest[0]) + 0.16 * Math.sin(T * 1.7 - i * 0.8 + wk.side);
        s.rotation.y = wk.side * ((i ? -0.12 : -wk.rest[1]) + 0.14 * Math.sin(T * 1.3 - i * 0.7));
      });
      g.jawU.rotation.x = -0.3 * open;
      g.jawL.rotation.x = 0.48 * open;
    },
  };
}

const MODELS = { kimquy: [buildKimQuy, PAL_KIMQUY], kinhngu: [buildKinhNgu, PAL_KINHNGU], cachep: [buildCaChep, PAL_CACHEP] };

// A shadow growth clamped onto the beast: obsidian shards round a red-violet eye, twin spines as barrels.
function turretGeo(S) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU, h = rand(3, 4.6);
    parts.push(paint(new THREE.ConeGeometry(0.85, h, 4).translate(0, h / 2, 0).rotateZ(0.5).rotateY(a).translate(Math.cos(a) * 2.2, 0, -Math.sin(a) * 2.2), '#17121f'));
  }
  parts.push(paint(new THREE.OctahedronGeometry(2.5, 0).scale(1, 0.95, 1.15).translate(0, 1.8, 0), '#221a2e'));
  parts.push(paint(new THREE.SphereGeometry(1.0, 8, 6).translate(0, 2.1, 2.2), S.eye, 1));
  for (const x of [-0.95, 0.95]) parts.push(paint(new THREE.ConeGeometry(0.45, 4.4, 5).rotateX(Math.PI / 2).translate(x, 1.6, 3.6), '#100c16'));
  parts.push(paint(new THREE.TorusGeometry(3, 0.24, 3, 10).rotateX(Math.PI / 2).translate(0, 0.25, 0), S.seam, 1));
  return mergeGeometries(parts);
}

export class WarshipBoss {
  constructor(cfg = {}) {
    this.cfg = cfg;
    const [build, pal] = MODELS[cfg.model] || MODELS.kimquy;
    const C = { ...pal, ...(cfg.palette || {}) };
    this.C = C;
    const S = { ink: new THREE.Color(C.ink || '#06040b'), seam: C.seam || '#b46bff', eye: C.eye || '#ff3a8a', show: C.show ?? 0.1 };
    this.S = S;
    this.final = !!cfg.final;
    this.size = this.final ? 1.85 : 1.5;
    this.coreHp = Math.round(170 * (cfg.hp || 1));
    this.turretHp = Math.round(9 * (cfg.hp || 1));
    this.nTur = Math.min(HP_MAX_Y.length, cfg.turrets || 6);
    this.mat = emissiveVertexMaterial({ roughness: C.rough ?? 0.42, metalness: C.metal ?? 0.3 }, 3.2);
    this.tmat = emissiveVertexMaterial({ roughness: 0.3, metalness: 0.5 }, 3.2);
    this.root = new THREE.Group();
    this.ship = new THREE.Group();
    this.root.add(this.ship);
    this.rig = new Rig(this.ship, this.mat, S);
    this.M = build(this.rig, C);
    const g = this.rig.g;
    // the possessed heart
    const cc = new THREE.Color(C.core);
    this.coreBase = cc;
    this.coreGold = new THREE.Color('#ffc860');
    this.coreCol = new THREE.Color();
    this.coreMat = new THREE.MeshBasicMaterial({ color: cc.clone().multiplyScalar(3) });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(this.M.core.r, 2), this.coreMat);
    this.core.position.copy(this.M.core.p);
    g[this.M.core.part].add(this.core);
    // shadow growths on the hardpoints
    const gt = turretGeo(S);
    this.turrets = [];
    for (let i = 0; i < this.nTur; i++) {
      const hp = this.M.hard[i];
      const mount = new THREE.Group();
      mount.position.copy(hp.p);
      mount.quaternion.setFromUnitVectors(UP, hp.n.clone().normalize());
      const tm = new THREE.Mesh(gt, this.tmat);
      tm.scale.setScalar(1.15);
      mount.add(tm);
      g[hp.part].add(mount);
      this.turrets.push({ mesh: tm, mount, hp: this.turretHp, alive: true, pos: new THREE.Vector3(), fireT: rand(1, 3), flash: 0, burn: 0 });
    }
    this.prepCoat();
    this.ship.scale.setScalar(this.size);
    this.focusPos = new THREE.Vector3();
    this.corePos = new THREE.Vector3();
    this.head = this.root;
    this.buildTargets();
    this.active = false;
  }

  // Per-vertex sweep values (distance from the heart, with a little noise) and FX sample points.
  prepCoat() {
    this.ship.updateMatrixWorld(true);
    const c0 = this.core.getWorldPosition(new THREE.Vector3());
    let maxD = 1;
    const dists = [];
    for (const m of this.rig.meshes) {
      const pos = m.geometry.attributes.position, d = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        d[i] = _v.distanceTo(c0) + 5 * Math.sin(_v.x * 0.31 + _v.y * 0.47) * Math.sin(_v.z * 0.23 - _v.x * 0.17);
        maxD = Math.max(maxD, d[i]);
      }
      dists.push(d);
    }
    this.samples = [];
    this.rig.meshes.forEach((m, k) => {
      const d = dists[k], sw = new Float32Array(d.length);
      for (let i = 0; i < d.length; i++) sw[i] = clamp(d[i] / maxD, 0, 1);
      m.geometry.userData.sw = sw;
      const pos = m.geometry.attributes.position;
      const ns = Math.min(140, Math.ceil(pos.count / 30));
      for (let j = 0; j < ns; j++) { const i = (Math.random() * pos.count) | 0; this.samples.push({ m, p: new THREE.Vector3().fromBufferAttribute(pos, i), s: sw[i] }); }
    });
    this.coatP = -1;
  }

  // p: 0 = fully possessed … 1 = fully purified; a golden front sweeps out from the heart.
  setCoat(p) {
    if (p === this.coatP) return;
    this.coatP = p;
    this.mat.metalness = lerp(0.12, this.C.metal ?? 0.3, p);
    this.mat.roughness = lerp(0.5, this.C.rough ?? 0.42, p);
    const W = 0.22, pp = p * (1 + W);
    for (const m of this.rig.meshes) {
      const ud = m.geometry.userData, ca = m.geometry.attributes.color, ea = m.geometry.attributes.aEmit;
      const col = ca.array, em = ea.array, { tc, sc, te, se, sw } = ud;
      for (let i = 0, n = sw.length; i < n; i++) {
        let b = (pp - sw[i]) / W;
        b = b < 0 ? 0 : b > 1 ? 1 : b;
        const e = b * (1 - b) * 4, i3 = i * 3;
        col[i3] = sc[i3] + (tc[i3] - sc[i3]) * b + e * 0.9;
        col[i3 + 1] = sc[i3 + 1] + (tc[i3 + 1] - sc[i3 + 1]) * b + e * 0.62;
        col[i3 + 2] = sc[i3 + 2] + (tc[i3 + 2] - sc[i3 + 2]) * b + e * 0.2;
        em[i] = se[i] + (te[i] - se[i]) * b + e * 0.9;
      }
      ca.needsUpdate = true; ea.needsUpdate = true;
    }
  }

  buildTargets() {
    const self = this;
    this.coreT = {
      pos: this.corePos, radius: 7, alive: true, lockable: false, hittable: false, hp: this.coreHp,
      hit(dmg, p, src) {
        if (!self.active || self.phase === 'dying') return 'none';
        if (self.doorOpen < 0.55) { sparks(p || this.pos, null, 6, [3, 3.5, 4], 25, 1); return 'armor'; }
        this.hp -= dmg * (src === 'bomb' ? 0.6 : 1);
        self.flash = 1;
        emit('bossHit');
        if (this.hp <= 0) { this.hp = 0; self.die(); return 'kill'; }
        return 'hit';
      },
    };
    this.hullT = { pos: this.focusPos, radius: 9 * this.size, alive: true, lockable: false, hittable: true, hit: () => 'armor' };
    this.turT = this.turrets.map((tr) => {
      const t = {
        pos: tr.pos, radius: 4.6 * this.size, alive: true, lockable: true, hittable: true,
        hit(dmg) {
          if (!tr.alive || self.phase === 'intro') return 'none';
          tr.hp -= dmg; tr.flash = 1; emit('bossHit');
          if (tr.hp <= 0) { self.destroyTurret(tr); return 'kill'; }
          return 'hit';
        },
      };
      tr.target = t;
      return t;
    });
  }

  get maxHp() { return this.turretHp * this.nTur + this.coreHp; }
  get hp() { let h = this.coreT.hp; for (const t of this.turrets) if (t.alive) h += Math.max(0, t.hp); return h; }
  get focus() { return this.focusPos; }
  get headPos() { return this.focusPos; }
  botTarget() {
    for (const t of this.turrets) if (t.alive) return t.pos;
    return this.doorOpen > 0.5 ? this.corePos : this.focusPos;
  }

  start() {
    this.active = true;
    this.phase = 'intro'; this.pt = 0; this.t = 0;
    this.doorOpen = 0; this.doorTarget = 0; this.flash = 0;
    this.enraged = false; this.sub = 'strafe'; this.subT = 3; this.cycle = 0;
    this.beamLoop = null; this.chargeLoop = null; this.beamTick = 0;
    this.missileT = 5; this.broadT = 7; this.burstT = 3; this.droneT = 6;
    this.reported = false; this.roared = false; this.dT = 0; this.goldDone = false; this.leaveRoar = false;
    this.swim = 0; this.swimRate = this.M.swimRate; this.turn = 0; this.depV = 0; this.awayU = 1; this.fade = 0; this.shudder = 0;
    this.coreT.hp = this.coreHp; this.coreT.alive = true;
    for (const t of this.turrets) { t.hp = this.turretHp; t.alive = true; t.mount.visible = true; t.target.alive = true; t.flash = 0; t.burn = 0; }
    this.mat.userData.tint.value.setRGB(1, 1, 1);
    this.mat.userData.emit.value = 3.2;
    this.mat.userData.flash.value = 0;
    this.coatP = -1; this.setCoat(0);
    this.core.visible = true; this.core.scale.setScalar(1);
    this.hs = 520; this.hu = 0; this.hv = 260; this.bank = 0;
    this.ship.visible = true; this.ship.scale.setScalar(this.size);
    G.scene.add(this.root);
    for (const t of [this.coreT, this.hullT, ...this.turT]) TARGETS.add(t);
    this.place(0);
  }

  stop() {
    if (this.active && this.phase === 'dying' && G.slowMo < 1) G.slowMo = 1;
    this.active = false;
    G.scene.remove(this.root);
    for (const t of [this.coreT, this.hullT, ...this.turT]) TARGETS.delete(t);
    if (this.beamLoop) { this.beamLoop.stop(0.2); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.2); this.chargeLoop = null; }
  }

  turretsLeft() { let n = 0; for (const t of this.turrets) if (t.alive) n++; return n; }
  destroyTurret(tr) {
    tr.alive = false; tr.target.alive = false; tr.mount.visible = false;
    this.shadowBurst(tr.pos, 1.6);
    AudioSys.sfx('explodeL', { pitch: 0.8 }); addShake(0.35);
    tr.burn = 5;
    emit('bossTurretDown', this.turretsLeft());
    if (this.turretsLeft() === 0) {
      this.phase = 'p2'; this.pt = 0; this.sub = 'strafe'; this.subT = 1.5;
      AudioSys.sfx('roar', { pitch: 0.7 }); addShake(0.5);
      emit('bossPhase', 2);
    }
  }

  // a shadow growth crumbling: ink smoke, dark motes and violet sparks, with a glint of gold underneath
  shadowBurst(p, s = 1) {
    railFrame(G.rail.d + this.hs, _p, _f, _r);
    const fv = G.rail.speed * 0.85;
    for (let i = 0; i < 14 * s; i++) {
      _v.set(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, 14) * s);
      FX.smoke.spawn(p.x, p.y, p.z, _f.x * fv + _v.x, _f.y * fv + _v.y + 3, _f.z * fv + _v.z, rand(0.9, 1.6), rand(2, 3.5) * s, rand(7, 11) * s,
        [0.05, 0.035, 0.08, 0.9], [0.16, 0.1, 0.24, 0], 1, { rotV: rand(-1, 1), fadeIn: 0.04 });
    }
    for (let i = 0; i < 26 * s; i++) {
      _v.set(rand(-1, 1), rand(-0.3, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(10, 40) * s);
      FX.smoke.spawn(p.x, p.y, p.z, _f.x * fv + _v.x, _f.y * fv + _v.y, _f.z * fv + _v.z, rand(0.8, 1.8), rand(0.5, 0.9), 0.2, [0.03, 0.02, 0.05, 1], [0.1, 0.05, 0.16, 0], 1, { drag: 1.5 });
    }
    sparks(p, null, Math.round(16 * s), [3.2, 1.2, 6], 45, 1);
    sparks(p, null, Math.round(6 * s), [6, 4.4, 1.6], 25, 1);
    FX.add.spawn(p.x, p.y, p.z, _f.x * fv, _f.y * fv, _f.z * fv, 0.4, 2 * s, 16 * s, [1.6, 0.7, 3, 0.8], [0.4, 0.1, 0.8, 0], 3, { rot: 0 });
    glow(p, 26 * s, 3, 1.4, 5, 1);
  }

  die() {
    this.phase = 'dying'; this.pt = 0; this.dT = 0;
    this.coreT.alive = false;
    this.doorTarget = 1;
    if (this.beamLoop) { this.beamLoop.stop(0.1); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.1); this.chargeLoop = null; }
    AudioSys.sfx('roar', { pitch: 0.6 });
    bigFlash(0.7, [0.85, 0.6, 1.1]); addShake(0.8);
    G.slowMo = 0.45;
    this.awayU = this.hu >= 0 ? -1 : 1;
    this.mat.userData.tint.value.setRGB(1, 1, 1);
    this.mat.userData.emit.value = 3.2;
    this.shadowBurst(this.corePos, 2.2);
    emit('bossDying');
  }

  // ---------------------------------------------------------------- behaviour
  update(dt) {
    if (!this.active) return;
    this.t += dt; this.pt += dt;
    const P = G.player, T = this.t;
    let ts = this.hs, tu = this.hu, tv = this.hv, k = 1.8;
    const enr = this.enraged;
    let rate = this.M.swimRate * (enr ? 1.25 : 1);
    switch (this.phase) {
      case 'intro': {
        const e = easeOutCubic(clamp(this.pt / 5.2, 0, 1));
        ts = lerp(520, 240, e); tv = lerp(260, 40, e); tu = Math.sin(this.pt * 0.6) * 10; k = 4;
        rate *= 1.4;
        if (this.pt > 0.6 && !this.roared) { this.roared = true; AudioSys.sfx('roar', { pitch: 0.55 }); addShake(0.6); }
        if (this.pt > 6) { this.phase = 'p1'; this.pt = 0; emit('bossPhase', 1); }
        break;
      }
      case 'p1': {
        ts = 215 + 25 * Math.sin(T * 0.33);
        tu = 34 * Math.sin(T * 0.27);
        tv = 33 + 7 * Math.sin(T * 0.41 + 1);
        this.turretFire(dt);
        this.missiles(dt, 8);
        this.broadside(dt);
        break;
      }
      case 'p2': {
        this.subT -= dt;
        switch (this.sub) {
          case 'strafe':
            ts = 215 + 20 * Math.sin(T * 0.5); tu = 36 * Math.sin(T * (enr ? 0.42 : 0.3)); tv = 34 + 8 * Math.sin(T * 0.6);
            this.doorTarget = 0;
            this.missiles(dt, enr ? 5 : 7);
            if (enr) { this.ringBursts(dt); this.launchDrones(dt); }
            if (this.subT <= 0) { this.sub = 'approach'; this.subT = 2.2; }
            break;
          case 'approach':
            ts = damp(this.hs, 175, 2, dt); tu = damp(this.hu, P.u * 0.4, 2, dt); tv = damp(this.hv, clamp(P.v + 2, 22, 46), 2, dt);
            this.doorTarget = 0.25;
            if (this.subT <= 0) { this.sub = 'charge'; this.subT = enr ? 1.3 : 1.8; this.chargeLoop = AudioSys.loop('beamCharge'); emit('bossCharge'); }
            break;
          case 'charge':
            ts = 175; tu = damp(this.hu, P.u * 0.5, 1.5, dt); tv = damp(this.hv, clamp(P.v + 2, 22, 46), 1.5, dt);
            this.doorTarget = 1; rate *= 0.4;
            this.chargeFx();
            if (this.subT <= 0) {
              if (this.chargeLoop) { this.chargeLoop.stop(0.05); this.chargeLoop = null; }
              this.sub = 'beam'; this.subT = enr ? 2.1 : 2.6; this.beamT = 0; this.beamDir = P.u > 0 ? -1 : 1; this.beamLoop = AudioSys.loop('beam'); addShake(0.4);
            }
            break;
          case 'beam':
            ts = 175; this.doorTarget = 1; rate *= 0.4;
            this.beamFx(dt);
            if (this.subT <= 0) { if (this.beamLoop) { this.beamLoop.stop(0.15); this.beamLoop = null; } this.sub = 'open'; this.subT = enr ? 2.6 : 3.4; }
            break;
          case 'open':
            ts = 180 + Math.sin(T * 1.5) * 6; tu = damp(this.hu, P.u * 0.3 + Math.sin(T) * 12, 1, dt); tv = damp(this.hv, 32 + Math.sin(T * 1.3) * 6, 1, dt);
            this.doorTarget = 1; rate *= 0.7;
            if (Math.random() < dt * (enr ? 1.6 : 1.1)) this.coreSpread();
            if (this.subT <= 0) { this.sub = 'strafe'; this.subT = enr ? 3.5 : 5; this.cycle++; }
            break;
        }
        if (!this.enraged && this.coreT.hp < this.coreHp * 0.5) {
          this.enraged = true;
          this.mat.userData.tint.value.setRGB(1.35, 0.7, 0.9);
          this.mat.userData.emit.value = 5;
          AudioSys.sfx('roar', { pitch: 0.8 });
          emit('bossPhase', 3);
        }
        break;
      }
      case 'dying': {
        // PURIFICATION — timeline in real seconds
        const D = (this.dT += G.rdt);
        if (D > 0.9 && G.slowMo < 1) G.slowMo = Math.min(1, G.slowMo + G.rdt * 2.5);
        const pk = clamp((D - 0.35) / 1.9, 0, 1);
        this.setCoat(pk);
        this.shudder = D < 1.6 ? (1.6 - D) / 1.6 : 0;
        this.doorTarget = D < 1.2 ? 1 : 0;
        rate = this.M.swimRate * (D < 2.4 ? 0.35 : 1.5);
        if (D < 2.6) { ts = 170; tv = clamp(P.v + 10, 26, 48); tu = P.u * 0.3; k = 1.1; }
        else {
          this.depV = damp(this.depV, 95, 0.9, dt);
          this.hs += this.depV * dt; this.hv += this.depV * 0.32 * dt; this.hu += this.awayU * this.depV * 0.12 * dt;
          ts = this.hs; tv = this.hv; tu = this.hu;
        }
        if (D > 0.25 && D < 2.6) this.peelFx(pk, dt);
        if (D >= 2.25 && !this.goldDone) {
          this.goldDone = true;
          bigFlash(0.75, [1.0, 0.82, 0.45]); addShake(0.4);
          AudioSys.sfx('powerUp', { pitch: 0.7 }); AudioSys.sfx('goldRing', { pitch: 0.8 });
          this.goldBurst(1);
        }
        this.turn = Math.PI * easeInOutCubic(clamp((D - 2.6) / 2.1, 0, 1));
        if (D > 2.7 && !this.leaveRoar) { this.leaveRoar = true; AudioSys.sfx('roar', { pitch: 1.25, vol: 0.7 }); }
        if (D > 2.3 && D < 5.8) this.goldTrail(dt, D);
        this.fade = clamp((D - 4.9) / 0.9, 0, 1);
        if (D >= 5.8 && this.ship.visible) {
          this.goldBurst(2.2);
          AudioSys.sfx('shieldUp', { pitch: 1.2, vol: 0.8 });
          this.ship.visible = false;
          G.slowMo = 1;
          if (!this.reported) { this.reported = true; emit('bossDefeated'); }
        }
        break;
      }
    }
    this.swim += dt * rate;
    const prevU = this.hu;
    this.hs = damp(this.hs, ts, k, dt); this.hu = damp(this.hu, tu, k, dt); this.hv = damp(this.hv, tv, k, dt);
    if (dt > 0) this.bank = damp(this.bank, clamp(-(this.hu - prevU) / dt / 40, -0.5, 0.5), 3, dt);
    this.doorOpen = damp(this.doorOpen, this.doorTarget, 4, dt);
    this.place(dt);
    this.collide();
  }

  place(dt) {
    railToWorld(G.rail.d + this.hs, this.hu, this.hv, this.focusPos);
    railFrame(G.rail.d + this.hs, _p, _f, _r);
    this.root.position.copy(this.focusPos);
    this.root.rotation.set(0, Math.atan2(-_f.x, -_f.z) + this.turn * (this.awayU > 0 ? -1 : 1), 0);   // local +Z (the head) faces back down the rail
    const dying = this.phase === 'dying', D = this.dT;
    const sh = this.shudder || 0;
    const turnK = this.turn / Math.PI;
    this.ship.rotation.set(-0.08 + Math.sin(this.t * 0.7) * 0.02 + sh * 0.03 * Math.sin(this.t * 40) - 0.32 * turnK,
      sh * 0.02 * Math.sin(this.t * 33),
      this.bank + (dying ? this.awayU * 0.45 * Math.sin(turnK * Math.PI) : 0));
    if (dying) this.ship.scale.setScalar(this.size * (1 - 0.12 * this.fade));
    this.M.animate(this.rig.g, this.swim, this.t, this.doorOpen);
    this.root.updateMatrixWorld(true);
    this.core.getWorldPosition(this.corePos);
    const P = G.player;
    for (const t of this.turrets) {
      t.mesh.localToWorld(t.pos.set(0, 0.4, 0));
      if (t.alive) {
        _v.copy(P.pos);
        t.mount.worldToLocal(_v);
        t.mesh.rotation.y = Math.atan2(_v.x, _v.z);
        t.flash = Math.max(0, t.flash - dt * 6);
      } else if (t.burn > 0 && !dying) {
        // the wound the growth left: ink wisps rising, a few violet embers
        t.burn = Math.max(0.8, t.burn - dt * 0.4);
        if (Math.random() < dt * 14 * t.burn / 5) {
          railFrame(G.rail.d + this.hs, _p, _f, _r);
          const fv = G.rail.speed * 0.9;
          FX.smoke.spawn(t.pos.x + rand(-2, 2), t.pos.y + 1, t.pos.z + rand(-2, 2), _f.x * fv + rand(-1, 1), _f.y * fv + rand(4, 8), _f.z * fv + rand(-1, 1), 1.4, 2, 6.5, [0.05, 0.03, 0.08, 0.7], [0.16, 0.1, 0.24, 0], 1, { fadeIn: 0.08, rotV: rand(-1, 1) });
          if (Math.random() < 0.4) FX.add.spawn(t.pos.x, t.pos.y + 1, t.pos.z, _f.x * fv + rand(-3, 3), _f.y * fv + rand(4, 10), _f.z * fv + rand(-3, 3), 0.8, 0.5, 0.1, [2.4, 1.0, 4.4, 1], [0.6, 0.2, 1.2, 0], 0, {});
        }
      }
    }
    // eyes, shadow wisps
    const pk = dying ? clamp((D - 0.35) / 1.9, 0, 1) : 0;
    for (const e of this.M.eyes) {
      e.getWorldPosition(_v);
      glow(_v, (5 + 2 * Math.sin(this.t * 6)) * this.size * (1 - 0.5 * pk) * (1 - this.fade), lerp(4, 4, pk), lerp(0.8, 3, pk), lerp(2.6, 1.2, pk), 0.9);
    }
    if (!dying || pk < 0.9) this.wisps(dt, 1 - pk);
    // the heart
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 10);
    const open = this.doorOpen;
    const b = this.coreCol.copy(this.coreBase).lerp(this.coreGold, pk);
    this.core.visible = open > 0.05 || !dying;
    this.coreMat.color.setRGB(b.r * (2 + 5 * open * pulse) + this.flash * 6, b.g * (2 + 5 * open * pulse) + this.flash * 5, b.b * (2 + 5 * open * pulse) + this.flash * 5);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.userData.flash.value = this.flash * 0.5 + this.fade * 1.4;
    if (open > 0.3) glow(this.corePos, 14 * open * pulse * this.size, b.r * 3 * open, b.g * 3 * open, b.b * 3 * open, 0.9);
    this.coreT.hittable = this.phase === 'p2';
    this.coreT.lockable = open > 0.55 && this.phase === 'p2';
    this.hullT.hittable = this.phase !== 'intro' && this.phase !== 'dying';
    for (const t of this.turrets) t.target.hittable = t.alive && this.phase !== 'intro';
  }

  wisps(dt, amt) {
    const W = this.M.wisps;
    railFrame(G.rail.d + this.hs, _p, _f, _r);
    const fv = G.rail.speed * (this.phase === 'dying' ? 0.9 : 1.08);
    const n = dt * 26 * amt * (this.enraged ? 1.6 : 1);
    for (let i = 0; i < 4 && Math.random() < n - i; i++) {
      W[(Math.random() * W.length) | 0].getWorldPosition(_v);
      FX.smoke.spawn(_v.x + rand(-1.5, 1.5), _v.y + rand(-1.5, 1.5), _v.z + rand(-1.5, 1.5), _f.x * fv + rand(-2, 2), _f.y * fv + rand(-1, 3), _f.z * fv + rand(-2, 2),
        rand(1.2, 2), rand(1.5, 2.5) * this.size, rand(5, 8) * this.size, [0.04, 0.03, 0.07, 0.6], [0.14, 0.08, 0.22, 0], 1, { fadeIn: 0.15, rotV: rand(-1, 1) });
      if (Math.random() < 0.35) FX.add.spawn(_v.x, _v.y, _v.z, _f.x * fv + rand(-4, 4), _f.y * fv + rand(-2, 5), _f.z * fv + rand(-4, 4), rand(0.6, 1.1), 0.7, 0.15, [2, 0.8, 3.8, 1], [0.6, 0.2, 1.2, 0], 0, {});
    }
  }

  // The shadow lifting off the purification front: ink smoke and violet sparks, gold glints underneath.
  peelFx(pk, dt) {
    const front = pk * 1.22 - 0.11;
    railFrame(G.rail.d + this.hs, _p, _f, _r);
    const fv = G.rail.speed * 0.9;
    const S = this.samples;
    let made = 0;
    for (let tries = 0; tries < 60 && made < Math.ceil(dt * 160); tries++) {
      const sm = S[(Math.random() * S.length) | 0];
      if (Math.abs(sm.s - front) > 0.09) continue;
      made++;
      _v.copy(sm.p).applyMatrix4(sm.m.matrixWorld);
      _v2.subVectors(_v, this.focusPos).normalize().multiplyScalar(rand(5, 14));
      FX.smoke.spawn(_v.x, _v.y, _v.z, _f.x * fv + _v2.x, _f.y * fv + _v2.y + rand(3, 8), _f.z * fv + _v2.z, rand(1.1, 1.8), rand(2, 3.4) * this.size, rand(7, 11) * this.size,
        [0.035, 0.025, 0.06, 0.85], [0.14, 0.08, 0.22, 0], 1, { fadeIn: 0.05, rotV: rand(-1.2, 1.2) });
      if (Math.random() < 0.5) FX.add.spawn(_v.x, _v.y, _v.z, _f.x * fv + _v2.x * 2.5, _f.y * fv + _v2.y * 2.5 + 4, _f.z * fv + _v2.z * 2.5, rand(0.4, 0.8), 0.6, 0.1, [2.6, 1.0, 5, 1], [0.8, 0.2, 1.4, 0], 0, { stretch: 0.03 });
      if (Math.random() < 0.35) FX.add.spawn(_v.x, _v.y, _v.z, _f.x * fv, _f.y * fv + 2, _f.z * fv, rand(0.5, 0.9), 1.2 * this.size, 0.2, [5, 3.6, 1.2, 1], [2, 1, 0.2, 0], 0, {});
    }
  }

  goldBurst(s) {
    railFrame(G.rail.d + this.hs, _p, _f, _r);
    const fv = G.rail.speed * 0.9;
    glow(this.focusPos, 120 * s, 4, 3, 1.2, 1);
    FX.add.spawn(this.focusPos.x, this.focusPos.y, this.focusPos.z, _f.x * fv, _f.y * fv, _f.z * fv, 0.7, 10 * s, 90 * s, [3, 2.2, 0.9, 0.9], [1, 0.6, 0.1, 0], 3, { rot: 0 });
    const S = this.samples;
    for (let i = 0; i < 90 * s; i++) {
      const sm = S[(Math.random() * S.length) | 0];
      _v.copy(sm.p).applyMatrix4(sm.m.matrixWorld);
      _v2.subVectors(_v, this.focusPos).normalize().multiplyScalar(rand(8, 30) * Math.sqrt(s));
      FX.add.spawn(_v.x, _v.y, _v.z, _f.x * fv + _v2.x, _f.y * fv + _v2.y + 4, _f.z * fv + _v2.z, rand(0.8, 1.8), rand(0.8, 1.6) * s, 0.2, [5, 3.6, 1.3, 1], [2.4, 1.2, 0.2, 0], 0, { drag: 1.2 });
    }
  }

  goldTrail(dt, D) {
    railFrame(G.rail.d + this.hs, _p, _f, _r);
    const fv = G.rail.speed * 0.95;
    const S = this.samples, n = dt * (40 + 160 * this.fade);
    for (let i = 0; i < 8 && Math.random() < n - i; i++) {
      const sm = S[(Math.random() * S.length) | 0];
      _v.copy(sm.p).applyMatrix4(sm.m.matrixWorld);
      FX.add.spawn(_v.x, _v.y, _v.z, _f.x * fv + rand(-3, 3), _f.y * fv + rand(-1, 4), _f.z * fv + rand(-3, 3), rand(0.8, 1.6), rand(0.8, 1.5) * this.size, 0.2, [4, 3, 1.1, 1], [1.6, 0.9, 0.2, 0], 0, {});
    }
    glow(this.focusPos, (40 + 60 * this.fade) * this.size, 2.4, 1.8, 0.7, 0.5 + 0.5 * this.fade);
  }

  collide() {
    const P = G.player;
    if (!P.alive || this.phase === 'intro' || this.phase === 'dying') return;
    const s = this.size, mw = this.rig.g.body.matrixWorld;
    let hit = false;
    for (const [x, y, z, r] of this.M.colliders) {
      _v.set(x, y, z).applyMatrix4(mw);
      if (_v.distanceToSquared(P.pos) < (r * s + 2.4) ** 2) { hit = true; break; }
    }
    if (hit && P.damage(16)) { P.vu = (P.u > this.hu ? 1 : -1) * 30; P.vv = -20; }
  }

  turretFire(dt) {
    for (const t of this.turrets) {
      if (!t.alive) continue;
      t.fireT -= dt;
      if (t.fireT > 0) continue;
      t.fireT = rand(1.6, 2.8) / diff().fire;
      const dist = t.pos.distanceTo(G.player.pos);
      if (dist < 40 || dist > 650) continue;
      if (Math.random() < 0.35) {
        const tp = t.pos.clone();
        enemyShot(tp, aimAtPlayer(tp, 175, 0.02), 'laser');
        enemyShot(tp, aimAtPlayer(tp, 165, 0.05), 'laser');
      } else enemyShot(t.pos, aimAtPlayer(t.pos, 150, 0.03), 'orb');
      AudioSys.sfx('enemyShot', { vol: 0.5, pitch: 0.8 });
    }
  }

  broadside(dt) {
    this.broadT -= dt;
    if (this.broadT > 0) return;
    this.broadT = rand(6, 8) / diff().fire;
    for (const gun of this.M.guns) {
      gun.getWorldPosition(_v);
      const base = aimAtPlayer(_v, 130, 0);
      for (const a of [-0.24, -0.12, 0, 0.12, 0.24]) enemyShot(_v, base.clone().applyAxisAngle(_up, a), 'orb');
    }
    AudioSys.sfx('enemyShot', { pitch: 0.6 });
  }

  missiles(dt, every) {
    this.missileT -= dt;
    if (this.missileT > 0) return;
    this.missileT = every / diff().fire;
    const n = this.final ? 4 : 2;
    for (let i = 0; i < n; i++) {
      this.M.missiles[i % this.M.missiles.length].getWorldPosition(_v);
      const v = aimAtPlayer(_v, 70, 0).add(_v2.set(rand(-30, 30), 60, rand(-10, 10)));
      enemyShot(_v, v, 'missile', { turn: 1.5, life: 6 });
    }
    AudioSys.sfx('missile');
  }

  ringBursts(dt) {
    this.burstT -= dt;
    if (this.burstT > 0) return;
    this.burstT = rand(2.4, 3.4) / diff().fire;
    const base = aimAtPlayer(this.focusPos, 115, 0);
    const axis = base.clone().normalize();
    const perp = new THREE.Vector3().crossVectors(axis, _up).normalize();
    for (let i = 0; i < 12; i++) {
      const off = perp.clone().applyAxisAngle(axis, i / 12 * TAU).multiplyScalar(26);
      enemyShot(this.focusPos, base.clone().add(off), 'orb');
    }
    AudioSys.sfx('enemyShot', { pitch: 0.7 });
  }

  launchDrones(dt) {
    this.droneT -= dt;
    if (this.droneT > 0) return;
    this.droneT = this.final ? 9 : 13;
    wave('drone', 'circle', 6, (i) => ({ s: G.rail.d + this.hs, dist: 120, enter: 2, stay: 6, r: 16, a0: i / 6 * TAU, spin: 1.6, u: this.hu * 0.5, v: clamp(this.hv - 10, 16, 50) }), {});
  }

  coreSpread() {
    const base = aimAtPlayer(this.corePos, 150, 0);
    for (const a of [-0.24, -0.12, 0, 0.12, 0.24]) enemyShot(this.corePos, base.clone().applyAxisAngle(_up, a), 'big');
    AudioSys.sfx('enemyShot', { pitch: 0.55 });
  }

  chargeFx() {
    const k = 1 - Math.max(0, this.subT) / 1.8;
    const b = this.coreBase;
    glow(this.corePos, (8 + k * 20) * this.size, b.r * 5, b.g * 5, b.b * 5, 1);
    glow(this.corePos, (4 + k * 8) * this.size, 6, 6, 6, 1, 2, this.t * 3);
    if (Math.random() < 0.8) {
      const a = Math.random() * TAU, c = Math.random() * TAU, r = 24 * this.size;
      _v.set(Math.cos(a) * Math.cos(c) * r, Math.sin(c) * r, Math.sin(a) * Math.cos(c) * r).add(this.corePos);
      FX.add.spawn(_v.x, _v.y, _v.z, (this.corePos.x - _v.x) * 3, (this.corePos.y - _v.y) * 3, (this.corePos.z - _v.z) * 3, 0.33, 0.8, 0.2, [b.r * 5, b.g * 5, b.b * 5, 1], [5, 5, 5, 0], 0, { stretch: 0.04 });
    }
    POST.ca = Math.max(POST.ca, 0.004 * k);
  }

  beamFx(dt) {
    const P = G.player;
    this.beamT += dt;
    const dur = this.enraged ? 2.1 : 2.6;
    const k = clamp(this.beamT / dur, 0, 1);
    const beams = this.final && this.enraged ? [this.beamDir, -this.beamDir] : [this.beamDir];
    const b = this.coreBase;
    for (const dirSign of beams) {
      const u = P.u * 0.3 + lerp(-58, 58, dirSign > 0 ? k : 1 - k);
      const v = clamp(P.v * 0.8 + 6, 6, 52);
      railToWorld(G.rail.d - 10, u, v, _v);
      const dir = _v2.subVectors(_v, this.corePos).normalize();
      const end = this.corePos.clone().addScaledVector(dir, 700);
      const w = 1 + Math.sin(this.t * 60) * 0.08;
      FX.beams.add(this.corePos, end, 6 * w * this.size, b.r * 4, b.g * 4, b.b * 4);
      FX.beams.add(this.corePos, end, 1.8 * w * this.size, 4, 4, 4);
      this.beamTick -= dt / beams.length;
      const seg = _p.copy(P.pos).sub(this.corePos);
      const along = seg.dot(dir);
      const perpD = Math.sqrt(Math.max(0, seg.lengthSq() - along * along));
      if (along > 0 && perpD < 5.4 && P.alive && this.beamTick <= 0) { this.beamTick = 0.2; P.damage(11); }
    }
    glow(this.corePos, 18 * this.size, b.r * 5, b.g * 5, b.b * 5, 1);
    addShake(0.02);
  }
}
