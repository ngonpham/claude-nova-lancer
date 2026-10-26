// Stage runner: turns a stage definition's script (stages.js) into rail-distance events, props and waves.
import * as THREE from 'three';
import { G, rand, clamp, emit, on, after } from './core.js';
import { spawnEnemy, wave, makeGroup } from './enemies.js';
import { scheduleProp, clearSchedule, resetProps, spawnProp } from './props.js';
import { radio, tip, banner, warning, addMarker, clearMarkers } from './hud.js';
import { WING, setWingStance, holdOut } from './wingmen.js';
import { AudioSys } from './audio.js';
import { CHARACTERS } from './portraits.js';

let STAGE = null;
const WING_REAR_AT = 600;   // every script sends the squadron to the rear slots around here
const EVENTS = [];
const at = (d, fn) => EVENTS.push({ d, fn });
let idx = 0;

const D = () => G.rail.d;

// ------------------------------------------------------------ Wave helpers
function vWing(type, n, dist, v, opts = {}) {
  return wave(type, 'approach', n, (i) => {
    const c = i - (n - 1) / 2;
    return { s: D() + dist + Math.abs(c) * 14, u: (opts.u ?? 0) + c * 11, v: v + Math.abs(c) * 3, speed: opts.speed ?? 28, au: opts.au ?? 6, fu: 0.9, ph: 0, av: 3 };
  }, opts);
}
function snake(type, n, dist, u0, v, opts = {}) {
  return wave(type, 'approach', n, (i) => ({ s: D() + dist + i * 32, u: u0, au: opts.au ?? 26, fu: 1.3, ph: i * 0.55, v, av: 6, fv: 1.7, speed: opts.speed ?? 22 }), opts);
}
function fromBehind(type, n, opts = {}) {
  return wave(type, 'behind', n, (i) => ({ rel: 62 + i * 7, u0: (i % 2 ? 1 : -1) * (12 + i * 4), u: (i - (n - 1) / 2) * 14, v0: 34, v: 18 + (i % 3) * 7, dist: 110 + (i % 2) * 30, stay: opts.stay ?? 6, ph: i }), opts);
}
function holders(type, n, dist, opts = {}) {
  return wave(type, 'hold', n, (i) => ({ s: D() + 700, dist: dist + i * 25, enter: 2.4, stay: opts.stay ?? 7, u: (i - (n - 1) / 2) * 30, au: 16, fu: 0.7, ph: i * 1.7, v: opts.v ?? 26, av: 8 }), opts);
}
function ringOf(type, n, dist, opts = {}) {
  return wave(type, 'circle', n, (i) => ({ s: D() + 700, dist, enter: 2.6, stay: opts.stay ?? 7, r: opts.r ?? 18, a0: i / n * Math.PI * 2, spin: 1.3, u: opts.u ?? 0, v: opts.v ?? 26 }), opts);
}
function crossing(type, n, dist, dir, v, opts = {}) {
  return wave(type, 'cross', n, (i) => ({ dist: dist + i * 6, u0: -dir * (100 + i * 18), su: dir * 42, v: v + (i % 2) * 6, av: 4, ph: i }), opts);
}
function divers(type, n, opts = {}) {
  return wave(type, 'dive', n, (i) => ({ s: D() + 520 + i * 40, speed: 20, dur: 3.5, v0: 110, v: 14 + (i % 2) * 8, u: (i - (n - 1) / 2) * 18, au: 8, ph: i }), opts);
}
function turret(s, u, opts = {}) { return spawnEnemy(opts.type || 'turret', 'fixed', { s, u, v: opts.v ?? 0, onGround: opts.onGround, minY: opts.minY }, opts); }
function mine(s, u, v) { return spawnEnemy('mine', 'fixed', { s, u, v, bob: 3, ph: Math.random() * 6 }); }

// Gunship crossing overhead, carrying a bomb
function gunship() {
  spawnEnemy('gunship', 'flyby', { s: D() + 900, dist: 260, enter: 4, close: 3, u0: 80, su: -8, v: 40, life: 20 }, { carry: 'bomb' });
  radio(squad(1), STAGE?.enemySet === 'wild' ? 'Một con khổng lồ! Tránh đường nó lao tới!' : 'Chiến hạm hạng nặng! Tập trung tên vào nó, tránh loạt pháo!', { prio: 1 });
  if (STAGE?.id <= 2) tip(`Mục tiêu lớn: ném bào tử nổ ${'<kbd>K</kbd>'} / ${'<kbd>B</kbd>'}`, 5, 'Mục tiêu lớn: dùng BOMB');
}

// The i-th rider flying with the player (or the mission's voice at base when the squad is empty)
function squad(i = 0) {
  const ids = WING.list.filter(w => !w.gone).map(w => w.id);
  return ids.length ? ids[i % ids.length] : STAGE?.hq || 'grace';
}

// Wingman rescue event
const RESCUE_LINES = {
  neytiri: ['Chúng bám sau ta! Jake — giúp ta cắt đuôi!', 'Anh đã đến. Ta biết anh sẽ đến.', 'Ikran của ta bị thương… Ta phải đưa nó về!'],
  tsutey: ['Ba con chuồn chuồn sắt sau lưng ta! Mắt Mơ, làm gì đó đi!', '…Ta nợ ngươi một lần. Đừng nhắc lại chuyện này.', 'Ta trúng đạn… Rút về trước. Đừng để chúng thắng!'],
  neteyam: ['Bố! Con bị bám đuôi — không cắt được!', 'Cảm ơn bố! Con sẽ bay sát hơn, con hứa!', 'Con bị bắn trúng… Con quay về trước đây!'],
};
function rescue(id) {
  const w = WING.byId[id];
  if (!w || w.gone) return;
  const L = RESCUE_LINES[id];
  w.mode = 'chased'; w.modeT = 0;
  radio(id, L[0], { prio: 2 });
  const marker = addMarker(w.pos, CHARACTERS[id]?.nameJa?.toUpperCase() || id.toUpperCase(), CHARACTERS[id]?.color || '#ffb070');
  let resolved = false;
  const group = makeGroup(() => {
    if (resolved) return;
    resolved = true;
    marker.active = false;
    w.mode = 'formation'; w.modeT = 0; w.barrelRoll();
    holdOut(w, 5);
    if (group.byPlayer > 0) { G.run.rescues = (G.run.rescues || 0) + 1; emit('bonus', 3000, w.pos.clone(), 'GIẢI CỨU +3000'); }
    radio(id, L[1], { prio: 1 });
  });
  for (let i = 0; i < 3; i++) {
    spawnEnemy('dart', 'chase', { anchor: w, back: 20 + i * 9, ou: (i - 1) * 7, ov: (i - 1) * 3, ph: i, s: w.s - 40, u: w.u, v: w.v }, { group, noFire: true });
  }
  after(16, () => {
    if (resolved) return;
    resolved = true;
    marker.active = false;
    w.mode = 'retreat'; w.modeT = 0; w.damaged = true;
    G.run.lost = G.run.lost || {};
    G.run.lost[id] = true;
    radio(id, L[2], { prio: 1 });
  });
}

// ------------------------------------------------------------ Build a stage's event list
const H = {
  at,
  say: (d, who, text, opts) => at(d, () => radio(who, text, opts)),
  radio, tip, rand,
  vWing, snake, fromBehind, holders, ringOf, crossing, divers, turret, mine, gunship, rescue,
  rear: () => setWingStance('rear', 0.5),
  ring: (s, u, v) => scheduleProp('ring', s, { u, v }),
  gold: (s, u, v) => scheduleProp('ring', s, { kind: 'gold', u, v }),
  check: (s) => scheduleProp('ring', s, { kind: 'check', u: 0, v: 24, cp: s }),
  lm: (name, s, o = {}) => scheduleProp('landmark', s, { name, ...o }),
  tower: (s, u, h) => scheduleProp('landmark', s, { name: 'skyscraper', u, h, ground: true }),
  gate: (s, u, w) => scheduleProp('gate', s, { u, w }),
  arch: (s, u = 0) => scheduleProp('arch', s, { u }),
  stack: (s, u, scale) => scheduleProp('stack', s, { u, scale }),
};

function buildScript(stage) {
  EVENTS.length = 0;
  clearSchedule();
  stage.script(H);
  // ---- boss approach (shared by all stages)
  const B = stage.bossAt;
  at(B - 210, () => {
    radio(stage.hq, stage.boss.type === 'creature' ? 'Có thứ gì đó rất lớn đang tới gần… Mọi người, cẩn thận!' : stage.final ? 'Kỳ hạm của chúng ở ngay trước mặt! Tất cả, chuẩn bị!' : 'Cảnh báo! Cỗ máy cực lớn ngay phía trước!', { prio: 2, hold: 1.4 });
    warning(true); AudioSys.stopMusic(1.2); G.warnLoop = AudioSys.loop('siren');
  });
  at(B - 40, () => { G.run.checkpoint = B - 40; });
  at(B, () => { warning(false); if (G.warnLoop) { G.warnLoop.stop(0.5); G.warnLoop = null; } emit('bossStart'); });
  EVENTS.sort((a, b) => a.d - b.d);
}

// ------------------------------------------------------------ Runner
let hooked = false;
export function initLevel() {
  if (hooked) return;
  hooked = true;
  // [speaker, line]; 'hq' = the mission's voice at base, 'mate' = a squad rider, other ids as is
  const BOSS_LINES = {
    creature: {
      1: ['hq', '{name}! Bắn vào những mảng giáp phát sáng trên lưng nó — làm nó yếu đi, đừng giết!'],
      2: ['mate', 'Nó há miệng rồi — trái tim nó đang sáng! Nhắm vào đó!'],
      3: ['mate', 'Nó nổi giận! Giữ vững, đừng để bị hất văng!'],
    },
    vehicle: {
      1: ['hq', '{name}! Phá các ụ pháo trước đã!'],
      2: ['mate', 'Cửa khoang lõi đã mở — lò năng lượng lộ ra! Bắn vào đó!'],
      3: ['quaritch', 'Đủ rồi! Toàn bộ hỏa lực — xóa sổ chúng!'],
    },
  };
  const who = (id) => id === 'hq' ? STAGE.hq : id === 'mate' ? squad(0) : id;
  on('bossPhase', (p) => {
    if (!STAGE) return;
    const L = BOSS_LINES[STAGE.boss.type]?.[p];
    if (!L) return;
    radio(who(L[0]), L[1].replace('{name}', STAGE.boss.name), { prio: p === 1 ? 1 : 2, hold: 1.2 });
    if (p === 3) after(2.5, () => radio(squad(1), 'Cẩn thận! Nó dồn hết sức rồi!'));
  });
  let firstCharge = true;
  on('bossCharge', () => { if (firstCharge) { firstCharge = false; radio(squad(0), 'Tia sáng! Tránh khỏi đường bắn!', { prio: 2, hold: 1 }); } });
  on('bossDying', () => {
    if (!STAGE) return;
    if (STAGE.boss.subdue) radio(STAGE.hq, 'Nó đã thôi chống cự… Eywa đã quyết định.', { prio: 2, hold: 0.8 });
    else radio('quaritch', STAGE.final ? 'Chưa… xong đâu… Sully…' : 'Rút lui! Tất cả rút lui!', { prio: 2, hold: 0.8 });
  });
}

export function setLevelStage(stage) {
  if (STAGE === stage) return;
  STAGE = stage;
  buildScript(stage);
}
export function levelStage() { return STAGE; }

export function startLevel(fromD) {
  setWingStance(fromD < WING_REAR_AT ? 'front' : 'rear');
  idx = 0;
  while (idx < EVENTS.length && EVENTS[idx].d < fromD) idx++;
  resetProps(fromD);
  clearMarkers();
}

export function updateLevel() {
  while (idx < EVENTS.length && G.rail.d >= EVENTS[idx].d) { const e = EVENTS[idx++]; e.fn(); }
}
