// Boss archetype CORE — a sacred beast (linh vật) possessed by THỜI ẢNH's shadow, hovering over the capital.
// Models (cfg.model): 'lan' Kỳ Lân · 'nghe' stone Nghê · 'phuong' Phượng hoàng · 'voi' Tây Sơn war elephant.
// A ring of shields (mane scrolls, carved stone, flaming feathers, howdah shields) orbits the beast in the plane
// facing the player; each shield is a turret. Once they are gone the mouth / chest / forehead armour opens:
// the shadow heart charges and sweeps a beam, fires spirals, and is vulnerable while open.
// The beast is never killed: when the shadow heart breaks it is PURIFIED — the shadow peels off, its true colours
// return in a golden flash, and the freed creature rises away and dissolves into golden light.
import * as THREE from 'three';
import { G, rand, clamp, lerp, damp, TAU, emit, diff, easeOutBack, easeInCubic, easeInOutCubic, smoothstep, mulberry32 } from './core.js';
import { railFrame, railToWorld, emissiveVertexMaterial, mergeGeometries } from './world.js';
import { FX, explode, glow, sparks, addShake, bigFlash } from './fx.js';
import { TARGETS, enemyShot, aimAtPlayer } from './weapons.js';
import { AudioSys } from './audio.js';
import { paint, spawnEnemy, wave } from './enemies.js';
import { POST } from './gfx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

// ============================================================ Palettes (true colours) and the shadow coat
const PALETTES = {
  lan: { jade: '#2fa27a', jadeD: '#1b6a52', jadeL: '#74d2a6', gold: '#e9b441', red: '#c8342c', cream: '#f4e7c4', cloud: '#eef1f4', ivory: '#fff4d8', dark: '#2a1810', mouth: '#5a1612', core: '#c46bff', eye: '#ffd45c' },
  nghe: { stone: '#8f917d', stoneD: '#6c705f', stoneL: '#aeac97', moss: '#5b7a3f', gold: '#d8a944', tooth: '#d2cab0', dark: '#2a2822', mouth: '#3e2a22', core: '#a674ff', eye: '#ffcf5a' },
  phuong: { red: '#d3332b', redD: '#951f1b', orange: '#f27c26', gold: '#f3c443', turq: '#22c1b2', cream: '#fff0cf', dark: '#22120c', core: '#ff58b8', eye: '#ffd76a' },
  voi: { hide: '#85807c', hideD: '#625d5a', skin: '#a8908a', red: '#b8241f', redD: '#7c1814', gold: '#e0b03e', ivory: '#f2e9d3', wood: '#6b4325', rattan: '#c4914f', cloud: '#e9ecef', dark: '#24180f', core: '#ff4f9a', eye: '#ffc46a' },
};
const MATS = {
  lan: { roughness: 0.42, metalness: 0.3 },
  nghe: { roughness: 0.93, metalness: 0.02, flatShading: true },
  phuong: { roughness: 0.5, metalness: 0.28 },
  voi: { roughness: 0.78, metalness: 0.1 },
};
const SH_TINT = new THREE.Color(0.085, 0.07, 0.12);      // ink-black coat; true colours glimmer through
const EN_TINT = new THREE.Color(0.2, 0.07, 0.13);
const SEAM = new THREE.Color('#b46bff').multiplyScalar(2.3);
const SEAM_EN = new THREE.Color('#e45bff').multiplyScalar(2.8);
const SEAM_GOLD = new THREE.Color('#ffc85a').multiplyScalar(2.4);
const EYE_SH = new THREE.Color('#ff2a6e').multiplyScalar(1.9);
const GOLD = new THREE.Color('#ffd27a');
const WHITE = new THREE.Color(1, 1, 1);
const GE = 0.08;   // emissive mask of gold trim: dark while possessed, glints once purified

// ============================================================ Geometry kit
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _t = new THREE.Vector3();
let LOW = false;   // low-poly facets (carved stone)
function X(g, x = 0, y = 0, z = 0, ax = 0, ay = 0, az = 0, sx = 1, sy = sx, sz = sx) {
  _m4.compose(_t.set(x, y, z), _q.setFromEuler(_e.set(ax, ay, az)), _s.set(sx, sy, sz));
  return g.applyMatrix4(_m4);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function ell(x, y, z, rx, ry, rz, ax = 0, ay = 0, az = 0, ws = 18, hs = 12) {
  return X(new THREE.SphereGeometry(1, LOW ? Math.max(6, ws * 0.55 | 0) : ws, LOW ? Math.max(4, hs * 0.55 | 0) : hs), x, y, z, ax, ay, az, rx, ry, rz);
}
const cyl = (rt, rb, h, x, y, z, ax = 0, ay = 0, az = 0, seg = 14) => X(new THREE.CylinderGeometry(rt, rb, h, LOW ? 7 : seg), x, y, z, ax, ay, az);
const cone = (r, h, x, y, z, ax = 0, ay = 0, az = 0, seg = 10) => X(new THREE.ConeGeometry(r, h, LOW ? 6 : seg), x, y, z, ax, ay, az);
const box = (w, h, d, x, y, z, ax = 0, ay = 0, az = 0) => X(new THREE.BoxGeometry(w, h, d), x, y, z, ax, ay, az);
const tor = (R, r, x, y, z, ax = 0, ay = 0, az = 0, arc = TAU, sx = 1, sy = 1, sz = 1) => X(new THREE.TorusGeometry(R, r, LOW ? 4 : 6, LOW ? 14 : 28, arc), x, y, z, ax, ay, az, sx, sy, sz);
// tapered tube through points
function tube(pts, r0, r1 = r0, seg = 0, rad = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => (Array.isArray(p) ? V(p[0], p[1], p[2]) : p)));
  seg = seg || Math.max(8, pts.length * 5); rad = rad || (LOW ? 5 : 7);
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const pos = g.attributes.position;
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg), r = lerp(r0, r1, i / seg);
    for (let j = 0; j <= rad; j++) {
      const idx = i * (rad + 1) + j;
      _t.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, _t.x, _t.y, _t.z);
    }
  }
  return g;
}
// spiral curl in the plane (u, v) around centre c; optional lead-in points
function curlPts(c, u, v, R, turns = 1.4, shrink = 0.75, lead = null) {
  const n = Math.ceil(turns * 10), out = lead ? lead.map(p => V(p[0], p[1], p[2])) : [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * TAU, r = R * (1 - shrink * t);
    out.push(V(c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r));
  }
  return out;
}
// radial frame in the xy plane: (p along angle a, q across, dz depth)
const R2 = (c, a) => (p, q, dz = 0) => [c[0] + Math.cos(a) * p - Math.sin(a) * q, c[1] + Math.sin(a) * p + Math.cos(a) * q, c[2] + dz];

class Kit {
  constructor() { this.b = []; this.s = []; this.e = []; }
  a(g, col, em = 0) { this.b.push(paint(g, col, em)); return g; }   // body (true colours, shadow-tinted)
  sm(g) { this.s.push(paint(g, '#ffffff', 1)); return g; }           // glowing shadow seams
  eye(g) { this.e.push(paint(g, '#ffffff', 1)); return g; }          // eyes
}

// shadow cracks: random walks over an ellipsoid surface
function veins(k, rng, cx, cy, cz, rx, ry, rz, n, front = 0, w = 0.17) {
  for (let i = 0; i < n; i++) {
    const d = V(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1 + front).normalize();
    const t = V(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(d).normalize();
    const steps = 4 + (rng() * 4 | 0), stepA = 0.2 + rng() * 0.18, pts = [];
    for (let j = 0; j < steps; j++) {
      pts.push(V(cx + d.x * rx * 1.025, cy + d.y * ry * 1.025, cz + d.z * rz * 1.025));
      const ax = V(0, 0, 0).crossVectors(d, t).normalize();
      d.applyAxisAngle(ax, stepA);
      t.applyAxisAngle(d, (rng() - 0.5) * 1.3);
      t.addScaledVector(d, -t.dot(d)).normalize();
    }
    k.sm(tube(pts, w, w * 0.35, steps * 3, 4));
  }
}

// ============================================================ Boss
export class CoreBoss {
  constructor(cfg = {}) {
    this.cfg = cfg;
    this.model = PALETTES[cfg.model] ? cfg.model : 'lan';
    const P = { ...PALETTES[this.model], ...(cfg.palette || {}) };
    this.pal = P;
    this.rng = mulberry32(this.model.length * 977 + 13);
    this.nPanels = cfg.panels || 8;
    this.coreHp = Math.round(160 * (cfg.hp || 1));
    this.panelHp = Math.round(7 * (cfg.hp || 1));
    this.mat = emissiveVertexMaterial(MATS[this.model], 0);
    this.seamMat = new THREE.MeshBasicMaterial({ color: SEAM.clone(), transparent: true });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: EYE_SH.clone(), transparent: true });
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.scale.setScalar(1.5);
    this.body.userData.org = V(0, 0, 0);
    this.root.add(this.body);
    this.hulls = []; this.sway = []; this.wisp = [];
    this.coreAt = V(0, 0, 2.5); this.coreR = 3.2;
    LOW = this.model === 'nghe';
    ({ lan: this.buildLan, nghe: this.buildNghe, phuong: this.buildPhuong, voi: this.buildVoi })[this.model].call(this, P);
    // the shadow heart (weak point)
    const cc = new THREE.Color(P.core);
    this.coreBase = cc; this.coreCol = cc.clone();
    this.coreMat = new THREE.MeshBasicMaterial({ color: cc.clone().multiplyScalar(3) });
    this.haloMat = new THREE.MeshBasicMaterial({ color: cc.clone(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    this.core = new THREE.Group();
    this.core.position.copy(this.coreAt);
    this.core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(this.coreR, 2), this.coreMat));
    this.core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(this.coreR * 1.45, 2), this.haloMat));
    this.coreRing = new THREE.Mesh(new THREE.TorusGeometry(this.coreR * 1.15, 0.22, 4, 32), this.coreMat);
    this.core.add(this.coreRing);
    (this.coreParent || this.body).add(this.core);
    if (this.coreParent) this.core.position.sub(this.coreParent.userData.org);
    LOW = false;
    // hull sampling weights (for shadow wisps and the purification)
    let wsum = 0;
    for (const h of this.hulls) { wsum += h.w; h.cw = wsum; }
    this.hullW = wsum;
    // orbiting shields
    LOW = this.model === 'nghe';
    const pk = new Kit();
    ({ lan: panelLan, nghe: panelNghe, phuong: panelPhuong, voi: panelVoi })[this.model](pk, P, this.rng);
    LOW = false;
    const pg = mergeGeometries(pk.b), ps = pk.s.length ? mergeGeometries(pk.s) : null;
    this.panels = [];
    for (let i = 0; i < this.nPanels; i++) {
      const m = new THREE.Group();
      m.add(new THREE.Mesh(pg, this.mat));
      if (ps) m.add(new THREE.Mesh(ps, this.seamMat));
      this.root.add(m);
      this.panels.push({ mesh: m, hp: this.panelHp, alive: true, pos: new THREE.Vector3(), a0: i / this.nPanels * TAU, fireT: rand(1, 3), flash: 0 });
    }
    this.focusPos = new THREE.Vector3();
    this.corePos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.head = this.root;
    this.buildTargets();
    this.active = false;
  }

  // ---------------------------------------------------------------- model helpers
  // A rigid part with its pivot at (px,py,pz) given in body coordinates; fill(k, H) adds geometry in body coords.
  // H(cx,cy,cz, rx,ry,rz, veins, front) registers an ellipsoid hull (shadow cracks + wisp emitters).
  part(parent, px, py, pz, fill) {
    const k = new Kit(), hulls = [], rng = this.rng;
    fill(k, (cx, cy, cz, rx, ry, rz, n = -1, front = 0.4) => {
      hulls.push([cx, cy, cz, rx, ry, rz]);
      const nv = n < 0 ? Math.round(clamp((rx + ry + rz) / 3 * 0.55, 1, 6)) : n;
      if (nv > 0) veins(k, rng, cx, cy, cz, rx, ry, rz, nv, front, clamp((rx + ry + rz) / 3 * 0.034, 0.14, 0.3));
    });
    const g = new THREE.Group(), org = parent.userData.org;
    g.position.set(px - org.x, py - org.y, pz - org.z);
    g.userData.org = V(px, py, pz);
    const m = new THREE.Matrix4().makeTranslation(-px, -py, -pz);
    const add = (list, mat) => { if (!list.length) return; const geo = mergeGeometries(list); geo.applyMatrix4(m); g.add(new THREE.Mesh(geo, mat)); };
    add(k.b, this.mat); add(k.s, this.seamMat); add(k.e, this.eyeMat);
    for (const h of hulls) this.hulls.push({ g, c: V(h[0] - px, h[1] - py, h[2] - pz), r: V(h[3], h[4], h[5]), w: h[3] * h[4] * h[5] });
    parent.add(g);
    return g;
  }
  swayOn(g, ax, amp, f, ph = 0) { this.sway.push({ g, ax, amp, f, ph, base: g.rotation[ax] }); return g; }

  // ---------------------------------------------------------------- KỲ LÂN
  buildLan(P) {
    const B = this.body;
    this.coreAt.set(0, -0.4, 3.0); this.coreR = 3.1;
    this.clouds = this.part(B, 0, -21, -20, (k, H) => {
      for (const [x, y, z, a, b, c] of [[-8, -21, -5, 6.2, 2.4, 4.6], [5, -22, -8, 6.5, 2.6, 5], [0, -23.5, -18, 8, 2.8, 6.5], [-7, -22, -29, 6.5, 2.5, 5], [7, -21.5, -32, 6, 2.4, 5], [0, -22, -39, 6, 2.4, 4.5], [-13, -20.5, -16, 4.6, 2, 4], [13, -21, -20, 4.6, 2, 4]]) {
        k.a(ell(x, y, z, a, b, c), P.cloud);
        k.a(ell(x + a * 0.3, y + b * 0.65, z + 0.5, a * 0.6, b * 0.85, c * 0.7), P.cloud);
        H(x, y, z, a, b, c, 0);
      }
      for (const [x, y, z, s] of [[-8, -20.6, -0.4, 1], [5, -21.6, -3, -1], [-13, -20, -12, 1], [13, -20.5, -16, -1], [-0.5, -23.5, -11.5, 1]]) {
        k.a(tube(curlPts([x, y, z], [s, 0, 0], [0, 1, 0], 2.4, 1.6, 0.8), 0.55, 0.28), P.cream);
      }
    });
    this.swayOn(this.clouds, 'z', 0.03, 0.5);
    // body: scaled, prancing, dorsal flames, curly tail
    this.torso = this.part(B, 0, -6, -16, (k, H) => {
      k.a(ell(0, -1.5, -9.5, 6.5, 7, 6), P.jade); H(0, -1.5, -9.5, 6.5, 7, 6, 1);
      k.a(ell(0, -7, -13, 7, 7.2, 7), P.jade); H(0, -7, -13, 7, 7.2, 7);
      k.a(ell(0, -6, -22, 7.5, 7, 10), P.jade); H(0, -6, -22, 7.5, 7, 10);
      k.a(ell(0, -5, -32, 7, 6.8, 7), P.jade); H(0, -5, -32, 7, 6.8, 7);
      k.a(ell(0, -10.8, -21, 5.2, 3.4, 10), P.cream);
      for (let z = -11; z >= -35; z -= 2.6) {
        for (let j = -3; j <= 3; j++) {
          const th = j * 0.42 + ((z * 0.37) % 0.4) * 0.3, rr = z > -16 ? 7.2 : z < -29 ? 6.9 : 7.4;
          k.a(ell(Math.sin(th) * rr, -6 + Math.cos(th) * (rr - 0.2), z, 1.6, 0.5, 1.7, 0, 0, -th, 8, 6), (j + Math.round(z)) % 2 ? P.jadeL : P.jade);
        }
      }
      for (let i = 0; i < 9; i++) {
        const z = -12 - i * 2.9, y = lerp(1.4, 1.6, i / 8) + Math.sin(i * 0.7) * 0.4;
        k.a(tube([[0, y - 0.5, z], [0, y + 2.2, z - 1.2], [0, y + 3.2, z - 3], [0, y + 2.3, z - 4.1]], 0.9, 0.2), i % 2 ? P.red : P.gold, i % 2 ? 0 : GE);
      }
      const leg = (pts, flame) => {
        k.a(tube(pts, 2.5, 1.6), P.jade);
        const e = pts[pts.length - 1];
        k.a(cyl(1.9, 2.1, 1.4, e[0], e[1] - 0.6, e[2]), P.dark);
        k.a(tor(1.85, 0.35, e[0], e[1] + 0.3, e[2], Math.PI / 2), P.gold, GE);
        const m = pts[1];
        k.a(tube([[m[0], m[1], m[2]], [m[0] + flame * 1.6, m[1] + 1.5, m[2] - 2.5], [m[0] + flame * 2.4, m[1] + 3.6, m[2] - 4], [m[0] + flame * 1.4, m[1] + 4.6, m[2] - 4.6]], 0.8, 0.15), P.red);
        k.a(tube([[m[0], m[1] - 0.6, m[2]], [m[0] + flame * 1.8, m[1] + 0.3, m[2] - 3.2], [m[0] + flame * 2.0, m[1] + 2, m[2] - 5.4]], 0.6, 0.12), P.gold, GE);
      };
      leg([[-5.5, -9, -12], [-7.2, -12.5, -6], [-6.5, -11.5, -1.5]], -1);
      leg([[5.5, -9, -12], [6.6, -15, -10], [6.2, -19.5, -9]], 1);
      leg([[-6, -9, -30], [-7, -15, -27], [-6.5, -19.5, -31]], -1);
      leg([[6, -9, -30], [7.2, -14.5, -33], [6.6, -18.5, -36.5]], 1);
    });
    this.tail = this.part(this.torso, 0, -3, -37, (k) => {
      k.a(tube([[0, -3.5, -36.5], [0, 1.5, -41], [0, 7.5, -41], [0, 11, -37.5], [0, 10, -35]], 1.9, 0.6), P.jade);
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + i * 0.5, c = [Math.sin(a) * 2.6, 11 + Math.cos(a) * 2, -37 - i * 0.3];
        k.a(tube(curlPts(c, [Math.sin(a), Math.cos(a), 0], [Math.cos(a), -Math.sin(a), 0], 2.2, 1.3, 0.75, [[0, 9.5, -37]]), 0.75, 0.22), i % 2 ? P.red : P.gold, i % 2 ? 0 : GE);
      }
    });
    this.swayOn(this.tail, 'z', 0.12, 1.1);
    this.swayOn(this.tail, 'x', 0.06, 0.8, 1);
    // head
    const hd = this.headG = this.part(B, 0, 2, -5, (k, H) => {
      k.a(ell(0, 7, -5, 10.2, 8.6, 9.5), P.jade); H(0, 7, -5, 10.2, 8.6, 9.5, 5, 0.8);
      k.a(ell(0, 11.6, 0, 6, 3.6, 4.6), P.jadeL);
      for (const s of [-1, 1]) k.a(ell(6.4 * s, 4, 2, 3.6, 3.2, 3.4), P.jade);
      k.a(ell(0, 4, 5, 7.8, 3.6, 5.7), P.jade); H(0, 4, 5, 7.8, 3.6, 5.7, 3, 1.2);
      k.a(ell(0, 0.6, -1, 6, 4, 3.4), P.mouth);
      k.a(ell(0, 5.7, 10.3, 3.9, 2.0, 2.1), P.red);
      for (const s of [-1, 1]) {
        k.a(tube(curlPts([1.8 * s, 5.5, 12.2], [s, 0, 0], [0, 1, 0], 1.1, 1.3, 0.7), 0.32, 0.18), P.gold, GE);
        // eyes, lids, pupils, brows
        k.eye(ell(4.6 * s, 9.6, 4.6, 3.3, 3.3, 3.0));
        k.a(ell(4.85 * s, 9.7, 7.45, 1.35, 1.7, 0.6), P.dark);
        k.a(tor(3.35, 0.5, 4.6 * s, 9.6, 5.5, 0, 0.32 * s, 0), P.gold, GE);
        k.a(ell(4.6 * s, 12.1, 4.6, 3.9, 1.5, 3.3), P.jadeL);
        k.a(tube([[1.2 * s, 13.4, 5.6], [4.5 * s, 14.6, 5.2], [8.4 * s, 13.8, 2.8], ...curlPts([9.6 * s, 12.3, 1.8], [-s * 0.6, 0.8, 0], [s * 0.8, 0.6, 0], 1.6, 1.2, 0.7).slice(1)], 0.95, 0.3), P.gold, GE);
        // whiskers
        k.a(tube([[7 * s, 3, 6], [11 * s, 2.5, 6.5], [15 * s, 4, 4], [17.5 * s, 7, 1], ...curlPts([16 * s, 8.6, 0.6], [s, -0.3, 0], [0, 1, 0], 1.6, 1.3, 0.7).slice(2)], 0.55, 0.2), P.gold, GE);
        k.a(tube([[6.5 * s, 1.5, 6], [10 * s, 0, 5.5], [13 * s, -2.5, 3]], 0.4, 0.15), P.cream);
        // teeth
        k.a(cone(0.85, 2.6, 4.4 * s, -0.1, 8.0, Math.PI, 0, 0), P.ivory);
      }
      for (let i = -3; i <= 3; i++) k.a(cone(0.55, 1.5, i * 1.25, 0.25, 9.7 - Math.abs(i) * 0.55, Math.PI, 0, 0, 6), P.ivory);
      k.a(tube([[-7.2, 1.4, 2], [-4, 0.95, 8.4], [0, 0.85, 10.4], [4, 0.95, 8.4], [7.2, 1.4, 2]], 0.42), P.gold, GE);
      // forehead jewel and the single horn
      k.a(ell(0, 12.2, 4.3, 1.2, 1.6, 0.7), P.red);
      k.a(tor(1.5, 0.3, 0, 12.2, 4.4, 0, 0, 0, TAU, 0.85, 1.15), P.gold, GE);
      k.a(tube([[0, 13.2, 1.8], [0, 18.5, 1.6], [0, 23.5, 0], [0, 27, -2.8], [0, 28.2, -5.2]], 2.3, 0.25, 30), P.gold, GE);
      for (let i = 0; i < 4; i++) k.a(tor(2.2 - i * 0.35, 0.32, 0, 14.6 + i * 2.6, 1.8 - i * 0.35 - (i > 2 ? 0.8 : 0), Math.PI / 2 - 0.05 - i * 0.12), P.red);
      // mane ruff behind the face
      k.a(tor(10.8, 3.6, 0, 6.5, -8.8), P.jadeD);
      k.a(tor(9.6, 1.1, 0, 6.5, -6.6), P.gold, GE);
    });
    this.jaw = this.part(hd, 0, 1, -2, (k, H) => {
      k.a(ell(0, -2.2, 4.5, 6.9, 2.75, 5.5), P.jade); H(0, -2.2, 4.5, 6.9, 2.75, 5.5, 2, 1);
      k.a(ell(0, -0.9, 3.6, 3.3, 1.0, 4.2), P.red);
      k.a(tube([[-6.6, -0.2, 2], [-4, 0.05, 7.8], [0, 0.1, 9.7], [4, 0.05, 7.8], [6.6, -0.2, 2]], 0.4), P.gold, GE);
      for (let i = -2; i <= 2; i++) k.a(cone(0.5, 1.3, i * 1.3, 0.55, 8.9 - Math.abs(i) * 0.6, 0, 0, 0, 6), P.ivory);
      for (let i = -2; i <= 2; i++) {
        const x = i * 1.5;
        k.a(tube([[x, -4.2, 7.2 - Math.abs(i) * 0.6], [x * 1.25, -7.6, 7], [x * 1.4, -10.6, 5.2], [x * 1.6, -12.6, 2.6], ...curlPts([x * 1.6 + 0.9 * Math.sign(x || 1), -12.6, 1.8], [-Math.sign(x || 1), 0, 0.3], [0, 1, 0], 0.9, 1.1, 0.6).slice(1)], 0.85, 0.25), i % 2 ? P.cream : P.gold, i % 2 ? 0 : GE);
      }
      k.a(tube(curlPts([0, -6.5, 8.6], [0, 1, 0], [1, 0, 0], 1.4, 1.4, 0.7), 0.45, 0.2), P.red);
    });
    for (const s of [-1, 1]) {
      const ear = this.part(hd, 8.3 * s, 11, -4, (k) => {
        k.a(ell(11 * s, 12.5, -4.5, 1.7, 3.8, 0.8, 0, 0.2 * s, -0.75 * s), P.jade);
        k.a(ell(11 * s, 12.5, -4, 1.1, 2.8, 0.5, 0, 0.2 * s, -0.75 * s), P.red);
      });
      this.swayOn(ear, 'z', 0.12 * s, 2.3, s);
      (this.ears ||= []).push(ear);
    }
    // curly mane locks framing the face
    const N = 18, mc = [0, 6.5, -9.2];
    for (let i = 0; i < N; i++) {
      const a = Math.PI / 2 + (i / N) * TAU + 0.17;
      if (Math.abs(Math.sin(a) + 1) < 0.18 || Math.abs(Math.sin(a) - 1) < 0.03) continue;   // leave room for the beard and the horn
      const base = R2(mc, a)(9.5, 0, 0);
      const cur = this.part(hd, base[0], base[1], base[2], (k) => {
        const M = R2(mc, a), col = [P.red, P.jade, P.gold][i % 3];
        k.a(ell(...M(12.6, -0.4, -0.6), 3.8, 2.4, 1.3, 0, 0, a), P.jadeD);
        k.a(tube([M(9.5, 0, 0.3), M(12.3, 1.4, 0.6), M(14.7, 1.0, 0.8), M(15.9, -0.6, 0.8), M(15.1, -2.1, 0.7), M(13.7, -2.0, 0.7), M(13.3, -0.9, 0.8), M(14.1, -0.3, 0.9)], 1.25, 0.35, 30), col, col === P.gold ? GE : 0);
      });
      this.swayOn(cur, 'z', 0.07, 1.4, i * 0.9);
    }
    this.coreParent = hd;
    this.openParts = [[this.jaw, 'x', 0.78]];
  }

  // ---------------------------------------------------------------- NGHÊ (stone guardian)
  buildNghe(P) {
    const B = this.body;
    this.coreAt.set(0, -0.4, 3.0); this.coreR = 3.1;
    // broken plinth with floating chunks
    this.plinth = this.part(B, 0, -27, -10, (k, H) => {
      k.a(box(21, 2.6, 23, 0, -27.2, -10), P.stoneD); H(0, -27.2, -10, 10.5, 1.3, 11.5, 2);
      k.a(box(22.4, 0.9, 24.4, 0, -25.6, -10), P.stone);
      for (let i = 0; i < 9; i++) k.a(ell(-10 + i * 2.5, -27.4, 1.6, 1.25, 1.1, 0.7, 0, 0, 0, 8, 6), i % 2 ? P.stoneL : P.stone);
      k.a(box(6, 2.2, 5, 9.5, -29.6, -0.5, 0.3, 0.4, 0.2), P.stoneD);
      k.a(ell(-6, -25, -18, 6, 0.6, 4), P.moss); k.a(ell(8, -25, -3, 3.4, 0.5, 2.5), P.moss);
      for (const [x, y, z, r] of [[-15, -29, -2, 2.2], [14, -31, -14, 1.8], [-12, -32, -22, 1.5], [4, -32, 3, 1.4]]) k.a(X(new THREE.DodecahedronGeometry(r), x, y, z, x, y, z), P.stone);
      k.a(tor(1.2, 0.18, 0, -27.2, 1.4), P.gold, GE);
    });
    this.swayOn(this.plinth, 'z', 0.02, 0.5);
    this.torso = this.part(B, 0, -8, -10, (k, H) => {
      k.a(ell(0, -8.5, -8.5, 7.6, 10, 6.6), P.stone); H(0, -8.5, -8.5, 7.6, 10, 6.6, 3, 1);
      k.a(ell(0, -14, -16, 8.2, 8, 8.2), P.stone); H(0, -14, -16, 8.2, 8, 8.2);
      for (const s of [-1, 1]) {
        k.a(ell(6.6 * s, -18.5, -18, 5, 5.5, 6.6), P.stone); H(6.6 * s, -18.5, -18, 5, 5.5, 6.6, 2);
        k.a(cyl(2.3, 2.8, 15, 5 * s, -18.5, -5.2), P.stone); H(5 * s, -18.5, -5.2, 2.6, 7.5, 2.6, 1);
        k.a(ell(5 * s, -26, -3.8, 3.3, 1.9, 4.2), P.stone);
        k.a(ell(8.4 * s, -25.6, -12, 3, 1.8, 4.2), P.stone);
        for (let j = -1; j <= 1; j++) {
          k.a(tube(curlPts([5 * s + j * 1.3, -26.2, -0.6], [0, 1, 0], [0, 0, 1], 0.8, 1.1, 0.6), 0.42, 0.2), P.stoneL);
          k.a(tube(curlPts([8.4 * s + j * 1.2, -25.8, -8.3], [0, 1, 0], [0, 0, 1], 0.7, 1.1, 0.6), 0.38, 0.2), P.stoneL);
        }
        // elbow tufts and mane locks flowing down the chest
        k.a(tube(curlPts([6.8 * s, -13, -4.5], [s, 0, 0], [0, 1, 0], 1.6, 1.5, 0.7, [[5.2 * s, -10, -5.6]]), 0.7, 0.25), P.stoneL);
        for (let j = 0; j < 3; j++) {
          const x = (2 + j * 2.1) * s;
          k.a(tube([[x, -2, -2.4 + j * 0.2], [x * 1.15, -5, -1.6], [x * 0.95, -8, -1.4], [x * 1.1, -11, -2.2], ...curlPts([x * 1.1 + 0.8 * s, -12.2, -2.4], [-s, 0.3, 0], [0, -1, 0], 0.9, 1.2, 0.6).slice(1)], 0.9, 0.3), j === 1 ? P.stoneL : P.stone);
          if (j === 1) k.a(tube([[x * 1.02, -5, -0.9], [x * 0.95, -8, -0.65], [x * 1.1, -11, -1.4]], 0.25), P.gold, GE);
        }
      }
      k.a(tor(6.2, 0.6, 0, -3.5, -7.5, Math.PI / 2 - 0.5), P.gold, GE);
      k.a(ell(0, -5.2, -1.6, 1.6, 1.6, 1.6), P.gold, GE);
      k.a(ell(0, -1.4, -15, 4.4, 0.8, 3.6), P.moss);
      k.a(ell(-5, -11.4, -21, 3, 0.6, 3), P.moss);
    });
    this.torsoS = 0.86;
    this.tails = [];
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 2.6;
      const tl = this.part(this.torso, x * 0.4, -18, -23, (k) => {
        k.a(tube([[x * 0.4, -18, -23], [x * 0.7, -10, -28], [x, -2, -27.5], [x * 1.3, 4, -24.5], ...curlPts([x * 1.3 + Math.sign(x) * 1.4, 5.2, -23], [-Math.sign(x), 0.4, 0], [0, 0.5, 1], 1.5, 1.3, 0.7).slice(1)], 2.2 - Math.abs(i - 1.5) * 0.4, 0.4), i % 2 ? P.stoneL : P.stone);
        k.a(tube([[x * 1.02, -2, -26.6], [x * 1.3, 4, -23.6]], 0.3, 0.15), P.gold, GE);
      });
      this.swayOn(tl, 'z', 0.06, 0.9, i);
      this.swayOn(tl, 'x', 0.05, 0.7, i * 1.7);
    }
    const hd = this.headG = this.part(B, 0, 3, -5, (k, H) => {
      k.a(ell(0, 7.5, -4.5, 10, 8.5, 9), P.stone); H(0, 7.5, -4.5, 10, 8.5, 9, 5, 0.8);
      k.a(ell(0, 12.2, 1.4, 8.6, 2.7, 3.4), P.stoneL);
      k.a(ell(0, 4, 5.2, 7.6, 3.8, 5.8), P.stone); H(0, 4, 5.2, 7.6, 3.8, 5.8, 3, 1.2);
      for (const s of [-1, 1]) k.a(ell(6.6 * s, 3.8, 2.2, 3.4, 3.4, 3.6), P.stone);
      k.a(ell(0, 0.6, -1, 6, 4, 3.4), P.mouth);
      k.a(ell(0, 6.1, 10.4, 3.7, 2.5, 2.3), P.stoneD);
      for (const s of [-1, 1]) {
        k.a(tube(curlPts([1.9 * s, 5.8, 12.4], [s, 0, 0], [0, 1, 0], 1.1, 1.3, 0.7), 0.35, 0.2), P.gold, GE);
        k.eye(ell(4.4 * s, 9.6, 5.4, 2.9, 2.9, 2.5));
        k.a(ell(4.6 * s, 9.7, 7.7, 1.2, 1.5, 0.5), P.dark);
        k.a(tor(3.0, 0.5, 4.4 * s, 9.6, 6.1, 0, 0.3 * s, 0), P.gold, GE);
        for (let j = 0; j < 3; j++) k.a(tube(curlPts([(2 + j * 2.5) * s, 13.2 - j * 0.5, 3.6 - j * 1.1], [0, 1, 0], [s, 0, 0], 1.25, 1.6, 0.75), 0.55, 0.25), j === 1 ? P.gold : P.stoneL, j === 1 ? GE : 0);
        k.a(cone(0.9, 2.4, 4.3 * s, -0.1, 8.3, Math.PI, 0, 0), P.tooth);
      }
      for (let i = -3; i <= 3; i++) k.a(box(1.05, 1.3, 0.9, i * 1.25, 0.3, 9.8 - Math.abs(i) * 0.55), P.tooth);
      // snail-shell curls covering the crown and nape
      for (let row = 0; row < 3; row++) {
        const n = 7 + row * 2;
        for (let i = 0; i < n; i++) {
          const a = lerp(-0.25, Math.PI + 0.25, i / (n - 1)), rr = 8.4 + row * 1.6, z = -3 - row * 3.4;
          const c = [Math.cos(a) * rr, 7.5 + Math.sin(a) * rr * 0.92, z];
          k.a(ell(c[0], c[1], c[2], 1.5, 1.5, 1.0, 0, 0, 0, 8, 6), P.stone);
          k.a(tube(curlPts([c[0], c[1], c[2] + 0.9], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], 1.5, 1.7, 0.8), 0.42, 0.22, 18, 4), (i + row) % 4 === 0 ? P.gold : P.stoneL, (i + row) % 4 === 0 ? GE : 0);
        }
      }
      k.a(ell(0, 15.6, -5, 5, 0.9, 4.4), P.moss);
      k.a(ell(-7.5, 13.6, -7, 2.6, 0.7, 2.6), P.moss);
    });
    this.jaw = this.part(hd, 0, 1, -2, (k, H) => {
      k.a(ell(0, -2.3, 4.6, 7.1, 2.9, 5.6), P.stone); H(0, -2.3, 4.6, 7.1, 2.9, 5.6, 2, 1);
      k.a(ell(0, -0.9, 3.6, 3.3, 1.0, 4.2), '#7a3a30');
      for (let i = -2; i <= 2; i++) k.a(box(1.0, 1.2, 0.85, i * 1.3, 0.45, 9.0 - Math.abs(i) * 0.6), P.tooth);
      for (const s of [-1, 1]) k.a(cone(0.75, 2.0, 3.9 * s, 1.0, 7.6), P.tooth);
      for (let i = -1; i <= 1; i++) k.a(tube([[i * 2.2, -4.6, 7], [i * 2.6, -7.5, 6.4], ...curlPts([i * 2.6, -9.2, 5.6], [0, 1, 0], [0, 0, 1], 1.5, 1.6, 0.75)], 0.9, 0.3), i === 0 ? P.stoneL : P.stone);
    });
    for (const s of [-1, 1]) {
      const ear = this.part(hd, 8.4 * s, 10.5, -3.5, (k) => {
        k.a(ell(10.6 * s, 6.8, -3.2, 1.7, 4.4, 2.9, 0, 0, 0.25 * s), P.stone);
        k.a(ell(10.0 * s, 6.8, -3.2, 0.8, 3.4, 2.1, 0, 0, 0.25 * s), P.stoneD);
      });
      this.swayOn(ear, 'z', -0.07 * s, 1.1, s);
    }
    this.coreParent = hd;
    this.openParts = [[this.jaw, 'x', 0.75]];
  }

  // ---------------------------------------------------------------- PHƯỢNG HOÀNG
  buildPhuong(P) {
    const B = this.body;
    this.coreAt.set(0, 0, 2.6); this.coreR = 3.2;
    // tail fan of long plumes below/behind the body
    const base = [0, -6, -7];
    const tailG = new THREE.Group();
    tailG.position.set(...base); tailG.userData.org = V(...base); tailG.rotation.x = 0.8;
    B.add(tailG);
    for (let i = 0; i < 9; i++) {
      const a = lerp(-2.8, -0.34, i / 8), mid = 1 - Math.abs(i - 4) / 4, L = 25 + 9 * mid;
      const pl = this.part(tailG, base[0], base[1], base[2], (k, H) => {
        const M = R2(base, a);
        k.a(tube([M(0, 0, 0), M(L * 0.3, 0.9, -1.4), M(L * 0.65, -0.7, -2.8), M(L, 0.4, -4)], 0.95, 0.45), i % 2 ? P.redD : P.red);
        for (let j = 0; j < 6; j++) {
          const p = L * (0.22 + j * 0.12), dz = -4 * p / L;
          k.a(ell(...M(p, Math.sin(p * 0.25) * 0.6, dz - 0.3), 2.2, 1.3 + j * 0.16, 0.35, 0, 0, a), j % 2 ? P.gold : P.orange, j % 2 ? GE : 0);
        }
        k.a(ell(...M(L + 1.6, 0.4, -4.2), 3.4, 2.5, 0.4, 0, 0, a), P.turq);
        k.a(ell(...M(L + 1.6, 0.4, -3.9), 2.1, 1.5, 0.35, 0, 0, a), P.gold, GE);
        k.a(ell(...M(L + 1.6, 0.4, -3.7), 1.0, 0.75, 0.3, 0, 0, a), P.red);
        k.a(tube(curlPts(M(L + 5.4, 0.4, -4.2), [Math.cos(a + 1.6), Math.sin(a + 1.6), 0], [Math.cos(a), Math.sin(a), 0], 1.4, 1.2, 0.7, [M(L + 4.6, 0.4, -4.2)]), 0.5, 0.18), P.orange);
        k.sm(tube([M(L * 0.3, 0.9, -1.0), M(L * 0.65, -0.7, -2.4), M(L - 1, 0.4, -3.6)], 0.16, 0.08));
        if (i % 2 === 0) H(...M(L * 0.55, 0, -2.5), 4, 4, 2, 0);
      });
      this.swayOn(pl, 'z', 0.05, 0.8, i * 0.7);
      this.swayOn(pl, 'x', 0.05, 0.6, i * 1.3);
    }
    this.torso = this.part(B, 0, 0, -3, (k, H) => {
      k.a(ell(0, 1, -3, 6, 7.8, 6.6), P.red); H(0, 1, -3, 6, 7.8, 6.6, 3);
      k.a(ell(0, -5, -2.6, 4.6, 4.5, 4.6), P.orange);
      k.a(tube([[0, 5, -1.5], [0, 9, 2.2], [0, 12.6, 2.8], [0, 15.4, 4.4], [0, 17.4, 5.8]], 3.0, 1.9), P.red); H(0, 11, 2.4, 2.8, 4.5, 2.8, 2);
      for (let i = 0; i < 6; i++) k.a(ell(0, 8 + i * 1.6, 3.6 + Math.sin(i * 0.5) * 0.7 + (i > 3 ? (i - 3) * 0.7 : 0), 1.9 - i * 0.12, 1.0, 0.6), i % 2 ? P.gold : P.orange, i % 2 ? GE : 0);
      for (const s of [-1, 1]) {
        k.a(tube([[2 * s, -7, -3], [2.2 * s, -10, -1.6], [2.4 * s, -11.6, 0]], 0.55, 0.4), P.gold, GE);
        for (let j = -1; j <= 1; j++) k.a(tube([[2.4 * s, -11.6, 0], [2.4 * s + j * 0.9, -12.2, 1.6], [2.4 * s + j * 1.1, -12, 2.4]], 0.3, 0.12), P.gold, GE);
      }
    });
    const hd = this.headG = this.part(this.torso, 0, 17, 5, (k, H) => {
      k.a(ell(0, 18, 6.5, 2.9, 2.7, 3.2), P.red); H(0, 18, 6.5, 2.9, 2.7, 3.2, 1);
      k.a(tube([[0, 18.5, 8.6], [0, 18.4, 11], [0, 17.6, 12.8], [0, 16.6, 13.4]], 1.0, 0.12), P.gold, GE);
      k.a(ell(0, 16.2, 9.0, 0.9, 1.7, 1.0), P.red);
      for (const s of [-1, 1]) {
        k.eye(ell(1.95 * s, 18.9, 8.1, 0.85, 0.85, 0.7));
        k.a(tor(0.95, 0.18, 1.95 * s, 18.9, 8.3, 0, 0.6 * s, 0), P.gold, GE);
        k.a(tube([[1.6 * s, 18.6, 4.6], [3.6 * s, 17.4, 1.5], [5 * s, 15, -1.5], ...curlPts([5.8 * s, 13.6, -2.5], [0, 1, 0], [s, 0, 0], 1.2, 1.2, 0.7)], 0.55, 0.18), P.gold, GE);
        k.a(tube([[1.3 * s, 17.4, 4.6], [3 * s, 15.6, 1.4], [3.4 * s, 13, -0.6]], 0.45, 0.15), P.turq);
      }
    });
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 1.1;
      const cr = this.part(hd, x, 20.4, 5.5, (k) => {
        k.a(tube([[x, 20.4, 5.5], [x * 1.6, 23.6, 4.4 - Math.abs(x)], [x * 2.2, 26 - Math.abs(x), 1.8], ...curlPts([x * 2.2, 26.4 - Math.abs(x), 0.2], [0, 0.3, 1], [0, -1, 0], 1.3, 1.2, 0.7)], 0.55, 0.22), i === 1 ? P.gold : P.red, i === 1 ? GE : 0);
        k.a(ell(x * 2.2, 26.4 - Math.abs(x), 0.2, 0.9, 0.9, 0.9), P.turq);
      });
      this.swayOn(cr, 'x', 0.1, 1.6, i);
    }
    // chest plates that part to reveal the sacred fire
    const plates = [];
    for (const s of [-1, 1]) {
      const pl = this.part(this.torso, 5.6 * s, 0, 1, (k, H) => {
        k.a(ell(2.6 * s, 0, 3.5, 4.6, 7.0, 3.6), P.orange); H(2.6 * s, 0, 3.5, 4.6, 7.0, 3.6, 2, 1.5);
        for (let y = -5.6; y <= 5.8; y += 1.4) {
          for (let x = 0.5 + (Math.round(y * 0.72) % 2) * 0.6; x <= 5.4; x += 1.25) {
            const xx = x * s, q = 1 - ((xx - 2.6 * s) / 4.6) ** 2 - (y / 7) ** 2;
            if (q <= 0.05) continue;
            k.a(ell(xx, y - 0.4, 3.5 + 3.6 * Math.sqrt(q) + 0.05, 0.8, 0.95, 0.3, 0, 0, 0, 8, 6), y > 2 ? P.red : y > -2 ? P.gold : P.orange, GE);
          }
        }
      });
      plates.push([pl, 'y', 1.15 * s]);
    }
    // wings: layered fan of feathers spread wide
    this.wings = [];
    for (const s of [-1, 1]) {
      const A = [[5.5 * s, 6, -3], [14 * s, 11, -4], [22 * s, 14.5, -4.5], [31 * s, 17, -5]];
      const armAt = (t) => { const u = t * 3, i = Math.min(2, u | 0), f = u - i; return [lerp(A[i][0], A[i + 1][0], f), lerp(A[i][1], A[i + 1][1], f), lerp(A[i][2], A[i + 1][2], f)]; };
      const w = this.part(this.torso, A[0][0], A[0][1], A[0][2], (k, H) => {
        k.a(tube(A, 2.3, 0.8), P.red);
        for (let i = 0; i < 16; i++) { const p = armAt(0.04 + i * 0.06); k.a(ell(p[0], p[1] - 0.6, p[2] + 0.7, 0.9, 1.9, 0.4, 0, 0, s * (0.3 + i * 0.07), 8, 6), P.gold, GE); }
        const rows = [[1, P.red, P.turq, -1.4, 1.9], [0.68, P.orange, P.gold, -0.7, 1.8], [0.4, P.gold, P.cream, 0, 1.6]];
        rows.forEach(([lm, cm, ct, dz, wd], ri) => {
          const n = 13;
          for (let i = 0; i < n; i++) {
            const t = 0.04 + 0.96 * i / (n - 1), b = armAt(t);
            let ang = lerp(-1.78, 0.28, Math.pow(t, 1.1));
            if (s < 0) ang = Math.PI - ang;
            const len = lerp(11, 21, t) * lm, ca = Math.cos(ang), sa = Math.sin(ang), z = b[2] + dz - ri * 0.05 + (i % 2) * 0.12;
            k.a(ell(b[0] + ca * len * 0.5, b[1] + sa * len * 0.5, z, len * 0.5, wd, 0.35, 0, 0, ang, 12, 8), cm, cm === P.gold ? GE : 0);
            k.a(ell(b[0] + ca * len * 0.8, b[1] + sa * len * 0.8, z + 0.18, len * 0.21, wd * 0.72, 0.38, 0, 0, ang, 10, 6), ct, ct === P.gold ? GE : 0);
            if (ri === 0) k.sm(cyl(0.1, 0.16, len * 0.85, b[0] + ca * len * 0.45, b[1] + sa * len * 0.45, z + 0.4, 0, 0, ang - Math.PI / 2, 4));
          }
        });
        const m = armAt(0.5);
        H(m[0], m[1] - 5, m[2] - 1, 9, 7, 2, 0);
      });
      w.userData.side = s;
      this.wings.push(w);
    }
    this.coreParent = this.torso;
    this.openParts = plates;
  }

  // ---------------------------------------------------------------- VOI CHIẾN (Tây Sơn war elephant)
  buildVoi(P) {
    const B = this.body;
    this.coreAt.set(0, 0.6, 1.5); this.coreR = 2.6;
    this.clouds = this.part(B, 0, -27, -24, (k, H) => {
      for (const [x, y, z, a, b, c] of [[-8, -27, -9, 6, 2.4, 5], [8, -27.5, -11, 6, 2.4, 5], [0, -28.5, -22, 9, 2.8, 8], [-8, -27, -36, 6, 2.4, 5], [8, -27, -38, 6, 2.4, 5], [-15, -26, -22, 5, 2, 5], [15, -26.5, -26, 5, 2, 5]]) {
        k.a(ell(x, y, z, a, b, c), P.cloud);
        k.a(ell(x - a * 0.25, y + b * 0.6, z + 0.6, a * 0.6, b * 0.9, c * 0.7), P.cloud);
        H(x, y, z, a, b, c, 0);
      }
    });
    this.swayOn(this.clouds, 'z', 0.03, 0.5);
    this.torso = this.part(B, 0, -4, -22, (k, H) => {
      k.a(ell(0, -4, -24, 12, 11, 15), P.hide); H(0, -4, -24, 12, 11, 15, 4);
      k.a(ell(0, 0, -13, 10, 9.5, 7), P.hide); H(0, 0, -13, 10, 9.5, 7, 2);
      // caparison: red cloth over the back with gold hem, tassels and medallions
      k.a(X(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI * 0.6), 0, -4, -24, 0, 0, 0, 12.5, 11.5, 15.5), P.red);
      k.a(tor(1, 0.055, 0, -7.6, -24, Math.PI / 2, 0, 0, TAU, 12.0, 14.8, 11), P.gold, GE);
      k.a(tor(1, 0.04, 0, -5.4, -24, Math.PI / 2, 0, 0, TAU, 12.4, 15.3, 11), P.gold, GE);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU, x = Math.sin(a) * 12, z = -24 + Math.cos(a) * 14.8;
        k.a(cone(0.55, 1.8, x, -8.9, z, Math.PI, 0, 0, 6), P.gold, GE);
      }
      for (const s of [-1, 1]) {
        k.a(cyl(2.4, 2.4, 0.4, 12.1 * s, -2.5, -24, 0, 0, Math.PI / 2), P.gold, GE);
        k.a(cyl(1.4, 1.4, 0.5, 12.15 * s, -2.5, -24, 0, 0, Math.PI / 2), P.redD);
        k.a(cyl(1.3, 1.3, 0.4, 11.4 * s, -3.4, -15, 0, 0.6 * s, Math.PI / 2), P.gold, GE);
        k.a(cyl(1.3, 1.3, 0.4, 11.4 * s, -3.4, -33, 0, -0.6 * s, Math.PI / 2), P.gold, GE);
      }
      // legs (charging stride)
      const leg = (pts) => {
        k.a(tube(pts, 3.7, 3.1), P.hide);
        const e = pts[pts.length - 1];
        k.a(cyl(3.3, 3.5, 1.6, e[0], e[1] - 0.6, e[2]), P.hideD);
        k.a(tor(3.35, 0.45, e[0], e[1] + 2.2, e[2], Math.PI / 2), P.gold, GE);
        for (let j = -1; j <= 1; j++) k.a(ell(e[0] + j * 1.3, e[1] - 0.9, e[2] + 3.0, 0.8, 0.7, 0.5), P.ivory);
        H(pts[1][0], pts[1][1], pts[1][2], 3.6, 6, 3.6, 1);
      };
      leg([[-6.5, -10, -14], [-6.9, -17, -10], [-6.9, -22.5, -7.6]]);
      leg([[6.5, -10, -14], [6.9, -17, -13], [6.9, -23, -13.5]]);
      leg([[-6.5, -10, -33], [-6.9, -17, -36], [-6.9, -22.5, -39.5]]);
      leg([[6.5, -10, -33], [6.9, -17, -33.5], [6.9, -23, -35]]);
      k.a(tube([[0, -1, -38.6], [0, -5, -41.4], [0, -10, -41.8]], 0.7, 0.4), P.hide);
      k.a(ell(0, -11, -41.6, 0.9, 1.6, 0.9), P.dark);
    });
    // howdah (bành voi) with roof, railing and red banners
    this.howdah = this.part(this.torso, 0, 8, -24, (k, H) => {
      k.a(ell(0, 6.6, -24, 9.4, 1.8, 10.5), P.red);
      k.a(tor(1, 0.08, 0, 6.9, -24, Math.PI / 2, 0, 0, TAU, 9.2, 10.3, 9), P.gold, GE);
      k.a(box(13.5, 1.3, 14.5, 0, 8.7, -24), P.wood);
      k.a(box(14.2, 0.5, 15.2, 0, 9.5, -24), P.gold, GE);
      for (const sx of [-1, 1]) for (const zz of [-17.3, -24, -30.7]) k.a(cyl(0.35, 0.35, 4.6, 6.3 * sx, 11.8, zz), P.redD);
      for (const sx of [-1, 1]) {
        k.a(box(0.4, 0.4, 13.8, 6.3 * sx, 13.9, -24), P.gold, GE);
        k.a(box(0.3, 0.3, 13.8, 6.3 * sx, 11.6, -24), P.redD);
        for (const zz of [-17.3, -30.7]) k.a(cyl(0.45, 0.45, 9.4, 5.6 * sx, 14.4, zz), P.redD);
      }
      for (const zz of [-17.3, -30.7]) { k.a(box(12.6, 0.4, 0.4, 0, 13.9, zz), P.gold, GE); k.a(box(12.6, 0.3, 0.3, 0, 11.6, zz), P.redD); }
      k.a(X(new THREE.ConeGeometry(10.4, 3.8, 4, 1), 0, 20.6, -24, 0, Math.PI / 4, 0, 1, 1, 1.05), P.red); H(0, 20, -24, 7, 2, 7, 1);
      k.a(X(new THREE.ConeGeometry(10.6, 0.6, 4, 1, true), 0, 18.5, -24, 0, Math.PI / 4, 0, 1, 1, 1.05), P.gold, GE);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.a(tube([[6.6 * sx, 18.7, -24 + 6.9 * sz], [8 * sx, 19.6, -24 + 8.3 * sz], [8.5 * sx, 21.2, -24 + 8.8 * sz]], 0.45, 0.15), P.gold, GE);
      k.a(cyl(0.3, 0.3, 3, 0, 23.6, -24), P.gold, GE);
      k.a(ell(0, 25.4, -24, 0.9, 1.3, 0.9), P.gold, GE);
      for (const sx of [-1, 1]) { k.a(cyl(0.32, 0.32, 21, 6.6 * sx, 19.5, -31.6), P.wood); k.a(cone(0.7, 2, 6.6 * sx, 31, -31.6), P.gold, GE); }
    });
    this.banners = [];
    for (const sx of [-1, 1]) {
      let parent = this.howdah, org = [6.6 * sx, 25.5, -31.6];
      for (let j = 0; j < 3; j++) {
        const z0 = -31.6 - j * 3.4, hh = 7.6 - j * 0.9, cy = 26 - j * 0.45;
        const fl = this.part(parent, org[0], org[1], z0, (k) => {
          k.a(box(0.22, hh, 3.45, 6.6 * sx, cy, z0 - 1.7), P.red);
          k.a(box(0.28, 0.5, 3.45, 6.6 * sx, cy + hh / 2, z0 - 1.7), P.gold, GE);
          k.a(box(0.28, 0.5, 3.45, 6.6 * sx, cy - hh / 2, z0 - 1.7), P.gold, GE);
          if (j === 0) k.a(ell(6.6 * sx, cy, z0 - 1.9, 0.3, 1.7, 1.7, 0, 0, 0, 12, 8), P.gold, GE);
          if (j === 2) for (const dy of [-1, 1]) k.a(cone(0.5, 2, 6.6 * sx, cy + dy * hh * 0.3, z0 - 4.2, Math.PI / 2, 0, 0, 6), P.gold, GE);
        });
        this.swayOn(fl, 'y', 0.22 * (j + 1) * 0.6, 3.2, j * 0.9 + sx);
        this.banners.push(fl);
        parent = fl;
      }
    }
    const hd = this.headG = this.part(B, 0, 0, -6, (k, H) => {
      k.a(ell(0, -1, -8, 10.5, 10, 9.5), P.hide); H(0, -1, -8, 10.5, 10, 9.5, 4, 0.8);
      for (const s of [-1, 1]) {
        k.a(ell(3.4 * s, 4, -2.8, 5, 4.6, 4.4), P.hide); H(3.4 * s, 4, -2.8, 5, 4.6, 4.4, 1, 1);
        k.a(ell(6.6 * s, -3, -3, 4, 5, 4.5), P.hideD);
        k.eye(ell(7.4 * s, 1.6, -3.0, 1.15, 1.15, 0.9));
        k.a(tor(1.3, 0.28, 7.5 * s, 1.6, -2.8, 0, 1.1 * s, 0), P.hideD);
        k.a(tube([[3.4 * s, -7, -1.5], [4.6 * s, -10.2, 2.6], [5.6 * s, -10.3, 7.6], [6.4 * s, -7.8, 11.4]], 1.45, 0.35), P.ivory);
        k.a(tor(1.5, 0.35, 3.9 * s, -8.6, 0.4, Math.PI / 2 - 0.7, 0, 0), P.gold, GE);
        k.a(tor(1.25, 0.3, 4.8 * s, -10.2, 4.0, Math.PI / 2 - 1.2, 0, 0), P.gold, GE);
        k.a(ell(6.4 * s, -7.8, 11.4, 0.55, 0.55, 0.55), P.gold, GE);
      }
      k.a(ell(0, -8.6, -1.4, 3.2, 2, 3), P.skin);
      // head caparison
      k.a(ell(0, 7.6, -5.5, 8.6, 2.8, 7.4), P.red);
      k.a(tor(1, 0.09, 0, 7.2, -5.5, Math.PI / 2 - 0.12, 0, 0, TAU, 8.4, 7.2, 8), P.gold, GE);
      for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.225; k.a(cone(0.45, 1.6, Math.sin(a) * 8.3, 5.7 - Math.abs(a) * 0.8, -5.5 + Math.cos(a) * 7.0, Math.PI, 0, 0, 6), P.gold, GE); }
      k.a(X(new THREE.OctahedronGeometry(1.6), 0, 10.2, -2.8, 0, 0, 0, 1, 1.4, 0.6), P.gold, GE);
      k.a(ell(0, 10.2, -2.6, 0.7, 0.9, 0.5), P.red);
    });
    // forehead armour (opens like doors)
    const plates = [];
    for (const s of [-1, 1]) {
      const pl = this.part(hd, 5.6 * s, 1.0, 0.5, (k, H) => {
        k.a(ell(2.2 * s, 1.0, 2.2, 3.4, 5.6, 3.0), P.red); H(2.2 * s, 1.0, 2.2, 3.4, 5.6, 3.0, 2, 1.5);
        k.a(ell(1.2 * s, -4.6, 3.6, 1.9, 3.0, 1.4, 0.3, 0, 0), P.red);
        for (let i = 0; i < 11; i++) {
          const a = -1.45 + i * 0.29, y = 1.0 + Math.sin(a) * 4.9, xx = 2.2 * s + Math.cos(a) * 2.8 * s;
          const q = 1 - ((xx - 2.2 * s) / 3.4) ** 2 - ((y - 1.0) / 5.6) ** 2;
          k.a(ell(xx, y, 2.2 + 3.0 * Math.sqrt(Math.max(0, q)) + 0.1, 0.42, 0.42, 0.35, 0, 0, 0, 8, 6), P.gold, GE);
        }
        k.a(tube([[0.2 * s, 6.4, 3.0], [0.2 * s, 2.5, 5.1], [0.2 * s, -1.5, 5.0], [0.35 * s, -5, 4.7], [0.5 * s, -7, 3.8]], 0.3, 0.22), P.gold, GE);
        k.a(cyl(1.2, 1.2, 0.45, 2.1 * s, 1.6, 4.95, Math.PI / 2 - 0.1, 0.35 * s, 0), P.gold, GE);
        k.a(cyl(0.6, 0.6, 0.55, 2.15 * s, 1.6, 5.1, Math.PI / 2 - 0.1, 0.35 * s, 0), P.redD);
      });
      plates.push([pl, 'y', 1.2 * s]);
    }
    for (const s of [-1, 1]) {
      const ear = this.part(hd, 8.2 * s, 2.5, -8.5, (k) => {
        k.a(ell(14.5 * s, 2, -9.3, 7.4, 7.2, 1.0, 0, -0.35 * s, 0), P.hide);
        k.a(ell(14 * s, -5.5, -9.1, 4.6, 6, 0.9, 0, -0.35 * s, 0.25 * s), P.hide);
        k.a(ell(14.3 * s, 1.6, -8.5, 6, 5.8, 0.5, 0, -0.35 * s, 0), P.skin);
        k.a(ell(13.9 * s, -4.6, -8.4, 3.5, 4.6, 0.45, 0, -0.35 * s, 0.25 * s), P.skin);
        k.a(tor(1, 0.07, 14.5 * s, 2.2, -9.3, 0, -0.35 * s, 0, Math.PI, 7.3, 7.1, 7), P.hideD);
      });
      this.swayOn(ear, 'y', 0.2 * s, 1.3, s * 0.5);
      (this.ears ||= []).push(ear);
    }
    // trunk: chain of segments that curls toward the player
    this.trunk = [];
    let parent = hd;
    const NS = 9, L = 2.7;
    for (let i = 0; i < NS; i++) {
      const r0 = lerp(2.7, 0.95, i / NS), r1 = lerp(2.7, 0.95, (i + 1) / NS);
      const k = new Kit();
      k.a(cyl(r0, r1, L + 0.3, 0, -L / 2, 0), P.hide);
      k.a(tor(r0 * 0.98, 0.16, 0, -0.5, 0, Math.PI / 2), P.hideD);
      if (i % 3 === 1) k.a(tor(r0 * 1.02, 0.36, 0, -L * 0.5, 0, Math.PI / 2), P.gold, GE);
      if (i === NS - 1) { k.a(ell(0, -L, 0, r1 * 1.15, 0.8, r1 * 1.15), P.hideD); }
      veins(k, this.rng, 0, -L / 2, 0, r0, L / 2, r0, 1, 1, 0.12);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(mergeGeometries(k.b), this.mat));
      g.add(new THREE.Mesh(mergeGeometries(k.s), this.seamMat));
      if (i === 0) g.position.set(0, -5.2, 1.6).sub(hd.userData.org); else g.position.set(0, -L, 0);
      parent.add(g); this.trunk.push(g); parent = g;
    }
    this.coreParent = hd;
    this.openParts = plates;
  }

  // ---------------------------------------------------------------- gameplay plumbing
  buildTargets() {
    const self = this;
    this.coreT = {
      pos: this.corePos, radius: 15, alive: true, lockable: false, hittable: false, hp: this.coreHp,
      hit(dmg, p, src) {
        if (!self.active || self.phase === 'dying') return 'none';
        if (self.openK < 0.55) { sparks(p || this.pos, null, 6, [2.2, 1.4, 3.6], 25, 1); return 'armor'; }
        this.hp -= dmg * (src === 'bomb' ? 0.6 : 1);
        self.flash = 1; emit('bossHit');
        if (this.hp <= 0) { this.hp = 0; self.die(); return 'kill'; }
        return 'hit';
      },
    };
    this.panT = this.panels.map((pn) => {
      const t = {
        pos: pn.pos, radius: 6.5, alive: true, lockable: true, hittable: true,
        hit(dmg) {
          if (!pn.alive || self.phase === 'intro') return 'none';
          pn.hp -= dmg; pn.flash = 1; emit('bossHit');
          if (pn.hp <= 0) { self.destroyPanel(pn); return 'kill'; }
          return 'hit';
        },
      };
      pn.target = t;
      return t;
    });
  }

  get maxHp() { return this.panelHp * this.nPanels + this.coreHp; }
  get hp() { let h = this.coreT.hp; for (const p of this.panels) if (p.alive) h += Math.max(0, p.hp); return h; }
  get focus() { return this.focusPos; }
  get headPos() { return this.focusPos; }
  botTarget() {
    for (const p of this.panels) if (p.alive) return p.pos;
    return this.corePos;
  }

  start() {
    this.active = true;
    this.phase = 'intro'; this.pt = 0; this.t = 0;
    this.openK = 0; this.openTarget = 0; this.flash = 0; this.spin = 0.6; this.spinA = 0;
    this.enraged = false; this.sub = 'drift'; this.subT = 3;
    this.beamLoop = null; this.chargeLoop = null; this.beamTick = 0;
    this.burstT = 3; this.mineT = 6; this.spiralA = 0; this.spiralT = 0; this.droneT = 5;
    this.reported = false; this.roared = false;
    this.purT = 0; this.slowDone = false; this.flashed = false; this.cried = false; this.gone = false; this.joy = 0; this.jit = 0;
    this.wispAcc = 0; this.lastU = 0; this.hlx = 0; this.hly = 0;
    this.coreT.hp = this.coreHp; this.coreT.alive = true;
    for (const p of this.panels) { p.hp = this.panelHp; p.alive = true; p.mesh.visible = true; p.mesh.scale.setScalar(1); p.target.alive = true; p.flash = 0; }
    this.setLook(0);
    this.core.visible = true; this.core.scale.setScalar(1);
    this.hs = 260; this.hu = 0; this.hv = 46;
    this.root.visible = true; this.body.visible = true;
    this.root.scale.setScalar(0.01);
    this.body.position.set(0, 0, 0);
    G.scene.add(this.root);
    for (const t of [this.coreT, ...this.panT]) TARGETS.add(t);
    this.place(0);
  }

  // k = 0: possessed by the shadow · 1: true colours
  setLook(k, enr = false) {
    const U = this.mat.userData;
    U.tint.value.copy(enr ? EN_TINT : SH_TINT).lerp(WHITE, k);
    U.emit.value = 4.5 * k;
    U.flash.value = 0;
    this.mat.emissive.setRGB(0, 0, 0);
    this.seamMat.color.copy(enr ? SEAM_EN : SEAM).lerp(SEAM_GOLD, k);
    this.seamMat.opacity = 1;
    this.eyeMat.color.copy(EYE_SH).lerp(_c.set(this.pal.eye).multiplyScalar(1.3), k);
    this.eyeMat.opacity = 1;
    this.coreCol.copy(this.coreBase);
  }

  stop() {
    this.active = false;
    G.scene.remove(this.root);
    for (const t of [this.coreT, ...this.panT]) TARGETS.delete(t);
    if (this.beamLoop) { this.beamLoop.stop(0.2); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.2); this.chargeLoop = null; }
    if (this.phase === 'dying' && !this.slowDone) { this.slowDone = true; G.slowMo = 1; }
  }

  panelsLeft() { let n = 0; for (const p of this.panels) if (p.alive) n++; return n; }
  destroyPanel(pn) {
    pn.alive = false; pn.target.alive = false; pn.mesh.visible = false;
    explode(pn.pos, 2.0, { tint: [0.8, 0.55, 1.3], debris: 6 });
    this.shadowBurst(pn.pos, 10, 14);
    AudioSys.sfx('explodeL'); addShake(0.3);
    emit('bossTurretDown', this.panelsLeft());
    if (this.panelsLeft() === 0) {
      this.phase = 'p2'; this.pt = 0; this.sub = 'drift'; this.subT = 1.5;
      AudioSys.sfx('roar', { pitch: 1.4 }); addShake(0.5);
      emit('bossPhase', 2);
    }
  }

  die() {
    this.phase = 'dying'; this.pt = 0; this.purT = 0;
    this.coreT.alive = false;
    this.openTarget = 1;
    if (this.beamLoop) { this.beamLoop.stop(0.1); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.1); this.chargeLoop = null; }
    AudioSys.sfx('roar', { pitch: 1.1 });
    bigFlash(0.7, [0.75, 0.45, 1]); addShake(0.9);
    this.shadowBurst(this.corePos, 26, 30);
    G.slowMo = 0.45;
    this.slowDone = false;
    this.d0 = { s: this.hs, u: this.hu, v: this.hv };
    this.awayU = this.hu >= 0 ? 1 : -1;
    emit('bossDying');
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt; this.pt += dt;
    const P = G.player, T = this.t, enr = this.enraged;
    let ts = this.hs, tu = this.hu, tv = this.hv;
    switch (this.phase) {
      case 'intro': {
        const k = clamp(this.pt / 2.4, 0, 1);
        this.root.scale.setScalar(Math.max(0.01, easeOutBack(k)));
        ts = 240; tv = 46; this.spin = lerp(6, 0.6, k);
        if (this.pt < 2.4 && Math.random() < 0.8) {
          _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(60).add(this.focusPos);
          FX.add.spawn(_v.x, _v.y, _v.z, (this.focusPos.x - _v.x) * 2.2 + this.vel.x, (this.focusPos.y - _v.y) * 2.2 + this.vel.y, (this.focusPos.z - _v.z) * 2.2 + this.vel.z, 0.45, 1.6, 0.4, [2.2, 1.0, 4.4, 1], [1, 0.4, 2, 0], 0, { stretch: 0.05 });
          _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(48).add(this.focusPos);
          FX.smoke.spawn(_v.x, _v.y, _v.z, (this.focusPos.x - _v.x) * 1.6 + this.vel.x, (this.focusPos.y - _v.y) * 1.6 + this.vel.y, (this.focusPos.z - _v.z) * 1.6 + this.vel.z, 0.6, 7, 2, [0.04, 0.02, 0.07, 0.75], [0.1, 0.04, 0.18, 0], 1, { fadeIn: 0.15 });
        }
        if (this.pt > 0.3 && !this.roared) { this.roared = true; AudioSys.sfx('roar', { pitch: 1.5 }); bigFlash(0.4, [0.7, 0.42, 1]); }
        if (this.pt > 6) { this.phase = 'p1'; this.pt = 0; emit('bossPhase', 1); }
        break;
      }
      case 'p1': {
        ts = 185 + 20 * Math.sin(T * 0.4);
        tu = 32 * Math.sin(T * 0.31);
        tv = 40 + 12 * Math.sin(T * 0.47);
        this.spin = 0.7;
        this.panelFire(dt);
        this.bursts(dt, 4.5);
        this.dropMines(dt);
        break;
      }
      case 'p2': {
        this.subT -= dt;
        this.spin = enr ? 1.4 : 0.9;
        switch (this.sub) {
          case 'drift':
            ts = 190 + 20 * Math.sin(T * 0.5); tu = 34 * Math.sin(T * (enr ? 0.45 : 0.33)); tv = 40 + 12 * Math.sin(T * 0.6);
            this.openTarget = 0;
            this.bursts(dt, enr ? 2.6 : 3.6);
            if (enr) this.drones(dt);
            if (this.subT <= 0) { this.sub = 'charge'; this.subT = enr ? 1.3 : 1.8; this.chargeLoop = AudioSys.loop('beamCharge'); emit('bossCharge'); }
            break;
          case 'charge':
            ts = damp(this.hs, 160, 2, dt); tu = damp(this.hu, P.u * 0.4, 1.5, dt); tv = damp(this.hv, clamp(P.v + 8, 20, 52), 1.5, dt);
            this.openTarget = 1;
            this.chargeFx();
            if (this.subT <= 0) {
              if (this.chargeLoop) { this.chargeLoop.stop(0.05); this.chargeLoop = null; }
              this.sub = 'beam'; this.subT = enr ? 2.1 : 2.6; this.beamT = 0; this.beamDir = P.u > 0 ? -1 : 1; this.beamLoop = AudioSys.loop('beam'); addShake(0.4);
            }
            break;
          case 'beam':
            ts = 160; this.openTarget = 1;
            this.beamFx(dt);
            if (this.subT <= 0) { if (this.beamLoop) { this.beamLoop.stop(0.15); this.beamLoop = null; } this.sub = 'open'; this.subT = enr ? 3 : 3.8; }
            break;
          case 'open':
            ts = 170 + Math.sin(T) * 8; tu = damp(this.hu, Math.sin(T * 0.8) * 24, 1, dt); tv = damp(this.hv, 38 + Math.sin(T * 1.2) * 8, 1, dt);
            this.openTarget = 1;
            this.spiral(dt);
            if (this.subT <= 0) { this.sub = 'drift'; this.subT = enr ? 3.5 : 4.8; }
            break;
        }
        if (!this.enraged && this.coreT.hp < this.coreHp * 0.5) {
          this.enraged = true;
          this.setLook(0, true);
          AudioSys.sfx('roar', { pitch: 1.8 });
          emit('bossPhase', 3);
        }
        break;
      }
      case 'dying': {
        [ts, tu, tv] = this.purify(dt);
        break;
      }
    }
    this.hs = damp(this.hs, ts, 2, dt); this.hu = damp(this.hu, tu, 2, dt); this.hv = damp(this.hv, tv, 2, dt);
    this.openK = damp(this.openK, this.openTarget, 4, dt);
    this.place(dt);
    if (this.phase !== 'dying' && this.body.visible) this.wisps(dt);
    this.collide();
  }

  // ---------------------------------------------------------------- purification
  purify(dt) {
    const r = (this.purT += G.rdt), d0 = this.d0;
    if (r > 1.0 && !this.slowDone) { this.slowDone = true; G.slowMo = 1; }
    if (!this.body.visible) return [this.hs, this.hu, this.hv];
    // the remaining shields crumble into dark motes
    this.panels.forEach((p, i) => {
      if (p.mesh.visible && r > 0.12 + i * 0.07) {
        p.mesh.visible = false; p.alive = false; p.target.alive = false;
        this.shadowBurst(p.pos, 12, 16);
      }
    });
    // the shadow coat peels away
    this.jit = 1 - smoothstep(0.5, 1.5, r);
    const peel = r < 0.25 ? r / 0.25 : 1 - smoothstep(1.4, 2.6, r);
    if (peel > 0) {
      const n = Math.round(peel * 5);
      for (let i = 0; i < n; i++) {
        this.hullPoint(_v, _v2);
        const sp = rand(8, 20);
        FX.smoke.spawn(_v.x, _v.y, _v.z, this.vel.x + _v2.x * sp, this.vel.y + _v2.y * sp + 6, this.vel.z + _v2.z * sp, rand(1.2, 2), rand(2.5, 4), rand(9, 14), [0.03, 0.015, 0.05, 0.85], [0.12, 0.05, 0.2, 0], 1, { fadeIn: 0.08, rotV: rand(-1.5, 1.5) });
        if (Math.random() < 0.7) FX.add.spawn(_v.x, _v.y, _v.z, this.vel.x + _v2.x * sp * 2, this.vel.y + _v2.y * sp * 2 + 8, this.vel.z + _v2.z * sp * 2, rand(0.5, 1), 0.7, 0.1, [2.2, 0.9, 4.6, 1], [0.8, 0.3, 1.8, 0], 0, { stretch: 0.04, drag: 1.2 });
      }
    }
    // true colours return; the shadow cracks heal to gold and fade
    const k = smoothstep(0.7, 2.2, r);
    this.setLook(k, this.enraged && k < 0.5);
    if (r < 1.5) { const fl = smoothstep(0, 0.3, r) * (1 - smoothstep(1.0, 1.5, r)); this.seamMat.color.multiplyScalar(1 + fl * 1.2); }
    this.seamMat.opacity = 1 - smoothstep(2.4, 3.6, r);
    this.coreCol.copy(this.coreBase).lerp(GOLD, smoothstep(0.6, 1.4, r));
    this.core.scale.setScalar(Math.max(0.001, 1 + 0.25 * smoothstep(0.6, 1.4, r) - 1.25 * smoothstep(1.4, 1.75, r)));
    this.core.visible = r < 1.75;
    if (r >= 1.5 && !this.flashed) {
      this.flashed = true;
      bigFlash(0.75, [1, 0.84, 0.45]); addShake(0.5);
      AudioSys.sfx('goldRing'); AudioSys.sfx('powerUp', { vol: 0.8 });
      const c = this.corePos;
      FX.add.spawn(c.x, c.y, c.z, this.vel.x, this.vel.y, this.vel.z, 0.9, 6, 110, [3, 2.2, 0.9, 0.9], [1, 0.5, 0.1, 0], 3, { rot: 0 });
      FX.add.spawn(c.x, c.y, c.z, this.vel.x, this.vel.y, this.vel.z, 0.6, 30, 70, [4, 3, 1.4, 1], [1.4, 0.8, 0.2, 0], 0);
      for (let i = 0; i < 40; i++) {
        _v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(30, 80));
        FX.add.spawn(c.x, c.y, c.z, this.vel.x + _v2.x, this.vel.y + _v2.y, this.vel.z + _v2.z, rand(0.6, 1.3), rand(0.6, 1.1), 0.1, [5, 3.6, 1.4, 1], [2, 1, 0.2, 0], 0, { stretch: 0.05, drag: 1.6 });
      }
      this.shadowBurst(c, 30, 24);
    }
    if (r > 2.0) this.openTarget = 0;
    if (r > 2.5 && !this.cried) { this.cried = true; AudioSys.sfx('roar', { pitch: { lan: 1.7, nghe: 1.3, phuong: 2.2, voi: 1.9 }[this.model] }); }
    this.joy = smoothstep(2.0, 3.2, r);
    // golden motes while freed, then dissolve into light
    const dk = smoothstep(4.2, 5.8, r);
    if (r > 1.5) {
      const n = (Math.random() < 0.6 ? 1 : 0) + Math.round(dk * 6);
      for (let i = 0; i < n; i++) {
        this.hullPoint(_v, _v2);
        FX.add.spawn(_v.x, _v.y, _v.z, this.vel.x + _v2.x * 4, this.vel.y + rand(6, 16) + dk * 20, this.vel.z + _v2.z * 4, rand(0.8, 1.6), rand(0.5, 1.0) + dk * 1.2, 0.1, [3.6, 2.6, 1.0, 1], [1.4, 0.8, 0.2, 0], 0, { drag: 0.5 });
      }
      if (this.model === 'phuong' && Math.random() < 0.7) {
        this.hullPoint(_v, _v2);
        FX.add.spawn(_v.x, _v.y, _v.z, this.vel.x + _v2.x * 3, this.vel.y + rand(4, 10), this.vel.z + _v2.z * 3, rand(0.5, 0.9), rand(1.6, 2.6), 0.3, [4, 1.8, 0.4, 0.9], [1.6, 0.3, 0.05, 0], 0, { drag: 0.8 });
      }
    }
    this.mat.emissive.setRGB(1.5 * dk, 1.05 * dk, 0.4 * dk);
    this.mat.userData.flash.value = 0.25 * smoothstep(1.4, 1.5, r) * (1 - smoothstep(1.5, 2.2, r));
    const shrink = easeInCubic(smoothstep(4.8, 5.9, r));
    this.root.scale.setScalar(Math.max(0.01, 1 - shrink * 0.97));
    if (r >= 5.9) {
      this.gone = true;
      const c = this.focusPos;
      glow(c, 60, 4, 3, 1.2, 1);
      FX.add.spawn(c.x, c.y, c.z, this.vel.x, this.vel.y + 6, this.vel.z, 1.2, 20, 50, [3, 2.2, 0.8, 0.8], [0.8, 0.4, 0.1, 0], 0);
      for (let i = 0; i < 30; i++) {
        _v2.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(15, 45));
        FX.add.spawn(c.x, c.y, c.z, this.vel.x + _v2.x, this.vel.y + _v2.y, this.vel.z + _v2.z, rand(0.8, 1.6), rand(0.5, 1), 0.1, [4, 3, 1.2, 1], [1.5, 0.8, 0.2, 0], 0, { drag: 1.2 });
      }
      AudioSys.sfx('extraLife', { vol: 0.7 });
      this.body.visible = false;
      for (const p of this.panels) p.mesh.visible = false;
      if (!this.reported) { this.reported = true; emit('bossDefeated'); }
    }
    // rise and depart
    const e = easeInOutCubic(clamp((r - 2.2) / 3.6, 0, 1));
    return [d0.s + 50 * e, d0.u + this.awayU * 10 * e, d0.v + 18 * e];
  }

  // random point on a hull (world) and its outward direction
  hullPoint(out, dir) {
    const x = Math.random() * this.hullW;
    let h = this.hulls[0];
    for (const hh of this.hulls) if (hh.cw >= x) { h = hh; break; }
    dir.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    out.set(h.c.x + dir.x * h.r.x, h.c.y + dir.y * h.r.y, h.c.z + dir.z * h.r.z);
    h.g.localToWorld(out);
    dir.transformDirection(h.g.matrixWorld);
    return out;
  }

  shadowBurst(pos, n, sp) {
    for (let i = 0; i < n; i++) {
      _v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 1) * sp);
      FX.smoke.spawn(pos.x, pos.y, pos.z, this.vel.x + _v2.x, this.vel.y + _v2.y + 3, this.vel.z + _v2.z, rand(0.9, 1.6), rand(2, 3.5), rand(6, 10), [0.03, 0.015, 0.05, 0.85], [0.1, 0.04, 0.16, 0], 1, { fadeIn: 0.05, rotV: rand(-2, 2), drag: 1.5 });
      if (i % 2 === 0) FX.add.spawn(pos.x, pos.y, pos.z, this.vel.x + _v2.x * 2.5, this.vel.y + _v2.y * 2.5, this.vel.z + _v2.z * 2.5, rand(0.4, 0.9), rand(0.4, 0.8), 0.1, [2.4, 1.0, 5, 1], [0.8, 0.3, 1.8, 0], 0, { stretch: 0.04, drag: 1.5 });
    }
  }

  // the shadow trails off the possessed beast
  wisps(dt) {
    this.wispAcc += dt * (this.phase === 'intro' ? 20 : 34);
    while (this.wispAcc >= 1) {
      this.wispAcc -= 1;
      this.hullPoint(_v, _v2);
      FX.smoke.spawn(_v.x, _v.y, _v.z, this.vel.x * 0.93 + _v2.x * 3, this.vel.y * 0.93 + _v2.y * 2 + 3.5, this.vel.z * 0.93 + _v2.z * 3, rand(1.2, 2.0), rand(2, 3.4), rand(7, 11), [0.035, 0.02, 0.06, 0.6], [0.1, 0.045, 0.17, 0], 1, { fadeIn: 0.25, rotV: rand(-1, 1) });
      if (Math.random() < 0.35) FX.add.spawn(_v.x, _v.y, _v.z, this.vel.x * 0.95 + _v2.x * 4, this.vel.y * 0.95 + 5, this.vel.z * 0.95 + _v2.z * 4, rand(0.5, 1.0), 0.6, 0.1, [1.8, 0.7, 3.8, 1], [0.6, 0.2, 1.4, 0], 0, {});
    }
  }

  // ---------------------------------------------------------------- pose & idle animation
  animate(dt) {
    const T = this.t, o = this.openK, joy = this.joy, enr = this.enraged ? 1 : 0, M = this.model;
    const br = Math.sin(T * 1.7);
    const ts0 = this.torsoS || 1;
    if (this.torso) this.torso.scale.set(ts0 * (1 + 0.012 * br), ts0 * (1 + 0.018 * br), ts0 * (1 + 0.01 * br));
    const swayK = 1 + enr * 0.4 + joy * 0.6;
    for (const s of this.sway) s.g.rotation[s.ax] = s.base + s.amp * swayK * Math.sin(T * s.f * (1 + joy * 0.4) + s.ph);
    for (const [g, ax, a] of this.openParts) g.rotation[ax] = o * a;
    // head: breathing bob, looks at the player, rears up when freed
    if (this.headG) {
      const h = this.headG;
      this.hlx = damp(this.hlx || 0, this.lookP * 0.35 - 0.25 * joy, 3, dt);
      this.hly = damp(this.hly || 0, this.lookY * 0.35, 3, dt);
      h.rotation.x = 0.04 * Math.sin(T * 1.7 + 0.6) + this.hlx;
      h.rotation.y = this.hly + this.jit * 0.12 * Math.sin(T * 31);
      h.rotation.z = this.jit * 0.1 * Math.sin(T * 23) + 0.05 * Math.sin(T * 0.9);
    }
    if (M === 'phuong') {
      const f = 1.5 + enr * 0.5 + joy * 2.2, amp = 0.13 + joy * 0.22;
      for (const w of this.wings) {
        const sd = w.userData.side;
        w.rotation.z = sd * (amp * Math.sin(T * f) - 0.02 + joy * 0.12);
        w.rotation.y = -sd * (0.18 + 0.08 * Math.sin(T * f + 0.8));
      }
    }
    if (M === 'voi') {
      for (let i = 0; i < this.trunk.length; i++) {
        const g = this.trunk[i];
        const curl = lerp(-0.02, -0.26, i / this.trunk.length);
        g.rotation.x = lerp(curl, -0.36, joy) + 0.07 * Math.sin(T * 1.3 - i * 0.55) * (1 + enr * 0.5);
        g.rotation.z = 0.06 * Math.sin(T * 0.9 - i * 0.45);
      }
    }
  }

  place(dt) {
    railToWorld(G.rail.d + this.hs, this.hu, this.hv, this.focusPos);
    railFrame(G.rail.d + this.hs, _p, _f, _r);
    this.vel.copy(_f).multiplyScalar(G.rail.speed);
    this.root.position.copy(this.focusPos);
    this.root.rotation.set(0, Math.atan2(-_f.x, -_f.z), 0);
    // the beast turns toward the player and banks as it drifts
    _v.copy(G.player.pos); this.root.worldToLocal(_v);
    const look = this.phase === 'dying' ? 0 : 1;
    this.lookY = Math.atan2(_v.x, _v.z) * look; this.lookP = -Math.atan2(_v.y, Math.hypot(_v.x, _v.z)) * look;
    this.body.rotation.y = damp(this.body.rotation.y, this.lookY * 0.45, 3, dt);
    this.body.rotation.x = damp(this.body.rotation.x, this.lookP * 0.4 - 0.2 * this.joy, 3, dt);
    const du = dt > 0 ? (this.hu - this.lastU) / dt : 0; this.lastU = this.hu;
    this.body.rotation.z = damp(this.body.rotation.z, clamp(-du * 0.012, -0.3, 0.3) + this.jit * 0.06 * Math.sin(this.t * 27), 3, dt);
    this.body.position.y = Math.sin(this.t * 1.1) * 0.8;
    this.animate(dt);
    this.spinA += this.spin * dt;
    const R = 30 + Math.sin(this.t * 0.9) * 3;
    for (const p of this.panels) {
      const a = p.a0 + this.spinA;
      p.mesh.position.set(Math.cos(a) * R, Math.sin(a) * R, 4);
      p.mesh.rotation.set(0, 0, a - Math.PI / 2);
      p.flash = Math.max(0, p.flash - dt * 6);
      p.mesh.scale.setScalar(1 + p.flash * 0.12);
    }
    this.root.updateMatrixWorld(true);
    for (const p of this.panels) p.pos.setFromMatrixPosition(p.mesh.matrixWorld);
    this.core.getWorldPosition(this.corePos);
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 9);
    const b = this.coreCol, o = this.openK;
    this.coreRing.rotation.set(this.t * 1.3, this.t * 2.1, 0);
    this.coreMat.color.setRGB(b.r * (1.5 + 5 * o * pulse) + this.flash * 6, b.g * (1.5 + 5 * o * pulse) + this.flash * 5, b.b * (1.5 + 5 * o * pulse) + this.flash * 5);
    this.haloMat.color.setRGB(b.r * (0.6 + o * pulse), b.g * (0.6 + o * pulse), b.b * (0.6 + o * pulse));
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.phase !== 'dying') this.mat.userData.flash.value = this.flash * 0.5;
    if (this.body.visible && this.core.visible) glow(this.corePos, (4 + 26 * o * pulse) * this.root.scale.x * this.core.scale.x, b.r * 2 * (0.25 + o), b.g * 2 * (0.25 + o), b.b * 2 * (0.25 + o), 0.9);
    this.coreT.hittable = this.phase === 'p2';
    this.coreT.lockable = o > 0.55 && this.phase === 'p2';
    for (const p of this.panels) p.target.hittable = p.alive && this.phase !== 'intro';
  }

  collide() {
    const P = G.player;
    if (!P.alive || this.phase === 'intro' || this.phase === 'dying') return;
    let hit = this.focusPos.distanceToSquared(P.pos) < (21 + 2.4) ** 2;
    for (const p of this.panels) if (!hit && p.alive && p.pos.distanceToSquared(P.pos) < 64) hit = true;
    if (hit && P.damage(16)) { P.vu = (P.u > this.hu ? 1 : -1) * 30; P.vv = P.v > this.hv ? 20 : -20; }
  }

  panelFire(dt) {
    for (const p of this.panels) {
      if (!p.alive) continue;
      p.fireT -= dt;
      if (p.fireT > 0) continue;
      p.fireT = rand(2.2, 3.4) / diff().fire;
      enemyShot(p.pos, aimAtPlayer(p.pos, 150, 0.04), Math.random() < 0.5 ? 'orb' : 'laser');
      AudioSys.sfx('enemyShot', { vol: 0.45, pitch: 1.1 });
    }
  }

  bursts(dt, every) {
    this.burstT -= dt;
    if (this.burstT > 0) return;
    this.burstT = every / diff().fire;
    const base = aimAtPlayer(this.focusPos, 110, 0);
    const axis = base.clone().normalize();
    const perp = new THREE.Vector3().crossVectors(axis, _up).normalize();
    const n = this.enraged ? 14 : 10;
    for (let i = 0; i < n; i++) {
      const off = perp.clone().applyAxisAngle(axis, i / n * TAU + this.t).multiplyScalar(24);
      enemyShot(this.focusPos, base.clone().add(off), 'orb');
    }
    AudioSys.sfx('enemyShot', { pitch: 0.7 });
  }

  dropMines(dt) {
    this.mineT -= dt;
    if (this.mineT > 0) return;
    this.mineT = rand(7, 9);
    for (let i = 0; i < 4; i++) spawnEnemy('mine', 'fixed', { s: G.rail.d + this.hs - 20, u: this.hu + rand(-30, 30), v: clamp(this.hv + rand(-20, 10), 8, 50), bob: 3, ph: rand(0, 6) });
  }

  drones(dt) {
    this.droneT -= dt;
    if (this.droneT > 0) return;
    this.droneT = 12;
    wave('drone', 'circle', 6, (i) => ({ s: G.rail.d + this.hs, dist: 110, enter: 2, stay: 6, r: 16, a0: i / 6 * TAU, spin: 1.6, u: this.hu * 0.5, v: clamp(this.hv, 16, 46) }), {});
  }

  spiral(dt) {
    this.spiralT -= dt;
    if (this.spiralT > 0) return;
    this.spiralT = this.enraged ? 0.09 : 0.13;
    this.spiralA += 0.55;
    const base = aimAtPlayer(this.focusPos, 120, 0);
    const axis = base.clone().normalize();
    const perp = new THREE.Vector3().crossVectors(axis, _up).normalize();
    const arms = this.enraged ? 3 : 2;
    for (let k = 0; k < arms; k++) {
      const off = perp.clone().applyAxisAngle(axis, this.spiralA + k * TAU / arms).multiplyScalar(30);
      enemyShot(this.focusPos, base.clone().add(off), 'orb');
    }
  }

  chargeFx() {
    const k = 1 - Math.max(0, this.subT) / 1.8;
    const b = this.coreCol;
    glow(this.corePos, 16 + k * 26, b.r * 5, b.g * 5, b.b * 5, 1);
    glow(this.corePos, 6 + k * 10, 6, 6, 6, 1, 2, this.t * 3);
    if (Math.random() < 0.6) {
      this.hullPoint(_v, _v2);
      FX.add.spawn(_v.x, _v.y, _v.z, this.vel.x + (this.corePos.x - _v.x) * 2.5, this.vel.y + (this.corePos.y - _v.y) * 2.5, this.vel.z + (this.corePos.z - _v.z) * 2.5, 0.4, 1.2, 0.3, [2.2, 0.9, 4.6, 1], [1, 0.4, 2, 0], 0, { stretch: 0.05 });
    }
    POST.ca = Math.max(POST.ca, 0.004 * k);
  }

  beamFx(dt) {
    const P = G.player;
    this.beamT += dt;
    const dur = this.enraged ? 2.1 : 2.6;
    const k = clamp(this.beamT / dur, 0, 1);
    const u = P.u * 0.3 + lerp(-58, 58, this.beamDir > 0 ? k : 1 - k);
    const v = clamp(P.v * 0.8 + 6, 6, 52);
    railToWorld(G.rail.d - 10, u, v, _v);
    const dir = _v2.subVectors(_v, this.focusPos).normalize();
    const start = this.corePos.clone().addScaledVector(dir, 6);
    const end = this.focusPos.clone().addScaledVector(dir, 700);
    const b = this.coreCol;
    const w = 1 + Math.sin(this.t * 60) * 0.08;
    FX.beams.add(start, end, 7 * w, b.r * 4, b.g * 4, b.b * 4);
    FX.beams.add(start, end, 2 * w, 4, 4, 4);
    glow(start, 20, b.r * 5, b.g * 5, b.b * 5, 1);
    this.beamTick -= dt;
    const seg = _p.copy(P.pos).sub(this.focusPos);
    const along = seg.dot(dir);
    const perpD = Math.sqrt(Math.max(0, seg.lengthSq() - along * along));
    if (along > 0 && perpD < 5.6 && P.alive && this.beamTick <= 0) { this.beamTick = 0.2; P.damage(11); }
    addShake(0.02);
  }
}

// ============================================================ Orbiting shields (root space, +y points outward)
function panelLan(k, P, rng) {
  for (const [x, y, r] of [[-3.3, -0.7, 3.0], [0, 0.9, 3.7], [3.3, -0.7, 3.0]]) {
    k.a(cyl(r, r, 1.4, x, y, 0, Math.PI / 2, 0, 0, 18), P.jade);
    k.a(tor(r, 0.38, x, y, 0.72), P.gold, GE);
  }
  k.a(tube(curlPts([0, 0.9, 0.85], [1, 0, 0], [0, 1, 0], 2.6, 1.9, 0.85), 0.42, 0.2), P.red);
  for (const s of [-1, 1]) k.a(tube(curlPts([3.3 * s, -0.7, 0.85], [0, 1, 0], [-s, 0, 0], 2.0, 1.5, 0.8), 0.32, 0.16), P.gold, GE);
  for (let i = -1; i <= 1; i++) k.a(tube([[i * 2.6, 3.4 - Math.abs(i), 0], [i * 3.1, 5.4 - Math.abs(i), 0.2], [i * 2.4 + 0.6, 7 - Math.abs(i) * 1.2, 0.3], [i * 2 + 1.2, 6.6 - Math.abs(i) * 1.2, 0.3]], 0.75, 0.15), i ? P.red : P.gold, i ? 0 : GE);
  veins(k, rng, 0, 0.3, 0, 6.5, 3.6, 1.0, 4, 2.5, 0.16);
}
function panelNghe(k, P, rng) {
  k.a(X(new THREE.DodecahedronGeometry(4.3, 0), 0, 0, 0, 0.4, 0.3, 0.2, 1.3, 1.0, 0.62), P.stone);
  k.a(X(new THREE.DodecahedronGeometry(2.2, 0), 3.6, -2.2, 0.4, 1, 2, 0.5, 1, 0.8, 0.7), P.stoneD);
  k.a(tube(curlPts([0, 0.3, 2.65], [1, 0, 0], [0, 1, 0], 2.4, 1.7, 0.82), 0.55, 0.25, 30, 5), P.stoneL);
  k.a(tube(curlPts([0, 0.3, 2.9], [1, 0, 0], [0, 1, 0], 2.4, 0.6, 0.3), 0.2, 0.15, 12, 4), P.gold, GE);
  k.a(ell(-1.5, 3.2, 0.6, 3, 0.6, 1.6), P.moss);
  veins(k, rng, 0, 0, 0, 5.4, 4.2, 2.6, 4, 2.5, 0.16);
}
function panelPhuong(k, P, rng) {
  k.a(ell(0, 0.8, 0, 2.7, 5.8, 0.7), P.red);
  k.a(ell(0, 1.4, 0.35, 1.8, 4.4, 0.5), P.orange);
  k.a(ell(0, 4.6, 0.7, 1.45, 1.85, 0.4), P.turq);
  k.a(ell(0, 4.6, 0.95, 0.8, 1.0, 0.3), P.gold, GE);
  k.a(cyl(0.18, 0.3, 11, 0, 0.6, 0.85), P.gold, GE);
  for (let i = -2; i <= 2; i++) k.a(ell(i * 0.9, -2.8 + Math.abs(i) * 0.4, 0.5, 0.8, 1.5, 0.3, 0, 0, i * 0.3), P.gold, GE);
  // flame tips burn violet while possessed, gold once freed
  k.sm(cone(1.3, 3.6, 0, 7.8, 0.2));
  for (const s of [-1, 1]) {
    k.sm(cone(0.8, 2.6, 1.5 * s, 6.6, 0.2, 0, 0, -0.45 * s));
    k.sm(tube([[1.8 * s, 3, 0.3], [2.8 * s, 5, 0.3], [2.4 * s, 7.4, 0.3], [1.4 * s, 8.4, 0.3]], 0.45, 0.1));
  }
  veins(k, rng, 0, 0.8, 0, 2.7, 5.8, 0.7, 2, 2, 0.14);
}
function panelVoi(k, P, rng) {
  k.a(cyl(4.9, 4.9, 1.0, 0, 0, 0, Math.PI / 2, 0, 0, 24), P.rattan);
  k.a(tor(4.9, 0.45, 0, 0, 0.3), P.gold, GE);
  k.a(cyl(3.4, 3.4, 0.4, 0, 0, 0.55, Math.PI / 2, 0, 0, 20), P.red);
  k.a(tor(3.4, 0.22, 0, 0, 0.75), P.gold, GE);
  k.a(tor(2.1, 0.2, 0, 0, 0.8), P.gold, GE);
  k.a(ell(0, 0, 0.9, 1.4, 1.4, 1.1), P.gold, GE);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; k.a(ell(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0.55, 0.35, 0.35, 0.3, 0, 0, 0, 6, 4), P.gold, GE); }
  k.a(tube(curlPts([0, 0, 0.62], [1, 0, 0], [0, 1, 0], 4.3, 3, 0.72), 0.1, 0.1, 60, 3), P.wood);
  veins(k, rng, 0, 0, 0, 4.9, 4.9, 1.0, 4, 3, 0.16);
}
