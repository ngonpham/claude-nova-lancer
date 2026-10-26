// World of Pandora: rail path, stage segments, streaming low-poly terrain (bioluminescent rainforest,
// meadows, RDA clear-cut scars, the floating Hallelujah Mountains, reefs and open sea, ridges, RDA bases),
// water, clouds, decorations (giant trees, glowing plants, helicoradians, floating islands, vines, reef
// rocks) and the per-stage palettes. Everything is driven by the current stage definition (stages.js).
import * as THREE from 'three';
import { G, clamp, lerp, smoothstep, Simplex2, fbm2, ridged2, mulberry32, hash2 } from './core.js';
import {
  ATMO, FOG, GLSL_NOISE, GLSL_SKY, GLSL_FOG_FN, patchFog, TEX,
  preparePalette, lerpPalette, applyPalette, makeEnvMap, LIGHTS,
} from './gfx.js';

// ============================================================ Stage segments
// A stage is a list of segments along the rail ({ at, kind, ... }). Neighbouring segments cross-fade over
// BLEND metres so terrain, colours and the path curvature never jump.
const BLEND = 260;
const KIND_DEFAULTS = {
  forest:   { a1: 46, a2: 18, a3: 8 },
  plains:   { a1: 52, a2: 20, a3: 0 },
  scar:     { a1: 30, a2: 10, a3: 0 },
  floating: { a1: 70, a2: 26, a3: 12 },
  fields:   { a1: 48, a2: 18, a3: 0 },
  city:     { a1: 28, a2: 10, a3: 0 },
  water:    { a1: 58, a2: 22, a3: 0 },
  mountain: { a1: 95, a2: 0, a3: 34 },
};
let STAGE = null;
let SEGS = [{ at: 0, kind: 'water', a1: 50, a2: 20, a3: 0 }];
let LOOK = null;

function prepSeg(s) {
  const g = { ...KIND_DEFAULTS[s.kind], river: 0, far: 0, farAt: 1000, density: 0.85, hmul: 1, style: 'mixed', ...s };
  return g;
}

function segAt(d, out) {
  let i = 0;
  while (i + 1 < SEGS.length && SEGS[i + 1].at <= d) i++;
  const cur = SEGS[i], next = SEGS[i + 1], prev = SEGS[i - 1];
  if (next && d > next.at - BLEND) { out.a = cur; out.b = next; out.t = smoothstep(next.at - BLEND, next.at + BLEND, d); }
  else if (prev && d < cur.at + BLEND) { out.a = prev; out.b = cur; out.t = smoothstep(cur.at - BLEND, cur.at + BLEND, d); }
  else { out.a = cur; out.b = cur; out.t = 0; }
  return out;
}
export function segmentAt(d) { const o = segAt(d, {}); return o.t < 0.5 ? o.a : o.b; }

// Weight of a terrain kind at distance d (0..1) — used by wingmen/bosses to stay clear of walls.
const _kw = {};
export function kindW(d, kind) {
  segAt(d, _kw);
  return (_kw.a.kind === kind ? 1 - _kw.t : 0) + (_kw.b.kind === kind ? _kw.t : 0);
}
// City-ish weight (tall buildings beside the corridor)
export function cityW(d) {
  segAt(d, _kw);
  const c = (g) => (g.kind === 'city' || (g.kind === 'water' && (g.shoreL || g.shoreR) && g.style !== 'none')) ? 1 : 0;
  return c(_kw.a) * (1 - _kw.t) + c(_kw.b) * _kw.t;
}

// ============================================================ Rail path
const _ps = {};
export function pathX(d) {
  const s = segAt(d, _ps), A = s.a, B = s.b, t = s.t;
  const a1 = lerp(A.a1, B.a1, t), a2 = lerp(A.a2, B.a2, t), a3 = lerp(A.a3, B.a3, t);
  return a1 * Math.sin(d * 0.0011 + 0.6) + a2 * Math.sin(d * 0.0023 + 2.0) + a3 * Math.sin(d * 0.0041 + 1.1);
}

// Rail frame at distance d: position on the path (y = 0), forward, right, up.
export function railFrame(d, pos, fwd, right) {
  const x = pathX(d);
  const slope = (pathX(d + 2) - pathX(d - 2)) * 0.25;
  if (pos) pos.set(x, 0, -d);
  if (fwd) fwd.set(slope, 0, -1).normalize();
  if (right) right.set(1, 0, slope).normalize();
}

const _rp = new THREE.Vector3(), _rr = new THREE.Vector3(), _rf = new THREE.Vector3();
export function railToWorld(s, u, v, out) {
  railFrame(s, _rp, null, _rr);
  return out.copy(_rp).addScaledVector(_rr, u).setY(v);
}

// Convert a world position to rail coordinates → out.x = s, out.y = u, out.z = v.
export function worldToRail(p, out) {
  let s = -p.z;
  for (let i = 0; i < 3; i++) {
    railFrame(s, _rp, _rf, _rr);
    const along = (p.x - _rp.x) * _rf.x + (p.z - _rp.z) * _rf.z;
    s += along * Math.abs(_rf.z);
  }
  railFrame(s, _rp, _rf, _rr);
  out.set(s, (p.x - _rp.x) * _rr.x + (p.z - _rp.z) * _rr.z, p.y);
  return out;
}

// ============================================================ Terrain height field
const N1 = new Simplex2(1337), N2 = new Simplex2(4242), N3 = new Simplex2(777), N4 = new Simplex2(2024);
const LAND = 1.2;   // city ground level

function mountainH(g, x, z, adx) {
  const hw = g.hw ?? 78;
  const wallT = smoothstep(hw, hw + 70, adx + 12 * N2.noise(x * 0.012, z * 0.012));
  const floor = 1.6 + 1.2 * N2.noise(x * 0.03, z * 0.03);
  const peaks = 55 + 120 * ridged2(N3, x * 0.0032, z * 0.0032, 4) + 70 * smoothstep(220, 800, adx);
  return lerp(floor, peaks, wallT);
}

function segH(g, x, z, lx, adx) {
  const n = N2.noise(x * 0.01, z * 0.01);
  let h;
  switch (g.kind) {
    case 'water': {
      h = -22 + 5 * n;
      if (g.islands) {
        const isl = smoothstep(0.18, 0.5, fbm2(N1, x * 0.003, z * 0.003, 4)) * smoothstep(140, 260, adx);
        if (isl > 0) h += isl * (30 + 50 * ridged2(N3, x * 0.005, z * 0.005, 3));
      }
      if (g.shoreR) h = lerp(h, LAND, smoothstep(g.shoreR, g.shoreR + 36, lx + 14 * n));
      if (g.shoreL) h = lerp(h, LAND, smoothstep(g.shoreL, g.shoreL + 36, -lx + 14 * n));
      break;
    }
    case 'mountain': h = mountainH(g, x, z, adx); break;
    case 'forest': h = 1.4 + 1.6 * smoothstep(40, 140, adx) * (fbm2(N1, x * 0.006, z * 0.006, 3) * 0.5 + 0.5); break;
    case 'plains': h = 1.2 + 14 * smoothstep(70, 260, adx) * (fbm2(N1, x * 0.0035, z * 0.0035, 3) * 0.5 + 0.5); break;
    case 'scar': h = 0.9 + 0.5 * N1.noise(x * 0.05, z * 0.05); break;
    case 'floating': h = -140 + 18 * fbm2(N1, x * 0.004, z * 0.004, 3); break;
    case 'fields': h = 1.6 + 0.6 * fbm2(N1, x * 0.006, z * 0.006, 2); break;
    default: h = LAND;
  }
  if (g.river) h = lerp(-11, h, smoothstep(g.river, g.river + 16, adx + 6 * n));
  if (g.far) {
    const f = smoothstep(g.farAt, g.farAt + 900, adx);
    if (f > 0) h = lerp(h, 25 + g.far * ridged2(N4, x * 0.0012, z * 0.0012, 4), f);
  }
  return h;
}

const _hs = {};
export function terrainHeight(x, z) {
  const d = -z;
  const lx = x - pathX(d), adx = Math.abs(lx);
  const s = segAt(d, _hs);
  const ha = segH(s.a, x, z, lx, adx);
  if (s.t < 0.001 || s.a === s.b) return ha;
  return lerp(ha, segH(s.b, x, z, lx, adx), s.t);
}

// ============================================================ Terrain mesh streaming
const CHUNK = 160, ZSTEP = 8, ZN = CHUNK / ZSTEP;
const XS = (() => {
  const half = [0];
  let x = 0, step = 8;
  while (x < 2700) { if (x >= 232) step *= 1.13; x += step; half.push(x); }
  const full = [];
  for (let i = half.length - 1; i > 0; i--) full.push(-half[i]);
  for (let i = 0; i < half.length; i++) full.push(half[i]);
  return full;
})();
const XN = XS.length;

// Height as rendered by the mesh (bilinear inside the sheared grid cell) – used for collisions.
export function groundHeight(x, z) {
  const d = -z;
  const r0 = Math.floor(d / ZSTEP);
  const fr = d / ZSTEP - r0;
  const hRow = (r) => {
    const dr = r * ZSTEP;
    const lx = x - pathX(dr);
    const cf = lx / 8;
    if (Math.abs(lx) < 230) {
      const c0 = Math.floor(cf), t = cf - c0;
      const x0 = pathX(dr) + c0 * 8;
      return lerp(terrainHeight(x0, -dr), terrainHeight(x0 + 8, -dr), t);
    }
    return terrainHeight(x, -dr);
  };
  return lerp(hRow(r0), hRow(r0 + 1), fr);
}

// ---------------------------------------------------------------- Surface colours
const BLOCK = 48, ROAD = 8;
const pmod = (a, m) => ((a % m) + m) % m;
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const _cs = {};

function landColor(g, x, y, z, lx, d, out) {
  const L = LOOK;
  const urban = g.kind === 'city' || (g.kind === 'water' && g.style !== 'fields');
  if (urban) {
    if (Math.abs(lx) < 9 && g.kind === 'city') return out.copy(L.road);
    const rx = pmod(lx, BLOCK), rz = pmod(d, BLOCK);
    if (rx < ROAD || rz < ROAD) return out.copy(L.road);
    const bx = Math.floor(lx / BLOCK), bz = Math.floor(d / BLOCK);
    const h = hash2(bx * 7 + 3, bz * 13 + 5);
    if (h < (1 - g.density) * 0.6 + 0.1) return out.copy(hash2((x * 0.25) | 0, (z * 0.25) | 0) > 0.5 ? L.park : L.park2);
    if (h > 0.93) return out.copy(L.plaza);
    return out.copy(L.ground);
  }
  // rice paddies / farmland (the distance gets big plain fields: small dikes alias into a checkerboard there)
  if (Math.abs(lx) > 240) {
    const h = hash2(Math.floor(lx / 90) * 3 + 1, Math.floor(d / 120) * 5 + 2);
    return out.copy(L.paddy[(h * 97 | 0) % L.paddy.length]).lerp(L.paddy[0], 0.35);
  }
  const fx = Math.floor(lx / 22), fz = Math.floor(d / 30);
  const ex = pmod(lx, 22), ez = pmod(d, 30);
  if (ex < 1.6 || ez < 1.6) return out.copy(L.dirt);
  const h = hash2(fx * 3 + 11, fz * 5 + 7);
  if (h < 0.16) return out.copy(L.paddyWater);
  return out.copy(L.paddy[(h * 97 | 0) % L.paddy.length]);
}

function surfColor(g, x, y, z, ny, lx, d, out) {
  const L = LOOK;
  if (g.kind === 'floating') {
    // the jungle far below the floating mountains
    if (ny < 0.7) return out.copy(L.rock);
    return out.copy(hash2((x * 0.05) | 0, (z * 0.05) | 0) > 0.5 ? L.canopy : L.canopy2);
  }
  if (y < -1.5) return out.copy(L.bed);
  if (y < 0.75) return out.copy(g.kind === 'water' ? L.sand : L.mud);
  if (y > 6 || g.kind === 'mountain' && y > 3.4) {
    if (L.snowLine && y > L.snowLine + 18 * N3.noise(x * 0.01, z * 0.01)) return out.copy(ny > 0.6 ? L.snow : L.rock);
    if (ny < 0.72) return out.copy(hash2(x | 0, z | 0) > 0.5 ? L.rock : L.rock2);
    return out.copy(hash2((x * 0.1) | 0, (z * 0.1) | 0) > 0.5 ? L.hill : L.hill2);
  }
  if (g.kind === 'scar') {
    // bulldozed ground: mud with tread ruts and stumps of the old forest beyond
    if (Math.abs(lx) > (g.scarW ?? 260)) return out.copy(L.moss);
    const rut = pmod(lx + 3 * N1.noise(d * 0.01, 1), 14) < 2.4;
    return out.copy(rut ? L.mud2 : L.mud).lerp(L.dirt, 0.3 * (N2.noise(x * 0.03, z * 0.03) * 0.5 + 0.5));
  }
  if (g.kind === 'forest' || g.kind === 'plains' || g.kind === 'fields' || g.kind === 'mountain' || g.kind === 'water') {
    const h = hash2(Math.floor(x / 9), Math.floor(z / 9));
    const n2 = N3.noise(x * 0.02, z * 0.02);
    if (g.kind === 'plains') return out.copy(n2 > 0.2 ? L.grass2 : L.grass).lerp(L.moss, h * 0.25);
    if (g.kind === 'water') return out.copy(L.grass);
    if (Math.abs(lx) < 30 && g.kind === 'forest' && g.trail !== false) return out.copy(L.trail).lerp(L.moss, h * 0.4);
    return out.copy(n2 > 0.25 ? L.moss : n2 < -0.3 ? L.fern : L.floor).lerp(L.moss, h * 0.2);
  }
  return landColor(g, x, y, z, lx, d, out);
}

function faceColor(x, y, z, ny, out) {
  const d = -z;
  const lx = x - pathX(d);
  const s = segAt(d, _cs);
  surfColor(s.a, x, y, z, ny, lx, d, _c1);
  if (s.t > 0.001 && s.a !== s.b) { surfColor(s.b, x, y, z, ny, lx, d, _c2); _c1.lerp(_c2, s.t); }
  const jitter = 0.9 + 0.2 * hash2(Math.floor(x * 3.1), Math.floor(z * 2.7));
  return out.setRGB(_c1.r * jitter, _c1.g * jitter, _c1.b * jitter);
}

let terrainMat = null;
const TERRAIN_GLOW = { value: 0 };
const chunks = new Map();
const decoByChunk = new Map();

function buildChunk(ci) {
  const d0 = ci * CHUNK;
  const rows = ZN + 1;
  const px = new Float32Array(rows * XN), py = new Float32Array(rows * XN), pz = new Float32Array(rows * XN);
  for (let r = 0; r < rows; r++) {
    const d = d0 + r * ZSTEP;
    const cx = pathX(d);
    for (let c = 0; c < XN; c++) {
      const x = cx + XS[c], z = -d;
      const i = r * XN + c;
      px[i] = x; pz[i] = z; py[i] = terrainHeight(x, z);
    }
  }
  const triCount = ZN * (XN - 1) * 2;
  const pos = new Float32Array(triCount * 9);
  const nor = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  let o = 0;
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), c3 = new THREE.Color();
  const tri = (a, b, c) => {
    e1.set(px[b] - px[a], py[b] - py[a], pz[b] - pz[a]);
    e2.set(px[c] - px[a], py[c] - py[a], pz[c] - pz[a]);
    n.crossVectors(e1, e2).normalize();
    const cx = (px[a] + px[b] + px[c]) / 3, cy = (py[a] + py[b] + py[c]) / 3, cz = (pz[a] + pz[b] + pz[c]) / 3;
    faceColor(cx, cy, cz, n.y, c3);
    for (const v of [a, b, c]) {
      pos[o] = px[v]; pos[o + 1] = py[v]; pos[o + 2] = pz[v];
      nor[o] = n.x; nor[o + 1] = n.y; nor[o + 2] = n.z;
      col[o] = c3.r; col[o + 1] = c3.g; col[o + 2] = c3.b;
      o += 3;
    }
  };
  for (let r = 0; r < ZN; r++) {
    for (let c = 0; c < XN - 1; c++) {
      const a = r * XN + c, b = a + 1, cN = a + XN, dN = cN + 1;
      if ((r + c) & 1) { tri(a, b, cN); tri(b, dN, cN); }
      else { tri(a, b, dN); tri(a, dN, cN); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, terrainMat);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  G.scene.add(mesh);
  chunks.set(ci, mesh);
  buildDecorations(ci);
}

function disposeChunk(ci) {
  const m = chunks.get(ci);
  if (m) { G.scene.remove(m); m.geometry.dispose(); chunks.delete(ci); }
  const deco = decoByChunk.get(ci);
  if (deco) { for (const o of deco) { G.scene.remove(o); o.dispose?.(); } decoByChunk.delete(ci); }
}

export function updateTerrain(d, force = false) {
  const first = Math.floor((d - 260) / CHUNK), last = Math.floor((d + 3300) / CHUNK);
  for (const ci of [...chunks.keys()]) if (ci < first - 1 || ci > last + 3) disposeChunk(ci);
  let built = 0;
  for (let ci = Math.max(0, first); ci <= last; ci++) {
    if (!chunks.has(ci)) { buildChunk(ci); built++; if (!force && built >= 1) break; }
  }
}

export function resetTerrain() { for (const ci of [...chunks.keys()]) disposeChunk(ci); }

// ============================================================ Geometry helpers (shared with props/landmarks)
export function mergeColored(parts) {
  // parts: [geometry, color(hex|Color), emissive(0..1)]
  const geos = [];
  for (const [g0, hex, em = 0] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    g.computeVertexNormals();
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const ca = new Float32Array(n * 3), ea = new Float32Array(n);
    for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; ea[i] = em; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    g.setAttribute('aEmit', new THREE.BufferAttribute(ea, 1));
    geos.push(g);
  }
  return mergeGeometries(geos);
}

// Minimal merge (avoids importing addons for this simple use).
export function mergeGeometries(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  const names = Object.keys(geos[0].attributes);
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of geos) { const a = g.attributes[name]; arr.set(a.array, off); off += a.count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

// Emissive-mask extension for vertex-colored standard materials (aEmit attribute).
export function emissiveVertexMaterial(opts = {}, emitBoost = 3) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2, ...opts });
  mat.userData.emit = { value: emitBoost };
  mat.userData.flash = { value: 0 };
  mat.userData.tint = { value: new THREE.Color(1, 1, 1) };
  const extra = (shader) => {
    shader.uniforms.uEmitBoost = mat.userData.emit;
    shader.uniforms.uFlash = mat.userData.flash;
    shader.uniforms.uTint = mat.userData.tint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEmit;\nvarying float vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmit;\nuniform float uEmitBoost;\nuniform float uFlash;\nuniform vec3 uTint;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(uTint, vec3(1.0), vEmit);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vEmit * uEmitBoost + vec3(uFlash);');
  };
  patchFog(mat, extra);
  return mat;
}

// Glass-and-concrete facade shader: window grid that reads as tinted glass by day and lit rooms by night.
export function buildingMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.3, ...opts });
  patchFog(m, (shader) => {
    shader.uniforms.uNight = ATMO.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vLN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n{ vec4 wp4 = vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n wp4 = instanceMatrix * wp4;\n#endif\n vWP = (modelMatrix * wp4).xyz; vLN = normal; }');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vLN; uniform float uNight;\nfloat bh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }\nfloat gWin = 0.0; float gOn = 0.0; vec3 gWcol = vec3(0.0);')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 an = abs(vLN);
          if (an.y < 0.5) {
            vec2 wc = an.x > 0.5 ? vWP.zy : vWP.xy;
            vec2 cell = floor(wc / vec2(3.2, 4.0));
            vec2 f = fract(wc / vec2(3.2, 4.0));
            gWin = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.74) * step(3.0, vWP.y);
            gOn = step(0.5, bh(cell + floor(vWP.y * 0.01)));
            gWcol = mix(vec3(1.0, 0.66, 0.34), vec3(0.55, 0.85, 1.0), step(0.78, bh(cell + 7.0)));
            vec3 glass = mix(vec3(0.16, 0.22, 0.3), vec3(0.03, 0.04, 0.06), uNight);
            diffuseColor.rgb = mix(diffuseColor.rgb, glass, gWin * 0.72);
          } else diffuseColor.rgb *= 0.7;
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gWcol * gWin * gOn * 1.05 * uNight;');
  });
  return m;
}

// ============================================================ Decorations
const DECO = {};
let decoMat, bldgMat, lampMat, neonMat;

function unitGeo(parts) { return mergeColored(parts.map(p => [p[0], p[1] ?? '#ffffff', p[2] ?? 0])); }

function initDecorations() {
  const W = '#ffffff';
  // buildings (unit footprint, unit height; scaled per instance)
  DECO.box = unitGeo([[new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), W]]);
  DECO.setback = unitGeo([[new THREE.BoxGeometry(1, 0.62, 1).translate(0, 0.31, 0), W], [new THREE.BoxGeometry(0.74, 0.28, 0.74).translate(0, 0.76, 0), W], [new THREE.BoxGeometry(0.46, 0.1, 0.46).translate(0, 0.95, 0), W]]);
  DECO.cyl = unitGeo([[new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0), W], [new THREE.CylinderGeometry(0.42, 0.5, 0.04, 12).translate(0, 1.0, 0), W]]);
  DECO.spire = unitGeo([[new THREE.BoxGeometry(1, 0.86, 1).translate(0, 0.43, 0), W], [new THREE.ConeGeometry(0.66, 0.14, 4).rotateY(Math.PI / 4).translate(0, 0.93, 0), W]]);
  DECO.twin = unitGeo([[new THREE.BoxGeometry(0.42, 1, 1).translate(-0.29, 0.5, 0), W], [new THREE.BoxGeometry(0.42, 0.8, 1).translate(0.29, 0.4, 0), W]]);
  // traditional hall: walls/pillars (vertex colour) + roof (instance colour) as two meshes
  DECO.hallWalls = mergeColored([[new THREE.BoxGeometry(1.3, 0.22, 1.3).translate(0, 0.11, 0), '#d8d4ca'], [new THREE.BoxGeometry(1, 0.42, 1).translate(0, 0.43, 0), '#a8322a']]);
  DECO.hallRoof = mergeColored([
    [new THREE.CylinderGeometry(0.42, 0.95, 0.24, 4, 1).rotateY(Math.PI / 4).scale(1.18, 1, 0.92).translate(0, 0.74, 0), W],
    [new THREE.CylinderGeometry(0.25, 0.55, 0.2, 4, 1).rotateY(Math.PI / 4).scale(1.18, 1, 0.92).translate(0, 0.94, 0), W],
    [new THREE.BoxGeometry(0.66, 0.05, 0.08).translate(0, 1.05, 0), W],
  ]);
  // village house (walls) + pitched roof
  DECO.houseWalls = mergeColored([[new THREE.BoxGeometry(1, 0.6, 1).translate(0, 0.3, 0), '#e8e0cf']]);
  const roof = new THREE.CylinderGeometry(0.62, 0.62, 1.1, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).scale(1, 0.55, 1).rotateY(Math.PI / 2).translate(0, 0.78, 0);
  DECO.houseRoof = mergeColored([[roof, W]]);
  // trees
  const trunk = new THREE.CylinderGeometry(0.35, 0.55, 4, 5).translate(0, 2, 0);
  DECO.tree_round = mergeColored([[trunk, '#6b4a32'], [new THREE.IcosahedronGeometry(3.2, 0).scale(1, 1.2, 1).translate(0, 6.2, 0), '#3f7a34'], [new THREE.IcosahedronGeometry(2.2, 0).translate(1.1, 8.4, 0.4), '#56913c']]);
  DECO.tree_sakura = mergeColored([[trunk, '#5a3a30'], [new THREE.IcosahedronGeometry(3.4, 0).scale(1.2, 0.95, 1.2).translate(0, 6.4, 0), '#f3b2c8'], [new THREE.IcosahedronGeometry(2.3, 0).translate(1.4, 8.0, 0.6), '#ffd0e0'], [new THREE.IcosahedronGeometry(2.0, 0).translate(-1.6, 7.2, -0.8), '#e990b0']]);
  const pine = [[new THREE.CylinderGeometry(0.3, 0.45, 3, 5).translate(0, 1.5, 0), '#5a3e2a']];
  for (let k = 0; k < 3; k++) pine.push([new THREE.ConeGeometry(2.8 - k * 0.7, 3.6, 6).translate(0, 3.6 + k * 2.2, 0), k === 1 ? '#2f5a35' : '#2a5030']);
  DECO.tree_pine = mergeColored(pine);
  const palm = [[new THREE.CylinderGeometry(0.28, 0.42, 9, 5).translate(0, 4.5, 0).applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0.12, 0, 0, 0)), '#7a5a3a']];
  for (let k = 0; k < 6; k++) {
    const leaf = new THREE.BoxGeometry(0.9, 0.12, 4.6).translate(0, 0, 2.3).rotateX(0.5).rotateY(k / 6 * Math.PI * 2).translate(0.55, 9, 0);
    palm.push([leaf, k % 2 ? '#3f8a3a' : '#4e9c40']);
  }
  DECO.tree_palm = mergeColored(palm);
  const rock = new THREE.DodecahedronGeometry(3, 0);
  const rp = rock.attributes.position;
  const rr = mulberry32(5);
  for (let i = 0; i < rp.count; i++) rp.setXYZ(i, rp.getX(i) * (0.8 + rr() * 0.4), rp.getY(i) * (0.6 + rr() * 0.3), rp.getZ(i) * (0.8 + rr() * 0.4));
  DECO.rock = mergeColored([[rock, '#857563']]);
  // boat: hull (instance colour) + cabin
  DECO.boat = mergeColored([
    [new THREE.CylinderGeometry(1.4, 0.9, 12, 6, 1).rotateX(Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.3, 0), W],
    [new THREE.BoxGeometry(2.2, 1.6, 3.6).translate(0, 1.6, 1.4), '#f2efe6'],
    [new THREE.BoxGeometry(2.3, 0.3, 0.6).translate(0, 2.1, -0.2), '#ffd27a', 0.6],
  ]);
  DECO.lamp = mergeColored([[new THREE.CylinderGeometry(0.12, 0.16, 6, 4).translate(0, 3, 0), '#3a3e46'], [new THREE.BoxGeometry(0.9, 0.35, 0.9).translate(0, 6.1, 0), '#ffd6a0', 1]]);
  DECO.beacon = mergeColored([[new THREE.OctahedronGeometry(0.9, 0), '#ff3a2a', 1]]);
  DECO.neon = mergeColored([[new THREE.BoxGeometry(1, 1, 1), W, 1]]);

  initFlora();
  decoMat = emissiveVertexMaterial({ roughness: 0.9, metalness: 0 });
  lampMat = emissiveVertexMaterial({ roughness: 0.5, metalness: 0.2 }, 4);
  neonMat = emissiveVertexMaterial({ roughness: 0.4, metalness: 0 }, 3);
  bldgMat = buildingMaterial();
}

// ---------------------------------------------------------------- Pandora flora (unit height; scaled per instance)
let floraMat;
function initFlora() {
  const C = mergeColored;
  const r = mulberry32(77);
  // giant rainforest tree: tall trunk with buttress roots, two umbrella canopies, glowing bark spots
  const big = [];
  big.push([new THREE.CylinderGeometry(0.03, 0.065, 1, 8).translate(0, 0.5, 0), '#5a5048']);
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2;
    big.push([new THREE.ConeGeometry(0.05, 0.16, 3).scale(0.5, 1, 1.6).rotateY(a).translate(Math.cos(a) * 0.05, 0.06, Math.sin(a) * 0.05), '#4a4038']);
  }
  big.push([new THREE.CylinderGeometry(0.06, 0.3, 0.07, 9).translate(0, 0.94, 0), '#2f6a4e']);
  big.push([new THREE.CylinderGeometry(0.04, 0.22, 0.06, 9).translate(0.04, 1.0, 0.02), '#3a7f58']);
  big.push([new THREE.CylinderGeometry(0.05, 0.2, 0.06, 8).translate(-0.06, 0.78, 0.05), '#2a5e46']);
  for (let k = 0; k < 7; k++) big.push([new THREE.BoxGeometry(0.008, 0.18 + r() * 0.2, 0.008).translate((r() - 0.5) * 0.4, 0.82 - r() * 0.08, (r() - 0.5) * 0.4), '#3a6a40']);   // hanging vines
  for (let k = 0; k < 12; k++) { const a = r() * 6.28, y = 0.08 + r() * 0.75; big.push([new THREE.BoxGeometry(0.012, 0.012, 0.012).translate(Math.cos(a) * 0.05, y, Math.sin(a) * 0.05), r() > 0.3 ? '#5ad8ff' : '#b07aff', 1]); }
  DECO.ptree = C(big);
  // mid tree: rounder crown
  const mid = [[new THREE.CylinderGeometry(0.05, 0.09, 0.6, 6).translate(0, 0.3, 0), '#5a4a40'],
    [new THREE.IcosahedronGeometry(0.32, 0).scale(1.2, 0.7, 1.2).translate(0, 0.72, 0), '#2f7050'], [new THREE.IcosahedronGeometry(0.22, 0).translate(0.18, 0.86, 0.05), '#3f8a5c'],
    [new THREE.SphereGeometry(0.03, 5, 3).translate(0.2, 0.55, 0.1), '#7ae0ff', 1], [new THREE.SphereGeometry(0.03, 5, 3).translate(-0.15, 0.6, -0.12), '#c08aff', 1]];
  DECO.ptree2 = C(mid);
  // fern clump
  const fern = [];
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.3; fern.push([new THREE.BoxGeometry(0.16, 0.02, 0.75).translate(0, 0, 0.37).rotateX(-0.7).rotateY(a).translate(0, 0.05, 0), k % 2 ? '#2f7a4a' : '#3f8f58']); }
  fern.push([new THREE.SphereGeometry(0.05, 5, 3).translate(0, 0.08, 0), '#7affd8', 1]);
  DECO.fern = C(fern);
  // helicoradian: a tall spiral frond (orange/red) — curls up when touched in the films
  const hel = [[new THREE.CylinderGeometry(0.015, 0.03, 1, 5).translate(0, 0.5, 0), '#7a5a3a']];
  for (let k = 0; k < 26; k++) {
    const t = k / 26, a = t * Math.PI * 7, rr = 0.06 + 0.12 * (1 - t);
    hel.push([new THREE.BoxGeometry(0.1, 0.012, 0.05).rotateY(-a).translate(Math.cos(a) * rr, 0.25 + t * 0.75, Math.sin(a) * rr), t > 0.75 ? '#ffd24a' : t > 0.4 ? '#ff7a2a' : '#d8402a', t > 0.85 ? 0.6 : 0]);
  }
  DECO.helico = C(hel);
  // glowing pod / mushroom plant
  DECO.shroom = C([[new THREE.CylinderGeometry(0.06, 0.1, 0.5, 6).translate(0, 0.25, 0), '#d8c8e8'], [new THREE.SphereGeometry(0.36, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.48, 0), '#6a3a9a'],
    [new THREE.CircleGeometry(0.34, 8).rotateX(Math.PI / 2).translate(0, 0.47, 0), '#5affe8', 1], [new THREE.SphereGeometry(0.05, 5, 3).translate(0.2, 0.62, 0.1), '#ff7ae0', 1]]);
  // tree stump (clear-cut scar)
  DECO.stump = C([[new THREE.CylinderGeometry(0.45, 0.6, 0.5, 7).translate(0, 0.25, 0), '#6a5644'], [new THREE.CircleGeometry(0.44, 7).rotateX(-Math.PI / 2).translate(0, 0.501, 0), '#b89a70']]);
  // floating island: inverted rocky cone with a grassy cap, small trees and hanging vines
  const isl = [];
  const cone = new THREE.ConeGeometry(1, 1.7, 9, 4).rotateX(Math.PI).translate(0, -0.85, 0);
  const cp = cone.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i); const k = 1 + 0.18 * Math.sin(x * 7 + z * 5 + y * 3); cp.setXYZ(i, x * k, y, z * k); }
  isl.push([cone, '#8a8478']);
  isl.push([new THREE.CylinderGeometry(1.05, 1.0, 0.12, 10).translate(0, 0.02, 0), '#3f7a4a']);
  for (let k = 0; k < 5; k++) { const a = r() * 6.28, d = r() * 0.6; isl.push([new THREE.IcosahedronGeometry(0.16, 0).scale(1, 1.4, 1).translate(Math.cos(a) * d, 0.22, Math.sin(a) * d), k % 2 ? '#2f6a4e' : '#3a7f58']); }
  for (let k = 0; k < 9; k++) { const a = r() * 6.28, d = 0.6 + r() * 0.35, L = 0.6 + r() * 1.4; isl.push([new THREE.BoxGeometry(0.015, L, 0.015).translate(Math.cos(a) * d, -L / 2, Math.sin(a) * d), '#3a6a40']); }
  for (let k = 0; k < 6; k++) { const a = r() * 6.28; isl.push([new THREE.SphereGeometry(0.03, 4, 3).translate(Math.cos(a) * 0.7, -0.3 - r() * 0.6, Math.sin(a) * 0.7), '#7ae0ff', 1]); }
  DECO.island = C(isl);
  floraMat = emissiveVertexMaterial({ roughness: 0.85, metalness: 0 }, 0.6);
}

// Height/type profile per district style
const STYLES = {
  modern: { near: [34, 120], tall: [120, 210], tallP: 0.12, mid: [24, 80], far: [16, 60], types: ['box', 'setback', 'cyl', 'spire', 'twin', 'box'], fill: 0.95 },
  mixed:  { near: [16, 60], tall: [70, 120], tallP: 0.06, mid: [12, 44], far: [10, 34], types: ['box', 'box', 'setback', 'spire', 'cyl'], fill: 0.88 },
  old:    { near: [8, 20], tall: [26, 40], tallP: 0.05, mid: [7, 16], far: [7, 14], types: ['box', 'box', 'box', 'hall'], fill: 0.85, narrow: true },
  palace: { near: [12, 22], tall: [18, 26], tallP: 0.2, mid: [10, 20], far: [8, 16], types: ['hall'], fill: 0.7 },
  low:    { near: [7, 14], tall: [14, 22], tallP: 0.05, mid: [6, 12], far: [6, 10], types: ['house'], fill: 0.6 },
};

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _pp = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _col = new THREE.Color();

function instanced(list, geo, mat, items, opts = {}) {
  if (!items.length) return;
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => { im.setMatrixAt(i, it.m); if (it.c) im.setColorAt(i, it.c); });
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = !!opts.shadow; im.receiveShadow = opts.receive !== false;
  im.computeBoundingSphere();
  G.scene.add(im); list.push(im);
}

function buildCityDecorations(ci, list) {
  const rnd = mulberry32(ci * 7919 + 13 + (STAGE?.id || 0) * 104729);
  const d0 = ci * CHUNK;
  const g = segmentAt(d0 + CHUNK / 2);
  const L = LOOK;
  const B = { near: {}, far: {} };
  const push = (band, type, m, c) => { (B[band][type] ||= []).push({ m: m.clone(), c: c ? c.clone() : null }); };
  const trees = [], rocks = [], houses = [], roofs = [], boats = [], lamps = [], beacons = [], neons = [];
  const place = (x, y, z, yaw, sx, sy, sz) => { _q.setFromAxisAngle(_up, yaw); _s.set(sx, sy, sz); _pp.set(x, y, z); return _m4.compose(_pp, _q, _s); };
  const treeType = 'tree_' + (L.tree || 'round');
  const slopeYaw = (d) => -Math.atan((pathX(d + 2) - pathX(d - 2)) * 0.25);
  const urban = g.kind === 'city' || (g.kind === 'water' && g.style !== 'fields' && (g.shoreL || g.shoreR));
  const st = STYLES[g.style] || STYLES.mixed;
  const night = L.night;

  // ---- city blocks
  if (urban) {
    const bz0 = Math.floor(d0 / BLOCK), bz1 = Math.floor((d0 + CHUNK - 1) / BLOCK);
    for (let bz = bz0; bz <= bz1; bz++) {
      const zs = Math.max(bz * BLOCK + ROAD + 2, d0), ze = Math.min(bz * BLOCK + BLOCK - 2, d0 + CHUNK - 0.01);
      if (ze - zs < 10) continue;
      for (let bx = -24; bx < 24; bx++) {
        let xs = bx * BLOCK + ROAD + 2, xe = bx * BLOCK + BLOCK - 2;
        const far = Math.min(Math.abs(xs), Math.abs(xe)) > 600;
        if (far && (bx & 1)) continue;   // sparser in the distance
        // keep the flight corridor clear
        const clear = g.kind === 'city' ? 60 : 64;
        if (xe < clear && xs > -clear) continue;
        if (xs < clear && xe > clear) xs = clear;
        if (xe > -clear && xs < -clear) xe = -clear;
        if (xe - xs < 10) continue;
        const h = hash2(bx * 7 + 3, bz * 13 + 5);
        const park = h < (1 - g.density) * 0.6 + 0.1;
        const cxm = (xs + xe) / 2, czm = (zs + ze) / 2;
        const wx = pathX(czm) + cxm;
        const gy = terrainHeight(wx, -czm);
        if (gy < 0.6 || gy > 3) continue;
        if (park || rnd() > st.fill) {
          const n = park ? 3 + (rnd() * 4 | 0) : 1;
          for (let k = 0; k < n; k++) {
            const lx = lerp(xs, xe, rnd()), dd = lerp(zs, ze, rnd());
            const x = pathX(dd) + lx, y = terrainHeight(x, -dd);
            if (y < 0.6) continue;
            const sc = 0.7 + rnd() * 0.7;
            trees.push({ m: place(x, y - 0.3, -dd, rnd() * 6.28, sc, sc * (0.85 + rnd() * 0.4), sc).clone() });
          }
          continue;
        }
        if (h > 0.93) continue;   // plaza
        const adx = Math.abs(cxm);
        // split the block into 1–3 lots along the rail
        const lots = st.narrow ? 2 + (rnd() * 2 | 0) : (rnd() < 0.55 ? 1 : 2);
        for (let k = 0; k < lots; k++) {
          const lz0 = lerp(zs, ze, k / lots), lz1 = lerp(zs, ze, (k + 1) / lots);
          const lxs = st.narrow ? 2 : 1;
          for (let j = 0; j < lxs; j++) {
            const lx0 = lerp(xs, xe, j / lxs), lx1 = lerp(xs, xe, (j + 1) / lxs);
            const w = (lx1 - lx0) * (0.62 + rnd() * 0.3), dpt = (lz1 - lz0) * (0.62 + rnd() * 0.3);
            const lx = (lx0 + lx1) / 2 + (rnd() - 0.5) * ((lx1 - lx0) - w), dd = (lz0 + lz1) / 2;
            let range = adx < 220 ? st.near : adx < 600 ? st.mid : st.far;
            if (adx < 420 && rnd() < st.tallP * (g.hmul > 1 ? 1.8 : 1)) range = st.tall;
            let ht = lerp(range[0], range[1], rnd() * rnd() * 0.6 + rnd() * 0.4) * g.hmul;
            let type = st.types[(rnd() * st.types.length) | 0];
            if (type === 'cyl' || type === 'spire') ht *= 1.15;
            const x = pathX(dd) + lx;
            const band = adx < 260 ? 'near' : 'far';
            const yaw = slopeYaw(dd);
            if (type === 'hall') {
              const s = Math.min(w, dpt) * 0.9;
              const hh = ht * 0.85;
              const m = place(x, gy - 0.2, -dd, yaw, s * 1.15, hh, s);
              push(band, 'hallWalls', m, null);
              push(band, 'hallRoof', m, L.hallRoof[(rnd() * L.hallRoof.length) | 0]);
              continue;
            }
            if (type === 'house') {
              const s = Math.min(w, dpt) * 0.7;
              const m = place(x, gy - 0.2, -dd, yaw, s, s * 0.9, s * 1.2);
              houses.push({ m: m.clone() });
              roofs.push({ m: m.clone(), c: L.roofs[(rnd() * L.roofs.length) | 0].clone() });
              continue;
            }
            const narrowTower = ht > 90 ? 0.75 : 1;
            const m = place(x, gy - 0.5, -dd, yaw, w * narrowTower, ht, dpt * narrowTower);
            _col.copy(L.bldg[(rnd() * L.bldg.length) | 0]).multiplyScalar(0.88 + rnd() * 0.24);
            push(band, type, m, _col);
            // rooftop beacon on tall towers
            if (ht > 75) beacons.push({ m: place(x, gy + ht + 1.4, -dd, 0, 1, 1, 1).clone() });
            // neon signs on facades facing the corridor
            if (L.neon && adx < 240 && ht > 14) {
              const ns = 1 + (rnd() * 2 | 0);
              const face = lx - Math.sign(lx) * (w * narrowTower / 2 + 0.3);
              for (let q = 0; q < ns; q++) {
                const vert = rnd() < 0.55;
                const sh = vert ? 8 + rnd() * 14 : 2.5 + rnd() * 2.5, sw = vert ? 2.2 + rnd() * 1.5 : 8 + rnd() * 10;
                const sy = Math.min(ht - sh / 2 - 1, 6 + rnd() * (ht - 10));
                const sd = dd + (rnd() - 0.5) * dpt * 0.5;
                neons.push({ m: place(pathX(sd) + face, gy + sy, -sd, slopeYaw(sd), 0.5, sh, sw).clone(), c: L.neonCols[(rnd() * L.neonCols.length) | 0].clone() });
              }
            }
          }
        }
      }
    }
    // street lights along the boulevard and the first cross streets
    if (g.kind === 'city' && L.lamps) {
      for (let k = Math.ceil(d0 / 30) * 30; k < d0 + CHUNK; k += 30) {
        for (const side of [-1, 1]) {
          const x = pathX(k) + side * 13;
          lamps.push({ m: place(x, terrainHeight(x, -k), -k, 0, 1, 1, 1).clone() });
        }
      }
    }
  }

  // ---- countryside: trees, villages, rocks
  if (!urban || g.kind === 'water') {
    const isWater = g.kind === 'water';
    const nT = g.kind === 'mountain' ? 90 : isWater ? 20 : 70;
    for (let i = 0; i < nT * 2 && trees.length < nT; i++) {
      const d = d0 + rnd() * CHUNK;
      const lx = (rnd() * 2 - 1) * 900;
      if (Math.abs(lx) < 30) continue;
      const x = pathX(d) + lx, z = -d;
      const h = terrainHeight(x, z);
      if (h < 1.0 || h > (L.snowLine ? L.snowLine - 10 : 160)) continue;
      const hx = terrainHeight(x + 3, z), hz = terrainHeight(x, z + 3);
      if (Math.abs(hx - h) > 2.4 || Math.abs(hz - h) > 2.4) continue;
      const sc = 0.8 + rnd() * 0.8;
      trees.push({ m: place(x, h - 0.4, z, rnd() * 6.28, sc, sc * (0.85 + rnd() * 0.4), sc).clone() });
    }
    if (g.kind === 'fields') {
      // small hamlets
      const nv = 2 + (rnd() * 3 | 0);
      for (let v = 0; v < nv; v++) {
        const cd = d0 + rnd() * CHUNK, clx = (rnd() < 0.5 ? -1 : 1) * (70 + rnd() * 500);
        for (let k = 0; k < 5; k++) {
          const d = cd + (rnd() - 0.5) * 40, lx = clx + (rnd() - 0.5) * 50;
          const x = pathX(d) + lx, z = -d, h = terrainHeight(x, z);
          if (h < 1.0 || h > 4 || Math.abs(lx) < 60) continue;
          const s = 7 + rnd() * 5;
          const m = place(x, h - 0.2, z, slopeYaw(d) + (rnd() < 0.5 ? 0 : Math.PI / 2), s, s * 0.9, s * 1.3);
          houses.push({ m: m.clone() });
          roofs.push({ m: m.clone(), c: L.roofs[(rnd() * L.roofs.length) | 0].clone() });
        }
      }
    }
    if (g.kind === 'mountain' || g.islands) {
      for (let i = 0; i < 30 && rocks.length < 14; i++) {
        const d = d0 + rnd() * CHUNK, lx = (rnd() * 2 - 1) * 260;
        const x = pathX(d) + lx, z = -d, h = terrainHeight(x, z);
        if (h < -3 || h > 40 || Math.abs(lx) < 40) continue;
        const sc = 0.8 + rnd() * 1.6;
        q2.setFromEuler(new THREE.Euler(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5));
        _s.set(sc, sc, sc); _pp.set(x, h, z);
        rocks.push({ m: _m4.compose(_pp, q2, _s).clone() });
      }
    }
  }

  // ---- boats on rivers and bays
  if (L.boats && (g.river || g.kind === 'water')) {
    const nb = g.kind === 'water' ? 5 : 3;
    for (let i = 0; i < nb * 3 && boats.length < nb; i++) {
      const d = d0 + rnd() * CHUNK;
      const lx = (rnd() * 2 - 1) * (g.kind === 'water' ? 700 : g.river - 8);
      if (Math.abs(lx) < 12) continue;
      const x = pathX(d) + lx, z = -d;
      if (terrainHeight(x, z) > -6) continue;
      const sc = g.kind === 'water' ? 1 + rnd() * 2.2 : 0.8 + rnd() * 0.5;
      boats.push({ m: place(x, 0, z, slopeYaw(d) + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.4, sc, sc, sc).clone(), c: L.boatCols[(rnd() * L.boatCols.length) | 0].clone() });
    }
  }

  // ---- instancing
  const BG = { box: DECO.box, setback: DECO.setback, cyl: DECO.cyl, spire: DECO.spire, twin: DECO.twin };
  for (const band of ['near', 'far']) {
    for (const type in B[band]) {
      const items = B[band][type];
      if (type === 'hallWalls') instanced(list, DECO.hallWalls, decoMat, items, { shadow: band === 'near' });
      else if (type === 'hallRoof') instanced(list, DECO.hallRoof, decoMat, items, { shadow: band === 'near' });
      else instanced(list, BG[type], bldgMat, items, { shadow: band === 'near' });
    }
  }
  instanced(list, DECO[treeType] || DECO.tree_round, decoMat, trees, { shadow: true });
  instanced(list, DECO.rock, decoMat, rocks, { shadow: true });
  instanced(list, DECO.houseWalls, decoMat, houses, { shadow: true });
  instanced(list, DECO.houseRoof, decoMat, roofs, { shadow: true });
  instanced(list, DECO.boat, decoMat, boats, { shadow: true });
  instanced(list, DECO.lamp, lampMat, lamps, {});
  if (night > 0.3) instanced(list, DECO.beacon, lampMat, beacons, {});
  instanced(list, DECO.neon, neonMat, neons, {});
}
const q2 = new THREE.Quaternion();

function buildDecorations(ci) {
  const list = [];
  const g = segmentAt(ci * CHUNK + CHUNK / 2);
  if (g.kind === 'city') buildCityDecorations(ci, list);
  else buildFlora(ci, g, list);
  decoByChunk.set(ci, list);
}

// Rainforest, meadows, clear-cut scars, floating mountains, reef islands and ridges
function buildFlora(ci, g, list) {
  const rnd = mulberry32(ci * 7919 + 13 + (STAGE?.id || 0) * 104729);
  const d0 = ci * CHUNK;
  const L = LOOK;
  const set = { ptree: [], ptree2: [], fern: [], helico: [], shroom: [], stump: [], island: [], palm: [], rock: [] };
  const place = (x, y, z, yaw, sx, sy, sz) => { _q.setFromAxisAngle(_up, yaw); _s.set(sx, sy, sz); _pp.set(x, y, z); return _m4.compose(_pp, _q, _s).clone(); };
  const at = (d, lx) => { const x = pathX(d) + lx, z = -d; return [x, terrainHeight(x, z), z]; };
  const K = g.kind;
  const clear = g.clear ?? 46;     // the flight corridor stays free of trunks
  if (K === 'forest' || K === 'plains' || K === 'scar' || K === 'mountain') {
    const nBig = K === 'forest' ? 30 : K === 'scar' ? 14 : K === 'mountain' ? 8 : 7;
    for (let i = 0; i < nBig * 3 && set.ptree.length < nBig; i++) {
      const d = d0 + rnd() * CHUNK;
      const side = rnd() < 0.5 ? -1 : 1;
      const minX = K === 'scar' ? (g.scarW ?? 260) : clear + 6;
      const lx = side * (minX + Math.pow(rnd(), K === 'forest' ? 1.6 : 1) * 900);
      const [x, y, z] = at(d, lx);
      if (y < 0.5 || y > 60) continue;
      const h = (K === 'forest' ? 55 : 40) + rnd() * (K === 'forest' ? 95 : 60);
      set.ptree.push({ m: place(x, y - 1, z, rnd() * 6.28, h, h, h) });
    }
    const nMid = K === 'forest' ? 40 : K === 'mountain' ? 40 : 18;
    for (let i = 0; i < nMid * 2 && set.ptree2.length < nMid; i++) {
      const d = d0 + rnd() * CHUNK;
      const lx = (rnd() < 0.5 ? -1 : 1) * ((K === 'scar' ? (g.scarW ?? 260) : 34) + rnd() * 700);
      const [x, y, z] = at(d, lx);
      if (y < 0.5 || y > (L.snowLine ? L.snowLine - 10 : 160)) continue;
      const hx = terrainHeight(x + 4, z);
      if (Math.abs(hx - y) > 3) continue;
      const h = 14 + rnd() * 18;
      set.ptree2.push({ m: place(x, y - 0.5, z, rnd() * 6.28, h, h, h) });
    }
    if (K !== 'mountain') {
      const nF = K === 'forest' ? 70 : K === 'plains' ? 40 : 10;
      for (let i = 0; i < nF; i++) {
        const d = d0 + rnd() * CHUNK, lx = (rnd() * 2 - 1) * 320;
        if (Math.abs(lx) < 14) continue;
        if (K === 'scar' && Math.abs(lx) < (g.scarW ?? 260)) continue;
        const [x, y, z] = at(d, lx);
        if (y < 0.5) continue;
        const k = rnd();
        if (k < 0.55) { const sc = 4 + rnd() * 6; set.fern.push({ m: place(x, y - 0.2, z, rnd() * 6.28, sc, sc * 0.8, sc) }); }
        else if (k < 0.78) { const sc = 6 + rnd() * 12; set.helico.push({ m: place(x, y - 0.2, z, rnd() * 6.28, sc, sc, sc) }); }
        else { const sc = 3 + rnd() * 5; set.shroom.push({ m: place(x, y - 0.2, z, rnd() * 6.28, sc, sc, sc) }); }
      }
    }
    if (K === 'scar') {
      for (let i = 0; i < 40; i++) {
        const d = d0 + rnd() * CHUNK, lx = (rnd() * 2 - 1) * (g.scarW ?? 260);
        if (Math.abs(lx) < 16) continue;
        const [x, y, z] = at(d, lx);
        const sc = 2 + rnd() * 4;
        set.stump.push({ m: place(x, y - 0.1, z, rnd() * 6.28, sc, sc * (0.6 + rnd()), sc) });
      }
    }
    if (K === 'mountain') for (let i = 0; i < 12; i++) {
      const d = d0 + rnd() * CHUNK, lx = (rnd() * 2 - 1) * 260;
      if (Math.abs(lx) < 40) continue;
      const [x, y, z] = at(d, lx);
      if (y < 0 || y > 40) continue;
      const sc = 0.8 + rnd() * 1.6;
      set.rock.push({ m: place(x, y, z, rnd() * 6.28, sc, sc, sc) });
    }
  } else if (K === 'floating') {
    // floating Hallelujah Mountains: islands at many heights, kept out of the flight band near the rail
    for (let i = 0; i < 30 && set.island.length < 9; i++) {
      const d = d0 + rnd() * CHUNK;
      const rr = 22 + Math.pow(rnd(), 1.5) * 130;
      const lx = (rnd() < 0.5 ? -1 : 1) * (60 + rr + rnd() * 1100);
      const y = -70 + rnd() * 300;
      const nearBand = Math.abs(lx) - rr < 70 && y > -20 && y - rr * 1.7 < 70;
      if (nearBand) continue;
      const x = pathX(d) + lx, z = -d;
      set.island.push({ m: place(x, y, z, rnd() * 6.28, rr, rr * (0.8 + rnd() * 0.6), rr) });
    }
    for (let i = 0; i < 14; i++) {   // jungle far below
      const d = d0 + rnd() * CHUNK, lx = (rnd() * 2 - 1) * 800;
      const [x, y, z] = at(d, lx);
      const h = 40 + rnd() * 50;
      set.ptree.push({ m: place(x, y - 1, z, rnd() * 6.28, h, h, h) });
    }
  } else if (K === 'water') {
    for (let i = 0; i < 80 && set.palm.length < 26; i++) {
      const d = d0 + rnd() * CHUNK, lx = (rnd() * 2 - 1) * 900;
      if (Math.abs(lx) < 40) continue;
      const [x, y, z] = at(d, lx);
      if (y < 1.0 || y > 60) continue;
      const sc = 1.2 + rnd() * 1.2;
      set.palm.push({ m: place(x, y - 0.4, z, rnd() * 6.28, sc, sc * (0.9 + rnd() * 0.4), sc) });
    }
    for (let i = 0; i < 30 && set.rock.length < 10; i++) {
      const d = d0 + rnd() * CHUNK, lx = (rnd() * 2 - 1) * 500;
      if (Math.abs(lx) < 50) continue;
      const [x, y, z] = at(d, lx);
      if (y < -6 || y > 4) continue;
      const sc = 1 + rnd() * 2.5;
      set.rock.push({ m: place(x, Math.max(y, -1), z, rnd() * 6.28, sc, sc, sc) });
    }
  }
  instanced(list, DECO.ptree, floraMat, set.ptree, { shadow: true });
  instanced(list, DECO.ptree2, floraMat, set.ptree2, { shadow: true });
  instanced(list, DECO.fern, floraMat, set.fern, {});
  instanced(list, DECO.helico, floraMat, set.helico, { shadow: true });
  instanced(list, DECO.shroom, floraMat, set.shroom, {});
  instanced(list, DECO.stump, decoMat, set.stump, { shadow: true });
  instanced(list, DECO.island, floraMat, set.island, { shadow: true });
  instanced(list, DECO.tree_palm, decoMat, set.palm, { shadow: true });
  instanced(list, DECO.rock, decoMat, set.rock, { shadow: true });
}

// ============================================================ Water
let water = null;
export const WATER_U = {
  uTime: ATMO.uTime,
  uDeep: { value: new THREE.Color('#0d3a4f') },
  uScatter: { value: new THREE.Color('#1f6b6b') },
  fogColor: { value: new THREE.Color() },
  fogDensity: { value: 0.0005 },
};

function createWater() {
  const uniforms = { ...ATMO, ...FOG, ...WATER_U };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vView;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uScatter; uniform vec3 fogColor; uniform float fogDensity;
      uniform vec3 uFogSunDir; uniform vec3 uFogSunColor; uniform float uFogHeightDensity; uniform float uFogHeightFalloff;
      uniform float uSunDisc; uniform float uNight;
      varying vec3 vWorld; varying vec3 vView;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_FOG_FN}
      vec2 wv(vec2 p, vec2 dir, float freq, float amp, float speed){
        float ph = dot(p, dir) * freq + uTime * speed;
        return dir * (cos(ph) * amp * freq);
      }
      void main(){
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 v = toCam / dist;
        vec2 p = vWorld.xz;
        vec2 g = vec2(0.0);
        g += wv(p, normalize(vec2(0.8, 0.6)), 0.09, 0.9, 1.4);
        g += wv(p, normalize(vec2(-0.5, 0.86)), 0.13, 0.55, 1.9);
        g += wv(p, normalize(vec2(0.2, -0.98)), 0.21, 0.32, 2.6);
        g += wv(p, normalize(vec2(-0.9, -0.3)), 0.37, 0.16, 3.3);
        g += wv(p, normalize(vec2(0.6, -0.7)), 0.61, 0.08, 4.4);
        vec2 q = p * 0.35 + vec2(uTime * 0.6, -uTime * 0.45);
        float e = 0.35;
        float n0 = fbm3(q);
        g += vec2(fbm3(q + vec2(e, 0.0)) - n0, fbm3(q + vec2(0.0, e)) - n0) * 1.4;
        float atten = 1.0 / (1.0 + dist * 0.0022);
        g *= atten;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        float ndv = max(dot(n, v), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y) + 0.002;
        r = normalize(r);
        vec3 sky = skyBase(r);
        float sunFacing = pow(max(dot(-v, uSunDir) * 0.5 + 0.5, 0.0), 3.0);
        vec3 body = uDeep + uScatter * (0.25 + 0.75 * clamp(0.5 + dot(g, uSunDir.xz) * 2.0, 0.0, 1.0)) * (0.5 + sunFacing);
        vec3 col = mix(body, sky, fres);
        float sd = max(dot(r, uSunDir), 0.0);
        float far = smoothstep(200.0, 2500.0, dist);
        float spec = pow(sd, mix(1400.0, 300.0, far)) * mix(30.0, 9.0, far) + pow(sd, 90.0) * 0.8 + pow(sd, 10.0) * 0.06;
        col += uSunColor * spec * (1.0 - 0.75 * uNight);
        // city light glints at night
        float glint = smoothstep(0.82, 0.98, fbm3(p * 0.08 + vec2(uTime * 0.05, 0.0))) * uNight * (1.0 - far);
        col += vec3(1.0, 0.7, 0.4) * glint * 0.12;
        float foam = smoothstep(0.68, 0.86, fbm3(p * 0.045 + vec2(uTime * 0.03, 0.0))) * smoothstep(0.1, 0.35, length(g)) * (1.0 - far);
        col = mix(col, vec3(0.8, 0.82, 0.85) * (0.6 + 0.4 * dot(uSunColor, vec3(0.33))), foam * 0.3);
        col = applyAtmoFog(col, vView, fogColor, fogDensity, uFogSunDir, uFogSunColor, uFogHeightDensity, uFogHeightFalloff);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  water = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000, 1, 1).rotateX(-Math.PI / 2), mat);
  water.frustumCulled = false;
  water.renderOrder = -10;
  G.scene.add(water);
}

// ============================================================ Clouds (billboards)
let clouds = null;
const CLOUD_N = 90;
const cloudData = [];
function createClouds() {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(CLOUD_N * 4), 4);
  const iMisc = new THREE.InstancedBufferAttribute(new Float32Array(CLOUD_N * 2), 2);
  iPos.setUsage(THREE.DynamicDrawUsage); iMisc.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos);
  geo.setAttribute('iMisc', iMisc);
  geo.instanceCount = CLOUD_N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...ATMO, ...FOG, map: { value: TEX.cloud }, fogColor: WATER_U.fogColor, fogDensity: WATER_U.fogDensity },
    vertexShader: /* glsl */`
      attribute vec4 iPos; attribute vec2 iMisc;
      varying vec2 vUv; varying float vA; varying vec3 vView; varying vec3 vWDir;
      void main(){
        vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
        float c = cos(iMisc.x), s = sin(iMisc.x);
        vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
        mv.xy += q * vec2(iPos.w * 1.6, iPos.w * 0.9);
        vView = mv.xyz;
        vWDir = normalize(iPos.xyz - cameraPosition);
        vUv = uv; vA = iMisc.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 uCloudColor; uniform vec3 uCloudShadow; uniform vec3 fogColor; uniform float fogDensity;
      uniform vec3 uFogSunDir; uniform vec3 uFogSunColor; uniform float uFogHeightDensity; uniform float uFogHeightFalloff;
      uniform vec3 uSunColor;
      varying vec2 vUv; varying float vA; varying vec3 vView; varying vec3 vWDir;
      ${GLSL_FOG_FN}
      void main(){
        vec4 t = texture2D(map, vUv);
        float sd = max(dot(vWDir, uFogSunDir), 0.0);
        vec3 col = mix(uCloudShadow, uCloudColor, t.r);
        col += uSunColor * pow(sd, 6.0) * 0.35 * (1.0 - t.a);
        float near = smoothstep(40.0, 160.0, length(vView));
        col = applyAtmoFog(col, vView, fogColor, fogDensity * 0.8, uFogSunDir, uFogSunColor, 0.0, 0.0);
        gl_FragColor = vec4(col, t.a * vA * near);
      }`,
    transparent: true,
    depthWrite: false,
  });
  clouds = new THREE.Mesh(geo, mat);
  clouds.frustumCulled = false;
  clouds.renderOrder = 5;
  G.scene.add(clouds);
  for (let i = 0; i < CLOUD_N; i++) cloudData.push({ x: 0, y: 0, z: 0, s: 0, r: 0, a: 0, alive: false });
}

function respawnCloud(c, d, spread) {
  const dd = d + (spread ? Math.random() * 3600 - 200 : 3200 + Math.random() * 400);
  const lx = (Math.random() * 2 - 1) * 1600;
  c.x = pathX(dd) + lx; c.z = -dd;
  const low = Math.random() < 0.18;
  c.y = low ? 70 + Math.random() * 30 : 170 + Math.random() * 140;
  c.s = (low ? 60 : 120) + Math.random() * 160;
  c.r = (Math.random() - 0.5) * 0.3;
  c.a = low ? 0.55 : 0.85;
  c.alive = true;
}
export function resetClouds() { for (const c of cloudData) c.alive = false; }

const _cd = [];
function updateClouds(d, cover) {
  const cam = G.camera.position;
  for (const c of cloudData) {
    if (!c.alive) respawnCloud(c, d, true);
    else if (-c.z < d - 300) respawnCloud(c, d, false);
  }
  _cd.length = 0;
  for (const c of cloudData) { c.dist = (c.x - cam.x) ** 2 + (c.y - cam.y) ** 2 + (c.z - cam.z) ** 2; _cd.push(c); }
  _cd.sort((a, b) => b.dist - a.dist);
  const ip = clouds.geometry.attributes.iPos, im = clouds.geometry.attributes.iMisc;
  const vis = clamp(cover * 1.6, 0, 1);
  for (let i = 0; i < _cd.length; i++) {
    const c = _cd[i];
    ip.array[i * 4] = c.x; ip.array[i * 4 + 1] = c.y; ip.array[i * 4 + 2] = c.z; ip.array[i * 4 + 3] = c.s;
    im.array[i * 2] = c.r; im.array[i * 2 + 1] = c.a * vis;
  }
  ip.needsUpdate = true; im.needsUpdate = true;
}

// ============================================================ Palettes along the stage
let PALETTE_KEYS = [];
const PALS = {};
const envMaps = {};
let currentEnv = null;
const curPal = {};

export function paletteAt(d, out = curPal) {
  let a = PALETTE_KEYS[0], b = PALETTE_KEYS[0];
  for (let i = 0; i < PALETTE_KEYS.length; i++) {
    if (PALETTE_KEYS[i].at <= d) { a = PALETTE_KEYS[i]; b = PALETTE_KEYS[Math.min(i + 1, PALETTE_KEYS.length - 1)]; }
  }
  const t = b.at > a.at ? smoothstep(a.at, b.at, d) : 0;
  lerpPalette(PALS[a.name], PALS[b.name], t, out);
  out._dominant = t < 0.5 ? a.name : b.name;
  return out;
}

// ============================================================ Init / stage switch / update
const LOOK_DEFAULT = {
  ground: '#8a867c', road: '#34373d', plaza: '#b0a894', park: '#4f7d38', park2: '#5f8c40',
  bank: '#8e8a80', bed: '#3a4a46', dirt: '#8a6c48',
  paddy: ['#6fa83a', '#86b844', '#5c9636', '#a3c45a'], paddyWater: '#7aa6a8',
  hill: '#4e7a3a', hill2: '#3f6a33', rock: '#7b6f63', rock2: '#948a7c', snow: '#f1f3f6', snowLine: 0,
  bldg: ['#d6d0c4', '#b8b4ac', '#9aa4b0', '#c8b89a', '#7f8a96'], hallRoof: ['#c9a032'], roofs: ['#b5502e', '#8a3b2a', '#5d6b7a'],
  neonCols: ['#ff3fa0', '#3fe0ff', '#b46bff', '#ffd23f', '#ff6a3f'], boatCols: ['#c84a32', '#3a5a8a', '#e8e4d8', '#2f6a4a'],
  tree: 'round', neon: false, lamps: true, boats: false, night: 0,
  // Pandora
  floor: '#2e5a3e', moss: '#3a7a4c', fern: '#2a6a50', trail: '#5a6a48', grass: '#5a9a48', grass2: '#7aaa50',
  mud: '#6a5440', mud2: '#4e3e30', sand: '#e2d6a8', canopy: '#2a5e46', canopy2: '#3a7050',
};
const COLOR_FIELDS = ['ground', 'road', 'plaza', 'park', 'park2', 'bank', 'mud', 'bed', 'dirt', 'paddyWater', 'hill', 'hill2', 'rock', 'rock2', 'snow',
  'floor', 'moss', 'fern', 'trail', 'grass', 'grass2', 'mud2', 'sand', 'canopy', 'canopy2'];
const COLOR_LISTS = ['paddy', 'bldg', 'hallRoof', 'roofs', 'neonCols', 'boatCols'];

export function initWorld() {
  terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.0, envMapIntensity: 0.55 });
  // At night the moss lights up where it is "touched": a field of cyan/teal glow spots, strongest on green ground.
  patchFog(terrainMat, (shader) => {
    shader.uniforms.uNight = ATMO.uNight;
    shader.uniforms.uGlowAmt = TERRAIN_GLOW;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPt;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPt = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPt; uniform float uNight; uniform float uGlowAmt;\nfloat th(vec2 p){ return fract(sin(dot(p, vec2(27.1, 61.7))) * 43758.5); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uNight > 0.01 && uGlowAmt > 0.0) {
          vec2 c = floor(vWPt.xz / 3.0); vec2 f = fract(vWPt.xz / 3.0) - 0.5;
          float r = th(c); vec2 o = vec2(th(c + 3.1), th(c + 7.7)) - 0.5;
          float spot = smoothstep(0.32, 0.0, length(f - o * 0.5)) * step(0.62, r);
          float green = clamp((vColor.g - max(vColor.r, vColor.b) * 0.8) * 6.0, 0.0, 1.0);
          vec3 gc = mix(vec3(0.15, 0.7, 1.0), vec3(0.55, 0.3, 1.0), step(0.86, r));
          totalEmissiveRadiance += gc * spot * green * uNight * uGlowAmt * 1.6;
        }`);
  });
  initDecorations();
  createWater();
  createClouds();
}

// Switch the world to a stage definition (segments, look, palettes). Rebuilds lazily as chunks stream in.
export function setStage(stage) {
  if (STAGE === stage) return;
  STAGE = stage;
  resetTerrain();
  resetClouds();
  SEGS = stage.segments.map(prepSeg);
  const L = { ...LOOK_DEFAULT, ...stage.look };
  for (const k of COLOR_FIELDS) L[k] = new THREE.Color(L[k]);
  for (const k of COLOR_LISTS) L[k] = L[k].map(c => new THREE.Color(c));
  LOOK = L;
  PALETTE_KEYS = stage.paletteKeys;
  for (const k in stage.palettes) {
    const id = stage.key + ':' + k;
    if (!PALS[id]) PALS[id] = preparePalette(stage.palettes[k]);
    if (!envMaps[id]) envMaps[id] = makeEnvMap(PALS[id]);
  }
  PALETTE_KEYS = stage.paletteKeys.map(p => ({ at: p.at, name: stage.key + ':' + p.name }));
  // night factor for decorations is fixed per stage (max over its palettes)
  L.night = Math.max(...PALETTE_KEYS.map(p => PALS[p.name].night || 0));
  TERRAIN_GLOW.value = stage.groundGlow ?? 1;
  if (water) water.visible = stage.water !== false;
}
export function currentStage() { return STAGE; }

export function setWorldAtmosphere(d) {
  const p = paletteAt(d);
  applyPalette(p);
  WATER_U.uDeep.value.copy(p.waterDeep);
  WATER_U.uScatter.value.copy(p.waterScatter);
  WATER_U.fogColor.value.copy(p.fog);
  WATER_U.fogDensity.value = p.fogDensity;
  const env = envMaps[p._dominant];
  if (env && env !== currentEnv) { G.scene.environment = env; currentEnv = env; }
  const n = p.night || 0;
  if (neonMat) { neonMat.userData.emit.value = 1.2 + 4.5 * n; lampMat.userData.emit.value = 0.4 + 5.5 * n; }
  if (floraMat) floraMat.userData.emit.value = 0.35 + 4.2 * n;
  return p;
}

export function updateWorld(dt, d, focus) {
  ATMO.uTime.value += dt;
  const p = setWorldAtmosphere(d);
  updateTerrain(d);
  const cam = G.camera.position;
  water.position.set(Math.round(cam.x / 50) * 50, 0, Math.round(cam.z / 50) * 50);
  updateClouds(d, p.cloudCover);
}
