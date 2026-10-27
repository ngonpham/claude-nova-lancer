// LẠC HỒNG — the ten eras. The squadron jumps through time to the golden age of each capital, from the Hùng
// kings' Văn Lang to Nguyễn-dynasty Huế, and defends it from THỜI ẢNH, a shadow machine corps trying to erase
// history. Sử (the navigator-historian) explains the monuments on the radio; all facts are kept to what the
// chronicles and archaeology record.
//
// Each stage defines its sky (palettes), ground (segments + look), landmarks, enemy waves, radio lines and boss.
// Distances are rail metres (~100 m/s). Segment kinds (world.js): fields, hills (midland), karst (limestone
// towers), city (style: citadel | royal | phoco | stilt | palace | old), water (shoreL / shoreR, islands), mountain.

// ------------------------------------------------------------ palette presets
const BASE = {
  zenith: '#2a58a6', mid: '#9dc0e8', horizon: '#ffd6aa', fog: '#e6cdb0', sun: '#ffe2b0', cloud: '#fff4e6', cloudShadow: '#a8a0b0',
  hemiSky: '#b0c8ee', hemiGround: '#6a5a46', waterDeep: '#2a3a36', waterScatter: '#5a6a4a', light: '#ffe4c0',
  sunElev: 16, sunAz: -34, sunDisc: 9, sunLight: 2.7, fogDensity: 0.00068, fogStart: 220, fogHeight: 0.0015, fogFalloff: 0.02,
  glow: 0.32, cloudCover: 0.38, hemi: 1.0, stars: 0, exposure: 0.94, bloom: 0.42, env: 0.85, night: 0,
};
const pal = (o) => ({ ...BASE, ...o });
const NIGHT = {
  zenith: '#060a1e', mid: '#14204a', horizon: '#4a3a6a', fog: '#1e1c40', sun: '#c8d4ff', cloud: '#6a6a9a', cloudShadow: '#181830',
  hemiSky: '#5a6ab0', hemiGround: '#2a2234', waterDeep: '#060c20', waterScatter: '#1a2a5a', light: '#b0c0ff',
  sunElev: 34, sunAz: 24, sunDisc: 2.5, sunLight: 0.8, fogDensity: 0.0006, fogStart: 240, fogHeight: 0.0009, fogFalloff: 0.012,
  glow: 0.12, cloudCover: 0.22, hemi: 1.0, stars: 0.85, exposure: 1.12, bloom: 0.62, env: 0.55, night: 1,
};
const K = (k) => `<kbd>${k}</kbd>`;

// The shadow corps' bosses share a dark obsidian look with violet seams; each stage varies the trim.
const shadow = (trim, eye = '#ff3a6a') => ({ armor: '#262236', shell: '#221e30', plate: '#3a3450', trim, eye, seam: '#b46bff', belly: '#18161f', membrane: '#5a2a7a', hull: '#2e2a40', glow: '#b46bff', core: '#ff3a6a' });

// ------------------------------------------------------------ shared enemy waves
// A stage's combat follows one rhythm (scaled by stage) so the sightseeing lines and landmarks can sit between waves.
function waves(h, st, o = {}) {
  const { at, ring, gold, check } = h;
  const n = (base) => base + Math.floor((st.id - 1) / 3);
  const v = o.v ?? 22;
  at(640, () => h.rear());
  at(700, () => h.vWing('dart', n(5), 760, v, { noFire: st.id === 1 }));
  ring(1050, 0, v);
  at(1150, () => h.snake('dart', n(5), 720, o.snakeU ?? 14, v));
  at(1550, () => h.crossing('dart', n(5), 230, 1, v + 4));
  gold(1700, -24, v + 8);
  at(1950, () => h.fromBehind('dart', n(5)));
  at(2350, () => h.holders('raptor', st.id < 4 ? 2 : 3, 170, { v: v + 4 }));
  ring(2600, 10, v + 4);
  at(2850, () => h.ringOf('drone', n(8), 190, { r: 14, v: v + 4 }));
  at(3300, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v }));
  check(st.checkpoint);
  at(st.checkpoint + 250, () => h.gunship());
  at(st.checkpoint + 650, () => h.vWing('interceptor', n(5), 720, v + 6, { speed: 32 }));
  ring(st.checkpoint + 900, 0, v + 2);
  at(st.checkpoint + 1150, () => { h.fromBehind('interceptor', n(4)); h.divers('interceptor', 3 + (st.id > 5 ? 1 : 0)); });
  gold(st.checkpoint + 1500, 20, v + 10);
  at(st.checkpoint + 1650, () => h.ringOf('drone', n(9), 200, { r: 16, v: v + 6 }));
  at(st.checkpoint + 2150, () => h.holders('raptor', st.id < 5 ? 2 : 3, 180, { v: v + 6 }));
  if (o.turrets) for (const [s, u, type] of o.turrets) at(s - 400, () => h.turret(s, u, { type }));
  at(st.bossAt - 900, () => h.crossing('interceptor', n(5), 240, -1, v + 6));
  ring(st.bossAt - 500, 0, v);
}

export const STAGES = [
  // =================================================================== 1 · VĂN LANG
  {
    id: 1, key: 'vanlang', city: 'PHONG CHÂU', country: 'VĂN LANG · THẾ KỶ VII TCN', era: 'Các vua Hùng', title: 'BÌNH MINH VĂN LANG', en: 'DAWN OF VĂN LANG',
    blurb: 'Nước Văn Lang của các vua Hùng: đồi trung du, ngã ba sông, nhà sàn mái cong và trống đồng Đông Sơn. Một bóng nước khổng lồ mang hình Thủy Tinh đang dâng lên.',
    music: 'stage1', bossAt: 7300, checkpoint: 3800, weather: 'mist',
    palettes: {
      dawn: pal({ zenith: '#3a5a98', mid: '#b4bcd8', horizon: '#ffcaa0', fog: '#e8cfc0', sun: '#ffd0a0', hemiGround: '#5a5a40', sunElev: 7, sunAz: 62, sunLight: 2.3, fogDensity: 0.0008, fogHeight: 0.004, fogFalloff: 0.035, glow: 0.45, cloudCover: 0.3, bloom: 0.46, waterDeep: '#3a3022', waterScatter: '#8a6a3a' }),
      morning: pal({ zenith: '#2f62b0', mid: '#a8c8e8', horizon: '#ffe4c0', fog: '#dcd6c4', sun: '#fff0d0', sunElev: 18, sunAz: 62, sunLight: 2.8, fogDensity: 0.00062, fogHeight: 0.0018, waterDeep: '#3a3626', waterScatter: '#7a6a42' }),
    },
    paletteKeys: [{ at: 0, name: 'dawn' }, { at: 3000, name: 'dawn' }, { at: 6000, name: 'morning' }],
    segments: [
      { at: 0, kind: 'hills', river: 34, clear: 70 },
      { at: 2200, kind: 'fields', river: 60, far: 60, farAt: 900 },
      { at: 4300, kind: 'hills', river: 30, clear: 80 },
      { at: 6700, kind: 'water', shoreL: 320, shoreR: 300, style: 'fields' },
    ],
    look: {
      hamlet: 'stilt', trees: ['bamboo', 'areca', 'round', 'banyan', 'bamboo'], thatch: ['#9a8050', '#8a7048', '#b09060'], boat: 'sampan',
      paddy: ['#7aac3a', '#90bc48', '#68a036', '#a8c45a'], hill: '#4e7a36', hill2: '#5a8a3c', mud: '#7a6448', bank: '#8a7458', lamps: false,
    },
    enemyTint: '#d8ccff',
    boss: { type: 'serpent', model: 'thuongluong', name: 'THUỒNG LUỒNG', sub: 'Thủy quái đầu nguồn bị Thời Ảnh chiếm hồn — giải thoát nó!', hp: 0.9, turretHp: 8, scale: 1 },
    clearLines: [['su', 'Như Sơn Tinh năm xưa, ta đã đẩy lùi con nước! Văn Lang bình yên rồi.'], ['au', 'Bình minh trên đồi trung du đẹp quá… Em muốn ở lại thêm chút nữa!'], ['kien', 'Làm tốt lắm, Lạc Hồng. Chuẩn bị nhảy thời gian: thế kỷ III trước Công nguyên.']],
    script(h) {
      const { say, lm, at } = h;
      say(110, 'kien', 'Đây là Chỉ huy Kiên. Thời Ảnh đang xé rách dòng lịch sử. Phi đội Lạc Hồng — nhảy về Văn Lang, giữ lấy cội nguồn!', { hold: 2.4 });
      say(560, 'su', 'Chúng ta đang ở Phong Châu, kinh đô nước Văn Lang của các vua Hùng — nhà nước đầu tiên của người Việt.');
      at(330, () => h.tip(`${K('W')}${K('A')}${K('S')}${K('D')} / phím mũi tên: bay　${K('J')} / ${K('Space')}: bắn`, 6, 'Kéo góc trái dưới để bay ／ FIRE để bắn'));
      lm('nghialinh', 1500, { u: -300, view: 4000 });
      say(1250, 'su', 'Bên trái là núi Nghĩa Lĩnh, nơi có đền thờ các vua Hùng. Ngày giỗ Tổ mùng 10 tháng Ba âm lịch vẫn được giữ đến hôm nay.');
      lm('thuyenlac', 2100, { u: 75, rotY: Math.PI / 2 }); lm('thuyenlac', 2250, { u: -80, rotY: Math.PI / 2 });
      lm('nhasan', 2700, { u: 0 });
      say(2450, 'su', 'Nhà sàn mái cong hình thuyền — đúng như hình khắc trên trống đồng! Bay qua gầm sàn đi!');
      say(3000, 'su', 'Ngã ba Bạch Hạc: sông Đà, sông Lô đổ vào sông Hồng. Phù sa ba con sông nuôi cả nền văn minh lúa nước.');
      lm('trongdong', 4600, { u: 62 });
      say(4250, 'su', 'Trống đồng Đông Sơn! Giữa mặt trống là ngôi sao nhiều cánh, xung quanh là chim Lạc bay, người giã gạo, thuyền đua.');
      say(4500, 'dong', 'Mặt trống ở bên phải. Bay cao qua trên nó, đừng chạm vào cổ vật.');
      lm('nhasan', 5600, { u: -120, big: false, scale: 2.4 }); lm('nhasan', 5700, { u: 140, big: false, scale: 2.2 });
      lm('thuyenlac', 6900, { u: 70, rotY: Math.PI / 2 }); lm('thuyenlac', 7050, { u: -60, rotY: Math.PI / 2 });
      waves(h, this);
      say(6950, 'su', 'Truyền thuyết kể Thủy Tinh dâng nước đánh Sơn Tinh, nhưng núi càng dâng cao hơn. Nước đang dâng ở phía trước!', { prio: 1 });
    },
  },

  // =================================================================== 2 · ÂU LẠC — CỔ LOA
  {
    id: 2, key: 'auloc', city: 'CỔ LOA', country: 'ÂU LẠC · THẾ KỶ III TCN', era: 'An Dương Vương', title: 'THÀNH ỐC CỔ LOA', en: 'THE SPIRAL CITADEL',
    blurb: 'Thục Phán An Dương Vương dựng thành Cổ Loa: ba vòng thành đất uốn như xoáy ốc, hào nước bao quanh. Bay xuyên ba cổng thành vào tận đền Thượng.',
    music: 'stage2', bossAt: 7300, checkpoint: 3800,
    palettes: {
      morning: pal({ zenith: '#2c5eae', mid: '#a4c4e8', horizon: '#ffe6c4', fog: '#d8d0bc', sun: '#fff0d0', sunElev: 24, sunAz: -40, fogDensity: 0.0006, fogHeight: 0.0014, cloudCover: 0.42, waterDeep: '#2a3a30', waterScatter: '#4a6a44' }),
      noon: pal({ zenith: '#2a5aa8', mid: '#9cc0e6', horizon: '#f0e8d4', fog: '#d0d4c8', sun: '#fff6e0', sunElev: 44, sunLight: 3, fogDensity: 0.00056, cloudCover: 0.48, waterDeep: '#2a3a30', waterScatter: '#4a6a44' }),
    },
    paletteKeys: [{ at: 0, name: 'morning' }, { at: 3500, name: 'morning' }, { at: 6500, name: 'noon' }],
    segments: [
      { at: 0, kind: 'fields', river: 60, far: 50, farAt: 900 },
      { at: 2900, kind: 'city', style: 'stilt', density: 0.7 },
      { at: 4600, kind: 'city', style: 'citadel', density: 0.8 },
      { at: 6600, kind: 'fields', far: 40, farAt: 900 },
    ],
    look: {
      hamlet: 'stilt', trees: ['bamboo', 'round', 'areca', 'banyan'], ground: '#9a8c70', road: '#a07c50', plaza: '#a89070', park: '#5a8a3a', park2: '#6a9a40',
      walls: ['#c8b088', '#b8a078'], roofs: ['#8a6a44', '#7a5a3a'], thatch: ['#9a8050', '#a88a58'], lamps: false,
    },
    enemyTint: '#d8ccff',
    boss: { type: 'warship', model: 'kimquy', name: 'KIM QUY', sub: 'Rùa vàng giúp dựng thành Cổ Loa, đang bị bóng tối trói buộc', hp: 0.95, turrets: 6 },
    clearLines: [['su', 'Ba vòng thành vẫn đứng vững. Hàng vạn mũi tên đồng kia sẽ còn nằm đó cho hậu thế tìm thấy.'], ['dong', 'Thành đất mà bền như đá. Người xưa giỏi thật.'], ['kien', 'Lạc Hồng, nhảy tiếp: năm 968, kinh đô Hoa Lư.']],
    script(h) {
      const { say, lm } = h;
      say(110, 'kien', 'Âu Lạc, thế kỷ III trước Công nguyên. Thời Ảnh nhắm vào thành Cổ Loa. Bảo vệ thành!', { hold: 2.2 });
      say(560, 'au', 'Rõ! Lần này em bay trước nhé, anh Đồng!');
      say(1300, 'su', 'Thành Cổ Loa có ba vòng thành đất uốn lượn như xoáy ốc. Cả ba vòng dài chừng mười sáu cây số!');
      lm('coloa', 2200, { u: 0, R: 640, label: 'CỔNG THÀNH NGOẠI' });
      say(2700, 'su', 'Ngoài mỗi vòng thành là hào nước nối với sông Hoàng. Thuyền chiến có thể đi lại ngay trong hào.');
      lm('chonno', 2900, { u: -120 }); lm('chonno', 3100, { u: 130 });
      lm('coloa', 4300, { u: 0, R: 460, label: 'CỔNG THÀNH TRUNG' });
      say(4700, 'su', 'Ở Cổ Loa người ta đã đào được hàng vạn mũi tên đồng — dấu tích của "nỏ thần" trong truyền thuyết.');
      lm('chonno', 5200, { u: 120 });
      lm('coloa', 5900, { u: 0, R: 280, label: 'CỔNG THÀNH NỘI' });
      lm('denthuong', 6500, { u: -200, view: 3500 });
      say(6250, 'su', 'Đền Thượng thờ An Dương Vương. Phía trước đền là Giếng Ngọc — nơi gắn với chuyện Mị Châu – Trọng Thủy.');
      waves(h, this, { turrets: [[3400, -30, 'aagun'], [3450, 30, 'aagun'], [5000, 0, 'turret']] });
      say(6950, 'dong', 'Một pháo đài bóng tối đang đóng ngay sau đền. Chuẩn bị!', { prio: 1 });
    },
  },

  // =================================================================== 3 · ĐẠI CỒ VIỆT — HOA LƯ
  {
    id: 3, key: 'hoalu', city: 'HOA LƯ', country: 'ĐẠI CỒ VIỆT · 968–1009', era: 'Nhà Đinh · Tiền Lê', title: 'KINH ĐÔ GIỮA NÚI ĐÁ', en: 'CAPITAL OF STONE',
    blurb: 'Đinh Tiên Hoàng dẹp loạn mười hai sứ quân, lập nước Đại Cồ Việt và đóng đô ở Hoa Lư — kinh đô lấy núi đá vôi làm tường thành.',
    music: 'stage3', bossAt: 7300, checkpoint: 3800, weather: 'mist',
    palettes: {
      mist: pal({ zenith: '#3a62a8', mid: '#b4c8e0', horizon: '#eae8dc', fog: '#d4d8cc', sun: '#fff4dc', sunElev: 20, sunAz: -20, fogDensity: 0.0008, fogHeight: 0.0035, fogFalloff: 0.025, cloudCover: 0.5, hemiGround: '#5a6a4a', waterDeep: '#1e3a32', waterScatter: '#3a7a5a' }),
      gold: pal({ zenith: '#2e5aa4', mid: '#b0bed4', horizon: '#ffd4a0', fog: '#e0cdb4', sun: '#ffd8a0', sunElev: 9, sunAz: -20, sunLight: 2.5, fogDensity: 0.0007, fogHeight: 0.002, glow: 0.42, waterDeep: '#1e3a32', waterScatter: '#4a7a54' }),
    },
    paletteKeys: [{ at: 0, name: 'mist' }, { at: 4000, name: 'mist' }, { at: 7000, name: 'gold' }],
    segments: [
      { at: 0, kind: 'karst', river: 40, clear: 70 },
      { at: 3400, kind: 'karst', river: 0, clear: 80 },
      { at: 5200, kind: 'karst', river: 45, clear: 75 },
    ],
    look: {
      hamlet: 'tile', trees: ['round', 'bamboo', 'banyan'], boat: 'sampan', rock: '#8a8a82', rock2: '#a09e94', hill: '#3e6e32', hill2: '#4e7e38',
      paddy: ['#7aac3a', '#90bc48', '#68a036'], mud: '#6a6448', bank: '#7a7a62', lamps: false,
    },
    enemyTint: '#d8ccff',
    boss: { type: 'core', model: 'lan', name: 'KỲ LÂN', sub: 'Linh thú điềm lành bị Thời Ảnh khống chế', hp: 1.0 },
    clearLines: [['su', 'Núi đá Hoa Lư vẫn sừng sững như tường thành. Nhà Đinh đã chọn đất thật giỏi.'], ['au', 'Bay luồn giữa những ngọn núi đá… em thích màn này nhất!'], ['kien', 'Tốt lắm. Năm 1010, Lý Công Uẩn sẽ dời đô ra Thăng Long — đến đó ngay.']],
    script(h) {
      const { say, lm, at } = h;
      say(110, 'kien', 'Năm 968. Hoa Lư, kinh đô của nước Đại Cồ Việt. Cẩn thận — núi đá dày đặc!', { hold: 2.2 });
      say(560, 'su', 'Năm 968, Đinh Bộ Lĩnh dẹp loạn mười hai sứ quân, lên ngôi Hoàng đế, đặt quốc hiệu Đại Cồ Việt.');
      for (const [s, u, hh] of [[900, 70, 140], [1250, -75, 170], [1700, 85, 120], [2050, -70, 150], [4500, 80, 160], [4850, -75, 130], [6200, 70, 150], [6550, -80, 180]]) lm('karst', s, { u: Math.sign(u) * 100, h: hh, r: 32, seed: s });
      lm('cotkinh', 1500, { u: -60 });
      say(1350, 'su', 'Cột đá tám cạnh kia là cột kinh Phật do Nam Việt Vương Đinh Liễn dựng năm 973, khắc kinh Phật Đỉnh Tôn Thắng.');
      lm('hoaluwall', 2700, { u: 0 });
      say(2350, 'su', 'Hoa Lư lấy chính núi đá vôi làm tường thành; chỗ trống giữa các núi được đắp thành đất. Cổng thành ở ngay trước mặt!');
      lm('dendinh', 3300, { u: -230, view: 3500 });
      say(3150, 'su', 'Bên trái là đền thờ vua Đinh Tiên Hoàng. Trước đền còn chiếc sập đá "long sàng".');
      lm('cungvang', 5400, { u: 240, view: 3500 });
      say(5250, 'su', 'Sử chép vua Lê Đại Hành cho dựng điện Bách Bảo Thiên Tuế, cột dát vàng bạc, làm nơi thiết triều.');
      at(2900, () => h.rescue('au'));
      waves(h, this, { v: 24 });
      say(6900, 'dong', 'Có một chiến hạm lớn đang neo giữa hai núi đá. Hạ nó!', { prio: 1 });
    },
  },

  // =================================================================== 4 · LÝ — THĂNG LONG
  {
    id: 4, key: 'thanglong', city: 'THĂNG LONG', country: 'ĐẠI VIỆT · 1010–1225', era: 'Nhà Lý', title: 'RỒNG BAY THĂNG LONG', en: 'THE SOARING DRAGON',
    blurb: 'Năm 1010, Lý Công Uẩn dời đô ra thành Đại La, đặt tên là Thăng Long. Hoàng thành, chùa Một Cột, tháp Báo Thiên, Văn Miếu — và một giao long bóng tối trên Hồ Tây.',
    music: 'stage4', bossAt: 7300, checkpoint: 3900,
    palettes: {
      spring: pal({ zenith: '#2c5cac', mid: '#a6c4e6', horizon: '#ffe0c0', fog: '#e0d4c4', sun: '#fff0d0', sunElev: 26, sunAz: -36, fogDensity: 0.00062, fogHeight: 0.0016, cloudCover: 0.4, waterDeep: '#2a3a34', waterScatter: '#5a6a48' }),
      dusk: pal({ zenith: '#2a3a7a', mid: '#a88aa0', horizon: '#ffae70', fog: '#e0a88a', sun: '#ffb070', sunElev: 6, sunAz: -36, sunLight: 2.3, fogDensity: 0.0007, glow: 0.55, cloudCover: 0.4, bloom: 0.5, waterDeep: '#3a2a30', waterScatter: '#8a5a48' }),
    },
    paletteKeys: [{ at: 0, name: 'spring' }, { at: 4200, name: 'spring' }, { at: 7100, name: 'dusk' }],
    segments: [
      { at: 0, kind: 'fields', river: 110, far: 40, farAt: 900 },
      { at: 2100, kind: 'city', style: 'citadel', density: 0.85 },
      { at: 4300, kind: 'city', style: 'royal', density: 0.8 },
      { at: 6700, kind: 'water', shoreL: 320, shoreR: 300, style: 'citadel' },
    ],
    look: {
      hamlet: 'tile', trees: ['round', 'banyan', 'areca', 'lotus'], ground: '#a8946a', road: '#a07c50', plaza: '#b8a888', park: '#5a8a3a', park2: '#6a9a40',
      walls: ['#e6d8b8', '#d8c8a0', '#c8a878'], roofs: ['#8a4a2a', '#7a3a24', '#9a5a34'], hallRoof: ['#7a3a24', '#8a4a2a'], boat: 'sampan', lamp: 'lantern',
    },
    enemyTint: '#d8ccff',
    boss: { type: 'serpent', model: 'rongly', name: 'RỒNG THĂNG LONG', sub: 'Rồng vàng thời Lý bị bóng tối nuốt chửng', hp: 1.05, turretHp: 10, scale: 1.1 },
    clearLines: [['su', 'Hồ Tây lặng sóng. Kinh thành Thăng Long sẽ đứng vững hơn nghìn năm nữa.'], ['dong', 'Rồng thật thì bay lên. Rồng giả thì phải nằm xuống.'], ['kien', 'Tiếp theo: thời Trần, năm 1288. Chuẩn bị cho một trận thủy chiến.']],
    script(h) {
      const { say, lm } = h;
      say(110, 'kien', 'Năm 1010. Kinh đô vừa dời về Thăng Long. Thời Ảnh muốn xóa nó khỏi bản đồ!', { hold: 2.2 });
      say(560, 'su', 'Chiếu dời đô viết: đất này ở giữa trời đất, thế rồng cuộn hổ ngồi. Tương truyền vua thấy rồng vàng bay lên nên đặt tên Thăng Long.');
      lm('doanmon', 2400, { u: 0 });
      say(2150, 'su', 'Cổng hoàng thành phía trước — bay qua cửa giữa!');
      lm('baothien', 3100, { u: 150, view: 4000 });
      say(2900, 'su', 'Tháp Báo Thiên dựng năm 1057, cao mười hai tầng — một trong "An Nam tứ đại khí", bốn bảo vật lớn của nước ta.');
      lm('motcot', 3700, { u: -130 });
      say(3600, 'su', 'Bên trái: chùa Một Cột, dựng năm 1049 đời Lý Thái Tông — ngôi chùa như bông sen mọc lên giữa hồ.');
      lm('canguyen', 4700, { u: 220, view: 3500 });
      say(4550, 'su', 'Điện chính của hoàng thành. Các nhà khảo cổ đã tìm thấy nền móng cung điện thời Lý ngay dưới lòng Hà Nội ngày nay.');
      lm('vanmieu', 5600, { u: -220, view: 3500 });
      say(5450, 'su', 'Văn Miếu dựng năm 1070. Năm 1076 nhà Lý lập Quốc Tử Giám — trường đại học đầu tiên của nước ta.');
      waves(h, this, { turrets: [[2900, -30, 'aagun'], [2950, 30, 'aagun'], [5200, 0, 'turret']] });
      h.say(7000, 'au', 'Mặt Hồ Tây đang sủi bọt… Có gì đó rất lớn bên dưới!', { prio: 1 });
    },
  },

  // =================================================================== 5 · TRẦN — THIÊN TRƯỜNG · BẠCH ĐẰNG
  {
    id: 5, key: 'bachdang', city: 'THIÊN TRƯỜNG · BẠCH ĐẰNG', country: 'ĐẠI VIỆT · 1225–1400', era: 'Nhà Trần', title: 'SÓNG BẠCH ĐẰNG', en: 'THE BẠCH ĐẰNG TIDE',
    blurb: 'Từ phủ Thiên Trường của các Thái thượng hoàng, qua núi Yên Tử của Thiền phái Trúc Lâm, ra cửa sông Bạch Đằng — nơi những hàng cọc gỗ năm 1288 vẫn chờ con nước rút.',
    music: 'stage5', bossAt: 7400, checkpoint: 3800,
    palettes: {
      day: pal({ zenith: '#2a5aa8', mid: '#9cc0e6', horizon: '#eae4d4', fog: '#ccd4cc', sun: '#fff4e0', sunElev: 30, sunAz: -50, fogDensity: 0.00062, cloudCover: 0.5, waterDeep: '#1e3a40', waterScatter: '#3a6a6a' }),
      storm: pal({ zenith: '#2a3450', mid: '#7a8498', horizon: '#c8b8a0', fog: '#9aa0a0', sun: '#ffe0b0', cloud: '#c8c8cc', cloudShadow: '#4a4a58', sunElev: 12, sunLight: 2.0, fogDensity: 0.0008, cloudCover: 0.8, glow: 0.3, waterDeep: '#18282e', waterScatter: '#2e4e50' }),
    },
    paletteKeys: [{ at: 0, name: 'day' }, { at: 4300, name: 'day' }, { at: 6600, name: 'storm' }],
    segments: [
      { at: 0, kind: 'fields', river: 50, far: 50, farAt: 900 },
      { at: 2400, kind: 'hills', clear: 70, far: 120, farAt: 600 },
      { at: 4200, kind: 'water', islands: true, shoreL: 260, style: 'fields' },
      { at: 5600, kind: 'water', islands: true, style: 'fields' },
    ],
    look: {
      hamlet: 'tile', trees: ['round', 'pine', 'bamboo'], boat: 'junk', boatCols: ['#6a4a30', '#5a3a24', '#7a5a3a'],
      walls: ['#e0d0b0', '#d0bc98'], roofs: ['#8a4a2a', '#7a3a24'], rock: '#7a7468', rock2: '#8a8478', lamps: false,
    },
    enemyTint: '#d8ccff',
    boss: { type: 'warship', model: 'kinhngu', name: 'KÌNH NGƯ', sub: 'Cá Ông — thần hộ biển — bị kéo vào con nước đen', hp: 1.1, turrets: 7 },
    clearLines: [['su', 'Con nước đã rút, quái vật mắc cạn giữa bãi cọc — y như năm 1288!'], ['dong', 'Thắng nhờ hiểu đất, hiểu nước. Bài học ấy không bao giờ cũ.'], ['kien', 'Lạc Hồng, nhảy tới năm 1397: thành đá Tây Đô của nhà Hồ.']],
    script(h) {
      const { say, lm } = h;
      say(110, 'kien', 'Đời Trần. Thời Ảnh đang tụ quân ở cửa sông Bạch Đằng. Bay từ Thiên Trường ra biển!', { hold: 2.2 });
      lm('thientruong', 1200, { u: -230, view: 3500 });
      say(1000, 'su', 'Thiên Trường là nơi các Thái thượng hoàng nhà Trần về ở sau khi nhường ngôi cho con.');
      lm('phominh', 1900, { u: 110 });
      say(1750, 'su', 'Tháp Phổ Minh xây năm 1305 đời Trần Anh Tông: mười bốn tầng, chân tháp bằng đá chạm hoa sen.');
      lm('yentu', 3400, { u: 500, view: 5000, keep: 600 });
      say(3150, 'su', 'Phía xa bên phải là núi Yên Tử — nơi vua Trần Nhân Tông xuất gia, lập Thiền phái Trúc Lâm.');
      lm('thuyentran', 4400, { u: -70, rotY: Math.PI / 2 }); lm('thuyentran', 4550, { u: 80, rotY: Math.PI / 2 });
      lm('baicoc', 5000, { u: 0, seed: 5 });
      say(4750, 'su', 'Năm 1288, Trần Hưng Đạo cho cắm cọc gỗ dưới lòng sông, nhử thuyền giặc Nguyên vào lúc nước lên rồi đánh khi triều rút.');
      say(4950, 'dong', 'Bãi cọc ngay dưới chân. Bay thấp mà luồn cho khéo!');
      lm('baicoc', 6200, { u: 0, seed: 9, w: 300 });
      waves(h, this);
      say(7050, 'su', 'Triều đang dâng… Một thứ gì đó đang theo con nước tiến vào cửa sông!', { prio: 1 });
    },
  },

  // =================================================================== 6 · HỒ — TÂY ĐÔ
  {
    id: 6, key: 'taydo', city: 'TÂY ĐÔ', country: 'ĐẠI NGU · 1400–1407', era: 'Nhà Hồ', title: 'THÀNH ĐÁ TÂY ĐÔ', en: 'THE STONE CITADEL',
    blurb: 'Hồ Quý Ly dựng kinh thành Tây Đô bằng những khối đá xanh khổng lồ chỉ trong ba tháng. Mưa phùn trên đất Thanh Hóa, và một pháo đài bóng tối dưới chân thành.',
    music: 'stage6', bossAt: 7300, checkpoint: 3800, weather: 'rain',
    palettes: {
      rain: pal({ zenith: '#3a4458', mid: '#8a94a4', horizon: '#c0c4c0', fog: '#a4aaa8', sun: '#f0ece0', cloud: '#c8c8cc', cloudShadow: '#5a5a66', hemiSky: '#a8b4c4', sunElev: 28, sunLight: 1.9, fogDensity: 0.0009, fogHeight: 0.002, cloudCover: 0.85, hemi: 1.15, glow: 0.15, waterDeep: '#1e2a2a', waterScatter: '#3a4a44' }),
      break: pal({ zenith: '#3a5a90', mid: '#9aaac0', horizon: '#e8d8bc', fog: '#bcbcb4', sun: '#ffe8c0', sunElev: 14, sunLight: 2.4, fogDensity: 0.0007, cloudCover: 0.6, glow: 0.35, waterDeep: '#1e2a2a', waterScatter: '#3a4a44' }),
    },
    paletteKeys: [{ at: 0, name: 'rain' }, { at: 4500, name: 'rain' }, { at: 7000, name: 'break' }],
    segments: [
      { at: 0, kind: 'fields', river: 50, far: 110, farAt: 700 },
      { at: 2200, kind: 'hills', clear: 75, far: 90, farAt: 700 },
      { at: 3300, kind: 'city', style: 'citadel', density: 0.75 },
      { at: 5600, kind: 'hills', clear: 80 },
    ],
    look: {
      hamlet: 'tile', trees: ['round', 'bamboo', 'pine'], ground: '#8a8270', road: '#8a7454', plaza: '#8a8a80', park: '#4a7a36', park2: '#5a8a3c',
      walls: ['#cfc6b0', '#bcb49c'], roofs: ['#6a4430', '#5a3a2a'], hill: '#3f6a34', hill2: '#4a7a3a', lamps: false,
    },
    enemyTint: '#d8ccff',
    boss: { type: 'core', model: 'nghe', name: 'NGHÊ ĐÁ', sub: 'Linh thú canh giữ cổng thành Tây Đô bị hóa đá đen', hp: 1.1 },
    clearLines: [['su', 'Sáu trăm năm sau, những khối đá ấy vẫn khít đến mức không lọt lưỡi dao. Di sản thế giới đấy!'], ['dong', 'Mưa tạnh rồi. Trời Thanh Hóa sáng lên đẹp lắm.'], ['kien', 'Tiếp theo: thời Lê sơ, triều đại của Lê Lợi và Lê Thánh Tông.']],
    script(h) {
      const { say, lm, at } = h;
      say(110, 'kien', 'Năm 1397, Thanh Hóa. Kinh thành Tây Đô của nhà Hồ. Mưa lớn — chú ý tầm nhìn!', { hold: 2.2 });
      say(600, 'su', 'Thành Tây Đô do Hồ Quý Ly cho xây năm 1397, chỉ trong khoảng ba tháng!');
      lm('taydo', 3500, { u: 0 });
      say(3050, 'su', 'Cổng Nam đây rồi! Tường thành ghép bằng những khối đá xanh lớn, có khối nặng hơn chục tấn, không hề dùng vữa.');
      say(3300, 'dong', 'Cửa giữa đủ rộng. Giữ thẳng hướng mà bay qua!');
      lm('namgiao', 4700, { u: -260, view: 3500 });
      say(4550, 'su', 'Bên trái là đàn Nam Giao nhà Hồ, dựng năm 1402 — nơi vua tế trời đất cầu cho quốc thái dân an.');
      say(5600, 'su', 'Năm 2011, Thành nhà Hồ được UNESCO công nhận là Di sản Văn hóa Thế giới.');
      at(2600, () => h.rescue('dong'));
      waves(h, this, { turrets: [[4000, -30, 'aagun'], [4050, 30, 'aagun'], [4900, 0, 'turret'], [5300, 24, 'aagun']] });
      say(6950, 'au', 'Có tín hiệu năng lượng cực mạnh dưới chân núi!', { prio: 1 });
    },
  },

  // =================================================================== 7 · LÊ SƠ — LAM KINH · ĐÔNG KINH
  {
    id: 7, key: 'hongduc', city: 'LAM KINH · ĐÔNG KINH', country: 'ĐẠI VIỆT · 1428–1527', era: 'Nhà Hậu Lê', title: 'THỜI HỒNG ĐỨC', en: 'THE HỒNG ĐỨC ERA',
    blurb: 'Lê Lợi đánh đuổi giặc Minh, trả gươm thần trên hồ Lục Thủy. Từ Lam Kinh quê nhà bay về Đông Kinh thời Lê Thánh Tông — điện Kính Thiên, hồ Gươm và vườn bia tiến sĩ.',
    music: 'stage7', bossAt: 7300, checkpoint: 3900,
    palettes: {
      day: pal({ zenith: '#2860b0', mid: '#9ec4ea', horizon: '#fff0d4', fog: '#dcd8c8', sun: '#fff4dc', sunElev: 34, sunAz: -44, sunLight: 2.9, fogDensity: 0.0006, cloudCover: 0.4, waterDeep: '#1e3a3a', waterScatter: '#3a6a5a' }),
      evening: pal({ zenith: '#26407e', mid: '#9a9ab4', horizon: '#ffc890', fog: '#e0b898', sun: '#ffc080', sunElev: 8, sunAz: -44, sunLight: 2.4, fogDensity: 0.00068, glow: 0.5, cloudCover: 0.42, waterDeep: '#2a2a34', waterScatter: '#6a5a50' }),
    },
    paletteKeys: [{ at: 0, name: 'day' }, { at: 4000, name: 'day' }, { at: 7000, name: 'evening' }],
    segments: [
      { at: 0, kind: 'hills', clear: 80, far: 80, farAt: 700 },
      { at: 1900, kind: 'fields', river: 60, far: 40, farAt: 900 },
      { at: 2900, kind: 'city', style: 'citadel', density: 0.9 },
      { at: 3500, kind: 'water', shoreL: 140, shoreR: 150, style: 'citadel' },
      { at: 4300, kind: 'city', style: 'royal', density: 0.85 },
      { at: 6100, kind: 'city', style: 'citadel', density: 0.9 },
    ],
    look: {
      hamlet: 'tile', trees: ['round', 'banyan', 'areca'], ground: '#a8946a', road: '#a07c50', plaza: '#b8a888', park: '#5a8a3a', park2: '#6a9a40',
      walls: ['#e6d8b8', '#d8c8a0', '#e8d0a0'], roofs: ['#8a4a2a', '#7a3a24', '#6a3a28'], hallRoof: ['#8a4a2a', '#a06030'], boat: 'sampan', lamp: 'lantern',
    },
    enemyTint: '#d8ccff',
    boss: { type: 'core', model: 'phuong', name: 'PHƯỢNG HOÀNG', sub: 'Chim thần của điện Kính Thiên mất ngọn lửa thiêng', hp: 1.15 },
    clearLines: [['su', 'Tám mươi hai tấm bia tiến sĩ vẫn còn nguyên — giờ là Di sản tư liệu thế giới.'], ['au', 'Thấy rùa vàng nhô lên giữa hồ… em nổi da gà luôn!'], ['kien', 'Lạc Hồng, nhảy tới thế kỷ XVII: những thương cảng sầm uất nhất xứ Đàng Ngoài và Đàng Trong.']],
    script(h) {
      const { say, lm } = h;
      say(110, 'kien', 'Đầu thời Lê sơ. Thời Ảnh tấn công cả Lam Kinh lẫn kinh thành. Xuất kích!', { hold: 2.2 });
      lm('lamkinh', 900, { u: 260, view: 3500 });
      say(700, 'su', 'Lam Kinh — quê hương của Lê Lợi, nơi đặt lăng mộ các vua Lê. Bậc thềm điện chạm chín con rồng.');
      say(1700, 'su', 'Năm 1428, sau mười năm khởi nghĩa Lam Sơn, Lê Lợi lên ngôi và đặt kinh đô ở Thăng Long, đổi tên là Đông Kinh.');
      lm('ruathan', 3900, { u: 70 });
      say(3600, 'su', 'Hồ Lục Thủy! Tương truyền rùa vàng nổi lên đòi lại thanh gươm báu, từ đó hồ mang tên Hoàn Kiếm.');
      say(3950, 'au', 'Rùa thần kìa! Đừng bắn trúng nhé mọi người!');
      lm('kinhthien', 4800, { u: -230, view: 3500 });
      say(4650, 'su', 'Điện Kính Thiên — thềm điện còn đôi rồng đá chạm năm 1467, đời Lê Thánh Tông.');
      lm('biatiensi', 5700, { u: 200, view: 3500 });
      say(5550, 'su', 'Năm 1484, Lê Thánh Tông cho dựng bia tiến sĩ ở Văn Miếu, ghi tên người đỗ đạt để khuyến khích việc học.');
      say(6300, 'su', 'Thời Hồng Đức còn có Bộ luật Hồng Đức và tập bản đồ Hồng Đức — bản đồ toàn quốc đầu tiên.');
      waves(h, this, { turrets: [[3100, -28, 'aagun'], [3150, 28, 'aagun'], [5000, 0, 'turret'], [6400, -20, 'aagun']] });
      say(6950, 'dong', 'Chiến hạm lớn trên kinh thành! Đội hình tấn công!', { prio: 1 });
    },
  },

  // =================================================================== 8 · THƯƠNG CẢNG — PHỐ HIẾN · HỘI AN
  {
    id: 8, key: 'hoian', city: 'PHỐ HIẾN · HỘI AN', country: 'THẾ KỶ XVI–XVII', era: 'Thời thương cảng', title: 'ĐÊM PHỐ CỔ', en: 'LANTERN HARBOURS',
    blurb: '"Thứ nhất kinh kỳ, thứ nhì Phố Hiến." Thương thuyền Nhật, Hoa, Hà Lan cập bến; đêm Hội An lung linh đèn lồng bên chùa Cầu. Một con thuyền ma đang tiến vào cửa biển.',
    music: 'stage8', bossAt: 7300, checkpoint: 3800, weather: 'lanterns',
    palettes: {
      dusk: pal({ zenith: '#26306a', mid: '#8a7aa0', horizon: '#ff9a60', fog: '#c88a78', sun: '#ffa060', sunElev: 3, sunAz: 20, sunLight: 1.8, fogDensity: 0.0007, glow: 0.6, cloudCover: 0.35, night: 0.45, bloom: 0.55, waterDeep: '#1a1a30', waterScatter: '#5a3a48' }),
      night: pal({ ...NIGHT, horizon: '#5a3a5a', fog: '#2a1e3a', waterDeep: '#0a0c1e', waterScatter: '#3a2a3a' }),
    },
    paletteKeys: [{ at: 0, name: 'dusk' }, { at: 2200, name: 'dusk' }, { at: 4200, name: 'night' }],
    segments: [
      { at: 0, kind: 'water', shoreL: 120, shoreR: 130, style: 'phoco' },
      { at: 2400, kind: 'water', shoreL: 110, shoreR: 110, style: 'phoco' },
      { at: 5000, kind: 'water', shoreL: 150, shoreR: 160, style: 'phoco' },
      { at: 6500, kind: 'water', islands: true, style: 'fields' },
    ],
    look: {
      trees: ['round', 'areca', 'banyan'], ground: '#9a8a70', road: '#7a6a54', plaza: '#a08a6a', park: '#4a7a36', park2: '#5a8a3c', bank: '#7a6a54',
      walls: ['#e8c050', '#f0cc60', '#e0b040', '#d8b858'], roofs: ['#6a4430', '#5a3a28', '#7a4a30'], boat: 'junk', boatCols: ['#8a4a2a', '#5a3a24', '#a83a2a'], lamp: 'lantern',
    },
    enemyTint: '#e0d0ff',
    boss: { type: 'warship', model: 'cachep', name: 'CÁ CHÉP HÓA RỒNG', sub: 'Cá chép vượt Vũ Môn bị bóng tối giam giữa cửa biển', hp: 1.2, turrets: 7 },
    clearLines: [['su', 'Đèn lồng vẫn sáng khắp phố. Hội An được UNESCO công nhận là Di sản thế giới năm 1999 đấy.'], ['au', 'Lần sau đến đây em phải đi bộ qua chùa Cầu mới được!'], ['kien', 'Lạc Hồng, nhảy tới cuối thế kỷ XVIII: thời Tây Sơn.']],
    script(h) {
      const { say, lm, at } = h;
      say(110, 'kien', 'Thế kỷ XVII. Các thương cảng đang đông vui nhất. Thời Ảnh định đốt rụi chúng!', { hold: 2.2 });
      say(560, 'su', '"Thứ nhất kinh kỳ, thứ nhì Phố Hiến." Phố Hiến từng là thương cảng sầm uất nhất Đàng Ngoài.');
      lm('xichdang', 1100, { u: -200, view: 3500 });
      lm('galleon', 1500, { u: 85 });
      say(1400, 'su', 'Tàu buồm kia của Công ty Đông Ấn Hà Lan. Thương nhân Hà Lan từng đặt thương điếm ngay ở Phố Hiến.');
      lm('chauan', 2300, { u: -80 });
      say(2200, 'su', '"Châu ấn thuyền" — thuyền buôn Nhật Bản mang giấy phép đóng dấu son, sang buôn bán ở Hội An.');
      for (const s of [2700, 3000, 4100, 4400]) { lm('phohoian', s, { u: -95, seed: s }); lm('phohoian', s + 120, { u: 95, seed: s + 7, rotY: Math.PI }); }
      lm('chuacau', 3600, { u: 0 });
      say(3300, 'su', 'Chùa Cầu! Cây cầu có mái do thương nhân Nhật dựng khoảng đầu thế kỷ XVII, nối phố Nhật với phố Hoa. Bay qua gầm cầu!');
      lm('hoiquan', 4800, { u: 170, view: 3500 });
      say(4650, 'su', 'Hội quán Phúc Kiến — nơi thương nhân người Hoa họp mặt và thờ Thiên Hậu.');
      lm('chauan', 5600, { u: 90 }); lm('galleon', 6100, { u: -100 });
      at(3000, () => h.rescue('su'));
      waves(h, this, { v: 20 });
      say(6950, 'dong', 'Một con thuyền đen như mực đang lừng lững tiến vào cửa biển!', { prio: 1 });
    },
  },

  // =================================================================== 9 · TÂY SƠN
  {
    id: 9, key: 'tayson', city: 'QUY NHƠN → THĂNG LONG', country: 'ĐẠI VIỆT · 1771–1802', era: 'Nhà Tây Sơn', title: 'THẦN TỐC XUÂN KỶ DẬU', en: 'THE LIGHTNING MARCH',
    blurb: 'Từ Hoàng Đế thành và những tháp Chăm ở Bình Định, theo đoàn quân thần tốc của Quang Trung ra Bắc, tới Thăng Long mùa xuân Kỷ Dậu 1789 khi hoa đào còn nở.',
    music: 'stage9', bossAt: 7300, checkpoint: 3800, weather: 'petals',
    palettes: {
      coast: pal({ zenith: '#2860b0', mid: '#98c4ea', horizon: '#f4ecd8', fog: '#d4d8cc', sun: '#fff4dc', sunElev: 36, sunAz: -60, sunLight: 2.9, fogDensity: 0.0006, cloudCover: 0.4, waterDeep: '#0e3a50', waterScatter: '#1e7a80' }),
      spring: pal({ zenith: '#3a5aa0', mid: '#b4bcd4', horizon: '#ffd8c4', fog: '#e8d0c8', sun: '#ffe0c0', sunElev: 14, sunAz: -30, sunLight: 2.5, fogDensity: 0.0007, fogHeight: 0.002, glow: 0.4, cloudCover: 0.45, waterDeep: '#2a3a36', waterScatter: '#5a6a4a' }),
    },
    paletteKeys: [{ at: 0, name: 'coast' }, { at: 3000, name: 'coast' }, { at: 5200, name: 'spring' }],
    segments: [
      { at: 0, kind: 'water', shoreL: 300, shoreR: 140, islands: true, style: 'fields' },
      { at: 1900, kind: 'fields', far: 90, farAt: 700 },
      { at: 3900, kind: 'hills', clear: 80, far: 60, farAt: 800 },
      { at: 5300, kind: 'fields', river: 50, far: 40, farAt: 900 },
      { at: 6500, kind: 'city', style: 'citadel', density: 0.8 },
    ],
    look: {
      hamlet: 'tile', trees: ['round', 'peach', 'areca', 'peach'], ground: '#a8946a', road: '#a07c50', plaza: '#b8a888', park: '#5a8a3a', park2: '#6a9a40',
      walls: ['#e6d8b8', '#d8c8a0'], roofs: ['#8a4a2a', '#7a3a24'], boat: 'junk', lamp: 'lantern', paddy: ['#86b844', '#9ac04c', '#78aa3e'],
    },
    enemyTint: '#d8ccff',
    boss: { type: 'core', model: 'voi', name: 'VOI CHIẾN', sub: 'Voi chiến Tây Sơn bị Thời Ảnh điều khiển', hp: 1.2 },
    clearLines: [['su', 'Mùng 5 Tết Kỷ Dậu, Quang Trung vào Thăng Long. Hoa đào vẫn nở — ta đã giữ được mùa xuân ấy.'], ['dong', 'Hành quân thần tốc… Cả phi đội cũng phải học cái tinh thần đó.'], ['kien', 'Trận cuối, Lạc Hồng: Kinh thành Huế triều Nguyễn. Thời Ảnh dồn toàn lực ở đó.']],
    script(h) {
      const { say, lm } = h;
      say(110, 'kien', 'Cuối thế kỷ XVIII. Nhà Tây Sơn khởi nghiệp từ đất Bình Định. Thời Ảnh muốn chặn đứng cuộc hành quân!', { hold: 2.2 });
      lm('thapdoi', 1000, { u: -170 });
      say(850, 'su', 'Tháp Đôi Quy Nhơn — kiến trúc Chăm Pa thế kỷ XII, mái cong lạ mắt khác hẳn các tháp Chăm khác.');
      lm('hoangde', 2300, { u: 0 });
      say(1950, 'su', 'Hoàng Đế thành — kinh đô của Thái Đức Hoàng đế Nguyễn Nhạc, xây trên nền thành Đồ Bàn xưa của Chăm Pa.');
      lm('canhtien', 2800, { u: 120 });
      say(2750, 'su', 'Bên phải là tháp Cánh Tiên, ngay giữa lòng thành.');
      lm('voichien', 3500, { u: -170 });
      say(3350, 'su', 'Voi chiến là sức mạnh nổi tiếng của quân Tây Sơn.');
      say(4200, 'su', 'Cuối năm 1788, Nguyễn Huệ lên ngôi Hoàng đế Quang Trung ở Phú Xuân, rồi tiến quân thần tốc ra Bắc.');
      say(5300, 'au', 'Hoa đào nở khắp nơi rồi! Tết đến thật rồi!');
      lm('dongda', 6000, { u: 190, view: 3500 });
      say(5850, 'su', 'Mùng 5 Tết Kỷ Dậu năm 1789, Quang Trung đại thắng ở Ngọc Hồi – Đống Đa, giải phóng Thăng Long.');
      waves(h, this, { v: 22 });
      say(6950, 'dong', 'Một pháo đài bóng tối chắn ngay cửa ngõ Thăng Long. Mở đường!', { prio: 1 });
    },
  },

  // =================================================================== 10 · NGUYỄN — HUẾ
  {
    id: 10, key: 'hue', city: 'PHÚ XUÂN · HUẾ', country: 'ĐẠI NAM · 1802–1945', era: 'Nhà Nguyễn', title: 'HOÀNG HÔN KINH THÀNH', en: 'THE IMPERIAL CITY', final: true,
    blurb: 'Kinh thành Huế bên dòng sông Hương: chùa Thiên Mụ, Kỳ Đài, Ngọ Môn, điện Thái Hòa, Cửu Đỉnh và lăng Minh Mạng. Thời Ảnh dồn toàn lực cho trận cuối cùng.',
    music: 'stage10', bossAt: 7500, checkpoint: 4000, weather: 'petals',
    palettes: {
      afternoon: pal({ zenith: '#2a5aa8', mid: '#a0bede', horizon: '#ffe0b8', fog: '#e0d0bc', sun: '#ffe8c0', sunElev: 18, sunAz: -60, fogDensity: 0.00062, cloudCover: 0.42, waterDeep: '#183a3a', waterScatter: '#3a6a5a' }),
      sunset: pal({ zenith: '#2a3478', mid: '#b07a88', horizon: '#ff8a4a', fog: '#c87a6a', sun: '#ffa060', cloud: '#ffb8a0', cloudShadow: '#6a4a6a', sunElev: 4, sunAz: -60, sunLight: 2.1, glow: 0.65, fogDensity: 0.0007, cloudCover: 0.45, bloom: 0.6, night: 0.35, waterDeep: '#1a1a36', waterScatter: '#6a3a50' }),
    },
    paletteKeys: [{ at: 0, name: 'afternoon' }, { at: 3200, name: 'afternoon' }, { at: 6600, name: 'sunset' }],
    segments: [
      { at: 0, kind: 'water', shoreL: 110, shoreR: 120, style: 'citadel' },
      { at: 2000, kind: 'city', style: 'citadel', river: 0, density: 0.85 },
      { at: 3300, kind: 'city', style: 'royal', density: 0.8 },
      { at: 5300, kind: 'hills', clear: 80, far: 80, farAt: 700 },
      { at: 6600, kind: 'water', shoreL: 260, shoreR: 240, style: 'fields' },
    ],
    look: {
      hamlet: 'tile', trees: ['round', 'pine', 'areca', 'banyan'], ground: '#a09482', road: '#a07c50', plaza: '#b4a890', park: '#4a7a36', park2: '#5a8a3c',
      walls: ['#ece0c4', '#e0d0a8', '#d8c8a0'], roofs: ['#8a4a2a', '#c8a032', '#3a6a4a'], hallRoof: ['#d8b03a', '#c8a032'], boat: 'sampan', lamp: 'lantern',
    },
    enemyTint: '#e0c8ff',
    boss: { type: 'serpent', model: 'haclong', name: 'HẮC LONG THỜI ẢNH', sub: 'Thời Ảnh hiện nguyên hình, quấn lấy rồng vàng kinh thành', hp: 1.5, turretHp: 13, scale: 1.3, final: true },
    clearLines: [['su', 'Từ Văn Lang đến Huế… nghìn năm lịch sử vẫn nguyên vẹn. Chúng ta đã giữ được tất cả!'], ['au', 'Hoàng hôn trên sông Hương… đẹp nhất trong mười màn luôn!'], ['dong', 'Nghìn năm văn hiến. Bay qua rồi mới thấy hết.'], ['kien', 'Nhiệm vụ hoàn thành, Lạc Hồng. Về nhà thôi.']],
    script(h) {
      const { say, lm } = h;
      say(110, 'kien', 'Huế, đời Minh Mạng. Toàn bộ quân đoàn Thời Ảnh đang hội tụ ở đây. Trận quyết định!', { hold: 2.4 });
      lm('thienmu', 900, { u: -190 });
      say(750, 'su', 'Chùa Thiên Mụ bên sông Hương. Tháp Phước Duyên bảy tầng do vua Thiệu Trị cho xây năm 1844.');
      lm('thuyenrong', 1300, { u: 65 }); lm('thuyenrong', 1650, { u: -60 });
      lm('kinhthanh', 2300, { u: 0 });
      say(2000, 'su', 'Kinh thành Huế khởi công năm 1805 đời Gia Long, chu vi gần mười cây số, có mười cửa chính. Bay qua cổng!');
      lm('kydai', 2900, { u: 120 });
      say(2800, 'su', 'Kỳ Đài — cột cờ của kinh thành, ba tầng đài gạch cao sừng sững.');
      lm('ngomon', 3700, { u: 0 });
      say(3400, 'su', 'Ngọ Môn hoàn thành năm 1833 đời Minh Mạng. Lầu Ngũ Phụng trên cổng có chín bộ mái. Cửa giữa xưa chỉ dành cho vua!');
      say(3650, 'au', 'Hôm nay vua cho phép Lạc Hồng đi cửa giữa nhé!');
      lm('thaihoa', 4300, { u: -190, view: 3500 });
      say(4200, 'su', 'Điện Thái Hòa, nơi diễn ra các buổi đại triều. Mái điện kiểu "trùng thiềm điệp ốc" — hai tầng mái chồng lên nhau.');
      lm('hienlam', 4900, { u: 190, view: 3500 });
      say(4800, 'su', 'Hiển Lâm Các và Cửu Đỉnh — chín chiếc đỉnh đồng đúc năm 1835 đến 1837, khắc 162 hình ảnh non sông đất nước.');
      lm('minhmang', 6100, { u: -260, view: 4000 });
      say(5900, 'su', 'Lăng Minh Mạng: Minh Lâu soi bóng xuống hồ Tân Nguyệt. Năm 1993, Cố đô Huế trở thành di sản thế giới đầu tiên của Việt Nam.');
      waves(h, this, { turrets: [[2700, -28, 'aagun'], [2750, 28, 'aagun'], [4100, 0, 'turret'], [4600, -24, 'aagun'], [4650, 24, 'aagun']] });
      say(7200, 'thoianh', 'NGHÌN NĂM… CHỈ LÀ MỘT KHOẢNH KHẮC. TA SẼ XÓA SẠCH TẤT CẢ.', { prio: 2 });
    },
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));
