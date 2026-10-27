// placeholder until the linh vật mounts land: wraps the old aircraft so the game still builds
import { buildShipModel } from './ship.js';
export const MOUNTS = ['rong', 'phuong', 'ngua', 'chimlac'];
export const RIDER_SCHEMES = {};
export function buildMount(kind, riderId = 'player') {
  const m = buildShipModel(riderId === 'player' ? 'player' : riderId);
  return { ...m, kind, rider: riderId, noEngine: false, ground: false, radius: 4, animate() {} };
}
