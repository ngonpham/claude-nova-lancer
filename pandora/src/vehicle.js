// Boss archetype VEHICLE — the RDA's war machines: the giant excavator, the Dragon assault ship, the Valkyrie
// shuttle, Quaritch's AMP suit, the armoured supply train, the tulkun-hunting ship and the SeaDragon.
// Each design supplies a hull, hardpoints (turrets), a reactor core behind armoured doors and a motion mode
// (air / ground / sea / rail). Phase 1: destroy the hardpoints. Phase 2: the doors open on the core, which
// charges and sweeps a beam; it is only vulnerable while open. Enraged under 50%: faster, more fire.
import * as THREE from 'three';
import { G, rand, clamp, lerp, damp, TAU, emit, diff, easeOutCubic, easeInOutCubic } from './core.js';
import { railFrame, railToWorld, emissiveVertexMaterial, mergeGeometries } from './world.js';
import { FX, explode, glow, sparks, addShake, bigFlash } from './fx.js';
import { TARGETS, enemyShot, aimAtPlayer } from './weapons.js';
import { AudioSys } from './audio.js';
import { loft, slab, fin, mirrorX } from './ship.js';
import { paint, spawnEnemy, wave } from './enemies.js';
import { POST } from './gfx.js';

const hexS = (w, h, y = 0) => [[w, y], [w * 0.7, y + h], [-w * 0.7, y + h], [-w, y], [-w * 0.8, y - h * 0.7], [w * 0.8, y - h * 0.7]];
const sym = (g, hex, em = 0) => [paint(g, hex, em), paint(mirrorX(g), hex, em)];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cylZ = (r, len, x, y, z, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z);

// Every design: build(C) → parts; core/doors at `door`; hardpoints; collision spheres [x,y,z,r]; engine glows.
const DESIGNS = {
  excavator: {
    size: 1.15, motion: 'ground', hv: 0, door: [0, 11, 22], doorScale: 0.75, turretScale: 0.8,
    hardpoints: [[-8, 17, 6], [10, 15, 8], [-13, 15, -14], [13, 15, -14], [0, 17, -20], [-3, 17, 16]],
    spheres: [[0, 11, 4, 17], [0, 11, -16, 16], [15, 4, -4, 8], [-15, 4, -4, 8]], engines: [[10, 22, -20], [-4, 22, -20]],
    build(C) {
      const P = [];
      for (const sx of [-1, 1]) {
        P.push(paint(box(10, 7, 46, sx * 15, 3.5, -4), '#2a2a2c'));
        for (let k = 0; k < 6; k++) P.push(paint(new THREE.CylinderGeometry(2.6, 2.6, 10.4, 8).rotateZ(Math.PI / 2).translate(sx * 15, 3.4, -22 + k * 7.2), '#4a4a4c'));
      }
      P.push(paint(box(26, 10, 34, 0, 12, -6), C.hull), paint(box(22, 8, 12, 0, 11, 16), C.plate), paint(box(28, 1, 36, 0, 17.4, -6), C.trim));
      P.push(paint(box(10, 9, 10, -8, 21.5, 4), C.hull), paint(box(9, 4, 0.4, -8, 23, 9.2), '#1a2a34', 0.3));
      P.push(paint(box(38, 9, 3, 0, 4.5, 30), '#8a8a8a'), paint(box(38, 1, 3.2, 0, 9.4, 30), C.trim));
      for (const sx of [-1, 1]) P.push(paint(box(2, 2, 12, sx * 14, 6, 24), '#3a3a3a'));
      // the excavator arm with its toothed bucket raised over the cab
      const arm = [[6, 18, -6], [6, 40, 4], [6, 34, 26]];
      for (let k = 0; k < 2; k++) { const a = new THREE.Vector3(...arm[k]), b = new THREE.Vector3(...arm[k + 1]); const o = new THREE.Object3D(); o.position.copy(a).add(b).multiplyScalar(0.5); o.lookAt(b); o.updateMatrix(); P.push(paint(new THREE.BoxGeometry(3, 3, a.distanceTo(b)).applyMatrix4(o.matrix), C.hull)); }
      P.push(paint(box(12, 8, 8, 6, 30, 28), '#3a3a3c'));
      for (let k = 0; k < 5; k++) P.push(paint(new THREE.ConeGeometry(0.7, 2.6, 4).rotateX(Math.PI).translate(1 + k * 2.4, 25, 31), '#cfcfcf'));
      for (const [x, z] of [[10, -20], [-4, -20]]) P.push(paint(new THREE.CylinderGeometry(1, 1.2, 8, 8).translate(x, 21, z), '#3a3a3a'));
      P.push(paint(box(14, 0.8, 0.6, 0, 16.2, 22.3), C.glow, 1));
      return P;
    },
  },
  dragon: {
    size: 1.35, motion: 'air', door: [0, 0, 44], doorScale: 0.85, turretScale: 1,
    hardpoints: [[-10, 11, 26], [10, 11, 26], [0, 13, 0], [-32, 6, 22], [32, 6, 22], [-32, 6, -22], [32, 6, -22], [0, 13, -28]],
    spheres: [[0, 3, 34, 11], [0, 4, 6, 15], [0, 5, -24, 15], [-32, 2, 22, 11], [32, 2, 22, 11], [-32, 2, -22, 11], [32, 2, -22, 11]], engines: [[-32, -1, 22], [32, -1, 22], [-32, -1, -22], [32, -1, -22]],
    build(C) {
      const P = [paint(loft([{ z: -42, pts: hexS(8, 7, 2) }, { z: -20, pts: hexS(14, 10, 1) }, { z: 18, pts: hexS(15, 10, 0) }, { z: 40, pts: hexS(10, 7, -1) }, { z: 50, pts: hexS(5, 4, -1) }]), C.hull)];
      P.push(paint(box(22, 2, 60, 0, 11, -2), C.plate), paint(box(14, 8, 14, 0, 16, -22), C.plate), paint(box(10, 1.2, 0.8, 0, 17, -14.6), C.glow, 1));
      for (const sx of [-1, 1]) for (const sz of [-22, 22]) {
        P.push(paint(box(18, 2, 4, sx * 22, 4, sz), C.plate));
        P.push(paint(new THREE.TorusGeometry(10, 1.8, 6, 20).rotateX(Math.PI / 2).translate(sx * 32, 2, sz), C.hull));
        P.push(paint(new THREE.CylinderGeometry(8.6, 8.6, 0.6, 18).translate(sx * 32, 2, sz), '#3a3e44'));
        P.push(paint(new THREE.TorusGeometry(8.2, 0.4, 4, 20).rotateX(Math.PI / 2).translate(sx * 32, 0.6, sz), C.glow, 1));
      }
      for (const sx of [-1, 1]) { P.push(paint(cylZ(2, 14, sx * 12, -6, 22), '#2a2c30')); P.push(paint(box(0.8, 0.8, 92, sx * 15.4, 1, -2), C.glow, 1)); }
      P.push(paint(cylZ(8, 10, 0, 0, 44), '#0a0a10'));
      return P;
    },
  },
  valkyrie: {
    size: 1.45, motion: 'air', door: [0, 0, 46], doorScale: 0.8, turretScale: 1,
    hardpoints: [[-14, 8, 12], [14, 8, 12], [0, 12, -8], [-36, 3, -22], [36, 3, -22], [0, 10, -40]],
    spheres: [[0, 2, 36, 10], [0, 3, 6, 14], [0, 4, -30, 14], [-34, 1, -22, 10], [34, 1, -22, 10]], engines: [[-10, 1, -66], [10, 1, -66], [0, 9, -66]],
    build(C) {
      const P = [paint(loft([{ z: -64, pts: hexS(11, 9, 2) }, { z: -30, pts: hexS(15, 11, 1) }, { z: 20, pts: hexS(13, 10, 0) }, { z: 42, pts: hexS(8, 7, -1) }, { z: 54, pts: hexS(3, 3, -1) }]), C.hull)];
      P.push(...sym(slab([[10, 28], [56, -26], [58, -38], [10, -40]], 2.2), C.plate));
      P.push(...sym(fin([[0, 0], [14, 0], [20, 18], [9, 17]], 1.2).translate(9, 8, -48), C.trim));
      for (const [x, y] of [[-10, 1], [10, 1], [0, 9]]) { P.push(paint(cylZ(5, 14, x, y, -60), '#2a2c30')); P.push(paint(new THREE.CylinderGeometry(4.2, 4.2, 0.6, 12).rotateX(Math.PI / 2).translate(x, y, -67.2), C.glow, 1)); }
      P.push(paint(box(16, 2, 40, 0, 10.5, -10), C.plate), paint(box(10, 1.4, 0.8, 0, 9, 30), '#1a2a34', 0.4));
      for (const sx of [-1, 1]) P.push(paint(box(0.8, 0.8, 80, sx * 13, 0, -10), C.glow, 1));
      P.push(paint(cylZ(7, 10, 0, 0, 46), '#0a0a10'));
      return P;
    },
  },
  amp: {
    size: 2.4, motion: 'ground', hv: 0, door: [0, 5.6, 1.9], doorScale: 0.26, turretScale: 0.32, walk: true,
    hardpoints: [[-2.9, 4.6, 0.9], [2.9, 4.6, 0.9], [-1.7, 7.4, -0.8], [1.7, 7.4, -0.8], [-1.3, 3.2, 1.0], [1.3, 3.2, 1.0]],
    spheres: [[0, 5.3, 0, 2.6], [0, 2, 0, 2.2]], engines: [[0, 6, -1.8]],
    build(C) {
      const P = [];
      for (const sx of [-1, 1]) {
        P.push(paint(box(1.1, 1.9, 1.3, sx * 1.1, 2.6, 0.2), C.plate), paint(box(0.9, 1.9, 1.0, sx * 1.1, 0.95, 0), '#2a2c30'), paint(box(1.3, 0.3, 2.0, sx * 1.1, 0.15, -0.1), '#2a2c30'));
      }
      P.push(paint(box(2.8, 0.7, 1.4, 0, 3.6, 0), '#2a2c30'));
      P.push(paint(box(3.6, 3.2, 2.8, 0, 5.4, -0.2), C.hull), paint(box(3.8, 0.4, 3.0, 0, 7.1, -0.2), C.trim));
      P.push(paint(new THREE.SphereGeometry(1.25, 10, 6, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.6).translate(0, 5.6, 1.2), '#1a2a34', 0.4));
      P.push(paint(box(0.9, 0.9, 3.4, -2.5, 4.9, 0.4), C.plate), paint(cylZ(0.25, 3, -2.5, 4.9, 2.6, 6), '#141518'));
      P.push(paint(box(0.8, 1.6, 0.8, 2.5, 4.4, 0.2), C.plate), paint(box(0.15, 0.5, 3.2, 2.5, 3.8, 1.8), '#d8dce0'));
      for (const sx of [-1, 1]) P.push(paint(box(1.1, 0.8, 1.6, sx * 1.7, 7.4, -0.8), '#2a2c30'));
      P.push(paint(box(2.4, 0.2, 0.15, 0, 6.7, 1.3), C.glow, 1));
      return P;
    },
  },
  train: {
    size: 1.25, motion: 'rail', hv: 0, door: [0, 6, 29], doorScale: 0.55, turretScale: 0.75,
    hardpoints: [[0, 12, 14], [-3.5, 12, -18], [3.5, 12, -26], [0, 12, -52], [-3.5, 13.5, -86], [3.5, 13.5, -96]],
    spheres: [[0, 6, 14, 9], [0, 6, -20, 9], [0, 6, -54, 9], [0, 7, -92, 10]], engines: [[0, 14, -108]],
    build(C) {
      const P = [];
      const car = (z0, z1, h, col) => { P.push(paint(box(10, h, z1 - z0, 0, 2 + h / 2, (z0 + z1) / 2), col), paint(box(10.6, 0.6, z1 - z0 + 0.4, 0, 2 + h, (z0 + z1) / 2), C.trim)); for (const z of [z0 + 4, z1 - 4]) for (const sx of [-1, 1]) P.push(paint(new THREE.CylinderGeometry(1.2, 1.2, 1, 8).rotateZ(Math.PI / 2).translate(sx * 2.4, 1.2, z), '#2a2a2c')); };
      car(0, 28, 9, C.hull); car(-34, -6, 9, C.plate); car(-68, -40, 9, C.hull); car(-112, -74, 11, C.plate);
      P.push(paint(box(9, 4, 6, 0, 15, -100), '#2a2c30'), paint(new THREE.CylinderGeometry(1.2, 1.4, 6, 8).translate(0, 16, -108), '#2a2c30'));
      for (let z = -112; z < 28; z += 3) P.push(paint(box(0.4, 0.4, 0.4, -5.3, 8, z), C.glow, 1));
      P.push(paint(cylZ(4.4, 2, 0, 6, 28.4), '#0a0a10'));
      return P;
    },
  },
  whaler: {
    size: 1.3, motion: 'sea', hv: 0, door: [0, 7, 31], doorScale: 0.55, turretScale: 0.8,
    hardpoints: [[-8, 9, 20], [8, 9, 20], [0, 19, 0], [-8, 9, -28], [8, 9, -28], [0, 10, -58]],
    spheres: [[0, 6, 18, 11], [0, 8, -10, 13], [0, 6, -42, 12]], engines: [[-5, 3, 32], [5, 3, 32]],
    build(C) {
      const P = [paint(loft([{ z: -74, pts: hexS(1.5, 3, 2) }, { z: -60, pts: hexS(9, 6, 2) }, { z: -10, pts: hexS(13, 7, 1.5) }, { z: 30, pts: hexS(12, 6.5, 1.5) }]), '#e2e2da')];
      P.push(paint(box(24, 1, 100, 0, 8.2, -20), C.plate), paint(box(16, 10, 20, 0, 13, -2), C.hull), paint(box(14, 2, 0.6, 0, 15.5, 8.3), '#1a2a34', 0.4));
      P.push(paint(new THREE.CylinderGeometry(0.6, 0.8, 22, 6).translate(0, 20, -12), '#9aa0a8'));
      const o = new THREE.Object3D(); o.position.set(0, 16, -40); o.lookAt(0, 30, -68); o.updateMatrix(); P.push(paint(new THREE.BoxGeometry(1.4, 1.4, 34).applyMatrix4(o.matrix), '#e0b030'));
      for (const sx of [-1, 1]) P.push(paint(box(0.8, 0.8, 100, sx * 12.4, 7, -20), C.glow, 1));
      P.push(paint(box(22, 1.4, 4, 0, 4, 29), '#b8302a'));
      P.push(paint(cylZ(5, 2, 0, 7, 30.5), '#0a0a10'));
      return P;
    },
  },
  seadragon: {
    size: 1.55, motion: 'sea', hv: 0, door: [0, 12, 74], doorScale: 0.85, turretScale: 1,
    hardpoints: [[-30, 15, 50], [30, 15, 50], [-30, 15, 0], [30, 15, 0], [0, 15, 18], [0, 15, -18], [-30, 15, -60], [30, 15, -60]],
    spheres: [[-30, 6, 40, 14], [30, 6, 40, 14], [-30, 6, -20, 14], [30, 6, -20, 14], [0, 14, 60, 14], [0, 18, -10, 18], [0, 22, -50, 16]], engines: [[-30, 4, -92], [30, 4, -92], [0, 12, -92]],
    build(C) {
      const P = [];
      for (const sx of [-1, 1]) P.push(paint(loft([{ z: -92, pts: hexS(7, 6, 2) }, { z: -40, pts: hexS(10, 8, 2) }, { z: 40, pts: hexS(10, 8, 2) }, { z: 78, pts: hexS(4, 4, 2) }]).translate(sx * 30, 0, 0), '#d8d8d0'));
      P.push(paint(box(72, 4, 150, 0, 12, -10), C.hull), paint(box(70, 0.6, 148, 0, 14.3, -10), C.plate));
      P.push(paint(box(30, 14, 30, 0, 21, -40), C.hull), paint(box(20, 10, 16, 0, 32, -46), C.plate), paint(box(18, 2, 0.6, 0, 33, -37.7), '#1a2a34', 0.5));
      P.push(paint(new THREE.CylinderGeometry(0.8, 1.2, 30, 6).translate(6, 50, -48), '#9aa0a8'));
      P.push(...sym(slab([[36, 40], [70, 10], [72, 0], [36, -10]], 1.6).translate(0, 10, 0), C.plate));
      for (const sx of [-1, 1]) P.push(paint(box(1, 1, 150, sx * 36, 13, -10), C.glow, 1));
      for (let k = 0; k < 6; k++) P.push(paint(box(6, 0.4, 6, -20 + k * 8, 14.8, 30), '#e8b830'));
      P.push(paint(box(30, 14, 12, 0, 12, 70), C.plate));
      P.push(paint(cylZ(8, 4, 0, 12, 75), '#0a0a10'));
      return P;
    },
  },
};

function hullGeo(C, D) { return mergeGeometries(D.build(C)); }

function doorGeo(C, side) {
  // one half of a clamshell armour cover, hinged at x = side * 9 (pivot at the origin of this geometry)
  const g = loft([{ z: -10, pts: [[0, -7], [side * 9, -5], [side * 10, 0], [side * 9, 5], [0, 7]] }, { z: 10, pts: [[0, -4], [side * 5, -3], [side * 6, 0], [side * 5, 3], [0, 4]] }]);
  g.translate(-side * 9, 0, 0);
  const parts = [paint(side < 0 ? g : mirrorX(mirrorX(g)), C.plate), paint(new THREE.BoxGeometry(0.6, 10, 18).translate(-side * 8.6, 0, 0), C.trim)];
  return mergeGeometries(parts);
}

function turretGeo(C) {
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(3, 3.6, 1.6, 8), C.plate),
    paint(new THREE.SphereGeometry(2.6, 10, 5, 0, TAU, 0, Math.PI / 2).translate(0, 0.7, 0), C.hull),
    ...[-0.9, 0.9].map(x => paint(new THREE.CylinderGeometry(0.35, 0.42, 5, 6).rotateX(Math.PI / 2).translate(x, 1.6, 3), '#16181e')),
    paint(new THREE.BoxGeometry(2, 0.5, 0.5).translate(0, 2.4, 1.6), C.glow, 1),
  ]);
}

export class VehicleBoss {
  constructor(cfg = {}) {
    this.cfg = cfg;
    const C = { hull: '#3a4250', plate: '#5a6474', trim: '#e0b040', glow: '#46e0ff', core: '#46e0ff', ...(cfg.palette || {}) };
    this.C = C;
    this.final = !!cfg.final;
    const D = DESIGNS[cfg.kind || 'dragon'];
    this.D = D;
    this.motion = D.motion;
    this.size = D.size * (cfg.scale || 1);
    this.coreHp = Math.round(170 * (cfg.hp || 1));
    this.turretHp = Math.round(9 * (cfg.hp || 1));
    this.nTur = Math.min(D.hardpoints.length, cfg.turrets || D.hardpoints.length);
    this.mat = emissiveVertexMaterial({ roughness: 0.42, metalness: 0.6 }, 3.2);
    this.root = new THREE.Group();
    this.ship = new THREE.Group();
    this.ship.scale.setScalar(this.size);
    this.root.add(this.ship);
    this.hull = new THREE.Mesh(hullGeo(C, D), this.mat);
    this.hull.castShadow = true;
    this.ship.add(this.hull);
    this.doors = [];
    for (const side of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(D.door[0] + side * 9 * D.doorScale, D.door[1], D.door[2]);
      piv.scale.setScalar(D.doorScale);
      const m = new THREE.Mesh(doorGeo(C, side), this.mat);
      piv.add(m);
      piv.userData.side = side;
      this.ship.add(piv);
      this.doors.push(piv);
    }
    const cc = new THREE.Color(C.core);
    this.coreMat = new THREE.MeshBasicMaterial({ color: cc.clone().multiplyScalar(3) });
    this.coreBase = cc;
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(5.2 * D.doorScale, 2), this.coreMat);
    this.core.position.set(D.door[0], D.door[1], D.door[2]);
    this.ship.add(this.core);
    const gt = turretGeo(C);
    this.turrets = [];
    for (let i = 0; i < this.nTur; i++) {
      const hp = D.hardpoints[i];
      const tm = new THREE.Mesh(gt, this.mat);
      tm.position.set(hp[0], hp[1], hp[2]);
      tm.scale.setScalar(1.15 * D.turretScale);
      this.ship.add(tm);
      this.turrets.push({ mesh: tm, hp: this.turretHp, alive: true, pos: new THREE.Vector3(), fireT: rand(1, 3), flash: 0 });
    }
    this.focusPos = new THREE.Vector3();
    this.corePos = new THREE.Vector3();
    this.head = this.root;
    this.buildTargets();
    this.active = false;
  }

  buildTargets() {
    const self = this;
    this.coreT = {
      pos: this.corePos, radius: Math.max(5, 7 * self.D.doorScale * this.size / 1.4), alive: true, lockable: false, hittable: false, hp: this.coreHp,
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
    this.hullT = { pos: this.hullPos = new THREE.Vector3(), radius: 0.6 * this.D.spheres[0][3] * this.size, alive: true, lockable: false, hittable: true, hit: () => 'armor' };
    this.turT = this.turrets.map((tr) => {
      const t = {
        pos: tr.pos, radius: Math.max(3.4, 4.6 * this.size * this.D.turretScale), alive: true, lockable: true, hittable: true,
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
    this.reported = false; this.deadT = 0; this.deathT = 0; this.deathN = 0;
    this.coreT.hp = this.coreHp; this.coreT.alive = true;
    for (const t of this.turrets) { t.hp = this.turretHp; t.alive = true; t.mesh.visible = true; t.target.alive = true; t.flash = 0; }
    this.mat.userData.tint.value.setRGB(1, 1, 1);
    this.mat.userData.emit.value = 3.2;
    this.hs = 520; this.hu = 0; this.hv = this.motion === 'air' ? 260 : this.D.hv; this.bank = 0; this.pitch = 0; this.fall = 0;
    this.ship.visible = true;
    G.scene.add(this.root);
    for (const t of [this.coreT, this.hullT, ...this.turT]) TARGETS.add(t);
    this.place(0);
  }

  stop() {
    this.active = false;
    G.scene.remove(this.root);
    for (const t of [this.coreT, this.hullT, ...this.turT]) TARGETS.delete(t);
    if (this.beamLoop) { this.beamLoop.stop(0.2); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.2); this.chargeLoop = null; }
  }

  turretsLeft() { let n = 0; for (const t of this.turrets) if (t.alive) n++; return n; }
  destroyTurret(tr) {
    tr.alive = false; tr.target.alive = false; tr.mesh.visible = false;
    explode(tr.pos, 2.6);
    AudioSys.sfx('explodeL'); addShake(0.35);
    tr.burn = true;
    emit('bossTurretDown', this.turretsLeft());
    if (this.turretsLeft() === 0) {
      this.phase = 'p2'; this.pt = 0; this.sub = 'strafe'; this.subT = 1.5;
      AudioSys.sfx('roar', { pitch: 0.7 }); addShake(0.5);
      emit('bossPhase', 2);
    }
  }

  die() {
    this.phase = 'dying'; this.pt = 0;
    this.coreT.alive = false;
    this.doorTarget = 1;
    if (this.beamLoop) { this.beamLoop.stop(0.1); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.1); this.chargeLoop = null; }
    AudioSys.sfx('roar', { pitch: 0.6 });
    bigFlash(0.8, [1, 0.7, 0.6]); addShake(1);
    G.slowMo = 0.3;
    this.deathT = 0.2; this.deathN = 0;
    emit('bossDying');
  }

  // ---------------------------------------------------------------- behaviour
  update(dt) {
    if (!this.active) return;
    this.t += dt; this.pt += dt;
    const P = G.player, T = this.t;
    let ts = this.hs, tu = this.hu, tv = this.hv, k = 1.8;
    const enr = this.enraged;
    switch (this.phase) {
      case 'intro': {
        const e = easeOutCubic(clamp(this.pt / 5.2, 0, 1));
        ts = lerp(520, 240, e); tv = this.motion === 'air' ? lerp(260, 40, e) : this.D.hv; tu = Math.sin(this.pt * 0.6) * 10; k = 4;
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
            this.doorTarget = 1;
            this.chargeFx();
            if (this.subT <= 0) {
              if (this.chargeLoop) { this.chargeLoop.stop(0.05); this.chargeLoop = null; }
              this.sub = 'beam'; this.subT = enr ? 2.1 : 2.6; this.beamT = 0; this.beamDir = P.u > 0 ? -1 : 1; this.beamLoop = AudioSys.loop('beam'); addShake(0.4);
            }
            break;
          case 'beam':
            ts = 175; this.doorTarget = 1;
            this.beamFx(dt);
            if (this.subT <= 0) { if (this.beamLoop) { this.beamLoop.stop(0.15); this.beamLoop = null; } this.sub = 'open'; this.subT = enr ? 2.6 : 3.4; }
            break;
          case 'open':
            ts = 180 + Math.sin(T * 1.5) * 6; tu = damp(this.hu, P.u * 0.3 + Math.sin(T) * 12, 1, dt); tv = damp(this.hv, 32 + Math.sin(T * 1.3) * 6, 1, dt);
            this.doorTarget = 1;
            if (Math.random() < dt * (enr ? 1.6 : 1.1)) this.coreSpread();
            if (this.subT <= 0) { this.sub = 'strafe'; this.subT = enr ? 3.5 : 5; this.cycle++; }
            break;
        }
        if (!this.enraged && this.coreT.hp < this.coreHp * 0.5) {
          this.enraged = true;
          this.mat.userData.tint.value.setRGB(1.35, 0.7, 0.72);
          this.mat.userData.emit.value = 5;
          AudioSys.sfx('roar', { pitch: 0.8 });
          emit('bossPhase', 3);
        }
        break;
      }
      case 'dying': {
        this.fall += dt * 9;
        ts = this.hs + dt * 20; tv = this.motion === 'air' || this.motion === 'sea' ? this.hv - this.fall * dt * (this.motion === 'sea' ? 0.6 : 2) : this.hv; tu = this.hu;
        this.deathT -= G.rdt;
        if (this.deathT <= 0 && this.deathN < 14) {
          this.deathT = 0.14; this.deathN++;
          _v.copy(this.focusPos).add(_v2.set(rand(-40, 40), rand(-8, 14), rand(-40, 40)).multiplyScalar(this.size));
          explode(_v, rand(2.2, 4), { debris: 6 });
          AudioSys.sfx(this.deathN % 2 ? 'explodeM' : 'explodeL', { vol: 0.8 });
        }
        if (this.deathN >= 14 && this.ship.visible) {
          explode(this.focusPos, 8, { debris: 20 });
          explode(_v.copy(this.focusPos).add(_v2.set(0, 10, 0)), 5);
          AudioSys.sfx('explodeL'); AudioSys.sfx('bombBlast');
          bigFlash(1, [1, 0.9, 0.8]); addShake(1.2);
          this.ship.visible = false;
          G.slowMo = 1;
          this.deadT = 0;
        }
        if (!this.ship.visible) { this.deadT += G.rdt; if (this.deadT > 2.2 && !this.reported) { this.reported = true; emit('bossDefeated'); } }
        break;
      }
    }
    // surface vehicles stay on the ground / water / rails
    if (this.motion !== 'air' && this.phase !== 'dying') {
      tv = this.D.hv + (this.motion === 'sea' ? Math.sin(this.t * 0.9) * 0.6 : 0);
      tu = this.motion === 'rail' ? 0 : clamp(tu, -30, 30);
    }
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
    this.root.rotation.set(0, Math.atan2(-_f.x, -_f.z), 0);   // local +Z (the bow) faces back down the rail
    const air = this.motion === 'air';
    this.ship.rotation.set((air ? -0.08 + Math.sin(this.t * 0.7) * 0.02 : this.motion === 'sea' ? Math.sin(this.t * 0.8) * 0.015 : 0) + (this.phase === 'dying' && air ? this.fall * 0.012 : 0), 0,
      (air ? this.bank : this.motion === 'sea' ? Math.sin(this.t * 0.6) * 0.02 : 0) + (this.phase === 'dying' && air ? this.fall * 0.01 : 0));
    this.ship.position.y = this.D.walk ? Math.abs(Math.sin(this.t * 3)) * 0.35 * this.size : 0;
    for (const d of this.doors) d.rotation.y = d.userData.side * this.doorOpen * 1.1;
    this.root.updateMatrixWorld(true);
    this.core.getWorldPosition(this.corePos);
    _v.set(this.D.spheres[0][0], this.D.spheres[0][1], this.D.spheres[0][2]).applyMatrix4(this.ship.matrixWorld); this.hullPos.copy(_v);
    for (const t of this.turrets) {
      t.mesh.getWorldPosition(t.pos);
      if (t.alive) {
        // aim barrels at the player (local space of the ship)
        _v.copy(G.player.pos);
        this.ship.worldToLocal(_v);
        t.mesh.rotation.y = Math.atan2(_v.x - t.mesh.position.x, _v.z - t.mesh.position.z);
        t.flash = Math.max(0, t.flash - dt * 6);
      } else if (t.burn && Math.random() < dt * 20) {
        FX.add.spawn(t.pos.x + rand(-2, 2), t.pos.y + 3, t.pos.z + rand(-2, 2), 0, rand(3, 6), 0, 0.5, 2, 4, [4, 1.6, 0.4, 1], [0.8, 0.2, 0, 0], 1);
        FX.smoke.spawn(t.pos.x, t.pos.y + 4, t.pos.z, rand(-1, 1), rand(3, 7), rand(1, 4), 1.6, 2, 7, [0.1, 0.1, 0.11, 0.7], [0.25, 0.25, 0.27, 0], 1, { fadeIn: 0.06 });
      }
    }
    // engine glow
    const gc = new THREE.Color(this.C.glow);
    for (const e of this.D.engines) { _v.set(e[0], e[1], e[2]).applyMatrix4(this.ship.matrixWorld); glow(_v, 9 * this.size * (this.D.turretScale + 0.3), gc.r * 2.5, gc.g * 2.5, gc.b * 2.5, 0.8); }
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 10);
    const open = this.doorOpen;
    const b = this.coreBase;
    this.coreMat.color.setRGB(b.r * (2 + 5 * open * pulse) + this.flash * 6, b.g * (2 + 5 * open * pulse) + this.flash * 5, b.b * (2 + 5 * open * pulse) + this.flash * 5);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.userData.flash.value = this.flash * 0.5;
    if (open > 0.3) glow(this.corePos, 14 * open * pulse * this.size, b.r * 3 * open, b.g * 3 * open, b.b * 3 * open, 0.9);
    this.coreT.hittable = this.phase === 'p2';
    this.coreT.lockable = open > 0.55 && this.phase === 'p2';
    this.hullT.hittable = this.phase !== 'intro' && this.phase !== 'dying';
    for (const t of this.turrets) t.target.hittable = t.alive && this.phase !== 'intro';
  }

  collide() {
    const P = G.player;
    if (!P.alive || this.phase === 'intro' || this.phase === 'dying') return;
    const s = this.size;
    let hit = false;
    for (const [x, y, z, r] of this.D.spheres) {
      _v.set(x, y, z).applyMatrix4(this.ship.matrixWorld);
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
    for (const hp of [this.D.hardpoints[0], this.D.hardpoints[1]]) {
      _v.set(hp[0], hp[1], hp[2]).applyMatrix4(this.ship.matrixWorld);
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
      const hp = this.D.hardpoints[(i + 2) % this.D.hardpoints.length];
      _v.set(hp[0], hp[1] + 2, hp[2]).applyMatrix4(this.ship.matrixWorld);
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
