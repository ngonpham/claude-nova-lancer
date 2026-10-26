// PANDORA RIDERS — the ten missions (an unofficial fan game). The stages retell the story of Avatar (2009)
// and Avatar: The Way of Water: the first night in the forest, learning to ride, the Iknimaya, the fall of
// Hometree, Toruk Makto, the battle in the Flux Vortex, the Tree of Souls, the train raid, the reef of the
// Metkayina and the battle at sea. All dialogue is original.
//
// Each stage defines its sky (palettes), ground (segments + look), mount, enemy faction, squadmates,
// landmarks, enemy script, radio lines and boss. Distances are rail metres (~100 m/s).
// Segment kinds (world.js): forest, plains, scar (clear-cut), floating (Hallelujah Mountains), water, mountain.

// ------------------------------------------------------------ palette presets
const BASE = {
  zenith: '#2a58a6', mid: '#9dc0e8', horizon: '#d8eadf', fog: '#a8c8b8', sun: '#fff4dc', cloud: '#ffffff', cloudShadow: '#90a8b0',
  hemiSky: '#b8e0d0', hemiGround: '#3a5a3a', waterDeep: '#103a3a', waterScatter: '#2a7a6a', light: '#fff2dc',
  sunElev: 30, sunAz: -30, sunDisc: 8, sunLight: 2.6, fogDensity: 0.001, fogStart: 200, fogHeight: 0.0025, fogFalloff: 0.03,
  glow: 0.25, cloudCover: 0.42, hemi: 1.05, stars: 0, exposure: 0.95, bloom: 0.45, env: 0.85, night: 0,
};
const pal = (o) => ({ ...BASE, ...o });
const NIGHT = {
  zenith: '#02061a', mid: '#0a1a3a', horizon: '#123a4a', fog: '#0a2230', sun: '#9ad8ff', cloud: '#4a5a8a', cloudShadow: '#101830',
  hemiSky: '#4a7ab0', hemiGround: '#14202a', waterDeep: '#020a1a', waterScatter: '#0a2a4a', light: '#8ac8ff',
  sunElev: 38, sunAz: 30, sunDisc: 2, sunLight: 0.55, fogDensity: 0.0011, fogStart: 180, fogHeight: 0.002, fogFalloff: 0.03,
  glow: 0.1, cloudCover: 0.25, hemi: 1.0, stars: 0.9, exposure: 1.22, bloom: 0.8, env: 0.5, night: 1,
};

const K = (k) => `<kbd>${k}</kbd>`;
const sky = (lm, s = 6600) => lm('polyphemus', s, { u: 2200, y: 1900, view: 14000, keep: 14000 });

export const STAGES = [
  // =================================================================== 1 · Rừng đêm
  {
    id: 1, key: 'night', title: 'ĐÊM ĐẦU TIÊN', place: 'RỪNG OMATICAYA', act: 'PHẦN I · NGƯỜI MỚI', en: 'FIRST NIGHT',
    blurb: 'Lạc trong rừng đêm phát quang, bị bầy dơi gai và một con thanator săn đuổi. Neytiri xuất hiện dẫn đường — cưỡi pa\'li phi qua rừng sáng rực.',
    music: 'stage1', bossAt: 7200, checkpoint: 3700, mount: 'pali', enemySet: 'wild', wing: ['neytiri'], hq: 'grace', weather: 'sprites', groundGlow: 0.8,
    palettes: {
      night: pal({ ...NIGHT }),
      deep: pal({ ...NIGHT, horizon: '#1a2a5a', fog: '#0c1a34', mid: '#100a30' }),
    },
    paletteKeys: [{ at: 0, name: 'night' }, { at: 4200, name: 'night' }, { at: 7000, name: 'deep' }],
    segments: [
      { at: 0, kind: 'forest', far: 120, farAt: 900 },
      { at: 6700, kind: 'forest', clear: 70, far: 130, farAt: 700 },
    ],
    look: {},
    enemyTint: '#ffffff',
    boss: { type: 'creature', kind: 'thanator', mode: 'ground', subdue: true, name: 'PALULUKAN', sub: 'Thanator — kẻ săn mồi của rừng đêm',
      palette: { armor: '#16181f', plate: '#262a36', trim: '#2a4a8a', eye: '#7ae0ff', seam: '#46c8ff', belly: '#101218', membrane: '#a02a3a' }, hp: 0.9, turretHp: 7, scale: 1 },
    clearLines: [['neytiri', 'Nó đã bỏ đi. Rừng đã chấp nhận anh — đêm nay thôi.'], ['grace', 'Cậu còn sống, và còn được một Na\'vi dẫn đường? Ghi chép điều này lại!']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      sky(lm);
      say(120, 'grace', 'Jake, cậu lạc khỏi nhóm rồi! Rừng Pandora về đêm không tha thứ cho ai. Cố bám theo ánh sáng!', { hold: 2.2 });
      say(520, 'neytiri', 'Đừng đứng đó như đứa trẻ. Lên lưng pa\'li, theo sát ta!');
      at(330, () => h.tip(`${K('W')}${K('A')}${K('S')}${K('D')} / phím mũi tên: điều khiển　${K('J')} / ${K('Space')}: bắn tên`, 6, 'Kéo góc trái dưới để điều khiển ／ FIRE để bắn tên'));
      at(600, () => h.rear());
      at(700, () => h.vWing('dart', 5, 760, 14, { noFire: true }));
      say(840, 'neytiri', 'Dơi gai. Chúng săn theo bầy — bắn trước khi chúng lao xuống.');
      ring(1150, 0, 8);
      say(980, 'grace', 'Vòng sáng kia là bào tử hạt giống — đi qua để hồi sức!');
      at(1250, () => h.snake('dart', 5, 720, 14, 12));
      lm('trunk', 1700, { u: -22 });
      lm('trunk', 1950, { u: 26, h: 170 });
      at(1700, () => { h.fromBehind('dart', 6); h.radio('neytiri', 'Phía sau anh! Để chúng vượt lên rồi hạ!', { prio: 1 }); });
      lm('rootarch', 2300, { u: 0 });
      ring(2300, 0, 12);
      at(2200, () => h.crossing('dart', 5, 230, 1, 14));
      at(2500, () => { h.holders('raptor', 2, 170, { v: 14 }); h.radio('neytiri', 'Lộn mình để gạt nọc độc của chúng! Nghiêng hai lần thật nhanh!', { prio: 1 }); h.tip(`${K('Q')} / ${K('E')} nhấn nhanh 2 lần: lộn mình (gạt đạn)`, 7, 'ROLL nhấn 2 lần: lộn mình (gạt đạn)'); });
      at(3000, () => { h.ringOf('drone', 8, 190, { r: 10, v: 14 }); h.radio('grace', 'Giữ nút bắn để căng dây cung, khóa mục tiêu rồi thả — cả chùm tên!', { prio: 1 }); h.tip('Giữ nút bắn → căng đầy rồi thả: tên khóa mục tiêu', 7, 'Giữ FIRE → thả: tên khóa mục tiêu'); });
      at(3400, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 12 }));
      say(3450, 'neytiri', 'Quả bào tử kia chứa sức mạnh. Bắn vỡ nó!');
      check(3700);
      gold(3900, -24, 6);
      lm('trunk', 4200, { u: 0, h: 160 });
      lm('trunk', 4450, { u: -30 });
      lm('trunk', 4600, { u: 28 });
      at(4200, () => { h.fromBehind('dart', 6); h.tip(`${K('L')} / ${K('Shift')}: phi nhanh　${K('I')} / ${K('V')}: ghìm cương`, 6, 'BOOST / BRAKE để tăng giảm tốc'); });
      at(4800, () => h.snake('dart', 6, 700, -14, 12));
      lm('rootarch', 5200, { u: 0, R: 30 });
      ring(5200, 0, 10);
      at(5300, () => h.vWing('raptor', 3, 700, 14));
      at(5700, () => h.ringOf('drone', 10, 200, { r: 12, v: 14 }));
      gold(6000, 20, 16);
      at(6200, () => h.crossing('dart', 6, 240, -1, 14));
      lm('trunk', 6400, { u: 16 });
      ring(6700, 0, 9);
      say(6800, 'neytiri', 'Dừng lại… Mùi palulukan. Nó vẫn bám theo anh từ chiều.');
    },
  },

  // =================================================================== 2 · Pa'li & máy ủi
  {
    id: 2, key: 'pali', title: 'CƯỠI PA\'LI', place: 'THẢO NGUYÊN & RỪNG THIÊNG', act: 'PHẦN I · NGƯỜI MỚI', en: 'THE DIREHORSE',
    blurb: 'Học cưỡi pa\'li qua thảo nguyên — rồi tiếng động cơ: máy ủi RDA đang san phẳng khu rừng thiêng. Chặn chúng lại.',
    music: 'stage2', bossAt: 7300, checkpoint: 3800, mount: 'pali', enemySet: 'rda', wing: ['neytiri', 'tsutey'], hq: 'grace',
    palettes: {
      day: pal({ sunElev: 34, fogDensity: 0.0008, cloudCover: 0.4 }),
      dust: pal({ zenith: '#3a5a98', mid: '#b0b8b0', horizon: '#e0c8a0', fog: '#b8a888', sun: '#ffe8c0', hemiGround: '#5a4a3a', sunElev: 22, fogDensity: 0.0011, fogHeight: 0.002, glow: 0.35 }),
    },
    paletteKeys: [{ at: 0, name: 'day' }, { at: 3200, name: 'day' }, { at: 5200, name: 'dust' }],
    segments: [
      { at: 0, kind: 'plains', far: 160, farAt: 800 },
      { at: 2100, kind: 'forest', far: 140, farAt: 900 },
      { at: 3900, kind: 'scar', scarW: 230, far: 120, farAt: 900 },
    ],
    look: {},
    enemyTint: '#ffffff',
    boss: { type: 'vehicle', kind: 'excavator', name: 'MÁY XÚC D-9', sub: 'Máy xúc khai hoang khổng lồ của RDA', palette: { hull: '#d8a020', plate: '#b8801a', trim: '#2a2a2c', glow: '#ff9a2a', core: '#ffb84a' }, hp: 0.85, turrets: 6 },
    clearLines: [['tsutey', 'Hừ. Cưỡi cũng không đến nỗi tệ… với một Mắt Mơ.'], ['neytiri', 'Rừng thiêng còn đứng đó. Nhưng chúng sẽ quay lại.'], ['grace', 'Selfridge sẽ nổi điên. Tốt. Về căn cứ ngay, Jake.']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      sky(lm);
      say(120, 'neytiri', 'Nối tsaheylu với pa\'li — cảm nhận nó. Đừng ra lệnh, hãy hòa làm một.', { hold: 2.2 });
      say(560, 'tsutey', 'Nếu Mắt Mơ ngã ngựa, ta sẽ không dừng lại đỡ đâu.');
      at(580, () => h.rear());
      at(650, () => h.vWing('dart', 5, 760, 14));
      ring(1000, 10, 8);
      at(1050, () => h.snake('dart', 5, 700, 16, 12));
      at(1500, () => h.crossing('drone', 6, 220, 1, 12));
      gold(1700, -26, 14);
      at(1900, () => h.fromBehind('dart', 5));
      say(2150, 'grace', 'Tín hiệu máy móc RDA ở phía bắc. Chúng không được phép vào khu này!', { prio: 1 });
      lm('trunk', 2500, { u: 24 }); lm('trunk', 2750, { u: -20 });
      at(2600, () => h.holders('raptor', 2, 170, { v: 16 }));
      lm('shrine', 3300, { u: -150, view: 3500 });
      say(3150, 'neytiri', 'Đó là cây thiêng của tổ tiên ta! Chúng đang tiến về phía đó!');
      at(3300, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 12 }));
      check(3800);
      say(3950, 'tsutey', 'Nhìn kìa… rừng bị cạo trụi. Bọn Người Trời không biết thế nào là đủ.');
      lm('dozerYard', 4300, { u: 150, view: 3500 });
      at(4200, () => { h.turret(4600, -30); h.turret(4650, 30); h.turret(4750, 0, { type: 'aagun' }); });
      at(4600, () => h.gunship());
      at(5000, () => h.vWing('interceptor', 5, 700, 16, { speed: 32 }));
      at(5400, () => { h.turret(5800, -24, { type: 'aagun' }); h.turret(5850, 24, { type: 'aagun' }); });
      gold(5700, 0, 18);
      at(5900, () => { h.fromBehind('interceptor', 5); h.holders('raptor', 2, 180, { v: 16 }); });
      at(6300, () => h.ringOf('drone', 10, 200, { r: 12, v: 14 }));
      ring(6700, 0, 10);
      say(6850, 'grace', 'Cỗ máy xúc lớn nhất của chúng đang tiến thẳng vào rừng thiêng. Jake — chặn nó!');
    },
  },

  // =================================================================== 3 · Núi Hallelujah
  {
    id: 3, key: 'iknimaya', title: 'IKNIMAYA', place: 'NÚI HALLELUJAH', act: 'PHẦN I · NGƯỜI MỚI', en: 'THE FLOATING MOUNTAINS',
    blurb: 'Thử thách trưởng thành: vượt qua những ngọn núi bay giữa mây và thác nước, thuần phục ikran đầu đàn để có đôi cánh của riêng mình.',
    music: 'stage3', bossAt: 7300, checkpoint: 3800, mount: 'ikran', enemySet: 'wild', wing: ['neytiri', 'tsutey'], hq: 'moat', water: false, groundGlow: 0,
    palettes: {
      mist: pal({ zenith: '#2f66b8', mid: '#a8d0ec', horizon: '#e8f4f4', fog: '#c0dce0', sun: '#fff8e8', sunElev: 26, fogDensity: 0.00045, fogHeight: 0.0035, fogFalloff: 0.016, cloudCover: 0.55, hemiGround: '#5a7a6a' }),
      gold: pal({ zenith: '#2a5aa8', mid: '#b0c8e0', horizon: '#ffd8a8', fog: '#d8c8b8', sun: '#ffd8a0', sunElev: 12, fogDensity: 0.00045, fogHeight: 0.003, fogFalloff: 0.016, cloudCover: 0.5, glow: 0.4 }),
    },
    paletteKeys: [{ at: 0, name: 'mist' }, { at: 4500, name: 'mist' }, { at: 7200, name: 'gold' }],
    segments: [{ at: 0, kind: 'floating' }],
    look: {},
    enemyTint: '#e0f0ff',
    boss: { type: 'creature', kind: 'ikran', mode: 'air', subdue: true, name: 'IKRAN HOANG', sub: 'Ikran đầu đàn — chọn ngươi, hoặc giết ngươi',
      palette: { armor: '#2a4aa0', plate: '#1a2a5a', trim: '#ffcc30', eye: '#ffe060', seam: '#7ae0ff', belly: '#c8d0e8', membrane: '#3a6ad0' }, hp: 1.0, turretHp: 8, scale: 1.1 },
    clearLines: [['neytiri', 'Nó đã chọn anh! Giờ anh là một chiến binh của tộc rồi.'], ['tsutey', '…Được. Ngươi đã làm được.'], ['moat', 'Eywa đã thấy. Từ hôm nay, con là một người Omaticaya.']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      sky(lm);
      say(120, 'moat', 'Con muốn có đôi cánh? Hãy tự giành lấy. Ikran sẽ chọn con — hoặc giết con.', { hold: 2.2 });
      say(520, 'neytiri', 'Bám theo cánh của ta qua những ngọn núi bay. Đừng nhìn xuống!');
      at(560, () => h.rear());
      at(650, () => h.vWing('dart', 5, 760, 26));
      lm('floatrock', 1000, { u: -34, r: 26, y: 60 });
      lm('floatrock', 1250, { u: 40, r: 30, y: 90 });
      ring(1250, 0, 30);
      at(1100, () => h.snake('dart', 6, 720, 10, 30));
      lm('vinebridge', 1800, { u: 0, gap: 42, y: 95 });
      ring(1800, 0, 24);
      at(1700, () => h.crossing('interceptor', 5, 230, -1, 34));
      lm('spire', 2300, { u: -36, h: 200 });
      lm('floatrock', 2500, { u: 30, r: 22, y: 30 });
      at(2400, () => { h.fromBehind('dart', 6); h.radio('tsutey', 'Bầy ikran hoang! Chúng bảo vệ lãnh thổ — đừng để bị dồn vào vách đá!', { prio: 1 }); });
      gold(2700, 0, 50);
      at(2900, () => h.ringOf('drone', 10, 200, { r: 20, v: 34 }));
      lm('floatrock', 3200, { u: 0, r: 34, y: 120 });
      lm('floatrock', 3450, { u: -40, r: 26, y: 40 });
      at(3300, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 30 }));
      check(3800);
      lm('vinebridge', 4300, { u: 0, gap: 38, y: 88 });
      ring(4300, 0, 22);
      at(4200, () => h.divers('dart', 5));
      lm('spire', 4700, { u: 34, h: 220 });
      lm('floatrock', 4900, { u: -28, r: 24, y: 70 });
      at(4900, () => h.vWing('interceptor', 7, 700, 30, { speed: 34 }));
      lm('floatrock', 5400, { u: 26, r: 28, y: 30 });
      lm('floatrock', 5600, { u: -24, r: 22, y: 110 });
      at(5500, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 3, 190, { v: 34 }); });
      gold(5900, 30, 44);
      at(6200, () => h.ringOf('drone', 12, 210, { r: 22, v: 30 }));
      lm('vinebridge', 6600, { u: 0, gap: 44, y: 100 });
      ring(6600, 0, 26);
      say(6850, 'neytiri', 'Tổ ikran ở ngay phía trước. Con đầu đàn đang nhìn anh. Hãy để nó chọn!');
    },
  },

  // =================================================================== 4 · Cây Nhà
  {
    id: 4, key: 'hometree', title: 'CÂY NHÀ BỐC CHÁY', place: 'KELUTRAL', act: 'PHẦN II · CHIẾN TRANH', en: 'HOMETREE FALLS',
    blurb: 'RDA đốt Cây Nhà. Cưỡi ikran giữa khói lửa, đánh lạc hướng trực thăng để tộc Omaticaya kịp sơ tán — và đối đầu chiến hạm Dragon.',
    music: 'stage4', bossAt: 7300, checkpoint: 3800, mount: 'ikran', enemySet: 'rda', wing: ['neytiri', 'tsutey'], hq: 'grace', weather: 'embers', groundGlow: 0.35,
    palettes: {
      smoke: pal({ zenith: '#2a2a3a', mid: '#7a5a50', horizon: '#ff9a50', fog: '#8a5a40', sun: '#ff9a50', cloud: '#c08070', cloudShadow: '#3a2a2a', hemiSky: '#a08070', hemiGround: '#3a2a20', light: '#ffb080', sunElev: 6, sunAz: 10, sunLight: 2.2, fogDensity: 0.0012, fogHeight: 0.002, glow: 0.7, cloudCover: 0.6, night: 0.45, bloom: 0.6, exposure: 1.0 }),
      fire: pal({ zenith: '#1a1420', mid: '#5a3038', horizon: '#ff6a2a', fog: '#6a3020', sun: '#ff7a30', cloud: '#a05040', cloudShadow: '#2a1a1a', hemiSky: '#a06050', hemiGround: '#2a1a14', light: '#ff9a60', sunElev: 2, sunAz: 10, sunLight: 1.6, fogDensity: 0.0014, glow: 0.8, cloudCover: 0.7, night: 0.8, stars: 0.3, bloom: 0.7, exposure: 1.1 }),
    },
    paletteKeys: [{ at: 0, name: 'smoke' }, { at: 4000, name: 'smoke' }, { at: 6800, name: 'fire' }],
    segments: [{ at: 0, kind: 'forest', far: 150, farAt: 900 }],
    look: {},
    enemyTint: '#ffffff',
    boss: { type: 'vehicle', kind: 'dragon', name: 'DRAGON', sub: 'Chiến hạm tấn công C-21 — chỉ huy: Quaritch', palette: { hull: '#4e5648', plate: '#3a4036', trim: '#c8b040', glow: '#ffb84a', core: '#ff7a2a' }, hp: 1.0, turrets: 8 },
    clearLines: [['neytiri', 'Cây Nhà… đã không còn. Nhưng tộc ta vẫn sống.'], ['tsutey', 'Chúng ta sẽ đòi lại. Mọi thứ.'], ['grace', 'Jake… tập hợp mọi người ở Cây Linh Hồn. Đây mới là bắt đầu.']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      sky(lm);
      say(120, 'grace', 'Chúng không chờ nữa — đội trực thăng đang bắn vào Cây Nhà! Jake, kéo hỏa lực ra xa khỏi dân làng!', { hold: 2.4 });
      say(560, 'tsutey', 'Các chiến binh, theo ta! Không một ikran nào được rời bầu trời!');
      at(560, () => h.rear());
      at(650, () => h.vWing('interceptor', 5, 760, 26));
      at(1000, () => h.snake('dart', 6, 700, 0, 24));
      ring(1300, 0, 24);
      at(1500, () => h.crossing('interceptor', 5, 220, 1, 30));
      lm('trunk', 1800, { u: -24, h: 170 }); lm('trunk', 2000, { u: 26, h: 160 });
      at(1900, () => { h.fromBehind('interceptor', 5); h.radio('neytiri', 'Sau lưng anh! Hai chiếc Scorpion!', { prio: 1 }); });
      at(2400, () => h.holders('raptor', 2, 170, { v: 30 }));
      lm('hometree', 3100, { u: -190, burning: true, view: 5000 });
      say(2700, 'grace', 'Cây Nhà đang cháy… Mo\'at, đưa mọi người xuống rễ cây!', { prio: 1 });
      at(2900, () => h.gunship());
      gold(3200, 30, 40);
      at(3400, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 26 }));
      check(3800);
      at(3900, () => { h.turret(4300, -30, { type: 'aagun' }); h.turret(4350, 30, { type: 'aagun' }); h.turret(4450, 0); });
      at(4300, () => h.vWing('interceptor', 7, 700, 28, { speed: 34 }));
      lm('rootarch', 4700, { u: 0, R: 36 });
      ring(4700, 0, 14);
      at(4900, () => { h.fromBehind('interceptor', 6); h.divers('interceptor', 4); });
      gold(5300, -30, 20);
      at(5500, () => h.ringOf('drone', 12, 210, { r: 24 }));
      at(5900, () => { h.holders('raptor', 3, 190, { v: 32 }); h.crossing('interceptor', 6, 240, -1, 26); });
      ring(6500, 0, 24);
      at(6400, () => h.gunship());
      say(6900, 'tsutey', 'Con tàu chỉ huy! Quaritch ở trên đó!', { prio: 1 });
    },
  },

  // =================================================================== 5 · Toruk Makto
  {
    id: 5, key: 'toruk', title: 'TORUK MAKTO', place: 'BẦU TRỜI TRÊN MÂY', act: 'PHẦN II · CHIẾN TRANH', en: 'RIDER OF LAST SHADOW',
    blurb: 'Để đoàn kết các tộc, phải làm điều chỉ năm người từng làm: bay lên trên Toruk — con thú không ai săn — và thuần phục nó.',
    music: 'stage5', bossAt: 7300, checkpoint: 3800, mount: 'ikran', enemySet: 'rda', wing: ['neytiri'], hq: 'moat', water: false, groundGlow: 0,
    palettes: {
      high: pal({ zenith: '#1a4a9a', mid: '#7ab0e0', horizon: '#f0e8e0', fog: '#d0e0f0', sun: '#fff0d8', sunElev: 24, sunAz: -10, fogDensity: 0.0004, fogHeight: 0.0035, fogFalloff: 0.016, cloudCover: 0.72, hemiGround: '#6a8aa0' }),
      sun: pal({ zenith: '#1a3a8a', mid: '#80a8d8', horizon: '#ffd0a0', fog: '#e0d0c8', sun: '#ffd8a0', sunElev: 9, sunAz: -10, fogDensity: 0.0004, fogHeight: 0.003, fogFalloff: 0.016, cloudCover: 0.6, glow: 0.5 }),
    },
    paletteKeys: [{ at: 0, name: 'high' }, { at: 4200, name: 'high' }, { at: 7100, name: 'sun' }],
    segments: [{ at: 0, kind: 'floating' }],
    look: {},
    enemyTint: '#ffffff',
    boss: { type: 'creature', kind: 'toruk', mode: 'air', subdue: true, name: 'TORUK', sub: 'Leonopteryx — Bóng Tối Cuối Cùng',
      palette: { armor: '#c82a1a', plate: '#2a1a1a', trim: '#ffcc30', eye: '#ffe060', seam: '#ff9a3a', belly: '#e8a040', membrane: '#e84a1a' }, hp: 1.25, turretHp: 10, scale: 1.45 },
    clearLines: [['neytiri', 'Toruk Makto…! Anh đã làm điều không ai dám nghĩ tới.'], ['moat', 'Các tộc sẽ nghe theo người cưỡi Toruk. Hãy gọi họ đến, con trai.']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      sky(lm);
      say(120, 'moat', 'Chỉ năm lần trong lịch sử, có người cưỡi được Toruk. Con định làm lần thứ sáu?', { hold: 2.2 });
      say(520, 'neytiri', 'Toruk không bao giờ nhìn lên. Nó là kẻ săn mồi ở trên cùng. Hãy bay cao hơn nó.');
      at(560, () => h.rear());
      at(650, () => h.vWing('interceptor', 5, 760, 30));
      lm('spire', 1000, { u: 40, h: 240 });
      at(1000, () => h.snake('interceptor', 5, 720, -10, 34));
      ring(1300, -10, 40);
      lm('floatrock', 1500, { u: -36, r: 30, y: 50 });
      at(1600, () => h.crossing('interceptor', 6, 230, 1, 36));
      lm('spire', 2000, { u: -30, h: 260 });
      at(2000, () => { h.fromBehind('interceptor', 5); h.radio('neytiri', 'Trực thăng tuần tra! Chúng đã theo dấu chúng ta!', { prio: 1 }); });
      gold(2300, 20, 52);
      lm('vinebridge', 2700, { u: 0, gap: 44, y: 100 });
      ring(2700, 0, 30);
      at(2800, () => h.holders('raptor', 2, 170, { v: 34 }));
      at(3200, () => h.ringOf('drone', 10, 200, { r: 22, v: 36 }));
      at(3400, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 34 }));
      check(3800);
      lm('spire', 4100, { u: 32, h: 230 });
      lm('floatrock', 4300, { u: -30, r: 24, y: 40 });
      at(4200, () => h.gunship());
      at(4700, () => h.vWing('interceptor', 7, 700, 32, { speed: 34 }));
      lm('spire', 5000, { u: -36, h: 260 });
      lm('floatrock', 5200, { u: 32, r: 26, y: 100 });
      at(5300, () => { h.fromBehind('interceptor', 6); h.divers('interceptor', 4); });
      gold(5600, 0, 48);
      at(5900, () => h.ringOf('drone', 12, 210, { r: 24, v: 34 }));
      lm('vinebridge', 6400, { u: 0, gap: 40, y: 96 });
      ring(6400, 0, 26);
      say(6800, 'moat', 'Nó đến rồi. Bóng tối cuối cùng. Đừng sợ, con — hãy để Eywa dẫn lối.', { prio: 1 });
      say(7050, 'eywa', '…', { hold: 0.8 });
    },
  },

  // =================================================================== 6 · Vùng xoáy
  {
    id: 6, key: 'flux', title: 'VÙNG XOÁY TỪ TRƯỜNG', place: 'VORTEX', act: 'PHẦN II · CHIẾN TRANH', en: 'THE FLUX VORTEX',
    blurb: 'Cưỡi Toruk dẫn đầu các tộc vào vùng từ trường nơi máy móc mù lòa. Chặn tàu Valkyrie chở bom đang nhắm vào Cây Linh Hồn.',
    music: 'stage6', bossAt: 7400, checkpoint: 3900, mount: 'toruk', wingMount: 'ikran', enemySet: 'rda', wing: ['neytiri', 'tsutey'], hq: 'norm', water: false, groundGlow: 0, weather: 'storm',
    palettes: {
      flux: pal({ zenith: '#1e2c3e', mid: '#4e6a6e', horizon: '#9ec0a8', fog: '#6a8a80', sun: '#e8fff0', cloud: '#c8d8d0', cloudShadow: '#3a4a50', hemiSky: '#8ab0a8', hemiGround: '#3a4a40', sunElev: 28, sunLight: 1.8, fogDensity: 0.0009, fogHeight: 0.005, fogFalloff: 0.014, cloudCover: 0.75, hemi: 1.2, glow: 0.15, exposure: 1.0 }),
      dark: pal({ zenith: '#141a2a', mid: '#3a4a5a', horizon: '#7a9a90', fog: '#4a6a68', sun: '#c8f0ff', cloud: '#a0b0b8', cloudShadow: '#262e38', sunElev: 18, sunLight: 1.4, fogDensity: 0.001, fogHeight: 0.005, fogFalloff: 0.014, cloudCover: 0.85, night: 0.3, bloom: 0.55 }),
    },
    paletteKeys: [{ at: 0, name: 'flux' }, { at: 4500, name: 'flux' }, { at: 7200, name: 'dark' }],
    segments: [{ at: 0, kind: 'floating' }],
    look: {},
    enemyTint: '#e8fff0',
    boss: { type: 'vehicle', kind: 'valkyrie', name: 'VALKYRIE', sub: 'Tàu con thoi chở bom — mục tiêu: Cây Linh Hồn', palette: { hull: '#b8bcc0', plate: '#7a8088', trim: '#c8b040', glow: '#46e0ff', core: '#ff5a2a' }, hp: 1.25, turrets: 6 },
    clearLines: [['norm', 'Valkyrie rơi rồi! Quả bom nổ trên không trung — không ai bị thương!'], ['tsutey', 'Hôm nay… các tộc đã bay cùng nhau.'], ['neytiri', 'Chưa xong đâu. Bộ giáp của Quaritch đang tiến vào rừng!']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      say(120, 'norm', 'Jake, radar của chúng mù hẳn trong vùng xoáy — nhưng của chúng ta cũng vậy. Bay bằng mắt!', { hold: 2.2 });
      say(520, 'tsutey', 'Hàng nghìn chiến binh đang theo Toruk Makto. Dẫn chúng ta đi!');
      at(560, () => h.rear());
      at(650, () => h.vWing('interceptor', 7, 760, 28));
      lm('fluxrocks', 1000, { u: 0, n: 6 });
      at(1000, () => h.snake('interceptor', 6, 700, 10, 30));
      ring(1300, 0, 30);
      lm('fluxrocks', 1600, { u: 0, n: 7 });
      at(1700, () => h.crossing('raptor', 4, 230, -1, 34));
      at(2000, () => { h.fromBehind('interceptor', 6); h.radio('neytiri', 'Chúng bắn từ phía sau! Toruk Makto, quay lại!', { prio: 1 }); });
      lm('floatrock', 2400, { u: -34, r: 30, y: 70 });
      lm('fluxrocks', 2700, { u: 0, n: 8 });
      at(2600, () => h.gunship());
      gold(2900, 0, 30);
      at(3200, () => h.ringOf('drone', 12, 210, { r: 24, v: 32 }));
      at(3400, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 30 }));
      check(3900);
      say(4000, 'norm', 'Tsu\'tey trúng đạn! Không — cậu ấy vẫn bay được, đang rút về phía sau!', { prio: 1 });
      lm('fluxrocks', 4300, { u: 0, n: 7 });
      at(4300, () => h.vWing('interceptor', 7, 700, 30, { speed: 36 }));
      lm('vinebridge', 4800, { u: 0, gap: 42, y: 96 });
      ring(4800, 0, 24);
      at(5000, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 3, 190, { v: 34 }); });
      lm('fluxrocks', 5500, { u: 0, n: 8 });
      at(5600, () => h.gunship());
      gold(5900, -30, 40);
      at(6100, () => h.ringOf('drone', 12, 210, { r: 26, v: 30 }));
      lm('fluxrocks', 6500, { u: 0, n: 6 });
      ring(6700, 0, 30);
      say(6950, 'norm', 'Valkyrie đã cất cánh! Chúng định thả bom vào Cây Linh Hồn!', { prio: 2 });
    },
  },

  // =================================================================== 7 · Cây Linh Hồn
  {
    id: 7, key: 'soul', title: 'CÂY LINH HỒN', place: 'VITRAYA RAMUNONG', act: 'PHẦN II · CHIẾN TRANH', en: 'THE TREE OF SOULS',
    blurb: 'Eywa đã đáp lời: muông thú cả rừng nổi dậy. Cưỡi thanator cùng Neytiri lao qua tầng rừng, đối đầu bộ giáp AMP của Quaritch.',
    music: 'stage7', bossAt: 7300, checkpoint: 3800, mount: 'thanator', enemySet: 'rda', wing: ['neytiri'], hq: 'moat', weather: 'sprites', groundGlow: 0.7,
    palettes: {
      dusk: pal({ zenith: '#203a6a', mid: '#8a8aa8', horizon: '#ffb07a', fog: '#8a7a70', sun: '#ffb070', sunElev: 8, sunAz: 30, sunLight: 2.0, glow: 0.5, fogDensity: 0.001, cloudCover: 0.45, night: 0.35, bloom: 0.55 }),
      night: pal({ ...NIGHT, horizon: '#3a2a5a', fog: '#1a1a34' }),
    },
    paletteKeys: [{ at: 0, name: 'dusk' }, { at: 3000, name: 'dusk' }, { at: 6200, name: 'night' }],
    segments: [{ at: 0, kind: 'forest', far: 130, farAt: 900 }],
    look: {},
    enemyTint: '#ffffff',
    boss: { type: 'vehicle', kind: 'amp', name: 'QUARITCH', sub: 'Bộ giáp AMP của đại tá Quaritch', palette: { hull: '#5e6658', plate: '#3a4036', trim: '#c8b040', glow: '#ff9a2a', core: '#ff3a2a' }, hp: 1.3, turrets: 6 },
    clearLines: [['neytiri', 'Hắn đã ngã xuống. Rừng của chúng ta… đã tự do.'], ['moat', 'Những Người Trời phải rời đi. Chỉ những ai có tấm lòng được ở lại.'], ['norm', 'Tàu của RDA đang rút khỏi Pandora. Chúng ta… thắng rồi, Jake.']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      sky(lm);
      say(120, 'moat', 'Eywa đã nghe lời con. Hãy nhìn quanh — cả khu rừng đang đứng lên.', { hold: 2.2 });
      say(520, 'neytiri', 'Lên lưng palulukan cùng ta! Nó sẽ chạy nhanh hơn bất cứ cỗ máy nào!');
      at(560, () => h.rear());
      at(650, () => h.vWing('interceptor', 5, 760, 14));
      at(1000, () => { h.turret(1400, -26); h.turret(1450, 26); });
      lm('trunk', 1300, { u: 18 }); lm('trunk', 1500, { u: -22 });
      ring(1600, 0, 8);
      at(1500, () => h.crossing('interceptor', 5, 220, 1, 14));
      at(1900, () => { h.fromBehind('interceptor', 5); h.radio('neytiri', 'Trực thăng bay thấp! Bắn vào cánh quạt!', { prio: 1 }); });
      lm('rootarch', 2300, { u: 0 });
      ring(2300, 0, 12);
      at(2400, () => { h.turret(2800, -30, { type: 'aagun' }); h.turret(2850, 30, { type: 'aagun' }); h.turret(2950, 0); });
      gold(2900, -20, 10);
      at(3200, () => h.holders('raptor', 2, 170, { v: 16 }));
      at(3400, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 12 }));
      check(3800);
      lm('soultree', 4200, { u: -170, view: 4000 });
      say(4000, 'moat', 'Cây Linh Hồn… Hãy bảo vệ nơi này bằng mọi giá.', { prio: 1 });
      at(4200, () => { h.turret(4600, -24); h.turret(4650, 24); h.turret(4700, -8); h.turret(4750, 8); });
      lm('trunk', 4900, { u: 0, h: 170 });
      at(5000, () => h.vWing('interceptor', 7, 700, 16, { speed: 34 }));
      at(5300, () => h.gunship());
      lm('trunk', 5500, { u: 24 }); lm('trunk', 5700, { u: -26 });
      gold(5800, 0, 14);
      at(5900, () => { h.turret(6300, -30, { type: 'aagun' }); h.turret(6350, 30, { type: 'aagun' }); });
      at(6200, () => h.ringOf('drone', 10, 200, { r: 12, v: 14 }));
      ring(6700, 0, 10);
      say(6900, 'neytiri', 'Bộ giáp của hắn! Quaritch đang tìm anh!', { prio: 1 });
    },
  },

  // =================================================================== 8 · Đoàn tàu thép
  {
    id: 8, key: 'train', title: 'ĐOÀN TÀU THÉP', place: 'VÙNG BIÊN RỪNG', act: 'PHẦN III · NHỮNG NGƯỜI CON', en: 'THE SUPPLY TRAIN',
    blurb: 'Nhiều năm sau, Người Trời quay lại. Gia đình Sully dẫn đầu các đợt phục kích — phá đoàn tàu tiếp tế chạy qua rừng.',
    music: 'stage8', bossAt: 7300, checkpoint: 3800, mount: 'ikran', enemySet: 'rda', wing: ['neytiri', 'neteyam'], hq: 'norm',
    palettes: {
      morning: pal({ zenith: '#3a62a8', mid: '#a0c0d8', horizon: '#e0e8e0', fog: '#a8b8b0', sun: '#fff0d8', sunElev: 18, sunAz: -40, fogDensity: 0.001, fogHeight: 0.0035, fogFalloff: 0.03, cloudCover: 0.6, hemiGround: '#3a4a3a' }),
      gray: pal({ zenith: '#4a5a78', mid: '#9aa8b8', horizon: '#c8ccc8', fog: '#9aa4a0', sun: '#f0ece0', sunElev: 26, sunLight: 2.1, fogDensity: 0.0011, cloudCover: 0.75, hemi: 1.2 }),
    },
    paletteKeys: [{ at: 0, name: 'morning' }, { at: 3500, name: 'morning' }, { at: 6500, name: 'gray' }],
    segments: [
      { at: 0, kind: 'forest', far: 150, farAt: 900, a1: 0, a2: 0, a3: 0 },
      { at: 3000, kind: 'plains', far: 170, farAt: 800, a1: 0, a2: 0, a3: 0 },
      { at: 5000, kind: 'forest', far: 150, farAt: 900, a1: 0, a2: 0, a3: 0 },
    ],
    look: {},
    enemyTint: '#ffffff',
    boss: { type: 'vehicle', kind: 'train', name: 'ĐOÀN TÀU BỌC THÉP', sub: 'Tàu tiếp tế vũ trang của RDA', palette: { hull: '#5a5e66', plate: '#3a3e46', trim: '#e8b830', glow: '#ff9a2a', core: '#46e0ff' }, hp: 1.35, turrets: 6 },
    clearLines: [['neteyam', 'Trúng rồi! Cả đoàn tàu đổ nhào!'], ['neytiri', 'Neteyam, bay sát bố con. Lần sau đừng liều như thế.'], ['norm', 'Jake… tình báo nói Quaritch đã trở lại. Hắn đang săn gia đình anh.']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      sky(lm);
      for (let s = 400; s < 7700; s += 410) lm('railway', s, { u: 0, len: 420, view: 3200 });
      say(120, 'norm', 'Đoàn tàu tiếp tế sẽ qua thung lũng trong mười phút. Đường ray chạy ngay dưới các cậu.', { hold: 2.2 });
      say(520, 'neteyam', 'Bố, con bay sát cánh trái! Lần này con không làm hỏng việc đâu!');
      at(560, () => h.rear());
      at(650, () => h.vWing('interceptor', 5, 760, 26));
      at(1000, () => { h.turret(1400, -18, { type: 'aagun' }); h.turret(1450, 18, { type: 'aagun' }); });
      at(1100, () => h.snake('dart', 6, 700, 10, 24));
      ring(1300, 0, 20);
      at(1600, () => h.crossing('interceptor', 5, 230, 1, 30));
      at(2000, () => { h.fromBehind('interceptor', 5); h.radio('neytiri', 'Trực thăng hộ tống! Hạ chúng trước khi tàu tới!', { prio: 1 }); });
      at(2400, () => h.holders('raptor', 2, 170, { v: 26 }));
      gold(2700, 0, 10);
      at(2800, () => h.rescue('neteyam'));
      at(3300, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 24 }));
      check(3800);
      at(3900, () => h.gunship());
      at(4300, () => { h.turret(4700, -24, { type: 'aagun' }); h.turret(4750, 24, { type: 'aagun' }); h.turret(4850, 0); });
      at(4600, () => h.vWing('interceptor', 7, 700, 28, { speed: 34 }));
      lm('trunk', 5200, { u: 30, h: 160 }); lm('trunk', 5350, { u: -28, h: 150 });
      lm('rootarch', 5600, { u: 0, R: 36 });
      ring(5600, 0, 16);
      at(5500, () => { h.fromBehind('interceptor', 6); h.divers('interceptor', 4); });
      gold(5900, 24, 30);
      at(6200, () => h.ringOf('drone', 12, 210, { r: 22, v: 26 }));
      ring(6700, 0, 14);
      say(6900, 'norm', 'Đoàn tàu vào thung lũng rồi! Tháo đầu máy trước khi nó tới căn cứ!', { prio: 1 });
    },
  },

  // =================================================================== 9 · Rạn san hô
  {
    id: 9, key: 'reef', title: 'ĐƯỜNG CỦA NƯỚC', place: 'RẠN SAN HÔ METKAYINA', act: 'PHẦN III · NHỮNG NGƯỜI CON', en: 'THE WAY OF WATER',
    blurb: 'Gia đình Sully lánh nạn ở tộc biển Metkayina. Cưỡi skimwing lướt trên rạn san hô — và bảo vệ các tulkun khỏi tàu săn của RDA.',
    music: 'stage9', bossAt: 7300, checkpoint: 3800, mount: 'skimwing', enemySet: 'sea', wing: ['neytiri', 'neteyam'], hq: 'tonowari', groundGlow: 0,
    palettes: {
      reef: pal({ zenith: '#1a6ac8', mid: '#8ad0f0', horizon: '#e8fafa', fog: '#b8e8f0', sun: '#fffaf0', sunElev: 42, sunAz: -20, fogDensity: 0.0006, fogHeight: 0.001, waterDeep: '#04506a', waterScatter: '#1ac8c8', cloudCover: 0.35, hemiGround: '#4a8a8a', light: '#fffaf0' }),
      noon: pal({ zenith: '#1a5ab8', mid: '#7ac0e8', horizon: '#d8f0f4', fog: '#a8d8e8', sun: '#fff4e0', sunElev: 30, fogDensity: 0.0007, waterDeep: '#063a5a', waterScatter: '#18a0b0', cloudCover: 0.45 }),
    },
    paletteKeys: [{ at: 0, name: 'reef' }, { at: 4500, name: 'reef' }, { at: 7200, name: 'noon' }],
    segments: [
      { at: 0, kind: 'water', islands: true, shoreL: 260, style: 'fields' },
      { at: 2400, kind: 'water', islands: true, style: 'fields' },
      { at: 5400, kind: 'water', islands: true, shoreR: 320, style: 'fields' },
    ],
    look: {},
    enemyTint: '#ffffff',
    boss: { type: 'vehicle', kind: 'whaler', name: 'TÀU SĂN TULKUN', sub: 'Tàu săn của thuyền trưởng Scoresby', palette: { hull: '#3a4048', plate: '#5e6658', trim: '#e8b830', glow: '#ff9a2a', core: '#ff3a2a' }, hp: 1.4, turrets: 6 },
    clearLines: [['tonowari', 'Tulkun là anh em của chúng ta. Hôm nay, người rừng đã bảo vệ họ.'], ['neteyam', 'Payakan an toàn rồi! Lo\'ak mà thấy cái này thì…'], ['neytiri', 'Nhưng con tàu lớn nhất vẫn còn đó. Và Quaritch ở trên nó.']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      sky(lm);
      say(120, 'tonowari', 'Người rừng muốn học đường của nước? Vậy thì cưỡi skimwing — và đừng để nó hất các ngươi xuống biển.', { hold: 2.4 });
      say(560, 'neytiri', 'Sát mặt nước, Jake. Nhẹ thôi, nhẹ thôi…');
      lm('marui', 900, { u: -170, view: 3500 });
      lm('mangrove', 1300, { u: 120 });
      at(560, () => h.rear());
      at(650, () => h.vWing('dart', 5, 760, 14));
      at(1000, () => h.snake('dart', 6, 700, 10, 12));
      ring(1300, 0, 8);
      lm('seacliff', 1900, { u: 220, h: 110, view: 3500 });
      at(1600, () => h.crossing('interceptor', 5, 230, 1, 18));
      lm('tulkun', 2300, { u: -90, view: 3500 });
      say(2200, 'tonowari', 'Tulkun đang trở về vịnh. Đó là gia đình của chúng ta — mỗi một con.', { prio: 1 });
      at(2400, () => { h.turret(2800, -30); h.turret(2850, 30); });
      at(2700, () => { h.fromBehind('interceptor', 5); h.radio('neteyam', 'Thuyền máy! Chúng đang đuổi theo tulkun!', { prio: 1 }); });
      h.stack(3000, -26); h.stack(3150, 30);
      gold(3100, 0, 6);
      at(3300, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 16 }));
      check(3800);
      h.arch(4100, 0);
      ring(4100, 0, 14);
      at(4000, () => { h.turret(4400, -24, { type: 'aagun' }); h.turret(4450, 24, { type: 'aagun' }); h.turret(4550, 0); });
      at(4500, () => h.gunship());
      lm('tulkun', 4900, { u: 110, view: 3500 });
      at(4900, () => h.vWing('interceptor', 7, 700, 18, { speed: 34 }));
      h.stack(5300, 20); h.stack(5450, -30);
      at(5400, () => { h.turret(5800, -30); h.turret(5850, 30); h.turret(5900, -10, { type: 'aagun' }); });
      gold(5700, -24, 14);
      at(6000, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 2, 180, { v: 20 }); });
      lm('mangrove', 6300, { u: -150 });
      at(6300, () => h.ringOf('drone', 10, 200, { r: 14, v: 16 }));
      ring(6700, 0, 10);
      say(6900, 'tonowari', 'Tàu săn đang kéo lưới quanh một tulkun mẹ! Ngăn chúng lại!', { prio: 1 });
    },
  },

  // =================================================================== 10 · Trận chiến trên biển
  {
    id: 10, key: 'sea', title: 'TRẬN CHIẾN TRÊN BIỂN', place: 'VỊNH NGOÀI KHƠI', act: 'PHẦN III · NHỮNG NGƯỜI CON', en: 'BATTLE AT SEA', final: true,
    blurb: 'Quaritch bắt các con của Jake làm con tin. Tộc Metkayina và các tulkun cùng ra khơi — trận cuối cùng chống lại kỳ hạm SeaDragon.',
    music: 'stage10', bossAt: 7500, checkpoint: 4000, mount: 'skimwing', enemySet: 'sea', wing: ['neytiri', 'neteyam'], hq: 'tonowari', groundGlow: 0, weather: 'embers',
    palettes: {
      day: pal({ zenith: '#2a5aa8', mid: '#90b8d8', horizon: '#e8e0d0', fog: '#b0c8d0', sun: '#fff0d8', sunElev: 22, sunAz: -60, fogDensity: 0.0007, fogHeight: 0.001, waterDeep: '#063a5a', waterScatter: '#1890a0', cloudCover: 0.5 }),
      sunset: pal({ zenith: '#2a3478', mid: '#b07a88', horizon: '#ff8a4a', fog: '#c87a6a', sun: '#ffa060', cloud: '#ffb8a0', cloudShadow: '#6a4a6a', sunElev: 5, sunAz: -60, sunLight: 2.1, glow: 0.65, fogDensity: 0.0008, waterDeep: '#141a40', waterScatter: '#6a3a50', cloudCover: 0.45, bloom: 0.6, night: 0.35 }),
    },
    paletteKeys: [{ at: 0, name: 'day' }, { at: 3000, name: 'day' }, { at: 7000, name: 'sunset' }],
    segments: [
      { at: 0, kind: 'water', islands: true, style: 'fields' },
      { at: 4000, kind: 'water', style: 'fields' },
    ],
    look: {},
    enemyTint: '#ffd8d8',
    boss: { type: 'vehicle', kind: 'seadragon', final: true, name: 'SEADRAGON', sub: 'Kỳ hạm của RDA — Quaritch trên boong', palette: { hull: '#3a3e46', plate: '#5a5e66', trim: '#e8b830', glow: '#ff5a2a', core: '#ff2d55' }, hp: 1.7, turrets: 8 },
    clearLines: [['neytiri', 'Bọn trẻ an toàn rồi… Chúng ta vẫn còn có nhau.'], ['tonowari', 'Biển đã nhận lấy con tàu của chúng. Các ngươi giờ là người của rạn san hô.'], ['norm', 'RDA rút lui hoàn toàn. Pandora… lại thở được rồi.'], ['eywa', 'Nước nối liền mọi thứ. Trước khi sinh ra, và sau khi mất đi.']],
    script(h) {
      const { at, say, ring, gold, check, lm } = h;
      sky(lm, 7000);
      say(120, 'tonowari', 'Các tộc biển đã sẵn sàng. Hôm nay, rạn san hô sẽ chiến đấu như một.', { hold: 2.4 });
      say(560, 'neteyam', 'Lo\'ak và Kiri còn ở trên tàu đó. Con sẽ mang họ về!');
      at(600, () => h.rear());
      lm('tulkun', 1000, { u: -100, view: 3500 });
      at(650, () => h.vWing('interceptor', 7, 760, 16));
      at(1000, () => { h.turret(1400, -30); h.turret(1450, 30); h.turret(1500, 0, { type: 'aagun' }); });
      ring(1300, 0, 10);
      at(1500, () => h.snake('interceptor', 6, 700, -10, 18));
      at(1900, () => { h.fromBehind('interceptor', 6); h.radio('neytiri', 'Trực thăng phía sau! Lướt sát nước, chúng khó ngắm hơn!', { prio: 1 }); });
      h.stack(2200, 24); h.stack(2350, -28);
      at(2300, () => h.gunship());
      gold(2700, 0, 16);
      at(2900, () => h.ringOf('drone', 12, 210, { r: 16, v: 18 }));
      lm('tulkun', 3200, { u: 120, view: 3500 });
      at(3300, () => h.holders('carrier', 1, 150, { carry: 'laser', carryIndex: 0, stay: 8, v: 16 }));
      check(4000);
      say(4100, 'tonowari', 'Payakan đang đâm vào mạn tàu! Mở đường cho nó!', { prio: 1 });
      at(4100, () => { h.turret(4500, -26, { type: 'aagun' }); h.turret(4550, 26, { type: 'aagun' }); h.turret(4650, -8); h.turret(4700, 8); });
      at(4500, () => h.vWing('interceptor', 7, 700, 20, { speed: 36 }));
      h.arch(4900, 0);
      ring(4900, 0, 14);
      at(5000, () => h.gunship());
      at(5400, () => { h.fromBehind('interceptor', 6); h.holders('raptor', 3, 190, { v: 22 }); });
      gold(5700, 24, 20);
      at(6000, () => { h.turret(6400, -30); h.turret(6450, 30); h.turret(6500, 0, { type: 'aagun' }); });
      at(6300, () => h.ringOf('drone', 12, 210, { r: 16, v: 18 }));
      ring(6800, 0, 12);
      at(6800, () => h.gunship());
      say(7100, 'quaritch', 'Sully! Ngươi trốn ra tận biển mà nghĩ ta không tìm được à?', { prio: 2 });
    },
  },
];

// HUD / flow code reads `city` (location line) and `country` (act line).
for (const st of STAGES) { st.city = st.place; st.country = st.act; }

export const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));
