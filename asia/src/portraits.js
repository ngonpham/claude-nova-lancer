// SKYLINE ASIA — radio-comm character portraits (hand-authored inline SVG).
//
// The Rồng (Dragon) squadron and its enemy: Bông the small-clawed otter (wingman, Rồng 2),
// Thạch the water-buffalo veteran (Rồng 3), Lam the red-crowned crane navigator/engineer
// (Rồng 4), General Hổ the Indochinese tiger (command, "HQ") and Hắc Vân, the machine mind of
// the Black Cloud armada.
//
// portraitSVG(id) returns a complete <svg> string (viewBox 0 0 128 128, fills its box with
// preserveAspectRatio "xMidYMid slice", transparent background) meant to be dropped into the
// comm panel via innerHTML. The HUD animates it by toggling classes on the root <svg>:
//   .open  -> mouth open   (swaps <g class="pm-closed"> for <g class="pm-open">)
//   .blink -> eyes closed  (swaps <g class="pe-open">   for <g class="pe-closed">)
// Every gradient/clipPath id is prefixed with the character id, so any number of portraits
// can live in one document. Markup is built once per id and cached.
export const CHARACTERS = {
  bong:   { name: 'BONG',    nameJa: 'Bông',     role: 'RỒNG 2',  color: '#ff9a3d' },
  thach:  { name: 'THACH',   nameJa: 'Thạch',    role: 'RỒNG 3',  color: '#c9b98a' },
  lam:    { name: 'LAM',     nameJa: 'Lam',      role: 'RỒNG 4',  color: '#4fd8c8' },
  ho:     { name: 'HQ',      nameJa: 'Tướng Hổ', role: 'CHỈ HUY', color: '#ffd166' },
  hacvan: { name: 'HAC VAN', nameJa: 'Hắc Vân',  role: 'KẺ ĐỊCH', color: '#ff3355' },
};

const STYLE = '<style>.pm-open,.pe-closed{display:none}svg.open .pm-open,svg.blink .pe-closed{display:inline}svg.open .pm-closed,svg.blink .pe-open{display:none}</style>';
const MIRROR = 'matrix(-1 0 0 1 128 0)';
const both = (m) => m + `<g transform="${MIRROR}">${m}</g>`;

function wrap(id, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${CHARACTERS[id] ? CHARACTERS[id].name : 'NO SIGNAL'}">${STYLE}<defs>${defs}</defs>${body}</svg>`;
}

// Rồng squadron patch: a golden dragon wing on a navy shield (needs a `${id}-gold` gradient).
const wingPatch = (id, tf = '') => `<g${tf ? ` transform="${tf}"` : ''}><path d="M91 105.5 L109 105.5 L109 115.5 Q109 122 100 125.5 Q91 122 91 115.5 Z" fill="#1d2a52" stroke="#0e1428" stroke-width="1.2" stroke-linejoin="round"/><path d="M92.6 107 L107.4 107 L107.4 115.4 Q107.4 120.8 100 124 Q92.6 120.8 92.6 115.4 Z" fill="none" stroke="url(#${id}-gold)" stroke-width=".9"/>
<path d="M94.5 121 L96.4 112.6 L105.6 108.8 Q104.2 111.6 105.8 113.4 Q103.2 113.6 103.4 116.4 Q100.8 115.8 99.8 118.6 Q98 118.4 94.5 121 Z" fill="url(#${id}-gold)" stroke="#6a4a10" stroke-width=".55" stroke-linejoin="round"/><path d="M96.4 112.6 L103.4 116.4 M96.4 112.6 L99.8 118.6 M96.4 112.6 L105.8 113.4" stroke="#8a5e14" stroke-width=".5" fill="none"/><path d="M105.6 108.8 L107 107.6" stroke="url(#${id}-gold)" stroke-width=".9" stroke-linecap="round"/></g>`;

// ---------------------------------------------------------------- BONG (small-clawed otter)
function bong() {
  const O = '#2a170c';
  const C = '#fff3df';
  const headD = 'M64 31 C86 31 101 41 103.5 57 C105.5 70 101 82 91 89 C83 94.5 73 96.5 64 96.5 C55 96.5 45 94.5 37 89 C27 82 22.5 70 24.5 57 C27 41 42 31 64 31 Z';
  const defs = `
<clipPath id="bong-clip"><path d="${headD}"/></clipPath>
<radialGradient id="bong-fur" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#b47a46"/><stop offset=".55" stop-color="#8e5629"/><stop offset="1" stop-color="#5c3216"/></radialGradient>
<linearGradient id="bong-cream" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6e6"/><stop offset="1" stop-color="#ecd3ac"/></linearGradient>
<linearGradient id="bong-suit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb05c"/><stop offset="1" stop-color="#e9701c"/></linearGradient>
<radialGradient id="bong-eye" cx=".5" cy=".78" r=".8"><stop offset="0" stop-color="#f0b45a"/><stop offset=".45" stop-color="#8a4716"/><stop offset="1" stop-color="#1e0d05"/></radialGradient>
<radialGradient id="bong-lens" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#e4fbff"/><stop offset=".4" stop-color="#6cc8ec"/><stop offset="1" stop-color="#1b4d78"/></radialGradient>
<linearGradient id="bong-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".5" stop-color="#f2c14e"/><stop offset="1" stop-color="#b07a1a"/></linearGradient>
<linearGradient id="bong-rim" x1="0" y1="0" x2="1" y2="0"><stop offset=".62" stop-color="#ffd38a" stop-opacity="0"/><stop offset="1" stop-color="#ffd38a" stop-opacity=".75"/></linearGradient>`;
  const earL = `<circle cx="27.5" cy="45" r="6.6" fill="#6e3f1e" stroke="${O}" stroke-width="1.5"/><circle cx="28.4" cy="45.8" r="3.4" fill="#3a1f0e"/>`;
  const fluffL = `<path d="M27 69 L18.5 71.5 L24.5 75.5 L18 80.5 L27 80.5 L23.5 86 L33 84 Z" fill="${C}" stroke="${O}" stroke-width="1.4" stroke-linejoin="round"/>`;
  const tuft = `<path d="M55 33 C54.5 26 58.5 20.5 64.5 18.5 C62.5 22.5 63.5 25.5 66 28.5 C68 23.5 72.5 21.5 77 22.5 C74 25.5 73 29 72.5 33 Z" fill="#8a5228"/><path d="M55.3 31.5 C54.6 25.5 58.5 20.5 64.5 18.5 C62.5 22.5 63.5 25.5 66 28.5 C68 23.5 72.5 21.5 77 22.5 C74 25.5 73 28.5 72.6 31.5" fill="none" stroke="${O}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  const cream = `<path d="M28 69 C32 60.5 44 59 52 62.5 C56 64 60 64.6 64 64.6 C68 64.6 72 64 76 62.5 C84 59 96 60.5 100 69 C103 79 97 87 89 91.5 C82 95 73 96.5 64 96.5 C55 96.5 46 95 39 91.5 C31 87 25 79 28 69 Z" fill="url(#bong-cream)" clip-path="url(#bong-clip)"/>`;
  const shade = `<path d="M24.5 57 C25.5 46 32 38 42 34 C36 40 33 48 33 56 Z" fill="#5c3216" opacity=".35"/>`;
  const blushL = `<ellipse cx="37" cy="72.5" rx="5.4" ry="2.6" fill="#ff8a76" opacity=".5"/>`;
  const browL = `<path d="M40.5 47.8 Q46.5 44.6 53 46.6" fill="none" stroke="#3a1f0e" stroke-width="2.1" stroke-linecap="round"/>`;
  const eyeL = `<ellipse cx="47.5" cy="58" rx="7.4" ry="8.5" fill="url(#bong-eye)" stroke="${O}" stroke-width="1.3"/><circle cx="48" cy="59.4" r="3.7" fill="#140805"/>`;
  const star = (x, y, s) => `<path d="M${x} ${y - s} Q${x + s * .18} ${y - s * .18} ${x + s} ${y} Q${x + s * .18} ${y + s * .18} ${x} ${y + s} Q${x - s * .18} ${y + s * .18} ${x - s} ${y} Q${x - s * .18} ${y - s * .18} ${x} ${y - s} Z" fill="#fff"/>`;
  const eyeHi = [[44.8, 54.6], [77.8, 54.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.9" fill="#fff"/><circle cx="${x + 6}" cy="${y + 8.2}" r="1.3" fill="#fff"/>${star(x + 6.2, y + .4, 1.9)}`).join('');
  const lidL = `<path d="M39.8 57 A7.6 8.7 0 0 1 55.2 57" fill="none" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/><path d="M40.3 55 L36.6 52.6" stroke="${O}" stroke-width="1.8" stroke-linecap="round"/>`;
  const eyeClosedL = `<path d="M40.5 60 Q47.5 51.5 54.5 60" fill="none" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/><path d="M40.6 58.6 L37 56.6" stroke="${O}" stroke-width="1.6" stroke-linecap="round"/>`;
  const nose = `<path d="M57 67.5 C57 64 71 64 71 67.5 C71 71 67 73 64 73 C61 73 57 71 57 67.5 Z" fill="#2a1610" stroke="${O}" stroke-width=".8"/><ellipse cx="61.5" cy="66.2" rx="2.3" ry="1" fill="#8a6a60"/>`;
  const pads = `<ellipse cx="57" cy="77.4" rx="7.4" ry="5.2" fill="#fffaf0"/><ellipse cx="71" cy="77.4" rx="7.4" ry="5.2" fill="#fffaf0"/><g fill="#b08a66"><circle cx="53.5" cy="76.4" r=".7"/><circle cx="56.5" cy="78.6" r=".7"/><circle cx="52.5" cy="79.6" r=".7"/><circle cx="74.5" cy="76.4" r=".7"/><circle cx="71.5" cy="78.6" r=".7"/><circle cx="75.5" cy="79.6" r=".7"/></g>`;
  const whiskers = `<g stroke="#7a5638" stroke-width=".85" fill="none" stroke-linecap="round" opacity=".8"><path d="M50 76 Q39 73 25 73.5"/><path d="M50 79 Q38 79.5 24 83"/><path d="M78 76 Q89 73 103 73.5"/><path d="M78 79 Q90 79.5 104 83"/></g>`;
  const mouthC = `<path d="M64 73 V76.6 M52.6 76 Q58.3 84 64 77.2 Q69.7 84 75.4 76" fill="none" stroke="${O}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M51.2 74.4 Q51.6 76.8 53.6 77.6 M76.8 74.4 Q76.4 76.8 74.4 77.6" fill="none" stroke="${O}" stroke-width="1.1" stroke-linecap="round"/>`;
  const mouthO = `<path d="M64 73 V77" stroke="${O}" stroke-width="1.6"/><path d="M53 77 Q64 80 75 77 Q73.5 92.5 64 92.5 Q54.5 92.5 53 77 Z" fill="#5a1510" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M57.5 88.5 Q64 83 70.5 88.5 Q68 92.5 64 92.5 Q60 92.5 57.5 88.5 Z" fill="#ff7f7a"/><path d="M57.4 78.6 L59.1 82 L60.8 78.9 Z M67.2 78.9 L68.9 82 L70.6 78.6 Z" fill="#fff"/>`;
  const goggles = `<path d="M24.5 47 C29 35 45 29.5 64 29.5 C83 29.5 99 35 103.5 47 L103 52 C97 41 82 36.5 64 36.5 C46 36.5 31 41 25 52 Z" fill="#3b2c26" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>
<rect x="58" y="32.5" width="12" height="5" rx="2" fill="url(#bong-gold)" stroke="#6a4a10" stroke-width=".9"/>
${both(`<circle cx="49.5" cy="36.5" r="9.6" fill="#4a3a30" stroke="${O}" stroke-width="1.4"/><circle cx="49.5" cy="36.5" r="8.1" fill="url(#bong-gold)"/><circle cx="49.5" cy="36.5" r="6.6" fill="url(#bong-lens)" stroke="#20384a" stroke-width=".9"/><path d="M41.6 39.4 A8.1 8.1 0 0 0 57.4 39.4" fill="none" stroke="#8a5e14" stroke-width="1"/>`)}
<path d="M45 34 Q47 31 50.5 31" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M78.5 34 Q80.5 31 84 31" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="53" cy="39.6" r=".9" fill="#fff" opacity=".8"/><circle cx="86.5" cy="39.6" r=".9" fill="#fff" opacity=".8"/>`;
  const comm = `<rect x="98" y="47" width="9.5" height="14" rx="3.6" fill="#2c3140" stroke="#11141c" stroke-width="1.2"/><circle cx="102.7" cy="51" r="1.5" fill="#ffb24a"/>
<path d="M101.5 60.5 C102 72 95 80 83 82" fill="none" stroke="#11141c" stroke-width="2.8"/><path d="M101.5 60.5 C102 72 95 80 83 82" fill="none" stroke="#3a4152" stroke-width="1.2"/><rect x="77.5" y="79.2" width="7" height="5.4" rx="2.3" fill="#2c3140" stroke="#11141c" stroke-width="1"/>`;
  const rim = `<path d="${headD}" fill="none" stroke="url(#bong-rim)" stroke-width="3.6" clip-path="url(#bong-clip)"/>`;
  const patch = wingPatch('bong');
  const body = `
<path d="M6 128 C8 111 21 102 42 99 L86 99 C107 102 120 111 122 128 Z" fill="url(#bong-suit)" stroke="#6a2a08" stroke-width="1.6"/>
<path d="M6 128 C8 114 16 106 28 102 C23 110 21 118 21 128 Z" fill="#cf5a14"/><path d="M122 128 C120 114 112 106 100 102 C105 110 107 118 107 128 Z" fill="#cf5a14"/>
<path d="M16 110 C24 104 34 101 44 100.5 M112 110 C104 104 94 101 84 100.5" stroke="#ffd08a" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".8"/>
${both(`<path d="M33 103 L42 101.5 L50.5 128 L41 128 Z" fill="#3a3f4c" stroke="#191c24" stroke-width="1" stroke-linejoin="round"/><rect x="40.5" y="113" width="8" height="5" rx="1" fill="#9aa2b2" stroke="#191c24" stroke-width=".8"/>`)}
<path d="M64 106 V128" stroke="#a84a0e" stroke-width="1.4"/><rect x="62" y="108" width="4" height="6" rx="1" fill="#c9ced6" stroke="#6a707a" stroke-width=".6"/>
${patch}
<path d="M46 90 L82 90 L83 102 L45 102 Z" fill="${C}"/>
<path d="M41 93 C51 100 77 100 87 93 L89 102.5 C77 108.5 51 108.5 39 102.5 Z" fill="#2d3340" stroke="#12151c" stroke-width="1.4" stroke-linejoin="round"/><path d="M42 95.6 C52 102 76 102 86 95.6" fill="none" stroke="#ff9a3d" stroke-width="1.2" stroke-linecap="round"/>`;
  const faceGroup = `<ellipse cx="64" cy="98" rx="24" ry="4.6" fill="#7a3a12" opacity=".45"/><g transform="rotate(-4 64 64)">
${both(earL)}${both(fluffL)}<path d="${headD}" fill="url(#bong-fur)"/>${shade}${tuft}${cream}${both(blushL)}${pads}${whiskers}${nose}${both(browL)}
<g class="pe-open">${both(eyeL)}${eyeHi}${both(lidL)}</g><g class="pe-closed">${both(eyeClosedL)}</g>
<g class="pm-closed">${mouthC}</g><g class="pm-open">${mouthO}</g>
${rim}<path d="${headD}" fill="none" stroke="${O}" stroke-width="1.6"/>${goggles}${comm}</g>`;
  return wrap('bong', defs, body + faceGroup);
}

// ---------------------------------------------------------------- THACH (water buffalo)
function thach() {
  const O = '#101317';
  const headD = 'M64 24 C82 24 96 32 98 48 C99 58 96 66 92 72 C96 80 94 92 84 97 C77 100 70 101 64 101 C58 101 51 100 44 97 C34 92 32 80 36 72 C32 66 29 58 30 48 C32 32 46 24 64 24 Z';
  const defs = `
<clipPath id="thach-clip"><path d="${headD}"/></clipPath>
<clipPath id="thach-eyeclip"><path d="M38.5 56 Q47 51.6 55.6 55 Q49 60.2 38.5 56 Z"/></clipPath>
<radialGradient id="thach-hide" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#6c757e"/><stop offset=".6" stop-color="#4a525a"/><stop offset="1" stop-color="#2a3036"/></radialGradient>
<linearGradient id="thach-muzzle" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e9095"/><stop offset="1" stop-color="#5d5f66"/></linearGradient>
<linearGradient id="thach-horn" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#3a352f"/><stop offset=".55" stop-color="#5e574d"/><stop offset="1" stop-color="#8f8676"/></linearGradient>
<linearGradient id="thach-jkt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#717c46"/><stop offset="1" stop-color="#434b26"/></linearGradient>
<linearGradient id="thach-wool" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e9d0"/><stop offset="1" stop-color="#cdb88f"/></linearGradient>
<linearGradient id="thach-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".5" stop-color="#f2c14e"/><stop offset="1" stop-color="#b07a1a"/></linearGradient>
<radialGradient id="thach-eye" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f6c45a"/><stop offset=".7" stop-color="#b8741a"/><stop offset="1" stop-color="#5a3008"/></radialGradient>
<linearGradient id="thach-rim" x1="0" y1="0" x2="1" y2="0"><stop offset=".65" stop-color="#d9e4ec" stop-opacity="0"/><stop offset="1" stop-color="#d9e4ec" stop-opacity=".5"/></linearGradient>`;
  const hornL = `<path d="M42 40 C30 31 14 34 7 26 C2.5 20.5 3 13 6.5 7.5 C8.5 14 11.5 17.5 17 18 C27 14.5 41 16.5 51 28 Z" fill="url(#thach-horn)" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/>
<g stroke="#26221d" stroke-width="1" fill="none" stroke-linecap="round" opacity=".75"><path d="M38.5 19.5 Q35.5 26 39 33"/><path d="M31 17.5 Q27.5 24 29.5 31.5"/><path d="M23.5 17.6 Q20 23.5 21.4 30.6"/><path d="M16.5 17.4 Q13.4 21.6 13.6 28"/><path d="M11 15.5 Q8.6 18.4 8.6 23"/></g>
<path d="M48 26.5 C38 18.5 26 17 17.5 19.4" stroke="#c9bea8" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/><path d="M8 10 C9 14 11 16.6 14.5 17.6" stroke="#c9bea8" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".7"/>`;
  const earL = `<path d="M35 43 C27 37.5 16 37.5 8.5 42.5 C14.5 49.5 25.5 50.5 35.5 48.5 Z" fill="#3c434a" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M32 44.5 C26 41.6 18.5 41.8 13.5 43.6 C18 47 25 47.6 32 46.8 Z" fill="#8c7c7a"/>`;
  const forelock = `<path d="M47 33 C48 25 56 20.5 64 21 C72 20.5 80 25 81 33 C77 30.5 73 30.5 70 33 C68 30 66 29.5 64 31.5 C62 29.5 60 30 58 33 C55 30.5 51 30.5 47 33 Z" fill="#1d2227" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>`;
  const muzzle = `<path d="M64 67 C77 67 89 71 91 83 C92 93 82 100 64 100 C46 100 36 93 37 83 C39 71 51 67 64 67 Z" fill="url(#thach-muzzle)" stroke="${O}" stroke-width="1.2" clip-path="url(#thach-clip)"/>
<path d="M39 84 C40 92 48 98.5 64 99 C52 96 44 92 41 82 Z" fill="#45474d" opacity=".55"/>`;
  const cheekShade = `<path d="M30.5 50 C31 60 33.5 67 37.5 72.5 C35 80 35.5 88 39 93 C33.5 86 32.5 78 35 72 C31.5 66 29.6 58 30.5 50 Z" fill="#20262b" opacity=".6"/>`;
  const nose = `<path d="M49 78.5 C49 72.5 79 72.5 79 78.5 C79 83.5 72 86 64 86 C56 86 49 83.5 49 78.5 Z" fill="#26292e" stroke="${O}" stroke-width="1.2"/>
${both(`<path d="M52.6 79.2 C53.4 75.8 58.6 75.6 59.4 78.4 C59.6 81.4 55.8 82.6 52.6 79.2 Z" fill="#08090b"/>`)}
<path d="M56 74.6 Q64 73.2 72 74.6" stroke="#71777f" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  const browL = `<path d="M34.5 47 C42 44 51 45 58.5 50 L57.4 53 C50.5 49.8 43 49 35.6 50.2 Z" fill="#1e2328" stroke="${O}" stroke-width=".8" stroke-linejoin="round"/>`;
  const eyeL = `<path d="M38.5 56 Q47 51.6 55.6 55 Q49 60.2 38.5 56 Z" fill="#efe3c6"/><g clip-path="url(#thach-eyeclip)"><circle cx="48.4" cy="56" r="3.4" fill="url(#thach-eye)"/><circle cx="48.4" cy="56" r="1.7" fill="#120c06"/></g>
<path d="M38 56.4 Q47 51 56 55.2" fill="none" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/><path d="M41 57.8 Q47.5 60.6 54 57" fill="none" stroke="#23282d" stroke-width=".9" stroke-linecap="round"/><path d="M40 54.2 Q47 50.2 54.5 53" fill="none" stroke="#2a3036" stroke-width="1.2" stroke-linecap="round"/>`;
  const eyeHi = `<circle cx="47.4" cy="55" r=".9" fill="#fff"/><circle cx="78.6" cy="55" r=".9" fill="#fff"/>`;
  const eyeClosedL = `<path d="M38.5 56.2 Q47 59.6 55.5 55.6" fill="none" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>`;
  const scar = `<path d="M89 39.5 L80.5 51.5" stroke="#c7a69c" stroke-width="2.8" stroke-linecap="round"/><path d="M88.6 40.3 L81 51" stroke="#7d4a40" stroke-width=".9" stroke-linecap="round"/><path d="M83 44.4 L87 46.6 M85.2 41.6 L88.6 43.6" stroke="#c7a69c" stroke-width=".8" stroke-linecap="round"/>`;
  const mouthC = `<path d="M64 86 V93.4 M50 92.4 Q57 95.4 64 93.4 Q71 95.4 78 92.4" fill="none" stroke="${O}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  const mouthO = `<path d="M64 86 V90.5" stroke="${O}" stroke-width="1.7"/><path d="M50.5 90.8 Q64 92.6 77.5 90.8 Q75.5 101.4 64 101.8 Q52.5 101.4 50.5 90.8 Z" fill="#3a1414" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/><path d="M55.5 98 Q64 94 72.5 98 Q69.8 101.8 64 101.8 Q58.2 101.8 55.5 98 Z" fill="#a85050"/><path d="M53 91.6 Q64 93.4 75 91.6 L74.4 93.6 Q64 95.2 53.6 93.6 Z" fill="#e8e0cc"/>`;
  const headset = `<path d="M31.5 62 C27 38 42 21.5 64 21.5 C86 21.5 101 38 96.5 62" fill="none" stroke="#14171b" stroke-width="5.4"/><path d="M31.5 62 C27 38 42 21.5 64 21.5 C86 21.5 101 38 96.5 62" fill="none" stroke="#4b5440" stroke-width="2"/>
<path d="M50 23.4 C56 22 72 22 78 23.4" stroke="#8a946c" stroke-width="1" fill="none" stroke-linecap="round"/>
${both(`<rect x="20" y="52" width="15" height="23" rx="5.5" fill="#3e4530" stroke="#0b0d09" stroke-width="1.4"/><rect x="22.6" y="55.5" width="4" height="16" rx="2" fill="#5f6a47"/><rect x="29.5" y="56" width="5.5" height="15" rx="2.5" fill="#1d2118"/>`)}
<circle cx="27.5" cy="57.8" r="1.4" fill="#ffd166"/>
<path d="M27 74 C29 87 38 93 47 92.6" fill="none" stroke="#0b0d09" stroke-width="3.2"/><path d="M27 74 C29 87 38 93 47 92.6" fill="none" stroke="#4b5440" stroke-width="1.4"/><rect x="45" y="89.4" width="8" height="6.4" rx="2.8" fill="#2c3124" stroke="#0b0d09" stroke-width="1.1"/>`;
  const rim = `<path d="${headD}" fill="none" stroke="url(#thach-rim)" stroke-width="3.4" clip-path="url(#thach-clip)"/>`;
  const woolL = `<path d="M46 93 C38 93 27 96.5 19.5 101.5 Q17 106 21.5 108.5 Q22 113 27 113 Q29.5 117.5 34.5 116.5 Q38.5 120.5 43 117.6 L56 105 C56 100 51.5 95.5 46 93 Z" fill="url(#thach-wool)" stroke="${O}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M24 104 q2 -2 4 0 M30 109.5 q2 -2 4 0 M37 113 q2 -2 4 0 M37 103 q2 -2 4 0 M44 108 q2 -2 4 0 M31 99.6 q2 -2 4 0" stroke="#c0a97e" stroke-width="1" fill="none" stroke-linecap="round"/>`;
  const body = `
<path d="M0 128 C2 109 16 99 40 96 L88 96 C112 99 126 109 128 128 Z" fill="url(#thach-jkt)" stroke="${O}" stroke-width="1.6"/>
<path d="M0 128 C2 114 9 106 20 101 C16 110 15 119 15.5 128 Z" fill="#363d1d"/><path d="M128 128 C126 114 119 106 108 101 C112 110 113 119 112.5 128 Z" fill="#363d1d"/>
<path d="M50 98 L78 98 L69 128 L59 128 Z" fill="#2d3220"/><path d="M57 101 Q64 116 71 101" stroke="#a8ac96" stroke-width=".9" fill="none"/>
<path d="M48 94 L80 94 L76 105 L52 105 Z" fill="#30363c"/>
${both(woolL)}
<path d="M64 112 V128" stroke="#252a18" stroke-width="1.4"/><rect x="62" y="114" width="4" height="6" rx="1" fill="#b9b08e" stroke="#5a5238" stroke-width=".6"/>
<rect x="88" y="117" width="18" height="7.5" rx="1.4" fill="#5a3a22" stroke="#2a1a0e" stroke-width="1"/><path d="M90.5 120 H103.5 M90.5 122 H99" stroke="#d9c39a" stroke-width=".9" stroke-linecap="round"/>
${wingPatch('thach', 'translate(-47 31) scale(.8)')}`;
  return wrap('thach', defs, body + `
${both(hornL)}${both(earL)}<path d="${headD}" fill="url(#thach-hide)"/>${both(cheekShade)}${forelock}${muzzle}${nose}${both(browL)}
<g class="pe-open">${both(eyeL)}${eyeHi}</g><g class="pe-closed">${both(eyeClosedL)}</g>${scar}
<g class="pm-closed">${mouthC}</g><g class="pm-open">${mouthO}</g>
${rim}<path d="${headD}" fill="none" stroke="${O}" stroke-width="1.7" stroke-linejoin="round"/>${headset}`);
}

// ---------------------------------------------------------------- LAM (red-crowned crane)
function lam() {
  const O = '#141820';
  const T = '#4fd8c8';
  const headD = 'M54 21 C68 20 80 29 82 43 C83 50 82 56 79.5 61 C75.5 68.5 66 72.5 56 72.5 C44 72.5 34 66.5 31 56 C28 43 34 25 54 21 Z';
  const defs = `
<clipPath id="lam-clip"><path d="${headD}"/></clipPath>
<radialGradient id="lam-white" cx=".55" cy=".3" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#eef2f5"/><stop offset="1" stop-color="#c3ccd4"/></radialGradient>
<linearGradient id="lam-black" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3c424c"/><stop offset="1" stop-color="#101216"/></linearGradient>
<radialGradient id="lam-red" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#ff7070"/><stop offset=".7" stop-color="#e02a34"/><stop offset="1" stop-color="#a8141e"/></radialGradient>
<linearGradient id="lam-beak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9c7a4"/><stop offset=".7" stop-color="#9c9a74"/><stop offset="1" stop-color="#5c5a40"/></linearGradient>
<linearGradient id="lam-suit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fb6aa"/><stop offset="1" stop-color="#136662"/></linearGradient>
<radialGradient id="lam-eye" cx=".5" cy=".7" r=".8"><stop offset="0" stop-color="#ffcf6a"/><stop offset=".5" stop-color="#b8650c"/><stop offset="1" stop-color="#3a1c04"/></radialGradient>
<linearGradient id="lam-lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ffbee" stop-opacity=".5"/><stop offset=".5" stop-color="${T}" stop-opacity=".14"/><stop offset="1" stop-color="#16a898" stop-opacity=".38"/></linearGradient>
<linearGradient id="lam-rim" x1="0" y1="0" x2="1" y2="0"><stop offset=".6" stop-color="#b8fff2" stop-opacity="0"/><stop offset="1" stop-color="#b8fff2" stop-opacity=".7"/></linearGradient>`;
  const crest = `<path d="M36 38 L19 30.5 L29 41.5 L13.5 43 L28.5 49 L17 55.5 L32 55.5 L24.5 63 L37 59 Z" fill="url(#lam-white)" stroke="${O}" stroke-width="1.4" stroke-linejoin="round"/><path d="M33 42 L22 36 M31 48 L19 46 M32 54 L22 57.5" stroke="#9aa6b2" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
  const neck = `<path d="M37 60 C40 73 42 86 40 101 L80 101 C75 88 74 76 77 62 Z" fill="url(#lam-black)" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M35.6 57 C39.6 70 42 84 40 101 L48.5 101 C50 86 48 72 44 62 Z" fill="url(#lam-white)" stroke="${O}" stroke-width="1" stroke-linejoin="round"/>
<g stroke="#5a626e" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"><path d="M56 78 q3 2.4 6 0"/><path d="M62 85 q3 2.4 6 0"/><path d="M53 89 q3 2.4 6 0"/><path d="M66 93 q3 2.4 6 0"/></g>`;
  const mask = `<path d="M85 37 C79 32.5 71 32.5 65 36 C59.5 39.5 59 45.5 61.6 51 C57 55 46 57 37.5 55 C37 64 43.5 71.5 52 72.8 C63 74.4 73.5 71 79.5 64 C83.5 58.5 85.5 49 85 37 Z" fill="url(#lam-black)" clip-path="url(#lam-clip)"/><path d="M40 58 C46 59.6 54 59 60 55.6" stroke="#5a626e" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>`;
  const crown = `<path d="M47 23 C59 18.5 73 22.5 79.5 32 C73 35.5 66 37.5 59.5 37 C52.5 35 47.5 30 47 23 Z" fill="url(#lam-red)" clip-path="url(#lam-clip)"/><g fill="#ff9a9a" opacity=".7"><circle cx="58" cy="26" r=".9"/><circle cx="64" cy="28.5" r=".9"/><circle cx="70" cy="27.5" r=".9"/><circle cx="61" cy="32" r=".8"/><circle cx="68" cy="32.6" r=".8"/></g><path d="M52 24.5 Q60 21 69 23" stroke="#ffd0d0" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>`;
  const brows = `<path d="M45 38.6 L58.5 36.4" stroke="#2a2e36" stroke-width="2" stroke-linecap="round"/><path d="M69.5 36.6 L78 37.6" stroke="#aab4c0" stroke-width="1.6" stroke-linecap="round"/>`;
  const eyes = `<path d="M47 45.5 C50 40.5 58 40 61.5 45.4 C59 50.8 50 51.2 47 45.5 Z" fill="url(#lam-eye)"/><ellipse cx="55" cy="45.8" rx="2.1" ry="2.8" fill="#0a0504"/>
<path d="M46.2 46 C50 40 58.5 39.4 62.2 45.3" fill="none" stroke="${O}" stroke-width="2.3" stroke-linecap="round"/><path d="M46.5 45.8 L43.2 43.6" stroke="${O}" stroke-width="1.7" stroke-linecap="round"/>
<path d="M69.6 44 C71.5 40.4 76.6 40.2 78.4 43.8 C77 47.8 71.6 48.2 69.6 44 Z" fill="url(#lam-eye)"/><ellipse cx="74.6" cy="44.2" rx="1.5" ry="2.1" fill="#0a0504"/>
<path d="M69 44.4 C71.2 40 77 39.6 79 43.6" fill="none" stroke="#e8eef4" stroke-width="1.9" stroke-linecap="round"/>
<circle cx="53.2" cy="44" r="1.2" fill="#fff"/><circle cx="57" cy="47.4" r=".6" fill="#ffe7b0"/><circle cx="73.4" cy="42.8" r=".9" fill="#fff"/>`;
  const eyesShut = `<path d="M46.4 46 C50 49 58 49.4 62 45.6" fill="none" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/><path d="M46.5 45.8 L43.2 43.6" stroke="${O}" stroke-width="1.6" stroke-linecap="round"/><path d="M69.4 44.2 C71.4 46.8 76.6 46.8 78.8 43.8" fill="none" stroke="#e8eef4" stroke-width="1.8" stroke-linecap="round"/>`;
  const beakUp = `<path d="M73 47.5 C88 48 106 55.5 121 66 C105 63.5 90 60.5 77 60 Z" fill="url(#lam-beak)" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M78 50.4 C90 51.5 102 56 111 60.6" stroke="#f4f0d8" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".85"/><path d="M81.5 53.6 L90 55.6" stroke="#3a3826" stroke-width="1" stroke-linecap="round"/>`;
  const beakLo = `<path d="M77 60 C90 60.5 105 63.5 121 66 C105 68 90 67.6 76 66.4 Z" fill="#8a8864" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/>`;
  const mouthC = beakLo + beakUp;
  const mouthO = `<path d="M76.5 59.4 L106 61.2 L103.6 69.4 Z" fill="#3a1018" stroke="${O}" stroke-width="1" stroke-linejoin="round"/><path d="M81.6 62.2 L100 64 L99.4 65.8 L81.4 63.6 Z" fill="#e8787a"/>
<g transform="rotate(11 76 63)">${beakLo}</g><g transform="rotate(-5 76 56)">${beakUp}</g>`;
  const monocle = `<path d="M43.5 45.4 L35 47.5" stroke="#1c232b" stroke-width="2.4" stroke-linecap="round"/><rect x="29.5" y="42" width="7.5" height="11" rx="2.8" fill="#223340" stroke="#0b1418" stroke-width="1.1"/><rect x="31.4" y="44.2" width="1.8" height="6.6" rx=".9" fill="${T}"/>
<circle cx="54.4" cy="45.6" r="9.6" fill="url(#lam-lens)" stroke="#1c232b" stroke-width="2.4"/><circle cx="54.4" cy="45.6" r="9.6" fill="none" stroke="${T}" stroke-width=".9"/>
<g stroke="#b8fff2" stroke-width=".55" fill="none" opacity=".95"><circle cx="54.4" cy="45.6" r="6.6" stroke-dasharray="2.6 1.6"/><path d="M54.4 35.6 V37.6 M54.4 53.6 V55.6 M44.4 45.6 H46.4 M62.4 45.6 H64.4"/></g>
<path d="M47.6 40.2 A8.4 8.4 0 0 1 56 37.2" stroke="#e8fffb" stroke-width="1.1" fill="none" stroke-linecap="round"/><rect x="60.5" y="52.6" width="7" height="1.3" fill="${T}" opacity=".9"/><rect x="60.5" y="54.8" width="4.2" height="1" fill="${T}" opacity=".7"/>`;
  const rim = `<path d="${headD}" fill="none" stroke="url(#lam-rim)" stroke-width="3.6" clip-path="url(#lam-clip)"/>`;
  const body = `
<path d="M8 128 C10 111 23 102 43 99 L85 99 C105 102 118 111 120 128 Z" fill="url(#lam-suit)" stroke="#0a3634" stroke-width="1.6"/>
<path d="M8 128 C10 114 18 106 30 102 C25 110 23 118 23 128 Z" fill="#11605c"/><path d="M120 128 C118 114 110 106 98 102 C103 110 105 118 105 128 Z" fill="#11605c"/>
<path d="M22 108 C31 103 40 101 47 101 M106 108 C97 103 88 101 81 101" stroke="#b8fff2" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>
<path d="M70 104 L82 128" stroke="#e8fffb" stroke-width="1.6"/><path d="M72.2 104 L84.2 128" stroke="#0a3634" stroke-width="1"/>
<rect x="34" y="110" width="15" height="11" rx="1.6" fill="#1a7c76" stroke="#0a3634" stroke-width="1"/><rect x="36" y="106.5" width="2" height="6" rx=".8" fill="#e8e4dc"/><rect x="39.5" y="105.5" width="2" height="7" rx=".8" fill="#ffd166"/><rect x="43" y="107" width="2" height="5.5" rx=".8" fill="#ff6a6a"/>
<circle cx="96" cy="114" r="5" fill="#0f4a48" stroke="${T}" stroke-width="1"/><circle cx="96" cy="114" r="2" fill="none" stroke="#b8fff2" stroke-width="1"/><path d="M96 109.6 V111.2 M96 116.8 V118.4 M91.6 114 H93.2 M98.8 114 H100.4 M92.9 110.9 L94 112 M98 116 L99.1 117.1 M99.1 110.9 L98 112 M94 116 L92.9 117.1" stroke="#b8fff2" stroke-width="1.1"/>
<path d="M35 91 C46 98.5 74 98.5 85 91 L87 102.5 C74 109 46 109 33 102.5 Z" fill="#0f4a48" stroke="#062422" stroke-width="1.4" stroke-linejoin="round"/><path d="M35.6 94 C46 101 74 101 84.4 94" stroke="${T}" stroke-width="1.1" fill="none"/><rect x="77" y="98" width="5" height="3" rx="1" fill="#b8fff2" opacity=".85"/>`;
  return wrap('lam', defs, body + `
${neck}${crest}<path d="${headD}" fill="url(#lam-white)"/>${mask}${crown}${brows}
<g class="pm-closed">${mouthC}</g><g class="pm-open">${mouthO}</g>
<g class="pe-open">${eyes}</g><g class="pe-closed">${eyesShut}</g>
${rim}<path d="${headD}" fill="none" stroke="${O}" stroke-width="1.6"/>${monocle}`);
}

// ---------------------------------------------------------------- HO (Indochinese tiger general)
function ho() {
  const O = '#22140a';
  const W = '#fffaf2';
  const headD = 'M64 32 C87 32 103 45 104 62 C104.5 69 103 75 100 80 L111 84 L101 87 L107 93 L95 93 C88 99 76 102 64 102 C52 102 40 99 33 93 L21 93 L27 87 L17 84 L28 80 C25 75 23.5 69 24 62 C25 45 41 32 64 32 Z';
  const defs = `
<clipPath id="ho-clip"><path d="${headD}"/></clipPath>
<radialGradient id="ho-fur" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#ffb35a"/><stop offset=".55" stop-color="#f0862a"/><stop offset="1" stop-color="#b4521a"/></radialGradient>
<linearGradient id="ho-white" x1="0" y1="0" x2="0" y2="1"><stop offset=".3" stop-color="#fffaf2"/><stop offset="1" stop-color="#e6dccb"/></linearGradient>
<radialGradient id="ho-eye" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".55" stop-color="#f4a62a"/><stop offset="1" stop-color="#9a5206"/></radialGradient>
<linearGradient id="ho-uni" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f3e6c"/><stop offset="1" stop-color="#151c38"/></linearGradient>
<linearGradient id="ho-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4a7a"/><stop offset="1" stop-color="#1a2244"/></linearGradient>
<linearGradient id="ho-visor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#454b58"/><stop offset=".5" stop-color="#16181e"/><stop offset="1" stop-color="#050608"/></linearGradient>
<linearGradient id="ho-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#f2c14e"/><stop offset="1" stop-color="#b0821e"/></linearGradient>
<linearGradient id="ho-rim" x1="0" y1="0" x2="1" y2="0"><stop offset=".62" stop-color="#ffe0a0" stop-opacity="0"/><stop offset="1" stop-color="#ffe0a0" stop-opacity=".6"/></linearGradient>`;
  const earL = `<path d="M35 46 C27 47 19.5 42.5 18 33.5 C25 31 32.5 34 37 40 Z" fill="#e47a26" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M33.5 44 C28 44.4 23 41.4 21.6 35.8 C26.4 34.6 31 36.6 34 40.4 Z" fill="${W}"/><path d="M30 42.4 C27.4 42 25.6 40.4 25 38.2 C27.4 38 29.6 39 31 40.6 Z" fill="#3a1e10"/>`;
  const ruffL = `<path d="M28 72 C34 70.5 40 74.5 42 81 C43.5 87 41.5 93 37.5 96.5 L33 93 L21 93 L27 87 L17 84 L28 80 Z" fill="url(#ho-white)"/>`;
  const stripesL = `<g fill="#1e120a"><path d="M24.6 57 C30.5 56.4 36 58.4 40 62 C35 61.6 30 61.6 25 62.4 Z"/><path d="M26 67 C32 66.2 37.6 68.6 41 72.6 C35.5 71.2 30.6 70.8 26.6 71.4 Z"/><path d="M30 80.6 C33.6 80.4 36.6 82 38.6 85 C35 84.2 32.4 84.2 30.4 84.6 Z"/><path d="M28.5 47 C33 47.6 36.5 50 38.5 53.6 C34.6 52 31.4 51.4 28.2 51.6 Z"/><path d="M41 34.6 C43.5 37.6 44.5 41 44 44.6 C42.2 41.6 40.2 39.6 37.6 38 Z"/></g>`;
  const fore = `<g fill="#1e120a"><path d="M64 46 L60.8 51.6 L64 50 L67.2 51.6 Z"/><path d="M55.5 46 C57 48.6 57.4 51.4 56.6 54 C55.4 51.6 54 49.8 52 48.4 Z"/><path d="M72.5 46 C71 48.6 70.6 51.4 71.4 54 C72.6 51.6 74 49.8 76 48.4 Z"/></g>`;
  const muzzle = `<path d="M64 63 C73.5 63 80.5 69.5 81.5 78 C82.5 88.5 74 97 64 97 C54 97 45.5 88.5 46.5 78 C47.5 69.5 54.5 63 64 63 Z" fill="url(#ho-white)"/>
<path d="M50 92 C55 98.6 73 98.6 78 92 C76 100 70 102 64 102 C58 102 52 100 50 92 Z" fill="url(#ho-white)"/>`;
  const patchL = `<ellipse cx="46" cy="50.6" rx="7.4" ry="3.6" transform="rotate(-10 46 50.6)" fill="${W}"/><path d="M37.5 51.6 C43 48.2 50.5 48.4 57.5 52.8" stroke="#1e120a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const tearL = `<path d="M55.8 60.2 C56.6 63.6 57.4 66.4 59.4 69" stroke="#1e120a" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  const eyeL = `<path d="M39 58.4 C42 53.4 51 52.4 56.2 56.8 C52.4 61.8 43 62.4 39 58.4 Z" fill="url(#ho-eye)"/><circle cx="48.6" cy="57.8" r="2.6" fill="#140a04"/>
<path d="M38.2 59 C41.6 53 51.6 51.8 57 56.8" fill="none" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/><path d="M38.4 58.8 L35 57.2" stroke="${O}" stroke-width="1.8" stroke-linecap="round"/><path d="M41 61 C45 62.6 51 62.4 55 59.6" fill="none" stroke="#5a3010" stroke-width=".9" stroke-linecap="round"/>`;
  const eyeHi = [[46.8, 56.4], [78.4, 56.4]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#fff"/><circle cx="${x + 3.2}" cy="${y + 2.6}" r=".55" fill="#fff"/>`).join('');
  const eyeClosedL = `<path d="M38.6 58.6 C43 61.6 51 61.6 56.4 57.6" fill="none" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/><path d="M38.6 58.6 L35 57.2" stroke="${O}" stroke-width="1.7" stroke-linecap="round"/>`;
  const nose = `<path d="M56.5 66.4 C56.5 63.2 71.5 63.2 71.5 66.4 C71.5 69.4 67.4 72.4 64 74 C60.6 72.4 56.5 69.4 56.5 66.4 Z" fill="#d97a6a" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/><path d="M58.4 65.6 Q64 63.8 69.6 65.6" stroke="#8a3a30" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="61" cy="66.6" rx="1.8" ry=".8" fill="#ffc0b0"/>`;
  const dots = `<g fill="#9a8a78"><circle cx="54" cy="78" r=".75"/><circle cx="51.4" cy="76" r=".75"/><circle cx="52" cy="80.6" r=".75"/><circle cx="74" cy="78" r=".75"/><circle cx="76.6" cy="76" r=".75"/><circle cx="76" cy="80.6" r=".75"/></g>`;
  const whiskers = `<g stroke="#fffaf2" stroke-width=".85" fill="none" stroke-linecap="round" opacity=".9"><path d="M50 77 Q36 73 20 74"/><path d="M50 80 Q36 80.5 19 85"/><path d="M78 77 Q92 73 108 74"/><path d="M78 80 Q92 80.5 109 85"/></g>`;
  const mouthC = `<path d="M64 74 V78.4 M54.6 80.4 Q59.6 82.4 64 78.4 Q68.4 82.4 73.4 80.4" fill="none" stroke="${O}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
  const mouthO = `<path d="M64 74 V77.4" stroke="${O}" stroke-width="1.7"/><path d="M54 79 Q64 76.6 74 79 Q72 92 64 92 Q56 92 54 79 Z" fill="#4a1410" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/><path d="M58 88.6 Q64 84.4 70 88.6 Q67.4 92 64 92 Q60.6 92 58 88.6 Z" fill="#d86060"/><path d="M56.2 79 L58.2 84.6 L60 78.5 Z M68 78.5 L69.8 84.6 L71.8 79 Z" fill="#fff" stroke="${O}" stroke-width=".5" stroke-linejoin="round"/>`;
  const rim = `<path d="${headD}" fill="none" stroke="url(#ho-rim)" stroke-width="3.6" clip-path="url(#ho-clip)"/>`;
  const cap = `<path d="M17 22 C19 9 41 3 64 3 C87 3 109 9 111 22 C104 30 88 33 64 33 C40 33 24 30 17 22 Z" fill="url(#ho-cap)" stroke="${O}" stroke-width="1.5"/>
<path d="M24 14 C34 8 50 6 64 6" stroke="#5a6ca0" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>
<path d="M28 26 C42 31 86 31 100 26 L99 38 C86 41 42 41 29 38 Z" fill="#141a2e" stroke="${O}" stroke-width="1.3"/>
<path d="M28.6 29.6 C42 34 86 34 99.4 29.6" stroke="url(#ho-gold)" stroke-width="1.6" fill="none"/>
<path d="M27 37 C41 41 87 41 101 37 C99 44.5 85 49 64 49 C43 49 29 44.5 27 37 Z" fill="url(#ho-visor)" stroke="${O}" stroke-width="1.3"/>
<path d="M35 41.4 C46 44.4 82 44.4 93 41.4" stroke="#6a7080" stroke-width="1" fill="none"/>
<path d="M33 45 Q37 43 41 45.4 Q45 43.4 49 45.8 Q53 43.8 57 46 Q61 44 64 46.2 Q67 44 71 46 Q75 43.8 79 45.8 Q83 43.4 87 45.4 Q91 43 95 45" stroke="url(#ho-gold)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
<path d="M31 36.4 C44 39.8 84 39.8 97 36.4" stroke="url(#ho-gold)" stroke-width="2" fill="none"/><circle cx="31.5" cy="36.6" r="1.8" fill="url(#ho-gold)" stroke="#6a4a10" stroke-width=".5"/><circle cx="96.5" cy="36.6" r="1.8" fill="url(#ho-gold)" stroke="#6a4a10" stroke-width=".5"/>
${both(`<path d="M57 22.5 C51 19 44 18.5 38.5 20 C43 23.6 50 25.6 56.6 26 Z" fill="url(#ho-gold)" stroke="#6a4a10" stroke-width=".55"/><path d="M55 23.5 C50 21.6 45 21.2 41.5 21.4" stroke="#8a5e14" stroke-width=".55" fill="none"/>`)}
<circle cx="64" cy="20.5" r="8.2" fill="url(#ho-gold)" stroke="#6a4a10" stroke-width=".8"/><circle cx="64" cy="20.5" r="6.5" fill="#1a2244"/>
<path d="M60.2 17.6 C61.6 14.8 66 14.6 67.4 17.2 C68.6 19.6 66.6 21.2 64.2 21.4 C61.6 21.6 59.8 23.4 61.2 25.4 C62.6 27 66 26.6 67.8 24.4" fill="none" stroke="url(#ho-gold)" stroke-width="1.6" stroke-linecap="round"/>
<path d="M58.4 18.8 L60.2 17.6 L59.2 15.6 L61.2 16.4 Z" fill="#f2c14e"/><circle cx="68.2" cy="23.6" r=".9" fill="#ff6a3a"/>`;
  const body = `
<path d="M2 128 C4 110 18 100 40 97 L88 97 C110 100 124 110 126 128 Z" fill="url(#ho-uni)" stroke="#0a0e1e" stroke-width="1.6"/>
<path d="M47 97 L81 97 L64 124 Z" fill="#f2efe8"/>
<path d="M60.5 99.5 L67.5 99.5 L66.2 104 L68.6 119 L64 125 L59.4 119 L61.8 104 Z" fill="#1b2240" stroke="#0a0e1e" stroke-width=".8" stroke-linejoin="round"/>
${both(`<path d="M41 97 L50 97 L64 121 L60 125.5 L45 107 Z" fill="#3a4a7e" stroke="#0a0e1e" stroke-width="1" stroke-linejoin="round"/><circle cx="48.6" cy="104" r="2.2" fill="url(#ho-gold)" stroke="#6a4a10" stroke-width=".5"/>
<path d="M5 112 C8 104 17 100 31 98.6 L34.4 104.6 C24 106 16 110 11.6 117 Z" fill="url(#ho-gold)" stroke="#6a4a10" stroke-width="1" stroke-linejoin="round"/><path d="M9 107.6 C15 104 22 102.4 30 101.8" stroke="#fff4c8" stroke-width=".9" fill="none" stroke-linecap="round"/>
<path d="M6 114 L4.6 122 M8.4 115.6 L7.4 123.6 M10.8 117.2 L10.2 125" stroke="#e0ae3e" stroke-width="1.5" stroke-linecap="round"/>`)}
<path d="M27 103 C32 114 42 119 52 115 M29 106 C34 118 46 123 55 118" stroke="url(#ho-gold)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
<g stroke="#0a0e1e" stroke-width=".5"><rect x="82" y="107" width="5.4" height="3" fill="#2bb5a5"/><rect x="87.4" y="107" width="5.4" height="3" fill="#f2c14e"/><rect x="92.8" y="107" width="5.4" height="3" fill="#8a2a4a"/><rect x="84.7" y="110.4" width="5.4" height="3" fill="#e8e4dc"/><rect x="90.1" y="110.4" width="5.4" height="3" fill="#4a7ad0"/></g>
<path d="M50 92 C55 98.6 73 98.6 78 92 L80 99 C72 104 56 104 48 99 Z" fill="url(#ho-white)"/>`;
  return wrap('ho', defs, body + `
${both(earL)}<path d="${headD}" fill="url(#ho-fur)"/>${both(ruffL)}${both(stripesL)}${fore}${muzzle}${both(patchL)}${both(tearL)}${dots}${whiskers}${nose}
<g class="pe-open">${both(eyeL)}${eyeHi}</g><g class="pe-closed">${both(eyeClosedL)}</g>
<g class="pm-closed">${mouthC}</g><g class="pm-open">${mouthO}</g>
${rim}<path d="${headD}" fill="none" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/>${cap}`);
}

// ---------------------------------------------------------------- HAC VAN (Black Cloud machine mind)
function hacvan() {
  const R = '#ff3355';
  const K = '#07080c';
  const defs = `
<radialGradient id="hacvan-aura" cx=".5" cy=".45" r=".55"><stop offset="0" stop-color="${R}" stop-opacity=".45"/><stop offset=".6" stop-color="#8a1030" stop-opacity=".16"/><stop offset="1" stop-color="${R}" stop-opacity="0"/></radialGradient>
<radialGradient id="hacvan-cloud" cx=".5" cy=".3" r=".75"><stop offset="0" stop-color="#3a3f4e"/><stop offset=".6" stop-color="#1e2129"/><stop offset="1" stop-color="#0c0d12"/></radialGradient>
<linearGradient id="hacvan-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8590a4"/><stop offset=".45" stop-color="#4a5262"/><stop offset="1" stop-color="#22262f"/></linearGradient>
<linearGradient id="hacvan-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c4250"/><stop offset="1" stop-color="#111318"/></linearGradient>
<linearGradient id="hacvan-eye" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2f4"/><stop offset=".35" stop-color="#ff7a90"/><stop offset="1" stop-color="#c00a2c"/></linearGradient>
<linearGradient id="hacvan-mouth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2447"/><stop offset=".5" stop-color="#ffd6dc"/><stop offset="1" stop-color="#ff2447"/></linearGradient>
<radialGradient id="hacvan-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${R}" stop-opacity=".9"/><stop offset=".5" stop-color="${R}" stop-opacity=".3"/><stop offset="1" stop-color="${R}" stop-opacity="0"/></radialGradient>`;
  const glow = (d, w = .9) => `<path d="${d}" stroke="${R}" stroke-width="${(w * 3.2).toFixed(1)}" fill="none" opacity=".25" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" stroke="#ff6b82" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const node = (x, y, r = 1.2) => `<circle cx="${x}" cy="${y}" r="${r * 2.2}" fill="${R}" opacity=".25"/><circle cx="${x}" cy="${y}" r="${r}" fill="#ff8093"/>`;
  const curl = (x, y, s, c = '#8a93a8', w = 1) => `<path d="M${x - 2 * s} ${y + s} C${x - 2.4 * s} ${y - 1.4 * s} ${x + .4 * s} ${y - 2.2 * s} ${x + 1.2 * s} ${y - .2 * s} C${x + 1.8 * s} ${y + 1.2 * s} ${x - .2 * s} ${y + 1.8 * s} ${x - .6 * s} ${y + .4 * s} C${x - .8 * s} ${y - .4 * s} ${x + .2 * s} ${y - .6 * s} ${x + .4 * s} ${y}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  // ---- storm cloud mass behind the mask
  const puffs = [[30, 13, 9], [17, 24, 11], [8, 39, 11], [17, 51, 9], [5, 59, 12], [15, 73, 11], [4, 86, 13], [16, 99, 12], [7, 114, 14], [24, 117, 12], [38, 126, 11]];
  const puffsAll = puffs.concat(puffs.map(([x, y, r]) => [128 - x, y, r]));
  const cloudBack = puffsAll.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${K}" stroke-width="2.6"/>`).join('') +
    puffsAll.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#hacvan-cloud)"/>`).join('');
  const cloudRim = both(puffs.map(([x, y, r]) => `<path d="M${x - r * .8} ${y - r * .6} A${r} ${r} 0 0 1 ${x + r * .5} ${y - r * .87}" stroke="${R}" stroke-width="1" fill="none" opacity=".5" stroke-linecap="round"/>`).join('')) +
    both(curl(17, 75, 3, '#4f566a', 1.1) + curl(9, 41, 2.8, '#4f566a', 1.1) + curl(10, 115, 3.4, '#4f566a', 1.1) + curl(19, 26, 2.4, '#4f566a', 1));
  // ---- armoured collar
  const seg = (y, w, h) => `<path d="M${64 - w} ${y + 5} Q64 ${y - 4} ${64 + w} ${y + 5} L${64 + w + 6} ${y + h + 5} Q64 ${y + h - 4} ${64 - w - 6} ${y + h + 5} Z" fill="url(#hacvan-dark)" stroke="${K}" stroke-width="1.3" stroke-linejoin="round"/>` + glow(`M${64 - w + 3} ${y + 4.2} Q64 ${y - 3.4} ${64 + w - 3} ${y + 4.2}`, .6);
  const collar = seg(100, 26, 11) + seg(111, 33, 11) + seg(122, 40, 11);
  // ---- crest: two cloud-scroll horns
  const crestL = `<path d="M52 18 C46 8 34 4 26 9 C20 13 21 21 27 22.5 C31.5 23.5 34 19.5 31.5 17 C35 15 42 17 47 24 Z" fill="url(#hacvan-plate)" stroke="${K}" stroke-width="1.4" stroke-linejoin="round"/>${curl(28.6, 16.4, 2.2, '#c3cad8', .9)}${glow('M48 19.5 C43 12.5 36 9 29.5 10', .6)}`;
  // ---- mask
  const maskD = 'M64 9 L76 14 L88 24 L94 38 L96.5 52 L93 66 L87 80 L79 94 L70 104 L58 104 L49 94 L41 80 L35 66 L31.5 52 L34 38 L40 24 L52 14 Z';
  const mask = `<path d="${maskD}" fill="url(#hacvan-plate)" stroke="${K}" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M64 11 L74 16.5 L79 30 L64 39 L49 30 L54 16.5 Z" fill="#9ba5b8" stroke="${K}" stroke-width="1" stroke-linejoin="round"/>${curl(59.4, 24, 2.6, '#3c4250', 1.1)}${both(curl(52.5, 27.6, 1.6, '#3c4250', .9))}
${both(`<path d="M35 64 L50 66.6 L55 85 L49.5 94 L41 80 Z" fill="url(#hacvan-dark)" stroke="${K}" stroke-width="1.2" stroke-linejoin="round"/>${curl(44.4, 74.2, 2.3, '#8a93a8', .9)}`)}
<path d="M52 68 L76 68 L74.5 95 L64 103 L53.5 95 Z" fill="url(#hacvan-dark)" stroke="${K}" stroke-width="1.3" stroke-linejoin="round"/>
${both(`<path d="M55.4 72 H59.6 M55.6 76 H59.8 M55.9 80 H60 M56.2 84 H60.2 M56.6 88 H60.4 M57 92 H60.6" stroke="#0a0b0f" stroke-width="1.6" stroke-linecap="round"/><path d="M55.4 72.9 H59.6 M55.6 76.9 H59.8 M55.9 80.9 H60 M56.2 84.9 H60.2 M56.6 88.9 H60.4 M57 92.9 H60.6" stroke="#5a6274" stroke-width=".5"/>`)}
<path d="M64 40 L68 53 L64 64 L60 53 Z" fill="#a9b3c6" stroke="${K}" stroke-width=".9" stroke-linejoin="round"/>
${both(`<path d="M31.5 41 L60 49.5 L64 54 L57 53.5 L33.5 47.5 Z" fill="url(#hacvan-dark)" stroke="${K}" stroke-width="1.3" stroke-linejoin="round"/><path d="M33 41.8 L59.6 50" stroke="#b9c2d4" stroke-width="1" stroke-linecap="round"/>`)}
${glow('M64 39 V33 L70 27.5 L74 27.5 M64 33 L58 27.5 L54 27.5')}${node(74, 27.5)}${node(54, 27.5)}
${both(glow('M36 60 L39 66 L39 74 L45 84 L46.5 92', .7) + node(46.5, 92, 1))}${both(glow('M87 26 L80 34 L72 34', .6) + node(72, 34, .9))}`;
  const eyeL = `<path d="M37 53.5 L58.5 59.5 L57 62.6 L39.6 58.4 Z" fill="${R}" opacity=".3" stroke="${R}" stroke-width="3" stroke-linejoin="round"/><path d="M37 53.5 L58.5 59.5 L57 62.6 L39.6 58.4 Z" fill="url(#hacvan-eye)" stroke="#5a0010" stroke-width=".6" stroke-linejoin="round"/><path d="M40 56.2 L55.5 60.4" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".9"/>`;
  const eyeGlow = `<ellipse cx="64" cy="58" rx="40" ry="14" fill="url(#hacvan-glow)" opacity=".45"/>`;
  const eyeShutL = `<path d="M37.5 55.6 L57.8 61" stroke="#3a0812" stroke-width="2.2" stroke-linecap="round"/><path d="M38.5 56 L57 61" stroke="#a01430" stroke-width=".8" stroke-linecap="round" opacity=".8"/>`;
  const crackD = 'M64 70 L66.6 73.6 L61.6 77.2 L66.6 80.8 L61.6 84.4 L66.6 88 L61.6 91.6 L66 95.2 L64 99';
  const mouthC = `<path d="${crackD}" stroke="#0a0b0f" stroke-width="3" fill="none" stroke-linejoin="miter"/><path d="${crackD}" stroke="${R}" stroke-width=".8" fill="none" opacity=".7"/>`;
  const mouthO = `<ellipse cx="64" cy="85" rx="20" ry="24" fill="url(#hacvan-glow)"/>
<path d="M64 68 L70.5 72 L67.6 75.4 L72 79 L68.4 82.6 L72 86.2 L68.4 89.8 L71 93.4 L66.2 98 L64 102 L61.8 98 L57 93.4 L59.6 89.8 L56 86.2 L59.6 82.6 L56 79 L60.4 75.4 L57.5 72 Z" fill="url(#hacvan-mouth)" stroke="#5a0010" stroke-width=".8" stroke-linejoin="round"/>
<g stroke="#fff" stroke-linecap="round" opacity=".85"><path d="M62 77.6 H66" stroke-width="1"/><path d="M60.4 81.2 H67.6" stroke-width="1.2"/><path d="M60 84.8 H68" stroke-width="1.4"/><path d="M60.4 88.4 H67.6" stroke-width="1.2"/><path d="M62 92 H66" stroke-width="1"/></g>`;
  const glitch = `<rect x="70" y="30" width="58" height="2.2" fill="${R}" opacity=".45"/><rect x="2" y="34.4" width="34" height="1.1" fill="#46e0ff" opacity=".45"/><rect x="0" y="82" width="36" height="2.6" fill="${R}" opacity=".3"/><rect x="90" y="86.4" width="38" height="1.2" fill="#fff" opacity=".35"/><rect x="54" y="121" width="46" height="1" fill="#46e0ff" opacity=".3"/>`;
  return wrap('hacvan', defs, `<rect width="128" height="128" fill="url(#hacvan-aura)"/>${cloudBack}${cloudRim}${collar}${both(crestL)}${mask}
<g class="pe-open">${eyeGlow}${both(eyeL)}</g><g class="pe-closed">${both(eyeShutL)}</g>
<g class="pm-closed">${mouthC}</g><g class="pm-open">${mouthO}</g>${glitch}`);
}

// ---------------------------------------------------------------- fallback (unknown caller)
function noSignal() {
  const bars = [[14, 3], [37, 1.4], [61, 2.2], [88, 1.2], [109, 2.6]].map(([y, h], i) => `<rect x="${i % 2 ? 0 : 20}" y="${y}" width="${i % 2 ? 108 : 88}" height="${h}" fill="#9fb4d8" opacity=".22"/>`).join('');
  return wrap('', '', `<path d="M10 128 C12 110 26 101 44 98 L84 98 C102 101 116 110 118 128 Z" fill="#2a3552" stroke="#5a6d99" stroke-width="1.5"/><circle cx="64" cy="58" r="31" fill="#2a3552" stroke="#5a6d99" stroke-width="1.5"/>
<g class="pe-open"><circle cx="52" cy="56" r="3.2" fill="#7fb2ff"/><circle cx="76" cy="56" r="3.2" fill="#7fb2ff"/></g><g class="pe-closed"><path d="M48.5 56.5 H55.5 M72.5 56.5 H79.5" stroke="#7fb2ff" stroke-width="2" stroke-linecap="round"/></g>
<g class="pm-closed"><path d="M58 74 H70" stroke="#7fb2ff" stroke-width="2" stroke-linecap="round"/></g><g class="pm-open"><rect x="58" y="71" width="12" height="6" rx="3" fill="#7fb2ff"/></g>${bars}`);
}

const BUILDERS = { bong, thach, lam, ho, hacvan };
const ALIASES = { hq: 'ho' };
const cache = {};

/** @param {string} id one of the CHARACTERS keys (case-insensitive; 'hq' works for 'ho'). Unknown ids get a neutral "no signal" silhouette. */
export function portraitSVG(id) {
  let key = String(id ?? '').toLowerCase();
  key = ALIASES[key] || key;
  if (!BUILDERS[key]) key = '';
  return cache[key] || (cache[key] = key ? BUILDERS[key]() : noSignal());
}
