// LẠC HỒNG — radio-comm character portraits (hand-authored, procedurally assembled inline SVG).
//
// Phi đội Lạc Hồng, a time-travelling squadron defending Vietnam's golden eras, and its enemy:
//   au      — Âu, wingman (Lạc Hồng 2): young pilot, short bob under an open ivory helmet with a
//             red-gold chim Lạc decal, red scarf, russet flight suit with a bronze-drum star patch
//   dong    — Đồng, veteran (Lạc Hồng 3): mid-50s, grey crew cut under a pushed-back olive helmet
//             (bronze visor up), thick moustache, half smile, leather jacket collar, bronze patch
//   su      — Sử, navigator & historian (Lạc Hồng 4): round glasses, neat side part, headset with
//             boom mic, teal flight suit, scroll emblem on the collar
//   kien    — Chỉ huy Kiên, base commander: late 40s, sleek hair in a low bun, single-ear headset,
//             dark uniform with gold collar insignia, a dim holographic timeline behind her
//   thoianh — THỜI ẢNH, the shadow machine corps: a faceless hooded mask with a cracked clock face,
//             violet-red eye slits, glitch scanlines and a purple aura
//
// portraitSVG(id) returns a complete <svg> string (viewBox 0 0 128 128, fills its box with
// preserveAspectRatio "xMidYMid slice", transparent background) meant to be dropped into the
// comm panel via innerHTML. The HUD animates it by toggling classes on the root <svg>:
//   .open  -> mouth open   (swaps <g class="pm-closed"> for <g class="pm-open">)
//   .blink -> eyes closed  (swaps <g class="pe-open">   for <g class="pe-closed">)
// Every gradient/clipPath id is prefixed with the character id, so any number of portraits
// can live in one document. Markup is built once per id and cached.
export const CHARACTERS = {
  au:      { name: 'AU',       nameJa: 'Âu',          role: 'LẠC HỒNG 2',          color: '#ff6a4a' },
  dong:    { name: 'DONG',     nameJa: 'Đồng',        role: 'LẠC HỒNG 3',          color: '#c9a24a' },
  su:      { name: 'SU',       nameJa: 'Sử',          role: 'LẠC HỒNG 4 · SỬ GIA', color: '#4fd8c8' },
  kien:    { name: 'KIEN',     nameJa: 'Chỉ huy Kiên', role: 'CHỈ HUY',            color: '#ffd166' },
  thoianh: { name: 'THOI ANH', nameJa: 'THỜI ẢNH',    role: 'KẺ ĐỊCH',             color: '#b04aff' },
};

const STYLE = '<style>.pm-open,.pe-closed{display:none}svg.open .pm-open,svg.blink .pe-closed{display:inline}svg.open .pm-closed,svg.blink .pe-open{display:none}</style>';
const MIRROR = 'matrix(-1 0 0 1 128 0)';
const both = (m) => m + `<g transform="${MIRROR}">${m}</g>`;
const f = (n) => Math.round(n * 100) / 100;

function wrap(id, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${CHARACTERS[id] ? CHARACTERS[id].name : 'NO SIGNAL'}">${STYLE}<defs>${defs}</defs>${body}</svg>`;
}

// ---------------------------------------------------------------- shared drawing helpers
const stopList = (stops) => stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('');
const lin = (id, stops, x2 = 0, y2 = 1, x1 = 0, y1 = 0) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopList(stops)}</linearGradient>`;
const rad = (id, stops, cx = .5, cy = .5, r = .5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stopList(stops)}</radialGradient>`;
const tri = (id, a, b, c, cx, cy, r) => rad(id, [[0, a], [.6, b], [1, c]], cx, cy, r);
const rimGrad = (id, c, from = .6, op = .8) => lin(`${id}-rim`, [[from, c, 0], [1, c, op]], 1, 0);
const bronzeGrad = (id) => lin(`${id}-bronze`, [[0, '#f6d58a'], [.45, '#c99a44'], [1, '#6e4a18']], .3, 1);

// Đông Sơn bronze-drum sun: bronze disc, ring of dots, many-pointed star (needs `${id}-bronze`)
function drumStar(id, cx, cy, r, n = 12) {
  let pts = '';
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * .4 : r * .78;
    pts += `${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr)} `;
  }
  let dots = '';
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; dots += `<circle cx="${f(cx + Math.cos(a) * r * .9)}" cy="${f(cy + Math.sin(a) * r * .9)}" r="${f(r * .055)}"/>`; }
  return `<circle cx="${cx}" cy="${cy}" r="${f(r + 1)}" fill="#2a1a08"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-bronze)"/><g fill="#4a300c" opacity=".8">${dots}</g>` +
    `<polygon points="${pts.trim()}" fill="#fff0bc" stroke="#6a4612" stroke-width=".4" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy}" r="${f(r * .2)}" fill="#8a5a1a"/>`;
}

// chim Lạc — the long-beaked, crested bird of the Đông Sơn drums, in flight, facing right
function lacBird(x, y, s, fill, edge) {
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}" stroke="${edge}" stroke-width=".9" stroke-linejoin="round">
<path d="M-12.6 6 C-11 3.4 -8.6 1.8 -6 1.2 C-2.4 -1.6 3 -2.2 6.2 -1.2 L13.4 -1.4 L6.6 .8 C4 3 -1.6 3.8 -5.4 2.8 C-7.6 4.2 -9.4 5.6 -10.4 8.2 C-10.6 6.6 -11.6 6 -12.6 6 Z"/>
<path d="M-.4 -.8 C-2 -4.6 -5.2 -7.4 -10.4 -8.6 L-8.4 -6.4 L-11.6 -5.6 L-8.8 -4.2 L-11 -3 L-6.6 -1.8 C-5 -.6 -3 -.2 -.4 -.8 Z"/>
<path d="M4.6 -1.4 C3.6 -4.6 1 -6.6 -2.4 -7.4 C-.4 -5.6 .8 -3.8 1.4 -1.6 Z"/>
<path d="M5.2 -1.6 C5 -4 4 -5.6 2.4 -6.8 C4 -6.4 5.6 -4.8 6.2 -2.2 Z"/></g>`;
}

// ---------------------------------------------------------------- eyes
// canonical LEFT eye centred on the iris; mirrored for the right one. Light comes from upper-left
// for both eyes (highlights are counter-flipped). `lid` lowers the upper lid (skin-coloured).
const HUMAN_EYE = 'M7 .9 C4.4 -3.9 -4.4 -4.4 -7.2 .2 C-4.4 3.4 4.2 3.6 7 .9 Z';
function eyePair(id, o) {
  const { x, y, s = 1, rot = 0, ink, lidFill, irisEdge, ir = 3.3, lash = 1.7, under = .6 } = o;
  const E = HUMAN_EYE;
  const lidFor = (ly) => ly == null ? '' :
    `<path d="M-8 .2 C-5 ${ly} 4 ${f(ly + .5)} 8 .9 C5 -6.5 -5 -7 -8 .2 Z" fill="${lidFill}"/><path d="M-7.4 .1 C-4.6 ${ly} 4 ${f(ly + .5)} 7.4 .9" fill="none" stroke="${ink}" stroke-width="${lash}" stroke-linecap="round"/>` +
    (o.crease ? `<path d="M-6.4 ${f(ly - 2.2)} C-3 ${f(ly - 3.6)} 3 ${f(ly - 3.4)} 6.4 ${f(ly - 1.4)}" fill="none" stroke="${ink}" stroke-width=".55" opacity=".45" stroke-linecap="round"/>` : '');
  const ball = `<path d="${E}" fill="#fbf6ee"/><g clip-path="url(#${id}-eye)"><circle r="${ir}" fill="url(#${id}-iris)"/><circle r="${ir}" fill="none" stroke="${irisEdge}" stroke-width=".7"/><circle cx=".1" cy=".1" r="1.6" fill="#0c0806"/><path d="M-9 -7 H9 V-1.4 C4 -3 -4 -3.4 -9 -.4 Z" fill="#3a1e10" opacity=".25"/></g>`;
  const hi = `<circle cx="-1.2" cy="-1.3" r=".95" fill="#fff"/><circle cx="1.5" cy="1.3" r=".45" fill="#fff" opacity=".85"/>`;
  const top = `<path d="M7.6 1 C4.6 -4.6 -4.6 -5 -7.8 .3" fill="none" stroke="${ink}" stroke-width="${lash}" stroke-linecap="round"/>`;
  const lines = `<path d="M-7.4 .2 L-9.4 -1" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/><path d="M-5.6 1.8 C-2.6 3.8 3 3.9 6 2" fill="none" stroke="${ink}" stroke-width=".6" opacity="${under}"/>`;
  const shut = `<path d="M-7.6 .4 C-4 3.4 4 3.6 7.4 1" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/><path d="M-7.4 .4 L-9.4 -.6" stroke="${ink}" stroke-width="1.1" stroke-linecap="round"/>` +
    (o.crease ? `<path d="M-6.4 -2.6 C-3 -4.4 3 -4.2 6.4 -2" fill="none" stroke="${ink}" stroke-width=".55" opacity=".4" stroke-linecap="round"/>` : '');
  const TL = `translate(${x} ${y}) rotate(${rot}) scale(${s})`;
  const TR = `translate(${128 - x} ${y}) scale(-1 1) rotate(${rot}) scale(${s})`;
  const lidR = o.lidR !== undefined ? o.lidR : o.lid;
  const open = `<g transform="${TL}">${ball}${hi}${o.lid == null ? top : lidFor(o.lid)}${lines}</g>` +
    `<g transform="${TR}">${ball}<g transform="scale(-1 1)">${hi}</g>${lidR == null ? top : lidFor(lidR)}${lines}</g>`;
  const closed = `<g transform="${TL}">${shut}</g><g transform="${TR}">${shut}</g>`;
  return { clip: `<clipPath id="${id}-eye"><path d="${E}"/></clipPath>`, markup: `<g class="pe-open">${open}</g><g class="pe-closed">${closed}</g>` };
}

// ---------------------------------------------------------------- mouths
// Lipped mouth centred on x=64. up/upR lift the left/right corners (negative = frown).
function mouth(o) {
  const { y, w, lip, lipHi, ink, up = 0, upR = up, open = 7, inside = '#4a1414', tongue = '#d86a6a', lipOp = 1 } = o;
  const xl = 64 - w, xr = 64 + w, yl = y - up, yr = y - upR, h = open;
  const c = (k) => f(64 - w * k), d = (k) => f(64 + w * k);
  const closed = `<g opacity="${lipOp}"><path d="M${xl} ${yl} C${c(.55)} ${f(y - 2.2)} ${f(62.2)} ${f(y - 1.9)} 64 ${f(y - 1.1)} C${f(65.8)} ${f(y - 1.9)} ${d(.55)} ${f(y - 2.2)} ${xr} ${yr} C${d(.4)} ${f(y + .6)} ${c(.4)} ${f(y + .6)} ${xl} ${yl} Z" fill="${lip}"/>` +
    `<path d="M${f(xl + 1.4)} ${f(yl + .7)} C${c(.5)} ${f(y + 4.6)} ${d(.5)} ${f(y + 4.6)} ${f(xr - 1.4)} ${f(yr + .7)} C${d(.4)} ${f(y + 1.2)} ${c(.4)} ${f(y + 1.2)} ${f(xl + 1.4)} ${f(yl + .7)} Z" fill="${lip}"/>` +
    `<ellipse cx="64" cy="${f(y + 2.6)}" rx="${f(w * .3)}" ry=".8" fill="${lipHi}" opacity=".7"/></g>` +
    `<path d="M${f(xl - .6)} ${f(yl - .3)} C${c(.4)} ${f(y + 1)} ${d(.4)} ${f(y + 1)} ${f(xr + .6)} ${f(yr - .3)}" fill="none" stroke="${ink}" stroke-width="1.35" stroke-linecap="round"/>`;
  const iy = (k) => f(y + h * k);
  const openM = `<path d="M${xl} ${yl} C${c(.4)} ${f(y - 1.6)} ${d(.4)} ${f(y - 1.6)} ${xr} ${yr} C${f(xr - .8)} ${iy(.8)} ${d(.36)} ${iy(1)} 64 ${iy(1)} C${c(.36)} ${iy(1)} ${f(xl + .8)} ${iy(.8)} ${xl} ${yl} Z" fill="${inside}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M${c(.52)} ${f(y + h - 1.2)} Q64 ${f(y + h - 5)} ${d(.52)} ${f(y + h - 1.2)} Q64 ${f(y + h + .3)} ${c(.52)} ${f(y + h - 1.2)} Z" fill="${tongue}"/>` +
    `<path d="M${f(xl + 1.6)} ${f(yl + .2)} C${c(.4)} ${f(y - .9)} ${d(.4)} ${f(y - .9)} ${f(xr - 1.6)} ${f(yr + .2)} L${f(xr - 2.4)} ${f(yr + 1.9)} C${d(.4)} ${f(y + 1)} ${c(.4)} ${f(y + 1)} ${f(xl + 2.4)} ${f(yl + 1.9)} Z" fill="#f4f1ea"/>` +
    `<g opacity="${lipOp}"><path d="M${xl} ${yl} C${c(.55)} ${f(y - 2.7)} ${f(62.2)} ${f(y - 2.3)} 64 ${f(y - 1.6)} C${f(65.8)} ${f(y - 2.3)} ${d(.55)} ${f(y - 2.7)} ${xr} ${yr} C${d(.4)} ${f(y - 1.3)} ${c(.4)} ${f(y - 1.3)} ${xl} ${yl} Z" fill="${lip}"/>` +
    `<path d="M${f(xl + .9)} ${f(yl + 1.6)} C${f(xl + 1.6)} ${iy(.86)} ${c(.36)} ${f(y + h + .5)} 64 ${f(y + h + .5)} C${d(.36)} ${f(y + h + .5)} ${f(xr - 1.6)} ${iy(.86)} ${f(xr - .9)} ${f(yr + 1.6)} C${f(xr + .2)} ${iy(.95)} ${d(.4)} ${f(y + h + 3.2)} 64 ${f(y + h + 3.2)} C${c(.4)} ${f(y + h + 3.2)} ${f(xl - .2)} ${iy(.95)} ${f(xl + .9)} ${f(yl + 1.6)} Z" fill="${lip}"/>` +
    `<ellipse cx="64" cy="${f(y + h + 2)}" rx="${f(w * .28)}" ry=".7" fill="${lipHi}" opacity=".65"/></g>`;
  return `<g class="pm-closed">${closed}</g><g class="pm-open">${openM}</g>`;
}

// toothy grin (closed = smiling with teeth, open = laughing)
function grin(o) {
  const { y, w, lip, ink, inside = '#5a1616', tongue = '#e07070' } = o;
  const xl = 64 - w, xr = 64 + w;
  const shape = (h, lift) => `M${xl} ${f(y - lift)} C${f(64 - w * .5)} ${f(y + 1.2)} ${f(64 + w * .5)} ${f(y + 1.2)} ${xr} ${f(y - lift)} C${f(xr - 1.4)} ${f(y + h * .7)} ${f(64 + w * .45)} ${f(y + h)} 64 ${f(y + h)} C${f(64 - w * .45)} ${f(y + h)} ${f(xl + 1.4)} ${f(y + h * .7)} ${xl} ${f(y - lift)} Z`;
  const teeth = (lift) => `<path d="M${f(xl + 1.2)} ${f(y - lift + .5)} C${f(64 - w * .5)} ${f(y + 1.6)} ${f(64 + w * .5)} ${f(y + 1.6)} ${f(xr - 1.2)} ${f(y - lift + .5)} L${f(xr - 2)} ${f(y - lift + 2.3)} C${f(64 + w * .45)} ${f(y + 3.3)} ${f(64 - w * .45)} ${f(y + 3.3)} ${f(xl + 2)} ${f(y - lift + 2.3)} Z" fill="#fbf8f0"/>`;
  const lips = (h, lift) => `<path d="${shape(h, lift)}" fill="none" stroke="${lip}" stroke-width="1.5" stroke-linejoin="round"/><path d="M${f(64 - w * .5)} ${f(y + h + 1.8)} C${f(64 - w * .2)} ${f(y + h + 2.8)} ${f(64 + w * .2)} ${f(y + h + 2.8)} ${f(64 + w * .5)} ${f(y + h + 1.8)}" fill="none" stroke="${o.lipHi}" stroke-width="1" stroke-linecap="round" opacity=".7"/>` +
    `<path d="M${f(xl - 1)} ${f(y - lift - .8)} C${f(xl - .4)} ${f(y - lift + .6)} ${f(xl + .4)} ${f(y - lift + 1.4)} ${f(xl + 1)} ${f(y - lift + 1.8)} M${f(xr + 1)} ${f(y - lift - .8)} C${f(xr + .4)} ${f(y - lift + .6)} ${f(xr - .4)} ${f(y - lift + 1.4)} ${f(xr - 1)} ${f(y - lift + 1.8)}" fill="none" stroke="${ink}" stroke-width=".9" stroke-linecap="round" opacity=".7"/>`;
  const closed = `<path d="${shape(5, 2.2)}" fill="${inside}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/>${teeth(2.2)}${lips(5, 2.2)}`;
  const openM = `<path d="${shape(9, 2)}" fill="${inside}" stroke="${ink}" stroke-width="1.2" stroke-linejoin="round"/><path d="M${f(64 - w * .55)} ${f(y + 8)} Q64 ${f(y + 4.2)} ${f(64 + w * .55)} ${f(y + 8)} Q64 ${f(y + 9.4)} ${f(64 - w * .55)} ${f(y + 8)} Z" fill="${tongue}"/>${teeth(2)}${lips(9, 2)}`;
  return `<g class="pm-closed">${closed}</g><g class="pm-open">${openM}</g>`;
}

// ---------------------------------------------------------------- human face assembly
function humanNose(skinDk, ink, y = 0, wide = 0) {
  return `<g transform="translate(0 ${y})"><path d="M62.6 58 C62 64 ${f(60.6 - wide)} 68.6 ${f(58.8 - wide)} 71.6 C${f(60 - wide)} 73.8 62 74.4 64 73.8 C66 74.4 ${f(68 + wide)} 73.8 ${f(69.2 + wide)} 71.6" fill="none" stroke="${skinDk}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M${f(59.6 - wide)} 72.6 C${f(60.6 - wide)} 71.6 62 71.8 62.6 72.8 M65.4 72.8 C66 71.8 ${f(67.4 + wide)} 71.6 ${f(68.4 + wide)} 72.6" fill="none" stroke="${ink}" stroke-width=".9" stroke-linecap="round"/><ellipse cx="64.6" cy="69.4" rx="2" ry="1.3" fill="#fff" opacity=".32"/></g>`;
}
const humanEar = (skin, ink, dx = 0) => both(`<path d="M${f(41.6 + dx)} 57 C${f(37.4 + dx)} 55 ${f(35.4 + dx)} 58.6 ${f(36.4 + dx)} 63 C${f(37.2 + dx)} 67 ${f(39.4 + dx)} 69.6 ${f(42.4 + dx)} 68.6 Z" fill="${skin[1]}" stroke="${ink}" stroke-width="1.1"/><path d="M${f(40.6 + dx)} 59.6 C${f(38.6 + dx)} 59.6 ${f(38.4 + dx)} 62.4 ${f(39.6 + dx)} 64.6" fill="none" stroke="${skin[2]}" stroke-width=".9"/>`);
// neck from (64±nw, 84) down into the collar line at y≈106
const humanNeck = (id, ink, nw = 9.5) => `<path d="M${64 - nw} 84 C${64 - nw} 95 ${f(64 - nw - 1)} 100 ${f(64 - nw - 5)} 106 L${f(64 + nw + 5)} 106 C${f(64 + nw + 1)} 100 ${64 + nw} 95 ${64 + nw} 84 Z" fill="url(#${id}-body)" stroke="${ink}" stroke-width="1.2"/><path d="M${64 - nw} 88 C58 98 70 98 ${64 + nw} 88 L${64 + nw} 96 C70 102 58 102 ${64 - nw} 96 Z" fill="${ink}" opacity=".25"/>`;

function human(id, c) {
  const { head, skin, ink } = c;
  const E = eyePair(id, { ink, irisEdge: c.irisEdge || '#1a0c06', lidFill: c.lidFill || skin[1], ...c.eye });
  const iris = c.iris || ['#a0704a', '#4e2a16', '#140904'];
  const defs = `<clipPath id="${id}-clip"><path d="${head}"/></clipPath>${E.clip}` +
    tri(`${id}-skin`, skin[0], skin[1], skin[2], .58, .36, .78) + lin(`${id}-body`, [[0, skin[1]], [1, skin[2]]]) +
    tri(`${id}-iris`, iris[0], iris[1], iris[2], .5, .38, .62) + rimGrad(id, c.rim) + (c.defs || '');
  const shade = `<path d="${c.shade || 'M30 44 C35 56 38 70 46 82 C50 88 56 94 60 100 L20 100 L20 44 Z'}" fill="${skin[2]}" opacity=".42"/>`;
  const face = `<path d="${head}" fill="url(#${id}-skin)"/><g clip-path="url(#${id}-clip)">${shade}${c.faceClip || ''}</g>${c.faceTop || ''}${humanNose(skin[2], ink, c.noseY || 0, c.noseW || 0)}`;
  const rim = `<path d="${head}" fill="none" stroke="url(#${id}-rim)" stroke-width="3.6" clip-path="url(#${id}-clip)"/>`;
  return wrap(id, defs, `${c.back || ''}${c.body || ''}${c.ears || ''}${face}${E.markup}${c.mouth}${c.overMouth || ''}${rim}<path d="${head}" fill="none" stroke="${ink}" stroke-width="1.5"/>${c.front || ''}`);
}

// ---------------------------------------------------------------- ÂU (Lạc Hồng 2)
function au() {
  const id = 'au', ink = '#2a1410';
  const skin = ['#fcdcbc', '#e8b088', '#b47656'];
  const head = 'M64 32 C77.5 32 87 42 87 56 C87 68 84.6 78 78.8 86.4 C74.4 92.6 69.2 95.6 64 95.6 C58.8 95.6 53.6 92.6 49.2 86.4 C43.4 78 41 68 41 56 C41 42 50.5 32 64 32 Z';
  const defs = lin(`${id}-hair`, [[0, '#3a3440'], [.5, '#17131a'], [1, '#08060a']], .4, 1) +
    lin(`${id}-shell`, [[0, '#fffaf0'], [.55, '#e8dcc4'], [1, '#a8987a']], .3, 1) +
    lin(`${id}-suit`, [[0, '#b0503e'], [.6, '#7e2e24'], [1, '#4e1814']]) + lin(`${id}-scarf`, [[0, '#ff5a3a'], [1, '#b81c1c']], 1, 1) +
    lin(`${id}-gold`, [[0, '#fff0a0'], [1, '#d89a20']]) + bronzeGrad(id);
  // short bob: back mass framing the jaw
  const back = `<path d="M38.4 52 C37 66 36.6 80 39.6 88.4 C42.4 92.4 47.6 91.6 50.6 87.6 L77.4 87.6 C80.4 91.6 85.6 92.4 88.4 88.4 C91.4 80 91 66 89.6 52 Z" fill="url(#${id}-hair)" stroke="#050306" stroke-width="1.2" stroke-linejoin="round"/>`;
  const body = humanNeck(id, ink, 8.6) +
    `<path d="M2 128 C4 112 18 104 40 101 L88 101 C110 104 124 112 126 128 Z" fill="url(#${id}-suit)" stroke="#2a0e08" stroke-width="1.5"/>
<path d="M2 128 C4 116 10 109 20 105 C15 113 14 120 14 128 Z" fill="#3a160c" opacity=".7"/>
${both(`<path d="M36 101.6 L52 100 L60 116 L54 128 L42 128 L38 114 Z" fill="#963c2e" stroke="#2a0e08" stroke-width="1.1" stroke-linejoin="round"/><path d="M38 102 L50 101 L56 112 L44 107 Z" fill="#d07a62" opacity=".45"/>`)}
<path d="M64 112 V128" stroke="#2a0e08" stroke-width="1.4"/><path d="M64.8 112 V128" stroke="#d8a080" stroke-width=".5" opacity=".6"/>
<path d="M98 108 L113 110 L113 118 L98 116 Z" fill="#c8202a" stroke="#2a0e08" stroke-width=".8"/><path d="M98 108 L113 110" stroke="#ffd166" stroke-width=".8"/>
<g transform="translate(26 116)">${drumStar(id, 0, 0, 6.8)}</g>`;
  // red scarf knotted at the throat, one tail over the chest
  const scarf = `<path d="M47.6 98 C52 104.6 76 104.6 80.4 98 L82.6 104 C76 111.6 52 111.6 45.4 104 Z" fill="url(#${id}-scarf)" stroke="#5a0a0a" stroke-width="1.1" stroke-linejoin="round"/>
<path d="M50 103.4 C56 106.6 72 106.6 78 103.4" fill="none" stroke="#ff9a7a" stroke-width=".8" opacity=".6"/>
<path d="M66 106 C72 112 74 118 72 128 L82 128 C84 120 80 111 72 105 Z" fill="url(#${id}-scarf)" stroke="#5a0a0a" stroke-width="1.1" stroke-linejoin="round"/><path d="M70 109 C74 114 76 120 75.4 127" fill="none" stroke="#8a0e10" stroke-width=".8" opacity=".7"/>
<ellipse cx="66" cy="107" rx="4.4" ry="3.4" fill="#d82a24" stroke="#5a0a0a" stroke-width="1"/><path d="M63.6 106 C65 105 67 105 68.4 106.2" fill="none" stroke="#ff9a7a" stroke-width=".7" opacity=".7"/>`;
  const faceTop = both(`<ellipse cx="48" cy="72.4" rx="5" ry="2.6" fill="#f2786a" opacity=".32"/><path d="M43.6 52 C47 48.4 52.6 47.8 58.4 49.6 L58.2 51.4 C52.6 50.2 47.6 50.8 44.2 53.4 Z" fill="#1a1014"/>`);
  // choppy bangs + side locks (drawn over the face, under the helmet)
  const front = `<path d="M40.6 51 C40.6 44 44.6 38.6 52 36.4 L76 36.4 C83.4 38.6 87.4 44 87.4 51 C86 48.6 84 47.2 82 47.6 L80.6 43.6 C78.6 46.6 75.4 48.4 72 48.6 L70.6 44 C67 47 62 48.2 58 47.6 L56.4 43.4 C53.8 46.6 50.4 48.2 47.4 47.8 L46.4 44.2 C44 46.4 42 48.4 40.6 51 Z" fill="url(#${id}-hair)" stroke="#050306" stroke-width="1.1" stroke-linejoin="round"/>
<g stroke="#6a6278" stroke-width=".8" fill="none" opacity=".7" stroke-linecap="round"><path d="M60 38 C58 41 57 43 56.6 44.6"/><path d="M72 38.4 C72 41 71.4 43 70.8 44.6"/><path d="M48 40 C47.4 42 47 43 46.8 44.4"/></g>
${both(`<path d="M40.4 48 C39 60 39.2 72 41.6 83.4 C43 86.6 46 87 47.6 85 C44.8 77 44 64 45.6 52 Z" fill="url(#${id}-hair)" stroke="#050306" stroke-width="1.1" stroke-linejoin="round"/><path d="M41.6 56 C41 66 41.6 75 43.2 82" fill="none" stroke="#6a6278" stroke-width=".7" opacity=".6"/>`)}`;
  // open flight helmet (ivory shell, red trim, ear cups, loose chin straps) with the chim Lạc decal
  const helmet = both(`<path d="M41 79 C42 86 46 91 52 93" fill="none" stroke="#2a1a14" stroke-width="2.4" stroke-linecap="round"/><path d="M41 79 C42 86 46 91 52 93" fill="none" stroke="#6a4a3a" stroke-width="1" stroke-linecap="round"/><rect x="50.4" y="91" width="4" height="3.6" rx=".8" fill="#c9a24a" stroke="#3a2a10" stroke-width=".6"/>`) +
    `<path d="M33.4 70 C30 42 43 16.6 64 16.6 C85 16.6 98 42 94.6 70 L88.6 70 C89.6 54 86 45.6 80 41.2 C74.4 37.6 69 36.6 64 36.6 C59 36.6 53.6 37.6 48 41.2 C42 45.6 38.4 54 39.4 70 Z" fill="url(#${id}-shell)" stroke="#2a1a14" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M39.4 70 C38.4 54 42 45.6 48 41.2 C53.6 37.6 59 36.6 64 36.6 C69 36.6 74.4 37.6 80 41.2 C86 45.6 89.6 54 88.6 70" fill="none" stroke="#d8382a" stroke-width="2.6"/>
<path d="M39.4 70 C38.4 54 42 45.6 48 41.2 C53.6 37.6 59 36.6 64 36.6 C69 36.6 74.4 37.6 80 41.2 C86 45.6 89.6 54 88.6 70" fill="none" stroke="#5a0e0a" stroke-width=".7" transform="translate(0 1.6)" opacity=".6"/>
<path d="M44 26 C50 20.6 57 18.4 64 18.4 C71 18.4 78 20.6 84 26" fill="none" stroke="#fff" stroke-width="2" opacity=".6" stroke-linecap="round"/>
${both(`<path d="M37 32 C35 38 34.2 44 34.2 50" fill="none" stroke="#d8382a" stroke-width="1.8" opacity=".9"/>`)}
${lacBird(64, 27.4, 1.18, `url(#${id}-gold)`, '#8a1a10')}<path d="M55 33 L73 33" stroke="#d8382a" stroke-width="1" opacity=".5"/>
${both(`<rect x="29.4" y="54" width="12.4" height="21" rx="5.4" fill="#3a302c" stroke="#120c0a" stroke-width="1.3"/><rect x="31.4" y="57" width="3" height="15" rx="1.5" fill="#6a5c54"/><path d="M35 60.6 L38.4 64.4 L35 68.2" fill="none" stroke="#d8382a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`)}`;
  return human(id, {
    head, skin, ink, rim: '#ffd8b8', defs, lidFill: '#f2c6a0',
    eye: { x: 52.4, y: 60.6, s: 1.04, rot: 3, lid: -2.4, ir: 3.4, under: .35 },
    faceTop, mouth: grin({ y: 81.4, w: 7.2, lip: '#c45a52', lipHi: '#f4a090', ink }),
    back, body: body + scarf, front: front + helmet,
  });
}

// ---------------------------------------------------------------- ĐỒNG (Lạc Hồng 3)
function dong() {
  const id = 'dong', ink = '#24140c';
  const skin = ['#ecbd92', '#c88c62', '#8a5436'];
  const head = 'M64 31 C79 31 89.6 41 89.6 56 C89.6 68 88.2 77 84.4 85 C80.4 92.6 72 97.6 64 97.6 C56 97.6 47.6 92.6 43.6 85 C39.8 77 38.4 68 38.4 56 C38.4 41 49 31 64 31 Z';
  const defs = lin(`${id}-hair`, [[0, '#d8d4cc'], [1, '#8a847c']]) +
    lin(`${id}-shell`, [[0, '#8a9068'], [.55, '#5a6044'], [1, '#2e3222']], .3, 1) +
    lin(`${id}-visor`, [[0, '#ffe2a0'], [.4, '#c9902e'], [1, '#5a3a0e']], 0, 1) +
    lin(`${id}-leather`, [[0, '#8a5432'], [.6, '#5a321a'], [1, '#2e180a']]) + bronzeGrad(id);
  const body = humanNeck(id, ink, 10.4) +
    `<path d="M48 98 L64 112 L80 98 L82 106 L64 122 L46 106 Z" fill="#6a6a4a" stroke="#1a1a0e" stroke-width="1"/>
<path d="M0 128 C1 112 14 103 38 100 L90 100 C114 103 127 112 128 128 Z" fill="url(#${id}-leather)" stroke="#140a04" stroke-width="1.5"/>
<path d="M0 128 C1 116 7 109 17 104.6 C12 113 11 120 11 128 Z" fill="#1a0c04" opacity=".7"/>
${both(`<path d="M36 99.4 C42 97.6 49 97 53.4 97.4 L64 116 L58 128 L50 128 C46 118 40 110 30 106.4 C30.6 103 33 100.6 36 99.4 Z" fill="#6e4024" stroke="#140a04" stroke-width="1.2" stroke-linejoin="round"/><path d="M36.6 101.6 C42 100 48 99.6 51.6 100 L60.4 115.6" fill="none" stroke="#e8c89a" stroke-width=".55" stroke-dasharray="1.2 1.1" opacity=".75"/><path d="M33 105 C38 106 43 109 47 114" fill="none" stroke="#b07a50" stroke-width=".8" opacity=".5"/><path d="M53.4 97.4 C51 99 50 101 51 103" fill="none" stroke="#efe2c4" stroke-width="2" stroke-linecap="round" opacity=".85"/>`)}
<path d="M64 116 V128" stroke="#140a04" stroke-width="1.2"/>
<g transform="translate(97 115)">${drumStar(id, 0, 0, 7.4, 14)}</g>
<path d="M18 112 L34 112 L34 117 L18 117 Z" fill="#3a2414" stroke="#140a04" stroke-width=".7"/><path d="M20 114.6 H32" stroke="#c9a24a" stroke-width="1" stroke-dasharray="2 1"/>`;
  const wr = skin[2];
  const faceClip = `<g fill="none" stroke="${wr}" stroke-linecap="round"><path d="M50 44.6 C56 43 72 43 78 44.6" stroke-width=".9" opacity=".55"/><path d="M52.6 47.8 C58 46.8 70 46.8 75.4 47.8" stroke-width=".8" opacity=".45"/>
${both(`<path d="M44.8 66 C48.4 68 53.4 68.2 57.2 66.4" stroke-width=".9" opacity=".7"/><path d="M57.4 71.4 C54 75.4 52.8 80 53.6 85.4" stroke-width="1.2" opacity=".75"/><path d="M41.4 59 L38.6 57.6 M41.6 61.6 L38.4 61.6 M41.8 64 L39 65.4" stroke-width=".7" opacity=".7"/><path d="M50 90.4 C53 92.4 56 93.4 58.6 93.8" stroke-width=".8" opacity=".5"/>`)}
<path d="M61 50.6 L61.6 54.4 M67 50.6 L66.4 54.4" stroke-width=".8" opacity=".5"/></g>
<path d="M38 66 C40 80 46 92 56 96 C60 97.6 68 97.6 72 96 C82 92 88 80 90 66 C86 78 80 86 74 88 C68 86 60 86 54 88 C48 86 42 78 38 66 Z" fill="#6a5a50" opacity=".16"/>`;
  // bushy grey brows, crew cut, sideburns
  const faceTop = both(`<path d="M42 52.4 C45.6 48.2 52 47.6 59 49.8 L58.8 52.6 C52.4 51 47.2 51.8 43 54.6 Z" fill="#7a726a" stroke="#4a443e" stroke-width=".6"/><path d="M44 51 L46 49.4 M47 50 L49 48.6 M50.4 49.6 L52.4 48.6 M54 49.8 L56 49.2" stroke="#d8d2c8" stroke-width=".55" stroke-linecap="round" opacity=".8"/>`);
  // grey crew cut: short bristles, slightly receding hairline, grey sideburns
  const hl = 'M41.6 61 C41 54 42 48.4 44.2 45.4 C46.6 43.6 49 43 51.4 42.6 C55 41.6 59.6 41.4 64 41.8 C68.4 41.4 73 41.6 76.6 42.6 C79 43 81.4 43.6 83.8 45.4 C86 48.4 87 54 86.4 61';
  let bristle = '', glint = '';
  for (let i = 0; i < 46; i++) {
    const x = 42.6 + (i * 37.3) % 43, y = 31 + ((i * 5.7) % 11.6), k = ((i % 3) - 1) * .4;
    bristle += `<path d="M${f(x)} ${f(y + 1.6)} L${f(x + k)} ${f(y)}"/>`;
    glint += `<path d="M${f(x + 1)} ${f(y + 1.4)} L${f(x + 1 + k)} ${f(y + .2)}"/>`;
  }
  const crewD = 'M38.8 61 C37.6 46 41 37 47.4 32.6 C53.4 28.8 74.6 28.8 80.6 32.6 C87 37 90.4 46 89.2 61 L86.4 61 C87 54 86 48.4 83.8 45.4 C81.4 43.6 79 43 76.6 42.6 C73 41.6 68.4 41.4 64 41.8 C59.6 41.4 55 41.6 51.4 42.6 C49 43 46.6 43.6 44.2 45.4 C42 48.4 41 54 41.6 61 Z';
  const crew = `<path d="M38.8 61 C37.6 46 41 37 47.4 32.6 C53.4 28.8 74.6 28.8 80.6 32.6 C87 37 90.4 46 89.2 61 L86.4 61 C87 54 86 48.4 83.8 45.4 C81.4 43.6 79 43 76.6 42.6 C73 41.6 68.4 41.4 64 41.8 C59.6 41.4 55 41.6 51.4 42.6 C49 43 46.6 43.6 44.2 45.4 C42 48.4 41 54 41.6 61 Z" fill="url(#${id}-hair)" stroke="#3a3630" stroke-width=".9" stroke-linejoin="round"/>
<g clip-path="url(#${id}-crew)"><g stroke="#4e4840" stroke-width=".7" stroke-linecap="round" opacity=".7">${bristle}</g><g stroke="#f2eee6" stroke-width=".55" stroke-linecap="round" opacity=".7">${glint}</g></g>
<path d="${hl}" fill="none" stroke="#6a645a" stroke-width="1.1" stroke-dasharray="1 .9" stroke-linecap="round"/>`;
  // olive jet helmet pushed back, bronze visor flipped up, side pivots
  const helmet = `<path d="M34.6 64 C31 38 44 14 64 14 C84 14 97 38 93.4 64 L88.8 64 C89.4 50 87 40.6 82 35.2 C76.4 30.6 70 29.4 64 29.4 C58 29.4 51.6 30.6 46 35.2 C41 40.6 38.6 50 39.2 64 Z" fill="url(#${id}-shell)" stroke="#12140a" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M39.6 39 C45 26.6 54 21.6 64 21.6 C74 21.6 83 26.6 88.4 39 C82 33 74 30.4 64 30.4 C54 30.4 46 33 39.6 39 Z" fill="url(#${id}-visor)" stroke="#2a1a06" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M46 30 C52 25.4 58 24 64 24" fill="none" stroke="#fff6dc" stroke-width="1.6" opacity=".8" stroke-linecap="round"/>
<path d="M44 21 C50 16.6 57 15.4 64 15.4 C71 15.4 78 16.6 84 21" fill="none" stroke="#b8c098" stroke-width="1.4" opacity=".6" stroke-linecap="round"/>
<path d="M60.6 14.4 L60.6 21.6 M67.4 14.4 L67.4 21.6" stroke="#2e3222" stroke-width="1"/>
${both(`<circle cx="38.4" cy="41" r="3.6" fill="#c9a24a" stroke="#2a1a06" stroke-width="1"/><circle cx="38.4" cy="41" r="1.2" fill="#5a3a0e"/><path d="M35.4 62 C36 70 38.4 76 42 80" fill="none" stroke="#1a1a10" stroke-width="2.2" stroke-linecap="round"/>`)}`;
  const tache = `<path d="M51.4 80.4 C53.4 76.6 58.6 75.4 64 77 C69.4 75.4 74.6 76.6 76.6 80.4 C77.4 83 76 84 74.2 83 C71 81 68 80.6 64 81.4 C60 80.6 57 81 53.8 83 C52 84 50.6 83 51.4 80.4 Z" fill="#5c5650" stroke="#2a2420" stroke-width=".9" stroke-linejoin="round"/>
<g stroke="#b8b2a8" stroke-width=".55" stroke-linecap="round" opacity=".8"><path d="M54 79.6 L53 81.6"/><path d="M57 78.4 L56 80.8"/><path d="M60 77.8 L59.4 80.4"/><path d="M68 77.8 L68.6 80.4"/><path d="M71 78.4 L72 80.8"/><path d="M74 79.6 L75 81.6"/></g>`;
  return human(id, {
    head, skin, ink, rim: '#ffd89a', defs: defs + `<clipPath id="${id}-crew"><path d="${crewD}"/></clipPath>`, faceClip, faceTop,
    eye: { x: 51.6, y: 59.4, s: .98, rot: 1, lid: -.9, lidR: -.3, crease: true },
    noseW: 1, ears: humanEar(skin, ink, -1.4),
    mouth: mouth({ y: 84.4, w: 6.8, up: .2, upR: 2, open: 6.4, lip: '#a8664e', lipHi: '#d8a088', ink, lipOp: .7 }),
    overMouth: tache, body, front: crew + helmet,
  });
}

// ---------------------------------------------------------------- SỬ (Lạc Hồng 4 · sử gia)
function su() {
  const id = 'su', ink = '#20140e';
  const skin = ['#f8d8b6', '#dea47c', '#a66a4a'];
  const head = 'M64 31 C77 31 86.6 41 86.6 55.6 C86.6 68 84.2 78 78.8 86.4 C74.6 92.6 69.4 96.4 64 96.4 C58.6 96.4 53.4 92.6 49.2 86.4 C43.8 78 41.4 68 41.4 55.6 C41.4 41 51 31 64 31 Z';
  const T = '#4fd8c8';
  const defs = lin(`${id}-hair`, [[0, '#3a3a48'], [.5, '#141218'], [1, '#060508']], .5, 1) +
    lin(`${id}-suit`, [[0, '#2e9a92'], [1, '#124a48']]) + lin(`${id}-band`, [[0, '#4a525e'], [1, '#1c2026']]) +
    lin(`${id}-lens`, [[0, '#e8fffc', .4], [.5, '#a8f0e8', .08], [1, '#4fd8c8', .28]], 1, 1) + lin(`${id}-gold`, [[0, '#fff2c0'], [1, '#c9962e']]);
  const scroll = (x, y) => `<g transform="translate(${x} ${y}) rotate(-12)"><rect x="-4.6" y="-2.4" width="9.2" height="4.8" fill="url(#${id}-gold)" stroke="#4a3010" stroke-width=".6"/><rect x="-5.8" y="-3.2" width="1.8" height="6.4" rx=".9" fill="#a8762a" stroke="#4a3010" stroke-width=".5"/><rect x="4" y="-3.2" width="1.8" height="6.4" rx=".9" fill="#a8762a" stroke="#4a3010" stroke-width=".5"/><path d="M-2.8 -.8 H2.8 M-2.8 .8 H1.6" stroke="#6a4a18" stroke-width=".5"/></g>`;
  const body = humanNeck(id, ink, 8.8) +
    `<path d="M3 128 C5 112 19 104 41 101 L87 101 C109 104 123 112 125 128 Z" fill="url(#${id}-suit)" stroke="#06201e" stroke-width="1.5"/>
<path d="M3 128 C5 116 11 109 21 105 C16 113 15 120 15 128 Z" fill="#082a28" opacity=".7"/>
<path d="M50 101 L64 116 L78 101 Z" fill="#e8ecef"/><path d="M53 101 C57 105 71 105 75 101" fill="none" stroke="#a8b0b8" stroke-width=".9"/>
${both(`<path d="M37 100.6 L51 99.6 L64 117 L58 124 L46 108 L36 104 Z" fill="#3cb2a8" stroke="#06201e" stroke-width="1.1" stroke-linejoin="round"/><path d="M38.6 101 L50.4 100.4 L57 109 L46 105 Z" fill="#9af0e6" opacity=".35"/>`)}
${scroll(46, 104.6)}
<path d="M64 117 V128" stroke="#06201e" stroke-width="1.2"/>
<rect x="84" y="111" width="18" height="13" rx="1.4" fill="#2a8a82" stroke="#06201e" stroke-width="1"/><path d="M84 114.6 H102" stroke="#06201e" stroke-width=".8"/><rect x="88" y="105" width="2" height="9.4" rx=".8" fill="#ffd166" stroke="#4a3a10" stroke-width=".5"/><rect x="91.4" y="106.4" width="2" height="8" rx=".8" fill="#e8ecef" stroke="#3a4248" stroke-width=".5"/>
<rect x="22" y="112" width="18" height="5" rx="1" fill="#0e3a38" stroke="#06201e" stroke-width=".7"/><path d="M24 114.6 H38" stroke="${T}" stroke-width="1" stroke-dasharray="3 1.2"/>`;
  const faceTop = both(`<path d="M43.2 51 C46.6 46.2 52.6 45 58.6 47.2 L58.2 49.4 C53 47.8 48 48.8 44 52.6 Z" fill="#141016"/><ellipse cx="48" cy="73" rx="4.6" ry="2.2" fill="#f08a78" opacity=".22"/>`);
  // neat side part (parting on his right, viewer's left), sweep across the forehead
  const hair = `<path d="M40.4 60 C37.6 42 46 27.6 62 26 C77.6 24.6 89.6 34 88 58 C87 50 85.4 45 82.6 42 C76 44 68 43.4 60.6 40 C57 38.4 54.6 37 53.6 35.6 C51 39 47 41.6 44.6 45 C42.4 49 41 54 40.4 60 Z" fill="url(#${id}-hair)" stroke="#040306" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M53.6 35.6 C52.4 32 52.6 29 53.6 26.6" fill="none" stroke="#040306" stroke-width="1.2" stroke-linecap="round"/>
<g stroke="#6a6a80" stroke-width=".9" fill="none" opacity=".75" stroke-linecap="round"><path d="M56 30 C64 30.6 74 33.4 82 39.4"/><path d="M57 34.6 C64 36 72 38.4 78 41.6"/><path d="M58 27.4 C66 27 76 29.6 84 35"/><path d="M50 30 C47 33 45 37 43.6 42"/></g>`;
  const glasses = `<g fill="url(#${id}-lens)" stroke="#141218" stroke-width="1.9"><circle cx="52.2" cy="59.8" r="8.2"/><circle cx="75.8" cy="59.8" r="8.2"/></g><path d="M60.4 58.8 C62.4 57 65.6 57 67.6 58.8" fill="none" stroke="#141218" stroke-width="1.8"/><path d="M44 58.4 L39.4 57.6 M84 58.4 L88.6 57.6" stroke="#141218" stroke-width="1.6" stroke-linecap="round"/>
<path d="M47 55.6 C48.4 54 50.4 53.2 52.4 53.2 M70.6 55.6 C72 54 74 53.2 76 53.2" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>`;
  const headset = `<path d="M38 64 C32.6 36 46 20.8 64 20.8 C82 20.8 95.4 36 90 64" fill="none" stroke="#101418" stroke-width="5"/><path d="M38 64 C32.6 36 46 20.8 64 20.8 C82 20.8 95.4 36 90 64" fill="none" stroke="url(#${id}-band)" stroke-width="2.8"/><path d="M52 23 C58 21.8 70 21.8 76 23" fill="none" stroke="${T}" stroke-width="1" opacity=".8"/>
<rect x="30.4" y="53" width="12" height="19" rx="5" fill="#262c34" stroke="#0a0c10" stroke-width="1.3"/><rect x="32.4" y="56" width="3" height="13" rx="1.5" fill="#4a5462"/><circle cx="37.6" cy="57.6" r="1.4" fill="${T}"/>
<rect x="85.6" y="53" width="12" height="19" rx="5" fill="#262c34" stroke="#0a0c10" stroke-width="1.3"/><rect x="92.6" y="56" width="3" height="13" rx="1.5" fill="#4a5462"/>
<path d="M36 71 C36.6 81 42 86.6 51.4 86" fill="none" stroke="#0a0c10" stroke-width="2.8" stroke-linecap="round"/><path d="M36 71 C36.6 81 42 86.6 51.4 86" fill="none" stroke="#5a6472" stroke-width="1.1" stroke-linecap="round"/><rect x="50" y="83.6" width="6" height="4.8" rx="2" fill="#262c34" stroke="#0a0c10" stroke-width=".9"/><circle cx="54.6" cy="86" r=".9" fill="${T}"/>`;
  return human(id, {
    head, skin, ink, rim: '#c8fff4', defs, faceTop, lidFill: '#eab894',
    eye: { x: 52.2, y: 60, s: 1, rot: 1, lid: -3.3 },
    ears: humanEar(skin, ink, .4),
    mouth: mouth({ y: 82.2, w: 7, up: 1.8, open: 7.6, lip: '#bc7466', lipHi: '#eab4a0', ink, lipOp: .75 }),
    body, front: hair + glasses + headset,
  });
}

// ---------------------------------------------------------------- KIÊN (chỉ huy)
function kien() {
  const id = 'kien', ink = '#22120c';
  const skin = ['#f4cfac', '#d29a74', '#965e40'];
  const head = 'M64 31 C78 31 87.4 41 87.4 55.6 C87.4 67 85.2 77 79.6 85.6 C75.2 92.4 69.6 96.4 64 96.4 C58.4 96.4 52.8 92.4 48.4 85.6 C42.8 77 40.6 67 40.6 55.6 C40.6 41 50 31 64 31 Z';
  const Y = '#ffd166';
  const defs = lin(`${id}-hair`, [[0, '#3c3640'], [.5, '#16121a'], [1, '#08060a']], .4, 1) +
    lin(`${id}-uni`, [[0, '#2e3c52'], [1, '#0e1624']]) + lin(`${id}-gold`, [[0, '#fff2b0'], [.5, '#e8b440'], [1, '#9a6a14']]) +
    rad(`${id}-holo`, [[0, Y, .3], [.55, '#4fd8c8', .08], [1, Y, 0]], .5, .38, .6);
  // dim holographic map / timeline glow
  let ticks = '';
  for (let i = 0; i < 25; i++) { const x = 6 + i * 4.86; ticks += `<path d="M${f(x)} ${i % 4 ? 20 : 17.6} V23.4"/>`; }
  const nodes = [[16, 21.6], [40, 21.6], [64, 21.6], [93, 21.6], [114, 21.6]].map(([x, y], i) => `<path d="M${x} ${f(y - 2.6)} L${f(x + 2.6)} ${y} L${x} ${f(y + 2.6)} L${f(x - 2.6)} ${y} Z" fill="${i === 3 ? '#ff6a4a' : Y}" opacity="${i === 3 ? .8 : .55}"/>`).join('');
  const holo = `<rect width="128" height="128" fill="url(#${id}-holo)"/>
<g fill="none" stroke="${Y}" opacity=".3"><circle cx="64" cy="54" r="46" stroke-width=".8" stroke-dasharray="2 3"/><circle cx="64" cy="54" r="56" stroke-width=".6"/><path d="M8 54 H120 M64 4 V104" stroke-width=".4" opacity=".6"/></g>
<g stroke="#4fd8c8" fill="none" opacity=".22" stroke-width=".6"><path d="M8 34 H120 M8 74 H120 M24 4 V100 M104 4 V100"/></g>
<path d="M20 30 C14 36 13 44 16 50 C19 56 15 62 12 66 C9 72 12 80 18 84" fill="none" stroke="#4fd8c8" stroke-width="1.2" opacity=".35" stroke-linecap="round"/>
<g stroke="${Y}" stroke-width=".8" opacity=".5"><path d="M4 21.6 H124" stroke-width=".9"/>${ticks}</g>${nodes}
<g fill="${Y}" opacity=".35"><rect x="100" y="36" width="16" height="1.2"/><rect x="100" y="39.4" width="11" height="1.2"/><rect x="100" y="42.8" width="14" height="1.2"/><rect x="10" y="92" width="14" height="1.2"/><rect x="10" y="95.4" width="9" height="1.2"/></g>`;
  // low bun peeking out behind the neck, sleek hair behind the head
  const back = holo + `<path d="M40 58 C39 72 42 84 48 90 L80 90 C86 84 89 72 88 58 Z" fill="url(#${id}-hair)" stroke="#040306" stroke-width="1.1"/>
<circle cx="82.4" cy="91.4" r="7.6" fill="url(#${id}-hair)" stroke="#040306" stroke-width="1.2"/><path d="M77 88.6 C80 85.8 85.4 86 88 89 M76.6 93 C80 95.8 85.6 95.6 89 92.8" fill="none" stroke="#5a5466" stroke-width=".8" opacity=".75"/><path d="M76 87.4 L92.6 83.6" stroke="${Y}" stroke-width="1.1" stroke-linecap="round"/><circle cx="92.8" cy="83.5" r="1" fill="${Y}"/>`;
  const body = humanNeck(id, ink, 8.8) +
    `<path d="M2 128 C4 112 18 104 40 101 L88 101 C110 104 124 112 126 128 Z" fill="url(#${id}-uni)" stroke="#04070c" stroke-width="1.5"/>
<path d="M2 128 C4 116 10 109 20 105 C15 113 14 120 14 128 Z" fill="#04070c" opacity=".5"/>
${both(`<path d="M8 113 C14 107 24 103.6 36 102.6 L38 107 C27 108 18 111 11 116 Z" fill="url(#${id}-gold)" opacity=".85"/>`)}
${both(`<path d="M50.4 97 L60 109 L64 104 L64 128 L46 128 L42 104 Z" fill="#1c2738" stroke="#04070c" stroke-width="1" stroke-linejoin="round"/><path d="M47 100.6 L57 110.6 L52 113 L44.6 105 Z" fill="#c8202a" stroke="#4a0a0a" stroke-width=".6"/><path d="M51 106.4 L52.1 108.6 L54.4 108.8 L52.6 110.2 L53.2 112.4 L51.2 111.2" fill="url(#${id}-gold)"/><path d="M46.8 103.4 L49.4 106" stroke="url(#${id}-gold)" stroke-width="1"/>`)}
<path d="M64 104 V128" stroke="#04070c" stroke-width="1.2"/><circle cx="64" cy="114" r="1.4" fill="url(#${id}-gold)"/><circle cx="64" cy="122" r="1.4" fill="url(#${id}-gold)"/>
<rect x="80" y="113" width="14" height="5" rx=".6" fill="#3a1414"/><rect x="80" y="113" width="4.6" height="5" fill="#c8202a"/><rect x="84.7" y="113" width="4.6" height="5" fill="${Y}"/><rect x="89.4" y="113" width="4.6" height="5" fill="#1e6ab0"/>`;
  const faceClip = both(`<path d="M57.8 74 C56.4 76.4 56 78.6 56.4 81" fill="none" stroke="${skin[2]}" stroke-width=".7" opacity=".3" stroke-linecap="round"/><ellipse cx="47.6" cy="72.6" rx="4.6" ry="2.2" fill="#e8806e" opacity=".18"/>`);
  const faceTop = both(`<path d="M42.8 52.8 C47 49.8 53 49.4 59 50.8 L58.8 52.8 C53.2 51.8 47.8 52.4 43.4 54.8 Z" fill="#1a1216"/>`) +
    `<path d="M41.8 66.6 L41.8 69.2" stroke="${Y}" stroke-width="1.6" stroke-linecap="round"/>`;
  // sleek pulled-back hair, centre part, one silver streak
  const hair = `<path d="M39.6 62 C37.2 42 47.6 27.2 64 27.2 C80.4 27.2 90.8 42 88.4 62 C87.6 51 84.4 44.6 78.4 41 C73.2 38 68.4 37 64 37.6 C59.6 37 54.8 38 49.6 41 C43.6 44.6 40.4 51 39.4 62 Z" fill="url(#${id}-hair)" stroke="#040306" stroke-width=".9" stroke-linejoin="round"/>
<path d="M64 27.6 C63.6 31 63.6 34.4 64 37.6" fill="none" stroke="#040306" stroke-width="1" opacity=".9"/>
<g stroke="#605a6e" stroke-width=".85" fill="none" opacity=".7" stroke-linecap="round"><path d="M62 29.4 C54 30.4 46 35 42.4 44"/><path d="M60 33.6 C53 35 47 38.8 43.6 46"/><path d="M66 29.4 C74 30.4 82 35 85.6 44"/></g>
<path d="M68 33 C76 34.6 82 38.6 85.6 47" fill="none" stroke="#c8c4cc" stroke-width="1.4" opacity=".7" stroke-linecap="round"/>`;
  // slim single-ear headset (viewer's right) with a short mic
  const headset = `<path d="M40.4 50 C38.4 32 50 21.6 64 21.6 C78 21.6 90 32 88.6 58" fill="none" stroke="#0c1016" stroke-width="3"/><path d="M40.4 50 C38.4 32 50 21.6 64 21.6 C78 21.6 90 32 88.6 58" fill="none" stroke="#4a5462" stroke-width="1.4"/>
<rect x="84.6" y="55" width="9.4" height="15" rx="4.2" fill="#232a34" stroke="#06080c" stroke-width="1.2"/><circle cx="89.3" cy="59.4" r="1.4" fill="${Y}"/><circle cx="89.3" cy="59.4" r="2.8" fill="${Y}" opacity=".25"/>
<path d="M87 69 C86 76 82 80.6 76.4 81.6" fill="none" stroke="#06080c" stroke-width="2.2" stroke-linecap="round"/><path d="M87 69 C86 76 82 80.6 76.4 81.6" fill="none" stroke="#5a6472" stroke-width=".9" stroke-linecap="round"/><circle cx="76" cy="81.6" r="1.8" fill="#232a34" stroke="#06080c" stroke-width=".8"/>`;
  return human(id, {
    head, skin, ink, rim: '#ffe6a8', defs, faceClip, faceTop, lidFill: '#eabe98',
    eye: { x: 52, y: 60.4, s: .98, rot: 1, lid: -1.3, under: .25 },
    ears: humanEar(skin, ink, -.4),
    mouth: mouth({ y: 83, w: 6.6, up: .7, open: 6.4, lip: '#b0645a', lipHi: '#e0a090', ink, lipOp: .8 }),
    back, body, front: hair + headset,
  });
}

// ---------------------------------------------------------------- THỜI ẢNH (enemy)
function thoianh() {
  const id = 'thoianh', V = '#b04aff', R = '#ff2a6a';
  const defs = rad(`${id}-aura`, [[0, V, .55], [.6, '#4a0a6a', .2], [1, V, 0]], .5, .46, .62) +
    lin(`${id}-hood`, [[0, '#2c1a40'], [.6, '#120a1c'], [1, '#05030a']]) +
    rad(`${id}-mask`, [[0, '#4a3e5e'], [.55, '#1e1828'], [1, '#08060c']], .42, .3, .8) +
    lin(`${id}-slit`, [[0, '#ffd0e0'], [.4, R], [1, '#7a0a4a']], 1, 0) +
    rad(`${id}-glow`, [[0, R, .7], [.5, V, .25], [1, V, 0]]) +
    `<clipPath id="${id}-clip"><path d="M64 25 C79 25 88.6 37.4 88.6 55 C88.6 73 80 91 64 98.6 C48 91 39.4 73 39.4 55 C39.4 37.4 49 25 64 25 Z"/></clipPath>`;
  const maskD = 'M64 25 C79 25 88.6 37.4 88.6 55 C88.6 73 80 91 64 98.6 C48 91 39.4 73 39.4 55 C39.4 37.4 49 25 64 25 Z';
  const hood = `<path d="M64 4 C92 4 108 28 109 58 C110 84 116 106 126 128 L2 128 C12 106 18 84 19 58 C20 28 36 4 64 4 Z" fill="url(#${id}-hood)" stroke="${V}" stroke-width="1.2" stroke-opacity=".7"/>
<path d="M64 15 C84 15 97 33 97 58 C97 84 84 104 64 110 C44 104 31 84 31 58 C31 33 44 15 64 15 Z" fill="#030206"/>
${both(`<path d="M26 40 C22 60 22 84 16 110" fill="none" stroke="${V}" stroke-width=".8" opacity=".35"/><path d="M34 100 C40 108 48 114 58 118" fill="none" stroke="${V}" stroke-width=".8" opacity=".3"/>`)}
<path d="M44 128 L52 112 L64 120 L76 112 L84 128 Z" fill="#0c0814" stroke="${V}" stroke-width=".8" stroke-opacity=".5"/><circle cx="64" cy="121" r="2.4" fill="${R}" opacity=".8"/><circle cx="64" cy="121" r="5" fill="${R}" opacity=".2"/>`;
  // cracked clock face
  let tk = '';
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, r1 = i % 3 ? 11 : 9.4, r2 = 12.6;
    tk += `<path d="M${f(64 + Math.sin(a) * r1)} ${f(46 - Math.cos(a) * r1)} L${f(64 + Math.sin(a) * r2)} ${f(46 - Math.cos(a) * r2)}" stroke-width="${i % 3 ? .8 : 1.6}"/>`;
  }
  const crack = 'M58 26 L60.6 33 L57.6 38 L63 44 L61 50 L66.6 56 L64 62 L67 70';
  const clock = `<circle cx="64" cy="46" r="14.4" fill="#0a0612" opacity=".55"/><circle cx="64" cy="46" r="14.4" fill="none" stroke="${V}" stroke-width="1.1" opacity=".85"/><circle cx="64" cy="46" r="8" fill="none" stroke="${V}" stroke-width=".5" opacity=".5" stroke-dasharray="1 1.4"/>
<g stroke="#d8a8ff" opacity=".8">${tk}</g><path d="M64 46 L64 36.4 M64 46 L71.6 50.4" stroke="#e8d0ff" stroke-width="1.3" stroke-linecap="round"/><circle cx="64" cy="46" r="1.6" fill="${R}"/>
<path d="${crack}" fill="none" stroke="#000" stroke-width="2.6" stroke-linejoin="miter"/><path d="${crack}" fill="none" stroke="${R}" stroke-width=".9" opacity=".95"/><path d="M61 50 L55 52 L52 57 M60.6 33 L66 30" fill="none" stroke="${R}" stroke-width=".6" opacity=".7"/>`;
  const mask = `<path d="${maskD}" fill="url(#${id}-mask)" stroke="#000" stroke-width="1.4"/>
<g clip-path="url(#${id}-clip)"><path d="M46 30 C52 27 58 26.4 62 27 C54 32 49 40 47 50 C44 44 44 36 46 30 Z" fill="#9a88c0" opacity=".22"/><path d="M80 60 C82 74 76 88 64 96 C74 84 78 72 80 60 Z" fill="${V}" opacity=".18"/>${clock}</g>
<path d="${maskD}" fill="none" stroke="${V}" stroke-width=".8" opacity=".55"/>`;
  const slitL = 'M43.6 61 L58.6 65.6 L57.6 68.6 L45.4 64.6 Z';
  const eyesOpen = `<ellipse cx="64" cy="65" rx="30" ry="9" fill="url(#${id}-glow)"/>${both(`<path d="${slitL}" fill="${R}" opacity=".35" stroke="${R}" stroke-width="3.2" stroke-linejoin="round" stroke-opacity=".3"/><path d="${slitL}" fill="url(#${id}-slit)" stroke="#3a0020" stroke-width=".5" stroke-linejoin="round"/><path d="M47 62.8 L56.6 65.8" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".8"/>`)}`;
  const eyesShut = both(`<path d="M44.4 63 L58.2 67.2" stroke="#2a0018" stroke-width="2" stroke-linecap="round"/><path d="M45 63 L57.8 67" stroke="${R}" stroke-width=".6" stroke-linecap="round" opacity=".6"/>`);
  const mClosed = `<path d="M55 84 L60 85.4 L64 84.6 L68 85.4 L73 84" fill="none" stroke="#000" stroke-width="2.2" stroke-linejoin="round"/><path d="M55 84 L60 85.4 L64 84.6 L68 85.4 L73 84" fill="none" stroke="${R}" stroke-width=".7" opacity=".7" stroke-linejoin="round"/>`;
  const mOpen = `<ellipse cx="64" cy="86" rx="16" ry="8" fill="url(#${id}-glow)"/><path d="M53.6 83.6 L59 82.6 L64 83.8 L69 82.6 L74.4 83.6 L71 88.4 L66 90.4 L64 89.4 L62 90.4 L57 88.4 Z" fill="${R}" stroke="#3a0020" stroke-width=".7" stroke-linejoin="round"/><path d="M57 85.4 H71 M59 87.6 H69" stroke="#ffd0e0" stroke-width=".7" opacity=".8"/>`;
  const glitch = `<g fill="${V}" opacity=".08">${Array.from({ length: 32 }, (_, i) => `<rect x="0" y="${i * 4}" width="128" height="1.3"/>`).join('')}</g>
<rect x="72" y="33" width="56" height="2.2" fill="${R}" opacity=".4"/><rect x="0" y="38.6" width="34" height="1.1" fill="#46e0ff" opacity=".35"/><rect x="0" y="76" width="42" height="2.6" fill="${V}" opacity=".4"/><rect x="86" y="80.4" width="42" height="1.2" fill="#fff" opacity=".25"/><rect x="40" y="104" width="48" height="1" fill="${R}" opacity=".35"/>
<g opacity=".55"><rect x="86" y="51" width="6" height="3" fill="${V}"/><rect x="36" y="70" width="5" height="2" fill="${R}"/><rect x="88.6" y="88" width="4" height="1.6" fill="#46e0ff"/></g>`;
  return wrap(id, defs, `<rect width="128" height="128" fill="url(#${id}-aura)"/>${hood}${mask}<g class="pe-open">${eyesOpen}</g><g class="pe-closed">${eyesShut}</g><g class="pm-closed">${mClosed}</g><g class="pm-open">${mOpen}</g>${glitch}`);
}

// ---------------------------------------------------------------- fallback (unknown caller)
function noSignal() {
  const bars = [[14, 3], [37, 1.4], [61, 2.2], [88, 1.2], [109, 2.6]].map(([y, h], i) => `<rect x="${i % 2 ? 0 : 20}" y="${y}" width="${i % 2 ? 108 : 88}" height="${h}" fill="#9fb4d8" opacity=".22"/>`).join('');
  return wrap('', '', `<path d="M10 128 C12 110 26 101 44 98 L84 98 C102 101 116 110 118 128 Z" fill="#2a3552" stroke="#5a6d99" stroke-width="1.5"/><circle cx="64" cy="58" r="31" fill="#2a3552" stroke="#5a6d99" stroke-width="1.5"/>
<g class="pe-open"><circle cx="52" cy="56" r="3.2" fill="#7fb2ff"/><circle cx="76" cy="56" r="3.2" fill="#7fb2ff"/></g><g class="pe-closed"><path d="M48.5 56.5 H55.5 M72.5 56.5 H79.5" stroke="#7fb2ff" stroke-width="2" stroke-linecap="round"/></g>
<g class="pm-closed"><path d="M58 74 H70" stroke="#7fb2ff" stroke-width="2" stroke-linecap="round"/></g><g class="pm-open"><rect x="58" y="71" width="12" height="6" rx="3" fill="#7fb2ff"/></g>${bars}`);
}

const BUILDERS = { au, dong, su, kien, thoianh };
const ALIASES = { bong: 'au', thach: 'dong', lam: 'su', ho: 'kien', hq: 'kien', hacvan: 'thoianh' };
const cache = {};

/** @param {string} id one of the CHARACTERS keys (case-insensitive; old SKYLINE ids are aliased). Unknown ids get a neutral "no signal" silhouette. */
export function portraitSVG(id) {
  let key = String(id ?? '').toLowerCase();
  key = ALIASES[key] || key;
  if (!BUILDERS[key]) key = '';
  return cache[key] || (cache[key] = key ? BUILDERS[key]() : noSignal());
}
