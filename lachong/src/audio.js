// =============================================================================
// LẠC HỒNG — procedural audio engine
// -----------------------------------------------------------------------------
// 100% synthesized with the Web Audio API: no samples, no files, no network.
// All music in this file is original. It borrows the colours of Vietnamese
// traditional music (pentatonic điệu Bắc / điệu Nam modes, trống đồng, sáo,
// đàn tranh, đàn bầu, đàn nguyệt, đàn nhị, kèn bầu, khèn, cồng chiêng, mõ)
// but never quotes or paraphrases any folk song, anthem or court piece.
//
//   1. Utilities
//   2. Engine state & signal graph (master / music / sfx buses, shared reverb)
//   3. Procedural buffers (noise colours, metal, crackle, reverb impulse)
//   4. Voice management (short-lived node groups, caps, cleanup)
//   5. SFX building blocks
//   6. One-shot SFX library
//   7. Continuous loops
//   8. Radio voice babble
//   9. Music instruments
//  10. Music notation compiler
//  11. Song data (all melodies are original compositions)
//  12. Sequencer / song players
//  13. Public API (AudioSys)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Utilities
// -----------------------------------------------------------------------------
const EPS = 0.0001;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const jit = (amt) => 1 + (Math.random() * 2 - 1) * amt;
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// Breakpoint envelope on an AudioParam. pts = [[dt, value, curve], ...]
// curve: 'l' linear ramp, 's' step, default exponential (values floored at EPS).
function env(p, t, pts, scale = 1) {
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const tt = t + pt[0];
    const v = pt[1] * scale;
    if (i === 0 || pt[2] === 's') p.setValueAtTime(v, tt);
    else if (pt[2] === 'l') p.linearRampToValueAtTime(v, tt);
    else p.exponentialRampToValueAtTime(Math.max(Math.abs(v), EPS), tt);
  }
}

// Percussive amplitude envelope: 0 -> peak (linear, a) -> EPS (exponential, d).
function perc(p, t, peak, a, d) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(EPS, t + a + d);
  return t + a + d;
}

// Smoothly move a parameter towards a value (safe to call every frame).
function glide(p, v, tc, t) {
  p.cancelScheduledValues(t);
  p.setTargetAtTime(v, t, Math.max(0.001, tc));
}

// Soft-clip transfer curve for WaveShaperNodes (cached per amount).
const curveCache = new Map();
function driveCurve(amount) {
  const key = Math.round(amount * 100);
  let c = curveCache.get(key);
  if (c) return c;
  const n = 1024;
  c = new Float32Array(n);
  const k = Math.max(0.01, amount);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  curveCache.set(key, c);
  return c;
}

// Deterministic 32-bit hash (used for voice babble and repeatable variation).
function hash32(x) {
  x = (x ^ 61) ^ (x >>> 16);
  x = Math.imul(x, 0x27d4eb2d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 13;
  return x >>> 0;
}

// -----------------------------------------------------------------------------
// 2. Engine state & signal graph
// -----------------------------------------------------------------------------
//   music voices -> song buses -> musicIn -> mVol -> mDuck -> mPause -> master
//   music sends  ------------------> musicRev -> (mirrored chain) -> reverb
//   sfx voices   -> sfxIn -> sVol -> master ;  sfx sends -> sfxRev -> reverb
//   loops        -> loopBus (pause mute) -> sfxIn
//   voice babble -> radio EQ -> sfxIn
//   master -> compressor (glue/limit) -> trim -> destination
let ctx = null;
let failed = false;
let G = null;              // graph nodes
let BUF = null;            // procedural buffers
let timer = null;          // scheduler interval id
let resumeAskedAt = -1e9;  // time (ms) of the last resume() request
let isPaused = false;
const VOL = { master: 0.8, music: 0.7, sfx: 0.9 };
const volGain = (v) => clamp(v, 0, 1) * clamp(v, 0, 1) * 1.25; // perceptual slider curve

const MUSIC_TRIM = 0.62;   // overall music level (leaves headroom for SFX)
const SFX_TRIM = 0.9;
const REVERB_RETURN = 2.4;

function mkGain(v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}
function mkFilter(type, f, q = 0.707, gain = 0) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  if (gain) b.gain.value = gain;
  return b;
}
function mkShaper(amount) {
  const s = ctx.createWaveShaper();
  s.curve = driveCurve(amount);
  s.oversample = '2x';
  return s;
}
function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

function buildGraph() {
  const g = {};
  g.master = mkGain(volGain(VOL.master));
  g.comp = ctx.createDynamicsCompressor();
  g.comp.threshold.value = -12;
  g.comp.knee.value = 10;
  g.comp.ratio.value = 3.5;
  g.comp.attack.value = 0.003;
  g.comp.release.value = 0.25;
  g.out = mkGain(0.92);
  chain(g.master, g.comp, g.out, ctx.destination);

  // Shared reverb (send/return). High-passed input keeps the low end clean.
  g.verbIn = mkFilter('highpass', 170, 0.6);
  g.verb = ctx.createConvolver();
  g.verb.buffer = BUF.ir;
  g.verbRet = mkGain(REVERB_RETURN);
  chain(g.verbIn, g.verb, g.verbRet, g.master);

  // Music: dry chain and a mirrored wet chain so volume/duck/pause affect both.
  g.musicIn = mkGain(MUSIC_TRIM);
  g.musicRev = mkGain(MUSIC_TRIM);
  g.mVol = [mkGain(volGain(VOL.music)), mkGain(volGain(VOL.music))];
  g.mDuck = [mkGain(1), mkGain(1)];
  g.mPause = [mkGain(1), mkGain(1)];
  chain(g.musicIn, g.mVol[0], g.mDuck[0], g.mPause[0], g.master);
  chain(g.musicRev, g.mVol[1], g.mDuck[1], g.mPause[1], g.verbIn);

  // SFX
  g.sfxIn = mkGain(SFX_TRIM);
  g.sfxRev = mkGain(SFX_TRIM);
  g.sVol = [mkGain(volGain(VOL.sfx)), mkGain(volGain(VOL.sfx))];
  chain(g.sfxIn, g.sVol[0], g.master);
  chain(g.sfxRev, g.sVol[1], g.verbIn);

  // Loops are muted as a group while paused.
  g.loopBus = mkGain(1);
  g.loopBus.connect(g.sfxIn);

  // Radio EQ for the babble voices: band-limited, slightly saturated.
  g.radioIn = mkGain(1);
  chain(g.radioIn, mkFilter('highpass', 320, 0.8), mkFilter('lowpass', 3100, 0.9),
    mkFilter('peaking', 1700, 1.2, 4), mkShaper(2.2), mkGain(0.36), g.sfxIn);
  return g;
}

function hasPanner() {
  return !!(ctx && typeof ctx.createStereoPanner === 'function');
}

// -----------------------------------------------------------------------------
// 3. Procedural buffers
// -----------------------------------------------------------------------------
function makeBuffers() {
  const sr = ctx.sampleRate;
  const B = {};
  const len = Math.floor(sr * 2);

  // White noise (stereo, decorrelated).
  B.white = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = B.white.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // Pink noise (Paul Kellet's refined filter), stereo.
  B.pink = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = B.pink.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }

  // Brown noise (leaky integrator), stereo.
  B.brown = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = B.brown.getChannelData(c);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
  }

  // "Metal": six detuned square waves (808-style cymbal source) + a little noise.
  const mlen = Math.floor(sr * 1);
  B.metal = ctx.createBuffer(1, mlen, sr);
  {
    const d = B.metal.getChannelData(0);
    const fr = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0].map((f) => f * 1.7);
    for (let i = 0; i < mlen; i++) {
      const t = i / sr;
      let s = 0;
      for (let k = 0; k < fr.length; k++) s += ((t * fr[k]) % 1) < 0.5 ? 1 : -1;
      d[i] = s / 6 * 0.8 + (Math.random() * 2 - 1) * 0.2;
    }
  }

  // Crackle: sparse, decaying impulses (debris, sparks, static).
  B.crackle = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = B.crackle.getChannelData(c);
    let amp = 0, ph = 0, fr = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.0016) { amp = Math.random() * 0.9 + 0.1; fr = rnd(0.2, 1.4); ph = 0; }
      d[i] = amp * Math.sin(ph) * (Math.random() < 0.5 ? 1 : 0.6);
      ph += fr;
      amp *= 0.985;
    }
  }

  B.ir = makeImpulse(2.3, sr);
  return B;
}

// Stereo reverb impulse: pre-delay, sparse early reflections, then an
// exponentially decaying diffuse tail that gets darker over time.
function makeImpulse(seconds, sr) {
  const len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.012);
  const rt = seconds * 0.92;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const x = i / len;
      const decay = Math.exp(-6.9 * t / rt);
      const a = 0.9 - 0.78 * x;               // tail darkens as it decays
      lp += a * ((Math.random() * 2 - 1) - lp);
      const fadeIn = Math.min(1, t / 0.035);  // soft onset of the diffuse tail
      d[i] = lp * decay * fadeIn * 0.9;
    }
    // Early reflections (different per channel for width).
    for (let k = 0; k < 14; k++) {
      const ti = pre + Math.floor(sr * rnd(0.004, 0.085));
      if (ti < len) d[ti] += (Math.random() < 0.5 ? -1 : 1) * rnd(0.25, 0.7) * (1 - k / 16);
    }
    d[len - 1] = 0;
  }
  return ir;
}

// -----------------------------------------------------------------------------
// 4. Voice management
// -----------------------------------------------------------------------------
// A Voice owns a group of short-lived nodes. Sources are started/stopped once;
// when the last source ends (onended) every node is disconnected. Pools cap the
// number of simultaneous voices and fade out the oldest when exceeded; a
// periodic sweep catches anything whose onended never fired.
class Pool {
  constructor(max) { this.max = max; this.list = []; }
  add(v) {
    this.list.push(v);
    let active = 0;
    for (const x of this.list) if (!x.killed) active++;
    if (active > this.max) {
      for (const x of this.list) if (!x.killed && x !== v) { x.kill(); break; }
    }
  }
  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
  }
  sweep(now) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      if (v && now > v.end + 1.0) v.dispose();
    }
  }
}
let sfxPool = null;
let musicPool = null;

class Voice {
  constructor(pool, dest, t, gain = 1, pan = 0) {
    this.pool = pool;
    this.t = t;
    this.end = t + 0.05;
    this.nodes = [];
    this.srcs = [];
    this.live = 0;
    this.dead = false;
    this.killed = false;
    this.out = mkGain(gain);
    this.nodes.push(this.out);
    let tail = this.out;
    if (pan && hasPanner()) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      this.out.connect(p);
      this.nodes.push(p);
      tail = p;
    }
    tail.connect(dest);
    this.tail = tail;
    pool.add(this);
  }
  // Track a helper node so it is disconnected with the voice.
  keep(n) { this.nodes.push(n); return n; }
  gain(v = 1, dest = this.out) { const g = this.keep(mkGain(v)); g.connect(dest); return g; }
  filter(type, f, q = 0.707, dest = this.out, gdb = 0) { const b = this.keep(mkFilter(type, f, q, gdb)); b.connect(dest); return b; }
  shaper(amount, dest = this.out) { const s = this.keep(mkShaper(amount)); s.connect(dest); return s; }
  panner(pan, dest = this.out) {
    if (!hasPanner()) return dest;
    const p = this.keep(ctx.createStereoPanner());
    p.pan.value = clamp(pan, -1, 1);
    p.connect(dest);
    return p;
  }
  // Register a source node: start it, schedule its stop and hook cleanup.
  src(n, t0, t1, offset) {
    this.nodes.push(n);
    this.srcs.push(n);
    this.live++;
    n.onended = () => { this.live--; if (this.live <= 0) this.dispose(); };
    if (offset !== undefined) n.start(t0, offset); else n.start(t0);
    n.stop(t1);
    if (t1 > this.end) this.end = t1;
    return n;
  }
  osc(type, f, t0, t1, dest = this.out, detune = 0) {
    const o = ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = f;
    if (detune) o.detune.value = detune;
    o.connect(dest);
    return this.src(o, t0, t1);
  }
  noise(kind, t0, t1, dest = this.out, rate = 1) {
    const s = ctx.createBufferSource();
    const b = BUF[kind] || BUF.white;
    s.buffer = b;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    return this.src(s, t0, t1, Math.random() * b.duration * 0.9);
  }
  send(bus, amt) {
    if (amt <= 0) return;
    const s = this.keep(mkGain(amt));
    this.tail.connect(s);
    s.connect(bus);
  }
  kill() {
    if (this.dead || this.killed) return;
    this.killed = true;
    const t = ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(0, t, 0.01);
    } catch (e) { /* ignore */ }
    for (const s of this.srcs) { try { s.stop(t + 0.07); } catch (e) { /* already stopped */ } }
    this.end = Math.min(this.end, t + 0.07);
  }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const n of this.nodes) {
      try { n.disconnect(); } catch (e) { /* ignore */ }
      if (n.onended) n.onended = null;
    }
    this.nodes.length = 0;
    this.srcs.length = 0;
    this.pool.remove(this);
  }
}

// -----------------------------------------------------------------------------
// 5. SFX building blocks
// -----------------------------------------------------------------------------
// Apply a number or a breakpoint curve to an AudioParam.
function curve(p, t, c, scale = 1) {
  if (c === undefined || c === null) return;
  if (typeof c === 'number') p.setValueAtTime(c * scale, t);
  else env(p, t, c, scale);
}

// One synthesis layer: source -> [filter] -> [filter2] -> [shaper] -> [tremolo] -> amp -> [pan] -> voice.
//   o: oscillator type | n: noise buffer name ('white','pink','brown','metal','crackle')
//   f: frequency (number | curve)   det: detune (cents)   r: noise playbackRate curve
//   ft/ff/q, ft2/ff2/q2: filters (ff curves are scaled by pitch)
//   g: [peak, attack, decay] or a breakpoint curve     at: start offset     dur: forced length
//   sh: waveshaper drive   am: [rate, depth, type] tremolo   pan / ps: [from, to] pan sweep
//   fm: [ratio, index, decay] FM bell    vib: [rate, cents, delay]    fn: [noise, Hz] noisy FM
function layer(v, s) {
  const t = v.t + (s.at || 0);
  const p = v.p || 1;
  const amp = v.keep(mkGain(0));
  const g = s.g || [0.3, 0.005, 0.2];
  let end;
  if (Array.isArray(g[0])) { env(amp.gain, t, g); end = t + g[g.length - 1][0]; }
  else end = perc(amp.gain, t, g[0], g[1], g[2]);
  if (s.dur) end = t + s.dur;

  let out = v.out;
  if (s.ps && hasPanner()) {
    out = v.panner(s.ps[0], v.out);
    env(out.pan, t, [[0, s.ps[0]], [Math.max(0.01, end - t), s.ps[1], 'l']]);
  } else if (s.pan) out = v.panner(s.pan, v.out);
  amp.connect(out);

  let head = amp;
  const stop = end + 0.03;
  if (s.am) {
    const depth = clamp(s.am[1], 0, 1);
    const tr = v.gain(1 - depth * 0.5, head);
    const lg = v.gain(depth * 0.5, tr.gain);
    v.osc(s.am[2] || 'square', s.am[0], t, stop, lg);
    head = tr;
  }
  if (s.sh) head = v.shaper(s.sh, head);
  if (s.ft2) { const f2 = v.filter(s.ft2, 1000, s.q2 || 0.707, head); curve(f2.frequency, t, s.ff2, p); head = f2; }
  if (s.ft) { const f1 = v.filter(s.ft, 1000, s.q || 0.707, head); curve(f1.frequency, t, s.ff, p); head = f1; }

  if (s.n) {
    const rate = clamp(p, 0.25, 4);
    const src = v.noise(s.n, t, stop, head, rate);
    if (s.r) curve(src.playbackRate, t, s.r, rate);
  } else {
    const o = v.osc(s.o || 'sine', 440, t, stop, head, s.det || 0);
    curve(o.frequency, t, s.f === undefined ? 440 : s.f, p);
    const base = (typeof s.f === 'number' ? s.f : (s.f ? s.f[0][1] : 440)) * p;
    if (s.fm) {
      const mg = v.gain(0, o.frequency);
      env(mg.gain, t, [[0, base * s.fm[1]], [s.fm[2], base * s.fm[1] * 0.06]]);
      v.osc('sine', base * s.fm[0], t, stop, mg);
    }
    if (s.vib) {
      const vg = v.gain(0, o.detune);
      env(vg.gain, t, [[0, 0], [s.vib[2], 0, 'l'], [s.vib[2] + 0.25, s.vib[1], 'l']]);
      v.osc('sine', s.vib[0], t, stop, vg);
    }
    if (s.fn) {
      const ng = v.gain(s.fn[1] * p, o.frequency);
      v.noise(s.fn[0], t, stop, ng, 1);
    }
  }
  return end;
}
const L = layer;
const rev = (v, amt) => v.send(G.sfxRev, amt);

// FM bell partial (sparkles, chimes, pings).
function bell(v, at, f, peak, decay, pan = 0, bright = 1.4) {
  L(v, { at, o: 'sine', f, g: [peak, 0.002, decay], fm: [3.51, bright, decay * 0.45], pan });
  L(v, { at, o: 'sine', f: f * 2.0, g: [peak * 0.22, 0.002, decay * 0.4], pan: -pan });
}
// Short synth tone with a gate (UI beeps, jingles).
function beep(v, at, type, f, peak, len, ff = 5000, extra = {}) {
  return L(v, Object.assign({ at, o: type, f, ft: 'lowpass', ff, q: 0.8,
    g: [[0, 0], [0.004, peak, 'l'], [Math.max(0.01, len), peak * 0.75], [len + 0.06, EPS]] }, extra));
}
// Parametric explosion: len (s), weight 0..2, brightness (initial LP Hz).
function explosion(v, len, weight, bright) {
  L(v, { o: 'sine', f: [[0, 150 - 32 * weight], [len * 0.35, 40 - 8 * weight]], g: [0.5 + 0.16 * weight, 0.003, len * 0.5] });
  L(v, { o: 'triangle', f: [[0, 95 - 15 * weight], [len * 0.3, 30]], g: [0.2 + 0.1 * weight, 0.004, len * 0.4] });
  L(v, { n: 'brown', ft: 'lowpass', ff: [[0, 2400 - 450 * weight], [len, 130]], q: 0.9, sh: 1.6 + weight,
    g: [[0, 0], [0.008, 0.6, 'l'], [len * 0.3, 0.3], [len, EPS]] });
  L(v, { n: 'white', ft: 'lowpass', ff: [[0, bright], [len * 0.45, 520]], g: [0.42, 0.002, len * 0.45] });
  L(v, { n: 'crackle', at: 0.03, ft: 'highpass', ff: 1400, g: [[0, 0], [0.05, 0.28 + 0.1 * weight, 'l'], [len * 0.85, EPS]] });
}

// -----------------------------------------------------------------------------
// 6. One-shot SFX library   (fn(voice, opts); voice.p = pitch multiplier)
// -----------------------------------------------------------------------------
const SFX = {
  laser(v) {
    L(v, { o: 'square', f: [[0, 1850], [0.11, 360]], ft: 'lowpass', ff: [[0, 7000], [0.11, 1400]], q: 2, g: [0.13, 0.002, 0.115] });
    L(v, { o: 'sawtooth', f: [[0, 1870], [0.1, 380]], det: 12, ft: 'lowpass', ff: 5000, g: [0.08, 0.002, 0.1] });
    L(v, { o: 'sine', f: [[0, 950], [0.09, 240]], g: [0.14, 0.002, 0.09] });
    L(v, { n: 'white', ft: 'highpass', ff: 3500, g: [0.16, 0.001, 0.014] });
  },

  laserTwin(v) {
    for (const [pan, m, at] of [[-0.45, 0.985, 0], [0.45, 1.015, 0.007]]) {
      L(v, { at, pan, o: 'square', f: [[0, 1720 * m], [0.12, 330 * m]], ft: 'lowpass', ff: [[0, 6500], [0.12, 1300]], q: 2, g: [0.1, 0.002, 0.13] });
      L(v, { at, pan, o: 'sawtooth', f: [[0, 1740 * m], [0.12, 342 * m]], det: 10, ft: 'lowpass', ff: 4500, g: [0.06, 0.002, 0.12] });
    }
    L(v, { o: 'triangle', f: [[0, 720], [0.12, 170]], g: [0.16, 0.002, 0.12] });
    L(v, { n: 'white', ft: 'highpass', ff: 3000, g: [0.15, 0.001, 0.016] });
  },

  laserHyper(v) {
    const sweep = [[0, 520], [0.018, 1350], [0.2, 190]];
    for (const [det, pan] of [[-14, -0.35], [0, 0], [14, 0.35]]) {
      L(v, { pan, det, o: 'sawtooth', f: sweep, ft: 'bandpass', ff: [[0, 1500], [0.02, 4200], [0.2, 480]], q: 4, g: [0.12, 0.003, 0.2] });
    }
    L(v, { o: 'square', f: [[0, 260], [0.018, 675], [0.2, 95]], ft: 'lowpass', ff: 1800, g: [0.1, 0.003, 0.19] });
    L(v, { o: 'sine', f: [[0, 180], [0.2, 58]], g: [0.2, 0.003, 0.18] });
    L(v, { n: 'white', ft: 'bandpass', ff: [[0, 6000], [0.08, 1500]], q: 1.2, g: [0.12, 0.001, 0.05] });
  },

  chargeReady(v) {
    bell(v, 0, 2093, 0.13, 0.16, -0.2);
    bell(v, 0.075, 2637, 0.13, 0.3, 0.2);
    L(v, { o: 'triangle', f: 1046.5, g: [0.05, 0.002, 0.12] });
    rev(v, 0.25);
  },

  lockOn(v) {
    for (const [at, f] of [[0, 1975], [0.072, 1975]]) {
      beep(v, at, 'square', f, 0.07, 0.035, 5200);
      beep(v, at, 'sine', f * 2, 0.03, 0.03, 9000);
    }
  },

  chargeShot(v) {
    L(v, { o: 'sine', f: [[0, 120], [0.55, 38]], g: [0.5, 0.004, 0.6] });
    for (const d of [-9, 9]) {
      L(v, { o: 'sawtooth', det: d, f: [[0, 240], [0.45, 55]], ft: 'lowpass', ff: [[0, 3200], [0.5, 260]], q: 7, g: [0.18, 0.005, 0.5] });
    }
    L(v, { o: 'square', f: [[0, 1400], [0.09, 280]], ft: 'lowpass', ff: 4000, g: [0.1, 0.002, 0.09] });
    L(v, { n: 'pink', ft: 'bandpass', ff: [[0, 3500], [0.55, 380]], q: 1.4, g: [[0, 0], [0.03, 0.4, 'l'], [0.6, EPS]] });
    rev(v, 0.3);
  },

  bombLaunch(v) {
    L(v, { o: 'sine', f: [[0, 170], [0.14, 55]], g: [0.4, 0.003, 0.16] });
    L(v, { n: 'pink', ft: 'bandpass', ff: [[0, 450], [0.5, 2600], [0.8, 1800]], q: 1.1, g: [[0, 0], [0.06, 0.5, 'l'], [0.35, 0.35], [0.85, EPS]] });
    L(v, { n: 'brown', ft: 'lowpass', ff: 380, g: [[0, 0], [0.04, 0.45, 'l'], [0.7, EPS]] });
    L(v, { n: 'white', ft: 'highpass', ff: [[0, 2500], [0.6, 6000]], g: [[0, 0], [0.08, 0.1, 'l'], [0.7, EPS]] });
    rev(v, 0.2);
  },

  bombBlast(v) {
    L(v, { o: 'square', f: [[0, 900], [0.05, 80]], ft: 'lowpass', ff: 2500, g: [0.26, 0.001, 0.06] });
    L(v, { o: 'sine', f: [[0, 76], [1.2, 24]], g: [0.85, 0.006, 1.7] });
    L(v, { o: 'triangle', f: [[0, 110], [0.9, 30]], g: [0.3, 0.004, 1.0] });
    L(v, { n: 'brown', ft: 'lowpass', ff: [[0, 1400], [2.4, 110]], q: 0.8, sh: 2.5, g: [[0, 0], [0.012, 0.75, 'l'], [0.4, 0.45], [2.5, EPS]] });
    L(v, { n: 'white', ft: 'lowpass', ff: [[0, 8000], [0.7, 500]], g: [0.5, 0.003, 0.9] });
    L(v, { n: 'crackle', at: 0.08, ft: 'highpass', ff: 1200, g: [[0, 0], [0.1, 0.42, 'l'], [2.0, EPS]] });
    L(v, { n: 'pink', at: 0.18, ft: 'lowpass', ff: [[0, 2500], [1.8, 300]], g: [[0, 0], [0.15, 0.3, 'l'], [2.1, EPS]] });
    rev(v, 0.5);
  },

  explodeS(v) { explosion(v, 0.6, 0, 7000); rev(v, 0.14); },

  explodeM(v) {
    explosion(v, 1.2, 1, 6000);
    L(v, { at: 0.07, n: 'pink', ft: 'lowpass', ff: [[0, 2600], [0.8, 260]], g: [0.25, 0.01, 0.8] });
    rev(v, 0.24);
  },

  explodeL(v) {
    explosion(v, 2.0, 2, 5500);
    L(v, { at: 0.13, o: 'sine', f: [[0, 95], [0.6, 30]], g: [0.45, 0.004, 0.7] });
    L(v, { at: 0.13, n: 'white', ft: 'lowpass', ff: [[0, 5000], [0.6, 400]], g: [0.3, 0.003, 0.6] });
    L(v, { at: 0.3, n: 'crackle', ft: 'bandpass', ff: 2500, q: 0.8, g: [[0, 0], [0.1, 0.3, 'l'], [1.5, EPS]] });
    rev(v, 0.36);
  },

  hitEnemy(v) {
    L(v, { n: 'white', ft: 'highpass', ff: 2500, g: [0.18, 0.001, 0.02] });
    for (const [f, a, d] of [[1870, 0.08, 0.08], [2950, 0.06, 0.06], [4230, 0.045, 0.045], [1240, 0.05, 0.1]]) {
      L(v, { o: 'sine', f, g: [a, 0.001, d] });
    }
    L(v, { o: 'triangle', f: [[0, 420], [0.05, 190]], g: [0.13, 0.001, 0.05] });
    L(v, { n: 'metal', ft: 'bandpass', ff: 5200, q: 3, g: [0.1, 0.001, 0.05] });
  },

  playerHit(v) {
    L(v, { n: 'white', ft: 'lowpass', ff: [[0, 4500], [0.2, 700]], sh: 4, g: [0.42, 0.002, 0.2] });
    L(v, { o: 'square', f: [[0, 170], [0.16, 48]], ft: 'lowpass', ff: 1400, sh: 3, g: [0.24, 0.002, 0.17] });
    L(v, { o: 'sine', f: [[0, 110], [0.25, 40]], g: [0.42, 0.002, 0.28] });
    for (const [f, a, d] of [[523, 0.06, 0.7], [527.5, 0.045, 0.75], [1308, 0.045, 0.55], [2215, 0.035, 0.4], [3151, 0.025, 0.3]]) {
      L(v, { at: 0.004, o: 'sine', f, g: [a, 0.002, d] });
    }
    L(v, { at: 0.07, n: 'crackle', ft: 'bandpass', ff: 2200, q: 1.5, g: [[0, 0], [0.01, 0.35, 'l'], [0.18, 0.25], [0.3, EPS]] });
    L(v, { at: 0.07, n: 'white', ft: 'bandpass', ff: 1800, q: 2.5, am: [47, 0.8], g: [[0, 0], [0.01, 0.12, 'l'], [0.2, 0.08], [0.28, EPS]] });
    rev(v, 0.2);
  },

  crash(v) {
    L(v, { o: 'sawtooth', f: [[0, 95], [0.5, 70]], fn: ['white', 70], ft: 'bandpass', ff: 900, q: 1.2, sh: 3,
      g: [[0, 0], [0.01, 0.3, 'l'], [0.35, 0.24], [0.55, EPS]] });
    L(v, { n: 'metal', ft: 'bandpass', ff: [[0, 3000], [0.5, 1800]], q: 2, am: [31, 0.6, 'sawtooth'],
      g: [[0, 0], [0.01, 0.26, 'l'], [0.3, 0.2], [0.5, EPS]] });
    L(v, { n: 'white', ft: 'highpass', ff: 4000, am: [23, 0.7], g: [[0, 0], [0.01, 0.16, 'l'], [0.45, EPS]] });
    L(v, { o: 'sine', f: [[0, 90], [0.2, 45]], g: [0.32, 0.002, 0.2] });
  },

  deflect(v) {
    L(v, { o: 'sine', f: [[0, 3400], [0.4, 3050]], g: [0.15, 0.001, 0.4] });
    L(v, { o: 'sine', f: [[0, 5130], [0.3, 4580]], g: [0.06, 0.001, 0.25] });
    L(v, { o: 'triangle', f: [[0, 5200], [0.16, 1300]], g: [0.09, 0.001, 0.16] });
    L(v, { n: 'white', ft: 'highpass', ff: 5000, g: [0.18, 0.001, 0.012] });
    rev(v, 0.25);
  },

  roll(v, o) {
    const s = num(o && o.pan, 0) < 0 ? -1 : 1;
    L(v, { n: 'pink', ft: 'bandpass', ff: [[0, 380], [0.24, 2600], [0.55, 450]], q: 2.2, ps: [-0.6 * s, 0.6 * s],
      g: [[0, 0], [0.14, 0.5, 'l'], [0.3, 0.36], [0.56, EPS]] });
    L(v, { n: 'white', ft: 'bandpass', ff: [[0, 1500], [0.25, 6000], [0.5, 1800]], q: 3, ps: [-0.4 * s, 0.4 * s],
      g: [[0, 0], [0.15, 0.1, 'l'], [0.5, EPS]] });
  },

  boost(v) {
    L(v, { n: 'pink', ft: 'bandpass', ff: [[0, 500], [0.7, 3200]], q: 1.2, g: [[0, 0], [0.05, 0.45, 'l'], [0.4, 0.3], [0.95, EPS]] });
    L(v, { n: 'brown', ft: 'lowpass', ff: 420, g: [[0, 0], [0.03, 0.42, 'l'], [0.8, EPS]] });
    L(v, { o: 'sawtooth', det: -6, f: [[0, 160], [0.7, 520]], ft: 'lowpass', ff: [[0, 500], [0.7, 2400]], q: 3,
      g: [[0, 0], [0.08, 0.1, 'l'], [0.5, 0.07], [0.9, EPS]] });
    L(v, { o: 'sine', f: [[0, 130], [0.12, 50]], g: [0.36, 0.003, 0.14] });
    rev(v, 0.15);
  },

  brake(v) {
    L(v, { n: 'white', ft: 'bandpass', ff: [[0, 4200], [0.65, 650]], q: 1.4, g: [[0, 0], [0.03, 0.3, 'l'], [0.3, 0.2], [0.75, EPS]] });
    L(v, { n: 'pink', ft: 'lowpass', ff: [[0, 1800], [0.6, 300]], g: [[0, 0], [0.02, 0.26, 'l'], [0.6, EPS]] });
    L(v, { o: 'sawtooth', f: [[0, 340], [0.6, 110]], ft: 'lowpass', ff: 900, g: [[0, 0], [0.02, 0.07, 'l'], [0.6, EPS]] });
  },

  ring(v) {
    const notes = [1318.5, 1661.2, 1975.5, 2637.0];
    notes.forEach((f, i) => bell(v, i * 0.045, f, 0.1, 0.55, (i % 2 ? 0.35 : -0.35)));
    L(v, { n: 'white', ft: 'highpass', ff: 7500, g: [[0, 0], [0.05, 0.05, 'l'], [0.5, EPS]] });
    rev(v, 0.35);
  },

  goldRing(v) {
    const notes = [1046.5, 1318.5, 1568.0, 2093.0, 2637.0, 3136.0];
    notes.forEach((f, i) => bell(v, i * 0.05, f, 0.09, 0.95, [-0.5, 0.5, -0.25, 0.25, -0.1, 0.1][i]));
    for (const [f, pan] of [[2093, -0.4], [2099.5, 0.4], [3136, -0.2], [3143, 0.2]]) {
      L(v, { at: 0.12, pan, o: 'sine', f, am: [7, 0.6, 'sine'], g: [[0, 0], [0.3, 0.035, 'l'], [0.8, 0.025], [1.6, EPS]] });
    }
    for (const m of [72, 76, 79]) {
      L(v, { o: 'sawtooth', f: mtof(m), det: m === 76 ? 7 : -7, ft: 'lowpass', ff: 2200,
        g: [[0, 0], [0.06, 0.035, 'l'], [0.5, 0.03], [1.4, EPS]] });
    }
    L(v, { n: 'white', ft: 'highpass', ff: 8000, g: [[0, 0], [0.2, 0.05, 'l'], [1.3, EPS]] });
    rev(v, 0.5);
  },

  item(v) {
    [880, 1108.7, 1318.5, 1760].forEach((f, i) => {
      bell(v, i * 0.04, f, 0.1, 0.35, i % 2 ? 0.2 : -0.2, 1.1);
      L(v, { at: i * 0.04, o: 'triangle', f, g: [0.05, 0.002, 0.12] });
    });
    rev(v, 0.25);
  },

  powerUp(v) {
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => {
      const last = i === seq.length - 1;
      beep(v, i * 0.065, 'square', f, 0.07, last ? 0.32 : 0.05, 4200, last ? { vib: [6, 18, 0.1] } : {});
      beep(v, i * 0.065, 'sawtooth', f * 0.5, 0.05, last ? 0.32 : 0.05, 2400);
    });
    bell(v, 0.195, 2093, 0.07, 0.6, 0, 1.2);
    rev(v, 0.3);
  },

  shieldUp(v) {
    L(v, { o: 'triangle', f: [[0, 300], [0.6, 1200]], ft: 'lowpass', ff: 3000, g: [[0, 0], [0.1, 0.16, 'l'], [0.5, 0.12], [0.9, EPS]] });
    L(v, { o: 'sine', f: [[0, 150], [0.6, 600]], g: [[0, 0], [0.1, 0.1, 'l'], [0.8, EPS]] });
    for (const [f, pan] of [[2400, -0.4], [2412, 0.4]]) {
      L(v, { at: 0.2, pan, o: 'sine', f, am: [9, 0.7, 'sine'], g: [[0, 0], [0.3, 0.035, 'l'], [1.0, EPS]] });
    }
    L(v, { n: 'white', ft: 'bandpass', ff: [[0, 800], [0.7, 5000]], q: 3, g: [[0, 0], [0.3, 0.1, 'l'], [0.9, EPS]] });
    rev(v, 0.4);
  },

  extraLife(v) {
    // Original 1UP jingle: rising figure, turn, leap to the octave.
    const seq = [[86, 0.075], [90, 0.075], [93, 0.075], [90, 0.075], [95, 0.075], [98, 0.45]];
    let at = 0;
    for (const [m, len] of seq) {
      const f = mtof(m);
      beep(v, at, 'square', f, 0.065, len * 0.9, 5000, len > 0.2 ? { vib: [6.5, 15, 0.12] } : {});
      bell(v, at, f * 0.5, 0.045, len + 0.3, 0, 1.0);
      at += len;
    }
    bell(v, 0.375, mtof(93), 0.05, 0.9, -0.3);
    bell(v, 0.375, mtof(90), 0.05, 0.9, 0.3);
    rev(v, 0.3);
  },

  enemyShot(v) {
    L(v, { o: 'sawtooth', f: [[0, 900], [0.15, 180]], ft: 'lowpass', ff: [[0, 3000], [0.15, 700]], q: 3, sh: 2.5, g: [0.11, 0.002, 0.15] });
    L(v, { o: 'square', f: [[0, 452], [0.15, 92]], ft: 'lowpass', ff: 1600, g: [0.08, 0.002, 0.14] });
    L(v, { n: 'white', ft: 'bandpass', ff: 2500, q: 1, g: [0.11, 0.001, 0.02] });
  },

  missile(v) {
    L(v, { n: 'white', ft: 'bandpass', ff: [[0, 2800], [0.4, 1100]], q: 1, g: [[0, 0], [0.015, 0.33, 'l'], [0.12, 0.24], [0.45, EPS]] });
    L(v, { n: 'white', ft: 'highpass', ff: 6000, g: [[0, 0], [0.01, 0.1, 'l'], [0.35, EPS]] });
    L(v, { o: 'sine', f: [[0, 200], [0.1, 80]], g: [0.24, 0.002, 0.1] });
    rev(v, 0.12);
  },

  lowShield(v) {
    for (const at of [0, 0.13]) {
      beep(v, at, 'square', 880, 0.075, 0.07, 2800);
      beep(v, at, 'sine', 1760, 0.03, 0.07, 8000);
    }
  },

  checkpoint(v) {
    const seq = [[88, 0.08], [84, 0.08], [91, 0.08], [96, 0.42]];
    let at = 0;
    for (const [m, len] of seq) {
      beep(v, at, 'square', mtof(m), 0.06, len * 0.9, 4500);
      bell(v, at, mtof(m), 0.05, len + 0.25, 0, 1.0);
      at += len;
    }
    rev(v, 0.3);
  },

  uiMove(v) {
    L(v, { o: 'square', f: [[0, 1200], [0.03, 1280]], ft: 'lowpass', ff: 4000, g: [0.05, 0.001, 0.035] });
    L(v, { o: 'sine', f: 2400, g: [0.025, 0.001, 0.03] });
  },

  uiSelect(v) {
    beep(v, 0, 'square', 880, 0.06, 0.045, 3800);
    beep(v, 0.055, 'square', 1318.5, 0.06, 0.1, 4200);
    bell(v, 0.055, 2637, 0.04, 0.3, 0, 1.0);
    rev(v, 0.15);
  },

  uiBack(v) {
    beep(v, 0, 'triangle', 700, 0.1, 0.05, 3000);
    beep(v, 0.06, 'triangle', 466, 0.1, 0.09, 2500);
    beep(v, 0.06, 'square', 466, 0.03, 0.08, 1800);
  },

  pause(v) {
    bell(v, 0, 987.8, 0.08, 0.7, -0.2, 1.0);
    bell(v, 0.07, 1318.5, 0.08, 0.8, 0.2, 1.0);
    L(v, { o: 'sine', f: 659.25, g: [0.06, 0.004, 0.6] });
    rev(v, 0.35);
  },

  splash(v) {
    L(v, { o: 'sine', f: [[0, 62], [0.6, 28]], g: [0.6, 0.005, 0.9] });
    L(v, { n: 'white', ft: 'lowpass', ff: [[0, 4500], [1.8, 1200]], g: [[0, 0], [0.04, 0.5, 'l'], [0.4, 0.36], [2.0, EPS]] });
    L(v, { n: 'white', ft: 'highpass', ff: 3000, g: [[0, 0], [0.25, 0.2, 'l'], [1.9, EPS]] });
    L(v, { n: 'brown', ft: 'lowpass', ff: 600, g: [[0, 0], [0.03, 0.45, 'l'], [1.6, EPS]] });
    L(v, { at: 0.35, n: 'pink', ft: 'bandpass', ff: 900, q: 0.6, am: [5, 0.5, 'sine'], g: [[0, 0], [0.2, 0.25, 'l'], [1.6, EPS]] });
    for (let i = 0; i < 22; i++) {
      const at = rnd(0.25, 1.9);
      const f = rnd(500, 1800);
      L(v, { at, pan: rnd(-0.8, 0.8), o: 'sine', f: [[0, f], [0.045, f * 1.6]], g: [rnd(0.015, 0.05), 0.002, 0.05] });
    }
    rev(v, 0.45);
  },

  roar(v) {
    const env1 = [[0, 0], [0.15, 0.42, 'l'], [1.2, 0.34], [1.8, EPS]];
    const pitch = [[0, 48], [0.35, 72], [1.2, 64], [1.8, 40]];
    L(v, { o: 'sawtooth', f: pitch, fn: ['brown', 18], ft: 'bandpass', ff: [[0, 300], [0.4, 760], [1.3, 520], [1.8, 300]], q: 3,
      sh: 6, am: [28, 0.5, 'sine'], g: env1 });
    L(v, { o: 'sawtooth', f: pitch.map(([t, f]) => [t, f * 1.5]), fn: ['brown', 25], ft: 'bandpass',
      ff: [[0, 900], [0.4, 1700], [1.3, 1200], [1.8, 800]], q: 4, sh: 4, g: [[0, 0], [0.2, 0.26, 'l'], [1.2, 0.2], [1.8, EPS]] });
    L(v, { o: 'square', f: pitch.map(([t, f]) => [t, f * 3.1]), fn: ['white', 40], ft: 'bandpass', ff: 2200, q: 5,
      am: [97, 1, 'sine'], g: [[0, 0], [0.25, 0.12, 'l'], [1.3, 0.09], [1.8, EPS]] });
    L(v, { o: 'sine', f: [[0, 40], [0.4, 55], [1.8, 32]], g: [[0, 0], [0.1, 0.45, 'l'], [1.3, 0.35], [1.9, EPS]] });
    L(v, { n: 'pink', ft: 'bandpass', ff: [[0, 500], [0.5, 1200], [1.8, 400]], q: 1, g: [[0, 0], [0.2, 0.22, 'l'], [1.8, EPS]] });
    L(v, { n: 'metal', ft: 'bandpass', ff: [[0, 1200], [0.5, 2000], [1.8, 900]], q: 2, am: [13, 0.8, 'sawtooth'],
      g: [[0, 0], [0.3, 0.14, 'l'], [1.7, EPS]] });
    rev(v, 0.45);
  },

  radio(v) {
    L(v, { n: 'crackle', ft: 'bandpass', ff: 1900, q: 1.2, g: [[0, 0], [0.005, 0.35, 'l'], [0.1, 0.3], [0.14, EPS]] });
    L(v, { n: 'white', ft: 'bandpass', ff: 2400, q: 2, am: [60, 0.9], g: [[0, 0], [0.005, 0.12, 'l'], [0.13, EPS]] });
    beep(v, 0.15, 'square', 1320, 0.055, 0.05, 3000);
    beep(v, 0.23, 'square', 1760, 0.055, 0.06, 3000);
  },

  gateClose(v) {
    L(v, { o: 'sine', f: 1180, g: [0.07, 0.001, 0.08] });
    L(v, { o: 'sine', f: 2090, g: [0.05, 0.001, 0.06] });
    L(v, { at: 0.02, o: 'sine', f: [[0, 95], [0.3, 38]], g: [0.75, 0.003, 0.45] });
    L(v, { at: 0.02, n: 'brown', ft: 'lowpass', ff: [[0, 1800], [0.3, 200]], sh: 2.5, g: [0.55, 0.002, 0.3] });
    [[180, 0.09, 1.0], [297, 0.08, 0.8], [431, 0.06, 0.7], [612, 0.05, 0.55], [845, 0.04, 0.45]].forEach(([f, a, d]) => {
      L(v, { at: 0.02, o: 'sine', f, g: [a, 0.002, d] });
    });
    L(v, { at: 0.05, n: 'crackle', ft: 'bandpass', ff: 1200, g: [0.2, 0.005, 0.35] });
    rev(v, 0.4);
  },

  countTick(v) {
    beep(v, 0, 'square', 2400, 0.035, 0.012, 6000);
    L(v, { o: 'sine', f: 4800, g: [0.018, 0.001, 0.02] });
  },

  rankStamp(v) {
    L(v, { o: 'sine', f: [[0, 130], [0.35, 42]], g: [0.7, 0.002, 0.45] });
    L(v, { n: 'white', ft: 'lowpass', ff: [[0, 6000], [0.3, 600]], g: [0.42, 0.001, 0.3] });
    L(v, { n: 'metal', ft: 'highpass', ff: 5000, g: [0.14, 0.002, 1.3] });
    L(v, { n: 'white', ft: 'highpass', ff: 7000, g: [0.08, 0.002, 1.1] });
    [[1568, 0.06], [2349.3, 0.1], [3136, 0.14]].forEach(([f, at], i) => bell(v, at, f, 0.07, 0.9, (i - 1) * 0.4));
    rev(v, 0.4);
  },

  warning(v) {
    beep(v, 0, 'sawtooth', 880, 0.08, 0.2, 2000, { vib: [9, 20, 0] });
    beep(v, 0.23, 'sawtooth', 660, 0.08, 0.2, 1800, { vib: [9, 20, 0] });
    beep(v, 0, 'square', 440, 0.03, 0.2, 1200);
    beep(v, 0.23, 'square', 330, 0.03, 0.2, 1200);
  },
};

// Per-sound options: gap = minimum retrigger interval (s), jit = random pitch spread.
// vol = loudness trim (balanced by offline level analysis).
const SFX_META = {
  laser: { gap: 0.03, jit: 0.02, vol: 1.25 }, laserTwin: { gap: 0.03, jit: 0.02, vol: 1.25 },
  laserHyper: { gap: 0.03, jit: 0.02, vol: 1.3 }, hitEnemy: { gap: 0.035, jit: 0.04, vol: 1.3 },
  enemyShot: { gap: 0.03, jit: 0.04, vol: 1.4 }, deflect: { gap: 0.03, jit: 0.03 },
  explodeS: { gap: 0.04, jit: 0.04, vol: 0.72 }, explodeM: { gap: 0.05, jit: 0.035, vol: 0.8 },
  explodeL: { gap: 0.07, jit: 0.03, vol: 0.72 }, bombBlast: { gap: 0.1, jit: 0.02, vol: 0.72 },
  chargeShot: { vol: 0.72 }, playerHit: { gap: 0.06, jit: 0.03, vol: 0.8 }, gateClose: { vol: 0.85 },
  crash: { gap: 0.12, jit: 0.04 }, roll: { gap: 0.1, jit: 0.03, vol: 2.0 },
  missile: { gap: 0.04, jit: 0.04 }, countTick: { gap: 0.02, jit: 0.02, vol: 2.5 },
  uiMove: { gap: 0.02, vol: 2.2 }, uiSelect: { vol: 1.6 }, uiBack: { vol: 1.6 }, pause: { vol: 1.3 },
  lowShield: { gap: 0.2, vol: 1.8 }, warning: { gap: 0.2, vol: 1.8 }, radio: { vol: 1.8 },
  lockOn: { gap: 0.06, vol: 1.6 }, chargeReady: { gap: 0.1, vol: 1.3 },
  splash: { gap: 0.2 }, roar: { gap: 0.25 }, ring: { gap: 0.05, vol: 1.2 }, item: { gap: 0.05, vol: 1.3 },
  powerUp: { vol: 1.3 },
};
const lastPlayed = Object.create(null);

// -----------------------------------------------------------------------------
// 7. Continuous loops
// -----------------------------------------------------------------------------
// Each loop owns persistent sources feeding its own fade gain -> loopBus.
// set(params) only touches AudioParams through cancel+setTargetAtTime, and is
// skipped when nothing changed, so it is cheap to call every frame.
const activeLoops = new Set();
const dyingLoops = new Set();
const MAX_LOOPS = 16;
const NOOP_HANDLE = Object.freeze({ set() {}, stop() {} });

class LoopSound {
  constructor(name) {
    this.name = name;
    this.t = ctx.currentTime + 0.01;
    this.nodes = [];
    this.srcs = [];
    this.stopped = false;
    this.dead = false;
    this.stopAt = Infinity;
    this.key = '';
    this.out = mkGain(0);
    this.out.connect(G.loopBus);
    this.nodes.push(this.out);
    this.update = null;
    activeLoops.add(this);
    if (activeLoops.size > MAX_LOOPS) {
      for (const l of activeLoops) { if (l !== this) { l.stop(0.1); break; } }
    }
  }
  keep(n) { this.nodes.push(n); return n; }
  gain(v, dest) { const g = this.keep(mkGain(v)); g.connect(dest); return g; }
  filter(type, f, q, dest) { const b = this.keep(mkFilter(type, f, q)); b.connect(dest); return b; }
  src(n) {
    this.nodes.push(n);
    this.srcs.push(n);
    n.onended = () => { if (this.stopped) this.dispose(); };
    return n;
  }
  osc(type, f, dest, detune = 0) {
    const o = this.src(ctx.createOscillator());
    o.type = type;
    o.frequency.value = f;
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(this.t);
    return o;
  }
  noise(kind, dest, rate = 1) {
    const s = this.src(ctx.createBufferSource());
    s.buffer = BUF[kind];
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start(this.t, Math.random() * s.buffer.duration * 0.9);
    return s;
  }
  fadeIn(time, level = 1) {
    this.out.gain.setValueAtTime(0, this.t);
    this.out.gain.linearRampToValueAtTime(level, this.t + time);
  }
  set(params) {
    if (this.stopped || !this.update) return;
    this.update(params || {}, ctx.currentTime);
  }
  stop(fade) {
    if (this.stopped) return;
    this.stopped = true;
    activeLoops.delete(this);
    dyingLoops.add(this);
    const t = ctx.currentTime;
    const f = Math.max(0.01, num(fade, 0.2));
    glide(this.out.gain, 0, f / 5, t);
    this.stopAt = t + f + 0.05;
    for (const s of this.srcs) { try { s.stop(this.stopAt); } catch (e) { /* ignore */ } }
  }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const n of this.nodes) {
      try { n.disconnect(); } catch (e) { /* ignore */ }
      if (n.onended) n.onended = null;
    }
    this.nodes.length = 0;
    this.srcs.length = 0;
    activeLoops.delete(this);
    dyingLoops.delete(this);
  }
}

const LOOPS = {
  // Subtle layered jet hum: saw drone + band-passed air rush + turbine whine.
  engine(lp) {
    const droneLvl = lp.gain(0.055, lp.out);
    const droneF = lp.filter('lowpass', 300, 1.1, droneLvl);
    const s1 = lp.osc('sawtooth', 70, droneF);
    const s2 = lp.osc('sawtooth', 70.4, droneF, 8);
    const sub = lp.osc('sine', 35, lp.gain(0.05, lp.out));

    const rushG = lp.gain(0.04, lp.out);
    const rushF = lp.filter('bandpass', 900, 0.8, rushG);
    lp.noise('pink', rushF);
    const turb = lp.gain(0.01, rushG.gain);
    const turbL = lp.osc('sine', 6.3, turb);

    const whineG = lp.gain(0.0, lp.out);
    const whineF = lp.filter('bandpass', 1800, 6, whineG);
    const w1 = lp.osc('triangle', 1800, whineF);
    const w2 = lp.osc('sine', 2710, whineF);

    const hissG = lp.gain(0.006, lp.out);
    lp.noise('white', lp.filter('highpass', 5200, 0.7, hissG));

    lp.fadeIn(0.5, 0.7);
    lp.update = (p, now) => {
      const speed = clamp(num(p.speed, 1), 0.2, 2.5);
      const boost = !!p.boost;
      const brake = !!p.brake;
      const key = speed.toFixed(2) + (boost ? 'B' : '') + (brake ? 'K' : '');
      if (key === lp.key) return;
      lp.key = key;
      const k = speed * (boost ? 1.3 : 1) * (brake ? 0.72 : 1);
      const tc = boost ? 0.22 : brake ? 0.3 : 0.4;
      glide(s1.frequency, 44 + 26 * k, tc, now);
      glide(s2.frequency, 44.3 + 26 * k, tc, now);
      glide(sub.frequency, 22 + 13 * k, tc, now);
      glide(droneF.frequency, 150 + 240 * k + (boost ? 260 : 0), tc, now);
      glide(droneLvl.gain, 0.04 + 0.025 * k, tc, now);
      glide(rushF.frequency, 450 + 800 * k + (boost ? 1100 : 0), tc, now);
      glide(rushG.gain, Math.max(0.01, 0.02 + 0.03 * k + (boost ? 0.045 : 0) - (brake ? 0.012 : 0)), tc, now);
      glide(turbL.frequency, 5 + 3 * k, tc, now);
      glide(w1.frequency, boost ? 2900 : 1350 + 350 * k, boost ? 0.45 : 0.5, now);
      glide(w2.frequency, boost ? 4350 : 2030 + 520 * k, boost ? 0.45 : 0.5, now);
      glide(whineF.frequency, boost ? 3000 : 1400 + 350 * k, boost ? 0.45 : 0.5, now);
      glide(whineG.gain, boost ? 0.02 : 0.0025 * k, boost ? 0.25 : 0.4, now);
      glide(hissG.gain, brake ? 0.03 : 0.004 + 0.004 * k, 0.2, now);
    };
    lp.update({ speed: 1 }, lp.t);
  },

  // Charge whine 300 -> 1200 Hz, tremolo speeds up; stable shimmer when full.
  charge(lp) {
    const g = lp.gain(0.03, lp.out);
    const trem = lp.gain(0.65, g);
    const bp = lp.filter('bandpass', 700, 2.2, trem);
    const o1 = lp.osc('sawtooth', 300, bp);
    const o2 = lp.osc('sine', 301, trem);
    const lfoG = lp.gain(0.35, trem.gain);
    const lfo = lp.osc('sine', 4, lfoG);
    const shimG = lp.gain(0, lp.out);
    const sh1 = lp.osc('sine', 2400, shimG);
    const sh2 = lp.osc('sine', 2407, shimG);
    lp.fadeIn(0.06);
    lp.update = (p, now) => {
      const lv = clamp(num(p.level, 0), 0, 1);
      const key = String(Math.round(lv * 200));
      if (key === lp.key) return;
      lp.key = key;
      const f = 300 + 900 * lv;
      const full = lv >= 0.999;
      glide(o1.frequency, f, 0.04, now);
      glide(o2.frequency, f * 2.003, 0.04, now);
      glide(bp.frequency, f * 2.2, 0.05, now);
      glide(lfo.frequency, full ? 5 : 4 + 20 * lv, 0.08, now);
      glide(lfoG.gain, full ? 0.05 : 0.35, 0.06, now);
      glide(shimG.gain, full ? 0.03 : 0, 0.08, now);
      glide(sh1.frequency, 2400 * (full ? 1 : 0.9), 0.1, now);
      glide(sh2.frequency, 2407 * (full ? 1 : 0.9), 0.1, now);
      glide(g.gain, 0.025 + 0.055 * lv, 0.06, now);
    };
    lp.update({ level: 0 }, lp.t);
  },

  // Boss beam charging: rising whine + electrical crackle (self-animating).
  beamCharge(lp) {
    const t = lp.t;
    const whG = lp.gain(0, lp.out);
    env(whG.gain, t, [[0, 0], [0.3, 0.05, 'l'], [2.0, 0.12, 'l']]);
    const bp = lp.filter('bandpass', 400, 5, whG);
    env(bp.frequency, t, [[0, 400], [2.2, 3600]]);
    const o1 = lp.osc('sawtooth', 200, bp);
    const o2 = lp.osc('square', 300, bp, 12);
    env(o1.frequency, t, [[0, 200], [2.2, 1800]]);
    env(o2.frequency, t, [[0, 300], [2.2, 2700]]);
    const crG = lp.gain(0, lp.out);
    env(crG.gain, t, [[0, 0.04], [2.0, 0.35, 'l']]);
    lp.noise('crackle', lp.filter('highpass', 1800, 0.7, crG), 1.3);
    const buzzG = lp.gain(0, lp.out);
    env(buzzG.gain, t, [[0, 0], [2.0, 0.06, 'l']]);
    const trem = lp.gain(0.5, buzzG);
    lp.osc('square', 17, lp.gain(0.5, trem.gain));
    lp.osc('sawtooth', 60, lp.filter('bandpass', 1200, 3, trem));
    const subG = lp.gain(0, lp.out);
    env(subG.gain, t, [[0, 0], [2.0, 0.22, 'l']]);
    const sub = lp.osc('sine', 40, subG);
    env(sub.frequency, t, [[0, 40], [2.0, 70]]);
    lp.fadeIn(0.05);
  },

  // Boss beam firing: distorted buzzing roar with filter/amplitude wobble.
  beam(lp) {
    const g = lp.gain(0.11, lp.out);
    const trem = lp.gain(0.75, g);
    lp.osc('sine', 11, lp.gain(0.25, trem.gain));
    const lpf = lp.filter('lowpass', 1800, 2, trem);
    lp.osc('sine', 8, lp.gain(700, lpf.frequency));
    const sh = lp.keep(mkShaper(5));
    sh.connect(lpf);
    lp.osc('sawtooth', 70, sh);
    lp.osc('sawtooth', 70.8, sh, 5);
    lp.osc('sawtooth', 140.5, sh);
    const roarG = lp.gain(0.22, lp.out);
    lp.noise('brown', lp.filter('bandpass', 420, 0.8, roarG));
    const szG = lp.gain(0.9, lp.gain(0.05, lp.out));
    lp.osc('square', 23, lp.gain(0.5, szG.gain));
    lp.noise('white', lp.filter('highpass', 5000, 0.7, szG));
    lp.osc('sine', 45, lp.gain(0.22, lp.out));
    lp.fadeIn(0.06);
  },

  // Boss-approach siren: smooth two-tone 880/660 Hz every 0.35 s, softened.
  siren(lp) {
    const g = lp.gain(0.06, lp.out);
    const tone = lp.filter('lowpass', 1700, 1, g);
    const pk = lp.filter('peaking', 1200, 1, tone);
    pk.gain.value = 3;
    const o1 = lp.osc('sawtooth', 770, pk);
    const o2 = lp.osc('square', 770, lp.gain(0.35, pk), 6);
    const smooth = lp.keep(mkFilter('lowpass', 30, 0.7));
    const depth = lp.keep(mkGain(110));
    smooth.connect(depth);
    depth.connect(o1.frequency);
    depth.connect(o2.frequency);
    lp.osc('square', 1 / 0.7, smooth);
    const vib = lp.gain(5, o1.frequency);
    lp.osc('sine', 6, vib);
    lp.fadeIn(0.12);
  },
};

// -----------------------------------------------------------------------------
// 8. Radio voice babble (gibberish "voices" for typed radio text)
// -----------------------------------------------------------------------------
// A glottal source (saw/square) through three parallel formant band-passes,
// then the shared radio EQ + saturation. The vowel comes from the character
// itself when possible (Vietnamese Latin letters with diacritics, or kana);
// pitch/length variation is a deterministic hash of the char. Vietnamese tone
// marks (sắc, huyền, hỏi, ngã, nặng) shape the pitch contour, so the gibberish
// keeps a sing-song, tonal feel. Latin text has about twice as many characters
// per sentence as Japanese, so consonants blip far less often than vowels and
// a gentle per-sentence declination keeps it sounding like speech.
// Per-voice options: f0 (Hz), spread (random pitch), form (formant scale),
// len (blip length), wave, bounce (contour lift), noise (breath), fry (vocal
// fry Hz), soft (low-pass Hz), vib [rate, depth], ring (ring-mod Hz), gain,
// rate (multiplies the syllable-rate limit: <1 quicker, >1 slower talker),
// att (attack s), buzz (detuned square octave on top) and glitch (0..1 chance
// per blip of a digital stutter / sample-and-hold pitch jump).
const VOICE_DEF = {
  // Âu — Lạc Hồng 2: young, energetic woman pilot. Mid-high, quick, lively.
  au:      { f0: 292, spread: 0.1, form: 1.17, len: 0.056, wave: 'sawtooth', bounce: 0.13, gain: 0.86, rate: 0.82 },
  // Đồng — Lạc Hồng 3: veteran male pilot. Low, calm, gravelly (breath + fry).
  dong:    { f0: 112, spread: 0.045, form: 0.84, len: 0.094, wave: 'sawtooth', bounce: -0.04, noise: 0.32, fry: 34, soft: 2600, gain: 1.35, rate: 1.2 },
  // Sử — Lạc Hồng 4: young navigator-historian. Mid, clear, a little fast and eager.
  su:      { f0: 168, spread: 0.09, form: 1.03, len: 0.062, wave: 'sawtooth', bounce: 0.1, soft: 3000, gain: 1.05, rate: 0.88 },
  // Chỉ huy Kiên — base commander (woman). Mid-low, firm, measured, steady.
  kien:    { f0: 204, spread: 0.05, form: 1.08, len: 0.086, wave: 'sawtooth', bounce: -0.02, soft: 2800, vib: [5.2, 0.02], gain: 1.0, rate: 1.15 },
  // THỜI ẢNH — enemy machine intelligence: low ring-modulated square with a
  // buzzing octave (the old Hắc Vân treatment) plus digital glitches.
  thoianh: { f0: 100, spread: 0.05, form: 0.9, len: 0.078, wave: 'square', bounce: 0, ring: 377, buzz: 0.3, glitch: 0.32, gain: 0.8 },
};
// Old SKYLINE ASIA / NOVA LANCER ids map onto the new cast; anything else
// falls back to Sử (a neutral, clear mid voice).
const VOICE_ALIAS = {
  bong: 'au', thach: 'dong', lam: 'su', ho: 'kien', hacvan: 'thoianh',
  kota: 'au', gantetsu: 'dong', rio: 'su', hou: 'kien', mizuchi: 'thoianh',
  chihuykien: 'kien', commander: 'kien', enemy: 'thoianh', thoi: 'thoianh',
};
// "Thời Ảnh", "Chỉ huy Kiên", "Đồng" -> thoianh, chihuykien, dong.
function voiceKey(who) {
  if (typeof who !== 'string') return '';
  let s = who.toLowerCase().replace(/đ/g, 'd');
  try { s = s.normalize('NFD'); } catch (e) { /* very old engines */ }
  return s.replace(/[^a-z]/g, '');
}
const FORMANTS = {
  a: [800, 1250, 2600], i: [300, 2250, 3000], u: [340, 1300, 2400],
  e: [470, 1900, 2600], o: [500, 900, 2450], n: [260, 1150, 2300],
};
const SKIP_CHARS = /[\s　、。，．,.!?！？…‥「」『』（）()[\]【】〈〉《》ー－〜~・:：;；"'“”‘’\-—–_/\\|*#@&%+=<>^`っッ]/;
// Vietnamese tone marks (combining characters after NFD).
const VN_TONE = { '́': 'sac', '̀': 'huyen', '̉': 'hoi', '̃': 'nga', '̣': 'nang' };
// Latin letter -> { base, tone } (diacritics stripped), or null for non-Latin.
function latinInfo(ch) {
  let d = ch.toLowerCase();
  try { d = d.normalize('NFD'); } catch (e) { /* very old engines */ }
  const base = d[0];
  if (!base || !((base >= 'a' && base <= 'z') || base === 'đ')) return null;
  let tone = null;
  for (let i = 1; i < d.length; i++) if (VN_TONE[d[i]]) tone = VN_TONE[d[i]];
  return { base, tone };
}
let kanaVowel = null;
function vowelOf(ch, h) {
  if (!kanaVowel) {
    kanaVowel = new Map();
    const rows = {
      a: 'あかさたなはまやらわがざだばぱぁゃゎ', i: 'いきしちにひみりぎじぢびぴぃ',
      u: 'うくすつぬふむゆるぐずづぶぷぅゅゔ', e: 'えけせてねへめれげぜでべぺぇ',
      o: 'おこそとのほもよろをごぞどぼぽぉょ', n: 'ん',
    };
    for (const k in rows) {
      for (const c of rows[k]) {
        kanaVowel.set(c, k);
        kanaVowel.set(String.fromCharCode(c.charCodeAt(0) + 0x60), k); // katakana
      }
    }
  }
  const k = kanaVowel.get(ch);
  if (k) return k;
  // Latin (incl. Vietnamese): NFD strips tone and vowel marks, so
  // ă/â -> a, ê -> e, ô/ơ -> o, ư -> u; y sounds like i; đ stays a consonant.
  const L = latinInfo(ch);
  if (L) {
    if ('aiueo'.includes(L.base)) return L.base;
    if (L.base === 'y') return 'i';
  }
  return 'aiueo'[h % 5];
}

const lastBlip = Object.create(null);
const phrasePos = Object.create(null);
function babble(who, ch) {
  if (typeof ch !== 'string' || !ch.length) return;
  const c = String.fromCodePoint(ch.codePointAt(0));
  if (SKIP_CHARS.test(c)) return;
  const key = voiceKey(who);
  const id = VOICE_DEF[key] ? key : (VOICE_ALIAS[key] || 'su');
  const P = VOICE_DEF[id];
  const rate = P.rate || 1;
  const now = ctx.currentTime;
  const since = now - (lastBlip[id] === undefined ? -10 : lastBlip[id]);
  const L = latinInfo(c);
  const code = c.codePointAt(0);
  const h = hash32(code * 7919 + 17);
  const vw = vowelOf(c, h >>> 16);
  const isVowel = !!L && ('aeiouy'.includes(L.base));
  // Rate limit: kana keep the original 28 ms. The HUD sends every 2nd typed
  // character (~15/s); Latin vowels blip at most ~11/s (about one per
  // syllable) and consonants only fill longer silences, so clusters such as
  // "ngh" or "tr" stay quiet instead of sounding like a machine gun.
  if (since < (!L ? 0.028 : isVowel ? 0.09 : 0.16) * rate) return;
  lastBlip[id] = now;
  // Gentle declination over a sentence; resets after a pause in the typing.
  phrasePos[id] = since > 0.32 * rate ? 0 : (phrasePos[id] || 0) + 1;
  const decl = 1 - Math.min(0.09, phrasePos[id] * 0.005);

  const pm = 1 + ((h & 0xff) / 255 * 2 - 1) * P.spread;
  const tone = L ? L.tone : null;
  let len = P.len * (0.85 + ((h >>> 8) & 0xff) / 255 * 0.35) * (vw === 'n' ? 1.2 : 1);
  if (L && !isVowel) len *= 0.7;                 // consonant: short tick
  if (tone === 'nang') len *= 0.65;              // heavy tone: clipped
  else if (tone === 'hoi' || tone === 'nga') len *= 1.2;
  const contour = (h >>> 24) & 3;
  const f0 = P.f0 * pm * decl;
  const t = now + 0.005;
  const stop = t + len + 0.03;

  const v = new Voice(sfxPool, G.radioIn, t, P.gain * (vw === 'n' ? 0.7 : 1) * (L && !isVowel ? 0.75 : 1));
  const amp = v.gain(0);
  const att = P.att || 0.008;
  // Machine glitch: a hash-chosen blip stutters (gated silence mid-syllable).
  const glitchy = P.glitch && (((h >>> 4) & 0xff) / 255) < P.glitch;
  if (glitchy) {
    env(amp.gain, t, [[0, 0], [att, 0.5, 'l'], [len * 0.3, 0.45, 'l'], [len * 0.3 + 0.002, 0.02, 'l'],
      [len * 0.45, 0.02, 's'], [len * 0.45 + 0.003, 0.5, 'l'], [len * 0.7, 0.42], [len, EPS]]);
  } else {
    env(amp.gain, t, [[0, 0], [att, 0.5, 'l'], [Math.max(len * 0.65, att + 0.01), 0.42], [len, EPS]]);
  }
  const F = FORMANTS[vw];
  const mix = v.keep(mkGain(1));
  [[F[0], 6, 1.0], [F[1], 9, 0.55], [F[2], 12, 0.28]].forEach(([f, q, a]) => {
    const bp = v.filter('bandpass', f * P.form, q, v.gain(a * 3.2, amp));
    mix.connect(bp);
  });
  let srcDest = mix;
  if (P.soft) srcDest = v.filter('lowpass', P.soft, 0.7, mix);
  if (P.ring) {
    const rm = v.gain(0, srcDest);          // true ring modulation: gain driven by a sine
    v.osc('sine', P.ring * (0.95 + (h & 7) * 0.02), t, stop, rm.gain);
    const clean = v.gain(0.35, srcDest);
    srcDest = v.gain(1, rm);
    srcDest.connect(clean);
  }
  if (P.fry) {
    const fry = v.gain(0.6, srcDest);
    v.osc('square', P.fry, t, stop, v.gain(0.4, fry.gain));
    srcDest = fry;
  }
  const o = v.osc(P.wave, f0, t, stop, srcDest);
  const b = P.bounce;
  if (tone === 'sac') env(o.frequency, t, [[0, f0 * (1.03 + b * 0.3)], [len, f0 * (1.17 + b * 0.5)]]);
  else if (tone === 'huyen') env(o.frequency, t, [[0, f0 * 0.95], [len, f0 * 0.85]]);
  else if (tone === 'hoi') env(o.frequency, t, [[0, f0 * 0.98], [len * 0.55, f0 * 0.86], [len, f0 * 0.95]]);
  else if (tone === 'nga') env(o.frequency, t, [[0, f0 * 1.02], [len * 0.4, f0 * 0.95, 'l'], [len * 0.5, f0 * 1.08, 'l'], [len, f0 * (1.2 + b * 0.5)]]);
  else if (tone === 'nang') env(o.frequency, t, [[0, f0 * 0.92], [len, f0 * 0.78]]);
  else if (L && isVowel) env(o.frequency, t, [[0, f0 * (1 + b * 0.4)], [len, f0 * 0.98]]);  // level (ngang)
  else if (contour === 0) env(o.frequency, t, [[0, f0 * (1 + b)], [len * 0.4, f0], [len, f0 * 0.97]]);
  else if (contour === 1) env(o.frequency, t, [[0, f0 * 0.92], [len, f0 * (1.06 + b * 0.5)]]);
  else if (contour === 2) env(o.frequency, t, [[0, f0 * (1.08 + b * 0.5)], [len, f0 * 0.9]]);
  else env(o.frequency, t, [[0, f0 * 0.95], [len * 0.45, f0 * (1.07 + b)], [len, f0 * 0.93]]);
  if (P.vib) v.osc('sine', P.vib[0], t, stop, v.gain(f0 * P.vib[1], o.frequency));
  if (P.noise) v.noise('white', t, stop, v.gain(P.noise, mix));
  // Thời Ảnh: buzzing, slightly detuned octave on top of the ring-mod radio.
  if (P.buzz) v.osc('square', f0 * 2.01, t, stop, v.gain(P.buzz, srcDest));
  if (glitchy) {
    // Sample-and-hold pitch jump after the stutter plus a short bit-noise burst.
    const jump = [1.5, 0.67, 2, 1.26][(h >>> 12) & 3];
    o.frequency.cancelScheduledValues(t + len * 0.45);
    o.frequency.setValueAtTime(f0 * jump, t + len * 0.45);
    const bz = v.gain(0, srcDest);
    perc(bz.gain, t + len * 0.3, 0.25, 0.001, 0.03);
    v.noise('crackle', t + len * 0.3, t + len * 0.3 + 0.04, v.filter('bandpass', 2400, 1.2, bz), 2);
  }
}

// -----------------------------------------------------------------------------
// 9. Music instruments
// -----------------------------------------------------------------------------
// Instruments are functions (player, time, event). Each note is a Voice in
// musicPool routed into the song's instrument buses (see SongPlayer).

// ADSR on a gain param (setTarget based; robust for any note length).
function adsr(p, t, dur, a, dc, s, r, peak) {
  a = Math.min(a, dur * 0.5);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * s, t + a, Math.max(0.005, dc / 3));
  p.setTargetAtTime(0, t + dur, Math.max(0.005, r / 5));
  return t + dur + r * 1.25;
}
// Rise-then-settle filter envelope.
function fenv(p, t, lo, hi, sus, a, dc) {
  p.setValueAtTime(lo, t);
  p.linearRampToValueAtTime(hi, t + a);
  p.setTargetAtTime(sus, t + a, Math.max(0.005, dc / 3));
}
const cap = (f) => Math.min(f, 16000);

// Vietnamese ornaments on an oscillator's detune (cents), from melody suffixes:
//   '*' láy  — grace note a whole tone above that snaps onto the pitch,
//   '^' nhấn — press the string: rise a whole tone, hold, fall back (luyến),
//   '_' rơi  — sighing droop at the end of the note (into the release).
// base = the oscillator's static detune. Times stay strictly increasing.
function ornament(p, t, d, e, base = 0, depth = 1) {
  if (!e.orn && !e.bu && !e.bd) return;
  p.setValueAtTime(base + (e.orn ? 200 * depth : 0), t);
  let tt = t;
  if (e.orn) { tt = t + Math.min(0.07, d * 0.3); p.linearRampToValueAtTime(base, tt); }
  if (e.bu && d > 0.12) {
    const a = Math.max(tt + 0.01, t + d * 0.3), b = Math.max(a + 0.04, t + d * 0.5);
    const c = Math.max(b + 0.02, t + d * 0.68), z = Math.max(c + 0.05, t + d * 0.9);
    p.setValueAtTime(base, a);
    p.linearRampToValueAtTime(base + 200 * depth, b);
    p.setValueAtTime(base + 200 * depth, c);
    p.linearRampToValueAtTime(base, z);
    tt = z;
  }
  if (e.bd && d > 0.12) {
    const a = Math.max(tt + 0.01, t + d * 0.6);
    p.setValueAtTime(base, a);
    p.linearRampToValueAtTime(base - 170 * depth, Math.max(a + 0.05, t + d + 0.12));
  }
}

const INST = {
  // Lead brass: three detuned saws, filter envelope, scoop/glide, delayed vibrato.
  lead(sp, t, e) {
    const f = mtof(e.n), d = e.d, vel = e.v;
    const v = new Voice(musicPool, sp.bus.lead, t, 1);
    const amp = v.gain(0);
    const end = adsr(amp.gain, t, d, 0.03, 0.3, 0.78, 0.16, 0.13 * vel);
    const lpf = v.filter('lowpass', f * 2, 1.6, amp);
    fenv(lpf.frequency, t, cap(f * 1.3), cap(f * (4.5 + 3 * vel) + 400), cap(f * 3 + 300), 0.05, 0.35);
    const vib = d > 0.32 ? v.keep(mkGain(0)) : null;
    if (vib) {
      env(vib.gain, t, [[0, 0], [0.26, 0, 'l'], [0.6, 13, 'l']]);
      v.osc('sine', 5.4, t, end, vib);
    }
    for (const [det, type, lvl] of [[-8, 'sawtooth', 1], [0, 'sawtooth', 1], [8, 'sawtooth', 1], [-1200, 'triangle', 0.6]]) {
      const o = v.osc(type, f, t, end, lvl === 1 ? lpf : v.gain(lvl, lpf), det);
      const from = e.g ? mtof(e.g) : f * 0.985;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(f, t + (e.g ? 0.07 : 0.035));
      if (vib) vib.connect(o.detune);
    }
  },

  // Gentle lead (flute/ocarina-like) for calm cues.
  soft(sp, t, e) {
    const f = mtof(e.n), d = e.d, vel = e.v;
    const v = new Voice(musicPool, sp.bus.lead, t, 1);
    const amp = v.gain(0);
    const end = adsr(amp.gain, t, d, 0.07, 0.4, 0.8, 0.45, 0.16 * vel);
    const lpf = v.filter('lowpass', cap(f * 4), 0.8, amp);
    const vib = v.keep(mkGain(0));
    env(vib.gain, t, [[0, 0], [0.2, 0, 'l'], [0.55, 12, 'l']]);
    v.osc('sine', 5, t, end, vib);
    for (const [type, lvl, mul] of [['triangle', 1, 1], ['sine', 0.5, 2], ['sawtooth', 0.12, 1]]) {
      const o = v.osc(type, f * mul, t, end, v.gain(lvl, lpf));
      if (e.g) { o.frequency.setValueAtTime(mtof(e.g) * mul, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.09); }
      vib.connect(o.detune);
    }
    v.noise('white', t, t + 0.08, v.filter('bandpass', cap(f * 3), 2, v.gain(0.015 * vel, amp)));
  },

  // Synth-strings pad: two detuned saws per note spread hard L/R.
  pad(sp, t, e) {
    const d = e.d, vel = e.v, ns = e.ns;
    const v = new Voice(musicPool, sp.bus.pad, t, 1);
    const amp = v.gain(0);
    const att = e.sw ? d * 0.85 : (e.a || 0.35);
    const end = adsr(amp.gain, t, d, att, 0.6, 0.85, e.r || 0.9, 0.066 * vel * (4 / Math.max(3, ns.length)));
    const merge = v.keep(ctx.createChannelMerger(2));
    merge.connect(amp);
    const bright = e.sw ? 1 : 0;
    const fl = v.keep(mkFilter('lowpass', 1800, 0.5));
    const fr = v.keep(mkFilter('lowpass', 1800, 0.5));
    fl.connect(merge, 0, 0);
    fr.connect(merge, 0, 1);
    for (const fp of [fl.frequency, fr.frequency]) {
      if (bright) env(fp, t, [[0, 700], [d, 3200]]);
      else { fp.setValueAtTime(1100, t); fp.linearRampToValueAtTime(2100 + 900 * vel, t + att + 0.2); }
    }
    const lfo = v.keep(mkGain(4));
    v.osc('sine', 4.7, t, end, lfo);
    for (const m of ns) {
      const f = mtof(m);
      const a = v.osc('sawtooth', f, t, end, fl, -9);
      const b = v.osc('sawtooth', f, t, end, fr, 9);
      lfo.connect(a.detune);
    }
  },

  // Brass stab chord: short, bright, punchy.
  stab(sp, t, e) {
    const d = e.d, vel = e.v, ns = e.ns;
    const v = new Voice(musicPool, sp.bus.brass, t, 1);
    const amp = v.gain(0);
    const end = adsr(amp.gain, t, d, 0.008, 0.14, 0.55, 0.12, 0.09 * vel * (3 / Math.max(3, ns.length)));
    const lpf = v.filter('lowpass', 1000, 1.2, amp);
    fenv(lpf.frequency, t, 700, 2600 + 2400 * vel, 1400, 0.02, 0.2);
    for (const m of ns) {
      const f = mtof(m);
      v.osc('sawtooth', f, t, end, lpf, -7);
      v.osc('sawtooth', f, t, end, lpf, 7);
    }
  },

  // Pluck / arpeggio.
  pluck(sp, t, e) {
    const f = mtof(e.n), vel = e.v;
    const v = new Voice(musicPool, sp.bus.arp, t, 1, e.pan || 0);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, 0.1 * vel, 0.002, 0.2 + Math.min(0.2, e.d));
    const lpf = v.filter('lowpass', 3000, 3, amp);
    fenv(lpf.frequency, t, cap(f * 8), cap(f * 8), cap(f * 1.6 + 300), 0.001, 0.12);
    v.osc('square', f, t, end, lpf);
    v.osc('sawtooth', f * 2, t, end, v.gain(0.3, lpf), 5);
  },

  // FM bell (sparkle arps, results screen).
  bell(sp, t, e) {
    const f = mtof(e.n), vel = e.v;
    const v = new Voice(musicPool, sp.bus.arp, t, 1, e.pan || 0);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, 0.1 * vel, 0.002, 1.1);
    const o = v.osc('sine', f, t, end, amp);
    const mg = v.gain(0, o.frequency);
    env(mg.gain, t, [[0, f * 1.6], [0.6, f * 0.1]]);
    v.osc('sine', f * 3.5, t, end, mg);
    v.osc('sine', f * 2, t, t + 0.4, v.gain(0.2, amp));
  },

  // Đàn tranh (16-string zither): bright attack that darkens fast, a tiny
  // pitch settle after the pluck, '~' slides from the previous note, left-hand
  // vibrato ("rung") on long notes and the ornaments (nhấn '^', láy '*', rơi
  // '_'). Arp events (which carry a pan) go to the arp bus, lines to lead.
  zither(sp, t, e) {
    const f = mtof(e.n), d = e.d, vel = e.v;
    const v = new Voice(musicPool, e.pan !== undefined ? sp.bus.arp : sp.bus.lead, t, 1, e.pan || 0);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, 0.12 * vel, 0.002, 0.3 + Math.min(0.9, d * 1.3));
    const lpf = v.filter('lowpass', cap(f * 8), 1.3, amp);
    fenv(lpf.frequency, t, cap(f * 9 + 1500), cap(f * 9 + 1500), cap(f * 2 + 500), 0.001, 0.22);
    const vib = d > 0.3 ? v.keep(mkGain(0)) : null;
    if (vib) {
      env(vib.gain, t, [[0, 0], [0.14, 0, 'l'], [0.45, 24, 'l']]);
      v.osc('sine', 5.6, t, end, vib);
    }
    for (const [type, mul, lvl] of [['triangle', 1, 1], ['sawtooth', 1, 0.32], ['sine', 2, 0.28]]) {
      const o = v.osc(type, f * mul, t, end, lvl === 1 ? lpf : v.gain(lvl, lpf));
      if (e.g) { o.frequency.setValueAtTime(mtof(e.g) * mul, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.08); }
      else { o.frequency.setValueAtTime(f * mul * 1.012, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.03); }
      ornament(o.detune, t, d, e);
      if (vib) vib.connect(o.detune);
    }
  },

  // Đàn nhị (two-string fiddle, erhu-like): nasal formant, early wide
  // vibrato, long portamento on '~' slides, ornaments and a breath of bow noise.
  erhu(sp, t, e) {
    const f = mtof(e.n), d = e.d, vel = e.v;
    const v = new Voice(musicPool, sp.bus.lead, t, 1);
    const amp = v.gain(0);
    const end = adsr(amp.gain, t, d, 0.045, 0.3, 0.86, 0.2, 0.1 * vel);
    const body = v.filter('peaking', cap(f * 2.2 + 600), 1.2, amp, 5);
    const lpf = v.filter('lowpass', cap(f * 5 + 900), 0.9, body);
    const vib = v.keep(mkGain(0));
    const vd = Math.min(0.14, d * 0.3);
    env(vib.gain, t, [[0, 0], [vd, 0, 'l'], [vd + 0.35, d > 0.25 ? 24 : 8, 'l']]);
    v.osc('sine', 5.8, t, end, vib);
    const from = e.g ? mtof(e.g) : f * 0.975;
    const gt = e.g ? 0.13 : 0.04;
    for (const [type, det, lvl] of [['sawtooth', -6, 1], ['sawtooth', 6, 0.8], ['triangle', 0, 0.6]]) {
      const o = v.osc(type, f, t, end, v.gain(lvl, lpf), det);
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(f, t + gt);
      ornament(o.detune, t, d, e, det);
      vib.connect(o.detune);
    }
    v.noise('white', t, t + Math.min(d, 0.2) + 0.05, v.filter('bandpass', cap(f * 4), 1.5, v.gain(0.018 * vel, amp)));
  },

  // Punchy bass: saw + sine sub, resonant filter envelope (bus adds drive).
  bass(sp, t, e) {
    const f = mtof(e.n), d = e.d, vel = e.v;
    const v = new Voice(musicPool, sp.bus.bass, t, 1);
    const amp = v.gain(0);
    const end = adsr(amp.gain, t, d, 0.004, 0.18, 0.72, 0.05, 0.2 * vel);
    const lpf = v.filter('lowpass', 400, 5, amp);
    fenv(lpf.frequency, t, cap(f * 2), cap(260 + f * 2 + 1700 * vel), cap(f * 2.2 + 140), 0.006, 0.16);
    v.osc('sawtooth', f, t, end, lpf);
    v.osc('square', f * 0.5, t, end, v.gain(0.25, lpf));
    v.osc('sine', f, t, end, v.gain(0.8, amp));
  },

  kick(sp, t, e) {
    const vel = e.v;
    const v = new Voice(musicPool, sp.bus.drums, t, 1);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, 0.55 * vel, 0.001, 0.34);
    const o = v.osc('sine', 165, t, end, amp);
    env(o.frequency, t, [[0, 170], [0.03, 90], [0.14, 46]]);
    const knock = v.osc('triangle', 300, t, t + 0.03, v.gain(0.35, amp));
    knock.frequency.setValueAtTime(300, t);
    knock.frequency.exponentialRampToValueAtTime(90, t + 0.025);
    const ck = v.gain(0);
    perc(ck.gain, t, 0.22 * vel, 0.0005, 0.012);
    v.noise('white', t, t + 0.03, v.filter('bandpass', 3500, 0.9, ck));
  },

  snare(sp, t, e) {
    const vel = e.v;
    const v = new Voice(musicPool, sp.bus.drums, t, 1);
    v.send(sp.rev, 0.14);
    const nz = v.gain(0);
    const end = perc(nz.gain, t, 0.3 * vel, 0.001, 0.17);
    v.noise('white', t, end, v.filter('highpass', 900, 0.7, v.filter('peaking', 3200, 0.8, nz, 5)));
    const body = v.gain(0);
    perc(body.gain, t, 0.26 * vel, 0.001, 0.08);
    const o = v.osc('triangle', 195, t, t + 0.12, body);
    o.frequency.setValueAtTime(195, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.05);
    const b2 = v.gain(0);
    perc(b2.gain, t, 0.1 * vel, 0.001, 0.05);
    v.osc('sine', 330, t, t + 0.08, b2);
  },

  hat(sp, t, e) {
    const vel = e.v, open = !!e.open;
    const v = new Voice(musicPool, sp.bus.drums, t, 1, 0.22);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, (open ? 0.1 : 0.085) * vel, 0.001, open ? 0.24 : 0.04);
    const hp = v.filter('highpass', 7000, 0.7, v.filter('peaking', 10500, 1, amp, 4));
    v.noise('metal', t, end, hp);
    v.noise('white', t, end, v.gain(0.35, hp));
  },

  crash(sp, t, e) {
    const vel = e.v;
    const v = new Voice(musicPool, sp.bus.drums, t, 1);
    v.send(sp.rev, 0.2);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, 0.14 * vel, 0.002, 1.7);
    const hp = v.filter('highpass', 4200, 0.6, amp);
    v.noise('metal', t, end, hp, 0.9);
    v.noise('white', t, end, v.gain(0.7, v.filter('highpass', 6000, 0.6, amp)));
  },

  // Reverse-cymbal swell that lands on the next downbeat.
  swell(sp, t, e) {
    const d = e.d, vel = e.v;
    const v = new Voice(musicPool, sp.bus.drums, t, 1);
    v.send(sp.rev, 0.3);
    const amp = v.gain(0);
    env(amp.gain, t, [[0, EPS], [d, 0.14 * vel], [d + 0.03, EPS]]);
    const hp = v.filter('highpass', 2500, 0.7, amp);
    const lpf = v.filter('lowpass', 2000, 0.7, hp);
    env(lpf.frequency, t, [[0, 1500], [d, 14000]]);
    v.noise('white', t, t + d + 0.05, lpf);
    v.noise('metal', t, t + d + 0.05, v.gain(0.5, lpf));
  },

  tom(sp, t, e) {
    const vel = e.v, k = e.k || 2;
    const base = [0, 200, 150, 108, 80][k] || 150;
    const v = new Voice(musicPool, sp.bus.drums, t, 1, (k - 2) * 0.3);
    v.send(sp.rev, 0.12);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, 0.38 * vel, 0.001, 0.36);
    const o = v.osc('sine', base, t, end, amp);
    env(o.frequency, t, [[0, base], [0.28, base * 0.62]]);
    const o2 = v.osc('triangle', base * 1.5, t, t + 0.1, v.gain(0.3, amp));
    env(o2.frequency, t, [[0, base * 1.5], [0.08, base]]);
    const ck = v.gain(0);
    perc(ck.gain, t, 0.1 * vel, 0.0005, 0.03);
    v.noise('white', t, t + 0.05, v.filter('lowpass', 3000, 0.7, ck));
  },

  // Orchestral timpani: inharmonic membrane partials + mallet thump.
  timp(sp, t, e) {
    const f = mtof(e.n), vel = e.v;
    const v = new Voice(musicPool, sp.bus.timp, t, 1);
    const amp = v.gain(1);
    let end = t;
    const dm = e.roll ? 0.3 : 1;
    [[1, 0.22, 1.5 * dm], [1.5, 0.1, 1.0 * dm], [1.98, 0.05, 0.7 * dm], [2.44, 0.025, 0.45 * dm]].forEach(([r, a, d]) => {
      const g = v.gain(0, amp);
      end = Math.max(end, perc(g.gain, t, a * vel, 0.003, d));
      const o = v.osc('sine', f * r, t, t + d + 0.05, g);
      o.frequency.setValueAtTime(f * r * 1.025, t);
      o.frequency.exponentialRampToValueAtTime(f * r, t + 0.06);
    });
    const th = v.gain(0, amp);
    perc(th.gain, t, 0.13 * vel, 0.001, 0.06);
    v.noise('pink', t, t + 0.1, v.filter('lowpass', 900, 0.7, th));
  },

  // --- LẠC HỒNG instruments ---------------------------------------------------
  // Sáo trúc (bamboo flute): sine/triangle core, a sustained breath band that
  // follows the pitch, an attack chiff, delayed vibrato and the ornaments.
  sao(sp, t, e) {
    const f = mtof(e.n), d = e.d, vel = e.v;
    const v = new Voice(musicPool, sp.bus.lead, t, 1);
    const amp = v.gain(0);
    const end = adsr(amp.gain, t, d, 0.035, 0.3, 0.84, 0.22, 0.12 * vel);
    const lpf = v.filter('lowpass', cap(f * 5 + 600), 0.7, amp);
    const vib = v.keep(mkGain(0));
    const vd = Math.min(0.25, d * 0.4);
    env(vib.gain, t, [[0, 0], [vd, 0, 'l'], [vd + 0.4, d > 0.3 ? 15 : 4, 'l']]);
    v.osc('sine', 5.3, t, end, vib);
    for (const [type, mul, lvl] of [['sine', 1, 1], ['triangle', 1, 0.45], ['sine', 2, 0.15], ['sine', 3, 0.05]]) {
      const o = v.osc(type, f * mul, t, end, v.gain(lvl, lpf));
      if (e.g) { o.frequency.setValueAtTime(mtof(e.g) * mul, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.07); }
      ornament(o.detune, t, d, e);
      vib.connect(o.detune);
    }
    const br = v.gain(0, amp);
    adsr(br.gain, t, d, 0.02, 0.2, 0.5, 0.15, 0.07 * vel);
    v.noise('white', t, end, v.filter('bandpass', cap(f * 2), 2.4, br));
    const ch = v.gain(0, amp);
    perc(ch.gain, t, 0.07 * vel, 0.004, 0.05);
    v.noise('white', t, t + 0.08, v.filter('bandpass', cap(f * 4), 1.2, ch));
  },

  // Đàn bầu (monochord played on harmonics): an almost pure, singing tone
  // with a soft pluck, a slowly fading sustain, the whammy-rod vibrato that
  // widens over long notes, a scoop into every note, long '~' portamento and
  // deep bends (nhấn '^' / rơi '_' / láy '*').
  bau(sp, t, e) {
    const f = mtof(e.n), d = e.d, vel = e.v;
    const v = new Voice(musicPool, sp.bus.lead, t, 1);
    const amp = v.gain(0);
    const pk = 0.155 * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(pk, t + 0.006);
    amp.gain.setTargetAtTime(pk * 0.62, t + 0.006, 0.07);
    amp.gain.setTargetAtTime(pk * 0.3, t + Math.min(0.3, d * 0.5), 1.4);
    amp.gain.setTargetAtTime(0, t + d, 0.08);
    const end = t + d + 0.45;
    const lpf = v.filter('lowpass', cap(f * 6 + 300), 0.7, amp);
    const vib = v.keep(mkGain(0));
    const vd = Math.min(0.2, d * 0.35);
    env(vib.gain, t, [[0, 0], [vd, 0, 'l'], [vd + 0.3, d > 0.35 ? 22 : 6, 'l'], [Math.max(vd + 0.31, d), d > 0.35 ? 42 : 8, 'l']]);
    v.osc('sine', 4.7, t, end, vib);
    for (const [type, mul, lvl] of [['sine', 1, 1], ['triangle', 1, 0.3], ['sine', 2, 0.2], ['sine', 3, 0.06]]) {
      const o = v.osc(type, f * mul, t, end, v.gain(lvl, lpf));
      if (e.g) { o.frequency.setValueAtTime(mtof(e.g) * mul, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.2); }
      else if (!e.orn) { o.frequency.setValueAtTime(f * mul * 0.972, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.07); }
      ornament(o.detune, t, d, e);
      vib.connect(o.detune);
    }
    // pluck: a bright saw blip and a little string noise
    const pl = v.gain(0, lpf);
    perc(pl.gain, t, 0.35, 0.002, 0.05);
    v.osc('sawtooth', f, t, t + 0.08, pl);
    const nz = v.gain(0, amp);
    perc(nz.gain, t, 0.05 * vel, 0.001, 0.03);
    v.noise('white', t, t + 0.05, v.filter('bandpass', cap(f * 3), 1.5, nz));
  },

  // Kèn bầu (Huế court shawm): saw + square double reed through two nasal
  // formants and soft saturation; scoop, slow pitch wander, vibrato.
  ken(sp, t, e) {
    const f = mtof(e.n), d = e.d, vel = e.v;
    const v = new Voice(musicPool, sp.bus.lead, t, 1);
    const amp = v.gain(0);
    const end = adsr(amp.gain, t, d, 0.025, 0.25, 0.9, 0.12, 0.078 * vel);
    const hp = v.filter('highpass', 280, 0.7, amp);
    const f2 = v.filter('peaking', 2750, 2.5, hp, 6);
    const f1 = v.filter('peaking', 1250, 1.6, f2, 8);
    const lpf = v.filter('lowpass', 5200, 0.8, f1);
    const sh = v.shaper(1.6, lpf);
    const vib = v.keep(mkGain(0));
    env(vib.gain, t, [[0, 0], [0.12, 0, 'l'], [0.45, d > 0.3 ? 22 : 6, 'l']]);
    v.osc('sine', 6.1, t, end, vib);
    const wob = v.keep(mkGain(7));
    v.osc('sine', 0.8 + (e.n % 5) * 0.13, t, end, wob);
    for (const [type, det, lvl] of [['sawtooth', -5, 1], ['square', 4, 0.5]]) {
      const o = v.osc(type, f, t, end, v.gain(lvl, sh), det);
      if (e.g) { o.frequency.setValueAtTime(mtof(e.g), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.1); }
      else if (!e.orn) { o.frequency.setValueAtTime(f * 0.965, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
      ornament(o.detune, t, d, e, det);
      vib.connect(o.detune);
      wob.connect(o.detune);
    }
    v.noise('white', t, end, v.filter('bandpass', cap(f * 3), 1.2, v.gain(0.012 * vel, amp)));
  },

  // Khèn (free-reed mouth organ): reedy square/saw pairs through one shared
  // reed formant with a breathing tremolo. Chords (padInst: 'khen') go to the
  // pad bus; single notes (leadInst/counterInst) make a drone line.
  khen(sp, t, e) {
    const d = e.d, vel = e.v, chord = !!e.ns, ns = e.ns || [e.n];
    const v = new Voice(musicPool, chord ? sp.bus.pad : sp.bus.lead, t, 1);
    const amp = v.gain(0);
    const att = e.sw ? d * 0.8 : (e.a || (chord ? 0.18 : 0.06));
    const end = adsr(amp.gain, t, d, att, 0.5, 0.9, e.r || (chord ? 0.4 : 0.2),
      0.06 * vel * (3 / Math.max(3, ns.length)) * (chord ? 1 : 1.5));
    const trem = v.gain(1, amp);
    const tl = v.keep(mkGain(0.13));
    tl.connect(trem.gain);
    v.osc('sine', 5.4 + (ns[0] % 3) * 0.2, t, end, tl);
    const pk = v.filter('peaking', 1500, 1.4, trem, 6);
    const lpf = v.filter('lowpass', 2700, 0.6, pk);
    for (const m of ns) {
      const f = mtof(m);
      v.osc('square', f, t, end, v.gain(0.55, lpf), -3);
      const o = v.osc('sawtooth', f, t, end, v.gain(0.5, lpf), 4);
      if (!chord && e.g) { o.frequency.setValueAtTime(mtof(e.g), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); }
    }
    v.noise('pink', t, Math.min(end, t + d + 0.1), v.filter('bandpass', 2400, 0.9, v.gain(0.03 * vel, amp)));
  },

  // Đàn nguyệt (moon lute): plectrum pluck, warm wooden body, fast-darkening
  // tone, "rung" vibrato on long notes and deep fret bends (ornaments).
  nguyet(sp, t, e) {
    const f = mtof(e.n), d = e.d, vel = e.v;
    const v = new Voice(musicPool, e.pan !== undefined ? sp.bus.arp : sp.bus.lead, t, 1, e.pan || 0);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, 0.1 * vel, 0.002, 0.22 + Math.min(0.75, d * 1.1));
    const body = v.filter('peaking', 650, 1.2, amp, 5);
    const lpf = v.filter('lowpass', cap(f * 6), 1.1, body);
    fenv(lpf.frequency, t, cap(f * 10 + 2000), cap(f * 10 + 2000), cap(f * 2.2 + 400), 0.001, 0.12);
    const vib = d > 0.3 ? v.keep(mkGain(0)) : null;
    if (vib) {
      env(vib.gain, t, [[0, 0], [0.12, 0, 'l'], [0.4, 20, 'l']]);
      v.osc('sine', 6, t, end, vib);
    }
    for (const [type, mul, lvl] of [['triangle', 1, 1], ['sawtooth', 1, 0.45], ['square', 2, 0.07]]) {
      const o = v.osc(type, f * mul, t, end, lvl === 1 ? lpf : v.gain(lvl, lpf));
      if (e.g) { o.frequency.setValueAtTime(mtof(e.g) * mul, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.07); }
      else { o.frequency.setValueAtTime(f * mul * 1.01, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.025); }
      ornament(o.detune, t, d, e);
      if (vib) vib.connect(o.detune);
    }
    const pc = v.gain(0, amp);
    perc(pc.gain, t, 0.05 * vel, 0.0005, 0.012);
    v.noise('white', t, t + 0.03, v.filter('bandpass', 3000, 1.2, pc));
  },

  // Crossbow-like pluck (nỏ thần): a taut string with a sharp pitch snap, a
  // dark body thump and a whip of string noise. Arp instrument.
  twang(sp, t, e) {
    const f = mtof(e.n), vel = e.v;
    const v = new Voice(musicPool, sp.bus.arp, t, 1, e.pan || 0);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, 0.16 * vel, 0.001, 0.16 + Math.min(0.12, e.d * 0.5));
    const lpf = v.filter('lowpass', 3000, 4, amp);
    fenv(lpf.frequency, t, cap(f * 12), cap(f * 12), cap(f * 1.8 + 200), 0.001, 0.07);
    const o = v.osc('sawtooth', f, t, end, lpf);
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.018);
    v.osc('square', f * 0.5, t, end, v.gain(0.3, lpf));
    const wh = v.gain(0);
    perc(wh.gain, t, 0.06 * vel, 0.001, 0.035);
    v.noise('white', t, t + 0.05, v.filter('highpass', 2500, 0.7, wh));
  },

  // Đàn đá (stone lithophone): inharmonic stone-bar modes that die quickly,
  // plus a dull mallet knock.
  da(sp, t, e) {
    const f = mtof(e.n), vel = e.v;
    const v = new Voice(musicPool, e.pan !== undefined ? sp.bus.arp : sp.bus.lead, t, 1, e.pan || 0);
    v.send(sp.rev, 0.12);
    const amp = v.gain(1);
    let end = t;
    for (const [r, a, dd] of [[1, 0.17, 0.6], [2.76, 0.055, 0.2], [5.4, 0.025, 0.08], [8.93, 0.012, 0.04]]) {
      const g = v.gain(0, amp);
      end = Math.max(end, perc(g.gain, t, a * vel, 0.001, dd));
      v.osc('sine', cap(f * r), t, t + dd + 0.02, g);
    }
    const kn = v.gain(0, amp);
    perc(kn.gain, t, 0.08 * vel, 0.0005, 0.015);
    v.noise('pink', t, t + 0.03, v.filter('lowpass', 2500, 0.7, kn));
  },

  // Trống đồng (Đông Sơn bronze drum): a deep "boong" with a pitch settle and
  // a long, slowly beating ring of inharmonic bronze modes tuned to the chord
  // root (e.n). k = 2 strikes the rim: brighter, shorter, no boom.
  bronze(sp, t, e) {
    const vel = e.v, rim = e.k === 2;
    const v = new Voice(musicPool, sp.bus.drums, t, 1, rim ? 0.18 : -0.06);
    v.send(sp.rev, rim ? 0.22 : 0.32);
    const amp = v.gain(1);
    let end = t;
    if (!rim) {
      const bg = v.gain(0, amp);
      end = perc(bg.gain, t, 0.36 * vel, 0.002, 0.65);
      const o = v.osc('sine', 92, t, end + 0.02, bg);
      env(o.frequency, t, [[0, 130], [0.04, 96], [0.6, 82]]);
    }
    const base = (e.n ? mtof(e.n) : 168) * (rim ? 1.5 : 1);
    const modes = [[1, 0.09, 2.1], [1.007, 0.06, 1.9], [1.59, 0.06, 1.5], [2.25, 0.045, 1.1], [2.93, 0.03, 0.8], [3.72, 0.02, 0.55], [4.61, 0.014, 0.35]];
    for (const [r, a, dd] of modes) {
      const g = v.gain(0, amp);
      const len = dd * (rim ? 0.55 : 1);
      end = Math.max(end, perc(g.gain, t, a * vel * (rim ? 1.05 : 0.85), 0.002, len));
      v.osc('sine', cap(base * r), t, t + len + 0.03, g);
    }
    const ck = v.gain(0, amp);
    perc(ck.gain, t, (rim ? 0.2 : 0.12) * vel, 0.0005, 0.03);
    v.noise('white', t, t + 0.05, v.filter('bandpass', rim ? 3800 : 2200, 1, ck));
  },

  // Cồng / chiêng (gong) tuned to the chord root (e.n). Big gong: high modes
  // bloom in after the strike and the pitch sags slightly ("wah"), with a
  // shimmer of noise. k = 1: small nipple gong (chiêng) — tonal and short.
  gong(sp, t, e) {
    const vel = e.v, small = e.k === 1;
    const f = e.n ? mtof(e.n) : (small ? 330 : 82);
    const v = new Voice(musicPool, sp.bus.drums, t, 1, small ? 0.25 : -0.15);
    v.send(sp.rev, small ? 0.3 : 0.45);
    const amp = v.gain(1);
    let end = t;
    const L = small ? 1.3 : 3.2;
    const modes = small
      ? [[1, 0.15, 1], [2.0, 0.035, 0.6], [2.98, 0.02, 0.4], [4.1, 0.01, 0.25]]
      : [[1, 0.17, 1], [1.5, 0.045, 0.6], [2.31, 0.06, 0.75], [2.98, 0.04, 0.5], [4.12, 0.028, 0.4], [5.6, 0.018, 0.3]];
    modes.forEach(([r, a, k], i) => {
      const g = v.gain(0, amp);
      const dd = L * k;
      const at = small ? 0.003 : 0.004 + i * 0.035;
      end = Math.max(end, perc(g.gain, t, a * vel, at, dd));
      const o = v.osc('sine', cap(f * r), t, t + at + dd + 0.03, g);
      if (!small) { o.frequency.setValueAtTime(cap(f * r * 1.012), t); o.frequency.exponentialRampToValueAtTime(cap(f * r), t + 0.7); }
    });
    const th = v.gain(0, amp);
    perc(th.gain, t, (small ? 0.06 : 0.14) * vel, 0.001, 0.08);
    v.noise('pink', t, t + 0.12, v.filter('lowpass', small ? 1800 : 600, 0.7, th));
    if (!small) {
      const sh = v.gain(0, amp);
      env(sh.gain, t, [[0, 0], [0.35, 0.02 * vel, 'l'], [L * 0.6, EPS]]);
      v.noise('white', t, t + L * 0.6 + 0.05, v.filter('bandpass', 1900, 2, sh));
    }
  },

  // Chuông chùa (temple bell) struck with a wooden log: hum, prime, minor
  // third, fifth and nominal partials with long, slightly beating decays.
  // Pitched to the chord root (e.n).
  chuong(sp, t, e) {
    const vel = e.v;
    const f = mtof(e.n || 60);
    const v = new Voice(musicPool, sp.bus.timp, t, 1, 0.12);
    v.send(sp.rev, 0.25);
    const amp = v.gain(1);
    let end = t;
    for (const [r, a, dd] of [[0.5, 0.07, 4.0], [1, 0.09, 3.2], [1.003, 0.05, 3.0], [1.19, 0.045, 2.2], [1.5, 0.03, 1.8], [2, 0.04, 1.5], [2.51, 0.02, 0.9], [3.01, 0.012, 0.6]]) {
      const g = v.gain(0, amp);
      end = Math.max(end, perc(g.gain, t, a * vel, 0.004, dd));
      v.osc('sine', cap(f * r), t, t + dd + 0.03, g);
    }
    const kn = v.gain(0, amp);
    perc(kn.gain, t, 0.06 * vel, 0.001, 0.05);
    v.noise('pink', t, t + 0.08, v.filter('lowpass', 900, 0.7, kn));
  },

  // Mõ & small percussion. k: 1 small wooden fish (high), 2 temple mõ (low),
  // 3 phách / sênh (bamboo clapper), 4 stone knock (Hồ citadel).
  mo(sp, t, e) {
    const vel = e.v, k = e.k || 1;
    const v = new Voice(musicPool, sp.bus.drums, t, 1, [0, 0.3, -0.25, 0.4, -0.1][k] || 0);
    v.send(sp.rev, 0.12);
    const amp = v.gain(0);
    if (k === 3) {
      const end = perc(amp.gain, t, 0.3 * vel, 0.0005, 0.035);
      v.noise('white', t, end, v.filter('bandpass', 2600, 2.5, amp));
      v.osc('triangle', 1900, t, t + 0.03, v.gain(0.35, amp));
      return;
    }
    if (k === 4) {
      const end = perc(amp.gain, t, 0.34 * vel, 0.001, 0.16);
      for (const [r, a] of [[1, 1], [2.43, 0.4], [3.9, 0.2]]) v.osc('sine', 300 * r, t, end, v.gain(a, amp));
      const kn = v.gain(0);
      perc(kn.gain, t, 0.2 * vel, 0.0005, 0.02);
      v.noise('brown', t, t + 0.04, v.filter('lowpass', 1500, 0.7, kn));
      return;
    }
    const f = k === 2 ? 520 : 1050;
    const end = perc(amp.gain, t, 0.3 * vel, 0.0008, k === 2 ? 0.16 : 0.09);
    const o = v.osc('sine', f, t, end, amp);
    o.frequency.setValueAtTime(f * 1.06, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.012);
    v.osc('sine', f * 2.7, t, t + 0.03, v.gain(0.25, amp));
    const ck = v.gain(0);
    perc(ck.gain, t, 0.1 * vel, 0.0005, 0.01);
    v.noise('white', t, t + 0.02, v.filter('bandpass', f * 3, 1.5, ck));
  },

  // Trống chiến (war drum / big barrel drum; taiko-like): deep membrane with a
  // fast pitch drop, a short overtone, a skin slap and a big-room send.
  // k = 1 small/high, 2 medium, 3 big (default).
  taiko(sp, t, e) {
    const vel = e.v, k = e.k || 3;
    const base = [0, 168, 106, 63][k] || 63;
    const v = new Voice(musicPool, sp.bus.drums, t, 1, (2 - k) * 0.22);
    v.send(sp.rev, 0.1 + k * 0.05);
    const amp = v.gain(0);
    const end = perc(amp.gain, t, 0.5 * vel, 0.002, 0.35 + k * 0.17);
    const o = v.osc('sine', base, t, end, amp);
    env(o.frequency, t, [[0, base * 1.7], [0.03, base * 1.08], [0.45, base * 0.86]]);
    const o2 = v.osc('triangle', base * 2.4, t, t + 0.14, v.gain(0.2, amp));
    env(o2.frequency, t, [[0, base * 2.9], [0.12, base * 2.1]]);
    const sk = v.gain(0);
    perc(sk.gain, t, 0.16 * vel, 0.001, 0.05);
    v.noise('pink', t, t + 0.08, v.filter('bandpass', 950 - k * 150, 0.8, sk));
  },

  // Choir "aah" (from PANDORA): detuned saw pairs summed into ONE shared vowel
  // formant bank; the vowel opens from "oo" to "aah" during the attack.
  // Chords (ns: padInst / choir layer) or single notes (n: lead/counter).
  choir(sp, t, e) {
    const d = e.d, vel = e.v, chord = !!e.ns, ns = e.ns || [e.n];
    const v = new Voice(musicPool, sp.bus.pad, t, 1);
    const amp = v.gain(0);
    const att = e.sw ? d * 0.8 : (e.a || (chord ? 0.4 : 0.09));
    const end = adsr(amp.gain, t, d, att, 0.7, 0.88, e.r || (chord ? 1.0 : 0.4),
      0.085 * vel * (3 / Math.max(3, ns.length)) * (chord ? 1 : 1.3));
    const mix = v.keep(mkGain(1));
    const hi = ns[ns.length - 1] > 72 ? 1.1 : 1;
    const open = Math.min(att, d * 0.5, 0.5) + 0.05;
    for (const [f0, f1, q, a] of [[330, 740, 5, 1], [820, 1120, 7, 0.55], [2300, 2650, 10, 0.28]]) {
      const bp = v.filter('bandpass', f0 * hi, q, v.gain(a * 2.4, amp));
      env(bp.frequency, t, [[0, f0 * hi], [open, f1 * hi]]);
      mix.connect(bp);
    }
    mix.connect(v.filter('lowpass', 480, 0.7, v.gain(0.35, amp)));
    const vib = v.keep(mkGain(0));
    env(vib.gain, t, [[0, 0], [0.25, 0, 'l'], [0.8, 10, 'l']]);
    v.osc('sine', 4.9, t, end, vib);
    for (const m of ns) {
      const f = mtof(m);
      for (const det of [-12, 11]) {
        const o = v.osc('sawtooth', f, t, end, mix, det);
        if (e.g) { o.frequency.setValueAtTime(mtof(e.g), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12); }
        vib.connect(o.detune);
      }
    }
    v.noise('pink', t, Math.min(end, t + d + 0.2), v.filter('bandpass', 3000, 0.9, v.gain(0.022 * vel, amp)));
  },
};

// -----------------------------------------------------------------------------
// 10. Music notation compiler
// -----------------------------------------------------------------------------
// Songs are written as compact text and compiled once into an array of
// 16th-note steps, each holding the events that start on it.
//
//  chords : one token per bar ("Em C D Em"); "G,A" splits a bar into halves,
//           four comma parts = one chord per beat; "%" repeats the previous chord.
//  melody : "E5:4 D5:2 r:2 F#5:4/3 ..." pitch+octave, ':' duration in 16ths
//           (sticky, fractions allowed for triplets). Suffix '~' glides from the
//           previous note, '>' accents, "'" plays staccato. 'r' is a rest.
//           Ornaments (sao/bau/ken/nguyet/zither/erhu): '*' láy (grace from a
//           tone above), '^' nhấn (bend up a tone and back), '_' rơi (droop).
//  pattern lists (bass/arp/stab/drums/timp): pattern names per bar, cycled;
//           '-' = nothing in that bar.
//  bass   : r/R root, o/O octave, 5 fifth, f fifth below, 3 third, 7 seventh,
//           b flat-2 (phrygian), p chromatic approach to the next chord, '-' tie
//  arp    : digits index into ascending chord tones, '-' tie, '.' rest
//  stab   : x/X chord stab, '-' extend
//  drums  : tracks k s h o c t(1-4) w(swell to bar end); X accent, x, o ghost;
//           d = trống chiến/taiko: X/x/o big drum, 1 small, 2 medium;
//           b = trống đồng (ring tuned to the chord root): X/x/o centre, 2 rim;
//           g = gong at the chord root: X/x/o big cồng, 1 small chiêng;
//           l = temple bell (chuông) at the chord root;
//           m = mõ: X/x/o or 1 small mõ, 2 temple mõ, 3 phách, 4 stone knock.
//           "<name>C" = the same groove with a crash on the downbeat (auto).
//  timp   : r/R root, 5 fifth, z = 32nd-note roll step (crescendos over a run)
//  section options: pad ('hold'|'swell') + padInst ('pad'|'choir'|'khen'),
//           choir (velocity of an extra voice-led choir layer, choirLo/Hi),
//           leadInst/counterInst/arpInst (any melodic INST), harm ('dia3' =
//           diatonic third below, 'oct', 'p4'/'p5' = parallel fourth/fifth
//           below — the archaic organum colour), bpm (per-section tempo).
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], aug: [0, 4, 8], add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14], 5: [0, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 9: [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14], '7sus4': [0, 5, 7, 10], dim7: [0, 3, 6, 9], '7b9': [0, 4, 7, 10, 13],
  maj9: [0, 4, 7, 11, 14], m7b5: [0, 3, 6, 10],
  // pentatonic / quartal colours: sus24 = root 2 4 5, q = stacked fourths
  sus24: [0, 2, 5, 7], q: [0, 5, 10], '6sus2': [0, 2, 7, 9],
};
const pcOf = (l, acc) => (PC[l] + (acc === '#' ? 1 : acc === 'b' ? 11 : 0)) % 12;

function parseChord(tok) {
  const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(tok);
  if (!m || !QUAL[m[3]]) throw new Error('bad chord ' + tok);
  const root = pcOf(m[1], m[2]);
  const iv = QUAL[m[3]];
  const pcs = [];
  for (const i of iv) { const p = (root + i) % 12; if (!pcs.includes(p)) pcs.push(p); }
  return { root, iv, pcs, bass: m[4] ? pcOf(m[4], m[5]) : root };
}

function parseDur(s) {
  if (s.includes('/')) { const [a, b] = s.split('/'); return +a / +b; }
  return +s;
}

function parseMelody(str) {
  const notes = [];
  let pos = 0, dur = 4, prev = null;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    const m = /^([A-Gr])([#b]?)(\d?)(?::([\d./]+))?([~>'^_*]*)$/.exec(tok);
    if (!m) throw new Error('bad note ' + tok);
    if (m[4]) dur = parseDur(m[4]);
    if (m[1] !== 'r') {
      const n = 12 * (+m[3] + 1) + pcOf(m[1], m[2]);
      notes.push({
        at: pos, n, d: dur, acc: m[5].includes('>'), stac: m[5].includes("'"), g: m[5].includes('~') ? prev : null,
        bu: m[5].includes('^'), bd: m[5].includes('_'), orn: m[5].includes('*'),
      });
      prev = n;
    } else prev = null;
    pos += dur;
  }
  return { notes, len: pos };
}

// Place pitch class pc nearest to `near`, clamped into [lo, hi].
function place(pc, near, lo, hi) {
  let best = null, bd = 1e9;
  for (let n = lo; n <= hi; n++) {
    if (n % 12 !== pc) continue;
    const d = Math.abs(n - near);
    if (d < bd) { bd = d; best = n; }
  }
  return best === null ? lo + ((pc - lo) % 12 + 12) % 12 : best;
}

// Voice-led chord voicing inside [lo, hi] (count = 3 or 4 notes).
function voiceChord(ch, prev, lo, hi, count) {
  const pcs = ch.pcs.slice(0, 4);
  let best = null, bs = 1e9;
  for (let k = 0; k < pcs.length; k++) {
    for (let base = lo; base < lo + 12; base++) {
      if (base % 12 !== pcs[k]) continue;
      const notes = [base];
      for (let j = 1; j < pcs.length; j++) {
        const pc = pcs[(k + j) % pcs.length];
        let n = notes[notes.length - 1] + 1;
        while (n % 12 !== pc) n++;
        notes.push(n);
      }
      while (notes.length < count) notes.push(notes[notes.length - pcs.length] + 12);
      notes.length = Math.min(notes.length, Math.max(count, 3));
      if (notes[notes.length - 1] > hi) continue;
      const center = notes.reduce((a, b) => a + b, 0) / notes.length;
      let score;
      if (prev) {
        const pc2 = prev.reduce((a, b) => a + b, 0) / prev.length;
        score = Math.abs(center - pc2) * 2;
        for (const n of notes) score += Math.min(...prev.map((p) => Math.abs(p - n))) * 0.5;
      } else score = Math.abs(center - (lo + hi) / 2);
      if (score < bs) { bs = score; best = notes; }
    }
  }
  return best || pcs.map((pc) => place(pc, (lo + hi) >> 1, lo, hi)).sort((a, b) => a - b);
}

function listFor(spec, bars) {
  if (!spec) return new Array(bars).fill('-');
  const toks = spec.trim().split(/\s+/);
  return Array.from({ length: bars }, (_, i) => toks[i % toks.length]);
}

function velOf(c) {
  return c === 'X' || c === 'R' || c === 'O' ? 1 : c === 'o' ? 0.45 : 0.8;
}

function compileSection(song, sec) {
  const bars = sec.bars, N = bars * 16;
  const steps = Array.from({ length: N }, () => []);
  const V = sec.vel || 1;
  const push = (at, ev) => {
    const s = Math.floor(at + 1e-6);
    if (s < 0 || s >= N) return;
    ev.off = Math.max(0, at - s);
    steps[s].push(ev);
  };

  // Chord timeline.
  const segs = [];
  let prevChord = null;
  listFor(sec.chords, bars).forEach((tok, b) => {
    const parts = tok.split(',');
    const len = 16 / parts.length;
    parts.forEach((p, i) => {
      const ch = p === '%' ? prevChord : parseChord(p);
      prevChord = ch;
      segs.push({ at: b * 16 + i * len, len, ch });
    });
  });
  const chordAt = (s) => { for (let i = segs.length - 1; i >= 0; i--) if (segs[i].at <= s) return segs[i]; return segs[0]; };
  const nextChordAfter = (s) => { for (const g of segs) if (g.at > s) return g.ch; return segs[0].ch; };

  // Pads and chord stabs (voice-led).
  let pv = null, sv = null;
  if (sec.pad) {
    for (const g of segs) {
      pv = voiceChord(g.ch, pv, sec.padLo || 55, sec.padHi || 79, 4);
      push(g.at, { i: sec.padInst || 'pad', ns: pv, d: g.len, v: (sec.padVel || 0.9) * V, sw: sec.pad === 'swell' });
    }
  }
  // Optional choir layer on top of the pad (its own voice leading, 3 voices).
  if (sec.choir) {
    let cv = null;
    for (const g of segs) {
      cv = voiceChord(g.ch, cv, sec.choirLo || 57, sec.choirHi || 77, 3);
      push(g.at, { i: 'choir', ns: cv, d: g.len, v: sec.choir * V, sw: sec.pad === 'swell' });
    }
  }
  const runLen = (pat, i) => { let d = 1; while (pat[i + d] === '-') d++; return d; };

  listFor(sec.stab, bars).forEach((name, b) => {
    const pat = STAB[name];
    if (!pat) return;
    for (let i = 0; i < 16; i++) {
      const c = pat[i];
      if (c !== 'x' && c !== 'X') continue;
      const s = b * 16 + i;
      sv = voiceChord(chordAt(s).ch, sv, 58, 77, 3);
      push(s, { i: 'stab', ns: sv, d: runLen(pat, i) * 0.8, v: velOf(c) * V });
    }
  });

  // Bass.
  let bprev = 40;
  listFor(sec.bass, bars).forEach((name, b) => {
    const pat = BASS[name];
    if (!pat) return;
    for (let i = 0; i < 16; i++) {
      const c = pat[i];
      if (c === '.' || c === '-' || c === undefined) continue;
      const s = b * 16 + i;
      const ch = chordAt(s).ch;
      const root = place(ch.bass, bprev, 31, 45);
      let n = root;
      if (c === 'o' || c === 'O') n = root + 12;
      else if (c === '5') n = root + 7;
      else if (c === 'f') n = root - 5;
      else if (c === '3') n = root + (ch.iv.includes(3) ? 3 : ch.iv.includes(4) ? 4 : 7);
      else if (c === '7') n = root + (ch.iv.includes(11) ? 11 : 10);
      else if (c === 'b') n = root + 1;
      else if (c === 'p') n = place(nextChordAfter(s).bass, root, 31, 45) - 1;
      if (c === 'r' || c === 'R') bprev = root;
      const d = runLen(pat, i);
      push(s, { i: 'bass', n, d: d * 0.92, v: velOf(c) * V });
    }
  });

  // Arpeggios.
  let arpIdx = 0;
  const arpLo = sec.arpLo || 64;
  listFor(sec.arp, bars).forEach((name, b) => {
    const pat = ARP[name];
    if (!pat) return;
    for (let i = 0; i < 16; i++) {
      const c = pat[i % pat.length];
      if (c < '0' || c > '9') continue;
      const s = b * 16 + i;
      const ch = chordAt(s).ch;
      const tones = [];
      for (let n = arpLo; tones.length < 10; n++) if (ch.pcs.includes(n % 12)) tones.push(n);
      const n = tones[+c];
      push(s, { i: sec.arpInst || 'pluck', n, d: runLen(pat, i % pat.length), v: (i % 4 === 0 ? 1 : 0.8) * (sec.arpVel || 1) * V, pan: (arpIdx++ % 2 ? 0.3 : -0.3) });
    }
  });

  // Drums.
  listFor(sec.drums, bars).forEach((name, b) => {
    const pat = DRUM[name];
    if (!pat) return;
    for (const tr in pat) {
      const str = pat[tr];
      for (let i = 0; i < 16; i++) {
        const c = str[i];
        if (!c || c === '.') continue;
        const s = b * 16 + i;
        const vel = velOf(c) * V;
        if (tr === 'k') push(s, { i: 'kick', v: vel });
        else if (tr === 's') push(s, { i: 'snare', v: vel });
        else if (tr === 'h') push(s, { i: 'hat', v: vel });
        else if (tr === 'o') push(s, { i: 'hat', v: vel, open: true });
        else if (tr === 'c') push(s, { i: 'crash', v: vel });
        else if (tr === 't') push(s, { i: 'tom', k: +c || 2, v: 0.85 * V });
        else if (tr === 'w') push(s, { i: 'swell', d: 16 - i, v: vel });
        else if (tr === 'd') push(s, { i: 'taiko', k: c === '1' || c === '2' ? +c : 3, v: vel });
        else if (tr === 'b') push(s, { i: 'bronze', k: c === '2' ? 2 : 1, n: place(chordAt(s).ch.root, 54, 48, 59), v: vel });
        else if (tr === 'g') {
          const small = c === '1';
          push(s, { i: 'gong', k: small ? 1 : 3, n: small ? place(chordAt(s).ch.root, 72, 67, 78) : place(chordAt(s).ch.root, 45, 40, 51), v: vel });
        } else if (tr === 'l') push(s, { i: 'chuong', n: place(chordAt(s).ch.root, 60, 55, 66), v: vel });
        else if (tr === 'm') push(s, { i: 'mo', k: c >= '1' && c <= '4' ? +c : 1, v: vel });
      }
    }
  });

  // Timpani.
  listFor(sec.timp, bars).forEach((name, b) => {
    const pat = TIMP[name];
    if (!pat) return;
    let run = 0;
    for (let i = 0; i < 16; i++) {
      const c = pat[i];
      const s = b * 16 + i;
      if (c === 'z') {
        let total = run; while (pat[i + total - run] === 'z') total++;
        const k = (run + 1) / Math.max(1, total);
        const root = place(chordAt(s).ch.root, 45, 38, 50);
        // Roll strokes re-excite the head, so each one only needs a short tail
        // (the last stroke of a run rings fully).
        const lastStroke = pat[i + 1] !== 'z';
        push(s, { i: 'timp', n: root, v: (0.25 + 0.6 * k) * V, roll: true });
        push(s + 0.5, { i: 'timp', n: root, v: (0.22 + 0.6 * k) * V, roll: !lastStroke });
        run++;
        continue;
      }
      run = 0;
      if (!c || c === '.') continue;
      const ch = chordAt(s).ch;
      const root = place(ch.root, 45, 38, 50);
      push(s, { i: 'timp', n: c === '5' ? place((ch.root + 7) % 12, root + 5, 38, 55) : root, v: velOf(c) * V });
    }
  });

  // Lead melody (+ optional harmony) and counter-melody.
  const scale = song.scale;
  const addLine = (str, inst, velMul, harm, oct) => {
    const mel = parseMelody(str);
    for (const nt of mel.notes) {
      const gate = nt.stac ? 0.5 : 0.94;
      const pos = nt.at % 16;
      const metric = pos < 1e-6 ? 1 : pos % 4 < 1e-6 ? 0.9 : 0.84;   // natural phrasing
      const ev = { i: inst, n: nt.n + (oct || 0), d: nt.d * gate, v: (nt.acc ? 1 : metric) * velMul * V, g: nt.g !== null ? nt.g + (oct || 0) : null };
      if (nt.bu) ev.bu = true;
      if (nt.bd) ev.bd = true;
      if (nt.orn) ev.orn = true;
      push(nt.at, ev);
      if (harm) {
        // Chord tones and long notes: nearest chord tone 3..9 semitones below.
        // Short passing notes: parallel diatonic third (or a minor third).
        let h = nt.n - 3;
        const ch = chordAt(Math.floor(nt.at + 1e-6)).ch;
        const isChordTone = ch.pcs.includes(nt.n % 12);
        let found = false;
        if (harm === 'oct') { h = nt.n - 12; found = true; }
        else if (harm === 'p4') { h = nt.n - 5; found = true; }
        else if (harm === 'p5') { h = nt.n - 7; found = true; }
        else if (isChordTone || nt.d >= 3) {
          for (let k = 3; k <= 9; k++) if (ch.pcs.includes((nt.n - k + 120) % 12)) { h = nt.n - k; found = true; break; }
        }
        if (!found) {
          const idx = scale.indexOf(nt.n % 12);
          if (idx >= 0) { const pc = scale[(idx + scale.length - 2) % scale.length]; h = nt.n - 1; while (h % 12 !== pc) h--; }
        }
        push(nt.at, { i: inst, n: h + (oct || 0), d: ev.d, v: ev.v * 0.55, g: null });
      }
    }
  };
  if (sec.lead) addLine(sec.lead, sec.leadInst || 'lead', sec.leadVel || 1, sec.harm, sec.leadOct);
  if (sec.counter) addLine(sec.counter, sec.counterInst || 'soft', sec.counterVel || 0.7, null, 0);

  return { steps, bars, bpm: sec.bpm || song.bpm };
}

function compileSong(def) {
  const out = {};
  for (const k in def.sections) out[k] = compileSection(def, def.sections[k]);
  return out;
}

// -----------------------------------------------------------------------------
// 11. Song data — patterns and original compositions
// -----------------------------------------------------------------------------
const DRUM = {
  // --- shared ------------------------------------------------------------------
  tSwell:  { w: 'x...............' },
  res:     { k: 'x.......x.......', h: '..o...o...o...o.' },
  resB:    { k: 'x.........x.....', s: '....o.......o...', h: 'o.o.o.o.o.o.o.o.', m: '3.......3.......' },
  // --- title / ending: noble march under the bronze drum --------------------------
  lhOpen:  { b: 'X.......x.......', g: 'X...............' },
  lhMarch: { k: 'X.......X.......', s: '....x.......x..o', h: 'o.o.o.o.o.o.o.o.', b: 'X...............' },
  lhBig:   { k: 'X.....x.X.......', s: '....X.......X.xx', h: 'x.x.x.x.x.x.x.x.', b: 'X.......x.......', d: '..........x.x...' },
  lhFill:  { k: 'X.......X.......', s: '....X...........', t: '........1.2.3...', d: '............X.XX', h: 'o.o.o.o.........' },
  lhHalf:  { k: 'X.........x.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', b: 'X...............' },
  lhBuild: { k: 'X...X...X...X...', s: 'o.o.o.o.xxxxXXXX', w: '........x.......', d: 'X...X...X...X...' },
  // --- 1 Văn Lang: ritual bronze drums, mõ ticks ---------------------------------
  vlRit:   { b: 'X.......x...2...', m: '..1...1...1...1.', h: '..o...o...o...o.' },
  vlRitF:  { b: 'X.......2.2.2222', m: '1.1.1.1.........', w: '........x.......' },
  vlA:     { k: 'X.......X.......', b: 'X.....x.....2...', s: '....o.......x...', h: 'x.x.x.x.x.x.x.x.', m: '..1...1...1...11' },
  vlA2:    { k: 'X.....x.X.......', b: 'X..2..x.....2.2.', s: '....x.......X...', h: 'x.xox.x.x.xox.x.', m: '..1...1...1...1.' },
  vlB:     { k: 'X.....x.X.......', b: 'X..x..x.X...2.2.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', m: '..1...1...1...1.' },
  vlF:     { k: 'X.......X.......', b: 'X.......2.2.2222', s: '....X...........', w: '........x.......' },
  vlC:     { b: 'X.......2...2...', m: '1.1.1.1.1.1.1.1.', d: '........o.......' },
  vlC2:    { k: 'X.......X...x...', b: 'X...2...X...2.2.', m: '1.1.1.1.1.1.1.1.', d: 'x.......x.......', h: '..o...o...o...o.' },
  // --- 2 Âu Lạc: martial, war drums ----------------------------------------------
  alIn:    { d: 'X.......x.......', t: '........3.3.4.4.' },
  alIn2:   { d: 'X...x...X...x...', s: '........o.o.xxXX', w: '........x.......' },
  alA:     { k: 'X.....x.X.x.....', s: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', d: 'X...............' },
  alA2:    { k: 'X.x...x.X.x...x.', s: '....X.......X..o', h: 'x.x.x.x.x.x.x.x.', d: 'X.......X.......', t: '..............21' },
  alB:     { k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.', d: 'X..x..x.X.......' },
  alF:     { k: 'X.......X.......', s: '....X...x.x.XxXX', d: '........X...X...' },
  alC:     { k: 'X..X..X.X..X..X.', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', t: '..........1.1.2.', b: 'X...............' },
  // --- 3 Hoa Lư: misty gongs, oar knocks, rowing 3+3+2 ---------------------------
  hlMist:  { g: 'X...............', h: '..o.....o.......', m: '......2.......2.' },
  hlRow:   { k: 'X..x....X..x....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', m: '......2.......2.' },
  hlRow2:  { k: 'X..x..x.X..x..x.', s: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', m: '......2.......2.', g: '1...............' },
  hlBig:   { k: 'X.....x.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', d: 'X.......x.......', g: 'X...............' },
  hlF:     { k: 'X.......X.......', s: '....X...........', t: '........1.2.3.4.', d: '............X.X.' },
  hlHalf:  { k: 'X.........x.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', m: '......2.......2.', g: 'x...............' },
  // --- 4 Lý: temple bells and mõ -------------------------------------------------
  lyBell:  { l: 'X...............', m: '1...1...1...1...' },
  lyMo:    { m: '1.1.1.1.1.1.1.1.', h: '..o...o...o...o.', k: 'X.......X.......' },
  lyMoF:   { m: '1.1.1.1.11111111', k: 'X.......X.......', w: '........x.......' },
  lyA:     { k: 'X.......X.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', m: '..1...1...1...1.', l: 'X...............' },
  lyA2:    { k: 'X.......X.x.....', s: '....X.......X..o', h: 'x.xox.x.x.xox.x.', m: '..1...1...1.1.1.' },
  lyB:     { k: 'X.....x.X.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', m: '1.1.1.1.1.1.1.1.', d: 'X.......x.......' },
  lyF:     { k: 'X.......X.......', s: '....X...x.x.XxXX', m: '1.1.1.1.........', w: '........x.......' },
  lyHalf:  { l: 'X...............', m: '1...2...1...2...', k: 'X.........x.....', s: '........o.......' },
  // --- 5 Bạch Đằng: battle march, war drums, tide ---------------------------------
  bdIn:    { d: 'X.......X.......', w: '........x.......' },
  bdIn2:   { d: 'X..x..x.X..x..x.', b: 'X...............' },
  bdMarch: { k: 'X.......X.x.....', s: '....X.....x.X...', h: 'x.x.x.x.x.x.x.x.', d: 'X.......X.......' },
  bdMarch2:{ k: 'X.....x.X.x.....', s: '....X..o....X.oo', h: 'x.xox.x.x.xox.x.', d: 'X..x....X..x....' },
  bdF:     { k: 'X.......X.......', s: '....X...xxxxXXXX', d: '........X.X.X.X.' },
  bdBig:   { k: 'X.x...x.X.x...x.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.', d: 'X..x..x.X..x..x.', b: 'X...............' },
  bdTide:  { k: 'X.........x.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', d: 'X.....x.....x...' },
  // --- 6 Tây Đô: stone knocks, heavy half-time ------------------------------------
  tdIn:    { m: '4.......4...4...', d: 'x...............' },
  tdInF:   { m: '4...4...4.4.4444', d: 'x.......x...X...', w: '........x.......' },
  tdA:     { k: 'X.........X.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', m: '4...4.4.4...4.4.', d: 'X...............' },
  tdA2:    { k: 'X.....x...X.....', s: '........X......o', h: 'x.xxx.xxx.xxx.xx', m: '4...4.4.4...4.4.', d: 'X.......x.......' },
  tdB:     { k: 'X.......X.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', m: '4.4.4...4.4.4...', d: 'X..x....X.......', b: 'X...............' },
  tdF:     { k: 'X.......X.......', s: '....X...........', m: '........4.4.4444', d: '............X.XX' },
  tdC:     { m: '4.......4..4....', d: 'x.......o.......', h: '..o...o...o...o.' },
  // --- 7 Lê Sơ: festival, phách clicks, trống cơm-like toms ------------------------
  lsIn:    { m: '3.3.3..33.3.3...', t: '..........1.1...' },
  lsInF:   { m: '3.3.3.3.3333....', t: '........1.2.3.44', w: '........x.......' },
  lsA:     { k: 'X.....x.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', m: '3..3..3.3..3..3.', t: '..............21' },
  lsA2:    { k: 'X.....x.X.x.....', s: '....X.......X..o', h: 'xxx.xxx.xxx.xxx.', m: '3..3..3.3..3..3.' },
  lsB:     { k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.', b: 'X.......x.......' },
  lsF:     { k: 'X.......X.......', s: '....X...........', t: '........1.2.1.2.', m: '3.3.3.3.........', w: '........x.......' },
  lsC:     { k: 'X.........x.....', s: '........X.......', m: '3..3..3.3..3..3.', h: '..o...o...o...o.' },
  // --- 8 Phố Hiến / Hội An: lilting 3+3+2, lantern-night chiêng -------------------
  phIn:    { m: '..1.....1.1.....', h: '..o.......o.....' },
  phA:     { k: 'X.....x...x.....', s: '........X.......', h: 'x.xx.xx.x.xx.xx.', m: '...1..1....1..1.' },
  phA2:    { k: 'X.....x...x.....', s: '....o...X.......', h: 'x.xx.xx.x.xx.xx.', m: '...1..1....1..1.', t: '..............21' },
  phB:     { k: 'X.....x...x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..x.......x.....', m: '...1..1....1..1.' },
  phF:     { k: 'X.....x...x.....', s: '....X...x.x.XxXx', m: '...1..1.........' },
  phC:     { m: '1..1..1.1..1..1.', h: '..o...o...o...o.', k: 'X.........x.....', g: '1...............' },
  // --- 9 Tây Sơn: trống trận ensemble ---------------------------------------------
  tsIn:    { d: 'X...x...X...x...', t: '..........3.4.4.' },
  tsIn2:   { d: 'X.x.X.x.X.x.X2X2', b: 'X...............', w: '........x.......' },
  tsA:     { k: 'X.x...x.X.x...x.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', d: 'X..x..x.X..x..x.' },
  tsA2:    { k: 'X.x.X.x.X.x.X.x.', s: '....X..o....X..o', h: 'xoxoxoxoxoxoxoxo', d: 'X..x..x.X.2.X.2.', t: '..............21' },
  tsB:     { k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.', d: 'X.......X.x.....', b: 'X...............' },
  tsF:     { k: 'X.......X.......', s: '....X...XxXxXXXX', d: '........X.2.X2X2' },
  tsDr1:   { k: 'X.......X.......', d: 'X..x..x.X..x..x.', t: '..1...1...2...2.', b: 'X.......X.......' },
  tsDr2:   { k: 'X...X...X...X...', d: 'X.1.2.X.X.1.2.X.', t: '1.2.1.2.3.4.3.4.', b: 'X...............' },
  tsDr3:   { k: 'X..X..X.X..X..X.', d: 'X1x1X.1.X2x2X.2.', t: '..1.1.2...3.3.4.', b: 'X.......2...2...' },
  tsDrF:   { k: 'X.......X.......', d: 'X.1.X.1.X2X2XXXX', b: 'X...........X...', w: '........x.......' },
  // --- 10 Huế: court drums, phách, temple bell at night -----------------------------
  hueIn:   { l: 'X...............', b: '........x.......' },
  hueIn2:  { b: 'X.......x...2...', m: '3.......3.......' },
  hueInF:  { d: 'X.......x.x.XxXX', b: 'X...............', w: '........x.......' },
  hueA:    { k: 'X.......X.......', s: '....o.......X...', h: 'x.x.x.x.x.x.x.x.', d: 'X.......x.......', m: '3...3...3...3...' },
  hueA2:   { k: 'X.....x.X.......', s: '....X.......X..o', h: 'x.xox.x.x.xox.x.', d: 'X..x....X..x....', m: '3...3...3.3.3...' },
  hueB:    { k: 'X.....x.X.x.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', d: 'X..x..x.X.......', b: 'X...............' },
  hueF:    { k: 'X.......X.......', s: '....X...x.x.XxXX', d: '........X.X.X.XX', w: '........x.......' },
  hueNite: { k: 'X.........x.....', s: '........o.......', h: '..o...o...o...o.', m: '3.......3.......', l: 'X...............' },
  hueNite2:{ k: 'X.........x.....', s: '........o.......', h: '..o...o...o...o.', m: '3.......3...3...' },
  hueClim: { k: 'X.x...x.X.x...x.', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', d: 'X..x..x.X..x..x.', b: 'X.......X.......' },
  // --- boss: Thời Ảnh machines (bronze against metal) -------------------------------
  bsIntro: { c: 'X...............', k: 'X.......X.......', s: '............X.XX', b: 'X...............', g: 'X...............' },
  bsBeat:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', b: 'X.......X.......' },
  bsBeat2: { k: 'X.xX..X.X.xX..X.', s: '....X..X....X...', h: 'x.x.x.x.x.x.x.x.', b: 'X..2..2.X..2..2.' },
  bsFill:  { k: 'X..X..X.X.......', s: '....X...XxXxXXXX', h: 'xoxoxoxo........', b: '........X...X...' },
  bsGong:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', g: 'X...............', b: 'X.......X.......' },
  // --- final boss ---------------------------------------------------------------------
  fIntro:  { c: 'X...............', k: 'X.......X.......', s: '............X.XX', d: 'X...............', g: 'X...............' },
  fWar:    { k: 'XxXxX.XxXxXxX.Xx', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', d: 'X.......X.......' },
  fTaiko:  { k: 'X..X..X.X..X..X.', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo', d: 'X..X..X.X..X..X.', b: 'X...............' },
  fHalf:   { k: 'X.........x.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', d: 'X.......X.......', g: 'X...............' },
  fFill:   { k: 'X..X..X.X.......', s: '....X...XxXxXXXX', d: '........X.X.X.X.' },
  fHero:   { k: 'X.....x.X.x.....', s: '....X.......X.xx', h: 'x.x.x.x.x.x.x.x.', d: 'X..x..x.X.......', b: 'X.......x.......' },
  // --- clear / results / game over -----------------------------------------------------
  fan1:    { c: 'X...............', k: 'X...............', b: 'X...............' },
  fanB:    { k: 'X.......X.......', s: '....x.......x...', d: '..........x.x...' },
  fanRoll: { k: 'X.......X.......', s: 'o.o.o.o.xxxxXXXX', d: '............X.X.' },
  goBell:  { l: 'X...............' },
};
// "<name>C" = the same groove with a crash on the downbeat (section starts).
for (const k of Object.keys(DRUM)) {
  const p = DRUM[k];
  if (p.c || DRUM[k + 'C']) continue;
  const q = Object.assign({}, p, { c: 'X...............' });
  if (q.h) q.h = '.' + q.h.slice(1);
  DRUM[k + 'C'] = q;
}

const BASS = {
  drive8:  'R-r-r-r-R-r-o-r-',
  hook8:   'R-r-o-r-R-r-o-r-',
  pulse:   'R.r.r.r.R.r.r.r.',
  long:    'R---------------',
  half:    'R-------r-------',
  walk:    'R---r---5---o---',
  ost16:   'RrorrbrrRror5bro',
  ost16b:  'RrrrRrrrRrrrRrbr',
  res:     'R-------5-------',
  gallop:  'R-rrR-rrR-rrR-rr',
  tres:    'R..r..r.R..r..r.',
  drone:   'R-------------5-',
  droneP:  'R.....r.R.....r.',
  row:     'R-----r-5-----r-',   // a slow stroke and recovery (Hoa Lư boats)
  march:   'R---5---R-r-5-r-',
  lilt:    'R-...5-.r-...o-.',   // 3+3+2 lilt (Phố Hiến)
  mach:    'RrRrRrOrRrRrRbRr',   // machine pistons (boss)
};

const ARP = {
  arpA:   '0123012301230123',
  arpB:   '0123432101234321',
  arp8:   '0.1.2.3.4.3.2.1.',
  bell4:  '0...2...4...2...',
  bell8:  '4.2.3.1.4.2.5.3.',
  ost:    '0102010201020102',
  up16:   '0123456701234567',
  sweep:  '0123456787654321',
  kotek:  '0213243502132435',   // interlocking: odd/even notes pan L/R
  glow:   '0.2.4.2.1.3.5.3.',   // lantern / temple shimmer
  ripple: '0241302413024130',   // water
  run:    '0123456776543210',   // đàn tranh glissando up and down
  row:    '0..1..2.0..1..2.',   // rowing 3+3+2
  cross:  '0..0..0.2..2..3.',   // crossbow volleys (twang)
  cross2: '0.0.2.0.3.0.2.04',
};

const STAB = {
  syncA: '......x-..x...x-',
  syncB: 'X-.x-.x-....X-..',
  push:  '..............X-',
  hits4: 'X-..X-..X-..X-..',
  boss1: 'X..X..X..X..X.X.',
  boss2: 'X-..............',
  fanf:  'X---------------',
};

const TIMP = {
  hit1:  'R...............',
  hit13: 'R.......r.......',
  roll:  'zzzzzzzzzzzzzzzz',
  roll2: '........zzzzzzzz',
  march: 'R...5...R...5...',
  boss:  'R.....r.R.....5.',
};

// Scales (pitch classes) for the harmony line's passing notes.
const SC = {
  Dbac: [2, 4, 7, 9, 11],             // D điệu Bắc (D E G A B): title / ending
  Dmin: [2, 4, 5, 7, 9, 10, 0],
};

// "Lạc Hồng" — the squadron's theme (title chorus, ending, final boss).
// A rising fourth-and-fifth call in D điệu Bắc that settles on the open 2nd,
// answers to the 5th, climbs and comes home with a fourth leap to the tonic.
const LH_CHORDS = 'D Em7 G A Bm7 G Em7,A D';
const LH_THEME =
  'A4:3 D5:1 E5:4 A5:6 G5:1 E5:1 ' +
  'G5:4 E5:2 D5:2 E5:8 ' +
  'A4:3 D5:1 E5:4 B5:6 A5:1 G5:1 ' +
  'A5:4 G5:2 E5:2 A5:8 ' +
  'D6:3 B5:1 A5:4 B5:2 D6:2 E6:4 ' +
  'D6:4 B5:2 A5:2 G5:4 E5:4 ' +
  'A4:3 D5:1 E5:4 G5:2 E5:2 A5:4 ' +
  'D6:12 r:4';
const LH_COUNTER = 'F#5:16 G5:16 B5:16 C#6:16 D6:16 B5:16 B5:8 C#6:8 A5:16';

const SONGS = {
  // ---------------------------------------------------------------------------
  // TITLE — "Lạc Hồng". D điệu Bắc (D E G A B) over D-major strings, 104 BPM.
  // Swell(2, once: bronze drum + gong + tranh run) -> A(8, sáo verse) ->
  // B(8, the Lạc Hồng theme: brass, choir) -> C(8, đàn nhị bridge in B minor)
  // -> B2(8, theme with choir, stabs and nhị counter).  ≈ 74 s loop.
  title: {
    bpm: 104, scale: SC.Dbac, intro: ['S'], loop: ['A', 'B', 'C', 'B2'],
    mix: { lead: 1.05, pad: 0.95, arp: 0.85, timp: 0.8, brass: 0.8 },
    sections: {
      S: {
        bars: 2, chords: 'Dsus2 Asus4,A', pad: 'swell', padVel: 1, bass: 'long',
        timp: 'roll2 roll', drums: 'lhOpen tSwell', counterInst: 'zither', counterVel: 0.85,
        counter: 'r:16 D5:1 E5 G5 A5 B5 D6 E6 G6 A6:8',
      },
      A: {
        bars: 8, chords: 'D A/C# Bm7 G Em7 D/F# G Asus4,A', pad: 'hold', padVel: 0.7,
        bass: 'walk', drums: 'lhMarchC lhMarch lhMarch lhFill lhMarchC lhMarch lhMarch lhFill',
        timp: 'hit13 hit1 hit1 roll2 hit13 hit1 hit1 roll2', arp: 'arp8', arpInst: 'zither', arpLo: 62, arpVel: 0.75,
        leadInst: 'sao', leadVel: 1,
        lead:
          'A5:6 B5:1 A5:1 E5:4 D5:4 ' +
          'E5:3 G5:1 A5:4 E5:8 ' +
          'D5:6 E5:1 D5:1 B4:4 A4:4 ' +
          'B4:3 D5:1 E5:4 D5:8* ' +
          'G5:6 A5:1 G5:1 E5:4 D5:4 ' +
          'E5:2 G5:2 A5:4~ B5:8 ' +
          'D6:4 B5:2 A5:2 G5:4 E5:4 ' +
          'A5:12 r:4',
      },
      B: {
        bars: 8, chords: LH_CHORDS, pad: 'hold', padVel: 1, choir: 0.45,
        bass: 'walk', drums: 'lhBigC lhBig lhBig lhBig lhBigC lhBig lhBig lhFill',
        timp: 'march march march march march march march roll', arp: 'arpB', arpInst: 'zither', arpLo: 66, arpVel: 0.5,
        stab: '- - - push - - - push', harm: 'dia3', leadVel: 0.95,
        lead: LH_THEME,
      },
      C: {
        bars: 8, chords: 'Bm G Em7 A Bm G Em7 A7sus4', pad: 'hold', padVel: 0.85,
        bass: 'half', drums: 'lhHalfC lhHalf lhHalf lhHalf lhHalfC lhHalf lhBuild lhBuild',
        timp: 'hit1 - - - hit1 - - roll2', arp: 'arpA', arpInst: 'zither', arpLo: 59, arpVel: 0.55,
        leadInst: 'erhu', leadVel: 0.95,
        lead:
          'B4:4 D5:4 E5:6 F#5:2 ' +
          'E5:4 D5:2 B4:2 D5:8^ ' +
          'G5:6 F#5:2 E5:4 B4:4 ' +
          'C#5:4 E5:4 A5:8 ' +
          'B5:6 A5:2 F#5:4 E5:4 ' +
          'D5:4 E5:2 F#5:2 B5:8_ ' +
          'A5:4 G5:2 F#5:2 E5:4 D5:4 ' +
          'E5:16',
      },
      B2: null, // filled below
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 1 — VĂN LANG "Bình minh trên đồng lúa". A điệu Bắc (A B D E F#),
  // 124 BPM, archaic and ritual: trống đồng, khèn reed chords, sáo, đàn tranh,
  // parallel fourths (organum) in the second verse.
  // Intro(4, once) -> A(8) -> B(8) -> A2(8) -> B2(8) -> C(8).  ≈ 77 s loop.
  stage1: {
    bpm: 124, scale: [9, 11, 2, 4, 6], intro: ['I'], loop: ['A', 'B', 'A2', 'B2', 'C'],
    mix: { lead: 1.1, arp: 0.8, pad: 0.9, bass: 0.85 },
    sections: {
      I: {
        bars: 4, chords: 'Asus2 Asus2 Dsus2 E7sus4', pad: 'swell', padInst: 'khen', padVel: 0.9,
        bass: 'drone', drums: 'vlRitC vlRit vlRit vlRitF', leadInst: 'sao', leadVel: 0.95,
        lead:
          'r:4 E5:2 F#5:2 A5:8* ' +
          'B5:2 A5:2 F#5:4 E5:8 ' +
          'r:4 D5:2 E5:2 A5:6 B5:2 ' +
          'A5:4 F#5:4 E5:8',
      },
      A: {
        bars: 8, chords: 'Asus2 D Bm7 E7sus4 Asus2 D6 Bm7 E7sus4', pad: 'hold', padInst: 'khen', padVel: 0.6,
        bass: 'drone drone droneP droneP', drums: 'vlAC vlA vlA vlA2 vlA vlA vlA vlF',
        arp: 'arp8', arpInst: 'zither', arpLo: 62, arpVel: 0.6,
        leadInst: 'sao', leadVel: 1.05,
        lead:
          'A4:2 B4:2 D5:4 E5:4 F#5:2 E5:2 ' +
          'D5:6 E5:1 D5:1 B4:4 A4:4 ' +
          'B4:3 D5:1 E5:4 F#5:2 A5:2 B5:4 ' +
          'A5:4 E5:4 r:2 E5:2 F#5:2 A5:2 ' +
          'B5:6 A5:1 F#5:1 E5:4 D5:4 ' +
          'D5:2 E5:2 F#5:2 A5:2 B5:8* ' +
          'A5:3 F#5:1 E5:4 D5:2 B4:2 D5:4 ' +
          'E5:12 r:4',
      },
      B: {
        bars: 8, chords: 'Bm7 D E7sus4 Asus2 Bm7 D E7sus4 E7sus4', pad: 'hold', padInst: 'khen', padVel: 0.8,
        bass: 'pulse', drums: 'vlBC vlB vlB vlB vlBC vlB vlB vlF',
        arp: 'run', arpInst: 'zither', arpLo: 64, arpVel: 0.45, leadInst: 'sao', leadVel: 1.05,
        lead:
          'F#5:4 A5:4 B5:6 A5:2 ' +
          'D6:4 B5:2 A5:2 F#5:8 ' +
          'E5:3 F#5:1 A5:4 B5:2 A5:2 E5:4 ' +
          'A5:16 ' +
          'F#5:4 A5:4 B5:4 D6:4 ' +
          'E6:6 D6:1 B5:1 A5:4 F#5:4 ' +
          'A5:4 B5:2 A5:2 E5:4 D5:2 E5:2 ' +
          'E5:12 r:4',
      },
      A2: null, B2: null, // filled below
      C: {
        bars: 8, chords: 'Bm7 Bm7 D D Asus2 Asus2 E7sus4 E7sus4', pad: 'hold', padInst: 'khen', padVel: 0.75,
        bass: 'long', drums: 'vlCC vlC vlC vlC vlC2C vlC2 vlC2 vlF', timp: '- - - - - - - roll2',
        leadInst: 'zither', leadVel: 1.25, counterInst: 'sao', counterVel: 0.55,
        lead:
          'B4:1 D5 E5 F#5 A5:4 r:2 F#5:2 E5:2 D5:2 ' +
          'E5:4 D5:2 B4:2 D5:8^ ' +
          'D5:1 E5 F#5 A5 B5:4 r:2 A5:2 B5:2 D6:2 ' +
          'E6:4 D6:2 B5:2 A5:8 ' +
          'A5:1 B5 A5 F#5 E5:4 r:2 D5:2 E5:2 F#5:2 ' +
          'A5:4 F#5:2 E5:2 D5:8 ' +
          'E5:2 F#5 A5 B5 D6 E6 D6 B5 ' +
          'A5:12 r:4',
        counter: 'F#5:16 D5:16 A5:16 F#5:16 E5:16 A4:16 B4:16 E5:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 2 — ÂU LẠC "Thành Cổ Loa". E minor pentatonic (E G A B D), 144 BPM.
  // Martial: crossbow-like twang volleys, war drums, đàn nhị verse, brass
  // chorus with a B7 drive, a staccato "volley" bridge in A minor.
  // Intro(4) -> A B A2 B2 C.  ≈ 67 s loop.
  stage2: {
    bpm: 144, scale: [4, 7, 9, 11, 2], intro: ['I'], loop: ['A', 'B', 'A2', 'B2', 'C'],
    mix: { lead: 1.1, arp: 0.9, brass: 0.85, bass: 0.9 },
    sections: {
      I: {
        bars: 4, chords: 'E5 E5 D5 E5', bass: 'gallop', drums: 'alIn alIn alIn alIn2',
        arp: 'cross', arpInst: 'twang', arpLo: 52, arpVel: 0.9, timp: 'hit1 - hit1 roll2',
        counterInst: 'erhu', counterVel: 0.7,
        counter: 'r:8 E5:2 G5:2 A5:4 B5:12 r:4 r:8 D5:2 E5:2 G5:4 A5:8 B5:8',
      },
      A: {
        bars: 8, chords: 'Em D Em Bm Em D C D', pad: 'hold', padVel: 0.55,
        bass: 'drive8', drums: 'alAC alA alA alA2 alA alA alA2 alF',
        arp: 'cross2', arpInst: 'twang', arpLo: 59, arpVel: 0.7, stab: 'syncA',
        leadInst: 'erhu', leadVel: 1.05,
        lead:
          'E5:3 E5:1 G5:2 A5:2 B5:4 A5:2 G5:2 ' +
          'A5:6 G5:1 A5:1 D5:8 ' +
          'E5:3 E5:1 G5:2 A5:2 B5:4 D6:2 B5:2 ' +
          'A5:4 B5:2 A5:2 F#5:4 D5:4 ' +
          'E5:2 G5:2 B5:4 D6:2 B5:2 E6:4 ' +
          'D6:4 B5:2 A5:2 B5:4 A5:2 G5:2 ' +
          'E5:4 G5:2 A5:2 B5:4 G5:2 E5:2 ' +
          'D5:4 E5:2 G5:2 F#5:8',
      },
      B: {
        bars: 8, chords: 'C D Em Em C D B7 B7', pad: 'hold', padVel: 0.9,
        bass: 'hook8', drums: 'alBC alB alB alB alBC alB alB alF',
        arp: 'cross', arpInst: 'twang', arpLo: 59, arpVel: 0.55, stab: '- - - push - - - push',
        timp: 'hit1 - hit1 - hit1 - roll2 roll',
        lead:
          'G5:2 A5:2 B5:4 E6:6 D6:2 ' +
          'D6:4 A5:4 F#5:4 A5:4 ' +
          'B5:3 A5:1 G5:4 E5:4 G5:4 ' +
          'E5:12 r:2 B4:2 ' +
          'G5:2 A5:2 B5:4 E6:4 G6:4 ' +
          'F#6:4 E6:2 D6:2 A5:8 ' +
          'B5:4 D#6:4 F#6:4 D#6:4 ' +
          'B5:12 r:4',
      },
      A2: null, B2: null,
      C: {
        bars: 8, chords: 'Am Em Am B7 Am Em C B7', pad: 'hold', padVel: 0.8,
        bass: 'gallop', drums: 'alCC alC alC alF alCC alC alC alF',
        arp: 'up16', arpInst: 'twang', arpLo: 57, arpVel: 0.45, stab: 'hits4', timp: 'march march march roll2',
        leadVel: 1,
        lead:
          "A5:2' C6:2' B5:2' A5:2' E5:4 G5:4 " +
          "B5:2' G5:2' E5:2' D5:2' E5:8 " +
          "A5:2' C6:2' B5:2' A5:2' E6:4 D6:4 " +
          'D#6:4 B5:4 F#5:4 A5:4 ' +
          "C6:2' B5:2' A5:2' E5:2' A5:4 C6:4 " +
          "B5:2' G5:2' E5:2' G5:2' B5:8 " +
          'C6:4 E6:4 G6:4 E6:4 ' +
          'D#6:8 F#6:8',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 3 — HOA LƯ "Sông núi Tràng An". C điệu Bắc (C D F G A), 132 BPM.
  // Misty and majestic: big gongs, oar knocks on the temple mõ, rowing 3+3+2
  // bass and arps, sáo echoing in the dotted delay, a boat-song (hò-like) call
  // and response bridge on đàn tranh.  Intro(4) -> A B A2 B2 C.  ≈ 73 s loop.
  stage3: {
    bpm: 132, scale: [0, 2, 5, 7, 9], intro: ['I'], loop: ['A', 'B', 'A2', 'B2', 'C'],
    mix: { lead: 1.1, pad: 1.0, arp: 0.8, bass: 0.85 },
    sections: {
      I: {
        bars: 4, chords: 'Csus2 Csus2 Bbadd9 Gsus4', pad: 'swell', padVel: 0.8,
        bass: 'long', drums: 'hlMistC hlMist hlMist hlMist', arp: 'ripple', arpInst: 'zither', arpLo: 64, arpVel: 0.4,
        leadInst: 'sao', leadVel: 1,
        lead:
          'r:8 G5:2 A5:2 C6:4* ' +
          'D6:8 C6:4 A5:4 ' +
          'r:8 F5:2 G5:2 A5:4 ' +
          'G5:12 r:4',
      },
      A: {
        bars: 8, chords: 'Csus2 Fadd9 Dm7 Gsus4 Csus2 Am7 Bbadd9 Gsus4', pad: 'hold', padVel: 0.7,
        bass: 'row', drums: 'hlRowC hlRow hlRow hlRow2 hlRow hlRow hlRow hlF',
        arp: 'row', arpInst: 'zither', arpLo: 60, arpVel: 0.6,
        leadInst: 'sao', leadVel: 1.05,
        lead:
          'C5:4 D5:2 F5:2 G5:6 A5:2 ' +
          'A5:4 G5:2 F5:2 D5:8 ' +
          'F5:3 G5:1 A5:4 C6:4 A5:4 ' +
          'G5:12 r:4 ' +
          'C6:4 D6:2 C6:2 A5:6 G5:2 ' +
          'A5:4 C6:2 A5:2 G5:4 D5:4 ' +
          'F5:4 G5:2 A5:2 D6:6 C6:2 ' +
          'G5:12 r:4',
      },
      B: {
        bars: 8, chords: 'Fadd9 Gsus4 Am7 Dm7 Bbadd9 Csus2 Dm7 Gsus4,G', pad: 'hold', padVel: 0.95, choir: 0.45,
        bass: 'row', drums: 'hlBigC hlBig hlBig hlBig hlBigC hlBig hlBig hlF',
        arp: 'arpB', arpInst: 'zither', arpLo: 62, arpVel: 0.5, timp: 'hit1 - hit1 - hit1 - hit1 roll2',
        leadInst: 'erhu', leadVel: 1.05,
        lead:
          'F5:6 A5:2 C6:4 A5:4 ' +
          'G5:6 A5:2 D6:4 C6:4 ' +
          'C6:4 A5:2 G5:2 A5:8 ' +
          'F5:4 G5:2 A5:2 D5:8^ ' +
          'D6:6 C6:2 A5:4 F5:4 ' +
          'G5:6 A5:2 C6:4 D6:4 ' +
          'F6:4 D6:2 C6:2 A5:4 G5:4 ' +
          'G5:12 r:4',
      },
      A2: null, B2: null,
      C: {
        bars: 8, chords: 'Dm7 Am7 Bbadd9 Csus2 Dm7 Am7 Bbadd9 Gsus4', pad: 'hold', padVel: 0.8,
        bass: 'half', drums: 'hlHalfC hlHalf hlHalf hlHalf hlHalfC hlHalf hlRow hlF',
        leadInst: 'zither', leadVel: 1.25, counterInst: 'sao', counterVel: 0.55,
        lead:
          'D5:2 F5:1 G5:1 A5:4 r:4 G5:2 A5:2 ' +
          'C6:4 A5:2 G5:2 A5:8 ' +
          'F5:2 G5:1 A5:1 C6:4 r:4 D6:2 C6:2 ' +
          'A5:4 G5:2 F5:2 G5:8 ' +
          'D6:2 F6:1 D6:1 C6:4 r:4 A5:2 C6:2 ' +
          'D6:4 C6:2 A5:2 G5:8 ' +
          'F5:2 G5 A5 C6 D6 F6 G6 F6 ' +
          'D6:12 r:4',
        counter: 'A4:16 E5:16 F5:16 G5:16 A5:16 E5:16 D5:16 D5:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 4 — LÝ / THĂNG LONG "Rồng bay". F điệu Bắc (F G Bb C D), 140 BPM.
  // Serene but driving: temple bells and mõ 16ths, đàn tranh arpeggios, a sáo
  // verse, a coiling "dragon" motif on đàn nhị doubled at the octave, a
  // temple bridge with bells, choir and a borrowed Eb.
  // Intro(4) -> A B A2 B2 C.  ≈ 69 s loop.
  stage4: {
    bpm: 140, scale: [5, 7, 10, 0, 2], intro: ['I'], loop: ['A', 'B', 'A2', 'B2', 'C'],
    mix: { lead: 1.1, arp: 0.85, pad: 0.95, timp: 0.9 },
    sections: {
      I: {
        bars: 4, chords: 'Fsus2 Fsus2 Gm7 Csus4', pad: 'swell', padVel: 0.7,
        bass: 'long', drums: 'lyBell lyMo lyBell lyMoF', arp: 'run', arpInst: 'zither', arpLo: 65, arpVel: 0.55,
        counterInst: 'bell', counterVel: 0.6,
        counter: 'C6:8 F6:8 D6:8 C6:8 Bb5:8 D6:8 C6:16',
      },
      A: {
        bars: 8, chords: 'Fsus2 Dm7 Bbadd9 Csus4 Fsus2 Gm7 Bbadd9 Csus4', pad: 'hold', padVel: 0.6,
        bass: 'drive8', drums: 'lyAC lyA2 lyA lyA2 lyA lyA2 lyA lyF',
        arp: 'up16', arpInst: 'zither', arpLo: 62, arpVel: 0.45,
        leadInst: 'sao', leadVel: 1.05,
        lead:
          'C6:6 D6:1 C6:1 Bb5:4 G5:4 ' +
          'F5:4 G5:2 Bb5:2 C6:8 ' +
          'D6:6 F6:1 D6:1 C6:4 Bb5:4 ' +
          'G5:4 Bb5:2 G5:2 F5:8 ' +
          'C6:6 D6:1 C6:1 F6:4 D6:4 ' +
          'C6:4 Bb5:2 G5:2 Bb5:8 ' +
          'D6:3 C6:1 Bb5:4 G5:2 F5:2 G5:4 ' +
          'C6:12 r:4',
      },
      B: {
        bars: 8, chords: 'Bbadd9 Csus4 Dm7 Dm7 Bbadd9 Csus4 Fsus2 Fsus2', pad: 'hold', padVel: 0.9,
        bass: 'hook8', drums: 'lyBC lyB lyB lyB lyBC lyB lyB lyF',
        arp: 'arpB', arpInst: 'zither', arpLo: 65, arpVel: 0.5, stab: '- - - push - - - push',
        leadInst: 'erhu', harm: 'oct', leadVel: 1.0,
        lead:
          'F5:1 G5 Bb5 C6 D6:4 C6:2 Bb5:2 C6:4 ' +
          'G5:2 Bb5:2 C6:2 D6:2 F6:4 D6:4 ' +
          'F6:6 D6:1 C6:1 D6:4 C6:2 Bb5:2 ' +
          'C6:2 Bb5:2 D6:12 ' +
          'F5:1 G5 Bb5 C6 D6:4 F6:2 D6:2 C6:4 ' +
          'Bb5:2 C6:2 D6:2 F6:2 G6:4 F6:4 ' +
          'D6:3 C6:1 Bb5:4 C6:2 D6:2 C6:4 ' +
          'F6:12 r:4',
      },
      A2: null, B2: null,
      C: {
        bars: 8, chords: 'Gm7 Dm7 Bbadd9 Fsus2 Gm7 Dm7 Ebmaj7 Csus4', pad: 'hold', padVel: 0.85, choir: 0.5,
        bass: 'half', drums: 'lyHalfC lyHalf lyHalf lyHalf lyHalfC lyHalf lyHalf lyF',
        arp: 'glow', arpInst: 'bell', arpLo: 70, arpVel: 0.45, timp: '- - - - - - - roll2',
        leadInst: 'zither', leadVel: 1.25,
        lead:
          'G5:4 Bb5:2 C6:2 D6:8^ ' +
          'C6:4 Bb5:2 G5:2 F5:8 ' +
          'Bb5:4 C6:2 D6:2 F6:8 ' +
          'D6:4 C6:2 Bb5:2 C6:8 ' +
          'G5:4 Bb5:2 C6:2 D6:6 F6:2 ' +
          'G6:4 F6:2 D6:2 C6:8 ' +
          'Bb5:4 G5:2 F5:2 G5:4 Bb5:4 ' +
          'C6:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 5 — TRẦN / BẠCH ĐẰNG 1288 "Cọc gỗ, nước triều". D minor, 150 BPM.
  // Heroic battle march: war drums, brass melody, an F-major chorus with
  // choir, and a "tide" bridge where rowing (3+3+2) bass and đàn nhị rise
  // over a long brass counter.  Intro(4) -> A B A2 B2 C.  ≈ 64 s loop.
  stage5: {
    bpm: 150, scale: SC.Dmin, intro: ['I'], loop: ['A', 'B', 'A2', 'B2', 'C'],
    mix: { lead: 1.1, brass: 0.95, pad: 0.95, bass: 0.9, timp: 1.0, drums: 1.05 },
    sections: {
      I: {
        bars: 4, chords: 'Dm Dm C A', pad: 'swell', padVel: 0.8, bass: 'long',
        drums: 'bdIn bdIn bdIn2 bdIn2', timp: 'roll2 roll2 roll2 roll',
        lead:
          'r:8 A4:3 A4:1 D5:4 ' +
          'F5:6 E5:2 D5:8 ' +
          'r:8 G4:3 G4:1 C5:4 ' +
          'E5:6 D5:2 C#5:8',
      },
      A: {
        bars: 8, chords: 'Dm Bb C Dm Dm Bb Gm A', pad: 'hold', padVel: 0.65,
        bass: 'march', drums: 'bdMarchC bdMarch bdMarch bdMarch2 bdMarch bdMarch bdMarch2 bdF',
        stab: 'syncA', timp: 'march', leadVel: 1.0,
        lead:
          'D5:3 F5:1 A5:4 G5:2 F5:2 D5:4 ' +
          'F5:3 G5:1 A5:4 C6:4 Bb5:4 ' +
          'C6:3 A5:1 G5:4 E5:2 G5:2 C6:4 ' +
          'A5:12 r:2 A4:2 ' +
          'D5:3 F5:1 A5:4 D6:4 C6:4 ' +
          'D6:3 C6:1 A5:4 F5:4 D5:4 ' +
          'G5:4 Bb5:4 D6:4 C6:2 Bb5:2 ' +
          'A5:4 C#6:4 E6:8',
      },
      B: {
        bars: 8, chords: 'F C Dm Bb F C Bb A', pad: 'hold', padVel: 0.95, choir: 0.45,
        bass: 'drive8', drums: 'bdBigC bdBig bdBig bdBig bdBigC bdBig bdBig bdF',
        stab: 'hits4 hits4 hits4 push', timp: 'march march march roll2', harm: 'dia3', leadVel: 0.9,
        lead:
          'A5:4 C6:4 F6:6 E6:2 ' +
          'E6:4 D6:2 C6:2 G5:8 ' +
          'A5:4 C6:4 D6:4 F6:4 ' +
          'F6:6 E6:2 D6:8 ' +
          'C6:4 F6:4 A6:6 G6:2 ' +
          'G6:4 E6:2 C6:2 G6:8 ' +
          'F6:4 D6:2 Bb5:2 D6:4 F6:4 ' +
          'E6:8 C#6:8',
      },
      A2: null, B2: null,
      C: {
        bars: 8, chords: 'Gm Dm Gm A Bb F Gm A', pad: 'hold', padVel: 0.85,
        bass: 'tres', drums: 'bdTideC bdTide bdTide bdTide bdTide bdTide bdF bdF',
        arp: 'row', arpInst: 'zither', arpLo: 57, arpVel: 0.55, timp: 'hit1 - hit1 roll2 hit1 - roll2 roll',
        leadInst: 'erhu', leadVel: 1.05, counterInst: 'lead', counterVel: 0.4,
        lead:
          'G5:6 Bb5:2 D6:8 ' +
          'C6:4 A5:2 F5:2 D5:8^ ' +
          'G5:6 A5:2 Bb5:4 D6:4 ' +
          'C#6:12 r:4 ' +
          'D6:6 F6:2 Bb5:8 ' +
          'C6:4 A5:2 C6:2 F6:8 ' +
          'D6:4 Bb5:4 G5:4 Bb5:4 ' +
          'A5:16',
        counter: 'D5:16 F5:16 D5:16 E5:16 F5:16 A5:16 Bb5:16 C#6:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 6 — HỒ / TÂY ĐÔ "Thành đá trong mưa". C minor with điệu Nam bends
  // (nhấn / rơi on the nhị), 128 BPM. Stern and heavy: low strings, stone
  // knocks, war drums, đàn đá (lithophone) ostinati, a Neapolitan Db, and a
  // rain-dirge bridge where the stones carry the tune.
  // Intro(4) -> A B A2 B2 C.  ≈ 75 s loop.
  stage6: {
    bpm: 128, scale: [0, 2, 3, 5, 7, 8, 10], intro: ['I'], loop: ['A', 'B', 'A2', 'B2', 'C'],
    mix: { lead: 1.1, pad: 1.05, arp: 0.9, bass: 1.0, drums: 1.05 },
    sections: {
      I: {
        bars: 4, chords: 'Cm Cm Ab G', pad: 'swell', padVel: 0.9, padLo: 43, padHi: 67,
        bass: 'long', drums: 'tdIn tdIn tdIn tdInF', counterInst: 'da', counterVel: 1,
        counter:
          'C5:2 Eb5:2 F5:2 G5:2 Bb5:4 G5:4 ' +
          'F5:2 Eb5:2 C5:4 r:8 ' +
          'C5:2 Eb5:2 F5:2 G5:2 C6:4 Bb5:4 ' +
          'G5:12 r:4',
      },
      A: {
        bars: 8, chords: 'Cm Cm Ab Bb Cm Fm Ab G', pad: 'hold', padVel: 0.8, padLo: 43, padHi: 67,
        bass: 'drive8', drums: 'tdAC tdA tdA tdA2 tdA tdA tdA2 tdF',
        arp: 'ost', arpInst: 'da', arpLo: 60, arpVel: 0.6,
        leadInst: 'erhu', leadVel: 1.05,
        lead:
          'G4:4 C5:4 Eb5:6 F5:2 ' +
          'Eb5:4 C5:2 Bb4:2 C5:8_ ' +
          'Ab4:4 C5:4 Eb5:4 F5:4 ' +
          'F5:6 Eb5:2 D5:8 ' +
          'G5:4 F5:2 Eb5:2 C5:4 G4:4 ' +
          'Ab4:4 C5:2 Eb5:2 F5:8^ ' +
          'Eb5:3 F5:1 Eb5:4 C5:4 Eb5:4 ' +
          'D5:4 B4:4 G4:8',
      },
      B: {
        bars: 8, chords: 'Fm Cm Ab Eb Fm Cm Db G', pad: 'hold', padVel: 1, padLo: 43, padHi: 67,
        choir: 0.45, choirLo: 50, choirHi: 70,
        bass: 'hook8', drums: 'tdBC tdB tdB tdB tdBC tdB tdB tdF',
        stab: 'hits4 hits4 hits4 push', timp: 'march march march roll2',
        harm: 'oct', leadVel: 0.95,
        lead:
          'F5:4 Ab5:4 C6:6 Bb5:2 ' +
          'G5:4 Eb5:4 C5:8 ' +
          'Eb5:4 F5:2 G5:2 Ab5:6 G5:2 ' +
          'G5:4 F5:2 Eb5:2 Bb4:8 ' +
          'F5:4 Ab5:4 C6:4 Eb6:4 ' +
          'D6:4 C6:2 Bb5:2 G5:8 ' +
          'F5:4 Ab5:4 Db6:8 ' +
          'B5:8 D6:4 G5:4',
      },
      A2: null, B2: null,
      C: {
        bars: 8, chords: 'Ab Eb Fm Cm Ab Eb Db G', pad: 'hold', padVel: 0.85, padLo: 43, padHi: 67,
        bass: 'half', drums: 'tdCC tdC tdC tdC tdC tdC tdA tdF',
        leadInst: 'da', leadVel: 1.1, counterInst: 'erhu', counterVel: 0.5,
        lead:
          'C6:2 Eb6:2 C6:2 Ab5:2 Eb5:8 ' +
          'Bb5:2 G5:2 Eb5:2 G5:2 Bb5:8 ' +
          'C6:2 Ab5:2 F5:2 Ab5:2 C6:8 ' +
          'G5:2 Eb5:2 C5:2 Eb5:2 G5:8 ' +
          'Eb6:2 C6:2 Ab5:2 C6:2 Eb6:8 ' +
          'G6:2 Eb6:2 Bb5:2 G5:2 Eb5:8 ' +
          'F5:2 Ab5:2 Db6:2 F6:2 Db6:8 ' +
          'D6:4 B5:4 G5:8',
        counter: 'C5:16 Bb4:16 Ab4:16 G4:16 C5:16 Bb4:16 Ab4:16 B4:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 7 — LÊ SƠ "Hồng Đức thịnh trị". G major pentatonic (G A B D E),
  // 152 BPM. Bright court festival: đàn nguyệt riffs and arpeggios, phách
  // clicks, sáo verse, brass chorus, a lighter court-dance bridge.
  // Intro(4) -> A B A2 B2 C.  ≈ 63 s loop.
  stage7: {
    bpm: 152, scale: [7, 9, 11, 2, 4], intro: ['I'], loop: ['A', 'B', 'A2', 'B2', 'C'],
    mix: { lead: 1.1, arp: 0.9, brass: 0.85, bass: 0.85 },
    sections: {
      I: {
        bars: 4, chords: 'G G C D', bass: 'pulse', drums: 'lsIn lsIn lsIn lsInF',
        leadInst: 'nguyet', leadVel: 1.05,
        lead:
          'G4:2 B4:2 D5:2 E5:2 D5:2 B4:2 A4:4 ' +
          'G4:2 A4:2 B4:2 D5:2 E5:4 D5:4 ' +
          'E5:2 G5:2 E5:2 D5:2 B4:2 A4:2 G4:4 ' +
          'A4:2 B4:2 D5:2 E5:2 D5:8',
      },
      A: {
        bars: 8, chords: 'G Em C D G Em Am7 D', pad: 'hold', padVel: 0.55,
        bass: 'drive8', drums: 'lsAC lsA lsA lsA2 lsA lsA lsA2 lsF',
        arp: 'arp8', arpInst: 'nguyet', arpLo: 55, arpVel: 0.6, stab: 'syncA',
        leadInst: 'sao', leadVel: 1.05,
        lead:
          'D5:2 E5:2 G5:4 A5:2 G5:2 E5:4 ' +
          'D5:3 E5:1 D5:2 B4:2 D5:8 ' +
          'E5:2 G5:2 A5:4 B5:2 A5:2 G5:4 ' +
          'A5:6 B5:1 A5:1 D5:8* ' +
          'D5:2 E5:2 G5:4 B5:2 D6:2 B5:4 ' +
          'A5:3 B5:1 A5:2 G5:2 E5:8 ' +
          'A5:2 B5:2 A5:2 G5:2 E5:4 G5:4 ' +
          'A5:12 r:4',
      },
      B: {
        bars: 8, chords: 'C D Bm Em C D G G', pad: 'hold', padVel: 0.9,
        bass: 'hook8', drums: 'lsBC lsB lsB lsB lsBC lsB lsB lsF',
        arp: 'arpB', arpInst: 'nguyet', arpLo: 60, arpVel: 0.5, stab: 'hits4 hits4 hits4 push', harm: 'dia3',
        counterInst: 'sao', counterVel: 0.45,
        lead:
          'E5:4 G5:4 E6:6 D6:2 ' +
          'A5:4 B5:2 D6:2 A5:8 ' +
          'B5:4 D6:4 F#6:4 D6:4 ' +
          'E6:12 r:2 D6:2 ' +
          'E6:4 G6:4 E6:4 D6:4 ' +
          'D6:4 E6:2 D6:2 B5:4 A5:4 ' +
          'G5:2 A5:2 B5:2 D6:2 E6:4 D6:4 ' +
          'G6:12 r:4',
        counter: 'G5:16 F#5:16 D5:16 E5:16 G5:16 A5:16 B5:16 D5:16',
      },
      A2: null, B2: null,
      C: {
        bars: 8, chords: 'Em Am7 D G Em Am7 C D', pad: 'hold', padVel: 0.7,
        bass: 'tres', drums: 'lsCC lsC lsC lsC lsCC lsC lsC lsF',
        arp: 'glow', arpInst: 'nguyet', arpLo: 59, arpVel: 0.55,
        leadInst: 'sao', leadVel: 1.05, counterInst: 'erhu', counterVel: 0.4,
        lead:
          'B5:4 G5:2 E5:2 B5:4 D6:4 ' +
          'E6:4 D6:2 B5:2 A5:8 ' +
          'A5:4 B5:2 A5:2 D6:4 A5:4 ' +
          'B5:4 A5:2 E5:2 G5:8 ' +
          'E5:2 G5:2 B5:2 D6:2 E6:4 D6:4 ' +
          'B5:4 A5:2 G5:2 E5:8 ' +
          'G5:2 A5:2 G5:2 E5:2 D5:4 E5:4 ' +
          'D5:16',
        counter: 'E5:16 C5:16 F#5:16 D5:16 B4:16 C5:16 E5:16 F#5:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 8 — PHỐ HIẾN & HỘI AN "Đèn lồng bến cảng". A điệu Nam colour
  // (A C D E G with nhấn / rơi bends), 104 BPM, lilting 3+3+2. Đàn bầu solo
  // (portamento, whammy vibrato, bends), warm merchant harmony with a
  // Western ii–V and a leading-tone E7, and a koto-tinted bridge (A in-scale
  // A Bb D E F) under a small chiêng.  Intro(4) -> A B C A2.  ≈ 74 s loop.
  stage8: {
    bpm: 104, scale: [9, 0, 2, 4, 7], intro: ['I'], loop: ['A', 'B', 'C', 'A2'],
    mix: { lead: 1.2, arp: 0.8, pad: 0.9, bass: 0.85, drums: 0.95 },
    sections: {
      I: {
        bars: 4, chords: 'Am Am Fmaj7 E7sus4', pad: 'swell', padVel: 0.7,
        bass: 'long', drums: 'phIn phIn phIn phIn', arp: 'glow', arpInst: 'bell', arpLo: 69, arpVel: 0.5,
        leadInst: 'bau', leadVel: 1.05,
        lead:
          'r:4 E5:4 A5:8^ ' +
          'G5:4 E5:2 D5:2 E5:8 ' +
          'r:4 C5:2 D5:2 E5:4 G5:4 ' +
          'E5:12_ r:4',
      },
      A: {
        bars: 8, chords: 'Am Em F G Am Em Dm7 E7', pad: 'hold', padVel: 0.6,
        bass: 'lilt', drums: 'phAC phA phA phA2 phA phA phA2 phF',
        arp: 'arp8', arpInst: 'nguyet', arpLo: 57, arpVel: 0.5,
        leadInst: 'bau', leadVel: 1.1,
        lead:
          'A4:3 C5:1 D5:4 E5:6^ D5:2 ' +
          'E5:4 G5:2 E5:2 D5:4 C5:4 ' +
          'A4:4 C5:2 D5:2 E5:4~ G5:4 ' +
          'D5:12_ r:4 ' +
          'A5:3 G5:1 E5:4 D5:2 E5:2 G5:4 ' +
          'E5:4 D5:2 C5:2 A4:8^ ' +
          'C5:3 D5:1 E5:4 G5:4~ A5:4 ' +
          'G#5:8 E5:8_',
      },
      B: {
        bars: 8, chords: 'Fmaj7 G Em7 Am Dm7 G7 Cmaj7 E7', pad: 'hold', padVel: 0.85,
        bass: 'walk', drums: 'phBC phB phB phB phBC phB phB phF',
        arp: 'arpB', arpInst: 'nguyet', arpLo: 57, arpVel: 0.45,
        leadInst: 'sao', leadVel: 1.0, counterInst: 'bau', counterVel: 0.55,
        lead:
          'A5:4 C6:4 E6:6 D6:2 ' +
          'D6:4 B5:2 G5:2 D6:8 ' +
          'E6:4 D6:2 B5:2 G5:4 E5:4 ' +
          'A5:12 r:4 ' +
          'F5:4 A5:4 C6:6 D6:2 ' +
          'B5:4 D6:2 F6:2 D6:8 ' +
          'E6:4 D6:2 C6:2 G5:4 B5:4 ' +
          'B5:8 G#5:8',
        counter: 'C5:16 B4:16 G4:16 C5:16 A4:16 B4:16 G4:16 G#4:16',
      },
      C: {
        bars: 8, chords: 'Am Bbmaj7 Dm Am Am Bbmaj7 Dm E7', pad: 'hold', padVel: 0.7,
        bass: 'tres', drums: 'phCC phC phC phC phC phC phC phF',
        arp: 'glow', arpInst: 'bell', arpLo: 69, arpVel: 0.4,
        leadInst: 'zither', leadVel: 1.25, counterInst: 'bau', counterVel: 0.6,
        lead:
          'A5:2 Bb5:2 D6:4 E6:4 D6:4 ' +
          'Bb5:4 A5:2 F5:2 E5:8 ' +
          'D5:2 E5:2 F5:4 A5:4 Bb5:4 ' +
          'A5:12 r:4 ' +
          'E6:2 F6:2 E6:2 D6:2 Bb5:4 A5:4 ' +
          'Bb5:4 D6:2 Bb5:2 A5:8 ' +
          'F5:2 E5:2 D5:2 F5:2 A5:4 D6:4 ' +
          'B5:8 G#5:8',
        counter: 'E5:16 D5:16 F5:16 E5:16^ C5:16 D5:16 A4:16 B4:16',
      },
      A2: null, // filled below
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 9 — TÂY SƠN "Thần tốc mùa xuân Kỷ Dậu". G minor, 172 BPM. Fast and
  // fierce: trống trận ensemble (big/medium/small war drums, toms, bronze),
  // twang volleys, đàn nhị verse, a triumphant Bb-major brass chorus, a
  // lightning 16th-note bridge and an 8-bar drum-ensemble break.
  // Intro(4) -> A B A2 B2 C T.  ≈ 67 s loop.
  stage9: {
    bpm: 172, scale: [7, 9, 10, 0, 2, 3, 5], intro: ['I'], loop: ['A', 'B', 'A2', 'B2', 'C', 'T'],
    mix: { lead: 1.1, brass: 0.95, bass: 0.9, drums: 1.1, timp: 1.05 },
    sections: {
      I: {
        bars: 4, chords: 'Gm Gm Gm D7', pad: 'swell', padVel: 0.8, bass: 'ost16',
        drums: 'tsIn tsIn tsIn2 tsIn2', timp: 'hit1 hit1 roll2 roll',
        counterInst: 'lead', counterVel: 0.8,
        counter: 'r:16 r:16 G4:2 G4:2 Bb4:2 C5:2 D5:8 F5:2 F5:2 D5:2 C5:2 D5:4 A4:4',
      },
      A: {
        bars: 8, chords: 'Gm F Eb D Gm F Eb,F D', pad: 'hold', padVel: 0.65,
        bass: 'gallop', drums: 'tsAC tsA tsA tsA2 tsA tsA tsA2 tsF',
        arp: 'cross2', arpInst: 'twang', arpLo: 55, arpVel: 0.6, stab: 'syncB',
        leadInst: 'erhu', leadVel: 1.05,
        lead:
          'G5:2 Bb5:2 C6:2 D6:2 C6:2 Bb5:2 G5:4 ' +
          'F5:2 G5:2 Bb5:2 C6:2 A5:8 ' +
          'G5:2 Bb5:2 C6:2 D6:2 Eb6:4 D6:4 ' +
          'D6:4 C6:2 A5:2 F#5:8 ' +
          'G5:2 Bb5:2 D6:2 G6:2 F6:2 D6:2 C6:4 ' +
          'D6:2 C6:2 Bb5:2 G5:2 F5:4 A5:4 ' +
          'Bb5:4 G5:4 C6:4 A5:4 ' +
          'D6:12 r:4',
      },
      B: {
        bars: 8, chords: 'Bb F Gm Eb Bb F Eb F', pad: 'hold', padVel: 0.95, choir: 0.5,
        bass: 'drive8', drums: 'tsBC tsB tsB tsB tsBC tsB tsB tsF',
        stab: 'hits4 hits4 hits4 push', timp: 'march march march roll2', harm: 'dia3', leadVel: 1.0,
        lead:
          'D5:4 F5:4 Bb5:6 A5:2 ' +
          'C6:4 A5:2 F5:2 C6:8 ' +
          'Bb5:4 D6:4 G6:6 F6:2 ' +
          'Eb6:4 D6:2 C6:2 Bb5:8 ' +
          'F6:4 D6:4 Bb5:6 C6:2 ' +
          'C6:4 A5:2 C6:2 F6:8 ' +
          'G6:4 F6:2 Eb6:2 D6:4 C6:4 ' +
          'D6:4 Eb6:4 F6:8',
      },
      A2: null, B2: null,
      C: {
        bars: 8, chords: 'Cm Gm Cm D Cm Gm Eb D', pad: 'hold', padVel: 0.8,
        bass: 'ost16', drums: 'tsDr1C tsDr1 tsDr1 tsF tsDr1 tsDr1 tsDr2 tsF',
        arp: 'up16', arpInst: 'twang', arpLo: 55, arpVel: 0.45, timp: 'hit1 - hit1 roll2',
        leadInst: 'erhu', leadVel: 1.05, harm: 'oct',
        lead:
          'C6:1 D6 Eb6 D6 C6 Bb5 G5 Bb5 C6:4 G5:4 ' +
          'D6:1 Bb5 G5 Bb5 D6 F6 D6 Bb5 G5:8 ' +
          'Eb6:1 D6 C6 Bb5 C6 Eb6 G6 Eb6 C6:4 G5:4 ' +
          'F#5:4 A5:4 D6:8 ' +
          'C6:1 D6 Eb6 G6 F6 Eb6 D6 C6 Eb6:4 C6:4 ' +
          'Bb5:1 C6 D6 F6 G6 F6 D6 Bb5 G5:4 Bb5:4 ' +
          'Eb6:2 D6:2 C6:2 Bb5:2 G5:4 Bb5:4 ' +
          'A5:4 D6:4 F#6:8',
      },
      T: {
        bars: 8, chords: 'Gm Gm Gm Gm Eb F D D', pad: 'hold', padVel: 0.7,
        bass: 'gallop', drums: 'tsDr1C tsDr2 tsDr3 tsDr2 tsDr3 tsDr3 tsDr3 tsDrF',
        stab: '- - - - hits4 hits4 hits4 push', timp: 'hit1 hit1 hit1 roll2 march march roll2 roll',
        lead: 'r:64 Eb5:16 F5:16 F#5:16 A5:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // STAGE 10 — NGUYỄN / HUẾ "Hoàng thành lúc hoàng hôn" (FINAL). D with điệu
  // Nam colour (D F G A C, bends) for sunset, 96 BPM kèn bầu prelude, then a
  // 140 BPM processional: court drums, phách, đàn nhị, kèn bầu chorus with
  // choir, a night bridge under the temple bell, and a climax that turns to D
  // major (Bắc) with brass, choir and kèn counter-line.
  // Intro(4 @96) -> A B A2 C D.  ≈ 69 s loop.
  stage10: {
    bpm: 140, scale: SC.Dmin, intro: ['I'], loop: ['A', 'B', 'A2', 'C', 'D'],
    mix: { lead: 1.1, pad: 1.0, brass: 0.9, bass: 0.9, timp: 1.0 },
    sections: {
      I: {
        bars: 4, bpm: 96, chords: 'Dm Dm Gm7 A7sus4', pad: 'swell', padVel: 0.8,
        bass: 'long', drums: 'hueIn hueIn2 hueIn hueInF', leadInst: 'ken', leadVel: 1.0,
        lead:
          'A4:4 D5:4 F5:6^ G5:2 ' +
          'A5:6 G5:1 F5:1 D5:8_ ' +
          'C5:4 D5:2 F5:2 G5:4 C6:4 ' +
          'A5:12_ r:4',
      },
      A: {
        bars: 8, chords: 'Dm C Bb A Dm F Gm7 A7sus4,A7', pad: 'hold', padVel: 0.65,
        bass: 'march', drums: 'hueAC hueA hueA hueA2 hueA hueA hueA2 hueF',
        arp: 'arp8', arpInst: 'zither', arpLo: 62, arpVel: 0.5, timp: 'hit1 - hit1 - hit1 - hit1 roll2',
        leadInst: 'erhu', leadVel: 1.05,
        lead:
          'D5:3 F5:1 G5:4 A5:6 C6:2 ' +
          'G5:4 F5:2 D5:2 E5:8 ' +
          'D5:3 F5:1 G5:4 F5:4 D5:4 ' +
          'C#5:4 E5:4 A5:8 ' +
          'A5:3 C6:1 D6:4 C6:2 A5:2 G5:4 ' +
          'A5:4 F5:2 G5:2 C6:8^ ' +
          'Bb5:4 A5:2 G5:2 F5:4 D5:4 ' +
          'E5:8 C#5:8',
      },
      B: {
        bars: 8, chords: 'Bb C Am7 Dm Gm7 C F A7', pad: 'hold', padVel: 0.95, choir: 0.5,
        bass: 'hook8', drums: 'hueBC hueB hueB hueB hueBC hueB hueB hueF',
        arp: 'arpB', arpInst: 'zither', arpLo: 62, arpVel: 0.45, timp: 'march march march roll2',
        stab: '- - - push - - - push', leadInst: 'ken', leadVel: 1.0, harm: 'oct',
        lead:
          'D6:6 C6:1 Bb5:1 A5:4 F5:4 ' +
          'G5:4 A5:2 C6:2 E6:8 ' +
          'C6:6 A5:2 G5:4 E5:4 ' +
          'F5:4 E5:2 D5:2 A5:8_ ' +
          'Bb5:6 A5:1 G5:1 F5:4 D5:4 ' +
          'E5:4 G5:2 C6:2 E6:8 ' +
          'F6:4 E6:2 C6:2 A5:4 C6:4 ' +
          'C#6:8 E6:8',
      },
      A2: null,
      C: {
        bars: 8, chords: 'Gm7 Dm Bb F Gm7 Dm Eb A7', pad: 'hold', padVel: 0.8, choir: 0.4,
        bass: 'half', drums: 'hueNiteC hueNite2 hueNite hueNite2 hueNite hueNite2 hueNite hueF',
        arp: 'glow', arpInst: 'zither', arpLo: 62, arpVel: 0.45,
        leadInst: 'erhu', leadVel: 1.0, counterInst: 'sao', counterVel: 0.45,
        lead:
          'G5:6 Bb5:2 D6:8 ' +
          'C6:4 A5:2 F5:2 D5:8^ ' +
          'F5:6 G5:2 Bb5:8 ' +
          'A5:4 G5:2 F5:2 C5:8 ' +
          'G5:6 A5:2 Bb5:4 D6:4 ' +
          'F6:4 D6:2 C6:2 A5:8_ ' +
          'G5:4 Bb5:4 Eb6:8 ' +
          'C#6:8 E6:8',
        counter: 'D5:16 F5:16 F5:16 A4:16 Bb4:16 A4:16 G4:16 A4:16',
      },
      D: {
        bars: 8, chords: 'G A F#m Bm G A Bm,A D', pad: 'hold', padVel: 1.05, choir: 0.7,
        bass: 'drive8', drums: 'hueClimC hueClim hueClim hueClim hueClimC hueClim hueClim hueF',
        arp: 'up16', arpInst: 'zither', arpLo: 64, arpVel: 0.4, timp: 'march march march roll2 march march march roll',
        stab: 'hits4', harm: 'oct', leadVel: 1.0, counterInst: 'ken', counterVel: 0.45,
        lead:
          'B5:4 D6:4 G6:6 F#6:2 ' +
          'E6:4 C#6:2 A5:2 E6:8 ' +
          'F#6:4 E6:2 C#6:2 A5:8 ' +
          'B5:4 C#6:2 D6:2 F#6:8 ' +
          'G6:6 F#6:1 E6:1 D6:4 B5:4 ' +
          'C#6:4 E6:2 A6:2 E6:8 ' +
          'F#6:4 D6:2 B5:2 C#6:4 E6:4 ' +
          'D6:16',
        counter: 'D5:16 E5:16 C#5:16 D5:16 B4:16 C#5:16 D5:8 C#5:8 A4:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // BOSS — "Cỗ máy Thời Ảnh". E phrygian against an F/E slash chord and a
  // Bb tritone, 166 BPM: machine bass pistons, bronze drums struck like
  // anvils, gong crashes, brass synth lead.
  // Intro(2, once) -> A(8) -> B(8) -> A2(8) -> T(4) -> back to A.  ≈ 40 s loop.
  boss: {
    bpm: 166, scale: [4, 5, 7, 9, 11, 0, 2], intro: ['I'], loop: ['A', 'B', 'A2', 'T'],
    mix: { lead: 1.15, bass: 0.9, brass: 0.9, pad: 0.8, drums: 1.05 },
    sections: {
      I: { bars: 2, chords: 'Em F/E', bass: 'mach', drums: 'bsIntro bsFill', stab: 'boss2 boss1', timp: 'hit1 roll2' },
      A: {
        bars: 8, chords: 'Em F/E Em Bb Em F/E C B7', pad: 'hold', padVel: 0.6,
        bass: 'mach', drums: 'bsBeatC bsBeat bsBeat2 bsFill bsBeatC bsBeat bsBeat2 bsFill',
        stab: 'boss2', timp: 'boss - boss - boss - boss roll2', arp: 'ost', arpInst: 'twang', arpLo: 52, arpVel: 0.5,
        lead:
          'E5:2 E5:2 F5:4 E5:2 B4:2 E5:4 ' +
          'F5:2 G5:2 A5:4 G5:2 F5:2 E5:4 ' +
          'B5:4 A5:2 G5:2 F5:4 E5:4 ' +
          'F5:6 D5:2 Bb4:8 ' +
          'E6:2 E6:2 D6:4 B5:2 G5:2 E5:4 ' +
          'F5:2 E5:2 F5:4 A5:4 C6:4 ' +
          'B5:4 A5:2 G5:2 E5:4 C6:4 ' +
          'B5:4 D#6:4 F#6:4 A6:4',
      },
      B: {
        bars: 8, chords: 'Am Bb Am Bb Gm A Bb B7', pad: 'hold', padVel: 0.7,
        bass: 'ost16b', drums: 'bsGongC bsBeat bsBeat2 bsFill bsGong bsBeat bsBeat2 bsFill',
        stab: 'boss1', arp: 'ost', arpLo: 64, arpVel: 0.55,
        lead:
          'A5:4 C6:2 B5:2 E6:8 ' +
          'D6:4 Bb5:2 F5:2 D6:8 ' +
          'C6:4 A5:2 E5:2 Eb6:8 ' +
          'D6:4 F6:2 D6:2 Bb5:8 ' +
          'G5:4 Bb5:2 D6:2 Db6:8 ' +
          'C#6:4 E6:2 A6:2 G6:8 ' +
          'F6:4 D6:2 Bb5:2 F5:8 ' +
          'F#5:4 A5:4 B5:4 D#6:4',
      },
      A2: null, // filled below
      T: {
        bars: 4, chords: 'C B7 C B7', pad: 'hold', padVel: 0.8, bass: 'mach ost16b mach ost16b',
        drums: 'bsGongC bsBeat2 bsBeat2 bsFill', stab: 'boss1', timp: 'hit1 hit1 hit1 roll', leadVel: 1,
        lead: 'E6:16 D#6:16 E6:8 F6:8 F#6:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // FINAL BOSS — "Thời Ảnh tối thượng". D phrygian / A7b9, 176 BPM. Machine
  // war drums, kèn bầu turned menacing, and an "M" section where the Lạc Hồng
  // theme fights back in D major (brass, choir, nhị counter) before the
  // darkness answers with the same motif bent into phrygian.
  // Intro(4, once) -> A B A2 M C B2 T.  ≈ 71 s loop.
  bossFinal: {
    bpm: 176, scale: [2, 3, 5, 7, 9, 10, 0], intro: ['I'], loop: ['A', 'B', 'A2', 'M', 'C', 'B2', 'T'],
    mix: { lead: 1.15, bass: 0.95, brass: 0.95, pad: 0.85, timp: 1.15, drums: 1.05 },
    sections: {
      I: {
        bars: 4, chords: 'Dm Eb Dm A7b9', pad: 'swell', padVel: 0.9, bass: 'ost16',
        drums: 'fIntro fFill fIntro fFill', stab: 'boss2 boss1 boss2 boss1', timp: 'hit1 roll2 hit1 roll',
        counterInst: 'zither', counterVel: 0.9,
        counter: 'D5:1 A5 D6 Eb6 D6 A5 D5 A4 D5:8 r:16 D5:1 A5 D6 E6 F6 E6 C#6 A5 D6:8 r:16',
      },
      A: {
        bars: 8, chords: 'Dm Eb Dm Eb Gm Eb A7b9 A7b9', pad: 'hold', padVel: 0.65,
        bass: 'ost16', drums: 'fWarC fWar fWar fFill fWarC fWar fWar fFill',
        stab: 'boss2', timp: 'boss - boss - boss - boss roll2',
        lead:
          'D5:4 A5:4 Ab5:2 A5:2 D6:4 ' +
          'Eb6:4 D6:2 A5:2 Bb5:8 ' +
          'D5:4 A5:4 Ab5:2 A5:2 F6:4 ' +
          'G6:4 F6:2 Eb6:2 D6:8 ' +
          'G5:2 Bb5:2 D6:4 C6:2 Bb5:2 G5:4 ' +
          'Bb5:2 G5:2 Eb5:4 F5:2 G5:2 Bb5:4 ' +
          'A5:4 C#6:4 E6:4 G6:4 ' +
          'F6:4 Eb6:2 C#6:2 A5:8',
      },
      B: {
        bars: 8, chords: 'Gm Dm Eb Bb Gm Dm Eb A7b9', pad: 'hold', padVel: 0.75,
        bass: 'ost16b', drums: 'fTaiko fTaiko fTaiko fFill fTaiko fTaiko fTaiko fFill',
        stab: 'boss1', arp: 'kotek', arpInst: 'zither', arpLo: 62, arpVel: 0.45,
        leadInst: 'ken', leadVel: 1.05, harm: 'oct',
        lead:
          'G5:3 A5:1 Bb5:4 D6:8 ' +
          'F6:3 Eb6:1 D6:4 A5:8 ' +
          'Eb6:2 D6:2 C6:2 Bb5:2 G5:4 Bb5:4 ' +
          'D6:12 r:4 ' +
          'G5:3 A5:1 Bb5:4 Eb6:8 ' +
          'D6:3 C6:1 A5:4 F5:8 ' +
          'G5:2 Bb5:2 Eb6:2 G6:2 F6:4 Eb6:4 ' +
          'C#6:8 A5:4 E5:4',
      },
      A2: null, B2: null,
      M: {
        bars: 8, chords: LH_CHORDS, pad: 'hold', padVel: 1, choir: 0.75,
        bass: 'drive8', drums: 'fHeroC fHero fHero fHero fHeroC fHero fHero fFill',
        stab: 'hits4 hits4 hits4 push', arp: 'up16', arpInst: 'zither', arpLo: 62, arpVel: 0.4,
        timp: 'march march march roll2', harm: 'oct', leadVel: 1.05, lead: LH_THEME,
        counterInst: 'erhu', counterVel: 0.42, counter: LH_COUNTER,
      },
      C: {
        bars: 8, chords: 'Bb A Gm A Bb A Bb,C A7b9', pad: 'hold', padVel: 0.95, choir: 0.55,
        bass: 'half half half half ost16 ost16 ost16 ost16b', drums: 'fHalfC fHalf fHalf fHalf fWarC fWar fWar fFill',
        timp: 'roll2 hit1 roll2 hit1 march march march roll2', arp: 'sweep', arpInst: 'zither', arpLo: 57, arpVel: 0.5,
        harm: 'dia3', leadVel: 1,
        lead:
          'A4:3 D5:1 Eb5:4 A5:6 G5:1 Eb5:1 ' +
          'G5:4 Eb5:2 D5:2 C#5:8 ' +
          'A4:3 D5:1 Eb5:4 Bb5:6 A5:1 G5:1 ' +
          'A5:4 G5:2 E5:2 C#6:8 ' +
          'D6:3 Bb5:1 A5:4 Bb5:2 D6:2 F6:4 ' +
          'E6:4 C#6:4 A5:8 ' +
          'D6:4 F6:4 G6:4 E6:4 ' +
          'C#6:16',
      },
      T: {
        bars: 4, chords: 'Eb A7b9 Eb A7b9', pad: 'hold', padVel: 0.9, bass: 'ost16 ost16b ost16 ost16b',
        drums: 'fWarC fWar fWar fFill', stab: 'boss1', timp: 'hit1 hit1 hit1 roll', harm: 'oct',
        lead: 'G6:16 E6:16 Eb6:8 E6:8 C#6:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // CLEAR — fanfare on the Lạc Hồng head (D, 128 BPM, 4 bars ≈ 7.5 s, with a
  // bVI–bVII lift) flowing into a calm results loop (88 BPM, 16 bars ≈ 44 s):
  // sáo over bells, then đàn tranh with a nhị counter.
  clear: {
    bpm: 128, scale: SC.Dbac, intro: ['F'], loop: ['R1', 'R2'],
    mix: { lead: 1.0, pad: 1.0, arp: 0.8 },
    sections: {
      F: {
        bars: 4, chords: 'D G,A Bb,C D', pad: 'hold', padVel: 1, choir: 0.5, bass: 'half half half long',
        drums: 'fan1 fanB fanRoll fan1', timp: 'hit1 hit13 roll hit1', stab: '- - - fanf', harm: 'dia3',
        lead:
          'A4:3 D5:1 E5:4 A5:8 ' +
          'G5:4 E5:4 A5:6 B5:2 ' +
          'D6:6 Bb5:2 C6:6 E6:2 ' +
          'D6:14 r:2',
      },
      R1: {
        bars: 8, bpm: 88, chords: 'G A F#m Bm Em7 A Dsus2 D', pad: 'hold', padVel: 0.8,
        bass: 'res', drums: 'res res res res res res res resB', arp: 'bell4', arpInst: 'bell', arpLo: 74, arpVel: 0.6,
        leadInst: 'sao', leadVel: 0.95,
        lead:
          'B4:4 D5:4 E5:6 D5:2 ' +
          'E5:8 A4:8 ' +
          'A4:4 B4:2 D5:2 E5:8 ' +
          'D5:12 r:4 ' +
          'G5:4 E5:4 B5:6 A5:2 ' +
          'A5:8 E5:8 ' +
          'D5:4 E5:4 A5:8 ' +
          'D5:12 r:4',
      },
      R2: {
        bars: 8, bpm: 88, chords: 'G A F#m Bm Em7 A Dsus2 D', pad: 'hold', padVel: 0.85,
        bass: 'res', drums: 'resB', arp: 'arp8', arpInst: 'zither', arpLo: 62, arpVel: 0.5,
        counterInst: 'erhu', counterVel: 0.5,
        counter: 'B4:8 D5:8 C#5:8 E5:8 A4:8 C#5:8 B4:8 D5:8 G4:8 B4:8 A4:8 C#5:8 A4:16 F#4:16',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // GAME OVER — 2 bars at 92 BPM (≈ 5.2 s), D minor, a đàn bầu sigh that
  // droops on the last note under a temple bell. No loop.
  gameover: {
    bpm: 92, scale: SC.Dmin, intro: ['G'], loop: [],
    mix: { lead: 1.5, pad: 1.4, bass: 0.9, timp: 1.2 },
    sections: {
      G: {
        bars: 2, chords: 'Gm,Dm A7,Dm', pad: 'hold', padVel: 0.9, bass: 'half', timp: 'hit1', drums: 'goBell',
        leadInst: 'bau', leadVel: 1.0,
        lead: 'A5:6 G5:2 F5:4 D5:4 E5:4 C#5:4 D5:8_',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // ENDING — "Nghìn năm văn hiến". D điệu Bắc, 96 BPM, warm and majestic.
  // Swell(2, once) -> A(8, sáo: the theme's head, softly) -> B(8, the full
  // Lạc Hồng theme: brass + choir) -> C(8, đàn nhị) -> B2(8, theme with
  // choir, stabs and nhị counter).  ≈ 80 s loop.
  ending: {
    bpm: 96, scale: SC.Dbac, intro: ['S'], loop: ['A', 'B', 'C', 'B2'],
    mix: { lead: 1.05, pad: 1.0, arp: 0.85, timp: 0.8, brass: 0.8 },
    sections: {
      S: {
        bars: 2, chords: 'Dsus2 Asus4,A', pad: 'swell', padVel: 1, bass: 'long',
        timp: 'roll2 roll', drums: 'lhOpen tSwell', arp: 'bell4', arpInst: 'bell', arpLo: 74, arpVel: 0.8,
        counterInst: 'zither', counterVel: 0.8,
        counter: 'r:16 A4:1 B4 D5 E5 G5 A5 B5 D6 E6:8',
      },
      A: {
        bars: 8, chords: 'D G Bm A D G Em7 Asus4,A', pad: 'hold', padVel: 0.75,
        bass: 'walk', drums: 'res res res resB res res res lhFill',
        arp: 'arp8', arpInst: 'zither', arpLo: 62, arpVel: 0.65,
        leadInst: 'sao', leadVel: 1.05,
        lead:
          'A4:3 D5:1 E5:4 A5:8 ' +
          'B5:4 A5:2 G5:2 E5:8 ' +
          'D5:3 E5:1 B4:4 D5:6 E5:2 ' +
          'E5:12 r:4 ' +
          'A4:3 D5:1 E5:4 B5:8 ' +
          'D6:4 B5:2 A5:2 G5:8 ' +
          'E5:4 G5:2 A5:2 B5:4 D6:4 ' +
          'A5:12 r:4',
      },
      B: {
        bars: 8, chords: LH_CHORDS, pad: 'hold', padVel: 1, choir: 0.55,
        bass: 'walk', drums: 'lhMarchC lhMarch lhMarch lhMarch lhBigC lhBig lhBig lhFill',
        timp: 'hit13 hit1 hit1 roll2 march march march roll', arp: 'arpB', arpInst: 'zither', arpLo: 66, arpVel: 0.5,
        stab: '- - - - - - - push', leadVel: 0.95, lead: LH_THEME,
      },
      C: {
        bars: 8, chords: 'Bm G D A Bm G Em7 A', pad: 'hold', padVel: 0.85,
        bass: 'half', drums: 'res resB res resB res resB res lhFill',
        arp: 'bell8', arpInst: 'bell', arpLo: 71, arpVel: 0.5,
        leadInst: 'erhu', leadVel: 1,
        lead:
          'D5:4 F#5:4 B5:6 A5:2 ' +
          'G5:4 E5:2 D5:2 B4:8 ' +
          'A4:4 D5:2 E5:2 F#5:6 A5:2 ' +
          'E5:12 r:4 ' +
          'D6:4 B5:2 A5:2 F#5:4 A5:4 ' +
          'B5:6 D6:2 G5:8 ' +
          'E5:4 G5:2 B5:2 E6:4 D6:4 ' +
          'C#6:8 E6:4 A5:4',
      },
      B2: null, // filled below
    },
  },
};

// Variations built from existing sections.
{
  const T = SONGS.title.sections;
  T.B2 = Object.assign({}, T.B, {
    choir: 0.65, stab: 'hits4 push hits4 push hits4 push hits4 push',
    counterInst: 'erhu', counterVel: 0.42, counter: LH_COUNTER,
  });

  const S1 = SONGS.stage1.sections;
  S1.A2 = Object.assign({}, S1.A, {
    harm: 'p4', arp: 'kotek', arpVel: 0.45, choir: 0.35,
    drums: 'vlAC vlA2 vlA2 vlA vlA2 vlA2 vlA vlF',
  });
  S1.B2 = Object.assign({}, S1.B, {
    harm: 'oct', choir: 0.5, arp: 'arpB', timp: '- - - - - - - roll2',
  });

  const S2 = SONGS.stage2.sections;
  S2.A2 = Object.assign({}, S2.A, {
    harm: 'oct', arp: 'cross', arpVel: 0.6, stab: 'syncB',
    drums: 'alAC alA2 alA2 alA2 alA alA2 alA2 alF',
  });
  S2.B2 = Object.assign({}, S2.B, {
    harm: 'dia3', stab: 'hits4 push hits4 push hits4 push hits4 push',
    counterInst: 'erhu', counterVel: 0.45,
    counter: 'E5:16 F#5:16 G5:16 B5:16 E5:16 F#5:16 F#5:16 D#5:16',
  });

  const S3 = SONGS.stage3.sections;
  S3.A2 = Object.assign({}, S3.A, {
    leadInst: 'zither', leadVel: 1.25, counterInst: 'sao', counterVel: 0.5,
    counter: 'G5:16 F5:16 F5:16 D5:16 G5:16 E5:16 F5:16 D5:16',
    arp: 'glow', arpInst: 'bell', arpLo: 72, arpVel: 0.45,
    drums: 'hlRowC hlRow2 hlRow2 hlRow2 hlRow hlRow2 hlRow2 hlF',
  });
  S3.B2 = Object.assign({}, S3.B, { harm: 'oct', choir: 0.6, timp: 'march march march roll2' });

  const S4 = SONGS.stage4.sections;
  S4.A2 = Object.assign({}, S4.A, {
    harm: 'dia3', arp: 'kotek', arpVel: 0.45, drums: 'lyAC lyB lyA lyB lyA lyB lyA lyF',
  });
  S4.B2 = Object.assign({}, S4.B, {
    leadInst: 'lead', leadVel: 0.95, choir: 0.5, stab: 'hits4 push hits4 push hits4 push hits4 push',
    counterInst: 'erhu', counterVel: 0.42,
    counter: 'D6:16 C6:16 A5:16 F5:16 D6:16 G5:16 C6:16 F5:16',
  });

  const S5 = SONGS.stage5.sections;
  S5.A2 = Object.assign({}, S5.A, {
    harm: 'dia3', stab: 'syncB', counterInst: 'erhu', counterVel: 0.45,
    counter: 'A5:16 F5:16 G5:16 A5:16 F5:16 F5:16 Bb5:16 C#6:16',
    drums: 'bdMarchC bdMarch2 bdMarch2 bdMarch2 bdMarch bdMarch2 bdMarch2 bdF',
  });
  S5.B2 = Object.assign({}, S5.B, {
    harm: 'oct', choir: 0.6, arp: 'arp8', arpInst: 'zither', arpLo: 62, arpVel: 0.45,
  });

  const S6 = SONGS.stage6.sections;
  S6.A2 = Object.assign({}, S6.A, {
    arp: 'kotek', arpVel: 0.55, choir: 0.35, choirLo: 50, choirHi: 70,
    counterInst: 'khen', counterVel: 0.5,
    counter: 'C4:16 C4:16 C4:16 D4:16 C4:16 C4:16 C4:16 B3:16',
    drums: 'tdAC tdA2 tdA2 tdA2 tdA tdA2 tdA2 tdF',
  });
  S6.B2 = Object.assign({}, S6.B, {
    harm: 'dia3', counterInst: 'erhu', counterVel: 0.45,
    counter: 'C5:16 G4:16 C5:16 Bb4:16 C5:16 G4:16 Ab4:16 B4:16',
  });

  const S7 = SONGS.stage7.sections;
  S7.A2 = Object.assign({}, S7.A, {
    leadInst: 'nguyet', leadVel: 1.2, harm: 'oct', counterInst: 'sao', counterVel: 0.45,
    counter: 'B5:16 G5:16 G5:16 F#5:16 B5:16 B5:16 C6:16 A5:16',
    drums: 'lsAC lsA2 lsA2 lsA2 lsA lsA2 lsA2 lsF',
  });
  S7.B2 = Object.assign({}, S7.B, {
    harm: 'oct', choir: 0.45, stab: 'hits4 push hits4 push hits4 push hits4 push', timp: 'march march march roll2',
  });

  const S8 = SONGS.stage8.sections;
  S8.A2 = Object.assign({}, S8.A, {
    counterInst: 'sao', counterVel: 0.45,
    counter: 'E5:16 B4:16 C5:16 D5:16 E5:16 G5:16 F5:16 E5:16',
    arp: 'glow', arpInst: 'bell', arpLo: 69, arpVel: 0.4,
    drums: 'phAC phA2 phA2 phA2 phA phA2 phA2 phF',
  });

  const S9 = SONGS.stage9.sections;
  S9.A2 = Object.assign({}, S9.A, {
    harm: 'oct', arp: 'cross', counterInst: 'lead', counterVel: 0.35,
    counter: 'D5:16 C5:16 Bb4:16 A4:16 D5:16 C5:16 G4:8 A4:8 A4:16',
    drums: 'tsAC tsA2 tsA2 tsA2 tsA tsA2 tsA2 tsF',
  });
  S9.B2 = Object.assign({}, S9.B, {
    harm: 'oct', choir: 0.65, stab: 'hits4 push hits4 push hits4 push hits4 push',
    counterInst: 'erhu', counterVel: 0.45,
    counter: 'F5:16 F5:16 G5:16 G5:16 F5:16 A5:16 Bb5:16 C6:16',
  });

  const S10 = SONGS.stage10.sections;
  S10.A2 = Object.assign({}, S10.A, {
    leadInst: 'ken', leadVel: 0.95, choir: 0.35, counterInst: 'erhu', counterVel: 0.45,
    counter: 'A5:16 G5:16 F5:16 E5:16 F5:16 A5:16 Bb5:16 E5:16',
    drums: 'hueAC hueA2 hueA2 hueA2 hueA hueA2 hueA2 hueF',
  });

  const SB = SONGS.boss.sections;
  SB.A2 = Object.assign({}, SB.A, { harm: 'dia3', stab: 'boss1', arp: 'arpB', arpInst: 'pluck', arpLo: 64, arpVel: 0.5 });

  const SF = SONGS.bossFinal.sections;
  SF.A2 = Object.assign({}, SF.A, {
    harm: 'dia3', stab: 'boss1', arp: 'ost', arpInst: 'twang', arpLo: 62, arpVel: 0.5,
    drums: 'fTaiko fWar fWar fFill fTaiko fWar fWar fFill',
  });
  SF.B2 = Object.assign({}, SF.B, {
    stab: 'hits4', choir: 0.5, timp: 'march march march roll2',
    drums: 'fWarC fWar fWar fFill fWarC fWar fWar fFill',
  });

  const E = SONGS.ending.sections;
  E.B2 = Object.assign({}, E.B, {
    harm: 'dia3', choir: 0.75, stab: 'hits4 push hits4 push hits4 push hits4 push',
    counterInst: 'erhu', counterVel: 0.42, counter: LH_COUNTER,
    drums: 'lhBigC lhBig lhBig lhBig lhBigC lhBig lhBig lhFill',
  });
}

// -----------------------------------------------------------------------------
// 12. Sequencer / song players
// -----------------------------------------------------------------------------
// Lookahead scheduling: a 25 ms timer schedules every 16th-note step that falls
// inside the next LOOKAHEAD seconds with sample-accurate AudioContext times.
// Steps that are already in the past are skipped (never played late in a
// burst); the grid position is preserved so the groove stays intact.
const LOOKAHEAD = 0.16;
const LOOKAHEAD_HIDDEN = 1.2;   // hidden tabs may throttle timers to ~1 Hz
const compiled = Object.create(null);
const players = new Set();
let current = null;
let pendingSong = null;
let duckEnd = 0;
let duckLevel = 1;

function getCompiled(name) {
  if (!compiled[name]) compiled[name] = compileSong(SONGS[name]);
  return compiled[name];
}

class SongPlayer {
  constructor(name, t0) {
    const def = SONGS[name];
    this.name = name;
    this.def = def;
    this.secs = getCompiled(name);
    this.order = def.intro.concat(def.loop);
    this.loopStart = def.intro.length;
    this.idx = 0;
    this.step = 0;
    this.next = t0;
    this.done = false;
    this.stopAt = Infinity;
    this.disposeAt = Infinity;
    this.nodes = [];

    const now = ctx.currentTime;
    this.out = this.g(0);
    this.rev = this.g(0);
    for (const g of [this.out, this.rev]) {
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(1, Math.max(now + 0.01, t0));
    }
    this.out.connect(G.musicIn);
    this.rev.connect(G.musicRev);

    // Tempo-synced stereo ping-pong delay (dotted eighth) for lead and arps.
    const dt = (60 / def.bpm) * 0.75;
    this.dIn = this.g(1);
    const hp = this.keep(mkFilter('highpass', 350, 0.7));
    const lp = this.keep(mkFilter('lowpass', 3400, 0.7));
    const dl = this.keep(ctx.createDelay(2));
    const dr = this.keep(ctx.createDelay(2));
    dl.delayTime.value = dt;
    dr.delayTime.value = dt;
    const fb = this.g(0.34);
    const merge = this.keep(ctx.createChannelMerger(2));
    const wet = this.g(0.5);
    chain(this.dIn, hp, lp, dl, dr, fb, dl);
    dl.connect(merge, 0, 0);
    dr.connect(merge, 0, 1);
    merge.connect(wet);
    wet.connect(this.out);

    const mix = Object.assign({ lead: 1, pad: 1, brass: 1, arp: 1, bass: 1, drums: 1, timp: 1 }, def.mix);
    const bus = (lvl, revAmt, dlyAmt) => {
      const b = this.g(lvl);
      b.connect(this.out);
      if (revAmt) { const s = this.g(revAmt); b.connect(s); s.connect(this.rev); }
      if (dlyAmt) { const s = this.g(dlyAmt); b.connect(s); s.connect(this.dIn); }
      return b;
    };
    this.bus = {
      lead: bus(mix.lead, 0.26, 0.34),
      pad: bus(mix.pad, 0.42, 0),
      brass: bus(mix.brass, 0.22, 0),
      arp: bus(mix.arp, 0.2, 0.3),
      drums: bus(mix.drums * 0.8, 0.05, 0),
      timp: bus(mix.timp, 0.3, 0),
      bass: this.g(mix.bass * 0.7),
    };
    const drive = this.keep(mkShaper(1.4));
    const bassLp = this.keep(mkFilter('lowpass', 3200, 0.7));
    chain(this.bus.bass, drive, bassLp, this.out);
  }
  keep(n) { this.nodes.push(n); return n; }
  g(v) { return this.keep(mkGain(v)); }

  advance() {
    const sec = this.secs[this.order[this.idx]];
    this.next += 60 / sec.bpm / 4;
    if (++this.step >= sec.steps.length) {
      this.step = 0;
      if (++this.idx >= this.order.length) {
        if (this.def.loop.length) this.idx = this.loopStart;
        else { this.done = true; this.disposeAt = Math.min(this.disposeAt, this.next + 5); }
      }
    }
  }

  schedule(until, now) {
    if (this.done || now >= this.stopAt) return;
    // Resync: skip steps that are already due or past (e.g. after a backgrounded
    // tab) instead of bursting them out late; the grid position is preserved.
    let guard = 0;
    while (!this.done && this.next < now + 0.005 && guard++ < 200000) this.advance();
    while (!this.done && this.next < until && this.next < this.stopAt) {
      const sec = this.secs[this.order[this.idx]];
      const sd = 60 / sec.bpm / 4;
      const t = this.next;
      for (const e of sec.steps[this.step]) this.play(e, t + e.off * sd, sd);
      this.advance();
    }
  }

  play(e, t, sd) {
    const fn = INST[e.i];
    if (!fn) return;
    const ev = Object.assign({}, e);
    if (e.d !== undefined) ev.d = Math.max(0.03, e.d * sd);
    if (e.i === 'hat' || e.i === 'pluck') ev.v *= 0.9 + Math.random() * 0.2;   // light humanization
    try { fn(this, t, ev); } catch (err) { /* never let one note break the song */ }
  }

  fadeOut(t, fade) {
    if (this.stopAt !== Infinity) return;
    const f = Math.max(0.03, fade);
    for (const g of [this.out, this.rev]) glide(g.gain, 0, f / 4.5, t);
    this.stopAt = t + f;
    this.disposeAt = Math.min(this.disposeAt, t + f + 3.5);
  }

  dispose() {
    for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    this.nodes.length = 0;
    this.done = true;
  }
}

function tick() {
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    if (ctx.state === 'running') {
      const hidden = typeof document !== 'undefined' && document.hidden;
      const until = now + (hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD);
      for (const p of players) p.schedule(until, now);
    }
    for (const p of players) {
      if (p === current && p.done) current = null;          // one-shot song finished
      if (now > p.disposeAt) { p.dispose(); players.delete(p); }
    }
    sfxPool.sweep(now);
    musicPool.sweep(now);
    for (const l of dyingLoops) if (now > l.stopAt + 0.6) l.dispose();
  } catch (e) { /* keep the timer alive */ }
}

function startSong(name, fade) {
  const now = ctx.currentTime;
  if (current) current.fadeOut(now, fade);
  current = new SongPlayer(name, now + 0.06);
  players.add(current);
  current.schedule(now + LOOKAHEAD, now);
}

// -----------------------------------------------------------------------------
// 13. Public API
// -----------------------------------------------------------------------------
function canPlay() {
  if (!ctx || failed) return false;
  if (ctx.state === 'running') return true;
  // Right after a resume() request (user gesture) the state flips shortly.
  return ctx.state !== 'closed' && nowMs() - resumeAskedAt < 1000;
}

function makeHandle(lp) {
  return {
    set(params) { try { lp.set(params); } catch (e) { /* ignore */ } },
    stop(fade) { try { lp.stop(fade === undefined ? 0.2 : fade); } catch (e) { /* ignore */ } },
  };
}

function createContext() {
  const AC = typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext);
  if (!AC) { failed = true; return; }
  try {
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
    BUF = makeBuffers();
    G = buildGraph();
    sfxPool = new Pool(40);
    musicPool = new Pool(48);
    // iOS unlock: play one silent sample inside the gesture.
    try {
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      b.connect(ctx.destination);
      b.onended = () => { try { b.disconnect(); } catch (e) { /* ignore */ } };
      b.start(0);
    } catch (e) { /* ignore */ }
    if (isPaused) {
      for (const g of G.mPause) g.gain.value = 0.25;
      G.loopBus.gain.value = 0;
    }
    timer = setInterval(tick, 25);
    if (timer && typeof timer.unref === 'function') timer.unref();
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
          try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
        }
      });
    }
  } catch (e) {
    failed = true;
    try { if (ctx && ctx.close) ctx.close(); } catch (e2) { /* ignore */ }
    ctx = null;
    G = null;
  }
}

export const AudioSys = {
  init() {
    if (failed) return;
    try {
      const fresh = !ctx;
      if (fresh) createContext();
      if (!ctx) return;
      if (ctx.state !== 'running' && ctx.state !== 'closed') {
        resumeAskedAt = nowMs();
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      if (fresh && pendingSong) {
        const ps = pendingSong;
        pendingSong = null;
        startSong(ps.name, 0);
      }
    } catch (e) { /* never throw from a gesture handler */ }
  },

  get ready() {
    return !!ctx && ctx.state === 'running';
  },

  setVolume(kind, v) {
    if (!Object.prototype.hasOwnProperty.call(VOL, kind)) return;
    VOL[kind] = clamp(num(v, VOL[kind]), 0, 1);
    if (!ctx) return;
    try {
      const t = ctx.currentTime, g = volGain(VOL[kind]);
      if (kind === 'master') glide(G.master.gain, g, 0.05, t);
      else for (const n of (kind === 'music' ? G.mVol : G.sVol)) glide(n.gain, g, 0.05, t);
    } catch (e) { /* ignore */ }
  },

  playMusic(name, opts) {
    if (!Object.prototype.hasOwnProperty.call(SONGS, name)) return;
    const fade = clamp(num(opts && opts.fade, 1), 0, 20);
    if (!ctx) { if (!failed) pendingSong = { name }; return; }
    try {
      if (current && current.name === name && !current.done && current.stopAt === Infinity) return;
      startSong(name, fade);
    } catch (e) { /* ignore */ }
  },

  stopMusic(fade) {
    pendingSong = null;
    if (!ctx || !current) return;
    try {
      current.fadeOut(ctx.currentTime, clamp(num(fade, 1), 0, 20));
      current = null;
    } catch (e) { /* ignore */ }
  },

  duckMusic(amount, seconds) {
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      let level = 1 - clamp(num(amount, 0.5), 0, 1);
      let end = now + clamp(num(seconds, 0.6), 0, 30);
      if (now < duckEnd) { level = Math.min(level, duckLevel); end = Math.max(end, duckEnd); }
      duckLevel = level;
      duckEnd = end;
      for (const g of G.mDuck) {
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(level, now, 0.03);
        g.gain.setTargetAtTime(1, end, 0.22);
      }
    } catch (e) { /* ignore */ }
  },

  sfx(name, opts) {
    const fn = SFX[name];
    if (!fn || !canPlay()) return;
    try {
      const meta = SFX_META[name] || {};
      const now = ctx.currentTime;
      if (now - (lastPlayed[name] === undefined ? -1 : lastPlayed[name]) < (meta.gap || 0.012)) return;
      lastPlayed[name] = now;
      const o = opts || {};
      const vol = clamp(num(o.vol, 1), 0, 4);
      if (vol <= 0) return;
      let pitch = clamp(num(o.pitch, 1), 0.1, 8);
      if (meta.jit) pitch *= jit(meta.jit);
      const v = new Voice(sfxPool, G.sfxIn, now + 0.006, vol * (meta.vol || 1), clamp(num(o.pan, 0), -1, 1));
      v.p = pitch;
      fn(v, o);
    } catch (e) { /* ignore */ }
  },

  loop(name, opts) {
    const def = LOOPS[name];
    if (!def || !ctx || failed) return NOOP_HANDLE;
    try {
      const lp = new LoopSound(name);
      def(lp);
      if (opts && typeof opts === 'object') lp.set(opts);
      return makeHandle(lp);
    } catch (e) {
      return NOOP_HANDLE;
    }
  },

  voiceBlip(voice, ch) {
    if (!canPlay()) return;
    try { babble(voice, ch); } catch (e) { /* ignore */ }
  },

  setPaused(p) {
    isPaused = !!p;
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      for (const g of G.mPause) glide(g.gain, isPaused ? 0.25 : 1, 0.08, t);
      glide(G.loopBus.gain, isPaused ? 0 : 1, isPaused ? 0.025 : 0.08, t);
    } catch (e) { /* ignore */ }
  },
};

// Test/debug hooks (not used by the game).
export const __audioInternals = {
  SONGS, SFX, LOOPS, compileSong, parseMelody, parseChord, tick,
  INST, DRUM, BASS, ARP, STAB, TIMP, VOICE_DEF, VOICE_ALIAS, vowelOf, latinInfo, babble,
  get ctx() { return ctx; },
  get graph() { return G; },
  get current() { return current; },
  get players() { return players; },
  get pools() { return { sfx: sfxPool, music: musicPool }; },
  get loops() { return { active: activeLoops, dying: dyingLoops }; },
};
