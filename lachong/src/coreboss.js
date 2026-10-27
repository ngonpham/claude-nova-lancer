// Boss archetype CORE — a floating fortress "eye" (Singapore, Beijing). A ring of armour panels orbits the
// core in the plane facing the player; each panel is a turret. Once they are gone the iris shells open:
// the eye charges and sweeps a beam, fires spirals, and is vulnerable while open.
import * as THREE from 'three';
import { G, rand, clamp, lerp, damp, TAU, emit, diff, easeOutCubic, easeOutBack } from './core.js';
import { railFrame, railToWorld, emissiveVertexMaterial, mergeGeometries } from './world.js';
import { FX, explode, glow, sparks, addShake, bigFlash } from './fx.js';
import { TARGETS, enemyShot, aimAtPlayer } from './weapons.js';
import { AudioSys } from './audio.js';
import { paint, spawnEnemy, wave } from './enemies.js';
import { POST } from './gfx.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function shellGeo(C, top) {
  const parts = [paint(new THREE.SphereGeometry(13, 20, 10, 0, TAU, top ? 0 : Math.PI / 2, Math.PI / 2), C.shell)];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU;
    const rib = new THREE.BoxGeometry(1.2, 1.2, 13.6).translate(0, 0, 0).rotateX(top ? -0.5 : 0.5).rotateY(a).translate(Math.sin(a) * 7, top ? 9 : -9, Math.cos(a) * 7);
    parts.push(paint(rib, C.plate));
  }
  parts.push(paint(new THREE.TorusGeometry(13.1, 0.5, 4, 32).rotateX(Math.PI / 2).translate(0, top ? 0.3 : -0.3, 0), C.trim, 1));
  return mergeGeometries(parts);
}

function panelGeo(C) {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(10, 7, 3), C.plate),
    paint(new THREE.BoxGeometry(11, 1, 3.4).translate(0, 3.6, 0), C.trim),
    paint(new THREE.CylinderGeometry(1.6, 2, 2, 8).rotateX(Math.PI / 2).translate(0, 0, 2.2), C.shell),
    paint(new THREE.CircleGeometry(1.1, 8).translate(0, 0, 3.25), C.core, 1),
    ...[-3.5, 3.5].map(x => paint(new THREE.BoxGeometry(1.2, 4, 1).translate(x, 0, 2), C.glow, 0.8)),
  ]);
}

export class CoreBoss {
  constructor(cfg = {}) {
    this.cfg = cfg;
    const C = { shell: '#2a2440', plate: '#4a3e6a', trim: '#ff4fd8', core: '#ff3fa0', glow: '#3fe0ff', ...(cfg.palette || {}) };
    this.C = C;
    this.nPanels = cfg.panels || 8;
    this.coreHp = Math.round(160 * (cfg.hp || 1));
    this.panelHp = Math.round(7 * (cfg.hp || 1));
    this.mat = emissiveVertexMaterial({ roughness: 0.35, metalness: 0.7 }, 3.4);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.scale.setScalar(1.5);
    this.root.add(this.body);
    this.top = new THREE.Mesh(shellGeo(C, true), this.mat);
    this.bot = new THREE.Mesh(shellGeo(C, false), this.mat);
    this.body.add(this.top, this.bot);
    const cc = new THREE.Color(C.core);
    this.coreBase = cc;
    this.coreMat = new THREE.MeshBasicMaterial({ color: cc.clone().multiplyScalar(3) });
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(9.5, 20, 12), this.coreMat);
    this.body.add(this.eye);
    this.pupil = new THREE.Mesh(new THREE.SphereGeometry(3.4, 12, 8), new THREE.MeshBasicMaterial({ color: '#080408' }));
    this.pupil.position.set(0, 0, 8.6);
    this.body.add(this.pupil);
    // decorative rings
    const gc = new THREE.Color(C.glow);
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(mergeGeometries([paint(new THREE.TorusGeometry(19 + i * 4, 0.7, 5, 48), C.plate), paint(new THREE.TorusGeometry(19 + i * 4, 0.3, 4, 48).translate(0, 0, 0.6), C.glow, 1)]), this.mat);
      m.rotation.set(rand(0, 3), rand(0, 3), 0);
      m.userData.sp = [rand(-0.6, 0.6), rand(-0.8, 0.8), rand(-0.4, 0.4)];
      this.body.add(m); this.rings.push(m);
    }
    // orbiting panels
    const pg = panelGeo(C);
    this.panels = [];
    for (let i = 0; i < this.nPanels; i++) {
      const m = new THREE.Mesh(pg, this.mat);
      this.root.add(m);
      this.panels.push({ mesh: m, hp: this.panelHp, alive: true, pos: new THREE.Vector3(), a0: i / this.nPanels * TAU, fireT: rand(1, 3), flash: 0 });
    }
    this.focusPos = new THREE.Vector3();
    this.head = this.root;
    this.buildTargets();
    this.active = false;
  }

  buildTargets() {
    const self = this;
    this.coreT = {
      pos: this.focusPos, radius: 15, alive: true, lockable: false, hittable: false, hp: this.coreHp,
      hit(dmg, p, src) {
        if (!self.active || self.phase === 'dying') return 'none';
        if (self.openK < 0.55) { sparks(p || this.pos, null, 6, [3, 3.5, 4], 25, 1); return 'armor'; }
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
    return this.focusPos;
  }

  start() {
    this.active = true;
    this.phase = 'intro'; this.pt = 0; this.t = 0;
    this.openK = 0; this.openTarget = 0; this.flash = 0; this.spin = 0.6; this.spinA = 0;
    this.enraged = false; this.sub = 'drift'; this.subT = 3;
    this.beamLoop = null; this.chargeLoop = null; this.beamTick = 0;
    this.burstT = 3; this.mineT = 6; this.spiralA = 0; this.spiralT = 0; this.droneT = 5;
    this.reported = false; this.deadT = 0;
    this.coreT.hp = this.coreHp; this.coreT.alive = true;
    for (const p of this.panels) { p.hp = this.panelHp; p.alive = true; p.mesh.visible = true; p.target.alive = true; p.flash = 0; }
    this.mat.userData.tint.value.setRGB(1, 1, 1);
    this.mat.userData.emit.value = 3.4;
    this.hs = 260; this.hu = 0; this.hv = 46;
    this.root.visible = true; this.body.visible = true;
    this.root.scale.setScalar(0.01);
    G.scene.add(this.root);
    for (const t of [this.coreT, ...this.panT]) TARGETS.add(t);
    this.place(0);
  }

  stop() {
    this.active = false;
    G.scene.remove(this.root);
    for (const t of [this.coreT, ...this.panT]) TARGETS.delete(t);
    if (this.beamLoop) { this.beamLoop.stop(0.2); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.2); this.chargeLoop = null; }
  }

  panelsLeft() { let n = 0; for (const p of this.panels) if (p.alive) n++; return n; }
  destroyPanel(pn) {
    pn.alive = false; pn.target.alive = false; pn.mesh.visible = false;
    explode(pn.pos, 2.4);
    AudioSys.sfx('explodeL'); addShake(0.3);
    emit('bossTurretDown', this.panelsLeft());
    if (this.panelsLeft() === 0) {
      this.phase = 'p2'; this.pt = 0; this.sub = 'drift'; this.subT = 1.5;
      AudioSys.sfx('roar', { pitch: 1.4 }); addShake(0.5);
      emit('bossPhase', 2);
    }
  }

  die() {
    this.phase = 'dying'; this.pt = 0;
    this.coreT.alive = false;
    this.openTarget = 1;
    if (this.beamLoop) { this.beamLoop.stop(0.1); this.beamLoop = null; }
    if (this.chargeLoop) { this.chargeLoop.stop(0.1); this.chargeLoop = null; }
    AudioSys.sfx('roar', { pitch: 1.6 });
    bigFlash(0.8, [1, 0.8, 1]); addShake(1);
    G.slowMo = 0.3;
    this.deathT = 0.1;
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
        if (this.pt < 2.4 && Math.random() < 0.7) {
          _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(60).add(this.focusPos);
          const c = this.coreBase;
          FX.add.spawn(_v.x, _v.y, _v.z, (this.focusPos.x - _v.x) * 2.2, (this.focusPos.y - _v.y) * 2.2, (this.focusPos.z - _v.z) * 2.2, 0.45, 1.6, 0.4, [c.r * 5, c.g * 5, c.b * 5, 1], [4, 4, 4, 0], 0, { stretch: 0.05 });
        }
        if (this.pt > 0.3 && !this.roared) { this.roared = true; AudioSys.sfx('roar', { pitch: 1.5 }); bigFlash(0.4, [this.coreBase.r, this.coreBase.g, this.coreBase.b]); }
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
          this.mat.userData.tint.value.setRGB(1.35, 0.75, 0.8);
          this.mat.userData.emit.value = 5.5;
          AudioSys.sfx('roar', { pitch: 1.8 });
          emit('bossPhase', 3);
        }
        break;
      }
      case 'dying': {
        this.deathT -= G.rdt;
        this.spin = 8;
        const k = clamp(this.pt / 2.2, 0, 1);
        this.root.scale.setScalar(Math.max(0.01, 1 - k * 0.7 + Math.sin(this.pt * 40) * 0.03));
        if (this.deathT <= 0 && this.pt < 2.2) {
          this.deathT = 0.12;
          explode(_v.copy(this.focusPos).add(_v2.set(rand(-20, 20), rand(-20, 20), rand(-20, 20))), rand(1.6, 3), { debris: 4 });
          AudioSys.sfx('explodeM', { vol: 0.7 });
        }
        if (this.pt >= 2.2 && this.body.visible) {
          explode(this.focusPos, 9, { debris: 18 });
          AudioSys.sfx('explodeL'); AudioSys.sfx('bombBlast');
          bigFlash(1, [1, 0.95, 1]); addShake(1.2);
          this.body.visible = false;
          for (const p of this.panels) p.mesh.visible = false;
          G.slowMo = 1;
          this.deadT = 0;
        }
        if (!this.body.visible) { this.deadT += G.rdt; if (this.deadT > 2.2 && !this.reported) { this.reported = true; emit('bossDefeated'); } }
        break;
      }
    }
    this.hs = damp(this.hs, ts, 2, dt); this.hu = damp(this.hu, tu, 2, dt); this.hv = damp(this.hv, tv, 2, dt);
    this.openK = damp(this.openK, this.openTarget, 4, dt);
    this.place(dt);
    this.collide();
  }

  place(dt) {
    railToWorld(G.rail.d + this.hs, this.hu, this.hv, this.focusPos);
    railFrame(G.rail.d + this.hs, _p, _f, _r);
    this.root.position.copy(this.focusPos);
    this.root.rotation.set(0, Math.atan2(-_f.x, -_f.z), 0);
    // the eye looks at the player
    _v.copy(G.player.pos); this.root.worldToLocal(_v);
    this.body.rotation.y = damp(this.body.rotation.y, Math.atan2(_v.x, _v.z) * 0.6, 3, dt);
    this.body.rotation.x = damp(this.body.rotation.x, -Math.atan2(_v.y, Math.hypot(_v.x, _v.z)) * 0.6, 3, dt);
    this.top.rotation.x = -this.openK * 0.9; this.bot.rotation.x = this.openK * 0.9;
    for (const m of this.rings) { const s = m.userData.sp; m.rotation.x += s[0] * dt * (1 + this.spin * 0.3); m.rotation.y += s[1] * dt * (1 + this.spin * 0.3); m.rotation.z += s[2] * dt; }
    this.spinA += this.spin * dt;
    const R = 30 + Math.sin(this.t * 0.9) * 3;
    for (const p of this.panels) {
      const a = p.a0 + this.spinA;
      p.mesh.position.set(Math.cos(a) * R, Math.sin(a) * R, 4);
      p.mesh.rotation.set(0, 0, a - Math.PI / 2);
      p.mesh.getWorldPosition(p.pos);
      p.flash = Math.max(0, p.flash - dt * 6);
    }
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 9);
    const b = this.coreBase, o = this.openK;
    this.coreMat.color.setRGB(b.r * (1.5 + 5 * o * pulse) + this.flash * 6, b.g * (1.5 + 5 * o * pulse) + this.flash * 5, b.b * (1.5 + 5 * o * pulse) + this.flash * 5);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.userData.flash.value = this.flash * 0.5;
    if (this.body.visible) glow(this.focusPos, (14 + 20 * o * pulse) * this.root.scale.x, b.r * 2 * (0.4 + o), b.g * 2 * (0.4 + o), b.b * 2 * (0.4 + o), 0.9);
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
    const b = this.coreBase;
    glow(this.focusPos, 16 + k * 26, b.r * 5, b.g * 5, b.b * 5, 1);
    glow(this.focusPos, 6 + k * 10, 6, 6, 6, 1, 2, this.t * 3);
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
    const start = this.focusPos.clone().addScaledVector(dir, 14);
    const end = this.focusPos.clone().addScaledVector(dir, 700);
    const b = this.coreBase;
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
