// Boss manager: one boss instance per stage, built from the stage's boss config (see stages.js).
// Archetypes share one interface: start(), stop(), update(dt), active, phase, hp, maxHp, focus, head, botTarget().
import { SerpentBoss } from './serpent.js';
import { WarshipBoss } from './warship.js';
import { CoreBoss } from './coreboss.js';

const TYPES = { serpent: SerpentBoss, warship: WarshipBoss, core: CoreBoss };
export const BOSS = { inst: null, cfg: null };
const cache = new Map();

export function setupBoss(stage) {
  if (BOSS.inst && BOSS.inst.active) BOSS.inst.stop();
  if (!cache.has(stage.key)) cache.set(stage.key, new TYPES[stage.boss.type](stage.boss));
  BOSS.inst = cache.get(stage.key);
  BOSS.cfg = stage.boss;
  return BOSS.inst;
}
export function initBoss(stage) { setupBoss(stage); }
