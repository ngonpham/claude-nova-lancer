// PANDORA RIDERS — radio portraits (fan game)
// Hand-authored inline SVG busts for the radio-comm panel. Original stylised artwork evoking the
// setting (non-commercial fan game) — not likenesses of any actor.
//
// Cast:
//   neytiri  — Neytiri, Omaticaya huntress (beaded headband, braids, feathers, red bead necklace)
//   tsutey   — Tsu'tey, Omaticaya warrior (feather war crest, bone beads, white war-paint dots)
//   neteyam  — Neteyam, Sully's eldest son (simple side braids, leather chest strap, fang cord)
//   moat     — Mo'at, the clan's Tsahik (bone-and-feather fan headdress, layered bead collar)
//   grace    — Grace, human xenobotanist (auburn bob, comms headset, field jacket)
//   norm     — Norm, human scientist / tech (glasses, stubble, headset, lab polo)
//   tonowari — Tonowari, Metkayina sea-clan chief (teal skin, tattoos, top-knot, shell & bone)
//   quaritch — Quaritch, RDA recombinant colonel (buzz cut, three scars, armour; red enemy feed)
//
// portraitSVG(id) returns a complete <svg> string (viewBox 0 0 128 128, fills its box with
// preserveAspectRatio "xMidYMid slice", transparent background) meant to be dropped into the
// comm panel via innerHTML. The HUD animates it by toggling classes on the root <svg>:
//   .open  -> mouth open   (swaps <g class="pm-closed"> for <g class="pm-open">)
//   .blink -> eyes closed  (swaps <g class="pe-open">   for <g class="pe-closed">)
// Every gradient/clipPath id is prefixed with the character id, so any number of portraits
// can live in one document. Markup is built once per id and cached.
export const CHARACTERS = {
  neytiri:  { name: 'NEYTIRI',  nameJa: 'Neytiri',  role: 'OMATICAYA',   color: '#7fd6ff' },
  tsutey:   { name: "TSU'TEY",  nameJa: "Tsu'tey",  role: 'OMATICAYA',   color: '#ff9a5a' },
  neteyam:  { name: 'NETEYAM',  nameJa: 'Neteyam',  role: 'SULLY',       color: '#9ad8ff' },
  moat:     { name: "MO'AT",    nameJa: "Mo'at",    role: 'TSAHIK',      color: '#e7b6ff' },
  grace:    { name: 'GRACE',    nameJa: 'Grace',    role: 'NHÀ KHOA HỌC', color: '#9cf0b0' },
  norm:     { name: 'NORM',     nameJa: 'Norm',     role: 'KỸ THUẬT',    color: '#ffd166' },
  tonowari: { name: 'TONOWARI', nameJa: 'Tonowari', role: 'METKAYINA',   color: '#4fe0d0' },
  quaritch: { name: 'QUARITCH', nameJa: 'Quaritch', role: 'RDA',         color: '#ff3355' },
};

const STYLE = '<style>.pm-open,.pe-closed{display:none}svg.open .pm-open,svg.blink .pe-closed{display:inline}svg.open .pm-closed,svg.blink .pe-open{display:none}</style>';
const MIRROR = 'matrix(-1 0 0 1 128 0)';
const both = (m) => m + `<g transform="${MIRROR}">${m}</g>`;
const f = (n) => Math.round(n * 100) / 100;

function wrap(id, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${CHARACTERS[id] ? CHARACTERS[id].name : 'NO SIGNAL'}">${STYLE}<defs>${defs}</defs>${body}</svg>`;
}

// ---------------------------------------------------------------- shared drawing helpers
const lin = (id, stops, x2 = 0, y2 = 1, x1 = 0, y1 = 0) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
const rad = (id, stops, cx = .5, cy = .5, r = .5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;
const tri = (id, a, b, c, cx, cy, r) => rad(id, [[0, a], [.6, b], [1, c]], cx, cy, r);
const rimGrad = (id, c, from = .6, op = .8) => lin(`${id}-rim`, [[from, c, 0], [1, c, op]], 1, 0);

// point on a cubic bezier
const cub = (p, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]); };
const cubD = (p) => `M${p[0]} C${p[1]} ${p[2]} ${p[3]}`;

// tapered "tiger" stripe (lens shape) from (x1,y1) to (x2,y2), width w, bowed sideways by b
function stripe(x1, y1, x2, y2, w, b = 0) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
  return `M${f(x1)} ${f(y1)} Q${f(mx + nx * (b + w))} ${f(my + ny * (b + w))} ${f(x2)} ${f(y2)} Q${f(mx + nx * (b - w))} ${f(my + ny * (b - w))} ${f(x1)} ${f(y1)} Z`;
}
const stripes = (list, fill, op = 1) => `<g fill="${fill}" opacity="${op}">${list.map((s) => `<path d="${stripe(...s)}"/>`).join('')}</g>`;
// bioluminescent freckles: soft halo + bright core
const glowDots = (list, core, halo) => `<g fill="${halo}" opacity=".35">${list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${f(r * 2.1)}"/>`).join('')}</g><g fill="${core}">${list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
// a row of round beads along a path (dash trick): dark rim + colour + tiny highlight
const beadPath = (d, col, w, gap, ink, off = 0) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${f(w + 1.1)}" stroke-dasharray="0 ${gap}" stroke-dashoffset="${off}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="0 ${gap}" stroke-dashoffset="${off}" stroke-linecap="round"/>`;
// individual beads at points of a cubic, cycling colours
const beadsOn = (p, n, r, cols, ink, t0 = 0, t1 = 1) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const [x, y] = cub(p, t0 + (t1 - t0) * (n === 1 ? .5 : i / (n - 1)));
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${cols[i % cols.length]}" stroke="${ink}" stroke-width=".6"/><circle cx="${f(x - r * .35)}" cy="${f(y - r * .35)}" r="${f(r * .32)}" fill="#fff" opacity=".7"/>`;
  }
  return s;
};
// feather pointing along local +y from (x,y), rotated by ang degrees
function feather(x, y, len, ang, c1, c2, ink, w = 3.2, c3 = null) {
  const L = len;
  return `<g transform="translate(${x} ${y}) rotate(${ang})"><path d="M0 0 C${w} ${f(L * .22)} ${f(w * 1.05)} ${f(L * .68)} 0 ${L} C${-f(w * 1.05)} ${f(L * .68)} ${-w} ${f(L * .22)} 0 0 Z" fill="${c1}" stroke="${ink}" stroke-width=".9" stroke-linejoin="round"/>` +
    (c3 ? `<path d="M0 ${f(L * .36)} C${f(w * 1.02)} ${f(L * .44)} ${f(w * 1.02)} ${f(L * .54)} ${f(w * .9)} ${f(L * .58)} L${-f(w * .9)} ${f(L * .58)} C${-f(w * 1.02)} ${f(L * .54)} ${-f(w * 1.02)} ${f(L * .44)} 0 ${f(L * .36)} Z" fill="${c3}"/>` : '') +
    `<path d="M0 ${f(L * .66)} C${f(w * .95)} ${f(L * .74)} ${f(w * .8)} ${f(L * .9)} 0 ${L} C${-f(w * .8)} ${f(L * .9)} ${-f(w * .95)} ${f(L * .74)} 0 ${f(L * .66)} Z" fill="${c2}"/><path d="M0 ${f(L * .04)} V${f(L * .97)}" stroke="${ink}" stroke-width=".65" opacity=".75"/><path d="M0 ${f(L * .3)} L${f(w * .8)} ${f(L * .38)} M0 ${f(L * .5)} L${-f(w * .8)} ${f(L * .57)}" stroke="${ink}" stroke-width=".5" opacity=".5"/></g>`;
}
// plaited braid: alternating tilted lobes along a cubic
function braid(p, n, w, fill, ink, hi) {
  let s = `<path d="${cubD(p)}" fill="none" stroke="${ink}" stroke-width="${f(w + 1.4)}" stroke-linecap="round"/>`;
  for (let i = 0; i < n; i++) {
    const t = (i + .5) / n, [x, y] = cub(p, t), [xa, ya] = cub(p, Math.max(0, t - .02)), [xb, yb] = cub(p, Math.min(1, t + .02));
    const a = Math.atan2(yb - ya, xb - xa) * 180 / Math.PI + (i % 2 ? 32 : -32);
    s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(w * .62)}" ry="${f(w * .42)}" transform="rotate(${f(a)} ${f(x)} ${f(y)})" fill="${fill}" stroke="${ink}" stroke-width=".55"/>`;
    if (hi) s += `<circle cx="${f(x - w * .12)}" cy="${f(y - w * .12)}" r="${f(w * .14)}" fill="${hi}" opacity=".7"/>`;
  }
  return s;
}

// ---------------------------------------------------------------- eyes
// canonical LEFT eye centred on the iris; mirrored for the right one. Light comes from upper-left
// for both eyes (highlights are counter-flipped).
const NAVI_EYE = 'M8 1.5 C5.5 -5 -5.5 -6.8 -9 -2.5 C-6.5 4.6 4 5.6 8 1.5 Z';
const HUMAN_EYE = 'M7 .9 C4.4 -3.9 -4.4 -4.4 -7.2 .2 C-4.4 3.4 4.2 3.6 7 .9 Z';
function eyePair(id, o) {
  const { x, y, s = 1, rot = 0, ink, human = false } = o;
  const E = human ? HUMAN_EYE : NAVI_EYE;
  const ir = human ? 3.3 : 5.3, pr = human ? [1.5, 1.5] : [1.55, 2.15];
  const lidFor = (ly) => ly == null ? '' : (human
    ? `<path d="M-8 .2 C-5 ${ly} 4 ${f(ly + .5)} 8 .9 C5 -6.5 -5 -7 -8 .2 Z" fill="${o.lidFill}"/><path d="M-7.4 .1 C-4.6 ${ly} 4 ${f(ly + .5)} 7.4 .9" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`
    : `<path d="M-10 -2.6 C-6 ${ly} 4 ${f(ly + .6)} 9.2 1.6 C6 -8.5 -6 -9.5 -10 -2.6 Z" fill="${o.lidFill}"/><path d="M-9.6 -2.4 C-6 ${ly} 4 ${f(ly + .6)} 8.8 1.7" fill="none" stroke="${ink}" stroke-width="2.3" stroke-linecap="round"/><path d="M-8.6 ${f(ly - 3)} C-4 ${f(ly - 5.4)} 3 ${f(ly - 4.6)} 7.6 ${f(ly - 1.8)}" fill="none" stroke="${ink}" stroke-width=".8" opacity=".55" stroke-linecap="round"/>`);
  const ball = human
    ? `<path d="${E}" fill="#fbf6ee"/><g clip-path="url(#${id}-eye)"><circle r="${ir}" fill="url(#${id}-iris)"/><circle r="${ir}" fill="none" stroke="${o.irisEdge}" stroke-width=".7"/><circle cx=".1" cy=".1" r="${pr[0]}" fill="#0c0806"/><path d="M-9 -7 H9 V-1.4 C4 -3 -4 -3.4 -9 -.4 Z" fill="#3a1e10" opacity=".25"/></g>`
    : `<path d="${E}" fill="#f4eed6"/><g clip-path="url(#${id}-eye)"><circle r="${ir}" fill="url(#${id}-iris)"/><circle r="${ir}" fill="none" stroke="${o.irisEdge}" stroke-width=".9"/><ellipse cx=".2" cy=".25" rx="${pr[0]}" ry="${pr[1]}" fill="#0a0604"/><path d="M-11 -9 H11 V-1.6 C5 -4.2 -5 -4.6 -11 -.6 Z" fill="#000" opacity=".28"/></g>`;
  const hi = human
    ? `<circle cx="-1.2" cy="-1.3" r=".95" fill="#fff"/><circle cx="1.5" cy="1.3" r=".45" fill="#fff" opacity=".85"/>`
    : `<circle cx="-1.9" cy="-2" r="1.45" fill="#fff"/><circle cx="2.3" cy="2" r=".65" fill="#fff" opacity=".9"/>`;
  const lines = human
    ? `<path d="M7.6 1 C4.6 -4.6 -4.6 -5 -7.8 .3" fill="none" stroke="${ink}" stroke-width="1.7" stroke-linecap="round"/><path d="M-7.4 .2 L-9.4 -1" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/><path d="M-5.6 1.8 C-2.6 3.8 3 3.9 6 2" fill="none" stroke="${ink}" stroke-width=".6" opacity=".6"/>`
    : `<path d="M8.8 1.7 C5.8 -5.6 -5.8 -7.6 -9.6 -2.6" fill="none" stroke="${ink}" stroke-width="2.3" stroke-linecap="round"/><path d="M-9.2 -2.8 L-12.4 -4.6" stroke="${ink}" stroke-width="1.7" stroke-linecap="round"/><path d="M-7.6 1.2 C-4 4.6 3.6 5 7.4 2.2" fill="none" stroke="${ink}" stroke-width=".85" opacity=".7"/>`;
  const shut = human
    ? `<path d="M-7.6 .4 C-4 3.4 4 3.6 7.4 1" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/><path d="M-7.4 .4 L-9.4 -.6" stroke="${ink}" stroke-width="1.1" stroke-linecap="round"/>`
    : `<path d="M-9.4 -1.2 C-5 3.8 4 4.2 8.6 1.4" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/><path d="M-9.2 -1.4 L-12.2 -2.8" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`;
  const shutLid = o.lid != null && !human ? `<path d="M-8.4 -4.2 C-4 -6.4 3 -5.6 7.6 -2.6" fill="none" stroke="${ink}" stroke-width=".8" opacity=".5" stroke-linecap="round"/>` : '';
  const TL = `translate(${x} ${y}) rotate(${rot}) scale(${s})`;
  const TR = `translate(${128 - x} ${y}) scale(-1 1) rotate(${rot}) scale(${s})`;
  const lidR = o.lidR !== undefined ? o.lidR : o.lid;
  const open = `<g transform="${TL}">${ball}${hi}${lidFor(o.lid)}${o.lid == null ? lines : lines.replace(/<path d="M8\.8 1\.7[^>]*>|<path d="M7\.6 1 [^>]*>/, '')}</g>` +
    `<g transform="${TR}">${ball}<g transform="scale(-1 1)">${hi}</g>${lidFor(lidR)}${lidR == null ? lines : lines.replace(/<path d="M8\.8 1\.7[^>]*>|<path d="M7\.6 1 [^>]*>/, '')}</g>`;
  const closed = `<g transform="${TL}">${shutLid}${shut}</g><g transform="${TR}">${shutLid}${shut}</g>`;
  return { clip: `<clipPath id="${id}-eye"><path d="${E}"/></clipPath>`, markup: `<g class="pe-open">${open}</g><g class="pe-closed">${closed}</g>` };
}

// ---------------------------------------------------------------- mouths
// Full-lipped mouth centred on x=64. up/upR lift the left/right corners (negative = frown).
function mouth(o) {
  const { y, w, lip, lipHi, ink, up = 0, upR = up, open = 8, inside = '#1c0a1e', tongue = '#c8506a', fang = true } = o;
  const xl = 64 - w, xr = 64 + w, yl = y - up, yr = y - upR, h = open;
  const c = (k) => f(64 - w * k), d = (k) => f(64 + w * k);
  const closed = `<path d="M${xl} ${yl} C${c(.55)} ${f(y - 2.4)} ${f(62.2)} ${f(y - 2.1)} 64 ${f(y - 1.2)} C${f(65.8)} ${f(y - 2.1)} ${d(.55)} ${f(y - 2.4)} ${xr} ${yr} C${d(.4)} ${f(y + .7)} ${c(.4)} ${f(y + .7)} ${xl} ${yl} Z" fill="${lip}"/>` +
    `<path d="M${f(xl + 1.4)} ${f(yl + .7)} C${c(.5)} ${f(y + 5.2)} ${d(.5)} ${f(y + 5.2)} ${f(xr - 1.4)} ${f(yr + .7)} C${d(.4)} ${f(y + 1.3)} ${c(.4)} ${f(y + 1.3)} ${f(xl + 1.4)} ${f(yl + .7)} Z" fill="${lip}"/>` +
    `<ellipse cx="64" cy="${f(y + 2.9)}" rx="${f(w * .32)}" ry=".9" fill="${lipHi}" opacity=".75"/>` +
    `<path d="M${f(xl - .6)} ${f(yl - .3)} C${c(.4)} ${f(y + 1)} ${d(.4)} ${f(y + 1)} ${f(xr + .6)} ${f(yr - .3)}" fill="none" stroke="${ink}" stroke-width="1.4" stroke-linecap="round"/>`;
  const iy = (k) => f(y + h * k);
  const openM = `<path d="M${xl} ${yl} C${c(.4)} ${f(y - 1.6)} ${d(.4)} ${f(y - 1.6)} ${xr} ${yr} C${f(xr - .8)} ${iy(.8)} ${d(.36)} ${iy(1)} 64 ${iy(1)} C${c(.36)} ${iy(1)} ${f(xl + .8)} ${iy(.8)} ${xl} ${yl} Z" fill="${inside}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M${c(.52)} ${iy(1) - 1.2} Q64 ${f(y + h - 5.4)} ${d(.52)} ${iy(1) - 1.2} Q64 ${f(y + h + .3)} ${c(.52)} ${iy(1) - 1.2} Z" fill="${tongue}"/>` +
    `<path d="M${f(xl + 1.6)} ${f(yl + .2)} C${c(.4)} ${f(y - .9)} ${d(.4)} ${f(y - .9)} ${f(xr - 1.6)} ${f(yr + .2)} L${f(xr - 2.4)} ${f(yr + 2)} C${d(.4)} ${f(y + 1.1)} ${c(.4)} ${f(y + 1.1)} ${f(xl + 2.4)} ${f(yl + 2)} Z" fill="#f4f1ea"/>` +
    (fang ? `<path d="M${c(.62)} ${f(y + .4)} L${c(.55)} ${f(y + 3.4)} L${c(.44)} ${f(y + .6)} Z M${d(.44)} ${f(y + .6)} L${d(.55)} ${f(y + 3.4)} L${d(.62)} ${f(y + .4)} Z" fill="#f4f1ea"/>` : '') +
    `<path d="M${xl} ${yl} C${c(.55)} ${f(y - 2.9)} ${f(62.2)} ${f(y - 2.5)} 64 ${f(y - 1.7)} C${f(65.8)} ${f(y - 2.5)} ${d(.55)} ${f(y - 2.9)} ${xr} ${yr} C${d(.4)} ${f(y - 1.3)} ${c(.4)} ${f(y - 1.3)} ${xl} ${yl} Z" fill="${lip}"/>` +
    `<path d="M${f(xl + .9)} ${f(yl + 1.6)} C${f(xl + 1.6)} ${iy(.86)} ${c(.36)} ${f(y + h + .5)} 64 ${f(y + h + .5)} C${d(.36)} ${f(y + h + .5)} ${f(xr - 1.6)} ${iy(.86)} ${f(xr - .9)} ${f(yr + 1.6)} C${f(xr + .2)} ${iy(.95)} ${d(.4)} ${f(y + h + 3.6)} 64 ${f(y + h + 3.6)} C${c(.4)} ${f(y + h + 3.6)} ${f(xl - .2)} ${iy(.95)} ${f(xl + .9)} ${f(yl + 1.6)} Z" fill="${lip}"/>` +
    `<ellipse cx="64" cy="${f(y + h + 2.2)}" rx="${f(w * .3)}" ry=".75" fill="${lipHi}" opacity=".7"/>`;
  return `<g class="pm-closed">${closed}</g><g class="pm-open">${openM}</g>`;
}

// ---------------------------------------------------------------- Na'vi face assembly
const NAVI_EAR = 'M44 49 C36 44 26 37.5 14.5 29.5 C17 42 23.5 55.5 35 63.8 C38.5 66.2 42 66.6 44.6 64.6 Z';
function naviEar(id, c) {
  const { rot = 0, s = 1, extra = '' } = c.ear || {};
  return `<g transform="rotate(${rot} 43 57) translate(43 57) scale(${s}) translate(-43 -57)"><path d="${NAVI_EAR}" fill="url(#${id}-ear)" stroke="${c.ink}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M41.6 52.2 C35 47.6 28 42.8 21 38.2 C24 47 29.4 54.8 37 60.2 C39 61.6 41 61.2 41.7 59.2 Z" fill="${c.skin[2]}" opacity=".85"/><path d="M39.6 54.6 C35 51.6 30.4 48.4 26.4 45.6 C29 50.4 32.4 54.6 36.6 57.6 Z" fill="${c.ink}" opacity=".35"/>
<path d="${stripe(30, 41, 25.6, 46.4, 1.4)}" fill="${c.stripe}" opacity=".7"/><path d="${stripe(36, 46.4, 31.6, 51.8, 1.4)}" fill="${c.stripe}" opacity=".7"/>
<path d="M16.2 31.6 C25 37.6 35 44.2 43.4 49.4" fill="none" stroke="${c.skin[0]}" stroke-width=".9" opacity=".75" stroke-linecap="round"/>${extra}</g>`;
}

function naviNose(c) {
  const lt = c.skin[0], dk = c.skin[2], ink = c.ink;
  return `<path d="M60.6 47 C61.2 55 60.8 61 60.2 66 L67.8 66 C67.2 61 66.8 55 67.4 47 Z" fill="${lt}" opacity=".3"/>
${both(`<path d="M59.4 50 C59.4 57 58.8 62.4 57.4 66.6" fill="none" stroke="${dk}" stroke-width=".9" opacity=".45" stroke-linecap="round"/>`)}
<path d="M56.4 73.6 C57.4 76.6 70.6 76.6 71.6 73.6 C70.6 78.4 57.4 78.4 56.4 73.6 Z" fill="${dk}" opacity=".7"/>
<path d="M57.6 70.4 C59.4 67.6 61.8 66.6 64 66.6 C66.2 66.6 68.6 67.6 70.4 70.4 C68.4 69.6 59.6 69.6 57.6 70.4 Z" fill="${lt}" opacity=".35"/>
<ellipse cx="64" cy="70.6" rx="4.6" ry="2.3" fill="${lt}" opacity=".5"/>
${both(`<path d="M58.6 67.6 C55.6 68.8 54.8 72.6 57.6 74.4" fill="none" stroke="${ink}" stroke-width="1.1" stroke-linecap="round" opacity=".8"/><path d="M58.4 74.2 C59.2 72.2 61.4 72 62.6 73.6 C61.4 74.8 59.8 75 58.4 74.2 Z" fill="#06102a"/>`)}
<path d="M61 76.2 C62.6 75.6 65.4 75.6 67 76.2" fill="none" stroke="${ink}" stroke-width=".8" opacity=".5" stroke-linecap="round"/>
<path d="M64 76.6 V${f(c.mouth.y - 2)}" stroke="${dk}" stroke-width="2.6" opacity=".3" stroke-linecap="round"/>`;
}

function navi(id, c) {
  const ink = c.ink;
  const E = eyePair(id, { ...c.eye, ink, irisEdge: c.irisEdge, lidFill: c.skin[1] });
  const defs = `<clipPath id="${id}-clip"><path d="${c.head}"/></clipPath>${E.clip}
${tri(`${id}-skin`, c.skin[0], c.skin[1], c.skin[2], .58, .34, .78)}
${lin(`${id}-body`, [[0, c.skin[1]], [1, c.skin[2]]])}
${lin(`${id}-ear`, [[0, c.skin[0]], [.55, c.skin[1]], [1, c.skin[2]]], 1, 1)}
${tri(`${id}-iris`, c.iris[0], c.iris[1], c.iris[2], .5, .38, .62)}
${lin(`${id}-hair`, [[0, c.hair?.[0] || '#2c3150'], [1, c.hair?.[1] || '#0a0c18']], 1, 1)}
${rimGrad(id, c.rim)}${c.defs || ''}`;
  const shade = `<path d="M${c.shade || 'M30 40 C34 52 36 64 42 76 C46 84 52 92 58 100 L20 100 L20 40 Z'}" fill="${c.skin[2]}" opacity=".55"/>`.replace('d="MM', 'd="M');
  const face = `<path d="${c.head}" fill="url(#${id}-skin)"/><g clip-path="url(#${id}-clip)">${shade}${both(stripes(c.stripes, c.stripe, .85))}${stripes(c.stripesC || [], c.stripe, .85)}${c.faceClip || ''}</g>` +
    both(glowDots(c.dots, c.dotCore || '#e6fdff', c.dotHalo || '#8ff4ff')) + naviNose(c) + both(c.brow) + (c.faceTop || '');
  const rim = `<path d="${c.head}" fill="none" stroke="url(#${id}-rim)" stroke-width="3.8" clip-path="url(#${id}-clip)"/>`;
  return wrap(id, defs, `${c.back || ''}${c.body || ''}${both(naviEar(id, c))}${c.earsFront || ''}${face}${E.markup}${mouth({ ...c.mouth, lip: c.lip, lipHi: c.lipHi, ink })}${rim}<path d="${c.head}" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>${c.front || ''}`);
}

// shared Na'vi neck + shoulders
function naviTorso(id, ink, nw = 9.5, sx = 6, sy = 106, extra = '') {
  return `<path d="M${64 - nw} 84 C${64 - nw} 95 ${f(64 - nw - .8)} 102 ${f(64 - nw - 6)} 109 L${f(64 + nw + 6)} 109 C${f(64 + nw + .8)} 102 ${64 + nw} 95 ${64 + nw} 84 Z" fill="url(#${id}-body)" stroke="${ink}" stroke-width="1.3"/>
<path d="M${sx} 128 C${sx + 3} 115 ${f(sx + 22)} ${sy + 2} ${f(64 - nw - 4)} ${sy} C58 ${sy + 3.6} 70 ${sy + 3.6} ${f(64 + nw + 4)} ${sy} C${f(128 - sx - 22)} ${sy + 2} ${128 - sx - 3} 115 ${128 - sx} 128 Z" fill="url(#${id}-body)" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M${sx} 128 C${sx + 3} 117 ${sx + 10} 111 ${sx + 20} ${sy + 3.5} C${sx + 15} 114 ${sx + 13} 121 ${sx + 13} 128 Z" fill="${ink}" opacity=".3"/>
<path d="M${64 - nw} 88 C58 99 70 99 ${64 + nw} 88 L${64 + nw} 97 C70 104 58 104 ${64 - nw} 97 Z" fill="${ink}" opacity=".32"/>
${both(`<path d="M${f(64 - nw - 14)} ${sy + 5} C${f(64 - nw - 8)} ${sy + 6.6} ${f(64 - nw - 2)} ${sy + 6.6} 61 ${sy + 5}" fill="none" stroke="${ink}" stroke-width=".9" opacity=".5" stroke-linecap="round"/>`)}${extra}`;
}

// ---------------------------------------------------------------- NEYTIRI
function neytiri() {
  const id = 'neytiri', ink = '#0a1838';
  const head = 'M64 27 C78 27 86 37 86.5 52 C87 62 84.5 72 79 81 C74.5 89 69.5 97 64 97.5 C58.5 97 53.5 89 49 81 C43.5 72 41 62 41.5 52 C42 37 50 27 64 27 Z';
  const hairBack = `<path d="M64 16 C87 16 98 31 97 54 C96.4 72 99.6 92 105 112 C107 120 105.4 126 102 128 L26 128 C22.6 126 21 120 23 112 C28.4 92 31.6 72 31 54 C30 31 41 16 64 16 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.4"/>
<g stroke="#4a5c96" stroke-width=".9" fill="none" opacity=".55" stroke-linecap="round"><path d="M36 50 C35 70 33 92 27 116"/><path d="M92 50 C93 70 95 92 101 116"/><path d="M40 36 C38 56 38 80 34 104"/><path d="M89 36 C91 56 91 80 95 104"/></g>`;
  const braids = braid([[34, 60], [30, 80], [28, 98], [24, 122]], 9, 4.2, '#1a1e34', '#05060e', '#5a6aa8') + braid([[95, 58], [99, 78], [102, 98], [106, 124]], 9, 4.2, '#1a1e34', '#05060e', '#5a6aa8');
  const necklace = beadPath('M44 108 C52 119 76 119 84 108', '#e8402a', 2.6, 3, '#3a0a08') + beadPath('M38 110 C48 127 80 127 90 110', '#ff8a2a', 2.8, 3.3, '#4a1a04', 1) +
    beadPath('M50 106 C56 112 72 112 78 106', '#f4ead0', 2, 2.6, '#4a3a20') + `<path d="M64 118 L61 124 L64 128 L67 124 Z" fill="#3ac0c8" stroke="#082a30" stroke-width=".9"/>`;
  const torso = naviTorso(id, ink, 8.6, 6, 106, `${both(`<path d="${stripe(22, 112, 32, 118, 1.6, -1)}" fill="#1c4488" opacity=".6"/><path d="${stripe(14, 118, 22, 126, 1.6, -1)}" fill="#1c4488" opacity=".6"/>`)}`);
  const capP = [[42.6, 47.5], [45, 38.4], [53, 34.2], [64, 34]];
  const capR = capP.map(([x, y]) => [128 - x, y]);
  const front = `<path d="M41.4 52 C40.4 33 50 21.6 64 21.6 C78 21.6 87.6 33 86.6 52 C84.6 42 77.4 34.6 64 34.2 C50.6 34.6 43.4 42 41.4 52 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.2" stroke-linejoin="round"/>
<g stroke="#5a6aa8" stroke-width=".9" fill="none" opacity=".7" stroke-linecap="round"><path d="M64 23 C56 25 49 30 45 40"/><path d="M64 23 C72 25 79 30 83 40"/><path d="M58 25 C52 29 48 34 46 42"/></g>
${both(`<path d="M42.6 46 C39.4 56 38.4 70 40.4 86" fill="none" stroke="#0c0f1e" stroke-width="2.6" stroke-linecap="round"/><path d="M42.6 46 C39.4 56 38.4 70 40.4 86" fill="none" stroke="#3a4876" stroke-width=".8" stroke-linecap="round"/>`)}
<path d="${cubD(capP)} C${capR[2]} ${capR[1]} ${capR[0]}" fill="none" stroke="#2a1408" stroke-width="3.4" stroke-linecap="round"/>
${beadsOn(capP, 6, 1.55, ['#ff5a2a', '#f4ead0', '#3ac0c8', '#ffb03a'], '#2a1408', .05, 1)}${beadsOn([capR[3], capR[2], capR[1], capR[0]], 6, 1.55, ['#f4ead0', '#3ac0c8', '#ffb03a', '#ff5a2a'], '#2a1408', 0, .95)}
<path d="M42.6 48 C39 54 35.6 60 32 64.6" stroke="#2a1408" stroke-width=".9" fill="none"/>${beadsOn([[42.6, 48], [40, 52.6], [37, 57.4], [33, 63]], 3, 1.3, ['#3ac0c8', '#ff5a2a', '#f4ead0'], '#2a1408')}
${feather(32, 64, 24, 16, '#f4efe0', '#d8342a', '#2a1a10', 3.2, '#2a1a10')}${feather(33.4, 64.4, 19, -4, '#e8a03a', '#2a1a10', '#2a1a10', 2.6)}${feather(31, 63.4, 17, 34, '#3ac0c8', '#f4efe0', '#082a30', 2.4)}`;
  return navi(id, {
    head, ink, skin: ['#86d6f8', '#4298da', '#21539a'], iris: ['#fff6b8', '#f4b02a', '#8a4806'], irisEdge: '#5a2a04',
    lip: '#2c3f8e', lipHi: '#7a98e6', stripe: '#163a7c', rim: '#c8f4ff',
    ear: { rot: 7, s: 1 }, eye: { x: 51.4, y: 57, s: 1, rot: 9 },
    brow: `<path d="M42.4 48.4 C48 45 55 46 60.2 51.4 C55 48.8 48.6 48.4 42.4 50.2 Z" fill="#15306a"/><path d="M43.6 46.6 C49 44.2 54.6 44.8 58.6 48" fill="none" stroke="#9adcff" stroke-width=".7" opacity=".6" stroke-linecap="round"/>`,
    stripes: [[52, 29, 55.6, 44, 2.4, .4], [46, 33, 50.2, 45, 2, .8], [41.6, 44, 47, 51, 2, 0], [43.2, 66, 49.6, 79, 2.4, -.6], [47.4, 62.6, 54, 70.6, 1.6, -.3], [50, 84, 55, 91, 1.4, 0]],
    stripesC: [[64, 35.4, 64, 46.6, 2.8, 0]],
    dots: [[44.4, 63.4, .75], [46.8, 65, .7], [49.3, 66, .7], [51.9, 66.5, .65], [57.2, 39.6, .7], [58.4, 42.8, .65], [59.6, 46, .6], [55.4, 37, .6], [45, 56.6, .55], [44.6, 69.6, .6]],
    mouth: { y: 84.2, w: 7.4, up: .2, open: 8 },
    back: hairBack + braids, body: torso + necklace, front,
  });
}

// ---------------------------------------------------------------- TSU'TEY
function tsutey() {
  const id = 'tsutey', ink = '#071530';
  const head = 'M64 25.5 C80 25.5 89 36 89.5 52 C90 63 88 73 83 82 C78 91 71 98.5 64 99 C57 98.5 50 91 45 82 C40 73 38 63 38.5 52 C39 36 48 25.5 64 25.5 Z';
  const hairBack = `<path d="M64 20 C83 20 93 33 92 53 C91.6 66 92 82 95 96 L98 112 L30 112 L33 96 C36 82 36.4 66 36 53 C35 33 45 20 64 20 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.3"/>`;
  const queue = braid([[90, 64], [97, 82], [96, 104], [100, 126]], 10, 5, '#1a1e34', '#05060e', '#5a6aa8');
  const choker = (() => { let s = ''; const P = [[52.4, 99], [56, 104.6], [72, 104.6], [75.6, 99]]; for (let i = 0; i < 9; i++) { const [x, y] = cub(P, i / 8); s += `<rect x="${f(x - 1.1)}" y="${f(y - 1)}" width="2.2" height="6.4" rx="1.1" fill="#efe6cf" stroke="#3a2e1a" stroke-width=".6"/>`; } return `<path d="${cubD(P)}" fill="none" stroke="#3a1e0e" stroke-width="2.2"/>${s}`; })();
  const torso = naviTorso(id, ink, 10.6, 1, 105, `${both(`<path d="${stripe(20, 110, 31, 117, 1.8, -1)}" fill="#163a7c" opacity=".6"/><path d="${stripe(10, 117, 19, 126, 1.8, -1)}" fill="#163a7c" opacity=".6"/><path d="M42 113 C46 118 53 120 59 119" fill="none" stroke="#071530" stroke-width=".9" opacity=".5"/>`)}
<path d="M90 106 C82 112 74 120 68 128 L76 128 C82 121 89 114 97 109 Z" fill="#6a3a1c" stroke="#2a1408" stroke-width="1" stroke-linejoin="round"/><path d="M91 108.6 C84 114 77 121 72 128" stroke="#d8a36a" stroke-width=".6" stroke-dasharray="1.4 1.4" fill="none"/>`);
  const bandP = [[39.4, 45], [44, 34.6], [53, 31], [64, 30.8]];
  const bandR = bandP.map(([x, y]) => [128 - x, y]);
  const crest = feather(64, 30, 31, 180, '#ff8a3a', '#1a1010', '#2a1206', 4.2, '#fff2dc') + feather(60.4, 30.6, 27, 160, '#1a1010', '#ff6a2a', '#2a1206', 3.6, '#f4ead0') + feather(67.6, 30.6, 27, 200, '#1a1010', '#ff6a2a', '#2a1206', 3.6, '#f4ead0') +
    feather(57, 32, 22, 140, '#f4ead0', '#e0402a', '#2a1206', 3.2) + feather(71, 32, 22, 220, '#f4ead0', '#e0402a', '#2a1206', 3.2);
  const bones = both(`<path d="M40 46 L37 64" stroke="#3a1e0e" stroke-width=".8"/><rect x="36.6" y="49" width="2.6" height="5.4" rx="1.2" transform="rotate(10 38 52)" fill="#efe6cf" stroke="#3a2e1a" stroke-width=".6"/><circle cx="37.6" cy="57" r="1.3" fill="#e0402a" stroke="#3a0a08" stroke-width=".5"/><rect x="35.6" y="59" width="2.6" height="5.6" rx="1.2" transform="rotate(10 37 61.8)" fill="#efe6cf" stroke="#3a2e1a" stroke-width=".6"/>`);
  const front = `<path d="M39 52 C37.4 34 48 22.4 64 22.4 C80 22.4 90.6 34 89 52 C87.6 41.4 80 32.6 64 32 C48 32.6 40.4 41.4 39 52 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.2" stroke-linejoin="round"/>
<g stroke="#5a6aa8" stroke-width=".9" fill="none" opacity=".65" stroke-linecap="round"><path d="M50 27 C46 32 43 38 41.6 44"/><path d="M78 27 C82 32 85 38 86.4 44"/></g>
${crest}<path d="${cubD(bandP)} C${bandR[2]} ${bandR[1]} ${bandR[0]}" fill="none" stroke="#1a0a04" stroke-width="5"/><path d="${cubD(bandP)} C${bandR[2]} ${bandR[1]} ${bandR[0]}" fill="none" stroke="#7a4220" stroke-width="3.2"/>
${beadsOn(bandP, 5, 1.35, ['#efe6cf', '#e0402a'], '#2a1206', .1, 1)}${beadsOn([bandR[3], bandR[2], bandR[1], bandR[0]], 5, 1.35, ['#e0402a', '#efe6cf'], '#2a1206', 0, .9)}${bones}`;
  // white war-paint dots (solid, larger than the bioluminescent freckles)
  const paint = both(`<g fill="#f8fbff" stroke="#0a1838" stroke-width=".35"><circle cx="44.2" cy="66.4" r="1.25"/><circle cx="47.6" cy="68.2" r="1.25"/><circle cx="51" cy="69.6" r="1.25"/><circle cx="45.6" cy="71.6" r="1.05"/><circle cx="49" cy="73.4" r="1.05"/><circle cx="55" cy="93.2" r=".95"/></g>`) +
    `<g fill="#f8fbff" stroke="#0a1838" stroke-width=".35"><circle cx="64" cy="38.4" r="1.2"/><circle cx="64" cy="42" r="1.1"/><circle cx="64" cy="45.4" r="1"/><circle cx="64" cy="93" r="1"/></g>`;
  return navi(id, {
    head, ink, skin: ['#72bfee', '#3680c8', '#1a4484'], iris: ['#fff2a8', '#f0a628', '#7e4004'], irisEdge: '#4a2404',
    lip: '#24367c', lipHi: '#6a88d6', stripe: '#102f6a', rim: '#ffd0a0',
    ear: { rot: 1, s: 1.05 }, eye: { x: 51, y: 57.4, s: .95, rot: 5, lid: -3.2 },
    brow: `<path d="M40.6 48.4 C47 45.6 55 46.6 61 52.8 C55.4 50.6 48 50.2 40.6 51.6 Z" fill="#0f2658"/><path d="M42 46.4 C48 44.2 54.6 45 59.4 48.6" fill="none" stroke="#9adcff" stroke-width=".7" opacity=".5" stroke-linecap="round"/><path d="M62.4 49.6 C62.8 51.4 62.8 53 62.4 54.6" fill="none" stroke="#0f2658" stroke-width=".9" opacity=".7" stroke-linecap="round"/>`,
    stripes: [[51, 33.6, 55, 44, 2.6, .4], [44.6, 36, 48.6, 46, 2.2, .8], [39.6, 45, 45.6, 52.2, 2.2, 0], [41.4, 74, 47.6, 86, 2.6, -.6], [53.4, 86.6, 57.6, 95, 1.6, 0], [40.4, 60, 43.6, 70, 1.8, -.4]],
    stripesC: [],
    dots: [[57.4, 37, .6], [58.6, 40.4, .55], [46.6, 63.2, .55], [49.2, 64.4, .5], [52, 65, .5], [43, 79, .55]],
    mouth: { y: 85.4, w: 8, up: -1.1, open: 7 },
    back: hairBack + queue, body: torso + choker, front, faceTop: paint,
  });
}

// ---------------------------------------------------------------- NETEYAM
function neteyam() {
  const id = 'neteyam', ink = '#0a1a3c';
  const head = 'M64 28 C79 28 87.5 38 87.5 53 C87.5 64 85 73 80 81 C75.5 88.5 70 95.5 64 96 C58 95.5 52.5 88.5 48 81 C43 73 40.5 64 40.5 53 C40.5 38 49 28 64 28 Z';
  const hairBack = `<path d="M64 19 C84 19 94 32 93.4 52 C93 66 94.6 80 97 94 L98 112 L30 112 L31 94 C33.4 80 35 66 34.6 52 C34 32 44 19 64 19 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.3"/>`;
  const strap = `<path d="M33 106 L44 104 L98 128 L80 128 Z" fill="url(#${id}-leather)" stroke="#2a1406" stroke-width="1.2" stroke-linejoin="round"/><path d="M35.6 107.4 L44 105.8 L91.6 127.4" fill="none" stroke="#e8c08a" stroke-width=".6" stroke-dasharray="1.6 1.4"/>
<path d="M66 113.6 L74.4 117.4 L72.6 121.6 L64.2 117.8 Z" fill="#c98c4a" stroke="#2a1406" stroke-width=".9" stroke-linejoin="round"/><circle cx="69.4" cy="117.6" r="1.4" fill="#3ac0c8" stroke="#082a30" stroke-width=".5"/>`;
  const cord = `<path d="M52.6 101 C56 109 72 109 75.4 101" fill="none" stroke="#3a1e0e" stroke-width="1.1"/><path d="M62.2 107.4 C62.4 112 63.4 115 64.6 117 C65.6 114.6 66.2 111 65.8 107.4 Z" fill="#f4ecd6" stroke="#3a2e1a" stroke-width=".7" stroke-linejoin="round"/><circle cx="60" cy="107" r="1.1" fill="#e8582a" stroke="#3a0a08" stroke-width=".45"/><circle cx="68" cy="107" r="1.1" fill="#e8582a" stroke="#3a0a08" stroke-width=".45"/>`;
  // quiver on his back: fletched arrows poking up behind his right shoulder
  const quiver = `<path d="M14 116 L21 92.6 L35.4 97 L29 120 Z" fill="url(#${id}-leather)" stroke="#2a1406" stroke-width="1.2" stroke-linejoin="round"/><path d="M20.4 95.4 L34.6 99.8" stroke="#e8c08a" stroke-width=".6" stroke-dasharray="1.4 1.2"/>
<g stroke="#3a2412" stroke-width="1.3" stroke-linecap="round"><path d="M23 96 L19.6 84"/><path d="M27.4 97 L25.8 83.4"/><path d="M31.6 98.4 L31.8 85.6"/></g>
${feather(19.8, 85, 13, 165, '#f4efe0', '#d8342a', '#2a1a10', 2.6)}${feather(25.9, 84.4, 14, 174, '#e8a03a', '#1a1010', '#2a1a10', 2.6)}${feather(31.8, 86.6, 12.4, 182, '#f4efe0', '#3ac0c8', '#2a1a10', 2.6)}
<path d="M20.6 93 L35.6 97.6" stroke="#2a1406" stroke-width="2.4" stroke-linecap="round"/>`;
  const torso = naviTorso(id, ink, 8.8, 5, 106.5, both(`<path d="${stripe(20, 112, 30, 118, 1.5, -1)}" fill="#1a3e80" opacity=".55"/>`));
  const braids = braid([[42, 46], [38.4, 64], [36.6, 88], [36, 118]], 11, 4, '#1c2038', '#05060e', '#5a6aa8') + braid([[86, 46], [89.6, 64], [91.4, 88], [92, 118]], 11, 4, '#1c2038', '#05060e', '#5a6aa8') +
    both(`<rect x="33.6" y="96" width="5.4" height="3.2" rx="1" fill="#8a5a2a" stroke="#2a1406" stroke-width=".7" transform="rotate(-2 36 97.6)"/><circle cx="36.2" cy="104" r="1.5" fill="#3ac0c8" stroke="#082a30" stroke-width=".5"/>`);
  const front = `<path d="M40.4 53 C39.4 34 49.6 24 64 24 C78.4 24 88.6 34 87.6 53 C86 43 79.6 35.6 70 34.6 C67 35.6 63 36.2 58 35.6 C49 36.8 42.4 43 40.4 53 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M58 35.6 C61 32.6 66 31 70 34.6" fill="none" stroke="#05060e" stroke-width="1" opacity=".8"/><g stroke="#5a6aa8" stroke-width=".9" fill="none" opacity=".7" stroke-linecap="round"><path d="M62 26 C55 28 49 33 45.6 41"/><path d="M68 26 C75 28 80 33 83 41"/></g>` + braids;
  return navi(id, {
    head, ink, skin: ['#94dcfa', '#4ea4e0', '#2a66aa'], iris: ['#fff8c4', '#f2b838', '#8a5208'], irisEdge: '#5a3006',
    lip: '#30468e', lipHi: '#86a6ec', stripe: '#1a4488', rim: '#d8f6ff',
    hair: ['#2a3050', '#0b0d1a'],
    defs: lin(`${id}-leather`, [[0, '#a86a34'], [1, '#6a3a16']], 1, 1),
    ear: { rot: 9, s: .98 }, eye: { x: 51.4, y: 57.6, s: 1.06, rot: 4 },
    brow: `<path d="M43.4 48.6 C48 45.4 54.6 45.2 59.4 47.4 C54.6 47 48.6 47.8 43.4 50.6 Z" fill="#1a3a78"/>`,
    stripes: [[52, 31, 55, 42.6, 2, .4], [46.4, 35, 49.6, 44.6, 1.7, .8], [43.4, 69, 48.4, 79, 2, -.6], [50.6, 85, 54.4, 90.6, 1.2, 0]],
    stripesC: [[64, 37.6, 64, 46, 2.2, 0]],
    dots: [[44.6, 63.6, .7], [47.2, 65.2, .65], [49.8, 66.2, .65], [57.6, 40, .6], [58.8, 43, .55], [44.4, 58, .5]],
    mouth: { y: 83.6, w: 6.8, up: 1, open: 7.4, fang: false },
    back: hairBack + quiver, body: torso + strap + cord, front,
  });
}

// ---------------------------------------------------------------- MO'AT
function moat() {
  const id = 'moat', ink = '#0d1638';
  const head = 'M64 29 C77 29 85 38 85.5 52 C86 61 84 70 79.5 79 C75 88 70 96 64 96.5 C58 96 53 88 48.5 79 C44 70 42 61 42.5 52 C43 38 51 29 64 29 Z';
  // headdress: fan of bones with feathers at the tips, behind the head
  let fan = '';
  const spokes = [[-72, 33, 'f'], [-56, 40, 'b'], [-40, 44, 'f'], [-24, 47, 'b'], [-8, 49, 'f'], [8, 49, 'b'], [24, 47, 'f'], [40, 44, 'b'], [56, 40, 'f'], [72, 33, 'b']];
  for (const [a, L, k] of spokes) {
    const r = a * Math.PI / 180, x = 64 + Math.sin(r) * L, y = 46 - Math.cos(r) * L;
    if (k === 'f') fan += feather(f(64 + Math.sin(r) * (L - 14)), f(46 - Math.cos(r) * (L - 14)), 19, f(180 + a), '#b46ae8', '#2a1040', '#1a0828', 3.6, '#f4ead0');
    else fan += `<path d="M${f(64 + Math.sin(r) * 16)} ${f(46 - Math.cos(r) * 16)} L${f(x)} ${f(y)}" stroke="#2a1a0a" stroke-width="4.2" stroke-linecap="round"/><path d="M${f(64 + Math.sin(r) * 16)} ${f(46 - Math.cos(r) * 16)} L${f(x)} ${f(y)}" stroke="#efe4c8" stroke-width="2.6" stroke-linecap="round"/><circle cx="${f(x)}" cy="${f(y)}" r="2.4" fill="#efe4c8" stroke="#2a1a0a" stroke-width=".8"/><circle cx="${f(64 + Math.sin(r) * (L - 9))}" cy="${f(46 - Math.cos(r) * (L - 9))}" r="1.6" fill="#e0402a" stroke="#3a0a08" stroke-width=".5"/>`;
  }
  const hairBack = `<path d="M64 20 C84 20 93 34 92.4 54 C92 72 95 92 99 112 L29 112 C33 92 36 72 35.6 54 C35 34 44 20 64 20 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.3"/>
<g stroke="#8a90b0" stroke-width=".8" fill="none" opacity=".55" stroke-linecap="round"><path d="M37 56 C36 74 34 92 31 108"/><path d="M91 56 C92 74 94 92 97 108"/></g>`;
  // layered bead collar (the Tsahik's regalia)
  const rows = [['#f4ead0', 0], ['#c82a2a', 1], ['#121018', 2], ['#3ac0c8', 3], ['#e8902a', 4], ['#f4ead0', 5], ['#9a3ad0', 6]];
  let collar = `<path d="M10 128 C14 113 30 105 46 102 C54 107 74 107 82 102 C98 105 114 113 118 128 Z" fill="url(#${id}-collar)" stroke="#1a0610" stroke-width="1.4" stroke-linejoin="round"/>`;
  for (const [c, k] of rows) collar += beadPath(`M${45 - k * 4.6} ${103.6 + k * 2.2} C${52 - k * 2} ${113 + k * 3.4} ${76 + k * 2} ${113 + k * 3.4} ${83 + k * 4.6} ${103.6 + k * 2.2}`, c, 2.5, 3, '#1a0610', k % 2 ? 1.5 : 0);
  collar += `<circle cx="64" cy="114.6" r="4.2" fill="#3ac0c8" stroke="#06282c" stroke-width="1.1"/><circle cx="64" cy="114.6" r="2" fill="#f4ead0"/><circle cx="62.8" cy="113.4" r=".9" fill="#fff" opacity=".8"/>`;
  const torso = naviTorso(id, ink, 7.6, 8, 107);
  const band = beadPath('M43.6 44 C47 38 54 35 64 35 C74 35 81 38 84.4 44', '#f4ead0', 2.2, 2.7, '#2a1a0a') + `<path d="M60.6 33 L64 29.4 L67.4 33 L64 38.4 Z" fill="#3ac0c8" stroke="#06282c" stroke-width=".9" stroke-linejoin="round"/><path d="M64 38.4 V43" stroke="#2a1a0a" stroke-width=".7"/><circle cx="64" cy="44" r="1.3" fill="#c82a2a" stroke="#3a0a08" stroke-width=".5"/>` +
    both(`<path d="M44 44.6 L42 58" stroke="#2a1a0a" stroke-width=".7"/>${beadPath('M43.8 46 L42.2 58', '#c82a2a', 1.8, 2.4, '#3a0a08')}<rect x="40.6" y="58.4" width="2.6" height="6.4" rx="1.2" fill="#efe4c8" stroke="#2a1a0a" stroke-width=".6"/>`);
  const front = `<path d="M42.4 52 C41.4 35 50.4 24 64 24 C77.6 24 86.6 35 85.6 52 C83.4 42 77 36 64 35.6 C51 36 44.6 42 42.4 52 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.2" stroke-linejoin="round"/>
<g stroke="#9aa0c0" stroke-width=".8" fill="none" opacity=".6" stroke-linecap="round"><path d="M64 25 C56 27 49 32 45.4 41"/><path d="M64 25 C72 27 79 32 82.6 41"/></g>${band}`;
  const age = both(`<path d="M44.6 64.4 C48.4 66.4 53.6 66.6 57.4 64.8" fill="none" stroke="#0d1638" stroke-width=".7" opacity=".45" stroke-linecap="round"/><path d="M56.6 77.4 C55.2 80.6 55.4 84 57.2 86.6" fill="none" stroke="#0d1638" stroke-width=".8" opacity=".45" stroke-linecap="round"/>`);
  return navi(id, {
    head, ink, skin: ['#92c4f4', '#5286ce', '#2c4a90'], iris: ['#fff4c8', '#e8a83a', '#7a4410'], irisEdge: '#4a2808',
    lip: '#3a3a86', lipHi: '#8a90e0', stripe: '#1a326e', rim: '#f0d0ff',
    hair: ['#30324e', '#0c0c1a'],
    defs: lin(`${id}-collar`, [[0, '#6a1a2e'], [1, '#2a0814']]),
    ear: { rot: -6, s: .98 }, eye: { x: 52, y: 58, s: .95, rot: -4, lid: -1.4 },
    brow: `<path d="M44 49 C48.6 46.6 55 46.8 59.4 49.2 C55 48.6 48.6 48.8 44 50.8 Z" fill="#1a2c64"/>`,
    stripes: [[52.4, 37.4, 55.4, 45.6, 1.8, .4], [46, 39, 49.4, 47, 1.6, .8], [43.2, 67, 48, 77.6, 2, -.6], [49.2, 85, 53.6, 91, 1.2, 0]],
    stripesC: [],
    dots: [[45.2, 61.6, .6], [47.6, 62.8, .55], [50, 63.6, .55], [57.6, 40.6, .65], [58.6, 43.6, .6], [59.6, 46.4, .55], [61, 49, .5], [46, 72, .5]],
    mouth: { y: 84.6, w: 6.4, up: .5, open: 6.6, fang: false },
    back: fan + hairBack, body: torso + collar, front, faceTop: age,
  });
}

// ---------------------------------------------------------------- TONOWARI (Metkayina)
function tonowari() {
  const id = 'tonowari', ink = '#052a30';
  const head = 'M64 26 C81 26 91 36.5 91.5 52 C92 63 90.5 73 86 82 C81 91.5 72 99 64 99.5 C56 99 47 91.5 42 82 C37.5 73 36 63 36.5 52 C37 36.5 47 26 64 26 Z';
  const T = '#062c38';
  const tattoo = `<g fill="${T}" opacity=".88"><path d="M49 31 L64 41.6 L79 31 L79.4 34.6 L64 45.4 L48.6 34.6 Z"/><path d="M55 30 L64 36.4 L73 30 L72 32.4 L64 38.2 L56 32.4 Z"/>
${both(`<path d="M38.6 61 C44 66.6 50.6 69.4 57.6 69.8 L57.2 72.6 C49.6 72.2 43 69 38.2 64.4 Z"/><path d="M39.4 70 C43 74.4 47.6 77 52 78 L51.4 80.2 C46.4 79 42 76.4 38.8 72.6 Z"/><path d="M38.6 45.4 L46 47.6 L45.4 49.4 L38.2 48 Z"/><circle cx="49.6" cy="74.6" r=".9"/><circle cx="46.6" cy="73" r=".9"/>`)}
<path d="M61.2 89.6 H62.8 V97.6 H61.2 Z M65.2 89.6 H66.8 V97.6 H65.2 Z"/></g>`;
  const hairBack = `<path d="M64 21 C84 21 95 34 94 54 C93.6 62 90 70 86 74 L42 74 C38 70 34.4 62 34 54 C33 34 44 21 64 21 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.3"/>`;
  const body = `<path d="M50.4 84 C50.4 95 49 101 43 108 L85 108 C79 101 77.6 95 77.6 84 Z" fill="url(#${id}-body)" stroke="${ink}" stroke-width="1.3"/>
<path d="M-4 128 C-2 113 14 104 42 102.6 C52 108 76 108 86 102.6 C114 104 130 113 132 128 Z" fill="url(#${id}-body)" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M-4 128 C-2 116 6 109 18 105 C13 113 11 120 11 128 Z" fill="${ink}" opacity=".3"/>
<path d="M50.4 88 C56 99 72 99 77.6 88 L77.6 97 C72 104.6 56 104.6 50.4 97 Z" fill="${ink}" opacity=".32"/>
<g fill="${T}" opacity=".85">${both(`<path d="M14 112 C22 108 32 106.4 41 107 L40.6 109.4 C32 109 23 110.6 15.4 114.4 Z"/><path d="M12 118 C20 114 30 112.6 38 113.4 L37.6 115.6 C30 115 21.6 116.6 13.4 120.4 Z"/><path d="M24 121 L30 119.6 L29.6 128 L24.6 128 Z"/>`)}</g>
${both(`<path d="M30 106 C33 112 34 120 33 128" fill="none" stroke="${ink}" stroke-width=".9" opacity=".45"/>`)}`;
  // bone collar + spiral shell pendant
  let teeth = '';
  const P = [[44, 104], [50, 116], [78, 116], [84, 104]];
  for (let i = 0; i < 11; i++) {
    const [x, y] = cub(P, i / 10), [xa, ya] = cub(P, Math.max(0, i / 10 - .03)), [xb, yb] = cub(P, Math.min(1, i / 10 + .03));
    const a = Math.atan2(yb - ya, xb - xa) * 180 / Math.PI + 90;
    teeth += `<path d="M${f(x - 1.4)} ${f(y)} C${f(x - 1.2)} ${f(y + 4)} ${f(x)} ${f(y + 6.4)} ${f(x + .8)} ${f(y + 7.6)} C${f(x + 1.4)} ${f(y + 5)} ${f(x + 1.4)} ${f(y + 2)} ${f(x + 1.4)} ${f(y)} Z" transform="rotate(${f(a - 90)} ${f(x)} ${f(y)})" fill="#f2ead4" stroke="#2a2416" stroke-width=".6"/>`;
  }
  const shell = `<path d="${cubD(P)}" fill="none" stroke="#3a2a16" stroke-width="1.6"/>${teeth}
<circle cx="64" cy="118.6" r="7" fill="url(#${id}-shell)" stroke="#2a1a10" stroke-width="1.2"/><path d="M64 118.6 C64 116.6 66.6 116.6 66.6 118.8 C66.6 121.6 62.4 122 61.6 119 C60.8 115.4 65.4 113.4 68.2 115.8 C71 118.4 69.6 123.6 65.4 124.6" fill="none" stroke="#7a3a2a" stroke-width="1" stroke-linecap="round"/><path d="M59.6 114.8 C61 113 63 112.4 65 112.6" fill="none" stroke="#fff" stroke-width=".9" opacity=".7" stroke-linecap="round"/>`;
  const knot = `<path d="M37.2 52 C36 33 48 23 64 23 C80 23 92 33 90.8 52 C89 42 82 35 72 32.6 L64 35 L56 32.6 C46 35 39 42 37.2 52 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.2" stroke-linejoin="round"/>
<g stroke="#4a8a96" stroke-width=".9" fill="none" opacity=".7" stroke-linecap="round"><path d="M42 44 C46 34 54 27 62 24.4"/><path d="M86 44 C82 34 74 27 66 24.4"/><path d="M48 40 C52 32 57 28 62.6 25.6"/><path d="M80 40 C76 32 71 28 65.4 25.6"/></g>
<path d="M55.6 23.4 C53.6 13 57.4 5.6 64 5.6 C70.6 5.6 74.4 13 72.4 23.4 C68 25.4 60 25.4 55.6 23.4 Z" fill="url(#${id}-hair)" stroke="#05060e" stroke-width="1.2"/><path d="M59 9.6 C61 7.8 64 7.6 66.4 8.6" fill="none" stroke="#4a8a96" stroke-width="1" opacity=".8" stroke-linecap="round"/>
<path d="M55 19.6 C60 21.4 68 21.4 73 19.6 L73.4 23.6 C68 25.6 60 25.6 54.6 23.6 Z" fill="#c9a26a" stroke="#3a2a16" stroke-width=".9"/>${beadsOn([[56, 21.6], [60, 23], [68, 23], [72, 21.6]], 5, 1.2, ['#4fe0d0', '#f2ead4'], '#3a2a16')}
<path d="M47 20 L82 9" stroke="#2a2416" stroke-width="3.6" stroke-linecap="round"/><path d="M47 20 L82 9" stroke="#f2ead4" stroke-width="2.2" stroke-linecap="round"/><circle cx="82.6" cy="8.8" r="2" fill="#f2ead4" stroke="#2a2416" stroke-width=".8"/>`;
  const earShell = `<path d="M33 63 L31.4 70" stroke="#2a1a10" stroke-width=".7"/><path d="M31.4 70 C27.6 70 27.4 75.6 31 76.4 C34.8 76.6 35 70.6 31.4 70 Z" fill="url(#${id}-shell)" stroke="#2a1a10" stroke-width=".8"/>`;
  return navi(id, {
    head, ink, skin: ['#8eeee2', '#33aaa6', '#13606a'], iris: ['#fbffe0', '#d4e062', '#5a7418'], irisEdge: '#304008',
    lip: '#1a5a6a', lipHi: '#7ad8d8', stripe: '#0e4a54', rim: '#c8fff4', dotCore: '#f0fff8', dotHalo: '#a0fff0',
    hair: ['#1c3a44', '#060e14'],
    defs: rad(`${id}-shell`, [[0, '#fff4e0'], [.6, '#f0b48a'], [1, '#b0604a']], .4, .35, .7),
    shade: 'M28 40 C32 52 34 64 40 76 C44 84 50 92 56 100 L20 100 L20 40 Z',
    ear: { rot: -3, s: 1.04, extra: earShell }, eye: { x: 50.6, y: 57.6, s: 1.12, rot: 3 },
    brow: `<path d="M40.4 48.4 C46.6 46 54 46.4 60.4 49.4 C54 49 47.6 49.6 40.4 51.2 Z" fill="#073a40"/>`,
    stripes: [[42, 36, 46, 45, 1.8, .6], [40.6, 76, 46, 88, 2.2, -.6]],
    stripesC: [],
    dots: [[44.6, 59.6, .55], [41.6, 57.4, .5], [57, 46.6, .6], [58, 49.4, .55], [52.4, 84, .5]],
    faceClip: tattoo,
    mouth: { y: 86, w: 8.4, up: -.3, open: 7.6 },
    back: hairBack, body: body + shell, front: knot,
  });
}

// ---------------------------------------------------------------- QUARITCH (recombinant, enemy feed)
function quaritch() {
  const id = 'quaritch', ink = '#08122a', R = '#ff3355';
  const head = 'M64 24 C81 24 90 34.5 90.5 51 C91 62 89.6 72 86 80.6 C81.6 90.4 73 98 64 98.6 C55 98 46.4 90.4 42 80.6 C38.4 72 37 62 37.5 51 C38 34.5 47 24 64 24 Z';
  const aura = `<rect width="128" height="128" fill="url(#${id}-aura)"/>`;
  const camo = (x, y, s) => `<path d="M${x} ${y} c${3 * s} ${-2 * s} ${7 * s} ${-1 * s} ${8 * s} ${2 * s} c${1 * s} ${3 * s} ${-3 * s} ${4 * s} ${-6 * s} ${3 * s} c${-3 * s} ${-1 * s} ${-4 * s} ${-3 * s} ${-2 * s} ${-5 * s} Z"`;
  const body = `<path d="M52 84 C52 95 51 101 46 107 L82 107 C77 101 76 95 76 84 Z" fill="url(#${id}-body)" stroke="${ink}" stroke-width="1.3"/>
<path d="M52 88 C57 99 71 99 76 88 L76 97 C71 104 57 104 52 97 Z" fill="${ink}" opacity=".35"/>
<path d="M0 128 C1 112 14 104 36 101 L92 101 C114 104 127 112 128 128 Z" fill="url(#${id}-fat)" stroke="#05080a" stroke-width="1.5"/>
<g fill="#2a3226" opacity=".9">${camo(6, 116, 1.2)}/>${camo(18, 108, 1)}/>${camo(100, 110, 1.1)}/>${camo(112, 120, 1.2)}/></g><g fill="#7a8466" opacity=".55">${camo(13, 122, .9)}/>${camo(106, 104, .8)}/></g>
<path d="M30 104 C40 101 50 104 52 110 L56 128 L22 128 Z" fill="url(#${id}-plate)" stroke="#05080a" stroke-width="1.3" stroke-linejoin="round"/><path d="M98 104 C88 101 78 104 76 110 L72 128 L106 128 Z" fill="url(#${id}-plate)" stroke="#05080a" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M44 102 C50 107 78 107 84 102 L86 110 C78 114 50 114 42 110 Z" fill="#1e2428" stroke="#05080a" stroke-width="1.3" stroke-linejoin="round"/><path d="M45 105.4 C52 109.4 76 109.4 83 105.4" fill="none" stroke="#5a646c" stroke-width=".8"/>
<path d="M27.6 110 L51 110 M25.6 116 L52.4 116" stroke="#05080a" stroke-width=".9" opacity=".7"/><rect x="34" y="118.6" width="12" height="7" rx="1.2" fill="#2a3236" stroke="#05080a" stroke-width=".8"/><rect x="36" y="120.6" width="8" height="1.2" fill="${R}" opacity=".85"/>
<g transform="translate(88 114)"><path d="M0 -7 L6.4 -3.6 L6.4 3.6 L0 7 L-6.4 3.6 L-6.4 -3.6 Z" fill="#1a1012" stroke="#05080a" stroke-width="1"/><path d="M0 -5.4 L5 -2.8 L5 2.8 L0 5.4 L-5 2.8 L-5 -2.8 Z" fill="none" stroke="${R}" stroke-width=".8"/><path d="M-3.4 -2 L0 2.6 L3.4 -2 L3.4 .2 L0 4.4 L-3.4 .2 Z" fill="#f0f0f0"/><circle cx="0" cy="-2.6" r="1" fill="${R}"/></g>
<path d="M58 106 L62 118 M70 106 L66 118" stroke="#9aa4ae" stroke-width=".6" stroke-dasharray=".9 .7"/><rect x="61.2" y="117.6" width="5.6" height="7.4" rx="1.4" fill="#aab4be" stroke="#3a4248" stroke-width=".6"/><path d="M62.4 120 H65.6 M62.4 121.8 H65" stroke="#4a545c" stroke-width=".5"/>`;
  const buzz = `<path d="M37.8 50 C37 38 39 30.6 43.2 26.4 C48.4 21.4 56 19.8 64 19.8 C72 19.8 79.6 21.4 84.8 26.4 C89 30.6 91 38 90.2 50 C89 44.6 87.8 41 85.6 38.8 C78.6 35 70.6 34.4 64 34.4 C57.4 34.4 49.4 35 42.4 38.8 C40.2 41 39 44.6 37.8 50 Z" fill="url(#${id}-buzz)"/><path d="M40.6 34 C41.4 30.6 42.4 28 43.2 26.4 C48.4 21.4 56 19.8 64 19.8 C72 19.8 79.6 21.4 84.8 26.4 C85.6 28 86.6 30.6 87.4 34" fill="none" stroke="#05060e" stroke-width="1.2" stroke-linecap="round"/><path d="M42.4 38.8 C49.4 35 57.4 34.4 64 34.4 C70.6 34.4 78.6 35 85.6 38.8" fill="none" stroke="#05060e" stroke-width=".7" opacity=".5"/>
<path d="M43.2 26.4 C48.4 21.4 56 19.8 64 19.8 C72 19.8 79.6 21.4 84.8 26.4 C78 25 71 24.6 64 24.6 C57 24.6 50 25 43.2 26.4 Z" fill="#20283c" opacity=".9"/>
<g fill="#4a5a80" opacity=".55">${Array.from({ length: 34 }, (_, i) => `<circle cx="${f(45 + (i * 7.3) % 38)}" cy="${f(23.4 + ((i * 3.7) % 10))}" r=".45"/>`).join('')}</g>`;
  // three long parallel scars over the right side of his face (viewer's left)
  const scar = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${f((x1 + x2) / 2 + .8)} ${f((y1 + y2) / 2)} L${x2} ${y2}" fill="none" stroke="#1a2650" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x1} ${y1} L${f((x1 + x2) / 2 + .8)} ${f((y1 + y2) / 2)} L${x2} ${y2}" fill="none" stroke="#b8c8f0" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
  const scars = scar(51.6, 22.4, 38.6, 60) + scar(56.6, 21.6, 42.6, 67) + scar(61.6, 21.4, 46.6, 73.6);
  const scan = `<g fill="${R}" opacity=".07">${Array.from({ length: 32 }, (_, i) => `<rect x="0" y="${i * 4}" width="128" height="1.3"/>`).join('')}</g>
<rect x="74" y="30" width="54" height="2" fill="${R}" opacity=".45"/><rect x="0" y="40.4" width="30" height="1.1" fill="#46e0ff" opacity=".4"/><rect x="0" y="88" width="34" height="2.4" fill="${R}" opacity=".3"/><rect x="94" y="92.4" width="34" height="1.1" fill="#fff" opacity=".3"/><rect x="50" y="123" width="40" height="1" fill="#46e0ff" opacity=".3"/>`;
  return navi(id, {
    head, ink, skin: ['#80acdc', '#3c6aa6', '#1c3466'], iris: ['#fff6c8', '#e8b02a', '#6a3000'], irisEdge: '#3a1a00',
    lip: '#25335e', lipHi: '#6a80b8', stripe: '#13285a', rim: '#ff5a78',
    hair: ['#1a2236', '#06080e'],
    defs: rad(`${id}-aura`, [[0, R, .4], [.62, '#7a0a24', .16], [1, R, 0]], .5, .45, .62) + lin(`${id}-buzz`, [[0, '#2a3450'], [.42, '#121828'], [.62, '#1a2236', .7], [1, '#1a2236', .2]]) +
      lin(`${id}-fat`, [[0, '#56604a'], [1, '#2c3226']]) + lin(`${id}-plate`, [[0, '#4a5258'], [.5, '#2a3034'], [1, '#14181a']]),
    ear: { rot: -15, s: .94 }, eye: { x: 51.2, y: 57.4, s: .93, rot: 5, lid: -2.2, lidR: -1.2 },
    brow: `<path d="M40.4 47.4 C47 46.8 54.6 49 61.2 53.6 C54.6 52 47.6 51 40.4 50.4 Z" fill="#0c1a40"/><path d="M41.6 45.8 C48 45.6 54.6 47.4 59.6 50.8" fill="none" stroke="#a0c4f0" stroke-width=".7" opacity=".45" stroke-linecap="round"/>`,
    stripes: [[73.6, 31, 70.6, 42, 2.2, -.4], [80.4, 34, 77.4, 44.6, 1.9, -.6], [38.8, 75, 45, 86, 2.2, -.6], [53.6, 87, 57.6, 94, 1.4, 0]].map(([a, b, c, d, w, k]) => [128 - a, b, 128 - c, d, w, -k]),
    stripesC: [],
    dots: [[83.4, 62.4, .55], [80.8, 64, .5], [78.2, 65, .5]].map(([x, y, r]) => [128 - x, y, r]),
    dotCore: '#d8f0ff', dotHalo: '#7fb8ff',
    faceClip: scars,
    mouth: { y: 85.6, w: 7.6, up: -.8, upR: 1.8, open: 7, inside: '#160814' },
    back: aura, body, front: buzz + scan,
  });
}

// ---------------------------------------------------------------- humans: shared bits
function humanNose(skinDk, ink) {
  return `<path d="M62.6 58 C62 64 60.6 68.6 58.8 71.6 C60 73.8 62 74.4 64 73.8 C66 74.4 68 73.8 69.2 71.6" fill="none" stroke="${skinDk}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M59.6 72.6 C60.6 71.6 62 71.8 62.6 72.8 M65.4 72.8 C66 71.8 67.4 71.6 68.4 72.6" fill="none" stroke="${ink}" stroke-width=".9" stroke-linecap="round"/><ellipse cx="64.6" cy="69.4" rx="2" ry="1.3" fill="#fff" opacity=".35"/>`;
}

// ---------------------------------------------------------------- GRACE (human xenobotanist)
function grace() {
  const id = 'grace', ink = '#2a140c';
  const head = 'M64 31 C78.5 31 88 41.5 88 56 C88 68.5 85 79 78.5 87.5 C74 93 69 96 64 96 C59 96 54 93 49.5 87.5 C43 79 40 68.5 40 56 C40 41.5 49.5 31 64 31 Z';
  const skin = ['#ffdcc0', '#eeb08c', '#bc7656'];
  const E = eyePair(id, { x: 52.2, y: 60, s: 1, rot: 2, ink, human: true, irisEdge: '#1e4a2a', lid: -1.6, lidFill: skin[1] });
  const defs = `<clipPath id="${id}-clip"><path d="${head}"/></clipPath>${E.clip}
${tri(`${id}-skin`, skin[0], skin[1], skin[2], .58, .36, .78)}${lin(`${id}-body`, [[0, skin[1]], [1, skin[2]]])}
${tri(`${id}-iris`, '#c8f0a0', '#5a9a4a', '#1e4a24', .5, .4, .6)}
${lin(`${id}-hair`, [[0, '#d27a44'], [.55, '#9a4422'], [1, '#521e0c']], .6, 1)}
${lin(`${id}-jkt`, [[0, '#8e9a66'], [1, '#4e5834']])}${lin(`${id}-band`, [[0, '#4a525e'], [1, '#1c2026']])}
${rimGrad(id, '#ffe2c0')}`;
  const hairBack = `<path d="M64 22 C86 22 97 37 96 57 C95.6 68 97 76 95 83 C90.6 87 85 86 82 81 L46 81 C43 86 37.4 87 33 83 C31 76 32.4 68 32 57 C31 37 42 22 64 22 Z" fill="url(#${id}-hair)" stroke="#2a0e04" stroke-width="1.3"/>`;
  const body = `<path d="M54 86 C54 95 53 100 49 106 L79 106 C75 100 74 95 74 86 Z" fill="url(#${id}-body)" stroke="${ink}" stroke-width="1.2"/><path d="M54 89 C58 98 70 98 74 89 L74 96 C70 102 58 102 54 96 Z" fill="${ink}" opacity=".25"/>
<path d="M2 128 C4 112 18 104 40 101 L88 101 C110 104 124 112 126 128 Z" fill="url(#${id}-jkt)" stroke="#20260e" stroke-width="1.5"/>
<path d="M2 128 C4 116 10 109 20 105 C15 113 14 120 14 128 Z" fill="#3a4224" opacity=".8"/>
<path d="M49 103 L64 120 L79 103 Z" fill="#6a7684"/><path d="M52 103 C56 108 72 108 76 103" fill="none" stroke="#4a5462" stroke-width="1"/>
${both(`<path d="M38 100 L50 99 L64 121 L60 128 L48 128 L42 112 Z" fill="#7e8a58" stroke="#20260e" stroke-width="1.1" stroke-linejoin="round"/><path d="M38 100 L50 99 L58 112 L46 108 Z" fill="#a2ae7a" opacity=".5"/>`)}
<rect x="84" y="111" width="17" height="14" rx="1.6" fill="#76825a" stroke="#20260e" stroke-width="1"/><path d="M84 115 H101" stroke="#20260e" stroke-width=".9"/><rect x="88" y="105" width="2.2" height="9" rx=".9" fill="#d8dce2" stroke="#4a4e54" stroke-width=".5"/>
<g transform="translate(29 115)"><circle r="6.2" fill="#22301e" stroke="#0e140a" stroke-width="1"/><circle r="5" fill="none" stroke="#9cf0b0" stroke-width=".8"/><path d="M0 3.6 C-3.6 1 -3 -3 0 -4.4 C3 -3 3.6 1 0 3.6 Z" fill="#9cf0b0"/><path d="M0 3.6 V-3" stroke="#22301e" stroke-width=".7"/></g>`;
  const ear = `<path d="M41.6 57 C37.4 55 35.4 58.6 36.4 63 C37.2 67 39.4 69.6 42.4 68.6 Z" fill="${skin[1]}" stroke="${ink}" stroke-width="1.1"/><path d="M40.6 59.6 C38.6 59.6 38.4 62.4 39.6 64.6" fill="none" stroke="${skin[2]}" stroke-width=".9"/>`;
  const face = `<path d="${head}" fill="url(#${id}-skin)"/><g clip-path="url(#${id}-clip)"><path d="M30 44 C35 56 38 70 46 82 C50 88 56 94 60 100 L20 100 L20 44 Z" fill="${skin[2]}" opacity=".45"/>
${both(`<ellipse cx="47.6" cy="72" rx="5.2" ry="2.6" fill="#f08a78" opacity=".35"/>`)}<g fill="#b8683e" opacity=".55">${[[48, 69], [51, 70.6], [46, 72], [79.6, 69.6], [77, 71.2], [82, 72.2], [62, 66], [66.6, 66.4]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".5"/>`).join('')}</g></g>
${both(`<path d="M45 64.6 C48.4 66.6 53 66.8 56.6 65" fill="none" stroke="${skin[2]}" stroke-width=".8" opacity=".8" stroke-linecap="round"/><path d="M42.6 53 C46 49.6 52 49 58.4 51" fill="none" stroke="#7a3418" stroke-width="2.2" stroke-linecap="round"/><path d="M56.4 76 C55 79 55.4 82 57 84" fill="none" stroke="${skin[2]}" stroke-width=".9" opacity=".7" stroke-linecap="round"/>`)}
${humanNose(skin[2], ink)}`;
  const M = mouth({ y: 82.6, w: 6.8, up: 1.4, open: 6.6, lip: '#c4706a', lipHi: '#f0b0a0', ink, fang: false, inside: '#4a1414', tongue: '#d86a6a' });
  const bangs = `<path d="M39.6 58 C38 40 48 28.6 63 27.6 C78.4 26.8 89.6 37 88.6 58 C87 48 83.6 42.6 78 40 C72 44.6 62 46.6 51 45.6 C46 48.6 41.6 52.6 39.6 58 Z" fill="url(#${id}-hair)" stroke="#2a0e04" stroke-width="1.2" stroke-linejoin="round"/>
<g stroke="#f0a070" stroke-width=".9" fill="none" opacity=".7" stroke-linecap="round"><path d="M74 30.6 C66 33 58 38 51 45"/><path d="M80 34 C74 37 68 41 62 45.4"/><path d="M64 29 C56 32 48 38 43 47"/></g><path d="M86 42 C88 50 88.6 58 88 66" fill="none" stroke="#e8e4dc" stroke-width=".8" opacity=".45"/>`;
  const headset = `<path d="M35 64 C29 37 44 20.6 64 20.6 C84 20.6 99 37 93 64" fill="none" stroke="#14181c" stroke-width="5"/><path d="M35 64 C29 37 44 20.6 64 20.6 C84 20.6 99 37 93 64" fill="none" stroke="url(#${id}-band)" stroke-width="2.8"/><path d="M50 22.6 C56 21.4 72 21.4 78 22.6" fill="none" stroke="#9cf0b0" stroke-width=".9" opacity=".8"/>
<rect x="27.4" y="54" width="13" height="19" rx="5" fill="#2a3038" stroke="#0a0c10" stroke-width="1.3"/><rect x="29.6" y="57" width="3.2" height="13" rx="1.6" fill="#4a5462"/><circle cx="34.6" cy="58.4" r="1.4" fill="#9cf0b0"/>
<rect x="88.6" y="54" width="11" height="18" rx="4.6" fill="#2a3038" stroke="#0a0c10" stroke-width="1.3"/>
<path d="M34 72 C35 82 41 87 50 86.6" fill="none" stroke="#0a0c10" stroke-width="2.8" stroke-linecap="round"/><path d="M34 72 C35 82 41 87 50 86.6" fill="none" stroke="#5a6472" stroke-width="1.1" stroke-linecap="round"/><rect x="48.4" y="84.2" width="6" height="4.6" rx="2" fill="#2a3038" stroke="#0a0c10" stroke-width=".9"/>`;
  const rim = `<path d="${head}" fill="none" stroke="url(#${id}-rim)" stroke-width="3.6" clip-path="url(#${id}-clip)"/>`;
  return wrap(id, defs, `${hairBack}${body}${both(ear)}${face}${E.markup}${M}${rim}<path d="${head}" fill="none" stroke="${ink}" stroke-width="1.5"/>${bangs}${headset}`);
}

// ---------------------------------------------------------------- NORM (human scientist / tech)
function norm() {
  const id = 'norm', ink = '#24140c';
  const head = 'M64 30 C79 30 89 40 89 55 C89 68 87 78 82 86.5 C77.5 94 70.5 97.5 64 97.5 C57.5 97.5 50.5 94 46 86.5 C41 78 39 68 39 55 C39 40 49 30 64 30 Z';
  const skin = ['#fcd6b6', '#e2a47e', '#a86848'];
  const Y = '#ffd166';
  const E = eyePair(id, { x: 52, y: 59, s: 1.02, rot: 0, ink, human: true, irisEdge: '#2a1408' });
  const defs = `<clipPath id="${id}-clip"><path d="${head}"/></clipPath>${E.clip}
${tri(`${id}-skin`, skin[0], skin[1], skin[2], .58, .36, .78)}${lin(`${id}-body`, [[0, skin[1]], [1, skin[2]]])}
${tri(`${id}-iris`, '#d8a66a', '#7a4a22', '#2a1408', .5, .4, .6)}
${lin(`${id}-hair`, [[0, '#4a3426'], [1, '#160c08']], .6, 1)}
${lin(`${id}-polo`, [[0, '#48607e'], [1, '#243246']])}${lin(`${id}-lens`, [[0, '#e8f6ff', .45], [.5, '#a8d8ff', .1], [1, '#6aa8e8', .3]], 1, 1)}
${rimGrad(id, '#fff0c8')}`;
  const body = `<path d="M54 86 C54 95 53 100 49 106 L79 106 C75 100 74 95 74 86 Z" fill="url(#${id}-body)" stroke="${ink}" stroke-width="1.2"/><path d="M54 89 C58 98 70 98 74 89 L74 96 C70 102 58 102 54 96 Z" fill="${ink}" opacity=".25"/>
<path d="M4 128 C6 112 20 104 42 101.6 L86 101.6 C108 104 122 112 124 128 Z" fill="url(#${id}-polo)" stroke="#0e1620" stroke-width="1.5"/>
<path d="M4 128 C6 116 12 109 22 105 C17 113 16 120 16 128 Z" fill="#1a2434" opacity=".8"/>
${both(`<path d="M47 100 L62 104.6 L58 112.6 L44 106 Z" fill="#5a7494" stroke="#0e1620" stroke-width="1.1" stroke-linejoin="round"/>`)}
<path d="M60.6 104.6 L67.4 104.6 L66.6 120 L61.4 120 Z" fill="#1e2a3a"/><circle cx="64" cy="109.6" r="1" fill="#d8dce2"/><circle cx="64" cy="115.4" r="1" fill="#d8dce2"/>
<g transform="translate(91 114)"><circle r="7" fill="#20283a" stroke="#0a0e16" stroke-width="1"/><circle r="5.6" fill="none" stroke="${Y}" stroke-width="1"/><circle r="2.4" fill="${Y}"/><ellipse rx="5" ry="1.6" fill="none" stroke="${Y}" stroke-width=".8" transform="rotate(-20)"/></g>
<path d="M30 110 L31 124" stroke="#0e1620" stroke-width=".9" opacity=".6"/>`;
  const ear = `<path d="M40.6 56 C36.4 54 34.4 57.6 35.4 62 C36.2 66 38.4 68.6 41.4 67.6 Z" fill="${skin[1]}" stroke="${ink}" stroke-width="1.1"/><path d="M39.6 58.6 C37.6 58.6 37.4 61.4 38.6 63.6" fill="none" stroke="${skin[2]}" stroke-width=".9"/>`;
  const stubble = `<path d="M41 66 C42 78 48 90 56 94.6 C60 96.6 68 96.6 72 94.6 C80 90 86 78 87 66 C85 76 80 84 74 86.6 C70 84 58 84 54 86.6 C48 84 43 76 41 66 Z" fill="#3a2418" opacity=".22"/>
<path d="M54.6 78.4 C58 76.4 70 76.4 73.4 78.4 C70 77.4 58 77.4 54.6 78.4 Z" fill="#3a2418" opacity=".3"/><g fill="#3a2418" opacity=".45">${Array.from({ length: 30 }, (_, i) => `<circle cx="${f(50 + (i * 9.1) % 28)}" cy="${f(85 + ((i * 4.3) % 9))}" r=".38"/>`).join('')}</g>`;
  const face = `<path d="${head}" fill="url(#${id}-skin)"/><g clip-path="url(#${id}-clip)"><path d="M29 44 C34 56 37 70 45 82 C49 88 55 94 59 100 L20 100 L20 44 Z" fill="${skin[2]}" opacity=".45"/>${stubble}</g>
${both(`<path d="M42.4 50.4 C46 47 52 46.4 58.2 48.2 L58 50.4 C52 49 47 49.6 43 52.4 Z" fill="#2a1a10"/>`)}${humanNose(skin[2], ink)}`;
  const M = mouth({ y: 82.6, w: 7.6, up: 1.8, open: 7.4, lip: '#c08070', lipHi: '#f0c0a8', ink, fang: false, inside: '#4a1414', tongue: '#d86a6a' });
  const hair = `<path d="M38.6 57 C36 39 46 25 62 24.2 C70 23.8 77 25.4 82 28.6 C88 32.6 91 42 89.4 57 C88.2 49 86.2 45 83.4 42.6 C80.4 41.6 78.4 39 77.4 35.6 C72 39.2 62 39.8 54 37.6 C50 40.2 46 41.6 43.4 44.6 C41 47.6 39.6 52 38.6 57 Z" fill="url(#${id}-hair)" stroke="#0c0604" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M48 27 L46 20.6 L53 25 L55 18.4 L60 24 L64.6 17.6 L67.6 24 L74 19.6 L74.6 26 L81 23.6 L80 29.6" fill="url(#${id}-hair)" stroke="#0c0604" stroke-width="1.1" stroke-linejoin="round"/>
<g stroke="#8a6a50" stroke-width=".9" fill="none" opacity=".65" stroke-linecap="round"><path d="M56 27.6 C52 30 48 34 46 40"/><path d="M68 26.6 C74 28 79 32 81.6 38"/><path d="M62 28 C60 31 58 34 57 37"/></g>`;
  const glasses = `<g fill="url(#${id}-lens)" stroke="#161a22" stroke-width="2"><rect x="41.6" y="52.4" width="20" height="13.4" rx="3.4"/><rect x="66.4" y="52.4" width="20" height="13.4" rx="3.4"/></g><path d="M61.6 57.4 C63 56 65 56 66.4 57.4" fill="none" stroke="#161a22" stroke-width="2"/><path d="M41.6 56 L37.6 57.4 M86.4 56 L89.6 57" stroke="#161a22" stroke-width="1.8" stroke-linecap="round"/>
<path d="M44.4 55 L48 55 M69.2 55 L72.8 55" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".75"/><path d="M57 63.6 L59.4 61.2 M81.8 63.6 L84.2 61.2" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".5"/>`;
  const headset = `<path d="M37.4 60 C32 34 46 20.4 64 20.4 C82 20.4 96 34 90.6 60" fill="none" stroke="#14181c" stroke-width="4.6"/><path d="M37.4 60 C32 34 46 20.4 64 20.4 C82 20.4 96 34 90.6 60" fill="none" stroke="#3a4250" stroke-width="2.4"/>
<rect x="87" y="51" width="12" height="18" rx="4.8" fill="#2a3038" stroke="#0a0c10" stroke-width="1.3"/><rect x="94" y="54" width="3" height="12" rx="1.5" fill="#4a5462"/><circle cx="91" cy="55" r="1.5" fill="${Y}"/><circle cx="91" cy="55" r="3" fill="${Y}" opacity=".25"/>
<path d="M90 68 C89 80 83 86 75 86" fill="none" stroke="#0a0c10" stroke-width="2.8" stroke-linecap="round"/><path d="M90 68 C89 80 83 86 75 86" fill="none" stroke="#5a6472" stroke-width="1.1" stroke-linecap="round"/><rect x="71" y="83.6" width="6" height="4.8" rx="2" fill="#2a3038" stroke="#0a0c10" stroke-width=".9"/>`;
  const rim = `<path d="${head}" fill="none" stroke="url(#${id}-rim)" stroke-width="3.6" clip-path="url(#${id}-clip)"/>`;
  return wrap(id, defs, `${body}${both(ear)}${face}${E.markup}${M}${rim}<path d="${head}" fill="none" stroke="${ink}" stroke-width="1.5"/>${hair}${glasses}${headset}`);
}

// ---------------------------------------------------------------- fallback (unknown caller)
function noSignal() {
  const bars = [[14, 3], [37, 1.4], [61, 2.2], [88, 1.2], [109, 2.6]].map(([y, h], i) => `<rect x="${i % 2 ? 0 : 20}" y="${y}" width="${i % 2 ? 108 : 88}" height="${h}" fill="#9fb4d8" opacity=".22"/>`).join('');
  return wrap('', '', `<path d="M10 128 C12 110 26 101 44 98 L84 98 C102 101 116 110 118 128 Z" fill="#2a3552" stroke="#5a6d99" stroke-width="1.5"/><circle cx="64" cy="58" r="31" fill="#2a3552" stroke="#5a6d99" stroke-width="1.5"/>
<g class="pe-open"><circle cx="52" cy="56" r="3.2" fill="#7fb2ff"/><circle cx="76" cy="56" r="3.2" fill="#7fb2ff"/></g><g class="pe-closed"><path d="M48.5 56.5 H55.5 M72.5 56.5 H79.5" stroke="#7fb2ff" stroke-width="2" stroke-linecap="round"/></g>
<g class="pm-closed"><path d="M58 74 H70" stroke="#7fb2ff" stroke-width="2" stroke-linecap="round"/></g><g class="pm-open"><rect x="58" y="71" width="12" height="6" rx="3" fill="#7fb2ff"/></g>${bars}`);
}

const BUILDERS = { neytiri, tsutey, neteyam, moat, grace, norm, tonowari, quaritch };
const ALIASES = { "tsu'tey": 'tsutey', "mo'at": 'moat' };
const cache = {};

/** @param {string} id one of the CHARACTERS keys (case-insensitive). Unknown ids get a neutral "no signal" silhouette. */
export function portraitSVG(id) {
  let key = String(id ?? '').toLowerCase();
  key = ALIASES[key] || key;
  if (!BUILDERS[key]) key = '';
  return cache[key] || (cache[key] = key ? BUILDERS[key]() : noSignal());
}
