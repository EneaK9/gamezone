// Terrain height: an analytic function of the layout, baked into a grid for fast lookup.

import { clamp, fbm, lerp, makeNoise2, smoothstep } from "../core/math";
import {
  BANDIT_CAMP,
  FARM_SW,
  PADDIES,
  PAGODA_HILL,
  ROADS,
  SHRINE_TOP,
  VILLAGE_GROUND,
  VILLAGE_RECT,
  WATERFALL,
  WORLD_HALF,
  rectDist,
  riverQuery,
  roadQuery,
} from "./layout";

const noise = makeNoise2(7);
const noiseB = makeNoise2(31);

const BOWL = { x: -15, z: -25, r0: 196, r1: 262 };

/** Water surface height of the river at a given z (upper river is above the falls). */
export function riverWaterY(z: number): number {
  return z < WATERFALL.z - 3 ? WATERFALL.top : 0;
}

/** Paddy grid: returns 0 inside a basin, 1 on a ridge. */
export function paddyRidge(x: number, z: number): number {
  const cw = 12.6;
  const cd = 10.4;
  const fx = (((x - PADDIES.x0) % cw) + cw) % cw;
  const fz = (((z - PADDIES.z0) % cd) + cd) % cd;
  const ex = Math.min(fx, cw - fx);
  const ez = Math.min(fz, cd - fz);
  return 1 - smoothstep(0.35, 0.8, Math.min(ex, ez));
}

/** Terrace level for the paddy containing (x, z): rows step down toward the river. */
export function paddyLevel(x: number, _z: number): number {
  const col = Math.floor((x - PADDIES.x0) / 12.6);
  return 1.25 + col * 0.35;
}

/** Terrain before any flattening: rolling hills, mountains, cliffs and the two hills. */
function natural(x: number, z: number): number {
  let h = fbm(noise, x * 0.0055, z * 0.0055, 4) * 5.5 + fbm(noiseB, x * 0.03, z * 0.03, 3) * 0.7 + 2.2;
  h += smoothstep(70, 150, x) * 4.5;
  const br = Math.hypot(x - BOWL.x, z - BOWL.z);
  const ridge = 1 - Math.abs(noise(x * 0.012, z * 0.012));
  const mountain = smoothstep(BOWL.r0, BOWL.r1, br);
  h += mountain * (48 + fbm(noise, x * 0.008 + 11, z * 0.008 - 4, 5) * 26 + ridge * 18);
  const nearFallsRiver = 1 - smoothstep(18, 46, Math.abs(x - WATERFALL.x));
  const northOfFalls = smoothstep(WATERFALL.z + 4, WATERFALL.z - 4, z);
  h = lerp(h, Math.max(h, WATERFALL.top + 3 + fbm(noiseB, x * 0.05, z * 0.05, 2) * 1.5), northOfFalls * nearFallsRiver);
  const ds = Math.hypot(x - SHRINE_TOP.x, z - SHRINE_TOP.z);
  h += 13 * Math.exp(-Math.pow(ds / 46, 2)) + 4 * Math.exp(-Math.pow(ds / 90, 2));
  const dp = Math.hypot(x - PAGODA_HILL.x, z - PAGODA_HILL.z);
  h += 2.2 * Math.exp(-Math.pow(dp / 24, 2));
  return h;
}

let shrineLevel: number | null = null;
let pagodaLevel: number | null = null;
/** Plateau heights follow the natural hilltops so flattening never digs a pit. */
export function plateauLevels() {
  shrineLevel ??= natural(SHRINE_TOP.x, SHRINE_TOP.z) - 0.8;
  pagodaLevel ??= natural(PAGODA_HILL.x, PAGODA_HILL.z) + 0.2;
  return { shrine: shrineLevel, pagoda: pagodaLevel };
}

export function computeHeight(x: number, z: number): number {
  let h = natural(x, z);
  const hill = 13 * Math.exp(-Math.pow(Math.hypot(x - SHRINE_TOP.x, z - SHRINE_TOP.z) / 46, 2)) + 4 * Math.exp(-Math.pow(Math.hypot(x - SHRINE_TOP.x, z - SHRINE_TOP.z) / 90, 2));
  const lv = plateauLevels();
  const ds = Math.hypot(x - SHRINE_TOP.x, z - SHRINE_TOP.z);
  h = lerp(h, lv.shrine, 1 - smoothstep(SHRINE_TOP.r, SHRINE_TOP.r + 8, ds));
  const dp = Math.hypot(x - PAGODA_HILL.x, z - PAGODA_HILL.z);
  h = lerp(h, lv.pagoda, 1 - smoothstep(PAGODA_HILL.r, PAGODA_HILL.r + 9, dp));

  // The walled village is level ground.
  const dv = rectDist(VILLAGE_RECT, x, z);
  const villageFlat = VILLAGE_GROUND + fbm(noiseB, x * 0.05, z * 0.05, 2) * 0.08;
  h = lerp(h, villageFlat, 1 - smoothstep(0, 26, dv));

  // Farm fields.
  const dsw = rectDist(FARM_SW, x, z);
  h = lerp(h, 1.5 + fbm(noiseB, x * 0.04, z * 0.04, 2) * 0.15, 1 - smoothstep(0, 16, dsw));
  const dpad = rectDist(PADDIES, x, z);
  if (dpad < 20) {
    const inside = 1 - smoothstep(0, 12, dpad);
    const level = paddyLevel(clamp(x, PADDIES.x0, PADDIES.x1 - 0.01), z);
    const basin = level - 0.1 + paddyRidge(x, z) * 0.32;
    h = lerp(h, dpad <= 0 ? basin : level + 0.2, inside);
  }

  // Bandit camp clearing.
  const dc = Math.hypot(x - BANDIT_CAMP.x, z - BANDIT_CAMP.z);
  h = lerp(h, computeCampLevel(), 1 - smoothstep(BANDIT_CAMP.r * 0.6, BANDIT_CAMP.r + 10, dc));

  // Roads: smooth out bumps along paths outside the village.
  const rq = roadQuery(x, z);
  if (rq.edgeDist < 3 && dv > 0) {
    const smooth = fbm(noise, x * 0.0055, z * 0.0055, 2) * 5.5 + 2.2 + smoothstep(70, 150, x) * 4.5 + hill;
    const k = (1 - smoothstep(-1, 3, rq.edgeDist)) * 0.35;
    h = lerp(h, Math.max(smooth, h - 1.5), k);
  }

  // River channel, carved last so it always wins.
  const rv = riverQuery(x, z);
  const waterY = riverWaterY(rv.cz);
  const inVillageReach = rv.cz > -112 && rv.cz < 110;
  // West bank inside the walls is a stone embankment: near-vertical.
  const bankW = inVillageReach && rv.side < 0 ? 0.7 : 4.5;
  const t = rv.dist / rv.hw;
  const bed = waterY - rv.depth * (1 - 0.72 * Math.min(1, t * t));
  const k = smoothstep(rv.hw * 0.92, rv.hw + bankW, rv.dist);
  const bankTop = Math.max(h, waterY + 0.9);
  h = lerp(bed, bankTop, k);

  // World edge: keep rising so nothing looks cut off.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += smoothstep(WORLD_HALF - 40, WORLD_HALF, edge) * 25;
  return h;
}

let campLevel: number | null = null;
function computeCampLevel(): number {
  if (campLevel === null) {
    campLevel = fbm(noise, BANDIT_CAMP.x * 0.0055, BANDIT_CAMP.z * 0.0055, 4) * 5.5 + 2.4;
  }
  return campLevel;
}

// ——— baked grid ————————————————————————————————————————————————————

export class HeightGrid {
  readonly res: number;
  readonly size: number;
  readonly min: number;
  readonly data: Float32Array;

  constructor(res = 1) {
    this.res = res;
    this.min = -WORLD_HALF;
    this.size = Math.round((WORLD_HALF * 2) / res) + 1;
    this.data = new Float32Array(this.size * this.size);
    for (let j = 0; j < this.size; j++) {
      const z = this.min + j * res;
      for (let i = 0; i < this.size; i++) {
        this.data[j * this.size + i] = computeHeight(this.min + i * res, z);
      }
    }
  }

  /** Bilinear height at any point. */
  height(x: number, z: number): number {
    const fx = clamp((x - this.min) / this.res, 0, this.size - 1.001);
    const fz = clamp((z - this.min) / this.res, 0, this.size - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const s = this.size;
    const d = this.data;
    const a = d[j * s + i];
    const b = d[j * s + i + 1];
    const c = d[(j + 1) * s + i];
    const e = d[(j + 1) * s + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + e) * tx * tz;
  }

  /** Slope magnitude (rise over run). */
  slope(x: number, z: number): number {
    const e = this.res;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
}

/** Road mask 0..1 (1 on the road surface) for texturing. */
export function roadMask(x: number, z: number): { dirt: number; stone: number } {
  let dirt = 0;
  let stone = 0;
  for (const r of ROADS) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      let t = ((x - ax) * dx + (z - az) * dz) / len2;
      t = clamp(t, 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t)) - r.width / 2;
      const m = 1 - smoothstep(-0.6, 1.2, d);
      if (r.stone) stone = Math.max(stone, m);
      else dirt = Math.max(dirt, m);
    }
  }
  return { dirt, stone };
}
