// Boss archetype WARSHIP — a flying battleship of the Black Cloud armada (Kuala Lumpur, Jakarta, New Delhi,
// and the Tokyo flagship). It hovers ahead of the squadron with its bow toward the player.
// Phase 1: deck/wing turrets + broadsides + missiles. Phase 2: the armoured bow doors open on a reactor core
// that charges and sweeps a beam; the core is only vulnerable while the doors are open.
// Enraged (core < 50%): faster cycles, ring bursts, drone launches; the flagship also fires twin beams.
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

// Turret hardpoints in hull space (+Z = bow, toward the player)
const HARDPOINTS = [
  [-11, 12.5, 26], [11, 12.5, 26], [0, 15, 4], [-46, 4.5, -6], [46, 4.5, -6], [-26, 9.5, -22], [26, 9.5, -22], [0, 18, -34],
];

function hullGeo(C) {
  const parts = [];
  const hull = loft([
    { z: -64, pts: hexS(12, 8, 2) }, { z: -46, pts: hexS(20, 12, 1) }, { z: -10, pts: hexS(24, 13, 0) },
    { z: 24, pts: hexS(20, 11, 0) }, { z: 46, pts: hexS(13, 8, -1) }, { z: 56, pts: hexS(6, 5, -1.5) },
  ]);
  parts.push(paint(hull, C.hull));
  // deck plating & superstructure
  parts.push(paint(new THREE.BoxGeometry(26, 2, 70).translate(0, 12.5, -6), C.plate));
  parts.push(paint(new THREE.BoxGeometry(16, 14, 20).translate(0, 19, -30), C.plate));
  parts.push(paint(new THREE.BoxGeometry(12, 6, 14).translate(0, 29, -34), C.hull));
  parts.push(paint(new THREE.BoxGeometry(12.4, 1.2, 1).translate(0, 27, -19.6), C.glow, 1));
  parts.push(paint(new THREE.CylinderGeometry(0.4, 0.6, 18, 5).translate(4, 40, -36), '#9aa0aa'));
  parts.push(paint(new THREE.CylinderGeometry(0.4, 0.6, 12, 5).translate(-4, 37, -38), '#9aa0aa'));
  // trim lines along the hull
  for (const sx of [-1, 1]) {
    parts.push(paint(new THREE.BoxGeometry(0.8, 0.8, 92).translate(sx * 21.5, 1, -8), C.glow, 1));
    parts.push(paint(new THREE.BoxGeometry(1.2, 1.4, 60).translate(sx * 14.5, 13.6, -6), C.trim));
  }
  // wings with engine nacelles
  const wing = slab([[18, 18], [62, -6], [64, -18], [18, -34]], 2.4);
  parts.push(...sym(wing.translate(0, 2, 0), C.plate));
  parts.push(...sym(slab([[22, 16], [60, -6], [61, -9], [22, 10]], 0.6).translate(0, 3.6, 0), C.trim));
  for (const sx of [-1, 1]) {
    parts.push(paint(new THREE.CylinderGeometry(5, 6, 30, 10).rotateX(Math.PI / 2).translate(sx * 58, 1, 4), C.hull));
    parts.push(paint(new THREE.CylinderGeometry(4.4, 4.4, 1, 10).rotateX(Math.PI / 2).translate(sx * 58, 1, -11.6), C.glow, 1));
    parts.push(paint(new THREE.ConeGeometry(5, 9, 10).rotateX(Math.PI / 2).translate(sx * 58, 1, 23), C.plate));
    parts.push(paint(fin([[0, 0], [12, 0], [16, 12], [6, 11]], 1).translate(sx * 58, 5, -8), C.trim));
  }
  // stern engines
  for (const [x, y] of [[-9, 2], [9, 2], [0, 10]]) parts.push(paint(new THREE.CylinderGeometry(4.2, 4.2, 1, 12).rotateX(Math.PI / 2).translate(x, y, -64.6), C.glow, 1));
  // bow cavity (dark) where the doors open
  parts.push(paint(new THREE.CylinderGeometry(7, 9, 10, 10).rotateX(Math.PI / 2).translate(0, 0, 50), '#0a0a10'));
  return mergeGeometries(parts);
}

function doorGeo(C, side) {
  // one half of the bow shell, hinged at x = side * 9 (pivot at the origin of this geometry)
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

export class WarshipBoss {
  constructor(cfg = {}) {
    this.cfg = cfg;
    const C = { hull: '#3a4250', plate: '#5a6474', trim: '#e0b040', glow: '#46e0ff', core: '#46e0ff', ...(cfg.palette || {}) };
    this.C = C;
    this.final = !!cfg.final;
    this.size = this.final ? 1.85 : 1.5;
    this.coreHp = Math.round(170 * (cfg.hp || 1));
    this.turretHp = Math.round(9 * (cfg.hp || 1));
    this.nTur = Math.min(HARDPOINTS.length, cfg.turrets || 6);
    this.mat = emissiveVertexMaterial({ roughness: 0.42, metalness: 0.6 }, 3.2);
    this.root = new THREE.Group();
    this.ship = new THREE.Group();
    this.ship.scale.setScalar(this.size);
    this.root.add(this.ship);
    this.hull = new THREE.Mesh(hullGeo(C), this.mat);
    this.hull.castShadow = true;
    this.ship.add(this.hull);
    this.doors = [];
    for (const side of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(side * 9, 0, 50);
      const m = new THREE.Mesh(doorGeo(C, side), this.mat);
      piv.add(m);
      piv.userData.side = side;
      this.ship.add(piv);
      this.doors.push(piv);
    }
    const cc = new THREE.Color(C.core);
    this.coreMat = new THREE.MeshBasicMaterial({ color: cc.clone().multiplyScalar(3) });
    this.coreBase = cc;
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(5.2, 2), this.coreMat);
    this.core.position.set(0, 0, 50);
    this.ship.add(this.core);
    const gt = turretGeo(C);
    this.turrets = [];
    for (let i = 0; i < this.nTur; i++) {
      const hp = HARDPOINTS[i];
      const tm = new THREE.Mesh(gt, this.mat);
      tm.position.set(hp[0], hp[1], hp[2]);
      tm.scale.setScalar(1.15);
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
    this.reported = false; this.deadT = 0; this.deathT = 0; this.deathN = 0;
    this.coreT.hp = this.coreHp; this.coreT.alive = true;
    for (const t of this.turrets) { t.hp = this.turretHp; t.alive = true; t.mesh.visible = true; t.target.alive = true; t.flash = 0; }
    this.mat.userData.tint.value.setRGB(1, 1, 1);
    this.mat.userData.emit.value = 3.2;
    this.hs = 520; this.hu = 0; this.hv = 260; this.bank = 0; this.pitch = 0; this.fall = 0;
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
        ts = lerp(520, 240, e); tv = lerp(260, 40, e); tu = Math.sin(this.pt * 0.6) * 10; k = 4;
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
        ts = this.hs + dt * 20; tv = this.hv - this.fall * dt * 2; tu = this.hu;
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
    this.ship.rotation.set(-0.08 + (this.phase === 'dying' ? this.fall * 0.012 : 0) + Math.sin(this.t * 0.7) * 0.02, 0, this.bank + (this.phase === 'dying' ? this.fall * 0.01 : 0));
    for (const d of this.doors) d.rotation.y = d.userData.side * this.doorOpen * 1.1;
    this.root.updateMatrixWorld(true);
    this.core.getWorldPosition(this.corePos);
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
    for (const sx of [-1, 1]) { _v.set(sx * 58, 1, -12).applyMatrix4(this.ship.matrixWorld); glow(_v, 10 * this.size, gc.r * 2.5, gc.g * 2.5, gc.b * 2.5, 0.8); }
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
    for (const [x, y, z, r] of [[0, 4, 40, 10], [0, 6, 10, 15], [0, 8, -24, 16], [0, 6, -52, 12], [-50, 2, -6, 10], [50, 2, -6, 10], [-30, 2, -6, 10], [30, 2, -6, 10]]) {
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
    for (const sx of [-1, 1]) {
      _v.set(sx * 58, 1, 22).applyMatrix4(this.ship.matrixWorld);
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
      _v.set((i % 2 ? 1 : -1) * 12, 22, -34).applyMatrix4(this.ship.matrixWorld);
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
