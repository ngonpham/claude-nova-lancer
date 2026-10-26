// Boss manager: one boss instance per stage, built from the stage's boss config (see stages.js).
// Archetypes (creature, vehicle) share one interface: start(), stop(), update(dt), active, phase, hp, maxHp, focus, head, botTarget().
import { CreatureBoss } from './creature.js';
import { VehicleBoss } from './vehicle.js';

const TYPES = { creature: CreatureBoss, vehicle: VehicleBoss };
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
