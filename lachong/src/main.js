// LẠC HỒNG — boot, campaign flow (10 eras, any of them playable from the menu), game state machine and the main loop.
import * as THREE from 'three';
import {
  G, loadSettings, saveSettings, newRun, newStageStats, updateTimers, clearTimers, on, emit, clamp, lerp, damp,
  loadBest, saveBest, easeInOutCubic, easeOutCubic, rand, after,
} from './core.js';
import { initInput, updateInput, endInputFrame, Input } from './input.js';
import { initRenderer, createSky, createLights, makeTextures, renderFrame, updatePost, updateLights, POST, applyQuality, ATMO, GFX } from './gfx.js';
import { initWorld, updateWorld, updateTerrain, resetTerrain, setWorldAtmosphere, railFrame, railToWorld, terrainHeight, worldToRail, setStage, kindW } from './world.js';
import { initFX, beginFXFrame, updateFX, clearFX, bigFlash, addShake, FX, explode } from './fx.js';
import { PlayerShip, updateCamera, resetCamera, CAM } from './ship.js';
import { updatePlayerWeapons, updateEnemyBullets, clearWeapons, resetCharge, WSTATE, ebullets } from './weapons.js';
import { updateEnemies, clearEnemies, warmEnemies, unwarmEnemies, enemies } from './enemies.js';
import { initProps, updateProps, spawnProp, getSchedule } from './props.js';
import { initWingmen, resetWingmen, updateWingmen, updateWingmenTrails, setWingMode, setWingStance, sortieAll, WING } from './wingmen.js';
import { BOSS, setupBoss } from './boss.js';
import { initLevel, setLevelStage, startLevel, updateLevel } from './level.js';
import {
  initHUD, showScreen, hideScreens, hudVisible, updateHUD, radio, clearRadio, tip, clearTip, banner, hideBanner, warning, bossBar,
  setBossHP, popText, MENU_CB, titlePressed, titleReset, updateMenus, menuBack, refreshTitle, setLoading, showResults,
  updateResults, skipResults, resetHUDCache, setGameOverText, clearMarkers, setBossName, setProgress, showEnding, setPauseText,
} from './hud.js';
import { AudioSys } from './audio.js';
import { STAGES, STAGE_BY_ID } from './stages.js';

// Resolve on the next animation frame, or after a short timeout when the tab is in the background.
const nextFrame = () => new Promise(r => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();

let ship = null;
let best = null;
const S = { t: 0, phase: '', fadeTo: null };   // per-state scratch
const two = (n) => String(n).padStart(2, '0');

// ============================================================ Stage switching
function loadStage(stage) {
  G.stage = stage;
  G.stageK = 1 + (stage.id - 1) * 0.045;
  G.stageHp = 1 + (stage.id - 1) * 0.08;
  G.enemyTint = new THREE.Color(stage.enemyTint || '#ffffff');
  setStage(stage);
  setLevelStage(stage);
  setupBoss(stage);
  setBossName(stage.boss.name, stage.boss.sub);
  setProgress(0, stage.city, stage.checkpoint / stage.bossAt);
}

// ============================================================ Boot
async function boot() {
  G.settings = loadSettings();
  best = loadBest();
  const app = document.getElementById('app');
  initHUD();
  setLoading(0.05, 'RENDERER');
  await nextFrame();
  initRenderer(app);
  initInput(G.renderer.domElement);
  makeTextures();
  setLoading(0.18, 'ATMOSPHERE');
  await nextFrame();
  createSky();
  createLights();
  initWorld();
  setLoading(0.42, 'TERRAIN');
  await nextFrame();
  initFX();
  initProps();
  initWingmen();
  ship = new PlayerShip();
  G.player = ship;
  G.run = newRun(G.settings.difficulty);
  initLevel();
  loadStage(titleStage());
  setLoading(0.6, 'SQUADRON');
  await nextFrame();
  G.rail.d = 0;
  setWorldAtmosphere(0);
  updateTerrain(0, true);
  setLoading(0.8, 'SHADERS');
  await nextFrame();
  warmEnemies();
  resetCamera(ship);
  updateCamera(0.016, ship);
  try { await Promise.race([G.renderer.compileAsync(G.scene, G.camera), new Promise(r => setTimeout(r, 2500))]); }
  catch (e) { try { G.renderer.compile(G.scene, G.camera); } catch (e2) { /* ignore */ } }
  renderFrame(0.016);
  unwarmEnemies();
  setLoading(1, 'READY');
  await nextFrame();
  AudioSys.setVolume('master', G.settings.master);
  AudioSys.setVolume('music', G.settings.music);
  AudioSys.setVolume('sfx', G.settings.sfx);
  wireEvents();
  enterTitle(true);
  requestAnimationFrame(loop);
  if (__DEV__) Object.assign(window, {
    G, BOSS, WING, ship, emit, Input, POST, GFX, THREE, STAGES,
    __jump: (d, id) => { G.run = G.run || newRun(); if (id) loadStage(STAGE_BY_ID[id]); newStageStats(G.run); hideScreens(); setupStage(d, false); },
    __stage: (id) => { G.run = newRun(G.settings.difficulty); G.run.firstStage = id; beginStage(id, true); },
    __start: () => startMission(),
    __step: (n = 1, dt = 1 / 60) => { G.noRender = true; for (let i = 0; i < n; i++) { if (i === n - 1) G.noRender = false; frame(dt); } G.noRender = false; return { state: G.state, d: Math.round(G.rail.d), hits: G.run.hits, shield: G.run.shield }; },
    enemies, WSTATE, ebullets, explode, getSchedule, loadStage: (id) => loadStage(STAGE_BY_ID[id]),
    __key: (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })),
    // test bot: steer toward the nearest enemy ahead (or the boss's weak point) and tap fire
    __bot: (n = 60, opts = {}) => {
      const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
      const held = {};
      const set = (code, on) => { if (!!held[code] !== on) { held[code] = on; key(code, on); } };
      for (let i = 0; i < n; i++) {
        let bestE = null, bd = 1e9;
        for (const e of enemies) { if (!e.alive) continue; const ds = e.s - G.rail.d; if (ds < 30 || ds > 600) continue; if (ds < bd) { bd = ds; bestE = e; } }
        let tu = bestE ? bestE.u : (opts.u ?? 0), tv = bestE ? Math.max(8, bestE.v) : (opts.v ?? 22);
        const B = BOSS.inst;
        if (B.active && B.phase !== 'intro') {
          const tgt = B.botTarget();
          const rr = worldToRail(tgt, _v); tu = clamp(rr.y, -44, 44); tv = clamp(rr.z, 6, 56);
        }
        set('KeyD', tu > ship.u + 2); set('KeyA', tu < ship.u - 2);
        set('KeyW', tv > ship.v + 2); set('KeyS', tv < ship.v - 2);
        if (opts.fire !== false) set('KeyJ', i % 6 === 0);
        G.noRender = opts.render ? false : i < n - 1;
        frame(1 / 60);
      }
      G.noRender = false;
      for (const c of Object.keys(held)) set(c, false);
      return { d: Math.round(G.rail.d), hits: G.run.hits, shield: Math.round(G.run.shield), lives: G.run.lives, state: G.state, enemies: enemies.length };
    },
  });
}

// The title screen flies over a different era each time it opens.
let titleIdx = Math.floor(Math.random() * 10);
function titleStage() { return STAGES[titleIdx % STAGES.length]; }

// Pause automatically when the page loses focus mid-mission.
window.addEventListener('blur', () => { if (G.state === 'play' && !S.intro) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play' && !S.intro) pause(); });

// Unlock audio on any genuine user gesture.
for (const ev of ['keydown', 'pointerdown', 'touchstart', 'mousedown']) window.addEventListener(ev, () => AudioSys.init(), { passive: true });

// ============================================================ Game events
function wireEvents() {
  on('enemyKilled', (e, source) => {
    const run = G.run;
    run.hits += e.def.hits;
    run.score += e.def.score;
    if (e.def.hits > 1) popText(e.pos, `+${e.def.hits}`, '#ffd166', 22);
  });
  on('combo', (kills, pos) => {
    const bonus = kills - 1;
    G.run.hits += bonus;
    G.run.score += bonus * 300;
    popText(pos, `THƯỞNG +${bonus}`, '#ffd166', 24);
    AudioSys.sfx('item', { pitch: 1.2 });
  });
  on('propDestroyed', (p, pos) => { G.run.hits += 1; G.run.score += 300; popText(pos, '+1', '#b4ff6a'); });
  on('missileDown', () => { G.run.score += 50; });
  on('bonus', (amt, pos, label) => { G.run.score += amt; popText(pos, label, '#ffd166', 22); AudioSys.sfx('goldRing'); });
  on('gate', (g, pos) => {
    G.run.gates++;
    emit('bonus', g.bonus, pos, `${g.label} +${g.bonus}`);
    const lines = [['au', 'Đẹp quá anh ơi!'], ['dong', 'Đường bay chuẩn đấy.'], ['su', 'Cách di tích đúng hai mét — không sứt một viên ngói. Ấn tượng!']]; 
    const L = lines[G.run.gates % lines.length];
    if (G.run.gates <= 2) radio(L[0], L[1]);
  });
  on('ring', (kind, ring) => {
    const run = G.run;
    if (kind === 'silver') { run.shield = Math.min(run.maxShield, run.shield + 25); run.score += 500; run.rings++; AudioSys.sfx('ring'); }
    else if (kind === 'gold') {
      run.shield = Math.min(run.maxShield, run.shield + 50); run.score += 1000; run.rings++;
      run.goldRings++; AudioSys.sfx('goldRing');
      if (run.goldRings >= 3) {
        run.goldRings = 0;
        if (run.maxShield < 140) { run.maxShield = 140; run.shield = 140; tip('Khiên tối đa tăng!', 3); }
        else { run.lives++; AudioSys.sfx('extraLife'); tip('Thêm 1 mạng!', 3); }
      }
    } else if (kind === 'check') {
      run.checkpoint = ring?.o?.cp ?? G.stage.checkpoint;
      run.shield = Math.min(run.maxShield, run.shield + run.maxShield * 0.5);
      AudioSys.sfx('checkpoint');
      banner('MỐC THỜI GIAN', 'ĐIỂM KIỂM TRA', '', 2.2);
    }
  });
  on('item', (kind, it) => {
    const run = G.run;
    if (kind === 'laser') {
      run.laser = Math.min(2, run.laser + 1);
      AudioSys.sfx('powerUp');
      tip(run.laser === 2 ? 'LASER SIÊU CẤP!' : 'LASER ĐÔI!', 2.5);
      radio('su', run.laser === 2 ? 'Laser siêu cấp! Hỏa lực tăng mạnh!' : 'Laser đôi! Dễ đánh hơn rồi đấy!', { prio: 1 });
    } else if (kind === 'bomb') { run.bombs = Math.min(9, run.bombs + 1); AudioSys.sfx('item'); tip('Bom thông minh +1', 2); }
    else { run.shield = Math.min(run.maxShield, run.shield + 40); AudioSys.sfx('shieldUp'); }
  });
  on('dropItem', (kind, pos, s, u, v) => {
    spawnProp('item', G.rail.d + 90, { kind, u: clamp(u, -40, 40), v: clamp(v, 8, 50), hold: 7, ahead: 90 });
  });
  on('playerDead', () => { S.deadT = 0; G.state = 'dead'; });
  on('playerDamaged', () => { G.hitStop = 0.05; });
  on('bossStart', startBoss);
  on('bossTurretDown', () => { G.run.hits += 1; G.run.score += 1500; });
  on('bossDefeated', () => { G.run.hits += 10; G.run.score += 20000 + (G.stage.id - 1) * 2500; startClear(); });
  on('bossDying', () => { bossBar(false); setWingMode('formation'); });

  // ---- reactive radio chatter (each fires at most once per stage)
  const once = (key, fn) => { const r = G.run; r.said ||= {}; if (r.said[key]) return; r.said[key] = true; fn(); };
  on('enemyKilled', () => {
    const h = G.run.hits;
    if (h >= 40) once('h40', () => radio('au', 'Bốn mươi chiếc rồi! Anh siêu quá!'));
    if (h >= 80) once('h80', () => radio('dong', 'Tám mươi chiếc… Sử sách nên chép tên cậu vào.'));
  });
  on('combo', (kills) => { if (kills >= 3) once('combo', () => radio('dong', 'Bắn gom đẹp lắm. Cứ thế mà làm.')); });
  on('deflect', () => once('deflect', () => radio('dong', 'Tốt! Đừng đỡ đạn bằng mặt — gạt nó đi.')));
  on('playerDamaged', () => {
    const r = G.run;
    if (r.shield > 0 && r.shield < r.maxShield * 0.3) once('low', () => radio('su', 'Khiên yếu! Tìm vòng bạc để hồi phục!', { prio: 1 }));
  });
  on('ring', (kind) => { if (kind === 'gold' && G.stage.id <= 2) once('gold', () => radio('au', 'Vòng vàng! Gom đủ ba cái là có quà đó!')); });
  on('bossTurretDown', (left) => {
    if (left === 4) radio('au', 'Hạ được một cái rồi! Tiếp nào!');
    if (left === 2) radio('su', 'Còn hai mục tiêu!');
  });
  on('bombUsed', () => once('bomb', () => radio('au', 'Bom đâyyy! Bùm!')));

  MENU_CB.start = () => startCampaign(1);
  MENU_CB.stage = (id) => startCampaign(id);
  MENU_CB.resume = () => resume();
  MENU_CB.retry = () => { resume(); hideScreens(); respawn(true); };
  MENU_CB.quit = () => { resume(); hideScreens(); fadeTo(1, 0.4, () => enterTitle(false)); };
  MENU_CB.continue = () => { G.run.score = 0; G.run.lives = 3; G.run.continues++; G.run.hits = 0; hideScreens(); respawn(true); };
  MENU_CB.again = () => {
    const run = G.run, id = G.stage.id;
    const i = run.cleared.findIndex(c => c.id === id);
    if (i >= 0) { run.campaign -= run.cleared[i].score; run.cleared.splice(i, 1); }
    beginStage(id);
  };
  MENU_CB.next = () => {
    if (G.stage.id >= STAGES.length) { hideScreens(); enterEnding(); }
    else beginStage(G.stage.id + 1);
  };
  MENU_CB.pause = () => pause();
  MENU_CB.quality = (q) => applyQuality(q);
}

// ============================================================ States
function enterTitle(first) {
  G.state = 'title';
  G.paused = false;
  G.slowMo = 1;
  clearTimers();
  clearEnemies(); clearWeapons(); clearFX(); clearRadio(); clearMarkers();
  if (BOSS.inst.active) BOSS.inst.stop();
  bossBar(false); warning(false); hideBanner();
  if (G.warnLoop) { G.warnLoop.stop(0.2); G.warnLoop = null; }
  hudVisible(false);
  best = loadBest();
  if (!first) titleIdx++;
  loadStage(titleStage());
  G.run = newRun(G.settings.difficulty);
  G.rail.d = 150;
  G.rail.speed = 45;
  resetTerrain();
  updateTerrain(G.rail.d, true);
  startLevel(1e9);             // no events in attract mode
  ship.reset(0, 30);
  ship.controllable = false;
  ship.autoPilot = { u: 0, v: 30 };
  resetWingmen(true);
  titleFormation();
  resetCamera(ship);
  CAM.override = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 55 };
  POST.letterbox = 0;
  POST.fade = first ? 1 : POST.fade;
  S.t = 0;
  S.fade = null;
  refreshTitle(best);
  showScreen('title');
  titleReset();
  if (AudioSys.ready) { titlePressed(); AudioSys.playMusic('title', { fade: 1.2 }); }
  S.titleStarted = AudioSys.ready;
}

// Attract-mode formation sits behind the leader so the orbiting camera never clips a wingman.
const TITLE_SLOTS = { au: { ds: -70, u: 34, v: 38 }, dong: { ds: -90, u: -20, v: 33 }, su: { ds: -120, u: 10, v: 46 } };
function titleFormation() { for (const w of WING.list) w.override = TITLE_SLOTS[w.id]; }

// A new campaign run starting at stage `id` (1 = full campaign).
function startCampaign(id) {
  if (S.transition) return;
  G.run = newRun(G.settings.difficulty);
  G.run.firstStage = id;
  beginStage(id);
}

function beginStage(id, instant) {
  if (S.transition) return;
  S.transition = true;
  hideScreens();
  const go = () => {
    S.transition = false;
    for (const w of WING.list) w.override = null;
    loadStage(STAGE_BY_ID[id]);
    newStageStats(G.run);
    G.run.startTime = G.time;
    setupStage(0, true);
  };
  if (instant) go(); else fadeTo(1, 0.6, go);
}

// Prepare the world for play starting at distance d
function setupStage(d, intro) {
  const st = G.stage;
  hideScreens();
  G.state = 'play';
  G.paused = false;
  G.slowMo = 1;
  clearTimers();
  clearEnemies(); clearWeapons(); clearFX(); clearRadio(); clearMarkers();
  if (BOSS.inst.active) BOSS.inst.stop();
  bossBar(false); warning(false); hideBanner(); clearTip();
  if (G.warnLoop) { G.warnLoop.stop(0.2); G.warnLoop = null; }
  G.rail.d = d;
  G.rail.speed = 100;
  resetTerrain();
  updateTerrain(d, true);
  setWorldAtmosphere(d);
  startLevel(d);
  ship.reset(0, 24);
  ship.controllable = !intro;
  ship.autoPilot = null;
  resetWingmen(true);
  for (const id in G.run.lost || {}) WING.byId[id]?.hide();
  resetCamera(ship);
  CAM.override = null;
  resetHUDCache();
  hudVisible(true);
  setProgress(d / st.bossAt, st.city, st.checkpoint / st.bossAt);
  setPauseText(`Tạm dừng · Màn ${two(st.id)} · ${st.city}`);
  POST.letterbox = intro ? 1 : 0;
  S.intro = intro ? { t: 0 } : null;
  S.bossCine = null;
  S.weatherT = 0; S.thunderT = rand(4, 8);
  if (d < st.bossAt - 200) AudioSys.playMusic(st.music, { fade: 0.4 });
  else AudioSys.stopMusic(0.5);
  fadeTo(0, 0.8);
  if (intro) {
    after(0.8, () => banner(`MÀN ${two(st.id)} · ${st.country}`, st.city, st.title, 3.8));
  } else if (d > 0) {
    banner('CHƠI LẠI', d >= st.bossAt - 300 ? 'BOSS' : 'ĐIỂM KIỂM TRA', st.city, 2);
  }
  if (!intro && G.run.deaths > 0) after(1.2, () => radio('kien', 'Đừng liều lĩnh, Lạc Hồng 1. Ổn định đội hình rồi tiếp tục!', { prio: 1 }));
}

function respawn(fromMenu) {
  const cp = G.run.checkpoint;
  const d = cp === 0 ? 0 : Math.max(0, cp - 150);
  const run = G.run;
  run.shield = run.maxShield = Math.max(100, run.maxShield === 140 ? 140 : 100);
  run.laser = Math.max(0, run.laser - 1);
  run.bombs = Math.max(run.bombs, 3);
  fadeTo(1, fromMenu ? 0.35 : 0.6, () => setupStage(d, false));
}

function pause() {
  if (G.state !== 'play' && G.state !== 'dead') return;
  if (G.paused) return;
  G.paused = true;
  showScreen('pause');
  AudioSys.sfx('pause');
  AudioSys.setPaused(true);
}
function resume() {
  if (!G.paused) return;
  G.paused = false;
  hideScreens();
  AudioSys.setPaused(false);
  Input.clearAll();
}

function gameOver() {
  G.state = 'gameover';
  AudioSys.playMusic('gameover', { fade: 0.3 });
  hudVisible(false);
  setGameOverText(G.run.hits > 0 ? `${G.stage.city} · bắn hạ ${G.run.hits} · điểm ${G.run.score.toLocaleString()}` : 'Phi đội Lạc Hồng bị bắn hạ…');
  S.goT = 0; S.goShown = false;
}

function startBoss() {
  const B = BOSS.inst, st = G.stage;
  B.start();
  AudioSys.playMusic(st.final ? 'bossFinal' : 'boss', { fade: 0.2 });
  setWingMode('boss');
  sortieAll(1.8, 8);
  S.bossCine = { t: 0 };
  POST.letterbox = 1;
  radio('thoianh', st.final ? 'LẠC HỒNG… CÁC NGƯƠI ĐUỔI THEO TA QUA NGHÌN NĂM. TẠI ĐÂY, TẤT CẢ SẼ CHẤM DỨT.' : `…KẺ GIỮ SỬ ĐÃ ĐẾN. ${st.boss.name} — XÓA SỔ CHÚNG.`, { prio: 2, hold: 1.2 });
  after(3.2, () => { banner('WARNING', st.boss.name, st.boss.sub, 3, 'boss'); });
  after(6.2, () => bossBar(true));
}

function startClear() {
  G.state = 'clear';
  S.t = 0;
  S.clearDone = false;
  ship.controllable = false;
  ship.autoPilot = { u: 0, v: 34 };
  resetCharge();
  AudioSys.playMusic('clear', { fade: 0.6 });
  hudVisible(true);
  const st = G.stage;
  after(1.2, () => banner(st.city, 'ĐÃ BẢO VỆ', 'MISSION COMPLETE', 5, 'gold'));
  st.clearLines.forEach(([who, text], i) => {
    if (G.run.lost?.[who]) return;
    after(1.4 + i * 0.1, () => radio(who, text, { prio: i === 0 ? 2 : 0, hold: who === 'kien' || who === 'su' ? 2.4 : 1.6 }));
  });
  WING.list.forEach((w, i) => after(2.4 + i * 0.35, () => { if (!w.gone) { w.barrelRoll(); AudioSys.sfx('roll', { vol: 0.5, pan: i - 1 }); } }));
  setWingStance('front');
  for (const w of WING.list) {
    if (G.run.lost?.[w.id]) continue;
    w.reset(); w.show(); w.mode = 'formation';
  }
}

function rankOf(run) {
  const ratio = run.hits / Math.max(1, (run.spawned || 0) + 10);
  return { ratio, rank: ratio >= 0.85 && run.deaths === 0 ? 'S' : ratio >= 0.7 ? 'A' : ratio >= 0.5 ? 'B' : 'C' };
}

function finishRun() {
  const run = G.run, st = G.stage;
  run.time = G.time - run.startTime;
  const acc = run.shots ? Math.round(run.shotsHit / run.shots * 100) : 0;
  const hitBonus = run.hits * 100;
  const shieldBonus = Math.round(run.shield / run.maxShield * 100) * 50;
  const lifeBonus = run.lives * 3000;
  const nomiss = run.deaths === 0 ? 10000 : 0;
  const total = run.score + hitBonus + shieldBonus + lifeBonus + nomiss;
  const { ratio, rank } = rankOf(run);
  const medal = ratio >= 0.8;
  const mm = Math.floor(run.time / 60), ss = Math.floor(run.time % 60);
  const rows = [
    { label: 'HẠ ĐỊCH', value: run.hits },
    { label: 'ĐIỂM', value: run.score },
    { label: 'THƯỞNG HẠ ĐỊCH', value: hitBonus },
    { label: 'THƯỞNG KHIÊN', value: shieldBonus, note: `${Math.round(run.shield / run.maxShield * 100)}%` },
    { label: 'THƯỞNG MẠNG', value: lifeBonus, note: `×${run.lives}` },
    { label: 'KHÔNG RƠI', value: nomiss },
  ];
  // campaign bookkeeping
  run.campaign += total;
  run.cleared = run.cleared.filter(c => c.id !== st.id);
  run.cleared.push({ id: st.id, city: st.city, score: total, rank });
  best = loadBest();
  const prev = best.stages[st.id];
  const isBest = !prev || total > prev.score;
  if (isBest) best.stages[st.id] = { score: total, rank, hits: run.hits };
  best.unlocked = Math.max(best.unlocked, Math.min(STAGES.length, st.id + 1));
  if (st.id === STAGES.length) { best.cleared = true; if (run.firstStage === 1) best.campaign = Math.max(best.campaign || 0, run.campaign); }
  saveBest(best);
  const nextSt = STAGE_BY_ID[st.id + 1];
  const meta = `Chính xác <b>${acc}%</b>　Vòng <b>${run.rings}</b>　Xuyên công trình <b>${run.gates}</b>　Thời gian <b>${mm}:${two(ss)}</b><br>` +
    `Giải cứu đồng đội <b>${run.rescues}</b>　Tổng chiến dịch <b>${run.campaign.toLocaleString()}</b>${isBest ? '　<b>KỶ LỤC MỚI!</b>' : ''}`;
  G.state = 'results';
  hudVisible(false);
  showResults({ rows, total, rank, medal, meta, sub: `${st.city} · ${st.title} — lịch sử được bảo toàn`, next: nextSt ? `Nhảy tới ${nextSt.country}` : 'Xem kết thúc chiến dịch' });
}

function enterEnding() {
  G.state = 'ending';
  AudioSys.playMusic('ending', { fade: 1 });
  const run = G.run;
  const list = [...run.cleared].sort((a, b) => a.id - b.id);
  const full = run.firstStage === 1 && list.length === STAGES.length;
  showEnding({
    list, total: run.campaign,
    credit: (full ? 'Trọn vẹn 10 thời kỳ, từ Văn Lang đến Huế! ' : '') + 'Phi đội Lạc Hồng: Âu · Đồng · Sử — Chỉ huy: Kiên.<br>Công trình được dựng lại giản lược theo sử liệu; địa hình, nhạc và âm thanh đều được tạo bằng mã.',
  });
  best = loadBest();
}

// ============================================================ Transitions
function fadeTo(target, dur, cb) { S.fade = { from: POST.fade, to: target, t: 0, dur, cb }; }
function updateFade(rdt) {
  const f = S.fade;
  if (!f) return;
  f.t += rdt;
  const k = clamp(f.t / f.dur, 0, 1);
  POST.fade = lerp(f.from, f.to, easeInOutCubic(k));
  if (k >= 1) { S.fade = null; f.cb?.(); }
}

// ============================================================ Cinematic cameras
function titleCamera(dt) {
  const t = G.clock;
  const a = 0.95 + Math.sin(t * 0.09) * 0.85;
  const o = CAM.override;
  railFrame(G.rail.d, _p, _f, _r);
  const r = 24 + Math.sin(t * 0.21) * 4;
  o.pos.copy(ship.pos).addScaledVector(_r, Math.sin(a) * r).addScaledVector(_f, Math.cos(a) * r);
  o.pos.y = ship.pos.y + 5 + Math.sin(t * 0.33) * 3;
  _v.subVectors(ship.pos, o.pos).normalize();
  _v2.crossVectors(_v, THREE.Object3D.DEFAULT_UP).normalize();
  o.target.copy(ship.pos).addScaledVector(_v2, -8);
  o.fov = 50;
}

function introCamera(dt) {
  const I = S.intro;
  I.t += dt;
  const k = easeInOutCubic(clamp((I.t - 0.4) / 3.0, 0, 1));
  railFrame(G.rail.d, _p, _f, _r);
  const startPos = _v.copy(ship.pos).addScaledVector(_f, 26).addScaledVector(_r, 9).setY(ship.pos.y + 3);
  const endPos = _v2.copy(ship.pos).addScaledVector(_f, -22).setY(ship.pos.y + 6);
  CAM.override = CAM.override || { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 60 };
  CAM.override.pos.lerpVectors(startPos, endPos, k);
  CAM.override.pos.addScaledVector(_r, Math.sin(k * Math.PI) * 14);
  CAM.override.target.copy(ship.pos).addScaledVector(_f, 30 * k);
  CAM.override.fov = lerp(48, 62, k);
  POST.letterbox = 1 - clamp((I.t - 2.8) / 0.8, 0, 1);
  if (I.t > 2.6 && !ship.controllable) { ship.controllable = true; }
  if (I.t > 3.4) { CAM.override = null; S.intro = null; POST.letterbox = 0; resetCamera(ship); }
}

function bossCamera(dt) {
  const C = S.bossCine;
  C.t += dt;
  const B = BOSS.inst;
  const T = C.t;
  if (T < 1.6) { POST.letterbox = 1; return; }
  if (T < 6.0) {
    CAM.override = CAM.override || { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 60 };
    railFrame(G.rail.d, _p, _f, _r);
    const k = easeOutCubic(clamp((T - 1.6) / 1.2, 0, 1));
    CAM.override.pos.copy(ship.pos).addScaledVector(_f, -24 + 10 * k).addScaledVector(_r, -12 * k).setY(ship.pos.y + 4 - 2 * k);
    CAM.override.target.lerpVectors(_v.copy(ship.pos).addScaledVector(_f, 40), B.focus, k);
    CAM.override.fov = lerp(62, 46, k);
    POST.letterbox = 1;
    return;
  }
  CAM.override = null;
  POST.letterbox = Math.max(0, 1 - (T - 6) / 0.6);
  if (T > 6.6) S.bossCine = null;
}

function clearCamera(dt) {
  const t = S.t;
  railFrame(G.rail.d, _p, _f, _r);
  CAM.override = CAM.override || { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 55 };
  const a = -0.6 + t * 0.35;
  const r = 26 + t * 1.2;
  CAM.override.pos.copy(ship.pos).addScaledVector(_r, Math.sin(a) * r).addScaledVector(_f, Math.cos(a) * r).setY(ship.pos.y + 4 + t * 0.6);
  CAM.override.target.copy(ship.pos);
  CAM.override.fov = 52;
  POST.letterbox = Math.min(1, t / 0.8);
}

// ============================================================ Weather (rain over Tây Đô, river mist, lanterns over Hội An, peach petals at Tết)
function updateWeather(dt) {
  const w = G.stage?.weather;
  if (!w || dt <= 0) return;
  const cam = G.camera.position;
  railFrame(G.rail.d, _p, _f, _r);
  if (w === 'rain') {
    const n = G.state === 'title' ? 10 : 22;
    for (let i = 0; i < n; i++) {
      const fwd = rand(5, 110), side = rand(-60, 60);
      const x = cam.x + _f.x * fwd + _r.x * side, z = cam.z + _f.z * fwd + _r.z * side, y = cam.y + rand(-10, 40);
      FX.add.spawn(x, y, z, -_f.x * G.rail.speed * 0.6, -150, -_f.z * G.rail.speed * 0.6, 0.35, 0.16, 0.16, [0.55, 0.6, 0.68, 0.5], [0.45, 0.5, 0.55, 0], 0, { stretch: 0.05 });
    }
    S.thunderT -= dt;
    if (S.thunderT <= 0) {
      S.thunderT = rand(6, 13);
      bigFlash(0.22, [0.8, 0.86, 1]);
      after(rand(0.3, 1.2), () => AudioSys.sfx('explodeL', { vol: 0.35, pitch: 0.35 }));
    }
  } else if (w === 'mist') {
    if (Math.random() < 0.35) {
      const fwd = rand(40, 220), side = rand(-140, 140);
      const x = cam.x + _f.x * fwd + _r.x * side, z = cam.z + _f.z * fwd + _r.z * side;
      FX.smoke.spawn(x, rand(2, 14), z, rand(-2, 2), rand(0, 1), rand(-2, 2), rand(5, 8), 18, 40, [0.95, 0.94, 0.92, 0.12], [0.95, 0.94, 0.92, 0], 0, { fadeIn: 0.4 });
    }
  } else if (w === 'lanterns') {
    // floating river lanterns drifting up from the water
    if (Math.random() < 0.5) {
      const fwd = rand(30, 200), side = rand(-110, 110);
      const x = cam.x + _f.x * fwd + _r.x * side, z = cam.z + _f.z * fwd + _r.z * side;
      FX.add.spawn(x, rand(0, 8), z, rand(-1, 1), rand(1.5, 4), rand(-1, 1), 6, 1.1, 0.9, [2.6, 1.2, 0.4, 1], [1.6, 0.5, 0.1, 0], 0, { fadeIn: 0.5 });
    }
  } else if (w === 'petals') {
    const n = G.state === 'title' ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const fwd = rand(10, 150), side = rand(-70, 70);
      const x = cam.x + _f.x * fwd + _r.x * side, z = cam.z + _f.z * fwd + _r.z * side, y = cam.y + rand(-20, 25);
      FX.add.spawn(x, y, z, rand(-4, 4), rand(-3, -1), rand(-4, 4), 3, 0.32, 0.26, [1.6, 0.7, 0.95, 0.9], [1.2, 0.5, 0.7, 0], 0, {});
    }
  } else if (w === 'snow') {
    const k = 0.35 + 0.65 * kindW(G.rail.d, 'mountain');
    const n = Math.round(12 * k);
    for (let i = 0; i < n; i++) {
      const fwd = rand(10, 160), side = rand(-80, 80);
      const x = cam.x + _f.x * fwd + _r.x * side, z = cam.z + _f.z * fwd + _r.z * side, y = cam.y + rand(-20, 40);
      FX.add.spawn(x, y, z, rand(-4, 4), rand(-10, -6), rand(-4, 4), 2.2, 0.35, 0.3, [1.4, 1.45, 1.5, 0.7], [1.2, 1.25, 1.3, 0], 0, {});
    }
  }
}

// ============================================================ Lens flare visibility (CPU occlusion against terrain)
let sunVis = 0;
function updateSunFlare(dt) {
  const cam = G.camera;
  const dir = ATMO.uSunDir.value;
  _v.copy(cam.position).addScaledVector(dir, 3000).project(cam);
  let target = 0;
  if (_v.z < 1 && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15 && ATMO.uNight.value < 0.5) {
    target = 1 - clamp((Math.max(Math.abs(_v.x), Math.abs(_v.y)) - 0.8) / 0.35, 0, 1);
    for (let i = 1; i <= 14 && target > 0; i++) {
      const dist = i * i * 12;
      const x = cam.position.x + dir.x * dist, y = cam.position.y + dir.y * dist, z = cam.position.z + dir.z * dist;
      if (y < terrainHeight(x, z)) target = 0;
    }
    const B = BOSS.inst;
    if (B.active && B.head.visible) {
      _v2.copy(B.focus).project(cam);
      if (Math.hypot(_v2.x - _v.x, _v2.y - _v.y) < 0.15 && _v2.z < 1) target = 0;
    }
    POST.sunPos.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
  }
  sunVis = damp(sunVis, target, 8, dt);
  POST.sunVis = sunVis * 0.9;
}

// ============================================================ Main loop
let last = performance.now();
let lowShieldT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let rdt = (now - last) / 1000;
  last = now;
  if (!(rdt > 0)) rdt = 0.016;
  if (__DEV__ && G.frozen) return;   // headless tests drive frames manually
  frame(Math.min(rdt, 0.05));
}

function frame(rdt) {
  G.rdt = rdt;
  G.clock += rdt;
  updateInput(rdt);
  beginFXFrame();

  let ts = G.paused ? 0 : 1;
  if (G.hitStop > 0) { G.hitStop -= rdt; ts *= 0.15; }
  ts *= G.slowMo;
  const dt = rdt * ts;
  G.dt = dt;
  G.time += dt;

  if (G.state === 'title') updateTitle(rdt);
  else if (G.state === 'play' || G.state === 'dead') updatePlay(dt, rdt);
  else if (G.state === 'clear') updateClear(dt, rdt);
  else if (G.state === 'gameover') {
    S.goT += rdt;
    if (!S.goShown && S.goT > 1.6) { S.goShown = true; showScreen('gameover'); }
    if (S.goShown) updateMenus();
    simulate(dt * 0.4, rdt, false);
  }
  else if (G.state === 'results' || G.state === 'ending') {
    S.t += rdt;
    G.rail.d += G.rail.speed * dt;
    clearCamera(dt);
    if (G.state === 'results') { updateResults(rdt); if (Input.pressed('confirm') && skipResults()) { /* consumed */ } else updateMenus(); }
    else updateMenus();
    simulate(dt, rdt, false);
  }

  if (G.state !== 'results' && G.state !== 'ending' && !G.paused) updateWeather(dt);
  updateEngineSound();
  updateFade(rdt);
  updatePost(rdt);
  POST.ca = damp(POST.ca, 0.0012, 3, rdt);
  if (ship) POST.radial = damp(POST.radial, G.state === 'play' ? ship.boostAmt * 0.9 : 0, 6, rdt);
  updateSunFlare(rdt);
  if (!G.noRender) renderFrame(rdt);
  endInputFrame();
}

function updateTitle(rdt) {
  if (!S.titleStarted) {
    if (Input.any() || AudioSys.ready) {
      AudioSys.init();
      S.titleStarted = true;
      titlePressed();
      AudioSys.playMusic('title', { fade: 1.0 });
      AudioSys.sfx('uiSelect');
    }
  } else {
    if (Input.pressed('back') && menuBack()) { /* closed sub menu */ }
    else updateMenus();
  }
  if (S.fade == null && POST.fade > 0.99 && S.t === 0) fadeTo(0, 1.4);
  S.t += rdt;
  const t = G.clock;
  ship.autoPilot.u = Math.sin(t * 0.23) * 14;
  ship.autoPilot.v = 30 + Math.sin(t * 0.37) * 6;
  G.rail.speed = 45;
  G.rail.d += G.rail.speed * rdt;
  if (G.rail.d > Math.min(4200, G.stage.bossAt - 1200)) { G.rail.d = 150; resetTerrain(); updateTerrain(G.rail.d, true); startLevel(1e9); resetWingmen(true); titleFormation(); }
  titleCamera(rdt);
  simulate(rdt, rdt, false);
}

function updatePlay(dt, rdt) {
  const run = G.run;
  if (Input.pressed('pause')) {
    if (G.paused) { if (!menuBack()) resume(); }
    else pause();
  } else if (G.paused) {
    if (Input.pressed('back') && !Input.pressed('pause')) { if (!menuBack()) resume(); }
    else updateMenus();
  }
  if (G.paused) { renderPausedHUD(rdt); return; }

  if (ship.alive) G.rail.speed = 100 * ship.speedMul;
  else G.rail.speed = damp(G.rail.speed, 60, 2, dt);
  G.rail.d += G.rail.speed * dt;
  run.time += dt;

  updateTimers();
  updateLevel();
  if (S.intro) introCamera(dt);
  if (S.bossCine) bossCamera(dt);

  simulate(dt, rdt, true);
  setProgress(G.rail.d / G.stage.bossAt);

  if (ship.alive && run.shield < run.maxShield * 0.25) {
    lowShieldT -= dt;
    if (lowShieldT <= 0) { lowShieldT = 1.1; AudioSys.sfx('lowShield', { vol: 0.5 }); }
  }
  if (BOSS.inst.active) setBossHP(BOSS.inst.hp / BOSS.inst.maxHp);
  if (G.state === 'dead') {
    S.deadT += rdt;
    if (S.deadT > 2.0 && !S.deadHandled) {
      S.deadHandled = true;
      run.deaths++;
      if (run.lives > 0) { run.lives--; respawn(false); }
      else gameOver();
    }
  } else S.deadHandled = false;
}

function renderPausedHUD(rdt) { updateCamera(0, ship); }

function updateClear(dt, rdt) {
  S.t += rdt;
  G.rail.speed = damp(G.rail.speed, 110, 1, dt);
  G.rail.d += G.rail.speed * dt;
  updateTimers();
  clearCamera(dt);
  ship.boosting = S.t > 4.5;
  simulate(dt, rdt, false);
  if (S.t > 4.5 && S.t < 4.6) { AudioSys.sfx('boost'); addShake(0.2); }
  if (S.t > 8.5 && !S.clearDone) { S.clearDone = true; fadeTo(0.55, 0.8, finishRun); }
}

function updateEngineSound() {
  const want = (G.state === 'play' || G.state === 'clear') && ship.alive && ship.dying <= 0;
  if (want && !S.engine && AudioSys.ready) S.engine = AudioSys.loop('engine');
  if (!want && S.engine) { S.engine.stop(0.6); S.engine = null; }
  if (S.engine) S.engine.set({ speed: ship.speedMul, boost: ship.boosting, brake: ship.braking });
}

function simulate(dt, rdt, gameplay) {
  ship.update(dt);
  if (gameplay) updatePlayerWeapons(dt, ship, ship.controllable && !S.intro && G.state === 'play');
  updateEnemies(dt);
  if (BOSS.inst.active) BOSS.inst.update(dt);
  updateWingmen(dt);
  updateProps(dt);
  updateEnemyBullets(dt, ship);
  updateWorld(dt, G.rail.d, ship.pos);
  updateCamera(rdt, ship);
  updateLights(dt, ship.pos);
  ship.updateTrails(G.camera.position);
  updateWingmenTrails(G.camera.position);
  updateFX(dt);
  updateHUD(dt, rdt);
}

// ============================================================ Start (supports hot-reload hooks when hosted)
const hot = typeof window !== 'undefined' ? window.claude?.hot : null;
try { hot?.snapshot?.(() => ({ settings: G.settings })); } catch (e) { /* optional */ }
const start = () => { boot().catch(err => { console.error(err); const m = document.getElementById('loadmsg'); if (m) m.textContent = 'ERROR: ' + (err?.message || err); }); };
if (hot?.ready) { try { hot.ready(start); } catch (e) { start(); } } else start();
