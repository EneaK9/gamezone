// The village plan: river, roads, plazas, landmark positions and building plots.
// Everything is in metres; x runs east, z runs south, y is up. Water level is y = 0.

import { distToSegment, makeRng } from "../core/math";

export const WORLD_HALF = 280;
export const WATER_LEVEL = 0;
export const VILLAGE_GROUND = 1.2;

// ——— river ————————————————————————————————————————————————————————

/** Control points (x, z, half-width, bed depth below water). */
const RIVER_CTRL: [number, number, number, number][] = [
  [50, -300, 4.5, 1.2],
  [52, -214, 5, 1.4],
  [55, -170, 5.5, 1.5],
  [58, -122, 7, 0.42], // stepping stones: wide and shallow
  [61, -78, 6.5, 1.6],
  [58, -36, 6.5, 1.7],
  [60, 0, 7, 1.8],
  [63, 38, 7, 1.8],
  [58, 72, 7, 1.7],
  [66, 128, 8, 1.6],
  [71, 180, 8.5, 1.5],
  [64, 300, 9, 1.4],
];

export interface RiverSample {
  x: number;
  z: number;
  hw: number;
  depth: number;
  /** Unit flow direction. */
  dx: number;
  dz: number;
  /** Distance along the river from its source (m). */
  s: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sampleRiver(): RiverSample[] {
  const out: RiverSample[] = [];
  const n = RIVER_CTRL.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = RIVER_CTRL[Math.max(0, i - 1)];
    const p1 = RIVER_CTRL[i];
    const p2 = RIVER_CTRL[i + 1];
    const p3 = RIVER_CTRL[Math.min(n - 1, i + 2)];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(4, Math.ceil(segLen / 2));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      out.push({
        x: catmull(p0[0], p1[0], p2[0], p3[0], t),
        z: catmull(p0[1], p1[1], p2[1], p3[1], t),
        // Smooth (not Catmull) interpolation for width/depth keeps them from overshooting.
        hw: p1[2] + (p2[2] - p1[2]) * (t * t * (3 - 2 * t)),
        depth: p1[3] + (p2[3] - p1[3]) * (t * t * (3 - 2 * t)),
        dx: 0,
        dz: 0,
        s: 0,
      });
    }
  }
  const last = RIVER_CTRL[n - 1];
  out.push({ x: last[0], z: last[1], hw: last[2], depth: last[3], dx: 0, dz: 0, s: 0 });
  let s = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].dx = (b.x - a.x) / len;
    out[i].dz = (b.z - a.z) / len;
    if (i > 0) s += Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
    out[i].s = s;
  }
  return out;
}

export const RIVER = sampleRiver();

/** Signed info about the nearest point on the river centerline. */
export function riverQuery(x: number, z: number) {
  // The river runs roughly north-south, so start from the sample nearest in z.
  let best = Infinity;
  let bi = 0;
  let bt = 0;
  // Coarse search on every 4th sample, then refine.
  for (let i = 0; i < RIVER.length - 1; i += 4) {
    const dz = RIVER[i].z - z;
    if (Math.abs(dz) > 60) continue;
    const d = Math.hypot(RIVER[i].x - x, dz);
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  best = Infinity;
  const lo = Math.max(0, bi - 6);
  const hi = Math.min(RIVER.length - 2, bi + 6);
  let seg = lo;
  for (let i = lo; i <= hi; i++) {
    const a = RIVER[i];
    const b = RIVER[i + 1];
    const r = distToSegment(x, z, a.x, a.z, b.x, b.z);
    if (r.d < best) {
      best = r.d;
      seg = i;
      bt = r.t;
    }
  }
  const a = RIVER[seg];
  const b = RIVER[seg + 1];
  const hw = a.hw + (b.hw - a.hw) * bt;
  const depth = a.depth + (b.depth - a.depth) * bt;
  const cx = a.x + (b.x - a.x) * bt;
  const cz = a.z + (b.z - a.z) * bt;
  // Which bank: + east of the flow, - west.
  const side = Math.sign((x - cx) * -a.dz + (z - cz) * a.dx) || 1;
  return { dist: best, hw, depth, cx, cz, side, dx: a.dx, dz: a.dz, s: a.s + (b.s - a.s) * bt };
}

// ——— roads ————————————————————————————————————————————————————————

export interface Road {
  pts: [number, number][];
  width: number;
  /** Paved in stone (else packed dirt). */
  stone?: boolean;
  /** Flatten terrain under the road (village streets). */
  flatten?: boolean;
}

export const ROADS: Road[] = [
  { pts: [[-240, 6], [-200, 3], [-165, 0], [46, 0]], width: 9, flatten: true }, // main street
  { pts: [[-40, -121], [-40, 115]], width: 7, flatten: true }, // cross street
  { pts: [[38, -76], [40, -30], [40, 30], [41, 106]], width: 5, flatten: true }, // riverside lane
  { pts: [[-150, -45], [30, -45]], width: 4.5, flatten: true },
  { pts: [[-150, 45], [30, 45]], width: 4.5, flatten: true },
  { pts: [[-110, -110], [-110, 108]], width: 4.5, flatten: true },
  { pts: [[15, -110], [15, 108]], width: 4.5, flatten: true },
  // east bank
  { pts: [[74, 0], [84, -3], [96, -10], [108, -22], [120, -32], [131, -40], [142, -44]], width: 3.6, stone: true }, // torii path
  { pts: [[76, 3], [92, 16], [104, 30], [112, 38]], width: 3 }, // to pagoda
  { pts: [[76, 2], [79, 30], [82, 60], [92, 84], [104, 92]], width: 3.4 }, // east bank south
  // south
  { pts: [[-40, 115], [-38, 124], [0, 128], [55, 128], [78, 128], [96, 112], [104, 96]], width: 3.8 },
  { pts: [[-40, 124], [-90, 130], [-120, 142]], width: 3 },
  // north
  { pts: [[-40, -121], [-58, -134], [-96, -152], [-128, -164], [-140, -168]], width: 3 }, // to bandit camp
  { pts: [[-40, -121], [0, -124], [48, -122]], width: 3 }, // to stepping stones
  { pts: [[68, -122], [66, -150], [60, -180], [56, -200]], width: 2.6 }, // to waterfall
  { pts: [[70, -118], [92, -112], [104, -104]], width: 2.4 }, // into bamboo
];

export function roadQuery(x: number, z: number) {
  let best = Infinity;
  let road: Road | null = null;
  for (const r of ROADS) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const d = distToSegment(x, z, ax, az, bx, bz).d - r.width / 2;
      if (d < best) {
        best = d;
        road = r;
      }
    }
  }
  return { edgeDist: best, road };
}

// ——— plazas & flat zones ——————————————————————————————————————————

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const rectContains = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

export const rectDist = (r: Rect, x: number, z: number) => {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
};

/** The walled village sits on flat ground at VILLAGE_GROUND. */
export const VILLAGE_RECT: Rect = { x0: -158, z0: -118, x1: 47, z1: 112 };

export const SQUARE: Rect = { x0: -57, z0: -13, x1: -23, z1: 13 };
export const DOJO_YARD: Rect = { x0: -54, z0: -99, x1: -26, z1: -71 };
export const SHRINE_TOP = { x: 142, z: -52, r: 17, h: 15.5 };
export const PAGODA_HILL = { x: 112, z: 44, r: 11, h: 4.2 };

export const PADDIES: Rect = { x0: 84, z0: 104, x1: 160, z1: 156 };
export const FARM_SW: Rect = { x0: -128, z0: 118, x1: -52, z1: 168 };
export const BANDIT_CAMP = { x: -140, z: -168, r: 22 };
export const BAMBOO = { x: 106, z: -122, r: 34 };
export const WATERFALL = { x: 52, z: -206, top: 14 };

/** Wall runs as polylines; each has gate gaps. */
export const WALLS: { a: [number, number]; b: [number, number]; gates: { at: number; width: number }[] }[] = [
  { a: [-158, -118], b: [-158, 112], gates: [{ at: 118, width: 9 }] }, // west wall, gate at z=0
  { a: [-158, -118], b: [47, -118], gates: [{ at: 118, width: 7 }] }, // north wall, gate at x=-40
  { a: [-158, 112], b: [47, 112], gates: [{ at: 118, width: 7 }] }, // south wall, gate at x=-40
];

// ——— building plots ——————————————————————————————————————————————————

export type BuildingKind =
  | "machiya"
  | "shop"
  | "house"
  | "kura"
  | "minka"
  | "dojo"
  | "inn"
  | "teahouse"
  | "guardpost"
  | "shrine"
  | "pagoda"
  | "yatai";

export type ShopSign = "smith" | "medicine" | "armor" | "goods" | "tea" | "inn" | "noodles" | "dango";

export interface Plot {
  kind: BuildingKind;
  x: number;
  z: number;
  /** Width along the street frontage. */
  w: number;
  /** Depth away from the street. */
  d: number;
  /** Which way the front faces: 0 = +z (south), 1 = +x, 2 = -z, 3 = -x. */
  face: 0 | 1 | 2 | 3;
  stories?: number;
  sign?: ShopSign;
  seed: number;
  /** Ground height to build on (filled in by the terrain pass). */
  y?: number;
}

/** Axis-aligned footprint of a plot. */
export function plotRect(p: Plot, pad = 0): Rect {
  const alongX = p.face === 0 || p.face === 2;
  const hx = (alongX ? p.w : p.d) / 2 + pad;
  const hz = (alongX ? p.d : p.w) / 2 + pad;
  return { x0: p.x - hx, z0: p.z - hz, x1: p.x + hx, z1: p.z + hz };
}

const FIXED_PLOTS: Plot[] = [
  // main street, north side (fronts face south onto the street edge at z = -4.5)
  { kind: "house", x: -141, z: -10.5, w: 9, d: 8, face: 0, seed: 1 },
  { kind: "machiya", x: -129, z: -10.5, w: 10, d: 9, face: 0, stories: 2, seed: 2 },
  { kind: "machiya", x: -118, z: -10.5, w: 9, d: 9, face: 0, stories: 2, seed: 3 },
  { kind: "machiya", x: -101, z: -10.5, w: 10, d: 9, face: 0, stories: 2, seed: 4 },
  { kind: "shop", x: -86, z: -11, w: 14, d: 10, face: 0, sign: "smith", seed: 5 },
  { kind: "machiya", x: -70, z: -10.5, w: 10, d: 9, face: 0, stories: 2, seed: 6 },
  { kind: "shop", x: -12, z: -10.5, w: 11, d: 9, face: 0, sign: "armor", seed: 7 },
  { kind: "machiya", x: 0, z: -10.5, w: 10, d: 9, face: 0, stories: 2, seed: 8 },
  { kind: "machiya", x: 24, z: -10.5, w: 10, d: 9, face: 0, stories: 2, seed: 10 },
  // main street, south side (fronts face north onto z = +4.5)
  { kind: "machiya", x: -128, z: 10.5, w: 10, d: 9, face: 2, stories: 2, seed: 12 },
  { kind: "machiya", x: -118, z: 10.5, w: 9, d: 9, face: 2, stories: 2, seed: 13 },
  { kind: "kura", x: -101, z: 11, w: 8, d: 8, face: 2, seed: 14 },
  { kind: "machiya", x: -89, z: 10.5, w: 10, d: 9, face: 2, stories: 2, seed: 15 },
  { kind: "shop", x: -72, z: 10.5, w: 11, d: 9, face: 2, sign: "medicine", seed: 16 },
  { kind: "machiya", x: -12, z: 10.5, w: 10, d: 9, face: 2, stories: 2, seed: 17 },
  { kind: "shop", x: 4, z: 10.5, w: 12, d: 9, face: 2, sign: "goods", seed: 18 },
  { kind: "machiya", x: 24, z: 10.5, w: 10, d: 9, face: 2, stories: 2, seed: 19 },
  // landmarks
  { kind: "dojo", x: -40, z: -92, w: 18, d: 12, face: 0, seed: 20 },
  { kind: "inn", x: -40, z: 79, w: 20, d: 14, face: 2, stories: 2, sign: "inn", seed: 21 },
  { kind: "teahouse", x: 0, z: 60, w: 12, d: 9, face: 2, sign: "tea", seed: 22 },
  { kind: "guardpost", x: -142, z: 13, w: 9, d: 7, face: 2, seed: 23 },
  { kind: "yatai", x: -28, z: 9, w: 2.6, d: 1.6, face: 2, sign: "noodles", seed: 24 },
  { kind: "yatai", x: -52, z: -9, w: 2.4, d: 1.5, face: 0, sign: "dango", seed: 25 },
  { kind: "shrine", x: 142, z: -55, w: 11, d: 9, face: 0, seed: 26 },
  { kind: "pagoda", x: 112, z: 44, w: 7, d: 7, face: 3, seed: 27 },
  { kind: "minka", x: 100, z: 86, w: 12, d: 9, face: 1, seed: 28 },
  { kind: "minka", x: -100, z: 128, w: 11, d: 8, face: 2, seed: 29 },
  { kind: "minka", x: -70, z: 150, w: 10, d: 8, face: 0, seed: 30 },
];

/** Places no generic house may go. */
const RESERVED: Rect[] = [
  { x0: -60, z0: -16, x1: -20, z1: 16 }, // square
  { x0: -58, z0: -104, x1: -22, z1: -68 }, // dojo
  { x0: -56, z0: 64, x1: -22, z1: 92 }, // inn + garden
  { x0: -9, z0: 49, x1: 9, z1: 67 }, // tea house
  { x0: -158, z0: -12, x1: -130, z1: 26 }, // gate & guard post
  { x0: 30, z0: -118, x1: 50, z1: 112 }, // riverside
];

function overlaps(a: Rect, b: Rect) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

function roadClear(r: Rect): boolean {
  // Sample the rect; nothing may sit on a road.
  for (let x = r.x0; x <= r.x1; x += 1.5) {
    for (let z = r.z0; z <= r.z1; z += 1.5) {
      if (roadQuery(x, z).edgeDist < 0.8) return false;
    }
  }
  return true;
}

/** Fill the residential lanes with houses. Deterministic. */
function generatePlots(): Plot[] {
  const rng = makeRng(20260925);
  const plots = [...FIXED_PLOTS];
  const taken = plots.map((p) => plotRect(p, 1.2));
  const lanes: { axis: "x" | "z"; at: number; from: number; to: number; width: number }[] = [
    { axis: "x", at: -45, from: -150, to: 28, width: 4.5 },
    { axis: "x", at: 45, from: -150, to: 28, width: 4.5 },
    { axis: "z", at: -110, from: -112, to: 106, width: 4.5 },
    { axis: "z", at: 15, from: -112, to: 106, width: 4.5 },
    { axis: "x", at: -80, from: -150, to: 28, width: 0 }, // plots only (no road)
    { axis: "x", at: 84, from: -150, to: 28, width: 0 },
  ];
  let seed = 100;
  for (const lane of lanes) {
    for (const side of [-1, 1] as const) {
      let t = lane.from + rng.range(0, 4);
      while (t < lane.to) {
        const w = rng.range(8, 11);
        const d = rng.range(7.5, 9.5);
        const kindRoll = rng.next();
        const kind: BuildingKind = kindRoll < 0.5 ? "house" : kindRoll < 0.85 ? "machiya" : "kura";
        const off = lane.width / 2 + 1.2 + d / 2;
        let plot: Plot;
        if (lane.axis === "x") {
          plot = { kind, x: t + w / 2, z: lane.at + side * off, w, d, face: side < 0 ? 0 : 2, stories: kind === "machiya" ? 2 : 1, seed: seed++ };
        } else {
          plot = { kind, x: lane.at + side * off, z: t + w / 2, w, d, face: side < 0 ? 1 : 3, stories: kind === "machiya" ? 2 : 1, seed: seed++ };
        }
        const r = plotRect(plot, 1.2);
        const inVillage = r.x0 > VILLAGE_RECT.x0 + 3 && r.x1 < VILLAGE_RECT.x1 - 12 && r.z0 > VILLAGE_RECT.z0 + 3 && r.z1 < VILLAGE_RECT.z1 - 3;
        const free = inVillage && !taken.some((o) => overlaps(o, r)) && !RESERVED.some((o) => overlaps(o, r)) && roadClear(plotRect(plot, 0.2));
        if (free && rng.chance(0.5)) {
          plots.push(plot);
          taken.push(r);
          t += w + rng.range(3, 9);
        } else {
          t += rng.range(3, 6);
        }
      }
    }
  }
  return plots;
}

export const PLOTS = generatePlots();

// ——— small landmarks ————————————————————————————————————————————————

export const BRIDGES = [
  { id: "grand", x0: 45, z0: 0, x1: 75, z1: 0, width: 4.2, arch: 3.4, red: true },
  { id: "south", x0: 52, z0: 128, x1: 80, z1: 128, width: 3.4, arch: 0.6, red: false },
];

export const PIER = { x0: 45, x1: 54.5, z: 72, width: 2.6 };

export const STEPPING_STONES: [number, number][] = [
  [50.5, -121], [52.6, -122.4], [54.6, -121.6], [56.7, -122.6], [58.8, -121.8], [60.9, -122.8], [63, -121.9], [65.1, -122.5],
];

/** Torii gates along the shrine path, as distances along that road (m). */
export const TORII_PATH_START = 18;
export const TORII_COUNT = 30;
export const TORII_SPACING = 2.1;

export const SPAWN = { x: -150, z: 2, facing: Math.PI / 2 };
