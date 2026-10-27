// Landmark registry: monuments of the ten eras (Văn Lang → Nguyễn), built procedurally from primitives.
// The builders live in landmarks_a.js (eras 1–5) and landmarks_b.js (eras 6–10); see lmkit.js for the format.
// Landmarks are heritage to protect: they are never destroyed and never targeted.
import { BUILDERS_A } from './landmarks_a.js';
import { BUILDERS_B } from './landmarks_b.js';

export const BUILDERS = { ...BUILDERS_A, ...BUILDERS_B };

// Builders whose geometry depends only on the name and options are cached; `dynamic` ones are rebuilt each time.
const cache = new Map();
export function buildLandmark(name, o = {}) {
  const fn = BUILDERS[name];
  if (!fn) { console.warn('unknown landmark ' + name); return { parts: [], colliders: [] }; }
  if (fn.dynamic) return fn(o);
  const { s, ...rest } = o;
  const key = name + JSON.stringify(rest);
  if (!cache.has(key)) cache.set(key, fn(o));
  return cache.get(key);
}
