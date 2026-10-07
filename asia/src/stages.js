// SKYLINE ASIA — the ten missions. Each stage defines its sky (palettes), ground (segments + look),
// landmarks, enemy script, radio lines and boss. Distances are rail metres (the rail advances ~100 m/s).
//
// Segment kinds (see world.js): fields (rice paddies / farmland), city (street grid + buildings),
// water (sea / bay / lake with optional shores), mountain (valley corridor between ridges).
// Common segment options: river (half-width of a river channel along the path), far (height of
// distant hills), style (modern | mixed | old | palace | low), hmul (building height multiplier),
// density (0..1), shoreL / shoreR (distance to the land on each side of a water segment), islands.

// ------------------------------------------------------------ palette presets
const BASE = {
  zenith: '#2a58a6', mid: '#9dc0e8', horizon: '#ffc38c', fog: '#f0b88f', sun: '#ffd6a0', cloud: '#fff1e2', cloudShadow: '#a08aa6',
  hemiSky: '#a8c2ee', hemiGround: '#6d5242', waterDeep: '#0b3550', waterScatter: '#1d6a70', light: '#ffd9ae',
  sunElev: 11, sunAz: -38, sunDisc: 10, sunLight: 2.7, fogDensity: 0.0007, fogStart: 220, fogHeight: 0.0009, fogFalloff: 0.016,
  glow: 0.34, cloudCover: 0.36, hemi: 1.0, stars: 0, exposure: 0.92, bloom: 0.42, env: 0.85, night: 0,
};
const pal = (o) => ({ ...BASE, ...o });
const NIGHT = {
  zenith: '#040818', mid: '#0e1a44', horizon: '#46387a', fog: '#1c1a44', sun: '#b8ccff', cloud: '#6a6a9a', cloudShadow: '#181830',
  hemiSky: '#5a6ab0', hemiGround: '#2a2234', waterDeep: '#040a1e', waterScatter: '#18285a', light: '#a8bcff',
  sunElev: 32, sunAz: 24, sunDisc: 2.5, sunLight: 0.75, fogDensity: 0.00058, fogStart: 240, fogHeight: 0.0008, fogFalloff: 0.012,
  glow: 0.12, cloudCover: 0.22, hemi: 1.0, stars: 0.9, exposure: 1.1, bloom: 0.6, env: 0.55, night: 1,
};

const K = (k) => `<kbd>${k}</kbd>`;

export const STAGES = [
  // =================================================================== 1 · HÀ NỘI
  {
    id: 1, key: 'hanoi', city: 'HÀ NỘI', country: 'VIỆT NAM', title: 'BÌNH MINH SÔNG HỒNG', en: 'RED RIVER DAWN',
    blurb: 'Sương sớm trên sông Hồng. Bay dưới gầm cầu Long Biên, ngang Hồ Gươm, rồi chặn mãng xà cơ khí trên Hồ Tây.',
    music: 'stage1', bossAt: 7300, checkpoint: 3900,
    palettes: {
      dawn: pal({ zenith: '#34589a', mid: '#a9b9da', horizon: '#ffc9a2', fog: '#e9c3b3', sun: '#ffd0a0', cloud: '#fff0e8', cloudShadow: '#a890a8', hemiSky: '#b8c8ee', hemiGround: '#6a5a4a', waterDeep: '#3a3226', waterScatter: '#7a5a3a', light: '#ffdab8', sunElev: 7, sunAz: -28, sunLight: 2.4, fogDensity: 0.00075, fogHeight: 0.0035, fogFalloff: 0.035, glow: 0.42, cloudCover: 0.32, bloom: 0.46 }),
      morning: pal({ zenith: '#2f62b0', mid: '#a6c6ea', horizon: '#ffe0bc', fog: '#e6d6c4', sun: '#fff0d0', cloud: '#ffffff', cloudShadow: '#a8a8c0', hemiSky: '#b8d0f4', hemiGround: '#6a5a46', waterDeep: '#2e3a3a', waterScatter: '#56664a', light: '#fff0d8', sunElev: 20, sunAz: -34, sunLight: 2.8, fogDensity: 0.00062, fogHeight: 0.0012, fogFalloff: 0.02, glow: 0.28, cloudCover: 0.38 }),
    },
    paletteKeys: [{ at: 0, name: 'dawn' }, { at: 3200, name: 'dawn' }, { at: 5600, name: 'morning' }],
    segments: [
      { at: 0, kind: 'fields', river: 72, far: 70, farAt: 900 },
      { at: 2700, kind: 'city', style: 'old', river: 0, density: 0.9 },
      { at: 3450, kind: 'city', style: 'mixed', river: 125 },
      { at: 4150, kind: 'city', style: 'mixed' },
      { at: 5100, kind: 'city', style: 'modern', hmul: 1.1 },
      { at: 6800, kind: 'water', shoreL: 300, shoreR: 280, style: 'mixed' },
    ],
    look: {
      ground: '#9a9284', bldg: ['#e8c870', '#eeeae0', '#d8d0c0', '#c8a878', '#e0b860', '#b8b0a0'], roofs: ['#a84a2a', '#8a3a24', '#b85a34'],
      paddy: ['#6fa83a', '#86b844', '#5c9636', '#a3c45a'], bank: '#8a7a64', mud: '#7a6448', tree: 'round', hallRoof: ['#8a4a2a', '#5a4a3a'],
    },
    enemyTint: '#ffffff',
    boss: { type: 'serpent', name: 'LONG XÀ-01', sub: 'Mãng xà cơ khí', palette: { armor: '#2f3a52', plate: '#4a5a7a', trim: '#c89a3a', eye: '#ff2238', seam: '#2affd2', belly: '#20283a', membrane: '#8a2436' }, hp: 1, turretHp: 9, scale: 1 },
    clearLines: [['bong', 'Hồ Tây yên bình trở lại rồi! Đẹp quá đi mất!'], ['thach', 'Mở màn không tệ. Chuyến này còn dài đấy.'], ['ho', 'Hà Nội đã an toàn. Phi đội Rồng, chuẩn bị bay về phương Nam!']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(110, 'ho', 'Đây là Tướng Hổ. Quân đoàn Hắc Vân đã tràn vào bầu trời châu Á. Phi đội Rồng — xuất kích, giải phóng Hà Nội!', { hold: 2.4 });
      say(560, 'bong', 'Rõ! Đội trưởng cứ bay trước, Bông bám sát phía sau nhé!');
      at(330, () => h.tip(`${K('W')}${K('A')}${K('S')}${K('D')} / phím mũi tên: di chuyển　${K('J')} / ${K('Space')}: bắn`, 6, 'Kéo góc trái dưới để di chuyển ／ FIRE để bắn'));
      at(640, () => h.rear());
      at(700, () => h.vWing('dart', 5, 760, 20, { noFire: true }));
      say(820, 'thach', 'Địch phía trước. Bình tĩnh, hạ từng chiếc một.');
      ring(1150, 0, 22);
      say(980, 'lam', 'Vòng sáng phía trước giúp hồi khiên đấy, Rồng 1.');
      at(1250, () => h.snake('dart', 5, 720, 18, 20));
      at(1700, () => { h.fromBehind('dart', 6); h.radio('bong', 'Có đứa vòng ra sau! Để chúng vượt lên rồi bắn!', { prio: 1 }); });
      say(1950, 'lam', 'Cầu Long Biên phía trước — hơn trăm năm tuổi. Bay qua gầm cầu, đừng để xước một thanh sắt nào!', { prio: 1 });
      lm('longbien', 2250, {});
      ring(2250, 0, 9);
      at(2100, () => h.crossing('dart', 5, 230, 1, 30));
      at(2450, () => { h.holders('raptor', 2, 170); h.radio('thach', 'Đạn địch có thể gạt đi bằng cách lộn vòng. Nhấn nghiêng hai lần thật nhanh!', { prio: 1 }); h.tip(`${K('Q')} / ${K('E')} nhấn nhanh 2 lần: lộn vòng (gạt đạn)`, 7, 'ROLL nhấn 2 lần: lộn vòng (gạt đạn)'); });
      at(2950, () => h.rescue('bong'));
      at(3150, () => { h.ringOf('drone', 8, 190, { r: 20 }); h.radio('lam', 'Giữ nút bắn để nạp đạn, khóa mục tiêu rồi thả ra — nổ cả chùm!', { prio: 1 }); h.tip('Giữ nút bắn → nạp đầy rồi thả: đạn khóa mục tiêu', 7, 'Giữ FIRE → thả: đạn khóa mục tiêu'); });
      say(3420, 'lam', 'Hồ Gươm bên dưới. Tháp Rùa ở giữa hồ — bay vòng qua nhé.');
      lm('thaprua', 3720, { u: -18 });
      lm('thehuc', 3980, { u: 62 });
      gold(3720, 26, 14);
      at(3500, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }));
      say(3560, 'bong', 'Cái máy bay vận tải kia chở đồ ngon đấy! Bắn nó đi!');
      check(3900);
      at(4250, () => { h.fromBehind('interceptor', 4, { stay: 5 }); h.tip(`${K('L')} / ${K('Shift')}: tăng tốc　${K('I')} / ${K('V')}: phanh`, 6, 'BOOST / BRAKE để tăng giảm tốc'); });
      lm('cotco', 4500, { u: -130 });
      at(4500, () => h.gunship());
      at(5000, () => h.divers('dart', 4));
      at(5250, () => { h.turret(5650, -30); h.turret(5700, 34); h.turret(5800, 0, { type: 'aagun' }); });
      tower(5400, 26, 105); tower(5560, -24, 85);
      lm('landmark72', 5750, { u: 160, view: 4200 });
      lm('lotte', 6100, { u: -150, view: 4200 });
      say(5450, 'thach', 'Khu nhà cao tầng. Lượn sát giữa các tòa nhà, đừng hoảng.');
      at(5900, () => h.vWing('interceptor', 5, 700, 26, { speed: 34 }));
      gold(6000, -30, 48);
      at(6250, () => h.ringOf('drone', 10, 200, { r: 22, v: 28 }));
      at(6500, () => h.holders('raptor', 2, 180, { v: 30 }));
      ring(6700, 0, 24);
      say(6800, 'thach', 'Ra tới Hồ Tây rồi. Cảnh giác — mặt hồ động mạnh lắm.');
    },
  },

  // =================================================================== 2 · BANGKOK
  {
    id: 2, key: 'bangkok', city: 'BANGKOK', country: 'THÁI LAN', title: 'DÒNG CHAO PHRAYA', en: 'RIVER OF KINGS',
    blurb: 'Chiều vàng trên dòng Chao Phraya. Lướt qua Wat Arun và Hoàng cung, chui gầm cầu Rama VIII.',
    music: 'stage2', bossAt: 7300, checkpoint: 3800,
    palettes: {
      gold: pal({ zenith: '#2c5aa8', mid: '#9ec0e6', horizon: '#ffd59a', fog: '#e9c99a', sun: '#ffe0a8', cloud: '#fff4e4', cloudShadow: '#b09a90', hemiSky: '#b4ccf0', hemiGround: '#7a6040', waterDeep: '#3a3420', waterScatter: '#80703a', light: '#ffe2b0', sunElev: 22, sunAz: -40, sunLight: 2.9, fogDensity: 0.0006, cloudCover: 0.42, glow: 0.3 }),
      late: pal({ zenith: '#2a4f9a', mid: '#a8b8de', horizon: '#ffb070', fog: '#eaae80', sun: '#ffc888', cloud: '#ffe6d0', cloudShadow: '#a8848e', hemiGround: '#7a5038', waterDeep: '#2e2a20', waterScatter: '#80603a', light: '#ffcf98', sunElev: 10, sunAz: -36, sunLight: 2.6, glow: 0.42 }),
    },
    paletteKeys: [{ at: 0, name: 'gold' }, { at: 4500, name: 'gold' }, { at: 7000, name: 'late' }],
    segments: [
      { at: 0, kind: 'fields', river: 90, far: 0 },
      { at: 1500, kind: 'city', style: 'old', river: 92 },
      { at: 3200, kind: 'city', style: 'mixed', river: 92 },
      { at: 4300, kind: 'city', style: 'modern', river: 92, hmul: 1.15 },
      { at: 6600, kind: 'city', style: 'mixed', river: 200 },
    ],
    look: {
      ground: '#a39a88', bldg: ['#f2eee6', '#e8e0d0', '#d8d4cc', '#c8c0b0', '#a8b8c8', '#e8d8b8'], roofs: ['#c45a22', '#2f7a4a', '#a83a2a'], hallRoof: ['#c45a22', '#2f7a4a', '#d89a2a'],
      paddy: ['#7ab03a', '#94c044', '#68a034', '#b2c85a'], bank: '#8a7e66', mud: '#806a48', tree: 'palm',
    },
    enemyTint: '#ffe8d0',
    boss: { type: 'serpent', name: 'NAGA-X', sub: 'Rắn thần thép', palette: { armor: '#3a2e1e', plate: '#6a5228', trim: '#e8b830', eye: '#ff3a20', seam: '#ffd23a', belly: '#2a2216', membrane: '#9a3a1a' }, hp: 1.12, turretHp: 10, scale: 1.05 },
    clearLines: [['lam', 'Mục tiêu đã ngừng hoạt động. Dòng sông lại thanh bình.'], ['bong', 'Xong việc rồi đi ăn pad thai được không ạ?'], ['ho', 'Bangkok tự do rồi. Tiếp theo: Kuala Lumpur — có bão lớn, cẩn thận!']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(120, 'ho', 'Bangkok đang bị phong tỏa. Bay dọc sông Chao Phraya, dọn sạch tàu địch trên mặt sông!', { hold: 2.2 });
      say(520, 'bong', 'Nắng vàng đẹp quá! À mà… tập trung, tập trung!');
      at(560, () => h.rear());
      at(650, () => h.vWing('dart', 5, 760, 22));
      at(1050, () => h.snake('dart', 6, 700, -16, 18));
      ring(1300, 0, 18);
      at(1450, () => h.crossing('interceptor', 4, 220, -1, 26));
      at(1800, () => { h.fromBehind('dart', 6); });
      say(2350, 'lam', 'Wat Arun bên trái — ngôi chùa Bình Minh. Tuyệt đối không để đạn lạc trúng!', { prio: 1 });
      lm('watarun', 2700, { u: -175, view: 3500 });
      lm('grandpalace', 3050, { u: 205, view: 3500 });
      at(2500, () => h.holders('raptor', 2, 170, { v: 26 }));
      at(2900, () => h.ringOf('drone', 8, 190, { r: 20 }));
      gold(3000, 30, 12);
      at(3250, () => { h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }); h.snake('dart', 3, 650, -20, 26); });
      say(3400, 'thach', 'Cầu Rama VIII. Chui gầm cầu, sát mặt nước.', { prio: 1 });
      lm('rama8', 3600, {});
      ring(3600, 0, 8);
      check(3800);
      at(4000, () => h.gunship());
      at(4400, () => { h.divers('interceptor', 4); });
      at(4700, () => { h.turret(5100, -40, { type: 'aagun' }); h.turret(5150, 40, { type: 'aagun' }); });
      lm('mahanakhon', 5100, { u: 130, view: 4000 });
      tower(4900, -26, 95); tower(5300, 22, 120);
      at(5200, () => h.vWing('interceptor', 7, 700, 24, { speed: 34 }));
      gate(5600, 0, 30);
      at(5800, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 2, 190, { v: 32 }); });
      say(5900, 'bong', 'Lại phía sau! Sao chúng nó cứ thích đánh lén thế nhỉ!', { prio: 1 });
      ring(6200, 0, 20);
      at(6300, () => h.ringOf('drone', 10, 200, { r: 24, v: 26 }));
      gold(6500, -36, 40);
      at(6700, () => { for (let i = 0; i < 8; i++) h.mine(7000 + i * 30, h.rand(-30, 30), h.rand(10, 40)); h.radio('bong', 'Thủy lôi trên sông! Đừng lại gần!'); });
    },
  },

  // =================================================================== 3 · KUALA LUMPUR
  {
    id: 3, key: 'kl', city: 'KUALA LUMPUR', country: 'MALAYSIA', title: 'THÁP ĐÔI GIỮA BÃO', en: 'TWIN TOWERS STORM',
    blurb: 'Chiều giông nhiệt đới. Luồn giữa Tháp đôi Petronas — qua dưới hoặc trên cầu nối — rồi hạ chiến hạm bão tố.',
    music: 'stage3', bossAt: 7300, checkpoint: 3900, weather: 'rain',
    palettes: {
      storm: pal({ zenith: '#34445e', mid: '#7f8ea6', horizon: '#c8bca8', fog: '#9aa0a8', sun: '#fff0d8', cloud: '#dcdee4', cloudShadow: '#4c5262', hemiSky: '#9aaccc', hemiGround: '#4a4a40', waterDeep: '#1a2a2e', waterScatter: '#3a5450', light: '#e8e8f0', sunElev: 32, sunAz: -20, sunDisc: 2, sunLight: 1.8, fogDensity: 0.00085, fogHeight: 0.0014, fogFalloff: 0.016, glow: 0.12, cloudCover: 0.78, hemi: 1.25, exposure: 1.02, bloom: 0.5 }),
      clearing: pal({ zenith: '#2a3e72', mid: '#9a9cb8', horizon: '#ffb47a', fog: '#c09a88', sun: '#ffc890', cloud: '#ffe0cc', cloudShadow: '#6a5a72', hemiGround: '#5a4a3a', waterDeep: '#1a2438', waterScatter: '#4a4a5a', light: '#ffcfa0', sunElev: 8, sunAz: -30, sunLight: 2.4, glow: 0.5, cloudCover: 0.55, bloom: 0.5 }),
    },
    paletteKeys: [{ at: 0, name: 'storm' }, { at: 5200, name: 'storm' }, { at: 7200, name: 'clearing' }],
    segments: [
      { at: 0, kind: 'fields', far: 130, farAt: 700 },
      { at: 1600, kind: 'city', style: 'mixed', far: 150, farAt: 1100 },
      { at: 2900, kind: 'city', style: 'modern', hmul: 1.3, far: 150, farAt: 1100 },
      { at: 5600, kind: 'city', style: 'mixed', far: 150, farAt: 1100 },
      { at: 6600, kind: 'fields', far: 160, farAt: 700 },
    ],
    look: {
      ground: '#8e8a82', bldg: ['#d8d8d4', '#b8c0c8', '#9aa8b8', '#e8e0d0', '#c8b8a0'], roofs: ['#b04a2a', '#8a3a2a'],
      paddy: ['#4a8a34', '#3e7a2e', '#5a9a3a', '#2f6a2a'], paddyWater: '#5a7a6a', tree: 'palm', dirt: '#7a5a3a',
    },
    enemyTint: '#d8e8ff',
    boss: { type: 'warship', name: 'THUNDERHEAD', sub: 'Chiến hạm bão tố', palette: { hull: '#3a4250', plate: '#5a6474', trim: '#e0b040', glow: '#46e0ff', core: '#46e0ff' }, hp: 1, turrets: 6 },
    clearLines: [['thach', 'Chiến hạm lớn thật. Nhưng rơi cũng nhanh.'], ['lam', 'Mây đang tan dần. Tầm nhìn tốt trở lại.'], ['ho', 'Làm tốt lắm. Singapore đang chìm trong đêm — xuất phát ngay!']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(120, 'ho', 'Kuala Lumpur bị bao phủ bởi mây giông nhân tạo. Hắc Vân giấu thứ gì đó trong cơn bão!', { hold: 2.2 });
      say(560, 'thach', 'Mưa to đấy. Tin vào thiết bị, đừng tin mắt.');
      at(580, () => h.rear());
      at(650, () => h.snake('interceptor', 5, 740, 0, 22));
      at(1000, () => h.vWing('dart', 7, 720, 24));
      ring(1250, -10, 20);
      at(1400, () => h.divers('dart', 4));
      at(1800, () => h.crossing('interceptor', 5, 220, 1, 28));
      at(2100, () => { h.fromBehind('interceptor', 5); h.radio('bong', 'Phía sau! Phía sau!', { prio: 1 }); });
      lm('kltower', 3300, { u: -230, view: 5000 });
      say(2500, 'lam', 'Tháp KL bên trái. Tháp đôi Petronas ngay phía trước!');
      at(2600, () => h.holders('raptor', 2, 170));
      at(3000, () => h.ringOf('drone', 8, 190, { r: 20, v: 30 }));
      gold(3200, 0, 40);
      at(3300, () => { h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }); });
      say(3600, 'lam', 'Bay giữa hai tháp! Qua dưới hoặc trên cầu nối Skybridge đều được — đừng đâm vào!', { prio: 2 });
      lm('petronas', 4000, { u: 0, view: 5200 });
      ring(4000, 0, 30);
      check(3900);
      say(4150, 'bong', 'Wow, chui qua Tháp đôi luôn! Đội trưởng đỉnh quá!');
      at(4300, () => h.gunship());
      at(4700, () => h.vWing('interceptor', 7, 700, 26, { speed: 34 }));
      tower(4900, 24, 130); tower(5100, -28, 110); tower(5350, 10, 90);
      lm('merdeka', 5600, { u: 280, view: 6000 });
      at(5300, () => { h.turret(5700, -34, { type: 'aagun' }); h.turret(5760, 34, { type: 'aagun' }); h.turret(5850, 0); });
      at(5700, () => h.fromBehind('interceptor', 6));
      gate(6000, 0, 30);
      at(6100, () => h.ringOf('drone', 10, 200, { r: 24 }));
      gold(6300, 34, 22);
      at(6400, () => h.holders('raptor', 3, 180, { v: 30 }));
      ring(6800, 0, 26);
      say(6850, 'thach', 'Cơn bão đang dồn lại ở một điểm… Có cái gì đó rất lớn trong mây.');
    },
  },

  // =================================================================== 4 · SINGAPORE
  {
    id: 4, key: 'singapore', city: 'SINGAPORE', country: 'SINGAPORE', title: 'ĐÊM VỊNH MARINA', en: 'MARINA BAY NIGHTS',
    blurb: 'Thành phố đèn neon về đêm. Luồn qua khe Marina Bay Sands, rừng siêu cây phát sáng và vòng quay khổng lồ.',
    music: 'stage4', bossAt: 7300, checkpoint: 3950,
    palettes: {
      night: pal({ ...NIGHT }),
      night2: pal({ ...NIGHT, horizon: '#6a3a8a', fog: '#2a1a4a', waterScatter: '#2a2a6a' }),
    },
    paletteKeys: [{ at: 0, name: 'night' }, { at: 4000, name: 'night' }, { at: 6500, name: 'night2' }],
    segments: [
      { at: 0, kind: 'water', shoreR: 520, islands: true, style: 'modern' },
      { at: 1400, kind: 'city', style: 'modern', hmul: 1.35, density: 0.95 },
      { at: 3150, kind: 'water', shoreL: 200, shoreR: 200, style: 'modern', hmul: 1.2 },
      { at: 4700, kind: 'city', style: 'modern', hmul: 1.25 },
      { at: 6500, kind: 'water', shoreL: 420, islands: true, style: 'modern' },
    ],
    look: {
      ground: '#5a5a62', road: '#202228', bldg: ['#c8d0dc', '#9aaac0', '#7a8aa4', '#e0e4ea', '#a8b8c8'], neon: true, tree: 'palm',
      park: '#2f5a3a', park2: '#3a6a42', bank: '#6a6a70', neonCols: ['#ff3fa0', '#3fe0ff', '#b46bff', '#ffd23f', '#3fff9a'],
    },
    enemyTint: '#e0d0ff',
    boss: { type: 'core', name: 'NEON EYE', sub: 'Pháo đài mắt neon', palette: { shell: '#2a2440', plate: '#4a3e6a', trim: '#ff4fd8', core: '#ff3fa0', glow: '#3fe0ff' }, hp: 1, panels: 8 },
    clearLines: [['bong', 'Pháo hoa mừng chiến thắng đấy à? À không, là nó nổ thôi!'], ['lam', 'Hệ thống lưới điện thành phố đã ổn định.'], ['ho', 'Singapore sáng đèn trở lại. Bình minh này, ta tới Jakarta!']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(120, 'ho', 'Singapore mất điện toàn thành phố — chỉ còn đèn của quân Hắc Vân. Lấy lại bầu trời đêm!', { hold: 2.2 });
      say(520, 'bong', 'Đèn neon đẹp ghê! Mà… cái nào là đèn của địch vậy?');
      at(560, () => h.rear());
      at(650, () => h.vWing('dart', 5, 760, 20));
      at(950, () => h.ringOf('drone', 8, 190, { r: 20 }));
      ring(1200, 0, 20);
      at(1350, () => h.snake('interceptor', 5, 700, 20, 26));
      say(1500, 'thach', 'Vào khu trung tâm. Nhà cao chọc trời hai bên, giữ đường bay giữa.');
      tower(1800, -24, 140); tower(1950, 26, 120);
      at(1900, () => { h.fromBehind('interceptor', 6); });
      at(2300, () => { h.turret(2700, -30, { type: 'aagun' }); h.turret(2760, 30, { type: 'aagun' }); });
      gate(2600, 0, 30);
      at(2800, () => h.holders('raptor', 2, 170, { v: 24 }));
      gold(2900, -30, 50);
      say(3250, 'lam', 'Marina Bay Sands phía trước: ba tòa tháp, hai khe hẹp. Chọn một khe và bay thẳng!', { prio: 2 });
      lm('mbs', 3700, { u: 0, view: 4500 });
      ring(3700, -34, 26);
      lm('flyer', 3900, { u: -230, view: 4500 });
      check(3950);
      at(3850, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }));
      say(4150, 'bong', 'Mấy cái cây phát sáng kìa! Đừng có đâm vào nha đội trưởng!');
      lm('grove', 4400, { u: 0, view: 3500 });
      ring(4400, 14, 18);
      at(4600, () => h.crossing('dart', 6, 230, -1, 28));
      at(4900, () => h.gunship());
      at(5300, () => h.vWing('interceptor', 7, 700, 26, { speed: 34 }));
      tower(5500, 22, 150); tower(5650, -20, 110);
      at(5700, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 2, 190, { v: 34 }); });
      gold(6000, 0, 14);
      at(6200, () => h.ringOf('drone', 12, 210, { r: 26 }));
      at(6600, () => h.divers('interceptor', 5));
      ring(6800, 0, 26);
      say(6850, 'lam', 'Nguồn năng lượng khổng lồ ngoài khơi. Đó là trái tim mạng lưới neon của chúng!');
    },
  },

  // =================================================================== 5 · JAKARTA
  {
    id: 5, key: 'jakarta', city: 'JAKARTA', country: 'INDONESIA', title: 'NGỌN LỬA MONAS', en: 'FLAME OF MONAS',
    blurb: 'Buổi sáng mờ sương trên Biển Java. Vượt Quảng trường Merdeka, vòng qua tháp Monas và đại lộ Sudirman.',
    music: 'stage5', bossAt: 7300, checkpoint: 3850,
    palettes: {
      haze: pal({ zenith: '#4a78b8', mid: '#b6cce4', horizon: '#f2e2c8', fog: '#d8d4c6', sun: '#fff2d8', cloud: '#ffffff', cloudShadow: '#a8b0bc', hemiSky: '#c0d4f0', hemiGround: '#6a604a', waterDeep: '#103a48', waterScatter: '#2a7a70', light: '#fff2dc', sunElev: 24, sunAz: 30, sunLight: 2.7, fogDensity: 0.00088, fogHeight: 0.0016, fogFalloff: 0.018, glow: 0.25, cloudCover: 0.45 }),
      bright: pal({ zenith: '#2e66b8', mid: '#a4c4ea', horizon: '#e8eef0', fog: '#c8d4dc', sun: '#ffffff', cloud: '#ffffff', cloudShadow: '#9aa8bc', hemiSky: '#b8d0f8', hemiGround: '#6a604a', waterDeep: '#0a3a50', waterScatter: '#1a7a7a', light: '#ffffff', sunElev: 40, sunAz: 20, sunLight: 3.0, fogDensity: 0.0006, glow: 0.18, cloudCover: 0.5 }),
    },
    paletteKeys: [{ at: 0, name: 'haze' }, { at: 4000, name: 'haze' }, { at: 6800, name: 'bright' }],
    segments: [
      { at: 0, kind: 'water', shoreR: 700, islands: true, style: 'low' },
      { at: 1300, kind: 'city', style: 'low', density: 0.8 },
      { at: 2400, kind: 'city', style: 'mixed' },
      { at: 4300, kind: 'city', style: 'modern', hmul: 1.2 },
      { at: 6400, kind: 'water', shoreL: 480, islands: true, style: 'mixed' },
    ],
    look: {
      ground: '#9a9284', bldg: ['#e8e4dc', '#d0ccc4', '#a8b8c8', '#c8b8a0', '#f0e8d8'], roofs: ['#c0582a', '#a8482a', '#d06a3a', '#8a5a3a'],
      tree: 'palm', bank: '#8a8070',
    },
    enemyTint: '#ffd8c8',
    boss: { type: 'warship', name: 'KRAKATOA', sub: 'Chiến hạm núi lửa', palette: { hull: '#3a2a26', plate: '#5a3e32', trim: '#ff7a2a', glow: '#ff5a1a', core: '#ffb02a' }, hp: 1.15, turrets: 6, lava: true },
    clearLines: [['thach', 'Một ngọn núi lửa biết bay… Đời phi công của ta thêm một chuyện để kể.'], ['bong', 'Nóng muốn chảy cả lông!'], ['ho', 'Jakarta đã an toàn. Manila đang chờ trong ánh hoàng hôn.']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(120, 'ho', 'Jakarta, buổi sáng. Hạm đội Hắc Vân đổ bộ từ Biển Java. Chặn chúng trước khi vào đất liền!', { hold: 2.2 });
      say(520, 'lam', 'Sương mù dày, tầm nhìn khoảng một cây số. Dùng radar khóa mục tiêu.');
      at(560, () => h.rear());
      at(650, () => h.vWing('dart', 5, 740, 18));
      at(1000, () => h.crossing('dart', 6, 230, -1, 24));
      ring(1200, 10, 18);
      at(1350, () => h.snake('interceptor', 5, 700, 0, 22));
      at(1700, () => { h.fromBehind('dart', 6); h.radio('bong', 'Bám đuôi kìa!', { prio: 1 }); });
      at(2100, () => h.holders('raptor', 2, 170));
      at(2500, () => h.ringOf('drone', 10, 200, { r: 22 }));
      gold(2700, 32, 30);
      say(2900, 'lam', 'Quảng trường Merdeka. Tháp Monas cao hơn trăm mét — vòng qua bên phải!', { prio: 1 });
      lm('monas', 3300, { u: -16, view: 4000 });
      ring(3300, 26, 30);
      at(3400, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }));
      check(3850);
      at(3900, () => h.gunship());
      at(4300, () => { h.turret(4700, -26); h.turret(4760, 28); h.turret(4850, 0, { type: 'aagun' }); });
      say(4400, 'thach', 'Đại lộ Sudirman. Cao ốc chen chúc, cẩn thận góc cua.');
      lm('wisma46', 4900, { u: 120, view: 4000 });
      tower(4800, -22, 120); tower(5050, 24, 100); tower(5250, -6, 80);
      at(5000, () => h.vWing('interceptor', 7, 700, 26, { speed: 34 }));
      at(5400, () => { h.divers('interceptor', 4); });
      gate(5700, 0, 30);
      at(5800, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 2, 190, { v: 32 }); });
      gold(6100, -30, 46);
      at(6300, () => h.ringOf('drone', 10, 200, { r: 24, v: 26 }));
      ring(6700, 0, 24);
      say(6850, 'bong', 'Biển đang… bốc khói? Có thứ gì đó nóng rực đang trồi lên!');
    },
  },

  // =================================================================== 6 · MANILA
  {
    id: 6, key: 'manila', city: 'MANILA', country: 'PHILIPPINES', title: 'HOÀNG HÔN VỊNH MANILA', en: 'MANILA BAY SUNSET',
    blurb: 'Hoàng hôn nổi tiếng trên vịnh Manila. Gầm cầu Jones, cổng thành Intramuros cổ kính, rồi thủy quái khổng lồ.',
    music: 'stage6', bossAt: 7300, checkpoint: 3800,
    palettes: {
      sunset: pal({ zenith: '#283a80', mid: '#c27092', horizon: '#ff8a40', fog: '#e88a6a', sun: '#ffb060', cloud: '#ffc0a0', cloudShadow: '#7a4a7a', hemiSky: '#a890d0', hemiGround: '#6a4038', waterDeep: '#1a2040', waterScatter: '#6a3a50', light: '#ffb080', sunElev: 5, sunAz: 2, sunDisc: 12, sunLight: 2.3, glow: 0.62, cloudCover: 0.42, bloom: 0.55, exposure: 0.98 }),
      dusk: pal({ zenith: '#141a4e', mid: '#7a4a8c', horizon: '#ff6e50', fog: '#a85a72', sun: '#ff8a5a', cloud: '#e88a90', cloudShadow: '#3a2a54', hemiSky: '#7078c0', hemiGround: '#3a2a40', waterDeep: '#0e1236', waterScatter: '#3a2a62', light: '#ffa888', sunElev: 1.5, sunAz: 0, sunLight: 1.6, glow: 0.62, cloudCover: 0.38, stars: 0.4, exposure: 1.1, bloom: 0.62, night: 0.6 }),
    },
    paletteKeys: [{ at: 0, name: 'sunset' }, { at: 4200, name: 'sunset' }, { at: 7200, name: 'dusk' }],
    segments: [
      { at: 0, kind: 'water', shoreR: 240, style: 'mixed' },
      { at: 1900, kind: 'city', style: 'old', river: 70 },
      { at: 3700, kind: 'city', style: 'mixed' },
      { at: 4500, kind: 'city', style: 'modern', hmul: 1.2 },
      { at: 6300, kind: 'water', shoreR: 360, style: 'modern' },
    ],
    look: {
      ground: '#9a9080', bldg: ['#e8dcc8', '#d8c8b0', '#c8b8a8', '#a8b0c0', '#f0e4d0'], roofs: ['#a84a2a', '#8a3a2a', '#c86a3a'], tree: 'palm',
      lamps: true, boatCols: ['#2a5aa0', '#c84a32', '#e8e4d8', '#e8b830'],
    },
    enemyTint: '#ffd0e0',
    boss: { type: 'serpent', name: 'LEVIATHAN', sub: 'Thủy quái vịnh Manila', palette: { armor: '#1e3a3e', plate: '#2e5a5a', trim: '#e88a3a', eye: '#ff3a50', seam: '#3affb0', belly: '#14282a', membrane: '#7a2a4a' }, hp: 1.25, turretHp: 11, scale: 1.15, enrageEarly: true },
    clearLines: [['lam', 'Mặt trời vừa lặn đúng lúc nó chìm xuống. Thật thơ mộng.'], ['thach', 'Thơ mộng cái nỗi gì. Mau tiếp nhiên liệu.'], ['ho', 'Manila an toàn. Chuyến tiếp theo dài đấy: New Delhi!']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(120, 'ho', 'Vịnh Manila. Hoàng hôn ở đây đẹp nhất châu Á — đừng để Hắc Vân phá hỏng nó!', { hold: 2.2 });
      say(520, 'bong', 'Mặt trời ngay trước mặt luôn! Chói quá à!');
      at(560, () => h.rear());
      lm('cargoship', 1300, { u: -160, rotY: 0.3 });
      lm('cargoship', 2200, { u: -260, rotY: -0.2 });
      at(650, () => h.vWing('dart', 5, 760, 18));
      at(1000, () => h.snake('dart', 6, 700, 20, 16));
      ring(1300, -10, 14);
      at(1450, () => h.crossing('interceptor', 5, 220, 1, 22));
      at(1800, () => h.fromBehind('dart', 6));
      say(2200, 'lam', 'Sông Pasig. Cầu Jones phía trước — gầm cầu thấp, hạ độ cao!', { prio: 1 });
      lm('jonesbridge', 2700, {});
      ring(2700, 0, 6);
      at(2400, () => h.holders('raptor', 2, 170, { v: 24 }));
      at(2950, () => h.rescue('thach'));
      say(3150, 'thach', 'Intramuros — thành cổ bốn trăm năm. Bay qua cổng thành hoặc vượt lên trên tường.', { prio: 0 });
      lm('intramuros', 3500, {});
      gold(3500, 0, 9);
      check(3800);
      at(3800, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }));
      at(4100, () => h.ringOf('drone', 10, 200, { r: 22 }));
      at(4400, () => h.gunship());
      say(4600, 'bong', 'Khu Makati! Nhà cao tầng sáng đèn hết rồi!');
      tower(4900, 26, 110); tower(5050, -24, 130); tower(5300, 4, 90);
      at(4900, () => { h.turret(5300, -34, { type: 'aagun' }); h.turret(5350, 34, { type: 'aagun' }); });
      at(5300, () => h.vWing('interceptor', 7, 700, 26, { speed: 34 }));
      gate(5700, 0, 30);
      at(5800, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 2, 190, { v: 30 }); });
      gold(6000, 30, 40);
      lm('cargoship', 6700, { u: 160, rotY: 0.5 });
      at(6300, () => h.ringOf('drone', 12, 210, { r: 26, v: 24 }));
      ring(6700, 0, 22);
      at(6600, () => { for (let i = 0; i < 8; i++) h.mine(6950 + i * 35, h.rand(-30, 30), h.rand(10, 40)); });
      say(6850, 'lam', 'Sóng dưới vịnh bất thường. Cẩn thận — thứ gì đó rất dài đang bơi phía dưới.');
    },
  },

  // =================================================================== 7 · NEW DELHI
  {
    id: 7, key: 'delhi', city: 'NEW DELHI', country: 'ẤN ĐỘ', title: 'XUYÊN CỔNG ẤN ĐỘ', en: 'THROUGH INDIA GATE',
    blurb: 'Nắng vàng bụi mờ. Bay theo đại lộ Kartavya Path xuyên Cổng Ấn Độ, qua lăng Humayun và tháp Qutub Minar.',
    music: 'stage7', bossAt: 7300, checkpoint: 3850,
    palettes: {
      dust: pal({ zenith: '#5a7aa8', mid: '#c6bfa8', horizon: '#f0d0a0', fog: '#d8b890', sun: '#ffe0a0', cloud: '#fff2dc', cloudShadow: '#b0987a', hemiSky: '#c8d0e0', hemiGround: '#8a6a4a', waterDeep: '#3a3a30', waterScatter: '#7a6a48', light: '#ffe0b0', sunElev: 18, sunAz: 34, sunLight: 2.8, fogDensity: 0.00092, fogHeight: 0.0022, fogFalloff: 0.02, glow: 0.4, cloudCover: 0.22 }),
      warm: pal({ zenith: '#4a68a0', mid: '#d0b898', horizon: '#ffbe7a', fog: '#e0a878', sun: '#ffc888', cloud: '#ffe0c0', cloudShadow: '#a88070', hemiGround: '#7a5a3a', waterDeep: '#3a3028', waterScatter: '#7a5a3a', light: '#ffd09a', sunElev: 9, sunAz: 30, sunLight: 2.5, fogDensity: 0.0009, glow: 0.5, cloudCover: 0.25 }),
    },
    paletteKeys: [{ at: 0, name: 'dust' }, { at: 4500, name: 'dust' }, { at: 7200, name: 'warm' }],
    segments: [
      { at: 0, kind: 'fields', river: 80, far: 50, farAt: 1200 },
      { at: 1700, kind: 'city', style: 'low', density: 0.85 },
      { at: 2500, kind: 'city', style: 'mixed', density: 0.6 },
      { at: 3800, kind: 'city', style: 'mixed' },
      { at: 5700, kind: 'fields', far: 40, farAt: 1200 },
    ],
    look: {
      ground: '#b0a088', road: '#4a443c', plaza: '#d8c8a8', park: '#6a8a3a', park2: '#7a9a44', bldg: ['#e8d8bc', '#d8b890', '#c8a07a', '#f0e8d8', '#b89878'],
      roofs: ['#a8553a', '#c8a07a', '#8a6a4a'], paddy: ['#a8a44a', '#b8b05a', '#8a9a3a', '#c8b86a'], paddyWater: '#8a9a88', dirt: '#a88a5a', mud: '#8a7050', tree: 'round',
    },
    enemyTint: '#fff0c0',
    boss: { type: 'warship', name: 'SANDSTORM', sub: 'Chiến hạm bão cát', palette: { hull: '#5a4a38', plate: '#8a7250', trim: '#ffd060', glow: '#ffae2a', core: '#ffe080' }, hp: 1.3, turrets: 8 },
    clearLines: [['bong', 'Bụi cát bay đầy buồng lái luôn rồi…'], ['thach', 'Bay xuyên cổng đẹp đấy, đội trưởng.'], ['ho', 'Delhi an toàn. Lên phương Bắc — Bắc Kinh đang vào đông.']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(120, 'ho', 'New Delhi. Quân Hắc Vân tập kết dọc sông Yamuna. Quét sạch rồi tiến vào trung tâm!', { hold: 2.2 });
      say(520, 'lam', 'Bụi trong không khí cao. Động cơ vẫn ổn — tiến lên.');
      at(560, () => h.rear());
      at(650, () => h.vWing('dart', 7, 760, 20));
      at(1000, () => h.snake('interceptor', 5, 700, -18, 22));
      ring(1250, 0, 18);
      at(1400, () => h.divers('dart', 5));
      at(1800, () => { h.fromBehind('interceptor', 6); h.radio('bong', 'Lại đánh lén nữa!', { prio: 1 }); });
      at(2100, () => h.crossing('dart', 6, 230, -1, 26));
      say(2650, 'lam', 'Đại lộ Kartavya Path dẫn thẳng tới Cổng Ấn Độ. Bay xuyên qua vòm cổng!', { prio: 2 });
      at(2500, () => h.holders('raptor', 2, 170, { v: 30 }));
      lm('indiagate', 3200, { u: 0, view: 4000 });
      ring(3200, 0, 22);
      at(3400, () => h.ringOf('drone', 10, 200, { r: 22 }));
      at(3600, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }));
      check(3850);
      lm('humayun', 4300, { u: -190, view: 4000 });
      at(4100, () => h.gunship());
      at(4500, () => { h.turret(4900, -30); h.turret(4950, 30); h.turret(5000, -10, { type: 'aagun' }); h.turret(5050, 12, { type: 'aagun' }); });
      say(4900, 'thach', 'Qutub Minar phía trước, ngay trên đường bay. Tháp gạch tám trăm năm — né nó ra!', { prio: 1 });
      lm('qutub', 5300, { u: 22, view: 4000 });
      gold(5300, -30, 30);
      at(5300, () => h.vWing('interceptor', 7, 700, 26, { speed: 34 }));
      gate(5800, 0, 30);
      at(5900, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 3, 190, { v: 30 }); });
      at(6300, () => h.ringOf('drone', 12, 210, { r: 26 }));
      gold(6500, 30, 16);
      ring(6800, 0, 24);
      say(6850, 'bong', 'Bão cát đằng trước! Ơ… cơn bão đó có tháp pháo?!');
    },
  },

  // =================================================================== 8 · BẮC KINH
  {
    id: 8, key: 'beijing', city: 'BẮC KINH', country: 'TRUNG QUỐC', title: 'TỬ CẤM THÀNH MÙA ĐÔNG', en: 'WINTER PALACE',
    blurb: 'Trời đông trong vắt. Xuyên tháp CCTV, chui Ngọ Môn của Tử Cấm Thành, rồi vượt Vạn Lý Trường Thành phủ tuyết.',
    music: 'stage8', bossAt: 7400, checkpoint: 3900, weather: 'snow',
    palettes: {
      winter: pal({ zenith: '#2a5ab0', mid: '#a8c8ec', horizon: '#e8eef4', fog: '#c8d4e0', sun: '#fff4e8', cloud: '#ffffff', cloudShadow: '#9aa8c0', hemiSky: '#c0d0f0', hemiGround: '#8a8a90', waterDeep: '#1a2a3a', waterScatter: '#4a6a7a', light: '#fff0e0', sunElev: 16, sunAz: -52, sunLight: 2.7, fogDensity: 0.00055, fogHeight: 0.001, glow: 0.22, cloudCover: 0.25, exposure: 0.92 }),
      snowy: pal({ zenith: '#3a5a90', mid: '#b0c4dc', horizon: '#f0d8c8', fog: '#c8c8d4', sun: '#ffe0c8', cloud: '#f4f4f8', cloudShadow: '#8a90a8', hemiSky: '#c8d0e8', hemiGround: '#909098', light: '#ffe8d4', sunElev: 8, sunAz: -46, sunLight: 2.4, fogDensity: 0.0007, glow: 0.36, cloudCover: 0.55 }),
    },
    paletteKeys: [{ at: 0, name: 'winter' }, { at: 5000, name: 'winter' }, { at: 7000, name: 'snowy' }],
    segments: [
      { at: 0, kind: 'fields', far: 150, farAt: 1000 },
      { at: 1400, kind: 'city', style: 'modern', hmul: 1.2, far: 160, farAt: 1300 },
      { at: 3200, kind: 'city', style: 'palace', density: 0.75 },
      { at: 4700, kind: 'city', style: 'mixed', far: 170, farAt: 1100 },
      { at: 5800, kind: 'mountain', hw: 90 },
      { at: 7000, kind: 'mountain', hw: 130 },
    ],
    look: {
      ground: '#a8a49c', road: '#4a4c52', plaza: '#d8d4cc', park: '#7a8a6a', park2: '#8a9878', bldg: ['#c8ccd2', '#a8b0bc', '#d8d4cc', '#8a96a8', '#e0dcd4'],
      hallRoof: ['#e2b030', '#d8a428', '#c89a28'], roofs: ['#5a6068', '#7a4a3a'],
      paddy: ['#c8ccc4', '#b8bcb0', '#d8dcd8', '#a8ac98'], paddyWater: '#b8c8d4', dirt: '#8a8478', mud: '#7a7468',
      hill: '#6a7a62', hill2: '#5a6a58', rock: '#7a7470', rock2: '#8a8680', snowLine: 60, tree: 'pine',
    },
    enemyTint: '#e0f0ff',
    boss: { type: 'core', name: 'BLIZZARD CORE', sub: 'Lõi bão tuyết', palette: { shell: '#2a3444', plate: '#4a5a72', trim: '#8fe8ff', core: '#6ad8ff', glow: '#bff4ff' }, hp: 1.35, panels: 10 },
    clearLines: [['thach', 'Lạnh thấu xương… nhưng thắng rồi thì ấm lòng.'], ['lam', 'Trường Thành vẫn nguyên vẹn. Không mất một viên gạch.'], ['ho', 'Bắc Kinh đã giải phóng. Tiếp theo: Seoul, ngay trong đêm nay!']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(120, 'ho', 'Bắc Kinh, giữa mùa đông. Hắc Vân dựng căn cứ trên núi phía bắc thành phố. Tiến vào!', { hold: 2.2 });
      say(520, 'bong', 'Brrr… Lạnh cóng cả râu!');
      at(560, () => h.rear());
      at(650, () => h.vWing('interceptor', 5, 760, 22));
      at(1000, () => h.snake('dart', 6, 700, 18, 20));
      ring(1300, 0, 22);
      at(1500, () => h.crossing('interceptor', 5, 220, -1, 28));
      say(1900, 'lam', 'Tháp CCTV — tòa nhà hình vòng. Bay xuyên qua lỗ giữa!', { prio: 2 });
      lm('cctv', 2400, { u: 0, view: 4000 });
      ring(2400, 0, 40);
      at(2000, () => h.fromBehind('interceptor', 5));
      at(2600, () => h.holders('raptor', 2, 170, { v: 30 }));
      at(2900, () => h.ringOf('drone', 10, 200, { r: 22 }));
      say(3250, 'thach', 'Tử Cấm Thành. Ngọ Môn chắn ngang — chui qua cổng giữa hoặc bay vọt lên!', { prio: 1 });
      lm('wumen', 3700, { u: 0, view: 4000 });
      gold(3700, 0, 6);
      lm('taihedian', 4150, { u: -120, view: 3500 });
      check(3900);
      at(3950, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 30 }));
      at(4200, () => h.rescue('lam'));
      at(4700, () => h.gunship());
      lm('templeofheaven', 5100, { u: 170, view: 4000 });
      at(5000, () => { h.turret(5400, -30, { type: 'aagun' }); h.turret(5450, 30, { type: 'aagun' }); });
      at(5300, () => h.vWing('interceptor', 7, 700, 28, { speed: 34 }));
      say(5700, 'lam', 'Vào vùng núi. Vạn Lý Trường Thành nằm vắt ngang thung lũng — bay vượt qua!', { prio: 1 });
      at(5900, () => h.divers('interceptor', 5));
      lm('greatwall', 6400, { u: 0, view: 3800 });
      ring(6400, 0, 34);
      at(6200, () => { h.fromBehind('interceptor', 6); });
      gold(6700, 30, 30);
      at(6600, () => h.ringOf('drone', 12, 210, { r: 26, v: 34 }));
      ring(7000, 0, 30);
      say(7050, 'bong', 'Tuyết đang bay ngược lên trời… Có thứ gì đó hút cả cơn bão!');
    },
  },

  // =================================================================== 9 · SEOUL
  {
    id: 9, key: 'seoul', city: 'SEOUL', country: 'HÀN QUỐC', title: 'ĐÊM SÔNG HÁN', en: 'HAN RIVER NIGHTS',
    blurb: 'Chạng vạng chuyển sang đêm trên sông Hán. Lách giữa hai tầng cầu Banpo, ngắm tháp Namsan và Lotte World Tower.',
    music: 'stage9', bossAt: 7300, checkpoint: 3900,
    palettes: {
      twilight: pal({ zenith: '#0e1640', mid: '#5a4a96', horizon: '#e2786a', fog: '#6e4c7e', sun: '#ff8a5a', cloud: '#e98a90', cloudShadow: '#2b2248', hemiSky: '#6c78c8', hemiGround: '#2c2340', waterDeep: '#0b1030', waterScatter: '#2c2c6a', light: '#ffb49a', sunElev: 1.6, sunAz: -26, sunDisc: 9, sunLight: 1.5, fogDensity: 0.0006, glow: 0.6, cloudCover: 0.35, hemi: 1.15, stars: 0.6, exposure: 1.1, bloom: 0.65, night: 0.75 }),
      night: pal({ ...NIGHT, horizon: '#3a3a8a', fog: '#1a1c4a' }),
    },
    paletteKeys: [{ at: 0, name: 'twilight' }, { at: 2500, name: 'twilight' }, { at: 5200, name: 'night' }],
    segments: [
      { at: 0, kind: 'city', style: 'mixed', river: 150, far: 170, farAt: 1000 },
      { at: 3000, kind: 'city', style: 'modern', river: 150, hmul: 1.15, far: 170, farAt: 1000 },
      { at: 4600, kind: 'city', style: 'modern', river: 0, hmul: 1.3 },
      { at: 5900, kind: 'city', style: 'mixed', river: 170, far: 170, farAt: 1000 },
    ],
    look: {
      ground: '#7a7880', road: '#2a2c32', bldg: ['#d8dce4', '#b8c0cc', '#9aa4b8', '#e8e8ec', '#c8c0b8'], neon: true, tree: 'round',
      hallRoof: ['#4a4e52'], hill: '#2e4a34', hill2: '#3a5a3e', bank: '#7a7a7e', neonCols: ['#ff3fa0', '#3fe0ff', '#ffd23f', '#ff6a3f', '#7a6bff'],
    },
    enemyTint: '#d8e0ff',
    boss: { type: 'serpent', name: 'IMUGI-9', sub: 'Mãng xà sông Hán', palette: { armor: '#222a44', plate: '#3a4870', trim: '#c8d4ff', eye: '#ff2a6a', seam: '#7a6bff', belly: '#181e30', membrane: '#5a2a7a' }, hp: 1.45, turretHp: 12, scale: 1.2, enrageEarly: true },
    clearLines: [['bong', 'Seoul về đêm lung linh quá! Đáng công bay!'], ['lam', 'Dữ liệu cho thấy kỳ hạm của Hắc Vân đang ở Tokyo.'], ['ho', 'Trận cuối cùng, Phi đội Rồng. Tokyo — kết thúc tất cả ở đó!']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(120, 'ho', 'Seoul lúc chạng vạng. Sông Hán là hành lang tiến quân của địch. Chặn đứng chúng!', { hold: 2.2 });
      say(520, 'lam', 'Núi bao quanh thành phố — địch sẽ ép ta bay trong lòng sông.');
      at(560, () => h.rear());
      at(650, () => h.vWing('interceptor', 5, 760, 22));
      at(1000, () => h.snake('dart', 6, 700, 0, 14));
      ring(1300, 20, 14);
      at(1450, () => h.crossing('dart', 6, 230, 1, 26));
      say(1800, 'lam', 'Cầu Banpo — cầu hai tầng có đài phun cầu vồng. Có khe hẹp giữa hai tầng cầu!', { prio: 2 });
      lm('banpo', 2200, {});
      ring(2200, 0, 9);
      at(1950, () => h.fromBehind('interceptor', 5));
      lm('namsan', 2900, { u: -330, view: 5000 });
      at(2500, () => h.holders('raptor', 2, 170, { v: 24 }));
      at(2900, () => h.ringOf('drone', 10, 200, { r: 22 }));
      gold(3100, -30, 40);
      at(3300, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }));
      check(3900);
      say(3700, 'bong', 'Tháp Namsan đổi màu kìa! Đẹp ghê!');
      at(3900, () => h.gunship());
      lm('gwanghwamun', 4500, { u: 170, view: 3500 });
      at(4600, () => { h.turret(5000, -30, { type: 'aagun' }); h.turret(5050, 30, { type: 'aagun' }); h.turret(5150, 0); });
      tower(4900, -24, 140); tower(5100, 26, 120); tower(5300, -8, 100);
      lm('lotteworld', 5200, { u: 340, view: 6500 });
      at(5100, () => h.vWing('interceptor', 7, 700, 26, { speed: 36 }));
      gate(5600, 0, 30);
      at(5700, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 3, 190, { v: 30 }); });
      say(5950, 'thach', 'Trở lại sông. Đội hình chặt vào!');
      at(6200, () => h.ringOf('drone', 12, 210, { r: 26 }));
      gold(6400, 30, 18);
      ring(6800, 0, 20);
      at(6600, () => { for (let i = 0; i < 8; i++) h.mine(6950 + i * 35, h.rand(-30, 30), h.rand(8, 36)); h.radio('bong', 'Thủy lôi! Lách ra!'); });
      say(6900, 'lam', 'Tín hiệu sinh học… không, cơ khí… dưới đáy sông!');
    },
  },

  // =================================================================== 10 · TOKYO
  {
    id: 10, key: 'tokyo', city: 'TOKYO', country: 'NHẬT BẢN', title: 'TRẬN CHIẾN CUỐI CÙNG', en: 'FINAL SORTIE',
    blurb: 'Hoàng hôn buông xuống vịnh Tokyo, núi Phú Sĩ ở chân trời. Gầm cầu Cầu Vồng, tháp Tokyo, Skytree — và kỳ hạm Hắc Vân.',
    music: 'stage10', bossAt: 7500, checkpoint: 4000, final: true,
    palettes: {
      sunset: pal({ zenith: '#2a3a86', mid: '#b88aa8', horizon: '#ffa070', fog: '#e8a08a', sun: '#ffc078', cloud: '#ffd0c0', cloudShadow: '#8a5a8a', hemiSky: '#b0a0d8', hemiGround: '#6a4a48', waterDeep: '#122040', waterScatter: '#4a4a6a', light: '#ffc8a0', sunElev: 6, sunAz: -60, sunDisc: 11, sunLight: 2.4, glow: 0.55, cloudCover: 0.4, bloom: 0.55, night: 0.3 }),
      twilight: pal({ zenith: '#0b1236', mid: '#5a4696', horizon: '#e27566', fog: '#6e4c7e', sun: '#ff8456', cloud: '#e98a90', cloudShadow: '#2b2248', hemiSky: '#6c78c8', hemiGround: '#2c2340', waterDeep: '#0b1030', waterScatter: '#2c2c6a', light: '#ffb49a', sunElev: 1.4, sunAz: -60, sunLight: 1.5, fogDensity: 0.00062, glow: 0.6, cloudCover: 0.35, hemi: 1.15, stars: 0.85, exposure: 1.1, bloom: 0.62, night: 0.8 }),
      night: pal({ ...NIGHT, horizon: '#5a2a5a', fog: '#24183e', zenith: '#06061a' }),
    },
    paletteKeys: [{ at: 0, name: 'sunset' }, { at: 2200, name: 'sunset' }, { at: 4300, name: 'twilight' }, { at: 6600, name: 'night' }],
    segments: [
      { at: 0, kind: 'water', shoreL: 300, shoreR: 320, style: 'modern', hmul: 1.2 },
      { at: 2500, kind: 'city', style: 'modern', hmul: 1.45, density: 0.95 },
      { at: 4200, kind: 'city', style: 'modern', hmul: 1.25, density: 0.95 },
      { at: 6500, kind: 'water', shoreL: 380, shoreR: 520, style: 'modern' },
    ],
    look: {
      ground: '#7a7a7e', road: '#26282e', bldg: ['#e0e4ea', '#c0c8d4', '#9aa8bc', '#f0ece4', '#b0b4b8', '#8a96a8'], neon: true, tree: 'sakura',
      park: '#4a6a3a', park2: '#5a7a44', neonCols: ['#ff3f6a', '#3fe0ff', '#ffd23f', '#ff8a3f', '#b46bff', '#3fff9a'],
    },
    enemyTint: '#ffd0d8',
    boss: { type: 'warship', name: 'HẮC VÂN', sub: 'Kỳ hạm tối thượng', palette: { hull: '#1e1a26', plate: '#3a3048', trim: '#ff2d55', glow: '#ff2d55', core: '#ff3a6a' }, hp: 1.8, turrets: 8, final: true },
    clearLines: [['bong', 'Thắng rồi! Thắng thật rồi! Cả châu Á tự do rồi!'], ['thach', '…Bay cùng các cậu là vinh dự của lão.'], ['lam', 'Mười thủ đô. Không một công trình nào bị hư hại. Hoàn hảo.'], ['ho', 'Phi đội Rồng — nhiệm vụ hoàn thành. Bầu trời châu Á đã thuộc về chúng ta. Về nhà thôi.']],
    script(h) {
      const { at, say, ring, gold, check, lm, tower, gate } = h;
      say(120, 'ho', 'Tokyo. Kỳ hạm Hắc Vân ở đâu đó trên thành phố này. Đây là trận cuối — dồn hết sức lực!', { hold: 2.4 });
      say(560, 'thach', 'Mười thành phố… Kết thúc ở đây thôi.');
      lm('fuji', 8800, { u: -1700, view: 12000, keep: 9000 });
      at(600, () => h.rear());
      at(650, () => h.vWing('interceptor', 7, 760, 22));
      at(1000, () => h.ringOf('drone', 10, 200, { r: 22 }));
      ring(1300, 0, 18);
      say(1350, 'lam', 'Cầu Cầu Vồng phía trước. Gầm cầu đủ rộng — hạ xuống!', { prio: 1 });
      lm('rainbowbridge', 1800, {});
      ring(1800, 0, 12);
      at(1500, () => h.snake('interceptor', 6, 700, -16, 16));
      at(2000, () => { h.fromBehind('interceptor', 6); h.radio('bong', 'Cả đàn phía sau!', { prio: 1 }); });
      at(2400, () => h.holders('raptor', 3, 170, { v: 28 }));
      lm('tokyotower', 3300, { u: -170, view: 5000 });
      say(2800, 'bong', 'Tháp Tokyo kìa! Đỏ trắng y như trong ảnh!');
      tower(2900, 24, 150); tower(3050, -26, 130);
      at(3000, () => h.crossing('interceptor', 6, 230, 1, 30));
      gold(3200, 0, 50);
      at(3400, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }));
      at(3600, () => { h.turret(4000, -30, { type: 'aagun' }); h.turret(4050, 30, { type: 'aagun' }); h.turret(4100, 0); });
      check(4000);
      at(3900, () => h.gunship());
      say(4300, 'thach', 'Shibuya. Đèn neon chói lóa — đừng để bị lóa mắt.');
      tower(4500, 26, 140); tower(4650, -24, 160); tower(4800, 6, 110); tower(5000, -18, 130);
      at(4500, () => h.vWing('interceptor', 7, 700, 28, { speed: 36 }));
      gate(5200, 0, 30);
      at(5300, () => { h.fromBehind('interceptor', 6); h.divers('interceptor', 4); });
      lm('skytree', 5700, { u: 300, view: 7000 });
      say(5500, 'lam', 'Tokyo Skytree bên phải — sáu trăm ba mươi tư mét.');
      at(5800, () => h.ringOf('drone', 12, 210, { r: 26 }));
      gold(6000, 30, 20);
      at(6200, () => { h.holders('raptor', 3, 190, { v: 30 }); h.crossing('interceptor', 6, 240, -1, 24); });
      ring(6600, 0, 24);
      at(6700, () => h.gunship());
      say(7000, 'ho', 'Phát hiện tín hiệu khổng lồ trên vịnh! Đó chính là kỳ hạm Hắc Vân!', { prio: 1 });
    },
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));
